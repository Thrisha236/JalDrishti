// Water quality: field test kit (FTK) results from trained village women, judged against IS 10500.
// Supply can be restored and still fail a screening, so this sits beside the supply view, not inside it.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { areasFor, dataSource, fmtDate, HOME_VILLAGE } from '../../data/seed';
import { addTest, judge, latestByPoint, PARAMS, QUALITY, QUALITY_DISCLAIMER, testPoints, useQualityTests, verdict, zoneQuality } from '../../data/quality';
import { Card, PageHeader, SimBadge } from '../../components/ui';
import { Dot } from '../../components/layers/shared';

const TESTERS = ['FTK tester 1', 'FTK tester 2', 'FTK tester 3', 'FTK tester 4', 'FTK tester 5'];
const today = () => new Date().toISOString().slice(0, 10);

// What to do when a zone's water is not safe. Shown to the GP; the villager message is in the app's languages.
const ACTIONS = {
  unsafe: ['Tell households to boil drinking water (advisory below)', 'Flush the lane and boost chlorination at the tank', 'Look for a leak or broken joint letting dirty water in', 'Re-test within 48 hours'],
  watch: ['Re-test within a week', 'Check the chlorine dose at the tank if residual chlorine is low', 'For fluoride above 1.0 mg/L, plan blending or treatment at the source'],
};

const ADVISORY = {
  en: (zone) => `JalRakshak: Water in ${zone} failed today's quality test. Please boil drinking water until a new test passes. — Gram Panchayat`,
  te: (zone) => `జలరక్షక్: ఈరోజు నాణ్యత పరీక్షలో ${zone} నీరు విఫలమైంది. మళ్లీ సురక్షితమని నిర్ధారించే వరకు త్రాగునీటిని మరిగించండి. — గ్రామ పంచాయతీ`,
  hi: (zone) => `जलरक्षक: आज की जाँच में ${zone} का पानी ठीक नहीं पाया गया। सुरक्षित घोषित होने तक पीने का पानी उबालकर पिएँ। — ग्राम पंचायत`,
};

function Verdict({ status }) {
  const q = QUALITY[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Dot color={q.color} />
      {q.label}
    </span>
  );
}

