# JalRakshak

*Your Water. Your Village. Your Voice.*

A prototype rural water-service monitoring and response platform for SIH 2026, problem statement SIH26255. It fuses sensor readings, citizen complaints and pipeline records into explainable incidents, and verifies that service is restored after repair.

> **Prototype notice:** every village, person, asset, ID and reading in this repository is fictional demo data. Government identifiers (LGD, Sujal Gaon, Sujalam Bharat) are mock values. Nothing here is integrated with IMIS, Sujalam Bharat or any JJM API.

## Repository layout

| Path | What it holds | Stage |
|---|---|---|
| `docs/` | Plans, submission pack, idea deck | done |
| `seed/ramapuram.json` | The single demo dataset every part of the app reads | 1 ✅ |
| `scripts/validate-seed.mjs` | Checks the seed: references, labelling, story order, risk arithmetic, no real phone numbers | 1 ✅ |
| `shared/risk.mjs` | Pipeline risk scoring, used by the validator and the frontend | 1 ✅ |
| `frontend/` | React + Vite + Tailwind app (Citizen, Gram Panchayat, Officer) | 3 ✅ |
| `backend/` | FastAPI + SQLite (PostgreSQL later) | 4 |
| `simulator/` | Python sensor simulator | 6 |

## Stage 1: seed dataset

The seed describes one story, used on every screen:

**Predict → Report → Review → Prioritise → Maintain → Verify → Inform**, on Pipeline **P-21** (North Area, Ramapuram).

| Step | Where it is in the seed |
|---|---|
| Early warning: P-21 pressure-per-flow drifting (alert AL-76) | `story.alerts` |
| Complaints #2048 (with photo), #2049 and #2051 | `story.complaints` |
| Simulated image observation for #2048 | `story.image_analysis` |
| Tail-pressure alert AL-77, then incident INC-0311 with evidence score 0.81 (not a probability) | `story.alerts`, `story.incident` |
| Task T-118 assigned to Ravi, repaired | `story.task` |
| Two scheduled supply windows pass, then Verified Restored | `story.verification` |
| Citizen notifications | `story.notifications` |

Pipeline risk scores are computed from the facts (age, repairs, inspections, trend, material) using `risk_config`. P-21 comes out at **72/100 HIGH**.

### Check the seed

Requires Node.js 18 or newer.

```powershell
node scripts\validate-seed.mjs
```

Run this after every edit to the seed. It exits with an error and lists each problem if anything is inconsistent.

## Stage 3: frontend (runs on the seed, no backend yet)

### Run it (Windows, VS Code terminal)

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Requires Node.js 18+.

### What works

- **Login:** pick Villager, Gram Panchayat or Government Officer (demo login, no personal data). English, తెలుగు and हिंदी on all citizen screens.
- **Citizen:** home status, today's water timing, report a problem (7 categories, photo preview with replace/remove, optional note, approximate location), simulated photo check with disclaimer, complaint timeline, schematic village map.
- **Gram Panchayat:** dashboard (KPIs, alerts, tail-pressure chart, sensor health), complaints inbox, incident INC-0311 with evidence and contributions, pipeline health list and P-21 risk breakdown, village map, task T-118 with the two-window restoration check.
- **Officer:** block overview, pipelines needing inspection, repeat failures.

### The demo story

Every screen reads one shared story step, so the three roles always agree. Actions move it forward:

1. Citizen submits a complaint → **2/6**
2. GP links it to P-21 and opens the incident → **3/6**
3. GP creates the maintenance task → **4/6**
4. GP records the repair → **5/6**
5. GP runs the restoration check → **6/6** (Verified Restored, villager informed)

The dark **demo bar** (bottom right) shows the current step and has *Reset story* and *Skip to next step* for presenting. The story step and role are kept in the browser's local storage; photos are kept only in memory and are never uploaded in this stage.

### Known limits of Stage 3

- No backend yet: data comes from `seed/ramapuram.json`, and actions only move the demo step.
- Charts use a deterministic simulated series until the sensor simulator arrives (Stage 6).
- Voice notes are shown as "coming later".
- Telugu and Hindi strings are first drafts and need review by native speakers.
