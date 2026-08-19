// ============================================================================
// UF Index server scoring engine — formula_version "sandbox-1".
//
// THIS MUST STAY IDENTICAL TO uf-index-app/src/lib/scoring.ts.
// The app computes a score for the animation; the server recomputes it from the
// raw answers and that is the one stored. If they drift, users see one number
// and the coach sees another.
//
// Derived from UFIndexDataAutomationSandbox.xlsx, the authority. Every scored
// row there carries "Website score N; audit score N; lean mass X%", and this
// reproduces all ten:
//
//   1. body fat from the US Navy tape formula
//   2. the 1–5 score is the standard body-fat category for that sex
//
// Energy, sleep and body-feeling are stored and shown but do not move the score.
//
// When a new formula is signed off: change this file AND the app's, bump
// FORMULA_VERSION, regenerate the expected values in tests/scoring-test.ts, and
// backfill assessment_scores. Raw inputs are on every row, so nothing is lost.
// ============================================================================
export const FORMULA_VERSION = 'sandbox-1';

export type Band = 'Depleted' | 'Strained' | 'Balanced' | 'Energized' | 'Peak';

export interface AssessmentInput {
  gender: 'male' | 'female';
  weightKg: number;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm: number;
  rpeMorning: number;
  rpeAfternoon: number;
  bodyFeeling: number;
  sleepQuality: number;
  sleepHours: number;
  note?: string;
}

export interface Pillar {
  name: string;
  value: number;
  weight: string;
  note: string;
}

export interface ScoreResult {
  score: number;
  bodyFatPct: number;
  band: Band;
  pillars: Pillar[];
  formulaVersion: string;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function bandOf(score: number): Band {
  if (score < 2) return 'Depleted';
  if (score < 3) return 'Strained';
  if (score < 4) return 'Balanced';
  if (score < 5) return 'Energized';
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

/** Standard body-fat categories, which differ by sex. */
export function indexFromBodyFat(gender: 'male' | 'female', bf: number): number {
  if (gender === 'male') {
    if (bf <= 5) return 5;
    if (bf <= 13) return 4;
    if (bf <= 17) return 3;
    if (bf <= 24) return 2;
    return 1;
  }
  if (bf <= 13) return 5;
  if (bf <= 20) return 4;
  if (bf <= 24) return 3;
  if (bf <= 31) return 2;
  return 1;
}

export function computeScore(i: AssessmentInput): ScoreResult {
  const bf = bodyFat(i);
  const score = indexFromBodyFat(i.gender, bf);
  const leanPct = Math.round((100 - bf) * 100) / 100;

  const energy = (i.rpeMorning + i.rpeAfternoon) / 2;
  const hoursScore = clamp(5 - Math.abs(i.sleepHours - 8) * 1.2, 1, 5);
  const sleep = 0.5 * i.sleepQuality + 0.5 * hoursScore;

  return {
    score,
    bodyFatPct: Math.round(bf * 10) / 10,
    band: bandOf(score),
    formulaVersion: FORMULA_VERSION,
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

export const PSS10_REVERSED = new Set([4, 5, 7, 8]);

export function scoreWho5(answers: number[]): { raw: number; scaled: number; band: string } {
  const raw = answers.reduce((a, b) => a + b, 0);      // 0..25
  const scaled = raw * 4;                              // 0..100
  const band = scaled >= 76 ? 'Excellent'
             : scaled >= 51 ? 'Good'
             : scaled >= 29 ? 'Low' : 'Very low';
  return { raw, scaled, band };
}

export function scorePss10(answers: number[]): { raw: number; scaled: number; band: string } {
  const raw = answers.reduce(
    (sum, v, idx) => sum + (PSS10_REVERSED.has(idx + 1) ? 4 - v : v), 0);   // 0..40
  const band = raw <= 13 ? 'Low stress' : raw <= 26 ? 'Moderate' : 'High stress';
  return { raw, scaled: raw, band };
}

export interface PsqiInput {
  bedTime: string;       // 'HH:MM'
  wakeTime: string;      // 'HH:MM'
  latencyMin: number;    // minutes to fall asleep
  sleepHours: number;    // actual hours slept
  freq: number[];        // 10 items, Q5 a..j, each 0..3
  extra: number[];       // 4 items: quality, medication, staying awake, enthusiasm — each 0..3
}

/** PSQI global score: the seven official components, summed 0..21. */
export function scorePsqi(p: PsqiInput): {
  raw: number; scaled: number; band: string; components: number[];
} {
  const toMin = (s: string) => {
    const [h, m] = (s || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  let inBed = (((toMin(p.wakeTime) - toMin(p.bedTime)) + 1440) % 1440) / 60;
  if (!inBed) inBed = p.sleepHours || 1;

  const c1 = p.extra[0];                                                   // subjective quality
  const latPts = p.latencyMin <= 15 ? 0 : p.latencyMin <= 30 ? 1 : p.latencyMin <= 60 ? 2 : 3;
  const c2 = Math.ceil((latPts + p.freq[0]) / 2);                          // latency
  const c3 = p.sleepHours > 7 ? 0 : p.sleepHours >= 6 ? 1 : p.sleepHours >= 5 ? 2 : 3;  // duration
  const eff = inBed > 0 ? (p.sleepHours / inBed) * 100 : 0;
  const c4 = eff >= 85 ? 0 : eff >= 75 ? 1 : eff >= 65 ? 2 : 3;            // efficiency
  const dist = p.freq.slice(1).reduce((a, b) => a + b, 0);                 // disturbances, 0..27
  const c5 = dist === 0 ? 0 : dist <= 9 ? 1 : dist <= 18 ? 2 : 3;
  const c6 = p.extra[1];                                                   // medication
  const day = p.extra[2] + p.extra[3];
  const c7 = day === 0 ? 0 : day <= 2 ? 1 : day <= 4 ? 2 : 3;              // daytime dysfunction

  const raw = c1 + c2 + c3 + c4 + c5 + c6 + c7;                            // 0..21
  const band = raw <= 5 ? 'Good sleeper' : raw <= 10 ? 'Fair' : 'Poor';
  return { raw, scaled: raw, band, components: [c1, c2, c3, c4, c5, c6, c7] };
}
