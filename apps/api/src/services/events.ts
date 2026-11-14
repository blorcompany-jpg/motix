import type { AcquisitionChannel } from '@motix/shared';
import type { Db } from '../db/client';
import { analyticsEvents, auditLog } from '../db/schema';

/** Eventi di analytics (sezione 12): ogni evento registra utente, struttura, personal trainer e canale. */
export async function track(
  db: Db,
  type: string,
  ref: { userId?: string | null; structureId?: string | null; trainerId?: string | null; channel?: AcquisitionChannel | null } = {},
  data?: Record<string, unknown>,
) {
  await db.insert(analyticsEvents).values({
    type,
    userId: ref.userId ?? null,
    structureId: ref.structureId ?? null,
    trainerId: ref.trainerId ?? null,
    channel: ref.channel ?? null,
    data,
  });
}

/** Registro delle azioni sensibili. */
export async function audit(
  db: Db,
  action: string,
  ref: { actorUserId?: string | null; entity?: string; entityId?: string; ip?: string } = {},
  data?: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    action,
    actorUserId: ref.actorUserId ?? null,
    entity: ref.entity,
    entityId: ref.entityId,
    ip: ref.ip,
    data,
  });
}
