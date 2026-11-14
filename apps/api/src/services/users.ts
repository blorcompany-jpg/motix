import { and, desc, eq } from 'drizzle-orm';
import {
  CONSENT_TYPES,
  TRIAL_DAYS,
  type AuthResponse,
  type ConsentType,
  type MeResponse,
  type Role,
} from '@motix/shared';
import type { AppCtx } from '../context';
import type { Db } from '../db/client';
import {
  emailTokens,
  instructors,
  refreshTokens,
  structures,
  subscriptions,
  trainers,
  userConsents,
  users,
} from '../db/schema';
import { notFound } from '../lib/errors';
import { hashToken, newCode, newOpaqueToken, signAccessToken } from '../lib/tokens';
import { track } from './events';

const DAY_MS = 86_400_000;

export async function findUserByEmail(db: Db, email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function setConsents(db: Db, userId: string, values: Partial<Record<ConsentType, boolean>>, now: Date) {
  for (const type of CONSENT_TYPES) {
    const granted = values[type];
    if (granted === undefined) continue;
    await db
      .insert(userConsents)
      .values({ userId, type, granted, updatedAt: now })
      .onConflictDoUpdate({ target: [userConsents.userId, userConsents.type], set: { granted, updatedAt: now } });
  }
}

export async function getConsents(db: Db, userId: string): Promise<Record<ConsentType, boolean>> {
  const rows = await db.select().from(userConsents).where(eq(userConsents.userId, userId));
  const out = Object.fromEntries(CONSENT_TYPES.map((t) => [t, false])) as Record<ConsentType, boolean>;
  for (const r of rows) out[r.type] = r.granted;
  return out;
}

/** La prova gratuita di 14 giorni parte al primo accesso; il 15° giorno parte l'abbonamento. */
export async function startTrial(db: Db, userId: string, now: Date) {
  const [existing] = await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (existing) return;
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
  await db.insert(subscriptions).values({
    userId,
    status: 'trial',
    trialStartedAt: now,
    trialEndsAt,
    firstChargeAt: trialEndsAt,
  });
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  await track(db, 'prova_iniziata', { userId, structureId: u?.structureId, channel: u?.acquisitionChannel });
}

export async function uniqueReferralCode(db: Db): Promise<string> {
  for (;;) {
    const code = newCode('AM');
    const [hit] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code)).limit(1);
    if (!hit) return code;
  }
}

export async function buildMe(ctx: AppCtx, userId: string): Promise<MeResponse> {
  const { db } = ctx;
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw notFound('Utente non trovato');

  const summary = (s: typeof structures.$inferSelect) => ({ id: s.id, displayName: s.displayName, city: s.city, type: s.type });

  let structure: MeResponse['structure'] = null;
  if (u.structureId) {
    const [s] = await db.select().from(structures).where(eq(structures.id, u.structureId)).limit(1);
    if (s) structure = summary(s);
  }

  let subscription: MeResponse['subscription'] = null;
  if (u.role === 'user') {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, u.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (sub) {
      const left =
        sub.status === 'trial' && sub.trialEndsAt
          ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - ctx.now().getTime()) / DAY_MS))
          : null;
      subscription = {
        status: sub.status,
        trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
        trialDaysLeft: left,
        firstChargeAt: sub.firstChargeAt?.toISOString() ?? null,
      };
    }
  }

  let trainer: MeResponse['trainer'] = null;
  if (u.role === 'personal_trainer') {
    const [t] = await db.select().from(trainers).where(eq(trainers.userId, u.id)).limit(1);
    if (t) trainer = { id: t.id, status: t.status, inviteCode: t.inviteCode, pointsBalance: t.pointsBalance };
  }

  let ownedStructure: MeResponse['ownedStructure'] = null;
  if (u.role === 'owner') {
    const [s] = await db.select().from(structures).where(eq(structures.ownerUserId, u.id)).limit(1);
    if (s) ownedStructure = { ...summary(s), status: s.status, code: s.code };
  }

  let instructorOf: MeResponse['instructorOf'] = null;
  if (u.role === 'instructor') {
    const [row] = await db
      .select({ s: structures })
      .from(instructors)
      .innerJoin(structures, eq(structures.id, instructors.structureId))
      .where(and(eq(instructors.userId, u.id), eq(instructors.active, true)))
      .limit(1);
    if (row) instructorOf = summary(row.s);
  }

  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    status: u.status,
    birthDate: u.birthDate,
    profileVisibility: u.profileVisibility,
    referralCode: u.referralCode,
    consents: await getConsents(db, u.id),
    structure,
    subscription,
    trainer,
    ownedStructure,
    instructorOf,
  };
}

/** Crea la coppia di token e registra l'accesso. */
export async function issueSession(ctx: AppCtx, user: { id: string; role: Role }, userAgent?: string): Promise<AuthResponse> {
  const now = ctx.now();
  const { token, hash } = newOpaqueToken();
  await ctx.db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: hash,
    userAgent: userAgent?.slice(0, 250),
    expiresAt: new Date(now.getTime() + ctx.config.refreshTokenTtlDays * DAY_MS),
  });
  await ctx.db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  return {
    accessToken: await signAccessToken(ctx.config, { sub: user.id, role: user.role }),
    refreshToken: token,
    user: await buildMe(ctx, user.id),
  };
}

export async function createEmailToken(
  ctx: AppCtx,
  userId: string,
  purpose: 'verify_email' | 'reset_password',
  ttlHours: number,
): Promise<string> {
  const { token, hash } = newOpaqueToken();
  await ctx.db.insert(emailTokens).values({
    userId,
    purpose,
    tokenHash: hash,
    expiresAt: new Date(ctx.now().getTime() + ttlHours * 3_600_000),
  });
  return token;
}

export async function consumeEmailToken(ctx: AppCtx, token: string, purpose: 'verify_email' | 'reset_password') {
  const [row] = await ctx.db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, hashToken(token)), eq(emailTokens.purpose, purpose)))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt < ctx.now()) return null;
  await ctx.db.update(emailTokens).set({ usedAt: ctx.now() }).where(eq(emailTokens.id, row.id));
  return row.userId;
}

export async function sendVerifyEmail(ctx: AppCtx, user: { id: string; email: string; firstName: string }) {
  const token = await createEmailToken(ctx, user.id, 'verify_email', 72);
  const link = `${ctx.config.publicWebUrl}/verifica-email?token=${token}`;
  await ctx.mailer.send({
    to: user.email,
    kind: 'verify_email',
    subject: 'Conferma la tua email su MOTIX',
    text: `Ciao ${user.firstName},\nconferma il tuo indirizzo email aprendo questo link:\n${link}\n\nIl link vale 72 ore.`,
    link,
  });
}
