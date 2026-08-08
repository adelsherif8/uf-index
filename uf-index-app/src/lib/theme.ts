// UF Index — locked brand palette. ONLY these four bases, ever.
export const C = {
  auburn: '#741610',
  gold: '#D29133',
  black: '#0D0D0D',
  white: '#FFFFFF',
  // sanctioned derivatives (alpha of the four bases only)
  auburn50: 'rgba(116,22,16,0.5)',
  auburn40: 'rgba(116,22,16,0.4)',
  auburn24: 'rgba(116,22,16,0.24)',
  gold35: 'rgba(210,145,51,0.35)',
  gold13: 'rgba(210,145,51,0.13)',
  white73: 'rgba(255,255,255,0.45)',
  whiteA6: 'rgba(255,255,255,0.65)',
} as const;

export const FONT = {
  display: 'Fraunces_600SemiBold',
  ui: 'InstrumentSans_400Regular',
  uiMedium: 'InstrumentSans_500Medium',
  uiSemiBold: 'InstrumentSans_600SemiBold',
} as const;
