import { describe, expect, it } from 'vitest';
import { EQUIPMENT, GOALS, LEVELS, LIMITATIONS, type Equipment, type Limitation } from '@motix/shared';
import { EXERCISES } from '../src/data/exercises';
import { buildPlan, type LibraryExercise, type PlannerInput } from '../src/services/planner';

const library: LibraryExercise[] = EXERCISES.map((e) => ({ ...e, id: e.slug }));
const byId = new Map(library.map((e) => [e.id, e]));
const base = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  goal: 'tone',
  level: 'intermediate',
  daysPerWeek: 3,
  equipment: [...EQUIPMENT],
  limitations: [],
  age: 30,
  library,
  lastLoads: new Map(),
  ...over,
});
const all = (plan: ReturnType<typeof buildPlan>) => plan.sessions.flatMap((s) => s.exercises.map((x) => byId.get(x.exerciseId)!));

describe('generatore del piano', () => {
  it('la libreria ha nomi unici e copre gli schemi di base anche a corpo libero', () => {
    expect(new Set(library.map((e) => e.id)).size).toBe(library.length);
    for (const pattern of ['squat', 'hinge', 'push_h', 'pull_h', 'core', 'cardio'])
      expect(library.some((e) => e.pattern === pattern && e.equipment.length === 0 && e.level === 'beginner'), pattern).toBe(true);
  });

  it('distribuisce le sedute in base ai giorni disponibili', () => {
    const expected: Record<number, number[]> = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
    for (const [days, offsets] of Object.entries(expected))
      expect(buildPlan(base({ daysPerWeek: Number(days) })).sessions.map((s) => s.dayOffset)).toEqual(offsets);
  });

  it('senza attrezzi propone solo esercizi a corpo libero', () => {
    const plan = buildPlan(base({ equipment: [] }));
    expect(plan.sessions.length).toBe(3);
    expect(all(plan).every((e) => e.equipment.length === 0)).toBe(true);
    expect(plan.rationale.join(' ')).toContain('corpo libero');
  });

  it('esclude gli esercizi che caricano le zone con limitazioni', () => {
    const plan = buildPlan(base({ limitations: ['knee', 'shoulder'] }));
    expect(all(plan).some((e) => e.contraindications.includes('knee') || e.contraindications.includes('shoulder'))).toBe(false);
    expect(plan.rationale.join(' ')).toMatch(/Ho escluso \d+ esercizi che caricano: ginocchio, spalla/);
  });

  it('a un principiante non propone esercizi di livello superiore', () => {
    expect(all(buildPlan(base({ level: 'beginner' }))).every((e) => e.level === 'beginner')).toBe(true);
  });

  it('tra 14 e 17 anni evita carichi massimali ed esercizi avanzati', () => {
    const plan = buildPlan(base({ goal: 'strength', level: 'advanced', age: 16 }));
    expect(all(plan).some((e) => e.level === 'advanced')).toBe(false);
    const reps = plan.sessions.flatMap((s) => s.exercises).filter((x) => byId.get(x.exerciseId)!.unit === 'reps').map((x) => x.reps);
    expect(Math.min(...reps)).toBeGreaterThanOrEqual(8);
    expect(plan.rationale.join(' ')).toContain('14 e 17 anni');
    // un adulto con lo stesso profilo lavora a basse ripetizioni
    const adult = buildPlan(base({ goal: 'strength', level: 'advanced', age: 30 }));
    expect(Math.min(...adult.sessions.flatMap((s) => s.exercises.map((x) => x.reps)))).toBe(5);
  });

  it('non ripete lo stesso esercizio nella stessa seduta', () => {
    for (const days of [1, 2, 3, 4, 5, 6])
      for (const s of buildPlan(base({ daysPerWeek: days, level: 'advanced' })).sessions)
        expect(new Set(s.exercises.map((x) => x.exerciseId)).size).toBe(s.exercises.length);
  });

  it('aumenta il carico di circa il 5% solo se le ripetizioni sono state completate', () => {
    const lastLoads = new Map([
      ['panca-piana', { loadKg: 60, hitTarget: true }],
      ['squat-bilanciere', { loadKg: 80, hitTarget: false }],
    ]);
    const plan = buildPlan(base({ goal: 'strength', lastLoads }));
    const find = (id: string) => plan.sessions.flatMap((s) => s.exercises).find((x) => x.exerciseId === id);
    expect(find('panca-piana')?.loadKg).toBe(63);
    expect(find('squat-bilanciere')?.loadKg).toBe(80);
  });

  it('rispetta sempre il filtro di sicurezza, con qualsiasi combinazione del questionario', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const goal of GOALS)
      for (const level of LEVELS)
        for (const days of [1, 2, 3, 4, 5, 6])
          for (const age of [15, 40]) {
            const equipment = EQUIPMENT.filter(() => rnd() > 0.5) as Equipment[];
            const limitations = LIMITATIONS.filter(() => rnd() > 0.7) as Limitation[];
            const plan = buildPlan(base({ goal, level, daysPerWeek: days, age, equipment, limitations }));
            const maxLevel = age < 18 ? Math.min(LEVELS.indexOf(level), 1) : LEVELS.indexOf(level);
            for (const ex of all(plan)) {
              expect(ex.equipment.every((eq) => (equipment as string[]).includes(eq)), `${ex.id} attrezzi`).toBe(true);
              expect(ex.contraindications.some((c) => (limitations as string[]).includes(c)), `${ex.id} limitazioni`).toBe(false);
              expect(LEVELS.indexOf(ex.level), `${ex.id} livello`).toBeLessThanOrEqual(maxLevel);
            }
            for (const x of plan.sessions.flatMap((s) => s.exercises)) {
              expect(x.sets).toBeGreaterThan(0);
              expect(x.reps).toBeGreaterThan(0);
            }
          }
  });
});
