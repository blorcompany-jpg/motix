/**
 * Alimentazione: libreria di alimenti, piani alimentari del nutrizionista e diario dell'utente.
 * Il piano alimentare lo crea solo il nutrizionista con l'iscrizione all'albo verificata da BTECH.
 */
import { and, asc, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  FOOD_CATEGORIES,
  MEALS,
  foodLogSchema,
  foodSchema,
  mealPlanSchema,
  type Food,
  type FoodDiaryDay,
  type Macros,
  type MealItemView,
  type MealPlanView,
} from '@motix/shared';
import { requireRole } from '../auth';
import type { AppCtx } from '../context';
import { foodLogs, foods, mealPlans, trainers, users, type MealPlanDays } from '../db/schema';
import { assertPlausibleDay, toDay } from '../lib/days';
import { badRequest, forbidden, notFound, parse } from '../lib/errors';
import { clientOfTrainer, currentTrainer } from '../services/access';
import { audit, track } from '../services/events';
import { canPrescribeNutrition, linkedTrainerIds } from '../services/professionals';
import { hasPremium } from '../services/subscription';

type FoodRow = typeof foods.$inferSelect;
const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const r1 = (n: number) => Math.round(n * 10) / 10;

export const macrosOf = (f: FoodRow, grams: number): Macros => ({
  kcal: Math.round((Number(f.kcal) * grams) / 100),
  protein: r1((Number(f.protein) * grams) / 100),
  carbs: r1((Number(f.carbs) * grams) / 100),
  fat: r1((Number(f.fat) * grams) / 100),
});
export const sum = (list: Macros[]): Macros =>
  list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: r1(a.protein + m.protein), carbs: r1(a.carbs + m.carbs), fat: r1(a.fat + m.fat) }), { ...ZERO });

const foodView = (f: FoodRow): Food => ({
  id: f.id,
  name: f.name,
  category: f.category,
  kcal: Number(f.kcal),
  protein: Number(f.protein),
  carbs: Number(f.carbs),
  fat: Number(f.fat),
  fiber: Number(f.fiber),
  custom: f.trainerId !== null,
});

async function foodMap(ctx: AppCtx, ids: string[]) {
  const rows = ids.length ? await ctx.db.select().from(foods).where(inArray(foods.id, ids)) : [];
  return new Map(rows.map((r) => [r.id, r]));
}

/** Piano nel formato da mostrare, con calorie e macronutrienti calcolati per pasto e per giorno. */
export async function mealPlanView(ctx: AppCtx, plan: typeof mealPlans.$inferSelect): Promise<MealPlanView> {
  const ids = plan.days.flatMap((d) => d.meals.flatMap((m) => [...m.items, ...m.alternatives.flat()].map((i) => i.foodId)));
  const info = await foodMap(ctx, [...new Set(ids)]);
  const items = (list: Array<{ foodId: string; grams: number }>): MealItemView[] =>
    list.filter((i) => info.has(i.foodId)).map((i) => ({ foodId: i.foodId, name: info.get(i.foodId)!.name, grams: i.grams, macros: macrosOf(info.get(i.foodId)!, i.grams) }));
  let nutritionist = '';
  if (plan.trainerId) {
    const [n] = await ctx.db.select({ f: users.firstName, l: users.lastName }).from(trainers).innerJoin(users, eq(users.id, trainers.userId)).where(eq(trainers.id, plan.trainerId)).limit(1);
    nutritionist = n ? `${n.f} ${n.l}` : '';
  }
  return {
    id: plan.id,
    title: plan.title,
    notes: plan.notes,
    nutritionist,
    createdAt: plan.createdAt.toISOString(),
    days: plan.days.map((d) => {
      const meals = d.meals.map((m) => {
        const main = items(m.items);
        return {
          meal: m.meal,
          time: m.time ?? null,
          items: main,
          totals: sum(main.map((i) => i.macros)),
          alternatives: m.alternatives.map((alt) => {
            const a = items(alt);
            return { items: a, totals: sum(a.map((i) => i.macros)) };
          }),
        };
      });
      return { name: d.name, meals, totals: sum(meals.map((m) => m.totals)) };
    }),
  };
}

