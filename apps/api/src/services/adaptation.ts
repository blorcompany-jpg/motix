/**
 * Nuova settimana del piano (sezione 8.1: «il piano si adatta ogni settimana»).
 *
 * Quando la settimana del piano attivo è finita, se ne crea una nuova con le stesse sedute.
 * - Piano generato da MOTIX: il motore AI propone per ogni esercizio se aumentare, confermare o ridurre,
 *   in base a serie, ripetizioni, carichi, fatica dichiarata e dati del sensore. Un filtro di sicurezza
 *   controlla le proposte prima di applicarle.
 * - Piano del personal trainer: viene riproposto uguale. Lo cambia solo il personal trainer.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { ageOn } from '@motix/shared';
import type { AppCtx } from '../context';
import { exercises, plans, sessionExercises, users, workoutSessions } from '../db/schema';
import { AiUnavailable, type WeekDecision, type WeekInput } from '../lib/ai';
import { addDays, diffDays, toDay } from '../lib/days';
import { track } from './events';
import { hasPremium } from './subscription';
import { savePlan, userSets, type UserSet } from './training';

/** Un aumento di carico non supera mai questa quota in una settimana, qualunque cosa proponga il motore. */
const MAX_LOAD_STEP = 0.1;
const roundHalf = (n: number) => Math.round(n * 2) / 2;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// Evita che due richieste contemporanee dello stesso utente creino due piani.
// TODO produzione con più istanze del server: sostituire con un lock nel database.
const running = new Map<string, Promise<boolean>>();

/** Se la settimana del piano è finita, crea quella nuova. Restituisce true se il piano è cambiato. */
export function rolloverPlan(ctx: AppCtx, userId: string): Promise<boolean> {
  const current = running.get(userId);
  if (current) return current;
  const job = doRollover(ctx, userId).finally(() => running.delete(userId));
  running.set(userId, job);
  return job;
}

async function doRollover(ctx: AppCtx, userId: string): Promise<boolean> {
  const { db } = ctx;
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.status, 'active')))
    .orderBy(desc(plans.createdAt))
    .limit(1);
  if (!plan) return false;
  const today = toDay(ctx.now());
  const elapsed = diffDays(today, plan.weekStart);
  if (elapsed < 7) return false;
  // Il piano che si aggiorna è una funzione Premium: nella versione gratuita resta l'ultimo ricevuto.
  if (!(await hasPremium(ctx, userId))) return false;

  const weekStart = addDays(plan.weekStart, 7 * Math.floor(elapsed / 7));
  const sessions = await db.select().from(workoutSessions).where(eq(workoutSessions.planId, plan.id)).orderBy(asc(workoutSessions.scheduledDate));
  if (!sessions.length) return false;
  const items = await db
    .select({ se: sessionExercises, ex: exercises })
    .from(sessionExercises)
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(inArray(sessionExercises.sessionId, sessions.map((s) => s.id)))
    .orderBy(asc(sessionExercises.position));

  const template = sessions.map((s, si) => ({
    title: s.title ?? 'Allenamento',
    // Le sedute tengono lo stesso giorno della settimana.
    day: addDays(weekStart, ((diffDays(s.scheduledDate, plan.weekStart) % 7) + 7) % 7),
    exercises: items
      .filter((i) => i.se.sessionId === s.id)
      .map((i) => ({
        key: `${si}:${i.se.position}`,
        exerciseId: i.ex.id,
        name: i.ex.name,
        unit: i.ex.unit as 'reps' | 'seconds' | 'minutes',
        loadable: i.ex.loadable,
        sets: i.se.targetSets,
        reps: i.se.targetReps,
        loadKg: i.se.targetLoadKg === null ? null : Number(i.se.targetLoadKg),
        restSeconds: i.se.restSeconds ?? 60,
      })),
  }));

  let changes: string[] = [];
  let mode: string = 'copy';
  if (plan.author === 'ai') {
    const history = await userSets(db, userId, { from: plan.weekStart, to: addDays(weekStart, -1) });
    const [me] = await db.select({ birthDate: users.birthDate }).from(users).where(eq(users.id, userId)).limit(1);
    const done = sessions.filter((s) => s.completedAt);
    const input: WeekInput = {
      plannedSessions: sessions.length,
      completedSessions: done.length,
      efforts: done.map((s) => s.perceivedEffort).filter((e): e is number => e !== null),
      minor: me?.birthDate ? ageOn(me.birthDate, ctx.now()) < 18 : false,
      exercises: template.flatMap((s) =>
        s.exercises.map((e) => ({
          key: e.key,
          name: e.name,
          unit: e.unit,
          loadable: e.loadable,
          sets: e.sets,
          reps: e.reps,
          loadKg: e.loadKg,
          sessions: groupBySession(history.filter((h) => h.exerciseId === e.exerciseId)),
        })),
      ),
    };
    try {
      const decision = await ctx.ai.adaptWeek(input);
      mode = decision.mode;
      changes = applyDecision(template, input, decision);
    } catch (e) {
      if (!(e instanceof AiUnavailable)) throw e;
      // Senza motore il piano non resta fermo alla settimana vecchia: riparte uguale.
      mode = 'unavailable';
      changes = ['Questa settimana il piano riparte uguale alla precedente.'];
    }
  }

  let rationale: string[] = [];
  try {
    rationale = JSON.parse(plan.rationale ?? '[]');
  } catch {
    rationale = plan.rationale ? [plan.rationale] : [];
  }
  await savePlan(db, {
    userId,
    author: plan.author,
    trainerId: plan.authorTrainerId,
    weekStart,
    rationale,
    changes,
    sessions: template.map((s) => ({
      title: s.title,
      day: s.day,
      exercises: s.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, restSeconds: e.restSeconds, loadKg: e.loadKg })),
    })),
  });
  await track(db, 'piano_adattato', { userId }, { mode, author: plan.author });
  return true;
}

