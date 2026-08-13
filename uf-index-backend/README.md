# UF Index — backend

Supabase (PostgreSQL + Auth + Edge Functions). **Phase 1 only.**

Nothing here is deployed yet — this is the complete codebase, ready to point at a real project.

---

## What's in here

```
supabase/
  config.toml                          project + local dev config
  migrations/
    …_phase1_schema.sql                13 tables, 2 views, signup trigger
    …_rls.sql                          Row Level Security on every table
    …_seed_questionnaires.sql          WHO-5, PSS-10 and PSQI items, verbatim
    …_account_rpc.sql                  delete_my_account(), export_my_data()
  functions/
    _shared/scoring.ts                 THE scoring engine — must match the app
    _shared/http.ts                    CORS + JSON helpers
    assessments/index.ts               POST a check-in → stores raw, returns score
    plus-sessions/index.ts             POST a questionnaire → scores it
tests/
  scoring-test.ts                      the 16 QA cases + the 3 Plus instruments
```

---

## First-time setup

You need the Supabase CLI and Docker (Docker only for running it locally).

```bash
# 1 · install the CLI
brew install supabase/tap/supabase      # or: npm i -g supabase

# 2 · install test deps
npm install

# 3 · prove the scoring engine is correct BEFORE touching a database
npm run test:scoring                    # must print 16/16
```

### Point it at a real project

```bash
supabase login
supabase link --project-ref <your-project-ref>   # from the Supabase dashboard URL
supabase db push                                  # runs the three migrations
supabase functions deploy assessments
supabase functions deploy plus-sessions
```

### Or run the whole thing locally (needs Docker)

```bash
supabase start          # spins up Postgres + Auth + Studio
supabase db reset       # applies migrations + seed from scratch
supabase functions serve
```

Studio at http://localhost:54323, API at http://localhost:54321.

---

## The rule that governs this codebase

> **Raw answers and `formula_version` are stored on every row.**

The official UF Index formula is **not signed off yet**. Everything currently computes with
`proto-1`. Because the raw inputs are kept, every score can be recomputed when the real formula
arrives — nothing has to be thrown away or guessed at retroactively.

When the official formula lands:

1. change the body of `computeScore()` in `_shared/scoring.ts` **and** the app's `src/lib/scoring.ts`
2. bump `FORMULA_VERSION`
3. regenerate the expected values in `UF_Index_Test_Cases.xlsx`
4. `npm run test:scoring` must be **16/16** again, in both places
5. backfill: recompute `assessment_scores` for old assessments, writing the new version

---

## Security decisions worth knowing

**RLS is on every table**, written in the same commit as the tables. A user can only ever
read or write their own rows, enforced by Postgres — not by remembering to add `WHERE user_id = …`
in application code.

Specific choices:

- **Scores are not client-writable.** `assessment_scores` has no INSERT policy for `authenticated`;
  only the Edge Function (service role) writes them. A user cannot invent their own UF Index.
- **Assessments are append-only.** There is no UPDATE policy. Correcting a check-in means deleting
  it and taking another — history stays trustworthy.
- **Consents are append-only too.** Withdrawing a consent inserts `granted = false` rather than
  editing the old row, so the audit trail survives. That's what DPDP asks for.
- **Views use `security_invoker = true`**, so RLS on the underlying tables still applies. Views
  bypass RLS by default — that's a classic way to leak everything.
- **`auth.uid()` is wrapped as `(select auth.uid())`** in every policy so it evaluates once per
  query instead of once per row.
- **Every policy targets `to authenticated` AND carries an ownership check.** Role alone is
  authentication, not authorization.

**Never put the service-role key in the app.** It bypasses RLS entirely. The app uses the anon
(publishable) key only; the service key lives in Edge Function environment variables.

---

## The API so far

All routes need `Authorization: Bearer <user jwt>`.

### `POST /functions/v1/assessments`

```jsonc
{
  "client_id": "1754800000000-123456",   // generated on the device — makes retries safe
  "gender": "male",
  "weightKg": 82, "heightCm": 178, "neckCm": 38, "waistCm": 86, "hipCm": 98,
  "rpeMorning": 3, "rpeAfternoon": 2,
  "bodyFeeling": 3, "sleepQuality": 3, "sleepHours": 7,
  "note": "night shift week"             // optional
}
```

Returns `{ id, client_id, score, band, bodyFatPct, pillars, formulaVersion }`.

Validates every field and rejects with `422` and a readable list of problems. Upserts on
`(user_id, client_id)`, so a retried sync updates rather than duplicating.

### `POST /functions/v1/plus-sessions`

```jsonc
{ "code": "WHO5",  "client_id": "…", "answers": [3,3,2,3,3] }
{ "code": "PSS10", "client_id": "…", "answers": [1,2,2,1,2,1,2,2,1,1] }
{ "code": "PSQI",  "client_id": "…", "answers": {
    "bedTime": "23:00", "wakeTime": "06:30", "latencyMin": 20, "sleepHours": 7,
    "freq": [1,1,2,0,0,1,1,1,0,0], "extra": [1,0,1,1] } }
```

Returns `{ id, code, raw, scaled, band }`.

### `POST /rest/v1/rpc/delete_my_account`

Hard-deletes the caller and everything that cascades from `auth.users`. Takes no arguments —
it reads the user from the JWT, so it can only ever delete you. The app calls this **before**
clearing local storage, and refuses to claim success if it fails.

### `POST /rest/v1/rpc/export_my_data`

Returns one JSON object with the caller's profile, settings, consents, assessments (with scores)
and Plus sessions. DPDP portability, in one call.

### Plain reads (PostgREST, no function needed)

```
GET /rest/v1/assessments_with_scores?order=taken_at.desc
GET /rest/v1/plus_profiles
GET /rest/v1/profiles
```

RLS already scopes these to the signed-in user.

---

## Still to build

| | |
|---|---|
| Reminder job | a scheduled function that reads `devices` and sends the Sunday nudge |
| Backfill script | recompute `assessment_scores` when the formula changes |
| Coach access | Phase 2 — a coach reading their own clients' rows |

Then the app-side wiring — see **`../BACKEND_INTEGRATION.md`**.

---

## Before calling Phase 1 done

- [ ] `npm run test:scoring` → 16/16
- [ ] `supabase db advisors` → no unresolved warnings
- [ ] A second user cannot read the first user's rows (test with two tokens in Postman)
- [ ] `POST /assessments` twice with the same `client_id` → one row, not two
- [ ] Deleting a user leaves zero rows behind in every table
- [ ] The app still completes a full assessment in **airplane mode**
