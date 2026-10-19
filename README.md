# JalRakshak

*Your Water. Your Village. Your Voice.*

A prototype rural water-service monitoring and response platform for SIH 2026, problem statement SIH26255. It fuses sensor readings, citizen complaints and pipeline records into explainable incidents, and verifies that service is restored after repair.

> **Prototype notice:** every village, person, asset, ID and reading in this repository is fictional demo data. Government identifiers (LGD, Sujal Gaon, Sujalam Bharat) are placeholder values. Nothing here is integrated with IMIS, Sujalam Bharat or any JJM API.

**New to the project? Start with [`docs/JalRakshak_Handover_Spec.docx`](docs/JalRakshak_Handover_Spec.docx).** It explains the idea, what is built (Stages 1–10), how to set it up on Windows, a 10-minute demo, how to work together on the code, known limits, and the roadmap from prototype to a real project.

Quick start (after the one-time setup in Stage 4 below): run `python -m app.seed_loader` and `python -m uvicorn app.main:app --reload` in `backend/` (use `.venv\Scripts\python.exe`), and `npm run dev` in `frontend/`. Then open http://localhost:5173 and sign in as `villager1`, `gp.ramapuram` or `officer.block` with the demo password `jalrakshak-demo`.

## Repository layout

| Path | What it holds | Stage |
|---|---|---|
| `docs/` | Handover spec (start here), plans, submission pack, idea deck | done |
| `seed/ramapuram.json` | The single demo dataset every part of the app reads | 1 ✅ |
| `scripts/validate-seed.mjs` | Checks the seed: references, labelling, story order, risk arithmetic, no real phone numbers | 1 ✅ |
| `shared/risk.mjs` | Pipeline risk scoring, used by the validator and the frontend | 1 ✅ |
| `frontend/` | React + Vite + Tailwind app (Citizen, Gram Panchayat, Officer) | 3 ✅ |
| `backend/` | FastAPI + SQLAlchemy + SQLite (PostgreSQL later): API, complaints and photos, alerts, risk, incidents, tasks, sign-in, verification | 4–10 ✅ |
| `simulator/` | Python sensor simulator (stdlib only): normal, leak, pump-off, node-offline | 6 ✅ |

## Stage 1: seed dataset

The seed describes one story, used on every screen:

**Predict → Report → Review → Prioritise → Maintain → Verify → Inform**, on Pipeline **P-21** (North Area, Ramapuram).

| Step | Where it is in the seed |
|---|---|
| Early warning: P-21 pressure-per-flow drifting (alert AL-76) | `story.alerts` |
| Complaints #2048 (with photo), #2049 and #2051 | `story.complaints` |
| Demo image observation for #2048 | `story.image_analysis` |
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
- **Citizen:** home status, today's water timing, report a problem (7 categories, photo preview with replace/remove, optional note, approximate location), demo photo check with disclaimer, complaint timeline, schematic village map.
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
- Charts use a deterministic sample series until the sensor simulator arrives (Stage 6).
- Voice notes are shown as "coming later".
- Telugu and Hindi strings are first drafts and need review by native speakers.

## Stage 4: backend (FastAPI + SQLite, read-only)

### First-time setup (Windows, VS Code terminal)

Python 3.12 is required. If it is missing: `winget install -e --id Python.Python.3.12`, then open a new terminal.

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.seed_loader
```

If PowerShell blocks `Activate.ps1`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or call `.\.venv\Scripts\python.exe` directly.

### Run

Two terminals:

```powershell
# terminal 1: API on http://127.0.0.1:8000 (docs at /docs)
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

```powershell
# terminal 2: app on http://localhost:5173 (proxies /api to the backend)
cd frontend
npm run dev
```

The GP and Officer header shows **API connected** when data comes from the backend, or **Offline demo data** when the backend is not running (the app then uses the seed bundled with it, so a demo never breaks).

### Test

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

The 19 tests cover the following:
- **Round trip:** seed → database → snapshot returns exactly the seed, so nothing is lost.
- **Risk scores:** the Python risk port reproduces every expected score.
- **Endpoints:** ranking, filtering, 404s, evidence sums, the verification windows, task order, and confirmation that the API is read-only for now.

### Endpoints (`/api/v1`)

`health` · `meta` · `snapshot` · `villages` · `villages/{id}` · `pipelines?village_id=` · `pipelines/{asset_id}` · `alerts?village_id=` · `complaints?village_id=` · `incidents/{code}` · `incidents/{code}/verification` · `tasks/{code}`

### Known limits of Stage 4

