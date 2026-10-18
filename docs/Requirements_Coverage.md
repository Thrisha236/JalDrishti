# Problem statement coverage: what is built, what is simulated, what is missing

Problem statement SIH26255 (Ministry of Jal Shakti, NJJM / DDWS): *an AI/ML solution to monitor the functionality of Functional Household Tap Connections (FHTC) in real time at Gram Panchayat and household levels, with water-quality alerts, community feedback from mobile devices, and automatic sync with IMIS and Sujal Gaon IDs.*

Scope of this review: the **software**. Hardware (sensor nodes, radios, gateways) is out of scope, so every sensor reading in the prototype is **simulated** and labelled as such.

**How to read the status column**

| Status | Meaning |
|---|---|
| **Built** | Works end to end in the app and is covered by automated tests. |
| **Built (simulated data)** | The software is real, but its inputs (sensors, households, villages) are simulated, or its outputs go to a mock endpoint. It would run on real data without redesign. |
| **Mock** | Shows the data flow honestly but does not contact a real system. |
| **Partial** | Some of the requirement is met; the gap is stated. |
| **Not built** | Not in the prototype. |

Test status at the time of writing: **257 backend tests pass**, the seed validator passes, and the frontend builds. The Docker files and the PostgreSQL path were written but **not run** (no Docker or PostgreSQL was available).

---

## A. "The solution should..." (the seven requirements)

### 1. Continuously monitor FHTC functionality at Gram Panchayat and household level using AI/ML

| | |
|---|---|
| **Status** | **Built (simulated data)** |
| **Gram Panchayat level** | Tap Connections page: share of working, partly working and non-functional taps per village and zone, a 14-day trend, the worst-served homes. Dashboard and officer overview carry the same figures. |
| **Household level** | Every household in each zone's register has a tap ID built on the zone's Sujal Gaon ID, a status (working at 55 L/person/day or more, partly working 30 to 54, not working below 30), and a detail page with its reasons and its last 14 days. The Gram Panchayat can list and filter all household taps. |
| **How it is decided** | Two sources. The network model estimates each home from live head and tail pressure and tail flow. The villager's own daily service check corrects it. When the two disagree the system says why (for example: network fine but this home reports no water, so the fault is probably local to the tap or connection). |
| **AI/ML used** | Isolation Forest anomaly detection on pressure and flow; supply-regularity pattern detection (steady, intermittent, off); DBSCAN clusters of villager reports. See requirement 4. |
| **Limits** | Households come from a mock zone register. There are no household tap sensors or meters, so household status is an estimate, not a measurement. Only Ramapuram has live (simulated) sensors; other villages use baselines and say so. |

### 2. Generate real-time alerts for supply disruption, water-quality deterioration, low pressure, leakage and infrastructure failure

| | |
|---|---|
| **Status** | **Built (simulated data)** |
| **Supply disruption** | Rules for no flow and pump off; intermittent-supply detection; three or more households reporting no water in one zone (community alert). |
| **Water-quality deterioration** | A failed field-test-kit result (server-side IS 10500 judgement); the chlorine outlook (predicted residual chlorine, water age, low-pressure ingress risk); villager reports of coloured or smelly water. A failed tap test also sends a boil-water advisory to the villagers of that zone. |
| **Low pressure, leakage** | Low tail pressure and head-to-tail flow-gap rules; the AI anomaly model; a pressure forecast that warns minutes before the band is left. |
| **Infrastructure failure** | Equipment-health alerts (offline, stuck or impossible sensors, kept apart from water alerts); a "failure due" alert from each pipe's repeat-failure interval; a complaint-cluster alert along a pipeline. |
| **Handling** | One Alert Center with five kinds, filters, acknowledgement (who and when), and escalation to the officer when a high alert goes unseen for 30 minutes. A navigation badge shows high alerts. Every alert is pushed to IMIS (mock) as it opens, is acknowledged and clears. |
| **Limits** | Alerts are in the app. SMS, WhatsApp and voice-call delivery are not connected. Thresholds are starting values, not field-validated. |

### 3. Let villagers submit feedback, complaints, photographs and geo-tagged observations from mobile devices in local languages

