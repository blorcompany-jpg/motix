import { badRequest } from './errors';

/** Le date «di calendario» viaggiano come stringhe AAAA-MM-GG nel fuso dell'utente. */
const MS = 86_400_000;
const parse = (day: string) => Date.parse(`${day}T00:00:00Z`);

export const toDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => toDay(new Date(parse(day) + n * MS));
export const diffDays = (a: string, b: string) => Math.round((parse(a) - parse(b)) / MS);

/** Lunedì della settimana che contiene il giorno. */
export function mondayOf(day: string) {
  const dow = new Date(parse(day)).getUTCDay(); // 0 = domenica
  return addDays(day, -((dow + 6) % 7));
}

/** Il giorno indicato dal telefono deve essere compatibile con l'ora del server (±1 giorno per i fusi orari). */
export function assertPlausibleDay(day: string, now: Date) {
  if (Math.abs(diffDays(day, toDay(now))) > 1) throw badRequest('day_invalid', 'Data non valida: controlla data e ora del telefono');
  return day;
}
