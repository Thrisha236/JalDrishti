// Valve shutdown planner on the fictional demo network. Simplified model: closing a valve cuts every
// home fed from the same lane further downstream; closing the tank outlet cuts every lane.
// A real deployment would use a hydraulic model, which also shows pressure drops elsewhere.
import { areas, scheduleFor } from './seed';
import { fieldLayout } from './fieldLayout';

export const TANK_OUTLET = 'OHT-1';

/** Homes cut off when `code` (a valve code or TANK_OUTLET) is closed. */
export function whatIf(code) {
  const { houses, valves } = fieldLayout();
  const valve = valves.find((v) => v.code === code);
  const cut = code === TANK_OUTLET ? houses : valve ? houses.filter((h) => h.pipe === valve.pipe && h.chainage >= valve.chainage) : [];
  const byZone = {};
  cut.forEach((h) => (byZone[h.zone] = (byZone[h.zone] ?? 0) + 1));
  return { valve, cut, cutIds: new Set(cut.map((h) => h.id)), byZone, total: houses.length };
}

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Work is planned in daylight hours.
const DAY_START = toMin('06:00');
const DAY_END = toMin('20:00');

/**
 * Best time today to close the valve for `hours`, avoiding the supply windows of the zones it cuts.
 * Picks the earliest slot that misses no supply window, else the one that misses the fewest.
 */
export function bestWindow(zoneIds, hours) {
  const windows = zoneIds
    .flatMap((z) => (scheduleFor(z)?.windows ?? []).map(([a, b]) => ({ zone: z, from: toMin(a), to: toMin(b), label: `${areas[z]?.name} ${a}–${b}` })))
    .sort((a, b) => a.from - b.from);
  const length = Math.round(hours * 60);
  let best = null;
  for (let start = DAY_START; start + length <= DAY_END; start += 30) {
    const end = start + length;
    const missed = windows.filter((w) => w.from < end && w.to > start);
    if (!best || missed.length < best.missed.length) best = { start, end, missed };
    if (missed.length === 0) break;
  }
  if (!best) return null;
  return { from: toHHMM(best.start), to: toHHMM(best.end), missed: best.missed, windows };
}

/** The advance notice for affected households, in each app language. Telugu and Hindi need native review. */
export function shutdownNotice({ zoneNames, from, to, pipeCode }) {
  const zones = zoneNames.join(', ');
  return {
    en: `JalRakshak: Water supply in ${zones} will be off today from ${from} to ${to} for repair work on pipeline ${pipeCode}. Please store water in advance. — Gram Panchayat`,
    te: `జలరక్షక్: పైప్‌లైన్ ${pipeCode} మరమ్మతు కారణంగా ఈరోజు ${from} నుండి ${to} వరకు ${zones}లో నీటి సరఫరా ఉండదు. దయచేసి ముందుగానే నీరు నిల్వ చేసుకోండి. — గ్రామ పంచాయతీ`,
    hi: `जलरक्षक: पाइपलाइन ${pipeCode} की मरम्मत के कारण आज ${from} से ${to} तक ${zones} में पानी की आपूर्ति बंद रहेगी। कृपया पहले से पानी भरकर रखें। — ग्राम पंचायत`,
  };
}
