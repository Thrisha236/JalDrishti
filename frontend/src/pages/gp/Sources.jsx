// Water sources: will the borewell last until the monsoon? Trend projection with levers the GP controls,
// plus today's overhead-tank buffer from the live level sensor.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dataSource, fmtDate } from '../../data/seed';
import { useLiveTelemetry } from '../../data/telemetry';
import { BOREWELL, borewellHistory, demandKL, LPCD, PERSONS_PER_HOUSEHOLD, projectBorewell, sourceActions, tankBuffer, TANK, TODAY } from '../../data/sources';
import { Card, PageHeader, SimBadge } from '../../components/ui';
import { WaterLevel } from '../../components/water';

const MONSOONS = [
  ['2027-06-01', 'Early (1 Jun)'],
  ['2027-06-10', 'Normal (10 Jun)'],
  ['2027-07-01', 'Late (1 Jul)'],
];

const ts = (iso) => new Date(`${iso}T00:00:00Z`).getTime();

/** Depth below ground over time; deeper is lower on the chart, like looking down the borewell. */
function DepthChart({ history, projection }) {
  const W = 720;
  const H = 260;
  const pad = { l: 44, r: 16, t: 16, b: 28 };
  const x0 = ts(history[0].date);
  const x1 = ts(projection.monsoon) + 10 * 86400000;
  const maxDepth = BOREWELL.pumpIntakeM + 3;
  const x = (iso) => pad.l + ((ts(iso) - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const y = (d) => pad.t + (d / maxDepth) * (H - pad.t - pad.b);
  const line = (pts) => pts.map((p) => `${x(p.date).toFixed(1)},${y(p.depth).toFixed(1)}`).join(' ');
  const months = [];
  // Label the first of each month after the chart starts.
  const first = new Date(x0);
  first.setUTCMonth(first.getUTCMonth() + 1, 1);
  for (let d = first; d.getTime() <= x1; d.setUTCMonth(d.getUTCMonth() + 1, 1)) months.push(new Date(d));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Borewell water level: last six months and projection to the monsoon">
      {/* Danger zone near the pump */}
      <rect x={pad.l} y={y(projection.limit)} width={W - pad.l - pad.r} height={y(maxDepth) - y(projection.limit)} fill="rgb(239 68 68 / 0.12)" />
      <line x1={pad.l} x2={W - pad.r} y1={y(projection.limit)} y2={y(projection.limit)} stroke="#EF4444" strokeDasharray="5 4" />
      <text x={pad.l + 6} y={y(projection.limit) - 5} fontSize="11" fill="#EF4444">
        Safe limit {projection.limit} m (pump intake {BOREWELL.pumpIntakeM} m)
      </text>
      {[0, 10, 20, 30, 40].map((d) => (
        <g key={d}>
          <line x1={pad.l} x2={W - pad.r} y1={y(d)} y2={y(d)} stroke="rgb(var(--muted) / 0.15)" />
          <text x={pad.l - 6} y={y(d) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--muted))">
            {d} m
          </text>
        </g>
      ))}
      {months.map((m) => (
        <text key={m.toISOString()} x={x(m.toISOString().slice(0, 10))} y={H - 8} fontSize="10" fill="rgb(var(--muted))">
          {m.toLocaleString('en-IN', { month: 'short' })}
        </text>
      ))}
      <line x1={x(TODAY)} x2={x(TODAY)} y1={pad.t} y2={H - pad.b} stroke="rgb(var(--ink) / 0.35)" />
      <text x={x(TODAY) + 4} y={pad.t + 10} fontSize="11" fill="rgb(var(--ink))">
        Today
      </text>
      <line x1={x(projection.monsoon)} x2={x(projection.monsoon)} y1={pad.t} y2={H - pad.b} stroke="#0EA5E9" strokeDasharray="3 3" />
      <text x={x(projection.monsoon) - 4} y={pad.t + 10} textAnchor="end" fontSize="11" fill="#0EA5E9">
        Monsoon
      </text>
      <polyline points={line(history)} fill="none" stroke="rgb(var(--ink))" strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points={line(projection.path)} fill="none" stroke="#0EA5E9" strokeWidth="2.5" strokeDasharray="6 5" strokeLinejoin="round" />
      {projection.hitLimit && <circle cx={x(projection.hitLimit)} cy={y(projection.limit)} r="5" fill="#EF4444" />}
    </svg>
  );
}

