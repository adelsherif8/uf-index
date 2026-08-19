/**
 * The contract. Every row is taken from UFIndexDataAutomationSandbox.xlsx —
 * Harini's sheet — where each carries "Website score N; audit score N;
 * lean mass X%". If this file and the sheet ever disagree, the sheet wins.
 *
 * Energy, sleep and body-feeling are recorded on every row but do not affect
 * the score, so they are set to mid values here. They are exercised by the
 * context-reading checks at the bottom.
 */
export interface SandboxCase {
  id: string; gender: 'male' | 'female';
  heightCm: number; neckCm: number; waistCm: number; hipCm: number;
  lean: number;   // lean mass % stated in the sheet
  score: number;  // Website score / audit score stated in the sheet
}

export const SANDBOX: SandboxCase[] = [
  { id: 'Demo 01',     gender: 'female', heightCm: 167, neckCm: 40, waistCm: 33,  hipCm: 101, lean: 98.50, score: 5 },
  { id: 'Demo 02',     gender: 'female', heightCm: 180, neckCm: 32, waistCm: 81,  hipCm: 95,  lean: 73.44, score: 2 },
  { id: 'Demo 03',     gender: 'female', heightCm: 166, neckCm: 30, waistCm: 81,  hipCm: 95,  lean: 68.87, score: 1 },
  { id: 'Demo 04',     gender: 'male',   heightCm: 175, neckCm: 33, waistCm: 89,  hipCm: 4,   lean: 76.58, score: 2 },
  { id: 'Demo 05',     gender: 'male',   heightCm: 177, neckCm: 48, waistCm: 84,  hipCm: 4,   lean: 92.92, score: 4 },
  { id: 'Demo 06',     gender: 'female', heightCm: 164, neckCm: 36, waistCm: 108, hipCm: 125, lean: 45.99, score: 1 },
  { id: 'Demo 07',     gender: 'female', heightCm: 166, neckCm: 34, waistCm: 91,  hipCm: 105, lean: 61.36, score: 1 },
  { id: 'Demo 08',     gender: 'female', heightCm: 153, neckCm: 43, waistCm: 115, hipCm: 124, lean: 42.95, score: 1 },
  { id: 'Demo 09',     gender: 'female', heightCm: 164, neckCm: 31, waistCm: 71,  hipCm: 94,  lean: 74.36, score: 2 },
  { id: 'Demo Client', gender: 'female', heightCm: 166, neckCm: 30, waistCm: 81,  hipCm: 95,  lean: 68.87, score: 1 },
];
