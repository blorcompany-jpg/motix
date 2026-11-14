import { and, eq, sql } from 'drizzle-orm';
import { COMMITMENT_MONTHS, DEFAULT_POINT_RULES } from '@motix/shared';
import type { AppCtx } from '../context';
import type { Db } from '../db/client';
import { clientLinks, pointMovements, referrals, settings, subscriptions, trainers, users } from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { track } from './events';
import { currentSubscription } from './subscription';

export type PointRules = { subscription: number; renewal: number };

export async function getPointRules(db: Db): Promise<PointRules> {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'points')).limit(1);
  return { ...DEFAULT_POINT_RULES, ...((row?.value ?? {}) as Partial<PointRules>) };
}

export async function setPointRules(db: Db, rules: PointRules) {
  await db.insert(settings).values({ key: 'points', value: rules }).onConflictDoUpdate({ target: settings.key, set: { value: rules, updatedAt: new Date() } });
}

/** Aggiunge o toglie punti a un personal trainer e registra il movimento con il saldo risultante. */
export async function movePoints(
  db: Db,
  trainerId: string,
  reason: 'subscription' | 'renewal' | 'bonus' | 'redemption' | 'adjustment',
  points: number,
  extra: { subscriptionId?: string; note?: string } = {},
) {
  return db.transaction(async (tx) => {
    const [t] = await tx
      .update(trainers)
      .set({ pointsBalance: sql`${trainers.pointsBalance} + ${points}` })
      .where(eq(trainers.id, trainerId))
      .returning({ balance: trainers.pointsBalance });
    if (!t) throw notFound('Personal trainer non trovato');
    if (t.balance < 0) throw conflict('points_insufficient', 'Punti insufficienti');
    await tx.insert(pointMovements).values({ trainerId, reason, points, balanceAfter: t.balance, subscriptionId: extra.subscriptionId, note: extra.note });
    return t.balance;
  });
}

/**
 * Attiva (o rinnova) l'abbonamento dopo il primo addebito e assegna i punti al personal trainer del cliente.
 * Oggi lo richiama BTECH dal pannello; con gli abbonamenti in-app lo richiamerà la conferma di acquisto dello store.
 */
export async function activateSubscription(ctx: AppCtx, userId: string, kind: 'subscription' | 'renewal') {
  const { db } = ctx;
  const sub = await currentSubscription(ctx, userId);
  if (!sub) throw notFound('Abbonamento non trovato');
  if (kind === 'subscription' && sub.status === 'active') throw conflict('already_active', 'L’abbonamento è già attivo');
  if (kind === 'renewal' && sub.status !== 'active') throw conflict('not_active', 'Si può rinnovare solo un abbonamento attivo');
  const now = ctx.now();
  const end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + COMMITMENT_MONTHS);
  await db
    .update(subscriptions)
    .set({ status: 'active', cancelledAt: null, commitmentEndsAt: end, installmentsPaid: kind === 'renewal' ? 1 : Math.max(1, sub.installmentsPaid), updatedAt: now })
    .where(eq(subscriptions.id, sub.id));
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  await track(db, kind === 'renewal' ? 'abbonamento_rinnovato' : 'abbonamento_attivato', { userId, structureId: u?.structureId, channel: u?.acquisitionChannel });

  // Punti al personal trainer con cui il cliente è collegato in questo momento.
  const [link] = await db.select().from(clientLinks).where(and(eq(clientLinks.userId, userId), eq(clientLinks.status, 'active'))).limit(1);
  let awarded = 0;
  if (link) {
    const rules = await getPointRules(db);
    awarded = kind === 'renewal' ? rules.renewal : rules.subscription;
    if (awarded > 0)
      await movePoints(db, link.trainerId, kind, awarded, { subscriptionId: sub.id, note: kind === 'renewal' ? 'Rinnovo di un cliente' : 'Nuovo abbonamento di un cliente' });
  }
  // Amico che ha invitato: il mese gratuito gli spetta al primo abbonamento dell'invitato.
  if (kind === 'subscription')
    await db.update(referrals).set({ status: 'rewarded', rewardedAt: now }).where(and(eq(referrals.referredUserId, userId), eq(referrals.status, 'pending')));
  return { trainerId: link?.trainerId ?? null, points: awarded };
}