function LogTest() {
  const points = testPoints();
  const [pointId, setPointId] = useState(points[2]?.id ?? points[0].id);
  const [date, setDate] = useState(today());
  const [tester, setTester] = useState(TESTERS[0]);
  const [values, setValues] = useState({ bacteria: 'absent' });
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const point = points.find((p) => p.id === pointId);
  const preview = verdict({ point, values });

  const set = (id, v) => setValues((x) => ({ ...x, [id]: v }));
  const save = async (e) => {
    e.preventDefault();
    const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v != null));
    setBusy(true);
    setError(null);
    try {
      await addTest({ pointId, date, tester, values: clean });
      setSaved(`${point.label}: ${QUALITY[preview.status].label}`);
      setValues({ bacteria: 'absent' });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <Card title="Log a field test" accent="verify">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="text-muted">Where</span>
            <select value={pointId} onChange={(e) => setPointId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-black/15 bg-white/80 px-3">
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.zoneName ? ` · ${p.zoneName}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted">Date</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-black/15 bg-white/80 px-3" />
          </label>
          <label className="text-sm">
            <span className="text-muted">Tested by</span>
            <select value={tester} onChange={(e) => setTester(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-black/15 bg-white/80 px-3">
              {TESTERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PARAMS.map((p) => {
            const level = judge(p.id, values[p.id], { raw: point.type === 'source' });
            return (
              <label key={p.id} className="text-sm">
                <span className="flex items-center justify-between gap-2 text-muted">
                  {p.label}
                  {level && <Dot color={QUALITY[level].color} />}
                </span>
                {p.kind === 'presence' ? (
                  <select value={values[p.id] ?? ''} onChange={(e) => set(p.id, e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-black/15 bg-white/80 px-3">
                    <option value="absent">Absent (clear)</option>
                    <option value="present">Present (turned black)</option>
                  </select>
                ) : (
                  <input
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    placeholder={p.unit || 'value'}
                    value={values[p.id] ?? ''}
                    onChange={(e) => set(p.id, e.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-black/15 bg-white/80 px-3"
                  />
                )}
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            Result: <Verdict status={preview.status} />
            {preview.issues.length > 0 && <span className="text-muted"> · {preview.issues.map((i) => i.param.label).join(', ')}</span>}
          </p>
          <button type="submit" disabled={busy} className="btn-primary">
            Save test
          </button>
        </div>
        {saved && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Saved: {saved}. {dataSource === 'api' ? 'It is judged by the server: a failed tap test raises an alert, sends a boil-water advisory to villagers of that zone, and goes to WQMIS (mock).' : 'It is kept in this browser session only.'}</p>}
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
        <p className="text-xs text-muted">Leave a field empty if it was not measured. {QUALITY_DISCLAIMER}</p>
      </form>
    </Card>
  );
}

export default function Quality() {
  const tests = useQualityTests();
  const zones = areasFor(HOME_VILLAGE);
  const latest = latestByPoint(tests);
  const [lang, setLang] = useState('en');
  const zoneRows = useMemo(
    () =>
      zones.map((z) => {
        const status = zoneQuality(z.id, tests);
        const zoneTests = Object.values(latest).filter((t) => t.point.zone === z.id);
        return { zone: z, status, last: zoneTests.map((t) => t.date).sort().at(-1), issues: zoneTests.flatMap((t) => verdict(t).issues.map((i) => ({ ...i, point: t.point }))) };
      }),
    [zones, tests, latest],
  );
  const unsafe = zoneRows.filter((r) => r.status === 'unsafe');
  const sorted = [...tests].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <PageHeader title="Water Quality — field tests" subtitle="Screening tests by trained women of the village with field test kits, judged against IS 10500. Water can flow and still fail a screening, so quality is checked beside supply.">
        <SimBadge>Demo records</SimBadge>
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {zoneRows.map((r) => (
          <div key={r.zone.id} className="card relative overflow-hidden p-5">
            <span className="absolute inset-x-6 top-0 h-[3px] rounded-b-full" style={{ background: QUALITY[r.status].color }} />
            <p className="text-sm text-muted">{r.zone.name}</p>
            <p className="mt-1 font-display text-4xl leading-none tracking-tight">{QUALITY[r.status].label}</p>
            <p className="mt-2 text-xs text-muted">{r.last ? `Last tested ${fmtDate(r.last)}` : 'No tap test yet'}</p>
            {r.issues.length > 0 && <p className="mt-1 text-xs">{r.issues.map((i) => `${i.param.label} at ${i.point.label}`).join(' · ')}</p>}
          </div>
        ))}
      </div>

      {unsafe.length > 0 && (
        <section className="mb-5 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
          <h2 className="section-title text-rose-900">Failed field test in {unsafe.map((r) => r.zone.name).join(', ')}</h2>
          <ul className="mt-2 list-inside list-disc text-sm">
            {ACTIONS.unsafe.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <div className="mt-4 rounded-2xl bg-white/70 p-3 text-sm text-ink">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-medium">Advisory to households</p>
              <div className="flex gap-1">
                {[
                  ['en', 'English'],
                  ['te', 'తెలుగు'],
                  ['hi', 'हिंदी'],
                ].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={lang === id} onClick={() => setLang(id)} className={`rounded-full px-2.5 py-0.5 text-xs ${lang === id ? 'bg-black text-white' : 'text-muted hover:text-black'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p>{ADVISORY[lang](unsafe.map((r) => r.zone.name).join(', '))}</p>
            <p className="mt-1 text-xs text-muted">Villagers in that zone also see a boil-water notice on their home screen. SMS and voice are not connected in the prototype.</p>
          </div>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <LogTest />
        </div>
        <Card title="Recent tests" accent="record" className="xl:col-span-2" action={<Link to="/gp/map?layer=quality" className="text-sm font-semibold text-brand-600">On map</Link>}>
          <ul className="flex flex-col divide-y divide-black/[0.06]">
            {sorted.map((t) => {
              const v = verdict(t);
              return (
                <li key={t.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.point.label}</span>
                    <Verdict status={v.status} />
                  </div>
                  <p className="text-xs text-muted">
                    {fmtDate(t.date)} · {t.tester}
                    {t.demo ? ' · demo record' : ' · logged now'}
                  </p>
                  {v.issues.length > 0 && (
                    <p className="mt-1 text-xs">
                      {v.issues.map((i) => `${i.param.label} ${i.value === 'present' ? 'present' : `${i.value}${i.param.unit ? ` ${i.param.unit}` : ''}`}`).join(' · ')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <p className="mt-5 text-xs text-muted">
        Watch: {ACTIONS.watch.join('; ')}.
      </p>
    </div>
  );
}
