# Connecting the app to the backend

**Read `BACKEND_PLAN.md` first** — it covers the server side (schema, endpoints, RLS, Sri's build
order). This file is the other half: **what changes inside the app** once the API exists, in the
order to do it.

---

## The rule that governs everything

> **The app must keep working with no network.**

It works offline today. Police stations, gym basements and the Phase 4 kiosk all have poor
connectivity, and users already have real history on their phones. So:

- The **device stays the source of truth for its own data.** The server is where that data is kept
  durably and shared with coaches — not a thing the app waits on.
- Every write goes to local storage **first**, then syncs when possible.
- If a change makes the app unusable in airplane mode, it's a bug, even if it works on wifi.

---

## What exists today

| File | Today | After integration |
|---|---|---|
| `src/lib/store.tsx` | AsyncStorage, versioned envelope `__v: 2` | Same, **plus** a sync layer and `synced` flags |
| `src/lib/scoring.ts` | Computes locally, `formula_version: "proto-1"` | Stays (offline needs it); server's answer wins when online |
| `src/screens/onboarding.tsx` | Sign-up is cosmetic, "Continue as guest" | Real Supabase Auth; guest mode stays as a legitimate path |
| `src/screens/plus.tsx` | Plus results stored locally | Also POSTed to `/plus/sessions` |
| `src/lib/notify.ts` | Local scheduled notifications | Keep local; add server push for coach messages |

Nothing gets thrown away. This is additive.

---

## Order of work

### Step 1 · Add the API client _(before any UI changes)_

New file `src/lib/api.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true } },
);
```

Install: `npx expo install @supabase/supabase-js`

Put the URL and **anon** key in `.env` (already gitignored). The anon key is safe on the client —
that's what RLS is for. The **service key must never** appear in the app.

**Done when:** the app builds and starts with the client imported but unused.

---

### Step 2 · Tag every record for sync

In `src/lib/store.tsx`, extend the record type:

```ts
export interface AssessmentRecord {
  id: string;          // already exists — this is the client_id the server upserts on
  takenAt: string;
  input: AssessmentInput;
  result: ScoreResult;
  synced?: boolean;    // NEW — false/undefined means "still local only"
}
```

Bump `SCHEMA_VERSION` to `3` and let the existing `parseStored()` migration handle old data
(records without `synced` are simply treated as unsynced). **Nothing else changes yet.**

**Done when:** existing installs still open with their history intact.

---

### Step 3 · Auth, without breaking guest mode

In `onboarding.tsx`, wire the sign-up screen to `supabase.auth.signUp()`, and:

1. On success, write the three consent rows (`clause` → `health_data_processing`,
   `coach` → `coach_visibility`, `social` → `marketing`) with `policy_version: 'privacy-v1.0'`.
2. **Keep "Continue as guest"** working exactly as now — it just means no sync.
3. Add a "Sign in to sync" entry point in Settings for guests who later want an account.

**Done when:** a new user appears in Supabase with exactly three consent rows, and guest mode still
completes a full assessment offline.

---

### Step 4 · Push local data up _(the migration that must not lose anything)_

New file `src/lib/sync.ts`:

```ts
export async function syncNow() {
  if (!(await supabase.auth.getSession()).data.session) return;   // guests: no-op

  // 1 · PUSH — everything not yet synced, oldest first
  const unsynced = state.records.filter(r => !r.synced);
  for (const r of unsynced) {
    await supabase.functions.invoke('assessments', {
      body: { client_id: r.id, taken_at: r.takenAt, ...r.input },
    });
    markSynced(r.id);
  }

  // 2 · PULL — anything newer from other devices
  const since = lastSyncedAt();
  const { data } = await supabase.from('assessments_with_scores').select('*').gt('taken_at', since);
  mergeByClientId(data);
}
```

Call it on: app launch, regaining connectivity, and after each completed check-in.

**Why `client_id` matters:** the server upserts on `(user_id, client_id)`. If the network drops
mid-upload and the app retries, the record is updated rather than duplicated.

**Done when:** install the app, do three check-ins in airplane mode, turn wifi on, sign up — all
three appear in the database, and none are duplicated when you re-run sync.

---

### Step 5 · Let the server score

In the assessment flow, when online, use the server's score instead of the local one:

```ts
const local = computeScore(draft);              // instant, for the ceremony
const remote = await postAssessment(draft);     // authoritative
const result = remote ?? local;                 // offline → local wins
```

The machine ceremony should **not** wait on the network — it starts with the local number.
If the server's answer differs, that's a bug in one of the two engines, and both must pass the
same 16 QA cases.

**Done when:** with wifi on, the ticket shows the server's score; with wifi off, it still prints.

---

### Step 6 · Plus, devices, coach

- `plus.tsx` — POST each questionnaire to `/plus/sessions` on completion; keep the local copy
- Register the Expo push token to `/devices` after login
- `coach.tsx` — the request button hits `/call-requests` instead of only writing local state

---

### Step 7 · Settings must stay honest

- **Export** — switch to `GET /me/export` when signed in (server has the full picture)
- **Delete all my data** — must call `DELETE /me` **and** clear local storage. If the server call
  fails, do not clear locally and do not claim success. That promise is in the privacy policy.

---

## Environment

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

For EAS builds, add the same as EAS secrets:

```bash
npx eas-cli secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://..."
npx eas-cli secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..."
```

---

## Testing checklist before calling it done

- [ ] `npm run test:scoring` → 16/16
- [ ] Server scoring returns the same 16 results as the app
- [ ] Full assessment completes in **airplane mode**
- [ ] Records made offline sync after signing in — none lost, none duplicated
- [ ] Signing in on a second device shows the same history
- [ ] A second user cannot read the first user's rows (RLS check, via Postman with their token)
- [ ] "Delete all my data" removes every row server-side and clears the device
- [ ] Guest mode still works end to end

---

## What NOT to do

- Don't put the Supabase **service key** in the app. Ever.
- Don't make the machine ceremony wait for a network call.
- Don't remove local scoring — offline depends on it.
- Don't skip RLS and "add it later". Write policies with the tables.
- Don't change `formula_version` casually — it's how old scores stay recomputable.
