# UF Index

The world's first index built to measure your energy — a mind–body wellness assessment for
[UFAS / URJA](https://ufaslive.com).

This repo holds two things: the **mobile app** and the **design prototype + specs** it was built from.

---

## Repo layout

```
uf-index-app/          React Native + Expo app (Phase 1, frontend only)
UFINDEX/
  uf-index-prototype/  The clickable web prototype, install page, privacy policy (deployed to Vercel)
  uf_index_schema.sql  PostgreSQL schema — Phase 1 tables marked at the top
  UF_Index_Test_Cases.xlsx  The 16 QA cases: inputs → expected score & band
  *.pdf                Official instruments (WHO-5, PSS-10, PSQI)
```

## The app — `uf-index-app/`

Expo SDK 54 · TypeScript · **no backend** — everything is stored on the device (AsyncStorage).

```bash
cd uf-index-app
npm install
npx expo start        # scan the QR with Expo Go
npm run test:scoring  # must print 16/16
```

**Phase 1 scope:** guided assessment (tape-measure inputs + live silhouette) → the token-drop
"power test" machine → printed ticket you tear off → dashboard with trend, streak, badges and
monthly recap → Index Plus (WHO-5, PSS-10, PSQI, clinically scored) → settings with data export
and delete-everything → console/kiosk mode.

### Scoring — read this before touching it

`src/lib/scoring.ts` is the single source of truth, tagged `formula_version: "proto-1"`.
The weights are a **placeholder** (body 30% · energy 30% · sleep 25% · feeling 15%) using the
US Navy body-fat method. When UFAS signs off the official formula:

1. implement it and bump `FORMULA_VERSION`
2. regenerate the expected values in `UF_Index_Test_Cases.xlsx`
3. `npm run test:scoring` must be **16/16** again

Raw inputs are always stored alongside the score so every result stays recomputable.

## The prototype — `UFINDEX/uf-index-prototype/`

Static HTML, no build step. Deployed at **uf-index-prototype.vercel.app**.

| File | What it is |
|---|---|
| `index.html` | The full story: clickable app prototype, Phase 2 coach dashboard, Phase 3 roadmap, Phase 4 consoles, QA matrix |
| `get.html` | Install page — iPhone (Expo Go) and Android (APK) |
| `sri.html` | Backend guide for Sriharini: tools, GitHub workflow, build order |
| `privacy.html` | Privacy policy & disclaimer (the URL the app stores require) |

## Brand

Four colours, nothing else: Auburn `#741610` · Gold `#D29133` · Black `#0D0D0D` · White `#FFFFFF`.
Type: Fraunces (display) + Instrument Sans (UI).

## Status

| Area | State |
|---|---|
| Mobile app, Phase 1 | Built — Android APK shipping, iPhone via Expo Go |
| Backend | Not started (Supabase planned) — see `uf_index_schema.sql` and `sri.html` |
| Coach dashboard, org reports | Phase 2 — designed, not built |
| AI insights, wearables | Phase 3 — roadmap |
| Consoles / kiosk hardware | Phase 4 — concept, though console mode ships in the app |

**Blockers:** official scoring formula sign-off · Apple Developer enrollment (D-U-N-S) for iOS TestFlight.
