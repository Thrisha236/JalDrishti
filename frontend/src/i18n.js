// Citizen-facing strings in English, Telugu and Hindi.
// Telugu and Hindi are first drafts: a native speaker on the team must review them before any demo.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const en = {
  app: { tagline: 'Your Water. Your Village. Your Voice.', demoLogin: 'Demo login — prototype', simulated: 'Demo data' },
  login: { who: 'Who are you?', citizen: 'Villager / Citizen', gp: 'Gram Panchayat', officer: 'Government Officer', continue: 'Continue', citizenHint: 'Water timings, report a problem', gpHint: 'Village water operations', officerHint: 'Multi-village monitoring' },
  nav: { home: 'Home', report: 'Report', complaints: 'My complaints', map: 'Map', switchRole: 'Switch role' },
  level: { normal: 'Normal', warning: 'Warning', problem: 'Problem' },
  status: {
    available: 'Water available',
    attention: 'A pipeline in your area may need attention',
    lowSupply: 'Low supply in your area. Officials are checking.',
    repairing: 'Repair in progress in your area',
    restored: 'Water supply restored (verified)',
  },
  quality: {
    title: 'Water quality',
    safe: 'Passed the field test on {{date}}. If water looks or smells wrong, do not drink it untreated.',
    watch: 'Under watch after the last test ({{date}}). A re-test is due.',
    unsafe: 'Failed the field test. Boil drinking water until a new test passes.',
    untested: 'Not tested yet in your area.',
    who: 'Screened by trained village women with a field test kit. This is not a laboratory certificate.',
  },
  track: {
    id: 'Track ID', title: 'Track a complaint', hint: 'Enter the track ID from your SMS, call or screen, for example 2048', button: 'Track',
    notFound: 'No complaint with track ID {{code}} in your account.', another: 'Report another problem', all: 'See all',
    reported: 'Reported {{when}}', count: '{{count}} complaints', open: 'Open', closed: 'Closed', keep: 'Keep this track ID to follow your complaint.',
    via: { APP: 'in the app', MISSED_CALL: 'by missed call', WHATSAPP: 'by WhatsApp' },
  },
  tap: {
    title: 'My tap', id: 'Tap ID {{id}}', status: { FUNCTIONAL: 'Working', PARTIAL: 'Low water', NON_FUNCTIONAL: 'Not working' },
    source: { network: 'Estimated from the village network', citizen: 'From your own report' },
    checkTitle: 'Did you get water today?', yes: 'Yes', no: 'No', qtyTitle: 'Was it enough?', enough: 'Enough', low: 'Too little',
    lookTitle: 'How did it look?', clear: 'Clear', coloured: 'Coloured', smell: 'Bad smell', other: 'Something else',
    rateTitle: 'How is your water service?', ratingHint: '1 = very poor, 5 = very good', comment: 'Anything to add? (optional)',
    send: 'Send', sent: 'Thank you. Your report helps the Gram Panchayat fix problems sooner.', update: "Change today's answer",
    today: 'You reported today', history: 'Last 14 days', none: 'No reports yet',
    privacy: 'Only your Gram Panchayat sees this. Your name is never sent to other systems.', noHousehold: 'Your account is not linked to a household yet.',
    gotWater: 'Water came', noWater: 'No water',
  },
  geo: {
    title: 'Mark the spot (optional)', hint: 'Tap the village map where the problem is. Only a place about 25 m wide is saved, never your house.',
    consent: 'I agree to share this spot with my Gram Panchayat', clear: 'Remove spot', chosen: 'Spot chosen',
  },
  home: { timing: "Today's water timing", next: 'Next supply', reportCta: 'Report a Problem', reportSub: 'No water, low water, dirty water, leakage', myComplaints: 'My complaints', none: 'No complaints yet' },
  report: {
    title: 'What is the problem?', byPhone: 'No smartphone? Report by missed call or WhatsApp', addPhoto: 'Add a photo', replace: 'Replace', remove: 'Remove', more: 'Tell us more (optional)',
    voice: 'Voice note (coming later)', location: 'Share approximate location', locationHint: 'Village area only, about 1 km', area: 'Area', submit: 'Submit',
    already: 'You have already reported complaint #{{code}} in this demo.', pick: 'Choose a problem first',
    errorType: 'Please choose a photo (JPEG, PNG or WebP).', errorTooLarge: 'The photo is too large. Please use one under 8 MB.',
    errorDuplicate: '{{detail}}', errorGeneric: 'Could not send your report. Please try again.',
  },
  category: { NO_WATER: 'No water', LOW_WATER: 'Low water', DIRTY_WATER: 'Dirty water', BAD_SMELL: 'Bad smell', LEAKAGE: 'Leakage', DAMAGED_TAP: 'Damaged tap', OTHER: 'Other' },
  done: {
    checking: 'Checking image…', observation: 'Possible leakage visible near a pipe — inspection recommended.',
    disclaimer: 'Demo image check — not an AI diagnosis. A photo cannot show underground pipe condition.',
    received: 'Complaint #{{code}} received', track: 'Track my complaint',
  },
  timeline: { received: 'Received', checking: 'Being checked', repairStarted: 'Repair started', restored: 'Water restored — verified', resolvedUnverified: 'Resolved — not verified by sensors' },
  notify: {
    title: 'Updates', none: 'No updates yet.', channel: 'Shown in the app only. SMS and voice calls are not connected in this prototype.',
    advisory: {
      boil_water: "Boil drinking water: your area failed today's water field test. Boil water until a new test passes.",
      cleared: 'A new field test in your area passed. You can stop boiling water if it looks and smells normal.',
    },
    complaint: {
      being_checked: 'Your complaint #{{code}} is being checked by the Gram Panchayat.',
      repair_started: 'Repair work has started for complaint #{{code}}.',
      restored_verified: 'Water supply is back to normal. Sensor readings confirmed it (complaint #{{code}}).',
      resolved_unverified: 'Complaint #{{code}} was closed by the Gram Panchayat. Sensors could not confirm it; tell us if the problem continues.',
    },
  },
  detail: { restoredMsg: 'Water supply in your area is back to normal. Thank you for reporting.', stillProblem: 'Still a problem? Tell us' },
};

