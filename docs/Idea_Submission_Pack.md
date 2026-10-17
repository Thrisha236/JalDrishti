# JalRakshak — SIH 2026 Idea Submission Pack

PS **SIH26255** · Ministry of Jal Shakti · Hardware · Clean & Green Technology
Prepared 16 Oct 2026.

---

## ⚠️ 0. Confirm the deadline today (official sources disagree)

| Official source | Says |
|---|---|
| [SIH 2026 Guidelines PDF](https://www.sih.gov.in/letters/2026/SIH%202026%20Guidelines.pdf), p.10 | Team nomination + idea submission by SPOC/team leader **till 30 Sept 2026** |
| [sih.gov.in](https://www.sih.gov.in/) homepage banner | "Team Nomination & Idea Submission deadline **extended to 09 Oct 2026**"; PPT edits 02–09 Oct (one-time) |
| [PS list](https://www.sih.gov.in/sih2026PS), SIH26255 row | Deadline for Idea Submission: **20 October 2026**; counter 45/500 |

**Action now:** ask your **college SPOC** whether your team is already nominated on the portal and whether the team-leader login can still upload. Per the guidelines, team leaders only get credentials after the SPOC uploads team details (which follows the mandatory internal hackathon). If nomination closed on 9 Oct, the 20 Oct date may not help you. Get this answer before polishing slides.

**Official format rules (from the 2026 Idea template):**
- **Max 6 slides, including the title slide.** Use the **official template**; don't change its headings.
- Points, diagrams, infographics, pictures; avoid paragraphs.
- **Upload as PDF only.** Delete slide 7 (instructions) before export.
- The portal also asks for **Idea title** and **Idea description** (text fields), plus a PDF.
- Evaluation: novelty, complexity, clarity/detail in the format, feasibility, practicability, sustainability, scale of impact, user experience, future potential (Guidelines p.13).
- Template: [SIH2026-IDEA-Presentation-Format.pptx](https://www.sih.gov.in/letters/2026/SIH2026-IDEA-Presentation-Format.pptx)

---

## 1. Portal text fields

**Idea title**
> JalRakshak: Closed-loop, evidence-based monitoring of functional household tap connections

**Idea description** (~170 words; check the portal's character limit and trim if needed)
> A tap connection is not the same as a working water service. JalRakshak is an AI-assisted service-assurance layer for rural piped water schemes. Low-cost sensor nodes at the pump, tank and the head and tail of the distribution line send flow, pressure, level and pump-current data over LoRa to a village gateway (4G/MQTT). A rule engine and anomaly detection flag abnormal supply, and first check whether a fault is in the sensor or in the water service. Villagers report problems in Telugu, Hindi or English through a mobile web app with photo and coarse location. JalRakshak fuses sensor alerts, citizen complaints, pipeline records (age, material, repair history) and supply schedules into one explainable incident: priority, supporting evidence, probable cause and missing data. The Gram Panchayat turns it into a maintenance task. An incident is marked "Verified Restored" only when readings stay normal after repair, and the citizen is informed. Records are keyed to Sujal Gaon (service area) and Sujalam Bharat (scheme) identifiers; the prototype uses mock IDs, and live IMIS sync would need official authorisation.

---

## 2. Slide-by-slide content (fits the official 6-slide template)

Design rules: one idea per block, ≤ 7 bullets per box, icons over text. Colours: teal = normal, amber = warning, red = fault. Put **"Prototype — simulated data"** on every screenshot.

### Slide 1 — Title page (template fields)
- Problem Statement ID – **SIH26255**
- Problem Statement Title – *Development of a solution using AI and ML to monitor the functionality of FHTC in real time at both the Gram Panchayat and household levels…* (shorten with "…" if it doesn't fit)
- Theme – **Clean & Green Technology**
- PS Category – **Hardware**
- Team ID – *(from portal)*
- Team Name – *(as registered)*
- Optional small line: **JalRakshak — Your Water. Your Village. Your Voice.**

### Slide 2 — Idea title: JalRakshak
**Proposed solution**
- Sensor nodes at **pump · tank · pipeline head · pipeline tail** (not at every house)
- **Citizen app** (EN/తెలుగు/हिंदी): report no/low/dirty water or leakage with photo, then track status
- **Pipeline health records**: age, material, past repairs, inspection findings → explainable risk score
- **Evidence fusion** → one prioritised incident → GP maintenance task → **sensor-verified closure**

**How it addresses the problem**
- FA 2024: **98.1%** of surveyed HHs in Har Ghar Jal villages had a tap; assessed **functionality status 76.0%** ¹
- Detects service failures continuously, not only at periodic surveys
- Links each complaint to a specific pipe/zone so repairs target the cause

**Innovation & uniqueness**
- **Closed loop**: Predict → Report → Review → Prioritise → Maintain → **Verify** → Inform
- **Sensor-fault vs water-fault gate**: a dead sensor never raises a false "no water" alarm
- **Explainable**: every priority shows its evidence and missing data, with no black-box percentages
- **Complements, not replaces**, JJM Dashboard / WQMIS / Jal Seva Aankalan / Sujalam Bharat. We did not find a public system that closes this loop.

> ¹ footnote: "Functionality Assessment of Household Tap Connection — National Report 2024, DDWS (weighted sample estimates)."

**Visual:** a circular loop diagram (7 steps) in the centre, or a split "Today (reactive) vs JalRakshak (closed loop)".

### Slide 3 — Technical approach
**Left: architecture diagram (5 bands)**
```
FIELD     Pump[current] → Tank[level] → Head[flow, pressure] → Tail[flow, pressure] → Zones
EDGE      ESP32 nodes ──LoRa──▶ Raspberry Pi gateway (store-and-forward) ──4G/MQTT──▶
CLOUD     FastAPI · PostgreSQL(+PostGIS) · Rules → Sensor-health → Anomaly → Risk → Fusion
APPS      Citizen PWA (3 languages) · Gram Panchayat console · Govt officer view
LOOP      Incident → Task → Repair → Verification window → "Verified Restored" → notify citizen
```
**Technologies**
- Hardware: ESP32 + LoRa, hall-type flow ×2, pressure transducer ×2, ultrasonic level, CT pump-current, Raspberry Pi gateway, solar + battery, IP65 enclosures
- Software: React + Vite + Tailwind (PWA), Leaflet/OpenStreetMap, Python FastAPI, PostgreSQL/PostGIS, MQTT (Mosquitto)
- AI/ML: rules + robust z-score/EWMA → Isolation Forest (trained on normal runs), interpretable pipeline-risk score, explainable fusion score; image triage *(later, evaluated separately)*

**Methodology**
1. Bench rig + sensor simulator → 2. ingest & sensor-health checks → 3. rules/anomaly → 4. complaint + pipeline-record linkage → 5. fusion → task → 6. post-repair verification

**Visual:** architecture on the left; 3 Stitch screenshots on the right (citizen phone *Report problem*, GP *Incident evidence*, GP *Verified Restored*).

### Slide 4 — Feasibility and viability
**Feasibility**
- Uses commodity student-buildable hardware and open-source software
- Starts with **rules, so it works before any ML data exists**; ML is added as data grows
- Hierarchical sensing (few nodes per scheme + citizens as observers) keeps cost low vs per-house meters
- JJM already piloted LoRa + solar village IoT, so the deployment path is proven in concept ²

**Challenges & risks → strategies**
- False alarms → persistence windows, schedule-aware rules, HIGH only with ≥ 2 evidence types
- Sensor failure/drift → heartbeat + stuck/out-of-range checks, calibration log
- Low-cost sensor accuracy → bench validation; deployment-grade EM flow / 4–20 mA pressure
- Water-quality limits → pH/TDS/turbidity are **indicators only** → trigger FTK/lab test
- Connectivity → gateway buffers and replays data offline
- Privacy → coarse location, role-based access to photos, audit log
- Integration → mock IDs + adapter; live IMIS/Sujalam Bharat sync **requires authorisation**

> ² cite the JJM IoT pilot source only after you open it (see §4 refs).

### Slide 5 — Impact and benefits
**Target audience impact**
- **Villagers**: easy local-language reporting, visible status, told when water is truly restored
- **Gram Panchayat / VWSC**: prioritised task list with evidence; only 55.2% of surveyed villages had a VWSC and 58.1% had skilled O&M manpower, so decision support matters ¹
- **District/State officers**: repeat-failure hotspots, overdue repairs, verified resolution trends

**Benefits**
- Social: less time lost to outages; earlier action on quality-indicator anomalies (confirmed by testing)
- Economic: inspect the riskiest pipes first; fewer repeat repairs
- Environmental: earlier leak detection reduces water loss (Clean & Green)
- Governance: service-level, verifiable records aligned with JJM 2.0's shift to **service delivery** ³ and Sujal Gaon / Sujalam Bharat IDs ⁴

**Visual:** 3 persona cards (Villager · GP · Officer) with a single before/after line each.

### Slide 6 — Research and references
1. DDWS, *Functionality Assessment of Household Tap Connection — National Report 2024* — jaljeevanmission.gov.in/sites/default/files/2025-12/FHTC_National Report 2024.pdf
2. PIB, 13 Aug 2026, *75% of Rural Habitations Covered with Sujal Gaon IDs* — pib.gov.in PRID 2298959
3. PIB, 30 Dec 2025, *Jal Seva Aankalan launched* — pib.gov.in PRID 2209798
4. Cabinet approval: JJM extended to Dec 2028 (Mar 2026) — pmindia.gov.in news update
5. JJM Dashboard — ejalshakti.gov.in/JJMReport/JJMIndia.aspx
6. JJM-WQMIS — ejalshakti.gov.in/WQMIS
7. JJM IoT dashboard / pilot (verify before use) — ejalshakti.gov.in/jjmreport_hi/iot/IotIndia.aspx; PIB PRID 1708701
8. Jal Jeevan Samvad Oct 2021 & Oct 2023 (IoT pilot + consumer app) — jaljeevanmission.gov.in (verify)
9. ML for anomaly detection in smart water networks, systematic review (2024), *Physics and Chemistry of the Earth* — sciencedirect.com/science/article/pii/S1474706524000160 (verify)
10. CAG, *Performance Audit of JJM, Madhya Pradesh*, Report No. 5 of 2026 (context on FHTC reporting gaps; read before citing)

**Footer line:** *Prototype figures (pipeline P-21, complaint #2048, risk scores) are illustrative/simulated.*

---

## 3. Google Stitch prompts

**How to use:** paste **Prompt 0** first, then one screen prompt at a time in the same project. Generate citizen screens in **Mobile** mode and GP/Officer screens in **Web** mode. Export PNGs for slide 3. For the submission you need **4–6 screens**; the rest are for the full clickable prototype (Stage 2).

**Prompt 0 — Design system (paste first)**
> Design system for "JalRakshak", a rural drinking-water service app for Indian villages, used by villagers, Gram Panchayat staff and government officers. Tagline: "Your Water. Your Village. Your Voice." Style: trustworthy, calm, government-service quality, highly accessible. Primary colour deep teal (#0F766E), background off-white (#F8FAFC), text near-black (#0F172A). Status colours used sparingly and always with an icon plus a word: green "Normal", amber "Warning", red "Problem". Rounded cards (12px), generous spacing, large touch targets (min 48px), base font 16–18px, Noto Sans (supports Telugu and Hindi). Simple line icons. No stock photos of real people, no government logos or emblems. Every chart or data panel shows a small grey badge "Simulated data".

**Prompt 1 — Login & role select (mobile)**
> Mobile screen: JalRakshak welcome and login. Top: water-drop logo, app name, tagline. Language selector with three pill buttons: English, తెలుగు, हिंदी. Below, "Who are you?" with three large tappable cards with icons: "Villager / Citizen", "Gram Panchayat", "Government Officer". A phone number field and a big teal "Continue" button. A small amber label at the top: "Demo login — prototype".

**Prompt 2 — Citizen home (mobile)**
> Mobile citizen home screen for village "Ramapuram", area "North Area". Large status card in amber: icon + "Low Supply in Your Area" and a sub-line "A pipeline in your area may need attention. Officials are checking." Next card: "Today's water timing: 6:00–8:00 AM, 6:00–7:00 PM". A very large teal button "Report a Problem". Below, "My complaints" showing one item "#2048 · Low water · Being checked". Bottom navigation: Home, Status, Report, My Complaints, More.

**Prompt 3 — Report a problem (mobile)**
> Mobile screen "What is the problem?" Grid of 7 large icon tiles with short labels: No Water, Low Water, Dirty Water, Bad Smell, Leakage, Damaged Tap, Other. "Low Water" is selected (teal border, check mark). Below: "Add a photo" area showing a thumbnail preview of a wet pipe joint with "Replace" and "Remove" buttons, an optional text box "Tell us more (optional)", a microphone button "Record voice (optional)", a toggle "Share approximate location" (on), area dropdown "North Area". Big "Submit" button.

**Prompt 4 — Image check + confirmation (mobile)**
> Mobile screen after photo upload. Top card: "Checking image…" completed state with an observation in plain language: "Possible leakage visible near a pipe — inspection recommended." A clear grey banner on the card: "Prototype simulation — not an AI diagnosis. A photo cannot show underground pipe condition." Below, a success card with a large check mark: "Complaint #2048 received" and a 4-step timeline: Received (done), Being checked, Repair started, Water restored. Button "Track my complaint".

**Prompt 5 — Citizen complaint timeline, restored (mobile)**
> Mobile screen "My Complaint #2048 — Low water, North Area". Vertical timeline all complete in green: Received (Mon 7:12 AM), Being checked (7:40 AM), Repair started (Tue 10:05 AM), Water restored — verified (Wed 8:15 AM). A green message card: "Water supply in your area is back to normal. Thank you for reporting." Buttons: "Still a problem? Tell us" (outline) and "Done".

**Prompt 6 — Gram Panchayat village dashboard (web, desktop)**
> Desktop dashboard for Gram Panchayat "Ramapuram". Persistent left sidebar: Home, Water Status, Pipeline Health, Complaints, Alerts, Village Map, Maintenance, Reports, Settings. Top row KPI cards: Open incidents 1 (red), New complaints 3, Tasks overdue 0, Zones affected 1 of 3. Main area: left, a simple village map with three zones (North shaded amber) and a red pipeline segment labelled "P-21"; right, an alert list: "High priority — Pipeline P-21, North Area: low pressure + 3 low-water complaints". A sensor-health strip: "Node A online · Node B online". Two small line charts "Tail pressure (bar)" and "Tail flow (L/min)" with a dip, each with a "Simulated data" badge.

**Prompt 7 — Incident evidence (web)**
> Desktop incident detail page "INC-0311 · Pipeline P-21 · North Area · Priority HIGH". Left column "Why this is high priority" as an evidence list with small horizontal bars showing contribution: (1) Tail pressure 41% below normal for 25 min during scheduled supply; (2) 3 low-water complaints within 600 m in 40 minutes (#2048, #2049, #2051) with photo thumbnails; (3) Pipeline risk score 72/100 — 17 years old, 3 past repairs; (4) Photo observation: possible visible leak (labelled "simulated"). A box "Probable cause (unconfirmed): leak or partial blockage on P-21". A box "Missing data: no middle-pipeline sensor; leak position not located". "Evidence score 0.81 — not a probability" in small text. Right column: mini map and a teal button "Create maintenance task".

**Prompt 8 — Pipeline health detail P-21 (web)**
> Desktop page "Pipeline P-21 — North Area". Profile card: Material: Iron (source: installation record); Installed: 2009, 17 years (source: record); Diameter: unknown; Past issues: 3 (2023 leak, 2024 joint failure, 2025 leak). Risk card: "Risk score 72/100 — HIGH — Inspect soon" with a factor breakdown table (Age 20/25, Prior failures 20/25, Corrosion observation 12/20, Pressure trend 12/20, Material 8/10). Note: "Corrosion 67/100 from visual inspection of exposed section, June 2026." Footer note: "Risk score ranks inspection priority. It is not a prediction that the pipe will fail." Chart "Pressure per unit flow — last 30 days" with a downward trend and a "Simulated data" badge. Repair-history timeline at the bottom.

**Prompt 9 — Maintenance task & verification (web)**
> Desktop page "Task T-118 — Inspect and repair P-21". Fields: assigned to "Ravi (Technician)", due "Today 5 PM", status stepper: Assigned → Inspecting → Repairing → Repaired → Verifying. A repair-photo upload with thumbnail. Right panel "Restoration check": before/after line chart of tail pressure returning into a shaded normal band, rule text "Readings must stay in the normal range for 2 supply windows", and a large green result badge "Verified Restored". A small alternative note: "If no sensor covers this pipe, status shows 'Resolved — not sensor-verified'."

**Prompt 10 — Government officer overview (web)**
> Desktop multi-village overview for a block-level water officer. Left sidebar as before. KPI row: Villages 3, High-risk pipelines 4, Open incidents 2, Overdue tasks 1, Median resolution time 1.6 days. Table of villages (Ramapuram, Kondapur, Sitarampalli) with status chip, open incidents, complaints this week, overdue tasks, and a "View" button. Below: a bar chart "Repeat failures by asset (12 months)" and a list "High-risk pipelines" with risk score badges. "Simulated data" badges on all figures.

**Recommended screenshots for slide 3:** Prompt 3 (Report), Prompt 7 (Evidence), Prompt 9 (Verified Restored). Backup: Prompt 2 and Prompt 6.

---

## 4. Verified statistics: approved wording

Only use these phrasings. Each was checked on 16 Oct 2026 against the source shown.

| Use | Approved wording | Source |
|---|---|---|
| **Headline gap** | "In the 2024 national Functionality Assessment, 98.1% of surveyed households in Har Ghar Jal villages had a tap connection, but the assessed functionality status of household tap connections was 76.0%." | FHTC National Report 2024, National Factsheet |
| Short form (slide) | "98.1% have taps → 76.0% functional (FA 2024, sample survey)" | same |
| Sub-components | "Working tap 86.5% · regular supply as per schedule 83.6% · adequate quantity (55 LPCD) 80.2% · water-quality samples passing 76.0%" | same |
| Survey scale | "Independent survey of 19,812 Har Ghar Jal villages and 2,37,608 households in 761 districts across 34 States/UTs; analysis on 19,401 villages / 2,32,691 households (weighted estimates)." | same, Executive Summary |
| FHTC definition | "A tap connection is considered functional if the household receives water in adequate quantity, of prescribed quality, with regular supply." | same, Glossary |
| O&M capacity | "VWSC/Paani Samiti present in 55.2% of villages; skilled O&M manpower in 58.1%; Field Test Kits available in 27.2%." | same, Village-level findings |
| Sujal Gaon ID | "Sujal Gaon IDs identify water-supply service areas; Sujalam Bharat IDs identify rural water supply schemes. As of 10 Aug 2026, 12,67,808 of 16,96,213 habitations (75%) had Sujal Gaon IDs." | PIB, 13 Aug 2026 (PRID 2298959) |
| Sujalam Bharat | "A federated Digital Public Infrastructure for lifecycle management of rural piped water schemes, integrated with PM GatiShakti." | same |
| Jal Seva Aankalan | "A Gram Panchayat-led digital self-assessment of drinking-water service functionality, launched 30 Dec 2025." | PIB PRID 2209798 |
| JJM 2.0 | "In March 2026 the Union Cabinet extended JJM to December 2028 with a total outlay of about ₹8.69 lakh crore, shifting focus to service delivery." | PM India / cabinet coverage *(open PIB PRID 2237548 to confirm wording)* |

**Do NOT write:**
- ❌ "Only 76% of households get safe water" (the 76.0% quality figure is % of *samples* passed)
- ❌ "24% of taps don't work" (working-tap figure is 86.5%; functionality is a combined measure)
- ❌ "98% of India has taps" (it is surveyed households in HGJ villages, not national coverage)
- ❌ "Pressure is part of the FHTC definition"
- ❌ "Sujal Gaon ID is a scheme ID"
- ❌ "Integrated with IMIS / Sujalam Bharat" → ✅ "designed to align with; mock IDs in prototype"
- ❌ "AI detects leaks with 91% accuracy", "failure probability 72%" → ✅ "risk score 72/100 (illustrative)"
- ❌ "Certifies water as safe" → ✅ "flags quality-indicator anomalies for confirmatory testing"
- ❌ "No existing system does this" → ✅ "we did not find a public system that closes this loop"

---

## 5. Submission checklist

- [ ] SPOC confirms nomination status and the real deadline (§0)
- [ ] Download the official template; fill slides 1–6; delete slide 7
- [ ] Slide 1 Team ID and Team Name exactly as on the portal
- [ ] 3 Stitch screenshots on slide 3, each with "Prototype — simulated data"
- [ ] Every statistic matches §4 wording and has a footnote
- [ ] Open every reference link on slide 6; remove any that fail or that you haven't read
- [ ] No government logos/emblems used as endorsement
- [ ] Export to **PDF**; check fonts (Telugu/Hindi text renders) and file size
- [ ] Paste Idea title + description into the portal (trim to the character limit)
- [ ] One teammate proofreads against the "Do NOT write" list
- [ ] Upload before the confirmed deadline, with margin (portals slow down on the last day)
