# JalRakshak — Execution Plan, 16 → 20 October 2026

Working deadline: **20 Oct 2026** (the SIH26255 row on sih.gov.in/sih2026PS).

> **Still unresolved: the deadline.** The Guidelines PDF says 30 Sep. The homepage banner says nomination/idea submission was "extended to 09 Oct". The PS list says 20 Oct. Your team leader can upload only after the **college SPOC** has nominated the team on the portal. **Owner: Team Lead. Due today (16 Oct).** If the SPOC says the portal is closed for you, keep building: the same material serves the internal hackathon and later rounds.

**Format check.** These rules come from the official [SIH2026 Idea Presentation template](https://www.sih.gov.in/letters/2026/SIH2026-IDEA-Presentation-Format.pptx) and Guidelines p.10–13:
- ≤ 6 slides including the title slide
- Use the official template and keep its pointer headings
- Points, diagrams and images, not paragraphs
- **PDF upload only**
- Delete the instructions slide before export
- Portal fields: idea title, idea description, PDF

We have not confirmed: the portal's character limit for the description, the maximum PDF file size, and whether a video link is accepted. Check these when you log in.

---

## What goes where

| Category | Items |
|---|---|
| **Must be done for submission** | 6-slide PDF (draft built: `JalRakshak_SIH26255_Idea.pptx`), idea title + description (in `Idea_Submission_Pack.md`), 3 Stitch screenshots on slide 3, team name/ID filled, every reference opened and checked |
| **Shown through simulation (labelled)** | Sensor readings, Pipeline P-21 profile and risk score 72/100, Complaint #2048, image observation, evidence score, affected-household estimate, Verified Restored |
| **Designed, built after submission** | React PWA, FastAPI backend, seed dataset, sensor simulator, rules + sensor-health gate, risk scoring code, fusion, maintenance and verification workflow |
| **Hardware (parallel, starts now)** | Bench-rig component list, availability check (no prices in the deck until there are quotes), wiring/block diagram, ESP32 sensor read tests |
| **Not claimed at all** | Field deployment, model accuracy, supplier prices, IMIS/Sujalam Bharat/JJM API integration, water-safety certification |

---

## Team roles (6 members, per the SIH team format)

| Member | Focus until submission | Focus after submission |
|---|---|---|
| **M1 Team Lead** | SPOC confirmation, deck owner, final PDF, portal upload | Demo story, integration testing |
| **M2 UI/UX** | Google Stitch: design system + 10 screens; export 3 screenshots | Translate Stitch → React components with M5 |
| **M3 Hardware** | Bench-rig block diagram, parts list + availability, what's already in the lab | ESP32 sensor reads → serial → simulator-compatible JSON |
| **M4 Backend/Data** | Freeze the demo dataset story (village, zones, P-21, #2048); check the risk-score arithmetic | FastAPI + SQLite + seed loader + APIs |
| **M5 Frontend** | Help M2 with Stitch; install Python 3.12, Node, VS Code extensions; repo skeleton dry run | React + Vite + Tailwind skeleton, routing, i18n |
| **M6 AI/Research** | Open and verify every reference; check stats wording; Telugu/Hindi strings for 5 citizen screens | Simulator, rules, risk scoring, fusion, verification |

If you have fewer people: merge M2+M5, M4+M6, and give M3's tasks to M1.

---

## Day by day

### Thu 16 Oct (today) — lock decisions, draft v1
- [ ] **M1**: SPOC confirmation (deadline, nomination, login works)
- [ ] **M1**: review the draft deck v1 (`docs/JalRakshak_SIH26255_Idea.pptx`); mark changes
- [ ] **M2**: paste Stitch *Prompt 0* (design system) + Prompts 1–3 (`Idea_Submission_Pack.md` §3)
- [ ] **M6**: open refs 1–10 on slide 6; mark any that fail
- [ ] **M3**: list hardware the lab/team already owns
- **End-of-day deliverable:** deadline confirmed · deck v1 reviewed · 3 Stitch screens

### Fri 17 Oct — content complete
- [ ] **M2**: Stitch Prompts 4–10 → full click-through (Citizen → GP → Officer)
- [ ] **M1/M4**: apply review edits → deck v2; fill Team Name / Team ID
- [ ] **M3**: final bench-rig component list + block diagram (for backup Q&A, not a 7th slide)
- [ ] **M6**: final references; confirm the IoT-pilot reference (ref 7) supports "LoRa + solar"
- **End-of-day deliverable:** deck v2 content-complete · Stitch prototype clickable

### Sat 18 Oct — polish and proof
- [ ] **M2**: export 3 screenshots (Report problem · Incident evidence · Verified Restored) → M1 replaces the 3 frames on slide 3
- [ ] **All**: proofread against the "Do NOT write" list (`Idea_Submission_Pack.md` §4)
- [ ] **M1**: export PDF; check Telugu/Hindi glyphs, links and file size; paste title + description into the portal draft
- **End-of-day deliverable:** final PDF candidate

### Sun 19 Oct — submit (buffer day)
- [ ] **M1**: upload PDF + fields; screenshot the confirmation page
- [ ] **M4/M5/M6**: Stage 1, the seed dataset (`seed/ramapuram.json`)
- **End-of-day deliverable:** submission confirmed

### Mon 20 Oct — deadline
- Emergency fixes only. Don't make risky last-minute edits.
- Start Stage 3 (project skeleton) once the submission is confirmed.

---

## After submission: build order (one milestone at a time)

1. Seed dataset + repo skeleton → 2. React screens on seed JSON → 3. FastAPI + SQLite read APIs → 4. Complaint + photo flow → 5. Sensor simulator → 6. Rules + sensor-health gate → 7. Risk score → 8. Evidence fusion → tasks → 9. Verification + notification. Hardware track H runs in parallel and joins at step 5 through the same ingest contract.

Each milestone ends with a test checkpoint (see `JalRakshak_Plan.md` §9). Exact Windows/VS Code commands come when you begin each one.
