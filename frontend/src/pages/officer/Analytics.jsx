import { useEffect, useState } from 'react';
import { useDemo } from '../../demo/DemoContext';
import { apiFetch } from '../../data/api';
import { dataSource } from '../../data/seed';
import { usePolling } from '../../data/telemetry';
import { Card, Chip, EmptyState, Kpi, PageHeader, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';
import { StackBar, TONE } from '../../components/viz';
import { Trend } from '../gp/Taps';

const LEVEL_NAME = { state: 'State', district: 'District', block: 'Block', village: 'Village (Gram Panchayat)', zone: 'Zone' };
const pctTone = (p) => (p == null ? TONE.muted : p >= 95 ? TONE.good : p >= 80 ? TONE.watch : TONE.bad);

/** Download a protected file: the API needs the sign-in token, so a plain link will not do. */
async function download(path, role, filename) {
  const res = await apiFetch(path, { role, raw: true });
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** GIS view: the villages in scope at their (fictional) positions, coloured by tap functionality. */
function VillageMap({ geo, scope, onOpen }) {
  if (!geo) return <p className="text-sm text-muted">Loading map…</p>;
  const feats = geo.features;
  const lons = feats.map((f) => f.geometry.coordinates[0]);
  const lats = feats.map((f) => f.geometry.coordinates[1]);
  const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const W = 520;
  const H = 300;
  const px = (lon) => 50 + ((lon - x0) / (x1 - x0 || 1)) * (W - 100);
  const py = (lat) => H - 40 - ((lat - y0) / (y1 - y0 || 1)) * (H - 80);
  const inScope = (p) => scope.level === 'state' || p[scope.level] === scope.id || (scope.level === 'village' && p.id === scope.id);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-2xl border border-black/10 bg-water-50/60" role="img" aria-label="Villages on a map, coloured by tap functionality">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeOpacity="0.06" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" />
      {feats.map((f) => {
        const p = f.properties;
        const [lon, lat] = f.geometry.coordinates;
        const on = inScope(p);
        const r = 10 + Math.sqrt(p.households) * 0.9;
        return (
          <g key={p.id} onClick={() => onOpen(p)} className="cursor-pointer" opacity={on ? 1 : 0.3} role="button" aria-label={`${p.name}: ${p.functional_pct}% of taps working`}>
            {p.alerts_high > 0 && <circle cx={px(lon)} cy={py(lat)} r={r + 8} fill="none" stroke={TONE.bad} strokeWidth="2" strokeDasharray="4 4" />}
            <circle cx={px(lon)} cy={py(lat)} r={r} fill={pctTone(p.functional_pct)} fillOpacity="0.85" stroke="#fff" strokeWidth="3" />
            <text x={px(lon)} y={py(lat) + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{p.functional_pct}%</text>
            <text x={px(lon)} y={py(lat) + r + 16} textAnchor="middle" fontSize="12" fill="currentColor">{p.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

function UnitRow({ c, level, onOpen }) {
  const k = c.kpis;
  return (
    <li className="rounded-2xl border border-black/[0.08] bg-white/40 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="font-medium">{c.label}</span>
        {c.sujal_gaon_id && <span className="text-xs text-muted">{c.sujal_gaon_id}</span>}
        {c.villages != null && <span className="text-xs text-muted">{c.villages} village{c.villages > 1 ? 's' : ''}</span>}
        {k.alerts_high > 0 && <Chip level="problem">{k.alerts_high} high alert{k.alerts_high > 1 ? 's' : ''}</Chip>}
        {k.quality.unsafe > 0 && <Chip level="warning">{k.quality.unsafe} zone failed a field test</Chip>}
        <span className="ml-auto font-display text-3xl leading-none" style={{ color: pctTone(k.functional_pct) }}>{k.functional_pct}%</span>
        {level !== 'zone' && (
          <button type="button" onClick={() => onOpen(c)} className="btn-outline min-h-9 px-3 text-sm">
            Open
          </button>
        )}
      </div>
      <StackBar functional={k.functional} partial={k.partial} nonFunctional={k.non_functional} height={10} />
      <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
        <span>{k.households} homes</span>
        <span>{k.alerts_open} open alerts</span>
        <span>{k.incidents_open} open incidents</span>
        <span>{k.tasks_overdue} overdue tasks</span>
        <span>{k.complaints_open} open reports</span>
        <span>{k.validation_reported_pct}% villagers' checks</span>
        <span>{k.data_basis}</span>
      </p>
    </li>
  );
}

export default function Analytics() {
  const { role } = useDemo();
  const [scope, setScope] = useState({ level: 'state', id: undefined });
  const [busy, setBusy] = useState(null);
  const q = new URLSearchParams({ level: scope.level, ...(scope.id ? { id: scope.id } : {}) });
  const { data, error } = usePolling(() => apiFetch(`/analytics/summary?${q}`, { role }), 10000, dataSource === 'api', `${scope.level}-${scope.id}`);
  const [geo, setGeo] = useState(null);
  useEffect(() => {
    if (dataSource === 'api') apiFetch('/geo/villages.geojson', { role }).then(setGeo).catch(() => {});
  }, [role]);

  if (dataSource !== 'api') {
    return (
      <div>
        <PageHeader title="Analytics — every administrative level" />
        <EmptyState icon="chart" title="The backend is not running">Analytics are computed on the server. Start it, then reload.</EmptyState>
      </div>
    );
  }
  if (error && !data) return <EmptyState icon="alert" title="Analytics">{error}</EmptyState>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const t = data.totals;
  const open = (c) => setScope({ level: data.children_level, id: c.id });
  const exportFile = async (key, path, file) => {
    setBusy(key);
    try {
      await download(path, role, file);
    } catch {
      /* a failed download leaves the page as it is */
    }
    setBusy(null);
  };

  return (
    <div>
      <PageHeader title="Analytics — every administrative level" subtitle="Tap functionality, alerts, repairs and water quality, from the zone up to the State. Open any row to drill down.">
        <SimBadge>Simulated sensors</SimBadge>
      </PageHeader>

      <nav aria-label="Administrative level" className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        {data.breadcrumb.map((b, i) => (
          <span key={b.level} className="flex items-center gap-2">
            {i > 0 && <Icon name="arrow" className="h-3.5 w-3.5 text-muted" />}
            <button type="button" onClick={() => setScope({ level: b.level, id: b.id })} aria-current={i === data.breadcrumb.length - 1 ? 'page' : undefined} className={`rounded-full border px-3 py-1.5 ${i === data.breadcrumb.length - 1 ? 'border-black bg-black text-white' : 'border-black/10 bg-white/60 hover:border-black/30'}`}>
              <span className="text-xs opacity-60">{LEVEL_NAME[b.level]} </span>
              {b.label}
            </button>
          </span>
        ))}
      </nav>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Households" value={t.households} icon="home" note={`${data.villages} village${data.villages > 1 ? 's' : ''} · ${t.zones} zones`} />
        <Kpi label="Functional taps" value={`${t.functional_pct}%`} level={t.functional_pct >= 95 ? 'normal' : t.functional_pct >= 80 ? 'warning' : 'problem'} icon="tap" note={`${t.functional} of ${t.households}`} />
        <Kpi label="Open alerts" value={t.alerts_open} level={t.alerts_high ? 'problem' : t.alerts_open ? 'warning' : 'normal'} icon="alert" note={`${t.alerts_high} high · ${t.alerts_unacknowledged_high} unseen`} />
        <Kpi label="Overdue tasks" value={t.tasks_overdue} level={t.tasks_overdue ? 'problem' : 'normal'} icon="wrench" note={`${t.tasks_open} open · ${t.incidents_open} incidents`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Card title={`By ${LEVEL_NAME[data.children_level].toLowerCase()}, worst served first`} accent="map">
            <ul className="flex flex-col gap-3">
              {data.children.map((c) => (
                <UnitRow key={c.id} c={c} level={data.children_level} onOpen={open} />
              ))}
            </ul>
          </Card>
          <Card title="Last 14 days" accent="water">
            <Trend points={data.trend} />
            <p className="text-[11px] text-muted">Earlier days are simulated history; today is live.</p>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card title="Map" accent="map" action={<SimBadge>Fictional positions</SimBadge>}>
            <VillageMap geo={geo} scope={scope} onOpen={(p) => setScope({ level: 'village', id: p.id })} />
            <p className="mt-2 text-xs text-muted">Circle size is the number of homes; colour is the share of working taps; a dashed ring means a high alert.</p>
          </Card>
          <Card title="Response" accent="task">
            <dl className="grid grid-cols-2 gap-3 text-center">
              {[
                ['Report to incident', t.median_hours_complaint_to_incident, 'h median'],
                ['Assigned to repaired', t.median_hours_to_repair, 'h median'],
                ['Open reports', t.complaints_open, ''],
                ['Villagers reporting', `${t.validation_reported_pct}%`, ''],
              ].map(([k, v, u]) => (
                <div key={k} className="rounded-2xl bg-black/[0.04] p-3">
                  <dd className="font-display text-3xl leading-none">{v ?? '—'}<span className="ml-1 text-xs font-sans text-muted">{v == null ? '' : u}</span></dd>
                  <dt className="mt-1 text-xs text-muted">{k}</dt>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Water quality (field tests)" accent="verify">
            <StackBar functional={t.quality.safe} partial={t.quality.watch} nonFunctional={t.quality.unsafe} height={12} />
            <p className="mt-2 text-xs text-muted">
              {t.quality.safe} passed · {t.quality.watch} watch · {t.quality.unsafe} failed · {t.quality.untested} not tested (zones). A screening, not a certificate.
            </p>
          </Card>
          <Card title="Open data" accent="record">
            <p className="mb-3 text-sm text-muted">Anonymised exports in open formats, for other systems and GIS tools.</p>
            <div className="flex flex-wrap gap-2">
              {[['taps', 'Taps'], ['alerts', 'Alerts'], ['complaints', 'Reports'], ['water-quality', 'Water quality'], ['tasks', 'Tasks']].map(([id, label]) => (
                <button key={id} type="button" disabled={busy === id} onClick={() => exportFile(id, `/export/${id}.csv`, `${id}.csv`)} className="btn-outline min-h-10 px-3 text-sm">
                  {label} CSV
                </button>
              ))}
              <button type="button" disabled={busy === 'geo'} onClick={() => exportFile('geo', '/geo/villages.geojson', 'villages.geojson')} className="btn-outline min-h-10 px-3 text-sm">
                Villages GeoJSON
              </button>
            </div>
          </Card>
        </div>
      </div>
      <ul className="mt-4 text-xs text-muted">
        {data.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
