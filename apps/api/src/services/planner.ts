/**
 * Generatore del piano di allenamento, versione a regole (sezione 8.6: «avvio senza dati»).
 *
 * Selezione → prescrizione → filtro di sicurezza, tutto con regole esplicite e verificabili.
 * Quando il motore AI (services/ai) sarà pronto, sostituirà `buildPlan` mantenendo la stessa interfaccia.
 */
import {
  EQUIPMENT_LABELS,
  GOAL_LABELS,
  LEVELS,
  LIMITATION_LABELS,
  type Equipment,
  type Goal,
  type Level,
  type Limitation,
} from '@motix/shared';
import type { Pattern } from '../data/exercises';

export interface LibraryExercise {
  id: string;
  name: string;
  pattern: string;
  level: Level;
  equipment: string[];
  contraindications: string[];
  loadable: boolean;
  unit: string;
  muscles: string[];
}

export interface PlannerInput {
  goal: Goal;
  level: Level;
  daysPerWeek: number;
  equipment: Equipment[];
  limitations: Limitation[];
  age: number | null;
  library: LibraryExercise[];
  /** Ultimo carico usato per esercizio e se l'utente ha completato tutte le ripetizioni previste. */
  lastLoads: Map<string, { loadKg: number; hitTarget: boolean }>;
}

export interface PlannedExercise {
  exerciseId: string;
  sets: number;
  reps: number;
  restSeconds: number;
  loadKg: number | null;
}

export interface PlannedSession {
  title: string;
  dayOffset: number;
  exercises: PlannedExercise[];
}

interface Template {
  title: string;
  base: Pattern[];
  extras: Pattern[];
}

const FULL_A: Template = { title: 'Total body A', base: ['squat', 'push_h', 'pull_h', 'hinge', 'core'], extras: ['push_v', 'glutes'] };
const FULL_B: Template = { title: 'Total body B', base: ['lunge', 'push_v', 'pull_v', 'glutes', 'core'], extras: ['push_h', 'pull_h'] };
const FULL_C: Template = { title: 'Total body C', base: ['squat', 'pull_h', 'push_h', 'hinge', 'core'], extras: ['pull_v', 'calves'] };
const UPPER: Template = { title: 'Parte alta', base: ['push_h', 'pull_h', 'push_v', 'pull_v', 'core'], extras: ['biceps', 'triceps'] };
const LOWER: Template = { title: 'Parte bassa', base: ['squat', 'hinge', 'lunge', 'glutes', 'core'], extras: ['calves', 'squat'] };
const PUSH: Template = { title: 'Spinta', base: ['push_h', 'push_v', 'push_h', 'triceps', 'core'], extras: ['push_v', 'triceps'] };
const PULL: Template = { title: 'Tirata', base: ['pull_v', 'pull_h', 'pull_h', 'biceps', 'core'], extras: ['pull_v', 'biceps'] };
const LEGS: Template = { title: 'Gambe', base: ['squat', 'hinge', 'lunge', 'glutes', 'calves'], extras: ['core', 'squat'] };

const SPLITS: Record<number, { templates: Template[]; offsets: number[]; label: string }> = {
  1: { templates: [FULL_A], offsets: [0], label: 'una seduta completa per tutto il corpo' },
  2: { templates: [FULL_A, FULL_B], offsets: [0, 3], label: 'due sedute total body, con esercizi diversi' },
  3: { templates: [FULL_A, FULL_B, FULL_C], offsets: [0, 2, 4], label: 'tre sedute total body a giorni alterni' },
  4: { templates: [UPPER, LOWER, UPPER, LOWER], offsets: [0, 1, 3, 4], label: 'parte alta e parte bassa, due volte ciascuna' },
  5: { templates: [PUSH, PULL, LEGS, UPPER, LOWER], offsets: [0, 1, 2, 4, 5], label: 'spinta, tirata e gambe, più una seduta alta e una bassa' },
  6: { templates: [PUSH, PULL, LEGS, PUSH, PULL, LEGS], offsets: [0, 1, 2, 3, 4, 5], label: 'spinta, tirata e gambe, due volte ciascuna' },
};

