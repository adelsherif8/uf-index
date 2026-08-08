# UF Index — Backend Plan

**Written:** August 2026 · **For:** Sriharini (build) + Adel (frontend/architecture)
**Status of the app:** Phase 1 is **already built and working** — offline, on-device, shipping as an Android APK.

---

## 1. The situation this plan starts from

This is not "build a backend, then build an app." The app exists, works, and stores everything
locally in AsyncStorage. It has real users' data on their phones the moment they install it.

That single fact decides the architecture:

- The app **must keep working with no network.** Police stations, gym basements, and the Phase 4
  kiosk all have bad connectivity. Offline is a feature, not a fallback.
- So the backend is a **sync target**, not a request/response dependency. The device stays the
  source of truth for its own data; the server is where that data is durably kept and shared.
- Anything that breaks offline behaviour is a regression, even if it "works" on wifi.

**What the backend actually unlocks** (nothing else is blocked on it):

| Unlocks | Why it needs a server |
|---|---|
| Same account on a new phone | Data currently dies with the device |
| Coach dashboard | Someone other than the user must read the data |
| Org / cohort reports | Aggregation across users |
| Real subscriptions | Payment state can't live on the client |
| AI insights (Phase 3) | Model calls need a server-side key |

---

## 2. Architecture — decided, not up for debate

| Layer | Choice |
|---|---|
| Database | **Supabase (PostgreSQL)** — managed, Postgres, auth included |
| Auth | **Supabase Auth** — email + Apple + Google |
| API | **Supabase Edge Functions** (TypeScript) for anything with logic; PostgREST for plain reads |
| Row security | **Postgres RLS** — a user can only ever read their own rows |
| Push | **Expo Push** (already wired in the app) |
| Hosting | Supabase managed; coach dashboard later on **Vercel (Next.js)** |

**Why RLS matters more than usual here:** this is health data under India's DPDP Act. RLS means
"user A cannot read user B's rows" is enforced by the database itself, not by remembering to write
`WHERE user_id = ...` in every query. Write the policies first, then the endpoints.

---

## 3. Schema fixes needed BEFORE writing endpoints

`uf_index_schema.sql` was written before the app was finished. It has drifted. Fix these first —
they are small now and painful later.

