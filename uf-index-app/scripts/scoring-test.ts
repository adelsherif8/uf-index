// The 16 official QA cases from UF_Index_Test_Cases.xlsx, asserted against src/lib/scoring.ts.
// Same rule as Sri's backend: done = 16/16 green. Run: npm run test:scoring
import { computeScore, AssessmentInput } from '../src/lib/scoring';

interface Case { id: string; p: string; g: 'M' | 'F'; w: number; h: number; n: number; wa: number; hp: number;
  am: number; pm: number; bf: number; sq: number; sh: number; exp: number; band: string }

const CASES: Case[] = [
  { id: 'T01', p: 'Baseline male', g: 'M', w: 82, h: 178, n: 38, wa: 86, hp: 98, am: 3, pm: 2, bf: 3, sq: 3, sh: 7, exp: 3.4, band: 'Balanced' },
  { id: 'T02', p: 'Baseline female', g: 'F', w: 65, h: 165, n: 32, wa: 74, hp: 96, am: 3, pm: 3, bf: 3, sq: 3, sh: 7.5, exp: 3.4, band: 'Balanced' },
  { id: 'T03', p: 'Best case male', g: 'M', w: 78, h: 180, n: 39, wa: 82, hp: 95, am: 5, pm: 5, bf: 5, sq: 5, sh: 8, exp: 4.8, band: 'Peak' },
  { id: 'T04', p: 'Worst case male', g: 'M', w: 110, h: 170, n: 40, wa: 118, hp: 110, am: 1, pm: 1, bf: 1, sq: 1, sh: 4, exp: 1.0, band: 'Depleted' },
  { id: 'T05', p: 'Best case female', g: 'F', w: 58, h: 168, n: 31, wa: 68, hp: 94, am: 5, pm: 5, bf: 5, sq: 5, sh: 8, exp: 5.0, band: 'Peak' },
  { id: 'T06', p: 'Worst case female', g: 'F', w: 95, h: 158, n: 36, wa: 102, hp: 124, am: 1, pm: 1, bf: 1, sq: 1, sh: 4, exp: 1.0, band: 'Depleted' },
  { id: 'T07', p: 'Band boundary low', g: 'M', w: 95, h: 175, n: 40, wa: 102, hp: 104, am: 2, pm: 2, bf: 3, sq: 3, sh: 6, exp: 2.3, band: 'Strained' },
  { id: 'T08', p: 'Balanced/Energized edge', g: 'M', w: 80, h: 178, n: 38, wa: 85, hp: 97, am: 4, pm: 4, bf: 4, sq: 4, sh: 7.5, exp: 4.2, band: 'Energized' },
  { id: 'T09', p: 'Oversleep 11 h', g: 'M', w: 82, h: 178, n: 38, wa: 86, hp: 98, am: 3, pm: 2, bf: 3, sq: 3, sh: 11, exp: 3.1, band: 'Balanced' },
  { id: 'T10', p: 'Short sleep 5 h', g: 'M', w: 82, h: 178, n: 38, wa: 86, hp: 98, am: 3, pm: 2, bf: 3, sq: 3, sh: 5, exp: 3.1, band: 'Balanced' },
  { id: 'T11', p: 'Body-feeling isolate (5)', g: 'M', w: 82, h: 178, n: 38, wa: 86, hp: 98, am: 3, pm: 2, bf: 5, sq: 3, sh: 7, exp: 3.7, band: 'Balanced' },
  { id: 'T12', p: 'Sleep-quality isolate (5)', g: 'M', w: 82, h: 178, n: 38, wa: 86, hp: 98, am: 3, pm: 2, bf: 3, sq: 5, sh: 7, exp: 3.6, band: 'Balanced' },
  { id: 'T13', p: 'Very lean male', g: 'M', w: 62, h: 182, n: 38, wa: 70, hp: 88, am: 4, pm: 4, bf: 4, sq: 4, sh: 8, exp: 3.5, band: 'Balanced' },
  { id: 'T14', p: 'Waist ≤ neck crash test', g: 'M', w: 60, h: 175, n: 40, wa: 39, hp: 90, am: 3, pm: 3, bf: 3, sq: 3, sh: 8, exp: 3.0, band: 'Balanced' },
  { id: 'T15', p: 'Quality 5 but 4 h sleep', g: 'M', w: 82, h: 178, n: 38, wa: 86, hp: 98, am: 3, pm: 2, bf: 3, sq: 5, sh: 4, exp: 3.3, band: 'Balanced' },
  { id: 'T16', p: 'Energy floor isolate', g: 'M', w: 82, h: 178, n: 38, wa: 86, hp: 98, am: 1, pm: 1, bf: 3, sq: 3, sh: 7, exp: 2.9, band: 'Strained' },
];

let pass = 0;
const failures: string[] = [];
for (const c of CASES) {
  const input: AssessmentInput = {
    gender: c.g === 'M' ? 'male' : 'female',
    weightKg: c.w, heightCm: c.h, neckCm: c.n, waistCm: c.wa, hipCm: c.hp,
    rpeMorning: c.am, rpeAfternoon: c.pm, bodyFeeling: c.bf, sleepQuality: c.sq, sleepHours: c.sh,
  };
  const r = computeScore(input);
  const ok = r.score === c.exp && r.band === c.band;
  if (ok) pass++;
  else failures.push(`${c.id} ${c.p}: expected ${c.exp} ${c.band}, got ${r.score} ${r.band}`);
  console.log(`${ok ? '✓' : '✗'} ${c.id} ${c.p} → ${r.score} ${r.band}`);
}
console.log(`\n${pass}/${CASES.length} cases match`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
