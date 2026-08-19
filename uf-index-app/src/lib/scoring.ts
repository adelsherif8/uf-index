// UF Index scoring engine — formula_version "sandbox-1".
//
// Derived from UFIndexDataAutomationSandbox.xlsx, which is the authority. Every
// scored row there carries "Website score N; audit score N; lean mass X%", and
// reconstructing from those ten rows gives a formula that reproduces all ten:
//
//   1 · body fat from the US Navy tape formula
//   2 · the 1–5 score is the standard body-fat category for that sex
//
// Energy, sleep and body-feeling are NOT part of the score. They are collected,
// stored and shown as context, because the coach reads them and because they are
// what a future formula would use — but they do not move the number today.
//
// The one part not evidenced by the sandbox: no row scores 3, so the "fitness"
// band boundaries come from the standard category table rather than from data.
// Everything else is confirmed against all ten rows.
export const FORMULA_VERSION = 'sandbox-1';

export interface AssessmentInput {
  gender: 'male' | 'female';
  weightKg: number; heightCm: number; neckCm: number; waistCm: number; hipCm: number;
  rpeMorning: number; rpeAfternoon: number;   // 1–5
  bodyFeeling: number; sleepQuality: number;  // 1–5
  sleepHours: number;
  note?: string;
}
export interface Pillar { name: string; value: number; weight: string; note: string }
export interface ScoreResult {
  score: number; bodyFatPct: number; band: Band; pillars: Pillar[];
  formulaVersion: string;
}
export type Band = 'Depleted' | 'Strained' | 'Balanced' | 'Energized' | 'Peak';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function bandOf(s: number): Band {
  if (s < 2) return 'Depleted';
  if (s < 3) return 'Strained';
  if (s < 4) return 'Balanced';
  if (s < 5) return 'Energized';
  return 'Peak';
}

/** Body fat, US Navy tape method. */
export function bodyFat(i: AssessmentInput): number {
  const log10 = Math.log10;
  const bf = i.gender === 'male'
    ? 495 / (1.0324 - 0.19077 * log10(Math.max(i.waistCm - i.neckCm, 1)) + 0.15456 * log10(i.heightCm)) - 450
    : 495 / (1.29579 - 0.35004 * log10(Math.max(i.waistCm + i.hipCm - i.neckCm, 1)) + 0.221 * log10(i.heightCm)) - 450;
  return clamp(bf, 0, 75);
}

/**
 * The 1–5 index. Standard body-fat categories, which differ by sex — which is
 * why a man at 23% and a woman at 27% both land on 2.
 */
export function indexFromBodyFat(gender: 'male' | 'female', bf: number): number {
  if (gender === 'male') {
    if (bf <= 5) return 5;    // essential
    if (bf <= 13) return 4;   // athletic
    if (bf <= 17) return 3;   // fitness
    if (bf <= 24) return 2;   // average
    return 1;                 // above average
  }
  if (bf <= 13) return 5;
  if (bf <= 20) return 4;
  if (bf <= 24) return 3;
  if (bf <= 31) return 2;
  return 1;
}

/**
 * The lean-mass percentages at which the score steps up, lowest first.
 * Derived from the same category table as indexFromBodyFat, so the chart and
 * the score can never disagree about where a boundary sits.
 */
export function leanThresholds(gender: 'male' | 'female'): { lean: number; score: number }[] {
  const bfEdges = gender === 'male' ? [24, 17, 13, 5] : [31, 24, 20, 13];
  return bfEdges.map((bf, idx) => ({ lean: 100 - bf, score: idx + 2 }));
}

export function computeScore(i: AssessmentInput): ScoreResult {
  const bf = bodyFat(i);
  const score = indexFromBodyFat(i.gender, bf);
  const leanPct = Math.round((100 - bf) * 100) / 100;

  // Context readings. Shown to the user and the coach, deliberately unweighted.
  const energy = (i.rpeMorning + i.rpeAfternoon) / 2;
  const hoursScore = clamp(5 - Math.abs(i.sleepHours - 8) * 1.2, 1, 5);
  const sleep = 0.5 * i.sleepQuality + 0.5 * hoursScore;

  return {
    score, bodyFatPct: Math.round(bf * 10) / 10, band: bandOf(score), formulaVersion: FORMULA_VERSION,
    pillars: [
      { name: 'Body composition', value: score, weight: 'Sets your score',
        note: `Body fat ${bf.toFixed(1)}% from your tape measurements — lean mass ${leanPct.toFixed(1)}%.` },
      { name: 'Perceived energy', value: energy, weight: 'Tracked',
        note: `Morning ${i.rpeMorning}/5, late afternoon ${i.rpeAfternoon}/5.` },
      { name: 'Sleep', value: sleep, weight: 'Tracked',
        note: `${i.sleepHours} h continuous, waking rested ${i.sleepQuality}/5.` },
      { name: 'Body feeling', value: i.bodyFeeling, weight: 'Tracked',
        note: 'How satisfied you feel with your body right now.' },
    ],
  };
}