/** Se per uno schema di movimento non c'è nessun esercizio adatto, si ripiega su uno schema vicino. */
const FALLBACK: Partial<Record<Pattern, Pattern>> = {
  pull_v: 'pull_h',
  push_v: 'push_h',
  glutes: 'hinge',
  lunge: 'squat',
  biceps: 'pull_h',
  triceps: 'push_h',
  calves: 'core',
};

const ACCESSORY: Pattern[] = ['core', 'glutes', 'biceps', 'triceps', 'calves'];

const GOAL_NOTES: Record<Goal, string> = {
  lose_weight: 'ripetizioni alte e recuperi brevi tengono alto il dispendio, con un finale di cardio',
  tone: 'ripetizioni medie con recuperi di un minuto, per lavorare su tutti i gruppi muscolari',
  strength: 'poche ripetizioni con carichi più alti e recuperi lunghi sugli esercizi principali',
  endurance: 'ripetizioni alte, recuperi molto brevi e un finale di cardio',
  health: 'volume moderato e recuperi comodi, per muoversi meglio e con continuità',
};

const levelRank = (l: Level) => LEVELS.indexOf(l);
const roundHalf = (n: number) => Math.round(n * 2) / 2;

function prescription(goal: Goal, level: Level, minor: boolean, ex: LibraryExercise, pattern: Pattern) {
  if (ex.unit === 'minutes') return { sets: 1, reps: goal === 'lose_weight' || goal === 'endurance' ? 15 : 10, rest: 0 };
  if (ex.unit === 'seconds') return { sets: 3, reps: level === 'beginner' ? 20 : level === 'intermediate' ? 30 : 45, rest: 45 };
  if (pattern === 'cardio') return { sets: 3, reps: level === 'advanced' ? 15 : 20, rest: 45 };
  if (ACCESSORY.includes(pattern)) return { sets: 3, reps: goal === 'strength' ? 12 : 15, rest: 45 };
  switch (goal) {
    case 'strength':
      // Tra 14 e 17 anni niente carichi massimali: si resta su ripetizioni medie.
      if (minor) return { sets: 3, reps: 10, rest: 90 };
      return { sets: level === 'beginner' ? 3 : 4, reps: level === 'advanced' ? 5 : 6, rest: 150 };
    case 'tone':
      return { sets: 3, reps: 12, rest: 60 };
    case 'lose_weight':
      return { sets: 3, reps: 15, rest: 45 };
    case 'endurance':
      return { sets: 3, reps: 18, rest: 30 };
    default:
      return { sets: level === 'beginner' ? 2 : 3, reps: 10, rest: 75 };
  }
}

