import { and, eq, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sensors, users } from '../db/schema';

/** Sensori che l'utente può usare: i suoi e quelli messi a disposizione dalla sua struttura. */
export async function usableSensors(db: Db, userId: string) {
  const [me] = await db.select({ structureId: users.structureId }).from(users).where(eq(users.id, userId)).limit(1);
  const mine = and(eq(sensors.ownerType, 'user'), eq(sensors.ownerUserId, userId));
  const ofStructure = me?.structureId ? and(eq(sensors.ownerType, 'structure'), eq(sensors.ownerStructureId, me.structureId)) : undefined;
  return db
    .select()
    .from(sensors)
    .where(and(eq(sensors.status, 'active'), ofStructure ? or(mine, ofStructure) : mine));
}
