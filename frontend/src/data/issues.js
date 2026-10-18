// Everything that is wrong right now, gathered from the live sensors, the AI models and the field tests,
// each with a place on the map. The map's Issues layer and the dashboard both read this list.
import { assets, areas } from './seed';
import { fieldLayout, pointAlong, sensorHealth } from './fieldLayout';
import { zoneQuality } from './quality';
import { fmtEta } from './ai';

export const SEVERITY = {
  high: { label: 'Act now', color: '#EF4444' },
  watch: { label: 'Watch', color: '#F59E0B' },
};

export const KIND = {
  alert: { label: 'Sensor alerts' },
  ai: { label: 'AI warnings' },
  quality: { label: 'Water quality' },
  equipment: { label: 'Equipment' },
  taps: { label: 'Taps' },
};

function lineLength(line) {
  let len = 0;
  for (let i = 0; i < line.length - 1; i++) len += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  return len;
}

/** A point `fraction` (0 = head, 1 = tail end) of the way along a pipeline, or the asset's own point. */
function onAsset(assetId, fraction = 0.5) {
  const a = assets[assetId];
  if (!a) return null;
  if (a.geometry.point) return a.geometry.point;
  return pointAlong(a.geometry.line, lineLength(a.geometry.line) * fraction);
}

function centroid(points) {
  return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
}

const ALERT_SPOT = { TAIL_PRESSURE_LOW_IN_SUPPLY: 0.96, HEAD_TAIL_FLOW_GAP: 0.55, NO_FLOW_IN_SUPPLY: 0.9 };
const ALERT_SHORT = { TAIL_PRESSURE_LOW_IN_SUPPLY: 'Low pressure', HEAD_TAIL_FLOW_GAP: 'Leak?', NO_FLOW_IN_SUPPLY: 'No flow', PUMP_OFF_IN_SUPPLY: 'Pump off', NODE_OFFLINE: 'Node offline' };

/**
 * @param {{telemetry?: object, predictions?: object, fhtc?: object, tests?: object[]}} src
 * @returns {Array<{id, kind, severity, title, detail, short, at, link?: {to, label}}>}
 */
