// ============================================================================
// Offline-first sync.
//
// The device is the source of truth for its own data. The server is where that
// data is kept durably and shared with a coach — never something the app waits
// on. Everything here is safe to call at any time: with no backend configured,
// no session, or no network, it simply does nothing and the app carries on.
//
// The migration that matters: people already have real history on their phones
// from testing the APK. The first sign-in must push all of it up before pulling
// anything down, or that history is lost.
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isConfigured, isSignedIn, postAssessment, fetchAssessments } from './api';
import type { AssessmentRecord } from './store';

const WATERMARK = 'uf-sync-watermark-v1';

export interface SyncOutcome {
  ran: boolean;        // false = not configured / not signed in / offline
  pushed: number;
  pulled: number;
  failed: number;
}

const IDLE: SyncOutcome = { ran: false, pushed: 0, pulled: 0, failed: 0 };

/**
 * Push anything not yet synced, then pull anything new from other devices.
 *
 * @param records   the current local records
 * @param onMerged  called with the records to save (marked synced, plus any
 *                  pulled from the server). Only called if something changed.
 */
export async function syncNow(
  records: AssessmentRecord[],
  onMerged: (next: AssessmentRecord[]) => void,
  profileAge?: string,
): Promise<SyncOutcome> {
  if (!isConfigured()) return IDLE;
  if (!(await isSignedIn())) return IDLE;

  let pushed = 0, failed = 0;
  const next = [...records];

  // ---- 1 · PUSH, oldest first so the server's history reads in order -------
  const unsynced = next.filter(r => !r.synced).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  for (const rec of unsynced) {
    try {
      await postAssessment(rec.id, rec.input, rec.takenAt, profileAge);
      const i = next.findIndex(r => r.id === rec.id);
      if (i >= 0) next[i] = { ...next[i], synced: true };
      pushed++;
    } catch {
      failed++;                 // leave it unsynced; the next run retries it
    }
  }

  // ---- 2 · PULL anything newer, merging on client_id ----------------------
  let pulled = 0;
  try {
    const since = (await AsyncStorage.getItem(WATERMARK)) ?? undefined;
    const remote = await fetchAssessments(since);
    for (const r of remote as Array<Record<string, unknown>>) {
      const clientId = String(r.client_id ?? '');
      if (!clientId || next.some(l => l.id === clientId)) continue;   // already have it
      next.push(remoteToLocal(r));
      pulled++;
    }
    if (remote.length) {
      const newest = (remote as Array<{ taken_at: string }>)
        .map(r => r.taken_at).sort().at(-1);
      if (newest) await AsyncStorage.setItem(WATERMARK, newest);
    }
  } catch {
    // a failed pull is not a failed sync — the push already landed
  }

  if (pushed || pulled) {
    next.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
    onMerged(next);
  }
  return { ran: true, pushed, pulled, failed };
}

/** Turn a server row back into the shape the app stores locally. */
function remoteToLocal(r: Record<string, unknown>): AssessmentRecord {
  const n = (k: string) => Number(r[k] ?? 0);
  const band = String(r.band ?? 'balanced');
  return {
    id: String(r.client_id),
    takenAt: String(r.taken_at),
    synced: true,
    input: {
      gender: 'male',                       // not returned; body values drive the score anyway
      weightKg: n('weight_kg'), heightCm: n('height_cm'),
      neckCm: n('neck_cm'), waistCm: n('waist_cm'), hipCm: n('hip_cm'),
      rpeMorning: n('rpe_morning'), rpeAfternoon: n('rpe_afternoon'),
      bodyFeeling: n('body_feeling'), sleepQuality: n('sleep_quality'),
      sleepHours: n('sleep_hours'),
      note: (r.note as string) ?? undefined,
    },
    result: {
      score: n('uf_score'),
      bodyFatPct: n('body_fat_pct'),
      band: (band.charAt(0).toUpperCase() + band.slice(1)) as AssessmentRecord['result']['band'],
      formulaVersion: String(r.formula_version ?? 'proto-1'),
      pillars: [
        { name: 'Body composition', value: n('pillar_body'),    weight: '30%', note: '' },
        { name: 'Perceived energy', value: n('pillar_energy'),  weight: '30%', note: '' },
        { name: 'Sleep',            value: n('pillar_sleep'),   weight: '25%', note: '' },
        { name: 'Body feeling',     value: n('pillar_feeling'), weight: '15%', note: '' },
      ],
    },
  };
}

/** How many local records are still waiting to go up. */
export const unsyncedCount = (records: AssessmentRecord[]): number =>
  records.filter(r => !r.synced).length;

/** Forget the pull watermark — used after "delete all my data". */
export async function resetSyncState(): Promise<void> {
  await AsyncStorage.removeItem(WATERMARK).catch(() => {});
}
