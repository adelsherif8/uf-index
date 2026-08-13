// ============================================================================
// The contract between the app and this backend.
//
// These are the 16 official cases from UF_Index_Test_Cases.xlsx, copied verbatim
// from the app's own test. If the server's engine and the app's engine ever
// disagree, this fails — and one of them is wrong before anything ships.
//
//     npm run test:scoring     →  must print 16/16
// ============================================================================
import { computeScore, scoreWho5, scorePss10, scorePsqi, type AssessmentInput }
  from '../supabase/functions/_shared/scoring.ts';

interface Case {
  id: string; p: string; g: 'M' | 'F';
  w: number; h: number; n: number; wa: number; hp: number;
  am: number; pm: number; bf: number; sq: number; sh: number;
  exp: number; band: string;
}

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
    rpeMorning: c.am, rpeAfternoon: c.pm, bodyFeeling: c.bf,
    sleepQuality: c.sq, sleepHours: c.sh,
  };
  const r = computeScore(input);
  const ok = r.score === c.exp && r.band === c.band;
  if (ok) pass++;
  else failures.push(`${c.id} ${c.p}: expected ${c.exp} ${c.band}, got ${r.score} ${r.band}`);
  console.log(`${ok ? '\u2713' : '\u2717'} ${c.id.padEnd(4)} ${c.p.padEnd(26)} \u2192 ${r.score} ${r.band}`);
}

console.log(`\n${pass}/${CASES.length} UF Index cases match`);

// ---- Index Plus instruments, checked against the app's own defaults --------
console.log('\nIndex Plus:');
const plusChecks: [string, number, number][] = [];

const who5 = scoreWho5([3, 3, 2, 3, 3]);
plusChecks.push(['WHO-5 scaled', who5.scaled, 56]);

const pss = scorePss10([1, 2, 2, 1, 2, 1, 2, 2, 1, 1]);
plusChecks.push(['PSS-10 total', pss.raw, 17]);

const psqi = scorePsqi({
  bedTime: '23:00', wakeTime: '06:30', latencyMin: 20, sleepHours: 7,
  freq: [1, 1, 2, 0, 0, 1, 1, 1, 0, 0], extra: [1, 0, 1, 1],
});
plusChecks.push(['PSQI global', psqi.raw, 5]);

let plusPass = 0;
for (const [name, got, want] of plusChecks) {
  const ok = got === want;
  if (ok) plusPass++;
  else failures.push(`${name}: expected ${want}, got ${got}`);
  console.log(`${ok ? '\u2713' : '\u2717'} ${name.padEnd(16)} \u2192 ${got}`);
}
console.log(`${plusPass}/${plusChecks.length} Plus checks match`);

if (failures.length) {
  console.error('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('\nAll green. The server engine agrees with the app.');