export function buildIssues({ telemetry, predictions, fhtc, tests }) {
  const out = [];
  const add = (issue) => issue.at && out.push(issue);

  // 1. Alerts raised by the rules engine on live readings.
  (telemetry?.alerts ?? []).forEach((a) => {
    const water = a.kind === 'WATER_SERVICE';
    add({
      id: `alert-${a.id}`, kind: water ? 'alert' : 'equipment', severity: water ? 'high' : 'watch', short: ALERT_SHORT[a.rule_code] ?? 'Alert',
      title: water ? 'Live sensor alert' : 'Equipment alert', detail: a.text, at: onAsset(a.asset_id, ALERT_SPOT[a.rule_code] ?? 0.5), link: { to: '/gp/water', label: 'Water Status' },
    });
  });

  // 2. What the AI models see.
  if (predictions) {
    const an = predictions.anomaly;
    if (an?.status === 'anomaly') {
      add({ id: 'ai-anomaly', kind: 'ai', severity: 'high', short: 'AI: unusual', title: 'Network is behaving unusually', detail: an.explanation.join('. ') || 'Readings do not match normal operation.', at: onAsset(an.asset_id, 0.55), link: { to: '/gp/early-warning', label: 'AI Early Warning' } });
    }
    predictions.forecasts.forEach((f) => {
      if (f.status !== 'ok' || !['warning', 'watch', 'breach'].includes(f.level)) return;
      const tank = f.kind === 'tank_level';
      const where = tank ? onAsset('ast-oht1') : onAsset('ast-p21', 0.97);
      const when = f.minutes_to_breach != null ? `Leaves its normal band in ${fmtEta(f.minutes_to_breach)}.` : f.message;
      add({ id: `ai-forecast-${f.kind}`, kind: 'ai', severity: f.level === 'watch' ? 'watch' : 'high', short: tank ? 'Tank level' : 'Pressure falling', title: `${tank ? 'Tank level' : 'Tail pressure'} forecast`, detail: f.message ?? when, at: where, link: { to: '/gp/early-warning', label: 'AI Early Warning' } });
    });
    predictions.quality.forEach((q) => {
      if (q.level === 'OK') return;
      const at = onAsset(q.asset_id, 0.99);
      add({ id: `quality-${q.asset_id}`, kind: 'quality', severity: q.level === 'AT_RISK' ? 'high' : 'watch', short: 'Test water', title: `Water-quality ${q.level === 'AT_RISK' ? 'risk' : 'watch'} at the tail of ${q.asset_code}`, detail: `${q.reasons.join('. ')}. ${q.action}`, at: at && [at[0] + 25, at[1] - 25], link: { to: '/gp/quality', label: 'Log a field test' } });
    });
    const reg = predictions.regularity;
    if (reg?.status === 'ok' && (reg.pattern === 'intermittent' || reg.pattern === 'off')) {
      add({ id: 'ai-regularity', kind: 'alert', severity: 'high', short: reg.pattern === 'off' ? 'No water' : 'On and off', title: reg.pattern === 'off' ? 'No water at the tail end' : 'Intermittent supply', detail: reg.message, at: onAsset(reg.asset_id, 0.9), link: { to: '/gp/early-warning', label: 'AI Early Warning' } });
    }
    (predictions.clusters ?? []).forEach((c) => {
      add({ id: `cluster-${c.id}`, kind: 'taps', severity: 'watch', short: `${c.size} reports`, title: `${c.size} villager reports near ${c.asset_code}`, detail: `Reports ${c.complaint_codes.map((x) => `#${x}`).join(', ')} within ${Math.max(c.radius_m, 1)} m: likely a network fault.${c.coarse ? ' (Shared at zone level.)' : ''}`, at: c.centre, link: { to: '/gp/complaints', label: 'Complaints' } });
    });
    predictions.failures.filter((f) => f.priority === 'HIGH' && f.timing === 'overdue').forEach((f) => {
      add({ id: `failure-${f.asset_id}`, kind: 'ai', severity: 'watch', short: 'Inspect', title: `${f.asset_code} is due for inspection`, detail: f.basis, at: onAsset(f.asset_id, 0.3), link: { to: `/gp/pipelines/${f.asset_id}`, label: 'Health record' } });
    });
  }

  // 3. Taps that are not getting enough water (from the tap-connection monitor).
  const houses = Object.fromEntries(fieldLayout().houses.map((h) => [h.id, h.centre]));
  (fhtc?.zones ?? []).forEach((z) => {
    const ids = [...z.affected_map_ids.NON_FUNCTIONAL, ...z.affected_map_ids.PARTIAL];
    const spots = ids.map((id) => houses[id]).filter(Boolean);
    if (!spots.length) return;
    add({
      id: `taps-${z.service_area_id}`, kind: 'taps', severity: z.non_functional ? 'high' : 'watch', short: `${ids.length} taps`,
      title: `${ids.length} home${ids.length > 1 ? 's' : ''} below 55 L/person/day in ${z.name}`, detail: `${z.non_functional} not working and ${z.partial} partly working, at the far end of the lane (tail pressure ${z.tail_bar} bar).`,
      at: centroid(spots), link: { to: '/gp/taps', label: 'Tap Connections' },
    });
  });

  // 4. Field-test-kit results.
  Object.values(areas).filter((z) => z.village_id === 'vil-ramapuram').forEach((z) => {
    if (zoneQuality(z.id, tests) === 'unsafe') {
      add({ id: `ftk-${z.id}`, kind: 'quality', severity: 'high', short: 'Unsafe test', title: `Field test failed in ${z.name}`, detail: 'A field-test-kit result is unsafe: advise boiling water and re-test within 48 hours.', at: centroid(z.polygon), link: { to: '/gp/quality', label: 'Water Quality' } });
    }
  });

  // 5. Field sensors that are damaged or silent.
  sensorHealth(telemetry).filter((s) => s.status === 'damaged' || s.status === 'offline').forEach((s) => {
    add({ id: `sensor-${s.code}`, kind: 'equipment', severity: 'watch', short: `${s.code} ${s.status === 'offline' ? 'offline' : 'fault'}`, title: `Sensor ${s.code}: ${s.status === 'offline' ? 'offline' : 'damaged or faulty'}`, detail: s.reason ?? s.kindLabel, at: s.at, link: { to: '/gp/map?layer=sensors', label: 'Sensors layer' } });
  });

  const ordered = out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
  return stack(ordered);
}

/** Issues at nearly the same place (a leak, its pressure drop and its water-quality risk) would hide each other's
 *  labels, so each one after the first is moved a little further south. The card and list give the true detail. */
function stack(issues) {
  const placed = [];
  return issues.map((i) => {
    const crowd = placed.filter((p) => Math.hypot(p[0] - i.at[0], p[1] - i.at[1]) < 90).length;
    const at = [i.at[0], i.at[1] - 46 * crowd];
    placed.push(i.at);
    return { ...i, at };
  });
}
