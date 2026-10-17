// Citizen-facing strings in English, Telugu and Hindi.
// Telugu and Hindi are first drafts: a native speaker on the team must review them before any demo.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const en = {
  app: { tagline: 'Your Water. Your Village. Your Voice.', demoLogin: 'Demo login — prototype', simulated: 'Simulated data' },
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
  home: { timing: "Today's water timing", next: 'Next supply', reportCta: 'Report a Problem', reportSub: 'No water, low water, dirty water, leakage', myComplaints: 'My complaints', none: 'No complaints yet' },
  report: {
    title: 'What is the problem?', addPhoto: 'Add a photo', replace: 'Replace', remove: 'Remove', more: 'Tell us more (optional)',
    voice: 'Voice note (coming later)', location: 'Share approximate location', locationHint: 'Village area only, about 1 km', area: 'Area', submit: 'Submit',
    already: 'You have already reported complaint #{{code}} in this demo.', pick: 'Choose a problem first',
  },
  category: { NO_WATER: 'No water', LOW_WATER: 'Low water', DIRTY_WATER: 'Dirty water', BAD_SMELL: 'Bad smell', LEAKAGE: 'Leakage', DAMAGED_TAP: 'Damaged tap', OTHER: 'Other' },
  done: {
    checking: 'Checking image…', observation: 'Possible leakage visible near a pipe — inspection recommended.',
    disclaimer: 'Prototype simulation — not an AI diagnosis. A photo cannot show underground pipe condition.',
    received: 'Complaint #{{code}} received', track: 'Track my complaint',
  },
  timeline: { received: 'Received', checking: 'Being checked', repairStarted: 'Repair started', restored: 'Water restored — verified' },
  detail: { restoredMsg: 'Water supply in your area is back to normal. Thank you for reporting.', stillProblem: 'Still a problem? Tell us' },
};

const te = {
  app: { tagline: 'మీ నీరు. మీ గ్రామం. మీ గొంతు.', demoLogin: 'డెమో లాగిన్ — నమూనా', simulated: 'అనుకరణ డేటా' },
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
  home: { timing: 'ఈరోజు నీటి సమయం', next: 'తదుపరి సరఫరా', reportCta: 'సమస్యను తెలపండి', reportSub: 'నీరు లేదు, తక్కువ నీరు, మురికి నీరు, లీకేజీ', myComplaints: 'నా ఫిర్యాదులు', none: 'ఇంకా ఫిర్యాదులు లేవు' },
  report: {
    title: 'సమస్య ఏమిటి?', addPhoto: 'ఫోటో జోడించండి', replace: 'మార్చు', remove: 'తీసివేయి', more: 'మరింత చెప్పండి (ఐచ్ఛికం)',
    voice: 'వాయిస్ సందేశం (త్వరలో)', location: 'సుమారు స్థానాన్ని పంచుకోండి', locationHint: 'గ్రామ ప్రాంతం మాత్రమే, సుమారు 1 కి.మీ.', area: 'ప్రాంతం', submit: 'సమర్పించు',
    already: 'మీరు ఈ డెమోలో ఇప్పటికే #{{code}} ఫిర్యాదు చేశారు.', pick: 'ముందుగా సమస్యను ఎంచుకోండి',
  },
  category: { NO_WATER: 'నీరు రావడం లేదు', LOW_WATER: 'నీరు తక్కువగా వస్తోంది', DIRTY_WATER: 'మురికి నీరు', BAD_SMELL: 'దుర్వాసన', LEAKAGE: 'లీకేజీ', DAMAGED_TAP: 'పాడైన కుళాయి', OTHER: 'ఇతర' },
  done: {
    checking: 'ఫోటోను పరిశీలిస్తోంది…', observation: 'పైపు దగ్గర లీకేజీ కనిపించే అవకాశం ఉంది — పరిశీలన సిఫార్సు చేయబడింది.',
    disclaimer: 'నమూనా అనుకరణ — ఇది AI నిర్ధారణ కాదు. ఫోటో భూగర్భ పైపు స్థితిని చూపదు.',
    received: 'ఫిర్యాదు #{{code}} అందింది', track: 'నా ఫిర్యాదును చూడండి',
  },
  timeline: { received: 'అందింది', checking: 'పరిశీలనలో ఉంది', repairStarted: 'మరమ్మతు ప్రారంభమైంది', restored: 'నీరు పునరుద్ధరించబడింది — ధృవీకరించబడింది' },
  detail: { restoredMsg: 'మీ ప్రాంతంలో నీటి సరఫరా సాధారణ స్థితికి వచ్చింది. తెలియజేసినందుకు ధన్యవాదాలు.', stillProblem: 'ఇంకా సమస్య ఉందా? మాకు చెప్పండి' },
};

const hi = {
  app: { tagline: 'आपका पानी। आपका गाँव। आपकी आवाज़।', demoLogin: 'डेमो लॉगिन — प्रोटोटाइप', simulated: 'सिम्युलेटेड डेटा' },
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
  home: { timing: 'आज पानी का समय', next: 'अगली आपूर्ति', reportCta: 'समस्या बताएं', reportSub: 'पानी नहीं, कम पानी, गंदा पानी, रिसाव', myComplaints: 'मेरी शिकायतें', none: 'अभी कोई शिकायत नहीं' },
  report: {
    title: 'समस्या क्या है?', addPhoto: 'फ़ोटो जोड़ें', replace: 'बदलें', remove: 'हटाएँ', more: 'और बताएं (वैकल्पिक)',
    voice: 'आवाज़ संदेश (जल्द)', location: 'अनुमानित स्थान साझा करें', locationHint: 'केवल गाँव का क्षेत्र, लगभग 1 किमी', area: 'क्षेत्र', submit: 'जमा करें',
    already: 'आप इस डेमो में पहले ही #{{code}} दर्ज कर चुके हैं।', pick: 'पहले समस्या चुनें',
  },
  category: { NO_WATER: 'पानी नहीं आ रहा', LOW_WATER: 'पानी कम आ रहा', DIRTY_WATER: 'गंदा पानी', BAD_SMELL: 'बदबू', LEAKAGE: 'रिसाव', DAMAGED_TAP: 'टूटा नल', OTHER: 'अन्य' },
  done: {
    checking: 'फ़ोटो की जाँच हो रही है…', observation: 'पाइप के पास रिसाव दिख सकता है — जाँच की सलाह दी जाती है।',
    disclaimer: 'प्रोटोटाइप सिमुलेशन — यह AI निदान नहीं है। फ़ोटो ज़मीन के नीचे पाइप की स्थिति नहीं दिखा सकती।',
    received: 'शिकायत #{{code}} प्राप्त हुई', track: 'मेरी शिकायत देखें',
  },
  timeline: { received: 'प्राप्त', checking: 'जाँच हो रही है', repairStarted: 'मरम्मत शुरू', restored: 'पानी बहाल — सत्यापित' },
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
