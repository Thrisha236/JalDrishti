# JalRakshak: demo video script (about 8 minutes)

Team Vistaar · SIH 2026 · SIH26255 (Ministry of Jal Shakti, NJJM / DDWS)

The order follows the problem statement. **Say "simulated" out loud** whenever you show sensor data or the national platforms: it keeps the video honest and protects the team in Q&A.

## Before you record

1. Terminal 1: `cd backend` then `.\.venv\Scripts\python.exe -m app.seed_loader`, then start the backend (port 8000).
2. Terminal 2: `cd frontend` then `npm run dev` (port 5173).
3. Terminal 3 (start it about 1 minute before recording, so live data exists): `python simulator\sim.py --scenario leak --interval 2`
4. Sign-ins (local demo only, password `jalrakshak-demo`): `villager1`, `gp.ramapuram`, `officer.block`.
5. Browser at 1280 px wide, zoom 100%, three tabs already signed in (villager, Gram Panchayat, officer). Close other tabs and notifications. Record at 1080p with a microphone.

---

## 1. Opening and the problem (0:00 to 0:45) · Landing page

**Show:** the landing page.

**Say:**
"Hello, we are Team Vistaar. This is JalRakshak, our solution for problem statement SIH26255 from the Ministry of Jal Shakti. Under the Jal Jeevan Mission, millions of homes have tap connections, but a tap that was installed is not always a tap that delivers water. Today, a village finds out something is wrong only when people complain. JalRakshak watches the water supply continuously, warns early, brings villagers into the loop, and reports to the national systems.
A quick note: sensors in this demo are simulated, and the national platforms are mock. We will say so each time. We are showing the software; the hardware is the next stage."

**Show:** the three pillars on the page and the loop strip.

## 2. Requirement 1: FHTC monitoring at Gram Panchayat and household level (0:45 to 2:00) · Gram Panchayat

**Show:** sign in as `gp.ramapuram`; open the Dashboard, then **Tap Connections**.

**Say:**
"This is the Gram Panchayat's dashboard for Ramapuram village. It shows how many taps are working, partly working or not working, with a 14-day trend and the worst-served homes.
Every household has a tap ID built on its zone's Sujal Gaon ID, so the data lines up with the national registry. Zones that have no ID yet are shown honestly as not yet issued.
Open one household: the status comes from two sources. The network model estimates litres per person per day from live pressure and flow, and the villager's own daily check corrects it. When the network is fine but a home reports no water, the system says the fault is probably local, at the tap or connection, not in the pipeline. That saves a crew from digging up the wrong place."

**Show:** a household detail page with the "likely local fault" reason and the 14-day strip.

## 3. Requirement 3: villagers give feedback in their own language (2:00 to 3:15) · Villager

**Show:** switch to the villager tab (`villager1`). Change the language to Telugu, then back to English.

**Say:**
"Now the villager's view. The app is mobile-first, in English, Telugu and Hindi. On the home screen, 'My tap' asks one simple daily question: did water come today, was it enough, how did it look, and how would you rate the service."

**Do:** answer **No water**, send. Switch to the Gram Panchayat tab and refresh Tap Connections: the home turns to *Not working*.

**Say:** "Within seconds the Gram Panchayat sees it. This is community validation of service, not just complaints."

**Show:** the **Report** form: pick a category, add a photo, and tap the village map in the spot picker.

**Say:**
"A villager can also file a complaint with a photo and, only if they agree, a location. We store the place only to about 25 metres and only inside their own zone. Photo location data is removed, and photos can be seen only by the villager, the Gram Panchayat and officers. A photo cannot diagnose an underground pipe, and the app says so."

## 4. Requirement 2: real-time alerts (3:15 to 4:30) · Gram Panchayat

**Show:** the **Alert Center**.

**Say:**
"The simulator is running a leak, and the Alert Center shows alerts of five kinds: water service, equipment health, AI predictions, water quality and community reports. That covers supply disruption, low pressure, leakage, quality deterioration and infrastructure failure.
Each alert says what, where and why. Someone can acknowledge it, and if a high alert is not acknowledged for 30 minutes, it is escalated to the officer. Community reports are never counted as sensor evidence, so one problem is never counted twice."

**Do:** acknowledge one alert. Point to the red badge in the navigation.

**Show:** **Water Quality**: log a failing tap test (bacteria present).

**Say:**
"Field-test-kit results are judged against IS 10500 limits. A failed test raises an alert and sends a boil-water advisory in English, Telugu and Hindi to villagers of that zone. We say 'passed' or 'failed', never 'safe to drink': a field kit is a screening, not a certificate."

