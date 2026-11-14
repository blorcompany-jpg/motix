import { and, asc, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import {
  ageOn,
  type Equipment,
  type Limitation,
  type Muscle,
  type PlanSessionSummary,
  type SessionDetail,
  type SessionSummary,
  type Trend,
} from '@motix/shared';
import type { AppCtx } from '../context';
import type { Db } from '../db/client';
import { clientLinks, exercises, plans, sessionExercises, setLogs, sportProfiles, trainerVideos, users, workoutSessions } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { addDays, mondayOf } from '../lib/days';
import { track } from './events';
import { buildPlan, estimateMinutes, type LibraryExercise } from './planner';

const num = (v: string | null) => (v === null ? null : Number(v));

/** Tutte le serie registrate dall'utente in un intervallo di giorni, con seduta ed esercizio. */
export async function userSets(db: Db, userId: string, range: { from?: string; to?: string } = {}) {
  const rows = await db
    .select({
      sessionId: workoutSessions.id,
      title: workoutSessions.title,
      day: workoutSessions.scheduledDate,
      completedAt: workoutSessions.completedAt,
      sessionExerciseId: sessionExercises.id,
      exerciseId: exercises.id,
      exercise: exercises.name,
      muscles: exercises.muscles,
      loadable: exercises.loadable,
      targetSets: sessionExercises.targetSets,
      targetReps: sessionExercises.targetReps,
      setNumber: setLogs.setNumber,
      reps: setLogs.reps,
      loadKg: setLogs.loadKg,
    })
    .from(setLogs)
    .innerJoin(sessionExercises, eq(sessionExercises.id, setLogs.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.sessionId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        range.from ? gte(workoutSessions.scheduledDate, range.from) : undefined,
        range.to ? lte(workoutSessions.scheduledDate, range.to) : undefined,
      ),
    )
    .orderBy(asc(workoutSessions.scheduledDate), asc(setLogs.setNumber));
  return rows.map((r) => ({ ...r, loadKg: num(r.loadKg), muscles: r.muscles as Muscle[] }));
}
export type UserSet = Awaited<ReturnType<typeof userSets>>[number];

export const volumeOf = (sets: Array<{ reps: number; loadKg: number | null }>) =>
  Math.round(sets.reduce((sum, s) => sum + s.reps * (s.loadKg ?? 0), 0));

const bestLoad = (sets: Array<{ loadKg: number | null }>) => {
  const loads = sets.map((s) => s.loadKg).filter((l): l is number => l !== null && l > 0);
  return loads.length ? Math.max(...loads) : null;
};

/* ---------- Piano ---------- */

async function approvedLibrary(db: Db): Promise<LibraryExercise[]> {
  const rows = await db.select().from(exercises).where(eq(exercises.reviewStatus, 'approved'));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    pattern: r.pattern,
    level: r.level,
    equipment: r.equipment,
    contraindications: r.contraindications,
    loadable: r.loadable,
    unit: r.unit,
    muscles: r.muscles,
  }));
}

/** Compone la proposta di piano dal questionario dell'utente, senza salvarla. */
export async function draftPlan(ctx: AppCtx, userId: string, startDay: string) {
  const { db } = ctx;
  const [row] = await db
    .select({ p: sportProfiles, birthDate: users.birthDate, structureId: users.structureId })
    .from(sportProfiles)
    .innerJoin(users, eq(users.id, sportProfiles.userId))
    .where(eq(sportProfiles.userId, userId))
    .limit(1);
  if (!row?.p.goal || !row.p.level || !row.p.daysPerWeek)
    throw badRequest('profile_missing', 'Compila prima il questionario iniziale');

  // Ultimo carico per esercizio, dalle sedute degli ultimi 60 giorni.
  const recent = await userSets(db, userId, { from: addDays(startDay, -60) });
  const lastLoads = new Map<string, { loadKg: number; hitTarget: boolean }>();
  const bySessionExercise = new Map<string, UserSet[]>();
  for (const s of recent) bySessionExercise.set(s.sessionExerciseId, [...(bySessionExercise.get(s.sessionExerciseId) ?? []), s]);
  for (const sets of bySessionExercise.values()) {
    const first = sets[0]!;
    const load = bestLoad(sets);
    if (load === null) continue;
    // Le righe sono in ordine di data: l'ultima occorrenza sovrascrive le precedenti.
    lastLoads.set(first.exerciseId, {
      loadKg: load,
      hitTarget: sets.length >= first.targetSets && sets.every((s) => s.reps >= first.targetReps),
    });
  }

  const library = await approvedLibrary(db);
  const built = buildPlan({
    goal: row.p.goal,
    level: row.p.level,
    daysPerWeek: row.p.daysPerWeek,
    equipment: row.p.equipment as Equipment[],
    limitations: row.p.limitations as Limitation[],
    age: row.birthDate ? ageOn(row.birthDate, ctx.now()) : null,
    library,
    lastLoads,
  });
  if (!built.sessions.length) throw badRequest('plan_empty', 'Con questi attrezzi e limitazioni non riesco a comporre un piano: modifica il questionario');
  return { built, library, structureId: row.structureId };
}

