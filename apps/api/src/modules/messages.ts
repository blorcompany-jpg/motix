import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { messageSchema, type ChatMessage, type ConversationSummary, type Role } from '@motix/shared';
import { requireAuth } from '../auth';
import type { AuthCtx } from '../context';
import { clientLinks, conversationParticipants, instructors, messages, structures, trainers, userConsents, users } from '../db/schema';
import { forbidden, notFound, parse } from '../lib/errors';
import { track } from '../services/events';
import { ensureConversation, postMessage } from '../services/messaging';
import { hasPremium } from '../services/subscription';

const idParam = z.object({ id: z.string().uuid() });

export async function messageRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  /** Struttura per cui lavora un titolare o un istruttore. */
  const staffStructure = async (userId: string, role: Role) => {
    if (role === 'owner') {
      const [s] = await db.select().from(structures).where(and(eq(structures.ownerUserId, userId), eq(structures.status, 'approved'))).limit(1);
      return s ?? null;
    }
    if (role === 'instructor') {
      const [row] = await db
        .select({ s: structures })
        .from(instructors)
        .innerJoin(structures, eq(structures.id, instructors.structureId))
        .where(and(eq(instructors.userId, userId), eq(instructors.active, true)))
        .limit(1);
      return row?.s ?? null;
    }
    return null;
  };

  /**
   * Chi può scriversi: personal trainer e cliente con collegamento attivo; staff della struttura e iscritto.
   * Restituisce anche il nome con cui `viewer` vede `other`, rispettando i consensi.
   */
  const relation = async (viewer: { id: string; role: Role }, otherId: string): Promise<{ name: string; role: Role } | null> => {
    const [other] = await db.select().from(users).where(eq(users.id, otherId)).limit(1);
    if (!other || other.status !== 'active') return null;
    const pair = viewer.role === 'personal_trainer' ? { trainerUser: viewer.id, client: otherId } : other.role === 'personal_trainer' ? { trainerUser: otherId, client: viewer.id } : null;
    if (pair) {
      const [link] = await db
        .select({ consent: clientLinks.dataConsent })
        .from(clientLinks)
        .innerJoin(trainers, eq(trainers.id, clientLinks.trainerId))
        .where(and(eq(trainers.userId, pair.trainerUser), eq(clientLinks.userId, pair.client), eq(clientLinks.status, 'active')))
        .limit(1);
      if (!link) return null;
      const hide = viewer.role === 'personal_trainer' && !link.consent;
      return { name: `${other.firstName} ${hide ? `${other.lastName.charAt(0)}.` : other.lastName}`, role: other.role };
    }
    const viewerStructure = await staffStructure(viewer.id, viewer.role);
    if (viewerStructure && other.role === 'user' && other.structureId === viewerStructure.id) {
      const [c] = await db
        .select({ granted: userConsents.granted })
        .from(userConsents)
        .where(and(eq(userConsents.userId, otherId), eq(userConsents.type, 'share_structure')))
        .limit(1);
      return { name: c?.granted ? `${other.firstName} ${other.lastName}` : 'Iscritto (dati non condivisi)', role: other.role };
    }
    const otherStructure = await staffStructure(other.id, other.role);
    if (otherStructure && viewer.role === 'user') {
      const [me] = await db.select({ structureId: users.structureId }).from(users).where(eq(users.id, viewer.id)).limit(1);
      if (me?.structureId === otherStructure.id) return { name: otherStructure.displayName, role: other.role };
    }
    return null;
  };

  const participant = async (auth: AuthCtx, conversationId: string) => {
    const rows = await db.select().from(conversationParticipants).where(eq(conversationParticipants.conversationId, conversationId));
    const me = rows.find((r) => r.userId === auth.userId);
    const other = rows.find((r) => r.userId !== auth.userId);
    if (!me || !other) throw notFound('Conversazione non trovata');
    return { me, otherId: other.userId };
  };

  app.get('/conversations', async (req) => {
    const auth = requireAuth(req);
    const mine = await db.select().from(conversationParticipants).where(eq(conversationParticipants.userId, auth.userId));
    if (!mine.length) return { conversations: [] };
    const ids = mine.map((m) => m.conversationId);
    const others = await db
      .select()
      .from(conversationParticipants)
      .where(and(inArray(conversationParticipants.conversationId, ids), ne(conversationParticipants.userId, auth.userId)));
    const all = await db.select().from(messages).where(inArray(messages.conversationId, ids)).orderBy(desc(messages.createdAt)).limit(2000);
    const out: ConversationSummary[] = [];
    for (const m of mine) {
      const other = others.find((o) => o.conversationId === m.conversationId);
      if (!other) continue;
      const rel = await relation({ id: auth.userId, role: auth.role }, other.userId);
      // Se il collegamento non c'è più la conversazione resta leggibile ma non compare tra quelle attive.
      if (!rel) continue;
      const thread = all.filter((x) => x.conversationId === m.conversationId);
      const last = thread[0];
      out.push({
        id: m.conversationId,
        with: { id: other.userId, name: rel.name, role: rel.role },
        lastMessage: last ? { text: last.text ?? '', at: last.createdAt.toISOString(), mine: last.senderId === auth.userId } : null,
        unread: thread.filter((x) => x.senderId !== auth.userId && (!m.lastReadAt || x.createdAt > m.lastReadAt)).length,
      });
    }
    out.sort((a, b) => (b.lastMessage?.at ?? '').localeCompare(a.lastMessage?.at ?? ''));
    return { conversations: out };
  });

  app.post('/conversations', async (req, reply) => {
    const auth = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.string().uuid() }), req.body);
    const rel = await relation({ id: auth.userId, role: auth.role }, userId);
    if (!rel) throw forbidden('Puoi scrivere solo al tuo personal trainer, ai tuoi clienti o agli iscritti della tua struttura');
    const id = await ensureConversation(db, auth.userId, userId);
    return reply.code(201).send({ id, with: { id: userId, name: rel.name, role: rel.role } });
  });

  app.get('/conversations/:id/messages', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const { me } = await participant(auth, id);
    const rows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(desc(messages.createdAt)).limit(200);
    const now = ctx.now();
    await db
      .update(conversationParticipants)
      .set({ lastReadAt: now })
      .where(and(eq(conversationParticipants.conversationId, id), eq(conversationParticipants.userId, me.userId)));
    const list: ChatMessage[] = rows.reverse().map((m) => ({ id: m.id, text: m.text ?? '', at: m.createdAt.toISOString(), mine: m.senderId === auth.userId }));
    return { messages: list };
  });

  app.post('/conversations/:id/messages', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const { text } = parse(messageSchema, req.body);
    const { otherId } = await participant(auth, id);
    const rel = await relation({ id: auth.userId, role: auth.role }, otherId);
    if (!rel) throw forbidden('Il collegamento con questa persona non è più attivo', 'link_closed');
    // Per chi si allena la chat è una funzione Premium (sezione 3.1); leggere resta sempre possibile.
    if (auth.role === 'user' && !(await hasPremium(ctx, auth.userId)))
      throw forbidden('La chat è inclusa in Premium: attiva l’abbonamento per rispondere', 'premium_required');
    const m = await postMessage(db, id, auth.userId, text, ctx.now());
    await track(db, 'messaggio_inviato', { userId: auth.userId });
    const message: ChatMessage = { id: m.id, text, at: m.createdAt.toISOString(), mine: true };
    return reply.code(201).send(message);
  });

  /** Elenco dei messaggi più recenti, in ordine cronologico: usato dalle app per aggiornare la chat. */
  app.get('/conversations/unread', async (req) => {
    const auth = requireAuth(req);
    const mine = await db.select().from(conversationParticipants).where(eq(conversationParticipants.userId, auth.userId));
    if (!mine.length) return { unread: 0 };
    const rows = await db
      .select({ conversationId: messages.conversationId, createdAt: messages.createdAt })
      .from(messages)
      .where(and(inArray(messages.conversationId, mine.map((m) => m.conversationId)), ne(messages.senderId, auth.userId)))
      .orderBy(asc(messages.createdAt));
    return { unread: rows.filter((r) => { const p = mine.find((m) => m.conversationId === r.conversationId); return !p?.lastReadAt || r.createdAt > p.lastReadAt; }).length };
  });
}
