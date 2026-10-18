import { RiskChip } from './ui';
import { seed } from '../data/seed';

const NAMES = {
  age: 'Age',
  prior_failures: 'Prior failures',
  corrosion_observation: 'Corrosion observation',
  pressure_per_flow_trend: 'Pressure-per-flow trend',
  material_susceptibility: 'Material susceptibility',
};

// How much each kind of source can be trusted, shown next to every factor.
const SOURCE_STYLE = {
  record: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100',
  inspection: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
  'live sensor': 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100',
  estimate: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
  'inspection (stale)': 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
  'assumption table': 'bg-stone-100 text-stone-600 ring-1 ring-stone-200',
  missing: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
  'not applicable': 'bg-white text-muted ring-1 ring-black/10',
};

function SourceBadge({ source }) {
  if (!source) return null;
  return <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${SOURCE_STYLE[source] ?? 'bg-water-50'}`}>{source}</span>;
}

function Comparison({ risk }) {
  const c = risk.comparison;
  if (!c) return null;
  const delta = c.live ? c.live.score - c.recorded.score : null;
  return (
    <div className="mt-4 rounded-2xl border border-black/[0.08] p-3 text-sm">
      <p className="mb-2 font-semibold">Recorded trend vs live sensors</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className={`rounded-xl p-3 ${risk.trend_basis === 'record' ? 'bg-indigo-50 ring-2 ring-indigo-400' : 'bg-water-50'}`}>
          <p className="text-xs uppercase tracking-wide text-muted">With recorded trend {risk.trend_basis === 'record' && '· in use'}</p>
          <p className="text-lg font-bold">
            {c.recorded.score} · {c.recorded.band}
          </p>
          <p className="text-xs text-muted">{c.recorded.trend_detail} → {c.recorded.trend_points} pts</p>
        </div>
        <div className={`rounded-xl p-3 ${risk.trend_basis === 'live' ? 'bg-cyan-50 ring-2 ring-cyan-500' : 'bg-water-50'}`}>
          <p className="text-xs uppercase tracking-wide text-muted">With live sensors {risk.trend_basis === 'live' && '· in use'}</p>
          {c.live ? (
            <>
              <p className="text-lg font-bold">
                {c.live.score} · {c.live.band}
                <span className={`ml-2 text-sm ${delta > 0 ? 'text-rose-700' : delta < 0 ? 'text-emerald-700' : 'text-muted'}`}>
                  ({delta > 0 ? '+' : ''}
                  {delta})
                </span>
              </p>
              <p className="text-xs text-muted">{c.live.trend_detail} → {c.live.trend_points} pts</p>
            </>
          ) : (
            <p className="text-xs text-muted">Not available: {c.live_unavailable_reason}</p>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Live sensors are used when there are enough trusted readings in the last hour; otherwise the recorded 14-day trend is used.</p>
    </div>
  );
}

function WhatIf({ items }) {
  if (!items?.length) return null;
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="mb-1 font-semibold">Uncertain inputs: what would change</p>
      <ul className="list-inside list-disc">
        {items.map((w) => (
          <li key={w.factor + w.if}>
            If {w.if}: {NAMES[w.factor]} → {w.points} pts, score {w.score}
            {w.band ? ` (${w.band})` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RiskBreakdown({ risk }) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="font-display text-6xl leading-none tracking-tight">{risk.score}</span>
        <span className="text-muted">/ 100</span>
        <RiskChip risk={risk} />
        <span className="font-semibold">{risk.label}</span>
      </div>
      <table className="w-full text-[0.95rem]">
        <thead>
          <tr className="text-left text-muted">
            <th className="pb-2 font-medium">Factor</th>
            <th className="pb-2 font-medium">Evidence and source</th>
            <th className="pb-2 text-right font-medium">Points</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(risk.factors).map(([k, v]) => (
            <tr key={k} className="border-t border-black/[0.06] align-top">
              <td className="py-3 pr-3 font-medium">{NAMES[k]}</td>
              <td className="py-3 pr-3 text-muted">
                {risk.details[k]}
                <SourceBadge source={risk.sources?.[k]} />
                <div className="mt-2 h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-amber-50">
                  <div className="h-1.5 rounded-full bg-gradient-to-r from-amber-300 to-rose-500" style={{ width: `${(v / risk.max[k]) * 100}%` }} />
                </div>
              </td>
              <td className="whitespace-nowrap py-3 text-right font-semibold tabular-nums">
                {v} / {risk.max[k]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {risk.missing.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Missing data: {risk.missing.join(', ')}. Those factors score 0 until data exists.</p>
      )}
      <Comparison risk={risk} />
      <WhatIf items={risk.what_if} />
      <p className="mt-3 text-xs text-muted">
        {seed.risk_config.statement} Rules: {risk.config_version ?? seed.risk_config.version}; material weights are an assumption to validate.
      </p>
    </div>
  );
}
