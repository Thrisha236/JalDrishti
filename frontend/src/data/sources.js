// Source outlook: how long the borewell can keep supplying before the water table falls too close to
// the pump, with what-if levers (use less, recharge, monsoon timing). A simple water-balance trend
// projection on fictional records; not a hydrogeological model. Real inputs would be a borewell level
// logger, rainfall from IMD, and the State Ground Water Department's observation wells.
import { areasFor, HOME_VILLAGE } from './seed';

export const PERSONS_PER_HOUSEHOLD = 4.5; // assumption, shown on screen
export const LPCD = 55;
export const BOREWELL = { code: 'BW-1', pumpIntakeM: 42, safetyMarginM: 4 };
export const TANK = { code: 'OHT-1', capacityKL: 50, fullHeightM: 5 };
export const TODAY = '2026-10-18';

const DAY = 86400000;
const addDays = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / DAY);

/** Daily village demand in kilolitres, from the zone register's household counts. */
export function demandKL() {
  const homes = areasFor(HOME_VILLAGE).reduce((n, z) => n + (z.household_count ?? 0), 0);
  return { homes, kl: Math.round((homes * PERSONS_PER_HOUSEHOLD * LPCD) / 100) / 10 };
}

/**
 * Weekly depth to water in BW-1 over the last 26 weeks (metres below ground; bigger = deeper).
 * Fictional but shaped like a hard-rock Telangana aquifer: falling through summer, recovering in the
 * monsoon, and starting to fall again after it.
 */
export function borewellHistory() {
  const out = [];
  for (let w = 25; w >= 0; w--) {
    const date = addDays(TODAY, -7 * w);
    const t = 25 - w; // week index from the start
    let depth;
    if (t <= 7) depth = 31 + t * 0.75; // late summer decline (Apr–early Jun)
    else if (t <= 21) depth = 36.2 - (t - 7) * 1.66; // monsoon recovery (mid-Jun to Sep)
    else depth = 13.0 + (t - 21) * 0.3; // post-monsoon decline starts (Oct)
    depth += Math.sin(t * 2.1) * 0.25;
    out.push({ date, depth: Math.round(depth * 10) / 10 });
  }
  return out;
}

// Daily fall in water level: natural recession plus pumping, faster in the hot months.
const NATURAL_M_PER_DAY = 0.025;
const PUMPING_M_PER_DAY = 0.075;
const RECHARGE_M_PER_DAY = 0.02; // a desilted village tank keeps feeding the aquifer
const HOT_MONTHS = [3, 4, 5]; // March–May
const HOT_FACTOR = 1.45;

/**
 * Project the borewell day by day until the safe limit or the monsoon.
 * useCut: fraction of pumping saved (0–0.3); recharge: tank desilted; monsoon: onset date.
 */
export function projectBorewell({ useCut = 0, recharge = false, monsoon = '2027-06-10' } = {}) {
  const history = borewellHistory();
  const start = history.at(-1).depth;
  const limit = BOREWELL.pumpIntakeM - BOREWELL.safetyMarginM;
  const path = [{ date: TODAY, depth: start }];
  let depth = start;
  let date = TODAY;
  let hitLimit = null;
  while (date < monsoon) {
    date = addDays(date, 1);
    const month = Number(date.slice(5, 7));
    let fall = NATURAL_M_PER_DAY + PUMPING_M_PER_DAY * (1 - useCut) - (recharge ? RECHARGE_M_PER_DAY : 0);
    if (HOT_MONTHS.includes(month)) fall *= HOT_FACTOR;
    depth += Math.max(0, fall);
    if (daysBetween(TODAY, date) % 7 === 0) path.push({ date, depth: Math.round(depth * 10) / 10 });
    if (depth >= limit) {
      hitLimit = date;
      path.push({ date, depth: Math.round(depth * 10) / 10 });
      break;
    }
  }
  const lastsToMonsoon = !hitLimit;
  const until = hitLimit ?? monsoon;
  return {
    current: start,
    limit,
    path,
    hitLimit,
    lastsToMonsoon,
    daysLeft: daysBetween(TODAY, until),
    shortfallDays: lastsToMonsoon ? 0 : daysBetween(hitLimit, monsoon),
    monsoon,
  };
}

/** Storage in the overhead tank from its level sensor (metres), and how long it would last on its own. */
export function tankBuffer(levelM) {
  if (levelM == null) return null;
  const kl = Math.round(((Math.min(levelM, TANK.fullHeightM) / TANK.fullHeightM) * TANK.capacityKL) * 10) / 10;
  const hours = Math.round((kl / demandKL().kl) * 24 * 10) / 10;
  return { kl, hours, pct: Math.round((kl / TANK.capacityKL) * 100) };
}

/** What the GP should do, from the projection. */
export function sourceActions(p) {
  const actions = [];
  if (!p.lastsToMonsoon) {
    actions.push(`Arrange tanker supply from ${p.hitLimit} for about ${p.shortfallDays} days, or find a standby source`);
    actions.push('Start staggered supply (alternate zones) from February to slow the decline');
  }
  actions.push('Fix leaks first: every litre lost in the pipes is pumped from the same borewell');
  actions.push('Desilt the village tank before the monsoon so it recharges the borewell');
  actions.push('Record the borewell level weekly (a logger or a dip meter) to keep this forecast honest');
  return actions;
}
