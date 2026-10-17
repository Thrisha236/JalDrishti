# JalRakshak — Project Foundation & MVP Plan

*Your Water. Your Village. Your Voice.*
Prepared 16 October 2026. Planning document only: no application code yet.

---

## How to read this document

Every claim carries a tag:

| Tag | Meaning |
|---|---|
| **[V]** | **Verified** on 16 Oct 2026 against an authoritative source (link given) |
| **[R]** | **Research-file claim** from `01_…Research.md` or `02_…Demo_Notes.md`, *not* re-verified today |
| **[D]** | **Our proposed design**: a decision, not a fact |
| **[S]** | **Simulated / illustrative prototype content**: must be labelled on screen |

---

## A. What I understood from the three files

**File 01 (main research)** argues that PS 26255 is not about building taps. It is about knowing, continuously, whether an *existing* tap actually delivers adequate, regular, acceptable-quality water. It documents that JJM already has a lot: dashboard, WQMIS, Web APIs, Sujalam Bharat / Sujal Gaon IDs, Meri Panchayat, IoT pilots with LoRa + solar, and a 2023 pilot with a consumer complaint app. It concludes the defensible contribution is **evidence fusion**: an "operational intelligence layer" that joins sensors + citizens + history + GIS + asset identity into one prioritised, verified maintenance action. It is hardware-first ("get the hardware producing real data first").

**File 02 (supporting notes)** is a later, tighter revision under the name *JalDrishti*. It **cuts** chlorine, vibration, valve sensors, LSTM and per-home meters; uses two ESP32 nodes (pump/tank and tail end), LoRa P2P → Raspberry Pi gateway → 4G → MQTT → FastAPI → PostgreSQL/PostGIS/Timescale; a staged ML pipeline (rules → sensor-health → EWMA → Isolation Forest → DBSCAN on complaints → explainable fusion score); 10 demo scenarios; and a strict "claims we can / cannot make" list.

**README_FIRST.txt** only describes the pack and repeats the honesty rules (illustrative numbers, no claimed integration).

**Your master brief** keeps the evidence-fusion core but **adds two things neither file designs in depth**: (1) a *pipeline-health profile* (age, material, corrosion, repair history → interpretable risk score), and (2) *citizen photo analysis*. It also puts the software prototype first (Stitch → React → simulator) and treats hardware as a later integration.

---

## B. Verification results (checked today)

