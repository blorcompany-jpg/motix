/** Giorno di calendario locale del telefono, in formato AAAA-MM-GG. */
export function today(now: Date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const parse = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Oggi», «Domani» oppure «Lunedì 16». */
export function dayLabel(day: string, now: Date = new Date()) {
  const diff = Math.round((parse(day).getTime() - parse(today(now)).getTime()) / 86_400_000);
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Domani';
  if (diff === -1) return 'Ieri';
  return cap(parse(day).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric' }));
}

export const shortDate = (day: string) => parse(day).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
export const longDate = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
export const weekdayInitial = (day: string) => parse(day).toLocaleDateString('it-IT', { weekday: 'narrow' }).toUpperCase();

export const liters = (ml: number) => `${(ml / 1000).toLocaleString('it-IT', { maximumFractionDigits: 2 })} L`;
export const kg = (n: number) => `${n.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg`;
