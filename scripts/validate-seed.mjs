// Validates seed/ramapuram.json: references, labelling, story consistency and risk arithmetic.
// Usage: node scripts/validate-seed.mjs [path-to-seed.json]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = process.argv[2] ?? join(root, 'seed', 'ramapuram.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));

const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };

// ---------- helpers ----------
const byId = (list, key = 'id') => new Map(list.map((x) => [x[key], x]));
const villages = byId(seed.villages);
const areas = byId(seed.service_areas);
const schemes = byId(seed.schemes);
const assets = byId(seed.assets);
const users = byId(seed.users);
const nodes = byId(seed.sensor_nodes);
const sensors = byId(seed.sensors);

function fullYearsBetween(fromIso, toIso) {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  const beforeAnniversary =
    b.getUTCMonth() < a.getUTCMonth() ||
    (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return years;
}

function monthsBetween(fromIso, toIso) {
  return (new Date(toIso) - new Date(fromIso)) / (1000 * 60 * 60 * 24 * 30.4375);
}

// ---------- 1. unique ids ----------
for (const [name, list, key] of [
  ['villages', seed.villages, 'id'], ['service_areas', seed.service_areas, 'id'],
  ['schemes', seed.schemes, 'id'], ['assets', seed.assets, 'id'], ['users', seed.users, 'id'],
  ['sensor_nodes', seed.sensor_nodes, 'id'], ['sensors', seed.sensors, 'id'],
  ['inspections', seed.inspections, 'id'], ['repairs', seed.repairs, 'id'],
  ['complaints', seed.story.complaints, 'public_code'], ['alerts', seed.story.alerts, 'id'],
]) {
  const seen = new Set();
  for (const item of list) {
    check(!seen.has(item[key]), `${name}: duplicate ${key} "${item[key]}"`);
    seen.add(item[key]);
  }
}

// ---------- 2. references ----------
for (const a of seed.service_areas) check(villages.has(a.village_id), `service_area ${a.id}: unknown village ${a.village_id}`);
for (const s of seed.schemes) {
  check(villages.has(s.village_id), `scheme ${s.id}: unknown village ${s.village_id}`);
  for (const sa of s.service_area_ids) check(areas.has(sa), `scheme ${s.id}: unknown service area ${sa}`);
}
for (const a of seed.assets) {
  check(schemes.has(a.scheme_id), `asset ${a.id}: unknown scheme ${a.scheme_id}`);
  check(areas.has(a.service_area_id), `asset ${a.id}: unknown service area ${a.service_area_id}`);
}
for (const p of seed.pipeline_profiles) check(assets.get(p.asset_id)?.type === 'pipeline', `pipeline_profile: ${p.asset_id} is not a pipeline asset`);
for (const list of [seed.inspections, seed.repairs]) for (const r of list) check(assets.has(r.asset_id), `${r.id}: unknown asset ${r.asset_id}`);
for (const n of seed.sensor_nodes) check(assets.has(n.asset_id), `${n.id}: unknown asset ${n.asset_id}`);
for (const s of seed.sensors) check(nodes.has(s.node_id), `${s.id}: unknown node ${s.node_id}`);
for (const s of seed.supply_schedules) check(areas.has(s.service_area_id), `schedule: unknown service area ${s.service_area_id}`);
for (const u of seed.users) {
  if (u.village_id) check(villages.has(u.village_id), `${u.id}: unknown village ${u.village_id}`);
  if (u.service_area_id) check(areas.has(u.service_area_id), `${u.id}: unknown service area ${u.service_area_id}`);
}

const story = seed.story;
for (const al of story.alerts) {
  check(assets.has(al.asset_id), `${al.id}: unknown asset`);
  if (al.sensor_id) check(sensors.has(al.sensor_id), `${al.id}: unknown sensor`);
}
for (const c of story.complaints) {
  check(users.get(c.citizen_id)?.role === 'citizen', `complaint ${c.public_code}: citizen_id is not a citizen`);
  check(areas.has(c.service_area_id), `complaint ${c.public_code}: unknown service area`);
  check(c.location?.precision === 'approx_1km', `complaint ${c.public_code}: location must be coarse (approx_1km)`);
}
const mediaIds = new Set(story.complaints.flatMap((c) => c.media.map((m) => m.id)));
for (const ia of story.image_analysis) {
  check(mediaIds.has(ia.media_id), `image_analysis: unknown media ${ia.media_id}`);
  check(ia.is_simulated === true && /simulat/i.test(ia.disclaimer), `image_analysis ${ia.media_id}: must be labelled simulated`);
}

// ---------- 3. labelling: everything is mock or simulated ----------
check(seed.meta.is_mock === true, 'meta.is_mock must be true');
for (const [name, list] of [['villages', seed.villages], ['service_areas', seed.service_areas], ['schemes', seed.schemes], ['assets', seed.assets], ['users', seed.users]]) {
  for (const x of list) check(x.is_mock === true, `${name} ${x.id}: missing is_mock: true`);
}
for (const x of [...seed.sensor_nodes, ...seed.sensors]) check(x.is_simulated === true, `${x.id}: missing is_simulated: true`);
for (const x of [story, ...story.alerts, ...story.complaints, story.incident, story.task, story.verification]) {
  check(x.is_simulated === true, `story item ${x.id ?? x.public_code ?? x.code ?? '(story)'}: missing is_simulated: true`);
}
for (const v of seed.villages) check(/DEMO/.test(v.lgd_code), `${v.id}: LGD code must be a DEMO id`);
for (const a of seed.service_areas) check(a.sujal_gaon_id === null || /DEMO/.test(a.sujal_gaon_id), `${a.id}: Sujal Gaon ID must be a DEMO id or null`);
for (const s of seed.schemes) check(/DEMO/.test(s.sujalam_bharat_id), `${s.id}: Sujalam Bharat ID must be a DEMO id`);

// No real-looking phone numbers anywhere in the seed (10-digit mobiles, 1800 toll-free numbers).
const raw = readFileSync(seedPath, 'utf8');
const phoneLike = raw.match(/(?<![\d.])(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)|\b1800[\s-]?\d{3}[\s-]?\d{4}\b/g);
check(!phoneLike, `phone-number-like strings found: ${phoneLike?.join(', ')}`);

// ---------- 4. risk scoring ----------
const cfg = seed.risk_config.factors;
const asOf = seed.meta.as_of;
const PLASTICS = new Set(['pvc', 'hdpe']);

function pointsFromBands(value, bands, minKey, maxKey) {
  const last = bands[bands.length - 1];
  for (const b of bands) {
    const isLast = b === last;
    if (value >= b[minKey] && (value < b[maxKey] || (isLast && value <= b[maxKey]))) return b.points;
  }
  return 0;
}

export function scorePipeline(assetId) {
  const profile = seed.pipeline_profiles.find((p) => p.asset_id === assetId);
  const factors = {};
  const missing = [];

  // Age
  const age = fullYearsBetween(profile.install_date, asOf);
  const ageCfg = cfg.age;
  let agePts = Math.min(1, Math.max(0, (age - ageCfg.start_years) / (ageCfg.full_years - ageCfg.start_years))) * ageCfg.max;
  if (profile.install_date_source === 'estimate') agePts *= ageCfg.estimate_multiplier;
  factors.age = Math.round(agePts);

  // Prior failures within the window
  const windowMonths = cfg.prior_failures.window_months;
  const count = seed.repairs.filter((r) => r.asset_id === assetId && monthsBetween(r.date, asOf) <= windowMonths && monthsBetween(r.date, asOf) >= 0).length;
  factors.prior_failures = cfg.prior_failures.points_by_count[count >= 4 ? '4+' : String(count)];

  // Corrosion observation
  if (PLASTICS.has(profile.material)) {
    factors.corrosion_observation = 0;
  } else {
    const latest = seed.inspections.filter((i) => i.asset_id === assetId && i.corrosion_grade != null).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) {
      factors.corrosion_observation = 0;
      missing.push('corrosion inspection');
    } else {
      let pts = pointsFromBands(latest.corrosion_grade, cfg.corrosion_observation.bands, 'min', 'max');
      if (monthsBetween(latest.date, asOf) > cfg.corrosion_observation.stale_after_months) pts *= cfg.corrosion_observation.stale_multiplier;
      factors.corrosion_observation = Math.round(pts);
    }
  }

  // Pressure-per-flow trend
  if (profile.pressure_per_flow_drop_pct == null) {
    factors.pressure_per_flow_trend = 0;
    missing.push('pressure/flow sensor');
  } else {
    factors.pressure_per_flow_trend = pointsFromBands(profile.pressure_per_flow_drop_pct, cfg.pressure_per_flow_trend.bands, 'min_drop_pct', 'max_drop_pct');
  }

  // Material
  factors.material_susceptibility = cfg.material_susceptibility.points_by_material[profile.material] ?? cfg.material_susceptibility.points_by_material.unknown;

  const score = Object.values(factors).reduce((a, b) => a + b, 0);
  const band = seed.risk_config.bands.find((b) => score >= b.min && score <= b.max).band;
  return { score, band, factors, missing };
}