async function activePlan(ctx: AppCtx, userId: string) {
  const [plan] = await ctx.db
    .select()
    .from(mealPlans)
    .where(and(eq(mealPlans.userId, userId), eq(mealPlans.status, 'active')))
    .orderBy(desc(mealPlans.createdAt))
    .limit(1);
  return plan ?? null;
}

/** Media giornaliera del piano: è l'obiettivo mostrato nel diario. */
const dailyTarget = (v: MealPlanView): Macros | null => {
  if (!v.days.length) return null;
  const t = sum(v.days.map((d) => d.totals));
  const n = v.days.length;
  return { kcal: Math.round(t.kcal / n), protein: r1(t.protein / n), carbs: r1(t.carbs / n), fat: r1(t.fat / n) };
};

async function diaryDay(ctx: AppCtx, userId: string, day: string): Promise<FoodDiaryDay> {
  const rows = await ctx.db
    .select({ l: foodLogs, f: foods })
    .from(foodLogs)
    .innerJoin(foods, eq(foods.id, foodLogs.foodId))
    .where(and(eq(foodLogs.userId, userId), eq(foodLogs.day, day)))
    .orderBy(asc(foodLogs.createdAt));
  const entries = rows.map(({ l, f }) => ({ id: l.id, meal: l.meal, foodId: f.id, name: f.name, grams: Number(l.grams), macros: macrosOf(f, Number(l.grams)) }));
  entries.sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
  const plan = await activePlan(ctx, userId);
  return { day, entries, totals: sum(entries.map((e) => e.macros)), target: plan ? dailyTarget(await mealPlanView(ctx, plan)) : null };
}

