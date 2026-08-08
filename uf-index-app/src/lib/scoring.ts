// UF Index scoring engine — formula_version "proto-1".
// Mirrors the prototype exactly (datasheet-aligned, four pillars, no exercise).
// Swap the body of computeScore() when the official formula is signed off.
export const FORMULA_VERSION = 'proto-1';

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
  if (s < 3.8) return 'Balanced';
  if (s < 4.5) return 'Energized';
  return 'Peak';
}

export function computeScore(i: AssessmentInput): ScoreResult {
  const log10 = Math.log10;
  let bf: number;
  if (i.gender === 'male') {
    bf = 495 / (1.0324 - 0.19077 * log10(Math.max(i.waistCm - i.neckCm, 1)) + 0.15456 * log10(i.heightCm)) - 450;
  } else {
    bf = 495 / (1.29579 - 0.35004 * log10(Math.max(i.waistCm + i.hipCm - i.neckCm, 1)) + 0.221 * log10(i.heightCm)) - 450;
  }
  bf = clamp(bf, 3, 55);
  const ideal = i.gender === 'male' ? 15 : 23;
  const body = clamp(5 - Math.abs(bf - ideal) / 4, 1, 5);
  const energy = (i.rpeMorning + i.rpeAfternoon) / 2;
  const feel = i.bodyFeeling;
  const hoursScore = clamp(5 - Math.abs(i.sleepHours - 8) * 1.2, 1, 5);
  const sleep = 0.5 * i.sleepQuality + 0.5 * hoursScore;
  const score = Math.round((0.3 * body + 0.3 * energy + 0.25 * sleep + 0.15 * feel) * 10) / 10;
  return {
    score, bodyFatPct: Math.round(bf * 10) / 10, band: bandOf(score), formulaVersion: FORMULA_VERSION,
    pillars: [
      { name: 'Body composition', value: body, weight: '30%', note: `Estimated body fat ${Math.round(bf)}% from your tape measurements (lean-mass basis).` },
      { name: 'Perceived energy', value: energy, weight: '30%', note: `Morning ${i.rpeMorning}/5, late afternoon ${i.rpeAfternoon}/5.` },
      { name: 'Sleep', value: sleep, weight: '25%', note: `${i.sleepHours} h continuous, waking rested ${i.sleepQuality}/5.` },
      { name: 'Body feeling', value: feel, weight: '15%', note: 'How satisfied you feel with your body right now.' },
    ],
  };
}
