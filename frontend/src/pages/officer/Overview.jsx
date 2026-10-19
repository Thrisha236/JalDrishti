import { Link } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { openIncidentCount, visibleComplaints } from '../../demo/steps';
import { currentIncidentCode, HOME_VILLAGE, pipelinesFor, seed } from '../../data/seed';
import { monthsBetween } from '@shared/risk.mjs';
import { Card, Chip, Kpi, PageHeader, RiskChip, SimBadge } from '../../components/ui';
import { WaterLevel } from '../../components/water';
import { StackBar } from '../../components/viz';
import { dataSource } from '../../data/seed';
import { PRIORITY_TONE, useConnectors, useFhtc, usePredictions } from '../../data/ai';

export default function Overview() {
  const { step } = useDemo();
  const villageIds = seed.villages.map((v) => v.id);
  const pipes = pipelinesFor(villageIds);
  const flagged = pipes.filter((p) => p.risk.band !== 'LOW');
  const open = openIncidentCount(step);
  const repeat = pipes
    .map((p) => ({ ...p, count: seed.repairs.filter((r) => r.asset_id === p.asset.id && monthsBetween(r.date, seed.meta.as_of) <= 36).length }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...repeat.map((r) => r.count));
  const api = dataSource === 'api';
  const { data: fhtc } = useFhtc('officer');
  const { data: predictions } = usePredictions('officer');
  const { data: connectors } = useConnectors('officer');

  return (
    <div>
      <PageHeader title="Block overview" subtitle="3 villages · demo block">
        <SimBadge />
      </PageHeader>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Villages" value={seed.villages.length} icon="building" />
        <Kpi label="Pipelines needing inspection" value={flagged.length} level={flagged.length ? 'warning' : 'normal'} icon="pipe" note="Medium or High risk" />
        <Kpi label="Open incidents" value={open} level={open ? 'problem' : 'normal'} icon="alert" />
        <Kpi label="Overdue tasks" value={0} level="normal" icon="wrench" />
      </div>

      {api && (fhtc || predictions || connectors) && (
        <div className="mb-5 grid gap-5 xl:grid-cols-3">
          {fhtc && (
            <Card title="Tap connections by village" accent="water" action={<Link to="/officer/taps" className="text-sm font-semibold text-brand-600">Open</Link>}>
              <p className="mb-4 font-display text-6xl leading-none tracking-tight">
                {fhtc.functional_pct}
                <span className="text-2xl text-muted">% functional</span>
              </p>
              <ul className="flex flex-col gap-3">
                {fhtc.villages.map((v) => (
                  <li key={v.village_id}>
                    <div className="mb-1 flex items-baseline gap-2 text-sm">
                      <span className="font-medium">{v.name}</span>
                      <span className="ml-auto tabular-nums text-muted">{v.functional}/{v.households}</span>
                    </div>
                    <StackBar functional={v.functional} partial={v.partial} nonFunctional={v.non_functional} height={10} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {predictions && (
            <Card title="AI: inspect these first" accent="evidence" action={<Link to="/officer/early-warning" className="text-sm font-semibold text-brand-600">Open</Link>}>
              <ul className="flex flex-col gap-3">
                {predictions.failures.slice(0, 4).map((f) => (
                  <li key={f.asset_id} className="flex items-center gap-3 text-sm">
                    <Chip level={PRIORITY_TONE[f.priority]}>{f.priority}</Chip>
                    <span className="flex-1">
                      <span className="font-medium">{f.asset_code}</span> <span className="text-muted">· risk {f.risk_score}</span>
                    </span>
                    <span className="text-xs text-muted">{f.timing === 'overdue' ? `${f.days_overdue} d overdue` : f.timing === 'unknown' ? 'little history' : f.timing === 'due_soon' ? 'due soon' : 'later'}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">From each pipe's own repair history and risk score.</p>
            </Card>
          )}
          {connectors && (
            <Card title="Connected platforms" accent="record" action={<Link to="/officer/integrations" className="text-sm font-semibold text-brand-600">Open</Link>}>
              <ul className="flex flex-col gap-2.5">
                {connectors.connectors.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.last_at ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="flex-1 font-medium">{c.name}</span>
                    <span className="text-xs text-muted">{c.messages} msgs</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">Sandbox connectors. No live government system is contacted.</p>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Villages">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2 font-medium">Village</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Complaints today</th>
              </tr>
            </thead>
            <tbody>
              {seed.villages.map((v) => {
                const isHome = v.id === HOME_VILLAGE;
                const incident = isHome && open > 0;
                return (
                  <tr key={v.id} className="border-t border-black/[0.06]">
                    <td className="py-3 font-semibold">{v.name}</td>
                    <td className="py-3">{incident ? <Chip level="problem">Incident {currentIncidentCode()}</Chip> : <Chip level="normal">Normal</Chip>}</td>
                    <td className="py-3">{isHome ? visibleComplaints(step).length : 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card title="Pipelines needing inspection" action={<Link to="/officer/pipelines" className="text-sm font-semibold text-brand-600">All</Link>}>
          <div className="mb-4 flex items-center gap-4">
            <WaterLevel value={(pipes.length - flagged.length) / pipes.length} label={`${pipes.length - flagged.length}/${pipes.length}`} sublabel="low risk" size={96} tone={flagged.length ? 'warning' : 'water'} />
            <p className="text-sm text-muted">Pipelines across the block in the low-risk band. The rest are ranked below for inspection.</p>
          </div>
          <ul className="flex flex-col gap-2">
            {flagged.map((p) => (
              <li key={p.asset.id} className="flex items-center justify-between gap-2">
                <Link to={`/officer/pipelines/${p.asset.id}`} className="font-semibold text-brand-600 hover:underline">
                  {p.asset.code} <span className="font-normal text-muted">· {p.village.name}</span>
                </Link>
                <RiskChip risk={p.risk} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Repeat failures (last 36 months)" className="lg:col-span-2">
          <ul className="flex flex-col gap-2">
            {repeat.map((p) => (
              <li key={p.asset.id} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0">
                  {p.asset.code} · {p.village.name}
                </span>
                <span className="h-3 flex-1 overflow-hidden rounded-full bg-water-50">
                  <span className="block h-3 rounded-full bg-gradient-to-r from-water-300 to-water-600" style={{ width: `${(p.count / maxCount) * 100}%` }} />
                </span>
                <span className="w-16 text-right tabular-nums">{p.count} repairs</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
