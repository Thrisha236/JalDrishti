import { Link } from 'react-router-dom';
import { dataSource, pipelinesFor, fmtDate } from '../../data/seed';
import { publicGet } from '../../data/api';
import { usePolling } from '../../data/telemetry';
import { Card, PageHeader, RiskChip, SimBadge } from '../../components/ui';

export default function Pipelines({ villageIds, base }) {
  // Backend scores (they can include live sensor trends) refresh every 10 s; offline uses the bundled scores.
  const { data: server } = usePolling(() => publicGet('/pipelines'), 10000, dataSource === 'api');
  const serverRisk = Object.fromEntries((server ?? []).map((r) => [r.asset.id, r.risk]));
  const rows = pipelinesFor(villageIds)
    .map((r) => ({ ...r, risk: serverRisk[r.asset.id] ?? r.risk }))
    .sort((a, b) => b.risk.score - a.risk.score);
  const multi = villageIds.length > 1;
  return (
    <div>
      <PageHeader title={multi ? 'High-risk pipelines' : 'Pipeline Health'} subtitle="Ranked by inspection priority. Scores are explainable; they are not failure probabilities.">
        <SimBadge />
      </PageHeader>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2 font-medium">Pipeline</th>
                {multi && <th className="pb-2 font-medium">Village</th>}
                <th className="pb-2 font-medium">Area</th>
                <th className="pb-2 font-medium">Material</th>
                <th className="pb-2 font-medium">Installed</th>
                <th className="pb-2 font-medium">Risk</th>
                <th className="pb-2 font-medium">Trend data</th>
                <th className="pb-2 font-medium">Missing data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.asset.id} className="border-t border-black/[0.06]">
                  <td className="py-3">
                    <Link to={`${base}/pipelines/${r.asset.id}`} className="font-semibold text-brand-600 hover:underline">
                      {r.asset.code}
                    </Link>
                    <span className="block text-xs text-muted">{r.asset.name}</span>
                  </td>
                  {multi && <td className="py-3">{r.village.name}</td>}
                  <td className="py-3">{r.area.name}</td>
                  <td className="py-3 capitalize">{r.profile.material.replace('_', ' ')}</td>
                  <td className="py-3">
                    {fmtDate(r.profile.install_date)}
                    {r.profile.install_date_source === 'estimate' && <span className="block text-xs text-amber-700">estimate</span>}
                  </td>
                  <td className="py-3">
                    <RiskChip risk={r.risk} />
                  </td>
                  <td className="py-3 text-muted">{r.risk.trend_basis === 'live' ? 'Live sensors' : r.risk.sources?.pressure_per_flow_trend === 'missing' ? '—' : 'Recorded'}</td>
                  <td className="py-3 text-muted">{r.risk.missing.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
