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

## Troubleshooting

| Problem | Fix |
|---|---|
| `ConfigError: package.json does not exist` | You're in the wrong folder — `cd uf-index-app` first |
| "Project is incompatible with this version of Expo Go" | Expo Go is older than the app's SDK. The app targets **SDK 54** deliberately, because that's what the public Expo Go runs |
| QR scans but won't load | `npx expo start --tunnel -c` |
| Weird build errors after pulling | `rm -rf node_modules && npm install`, then `npx expo start -c` |
| Metro cache acting up | `npx expo start -c` (the `-c` clears the cache) |
