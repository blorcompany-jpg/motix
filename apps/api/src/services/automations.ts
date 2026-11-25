/**
 * Messaggi automatici dei professionisti: benvenuto, promemoria del check-in, inattività e rischio abbandono.
 * Partono dalla chat del professionista, solo per le automazioni che lui ha acceso, e mai due volte per lo stesso motivo.
 */
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { AUTOMATION_DEFAULT_TEXT, AUTOMATION_KINDS, type Automation, type AutomationKind } from '@motix/shared';
import type { AppCtx } from '../context';
import type { Db } from '../db/client';
import { automationSends, clientLinks, trainerAutomations, trainers, users, workoutSessions } from '../db/schema';
import { diffDays, mondayOf, toDay } from '../lib/days';
import { track } from './events';
import { ensureConversation, postMessage } from './messaging';
import { riskFor } from './risk';
import { checkInOverdue, checkInsOf } from './tracking';

/** Impostazioni del professionista, con i testi proposti da MOTIX per quelle mai toccate (spente). */
export async function automationsOf(db: Db, trainerId: string): Promise<Automation[]> {
  const rows = await db.select().from(trainerAutomations).where(eq(trainerAutomations.trainerId, trainerId));
  return AUTOMATION_KINDS.map((kind) => {
    const r = rows.find((x) => x.kind === kind);
    return { kind, enabled: r?.enabled ?? false, text: r?.text ?? AUTOMATION_DEFAULT_TEXT[kind] };
  });
}

export async function saveAutomation(db: Db, trainerId: string, a: Automation) {
  await db
    .insert(trainerAutomations)
    .values({ trainerId, kind: a.kind, enabled: a.enabled, text: a.text })
    .onConflictDoUpdate({ target: [trainerAutomations.trainerId, trainerAutomations.kind], set: { enabled: a.enabled, text: a.text, updatedAt: new Date() } });
}

const fill = (text: string, firstName: string) => text.replaceAll('{nome}', firstName);

/** Esegue tutte le automazioni accese. Si può richiamare quante volte si vuole: ogni messaggio parte una volta sola. */
export async function runAutomations(ctx: AppCtx) {
  const { db } = ctx;
  const now = ctx.now();
  const today = toDay(now);
  const week = mondayOf(today);
  const enabled = await db
    .select({ a: trainerAutomations, trainerUserId: trainers.userId })
    .from(trainerAutomations)
    .innerJoin(trainers, eq(trainers.id, trainerAutomations.trainerId))
    .where(and(eq(trainerAutomations.enabled, true), eq(trainers.status, 'approved')));
  if (!enabled.length) return { sent: 0 };

  const trainerIds = [...new Set(enabled.map((e) => e.a.trainerId))];
  const links = await db
    .select({ link: clientLinks, firstName: users.firstName })
    .from(clientLinks)
    .innerJoin(users, eq(users.id, clientLinks.userId))
    .where(and(inArray(clientLinks.trainerId, trainerIds), eq(clientLinks.status, 'active'), eq(users.status, 'active')));
  const sharing = [...new Set(links.filter((l) => l.link.dataConsent).map((l) => l.link.userId))];
  const risks = enabled.some((e) => e.a.kind === 'at_risk') ? await riskFor(db, sharing, now) : new Map();
  const lastDone = new Map<string, string>();
  if (sharing.length) {
    const done = await db
      .select({ userId: workoutSessions.userId, day: workoutSessions.scheduledDate })
      .from(workoutSessions)
      .where(and(inArray(workoutSessions.userId, sharing), isNotNull(workoutSessions.completedAt)))
      .orderBy(desc(workoutSessions.scheduledDate));
    for (const d of done) if (!lastDone.has(d.userId)) lastDone.set(d.userId, d.day);
  }

  let sent = 0;
  for (const { a, trainerUserId } of enabled) {
    for (const { link, firstName } of links.filter((l) => l.link.trainerId === a.trainerId)) {
      const key = await dueKey(ctx, a.kind, link, today, week, lastDone.get(link.userId), risks.get(link.userId)?.level);
      if (!key) continue;
      const claimed = await db
        .insert(automationSends)
        .values({ trainerId: a.trainerId, userId: link.userId, kind: a.kind, dedupeKey: key, sentAt: now })
        .onConflictDoNothing()
        .returning({ id: automationSends.id });
      if (!claimed.length) continue;
      const conversationId = await ensureConversation(db, trainerUserId, link.userId);
      await postMessage(db, conversationId, trainerUserId, fill(a.text, firstName), now);
      await track(db, 'messaggio_automatico', { userId: link.userId, trainerId: a.trainerId }, { kind: a.kind });
      sent++;
    }
  }
  return { sent };
}

async function dueKey(
  ctx: AppCtx,
  kind: AutomationKind,
  link: typeof clientLinks.$inferSelect,
  today: string,
  week: string,
  lastDone: string | undefined,
  risk: string | undefined,
): Promise<string | null> {
  switch (kind) {
    case 'welcome':
      // Solo per chi è appena arrivato: accendendo l'automazione i clienti di vecchia data non ricevono il benvenuto.
      return link.startedAt && diffDays(today, toDay(link.startedAt)) <= 2 ? link.id : null;
    case 'check_in_reminder': {
      if (!link.checkInEveryDays) return null;
      const state = await checkInsOf(ctx, link.userId, 1);
      return checkInOverdue(state, today) ? `due-${state.nextDue}` : null;
    }
    case 'inactive': {
      // Servono i dati del cliente: solo con il suo consenso alla condivisione.
      if (!link.dataConsent) return null;
      const since = lastDone ?? (link.startedAt ? toDay(link.startedAt) : today);
      return diffDays(today, since) >= 7 ? `week-${week}` : null;
    }
    case 'at_risk':
      return link.dataConsent && risk === 'high' ? `week-${week}` : null;
  }
}