| | |
|---|---|
| **Status** | **Built (simulated data)** with the gaps below |
| **Complaints** | Seven categories, optional note, status timeline, several complaints per villager, "still a problem?" follow-up. |
| **Photographs** | Type and size limits, location data removed, viewable only by the owner, the Gram Panchayat and officers. A simulated image observation says that a photo cannot show underground pipe condition. |
| **Geo-tagged observations** | Opt-in only: the villager taps the village map, agrees explicitly, and a place about 25 m wide inside their own zone is stored. Without it, only the zone is stored. |
| **Feedback and service validation** | A daily "did water come, was it enough, how did it look, how would you rate the service" check on the villager's phone. It feeds the household status, the zone alerts and the quality alerts. |
| **Channels** | App, plus missed-call and WhatsApp reporting (simulated in the app). |
| **Languages** | English, Telugu and Hindi on all villager screens. |
| **Mobile** | Mobile-first web app with large touch targets. |
| **Limits** | Not a native app and no offline queue. Voice notes are not built. Telugu and Hindi strings are first drafts and need review by native speakers. The missed-call and WhatsApp channels are simulations, not a telephony integration. |

### 4. Apply AI/ML to identify abnormal service patterns, predict failures and prioritise maintenance

| | |
|---|---|
| **Status** | **Built (simulated data)** |
| **Abnormal patterns** | Isolation Forest on tail and head pressure and flow and the head-to-tail gap; supply-regularity detection of stop-start supply; DBSCAN clustering of villager reports (at least 3 within 120 m). |
| **Prediction** | A robust trend forecast of tail pressure and tank level (minutes until the band is left, with a confidence label); the chlorine-decay water-quality outlook; the repeat-failure interval and window for each pipeline. |
| **Prioritising maintenance** | The Maintenance Planner ranks pipelines from 0 to 100 using risk, the failure window, live signals, recent incidents and time since the last inspection, shows the reasons by points, and plans an inspection in one step (a preventive incident and its task). A "no fault found" result closes it without counting as a failure. |
| **Honesty** | The models are fitted or trained on **simulated** normal operation. The chlorine dose and decay rate are assumptions. No accuracy is claimed anywhere, and scores are rankings, not probabilities. |
| **Limits** | Small, explainable models. Retraining on real data and validating against measurements are future work. |

### 5. Automatically synchronise monitoring data, alerts and community feedback with IMIS, Sujal Gaon IDs and other JJM platforms

| | |
|---|---|
| **Status** | **Mock** (the data flow, IDs, messages and logs are real code) |
| **What flows** | IMIS: incident status, every alert, a monitoring snapshot per sensor node. JJM Dashboard: tap functionality per village and the tap IDs not fully working. WQMIS: every field-test result and sample requests. Meri Panchayat: anonymised villager reports and daily service validations. Sujal Gaon / Sujalam Bharat: the ID registry. |
| **Automatic** | Pushes happen as things change (an incident moves, an alert opens or clears, a report arrives, a test is logged) and monitoring about once a minute. "Sync now" sends everything at once. A failing connector never loses a sensor reading. |
| **IDs** | Every village, zone and scheme is keyed on the national IDs through a crosswalk. Zones without a Sujal Gaon ID (South, "not yet issued") are shown honestly. |
| **Privacy** | Messages carry no names, phone numbers, complaint text or photos. |
| **Limits** | **No real government system is contacted.** The message format is illustrative, not the official schema. Real integration needs authorised access and the official specifications. The connectors are replaced by swapping one function. |

### 6. Provide interactive dashboards with GIS visualisation, service-status indicators and analytics for multiple administrative levels

| | |
|---|---|
| **Status** | **Built (simulated data)** |
| **Dashboards** | Gram Panchayat dashboard, officer overview, and an Analytics page that works from the zone up to the State: State, District, Block, Village, Zone, with a breadcrumb, drill-down, ranking of the worst served, response times (report to incident, assigned to repaired), overdue tasks, water-quality status and a 14-day trend. |
| **GIS** | 3D terrain map and schematic map with Issues, Sensors, Service, Quality and What-if layers; a village-level map coloured by tap functionality; GeoJSON export of villages. |
| **Service-status indicators** | Working, partly working and non-functional taps; supply pattern; quality status; alert counts. |
| **Limits** | Village positions and zone geometry are fictional. The hierarchy has three villages in two blocks and two districts, so state and district views are small. There is no separate State login: State-level views are in the officer role. |