function groupBySession(sets: UserSet[]) {
  const bySession = new Map<string, UserSet[]>();
  for (const s of sets) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);
  return [...bySession.values()].map((list) => list.map((s) => ({ reps: s.reps, loadKg: s.loadKg, velocityLossPct: s.sensor?.velocityLossPct ?? null })));
}

type Template = Array<{ exercises: Array<{ key: string; name: string; unit: string; loadable: boolean; sets: number; reps: number; loadKg: number | null }> }>;

/**
 * Applica le proposte del motore al piano, dopo il filtro di sicurezza: niente salti di carico oltre il 10%,
 * niente valori fuori scala, niente carichi su esercizi a corpo libero. Restituisce le righe da mostrare all'utente.
 */
function applyDecision(template: Template, input: WeekInput, decision: WeekDecision): string[] {
  const lines = [...decision.summary.slice(0, 4)];
  const byKey = new Map(decision.exercises.map((d) => [d.key, d]));
  const told = new Set<string>();
  for (const session of template)
    for (const ex of session.exercises) {
      const d = byKey.get(ex.key);
      if (!d || d.action === 'hold') continue;
      const used = input.exercises.find((e) => e.key === ex.key)?.sessions.flat().map((s) => s.loadKg ?? 0) ?? [];
      const ceiling = Math.max(ex.loadKg ?? 0, ...used) * (1 + MAX_LOAD_STEP);
      const before = { sets: ex.sets, reps: ex.reps, loadKg: ex.loadKg };
      ex.sets = clamp(Math.round(d.sets), Math.max(1, ex.sets - 1), ex.sets + 1);
      ex.reps = ex.unit === 'reps' ? clamp(Math.round(d.reps), Math.max(1, ex.reps - 2), ex.reps + 2) : clamp(Math.round(d.reps), 1, ex.reps + 5);
      if (ex.loadable && d.loadKg !== null && ceiling > 0) ex.loadKg = clamp(roundHalf(d.loadKg), 0.5, roundHalf(ceiling));
      const changed = before.sets !== ex.sets || before.reps !== ex.reps || before.loadKg !== ex.loadKg;
      // Lo stesso esercizio in due sedute si racconta una volta sola.
      if (changed && !told.has(`${ex.name}:${d.reason}`)) {
        told.add(`${ex.name}:${d.reason}`);
        lines.push(`${ex.name}: ${d.reason.charAt(0).toLowerCase()}${d.reason.slice(1)}`);
      }
    }
  return lines.slice(0, 24);
}