/** Genera il piano della settimana a partire dal giorno indicato e archivia quello precedente. */
export async function generatePlan(ctx: AppCtx, userId: string, startDay: string) {
  const { db } = ctx;
  const { built, structureId } = await draftPlan(ctx, userId, startDay);
  const planId = await savePlan(db, {
    userId,
    author: 'ai',
    trainerId: null,
    weekStart: startDay,
    rationale: built.rationale,
    sessions: built.sessions.map((s) => ({ title: s.title, day: addDays(startDay, s.dayOffset), exercises: s.exercises })),
  });
  await track(db, 'piano_generato', { userId, structureId }, { sessions: built.sessions.length });
  return planId;
}

export interface PlanToSave {
  userId: string;
  author: 'ai' | 'trainer';
  trainerId: string | null;
  weekStart: string;
  rationale: string[];
  sessions: Array<{ title: string; day: string; exercises: Array<{ exerciseId: string; sets: number; reps: number; restSeconds: number; loadKg: number | null }> }>;
}

/** Salva un piano (generato o scritto dal personal trainer) e archivia quello attivo. */
export async function savePlan(db: Db, input: PlanToSave) {
  return db.transaction(async (tx) => {
    const previous = await tx.select({ id: plans.id, version: plans.version }).from(plans).where(and(eq(plans.userId, input.userId), eq(plans.status, 'active')));
    if (previous.length) {
      const ids = previous.map((p) => p.id);
      // Le sedute non iniziate del piano precedente vengono sostituite; quelle fatte restano nel diario.
      const stale = await tx
        .select({ id: workoutSessions.id, startedAt: workoutSessions.startedAt })
        .from(workoutSessions)
        .where(inArray(workoutSessions.planId, ids));
      const untouched = stale.filter((s) => !s.startedAt).map((s) => s.id);
      if (untouched.length) await tx.delete(workoutSessions).where(inArray(workoutSessions.id, untouched));
      await tx.update(plans).set({ status: 'archived' }).where(inArray(plans.id, ids));
    }
    const [plan] = await tx
      .insert(plans)
      .values({
        userId: input.userId,
        author: input.author,
        authorTrainerId: input.trainerId,
        weekStart: input.weekStart,
        version: Math.max(0, ...previous.map((p) => p.version)) + 1,
        rationale: JSON.stringify(input.rationale),
      })
      .returning();
    for (const s of input.sessions) {
      const [session] = await tx.insert(workoutSessions).values({ planId: plan!.id, userId: input.userId, title: s.title, scheduledDate: s.day }).returning();
      await tx.insert(sessionExercises).values(
        s.exercises.map((ex, i) => ({
          sessionId: session!.id,
          exerciseId: ex.exerciseId,
          position: i + 1,
          targetSets: ex.sets,
          targetReps: ex.reps,
          targetLoadKg: ex.loadKg === null ? null : String(ex.loadKg),
          restSeconds: ex.restSeconds,
        })),
      );
    }
    return plan!.id;
  });
}

export async function sessionSummaries(db: Db, sessionIds: string[]): Promise<Map<string, PlanSessionSummary>> {
  const out = new Map<string, PlanSessionSummary>();
  if (!sessionIds.length) return out;
  const sessions = await db.select().from(workoutSessions).where(inArray(workoutSessions.id, sessionIds));
  const items = await db
    .select({
      sessionId: sessionExercises.sessionId,
      sets: sessionExercises.targetSets,
      reps: sessionExercises.targetReps,
      restSeconds: sessionExercises.restSeconds,
      unit: exercises.unit,
      muscles: exercises.muscles,
    })
    .from(sessionExercises)
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(inArray(sessionExercises.sessionId, sessionIds));
  for (const s of sessions) {
    const mine = items.filter((i) => i.sessionId === s.id);
    const muscles = [...new Set(mine.map((i) => i.muscles[0]).filter(Boolean))] as Muscle[];
    out.set(s.id, {
      id: s.id,
      title: s.title ?? 'Allenamento',
      scheduledDate: s.scheduledDate,
      startedAt: s.startedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
      exerciseCount: mine.length,
      estimatedMinutes: estimateMinutes(mine.map((i) => ({ ...i, restSeconds: i.restSeconds ?? 60 }))),
      muscles,
    });
  }
  return out;
}

