import { Link } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { dataSource, fmtDate } from '../../data/seed';
import { useFhtc } from '../../data/ai';
import { Card, Chip, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';
import { Donut, StackBar, TONE } from '../../components/viz';

const STATUS = {
  FUNCTIONAL: ['normal', 'Working'],
  PARTIAL: ['warning', 'Partly working'],
  NON_FUNCTIONAL: ['problem', 'Not working'],
};

function Trend({ points }) {
  const W = 360;
  const H = 110;
  const xs = (i) => 8 + (i / (points.length - 1)) * (W - 16);
  const ys = (v) => H - 14 - ((v - 70) / 30) * (H - 28);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)} ${ys(p.functional_pct ?? 0).toFixed(1)}`).join(' ');
  const last = points.at(-1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Functional taps over 14 days">
      <line x1="8" x2={W - 8} y1={ys(100)} y2={ys(100)} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 4" />
      <path d={`${path} L${xs(points.length - 1)} ${H - 14} L8 ${H - 14} Z`} fill={TONE.water} fillOpacity="0.1" />
      <path d={path} fill="none" stroke={TONE.water} strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx={xs(points.length - 1)} cy={ys(last.functional_pct ?? 0)} r="4.5" fill="#000" />
      <text x="8" y={H - 2} fontSize="10" fill="currentColor" fillOpacity="0.5">{fmtDate(points[0].date)}</text>
      <text x={W - 8} y={H - 2} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.5">today (live)</text>
    </svg>
  );
}

function ZoneCard({ z }) {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white/40 p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-2xl leading-none tracking-tight">{z.name}</p>
          <p className="mt-1 text-xs text-muted">{z.sujal_gaon_id ?? 'No Sujal Gaon ID yet'} · {z.households} homes</p>
        </div>
        <p className="font-display text-4xl leading-none tracking-tight">{z.functional_pct}<span className="text-lg text-muted">%</span></p>
      </div>
      <StackBar functional={z.functional} partial={z.partial} nonFunctional={z.non_functional} />
      <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
        <span><b className="text-ink">{z.functional}</b> working</span>
        <span><b className="text-ink">{z.partial}</b> partly</span>
        <span><b className="text-ink">{z.non_functional}</b> not working</span>
        <span className="ml-auto">{z.avg_lpcd} L/person/day</span>
      </p>
      <p className="mt-2 text-xs text-muted">Pressure {z.head_bar} → {z.tail_bar} bar · {z.data_source}</p>
    </div>
  );
}

export default function Taps() {
  const { role } = useDemo();
  const { data: f } = useFhtc(role);

  if (dataSource !== 'api') {
    return (
      <div>
        <PageHeader title="Tap Connections — live functionality" />
        <EmptyState icon="tap" title="The backend is not running">Tap functionality is estimated on the server from live sensor readings. Start it, then reload.</EmptyState>
      </div>
    );
  }
  if (!f) return <p className="text-muted">Loading…</p>;

  const needing = f.zones.flatMap((z) => z.worst.filter((h) => h.status !== 'FUNCTIONAL').map((h) => ({ ...h, zone: z.name }))).sort((a, b) => a.lpcd - b.lpcd).slice(0, 8);
  const unresolved = f.zones.filter((z) => !z.sujal_gaon_id).length;

  return (
    <div>
      <PageHeader title="Tap Connections — live functionality" subtitle="Is every household tap delivering enough water right now? Estimated from live pressure and flow.">
        <SimBadge>Simulated sensors</SimBadge>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Functional household taps" accent="water" className="xl:col-span-2">
          <div className="flex flex-wrap items-center gap-8">
            <Donut functional={f.functional} partial={f.partial} nonFunctional={f.non_functional} centre={`${f.functional_pct}%`} caption={`${f.functional} of ${f.households} homes`} />
            <ul className="flex flex-1 flex-col gap-3">
              {[
                ['FUNCTIONAL', f.functional, TONE.good],
                ['PARTIAL', f.partial, TONE.watch],
                ['NON_FUNCTIONAL', f.non_functional, TONE.bad],
              ].map(([k, n, c]) => (
                <li key={k} className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ background: c }} />
                  <span className="font-display text-4xl leading-none tracking-tight">{n}</span>
                  <span className="text-sm text-muted">{STATUS[k][1].toLowerCase()}</span>
                </li>
              ))}
            </ul>
            <div className="min-w-[240px] flex-1">
              <p className="mb-1 text-xs uppercase tracking-wide text-muted">Last 14 days</p>
              <Trend points={f.history} />
              <p className="text-[11px] text-muted">Earlier days are simulated history</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted">{f.definition}</p>
        </Card>

        <Card title="Taps needing attention" accent="alert" action={role === 'gp' && <Link to="/gp/map?layer=service" className="text-sm font-semibold text-brand-600">On the map</Link>}>
          {needing.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Icon name="checkCircle" className="h-5 w-5 text-emerald-600" />
              Every household is getting 55+ litres per person per day.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {needing.map((h) => (
                <li key={`${h.zone}-${h.household}`} className="flex items-center gap-3 text-sm">
                  <Icon name="tap" className="h-5 w-5 shrink-0 text-muted" />
                  <span className="flex-1">
                    <span className="font-medium">{h.household}</span> <span className="text-muted">· {h.zone}</span>
                  </span>
                  <span className="text-muted">{h.lpcd} L/day</span>
                  <Chip level={STATUS[h.status][0]}>{STATUS[h.status][1]}</Chip>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card title="By zone" accent="map">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {f.zones.map((z) => (
              <ZoneCard key={z.service_area_id} z={z} />
            ))}
          </div>
          {unresolved > 0 && <p className="mt-4 text-xs text-muted">{unresolved} zone{unresolved > 1 ? 's have' : ' has'} no Sujal Gaon ID yet (mock): IDs are only issued to zones that meet the prescribed standards.</p>}
        </Card>
      </div>

      {role === 'officer' && (
        <div className="mt-5">
          <Card title="By village" accent="record">
            <ul className="flex flex-col gap-4">
              {f.villages.map((v) => (
                <li key={v.village_id}>
                  <div className="mb-1 flex items-baseline gap-3">
                    <span className="font-medium">{v.name}</span>
                    <span className="text-xs text-muted">{v.lgd_code} · {v.households} homes</span>
                    <span className="ml-auto font-display text-2xl leading-none">{v.functional_pct}%</span>
                  </div>
                  <StackBar functional={v.functional} partial={v.partial} nonFunctional={v.non_functional} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <p className="mt-4 text-xs text-muted">{f.basis}</p>
    </div>
  );
}
