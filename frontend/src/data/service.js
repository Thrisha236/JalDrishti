// Water Service Score per home, from JJM's three tests of a working tap connection:
// quantity (at least 55 litres per person per day), regularity (supply on schedule) and quality.
// Per-home values here are simulated from each home's position on its lane (tail-end homes get
// less pressure) and the demo story; a deployment would use tap sensors or sample meters.
import { areaStatus, S } from '../demo/steps';
import { fieldLayout } from './fieldLayout';
import { seed } from './seed';
import { QUALITY, zoneQuality } from './quality';

export const LPCD_TARGET = 55;
export const WEIGHTS = { quantity: 0.4, regularity: 0.35, quality: 0.25 };

export const BAND = {
  good: { label: 'Good (80+)', color: '#10B981' },
  fair: { label: 'Fair (60–79)', color: '#F59E0B' },
  poor: { label: 'Poor (below 60)', color: '#EF4444' },
};
export const bandOf = (score) => (score >= 80 ? 'good' : score >= 60 ? 'fair' : 'poor');

const HEAD_BAR = 1.8;
const TAIL_BAR = 1.22;

// Deterministic per-home variation (pipe joints, house plumbing, storage habits).
function jitter(id, spread) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (((h >>> 0) % 1000) / 1000 - 0.5) * spread;
}

function lineLength(line) {
  let len = 0;
  for (let i = 0; i < line.length - 1; i++) len += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  return len;
}

/** Score every home for the current story step and quality tests. */
export function serviceScores(step, tests) {
  const { houses, valves } = fieldLayout();
  const lengths = Object.fromEntries(seed.assets.filter((a) => a.geometry.line).map((a) => [a.id, lineLength(a.geometry.line)]));
  // During the story's leak on P-21, homes past valve V-04 lose pressure until it is verified fixed.
  const leakFrom = valves.find((v) => v.code === 'V-04');
  const quality = {};

  return houses.map((h) => {
    const along = Math.min(1, h.chainage / (lengths[h.pipe] || 1));
    let pressure = HEAD_BAR - (HEAD_BAR - TAIL_BAR) * along + jitter(h.id, 0.12);
    let regularity = 98 - along * 9 + jitter(`${h.id}r`, 5);
    const leaking = leakFrom && h.pipe === leakFrom.pipe && h.chainage >= leakFrom.chainage && step >= S.WARNING && step < S.VERIFIED && areaStatus(step, h.zone).level !== 'normal';
    if (leaking) {
      pressure *= 0.3;
      regularity -= 45 * along + 10;
    }
    // Flow through a tap grows roughly with the square root of pressure.
    const lpcd = Math.max(8, Math.round(72 * Math.sqrt(Math.max(pressure, 0.05) / 1.5) + jitter(`${h.id}q`, 8)));
    quality[h.zone] ??= zoneQuality(h.zone, tests);
    const q = quality[h.zone];

    const parts = {
      quantity: Math.min(100, Math.round((lpcd / LPCD_TARGET) * 100)),
      regularity: Math.max(0, Math.min(100, Math.round(regularity))),
      quality: QUALITY[q].score,
    };
    const score = Math.round(parts.quantity * WEIGHTS.quantity + parts.regularity * WEIGHTS.regularity + parts.quality * WEIGHTS.quality);
    return { house: h, lpcd, pressure: Math.round(pressure * 100) / 100, quality: q, parts, score, band: bandOf(score), along, leaking };
  });
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Gini coefficient of supply (0 = everyone gets the same, 1 = one home gets everything). */
function gini(values) {
  const xs = [...values].sort((a, b) => a - b);
  const n = xs.length;
  if (!n) return 0;
  const sum = xs.reduce((a, b) => a + b, 0);
  const weighted = xs.reduce((acc, x, i) => acc + (i + 1) * x, 0);
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

/** Village and zone summaries, including how much worse tail-end homes are served than head-end homes. */
export function serviceSummary(scores) {
  const zones = seed.service_areas.filter((z) => scores.some((s) => s.house.zone === z.id));
  const zoneRows = zones.map((z) => {
    const mine = scores.filter((s) => s.house.zone === z.id);
    // Head and tail: the first and last quarter of the zone's homes along their lane.
    const byPosition = [...mine].sort((a, b) => a.along - b.along);
    const quarter = Math.max(1, Math.floor(byPosition.length / 4));
    const head = byPosition.slice(0, quarter);
    const tail = byPosition.slice(-quarter);
    return {
      zone: z,
      homes: mine.length,
      score: Math.round(mean(mine.map((s) => s.score))),
      lpcd: Math.round(mean(mine.map((s) => s.lpcd))),
      meeting: mine.filter((s) => s.lpcd >= LPCD_TARGET).length,
      quality: mine[0]?.quality ?? 'untested',
      tailGap: head.length && tail.length ? Math.round(mean(head.map((s) => s.score)) - mean(tail.map((s) => s.score))) : null,
    };
  });
  return {
    score: Math.round(mean(scores.map((s) => s.score))),
    meeting: scores.filter((s) => s.lpcd >= LPCD_TARGET).length,
    homes: scores.length,
    equity: Math.round((1 - gini(scores.map((s) => s.lpcd))) * 100),
    bands: Object.fromEntries(Object.keys(BAND).map((b) => [b, scores.filter((s) => s.band === b).length])),
    zones: zoneRows,
    worst: [...scores].sort((a, b) => a.score - b.score).slice(0, 5),
  };
}
