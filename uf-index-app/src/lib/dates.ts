// Birth-date maths. Deliberately free of React and React Native imports so it
// can be unit-tested on its own — see scripts/dates-test.ts.
/**
 * Age on a given date, from a YYYY-MM-DD birth date. Storing the birth date
 * rather than the age means it is right forever — an age typed once is wrong
 * within a year, and every past check-in keeps the age the person actually was.
 */
export function ageOn(dob: string, when: Date = new Date()): string {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return '';
  let age = when.getFullYear() - d.getFullYear();
  const m = when.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && when.getDate() < d.getDate())) age--;
  return age > 0 && age < 120 ? String(age) : '';
}

/** DD/MM/YYYY as typed by a person -> YYYY-MM-DD. Empty string if not a real date. */
export function dobFromInput(v: string): string {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if (isNaN(d.getTime()) || d.getMonth() + 1 !== +mm || d.getDate() !== +dd) return '';
  return `${yyyy}-${mm}-${dd}`;
}

/** YYYY-MM-DD -> DD/MM/YYYY for display. */
export const dobToInput = (dob: string): string => {
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};


/** Monday-based week number, so a week runs Mon–Sun as the copy promises. */
export const weekOf = (d: Date): number =>
  Math.floor((d.getTime() - (d.getDay() === 0 ? 6 : d.getDay() - 1) * 864e5) / (7 * 864e5));


/** Days until the week rolls over on Monday. */
export function daysUntilUnlock(now: Date = new Date()): number {
  const dow = now.getDay();               // 0 = Sunday
  return dow === 0 ? 1 : 8 - dow;
}

