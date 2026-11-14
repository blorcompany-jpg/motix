/** Brand identity MOTIX – colori, caratteri e testi fissi. */
export const colors = {
  notte: '#0B1220',
  ardesia: '#13203A',
  blu: '#24365A',
  acqua: '#38D3EE',
  energia: '#B5E853',
  corallo: '#FF7A59',
  nebbia: '#A9B7CC',
  ghiaccio: '#EEF3FA',
  pietra: '#6F7F98',
  bianco: '#FFFFFF',
} as const;

export const fonts = { display: 'Sora', text: 'Inter' } as const;

export const radii = { sm: 12, md: 16, lg: 24, pill: 999 } as const;

export const brand = {
  name: 'MOTIX',
  wordmark: 'motix',
  payoff: 'Move. Measure. Rise.',
  payoffIt: 'Muoviti. Misura. Sali di livello.',
  company: 'BTECH S.r.l.',
  sensor: 'motix pod',
} as const;

/** Simbolo «X in movimento», viewBox 0 0 120 120. */
export const logoPaths = {
  under: 'M35 35 L51 51 M69 69 L85 85',
  rise: 'M31 89 C 50 76, 66 60, 80 40',
  dot: { cx: 92, cy: 25, r: 9 },
  strokeWidth: 15,
} as const;
