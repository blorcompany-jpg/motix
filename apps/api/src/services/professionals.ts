import { and, asc, eq, inArray } from 'drizzle-orm';
import { NUTRITION_PROFESSIONS, REGISTERED_PROFESSIONS, professionArea, type Profession } from '@motix/shared';
import type { Db } from '../db/client';
import { clientLinks, trainers } from '../db/schema';

type TrainerRow = typeof trainers.$inferSelect;

/** Albo verificato, o professione che non lo richiede. */
export const registerOk = (t: TrainerRow) => !REGISTERED_PROFESSIONS.includes(t.profession) || Boolean(t.registerVerifiedAt);

/** Solo il nutrizionista approvato con l'iscrizione all'albo verificata può prescrivere un piano alimentare. */
export const canPrescribeNutrition = (t: TrainerRow) => t.status === 'approved' && NUTRITION_PROFESSIONS.includes(t.profession) && Boolean(t.registerVerifiedAt);

export const describeTrainer = (t: TrainerRow) => ({
  id: t.id,
  status: t.status,
  inviteCode: t.inviteCode,
  pointsBalance: t.pointsBalance,
  profession: t.profession,
  registerVerified: Boolean(t.registerVerifiedAt),
  canPrescribeNutrition: canPrescribeNutrition(t),
});

/**
 * Collegamenti attivi dell'utente con la professione di ciascun professionista.
 * Un utente può avere un professionista per l'allenamento e uno per l'alimentazione.
 */
export async function activeLinks(db: Db, userId: string) {
  return db
    .select({ link: clientLinks, profession: trainers.profession })
    .from(clientLinks)
    .innerJoin(trainers, eq(trainers.id, clientLinks.trainerId))
    .where(and(eq(clientLinks.userId, userId), eq(clientLinks.status, 'active')))
    .orderBy(asc(clientLinks.startedAt));
}

/** C'è già un professionista attivo nella stessa area (allenamento o alimentazione) di quello indicato? */
export async function areaTaken(db: Db, userId: string, profession: Profession) {
  const area = professionArea(profession);
  return (await activeLinks(db, userId)).some((l) => professionArea(l.profession) === area);
}

export const AREA_TAKEN_MESSAGE = (p: Profession) =>
  professionArea(p) === 'nutrition'
    ? 'Hai già un nutrizionista collegato: chiudi prima quel collegamento'
    : 'Hai già un professionista per l’allenamento collegato: chiudi prima quel collegamento';

/** Professionisti collegati attivamente all'utente, filtrati per professione se serve. */
export async function linkedTrainerIds(db: Db, userId: string, professions?: Profession[]) {
  const rows = await activeLinks(db, userId);
  return rows.filter((r) => !professions || professions.includes(r.profession)).map((r) => r.link.trainerId);
}

export async function trainersByIds(db: Db, ids: string[]) {
  return ids.length ? db.select().from(trainers).where(inArray(trainers.id, ids)) : [];
}
