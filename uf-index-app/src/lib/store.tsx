// App state + on-device persistence (AsyncStorage). Frontend-only:
// this store IS the "backend" until Sri's API replaces it behind the same shapes.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AssessmentInput, ScoreResult } from './scoring';
import { ageOn } from './dates';
import { syncNow } from './sync';

export interface Profile {
  name: string;
  email: string;
  phone: string;
  dob: string;        // YYYY-MM-DD — age is derived, so it stays correct as time passes
  organization: string;
  gender: 'male' | 'female';
}

export interface Consents { clause: boolean; coach: boolean; social: boolean }

export interface AssessmentRecord {
  id: string;          // also the client_id the server upserts on
  takenAt: string;     // ISO
  input: AssessmentInput;
  result: ScoreResult;
  synced?: boolean;    // false/undefined = still local only
}

export interface PlusResult {
  takenAt: string;
  who5: number; who5Band: string;
  pss: number; pssBand: string;
  psqi: number; psqiBand: string;
  good: [number, number, number];
}

export interface AppState {
  profile: Profile;
  consents: Consents;
  records: AssessmentRecord[];
  plus: PlusResult | null;
  plusHistory: PlusResult[];
  reminderOn: boolean;
  onboarded: boolean;
  lang: 'en' | 'hi';
  unitSystem: 'metric' | 'imperial';
  coachRequestedAt: string | null;
  plusTrialStartedAt: string | null;
  consoleMode: boolean;
}

const DEFAULT_STATE: AppState = {
  profile: { name: '', email: '', phone: '', dob: '', organization: '', gender: 'male' },
  consents: { clause: false, coach: false, social: false },
  records: [],
  plus: null,
  plusHistory: [],
  reminderOn: true,
  onboarded: false,
  lang: 'en',
  unitSystem: 'metric',
  coachRequestedAt: null,
  plusTrialStartedAt: null,
  consoleMode: false,
};

const KEY = 'uf-index-state-v1';
const SCHEMA_VERSION = 4;   // v3 added synced; v4 swapped profile.age for profile.dob

/** Accepts both the v1 legacy shape (bare state) and the versioned envelope. */
function parseStored(raw: string): Partial<AppState> {
  // v3 -> v4: an old install stored a plain age. Derive an approximate birth
  // date so nobody is stopped; it can be corrected in Settings and is off by at
  // most a year.
  const migrate = (st: Partial<AppState>): Partial<AppState> => {
    const p = st.profile as unknown as Record<string, unknown> | undefined;
    if (p && typeof p.age === 'string' && p.age && !p.dob) {
      const n = parseInt(p.age as string, 10);
      if (n > 0 && n < 120) p.dob = `${new Date().getFullYear() - n}-01-01`;
      delete p.age;
    }
    if (p && p.dob === undefined) p.dob = '';
    return st;
  };

  const obj = JSON.parse(raw);
  if (obj && typeof obj === 'object' && '__v' in obj) {
    return migrate(obj.state as Partial<AppState>);
  }
  return migrate(obj as Partial<AppState>); // legacy v1
}

interface StoreApi {
  state: AppState;
  ready: boolean;
  patch: (p: Partial<AppState>) => void;
  addRecord: (input: AssessmentInput, result: ScoreResult) => AssessmentRecord;
}

const Ctx = createContext<StoreApi>({
  state: DEFAULT_STATE, ready: false, patch: () => {}, addRecord: () => { throw new Error('store not ready'); },
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(raw => { if (raw) setState({ ...DEFAULT_STATE, ...parseStored(raw) }); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const persist = (next: AppState) => {
    setState(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify({ __v: SCHEMA_VERSION, state: next })).catch(() => {});
    }, 250);
  };

  const patch = (p: Partial<AppState>) => persist({ ...stateRef.current, ...p });

  // keep a ref so patch/addRecord always see the latest state
  const stateRef = useRef(state);
  stateRef.current = state;

  const addRecord = (input: AssessmentInput, result: ScoreResult): AssessmentRecord => {
    const rec: AssessmentRecord = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      takenAt: new Date().toISOString(),
      input, result,
    };
    const records = [...stateRef.current.records, rec];
    persist({ ...stateRef.current, records, onboarded: true });
    // Send it up in the background. Failing is fine — it stays marked unsynced
    // and the next launch retries. The user never waits on this.
    syncNow(records, next => patch({ records: next }), ageOn(stateRef.current.profile.dob))
      .catch(() => {});
    return rec;
  };

  return <Ctx.Provider value={{ state, ready, patch, addRecord }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

/** Consecutive weekly streak ending in the current week. */
/**
 * A returning check-in skips the profile step. Name, age, gender and
 * organization do not change week to week, and asking again every time makes a
 * two-minute check-in feel like a form. They stay editable in Settings.
 */
export const skipsProfile = (s: AppState): boolean =>
  s.records.length > 0 && !!s.profile.name.trim() && !!s.profile.dob.trim();

export { ageOn, dobFromInput, dobToInput } from './dates';

export function streakWeeks(records: AssessmentRecord[]): number {
  if (!records.length) return 0;
  const weekOf = (d: Date) => Math.floor(d.getTime() / (7 * 864e5));
  const weeks = new Set(records.map(r => weekOf(new Date(r.takenAt))));
  let streak = 0;
  let w = weekOf(new Date());
  while (weeks.has(w)) { streak++; w--; }
  return streak;
}
