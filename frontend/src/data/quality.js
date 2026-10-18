// Water-quality tests with field test kits (FTK), done by trained local women testers (JJM trains
// five per village). With the backend running, tests are read from and saved to the server, which also
// judges them (verdicts, alerts and boil-water advisories come from there). Without it, the demo records
// in the seed are judged here and tests logged in the app last only for this browser session.
import { useEffect, useSyncExternalStore } from 'react';
import { apiFetch, currentRole } from './api';
import { fieldLayout } from './fieldLayout';
import { assets, dataSource, seed } from './seed';

/** Limits from IS 10500:2012 (acceptable / permissible where relaxed). */
export const PARAMS = [
  { id: 'bacteria', label: 'Bacteria (H₂S vial)', unit: '', kind: 'presence' },
  { id: 'chlorine', label: 'Residual chlorine', unit: 'mg/L', min: 0.2, note: 'at least 0.2 at the tap' },
  { id: 'ph', label: 'pH', unit: '', range: [6.5, 8.5] },
  { id: 'turbidity', label: 'Turbidity', unit: 'NTU', acceptable: 1, permissible: 5 },
  { id: 'tds', label: 'Total dissolved solids', unit: 'mg/L', acceptable: 500, permissible: 2000 },
  { id: 'fluoride', label: 'Fluoride', unit: 'mg/L', acceptable: 1.0, permissible: 1.5 },
  { id: 'nitrate', label: 'Nitrate', unit: 'mg/L', acceptable: 45, permissible: 45 },
  { id: 'iron', label: 'Iron', unit: 'mg/L', acceptable: 0.3, permissible: 0.3 },
];

/** A field-kit result is a screening, so the words say "passed" and "failed", never "safe to drink". */
export const QUALITY = {
  safe: { label: 'Passed', color: '#10B981', score: 100 },
  watch: { label: 'Watch', color: '#F59E0B', score: 60 },
  unsafe: { label: 'Failed', color: '#EF4444', score: 0 },
  untested: { label: 'Not tested', color: '#94A3B8', score: 100 },
};

export const QUALITY_DISCLAIMER = 'A field test kit is a screening tool, not a laboratory certificate. If water looks, smells or tastes wrong, do not drink it untreated.';

const RANK = { safe: 0, untested: 0, watch: 1, unsafe: 2 };
const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

/** Verdict for one parameter value: 'safe' | 'watch' | 'unsafe' (null when not measured). */
export function judge(paramId, value, { raw = false } = {}) {
  if (value === '' || value == null) return null;
  const p = PARAMS.find((x) => x.id === paramId);
  if (p.kind === 'presence') return value === 'present' ? 'unsafe' : 'safe';
  const v = Number(value);
  // Raw source water is not chlorinated yet, so chlorine is judged only at the tank and taps.
  if (p.min != null) return raw ? 'safe' : v >= p.min ? 'safe' : v > 0 ? 'watch' : 'unsafe';
  if (p.range) return v >= p.range[0] && v <= p.range[1] ? 'safe' : 'watch';
  if (v <= p.acceptable) return 'safe';
  return v <= p.permissible ? 'watch' : 'unsafe';
}

/** Overall verdict and the parameters that caused it. A server verdict, when the test has one, wins. */
export function verdict(test) {
  if (test.verdict) {
    return { status: test.verdict, issues: (test.issues ?? []).map((i) => ({ param: PARAMS.find((p) => p.id === i.param) ?? { id: i.param, label: i.label, unit: i.unit }, value: i.value, level: i.level })) };
  }
  const raw = test.point.type === 'source';
  let status = 'safe';
  const issues = [];
  PARAMS.forEach((p) => {
    const v = judge(p.id, test.values[p.id], { raw });
    if (v && v !== 'safe') issues.push({ param: p, value: test.values[p.id], level: v });
    if (v) status = worse(status, v);
  });
  return { status, issues };
}

/** Where tests are taken (from the seed): the source, the tank, and the tail tap of each lane plus a few homes. */
export function testPoints() {
  const { sensors } = fieldLayout();
  const byCode = Object.fromEntries(sensors.map((s) => [s.code, s]));
  return (seed.water_quality?.points ?? [])
    .map((p) => {
      if (p.type === 'tap') {
        const s = byCode[p.sensor_code];
        return s && { id: p.id, label: p.label, type: 'tap', zone: p.service_area_id, zoneName: s.zoneName, at: s.at };
      }
      const a = assets[p.asset_id];
      return a && { id: p.id, label: p.label, type: p.type, zone: null, at: a.geometry.point };
    })
    .filter(Boolean);
}

// A tiny store so every screen sees the same tests.
let tests = null;
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

function fromSeed() {
  const points = Object.fromEntries(testPoints().map((p) => [p.id, p]));
  return (seed.water_quality?.tests ?? []).map((t) => ({ id: t.id, demo: t.is_mock, point: points[t.point_id], date: t.date, tester: t.tester, values: t.values })).filter((t) => t.point);
}

function ensure() {
  if (!tests) tests = fromSeed();
  return tests;
}

const isOfficial = () => dataSource === 'api' && ['gp', 'officer'].includes(currentRole());

/** Reload from the server (officials only). Quietly keeps the current list if the server cannot be reached. */
export async function refreshTests() {
  if (!isOfficial()) return;
  try {
    const body = await apiFetch('/water-quality?limit=300', { role: currentRole() });
    const points = Object.fromEntries(testPoints().map((p) => [p.id, p]));
    tests = body.tests.map((t) => ({ id: t.id, demo: t.is_mock, point: points[t.point_id], date: t.date, tester: t.tester, values: t.values, verdict: t.verdict, issues: t.issues })).filter((t) => t.point);
    notify();
  } catch {
    /* keep what we have */
  }
}

/** Log a test. Saved on the server when it is running (it then judges it and may raise an alert); otherwise kept in this browser session. */
export async function addTest({ pointId, date, tester, values }) {
  if (isOfficial() && currentRole() === 'gp') {
    await apiFetch('/water-quality/tests', { role: 'gp', method: 'POST', json: true, body: JSON.stringify({ point_id: pointId, date, tester, values }) });
    await refreshTests();
    return;
  }
  const point = testPoints().find((p) => p.id === pointId);
  tests = [{ id: `qt-${Date.now()}`, demo: false, point, date, tester, values }, ...ensure()];
  notify();
}

let watchers = 0;
let timer = null;

/** React hook: all tests, re-rendering when one is logged. With the backend it also refreshes every 15 seconds. */
export function useQualityTests() {
  useEffect(() => {
    if (!isOfficial()) return undefined;
    watchers += 1;
    if (watchers === 1) {
      refreshTests();
      timer = setInterval(refreshTests, 15000);
    }
    return () => {
      watchers -= 1;
      if (watchers === 0) clearInterval(timer);
    };
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    ensure,
  );
}

export function getTests() {
  return ensure();
}

/** Latest test per point. */
export function latestByPoint(all = ensure()) {
  const latest = {};
  [...all].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => (latest[t.point.id] = t));
  return latest;
}

/** Water quality at the taps of a zone: worst of its latest tap tests and the tank (treated water). */
export function zoneQuality(zoneId, all = ensure()) {
  const latest = Object.values(latestByPoint(all));
  const relevant = latest.filter((t) => t.point.type === 'tank' || t.point.zone === zoneId);
  if (!relevant.some((t) => t.point.zone === zoneId)) return 'untested';
  return relevant.reduce((acc, t) => worse(acc, verdict(t).status), 'safe');
}