| # | Problem | Fix |
|---|---|---|
| 1 | `assessments.exercise_min` — the exercise question **was removed** (Harini's datasheet has no exercise column) | Drop the column |
| 2 | `assessment_scores.pillar_movement` — scoring is now **four pillars**, not five | Drop the column |
| 3 | The app saves a free-text **note** per check-in; schema has nowhere to put it | Add `assessments.note TEXT` |
| 4 | `plus_sessions` models **one questionnaire per row**, but the app produces one combined result (WHO-5 + PSS + PSQI + radar triple) | Keep one row per questionnaire — it's the correct grain — and add a view `plus_profiles` that pivots the latest three into one record for the app |
| 5 | App state has `lang`, `unit_system`, `console_mode`, `plus_trial_started_at`, `coach_requested_at` with nowhere to live | `lang`/`unit_system` → `users`; the rest → `user_settings`, `subscriptions`, `call_requests` |
| 6 | Scale ranges: schema comment still asks "0–5 or 1–5?" | Confirmed **1–5** for core inputs. Update the CHECK constraints and delete the comment |
| 7 | No idempotency for sync — a retried upload would duplicate a check-in | Add `assessments.client_id TEXT UNIQUE per user` (the app already generates one) |

**Rule that must not be broken:** raw inputs and `formula_version` are stored on every row. The
official formula is still unsigned. When it lands, we recompute — that only works if the raw
answers were kept.

---

## 4. API surface

Shapes must match `src/lib/store.tsx` and `src/lib/scoring.ts` exactly. Don't invent new field names.

### Auth & account
```
POST   /auth/signup            email, password → session          (Supabase Auth)
POST   /auth/signin
POST   /me/consents            [{type, granted, policy_version}]  → written on signup
GET    /me                     profile + settings
PATCH  /me                     name, age, gender, organization, lang, unit_system
DELETE /me                     hard delete, cascades everywhere   (DPDP right to erasure)
GET    /me/export              full JSON dump                     (DPDP portability)
```

### The core loop
```
POST   /assessments            raw inputs + client_id
                               → server computes score, writes assessment + assessment_scores,
                                 returns {score, band, pillars, formulaVersion}
GET    /me/assessments         history, newest first, paginated
DELETE /assessments/:id        per-record delete (the app already has this UI)
GET    /me/latest              latest score + streak + weakest pillar (one call for the dashboard)
```

### Index Plus
```
POST   /plus/sessions          {code: 'WHO5'|'PSS10'|'PSQI', answers: [...]}
                               → server scores it, returns {raw, scaled, band}
GET    /me/plus                latest profile (the pivot view) + history
```

### Devices, coaching, subscription
```
POST   /devices                expo push token, platform, app_version
POST   /call-requests          user asks for a coach call
GET    /me/subscription        trial/active state
```

**Scoring lives on the server.** The app keeps its local copy for offline use, but the server's
answer wins. Both must pass the same 16 test cases — that's how we know they agree.

---

## 5. Sync — the part that is actually hard

The app has data before it ever has an account. Design for that.

**Rules:**
1. Every local record already carries a `client_id` (`${Date.now()}-${random}`). Send it. The server
   upserts on `(user_id, client_id)`. A retry after a dropped connection is then harmless.
2. **Local writes never block on the network.** Save locally → mark `synced: false` → push when online.
3. **Pull is by watermark:** `GET /me/assessments?since=<last_synced_at>`. Merge by `client_id`.
4. **First login after using the app offline:** upload every unsynced local record before pulling.
   This is the migration path for everyone who tested the APK — don't lose their history.
5. **Conflicts barely exist** because assessments are append-only. If the same `client_id` appears
   twice, the server's copy wins. Deletions sync as tombstones.

**Minimum the app needs added:** a `synced` flag per record and a `syncNow()` that runs on launch,
on regaining connectivity, and after each new check-in. That's Adel's side; it's small.

---

## 6. Consent & privacy — build this in, don't retrofit

- Write `user_consents` rows **at signup**, one per consent, each with `policy_version` (currently
  `privacy-v1.0`) and a timestamp. The app already collects all three.
- **Coach visibility is gated twice:** a coach may read a client's scores only if
  `coach_clients.share_history = true` **and** a `coach_visibility` consent row exists and is granted.
  Enforce it in RLS, not in application code.
- `DELETE /me` must be a real delete (cascades), not a flag. Test it by deleting a seeded user and
  confirming zero rows remain across every table.
- Policy text lives in the app (`src/screens/privacy.tsx`) and at `/privacy.html`. Change one, change both.

---

## 7. Build order for Sri

Each step ends with something testable. Don't skip ahead.

| # | Step | Done when |
|---|---|---|
| 1 | Supabase project, run the **fixed** Phase 1 schema | Tables visible in the dashboard |
| 2 | RLS policies on every table | A second test user cannot read the first user's rows |
| 3 | Port `scoring.ts` to an Edge Function | **16/16** on the QA workbook cases |
| 4 | `POST /assessments` + `GET /me/assessments` | Postman: create and read back a check-in |
| 5 | Auth + consent rows on signup | New user appears with 3 consent rows |
| 6 | `GET /me/latest`, `DELETE /assessments/:id`, `GET /me/export`, `DELETE /me` | Full DPDP set works |
| 7 | Plus endpoints + the pivot view | WHO-5 82/100, PSS 17/40, PSQI 5/21 round-trip |
| 8 | Devices + the weekly reminder job | A push arrives on a real phone |
| 9 | Hand Adel the URL + anon key | App switches from local-only to synced |

**The gate at every step:** the 16 QA cases. If the API's numbers differ from the app's, one of them
is wrong — find out which before moving on.

---

## 8. Ownership & sequence

| Who | What |
|---|---|
| **Sriharini** | Everything in §7 — the database, endpoints, and the reminder job |
| **Adel** | Sync layer in the app, auth screens wired to real auth, migration of local data on first login |
| **UFAS management** | Sign off the official formula; D-U-N-S → Apple enrollment |

**Sequence that matters:** schema fixes (§3) → RLS → scoring function → everything else. Doing auth
before RLS is how health data leaks.

**Not in this phase:** coach dashboard, org reports, Razorpay, AI insights, wearables. All Phase 2+.

---

## 9. Risks worth naming

1. **The formula is still unsigned.** Everything is built on `proto-1`. When the real one arrives,
   the recompute path must work — that's why raw inputs and `formula_version` exist. Test the
   recompute before you need it.
2. **Offline regressions are invisible on wifi.** Test with airplane mode on, every time.
3. **RLS written late = leaked data.** Write policies with the tables, not after the endpoints.
4. **The pilot's data is real people's health data.** Whatever the app does locally, the server
   must do at least as carefully.
