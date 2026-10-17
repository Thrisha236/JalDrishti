import { RiskChip } from './ui';
import { seed } from '../data/seed';

const NAMES = {
  age: 'Age',
  prior_failures: 'Prior failures',
  corrosion_observation: 'Corrosion observation',
  pressure_per_flow_trend: 'Pressure-per-flow trend',
  material_susceptibility: 'Material susceptibility',
};

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
            <th className="pb-2 font-medium">Evidence</th>
            <th className="pb-2 text-right font-medium">Points</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(risk.factors).map(([k, v]) => (
            <tr key={k} className="border-t border-slate-100 align-top">
              <td className="py-2 pr-3 font-medium">{NAMES[k]}</td>
              <td className="py-2 pr-3 text-muted">
                {risk.details[k]}
                <div className="mt-1 h-1.5 w-full max-w-48 rounded bg-slate-100">
                  <div className="h-1.5 rounded bg-brand-600" style={{ width: `${(v / risk.max[k]) * 100}%` }} />
                </div>
              </td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {v} / {risk.max[k]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {risk.missing.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Missing data: {risk.missing.join(', ')}. Those factors score 0 until data exists.</p>
      )}
      <p className="mt-3 text-xs text-muted">
        {seed.risk_config.statement} Rules: {seed.risk_config.version}; material weights are an assumption to validate.
      </p>
    </div>
  );
}
