import { desc, eq } from 'drizzle-orm';
import { COMMITMENT_MONTHS, PRICE_MONTHLY_EUR, type SubscriptionResponse } from '@motix/shared';
import type { AppCtx } from '../context';
import { subscriptions } from '../db/schema';
import { track } from './events';

const DAY_MS = 86_400_000;
type Row = typeof subscriptions.$inferSelect;

/**
 * Abbonamento corrente dell'utente. Se la prova è finita senza un abbonamento attivato dallo store,
 * l'utente passa alla versione gratuita (stato «expired»).
 */
export async function currentSubscription(ctx: AppCtx, userId: string): Promise<Row | null> {
  const [sub] = await ctx.db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  if (!sub) return null;
  if (sub.status === 'trial' && sub.trialEndsAt && sub.trialEndsAt <= ctx.now()) {
    await ctx.db.update(subscriptions).set({ status: 'expired', updatedAt: ctx.now() }).where(eq(subscriptions.id, sub.id));
    await track(ctx.db, 'prova_scaduta', { userId });
    return { ...sub, status: 'expired' };
  }
  return sub;
}

/** Funzioni Premium attive: prova in corso o abbonamento attivo. */
export const isPremium = (sub: Row | null) => sub?.status === 'trial' || sub?.status === 'active';

export async function hasPremium(ctx: AppCtx, userId: string) {
  return isPremium(await currentSubscription(ctx, userId));
}

export function describeSubscription(ctx: AppCtx, sub: Row): SubscriptionResponse {
  const left =
    sub.status === 'trial' && sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - ctx.now().getTime()) / DAY_MS)) : null;
  return {
    status: sub.status,
    premium: isPremium(sub),
    cancelled: Boolean(sub.cancelledAt),
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    trialDaysLeft: left,
    firstChargeAt: sub.status === 'trial' && !sub.cancelledAt ? (sub.firstChargeAt?.toISOString() ?? null) : null,
    commitmentEndsAt: sub.commitmentEndsAt?.toISOString() ?? null,
    installmentsPaid: sub.installmentsPaid,
    installmentsTotal: COMMITMENT_MONTHS,
    priceMonthlyEur: PRICE_MONTHLY_EUR,
  };
}
