// Report by missed call (IVR) or WhatsApp, for villagers without a smartphone app or who prefer
// voice. Both flows are simulated on screen but create a real complaint through the same API as
// the app, tagged with its channel. In production: a toll-free number with an IVR provider, and the
// WhatsApp Business API; the caller's area comes from their registered number.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { S } from '../../demo/steps';
import { nextOfflineCode } from '../../data/myComplaints';
import { areas, CITIZEN_AREA, dataSource, reloadData } from '../../data/seed';
import { apiFetch } from '../../data/api';
import { PageHeader } from '../../components/ui';
import Icon from '../../components/Icon';

const OPTIONS = ['NO_WATER', 'LOW_WATER', 'DIRTY_WATER', 'LEAKAGE'];
const DEMO_NUMBER = '1800-000-0000';

// Telugu and Hindi drafts need review by native speakers, like the rest of the app's translations.
const SCRIPT = {
  en: {
    title: 'Report by phone',
    subtitle: 'No smartphone needed: give a missed call, or send a WhatsApp message.',
    missedCall: 'Missed call',
    whatsapp: 'WhatsApp',
    dial: `Give a missed call to ${DEMO_NUMBER}`,
    callingBack: 'JalRakshak is calling you back…',
    answer: 'Answer',
    greeting: 'Welcome to JalRakshak. For no water, press 1. For low water, press 2. For dirty water, press 3. For a leak, press 4.',
    confirm: 'You reported {problem} in {area}. Press 1 to confirm. Press 2 to choose again.',
    done: 'Thank you. Your complaint number is {code}. We will send updates by SMS.',
    duplicate: 'You already reported this problem as {code}. We are working on it.',
    failed: 'Sorry, we could not register your complaint. Please try again.',
    waGreeting: 'Namaste! This is JalRakshak. What is the problem with water today?',
    waConfirm: 'Got it: {problem} in {area}. Shall I register a complaint?',
    yes: 'Yes, register',
    no: 'No, go back',
    waDone: 'Registered. Complaint #{code}. You will get updates here.',
    problems: { NO_WATER: 'no water', LOW_WATER: 'low water', DIRTY_WATER: 'dirty water', LEAKAGE: 'a leak' },
    again: 'Start again',
    track: 'Track this complaint',
    voice: 'Read prompts aloud',
    how: 'How this works in a village',
    howPoints: [
      'A free number: the call is cut after one ring, so it costs the caller nothing, and the system calls back.',
      'Prompts in Telugu, Hindi or English; the caller only presses a number.',
      'The caller’s area comes from their registered mobile number, so nothing needs typing.',
      'The complaint lands in the same Gram Panchayat inbox as app reports, marked with how it came in.',
    ],
    demoNote: 'Simulated on screen: no real call or message is sent. The complaint itself is real in the demo database.',
  },
  te: {
    title: 'ఫోన్ ద్వారా ఫిర్యాదు',
    subtitle: 'స్మార్ట్‌ఫోన్ అవసరం లేదు: మిస్డ్ కాల్ ఇవ్వండి లేదా వాట్సాప్ సందేశం పంపండి.',
    missedCall: 'మిస్డ్ కాల్',
    whatsapp: 'వాట్సాప్',
    dial: `${DEMO_NUMBER}కు మిస్డ్ కాల్ ఇవ్వండి`,
    callingBack: 'జలరక్షక్ మీకు తిరిగి కాల్ చేస్తోంది…',
    answer: 'కాల్ ఎత్తండి',
    greeting: 'జలరక్షక్‌కు స్వాగతం. నీరు రాకపోతే 1 నొక్కండి. నీరు తక్కువగా వస్తే 2 నొక్కండి. నీరు మురికిగా ఉంటే 3 నొక్కండి. లీకేజీ ఉంటే 4 నొక్కండి.',
    confirm: 'మీరు {area}లో {problem} అని తెలిపారు. నిర్ధారించడానికి 1 నొక్కండి. మళ్లీ ఎంచుకోవడానికి 2 నొక్కండి.',
    done: 'ధన్యవాదాలు. మీ ఫిర్యాదు సంఖ్య {code}. వివరాలు SMS ద్వారా పంపుతాము.',
    duplicate: 'మీరు ఈ సమస్యను ఇప్పటికే {code}గా తెలిపారు. మేము దానిపై పని చేస్తున్నాము.',
    failed: 'క్షమించండి, ఫిర్యాదు నమోదు కాలేదు. దయచేసి మళ్లీ ప్రయత్నించండి.',
    waGreeting: 'నమస్తే! ఇది జలరక్షక్. ఈరోజు నీటికి సంబంధించి సమస్య ఏమిటి?',
    waConfirm: 'సరే: {area}లో {problem}. ఫిర్యాదు నమోదు చేయమంటారా?',
    yes: 'అవును, నమోదు చేయండి',
    no: 'వద్దు, వెనక్కి',
    waDone: 'నమోదైంది. ఫిర్యాదు #{code}. అప్‌డేట్‌లు ఇక్కడే వస్తాయి.',
    problems: { NO_WATER: 'నీరు రావడం లేదు', LOW_WATER: 'నీరు తక్కువగా వస్తోంది', DIRTY_WATER: 'మురికి నీరు', LEAKAGE: 'లీకేజీ' },
    again: 'మళ్లీ ప్రారంభించండి',
    track: 'ఫిర్యాదును చూడండి',
    voice: 'సూచనలు వినిపించు',
    how: 'గ్రామంలో ఇది ఎలా పనిచేస్తుంది',
    howPoints: [
      'ఉచిత నంబర్: ఒక రింగ్ తర్వాత కాల్ కట్ అవుతుంది, కాబట్టి ఖర్చు ఉండదు; వ్యవస్థ తిరిగి కాల్ చేస్తుంది.',
      'తెలుగు, హిందీ లేదా ఇంగ్లీష్‌లో సూచనలు; ఒక అంకె నొక్కితే చాలు.',
      'నమోదైన మొబైల్ నంబర్ నుండే ప్రాంతం తెలుస్తుంది; ఏదీ టైప్ చేయనవసరం లేదు.',
      'యాప్ ఫిర్యాదులు వచ్చే గ్రామ పంచాయతీ ఇన్‌బాక్స్‌కే ఇది చేరుతుంది.',
    ],
    demoNote: 'తెరపై అనుకరణ మాత్రమే: నిజమైన కాల్ లేదా సందేశం పంపబడదు. ఫిర్యాదు మాత్రం డెమో డేటాబేస్‌లో నమోదవుతుంది.',
  },
  hi: {
    title: 'फ़ोन से शिकायत',
    subtitle: 'स्मार्टफ़ोन की ज़रूरत नहीं: मिस्ड कॉल दें या व्हाट्सऐप संदेश भेजें।',
    missedCall: 'मिस्ड कॉल',
    whatsapp: 'व्हाट्सऐप',
    dial: `${DEMO_NUMBER} पर मिस्ड कॉल दें`,
    callingBack: 'जलरक्षक आपको वापस कॉल कर रहा है…',
    answer: 'कॉल उठाएँ',
    greeting: 'जलरक्षक में आपका स्वागत है। पानी नहीं आ रहा हो तो 1 दबाएँ। पानी कम आ रहा हो तो 2 दबाएँ। पानी गंदा हो तो 3 दबाएँ। रिसाव हो तो 4 दबाएँ।',
    confirm: 'आपने {area} में {problem} की शिकायत की है। पुष्टि के लिए 1 दबाएँ। दोबारा चुनने के लिए 2 दबाएँ।',
    done: 'धन्यवाद। आपकी शिकायत संख्या {code} है। हम SMS से जानकारी भेजेंगे।',
    duplicate: 'आप यह समस्या पहले ही {code} के रूप में दर्ज कर चुके हैं। हम इस पर काम कर रहे हैं।',
    failed: 'क्षमा करें, शिकायत दर्ज नहीं हो सकी। कृपया फिर से कोशिश करें।',
    waGreeting: 'नमस्ते! यह जलरक्षक है। आज पानी से जुड़ी क्या समस्या है?',
    waConfirm: 'ठीक है: {area} में {problem}। क्या शिकायत दर्ज करूँ?',
    yes: 'हाँ, दर्ज करें',
    no: 'नहीं, वापस',
    waDone: 'दर्ज हो गई। शिकायत #{code}। जानकारी यहीं मिलेगी।',
    problems: { NO_WATER: 'पानी नहीं आ रहा', LOW_WATER: 'पानी कम आ रहा', DIRTY_WATER: 'गंदा पानी', LEAKAGE: 'रिसाव' },
    again: 'फिर से शुरू करें',
    track: 'शिकायत देखें',
    voice: 'निर्देश सुनाएँ',
    how: 'गाँव में यह कैसे काम करता है',
    howPoints: [
      'मुफ़्त नंबर: एक घंटी के बाद कॉल कट जाती है, कोई खर्च नहीं; सिस्टम वापस कॉल करता है।',
      'तेलुगु, हिंदी या अंग्रेज़ी में निर्देश; बस एक अंक दबाना है।',
      'पंजीकृत मोबाइल नंबर से क्षेत्र पता चल जाता है; कुछ टाइप नहीं करना।',
      'शिकायत उसी ग्राम पंचायत इनबॉक्स में पहुँचती है जहाँ ऐप की शिकायतें आती हैं।',
    ],
    demoNote: 'स्क्रीन पर अनुकरण: कोई असली कॉल या संदेश नहीं भेजा जाता। शिकायत डेमो डेटाबेस में दर्ज होती है।',
  },
};

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const VOICE_LANG = { en: 'en-IN', te: 'te-IN', hi: 'hi-IN' };