const te = {
  app: { tagline: 'మీ నీరు. మీ గ్రామం. మీ గొంతు.', demoLogin: 'డెమో లాగిన్ — నమూనా', simulated: 'డెమో డేటా' },
  login: { who: 'మీరు ఎవరు?', citizen: 'గ్రామస్థులు / పౌరులు', gp: 'గ్రామ పంచాయతీ', officer: 'ప్రభుత్వ అధికారి', continue: 'కొనసాగించు', citizenHint: 'నీటి సమయాలు, సమస్యను తెలపండి', gpHint: 'గ్రామ నీటి నిర్వహణ', officerHint: 'అనేక గ్రామాల పర్యవేక్షణ' },
  nav: { home: 'హోమ్', report: 'ఫిర్యాదు', complaints: 'నా ఫిర్యాదులు', map: 'మ్యాప్', switchRole: 'పాత్ర మార్చు' },
  level: { normal: 'సాధారణం', warning: 'హెచ్చరిక', problem: 'సమస్య' },
  status: {
    available: 'నీరు అందుబాటులో ఉంది',
    attention: 'మీ ప్రాంతంలోని ఒక పైప్‌లైన్‌కు పరిశీలన అవసరం కావచ్చు',
    lowSupply: 'మీ ప్రాంతంలో నీటి సరఫరా తక్కువగా ఉంది. అధికారులు పరిశీలిస్తున్నారు.',
    repairing: 'మీ ప్రాంతంలో మరమ్మతు జరుగుతోంది',
    restored: 'నీటి సరఫరా పునరుద్ధరించబడింది (ధృవీకరించబడింది)',
  },
  quality: {
    title: 'నీటి నాణ్యత',
    safe: 'క్షేత్ర పరీక్షలో ఉత్తీర్ణమైంది ({{date}}). నీరు చూడటానికి లేదా వాసనకు తేడాగా ఉంటే శుద్ధి చేయకుండా తాగకండి.',
    watch: 'చివరి పరీక్ష ({{date}}) తర్వాత పరిశీలనలో ఉంది. మళ్లీ పరీక్ష చేయాలి.',
    unsafe: 'క్షేత్ర పరీక్షలో విఫలమైంది. కొత్త పరీక్ష ఉత్తీర్ణమయ్యే వరకు తాగే నీటిని మరిగించండి.',
    untested: 'మీ ప్రాంతంలో ఇంకా పరీక్షించలేదు.',
    who: 'గ్రామంలో శిక్షణ పొందిన మహిళలు ఫీల్డ్ టెస్ట్ కిట్‌తో పరీక్షించారు. ఇది ప్రయోగశాల ధృవీకరణ కాదు.',
  },
  track: {
    id: 'ట్రాక్ ఐడీ', title: 'ఫిర్యాదును ట్రాక్ చేయండి', hint: 'SMS, కాల్ లేదా తెరపై వచ్చిన ట్రాక్ ఐడీని ఇవ్వండి, ఉదా. 2048', button: 'ట్రాక్ చేయండి',
    notFound: 'మీ ఖాతాలో {{code}} ట్రాక్ ఐడీతో ఫిర్యాదు లేదు.', another: 'మరో సమస్యను తెలపండి', all: 'అన్నీ చూడండి',
    reported: '{{when}}న తెలిపారు', count: '{{count}} ఫిర్యాదులు', open: 'తెరిచి ఉంది', closed: 'ముగిసింది', keep: 'మీ ఫిర్యాదును అనుసరించడానికి ఈ ట్రాక్ ఐడీని గుర్తుంచుకోండి.',
    via: { APP: 'యాప్‌లో', MISSED_CALL: 'మిస్డ్ కాల్ ద్వారా', WHATSAPP: 'వాట్సాప్ ద్వారా' },
  },
  tap: {
    title: 'నా నల్లా', id: 'నల్లా ID {{id}}', status: { FUNCTIONAL: 'పనిచేస్తోంది', PARTIAL: 'తక్కువ నీరు', NON_FUNCTIONAL: 'పనిచేయడం లేదు' },
    source: { network: 'గ్రామ నెట్‌వర్క్ ఆధారంగా అంచనా', citizen: 'మీ స్వంత నివేదిక ఆధారంగా' },
    checkTitle: 'ఈరోజు నీరు వచ్చిందా?', yes: 'అవును', no: 'లేదు', qtyTitle: 'సరిపోయిందా?', enough: 'సరిపోయింది', low: 'చాలా తక్కువ',
    lookTitle: 'నీరు ఎలా కనిపించింది?', clear: 'స్పష్టంగా', coloured: 'రంగుతో', smell: 'చెడు వాసన', other: 'ఇంకేదైనా',
    rateTitle: 'మీ నీటి సేవ ఎలా ఉంది?', ratingHint: '1 = చాలా తక్కువ, 5 = చాలా బాగుంది', comment: 'ఇంకేమైనా చెప్పాలా? (ఐచ్ఛికం)',
    send: 'పంపండి', sent: 'ధన్యవాదాలు. మీ నివేదిక గ్రామ పంచాయతీకి సమస్యలను త్వరగా పరిష్కరించడంలో సహాయపడుతుంది.', update: 'ఈరోజు సమాధానం మార్చండి',
    today: 'మీరు ఈరోజు తెలిపారు', history: 'గత 14 రోజులు', none: 'ఇంకా నివేదికలు లేవు',
    privacy: 'మీ గ్రామ పంచాయతీ మాత్రమే దీన్ని చూస్తుంది. మీ పేరు ఇతర వ్యవస్థలకు పంపబడదు.', noHousehold: 'మీ ఖాతా ఇంకా ఏ ఇంటికీ అనుసంధానం కాలేదు.',
    gotWater: 'నీరు వచ్చింది', noWater: 'నీరు రాలేదు',
  },
  geo: {
    title: 'ప్రదేశాన్ని గుర్తించండి (ఐచ్ఛికం)', hint: 'సమస్య ఉన్న చోట గ్రామ మ్యాప్‌ను తాకండి. సుమారు 25 మీ. ప్రాంతం మాత్రమే నిల్వ అవుతుంది, మీ ఇల్లు కాదు.',
    consent: 'ఈ ప్రదేశాన్ని నా గ్రామ పంచాయతీతో పంచుకోవడానికి అంగీకరిస్తున్నాను', clear: 'ప్రదేశాన్ని తొలగించు', chosen: 'ప్రదేశం ఎంచుకున్నారు',
  },
  home: { timing: 'ఈరోజు నీటి సమయం', next: 'తదుపరి సరఫరా', reportCta: 'సమస్యను తెలపండి', reportSub: 'నీరు లేదు, తక్కువ నీరు, మురికి నీరు, లీకేజీ', myComplaints: 'నా ఫిర్యాదులు', none: 'ఇంకా ఫిర్యాదులు లేవు' },
  report: {
    title: 'సమస్య ఏమిటి?', byPhone: 'స్మార్ట్‌ఫోన్ లేదా? మిస్డ్ కాల్ లేదా వాట్సాప్ ద్వారా తెలపండి', addPhoto: 'ఫోటో జోడించండి', replace: 'మార్చు', remove: 'తీసివేయి', more: 'మరింత చెప్పండి (ఐచ్ఛికం)',
    voice: 'వాయిస్ సందేశం (త్వరలో)', location: 'సుమారు స్థానాన్ని పంచుకోండి', locationHint: 'గ్రామ ప్రాంతం మాత్రమే, సుమారు 1 కి.మీ.', area: 'ప్రాంతం', submit: 'సమర్పించు',
    already: 'మీరు ఈ డెమోలో ఇప్పటికే #{{code}} ఫిర్యాదు చేశారు.', pick: 'ముందుగా సమస్యను ఎంచుకోండి',
    errorType: 'దయచేసి ఫోటోను ఎంచుకోండి (JPEG, PNG లేదా WebP).', errorTooLarge: 'ఫోటో చాలా పెద్దది. 8 MB కంటే చిన్నది ఉపయోగించండి.',
    errorDuplicate: 'మీరు ఈ సమస్యను ఇప్పటికే తెలిపారు.', errorGeneric: 'మీ ఫిర్యాదు పంపలేకపోయాము. దయచేసి మళ్ళీ ప్రయత్నించండి.',
  },
  category: { NO_WATER: 'నీరు రావడం లేదు', LOW_WATER: 'నీరు తక్కువగా వస్తోంది', DIRTY_WATER: 'మురికి నీరు', BAD_SMELL: 'దుర్వాసన', LEAKAGE: 'లీకేజీ', DAMAGED_TAP: 'పాడైన కుళాయి', OTHER: 'ఇతర' },
  done: {
    checking: 'ఫోటోను పరిశీలిస్తోంది…', observation: 'పైపు దగ్గర లీకేజీ కనిపించే అవకాశం ఉంది — పరిశీలన సిఫార్సు చేయబడింది.',
    disclaimer: 'నమూనా అనుకరణ — ఇది AI నిర్ధారణ కాదు. ఫోటో భూగర్భ పైపు స్థితిని చూపదు.',
    received: 'ఫిర్యాదు #{{code}} అందింది', track: 'నా ఫిర్యాదును చూడండి',
  },
  timeline: { received: 'అందింది', checking: 'పరిశీలనలో ఉంది', repairStarted: 'మరమ్మతు ప్రారంభమైంది', restored: 'నీరు పునరుద్ధరించబడింది — ధృవీకరించబడింది', resolvedUnverified: 'పరిష్కరించబడింది — సెన్సార్ ధృవీకరణ లేదు' },
  notify: {
    title: 'తాజా సమాచారం', none: 'ఇంకా సమాచారం లేదు.', channel: 'యాప్‌లో మాత్రమే. ఈ నమూనాలో SMS, వాయిస్ కాల్స్ లేవు.',
    advisory: {
      boil_water: 'తాగే నీటిని మరిగించండి: ఈరోజు మీ ప్రాంతంలో నీటి క్షేత్ర పరీక్ష విఫలమైంది. కొత్త పరీక్ష ఉత్తీర్ణమయ్యే వరకు నీటిని మరిగించండి.',
      cleared: 'మీ ప్రాంతంలో కొత్త క్షేత్ర పరీక్ష ఉత్తీర్ణమైంది. నీరు సాధారణంగా కనిపించి వాసన లేకపోతే మరిగించడం ఆపవచ్చు.',
    },
    complaint: {
      being_checked: 'మీ ఫిర్యాదు #{{code}} ను గ్రామ పంచాయతీ పరిశీలిస్తోంది.',
      repair_started: 'ఫిర్యాదు #{{code}} కోసం మరమ్మతు పని ప్రారంభమైంది.',
      restored_verified: 'నీటి సరఫరా సాధారణ స్థితికి వచ్చింది. సెన్సార్ రీడింగ్‌లు నిర్ధారించాయి (ఫిర్యాదు #{{code}}).',
      resolved_unverified: 'ఫిర్యాదు #{{code}} ను గ్రామ పంచాయతీ ముగించింది. సెన్సార్లు నిర్ధారించలేదు; సమస్య కొనసాగితే తెలపండి.',
    },
  },
  detail: { restoredMsg: 'మీ ప్రాంతంలో నీటి సరఫరా సాధారణ స్థితికి వచ్చింది. తెలియజేసినందుకు ధన్యవాదాలు.', stillProblem: 'ఇంకా సమస్య ఉందా? మాకు చెప్పండి' },
};

