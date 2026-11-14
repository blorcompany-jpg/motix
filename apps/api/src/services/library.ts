import { EXERCISES } from '../data/exercises';
import type { Db } from '../db/client';
import { exercises } from '../db/schema';

/** Carica (o aggiorna) la libreria iniziale di esercizi. Si può rilanciare senza effetti collaterali. */
export async function ensureExerciseLibrary(db: Db) {
  for (const ex of EXERCISES) {
    const values = {
      slug: ex.slug,
      name: ex.name,
      description: ex.description,
      muscles: ex.muscles as string[],
      equipment: ex.equipment as string[],
      level: ex.level,
      pattern: ex.pattern,
      loadable: ex.loadable,
      unit: ex.unit,
      contraindications: ex.contraindications as string[],
      source: 'ai' as const,
    };
    await db
      .insert(exercises)
      // TODO prima del lancio: le schede vanno riviste da BTECH; fino ad allora sono pubblicate per poter provare l'app.
      .values({ ...values, reviewStatus: 'approved' })
      .onConflictDoUpdate({ target: exercises.slug, set: { ...values, updatedAt: new Date() } });
  }
}
