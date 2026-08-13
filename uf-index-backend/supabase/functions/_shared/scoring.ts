// ============================================================================
// UF Index scoring — the server's copy.
//
// This MUST agree with the app's src/lib/scoring.ts, digit for digit. The
// contract between them is the 16 cases in UF_Index_Test_Cases.xlsx:
//     npm run test:scoring     →  must print 16/16
//
// The weights below are PLACEHOLDERS (formula_version "proto-1") pending UFAS
// sign-off. When the official formula lands:
//     1. change the body of computeScore()
//     2. bump FORMULA_VERSION
//     3. regenerate the expected values in the QA workbook
//     4. get back to 16/16 in BOTH the app and here
// Old rows keep their own formula_version, so nothing is silently rewritten.
// ============================================================================

export const FORMULA_VERSION = 'proto-1';

export type Band = 'Depleted' | 'Strained' | 'Balanced' | 'Energized' | 'Peak';

export interface AssessmentInput {
  gender: 'male' | 'female';
  weightKg: number;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm: number;
  rpeMorning: number;    // 1..5
  rpeAfternoon: number;  // 1..5
  bodyFeeling: number;   // 1..5
  sleepQuality: number;  // 1..5
  sleepHours: number;
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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function bandOf(score: number): Band {
  if (score < 2) return 'Depleted';
  if (score < 3) return 'Strained';
  if (score < 3.8) return 'Balanced';
  if (score < 4.5) return 'Energized';
  return 'Peak';
}

export function computeScore(i: AssessmentInput): ScoreResult {
  const log10 = Math.log10;

  // US Navy body-fat method, metric. waist-neck floored at 1cm so the log is defined.
  let bf: number;
  if (i.gender === 'male') {
    bf = 495 / (1.0324 - 0.19077 * log10(Math.max(i.waistCm - i.neckCm, 1))
              + 0.15456 * log10(i.heightCm)) - 450;
  } else {
    bf = 495 / (1.29579 - 0.35004 * log10(Math.max(i.waistCm + i.hipCm - i.neckCm, 1))
              + 0.221 * log10(i.heightCm)) - 450;
  }
  bf = clamp(bf, 3, 55);

  const ideal = i.gender === 'male' ? 15 : 23;
  const body = clamp(5 - Math.abs(bf - ideal) / 4, 1, 5);
  const energy = (i.rpeMorning + i.rpeAfternoon) / 2;
  const feel = i.bodyFeeling;
  const hoursScore = clamp(5 - Math.abs(i.sleepHours - 8) * 1.2, 1, 5);
  const sleep = 0.5 * i.sleepQuality + 0.5 * hoursScore;

  const score = Math.round((0.30 * body + 0.30 * energy + 0.25 * sleep + 0.15 * feel) * 10) / 10;

  return {
    score,
    bodyFatPct: Math.round(bf * 10) / 10,
    band: bandOf(score),
    formulaVersion: FORMULA_VERSION,
    pillars: [
      { name: 'Body composition', value: body, weight: '30%',
        note: `Estimated body fat ${Math.round(bf)}% from tape measurements (lean-mass basis).` },
      { name: 'Perceived energy', value: energy, weight: '30%',
        note: `Morning ${i.rpeMorning}/5, late afternoon ${i.rpeAfternoon}/5.` },
      { name: 'Sleep', value: sleep, weight: '25%',
        note: `${i.sleepHours} h continuous, waking rested ${i.sleepQuality}/5.` },
      { name: 'Body feeling', value: feel, weight: '15%',
        note: 'How satisfied they feel with their body right now.' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Index Plus — the official instruments, scored exactly as published.
// ---------------------------------------------------------------------------

/** PSS-10: items 4, 5, 7, 8 (1-indexed) are reverse scored. */
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