/* ---------- Seduta ---------- */

export async function ownSession(db: Db, userId: string, sessionId: string) {
  const [s] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .limit(1);
  if (!s) throw notFound('Seduta non trovata');
  return s;
}

export async function sessionDetail(db: Db, userId: string, sessionId: string): Promise<SessionDetail> {
  const s = await ownSession(db, userId, sessionId);
  const items = await db
    .select({ se: sessionExercises, ex: exercises })
    .from(sessionExercises)
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(asc(sessionExercises.position));
  const logs = items.length
    ? await db
        .select()
        .from(setLogs)
        .where(inArray(setLogs.sessionExerciseId, items.map((i) => i.se.id)))
        .orderBy(asc(setLogs.setNumber))
    : [];

  // Ultima volta di ogni esercizio, in una seduta precedente.
  const history = (await userSets(db, userId, { from: addDays(s.scheduledDate, -120), to: s.scheduledDate })).filter((r) => r.sessionId !== sessionId);
  const previousOf = (exerciseId: string) => {
    const mine = history.filter((h) => h.exerciseId === exerciseId);
    const last = mine.at(-1);
    if (!last) return null;
    return { day: last.day, sets: mine.filter((h) => h.sessionId === last.sessionId).map((h) => ({ reps: h.reps, loadKg: h.loadKg })) };
  };

  // Se il personal trainer del cliente ha caricato un video per l'esercizio, si mostra quello.
  const ptVideos = items.length
    ? await db
        .select({ exerciseId: trainerVideos.exerciseId, url: trainerVideos.videoUrl })
        .from(trainerVideos)
        .innerJoin(clientLinks, eq(clientLinks.trainerId, trainerVideos.trainerId))
        .where(and(eq(clientLinks.userId, userId), eq(clientLinks.status, 'active'), eq(trainerVideos.reviewStatus, 'approved'), inArray(trainerVideos.exerciseId, items.map((i) => i.ex.id))))
    : [];

  return {
    id: s.id,
    title: s.title ?? 'Allenamento',
    scheduledDate: s.scheduledDate,
    startedAt: s.startedAt?.toISOString() ?? null,
    completedAt: s.completedAt?.toISOString() ?? null,
    perceivedEffort: s.perceivedEffort,
    exercises: items.map(({ se, ex }) => ({
      id: se.id,
      position: se.position,
      exercise: {
        id: ex.id,
        name: ex.name,
        description: ex.description,
        muscles: ex.muscles as Muscle[],
        loadable: ex.loadable,
        unit: ex.unit as 'reps' | 'seconds' | 'minutes',
        videoUrl: ptVideos.find((v) => v.exerciseId === ex.id)?.url ?? ex.videoUrl,
      },
      targetSets: se.targetSets,
      targetReps: se.targetReps,
      targetLoadKg: num(se.targetLoadKg),
      restSeconds: se.restSeconds ?? 60,
      logs: logs
        .filter((l) => l.sessionExerciseId === se.id)
        .map((l) => ({ id: l.id, setNumber: l.setNumber, reps: l.reps, loadKg: num(l.loadKg), source: l.source })),
      previous: previousOf(ex.id),
    })),
  };
}

