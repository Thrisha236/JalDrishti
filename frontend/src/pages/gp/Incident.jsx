import { Link, useNavigate } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { incidentStatus, S } from '../../demo/steps';
import { areas, assets, fmtTime, labelOf, story } from '../../data/seed';
import { Card, Chip, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import VillageMap from '../../components/VillageMap';

export default function Incident() {
  const { step, advanceTo } = useDemo();
  const navigate = useNavigate();
  const inc = story.incident;
  const status = incidentStatus(step);

  if (!status) {
    return (
      <div>
        <PageHeader title="Incident INC-0311" />
        <EmptyState title="No incident yet">An incident opens once complaints are linked to an asset with supporting sensor evidence.</EmptyState>
      </div>
    );
  }

  const createTask = () => {
    advanceTo(S.ASSIGNED);
    navigate('/gp/tasks/T-118');
  };

  return (
    <div>
      <PageHeader title={`Incident ${inc.code}`} subtitle={`${assets[inc.asset_id].code} · ${areas[inc.service_area_id].name} · opened ${fmtTime(inc.opened_at)}`}>
        <div className="flex items-center gap-2">
          <Chip level="problem">Priority {inc.priority}</Chip>
          <Chip level={status === 'VERIFIED_RESTORED' ? 'normal' : 'info'}>{labelOf(status)}</Chip>
          <SimBadge />
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card title="Why this is high priority">
            <ol className="flex flex-col gap-4">
              {inc.evidence.map((e, i) => (
                <li key={e.type} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-semibold">{e.text}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-2 flex-1 rounded bg-slate-100">
                        <div className="h-2 rounded bg-brand-600" style={{ width: `${(e.contribution / 0.35) * 100}%` }} />
                      </div>
                      <span className="w-12 text-right text-sm tabular-nums text-muted">{e.contribution.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted">
                      {labelOf(e.type)}
                      {e.type === 'IMAGE' && ' · simulated'}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-slate-100 pt-3 text-sm">
              <span className="font-semibold">Evidence score {inc.evidence_score}</span> <span className="text-muted">— {inc.evidence_score_note}. HIGH requires at least two independent evidence types.</span>
            </p>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Probable cause">
              <p>{inc.probable_cause}</p>
              <p className="mt-2 text-sm text-muted">Sensor health: {inc.sensor_health} — readings are trusted, not a sensor fault.</p>
            </Card>
            <Card title="Missing data">
              <ul className="list-inside list-disc text-sm">
                {inc.uncertainties.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm">
                Affected: <span className="font-semibold">≈ {inc.affected_households.estimate} households</span> <span className="text-muted">({inc.affected_households.basis})</span>
              </p>
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Card title="Action">
            {step === S.INCIDENT ? (
              <button type="button" onClick={createTask} className="btn-primary w-full">
                Create maintenance task
              </button>
            ) : (
              <Link to="/gp/tasks/T-118" className="btn-outline w-full">
                Open task T-118
              </Link>
            )}
            <Link to="/gp/pipelines/ast-p21" className="mt-3 block text-center text-sm font-semibold text-brand-600">
              View P-21 health record
            </Link>
          </Card>
          <Card title="Location">
            <VillageMap step={step} selected={inc.asset_id} />
          </Card>
        </div>
      </div>
    </div>
  );
}
