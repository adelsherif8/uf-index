// ============================================================================
// The connection to the backend (uf-index-backend/).
//
// Deliberately optional. If no credentials are configured — which is the case
// today, and will stay the case for guest users — every function here no-ops
// and the app behaves exactly as it does now: fully offline, local storage only.
//
// To switch it on, put these in .env (see .env.example):
//   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
//
// The anon key is safe in the app — that is what RLS is for. The service-role
// key must NEVER appear here; it bypasses RLS entirely.
// ============================================================================
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AssessmentInput, ScoreResult } from './scoring';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True once a Supabase project is wired up. Until then the app is local-only. */
export const isConfigured = (): boolean => !!(URL && ANON);

export const supabase: SupabaseClient | null = isConfigured()
  ? createClient(URL!, ANON!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/** Signed in? Guests and offline-only installs return false. */
export async function isSignedIn(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ---------------------------------------------------------------- auth -----

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Backend not configured');
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Backend not configured');
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** Written at signup — DPDP wants the version and timestamp on record. */
export async function recordConsents(
  consents: { clause: boolean; coach: boolean; social: boolean },
  policyVersion = 'privacy-v1.1',
): Promise<void> {
  if (!supabase) return;
  const userId = await currentUserId();
  if (!userId) return;
  await supabase.from('user_consents').insert([
    { user_id: userId, consent_type: 'health_data_processing', granted: consents.clause, policy_version: policyVersion },
    { user_id: userId, consent_type: 'coach_visibility',       granted: consents.coach,  policy_version: policyVersion },
    { user_id: userId, consent_type: 'marketing',              granted: consents.social, policy_version: policyVersion },
  ]);
}

// ------------------------------------------------------------ profile -----

/**
 * Mirror the on-device profile into `profiles`.
 * Age is deliberately not stored here — the schema keeps `date_of_birth`, and
 * age is captured per check-in as `age_at_time`, which is the honest thing to
 * do when someone's age changes between assessments.
 */
export async function saveProfile(p: {
  name?: string; gender?: string; organization?: string;
  locale?: string; unitSystem?: string;
}): Promise<void> {
  if (!supabase) return;
  const userId = await currentUserId();
  if (!userId) return;
  await supabase.from('profiles').upsert({
    id: userId,
    full_name: p.name || null,
    gender: p.gender || null,
    organization: p.organization || null,
    locale: p.locale,
    unit_system: p.unitSystem,
  });
}

/** Reminder preferences, kiosk mode, trial start — the things a new phone should inherit. */
export async function saveSettings(sx: {
  reminderEnabled?: boolean; consoleMode?: boolean; plusTrialStartedAt?: string | null;
}): Promise<void> {
  if (!supabase) return;
  const userId = await currentUserId();
  if (!userId) return;
  const row: Record<string, unknown> = { user_id: userId };
  if (sx.reminderEnabled !== undefined) row.reminder_enabled = sx.reminderEnabled;
  if (sx.consoleMode !== undefined) row.console_mode = sx.consoleMode;
  if (sx.plusTrialStartedAt !== undefined) row.plus_trial_started_at = sx.plusTrialStartedAt;
  await supabase.from('user_settings').upsert(row);
}

// ---------------------------------------------------------------- plus -----

/**
 * Start the Plus free trial. Idempotent and enforced server-side — one trial
 * per account, so reinstalling the app no longer grants a fresh one.
 */
export async function startPlusTrial(): Promise<{ trial_ends_at?: string; already_started?: boolean } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('start_plus_trial', { trial_days: 14 });
  if (error) return null;
  return data as { trial_ends_at?: string; already_started?: boolean };
}

// -------------------------------------------------------- coach calls -----

/** "Request my coach call" — a real row a coach can pick up, not just local state. */
export async function requestCall(): Promise<boolean> {
  if (!supabase) return true;            // local-only build: the button still works
  const userId = await currentUserId();
  if (!userId) return true;              // guest: stays on the phone
  const { error } = await supabase.from('call_requests').insert({ user_id: userId, status: 'requested' });
  return !error;
}

// --------------------------------------------------------- assessments -----

export interface RemoteScore {
  id: string;
  client_id: string;
  score: number;
  band: string;
  bodyFatPct: number;
  formulaVersion: string;
}

/**
 * Send one check-in. The server stores the raw answers and computes the score —
 * the client never sends a score, because it can't be trusted to.
 * Idempotent: the same client_id upserts rather than duplicating.
 */
export async function postAssessment(
  clientId: string,
  input: AssessmentInput,
  takenAt: string,
  age?: string,
): Promise<RemoteScore | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('assessments', {
    body: {
      client_id: clientId,
      taken_at: takenAt,
      age_at_time: age ? parseInt(age, 10) : undefined,
      note: input.note,
      gender: input.gender,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      neckCm: input.neckCm,
      waistCm: input.waistCm,
      hipCm: input.hipCm,
      rpeMorning: input.rpeMorning,
      rpeAfternoon: input.rpeAfternoon,
      bodyFeeling: input.bodyFeeling,
      sleepQuality: input.sleepQuality,
      sleepHours: input.sleepHours,
    },
  });
  if (error) throw error;
  return data as RemoteScore;
}

/** Everything the server has for this user, newest first. */
export async function fetchAssessments(sinceIso?: string) {
  if (!supabase) return [];
  let q = supabase.from('assessments_with_scores').select('*').order('taken_at', { ascending: false });
  if (sinceIso) q = q.gt('taken_at', sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Delete by the device-generated client_id, because that is the only id the
 * app knows — the server's uuid never comes back down.
 */
export async function deleteAssessment(clientId: string): Promise<void> {
  if (!supabase) return;
  const userId = await currentUserId();
  if (!userId) return;
  await supabase.from('assessments').delete().eq('user_id', userId).eq('client_id', clientId);
}

// ---------------------------------------------------------------- plus -----

export async function postPlusSession(
  code: 'WHO5' | 'PSS10' | 'PSQI',
  clientId: string,
  answers: unknown,
) {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('plus-sessions', {
    body: { code, client_id: clientId, answers },
  });
  if (error) throw error;
  return data;
}

/** Plus sittings held server-side, newest first. */
export async function fetchPlusSessions() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('plus_sessions').select('*').order('completed_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ------------------------------------------------------------- devices -----

export async function registerDevice(pushToken: string, platform: 'ios' | 'android', appVersion?: string) {
  if (!supabase) return;
  const userId = await currentUserId();
  if (!userId) return;
  await supabase.from('devices').upsert(
    { user_id: userId, push_token: pushToken, platform, app_version: appVersion },
    { onConflict: 'user_id,push_token' },
  );
}

// ----------------------------------------------------------- DPDP rights ---

/** Full export of everything the server holds. */
export async function exportMyData() {
  if (!supabase) return null;
  const [assessments, plus, profile, consents] = await Promise.all([
    supabase.from('assessments_with_scores').select('*'),
    supabase.from('plus_profiles').select('*'),
    supabase.from('profiles').select('*').single(),
    supabase.from('user_consents').select('*'),
  ]);
  return {
    profile: profile.data,
    consents: consents.data,
    assessments: assessments.data,
    plus: plus.data,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Delete everything server-side. Returns false if it failed — the caller must
 * NOT then clear local data or claim success, because the privacy policy
 * promises this actually happened.
 */
export async function deleteMyAccount(): Promise<boolean> {
  if (!supabase) return true;               // nothing on a server to delete
  try {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
    await supabase.auth.signOut();
    return true;
  } catch {
    return false;
  }
}

export type { ScoreResult };
