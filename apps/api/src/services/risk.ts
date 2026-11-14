/**
 * Rischio abbandono (sezione 8.4), versione a regole: calo di frequenza, sedute saltate,
 * giorni dall'ultimo allenamento e dall'ultimo accesso. Il motore AI lo sostituirà con un modello.
 */
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import type { RiskInfo, RiskLevel } from '@motix/shared';
import type { Db } from '../db/client';
import { riskScores, subscriptions, users, workoutSessions } from '../db/schema';
import { addDays, diffDays, toDay } from '../lib/days';

export interface RiskFacts {
  /** Giorni dall'iscrizione. */
  accountAgeDays: number;
  daysSinceLastSession: number | null;
  daysSinceLastLogin: number | null;
  sessionsLast14: number;
  sessionsPrev14: number;
  missedLast14: number;
  trialDaysLeft: number | null;
}

export function scoreRisk(f: RiskFacts): RiskInfo {
  const hits: Array<{ weight: number; reason: string; suggestion: string }> = [];
  if (f.daysSinceLastSession === null) {
    if (f.accountAgeDays > 7)
      hits.push({ weight: 0.35, reason: 'Non ha ancora completato una seduta', suggestion: 'Proponi una prima seduta guidata in struttura' });
  } else if (f.daysSinceLastSession > 14)
    hits.push({ weight: 0.45, reason: `Nessuna seduta da ${f.daysSinceLastSession} giorni`, suggestion: 'Scrivigli per fissare il prossimo allenamento' });
  else if (f.daysSinceLastSession > 7)
    hits.push({ weight: 0.25, reason: `Nessuna seduta da ${f.daysSinceLastSession} giorni`, suggestion: 'Un messaggio di incoraggiamento può bastare' });

  if (f.sessionsPrev14 >= 2 && f.sessionsLast14 <= f.sessionsPrev14 / 2)
    hits.push({
      weight: 0.25,
      reason: `Frequenza in calo: ${f.sessionsLast14} sedute nelle ultime due settimane, ${f.sessionsPrev14} nelle due precedenti`,
      suggestion: 'Chiedi se il piano è troppo impegnativo e proponi di alleggerirlo',
    });
  if (f.missedLast14 >= 2)
    hits.push({ weight: 0.15, reason: `${f.missedLast14} sedute del piano saltate`, suggestion: 'Proponi meno giorni a settimana o sedute più brevi' });
  if (f.daysSinceLastLogin !== null && f.daysSinceLastLogin > 10)
    hits.push({ weight: 0.25, reason: `Non apre l’app da ${f.daysSinceLastLogin} giorni`, suggestion: 'Contattalo di persona alla prossima visita in struttura' });
  if (f.trialDaysLeft !== null && f.trialDaysLeft <= 3 && f.sessionsLast14 === 0)
    hits.push({ weight: 0.1, reason: `La prova scade tra ${f.trialDaysLeft} giorni e non si è ancora allenato`, suggestion: 'Invitalo a provare una seduta prima della fine della prova' });

  hits.sort((a, b) => b.weight - a.weight);
  const score = Math.min(1, Math.round(hits.reduce((n, h) => n + h.weight, 0) * 100) / 100);
  const level: RiskLevel = score >= 0.6 ? 'high' : score >= 0.3 ? 'medium' : 'low';
  return { level, score, reasons: hits.map((h) => h.reason), suggestion: hits[0]?.suggestion ?? null };
}

/** Calcola il rischio per un gruppo di utenti e lo salva come punteggio del giorno. */
export async function riskFor(db: Db, userIds: string[], now: Date): Promise<Map<string, RiskInfo>> {
  const out = new Map<string, RiskInfo>();
  if (!userIds.length) return out;
  const day = toDay(now);
  const people = await db
    .select({ id: users.id, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(inArray(users.id, userIds));
  const sessions = await db
    .select({ userId: workoutSessions.userId, day: workoutSessions.scheduledDate, completedAt: workoutSessions.completedAt, planId: workoutSessions.planId })
    .from(workoutSessions)
    .where(and(inArray(workoutSessions.userId, userIds), gte(workoutSessions.scheduledDate, addDays(day, -90))));
  const subs = await db.select().from(subscriptions).where(inArray(subscriptions.userId, userIds)).orderBy(desc(subscriptions.createdAt));

  for (const u of people) {
    const mine = sessions.filter((s) => s.userId === u.id);
    const done = mine.filter((s) => s.completedAt).map((s) => s.day).sort();
    const last = done.at(-1) ?? null;
    const between = (from: number, to: number) => done.filter((d) => diffDays(day, d) >= from && diffDays(day, d) <= to).length;
    const sub = subs.find((s) => s.userId === u.id);
    const info = scoreRisk({
      accountAgeDays: diffDays(day, toDay(u.createdAt)),
      daysSinceLastSession: last ? diffDays(day, last) : null,
      daysSinceLastLogin: u.lastLoginAt ? diffDays(day, toDay(u.lastLoginAt)) : null,
      sessionsLast14: between(0, 13),
      sessionsPrev14: between(14, 27),
      missedLast14: mine.filter((s) => s.planId && !s.completedAt && s.day < day && diffDays(day, s.day) <= 14).length,
      trialDaysLeft: sub?.status === 'trial' && sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86_400_000)) : null,
    });
    out.set(u.id, info);
  }

  const rows = [...out.entries()].map(([userId, r]) => ({ userId, day, value: String(r.score), reasons: r.reasons }));
  for (const row of rows)
    await db
      .insert(riskScores)
      .values(row)
      .onConflictDoUpdate({ target: [riskScores.userId, riskScores.day], set: { value: row.value, reasons: row.reasons } });
  return out;
}
