# JalRakshak: presentation script for the 6-slide deck (about 6 minutes)

Deck: `JalRakshak_SIH26255_Idea_v5.pdf` · Team Vistaar · SIH26255 (Ministry of Jal Shakti, NJJM / DDWS)

Speak slowly, about one minute per slide. Words in **bold** are the points to stress. The statement's own words are used on purpose, so the evaluator hears every point of the problem statement.

---

## Slide 1: Title (0:00 to 0:20)

"Good morning. We are Team Vistaar. Our problem statement is **SIH26255**, from the **Ministry of Jal Shakti**, National Jal Jeevan Mission: *a solution using AI and ML to monitor the functionality of FHTC in real time at both the Gram Panchayat and household levels, with alerts on water quality issues, village feedback through mobile devices, and automatic sync with IMIS and Sujal Gaon IDs.*
Our solution is **JalRakshak**, which means *protector of water*. Theme: Clean and Green Technology. Category: Hardware."

---

## Slide 2: The problem and our solution (0:20 to 1:40)

**The problem (left).**
"Under the Jal Jeevan Mission, almost every rural home has a tap. In the national survey, **98.1% of surveyed households had a tap, but only 76.0% were assessed as functional**. Monitoring depends on **periodic reporting and field inspections**, so disruptions are found late: **non-functional taps, intermittent supply, poor water quality, inadequate pressure, and infrastructure failures**. There is limited real-time feedback from villagers, and sensors, mobile apps, water-quality systems and citizen feedback are **not brought together** in one platform."

**How it works (centre picture).**
"This picture is the whole system. **One: Sense.** Sensors on the tank and pipeline, water-quality kits, and villagers' phones. **Two: Transmit.** A LoRa gateway sends the data on. **Three: Analyse.** Our AI/ML platform finds anomalies, predicts failures, and prioritises work. **Four: Alert and act.** Dashboards and alerts reach the VWSC and Gram Panchayat. **Five: Sync.** Data goes to IMIS, Sujal Gaon IDs, the JJM Dashboard and WQMIS."

**Our solution (right).**
"The seven points on the right are the seven points of the statement, in order. **One:** continuous FHTC monitoring at Gram Panchayat and household level using AI/ML. **Two:** real-time alerts for supply disruption, water quality deterioration, low pressure, leakages and infrastructure failure. **Three:** feedback, complaints, photographs and geo-tagged observations from mobile devices, in local languages. **Four:** AI/ML for abnormal service patterns, failure prediction and maintenance prioritisation. **Five:** automatic sync with IMIS, Sujal Gaon IDs and other JJM platforms. **Six:** interactive dashboards with GIS, service status indicators and multi-level analytics. **Seven:** scalable, interoperable, secure, and easy to deploy.
It is built for VWSCs, Gram Panchayats, implementing agencies and State authorities. The loop at the bottom is: Sense, Understand, Alert, Report, Fix, Verify."

---

## Slide 3: Technical approach (1:40 to 3:10)

**The architecture.**
"The architecture has five layers, left to right. **Field and village:** a pump and tank node, head and tail nodes with pressure, flow, acoustic and chlorine sensors, water-quality kits, and the villager's mobile app in English, Telugu and Hindi. **Gateway and API:** LoRa to a Raspberry Pi gateway, then 4G MQTT, into a secure ingestion API. **AI/ML:** a rules and sensor-health gate, anomaly detection with Isolation Forest, forecasts of pressure, chlorine and failure window, DBSCAN clusters of complaints, and evidence fusion that gives every household a tap status. **Alert and act:** the Alert Center, a maintenance planner, and incident to repair to verified restoration. **Users and platforms:** dashboards for the VWSC, Gram Panchayat, District and State, and sync to IMIS, Sujal Gaon IDs, JJM Dashboard and WQMIS. Underneath is a PostgreSQL and PostGIS data layer with JWT security."

**Technology stack (right).**
"The stack: React, Vite, Tailwind and MapLibre for the app; Python and FastAPI for the backend; PostgreSQL with PostGIS; scikit-learn for the AI/ML; ESP32, LoRa and Raspberry Pi for the field; REST with OpenAPI, GeoJSON and CSV for interfaces; and Docker for deployment. The node runs **MicroPython firmware** that we wrote: it reads each sensor, scales it, keeps readings if the network drops, and sends them to the API; a Raspberry Pi bridge forwards them."

**Hardware (bottom).**
"Now the hardware, part by part. The **ESP32** reads the sensors and sleeps between samples. The **LoRa radio** sends readings to the gateway. The **Raspberry Pi** buffers them, so nothing is lost if the network drops. The **acoustic and vibration sensor** is a piezo sensor clamped on the pipe. It listens for **leak noise**, and a leak is much more certain when the noise and the head-to-tail flow gap agree. The **residual chlorine sensor** is a 4-20 mA probe in a flow cell at the tail end. It measures the actual chlorine and raises a low-chlorine alert. We also use pressure and flow sensors at head and tail, an ultrasonic level sensor on the tank, and a solar panel with a battery so a node runs off-grid."

