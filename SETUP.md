# Setup — get the app running

Everything here assumes a Mac or Linux machine. Windows works too; the commands are the same.

---

## 1 · Get the code

```bash
git clone https://github.com/adelsherif8/uf-index.git
cd uf-index
```

Already have it? Pull the latest instead:

```bash
cd uf-index
git pull origin main
```

### What you just downloaded

```
uf-index-app/          ← THE APP. This is the real, working React Native app.
UFINDEX/
  uf-index-prototype/  The web prototype and team pages (static HTML, no build)
  uf_index_schema.sql  Database schema
  *.xlsx / *.pdf       QA cases and the official questionnaires
BACKEND_PLAN.md        The backend architecture and build order
SETUP.md               This file
```

---

## 2 · Run the app

```bash
cd uf-index-app
npm install          # ~2 minutes the first time
npx expo start
```

Then open it on a phone:

| Phone | How |
|---|---|
| **Android** | Install **Expo Go** from the Play Store → open it → "Scan QR code" → scan the terminal |
| **iPhone** | Install **Expo Go** from the App Store → scan the terminal QR with the **Camera** app |

Phone and computer must be on the same wifi. If the scan connects but never loads, restart with a
tunnel — it routes over the internet instead:

```bash
npx expo start --tunnel
```

### Verify the scoring engine

```bash
npm run test:scoring
```

Must print **16/16 cases match**. If it doesn't, the scoring engine and the QA workbook disagree —
fix that before anything else.

### Type-check

```bash
npx tsc --noEmit     # must print nothing
```

---

## 3 · Build an installable Android app

Requires a free Expo account (`npx eas-cli login`).

```bash
npx eas-cli build --platform android --profile preview
```

Takes 10–30 minutes on the free queue and returns a `.apk` download link. Open that link on any
Android phone to install — no Expo Go needed.

**iOS builds** need an Apple Developer account (see BACKEND_PLAN.md §8 for who owns that). Once it
exists:

```bash
npx eas-cli build --platform ios --profile preview
npx eas-cli submit --platform ios          # → TestFlight
```

---

## 4 · Publish an update without rebuilding

Because the app uses EAS Update, JavaScript changes can be pushed to existing installs in seconds:

```bash
npx eas-cli update --branch preview --environment preview --message "what changed"
```

This does **not** work for changes to native modules or `app.json` — those need a fresh build.

---

## 5 · The prototype site

Static HTML, no build step. Open the files directly, or deploy:

```bash
cd UFINDEX/uf-index-prototype
vercel deploy --prod          # currently live at uf-index-prototype.vercel.app
```

| File | What it is |
|---|---|
| `index.html` | The full product story — Phases 1–4, QA matrix, coach dashboard |
| `get.html` | Install page for testers (iPhone + Android) |
| `sri.html` | Backend guide for Sriharini |
| `privacy.html` | Privacy policy (the URL the app stores require) |

---

## 6 · Working together on the code

Never commit straight to `main`. One branch per task, then a pull request:

```bash
git pull origin main                 # 1 · always start from the latest
git checkout -b sri/scoring-api      # 2 · your own branch, named after the task
# ... work ...
git add -A
git commit -m "Add POST /assessments with scoring"
git push origin sri/scoring-api      # 3 · upload it
# 4 · open a pull request on github.com → Adel reviews → merge
```

Commit small and often. A commit is a save point you can always return to.

---

## 7 · Switch on the backend (Supabase)

Until you do this, the app is local-only: everything works, nothing leaves the phone.
This is the whole go-live path. Roughly 30 minutes, most of it waiting.

### 7.1 · Create the project

1. Go to **https://supabase.com** → sign in with GitHub → **New project**
2. Organisation: create one called **UFAS**
3. Name: `uf-index-prod` · Region: **Mumbai (ap-south-1)** — the users are in India, and
   under DPDP it is far easier to argue about data that never left the country
4. Database password: generate one and **put it in the team password manager immediately**.
   It is shown once. Losing it means resetting the database.
5. Wait ~2 minutes for it to provision.

### 7.2 · Apply the schema

From `uf-index-backend/`:

```bash
npx supabase login                      # opens a browser
npx supabase link --project-ref <ref>   # <ref> is in the dashboard URL
npx supabase db push                    # runs all five migrations
```

`db push` talks to the hosted database directly — **no Docker needed**.

> **Alternative that needs no login and no database password.** Create a scoped
> access token (Account → Access Tokens) with only *Migrations: Write*,
> *Database: Write*, *Advisors: Read*, *Edge Functions: Write*, and POST each
> migration to the Management API:
>
> ```bash
> curl -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
>   -H "Content-Type: application/json" \
>   -d "{\"name\":\"<migration-name>\",\"query\":\"<file contents>\"}" \
>   "https://api.supabase.com/v1/projects/<ref>/database/migrations"
> ```
>
> This is how the production project was first set up. It records the migration
> in history exactly as `db push` does, so the two stay interchangeable — and
> the database password never has to leave the password manager.
> Note `supabase link` needs *Projects (account-wide): Read*, which the token
> above deliberately does not have; the Management API route sidesteps it.

