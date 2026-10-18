// Fictional house layouts and field sensors for the demo village, in schematic plan metres.
// Houses line the lanes along each distribution pipe, one per household in the zone register.
// Sensors are demo records with fixed health states, except those wired to the two simulated
// nodes, whose state comes from live telemetry. Nothing here describes real homes or devices.
import { seed, HOME_VILLAGE } from './seed';

export const HEALTH = {
  healthy: { label: 'Healthy', color: '#10B981' },
  service: { label: 'Needs servicing', color: '#F59E0B' },
  damaged: { label: 'Damaged / faulty', color: '#EF4444' },
  offline: { label: 'Offline', color: '#94A3B8' },
};

const KIND = {
  tap: 'Household tap (flow + pressure)',
  junction: 'Lane junction pressure',
  tail: 'Tail-end pressure',
  tank: 'Tank level',
  pump: 'Pump current',
};

// Small deterministic random generator, so the layout is the same on every load.
function rng(seedNumber) {
  let a = seedNumber;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inside([x, y], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Points every `step` metres along a polyline, with the direction of travel. */
function stations(line, step) {
  const out = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, y0] = line[i];
    const [x1, y1] = line[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    for (let d = step / 2; d < len; d += step) out.push({ x: x0 + ux * d, y: y0 + uy * d, ux, uy });
  }
  return out;
}

function footprint(cx, cy, ux, uy, w, d) {
  // Long side along the lane.
  const px = -uy;
  const py = ux;
  const hw = w / 2;
  const hd = d / 2;
  return [
    [cx - ux * hw - px * hd, cy - uy * hw - py * hd],
    [cx + ux * hw - px * hd, cy + uy * hw - py * hd],
    [cx + ux * hw + px * hd, cy + uy * hw + py * hd],
    [cx - ux * hw + px * hd, cy - uy * hw + py * hd],
  ];
}

// Demo faults, so every health state appears on the map. Keyed by sensor code.
const DEMO_STATE = {
  'N-H2': { status: 'damaged', reason: 'Reading stuck at 0.00 bar for 6 h while neighbours report flow', battery: 71 },
  'C-J1': { status: 'service', reason: 'Battery at 14%: replace within a week', battery: 14 },
  'S-T1': { status: 'service', reason: 'Calibration overdue (last calibrated 2 Mar 2026)', battery: 66, lastService: '2026-03-02' },
  'S-H3': { status: 'offline', reason: 'No data for 2 days: check power and antenna', battery: null },
  'C-H1': { status: 'damaged', reason: 'Tamper switch opened; enclosure may be damaged', battery: 83 },
  'N-J2': { status: 'service', reason: 'Weak signal (−112 dBm): readings arrive late', battery: 58 },
};

// Field sensors fed by the simulated nodes; their state follows live telemetry in API mode.
const LIVE_LINK = {
  'C-TK': { node: 'node-a', sensorId: 'sen-tank-level' },
  'C-PU': { node: 'node-a', sensorId: 'sen-pump-current' },
  'N-T1': { node: 'node-b', sensorId: 'sen-tail-pressure' },
};

let cached = null;

/** Houses and sensors for the home village, generated once from the seed geometry. */
export function fieldLayout() {
  if (cached) return cached;
  const zones = seed.service_areas.filter((a) => a.village_id === HOME_VILLAGE);
  const houses = [];
  const sensorList = [];

  zones.forEach((zone, zi) => {
    const rand = rng(1009 + zi * 7919);
    const prefix = zone.name[0].toUpperCase();
    const lines = seed.assets.filter((a) => a.service_area_id === zone.id && a.geometry.line && !/rising main/i.test(a.name));

    // Candidate plots: two rows on each side of every lane, kept only inside the zone.
    const plots = [];
    lines.forEach((pipe) => {
      stations(pipe.geometry.line, 16).forEach((s) => {
        [-1, 1].forEach((side) => {
          [24, 48].forEach((offset) => {
            const jitter = (rand() - 0.5) * 6;
            const cx = s.x - s.uy * side * (offset + jitter);
            const cy = s.y + s.ux * side * (offset + jitter);
            if (inside([cx, cy], zone.polygon)) plots.push({ cx, cy, ux: s.ux, uy: s.uy });
          });
        });
      });
    });

    // One house per household, spread evenly over the plots.
    const count = Math.min(zone.household_count, plots.length);
    const zoneHouses = [];
    for (let i = 0; i < count; i++) {
      const p = plots[Math.floor((i * plots.length) / count)];
      const w = 9 + rand() * 5;
      const d = 7 + rand() * 3;
      const house = { id: `${zone.id}-h${i + 1}`, zone: zone.id, polygon: footprint(p.cx, p.cy, p.ux, p.uy, w, d), height: 3.5 + rand() * 3, centre: [p.cx, p.cy] };
      houses.push(house);
      zoneHouses.push(house);
    }

    const add = (code, kind, at, extra = {}) => {
      const demo = DEMO_STATE[code];
      sensorList.push({
        code,
        kind,
        kindLabel: KIND[kind],
        zone: zone.id,
        zoneName: zone.name,
        at,
        status: demo?.status ?? 'healthy',
        reason: demo?.reason ?? null,
        battery: demo ? demo.battery : Math.round(62 + rand() * 36),
        lastService: demo?.lastService ?? `2026-${String(6 + Math.floor(rand() * 4)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 27)).padStart(2, '0')}`,
        live: LIVE_LINK[code] ?? null,
        ...extra,
      });
    };

    // Household taps on a few homes spread through the zone.
    [0.15, 0.4, 0.65, 0.9].forEach((f, i) => {
      const h = zoneHouses[Math.floor(f * (zoneHouses.length - 1))];
      if (h) add(`${prefix}-H${i + 1}`, 'tap', h.centre, { house: h.id });
    });
    // Junction sensors on lane bends inside the zone, and a tail sensor at the far end of each lane.
    lines.forEach((pipe) => {
      const pts = pipe.geometry.line;
      pts.slice(1, -1).filter((p) => inside(p, zone.polygon)).forEach((p, i) => add(`${prefix}-J${i + 1}`, 'junction', p, { pipe: pipe.code }));
      const end = pts.at(-1);
      if (inside(end, zone.polygon)) add(`${prefix}-T1`, 'tail', end, { pipe: pipe.code });
    });
  });

  // Head-works sensors at the pump house and the overhead tank.
  const central = zones.find((z) => seed.assets.some((a) => a.type === 'tank' && a.service_area_id === z.id));
  const tank = seed.assets.find((a) => a.type === 'tank' && a.service_area_id === central?.id);
  const pump = seed.assets.find((a) => a.type === 'pump' && a.service_area_id === central?.id);
  const head = (code, kind, asset) =>
    asset &&
    sensorList.push({
      code,
      kind,
      kindLabel: KIND[kind],
      zone: central.id,
      zoneName: central.name,
      at: asset.geometry.point,
      status: 'healthy',
      reason: null,
      battery: null,
      lastService: '2026-08-19',
      live: LIVE_LINK[code] ?? null,
    });
  head('C-TK', 'tank', tank);
  head('C-PU', 'pump', pump);

  cached = { houses, sensors: sensorList };
  return cached;
}

const SENSOR_FAULT_RULES = ['SENSOR_STUCK', 'SENSOR_OUT_OF_RANGE', 'SENSOR_INCONSISTENT'];

/**
 * Field sensors with their current state. Sensors wired to a simulated node follow live telemetry:
 * node silent → offline; a sensor-health alert on its sensor → damaged; otherwise healthy.
 */
export function sensorHealth(telemetry) {
  const nodes = telemetry?.live?.nodes;
  const alerts = telemetry?.alerts ?? [];
  return fieldLayout().sensors.map((s) => {
    if (!s.live || !nodes) return s;
    const node = nodes.find((n) => n.id === s.live.node);
    if (node && node.status !== 'online') {
      return { ...s, status: 'offline', reason: node.status === 'never_reported' ? 'Node has not reported yet (start the simulator)' : `${node.code ?? s.live.node} is not reporting: check power, battery or antenna`, isLive: true };
    }
    const fault = alerts.find((a) => a.sensor_id === s.live.sensorId && SENSOR_FAULT_RULES.includes(a.rule_code));
    if (fault) return { ...s, status: 'damaged', reason: fault.text ?? fault.rule_code, isLive: true };
    return { ...s, status: 'healthy', reason: null, isLive: true };
  });
}