**Show (optional, 10 s):** the villager tab, **Updates**, with the advisory.

## 5. Requirement 4: AI and machine learning (4:30 to 6:00) · AI Early Warning and Planner

**Show:** **AI Early Warning**.

**Say:**
"This is where the AI works, in plain language. We use a few small models that we can explain.
One, an Isolation Forest learns what normal pressure and flow look like and flags abnormal patterns.
Two, a trend forecast tells the operator how many minutes remain before tail pressure leaves its band, with a confidence label.
Three, a chlorine-decay outlook warns when water in a far lane may reach homes with too little chlorine.
Four, a repeat-failure model estimates when a pipeline's next failure is due.
Five, a regularity model spots stop-start, intermittent supply.
Six, DBSCAN groups villagers' complaints into clusters, such as three reports within 120 metres along one pipeline.
Important: these models are fitted on simulated normal operation, so we claim no accuracy. Scores are rankings, not probabilities. Real accuracy needs real readings."

**Show:** the pressure forecast chart, the clusters card and the regularity card.

**Show:** **Maintenance Planner**.

**Say:**
"For maintenance prioritisation, the planner ranks pipelines from 0 to 100 using risk, the failure window, live signals, recent incidents and time since last inspection, and shows the reasons point by point. One click opens a preventive inspection and its task. If the crew finds nothing, they close it as 'no fault found', and that is not counted as a failure."

**Do:** plan an inspection for the top pipeline; open **Maintenance** to show the new preventive task.

## 6. Requirement 5: sync with IMIS, Sujal Gaon and other JJM platforms (6:00 to 6:50) · Integrations

**Show:** the **Integrations** page with the diagram, then the message log.

**Say:**
"This is the integration hub, and it is mock: no real government system is contacted. Five connectors show how data would flow: IMIS gets incidents, alerts and monitoring snapshots; the JJM Dashboard gets tap functionality per village; WQMIS gets water-test results; Meri Panchayat gets anonymised feedback; and Sujal Gaon provides the ID registry.
Pushes happen automatically when something changes, and every message is logged. Messages carry no names, phone numbers, complaint text or photos. Connecting to the real platforms needs official access and specifications; each connector is replaced by swapping a single function."

**Do:** click **Sync now** and show the new rows in the log.

## 7. Requirement 6: dashboards, GIS and multi-level analytics (6:50 to 7:40) · Officer

**Show:** switch to the officer tab (`officer.block`); open **Analytics**.

**Say:**
"The officer sees the same indicators at every level: State, District, Block, Village and Zone. Click to drill down, rank the worst-served areas, and see response times, overdue tasks, quality status and a 14-day trend. The map colours each village by tap functionality, and data exports as CSV or GeoJSON, anonymised. Village positions here are fictional."

**Do:** drill State, District, Block, Village; export one CSV. Then open the GP **Map** with the **Issues** layer to show issues pinned from the captured values.

**Show:** **Audit and system** briefly.

## 8. Requirement 7: security, scalability, deployment (7:40 to 8:10)

**Show:** the Audit page, or `docs/DEPLOYMENT.md` in the editor.

**Say:**
"Security: role-based access scoped by village, hashed passwords, rate limits, security headers, an audit log, and a start-up check that refuses demo settings in production. For scale and deployment, the API is stateless, uses a PostgreSQL pool, deletes old readings automatically, and ships with Docker files and an OpenAPI description. We are honest that the Docker and PostgreSQL setup is written but not yet tested; that is part of our next stage."

## 9. Closing (8:10 to 8:40)

**Show:** the landing page.

**Say:**
"To summarise: JalRakshak monitors tap connections at village and household level, warns early with explainable AI, listens to villagers in their own language, plans maintenance before things fail, and reports to the Jal Jeevan Mission platforms. What is built is real software running on simulated data. What comes next is the hardware pilot, real integrations, and field validation. Thank you."

---

## If you need to cut it to 5 minutes

Drop section 8 and the optional Updates shot, shorten section 5 to the forecast, clusters and planner, and skip the Telugu switch. Keep the honesty lines in sections 1, 5 and 6.

## Lines to avoid in the video

- "Real-time integration with IMIS" (say "mock integration").
- Any accuracy or percentage for the AI.
- "Safe to drink" (say "passed the screening").
- Any price, saving or rollout figure we have not measured.
- Real phone numbers or real people's names.

## Upload checklist

Title: "JalRakshak: AI-based FHTC monitoring | SIH 2026 | SIH26255 | Team Vistaar". Visibility: **Unlisted** (anyone with the link can watch, and it stays out of search). Add the section titles with their timestamps to the description, and paste the link into the SIH portal.