export default function Sources() {
  const [useCut, setUseCut] = useState(0);
  const [recharge, setRecharge] = useState(false);
  const [monsoon, setMonsoon] = useState('2027-06-10');
  const history = useMemo(() => borewellHistory(), []);
  const p = useMemo(() => projectBorewell({ useCut, recharge, monsoon }), [useCut, recharge, monsoon]);
  const demand = demandKL();
  const { data: telemetry } = useLiveTelemetry({ withSeries: false });
  const tankSensor = telemetry?.live?.sensors?.find((s) => s.id === 'sen-tank-level');
  const tankLive = tankSensor?.latest && tankSensor.node_status === 'online' ? tankSensor.latest.value : null;
  const buffer = tankBuffer(tankLive);

  return (
    <div>
      <PageHeader title="Water Sources — outlook" subtitle="Will the borewell last until the monsoon? A trend projection you can steer, not a hydrogeological model.">
        <SimBadge>Fictional records</SimBadge>
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`card relative overflow-hidden p-5 ${p.lastsToMonsoon ? '' : 'border-rose-200'}`}>
          <p className="text-sm text-muted">Reliable supply left</p>
          <p className="mt-1 font-display text-6xl leading-none tracking-tight">{p.daysLeft}</p>
          <p className="mt-1 text-sm">{p.lastsToMonsoon ? `days: lasts until the monsoon (${fmtDate(p.monsoon)})` : `days: reaches the safe limit on ${fmtDate(p.hitLimit)}`}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-muted">Gap before the monsoon</p>
          <p className="mt-1 font-display text-6xl leading-none tracking-tight">{p.shortfallDays}</p>
          <p className="mt-1 text-sm">{p.shortfallDays ? 'days needing tankers or another source' : 'days: no gap expected'}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-muted">Borewell {BOREWELL.code} today</p>
          <p className="mt-1 font-display text-6xl leading-none tracking-tight">{p.current} m</p>
          <p className="mt-1 text-sm text-muted">below ground; safe limit {p.limit} m</p>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <WaterLevel value={buffer ? buffer.pct / 100 : 0} label={buffer ? `${buffer.pct}%` : '—'} sublabel={`${TANK.code}`} size={92} />
          <div>
            <p className="text-sm text-muted">Overhead tank buffer</p>
            {buffer ? (
              <p className="text-sm">
                <span className="font-display text-3xl">{buffer.kl} kL</span>
                <br />≈ {buffer.hours} h of village demand
              </p>
            ) : (
              <p className="text-sm text-muted">{dataSource === 'api' ? 'Waiting for the tank level sensor (start the simulator).' : 'Live level needs the backend.'}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Borewell level and projection" accent="water" className="xl:col-span-2">
          <DepthChart history={history} projection={p} />
          <p className="mt-2 text-xs text-muted">
            Solid: weekly readings (fictional). Dashed: projection with the choices on the right. Falls faster March–May. Village demand ≈ {demand.kl} kL/day ({demand.homes} homes × {PERSONS_PER_HOUSEHOLD} people × {LPCD} L, people per home is an assumption).
          </p>
        </Card>

        <Card title="What if we…" accent="evidence">
          <label className="block text-sm">
            <span className="flex justify-between">
              <span className="font-medium">Cut pumping by</span>
              <span className="text-muted">{Math.round(useCut * 100)}%</span>
            </span>
            <input type="range" min="0" max="0.3" step="0.05" value={useCut} onChange={(e) => setUseCut(Number(e.target.value))} className="mt-2 w-full accent-black" />
            <span className="text-xs text-muted">By fixing leaks and staggering supply, not by cutting below {LPCD} L per person.</span>
          </label>
          <label className="mt-5 flex items-start gap-3 text-sm">
            <input type="checkbox" checked={recharge} onChange={(e) => setRecharge(e.target.checked)} className="mt-1 accent-black" />
            <span>
              <span className="font-medium">Desilt the village tank</span>
              <span className="block text-xs text-muted">More water stays in the tank and seeps down to recharge the borewell (as in Mission Kakatiya).</span>
            </span>
          </label>
          <div className="mt-5 text-sm">
            <p className="mb-2 font-medium">Monsoon arrives</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Monsoon onset">
              {MONSOONS.map(([d, label]) => (
                <button key={d} type="button" role="radio" aria-checked={monsoon === d} onClick={() => setMonsoon(d)} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${monsoon === d ? 'border-black bg-black text-white' : 'border-black/10 hover:border-black/30'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Recommended actions" accent="task" className="mt-5">
        <ul className="flex flex-col gap-2 text-sm">
          {sourceActions(p).map((a) => (
            <li key={a} className="flex gap-2">
              <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-violet-500" />
              {a}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Real inputs would be a borewell level logger, rainfall from IMD and the State Ground Water Department's observation wells. Leak repairs show up here too: see{' '}
          <Link to="/gp/pipelines" className="font-semibold">
            Pipeline Health
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