---

## Slide 4: Feasibility and viability (3:10 to 4:40)

**The circuit.**
"Here is the **circuit** of one sensor node. A solar panel, charge controller and 12-volt battery power it. A buck converter gives 5 volts to the ESP32, and a boost converter gives **24 volts for the 4-20 mA loops**. The pressure transmitter and the chlorine probe each give a current, and a **150-ohm shunt** turns it into 0.6 to 3 volts, which the **ADS1115 16-bit ADC** reads over I2C. The flow meter gives pulses. The acoustic sensor goes through a pre-amplifier and a band-pass filter into the ESP32's analog input. The LoRa radio is on SPI."

**Scalability, interoperability, security, deployment.**
"These four cards are the last point of the statement. **Scalability:** one village, then a cluster per gateway, block, district and state, with stateless APIs and PostGIS. **Interoperability:** keyed to Sujal Gaon and Sujalam Bharat IDs, sync with IMIS, JJM Dashboard and WQMIS, and open formats: REST, OpenAPI, GeoJSON, CSV. **Data security:** role-based access by village, hashed passwords, rate limits, an audit log, GPS removed from photos, and no personal data sent to other platforms. **Ease of deployment:** a solar node, a plug-in LoRa gateway, a mobile web app with nothing to install, and Docker for the servers.
The picture shows the **installation**: a solar pole node, a **clamp-on acoustic sensor, so no digging**, a chlorine flow cell at the tail end, and a LoRa link to the Panchayat."

**Feasibility and risks.**
"The idea is feasible because it uses off-the-shelf sensors and open-source software, and the rules work from day one while the AI improves as readings accumulate. The challenges and our answers: false alarms are handled with persistence windows and two kinds of evidence; sensor faults with a health gate and checking the chlorine probe against a DPD kit; rural networks with a gateway that buffers; trust in AI because every score shows its reasons; leak versus noise with a per-pipe acoustic baseline and the flow gap; and platform access, where official access and specifications are needed."

---

## Slide 5: Impact and benefits (4:40 to 5:40)

"The left side lists the **six expected outcomes** of the statement. One, an AI/ML-enabled platform for real-time monitoring of FHTCs and service delivery. Two, early identification and prediction of disruptions, water quality issues and infrastructure failures. Three, community participation through mobile feedback, grievance reporting and service validation. Four, automatic integration with IMIS, Sujal Gaon IDs and other JJM platforms. Five, operational efficiency, preventive maintenance planning, transparency and evidence-based decisions. Six, reliability, accountability and sustainability of FHTCs through continuous AI-assisted monitoring.
The picture shows before and after: a dry tap and a lost complaint, versus an early alert, a verified repair, and a villager who is told. Below, the benefit for each group: the **VWSC and Gram Panchayat** get an Alert Center and a ranked inspection list; **implementing agencies** get a preventive maintenance plan; **State authorities** get multi-level analytics and GIS; **villagers** get a voice in their own language.
The roadmap runs from the idea, to the working software platform, a bench rig with real nodes, the finale demo, and a field pilot, where we will measure time to detect, time to repair, and the share of taps working."

---

## Slide 6: References and close (5:40 to 6:10)

"Our references are official: the DDWS functionality assessment, PIB releases, the JJM Dashboard and WQMIS, and a review of ML anomaly detection in water networks. These are the screens of our working platform: the villager app, the AI Early Warning page, and the village map showing issues. Readings for pH, TDS and turbidity are screening indicators that lead to confirmatory testing.
To close: JalRakshak watches every tap, warns early, listens to villagers in their own language, and fixes problems before they spread. Thank you."

---

## If the evaluators ask

| Question | Short answer |
|---|---|
| Have you built the hardware? | The software platform is complete, and we wrote the node firmware and gateway. We tested the firmware against our platform with a software model of the board, and we have an ESP32 simulation project. The parts are not assembled yet; a bench rig is our next step. Until then the platform runs on demo data. |
| Is the IMIS sync live? | The sync is built to IMIS, Sujal Gaon, JJM Dashboard and WQMIS formats. Going live needs official access and specifications from NJJM. |
| How accurate is the AI? | We do not claim an accuracy figure yet. We will measure it on real readings during the pilot. |
| Why an acoustic sensor? | A leak makes noise on the pipe. It confirms what the flow gap suggests and narrows down the section. |
| Why a chlorine sensor? | It measures real residual chlorine, so water-quality alerts rest on a measurement. |
| What if the network drops? | The Raspberry Pi gateway stores readings and sends them when the network returns. |
| Can you call the water "safe"? | No. Field kits and sensors are a screening. We say "passed" or "failed" and trigger a confirmatory test. |
| What does it cost? | We have not quoted costs. We use commodity parts and open-source software. |