- Read-only: the demo story still advances in the browser. Writing complaints, tasks and verifications through the API starts in Stage 5.
- Tables are created by `seed_loader` (drop and recreate). Schema migrations (Alembic) arrive with the PostgreSQL switch in Stage 7.
- No authentication yet (demo login); JWT roles arrive in Stage 9.

## Stage 5: real complaint submission with secure photos

After pulling, reinstall backend packages (Pillow and python-multipart were added) and reload the database:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m app.seed_loader
```

### What happens when a villager submits

1. **Demo sign-in.** Choosing a role on the login screen calls `POST /api/v1/auth/demo-login`, which returns a signed token for that role's fictional demo user (valid 12 hours, kept per browser tab).
2. **The form is sent.** `POST /api/v1/complaints` receives the category, area, an optional note (max 200 characters), whether to share location, and an optional photo.
3. **The server checks it:**
   - only villagers can submit, and only for an area in their own village
   - the same problem in the same area within 6 hours is rejected as a duplicate (409)
4. **The photo is sanitised:**
   - capped at 8 MB (413)
   - type checked from the file's first bytes, not its name: JPEG, PNG or WebP only (415)
   - fully decoded, turned upright, shrunk to 1600 px at most
   - re-encoded as a fresh JPEG, which drops all EXIF/GPS metadata and anything hidden in the file
   - the original is never kept
5. **The complaint is saved:**
   - codes are allocated from 2048 upwards, skipping codes the fixtures already use (#2049 and #2051 belong to other demo villagers)
   - location is the service area's centre (coarse) or "not shared"
   - the demo photo observation is stored, labelled with its demo version tag
   - an audit entry is written, without the note or the photo
6. **Viewing photos.** `GET /api/v1/media/{id}` serves a photo only to the villager who sent it, the Gram Panchayat of that village, or the officer responsible. Everyone else gets 404, and a request without sign-in gets 401. Responses are `no-store`.
7. **Public data stays redacted.** The unauthenticated snapshot never includes complaint notes or photo storage keys.

**Reset story** in the demo bar now also calls `POST /api/v1/demo/reset`, which reloads the seed and deletes uploaded photos, so #2048 can be submitted again. Set `JALRAKSHAK_DEMO=0` to disable the reset endpoint.

### Tests

`python -m pytest` now runs 39 tests. The new ones cover:
- EXIF and GPS removal, and correct rotation
- downscaling
- rejecting fake, corrupt and SVG files
- the size cap and duplicate rule
- code allocation
- role-checked photo and complaint access, including forged tokens and other villagers
- snapshot redaction, the audit log, and demo reset

### Known limits of Stage 5

- Demo sign-in is not real authentication. Password login and JWT arrive in Stage 9.
- After submission, the incident, task and verification are still the scripted story. Their times are the story's November dates, while the live complaint shows the real submission time. They become live records in Stages 9 and 10.
- The image observation is a fixed demo result per category. No vision model runs.
- Uploaded photos are stored on the local disk (`backend/uploads/`, not committed to git).

## Stage 6: sensor simulator, stored readings, live charts

After pulling, reload the database (new `readings` table and node health columns):

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.seed_loader
```

### Run the simulator

With the API running, open a third terminal in the repository folder:

```powershell
python simulator\sim.py                         # normal operation, a reading every 5 s
python simulator\sim.py --scenario leak         # leak on P-21: tail pressure and flow drop, head flow rises
python simulator\sim.py --scenario pump-off     # no pump current, no flow, pressure collapses
python simulator\sim.py --scenario node-offline # Node B goes silent (equipment fault, not a water fault)
```

`python` here is any Python 3.10+; the simulator needs no packages. Stop with Ctrl+C. Switch scenarios by stopping and starting it again. Then open **Gram Panchayat → Water Status**, which refreshes every 5 s.

### How it works

- **Ingest:** `POST /api/v1/ingest/readings` with an `X-Device-Key` header per node.
  - The dev keys are `dev-key-node-a` and `dev-key-node-b`. Set `JALRAKSHAK_DEVICE_KEYS` for anything other than local development.
  - A node can only report its own sensors.
  - Values outside a sensor's physical range are stored but flagged `out_of_range`.
  - Timestamps more than 5 minutes in the future, or more than 7 days old, are rejected.
- **Store-and-forward:** if the API is unreachable, the simulator keeps the batches and replays them with their original timestamps once it is back, as the Raspberry Pi gateway would. This was tested by stopping the API mid-run: no readings were lost.
- **Node health:** a node that has not reported for 30 s shows as **Offline**. Its last values are greyed out, marked "Node offline", and must not be read as a water fault.
- **Reading data:** `GET /api/v1/readings?sensor_id=&minutes=` and `GET /api/v1/telemetry/live` (sign-in required).

### Tests

