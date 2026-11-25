import { EXERCISES } from '../data/exercises';
import { FOODS } from '../data/foods';
import type { Db } from '../db/client';
import { exercises, foods, shopProducts } from '../db/schema';

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

const BLOR = 'https://blorcompany.com/prodotti';

/** Catalogo iniziale dello shop: una voce per categoria, che apre la pagina corrispondente sul sito BLOR. */
export async function ensureShopCatalog(db: Db) {
  const [existing] = await db.select({ id: shopProducts.id }).from(shopProducts).limit(1);
  if (existing) return;
  await db.insert(shopProducts).values([
    // TODO: quando BLOR pubblica la pagina del sensore, sostituire questo link dal pannello BTECH.
    { name: 'Sensore motix pod', category: 'sensor', blorUrl: `${BLOR}/tutti`, position: 1 },
    { name: 'Attrezzatura sportiva', category: 'equipment', blorUrl: `${BLOR}/Attrezzatura%20Sportiva`, position: 2 },
    { name: 'Abbigliamento', category: 'apparel', blorUrl: `${BLOR}/Abbigliamento`, position: 3 },
    { name: 'Accessori', category: 'accessories', blorUrl: `${BLOR}/Accessori`, position: 4 },
  ]);
}

/** Carica (o aggiorna) la libreria di alimenti di BTECH. Si può rilanciare senza effetti collaterali. */
export async function ensureFoodLibrary(db: Db) {
  for (const f of FOODS) {
    const values = { name: f.name, category: f.category, kcal: String(f.kcal), protein: String(f.protein), carbs: String(f.carbs), fat: String(f.fat), fiber: String(f.fiber) };
    await db.insert(foods).values({ slug: f.slug, ...values }).onConflictDoUpdate({ target: foods.slug, set: values });
  }
}
