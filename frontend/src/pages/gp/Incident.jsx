import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { incidentStatus, S } from '../../demo/steps';
import { areas, assets, dataSource, fmtTime, labelOf, reloadData, story, STORY_ASSET, seed } from '../../data/seed';
import { apiFetch, publicGet } from '../../data/api';
import { usePolling } from '../../data/telemetry';
import { Card, Chip, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import VillageMap from '../../components/VillageMap';

const TYPE_LABEL = { ALERT: 'Sensor alert', COMPLAINTS: 'Villager reports', RISK: 'Pipeline risk', IMAGE: 'Photo observation' };
const PRIORITY_LEVEL = { HIGH: 'problem', MEDIUM: 'warning', LOW: 'neutral' };

/** The explainable part of an incident: every piece of evidence, its weight, and what is still unknown. */
function EvidencePanel({ data, heading = 'Why this priority' }) {
  return (
    <>
      <Card title={heading}>
        {data.evidence.length === 0 && <p className="text-muted">No current evidence.</p>}
        <ol className="flex flex-col gap-4">
          {data.evidence.map((e, i) => (
            <li key={e.type} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
              <div className="flex-1">
                <p className="font-semibold">{e.text}</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded bg-water-50">
                    <div className="h-2 rounded bg-brand-600" style={{ width: `${Math.min(100, (e.contribution / 0.35) * 100)}%` }} />
                  </div>
                  <span className="w-12 text-right text-sm tabular-nums text-muted">{e.contribution.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted">
                  {TYPE_LABEL[e.type] ?? labelOf(e.type)}
                  {Array.isArray(e.ref) && ` · ${e.ref.join(', ')}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-black/[0.06] pt-3 text-sm">
          <span className="font-semibold">Evidence score {data.evidence_score}</span>{' '}
          <span className="text-muted">— {data.evidence_score_note}. HIGH needs at least 0.6 and two independent kinds of evidence.</span>
        </p>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Probable cause">
          <p>{data.probable_cause}</p>
          <p className="mt-2 text-sm text-muted">Sensor health: {data.sensor_health}{data.sensor_health === 'OK' ? ' — readings are trusted, not a sensor fault.' : ''}</p>
        </Card>
        <Card title="Missing data and caveats">
          {data.uncertainties.length ? (
            <ul className="list-inside list-disc text-sm">
              {data.uncertainties.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">None recorded.</p>
          )}
          <p className="mt-2 text-sm">
            Affected: <span className="font-semibold">≈ {data.affected_households.estimate} households</span> <span className="text-muted">({data.affected_households.basis})</span>
          </p>
        </Card>
      </div>
    </>
  );
}

function Header({ code, data, status }) {
  return (
    <PageHeader title={code ? `Incident ${code}` : `Evidence for ${assets[data.asset_id].code}`} subtitle={`${assets[data.asset_id].code} · ${areas[data.service_area_id].name}${data.opened_at ? ` · opened ${fmtTime(data.opened_at)}` : ''}`}>
      <div className="flex items-center gap-2">
        <Chip level={PRIORITY_LEVEL[data.priority]}>Priority {data.priority}</Chip>
        {status && <Chip level={status === 'VERIFIED_RESTORED' ? 'normal' : 'info'}>{labelOf(status)}</Chip>}
        <SimBadge>{dataSource === 'api' ? 'Live evidence · demo sensor feed' : 'Demo data'}</SimBadge>
      </div>
    </PageHeader>
  );
}

/** API mode, before an incident exists: preview the fused evidence and let the GP decide. */
function AssessPreview() {
  const [params] = useSearchParams();
  const assetId = params.get('asset') ?? STORY_ASSET;
  const navigate = useNavigate();
  const { advanceTo } = useDemo();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch('/incidents/assess', { role: 'gp', method: 'POST', json: true, body: JSON.stringify({ asset_id: assetId }) })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [assetId]);

  const open = async () => {
    setBusy(true);
    try {
      const inc = await apiFetch('/incidents', { role: 'gp', method: 'POST', json: true, body: JSON.stringify({ asset_id: assetId }) });
      await reloadData();
      advanceTo(S.INCIDENT);
      navigate(`/gp/incidents/${inc.code}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (error) return <EmptyState icon="alert" title="Cannot open an incident">{error}</EmptyState>;
  if (!data) return <p className="text-muted">Combining the evidence…</p>;
  if (data.open_incident) {
    return (
      <EmptyState title={`Incident ${data.open_incident} is already open for this pipeline`}>
        <Link to={`/gp/incidents/${data.open_incident}`} className="font-semibold text-brand-600">Open it</Link>
      </EmptyState>
    );
  }
  return (
    <div>
      <Header data={data} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <EvidencePanel data={data} heading="Combined evidence (not yet an incident)" />
        </div>
        <div className="flex flex-col gap-5">
          <Card title="Decision">
            <p className="mb-3 text-sm text-muted">The system proposes; the Gram Panchayat decides. Opening the incident groups {data.complaint_codes.length} report(s) under it.</p>
            <button type="button" onClick={open} disabled={busy || data.priority === 'LOW'} className="btn-primary w-full">
              Open incident
            </button>
            {data.priority === 'LOW' && <p className="mt-2 text-sm text-muted">Evidence is too weak to open an incident. Keep monitoring.</p>}
          </Card>
          <Card title="Location">
            <VillageMap step={S.REPORTED} selected={assetId} />
          </Card>
        </div>
      </div>
    </div>
  );
}

const TECHNICIANS = () => seed.users.filter((u) => u.role === 'technician');

/** API mode: a live incident, and the button that creates its maintenance task. */
function LiveIncident({ code }) {
  const { advanceTo, step } = useDemo();
  const navigate = useNavigate();
  const { data, error } = usePolling(() => publicGet(`/incidents/${code}`), 10000);
  const [assignee, setAssignee] = useState(TECHNICIANS()[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [taskError, setTaskError] = useState(null);

  if (error && !data) return <EmptyState icon="alert" title={`Incident ${code}`}>{error}</EmptyState>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const createTask = async () => {
    setBusy(true);
    try {
      const task = await apiFetch('/tasks', { role: 'gp', method: 'POST', json: true, body: JSON.stringify({ incident_code: code, assignee_id: assignee }) });
      await reloadData();
      advanceTo(S.ASSIGNED);
      navigate(`/gp/tasks/${task.code}`);
    } catch (e) {
      setTaskError(e.message);
      setBusy(false);
    }
  };

  const status = step >= S.VERIFIED ? 'VERIFIED_RESTORED' : data.status;
  return (
    <div>
      <Header code={code} data={data} status={status} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <EvidencePanel data={data} heading={`Why this is ${data.priority} priority`} />
        </div>
        <div className="flex flex-col gap-5">
          <Card title="Action">
            {data.task_code ? (
              <Link to={`/gp/tasks/${data.task_code}`} className="btn-outline w-full">
                Open task {data.task_code}
              </Link>
            ) : (
              <>
                <label className="mb-3 block text-sm">
                  <span className="font-medium">Assign to</span>
                  <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-black/15 bg-white px-3">
                    {TECHNICIANS().map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={createTask} disabled={busy || !assignee} className="btn-primary w-full">
                  Create maintenance task
                </button>
                {taskError && <p className="mt-2 text-sm text-red-700">{taskError}</p>}
              </>
            )}
            <p className="mt-3 text-sm text-muted">Reports grouped: #{data.complaint_codes.join(', #')}</p>
            <Link to={`/gp/pipelines/${data.asset_id}`} className="mt-2 block text-center text-sm font-semibold text-brand-600">
              View {assets[data.asset_id].code} health record
            </Link>
          </Card>
          <Card title="Location">
            <VillageMap step={step} selected={data.asset_id} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Offline demo: the scripted incident from the bundled seed. */
function ScriptedIncident() {
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
  return (
    <div>
      <Header code={inc.code} data={inc} status={status} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <EvidencePanel data={inc} heading="Why this is high priority" />
        </div>
        <div className="flex flex-col gap-5">
          <Card title="Action">
            {step === S.INCIDENT ? (
              <button type="button" onClick={() => { advanceTo(S.ASSIGNED); navigate('/gp/tasks/T-118'); }} className="btn-primary w-full">
                Create maintenance task
              </button>
            ) : (
              <Link to="/gp/tasks/T-118" className="btn-outline w-full">
                Open task T-118
              </Link>
            )}
          </Card>
          <Card title="Location">
            <VillageMap step={step} selected={inc.asset_id} />
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Incident() {
  const { code } = useParams();
  if (dataSource !== 'api') return <ScriptedIncident />;
  return code === 'new' ? <AssessPreview /> : <LiveIncident code={code} />;
}
