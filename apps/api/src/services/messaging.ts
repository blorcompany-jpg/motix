import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { conversationParticipants, conversations, messages } from '../db/schema';

/** Conversazione diretta tra due persone: la trova o la crea. */
export async function ensureConversation(db: Db, a: string, b: string): Promise<string> {
  const mine = await db
    .select({ id: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
    .where(and(eq(conversationParticipants.userId, a), eq(conversations.type, 'direct')));
  if (mine.length) {
    const [shared] = await db
      .select({ id: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(and(eq(conversationParticipants.userId, b), inArray(conversationParticipants.conversationId, mine.map((m) => m.id))))
      .limit(1);
    if (shared) return shared.id;
  }
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(conversations).values({ type: 'direct', createdBy: a }).returning();
    await tx.insert(conversationParticipants).values([
      { conversationId: c!.id, userId: a },
      { conversationId: c!.id, userId: b },
    ]);
    return c!.id;
  });
}

export async function postMessage(db: Db, conversationId: string, senderId: string, text: string, now: Date) {
  const [m] = await db.insert(messages).values({ conversationId, senderId, text, createdAt: now }).returning();
  // Chi scrive ha per forza letto la conversazione fino a qui.
  await db
    .update(conversationParticipants)
    .set({ lastReadAt: now })
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, senderId)));
  return m!;
}
