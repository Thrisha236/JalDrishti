import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { S, storyCode } from '../../demo/steps';
import { dataSource, fmtTime, labelOf, reloadData, scripted, story, users } from '../../data/seed';
import { apiFetch, publicGet } from '../../data/api';
import { usePolling } from '../../data/telemetry';
import { tailBand, verificationSeries, complaintDaySeries } from '../../data/series';
import { Card, Chip, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';
import LineChart from '../../components/LineChart';

const FLOW = ['ASSIGNED', 'INSPECTING', 'REPAIRING', 'REPAIRED'];
const NEXT_LABEL = { INSPECTING: 'Start inspection', REPAIRING: 'Start repair', REPAIRED: 'Record repair done' };
const FAILURE_TYPES = ['leak', 'joint_failure', 'burst', 'blockage', 'valve_fault', 'pump_fault', 'other'];

function Progress({ updates }) {
  return (
    <ol className="flex flex-col gap-3">
      {updates.map((u) => (
        <li key={u.status} className="flex gap-3">
          <Icon name="checkCircle" className="h-6 w-6 shrink-0 text-green-600" />
          <span>
            <span className="block font-semibold">{labelOf(u.status)}</span>
            <span className="block text-sm text-muted">{fmtTime(u.at)}</span>
            {u.note && <span className="block text-sm">{u.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Restoration check. Still the scripted story in every mode; it becomes live in Stage 10. */
function RestorationCheck({ repaired }) {
  const { step, advanceTo, report } = useDemo();
  const ver = scripted.verification;
  const verified = step >= S.VERIFIED;
  const [w1, w2] = verificationSeries();
  const before = complaintDaySeries().slice(13);
  return (
    <Card title="Restoration check" className="lg:col-span-3" action={<SimBadge>{dataSource === 'api' ? 'Scripted until Stage 10' : 'Simulated data'}</SimBadge>}>
      {!repaired ? (
        <p className="text-muted">Available after the repair is recorded. The incident closes only when readings recover.</p>
      ) : (
        <>
          <p className="mb-3 text-sm">
            <span className="font-semibold">Rule:</span> {ver.rule}.
          </p>
          <LineChart
            segments={[{ label: 'Before repair', values: before, color: '#B91C1C' }, ...(verified ? [{ label: 'Window 1', values: w1 }, { label: 'Window 2', values: w2 }] : [])]}
            band={tailBand()}
            unit="bar"
          />
          {verified ? (
            <>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {ver.windows.map((w, i) => (
                  <li key={w.start} className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm">
                    <span className="font-semibold">Window {i + 1}: passed</span>
                    <span className="block text-muted">
                      {fmtTime(w.start)} · mean {w.tail_pressure_mean_bar} bar
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-green-300 bg-gradient-to-b from-green-50 to-white p-4">
                <Icon name="shield" className="h-10 w-10 text-green-700" />
                <div>
                  <p className="text-xl font-bold text-green-800">Verified Restored</p>
                  <p className="text-sm text-muted">
                    {fmtTime(ver.verified_at)} · complaint #{storyCode(report)} closed and villager notified
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted">Waiting for 2 scheduled supply windows after the repair. If no sensor covered this pipe, the result would be “Resolved — not sensor-verified”.</p>
              <button type="button" onClick={() => advanceTo(S.VERIFIED)} className="btn-primary mt-3 w-full">
                Run restoration check on both windows
              </button>
              <Chip level="info" className="mt-3">Verifying</Chip>
            </>
          )}
        </>
      )}
    </Card>
  );
}

/** API mode: the real task, moved forward one step at a time. */
function LiveTask({ code }) {
  const { advanceTo } = useDemo();
  const { data, error } = usePolling(() => publicGet(`/tasks/${code}`), 5000);
  const [override, setOverride] = useState(null); // latest response after an update, until the next poll
  const [note, setNote] = useState('');
  const [failure, setFailure] = useState('leak');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const task = override && (!data || override.updates.length >= data.updates.length) ? override : data;

  if (error && !task) return <EmptyState icon="alert" title={`Task ${code}`}>{error}</EmptyState>;
  if (!task) return <p className="text-muted">Loading…</p>;

  const next = FLOW[FLOW.indexOf(task.status) + 1];
  const step = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const body = { status: next, ...(note.trim() ? { note: note.trim() } : {}), ...(next === 'REPAIRED' ? { failure_type: failure } : {}) };
      const saved = await apiFetch(`/tasks/${code}/updates`, { role: 'gp', method: 'POST', json: true, body: JSON.stringify(body) });
      setOverride(saved);
      setNote('');
      if (next === 'REPAIRED') {
        await reloadData();
        advanceTo(S.REPAIRED);
        setMessage('Repair recorded. It is now part of the pipeline’s history and risk score.');
      }
    } catch (e) {
      setMessage(e.message);
    }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title={`Task ${task.code} — Inspect and repair`} subtitle={`From incident ${task.incident_code} · due ${fmtTime(task.due_at)}`}>
        <SimBadge>Live task</SimBadge>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card title="Assignment">
            <p className="flex items-center gap-2">
              <Icon name="user" className="h-5 w-5 text-brand-600" />
              <span className="font-semibold">{task.assignee_name}</span>
            </p>
            <p className="mt-1 text-sm text-muted">Contact details are not shown in the prototype.</p>
          </Card>
          <Card title="Progress">
            <Progress updates={task.updates} />
            {next && (
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
                <label className="block text-sm">
                  <span className="font-medium">Note (optional)</span>
                  <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" />
                </label>
                {next === 'REPAIRED' && (
                  <label className="block text-sm">
                    <span className="font-medium">What was repaired</span>
                    <select value={failure} onChange={(e) => setFailure(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
                      {FAILURE_TYPES.map((f) => (
                        <option key={f} value={f}>
                          {labelOf(f)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button type="button" onClick={step} disabled={busy} className="btn-primary w-full">
                  {NEXT_LABEL[next]}
                </button>
              </div>
            )}
            {message && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{message}</p>}
          </Card>
        </div>
        <RestorationCheck repaired={task.status === 'REPAIRED'} />
      </div>
    </div>
  );
}

/** Offline demo: the scripted task from the bundled seed. */
function ScriptedTask() {
  const { step, advanceTo } = useDemo();
  const task = story.task;
  if (step < S.ASSIGNED) {
    return (
      <div>
        <PageHeader title="Maintenance" />
        <EmptyState icon="wrench" title="No open maintenance tasks">Tasks are created from an incident by the Gram Panchayat.</EmptyState>
      </div>
    );
  }
  const repaired = step >= S.REPAIRED;
  return (
    <div>
      <PageHeader title={`Task ${task.code} — Inspect and repair P-21`} subtitle={`From incident ${task.incident_code} · due ${fmtTime(task.due_at)}`}>
        <SimBadge />
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card title="Assignment">
            <p className="flex items-center gap-2">
              <Icon name="user" className="h-5 w-5 text-brand-600" />
              <span className="font-semibold">{users[task.assignee_id].display_name}</span>
            </p>
          </Card>
          <Card title="Progress">
            <Progress updates={repaired ? task.updates : task.updates.slice(0, 1)} />
            {!repaired && (
              <button type="button" onClick={() => advanceTo(S.REPAIRED)} className="btn-primary mt-4 w-full">
                Record inspection and repair
              </button>
            )}
          </Card>
        </div>
        <RestorationCheck repaired={repaired} />
      </div>
    </div>
  );
}

export default function Task() {
  const { code } = useParams();
  return dataSource === 'api' ? <LiveTask code={code} /> : <ScriptedTask />;
}