`python -m pytest` now runs 54 tests. The new ones cover:
- device-key auth, and nodes reporting only their own sensors
- range flagging and timestamp limits
- replayed readings keeping their time
- readings order and limit
- online/offline detection, and each scenario's effect on the readings
- demo reset clearing readings

### Known limits of Stage 6

- There are no alert rules yet. Spotting the leak or a stuck sensor automatically is Stage 7.
- Readings are kept indefinitely in SQLite; retention and down-sampling come with PostgreSQL in Stage 7.
- The story charts on the dashboard and task pages are still the scripted series; the live charts are on Water Status.

## Stage 7: rule-based alerts with a sensor-health gate

After pulling, reload the database (alerts gained a `cleared_at` column):

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.seed_loader
```

### How the rules engine works (`backend/app/rules.py`)

The engine runs after every batch of readings arrives, and again whenever the alert list is polled, so a node that goes silent is noticed even when nothing new arrives.

**1. Sensor-health gate (equipment alerts, shown in grey):**

| Rule | Fires when | Effect |
|---|---|---|
| `NODE_OFFLINE` | a node has not reported for 30 s | its sensors are not used; open water alerts keep their last state |
| `SENSOR_OUT_OF_RANGE` | the latest value is physically impossible | sensor excluded |
| `SENSOR_STUCK` | 6 identical non-zero values in a row | sensor excluded |
| `SENSOR_INCONSISTENT` | head flow above 5 L/min while pump current is below 0.3 A | both sensors excluded |

**2. Water rules (water alerts, shown in red), on trusted sensors during supply hours only:**

| Rule | Fires when |
|---|---|
| `PUMP_OFF_IN_SUPPLY` | pump current below 0.3 A |
| `NO_FLOW_IN_SUPPLY` | head and tail flow both below 2 L/min |
| `HEAD_TAIL_FLOW_GAP` | head flow above 10 L/min, and head minus tail is more than max(8 L/min, 15% of head): a possible leak |
| `TAIL_PRESSURE_LOW_IN_SUPPLY` | tail pressure below its normal band (1.05 bar) |

**3. Rules for raising and clearing alerts:**
- **Persistence:** an alert needs 3 consecutive readings to raise and 3 to clear, so one noisy value does nothing.
- **Withdrawal:** an alert built on a sensor later found faulty is withdrawn, and the reason is recorded.
- **Supply hours:** outside scheduled supply, low flow is expected and does not alert. For live demos at any hour, demo mode treats supply as always on (`JALRAKSHAK_DEMO_SUPPLY_ALWAYS_ON=0` turns this off), and every alert records which mode was used.
- **Thresholds:** all are in `THRESHOLDS` in `rules.py`. They are starting values for the bench rig, not field-validated.

### See it

1. Start the API and the frontend.
2. Run `python simulator\sim.py --scenario leak`, then `normal`, then `node-offline`.
3. Watch **Water Status** (the live alerts are at the top) or the dashboard.

What you should see:
- **leak:** two water alerts (flow gap, low tail pressure). They clear about 3 readings after switching back to normal.
- **pump-off:** pump off, no flow, and low tail pressure.
- **node-offline:** an equipment alert only, never a water alert.

### Endpoints

`GET /api/v1/alerts/active` (open live alerts, water first) and `GET /api/v1/alerts/recent?minutes=` (including cleared alerts, with the reason). The scripted story alerts AL-76 and AL-77 stay separate.

### Tests

`python -m pytest` now runs 69 tests. The new ones cover:
- every scenario, persistence and clearing
- idempotency
- each sensor-health rule, including withdrawing a low-pressure alert once the sensor is found to be stuck
- schedule gating, alert ordering, and the endpoints

### Known limits of Stage 7

- The rules are thresholds, not machine learning. Anomaly detection (z-score, then Isolation Forest) is a later step.
- Alerts are not yet linked to complaints or incidents; that evidence fusion is Stage 9.
- PostgreSQL, Alembic migrations and reading retention are deferred, because SQLite is enough for the demo. Upgrading means reloading the seed.

## Stage 8: risk scored by the backend, with live trends and versioned rules

After pulling, reload the database (new `risk_configs` table):

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.seed_loader
```

### What changed

- **Risk comes from the backend in API mode.**
  - Pipeline pages poll `GET /api/v1/pipelines/{id}/risk` every 10 s, and the list polls `GET /api/v1/pipelines`.
  - The JavaScript scorer (`shared/risk.mjs`) is now used only by the seed validator and for offline demos.