### 7. Ensure scalability, interoperability, data security and ease of deployment

| | |
|---|---|
| **Status** | **Partial** |
| **Security (built, tested)** | Sign-in with JWT and role checks scoped by village; scrypt password hashes; sign-in lockout; security headers; no-store caching of signed-in data; a per-client rate limit and a request-size limit; an audit log that officers can read; anonymised exports with a spreadsheet formula-injection guard; a production start-up guard that refuses demo settings. |
| **Interoperability (built)** | OpenAPI description (`docs/openapi.json`), GeoJSON export, CSV exports, a documented sensor ingestion contract, and the mock platform connectors. |
| **Deployment (written, not run)** | Dockerfiles, a Compose file (PostgreSQL, API, web), an idempotent database initialiser (tested), an environment template and a deployment guide (`docs/DEPLOYMENT.md`). |
| **Scalability (partly)** | A database connection pool for PostgreSQL; automatic deletion of old sensor readings; stateless API workers. |
| **Not built** | Database migrations (Alembic), a message queue for sensor ingestion, a shared-store rate limiter for several servers, background workers for the models, a load test, a CI pipeline, multi-tenant or multi-state administration, user-management screens, a data-loading tool for real villages, and a security or privacy audit (including a Digital Personal Data Protection Act review). |

---

## B. Expected outcomes

| # | Expected outcome | Status |
|---|---|---|
| 1 | An AI/ML-enabled platform for real-time monitoring of FHTCs and service delivery | **Built (simulated data)**: tap monitor, supply regularity, quantity (L/person/day), quality screening, alerts. |
| 2 | Early identification and prediction of disruptions, water-quality issues and infrastructure failures | **Built (simulated data)**: forecast, chlorine outlook, failure outlook, anomaly detection, with one-click preventive planning. |
| 3 | Community participation through mobile feedback, grievance reporting and service validation | **Built (simulated data)**: complaints, geo-tagged reports, daily service check, advisories back to villagers. |
| 4 | Automatic integration of monitoring data with IMIS, Sujal Gaon IDs and other JJM platforms | **Mock**: five simulated connectors with real IDs, messages and logs. |
| 5 | Operational efficiency, preventive maintenance planning, transparency, evidence-based decisions | **Built**: planner, evidence-fused incidents, analytics with response times, audit log. Public transparency is limited to public incident and alert endpoints; there is no public village report card. |
| 6 | Reliability, accountability and sustainability of FHTCs | **Built (simulated data)**: restoration is verified from readings before an incident closes; alerts are acknowledged and escalated; every write is audited. |

## C. The mentor's three points, in his order

1. **Automatic integration with IMIS, Sujal Gaon IDs and other JJM platforms**: Integrations page (five mock connectors, diagram, ID crosswalk, message log); alerts, incidents, tap status, test results and feedback are all pushed.
2. **AI/ML for real-time monitoring of FHTCs and service delivery**: AI Early Warning and Tap Connections; household detail; supply regularity.
3. **Early identification and prediction**: pressure forecast, chlorine outlook, failure outlook, preventive planner, and issues pinned on the map from the values captured.

He also asked for less text on the screens (redesigned dashboards, landing page and typography) and said to mock what cannot be real. Everything mocked is labelled.

## D. What is still missing, in plain words

- **Real integration.** Nothing talks to IMIS, Sujalam Bharat or the JJM Dashboard. It needs authorisation and the official specifications.
- **Real data.** Sensors, households and villages are simulated, and the models are fitted only on simulated normal operation. No accuracy can be claimed until they are tested on real readings.
- **Household sensors.** Household status is an estimate plus the villager's own report.
- **Alert delivery.** No SMS, WhatsApp or voice calls; alerts are in the app.
- **Native mobile and offline use.** The villager app is a responsive website, with no offline queue and no voice notes.
- **Production readiness.** Docker and PostgreSQL untested, no migrations, no load test, no CI, no user-management screens, no security or privacy audit.
- **Language review.** Telugu and Hindi are first drafts.