/** Riepilogo della seduta: totali, confronto con la volta precedente e con la settimana prima, consigli. */
export async function sessionSummary(db: Db, userId: string, sessionId: string): Promise<SessionSummary> {
  const s = await ownSession(db, userId, sessionId);
  const detail = await sessionDetail(db, userId, sessionId);
  const all = detail.exercises.flatMap((e) => e.logs);
  const totals = { sets: all.length, reps: all.reduce((n, l) => n + l.reps, 0), volumeKg: volumeOf(all) };

  // Seduta precedente dello stesso tipo.
  const [prev] = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.title, detail.title),
        ne(workoutSessions.id, sessionId),
        lte(workoutSessions.scheduledDate, s.scheduledDate),
      ),
    )
    .orderBy(desc(workoutSessions.scheduledDate))
    .limit(1);
  let previous: SessionSummary['previous'] = null;
  if (prev?.completedAt) {
    const prevSets = (await userSets(db, userId, { from: prev.scheduledDate, to: prev.scheduledDate })).filter((r) => r.sessionId === prev.id);
    const volumeKg = volumeOf(prevSets);
    previous = {
      day: prev.scheduledDate,
      volumeKg,
      reps: prevSets.reduce((n, l) => n + l.reps, 0),
      volumeDeltaPct: volumeKg > 0 ? Math.round(((totals.volumeKg - volumeKg) / volumeKg) * 100) : null,
    };
  }

  // Questa settimana e la settimana prima.
  const monday = mondayOf(s.scheduledDate);
  const twoWeeks = await userSets(db, userId, { from: addDays(monday, -7), to: addDays(monday, 6) });
  const completed = (
    await db
      .select({ day: workoutSessions.scheduledDate, completedAt: workoutSessions.completedAt })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), gte(workoutSessions.scheduledDate, addDays(monday, -7)), lte(workoutSessions.scheduledDate, addDays(monday, 6))))
  ).filter((r) => r.completedAt);
  const inThis = (day: string) => day >= monday;
  const week = {
    sessionsThisWeek: completed.filter((r) => inThis(r.day)).length,
    sessionsLastWeek: completed.filter((r) => !inThis(r.day)).length,
    volumeThisWeek: volumeOf(twoWeeks.filter((r) => inThis(r.day))),
    volumeLastWeek: volumeOf(twoWeeks.filter((r) => !inThis(r.day))),
  };

  const exerciseRows = detail.exercises
    .filter((e) => e.logs.length > 0)
    .map((e) => {
      const reps = e.logs.reduce((n, l) => n + l.reps, 0);
      const best = bestLoad(e.logs);
      const p = e.previous ? { reps: e.previous.sets.reduce((n, l) => n + l.reps, 0), bestLoadKg: bestLoad(e.previous.sets) } : null;
      let trend: Trend = 'new';
      if (p) {
        const now = e.exercise.loadable && best !== null ? volumeOf(e.logs) : reps;
        const before = e.exercise.loadable && p.bestLoadKg !== null ? volumeOf(e.previous!.sets) : p.reps;
        trend = now > before * 1.02 ? 'up' : now < before * 0.98 ? 'down' : 'same';
      }
      return { name: e.exercise.name, sets: e.logs.length, reps, bestLoadKg: best, previous: p, trend };
    });

  const tips: string[] = [];
  const effort = s.perceivedEffort;
  if (effort !== null && effort >= 9) tips.push('Seduta molto intensa: domani scegli recupero attivo o una seduta leggera.');
  if (effort !== null && effort <= 4) tips.push('Ti è sembrata facile: nella prossima seduta aumenta leggermente i carichi o le ripetizioni.');
  const completedAll = detail.exercises.filter(
    (e) => e.exercise.loadable && e.logs.length >= e.targetSets && e.logs.every((l) => l.reps >= e.targetReps) && bestLoad(e.logs) !== null,
  );
  for (const e of completedAll.slice(0, 2)) {
    const next = Math.max(bestLoad(e.logs)! + 0.5, Math.round(bestLoad(e.logs)! * 1.05 * 2) / 2);
    tips.push(`${e.exercise.name}: hai completato tutte le ripetizioni. La prossima volta prova ${String(next).replace('.', ',')} kg.`);
  }
  const down = exerciseRows.find((e) => e.trend === 'down');
  if (down) tips.push(`${down.name}: hai fatto meno della volta scorsa. Capita: controlla recupero e sonno.`);
  const planned = detail.exercises.reduce((n, e) => n + e.targetSets, 0);
  if (totals.sets < planned) tips.push(`Hai registrato ${totals.sets} serie su ${planned}: se il tempo è poco, riduci i giorni o il livello nel questionario.`);
  tips.push('Bevi nelle prossime due ore per recuperare i liquidi persi.');

  return {
    sessionId,
    title: detail.title,
    day: s.scheduledDate,
    durationMin: s.startedAt && s.completedAt ? Math.max(1, Math.round((s.completedAt.getTime() - s.startedAt.getTime()) / 60_000)) : null,
    perceivedEffort: effort,
    totals,
    previous,
    week,
    exercises: exerciseRows,
    tips,
  };
}