- **The live pressure-per-flow trend** (`backend/app/trends.py`) is the median tail-pressure ÷ tail-flow ratio over the last 60 minutes, compared with the recorded 14-day baseline.
  - It is used only with at least 6 trusted readings in that hour, and only while water is flowing (≥ 10 L/min).
  - Otherwise the recorded trend is used, and the reason is shown.
  - Example: with leak readings, P-21's trend factor drops from 12 to 6 points, and its score from 72 to 66 (still HIGH).
- **Every factor shows its data source:** `record`, `inspection`, `inspection (stale)`, `estimate`, `live sensor`, `assumption table`, `missing` or `not applicable`.
  - The pipeline page puts **recorded and live** side by side and marks which one is in use.
  - **What-if** checks show how the score would move if uncertain inputs were confirmed. For example, confirming K-04's estimated installation date would raise age from 13 to 25 points.
- **Versioned rules.**
  - Officers publish changes under **Officer → Risk rules**: the band thresholds, the year age points reach full, when an inspection counts as stale, and the material points.
  - Every version is kept with its author, time and reason. Activating an older version rolls back.
  - Changes are validated: factor maxima must total 100, points must stay within their maximum, bands must be contiguous, and the rules must keep stating that the score is not a failure probability.
  - Changes are written to the audit log, and only officers can make them.

### Endpoints

`GET /pipelines/{id}/risk` · `GET /risk/config` · `GET /risk/config/versions` · `POST /risk/config` (officer) · `POST /risk/config/{version}/activate` (officer)

### Tests

`python -m pytest` now runs 90 tests. The new ones cover:
- the recorded fallback, too few readings, normal and leak live trends, and pump-off being excluded
- old readings being ignored, pipelines without sensors, and the pipeline list
- the what-if checks: estimated date, missing inspection, stale inspection
- publishing, rollback, role checks, five invalid-rule cases, and the audit trail

### Known limits of Stage 8

- The live trend window (60 min) and baseline are starting values; a field deployment would learn baselines per pipe from weeks of data.
- Risk weights are still expert judgement (`assumption table`). Learning them needs real failure records.
- Score history over time is not stored yet. Only the current score, the rules version and the comparison are shown.

## Stage 9: evidence fusion, incidents and tasks through the API, and sign-in

After pulling, install the new dependency and reload the database (new user, complaint and incident columns):

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m app.seed_loader
```

### Sign in

The demo login is replaced by username and password sign-in. The backend issues an access token (JWT, HS256, 12 h), and the browser keeps it for that tab only.

| Role | Username |
|---|---|
| Villager | `villager1` (also `villager2`, `villager3`) |
| Gram Panchayat | `gp.ramapuram` |
| Block officer | `officer.block` |

- **Password:** the value of `JALRAKSHAK_DEMO_PASSWORD`. If it is not set, the default is `jalrakshak-demo`.
- These are fictional demo accounts, for local demos only.
- Passwords are stored as scrypt hashes.
- After 5 failed attempts the username is locked for 60 s.
- A wrong password and an unknown user get the same reply.
- Set `JALRAKSHAK_SECRET` to keep sessions valid across backend restarts. Without it, every restart asks users to sign in again.

### Evidence fusion (`backend/app/fusion.py`)

For a pipeline, fusion combines four kinds of evidence into a **weighted evidence score. It is not a probability.**

| Evidence | Weight |
|---|---|
| Live sensor alert | 0.35 |
| Villager reports within 150 m in the last 6 h | 0.25 (full weight at 3 reports) |
| Pipeline risk band | 0.15 (HIGH = full, MEDIUM = half) |
| Photo observation | 0.10, counted at 60% because it is a demo estimate |

- **HIGH** priority needs a score of at least 0.6 **and** two independent kinds of evidence.
- **MEDIUM** needs a score of at least 0.35.

Every assessment shows:
- each piece of evidence and how much it added
- the probable cause, marked unconfirmed
- sensor health (a faulty node is never read as a water problem)
- the estimated affected households
- what is missing, for example "no middle-pipeline sensor; leak position not localised"

The system proposes; the Gram Panchayat decides. The GP dashboard lists **Suggested incidents**, and **Review evidence** opens the assessment. Only the GP can open the incident.

### Incident → task → repair

1. **Opening an incident** groups the reports under it (complaint → "Being checked"). A pipeline can have only one open incident, and LOW-priority evidence cannot open one.
2. **Creating a task** assigns a technician from the same village, with a due time that must be in the future. The default is 17:00 the next day.
3. **Updating the task** moves it one step at a time: Assigned → Inspecting → Repairing → Repaired.
4. **Recording "Repaired"** requires a failure type. It adds a repair to the pipeline's history, which feeds the risk score. In the demo, P-21's prior-failures factor rises from 20 to 25 points.
5. **The villager's timeline** shows the real times for each step.

Every action is written to the audit log.

### Story walk-through (API mode)

1. Sign in as `villager1` and report low water with a photo. The complaint is **#2048**.
2. From the repo root, run the leak scenario:
   ```powershell
   python simulator\sim.py --scenario leak --interval 2 --count 20
   ```
3. Sign in as `gp.ramapuram`. The dashboard suggests **P-21 · 0.81 · HIGH**.
4. Click **Review evidence**, then **Open incident**. The incident is **INC-0311**.
5. Click **Create maintenance task**. The task is **T-118**.
6. Step the task through to **Record repair done**.

Codes follow the story because the server allocates the lowest unused number. With the demo flag on, scripted reports #2049 and #2051 also count, and the incident lists this as a caveat.

### Endpoints

- **Sign-in:** `POST /auth/login` · `GET /auth/me`
- **Incidents:** `GET /incidents/suggestions` · `POST /incidents/assess` · `POST /incidents` (GP) · `GET /incidents` · `GET /incidents/{code}`
- **Tasks:** `POST /tasks` (GP) · `GET /tasks` · `GET /tasks/{code}` · `POST /tasks/{code}/updates`

### Tests

`python -m pytest` now runs 103 tests. The new ones cover:
- sign-in, lockout, and tampered or expired tokens
- the fusion score with and without sensors, and reports chosen by the GP
- suggestions and role checks
- the full incident → task → repair lifecycle, including the risk score change
- the task step rules, the audit log, and the demo reset

### Known limits of Stage 9

- Restoration verification is still scripted ("Scripted until Stage 10"). The villager's "Water restored" step has no live time yet.
- The fusion weights are expert judgement, not learned from field data.
- Technicians have no app login. The GP records progress on their behalf.
- There is no token refresh or revocation. Tokens expire after 12 h.

## Stage 10: live restoration verification and villager notifications

After pulling, reload the database (new verification and notification columns):

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.seed_loader
```

