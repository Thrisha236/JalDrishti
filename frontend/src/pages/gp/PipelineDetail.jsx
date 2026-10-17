import { Link, useParams } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { areas, assets, fmtDate, inspectionsFor, labelOf, repairsFor, riskFor, seed, villages } from '../../data/seed';
import { Card, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import RiskBreakdown from '../../components/RiskBreakdown';

export default function PipelineDetail() {
  const { assetId } = useParams();
  const { role } = useDemo();
  const asset = assets[assetId];
  const profile = seed.pipeline_profiles.find((p) => p.asset_id === assetId);
  if (!asset || !profile) return <EmptyState title="Pipeline not found" />;

  const risk = riskFor(assetId);
  const area = areas[asset.service_area_id];
  const rows = [
    ['Material', labelOf(profile.material), profile.material_source],
    ['Installed', fmtDate(profile.install_date), profile.install_date_source],
    ['Diameter', profile.diameter_mm ? `${profile.diameter_mm} mm` : 'Unknown', profile.diameter_mm ? 'record' : 'not recorded'],
    ['Length', `${profile.length_m} m`, 'record'],
    ['Pressure-per-flow trend', profile.pressure_per_flow_drop_pct == null ? 'No sensor' : `${profile.pressure_per_flow_drop_pct}% below baseline`, profile.trend_source],
  ];

  return (
    <div>
      <Link to={`/${role}/pipelines`} className="mb-2 inline-block text-sm font-semibold text-brand-600">
        ← All pipelines
      </Link>
      <PageHeader title={`Pipeline ${asset.code} — ${area.name}`} subtitle={`${asset.name} · ${villages[area.village_id].name}`}>
        <SimBadge />
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card title="Inspection priority" className="lg:col-span-3">
          <RiskBreakdown risk={risk} />
        </Card>
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card title="Profile">
            <dl className="flex flex-col gap-2 text-sm">
              {rows.map(([k, v, src]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">
                    <span className="font-semibold">{v}</span>
                    <span className="block text-xs text-muted">source: {src}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="History">
            <ul className="flex flex-col gap-2 text-sm">
              {[...repairsFor(assetId).map((r) => ({ d: r.date, t: `Repair: ${labelOf(r.failure_type)}`, n: r.notes })), ...inspectionsFor(assetId).map((i) => ({ d: i.date, t: `Inspection (${i.method}): corrosion ${i.corrosion_grade}/100`, n: i.notes }))]
                .sort((a, b) => b.d.localeCompare(a.d))
                .map((h) => (
                  <li key={h.d + h.t} className="border-b border-slate-100 pb-2">
                    <span className="font-semibold">{fmtDate(h.d)}</span> · {h.t}
                    <span className="block text-muted">{h.n}</span>
                  </li>
                ))}
            </ul>
          </Card>
          <p className="text-xs text-muted">A photo or rust score alone cannot show buried pipe condition. Material and installation date come from records or inspection, never from images.</p>
        </div>
      </div>
    </div>
  );
}
