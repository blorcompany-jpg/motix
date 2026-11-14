import { and, asc, desc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { DEFAULT_HYDRATION_GOAL_ML, type ClientReport, type Limitation, type SportProfile } from '@motix/shared';
import type { AppCtx } from '../context';
import { hydrationGoals, hydrationLogs, measurements, sportProfiles, users, workoutSessions } from '../db/schema';
import { addDays, mondayOf, toDay } from '../lib/days';
import { notFound } from '../lib/errors';
import { riskFor } from './risk';
import { currentSubscription } from './subscription';
import { userSets, volumeOf } from './training';

/** Report di un utente per il personal trainer o la struttura. Chi chiama deve aver già verificato il consenso. */
export async function clientReport(ctx: AppCtx, userId: string, days = 28): Promise<ClientReport> {
  const { db } = ctx;
  const day = toDay(ctx.now());
  const from = addDays(day, -(days - 1));
  const [row] = await db
    .select({ u: users, p: sportProfiles })
    .from(users)
    .leftJoin(sportProfiles, eq(sportProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw notFound('Utente non trovato');
  const { u, p } = row;
  const profile: SportProfile | null = p
    ? {
        sex: u.sex,
        weightKg: p.weightKg ? Number(p.weightKg) : null,
        heightCm: p.heightCm,
        goal: p.goal,
        level: p.level,
        daysPerWeek: p.daysPerWeek,
        equipment: p.equipment,
        limitations: p.limitations as Limitation[],
      }
    : null;

  const sets = await userSets(db, userId, { from, to: day });
  const completed = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), isNotNull(workoutSessions.completedAt), gte(workoutSessions.scheduledDate, from), lte(workoutSessions.scheduledDate, day)))
    .orderBy(desc(workoutSessions.scheduledDate));
  const [last] = await db
    .select({ day: workoutSessions.scheduledDate })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), isNotNull(workoutSessions.completedAt)))
    .orderBy(desc(workoutSessions.scheduledDate))
    .limit(1);

  const weeks: ClientReport['weeks'] = [];
  for (let w = mondayOf(from); w <= day; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    weeks.push({
      weekStart: w,
      sessions: completed.filter((c) => c.scheduledDate >= w && c.scheduledDate <= end).length,
      volumeKg: volumeOf(sets.filter((s) => s.day >= w && s.day <= end)),
    });
  }

  const perExercise = new Map<string, Array<{ day: string; kg: number }>>();
  for (const s of sets) {
    if (!s.loadable || s.loadKg === null || s.loadKg <= 0) continue;
    const list = perExercise.get(s.exercise) ?? [];
    const same = list.find((x) => x.day === s.day);
    if (same) same.kg = Math.max(same.kg, s.loadKg);
    else list.push({ day: s.day, kg: s.loadKg });
    perExercise.set(s.exercise, list);
  }

  const weight = (
    await db
      .select({ day: measurements.day, weightKg: measurements.weightKg })
      .from(measurements)
      .where(and(eq(measurements.userId, userId), gte(measurements.day, from)))
      .orderBy(asc(measurements.day))
  )
    .filter((m) => m.weightKg !== null)
    .map((m) => ({ day: m.day, weightKg: Number(m.weightKg) }));

  const water = await db.select().from(hydrationLogs).where(and(eq(hydrationLogs.userId, userId), gte(hydrationLogs.day, from)));
  const goals = await db.select().from(hydrationGoals).where(and(eq(hydrationGoals.userId, userId), gte(hydrationGoals.day, from)));
  const firstWater = water.map((w) => w.day).sort()[0];
  const tracked: Array<{ total: number; goal: number }> = [];
  if (firstWater)
    for (let d = firstWater; d <= day; d = addDays(d, 1))
      tracked.push({
        total: water.filter((w) => w.day === d).reduce((n, w) => n + w.amountMl, 0),
        goal: goals.find((g) => g.day === d)?.goalMl ?? DEFAULT_HYDRATION_GOAL_ML,
      });

  const sub = await currentSubscription(ctx, userId);
  const risk = (await riskFor(db, [userId], ctx.now())).get(userId)!;

  return {
    client: { id: u.id, firstName: u.firstName, lastName: u.lastName },
    profile,
    subscriptionStatus: sub?.status ?? null,
    risk,
    lastSessionDay: last?.day ?? null,
    weeks,
    sessions: completed.slice(0, 12).map((c) => {
      const mine = sets.filter((s) => s.sessionId === c.id);
      return { id: c.id, title: c.title ?? 'Allenamento', day: c.scheduledDate, sets: mine.length, volumeKg: volumeOf(mine), perceivedEffort: c.perceivedEffort };
    }),
    strength: [...perExercise.entries()]
      .filter(([, pts]) => pts.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5)
      .map(([exercise, pts]) => ({ exercise, firstKg: pts[0]!.kg, lastKg: pts.at(-1)!.kg })),
    weight,
    hydration: {
      averageMl: tracked.length ? Math.round(tracked.reduce((n, t) => n + t.total, 0) / tracked.length) : 0,
      daysOnTarget: tracked.filter((t) => t.total >= t.goal).length,
      trackedDays: tracked.length,
    },
  };
}