| Fact | Status | Detail |
|---|---|---|
| PS **SIH26255** exists, MoJS, Hardware, Clean & Green Technology | **[V]** | Wording matches file 01 exactly. [SIH 2026 PS list](https://www.sih.gov.in/sih2026PS) |
| Idea-submission deadline | **⚠️ Conflicting official dates** | PS list shows **20 Oct 2026**; the homepage banner says nomination + idea submission was "extended to 09 Oct 2026"; the Guidelines PDF says 30 Sept 2026. **Confirm with your college SPOC.** See `Idea_Submission_Pack.md` §0. |
| 2024 Functionality Assessment figures | **[V] with caveats** | Official report: [FHTC National Report 2024](https://jaljeevanmission.gov.in/sites/default/files/2025-12/FHTC_National%20Report%202024.pdf). Taps 98.1% · working taps 86.5% · regular (as per schedule) 83.6% · quantity 55 LPCD 80.2% · quality (% of *samples* passed) 76.0% · **functionality status of household tap connections 76.0%** |
| Survey base | **[V]** | 19,812 HGJ villages / 2,37,608 HH / 761 districts / 34 States/UTs were *sampled*. 411 villages had no tap connections and were excluded, so the **analysis base is 19,401 villages and 2,32,691 households**. Figures are **weighted estimates**. Fieldwork was by Ipsos; the frame was HGJ villages with a PWS of ≥20 connections, drawn from IMIS. |
| FHTC definition (report) | **[V]** | "receiving water in adequate quantity of prescribed quality with regular supply." **Pressure is not part of this definition.** The report only measures pressure *satisfaction* (83.5%). |
| Sujal Gaon ID meaning and count | **[V]** | A Sujal Gaon ID is for a **water-supply service area (habitations) meeting prescribed standards**. A **Sujalam Bharat ID** is for a **scheme**. As of 10.08.2026, 12,67,808 of 16,96,213 habitations had one (75%). [PIB, 13 Aug 2026](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2298959) |
| Sujalam Bharat | **[V]** | A federated DPI for rural piped water schemes: asset registries, GIS, decision support, integrated with PM GatiShakti (same PIB release) |
| JJM extended to Dec 2028, ₹8.69 lakh crore, focus on service delivery | **[V] (secondary)** | Approved around 10–11 Mar 2026. [PM India](https://www.pmindia.gov.in/en/news_updates/cabinet-approves-extension-of-jal-jeevan-mission-jjm-period-up-to-december-2028-with-enhanced-outlay-and-restructured-implementation-focusing-on-structural-reforms-in-rural-drinking-water-supply-sec), [Drishti IAS](https://www.drishtiias.com/daily-updates/daily-news-analysis/cabinet-extends-jal-jeevan-mission-till-2028/print_manually). The PIB page blocked automated fetch, so open PRID 2237548 by hand. |
| Jal Seva Aankalan | **[V]** | A GP-led digital self-assessment of regularity, adequacy, quality and sustainability, launched 30 Dec 2025. [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2209798). The "30-day citizen feedback window" in file 02 was **not** confirmed in the text I read. |
| Other useful 2024 report figures | **[V]** | VWSC present in 55.2% of villages · FTK available in 27.2% · skilled O&M manpower in 58.1% · functional scheme on survey day 84.8%. These support the case for better O&M tooling. |
| Current national coverage | **[V] (secondary)** | About 15.80 crore (81.61%) rural HH as of March 2026 per cabinet-briefing coverage. Recheck on the [JJM dashboard](https://www.ejalshakti.gov.in/JJMReport/JJMIndia.aspx) before quoting. |
| Background: CAG 2026 audits (e.g. MP) flag dashboard misreporting and "FHTC without water supply" | **[V] (title-level)** | [CAG MP JJM Report No. 5 of 2026](https://saiindia.gov.in/webroot/uploads/download_audit_report/2026/MP-JJM-Report-No.-5-of-2026-Bhopal---English-06a674f93c3faf1.25493877.pdf). This is strong motivation for *verified* service status, but read the chapter before citing specifics. |

---

## C. Contradictions and gaps found

| # | Issue | Where | Recommendation |
|---|---|---|---|
| C1 | **Sujal Gaon ID meaning is reversed.** File 02 calls it a "scheme-based unique ID". PIB says Sujal Gaon = *service area*, Sujalam Bharat = *scheme*. The brief's entity "schemes/Sujal Gaon IDs" inherits the error. | File 02 §8, brief §10 | Use the PIB definition. `service_areas.sujal_gaon_id` (nullable, because IDs are only issued to areas meeting standards) and `schemes.sujalam_bharat_id`. Both are **mock** in the prototype. |
| C2 | **The "76%" quality figure is not a household percentage.** File 01 says "76% were receiving water meeting quality standards". The report says "% of *sample* passed", with samples from about 2 HH per scheme. It is a coincidence that this equals the 76.0% functionality figure. | File 01 §3 | Pitch line: "98.1% of surveyed households in Har Ghar Jal villages had a tap; the assessed functionality status was 76.0% (FA 2024, weighted sample estimate)." Don't present quality as 76% of households. |
| C3 | **Pressure is in file 01's FHTC definition but not in the 2024 report's.** | File 01 §1, §14 | Treat pressure as *our* operational indicator of service adequacy, not as part of the official FHTC definition. |
| C4 | **The deadline makes the 15-day build plan obsolete.** Only the idea submission is due 20 Oct. | File 01 §38, §58 | Split into **Phase 0 (by 20 Oct): idea submission** and **Phase 1+: build for internal hackathon / finale** (finale dates unverified; check the portal). |
| C5 | **Hardware-first (files) vs software-first (brief).** The PS category is **Hardware**, so judges will expect a physical rig. | File 01 §12, §58 vs brief §9, §13 | Run both tracks in parallel: software on a simulator now, plus a *minimal* bench rig (pump, tank, 2× flow, 2× pressure, level, pump current) that feeds the same ingest API. Don't leave hardware to the end. |
| C6 | **Image analysis.** File 02 has none. The brief makes it central. | Brief §6 | MVP = clearly labelled simulation. A real CV model is a later, separately evaluated phase. It is supporting evidence, never the core differentiator. |
| C7 | **Pipeline age/material/corrosion risk is not designed in either file.** File 02 defines predictive maintenance as *operating-trend drift* (pump current, pressure-per-flow). | Brief §5 | Combine them: a records-based risk score plus trend-drift factors where a sensor exists. Show "data missing" honestly. |
| C8 | **Probability-like numbers.** File 01 has "91% confidence", "leak probability 0–100%", "Pump Health 42%", "87% likelihood". File 02 has "confidence 0.88". The brief has "risk 72%". | File 01 §25, 27, 37, 46; brief §5 | None of these are calibrated. Rename to **"evidence score"** and **"risk score (0–100)"**, never "%" or "probability". |
| C9 | **Auto-closure.** File 01 says "Alert automatically closed". The brief says don't claim confirmation without data. | File 01 §52 | Three outcomes: *Verified Restored* (sensor window passed) · *Resolved – not sensor-verified* (no sensor on that segment; citizen/official confirmation only) · *Restoration not confirmed* (readings didn't recover → reopen). |
| C10 | **Stack drift.** File 01 offers Node *or* FastAPI and RN/Flutter. File 02 offers FastAPI + PWA + Timescale + WebSocket. The brief offers FastAPI + React + polling. | — | Settled in §3 below: FastAPI, React PWA, polling, PostgreSQL (no Timescale for MVP). |
| C11 | **Environment.** Your project folder is empty (no existing repo to extend). Node 24 is installed. **Python and PostgreSQL are not installed.** | Checked locally | Install Python 3.12 in Stage 3. Start with SQLite behind SQLAlchemy and switch to PostgreSQL before the multi-user/GIS stage (one config line). |
| C12 | **Name.** File 02 uses "JalDrishti". | — | Use JalRakshak everywhere. |
| C13 | **Unsourced costs.** File 02's hardware prices are "market-experience estimates", not quotes. | File 02 §5 | Get 2–3 real supplier quotes before putting a budget in the PPT. |
| C14 | **Affected-household estimates** need a household↔zone↔pipe mapping that doesn't exist in public data. | Both files | Show "≈ N households (estimate from mock zone register)" only when a zone has a recorded HH count; otherwise "not estimable". |

**Missing information you should decide or collect:** team size and skills; hardware budget and what you already own; whether internal-hackathon/finale dates require a working rig; which real village (if any) inspires the demo geography (use a fictional village to avoid privacy issues); the idea-submission template the portal requires.

---

## 1. JalRakshak in plain language

A village can have a tap at every house and still have no water at 7 a.m. Officials often learn this late, from a complaint or a periodic survey. JalRakshak is a small "control room" for a village water scheme. It:

1. **Watches** a few key points (pump, tank, start and end of a pipeline) and keeps a record of every pipe's age, material and past problems.
2. **Listens** to villagers, who can report "no water / low water / dirty water / leakage" in Telugu, Hindi or English, with a photo.
3. **Joins the dots.** If an old pipe with past leaks shows a pressure drop *and* three nearby people report low water, that becomes one high-priority inspection, with the reasons listed.
4. **Acts.** The Gram Panchayat turns it into a repair task and tracks it.
5. **Proves it.** After repair, readings must stay normal for a set time before the system says "Verified Restored", and the villager is told.

**The actual problem [V]:** in FA 2024, 98.1% of surveyed households in Har Ghar Jal villages had a tap, but the assessed functionality status was 76.0% ([report](https://jaljeevanmission.gov.in/sites/default/files/2025-12/FHTC_National%20Report%202024.pdf)). A tap is an asset; water service is the outcome.

---

## 2. Strongest differentiator vs existing JJM systems

**Differentiator [D]: closed-loop, evidence-backed service assurance.** Each incident links *why we think there's a problem* (evidence), *what was done* (task), and *proof it was fixed* (verification), at asset level.

| Existing system | What it already does | What JalRakshak adds (proposed, complementary) |
|---|---|---|
| JJM Dashboard / IMIS **[R]** | Coverage, progress, reporting | Day-to-day service *incidents* per asset |
| WQMIS **[R]** | Lab/FTK quality results | Turns sensor *indicator* anomalies into "collect a sample" tasks. Never certifies safety. |
| Sujalam Bharat / Sujal Gaon **[V]** | Scheme and service-area identity, GIS, asset registry | Uses those IDs as keys (mock), attaches incident and repair history to them |
| Jal Seva Aankalan **[V]** | Periodic GP self-assessment | Continuous, event-level evidence between assessments |
| Meri Panchayat **[R]** | Citizen participation | Complaints become *structured evidence* linked to a pipe |
| IoT pilots **[R]** | Village-level sensing with LoRa/solar | Sensor-fault vs water-fault gating, fusion with complaints, verified closure |

Pitch wording: *"We did not find* a public system that joins these into one verified loop." Never say "no system exists".

---

## 3. Layered architecture and data flow [D]

```
┌──────────────────────────── 1. FIELD (real concept / bench rig / simulator) ────────────────────┐
│ Source → Pump → Tank → Head of pipeline → … → Tail → Service zones → Households                    │
│ [pump current] [tank level] [head flow+pressure] [tail flow+pressure] (quality indicators: optional)│
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
          │ MVP: Python sensor SIMULATOR posts readings (labelled [S])
          │ Later: ESP32 nodes → LoRa → Pi gateway (buffer) → MQTT → bridge
          ▼
┌──────────── 2. INGEST ────────────┐   ┌──────────── 3. CITIZEN INPUT ─────────────┐
│ POST /ingest/readings (device key) │   │ PWA: category, photo, voice, coarse location │
│ validate · range-check · heartbeat │   │ POST /complaints, /complaints/{id}/media     │
└───────────────┬────────────────────┘   └──────────────────┬───────────────────────────┘
                ▼                                           ▼
┌──────────────────────── 4. DATA (SQLite → PostgreSQL; PostGIS later) ─────────────────────────┐
│ villages · service_areas(sujal_gaon_id*) · schemes(sujalam_bharat_id*) · assets · pipelines   │
│ sensors · readings · complaints · media · alerts · incidents · evidence · risk · tasks ·      │
│ verifications · audit_log                      (*mock IDs)                                    │
└───────────────┬───────────────────────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────── 5. INTELLIGENCE (Python modules, run on schedule/trigger) ────────────┐
│ A Rules  →  Sensor-health gate  →  B Anomaly (robust z / EWMA; IsolationForest later)          │
│ C Pipeline risk score (records + trends)   D Image observation (SIMULATED in MVP)             │
│ E Evidence fusion → incident {priority, evidence list, probable cause, missing data}          │
└───────────────┬───────────────────────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────── 6. WORKFLOW ──────────────────────────────────────────────────────────┐
│ Incident → Maintenance task → progress updates → Verification window → status → notify      │
└───────────────┬───────────────────────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────── 7. APPS (one React PWA, role-based) ──────────────────────────────────┐
│ Citizen (mobile-first, 3 languages) · Gram Panchayat (village ops) · Govt Officer (multi-village)│
│ Polling every 10–15 s for live views; WebSocket only if needed later                          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
     Integration adapter (stub): get_scheme(), get_service_area(), push_incident()
     → returns mock data; real JJM / Sujalam Bharat access requires authorisation.
```

**Stack decision [D]:**

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + Tailwind + React Router + i18next + Recharts + Leaflet/OSM | One PWA for all roles, free maps |
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic + Pydantic | Same language as ML. Only one backend. |
| DB | SQLite (Stages 3–6) → PostgreSQL 16 (Stage 7+) → PostGIS when spatial queries are needed | Zero-install start, then a one-line URL switch |
| Files | Local `uploads/` folder outside web root; served via an authorised endpoint | Privacy |
| ML | pandas, NumPy, scikit-learn | Light, explainable |
| Auth | Demo login (labelled) → JWT access token + role claim + hashed passwords | Honest progression |
| Hardware (parallel track) | ESP32 + LoRa P2P → Raspberry Pi → MQTT (Mosquitto) → bridge to `/ingest` | The same ingest contract as the simulator |

---

## 4. MVP scope vs later

**MVP: one village, one story, all three roles [D]**

| In MVP | Real or simulated |
|---|---|
| Role-select demo login (3 roles) | Real UI; auth **labelled demo** until Stage 9 |
| Fictional village "Ramapuram" [S], 3 zones (North/Central/South), 1 scheme, ~8 assets incl. **Pipeline P-21 (North Area)** | Mock data, mock IDs |
| Sensor simulator: head/tail flow and pressure, tank level, pump current; scripted fault on P-21; node-offline scenario | **[S]** |
| Rules + sensor-health gate + robust z-score anomaly | Real code on simulated data |
| Pipeline profile + interpretable risk score with factor breakdown | Real code; inputs **[S]** |
| Complaint flow: 7 categories, photo upload/preview/replace, description, optional coarse location, complaint ID, timeline | Real |
| Image "observation" | **Simulated, with a banner** |
| Evidence fusion → incident with evidence list | Real code |
| Maintenance task create/assign/update | Real |
| Verification window on post-repair readings → three-outcome status | Real code on simulated readings |
| Village map (Leaflet) with zones, P-21, complaint pins (coarse) | Real UI, mock geometry |
| English + Telugu + Hindi for **citizen screens** | Real (translations reviewed by native speakers) |
| Officer multi-village view | 3 villages; 2 are lightweight mock data **[S]** |

**Later enhancements:** voice notes and speech-to-text · real CV model · Isolation Forest/DBSCAN · PostGIS network tracing · WebSockets · SMS/WhatsApp notifications · bench-rig hardware via MQTT · quality-indicator sensors (with "confirm by test" flow) · offline PWA queueing · reports/PDF export · real integration (only with authorisation).

---

## 5. Database entities and relationships [D]

```
village 1─* service_area *─* scheme            (scheme_service_area join)
service_area 1─* asset ; scheme 1─* asset
asset 1─1 pipeline_profile (when type = pipeline)
asset 1─* inspection ; asset 1─* repair ; asset 1─* risk_assessment
asset 1─* sensor_node 1─* sensor 1─* reading
service_area 1─* supply_schedule ; service_area 1─* quality_observation
user (role, village_id, service_area_id, language)
user(citizen) 1─* complaint *─1 service_area ; complaint 0..1─* asset (linked_asset_id, set by official)
complaint 1─* complaint_media 1─* image_analysis
alert *─1 asset/sensor  (kind: WATER_SERVICE | EQUIPMENT_HEALTH)
incident 1─* incident_evidence  → points at alert | complaint | inspection | risk_assessment | image_analysis
incident 1─* maintenance_task 1─* task_update
incident 1─* verification
complaint *─0..1 incident
notification *─1 user ; audit_log (every write)
```

Key columns (abridged):

| Table | Important fields |
|---|---|
| `village` | id, name, district, state, `lgd_code` (mock), `is_mock` |
| `service_area` | id, village_id, name, `sujal_gaon_id` (nullable, mock), `household_count` + `household_count_source`, polygon (GeoJSON text → PostGIS later) |
| `scheme` | id, name, `sujalam_bharat_id` (mock) |
| `asset` | id, code (`P-21`), type (source/pump/tank/pipeline/valve/standpost), scheme_id, service_area_id, geometry |
| `pipeline_profile` | asset_id, material + `material_source` (record/inspection/unknown), diameter_mm, install_date + `install_date_source` (record/estimate) |
| `inspection` | asset_id, date, method (visual-exposed/excavation/CCTV/other), corrosion_grade, notes, evidence_media |
| `repair` | asset_id, task_id, date, failure_type, notes |
| `sensor_node` / `sensor` | code, asset_id, kind, unit, `is_simulated`, last_seen_at, battery_v |
| `reading` | sensor_id, ts, value, quality_flag (ok/out_of_range/stuck/missing) |
| `complaint` | public_code (`2048`), citizen_id, service_area_id, category, description, lat/lon rounded (~1 km) + `location_precision`, status, linked_asset_id |
| `complaint_media` | storage_key, mime, sha256, exif_stripped (bool) |
| `image_analysis` | media_id, `engine` (`simulated-v0`), `is_simulated`, observation_code, note |
| `alert` | rule_code, kind, severity, asset_id, raised_at, cleared_at, details JSON |
| `incident` | code, asset_id, service_area_id, status, priority, evidence_score, probable_cause, affected_hh_estimate, affected_hh_basis |
| `incident_evidence` | incident_id, type, ref_id, contribution, explanation |
| `risk_assessment` | asset_id, score 0–100, band, factors JSON, missing JSON, config_version, computed_at |
| `maintenance_task` / `task_update` | assignee, due_at, status, note, photo |
| `verification` | incident_id, method (sensor_window/manual/citizen), window_start/end, result (verified/not_restored/insufficient_data), metrics JSON |
| `audit_log` | actor_id, action, entity, entity_id, at, diff JSON |

**State machines**
- Complaint: `SUBMITTED → UNDER_REVIEW → LINKED → REPAIR_IN_PROGRESS → RESOLVED_VERIFIED | RESOLVED_UNVERIFIED | CLOSED_NO_FAULT`
- Incident: `OPEN → TRIAGED → TASK_ASSIGNED → REPAIR_DONE → VERIFYING → VERIFIED_RESTORED | RESTORATION_UNCONFIRMED (→ reopen) | RESOLVED_UNVERIFIED`

---

## 6. API groups and example shapes [D]

Base path `/api/v1`. Roles: `citizen`, `gp`, `officer`, plus `device` for ingest.

| Group | Endpoints (main) | Roles |
|---|---|---|
| Auth | `POST /auth/demo-login`, later `POST /auth/login`, `GET /auth/me` | all |
| Geography | `GET /villages`, `GET /villages/{id}`, `GET /villages/{id}/service-areas`, `GET /villages/{id}/map` (GeoJSON) | gp/officer; citizen = own village only |
| Status | `GET /service-areas/{id}/status` (citizen-friendly status + schedule) | all |
| Assets | `GET /assets?village_id=`, `GET /assets/{id}`, `GET /assets/{id}/history`, `GET /pipelines/{id}/risk` | gp/officer; citizen gets the simplified view |
| Telemetry | `POST /ingest/readings` (device key), `GET /sensors/{id}/readings?from&to` | device / gp/officer |
| Alerts | `GET /alerts?village_id&kind&open=true` | gp/officer |
| Complaints | `POST /complaints`, `POST /complaints/{id}/media`, `GET /complaints/mine`, `GET /complaints?village_id&status`, `PATCH /complaints/{id}` (link asset, status) | citizen (own) / gp |
| Incidents | `GET /incidents`, `GET /incidents/{id}` (incl. evidence), `POST /incidents/{id}/recompute` | gp/officer |
| Maintenance | `POST /tasks`, `PATCH /tasks/{id}`, `POST /tasks/{id}/updates` | gp |
| Verification | `POST /incidents/{id}/verify` (runs window check), `GET /incidents/{id}/verification` | gp |
| Reports | `GET /reports/overview?district=`, `GET /reports/repeat-failures` | officer |
| Demo control | `POST /demo/scenario/{name}`, `POST /demo/reset` (disabled outside demo mode) | admin/demo |

**Example: submit a complaint**
```http
POST /api/v1/complaints
{ "category": "LOW_WATER", "service_area_id": "sa-north",
  "description": "Very low water since morning",
  "location": { "lat": 17.3851, "lon": 78.4867, "precision": "approx_1km" } }

201 Created
{ "id": "c_01J…", "public_code": "2048", "status": "SUBMITTED",
  "created_at": "2026-11-03T07:12:00+05:30",
  "next": { "upload_media": "/api/v1/complaints/c_01J…/media" } }
```

**Example: image observation (MVP)**
```json
{ "media_id": "m_88", "engine": "simulated-v0", "is_simulated": true,
  "observation_code": "POSSIBLE_VISIBLE_LEAK",
  "message": "Possible leakage visible near a pipe — inspection recommended.",
  "disclaimer": "Prototype simulation. Not an AI diagnosis. A photo cannot show buried pipe condition." }
```

**Example: pipeline risk**
```json
{ "asset": "P-21", "score": 72, "band": "HIGH", "label": "Inspect soon",
  "is_illustrative": true, "config_version": "risk-v0.1",
  "factors": [
    { "name": "Age", "value": "17 yrs (record)", "points": 20, "max": 25 },
    { "name": "Prior failures (36 mo)", "value": 3, "points": 20, "max": 25 },
    { "name": "Corrosion observation", "value": "67/100, visual, exposed section, 2026-06", "points": 12, "max": 20 },
    { "name": "Pressure-per-flow trend", "value": "-18% vs baseline (simulated)", "points": 12, "max": 20 },
    { "name": "Material susceptibility", "value": "iron (record)", "points": 8, "max": 10 } ],
  "missing": ["diameter", "soil data"],
  "statement": "Risk score indicates inspection priority. It is not a failure probability." }
```

**Example: incident with evidence**
```json
{ "code": "INC-0311", "asset": "P-21", "service_area": "North Area",
  "status": "TRIAGED", "priority": "HIGH", "evidence_score": 0.81,
  "probable_cause": "Possible leak or partial blockage on P-21 (unconfirmed)",
  "affected_households": { "estimate": 64, "basis": "mock zone register: North Area" },
  "evidence": [
    { "type": "ALERT", "ref": "AL-77", "text": "Tail pressure 41% below baseline for 25 min during scheduled supply", "contribution": 0.35 },
    { "type": "COMPLAINTS", "ref": ["2048","2049","2051"], "text": "3 low-water reports within 600 m in 40 min", "contribution": 0.25 },
    { "type": "RISK", "ref": "RA-12", "text": "P-21 risk score 72 (age, 3 prior failures)", "contribution": 0.15 },
    { "type": "IMAGE", "ref": "m_88", "text": "Simulated observation: possible visible leak", "contribution": 0.06 } ],
  "sensor_health": "OK", "uncertainties": ["No middle-pipeline sensor; leak location not localised"] }
```

---

## 7. Pipeline-risk method and image-analysis plan

### 7a. Pipeline risk: interpretable, configurable points score [D]

`score = Σ factor points (each capped)`, with weights in `risk_config.yaml` so judges and officials can inspect and change them.

| Factor | Source | Rule (initial, tunable) | Cap |
|---|---|---|---|
| Age | `install_date` (record) or estimate | 0 pts < 5 yrs, rising linearly to the cap at ≥ 20 yrs. **Halve the points if the date is an estimate.** | 25 |
| Prior failures | `repair` in last 36 months | 0 → 0, 1 → 8, 2 → 14, 3 → 20, 4+ → 25 | 25 |
| Corrosion observation | latest `inspection` | grade bands 0–39 → 0, 40–59 → 6, 60–79 → 12, 80+ → 20; ×0.5 if older than 24 months; not applicable to plastic pipes. **Exposed sections or excavation only.** | 20 |
| Hydraulic trend | readings, only if the segment has sensors | pressure-per-flow drop vs 14-day baseline: < 5% → 0, 5–15% → 6, 15–25% → 12, ≥ 25% → 20 | 20 |
| Material susceptibility | record/inspection only | iron/cast iron 8, steel 6, ductile iron 5, PVC/HDPE 2, unknown 4, **marked as an assumption to validate** | 10 |

> The exact rules live in `seed/ramapuram.json` → `risk_config` and are checked by `scripts/validate-seed.mjs`. They were finalised in Stage 1 so P-21's illustrative 72/100 is reproducible from its facts.

Bands: 0–39 Low · 40–64 Medium · 65–100 High. The output always includes factor points, **data coverage** (e.g. "4 of 5 factors available") and a missing-data list.

**Limitations:** weights are expert judgement, not learned. The score ranks inspections; it does not predict breaks or remaining life. With no failure labels, no accuracy can be stated. A later ML stage (e.g. survival analysis or gradient boosting) needs years of asset + failure records per network.

### 7b. Anomaly and fusion [D]
- **Phase A rules:** flow ≈ 0 during a scheduled window; tail pressure < X% of baseline for ≥ N min; tank below low mark; pump current ≈ 0 during the window; overflow.
- **Sensor-health gate:** heartbeat missing → `EQUIPMENT_HEALTH: Node offline`, *not* a water alert. Stuck value, out of range, or physically inconsistent (flow > 0 with pump current 0) → mark the sensor suspect and drop its weight to 0.
- **Phase B:** robust z-score/EWMA on 1-min features; Isolation Forest later, trained on *normal* (simulated or rig) runs only and tested on injected faults.
- **Fusion:** `evidence_score = clip(0.35·sensor + 0.25·complaints + 0.15·risk + 0.15·schedule_context + 0.10·image)`. Priority HIGH needs **≥ 2 independent evidence types**. Every term is stored in `incident_evidence`. It is called an *evidence score*, never a probability.
- **Verification:** after `REPAIR_DONE`, require tail pressure/flow within baseline band for ≥ 2 scheduled supply windows (demo: compressed to minutes, labelled). No sensor on that segment → `RESOLVED_UNVERIFIED` with an explicit note.

### 7c. Image analysis plan
- **MVP:** a deterministic simulation keyed to the chosen category and demo images. It shows "Checking image…" then an observation with a **"Prototype simulation"** banner. The image stays attached for authorised GP/officer roles only.
- **Real model (later):** 4 classes: *visible water leak/pooling near pipe*, *visible corrosion on exposed pipe/fitting*, *damaged tap/fitting*, *none/unclear*. Use transfer learning (MobileNetV3/EfficientNet-B0) for classification first; detection (e.g. YOLO-family) only if localisation is needed.
- **Data:** team-collected photos with consent, plus openly licensed images (check each licence). Aim for ≥ 150–300 per class, labelled by 2 people with agreement measured. Split by *location/source* so near-duplicates don't leak between train and test.
- **Metrics:** per-class precision/recall, macro-F1, confusion matrix. **Calibrate** (reliability plot/ECE) before ever showing a confidence. Include an "unclear → human review" abstain threshold.
- **Limits (put on screen):** a photo cannot reveal buried pipe condition, material or future failure, and it cannot judge water safety. Strip EXIF/GPS on upload and blur faces if present.

---

## 8. Google Stitch screen map and click-through [D]

**Shell:** left sidebar on desktop, bottom nav on mobile (citizen). Status colours: green / amber / red, each with an icon + word (never colour alone).

| ID | Role | Screen | Key elements |
|---|---|---|---|
| S01 | All | Language + role select | EN/తె/हि toggle; 3 large role cards; "Demo login" badge |
| C01 | Citizen | Home | "Water Available / Low Supply / Problem in Your Area"; today's schedule; banner "A pipeline in your area may need attention"; big "Report a Problem" |
| C02 | Citizen | Water Status | Zone status, next supply time, simple history (last 7 days) |
| C03 | Citizen | Pipeline Health (simple) | "Pipes in your area": P-21 "Being watched", plain words, no numbers jargon |
| C04 | Citizen | Report: choose issue | 7 large icon tiles |
| C05 | Citizen | Report: photo + details | Capture/upload, preview, remove/replace, description, voice (later), area, location toggle (coarse) |
| C06 | Citizen | Checking image | Spinner → observation card + "Prototype simulation" label |
| C07 | Citizen | Confirmation | "Complaint #2048 received", what happens next |
| C08 | Citizen | My Complaints / timeline | Received → Checking → Repair started → Fixed / Verified Restored |
| C09 | Citizen | Village map | Zones, own complaint pin (coarse) |
| C10 | Citizen | Help & language | Helpline, how-to, language |
| G01 | GP | Village dashboard | KPI cards (open incidents, complaints, tasks overdue, zones affected), alert strip |
| G02 | GP | Water service status | Zone table + live charts (simulated badge), sensor-health panel |
| G03 | GP | Pipeline health list | Assets with risk band, sort by score |
| G04 | GP | Pipeline detail P-21 | Profile, data-source tags, factor breakdown, history, trend chart |
| G05 | GP | Complaint inbox | Thumbnails, category, zone, time, "link to asset" |
| G06 | GP | Incident detail | Evidence list with contributions, uncertainties, map snippet, "Create task" |
| G07 | GP | Village map | Zones, assets, complaint clusters, affected-zone highlight |
| G08 | GP | Maintenance task | Assign, due date, progress updates, repair photo |
| G09 | GP | Repair verification | Before/after chart, window rule, outcome |
| G10 | GP | Reports | Response/resolution times, repeat failures |
| O01 | Officer | Multi-village overview | Village table with status, open HIGH incidents, overdue tasks |
| O02 | Officer | Village drill-down | Read-only G01 |
| O03 | Officer | High-risk pipelines | Cross-village list |
| O04 | Officer | Complaints/incidents | Filters |
| O05 | Officer | Overdue maintenance | SLA view |
| O06 | Officer | Repeat-failure trends | Assets with ≥ 2 incidents per year |
| X01 | All | Settings | Language, notifications, logout |

**Click-through (one story, Predict → Report → Review → Prioritise → Maintain → Verify → Inform):**
S01 → G03 (P-21 flagged by simulated early warning) → *switch role* → C01 (attention banner) → C04 "Low Water" → C05 photo → C06 → C07 #2048 → C08 (Received) → *switch* → G01 → G05 (#2048) → G06 (INC-0311 evidence) → G04 (P-21 detail) → G08 (create + assign task → In progress → Repaired) → G09 (Verified Restored) → *switch* → C08 (#2048 Fixed + message) → *switch* → O01 → O06.

---

## 9. Prioritised roadmap, dependencies and test checkpoints

| Stage | Goal | Depends on | Checkpoint (done when…) |
|---|---|---|---|
| **0 (by 20 Oct)** | Idea submission: freeze MVP, story, 8–10 Stitch screens, architecture diagram, verified stats slide, honest-claims slide | this doc | PPT reviewed against §12; every number has a source or an [S] label; submitted **before** the deadline |
| 1 | Freeze demo dataset (`seed/ramapuram.json`): village, zones, P-21, sensors, users, #2048 | 0 | One JSON file drives every screen; all mock fields `is_mock: true` |
| 2 | Full Stitch clickable prototype (all S/C/G/O screens) | 1 | A teammate who has never seen it completes the story in < 5 min |
| 3 | React skeleton: routing, layout, sidebar/bottom-nav, i18n, role-guarded routes, reading the seed JSON | 2 | All screens render from the seed; language switch works; mobile 375 px OK |
| 4 | Backend + DB: FastAPI, SQLAlchemy models, Alembic, seed loader, read APIs | 1 | `pytest` passes; React swaps JSON for API with no UI change |
| 5 | Complaint flow end-to-end incl. secure image upload (size/type limits, EXIF strip, role-checked download) | 4 | Citizen submits #2048 with a photo; GP sees it; other citizens get 403 |
| 6 | Sensor simulator + readings API + charts (polling) | 4 | Normal and fault scenarios replayable by `POST /demo/scenario/…` |
| 7 | Rules + sensor-health gate; switch to PostgreSQL | 6 | Node-offline scenario produces an EQUIPMENT alert, **not** a water alert |
| 8 | Risk scoring with factor explanation | 4 | P-21 shows factor breakdown; changing YAML changes the score; unit tests per factor |
| 9 | Fusion → incidents → tasks; real JWT auth | 5, 7, 8 | Story steps 1–7 work through the API |
| 10 | Verification + notifications to citizen | 9 | Three outcomes each demonstrable; no "Verified" without passing data |
| 11 | Hardening: role tests, audit log, limitations page, demo reset, rehearsal; hardware bridge if the rig is ready | all | Full story runs 3 times in a row without manual DB edits |
| H (parallel) | Bench rig: ESP32 + 2 flow + 2 pressure + level + pump current → serial/Wi-Fi first, LoRa later → same `/ingest` contract | 6 (contract) | Real readings appear in G02 with a "Bench rig" badge |

---

## 10. Risk register

| # | Area | Risk | Likelihood / Impact | Mitigation |
|---|---|---|---|---|
| R1 | Schedule | 4 days to idea submission; scope creep | H / H | Stage 0 only this week; no code required for submission |
| R2 | Technical | Two backends or too many frameworks | M / H | One FastAPI backend; reject additions without a written reason |
| R3 | Technical | Windows env issues (Python PATH, Postgres) | M / M | SQLite first; exact setup commands; one teammate validates setup |
| R4 | Data | Demo numbers mistaken for real data | M / H | `is_mock`/`is_simulated` columns → UI badges; "Simulated" watermark on charts |
| R5 | Data | Mis-cited government statistics | M / H | Use §B wording only; recheck before each submission |
| R6 | Privacy | Citizen photos/location exposed | M / H | Role-checked media endpoint, EXIF strip, ~1 km coarse location by default, retention policy, audit log |
| R7 | Privacy | Phone numbers / identities in demo | L / M | Fictional users only; no real villagers |
| R8 | Sensor | Low-cost hall flow sensors are inaccurate at low flow; pressure drift | H / M | Calibrate on the rig; present as "bench-validated"; deployment uses EM/ultrasonic meters and 4–20 mA transmitters |
| R9 | Sensor | Sensor fault misreported as water fault | M / H | Health gate before any water alert; dedicated demo scenario |
| R10 | AI | False alarms erode trust | M / H | Persistence windows, ≥ 2 evidence types for HIGH, schedule gating |
| R11 | AI | Uncalibrated "confidence" read as probability | H / H | "Evidence score", factor lists, no % signs |
| R12 | AI | Image model overclaims | M / H | Simulation label in MVP; real model only with published metrics |
| R13 | Quality | pH/TDS/turbidity read as "safe water" | M / H | Wording "indicator abnormal, confirm with test"; quality sensors optional |
| R14 | Integration | Implying JJM/IMIS/Sujalam Bharat integration | M / H | Adapter stub labelled "mock"; slide: "requires authorisation" |
| R15 | Integration | Sujal Gaon ID semantics wrong | M / M | Follow the PIB definition (service area); nullable field |
| R16 | Hardware | Parts arrive late / budget | M / H | Order core parts now; simulator keeps software unblocked |
| R17 | UX | Rural users can't follow the flow | M / M | Icons + words, 3 languages, test with 3–5 non-technical people |
| R18 | Security | Weak demo auth shipped as real | M / M | "Demo login" banner until JWT stage; hashed passwords; HTTPS when hosted |

---

## 11. Facts from the attachments still needing external verification

1. JJM IoT dashboard parameters and pilot details (PIB 1708701; Jal Jeevan Samvad Oct 2021 / Oct 2023 PDFs). [R]
2. The 2023 pilot consumer app features (complaint categories, photos, geo-location). [R]
3. JJM Web APIs: what exists and what access is needed (ejalshakti.gov.in/webapi). [R]
4. WQMIS roles and features. [R]
5. Meri Panchayat features relevant to water complaints. [R]
6. JharJal, Jeeva Jala, Mission Bhagiratha WebGIS, Naanyatha descriptions. [R]
7. TaKaDu capabilities (vendor marketing). [R]
8. Jal Seva Aankalan "30-day citizen feedback window" and its results on the Panchayat dashboard / eGramSwaraj / Meri Panchayat. [R]
9. WHO-based "5.5 crore hours/day, ~4 lakh diarrhoeal deaths" (PIB 2222149). [R]
10. Current national coverage figure (dashboard, on submission day). [V-secondary]
11. JJM 2.0 cabinet release text (PIB 2237548), read in full. [V-secondary]
12. Finale / internal-hackathon dates and idea template (sih.gov.in). Unverified.
13. Hardware prices (supplier quotes). [R, unsourced]
14. "Pipeline age/material is available in Sujalam Bharat asset registries". Plausible but **not shown** by any source I read; don't claim it.

---

## 12. Four-way split

| Verified facts [V] | Research-file claims [R] | Our proposed design [D] | Simulated prototype [S] |
|---|---|---|---|
| PS SIH26255 wording, Hardware, deadline 20 Oct 2026 | JJM IoT pilots used flow/pH/turbidity/chlorine/level/pressure, LoRa, solar | Evidence-fusion incident model with stored evidence | Village "Ramapuram", zones, households, users |
| FA 2024: 98.1% taps, 86.5% working, 83.6% regular, 80.2% quantity, 76.0% quality samples passed, 76.0% functionality status; weighted; base 19,401 villages / 2,32,691 HH | 2023 pilot app with complaints, photos, geo-location | Interpretable pipeline risk score (YAML weights) | Pipeline P-21: iron, 17 yrs, 3 issues, corrosion 67, risk 72 |
| FHTC definition = quantity + quality + regularity | JJM APIs require authentication | Sensor-health gate before water alerts | All sensor readings (until the bench rig) |
| Sujal Gaon ID = service area; Sujalam Bharat ID = scheme; 75% habitations as of 10 Aug 2026 | WQMIS, Meri Panchayat, state apps features | Three-outcome verification rule | Complaint #2048 and its photo observation |
| Jal Seva Aankalan launched 30 Dec 2025 | Hardware costs | Role model: Citizen / GP / Officer (+ technician under Maintenance) | Incident INC-0311 evidence score, affected HH estimate |
| JJM extended to Dec 2028, ₹8.69 lakh crore (secondary) | TaKaDu capabilities | Stack: React PWA + FastAPI + SQLite→PostgreSQL | Mock LGD / Sujal Gaon / Sujalam Bharat IDs |
| | | Mock integration adapter | Two extra villages in the officer view |

---

## Next stage (Stage 0 → 3 setup, Windows / VS Code)

Run these when the idea submission is done. They only create the empty project skeleton.

```powershell
# One-time tools (PowerShell)
winget install -e --id Python.Python.3.12
winget install -e --id Git.Git        # already installed: skip
```

```powershell
# Project skeleton
cd "C:\Users\Ganesh Holkundi\OneDrive\Desktop\SIH(2)"
git init
mkdir backend, simulator, seed
npm create vite@latest frontend -- --template react
```

Planned layout:
```
SIH(2)/
  docs/JalRakshak_Plan.md        ← this file
  seed/ramapuram.json            ← Stage 1: single source of demo truth
  frontend/                      ← React + Vite + Tailwind (Stage 3)
  backend/app/{main.py, models/, api/, services/{rules,risk,fusion,verify}.py}
  backend/risk_config.yaml
  simulator/sim.py               ← Stage 6
```

> Tip: OneDrive syncing `node_modules` and `.venv` can be slow and cause file locks. Consider moving the repo to `C:\dev\jalrakshak` or excluding those folders from sync.
