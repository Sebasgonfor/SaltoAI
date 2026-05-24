import { NextRequest, NextResponse } from "next/server";
import {
  deleteFeedback,
  deleteMicroTask,
  deleteNeed,
  deleteProfile,
  getAllNeeds,
  getAllProfiles,
  listFeedback,
} from "@/lib/db";
import { isDemoProfile } from "@/lib/profile-source";
import { startLog } from "@/lib/logger";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { MicroTask, FeedbackEntry } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Endpoint admin: borra TODO lo identificable como "mock" en la DB y
 * deja solo data real (cuentas autenticadas con Firebase Auth).
 *
 * Definición de "mock" — un perfil/recurso es mock si:
 *   - id.startsWith("seed_")  → cargado por /api/seed (Camila, Andrés, etc.)
 *   - id.startsWith("local_") → memoria legacy de sesiones sin auth
 *
 * El handler:
 *   1. Identifica perfiles mock.
 *   2. Borra todos los recursos asociados (microtasks, feedback, needs).
 *   3. Borra los perfiles.
 *   4. Borra needs huérfanas (ownerUid mock o id mock).
 *   5. Borra feedbacks de actores mock (targetId/userId/profileId mock).
 *   6. Borra microtasks de mock (companyId/profileId mock).
 *
 * Idempotente: correrlo dos veces no rompe nada.
 *
 * SECURITY: requiere `?confirm=1` para evitar deletes accidentales. Sin
 * el param, devuelve un DRY-RUN con qué borraría.
 *
 * Para ambiente hackathon, no exigimos token. En prod debería exigir
 * ADMIN_TOKEN igual que /api/admin/eval-summary.
 */

interface CleanupReport {
  dryRun: boolean;
  deleted: {
    profiles: string[];
    needs: string[];
    microtasks: string[];
    feedback: number;
  };
  preserved: {
    profiles: number;
    needs: number;
    microtasks: number;
    feedback: number;
  };
}

/**
 * Lee TODAS las microtasks de Firestore + memoria. No hay listAllMicroTasks
 * en lib/db, así que lo hacemos acá inline. Robusto a Firestore vacío
 * (cae a memoria).
 */
async function listAllMicroTasks(): Promise<MicroTask[]> {
  const out: MicroTask[] = [];
  try {
    const snap = await getDocs(collection(db, "microtasks"));
    for (const d of snap.docs) {
      out.push({ id: d.id, ...(d.data() as Omit<MicroTask, "id">) });
    }
  } catch {
    /* Firestore puede estar deshabilitado o vacío — seguimos */
  }
  return out;
}

function isMockId(id: string | undefined | null): boolean {
  if (!id) return false;
  return isDemoProfile(id);
}

export async function GET(req: NextRequest) {
  return handle(req, /* dryRun */ true);
}

export async function POST(req: NextRequest) {
  const confirm = req.nextUrl.searchParams.get("confirm") === "1";
  return handle(req, /* dryRun */ !confirm);
}

async function handle(req: NextRequest, dryRun: boolean) {
  const log = startLog(req, "admin.clean-mocks");

  const [profiles, needs, feedback, microtasks] = await Promise.all([
    getAllProfiles(),
    getAllNeeds(),
    listFeedback(),
    listAllMicroTasks(),
  ]);

  // 1. Identifico perfiles mock — son los que arrastran todo lo demás.
  const mockProfileIds = new Set<string>(
    profiles
      .map((p) => p.id ?? "")
      .filter((id) => id && isMockId(id)),
  );
  const realProfileIds = new Set<string>(
    profiles
      .map((p) => p.id ?? "")
      .filter((id) => id && !isMockId(id)),
  );

  // 2. Needs a borrar: ownerUid mock O id mock O sin ownerUid (huérfanas).
  const needsToDelete: { id: string; reason: string }[] = [];
  for (const n of needs) {
    if (!n.id) continue;
    if (isMockId(n.id)) {
      needsToDelete.push({ id: n.id, reason: "id_starts_with_mock_prefix" });
    } else if (n.ownerUid && isMockId(n.ownerUid)) {
      needsToDelete.push({ id: n.id, reason: "owner_is_mock" });
    } else if (!n.ownerUid) {
      // Sin ownerUid = no podemos atribuirlo a un user real. Lo borramos.
      needsToDelete.push({ id: n.id, reason: "no_owner_uid" });
    }
    // Si tiene ownerUid real, se preserva.
  }

  // 3. Microtasks a borrar: companyId mock O profileId mock O profileId no
  //    apunta a un perfil real existente.
  const microtasksToDelete: { id: string; reason: string }[] = [];
  for (const t of microtasks) {
    if (!t.id) continue;
    if (isMockId(t.companyId)) {
      microtasksToDelete.push({ id: t.id, reason: "company_is_mock" });
    } else if (isMockId(t.profileId)) {
      microtasksToDelete.push({ id: t.id, reason: "profile_is_mock" });
    } else if (!realProfileIds.has(t.profileId)) {
      // El profileId no existe en perfiles reales → microtask huérfana.
      microtasksToDelete.push({
        id: t.id,
        reason: "profile_orphan",
      });
    }
  }

  // 4. Feedback a borrar: cualquier referencia a un id mock.
  //    targetId, profileId, userId, matchId pueden contener el id mock.
  const feedbackToDelete: FeedbackEntry[] = [];
  for (const f of feedback) {
    if (!f.id) continue;
    const refs = [f.targetId, f.profileId, f.userId, f.needId, f.matchId];
    const touchesMock = refs.some((r) => r && isMockId(r));
    // El matchId puede contener un id mock como substring (ej.
    // "seed_camila__profileId__touchpoint"). Chequeo eso también.
    const matchIdHasMock =
      typeof f.matchId === "string" &&
      (f.matchId.includes("seed_") || f.matchId.includes("local_"));
    if (touchesMock || matchIdHasMock) {
      feedbackToDelete.push(f);
    }
  }

  // Si NO es dry-run, ejecutamos los deletes.
  if (!dryRun) {
    // El orden importa: primero recursos hijos, después perfiles.
    for (const t of microtasksToDelete) {
      await deleteMicroTask(t.id);
    }
    for (const n of needsToDelete) {
      await deleteNeed(n.id);
    }
    for (const f of feedbackToDelete) {
      if (f.id) await deleteFeedback(f.id);
    }
    for (const pid of mockProfileIds) {
      await deleteProfile(pid);
    }
  }

  const report: CleanupReport = {
    dryRun,
    deleted: {
      profiles: Array.from(mockProfileIds),
      needs: needsToDelete.map((n) => n.id),
      microtasks: microtasksToDelete.map((t) => t.id),
      feedback: feedbackToDelete.length,
    },
    preserved: {
      profiles: realProfileIds.size,
      needs: needs.length - needsToDelete.length,
      microtasks: microtasks.length - microtasksToDelete.length,
      feedback: feedback.length - feedbackToDelete.length,
    },
  };

  log.end({
    status: 200,
    extra: {
      dryRun,
      mockProfiles: mockProfileIds.size,
      realProfiles: realProfileIds.size,
      needsDeleted: needsToDelete.length,
      microtasksDeleted: microtasksToDelete.length,
      feedbackDeleted: feedbackToDelete.length,
    },
  });

  return NextResponse.json(report);
}