### How restoration is verified (`backend/app/verification.py`)

A recorded repair does not close an incident by itself. The incident closes only when the readings recover.

- **Rule:** tail pressure and tail flow on the repaired pipeline stay within their normal bands for **2 consecutive supply windows** after the repair.
- **What counts as a window.** Normally these are the area's scheduled supply windows (North Area: 06:00–08:00 and 18:00–19:00). In the demo, supply is treated as always on, so each window is a 60 s slot after the repair. Set `JALRAKSHAK_VERIFY_WINDOW_SECONDS` to change the slot length.
- **Which readings count.** Readings count from the second after the repair, so values from the old fault are never included.
- **Each window is judged as one of:**
  - **Passed:** at least 5 trusted readings from each tail sensor, and at least 80% of them inside the normal band.
  - **Failed:** enough readings, but pressure or flow stayed out of band. The verification becomes *Restoration unconfirmed*, and the GP is told to re-inspect.
  - **Inconclusive:** too few readings, or a sensor fault on the node overlapped the window. A sensor fault is never counted as a pass.
- **Counting.** A failed or inconclusive window resets the count. In demo slots, a window with no readings at all is skipped, because the simulator was not running. In a scheduled supply window, silence is inconclusive.
- **What happens on verification.** The incident becomes `VERIFIED_RESTORED`, the villager's timeline shows "Water restored — verified" with the real time, and every villager whose report was grouped under the incident is notified.
- **When checks run.** Checks run on every reading batch and whenever the verification is viewed. They are idempotent, so no window is judged twice and no message is sent twice.
- **Pipelines without tail sensors,** or any other case where the GP closes without sensor proof, are recorded as **"Resolved — not sensor-verified"**. This needs a written reason, is audited, and is never shown as verified.
- **Scope of the check.** These readings show supply only. They are not a water-quality or safety certification.

### Notifications

- Villagers get **in-app** updates when their report is being checked, when the repair starts, and when supply is verified restored (or resolved without sensor proof). Updates are available in English, Telugu and Hindi.
- They appear under **Updates** on the villager's home screen (`GET /notifications/mine`).
- SMS and voice calls are not connected in the prototype, and no phone numbers are stored.
- Live notifications never appear in the public snapshot.

### Story walk-through (continues Stage 9)

1. After **Record repair done** on T-118, the task page shows the live restoration check: the rule, a chart of before and after the repair, and a countdown for the current window.
2. Send normal readings:
   ```powershell
   python simulator\sim.py --scenario normal --interval 2 --count 80
   ```
3. Within about 3 minutes, two windows pass and the card shows **Verified Restored**.
4. Sign in as `villager1`. Complaint #2048 shows "Water restored — verified", and **Updates** lists the three messages.

To see a failed window, send `--scenario leak` after the repair instead.

### Endpoints

