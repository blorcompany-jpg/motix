import { and, eq, sql } from 'drizzle-orm';
import { COMMITMENT_MONTHS, DEFAULT_POINT_RULES, PRICE_YEARLY_EUR, pointsFor, type PurchaseChannel } from '@motix/shared';
import type { AppCtx } from '../context';
import type { Db } from '../db/client';
import { pointMovements, referrals, settings, subscriptions, trainers, users } from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { track } from './events';
import { activeLinks } from './professionals';
import { currentSubscription } from './subscription';

export type PointRules = { sharePct: number; pointValueEur: number };

export async function getPointRules(db: Db): Promise<PointRules> {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'points')).limit(1);
  const v = (row?.value ?? {}) as Partial<PointRules>;
  return {
    sharePct: typeof v.sharePct === 'number' ? v.sharePct : DEFAULT_POINT_RULES.sharePct,
    pointValueEur: typeof v.pointValueEur === 'number' ? v.pointValueEur : DEFAULT_POINT_RULES.pointValueEur,
  };
}

/** Regole come le vedono professionisti e pannello, con i punti per un abbonamento a prezzo pieno. */
export const describePointRules = (r: PointRules) => ({ ...r, pointsPerSubscription: pointsFor(PRICE_YEARLY_EUR, r) });

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

export interface Activation {
  /** Dove è stato comprato: App Store, Google Play, sito o pacchetto della palestra. */
  channel?: PurchaseChannel;
  transactionId?: string;
  /** Prezzo pagato IVA inclusa: serve a calcolare i punti. Di default il prezzo pieno annuale. */
  priceEur?: number;
}

/**
 * Attiva (o rinnova) l'abbonamento annuale dopo il pagamento e assegna i punti al professionista che ha portato il cliente:
 * il 20% del prezzo pagato, convertito in punti.
 * Oggi lo richiamano BTECH dal pannello e i pacchetti delle palestre; poi le conferme di App Store, Google Play e del pagamento sul sito.
 */
export async function activateSubscription(ctx: AppCtx, userId: string, kind: 'subscription' | 'renewal', pay: Activation = {}) {
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
    .set({
      status: 'active',
      cancelledAt: null,
      commitmentEndsAt: end,
      installmentsPaid: 1,
      store: pay.channel ?? 'web',
      storeTransactionId: pay.transactionId ?? null,
      updatedAt: now,
    })
    .where(eq(subscriptions.id, sub.id));
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const priceEur = pay.priceEur ?? PRICE_YEARLY_EUR;
  await track(
    db,
    kind === 'renewal' ? 'abbonamento_rinnovato' : 'abbonamento_attivato',
    { userId, structureId: u?.structureId, channel: u?.acquisitionChannel },
    { purchase: pay.channel ?? 'web', priceEur },
  );

  // Punti al professionista che segue il cliente da più tempo: è lui che l'ha portato su MOTIX.
  const [link] = (await activeLinks(db, userId)).map((l) => l.link);
  let awarded = 0;
  if (link) {
    awarded = pointsFor(priceEur, await getPointRules(db));
    if (awarded > 0)
      await movePoints(db, link.trainerId, kind, awarded, {
        subscriptionId: sub.id,
        note: `${kind === 'renewal' ? 'Rinnovo' : 'Nuovo abbonamento'} di un cliente: ${(await getPointRules(db)).sharePct}% di €${priceEur.toFixed(2).replace('.', ',')}`,
      });
  }
  // Amico che ha invitato: il mese gratuito gli spetta al primo abbonamento dell'invitato.
  if (kind === 'subscription')
    await db.update(referrals).set({ status: 'rewarded', rewardedAt: now }).where(and(eq(referrals.referredUserId, userId), eq(referrals.status, 'pending')));
  return { trainerId: link?.trainerId ?? null, points: awarded };
}
