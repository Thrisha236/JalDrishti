// Water-quality tests with field test kits (FTK), done by trained local women testers (JJM trains
// five per village). Demo records are fictional; tests logged in the app live in this browser
// session only until a backend endpoint exists.
import { useSyncExternalStore } from 'react';
import { fieldLayout } from './fieldLayout';

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

export const QUALITY = {
  safe: { label: 'Safe', color: '#10B981', score: 100 },
  watch: { label: 'Watch', color: '#F59E0B', score: 60 },
  unsafe: { label: 'Unsafe', color: '#EF4444', score: 0 },
  untested: { label: 'Not tested', color: '#94A3B8', score: 100 },
};

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

/** Overall verdict and the parameters that caused it. */
export function verdict(test) {
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

/** Where tests are taken: the source, the tank, and the tail tap of each lane plus a few homes. */
export function testPoints() {
  const { sensors, tank } = fieldLayout();
  const byCode = Object.fromEntries(sensors.map((s) => [s.code, s]));
  const points = [
    { id: 'tp-bw1', label: 'Borewell BW-1 (raw)', type: 'source', zone: null, at: [380, 420] },
    { id: 'tp-oht1', label: 'Overhead tank OHT-1', type: 'tank', zone: null, at: tank ?? [500, 500] },
  ];
  ['N-T1', 'C-T1', 'S-T1', 'N-H3', 'C-H2', 'S-H2'].forEach((code) => {
    const s = byCode[code];
    if (s) points.push({ id: `tp-${code}`, label: `${s.kind === 'tail' ? 'Tail tap' : 'Home tap'} ${code}`, type: 'tap', zone: s.zone, zoneName: s.zoneName, at: s.at });
  });
  return points;
}

const DEMO_TESTS = [
  { point: 'tp-bw1', date: '2026-10-10', tester: 'FTK tester 1', values: { bacteria: 'absent', ph: 7.6, tds: 640, fluoride: 1.2, nitrate: 18, iron: 0.2 } },
  { point: 'tp-oht1', date: '2026-10-10', tester: 'FTK tester 1', values: { bacteria: 'absent', chlorine: 0.6, ph: 7.4, turbidity: 0.4 } },
  { point: 'tp-N-T1', date: '2026-10-12', tester: 'FTK tester 2', values: { bacteria: 'absent', chlorine: 0.3, turbidity: 0.8 } },
  { point: 'tp-N-H3', date: '2026-10-12', tester: 'FTK tester 2', values: { bacteria: 'absent', chlorine: 0.4 } },
  { point: 'tp-C-T1', date: '2026-10-13', tester: 'FTK tester 3', values: { bacteria: 'absent', chlorine: 0.25, turbidity: 0.6 } },
  { point: 'tp-C-H2', date: '2026-10-13', tester: 'FTK tester 3', values: { bacteria: 'absent', chlorine: 0.45 } },
  { point: 'tp-S-T1', date: '2026-10-14', tester: 'FTK tester 4', values: { bacteria: 'present', chlorine: 0, turbidity: 4 } },
  { point: 'tp-S-H2', date: '2026-10-14', tester: 'FTK tester 4', values: { bacteria: 'absent', chlorine: 0.05 } },
];

// A tiny store so every screen sees tests logged during the session.
let tests = null;
const listeners = new Set();

function ensure() {
  if (!tests) {
    const points = Object.fromEntries(testPoints().map((p) => [p.id, p]));
    tests = DEMO_TESTS.map((t, i) => ({ id: `qt-${i + 1}`, demo: true, ...t, point: points[t.point] })).filter((t) => t.point);
  }
  return tests;
}

export function getTests() {
  return ensure();
}

export function addTest({ pointId, date, tester, values }) {
  const point = testPoints().find((p) => p.id === pointId);
  tests = [{ id: `qt-${Date.now()}`, demo: false, point, date, tester, values }, ...ensure()];
  listeners.forEach((l) => l());
}

/** React hook: all tests, newest first, re-rendering when one is logged. */
export function useQualityTests() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    ensure,
  );
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
