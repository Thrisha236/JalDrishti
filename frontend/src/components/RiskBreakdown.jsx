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
  record: 'bg-green-100 text-green-800',
  inspection: 'bg-green-100 text-green-800',
  'live sensor': 'bg-sky-100 text-sky-800',
  estimate: 'bg-amber-100 text-amber-800',
  'inspection (stale)': 'bg-amber-100 text-amber-800',
  'assumption table': 'bg-slate-200 text-slate-700',
  missing: 'bg-red-100 text-red-800',
  'not applicable': 'bg-slate-100 text-slate-500',
};

function SourceBadge({ source }) {
  if (!source) return null;
  return <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] font-semibold ${SOURCE_STYLE[source] ?? 'bg-slate-100'}`}>{source}</span>;
}

function Comparison({ risk }) {
  const c = risk.comparison;
  if (!c) return null;
  const delta = c.live ? c.live.score - c.recorded.score : null;
  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-3 text-sm">
      <p className="mb-2 font-semibold">Recorded trend vs live sensors</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className={`rounded-lg p-2 ${risk.trend_basis === 'record' ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-slate-50'}`}>
          <p className="text-xs uppercase tracking-wide text-muted">With recorded trend {risk.trend_basis === 'record' && '· in use'}</p>
          <p className="text-lg font-bold">
            {c.recorded.score} · {c.recorded.band}
          </p>
          <p className="text-xs text-muted">{c.recorded.trend_detail} → {c.recorded.trend_points} pts</p>
        </div>
        <div className={`rounded-lg p-2 ${risk.trend_basis === 'live' ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-slate-50'}`}>
          <p className="text-xs uppercase tracking-wide text-muted">With live sensors {risk.trend_basis === 'live' && '· in use'}</p>
          {c.live ? (
            <>
              <p className="text-lg font-bold">
                {c.live.score} · {c.live.band}
                <span className={`ml-2 text-sm ${delta > 0 ? 'text-red-700' : delta < 0 ? 'text-green-700' : 'text-muted'}`}>
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
        <span className="text-4xl font-bold">{risk.score}</span>
        <span className="text-muted">/ 100</span>
        <RiskChip risk={risk} />
        <span className="font-semibold">{risk.label}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="pb-2 font-medium">Factor</th>
            <th className="pb-2 font-medium">Evidence and source</th>
            <th className="pb-2 text-right font-medium">Points</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(risk.factors).map(([k, v]) => (
            <tr key={k} className="border-t border-slate-100 align-top">
              <td className="py-2 pr-3 font-medium">{NAMES[k]}</td>
              <td className="py-2 pr-3 text-muted">
                {risk.details[k]}
                <SourceBadge source={risk.sources?.[k]} />
                <div className="mt-1 h-1.5 w-full max-w-48 rounded bg-slate-100">
                  <div className="h-1.5 rounded bg-brand-600" style={{ width: `${(v / risk.max[k]) * 100}%` }} />
                </div>
              </td>
              <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums">
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