const hi = {
  app: { tagline: 'आपका पानी। आपका गाँव। आपकी आवाज़।', demoLogin: 'डेमो लॉगिन — प्रोटोटाइप', simulated: 'डेमो डेटा' },
  login: { who: 'आप कौन हैं?', citizen: 'ग्रामवासी / नागरिक', gp: 'ग्राम पंचायत', officer: 'सरकारी अधिकारी', continue: 'आगे बढ़ें', citizenHint: 'पानी का समय, समस्या बताएं', gpHint: 'गाँव का जल संचालन', officerHint: 'कई गाँवों की निगरानी' },
  nav: { home: 'होम', report: 'शिकायत करें', complaints: 'मेरी शिकायतें', map: 'नक्शा', switchRole: 'भूमिका बदलें' },
  level: { normal: 'सामान्य', warning: 'चेतावनी', problem: 'समस्या' },
  status: {
    available: 'पानी उपलब्ध है',
    attention: 'आपके क्षेत्र की एक पाइपलाइन पर ध्यान देने की ज़रूरत हो सकती है',
    lowSupply: 'आपके क्षेत्र में पानी की आपूर्ति कम है। अधिकारी जाँच कर रहे हैं।',
    repairing: 'आपके क्षेत्र में मरम्मत चल रही है',
    restored: 'पानी की आपूर्ति बहाल हो गई (सत्यापित)',
  },
  quality: {
    title: 'पानी की गुणवत्ता',
    safe: 'फ़ील्ड जाँच में पास ({{date}})। पानी देखने या सूँघने में अजीब लगे तो बिना उपचार के न पिएँ।',
    watch: 'पिछली जाँच ({{date}}) के बाद निगरानी में। दोबारा जाँच होनी है।',
    unsafe: 'फ़ील्ड जाँच में असफल। नई जाँच पास होने तक पीने का पानी उबालकर पिएँ।',
    untested: 'आपके क्षेत्र में अभी जाँच नहीं हुई।',
    who: 'गाँव की प्रशिक्षित महिलाओं ने फ़ील्ड टेस्ट किट से जाँच की। यह प्रयोगशाला प्रमाणपत्र नहीं है।',
  },
  track: {
    id: 'ट्रैक आईडी', title: 'शिकायत ट्रैक करें', hint: 'SMS, कॉल या स्क्रीन पर मिली ट्रैक आईडी डालें, जैसे 2048', button: 'ट्रैक करें',
    notFound: 'आपके खाते में {{code}} ट्रैक आईडी वाली कोई शिकायत नहीं है।', another: 'एक और समस्या बताएँ', all: 'सभी देखें',
    reported: '{{when}} को दर्ज', count: '{{count}} शिकायतें', open: 'खुली', closed: 'बंद', keep: 'अपनी शिकायत देखने के लिए यह ट्रैक आईडी संभालकर रखें।',
    via: { APP: 'ऐप से', MISSED_CALL: 'मिस्ड कॉल से', WHATSAPP: 'व्हाट्सऐप से' },
  },
  tap: {
    title: 'मेरा नल', id: 'नल ID {{id}}', status: { FUNCTIONAL: 'चालू', PARTIAL: 'कम पानी', NON_FUNCTIONAL: 'बंद' },
    source: { network: 'गाँव के नेटवर्क से अनुमान', citizen: 'आपकी अपनी रिपोर्ट से' },
    checkTitle: 'क्या आज पानी आया?', yes: 'हाँ', no: 'नहीं', qtyTitle: 'क्या पर्याप्त था?', enough: 'पर्याप्त', low: 'बहुत कम',
    lookTitle: 'पानी कैसा दिखा?', clear: 'साफ़', coloured: 'रंगीन', smell: 'बदबू', other: 'कुछ और',
    rateTitle: 'आपकी पानी सेवा कैसी है?', ratingHint: '1 = बहुत खराब, 5 = बहुत अच्छी', comment: 'कुछ और जोड़ना है? (वैकल्पिक)',
    send: 'भेजें', sent: 'धन्यवाद। आपकी रिपोर्ट से ग्राम पंचायत समस्याएँ जल्दी ठीक कर पाती है।', update: 'आज का जवाब बदलें',
    today: 'आपने आज बताया', history: 'पिछले 14 दिन', none: 'अभी कोई रिपोर्ट नहीं',
    privacy: 'इसे केवल आपकी ग्राम पंचायत देखती है। आपका नाम दूसरी प्रणालियों को नहीं भेजा जाता।', noHousehold: 'आपका खाता अभी किसी घर से जुड़ा नहीं है।',
    gotWater: 'पानी आया', noWater: 'पानी नहीं आया',
  },
  geo: {
    title: 'जगह चिह्नित करें (वैकल्पिक)', hint: 'जहाँ समस्या है, गाँव के नक्शे पर छुएँ। केवल लगभग 25 मीटर का क्षेत्र सहेजा जाता है, आपका घर नहीं।',
    consent: 'मैं यह जगह अपनी ग्राम पंचायत से साझा करने के लिए सहमत हूँ', clear: 'जगह हटाएँ', chosen: 'जगह चुनी गई',
  },
  home: { timing: 'आज पानी का समय', next: 'अगली आपूर्ति', reportCta: 'समस्या बताएं', reportSub: 'पानी नहीं, कम पानी, गंदा पानी, रिसाव', myComplaints: 'मेरी शिकायतें', none: 'अभी कोई शिकायत नहीं' },
  report: {
    title: 'समस्या क्या है?', byPhone: 'स्मार्टफ़ोन नहीं है? मिस्ड कॉल या व्हाट्सऐप से बताएँ', addPhoto: 'फ़ोटो जोड़ें', replace: 'बदलें', remove: 'हटाएँ', more: 'और बताएं (वैकल्पिक)',
    voice: 'आवाज़ संदेश (जल्द)', location: 'अनुमानित स्थान साझा करें', locationHint: 'केवल गाँव का क्षेत्र, लगभग 1 किमी', area: 'क्षेत्र', submit: 'जमा करें',
    already: 'आप इस डेमो में पहले ही #{{code}} दर्ज कर चुके हैं।', pick: 'पहले समस्या चुनें',
    errorType: 'कृपया फ़ोटो चुनें (JPEG, PNG या WebP)।', errorTooLarge: 'फ़ोटो बहुत बड़ी है। 8 MB से छोटी फ़ोटो लगाएँ।',
    errorDuplicate: 'आप यह समस्या पहले ही बता चुके हैं।', errorGeneric: 'शिकायत भेजी नहीं जा सकी। कृपया फिर से कोशिश करें।',
  },
  category: { NO_WATER: 'पानी नहीं आ रहा', LOW_WATER: 'पानी कम आ रहा', DIRTY_WATER: 'गंदा पानी', BAD_SMELL: 'बदबू', LEAKAGE: 'रिसाव', DAMAGED_TAP: 'टूटा नल', OTHER: 'अन्य' },
  done: {
    checking: 'फ़ोटो की जाँच हो रही है…', observation: 'पाइप के पास रिसाव दिख सकता है — जाँच की सलाह दी जाती है।',
    disclaimer: 'प्रोटोटाइप सिमुलेशन — यह AI निदान नहीं है। फ़ोटो ज़मीन के नीचे पाइप की स्थिति नहीं दिखा सकती।',
    received: 'शिकायत #{{code}} प्राप्त हुई', track: 'मेरी शिकायत देखें',
  },
  timeline: { received: 'प्राप्त', checking: 'जाँच हो रही है', repairStarted: 'मरम्मत शुरू', restored: 'पानी बहाल — सत्यापित', resolvedUnverified: 'हल किया गया — सेंसर से सत्यापित नहीं' },
  notify: {
    title: 'अपडेट', none: 'अभी कोई अपडेट नहीं।', channel: 'केवल ऐप में। इस प्रोटोटाइप में SMS और वॉइस कॉल जुड़े नहीं हैं।',
    advisory: {
      boil_water: 'पीने का पानी उबालें: आज आपके क्षेत्र की पानी की फ़ील्ड जाँच असफल रही। नई जाँच पास होने तक पानी उबालें।',
      cleared: 'आपके क्षेत्र की नई फ़ील्ड जाँच पास हुई। पानी सामान्य दिखे और बदबू न हो तो उबालना बंद कर सकते हैं।',
    },
    complaint: {
      being_checked: 'आपकी शिकायत #{{code}} की ग्राम पंचायत जाँच कर रही है।',
      repair_started: 'शिकायत #{{code}} के लिए मरम्मत शुरू हो गई है।',
      restored_verified: 'पानी की आपूर्ति सामान्य हो गई है। सेंसर रीडिंग से पुष्टि हुई (शिकायत #{{code}})।',
      resolved_unverified: 'शिकायत #{{code}} ग्राम पंचायत ने बंद की। सेंसर से पुष्टि नहीं हुई; समस्या बनी रहे तो बताएँ।',
    },
  },
  detail: { restoredMsg: 'आपके क्षेत्र में पानी की आपूर्ति सामान्य हो गई है। बताने के लिए धन्यवाद।', stillProblem: 'अब भी समस्या है? हमें बताएं' },
};

let lng = 'en';
try {
  lng = localStorage.getItem('jalrakshak-lang') || 'en';
} catch {
  /* default to English */
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, te: { translation: te }, hi: { translation: hi } },
  lng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (l) => {
  document.documentElement.lang = l;
  try {
    localStorage.setItem('jalrakshak-lang', l);
  } catch {
    /* ignore */
  }
});

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'hi', label: 'हिंदी' },
];

export default i18n;