for (const p of seed.pipeline_profiles) {
  const got = scorePipeline(p.asset_id);
  const want = seed.expected_risk[p.asset_id];
  check(want, `expected_risk missing for ${p.asset_id}`);
  if (!want) continue;
  check(got.score === want.score && got.band === want.band, `${p.asset_id}: risk ${got.score} ${got.band}, expected ${want.score} ${want.band}`);
  for (const [k, v] of Object.entries(want.factors)) check(got.factors[k] === v, `${p.asset_id}: factor ${k} = ${got.factors[k]}, expected ${v}`);
}

// ---------- 5. story consistency ----------
const inc = story.incident;
const evSum = Math.round(inc.evidence.reduce((a, e) => a + e.contribution, 0) * 100) / 100;
check(evSum === inc.evidence_score, `incident evidence contributions sum to ${evSum}, but evidence_score is ${inc.evidence_score}`);
check(new Set(inc.evidence.map((e) => e.type)).size >= 2, 'HIGH priority needs at least 2 independent evidence types');
check(inc.affected_households.estimate === areas.get(inc.service_area_id).household_count, 'affected households must come from the zone register');
const riskEv = inc.evidence.find((e) => e.type === 'RISK');
check(riskEv.text.includes(String(seed.expected_risk[inc.asset_id].score)), 'incident risk evidence text must match the computed risk score');

