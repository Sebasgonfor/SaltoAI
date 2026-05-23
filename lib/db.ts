import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Profile, CompanyNeed, FeedbackEntry } from "./types";

const PROFILES = "profiles";
const NEEDS = "needs";
const FEEDBACK = "feedback";

export type StorageMode = "firestore" | "memory";

export function storageFromId(id: string): StorageMode {
  return id.startsWith("local_") ? "memory" : "firestore";
}

function isFirestoreConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "dummy"
  );
}

// En Next dev cada route handler puede recibir su propia copia del módulo
// (HMR / route isolation). Si los stores fueran simples `const` locales, lo
// que escribe `/api/seed` no lo ve `/api/perfil` ni `/api/cv`. Anclamos las
// Maps a globalThis para que sobrevivan a la recarga y compartan estado
// entre todas las rutas en el mismo proceso. En prod no cambia nada: hay un
// único módulo y la indirección es invisible.
type DbGlobals = {
  memProfiles: Map<string, Profile>;
  memNeeds: Map<string, CompanyNeed>;
  memFeedback: FeedbackEntry[];
};
const g = globalThis as unknown as { __saltoDb?: DbGlobals };
if (!g.__saltoDb) {
  g.__saltoDb = {
    memProfiles: new Map(),
    memNeeds: new Map(),
    memFeedback: [],
  };
}
const memProfiles = g.__saltoDb.memProfiles;
const memNeeds = g.__saltoDb.memNeeds;
const memFeedback = g.__saltoDb.memFeedback;

// Antes había un único flag global `firestoreDisabled` que se prendía con
// el PRIMER error y dejaba el proceso entero en modo memoria — un permiso
// faltante en `feedback` tiraba abajo profiles/needs también. Ahora
// trackeamos el bypass por colección: el resto sigue tocando Firestore.
const firestoreDisabledFor = new Set<string>();
function disableFirestoreWithWarning(err: unknown, op: string, collection: string) {
  if (!firestoreDisabledFor.has(collection)) {
    firestoreDisabledFor.add(collection);
    console.warn(
      `[db] Firestore unavailable for collection "${collection}" during ${op}; fallback a memoria SOLO para esa colección. Reason:`,
      (err as Error)?.message ?? err
    );
  }
}

function useFirestore(collection?: string): boolean {
  if (!isFirestoreConfigured()) return false;
  if (collection && firestoreDisabledFor.has(collection)) return false;
  return true;
}

function makeLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Firestore no acepta valores `undefined`. Stripamos antes de escribir
 * para que un campo opcional sin completar no rompa el addDoc/setDoc.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

export async function createProfile(p: Omit<Profile, "id" | "createdAt">): Promise<string> {
  const data: Profile = { ...p, createdAt: Date.now() };
  if (useFirestore(PROFILES)) {
    try {
      const ref = await addDoc(collection(db, PROFILES), stripUndefined(data));
      return ref.id;
    } catch (e) {
      disableFirestoreWithWarning(e, "createProfile", PROFILES);
    }
  }
  const id = makeLocalId();
  memProfiles.set(id, { ...data, id });
  return { id, storage: "memory" };
}

export async function getProfile(id: string): Promise<Profile | null> {
  if (useFirestore(PROFILES)) {
    try {
      const snap = await getDoc(doc(db, PROFILES, id));
      if (!snap.exists()) return memProfiles.get(id) ?? null;
      return { id: snap.id, ...(snap.data() as Omit<Profile, "id">) };
    } catch (e) {
      disableFirestoreWithWarning(e, "getProfile", PROFILES);
    }
  }
  return memProfiles.get(id) ?? null;
}

export async function getAllProfiles(): Promise<Profile[]> {
  if (useFirestore(PROFILES)) {
    try {
      const snap = await getDocs(collection(db, PROFILES));
      const remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Profile, "id">) }));
      return remote.length > 0 ? remote : Array.from(memProfiles.values());
    } catch (e) {
      disableFirestoreWithWarning(e, "getAllProfiles", PROFILES);
    }
  }
  return Array.from(memProfiles.values());
}

export async function upsertProfileWithId(id: string, p: Omit<Profile, "id">): Promise<void> {
  if (useFirestore(PROFILES)) {
    try {
      await setDoc(doc(db, PROFILES, id), stripUndefined(p as Record<string, unknown>));
      return;
    } catch (e) {
      disableFirestoreWithWarning(e, "upsertProfileWithId", PROFILES);
    }
  }
  memProfiles.set(id, { ...p, id });
}

export async function createNeed(
  n: Omit<CompanyNeed, "id" | "createdAt">
): Promise<{ id: string; storage: StorageMode }> {
  const data: CompanyNeed = { ...n, createdAt: Date.now() };
  if (useFirestore(NEEDS)) {
    try {
      const ref = await addDoc(collection(db, NEEDS), stripUndefined(data));
      return ref.id;
    } catch (e) {
      disableFirestoreWithWarning(e, "createNeed", NEEDS);
    }
  }
  const id = makeLocalId();
  memNeeds.set(id, { ...data, id });
  return { id, storage: "memory" };
}

export async function getAllNeeds(): Promise<CompanyNeed[]> {
  if (useFirestore()) {
    try {
      const snap = await getDocs(collection(db, NEEDS));
      const remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompanyNeed, "id">) }));
      return remote.length > 0 ? remote : Array.from(memNeeds.values());
    } catch (e) {
      disableFirestoreWithWarning(e, "getAllNeeds");
    }
  }
  return Array.from(memNeeds.values());
}

export async function getNeed(id: string): Promise<CompanyNeed | null> {
  if (useFirestore(NEEDS)) {
    try {
      const snap = await getDoc(doc(db, NEEDS, id));
      if (!snap.exists()) return memNeeds.get(id) ?? null;
      return { id: snap.id, ...(snap.data() as Omit<CompanyNeed, "id">) };
    } catch (e) {
      disableFirestoreWithWarning(e, "getNeed", NEEDS);
    }
  }
  return memNeeds.get(id) ?? null;
}

export async function recordFeedback(
  entry: Omit<FeedbackEntry, "id" | "timestamp">
): Promise<string> {
  const data: FeedbackEntry = { ...entry, timestamp: Date.now() };
  if (useFirestore(FEEDBACK)) {
    try {
      // stripUndefined es clave acá: `note`, `needId`, `profileId` y
      // `source` son opcionales. Sin esto, Firestore rechaza el addDoc
      // con "Unsupported field value: undefined".
      const ref = await addDoc(
        collection(db, FEEDBACK),
        stripUndefined(data as Record<string, unknown>)
      );
      return ref.id;
    } catch (e) {
      disableFirestoreWithWarning(e, "recordFeedback", FEEDBACK);
    }
  }
  // Aun sin Firestore, guardamos el dato propietario en memoria — el foso
  // defensivo (PRD §8.6) arranca el día 1, no cuando haya backend "real".
  const id = makeLocalId();
  memFeedback.push({ ...data, id });
  return id;
}

export async function listFeedback(): Promise<FeedbackEntry[]> {
  if (useFirestore(FEEDBACK)) {
    try {
      const snap = await getDocs(collection(db, FEEDBACK));
      const remote = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedbackEntry, "id">) }));
      return remote.length > 0 ? remote : [...memFeedback];
    } catch (e) {
      disableFirestoreWithWarning(e, "listFeedback", FEEDBACK);
    }
  }
  return [...memFeedback];
}

export { isFirestoreConfigured };
