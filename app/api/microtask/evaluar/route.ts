import { NextRequest, NextResponse } from "next/server";
import {
  getMicroTask,
  getProfile,
  listMicroTasksByProfile,
  recordFeedback,
  updateMicroTask,
  updateProfileTaskStats,
} from "@/lib/db";
import type { TaskOutcomeStat } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { taskId, rating, comment } = (await req.json()) as {
      taskId: string;
      rating: number;
      comment?: string;
    };
    if (!taskId || typeof rating !== "number") {
      return NextResponse.json({ error: "taskId y rating son requeridos" }, { status: 400 });
    }
    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: "rating fuera de rango (1-5)" }, { status: 400 });
    }

    const task = await getMicroTask(taskId);
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
    if (task.status !== "delivered") {
      return NextResponse.json(
        { error: "la tarea aún no fue entregada o ya fue evaluada" },
        { status: 400 }
      );
    }

    await updateMicroTask(taskId, {
      companyRating: rating,
      companyComment: comment ?? "",
      evaluatedAt: Date.now(),
      status: "evaluated",
    });

    // Recompute aggregate stats for the profile
    const all = await listMicroTasksByProfile(task.profileId);
    const ratings = all
      .filter((t) => typeof t.companyRating === "number")
      .map((t) => t.companyRating as number);
    if (rating && !ratings.includes(rating)) ratings.push(rating);
    const stats: TaskOutcomeStat = {
      totalCompleted: ratings.length,
      averageRating:
        ratings.length === 0
          ? 0
          : Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10,
    };
    const profile = await getProfile(task.profileId);
    if (profile) await updateProfileTaskStats(task.profileId, stats);

    // Outcome de una microtask = ground-truth REAL sobre ese (need, profile).
    // Lo registramos como feedback para que el motor ICS lo absorba en futuros
    // rankings. Es la señal más fuerte que tenemos hasta que haya contrataciones
    // formales.
    if (task.needId) {
      try {
        await recordFeedback({
          matchId: `${task.needId}__${task.profileId}`,
          needId: task.needId,
          profileId: task.profileId,
          useful: rating >= 4,
          source: "empresa_match",
          signalType: "microtask_outcome",
          score: rating,
          note: `microtask_evaluated:${taskId}`,
        });
      } catch (e) {
        // Si falla el feedback, NO bloqueamos la evaluación de la tarea —
        // solo perdemos esa señal. El rating sigue guardado en el documento.
        console.warn("[microtask/evaluar] feedback save failed:", (e as Error).message);
      }
    }

    const updated = await getMicroTask(taskId);
    return NextResponse.json({ task: updated, profileStats: stats });
  } catch (err) {
    console.error("microtask/evaluar error:", err);
    return NextResponse.json({ error: "No pudimos guardar la evaluación." }, { status: 500 });
  }
}
