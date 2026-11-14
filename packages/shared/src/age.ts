import { ADULT_AGE, MIN_AGE } from './constants';

/** Età in anni compiuti alla data indicata. `birthDate` in formato AAAA-MM-GG. */
export function ageOn(birthDate: string, on: Date = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  let age = on.getUTCFullYear() - y;
  const beforeBirthday = on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export type AgeBand = 'too_young' | 'minor' | 'adult';

/** Sotto i 14 anni non ci si può iscrivere; tra 14 e 17 serve il consenso di un genitore. */
export function ageBand(birthDate: string, on: Date = new Date()): AgeBand {
  const age = ageOn(birthDate, on);
  if (age < MIN_AGE) return 'too_young';
  if (age < ADULT_AGE) return 'minor';
  return 'adult';
}