const t = (iso) => new Date(iso).getTime();
const firstComplaint = Math.min(...story.complaints.map((c) => t(c.created_at)));
const lastComplaint = Math.max(...story.complaints.map((c) => t(c.created_at)));
check((lastComplaint - firstComplaint) / 60000 <= 40, 'story complaints should fall within 40 minutes');
check(t(inc.opened_at) >= lastComplaint, 'incident must open after the complaints it cites');
const updates = story.task.updates.map((u) => t(u.at));
check(updates.every((v, i) => i === 0 || v > updates[i - 1]), 'task updates must be in time order');
check(updates[0] >= t(inc.opened_at), 'task must be assigned after the incident opens');

const ver = story.verification;
const tailBand = sensors.get('sen-tail-pressure').normal_band;
check(ver.windows.every((w) => w.result === 'PASSED') === (ver.result === 'VERIFIED_RESTORED'), 'VERIFIED_RESTORED requires every window to pass, and vice versa');
for (const w of ver.windows) {
  check(t(w.start) > updates[updates.length - 1], `verification window ${w.start} must start after the repair`);
  check(w.tail_pressure_mean_bar >= tailBand[0] && w.tail_pressure_mean_bar <= tailBand[1], `verification window ${w.start}: mean ${w.tail_pressure_mean_bar} bar is outside the normal band`);
  const sched = seed.supply_schedules.find((s) => s.service_area_id === inc.service_area_id);
  const hhmm = (iso) => iso.slice(11, 16);
  check(sched.windows.some(([a, b]) => hhmm(w.start) === a && hhmm(w.end) === b), `verification window ${w.start} is not a scheduled supply window`);
}
check(t(ver.verified_at) >= t(ver.windows[ver.windows.length - 1].end), 'verified_at must follow the last window');

// ---------- report ----------
if (errors.length) {
  console.error(`Seed validation FAILED (${errors.length} problem${errors.length > 1 ? 's' : ''}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('Seed validation passed.');
for (const p of seed.pipeline_profiles) {
  const r = scorePipeline(p.asset_id);
  const code = assets.get(p.asset_id).code;
  console.log(`  ${code.padEnd(5)} risk ${String(r.score).padStart(3)} ${r.band.padEnd(6)} ${JSON.stringify(r.factors)}${r.missing.length ? '  missing: ' + r.missing.join(', ') : ''}`);
}
console.log(`  ${story.incident.code}: evidence score ${story.incident.evidence_score}, ${story.verification.result}`);
