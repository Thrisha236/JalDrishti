// Read-only access to the demo seed. Stage 4 replaces these lookups with API calls.
import seed from '@seed/ramapuram.json';
import { scorePipeline } from '@shared/risk.mjs';

export { seed };

const index = (list, key = 'id') => Object.fromEntries(list.map((x) => [x[key], x]));

export const villages = index(seed.villages);
export const areas = index(seed.service_areas);
export const assets = index(seed.assets);
export const users = index(seed.users);
export const sensors = index(seed.sensors);
export const story = seed.story;

export const HOME_VILLAGE = 'vil-ramapuram';
export const CITIZEN_AREA = 'sa-north';
export const STORY_ASSET = story.incident.asset_id;

const riskCache = new Map();
export function riskFor(assetId) {
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
