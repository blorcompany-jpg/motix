import { colors, radii } from '@motix/shared';

export { colors, radii };

/** Nomi dei caratteri caricati in `_layout.tsx`. */
export const font = {
  display: 'Sora_700Bold',
  displayHeavy: 'Sora_800ExtraBold',
  displaySemi: 'Sora_600SemiBold',
  text: 'Inter_400Regular',
  textMedium: 'Inter_500Medium',
  textSemi: 'Inter_600SemiBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
