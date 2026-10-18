import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { apiFetch } from '../../data/api';
import { dataSource, fmtDate, fmtTime } from '../../data/seed';
import { usePolling } from '../../data/telemetry';
import { Card, Chip, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';

export const STATUS = {
  FUNCTIONAL: ['normal', 'Working'],
  PARTIAL: ['warning', 'Partly working'],
  NON_FUNCTIONAL: ['problem', 'Not working'],
};
const CAUSE = { NETWORK: 'Pipeline', LOCAL: 'Local (tap or connection)', NETWORK_ONLY: 'Model only' };
const dayColour = (c) => (!c ? 'bg-slate-200' : !c.got_water || c.quantity === 'NONE' ? 'bg-rose-500' : c.quantity === 'LOW' ? 'bg-amber-400' : 'bg-emerald-500');

/** Household taps, worst first, with a filter by zone and status. */
export function HouseholdTable({ zones }) {
  const { role } = useDemo();
  const [zone, setZone] = useState('');
  const [status, setStatus] = useState('');
  const q = new URLSearchParams({ limit: '30', ...(zone ? { zone } : {}), ...(status ? { status } : {}) });
  const { data } = usePolling(() => apiFetch(`/households?${q}`, { role }), 10000, true, `${zone}-${status}`);
  const base = role === 'officer' ? '/officer' : '/gp';
  return (
    <Card title="Household taps" accent="people">
      <div className="mb-4 flex flex-wrap gap-3">
        <select aria-label="Zone" value={zone} onChange={(e) => setZone(e.target.value)} className="min-h-11 rounded-xl border border-black/15 bg-white/80 px-3 text-sm">
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z.service_area_id} value={z.service_area_id}>
              {z.name}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-11 rounded-xl border border-black/15 bg-white/80 px-3 text-sm">
          <option value="">Any status</option>
          {Object.entries(STATUS).map(([k, [, label]]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        {data && <span className="self-center text-sm text-muted">{data.total} taps · showing the {data.households.length} most in need</span>}
      </div>
      {!data ? (
        <p className="text-muted">Loading…</p>
      ) : data.households.length === 0 ? (
        <p className="text-sm text-muted">No taps match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="pb-2 font-medium">Tap ID</th>
                <th className="pb-2 font-medium">Zone</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 text-right font-medium">L/person/day</th>
                <th className="pb-2 pl-4 font-medium">Based on</th>
              </tr>
            </thead>
            <tbody>
              {data.households.map((h) => (
                <tr key={h.map_id} className="border-t border-black/[0.06]">
                  <td className="py-2.5">
                    <Link to={`${base}/taps/${h.map_id}`} className="font-medium hover:underline">
                      {h.tap_id}
                    </Link>
                  </td>
                  <td className="py-2.5 text-muted">{h.zone}</td>
                  <td className="py-2.5">
                    <Chip level={STATUS[h.status][0]}>{STATUS[h.status][1]}</Chip>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{h.lpcd}</td>
                  <td className="py-2.5 pl-4 text-xs text-muted">{h.status_source === 'network model' ? 'Network model' : "Villager's check"}{h.likely_cause ? ` · ${CAUSE[h.likely_cause]}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** What villagers are telling us, as numbers for the zone or village. */
export function ValidationCard({ v, households }) {
  const pct = households ? Math.round((100 * v.reported) / households) : 0;
  return (
    <Card title="Villagers' service checks" accent="people">
      <div className="mb-3 flex items-end gap-3">
        <span className="font-display text-5xl leading-none tracking-tight">{pct}%</span>
        <span className="pb-1 text-sm text-muted">of homes reported in the last day or two ({v.reported} of {households})</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]" role="img" aria-label={`${pct}% of households reported`}>
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%`, transition: 'width 0.6s ease' }} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        {[['No water', v.no_water], ['Too little', v.low_water], ['Water looked or smelled wrong', v.quality_problems], ['Look like local faults', v.local_faults]].map(([k, n]) => (
          <div key={k} className="rounded-2xl bg-black/[0.04] p-3">
            <dd className="font-display text-3xl leading-none">{n}</dd>
            <dt className="mt-1 text-xs text-muted">{k}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">Answers come from the daily check on villagers' phones, and correct the sensor-based estimate for that home. Three or more homes short of water in one zone raise an alert.</p>
    </Card>
  );
}

export default function HouseholdDetail() {
  const { household } = useParams();
  const { role } = useDemo();
  const { data, error } = usePolling(() => apiFetch(`/households/${household}`, { role }), 10000, dataSource === 'api');
  const base = role === 'officer' ? '/officer' : '/gp';
  if (dataSource !== 'api') return <EmptyState icon="tap" title="The backend is not running">Household details are served by the backend.</EmptyState>;
  if (error && !data) return <EmptyState icon="alert" title={`Household ${household}`}>{error}</EmptyState>;
  if (!data) return <p className="text-muted">Loading…</p>;
  const [tone, label] = STATUS[data.status];
  const byDay = Object.fromEntries(data.checks.map((c) => [c.day, c]));
  const last14 = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - (13 - i) * 864e5).toLocaleDateString('en-CA'));
  return (
    <div>
      <PageHeader title={`Tap ${data.tap_id}`} subtitle={`${data.zone} · household ${data.household}${data.sujal_gaon_id ? ` · ${data.sujal_gaon_id}` : ''}`}>
        <SimBadge>Estimate</SimBadge>
      </PageHeader>
      <Link to={`${base}/taps`} className="mb-4 inline-flex items-center gap-2 text-sm text-muted hover:text-black">
        <Icon name="back" className="h-4 w-4" />
        All taps
      </Link>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Status" accent="water" className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-4">
            <Chip level={tone}>{label}</Chip>
            <span className="font-display text-5xl leading-none tracking-tight">{data.lpcd}</span>
            <span className="text-sm text-muted">litres per person per day estimated for this home from the network (the target is 55)</span>
          </div>
          <p className="mt-3 text-sm">Decided by the {data.status_source}.</p>
          {data.likely_cause_text && (
            <p className="mt-3 flex gap-2 rounded-2xl border border-black/10 p-3 text-sm">
              <Icon name="wrench" className="mt-0.5 h-4 w-4 shrink-0" />
              {data.likely_cause_text}
            </p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[['Model says', STATUS[data.modelled_status][1]], ['Pressure here', `${data.pressure_bar} bar`], ['Place on the lane', `${Math.round(data.position * 100)}% from the head`], ['Network data', data.supply.source]].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted">{data.basis}</p>
        </Card>
        <Card title="Last 14 days" accent="people">
          <div className="flex gap-1.5" role="img" aria-label="Service checks over 14 days">
            {last14.map((d) => (
              <span key={d} title={fmtDate(d)} className={`h-10 flex-1 rounded-md ${dayColour(byDay[d])}`} />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Green: water came and was enough. Amber: too little. Red: none. Grey: no report.</p>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {data.checks.slice(0, 5).map((c) => (
              <li key={c.id} className="rounded-xl bg-black/[0.04] p-3">
                <span className="font-medium">{fmtDate(c.day)}</span> · {c.got_water ? (c.quantity === 'LOW' ? 'too little water' : 'water came') : 'no water'}
                {c.quality && c.quality !== 'CLEAR' ? ` · ${c.quality.toLowerCase()}` : ''}
                {c.rating ? ` · rated ${c.rating}/5` : ''}
                {c.comment && <span className="mt-1 block text-muted">“{c.comment}”</span>}
                <span className="block text-xs text-muted">{fmtTime(c.created_at)}</span>
              </li>
            ))}
            {data.checks.length === 0 && <li className="text-muted">No service checks yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
