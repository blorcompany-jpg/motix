/** Strumenti di monitoraggio condivisi tra app e area del professionista: carichi, check-in, dati delle app salute. */
import { and, asc, desc, eq, gte } from 'drizzle-orm';
import type { CheckIn, CheckInsResponse, ExerciseHistory, ExerciseRecords, HealthDay } from '@motix/shared';
import type { AppCtx } from '../context';
import { checkIns, clientLinks, exercises, healthDays, trainers, users } from '../db/schema';
import { addDays, diffDays, toDay } from '../lib/days';
import { notFound } from '../lib/errors';
import { mediaUrl } from '../modules/media';
import { userSets } from './training';

const num = (v: string | null) => (v === null ? null : Number(v));

/** Storico di un esercizio, seduta per seduta: serie migliore e volume. */
export async function exerciseHistory(ctx: AppCtx, userId: string, exerciseId: string): Promise<ExerciseHistory> {
  const [ex] = await ctx.db.select().from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  if (!ex) throw notFound('Esercizio non trovato');
  const sets = (await userSets(ctx.db, userId)).filter((s) => s.exerciseId === exerciseId);
  const byDay = new Map<string, ExerciseHistory['points'][number]>();
  for (const s of sets) {
    const p = byDay.get(s.day) ?? { day: s.day, bestKg: null, bestReps: 0, volumeKg: 0, sets: 0 };
    p.sets += 1;
    p.bestReps = Math.max(p.bestReps, s.reps);
    if (s.loadKg !== null && s.loadKg > 0) {
      p.bestKg = Math.max(p.bestKg ?? 0, s.loadKg);
      p.volumeKg = Math.round((p.volumeKg + s.loadKg * s.reps) * 10) / 10;
    }
    byDay.set(s.day, p);
  }
  const points = [...byDay.values()];
  const loads = points.map((p) => p.bestKg).filter((v): v is number => v !== null);
  return {
    exercise: { id: ex.id, name: ex.name, unit: ex.unit as ExerciseHistory['exercise']['unit'], loadable: ex.loadable },
    points,
    bestKg: loads.length ? Math.max(...loads) : null,
  };
}

/** Il carico migliore di ogni esercizio con i pesi. */
export async function exerciseRecords(ctx: AppCtx, userId: string): Promise<ExerciseRecords> {
  const sets = (await userSets(ctx.db, userId)).filter((s) => s.loadable && s.loadKg !== null && s.loadKg > 0);
  const best = new Map<string, ExerciseRecords['records'][number] & { days: Set<string> }>();
  for (const s of sets) {
    const r = best.get(s.exerciseId) ?? { exerciseId: s.exerciseId, name: s.exercise, bestKg: 0, day: s.day, sessions: 0, days: new Set<string>() };
    r.days.add(s.day);
    if (s.loadKg! > r.bestKg) {
      r.bestKg = s.loadKg!;
      r.day = s.day;
    }
    best.set(s.exerciseId, r);
  }
  return {
    records: [...best.values()]
      .map(({ days, ...r }) => ({ ...r, sessions: days.size }))
      .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)),
  };
}

/* ---------- Check-in ---------- */

export async function checkInsOf(ctx: AppCtx, userId: string, limit = 26): Promise<CheckInsResponse> {
  const { db } = ctx;
  const rows = await db
    .select({ c: checkIns, firstName: users.firstName, lastName: users.lastName })
    .from(checkIns)
    .leftJoin(trainers, eq(trainers.id, checkIns.commentByTrainerId))
    .leftJoin(users, eq(users.id, trainers.userId))
    .where(eq(checkIns.userId, userId))
    .orderBy(desc(checkIns.day))
    .limit(limit);
  const links = await db
    .select({ every: clientLinks.checkInEveryDays, startedAt: clientLinks.startedAt })
    .from(clientLinks)
    .where(and(eq(clientLinks.userId, userId), eq(clientLinks.status, 'active')));
  const asked = links.filter((l) => l.every && l.every > 0);
  const everyDays = asked.length ? Math.min(...asked.map((l) => l.every!)) : null;
  let nextDue: string | null = null;
  if (everyDays) {
    const last = rows[0]?.c.day;
    const start = asked.map((l) => (l.startedAt ? toDay(l.startedAt) : toDay(ctx.now()))).sort()[0]!;
    nextDue = last ? addDays(last, everyDays) : start;
  }
  const out: CheckIn[] = rows.map(({ c, firstName, lastName }) => ({
    id: c.id,
    day: c.day,
    weightKg: num(c.weightKg),
    waistCm: num(c.waistCm),
    energy: c.energy,
    sleep: c.sleep,
    stress: c.stress,
    training: c.training,
    nutrition: c.nutrition,
    notes: c.notes,
    photos: c.photoKeys.map((k) => mediaUrl(ctx, k)),
    comment: c.comment,
    commentBy: firstName ? `${firstName} ${lastName}` : null,
    commentedAt: c.commentedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  }));
  return { checkIns: out, everyDays, nextDue };
}

/** Il check-in è in ritardo? Serve ai promemoria automatici. */
export const checkInOverdue = (r: CheckInsResponse, today: string) => Boolean(r.nextDue && diffDays(today, r.nextDue) >= 0);

/* ---------- App salute ---------- */

export async function healthOf(ctx: AppCtx, userId: string, days = 14): Promise<HealthDay[]> {
  const from = addDays(toDay(ctx.now()), -(days - 1));
  const rows = await ctx.db
    .select()
    .from(healthDays)
    .where(and(eq(healthDays.userId, userId), gte(healthDays.day, from)))
    .orderBy(asc(healthDays.day));
  return rows.map((r) => ({ day: r.day, steps: r.steps, sleepMinutes: r.sleepMinutes, restingHr: r.restingHr, activeKcal: r.activeKcal, source: r.source }));
}