/** Shared submit: the same complaint API as the app, with the channel recorded. */
function useSubmit() {
  const { step, report, setReport, reports, addReport, advanceTo } = useDemo();
  return async (category, channel) => {
    const firstOfStory = !report && step < S.REPORTED;
    if (dataSource !== 'api') {
      const code = nextOfflineCode(reports);
      const r = { public_code: code, category, area: CITIZEN_AREA, hasPhoto: false, createdAt: new Date().toISOString(), channel };
      addReport(r);
      if (firstOfStory) setReport(r);
      advanceTo(S.REPORTED);
      return { code };
    }
    const form = new FormData();
    form.append('category', category);
    form.append('service_area_id', CITIZEN_AREA);
    form.append('channel', channel);
    try {
      const saved = await apiFetch('/complaints', { role: 'citizen', method: 'POST', body: form });
      if (firstOfStory) setReport({ public_code: saved.public_code, category: saved.category, area: saved.service_area_id, hasPhoto: false, channel });
      advanceTo(S.REPORTED);
      await reloadData();
      return { code: saved.public_code };
    } catch (err) {
      if (err.status === 409) return { duplicate: err.message.match(/#(\d+)/)?.[1] ?? '' };
      return { error: true };
    }
  };
}

function Phone({ children, label }) {
  return (
    <div className="mx-auto w-[300px] rounded-[2.75rem] border-[10px] border-black bg-black shadow-card" aria-label={label} role="group">
      <div className="relative flex h-[560px] flex-col overflow-hidden rounded-[2rem] bg-white text-ink">
        <div className="mx-auto mt-2 h-5 w-24 rounded-full bg-black" />
        {children}
      </div>
    </div>
  );
}

function MissedCall({ s, area, voice }) {
  const submit = useSubmit();
  const [state, setState] = useState('idle');
  const [choice, setChoice] = useState(null);
  const [result, setResult] = useState(null);

  const prompt = {
    menu: s.greeting,
    confirm: choice && fill(s.confirm, { problem: s.problems[choice], area }),
    done: result?.code && fill(s.done, { code: result.code }),
    duplicate: result?.duplicate != null && fill(s.duplicate, { code: result.duplicate }),
    error: s.failed,
  }[state];

  useEffect(() => {
    if (!voice || !prompt || !window.speechSynthesis) return undefined;
    const u = new SpeechSynthesisUtterance(prompt);
    u.lang = VOICE_LANG[s.lang];
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return () => window.speechSynthesis.cancel();
  }, [prompt, voice, s.lang]);

  useEffect(() => {
    if (state !== 'ringing') return undefined;
    const id = setTimeout(() => setState('incoming'), 1800);
    return () => clearTimeout(id);
  }, [state]);

  const press = async (key) => {
    if (state === 'menu' && key >= 1 && key <= 4) {
      setChoice(OPTIONS[key - 1]);
      setState('confirm');
    } else if (state === 'confirm' && key === 2) {
      setState('menu');
    } else if (state === 'confirm' && key === 1) {
      setState('sending');
      const r = await submit(choice, 'MISSED_CALL');
      setResult(r);
      setState(r.error ? 'error' : r.duplicate != null ? 'duplicate' : 'done');
    }
  };
  const reset = () => {
    setState('idle');
    setChoice(null);
    setResult(null);
  };

  return (
    <Phone label="Simulated feature phone">
      {state === 'idle' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
          <p className="text-sm text-muted">{s.dial}</p>
          <p className="font-display text-4xl tracking-tight">{DEMO_NUMBER}</p>
          <button type="button" onClick={() => setState('ringing')} className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white transition-transform hover:scale-105" aria-label={s.dial}>
            <Icon name="phone" className="h-7 w-7" />
          </button>
        </div>
      )}
      {state === 'ringing' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-display text-3xl">{DEMO_NUMBER}</p>
          <p className="animate-pulse text-sm text-muted">… · · ·</p>
        </div>
      )}
      {state === 'incoming' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-gradient-to-b from-water-100 to-white p-6 text-center">
          <p className="font-display text-3xl">JalRakshak</p>
          <p className="text-sm text-muted">{s.callingBack}</p>
          <button type="button" onClick={() => setState('menu')} className="flex h-16 w-16 animate-bounce items-center justify-center rounded-full bg-emerald-500 text-white" aria-label={s.answer}>
            <Icon name="phone" className="h-7 w-7" />
          </button>
        </div>
      )}
      {['menu', 'confirm', 'sending', 'done', 'duplicate', 'error'].includes(state) && (
        <div className="flex flex-1 flex-col p-4">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            JalRakshak · IVR
          </div>
          <p className="min-h-[8rem] rounded-2xl bg-water-50 p-3 text-sm leading-relaxed" aria-live="polite">
            {state === 'sending' ? '…' : prompt}
          </p>
          {['menu', 'confirm'].includes(state) ? (
            <div className="mt-auto grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map((k) => (
                <button key={k} type="button" onClick={() => press(k)} className="h-12 rounded-2xl bg-black/[0.05] font-display text-2xl transition-colors hover:bg-black/10">
                  {k}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-auto flex flex-col gap-2">
              {result?.code && (
                <Link to={`/citizen/complaints/${result.code}`} className="btn-primary">
                  {s.track}
                </Link>
              )}
              {state !== 'sending' && (
                <button type="button" onClick={reset} className="btn-outline">
                  {s.again}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Phone>
  );
}

function WhatsApp({ s, area }) {
  const submit = useSubmit();
  const [messages, setMessages] = useState([{ from: 'bot', text: s.waGreeting }]);
  const [stage, setStage] = useState('menu');
  const [choice, setChoice] = useState(null);
  const [code, setCode] = useState(null);
  const end = useRef(null);
  // Braces matter: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const say = (from, text) => setMessages((m) => [...m, { from, text }]);
  const pick = (cat) => {
    setChoice(cat);
    say('me', s.problems[cat]);
    say('bot', fill(s.waConfirm, { problem: s.problems[cat], area }));
    setStage('confirm');
  };
  const confirm = async (yes) => {
    say('me', yes ? s.yes : s.no);
    if (!yes) {
      say('bot', s.waGreeting);
      return setStage('menu');
    }
    setStage('sending');
    const r = await submit(choice, 'WHATSAPP');
    if (r.code) {
      setCode(r.code);
      say('bot', fill(s.waDone, { code: r.code }));
    } else say('bot', r.duplicate != null ? fill(s.duplicate, { code: r.duplicate }) : s.failed);
    setStage('done');
  };
  const reset = () => {
    setMessages([{ from: 'bot', text: s.waGreeting }]);
    setStage('menu');
    setChoice(null);
    setCode(null);
  };

  return (
    <Phone label="Simulated WhatsApp chat">
      <div className="flex items-center gap-2 bg-[#075E54] px-4 py-3 text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
          <Icon name="drop" className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-sm font-medium">JalRakshak</span>
          <span className="block text-[11px] text-white/70">Gram Panchayat helpline (demo)</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-[#ECE5DD] p-3" aria-live="polite">
        {messages.map((m, i) => (
          <p key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm ${m.from === 'me' ? 'self-end bg-[#DCF8C6]' : 'self-start bg-white'}`}>
            {m.text}
          </p>
        ))}
        <span ref={end} />
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-black/10 bg-white p-2">
        {stage === 'menu' &&
          OPTIONS.map((c) => (
            <button key={c} type="button" onClick={() => pick(c)} className="rounded-full border border-[#075E54]/30 px-3 py-1.5 text-xs text-[#075E54] hover:bg-[#075E54]/5">
              {s.problems[c]}
            </button>
          ))}
        {stage === 'confirm' && (
          <>
            <button type="button" onClick={() => confirm(true)} className="rounded-full bg-[#075E54] px-3 py-1.5 text-xs text-white">
              {s.yes}
            </button>
            <button type="button" onClick={() => confirm(false)} className="rounded-full border border-black/15 px-3 py-1.5 text-xs">
              {s.no}
            </button>
          </>
        )}
        {stage === 'done' && (
          <>
            {code && (
              <Link to={`/citizen/complaints/${code}`} className="rounded-full bg-[#075E54] px-3 py-1.5 text-xs text-white">
                {s.track}
              </Link>
            )}
            <button type="button" onClick={reset} className="rounded-full border border-black/15 px-3 py-1.5 text-xs">
              {s.again}
            </button>
          </>
        )}
        {stage === 'sending' && <span className="px-2 py-1.5 text-xs text-muted">…</span>}
      </div>
    </Phone>
  );
}

export default function PhoneReport() {
  const { i18n } = useTranslation();
  const lang = SCRIPT[i18n.language] ? i18n.language : 'en';
  const s = { ...SCRIPT[lang], lang };
  const [tab, setTab] = useState('call');
  const [voice, setVoice] = useState(false);
  const area = areas[CITIZEN_AREA]?.name ?? '';

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <div className="grid items-start gap-8 lg:grid-cols-[auto_1fr]">
        <div>
          <div className="mb-4 flex justify-center rounded-full border border-black/10 bg-white/60 p-1 text-sm" role="group" aria-label="Channel">
            {[
              ['call', s.missedCall],
              ['wa', s.whatsapp],
            ].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`flex-1 rounded-full px-4 py-1.5 transition-colors ${tab === id ? 'bg-black text-white' : 'text-muted hover:text-black'}`}>
                {label}
              </button>
            ))}
          </div>
          {/* Keyed by language so a language switch restarts the flow in that language. */}
          {tab === 'call' ? <MissedCall key={lang} s={s} area={area} voice={voice} /> : <WhatsApp key={lang} s={s} area={area} />}
          {tab === 'call' && 'speechSynthesis' in window && (
            <label className="mt-3 flex items-center justify-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} className="accent-black" />
              {s.voice}
            </label>
          )}
        </div>
        <section className="card p-6">
          <h2 className="section-title mb-4">{s.how}</h2>
          <ol className="flex flex-col gap-3">
            {s.howPoints.map((p, i) => (
              <li key={p} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-water-50 font-display text-lg text-water-600">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 rounded-2xl bg-water-50 p-3 text-sm text-muted">{s.demoNote}</p>
        </section>
      </div>
    </div>
  );
}
