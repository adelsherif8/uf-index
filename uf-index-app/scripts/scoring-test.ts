import { SANDBOX } from './sandbox-cases';
import { computeScore, bodyFat, FORMULA_VERSION, type AssessmentInput } from '../src/lib/scoring';

const mid = { rpeMorning: 3, rpeAfternoon: 3, bodyFeeling: 3, sleepQuality: 3, sleepHours: 7 };
let leanOk = 0, scoreOk = 0;
const fails: string[] = [];

console.log(`UF Index engine — formula_version "${FORMULA_VERSION}"`);
console.log('Contract: UFIndexDataAutomationSandbox.xlsx\n');
console.log('row            sex     lean% ours   sheet     score   sheet');

for (const c of SANDBOX) {
  const input: AssessmentInput = {
    gender: c.gender, weightKg: 70,
    heightCm: c.heightCm, neckCm: c.neckCm, waistCm: c.waistCm, hipCm: c.hipCm, ...mid,
  };
  const lean = 100 - bodyFat(input);
  const r = computeScore(input);
  const lOk = Math.abs(lean - c.lean) < 0.005;
  const sOk = r.score === c.score;
  if (lOk) leanOk++; else fails.push(`${c.id}: lean ${lean.toFixed(2)} vs sheet ${c.lean}`);
  if (sOk) scoreOk++; else fails.push(`${c.id}: score ${r.score} vs sheet ${c.score}`);
  console.log(
    `${c.id.padEnd(13)} ${c.gender[0].toUpperCase()}     ${lean.toFixed(2).padStart(8)}` +
    ` ${c.lean.toFixed(2).padStart(8)}   ${String(r.score).padStart(5)}` +
    ` ${String(c.score).padStart(7)}  ${lOk && sOk ? '' : '  <-- MISMATCH'}`);
}

// The other answers must be recorded even though they do not move the score.
const base: AssessmentInput = {
  gender: 'female', weightKg: 70, heightCm: 166, neckCm: 34, waistCm: 91, hipCm: 105, ...mid,
};
const low = computeScore({ ...base, rpeMorning: 1, rpeAfternoon: 1, sleepQuality: 1, sleepHours: 4, bodyFeeling: 1 });
const high = computeScore({ ...base, rpeMorning: 5, rpeAfternoon: 5, sleepQuality: 5, sleepHours: 8, bodyFeeling: 5 });
const sameScore = low.score === high.score;
const readingsDiffer =
  low.pillars[1].value !== high.pillars[1].value &&
  low.pillars[2].value !== high.pillars[2].value &&
  low.pillars[3].value !== high.pillars[3].value;

console.log(`\n${leanOk}/${SANDBOX.length} lean-mass figures match the sheet`);
console.log(`${scoreOk}/${SANDBOX.length} scores match the sheet`);
console.log(`${sameScore ? 'ok  ' : 'FAIL'} energy/sleep/feeling do not move the score`);
console.log(`${readingsDiffer ? 'ok  ' : 'FAIL'} energy/sleep/feeling are still recorded and reported`);

if (fails.length || !sameScore || !readingsDiffer) {
  console.log('\nFAILURES:'); fails.forEach(f => console.log('  ' + f));
  process.exit(1);
}
console.log('\nAll green. The engine agrees with Harini’s sheet.');
