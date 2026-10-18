import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { apiFetch } from '../../data/api';
import { dataSource, fmtDate } from '../../data/seed';
import { PRIORITY_TONE } from '../../data/ai';
import { usePolling } from '../../data/telemetry';
import { Card, Chip, EmptyState, Kpi, PageHeader, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';

const REASON_ICON = { RISK: 'pipe', FAILURE_WINDOW: 'clock', LIVE: 'sensor', REPEAT: 'wrench', INSPECTION_AGE: 'list', PLANNED: 'check' };
const BAR = { HIGH: 'bg-rose-500', MEDIUM: 'bg-amber-400', LOW: 'bg-emerald-400' };

function PlanForm({ item, technicians, onDone }) {
  const [tech, setTech] = useState(technicians[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch('/maintenance/preventive', { role: 'gp', method: 'POST', json: true, body: JSON.stringify({ asset_id: item.asset_id, assignee_id: tech, ...(note.trim() ? { note: note.trim() } : {}) }) });
      onDone(r);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-black/10 bg-white/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-muted">Assign to</span>
          <select value={tech} onChange={(e) => setTech(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-black/15 bg-white px-3">
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-muted">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} className="mt-1 min-h-11 w-full rounded-xl border border-black/15 bg-white px-3" />
        </label>
      </div>
      <p className="text-xs text-muted">Due in {item.inspect_within_days} days. This opens a preventive incident from the reasons above and its task in one step. No failure has occurred, so it does not count as one.</p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={go} disabled={busy || !tech} className="btn-primary min-h-11 px-5">
          Create inspection task
        </button>
        {error && <span className="text-sm text-rose-700" role="alert">{error}</span>}
      </div>
    </div>
  );
}

function Row({ item, role, technicians, onChange }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(null);
  const base = role === 'officer' ? '/officer' : '/gp';
  const taskCode = created?.task.code ?? item.open_task;
  return (
    <li className="rounded-2xl border border-black/[0.08] bg-white/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-4xl leading-none tracking-tight">{item.score}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`${base}/pipelines/${item.asset_id}`} className="font-semibold hover:underline">
              {item.asset_code}
            </Link>
            <Chip level={PRIORITY_TONE[item.band]}>{item.band}</Chip>
            <span className="text-xs text-muted">
              {item.zone} · {item.households} homes{item.sujal_gaon_id ? ` · ${item.sujal_gaon_id}` : ''}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/[0.06]" role="img" aria-label={`Planning score ${item.score} of 100`}>
            <div className={`h-full rounded-full ${BAR[item.band]}`} style={{ width: `${item.score}%`, transition: 'width 0.6s ease' }} />
          </div>
        </div>
        {taskCode ? (
          <Link to={`${base}/tasks/${taskCode}`} className="btn-outline min-h-10 px-4 text-sm">
            In progress: {taskCode}
          </Link>
        ) : (
          role === 'gp' && (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn-primary min-h-10 px-4 text-sm">
              Plan inspection
            </button>
          )
        )}
      </div>
      <p className="mt-3 text-sm font-medium">{item.action}</p>
      {item.reasons.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {item.reasons.map((r) => (
            <li key={r.type} className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.05] px-3 py-1 text-xs">
              <Icon name={REASON_ICON[r.type] ?? 'check'} className="h-3.5 w-3.5" />
              {r.text}
              <b className="ml-1">+{r.points}</b>
            </li>
          ))}
        </ul>
      )}
      {created && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Planned: {created.incident.code} and {created.task.code}, assigned to {created.task.assignee_name}.</p>}
      {open && !taskCode && (
        <PlanForm item={item} technicians={technicians} onDone={(r) => { setCreated(r); setOpen(false); onChange(); }} />
      )}
    </li>
  );
}

export default function Planner() {
  const { role } = useDemo();
  const [key, setKey] = useState(0);
  const { data } = usePolling(() => apiFetch('/maintenance/priorities', { role }), 15000, dataSource === 'api', key);

  if (dataSource !== 'api') {
    return (
      <div>
        <PageHeader title="Maintenance Planner — what to inspect first" />
        <EmptyState icon="wrench" title="The backend is not running">The planner ranks pipelines on the server from risk, repair history and live signals. Start it, then reload.</EmptyState>
      </div>
    );
  }
  if (!data) return <p className="text-muted">Loading…</p>;

  const high = data.items.filter((i) => i.band === 'HIGH').length;
  const inProgress = data.items.filter((i) => i.open_task).length;
  return (
    <div>
      <PageHeader title="Maintenance Planner — what to inspect first" subtitle="Pipelines ranked for preventive attention, so inspections happen before failures do.">
        <SimBadge>As of {fmtDate(data.as_of)}</SimBadge>
      </PageHeader>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Pipelines ranked" value={data.items.length} icon="pipe" />
        <Kpi label="Inspect first" value={high} level={high ? 'problem' : 'normal'} icon="alert" note="planning score 50 or more" />
        <Kpi label="Already in progress" value={inProgress} icon="wrench" />
      </div>
      <Card title="Ranked for inspection" accent="risk">
        <ul className="flex flex-col gap-3">
          {data.items.map((i) => (
            <Row key={i.asset_id} item={i} role={role} technicians={data.technicians} onChange={() => setKey((k) => k + 1)} />
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          {data.note} The score adds risk ({data.weights.risk}%), the repeat-failure window ({data.weights.failure_window}%), live signals ({data.weights.live_signals}%), recent incidents ({data.weights.repeat_incidents}%) and time since the last inspection ({data.weights.inspection_age}%).
        </p>
      </Card>
    </div>
  );
}