export async function nutritionRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;
  const dayQuery = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

  /** Il nutrizionista che chiama, con l'albo verificato. */
  const nutritionist = async (req: FastifyRequest) => {
    const row = await currentTrainer(ctx, req);
    if (!canPrescribeNutrition(row.t))
      throw forbidden(
        'Il piano alimentare è riservato ai nutrizionisti con l’iscrizione all’albo verificata da BTECH',
        'nutrition_reserved',
      );
    return row;
  };

  /** Alimenti visibili: libreria BTECH più quelli aggiunti dal nutrizionista (il proprio, o quello che segue l'utente). */
  const visibleFoods = async (req: FastifyRequest) => {
    const auth = requireRole(req, 'user', 'personal_trainer');
    let owners: string[] = [];
    if (auth.role === 'personal_trainer') {
      const [t] = await db.select({ id: trainers.id }).from(trainers).where(eq(trainers.userId, auth.userId)).limit(1);
      owners = t ? [t.id] : [];
    } else owners = await linkedTrainerIds(db, auth.userId, ['nutritionist']);
    return owners.length ? or(isNull(foods.trainerId), inArray(foods.trainerId, owners)) : isNull(foods.trainerId);
  };

  app.get('/foods', async (req) => {
    const { q, category } = parse(z.object({ q: z.string().trim().max(60).optional(), category: z.enum(FOOD_CATEGORIES).optional() }), req.query);
    const rows = await db
      .select()
      .from(foods)
      .where(and(await visibleFoods(req), q ? ilike(foods.name, `%${q.replace(/[%_]/g, '')}%`) : undefined, category ? eq(foods.category, category) : undefined))
      .orderBy(asc(foods.name))
      .limit(300);
    return { foods: rows.map(foodView) };
  });

  app.post('/trainer/foods', async (req, reply) => {
    const { t } = await nutritionist(req);
    const input = parse(foodSchema, req.body);
    const [row] = await db
      .insert(foods)
      .values({ ...input, kcal: String(input.kcal), protein: String(input.protein), carbs: String(input.carbs), fat: String(input.fat), fiber: String(input.fiber), trainerId: t.id })
      .returning();
    return reply.code(201).send(foodView(row!));
  });

  /* ---------- Piano alimentare: lato nutrizionista ---------- */

  app.get('/trainer/clients/:linkId/meal-plan', async (req) => {
    await nutritionist(req);
    const { link } = await clientOfTrainer(ctx, req);
    const plan = await activePlan(ctx, link.userId);
    return { plan: plan ? await mealPlanView(ctx, plan) : null, days: plan?.days ?? null };
  });

  app.put('/trainer/clients/:linkId/meal-plan', async (req) => {
    const { t } = await nutritionist(req);
    const { auth, link, client } = await clientOfTrainer(ctx, req);
    const input = parse(mealPlanSchema, req.body);
    const ids = [...new Set(input.days.flatMap((d) => d.meals.flatMap((m) => [...m.items, ...m.alternatives.flat()].map((i) => i.foodId))))];
    const info = await foodMap(ctx, ids);
    if (ids.some((id) => !info.has(id) || (info.get(id)!.trainerId !== null && info.get(id)!.trainerId !== t.id)))
      throw badRequest('food_invalid', 'Uno degli alimenti non è disponibile');
    const days: MealPlanDays = input.days.map((d) => ({
      name: d.name,
      meals: d.meals.map((m) => ({ meal: m.meal, ...(m.time ? { time: m.time } : {}), items: m.items, alternatives: m.alternatives })),
    }));
    const plan = await db.transaction(async (tx) => {
      await tx.update(mealPlans).set({ status: 'archived' }).where(and(eq(mealPlans.userId, link.userId), eq(mealPlans.status, 'active')));
      const [p] = await tx.insert(mealPlans).values({ userId: link.userId, trainerId: t.id, title: input.title, notes: input.notes ?? null, days, createdAt: ctx.now() }).returning();
      return p!;
    });
    await track(db, 'piano_alimentare_assegnato', { userId: link.userId, trainerId: t.id, structureId: client.structureId }, { days: days.length });
    await audit(db, 'client.meal_plan_saved', { actorUserId: auth.userId, entity: 'user', entityId: link.userId, ip: req.ip });
    return { plan: await mealPlanView(ctx, plan) };
  });

  app.get('/trainer/clients/:linkId/food-diary', async (req) => {
    const { link } = await clientOfTrainer(ctx, req, { needsData: true });
    const { day } = parse(dayQuery.passthrough(), req.query);
    return diaryDay(ctx, link.userId, day ?? toDay(ctx.now()));
  });

  /* ---------- Lato utente ---------- */

  const me = (req: FastifyRequest) => requireRole(req, 'user').userId;
  const premiumOnly = async (userId: string) => {
    if (!(await hasPremium(ctx, userId))) throw forbidden('Piano alimentare e diario sono inclusi in Premium', 'premium_required');
  };

  app.get('/me/meal-plan', async (req) => {
    const userId = me(req);
    await premiumOnly(userId);
    const plan = await activePlan(ctx, userId);
    return { plan: plan ? await mealPlanView(ctx, plan) : null };
  });

  app.get('/me/food-diary', async (req) => {
    const userId = me(req);
    await premiumOnly(userId);
    const { day } = parse(dayQuery, req.query);
    return diaryDay(ctx, userId, day ?? toDay(ctx.now()));
  });

  app.post('/me/food-diary', async (req, reply) => {
    const userId = me(req);
    await premiumOnly(userId);
    const input = parse(foodLogSchema, req.body);
    assertPlausibleDay(input.day, ctx.now());
    const [f] = await db.select().from(foods).where(and(eq(foods.id, input.foodId), await visibleFoods(req))).limit(1);
    if (!f) throw notFound('Alimento non trovato');
    await db.insert(foodLogs).values({ userId, day: input.day, meal: input.meal, foodId: f.id, grams: String(input.grams) });
    return reply.code(201).send(await diaryDay(ctx, userId, input.day));
  });

  app.delete('/me/food-diary/:id', async (req) => {
    const userId = me(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const [row] = await db.delete(foodLogs).where(and(eq(foodLogs.id, id), eq(foodLogs.userId, userId))).returning();
    if (!row) throw notFound('Voce non trovata');
    return diaryDay(ctx, userId, row.day);
  });
}
