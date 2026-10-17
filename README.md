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
| `frontend/` | React + Vite + Tailwind PWA (Citizen, Gram Panchayat, Officer) | 3 |
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