`GET /incidents/{code}/verification` (now live: windows, consecutive passes, current window) · `POST /incidents/{code}/resolve` (GP, reason required) · `GET /notifications/mine`

### Tests

`python -m pytest` now runs 113 tests. The new ones cover:
- a pending verification after the repair
- two normal windows verifying, closing the incident and notifying the villager once
- a leak still present failing a window, then recovery
- too few readings, and skipped empty slots
- a sensor fault making a window inconclusive
- scheduled supply windows outside demo mode
- manual resolution and its rules
- pipelines without sensors
- notification privacy

### Known limits of Stage 10

- Bands and thresholds (80% in band, 5 readings) are starting values for the bench rig, not field-validated.
- A failed window asks the GP to re-inspect. It does not yet reopen the task automatically.
- Notifications are in-app only. SMS or IVR delivery needs a provider and consent handling (Stage 11 or later).

## Mentor round: integration, AI monitoring, prediction, and a visual UI

Our mentor reviewed the prototype and asked for four things. All are built, and all run on **demo data**.

| Mentor feedback | What was built |
|---|---|
| Automatic integration with IMIS, Sujal Gaon IDs and other JJM platforms was "not emphasised anywhere". | An **integration hub** with four *sandbox* connectors, an ID crosswalk and a message log (below). |
| An AI/ML platform for real-time monitoring of functional household tap connections and service delivery. | An **AI engine** (anomaly detection, forecasts) and a live **tap-connection monitor** (below). |
| Early identification and prediction of service disruptions, water quality issues and infrastructure failures. | **AI Early Warning**: a pressure forecast, a water-quality outlook and a failure outlook. |
| Show issues on the map from the values captured. UI is mostly text. | A live **Issues layer** on the map, and a visual redesign of the landing page and dashboards. |

