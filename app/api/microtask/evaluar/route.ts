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

    // === Doble persistencia de la evaluación ===
    //
    // 1) microtask_outcome (legacy, alimenta el motor ICS):
    //    - signalType="microtask_outcome", targetType="match"
    //    - es la señal de calibración del scoring
    //
    // 2) company_feedback_to_youth (v3, alimenta el inbox del joven):
    //    - targetType="profile", targetId=task.profileId
    //    - aparece en /joven/perfil/[id] dentro de <YouthFeedbackInbox>
    //
    // El bug que esto resuelve: antes solo se persistía (1). El joven veía
    // su rating en /joven/tareas/[id] (porque lee companyComment del doc
    // directo), pero NO en el inbox del perfil — el founder pensaba "le
    // dejé feedback" y al joven no se le reflejaba.
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
        console.warn("[microtask/evaluar] outcome feedback save failed:", (e as Error).message);
      }
    }

    // Inbox feedback: SIEMPRE creamos uno cuando hay rating, con o sin
    // comment. Sin esto, la opinión del founder sobre la microtask quedaba
    // huérfana del perfil del joven.
    try {
      const cleanComment = (comment ?? "").trim();
      const inboxText = cleanComment
        ? cleanComment
        : `Microtask "${task.title}" evaluada con ${rating}/5.`;
      await recordFeedback({
        // matchId legacy compatible — incluye userId del founder para no
        // colisionar con otros founders que evalúen al mismo joven.
        matchId: `profile__${task.profileId}__company_feedback_to_youth__by_${task.companyId}__via_${taskId}`,
        needId: task.needId,
        profileId: task.profileId,
        useful: rating >= 3,
        // v3 fields — esto es lo que el inbox del joven realmente lee:
        touchpoint: "company_feedback_to_youth",
        kind: "explicit",
        targetType: "profile",
        targetId: task.profileId,
        userId: task.companyId,
        userRole: "empresa",
        rating: rating,
        text: inboxText,
        authorDisplayName: task.companyName,
        score: rating,
        signalType: "explicit_vote",
        // Note traza el origen para que el componente pueda diferenciar
        // (futuro): "viene de la evaluación de tarea X".
        note: `via_microtask:${taskId}`,
      });
    } catch (e) {
      console.warn("[microtask/evaluar] inbox feedback save failed:", (e as Error).message);
    }

    const updated = await getMicroTask(taskId);
    return NextResponse.json({ task: updated, profileStats: stats });
  } catch (err) {
    console.error("microtask/evaluar error:", err);
    return NextResponse.json({ error: "No pudimos guardar la evaluación." }, { status: 500 });
  }
}