Check it worked: dashboard → **Table Editor** → you should see 13 tables, and
**Database → Roles/Policies** should show RLS enabled on every one of them.

Then, still important:

```bash
npx supabase db advisors                # must come back with no unresolved warnings
```

### 7.3 · Deploy the two Edge Functions

```bash
npx supabase functions deploy assessments
npx supabase functions deploy plus-sessions
```

If that asks for Docker, use `--use-api` to bundle server-side instead:

```bash
npx supabase functions deploy assessments --use-api
```

Failing that, paste the file contents into **Dashboard → Edge Functions → Deploy a new function**.

### 7.4 · Turn off the confirmation email (for now)

**Authentication → Sign In / Providers → Email** → switch **Confirm email** off while testing,
so accounts work instantly. Turn it back on before real users touch it, and set the sender
domain under **Authentication → Emails** — the default Supabase sender is rate-limited to a
handful of messages an hour and will not survive a launch.

### 7.5 · Point the app at it

**Settings → API** in the dashboard. Copy the **Project URL** and the **anon / publishable** key.

```bash
cd uf-index-app
cp .env.example .env
```

Fill it in:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> The anon key is **meant** to ship inside the app — RLS is what protects the data.
> The `service_role` key must never go in `.env`, in the app, or in git. It bypasses RLS entirely.
> `.env` is gitignored; keep it that way.

Then **restart Metro completely**:

```bash
npx expo start -c
```

`EXPO_PUBLIC_*` variables are baked into the bundle at build time. A Metro that was already
running will not pick up a new `.env` — this catches everyone once.

### 7.6 · Prove it works

1. Open the app → the auth screen now says *"An account backs up your check-ins…"*.
   If it still says *"Accounts arrive with the backend"*, `.env` was not picked up — redo 7.5.
2. Create an account → dashboard → **Authentication → Users** shows it, and **Table Editor →
   profiles** has a matching row (the signup trigger made it).
3. Agree to the consents → `user_consents` has **three** rows, with a policy version.
4. Complete a check-in → `assessments` has the raw answers, `assessment_scores` has the score.
   **Compare that score to what the ticket showed.** They must be identical — same engine, both sides.
5. Delete the app and reinstall → sign in → your history comes back down.
6. **Airplane mode** → complete a check-in → it still works and shows a score. Turn the network
   back on, reopen the app → the row appears server-side. This is the one that matters most.
7. Two accounts: sign in as B and try to read A's rows. You must get nothing back. That is RLS
   doing its job, and it is worth testing by hand rather than trusting.

### 7.7 · Ship it

```bash
cd uf-index-app
eas build --profile preview --platform android    # new APK, now with the backend baked in
```

The APK people already have on their phones is still local-only — `.env` is compiled in, so
an OTA update alone will not switch them over. They need a new build.

Their existing local history is safe: the first sign-in pushes everything on the phone up
**before** pulling anything down.

---

## 8 · The demo account

A seeded account so coaches, reviewers and app-store testers can open the app and see a
populated dashboard without taking ten weeks of check-ins first.

```
Email     demo@ufaslive.com
Password  (shared with the team separately — not in this repo)
```

Sign in on the auth screen with **"I already have an account"**. It holds:

- **10 weekly check-ins**, June to August 2026, running 1.8 Depleted → 4.2 Energized.
  Measurements, energy, sleep and notes all improve gradually, so the trend chart,
  streak, monthly recap and delta screens all have something real to show.
- **2 Plus sittings** — a poor one and a much better one, so the Plus history and the
  radar have a before/after.
- An active Plus trial and one coach call request.

App Store and Play reviewers both require working credentials for an app behind a login.
**This is the account to give them** — put it in the "notes for review" field on each store.

To reset it after someone has poked at it, re-run the seed script; it deletes the account
and rebuilds it from scratch, so it is safe to run repeatedly.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ConfigError: package.json does not exist` | You're in the wrong folder — `cd uf-index-app` first |
| "Project is incompatible with this version of Expo Go" | Expo Go is older than the app's SDK. The app targets **SDK 54** deliberately, because that's what the public Expo Go runs |
| QR scans but won't load | `npx expo start --tunnel -c` |
| Weird build errors after pulling | `rm -rf node_modules && npm install`, then `npx expo start -c` |
| Metro cache acting up | `npx expo start -c` (the `-c` clears the cache) |

**The app still says "Accounts arrive with the backend" after adding `.env`**
Metro cached the old bundle. Stop it and run `npx expo start -c`. `EXPO_PUBLIC_*` is
compile-time, not runtime.

**`db push` says "Docker is not running"**
It shouldn't — `db push` goes straight to the hosted database. If you see this you're on
`supabase start` or `db reset` instead, which are the local-only commands.

**Sign-up returns "Email address is invalid"**
Supabase blocks some disposable domains by default. Use a real address, or turn the
restriction off under Authentication → Providers → Email.