After pulling, install the new packages and reload the database (new `integration_events` table):

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m app.seed_loader
cd ..\frontend
npm install
```

### Honesty: the connectors are sandbox connectors

Real access to IMIS, Sujalam Bharat and the JJM Dashboard needs authorisation and the official specifications, which we do not have. So:

- every connector is a **sandbox connector**: messages are built in an *illustrative* format, "accepted" by a sandbox endpoint, and written to a log. Nothing leaves the server.
- every screen says so (a connection status, an amber banner, a sandbox tag on each node of the diagram).
- all IDs are the demo IDs in the seed (`LGD-DEMO-001`, `SG-DEMO-0421`, `SB-DEMO-001`).
- replacing a sandbox connector with a real one means swapping one function (`_log` in `backend/app/integrations.py`). The ID crosswalk, message building and audit log stay.

### Integration hub (`backend/app/integrations.py`)

| Connector | Direction | What it carries |
|---|---|---|
| Sujal Gaon / Sujalam Bharat | pull | village LGD code, Sujal Gaon ID per zone, scheme ID, asset registry |
| IMIS | push | incident status changes, and a monitoring snapshot per sensor node |
| JJM Dashboard | push | functional, partial and non-functional taps per village |
| WQMIS | push | a sample request when the quality outlook says to test water |

- **Automatic.** An incident being opened, assigned, repaired, verified or resolved is pushed to IMIS. Each node's monitoring snapshot goes out about once a minute as readings arrive. Tap functionality and sample requests go out when they change. A failing connector never loses a sensor reading.
- **Sync now** sends everything at once.
- **ID crosswalk.** South has no Sujal Gaon ID in the seed ("not yet issued"), and the screen shows that honestly.
- Messages carry no personal data (no names, phone numbers or complaint text).
- Screen: **Integrations** (GP and officer). It shows a data-flow diagram where lines light up while a message moves, connector cards, the crosswalk and a message log with the full message.
- Endpoints: `GET /integrations` · `GET /integrations/crosswalk` · `GET /integrations/events` · `POST /integrations/sync`.

### AI engine (`backend/app/ml.py`)

Four small, explainable models. **None claims an accuracy**, and the screen says what each was trained on.

1. **Anomaly detection.** An Isolation Forest (scikit-learn) learns normal operation (tail and head pressure and flow, and the head-to-tail flow gap) from 2,000 synthetic windows. It scores the last two minutes of *trusted* sensors and names the readings that are off. The anomaly index is 50 at the edge of normal.
2. **Disruption forecast.** A robust Theil-Sen trend on tail pressure and tank level gives the minutes until the reading leaves its normal band, with a confidence label. A slow slide is flagged **before** the alert rules fire.
3. **Water-quality outlook.** A first-order chlorine decay model. Water that moves slowly is older and has less chlorine left, and very low pressure lets dirty water in. It says **where to collect a field-kit sample**. It is an indicator and never certifies water as safe. Dose (0.8 mg/L) and decay (0.30 per hour) are assumptions and are shown on screen.
4. **Failure outlook.** Mean time between failures from each pipe's repair history, plus its risk score. P-21 fails about every 330 days and its window has passed, so it is flagged HIGH. Pipes with fewer than two failures are marked "too little history".

Faulty sensors are never trusted: the same sensor-health gate as the alert rules applies.

### Tap-connection monitor (`backend/app/fhtc.py`)

For every household in each zone's register (sandbox) it estimates the water reaching the tap from live head and tail pressure and tail flow. Each home is **functional** (55 L/person/day or more), **partly working** (30 to 54) or **not working**. It falls back to recorded baselines and says so when no sensor is live. Screen: **Tap Connections** (a donut, zones, the worst-served homes, and by village for officers).

Endpoints: `GET /predictions` · `GET /fhtc`.

### See it (about 5 minutes)

Run the backend and frontend as usual. Then, in a terminal at the repo root:

```powershell
python simulator\sim.py --scenario degrading --interval 5   # a slow leak: the forecast warns first
python simulator\sim.py --scenario leak --interval 2         # a leak: anomaly, alerts, dry taps, issue pins
python simulator\sim.py --scenario pump-off --interval 2     # every model goes red
python simulator\sim.py --scenario normal --interval 2       # back to normal
```

Sign in as `gp.ramapuram` and open **AI Early Warning**, **Tap Connections**, **Village Map** (the new *Issues* layer is the default) and **Integrations**. Press **Sync now** and open a message to see what would be sent. The officer (`officer.block`) sees the same by village.

### Map: live issues

The Issues layer places every problem where it is happening: sensor alerts, AI warnings, water-quality risk, equipment faults and clusters of taps short of water. Homes below 55 L/person/day are tinted. Pins that would overlap fan out. It also works on the schematic map when the 3D tiles cannot load.

### UI

- **Typography:** headings and big numbers now use Plus Jakarta Sans (firm, upright) with Inter for body text, replacing the thin italic serif. It is set in one place (`frontend/src/styles/fonts.css` and `tailwind.config.js`), so the font can be swapped in one line.
- The landing page now states the three goals as visual cards, over a readable backing.
- The GP dashboard leads with a tap-functionality ring, an AI gauge, a connected-platforms strip and a live pressure chart, and the scripted story card appears only when the backend is off.
- The officer overview adds tap functionality by village and the AI inspection ranking.

### Tests

`python -m pytest` now runs 143 tests. The new ones cover:
- the anomaly model on normal, leak and pump-off readings, and with no trusted data
- the forecast on a slow slide, steady readings and a breach
- the chlorine outlook (OK, watch, at risk) and its baseline fallback
- the repeat-failure interval and village scoping
- tap functionality under a leak and a pump failure
- the integration hub: sandbox labelling, role checks, the crosswalk, sync, one message per state change, no personal data, rate limiting, and a failing connector

### What Siri added (merged before this round)

A water-themed glass UI with dark mode, a 3D terrain map with Sensors, Service, Quality and What-if layers, water-quality field tests, a water-source outlook, a Water Service Score, missed-call and WhatsApp reporting, and several complaints per villager.

### Known limits of this round

- **The connectors are sandbox connectors.** The message format is illustrative, not the official schema.
- **The models are fitted on demo data only.** Dose and decay in the chlorine model are assumptions.
- Tap functionality is an estimate from pipeline sensors. It needs household tap sensors or sample meters to be a measurement.
- The failure outlook needs at least two recorded failures per pipe.
- The water-quality field tests logged on the Quality page are still kept in the browser only.
- The landing video and satellite imagery come from outside services (see the handover document).

## Problem-statement coverage round

We reviewed the prototype against the full SIH26255 problem statement (software only) and built what was missing. **Read `docs/Requirements_Coverage.md` first:** it lists every requirement, where it is built, whether it runs on demo data or is sandbox, and what is still missing.

After pulling, reload the database (new tables and columns) and reinstall nothing new; the schema changed:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.seed_loader
cd ..\frontend
npm install
```

### What was added