export function buildPlan(input: PlannerInput): { sessions: PlannedSession[]; rationale: string[] } {
  const days = Math.min(6, Math.max(1, input.daysPerWeek));
  const split = SPLITS[days]!;
  const minor = input.age !== null && input.age < 18;
  // Tra 14 e 17 anni si escludono gli esercizi di livello avanzato.
  const maxLevel = minor ? Math.min(levelRank(input.level), levelRank('intermediate')) : levelRank(input.level);

  // Filtro di sicurezza: livello, attrezzi disponibili, limitazioni dichiarate.
  const excludedForLimitations = input.library.filter((ex) => ex.contraindications.some((c) => input.limitations.includes(c as Limitation)));
  const allowed = input.library.filter(
    (ex) =>
      levelRank(ex.level) <= maxLevel &&
      ex.equipment.every((eq) => input.equipment.includes(eq as Equipment)) &&
      !excludedForLimitations.includes(ex),
  );

  const preferLoaded = input.goal === 'strength' || input.goal === 'tone';
  const byPattern = new Map<string, LibraryExercise[]>();
  for (const ex of allowed) {
    const list = byPattern.get(ex.pattern) ?? [];
    list.push(ex);
    byPattern.set(ex.pattern, list);
  }
  for (const list of byPattern.values())
    list.sort(
      (a, b) =>
        Number(preferLoaded ? b.loadable : a.loadable) - Number(preferLoaded ? a.loadable : b.loadable) ||
        levelRank(b.level) - levelRank(a.level) ||
        a.name.localeCompare(b.name),
    );

  const cursor = new Map<string, number>();
  const pick = (pattern: Pattern, used: Set<string>): { ex: LibraryExercise; pattern: Pattern } | null => {
    for (const p of [pattern, FALLBACK[pattern]]) {
      if (!p) continue;
      const list = (byPattern.get(p) ?? []).filter((ex) => !used.has(ex.id));
      if (!list.length) continue;
      const i = cursor.get(p) ?? 0;
      cursor.set(p, i + 1);
      return { ex: list[i % list.length]!, pattern: p };
    }
    return null;
  };

  const count = input.level === 'beginner' ? 5 : input.level === 'intermediate' ? 6 : 7;
  const wantsCardio = input.goal === 'lose_weight' || input.goal === 'endurance' || input.goal === 'health';
  let adapted = false;

  const sessions = split.templates.map((tpl, i) => {
    const used = new Set<string>();
    const planned: PlannedExercise[] = [];
    const add = (pattern: Pattern) => {
      const hit = pick(pattern, used);
      if (!hit) return false;
      used.add(hit.ex.id);
      const rx = prescription(input.goal, input.level, minor, hit.ex, hit.pattern);
      let loadKg: number | null = null;
      const last = input.lastLoads.get(hit.ex.id);
      if (hit.ex.loadable && last) {
        // Progressione: +5% circa se l'ultima volta sono state completate tutte le ripetizioni.
        loadKg = last.hitTarget ? Math.max(last.loadKg + 0.5, roundHalf(last.loadKg * 1.05)) : last.loadKg;
        adapted = true;
      }
      planned.push({ exerciseId: hit.ex.id, sets: rx.sets, reps: rx.reps, restSeconds: rx.rest, loadKg });
      return true;
    };
    // Se uno schema non ha esercizi adatti (attrezzi o limitazioni), il suo posto passa al successivo.
    let filled = 0;
    for (const pattern of [...tpl.base, ...tpl.extras]) {
      if (filled >= count) break;
      if (add(pattern)) filled += 1;
    }
    if (wantsCardio) add('cardio');
    return { title: tpl.title, dayOffset: split.offsets[i]!, exercises: planned };
  });

  const rationale = [
    `Obiettivo «${GOAL_LABELS[input.goal]}»: ${GOAL_NOTES[input.goal]}.`,
    `${days === 1 ? 'Un giorno' : `${days} giorni`} a settimana: ${split.label}.`,
    input.level === 'beginner'
      ? 'Livello principiante: esercizi semplici da imparare e poche serie, per costruire la tecnica.'
      : input.level === 'intermediate'
        ? 'Livello intermedio: più esercizi per seduta e varianti con sovraccarico.'
        : 'Livello avanzato: sedute più lunghe, esercizi complessi e più volume.',
    input.equipment.length
      ? `Usa solo gli attrezzi che hai indicato: ${input.equipment.map((eq) => EQUIPMENT_LABELS[eq].toLowerCase()).join(', ')}.`
      : 'Non hai indicato attrezzi: il piano è tutto a corpo libero.',
  ];
  if (input.limitations.length)
    rationale.push(
      `Ho escluso ${excludedForLimitations.length} esercizi che caricano: ${input.limitations.map((l) => LIMITATION_LABELS[l].toLowerCase()).join(', ')}.`,
    );
  if (minor) rationale.push('Tra 14 e 17 anni il piano evita i carichi massimali e gli esercizi di livello avanzato.');
  if (adapted) rationale.push('I carichi partono dall’ultima seduta: dove hai completato tutte le ripetizioni sono saliti di circa il 5%.');
  rationale.push('MOTIX non sostituisce il parere del medico: se senti dolore, fermati e chiedi a un professionista.');

  return { sessions: sessions.filter((s) => s.exercises.length > 0), rationale };
}

/** Durata indicativa di una seduta, riscaldamento compreso. */
export function estimateMinutes(items: Array<{ sets: number; reps: number; restSeconds: number; unit: string }>) {
  let seconds = 5 * 60;
  for (const it of items) {
    const work = it.unit === 'minutes' ? it.reps * 60 : it.unit === 'seconds' ? it.reps : it.reps * 3;
    seconds += it.sets * (work + it.restSeconds) + 60;
  }
  return Math.round(seconds / 60 / 5) * 5;
}
