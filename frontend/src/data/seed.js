// Data access for the UI. Loads the snapshot from the backend (GET /api/v1/snapshot) and falls back to
// the bundled seed if the backend is not running. Exports are live bindings filled in by loadData().
import bundledSeed from '@seed/ramapuram.json';
import { scorePipeline } from '@shared/risk.mjs';

export let seed = null;
export let villages = {};
export let areas = {};
export let assets = {};
export let users = {};
export let sensors = {};
export let story = null;
export let STORY_ASSET = null;
/** 'api' when the backend answered, 'bundled' when we fell back to the seed shipped with the app. */
export let dataSource = null;

export const HOME_VILLAGE = 'vil-ramapuram';
export const CITIZEN_AREA = 'sa-north';

const index = (list, key = 'id') => Object.fromEntries(list.map((x) => [x[key], x]));
let serverRisk = null;
const riskCache = new Map();

function install(data, source) {
  seed = data;
  villages = index(data.villages);
  areas = index(data.service_areas);
  assets = index(data.assets);
  users = index(data.users);
  sensors = index(data.sensors);
  story = data.story;
  STORY_ASSET = data.story.incident.asset_id;
  serverRisk = data.risk ?? null;
  riskCache.clear();
  dataSource = source;
}

export async function loadData({ timeoutMs = 4000 } = {}) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch('/api/v1/snapshot', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    install(await res.json(), 'api');
  } catch (err) {
    console.warn('Backend unavailable, using bundled seed:', err.message);
    install(bundledSeed, 'bundled');
  }
}

/** Re-read the snapshot after a write (e.g. a new complaint) so every screen sees it. */
export async function reloadData() {
  if (dataSource === 'api') await loadData();
}

/** Risk from the server when available (Python), else computed locally with the same rules (JavaScript). */
export function riskFor(assetId) {
  if (serverRisk?.[assetId]) return serverRisk[assetId];
  if (!riskCache.has(assetId)) riskCache.set(assetId, scorePipeline(seed, assetId));
  return riskCache.get(assetId);
}

export function pipelinesFor(villageIds) {
  const wanted = new Set(villageIds);
  return seed.assets
    .filter((a) => a.type === 'pipeline' && wanted.has(areas[a.service_area_id].village_id))
    .map((a) => ({
      asset: a,
      profile: seed.pipeline_profiles.find((p) => p.asset_id === a.id),
      risk: riskFor(a.id),
      village: villages[areas[a.service_area_id].village_id],
      area: areas[a.service_area_id],
    }))
    .sort((x, y) => y.risk.score - x.risk.score);
}

export function areasFor(villageId) {
  return seed.service_areas.filter((a) => a.village_id === villageId);
}

export function scheduleFor(areaId) {
  return seed.supply_schedules.find((s) => s.service_area_id === areaId);
}

export function repairsFor(assetId) {
  return seed.repairs.filter((r) => r.asset_id === assetId).sort((a, b) => b.date.localeCompare(a.date));
}

export function inspectionsFor(assetId) {
  return seed.inspections.filter((i) => i.asset_id === assetId).sort((a, b) => b.date.localeCompare(a.date));
}

const timeFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
});
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export const fmtTime = (iso) => (iso ? timeFmt.format(new Date(iso)) : '—');
export const fmtDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const labelOf = (s) => (s ? s.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '');