| Requirement | What you can now do |
|---|---|
| Household-level monitoring | Every household has a tap ID (built on its zone's Sujal Gaon ID) and a status. **Tap Connections** lists and filters household taps; each has a detail page. |
| Village feedback and validation | The villager's home has **My tap**: a daily "did water come, was it enough, how did it look, rate the service" check. It corrects the sensor-based estimate for that home and says when a fault looks local (network fine, home dry). |
| Geo-tagged observations | On the report form a villager can tap the village map and agree to share the spot. Only a place about 25 m wide inside their own zone is stored. |
| Water-quality alerts | Field-test results are now stored on the server and judged against IS 10500. A failed tap test raises an alert, sends a boil-water advisory (English, Telugu, Hindi) to villagers of that zone, and goes to WQMIS (sandbox). Wording is "passed" and "failed": a field kit is a screening tool, never a safety certificate. |
| Alerts of every kind | **Alert Center**: supply, equipment, AI predictions, water quality and community reports in one feed, with acknowledgement and escalation after 30 minutes. |
| Abnormal patterns | New models: supply regularity (steady, intermittent, off) and DBSCAN clusters of villager reports. |
| Preventive maintenance | **Maintenance Planner** ranks pipelines for inspection with the reasons, and plans an inspection (incident plus task) in one step. "No fault found" closes it without counting as a failure. Overdue tasks are now real. |
| Multi-level analytics and GIS | Officer **Analytics**: State, District, Block, Village, Zone, with drill-down, response times, a village map and open-data exports (CSV, GeoJSON). **Audit and system** shows the audit log and deployment facts. |
| Sync of everything | The sandbox connectors now carry alerts, incidents, monitoring, tap-level status, test results, and anonymised feedback and service validations, through a fifth connector (Meri Panchayat). |
| Security, scalability, deployment | Security headers, rate limits, request-size limit, a production start-up guard, automatic deletion of old readings, a PostgreSQL connection pool, an idempotent `app.init_db`, Dockerfiles, `docker-compose.yml`, `.env.example`, `docs/DEPLOYMENT.md` and an exported `docs/openapi.json`. The Docker and PostgreSQL files have **not been run yet**. |

### Try it (about 10 minutes)

```powershell
python simulator\sim.py --scenario leak --interval 2          # a leak
python simulator\sim.py --scenario intermittent --interval 2  # water that stops and starts
```

1. Sign in as `villager1`. On the home screen, under **My tap**, answer "No" to "Did you get water today?" and send it.
2. Sign in as `gp.ramapuram`. Open **Tap Connections**: that household now shows as not working, with a "likely local fault" reason on its detail page. Open **Alert Center** to see every alert kind; acknowledge one.
3. Open **Water Quality** and log a failing tap test (for example, bacteria present). A boil-water advisory reaches the villager's **Updates**.
4. Open **Maintenance Planner** and plan an inspection for P-21. It appears in **Maintenance** as a preventive task.
5. Sign in as `officer.block`. Open **Analytics** and drill from the State down to a zone; export a CSV; open **Audit and system**.

The new simulator scenario is `intermittent` (ten ticks of water, ten dry). New endpoints include `/service-checks`, `/households`, `/water-quality`, `/alerts/feed`, `/maintenance/priorities`, `/analytics/summary`, `/geo/villages.geojson` and `/export/{dataset}.csv`; see `docs/openapi.json`.

### Tests

`python -m pytest` now runs 257 tests. The new ones cover the IS 10500 verdicts, advisories, household fusion (including the local-fault logic), the Alert Center and its escalation, DBSCAN clusters and supply regularity, the planner and its "no fault found" path, multi-level analytics and scoping, exports (anonymous, formula-safe), the audit log, geo-tag validation, the community and tap-level sync, the rate limiter, the production guard and the retention job.

### Known limits of this round

- Everything runs on demo data, and the platform connectors are sandbox connectors. See `docs/Requirements_Coverage.md` for the full list, including what is not built (native app, SMS delivery, real integration, migrations, load tests).
- Household status is an estimate plus the villager's own check; there are no household tap sensors.
- Telugu and Hindi strings for the new villager screens are first drafts and need native-speaker review.


## Field hardware, firmware and the new sensor channels

`hardware/` holds the sensor-node firmware (MicroPython for the ESP32), the Raspberry Pi gateway bridge, an ESP32 virtual-board project for wokwi.com, and a README with the parts list and wiring. The platform now also receives **acoustic (leak noise)** and **residual-chlorine** readings: a leak raises an `ACOUSTIC_LEAK_SIGNATURE` alert that backs up the flow-gap rule, and a measured chlorine value replaces the modelled one in the water-quality outlook. New simulator scenario: `chlorine-drop`. `python -m pytest` now runs 278 tests, including the firmware against the real API. The board layer (`board.py`) has not run on real hardware yet.

## Submission material

`docs/submission/` holds the SIH idea deck (`JalRakshak_SIH26255_Idea_v9.pptx` and `.pdf`) and the architecture and circuit diagrams (`architecture/`: `.drawio`, `.mmd`, `.svg`, `.png`). `docs/Requirements_Coverage.md` maps every point of the problem statement to what is built, and `hardware/README.md` explains the node firmware, gateway and the ESP32 simulation project.
