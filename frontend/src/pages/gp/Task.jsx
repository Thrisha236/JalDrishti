import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { S, storyCode } from '../../demo/steps';
import { areas, assets, dataSource, fmtTime, labelOf, reloadData, scripted, story, STORY_ASSET, users } from '../../data/seed';
import { QUALITY, useQualityTests, zoneQuality } from '../../data/quality';
import { apiFetch, publicGet } from '../../data/api';
import { usePolling } from '../../data/telemetry';
import { tailBand, verificationSeries, complaintDaySeries } from '../../data/series';
import { Card, Chip, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import { Ripple, WaterLevel } from '../../components/water';
import Icon from '../../components/Icon';
import LineChart from '../../components/LineChart';

/** Restored supply is not the same as safe water: show the zone's latest field test next to the verdict. */
function QualityLine() {
  const tests = useQualityTests();
  const zone = assets[STORY_ASSET]?.service_area_id;
  if (!zone) return null;
  const status = zoneQuality(zone, tests);
  return (
    <p className="mt-1 flex items-center gap-2 text-xs">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: QUALITY[status].color }} />
      Water quality in {areas[zone]?.name}: {QUALITY[status].label}.
      <Link to="/gp/quality" className="font-semibold">
        {status === 'safe' ? 'See tests' : 'Re-test before calling it safe'}
      </Link>
    </p>
  );
}

const FLOW = ['ASSIGNED', 'INSPECTING', 'REPAIRING', 'REPAIRED'];
const NEXT_LABEL = { INSPECTING: 'Start inspection', REPAIRING: 'Start repair', REPAIRED: 'Record repair done' };
const FAILURE_TYPES = ['leak', 'joint_failure', 'burst', 'blockage', 'valve_fault', 'pump_fault', 'other', 'no_fault_found'];

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

/** Offline demo: the scripted restoration check from the bundled seed. */
function RestorationCheck({ repaired }) {
  const { step, advanceTo, report } = useDemo();
  const ver = scripted.verification;
  const verified = step >= S.VERIFIED;
  const [w1, w2] = verificationSeries();
  const before = complaintDaySeries().slice(13);
  return (
    <Card title="Restoration check" className="lg:col-span-3" action={<SimBadge />}>
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
              <div className="mt-4 flex items-center gap-3 rounded-3xl border border-water-200 bg-gradient-to-b from-water-50 to-white p-5">
                <Ripple icon="shield" />
                <div>
                  <p className="font-display text-3xl tracking-tight">Verified Restored</p>
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

const WINDOW_LOOK = {
  PASSED: { cls: 'border-green-200 bg-green-50', label: 'passed' },
  FAILED: { cls: 'border-red-200 bg-red-50', label: 'failed' },
  INCONCLUSIVE: { cls: 'border-black/[0.08] bg-water-50', label: 'inconclusive' },
};
const CLOSED = ['VERIFIED_RESTORED', 'RESOLVED_UNVERIFIED'];

/** API mode: the restoration check judged by the backend from live tail readings (Stage 10). */
function LiveRestoration({ incidentCode, repaired }) {
  const { advanceTo, report } = useDemo();
  const { data, error } = usePolling(() => publicGet(`/incidents/${incidentCode}/verification`), 5000, repaired);
  const sensorBased = data?.method === 'sensor_window';
  const { data: tail } = usePolling(() => apiFetch('/readings?sensor_id=sen-tail-pressure&minutes=30', { role: 'gp' }), 5000, repaired && sensorBased);
  const [override, setOverride] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const ver = override && !(data && CLOSED.includes(data.result)) ? override : data;
  const result = ver?.result;

  useEffect(() => {
    if (CLOSED.includes(result)) advanceTo(S.VERIFIED);
  }, [result, advanceTo]);

  const resolve = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await apiFetch(`/incidents/${incidentCode}/resolve`, { role: 'gp', method: 'POST', json: true, body: JSON.stringify({ note: note.trim() }) });
      setOverride(saved);
    } catch (e) {
      setMessage(e.problems?.[0]?.msg ?? e.message);
    }
    setBusy(false);
  };

  const ok = (tail ?? []).filter((r) => r.quality_flag === 'ok');
  const before = ok.filter((r) => ver?.started_at && r.ts < ver.started_at).map((r) => r.value);
  const after = ok.filter((r) => ver?.started_at && r.ts >= ver.started_at).map((r) => r.value);
  const segments = [
    ...(before.length ? [{ label: 'Before repair', values: before, color: '#B91C1C' }] : []),
    ...(after.length ? [{ label: `After repair · ${after.length} readings`, values: after }] : []),
  ];
  const secondsLeft = ver?.current_window ? Math.max(0, Math.round((new Date(ver.current_window.end) - Date.now()) / 1000)) : null;

  return (
    <Card title="Restoration check" className="lg:col-span-3" action={<SimBadge>Live · simulated sensors</SimBadge>}>
      {!repaired ? (
        <p className="text-muted">Available after the repair is recorded. The incident closes only when readings recover.</p>
      ) : !ver ? (
        <p className="text-muted">{error ?? 'Loading…'}</p>
      ) : (
        <>
          <p className="mb-3 text-sm">
            <span className="font-semibold">Rule:</span> {ver.rule}.
          </p>
          {segments.length > 0 && <LineChart segments={segments} band={tailBand()} unit="bar" />}

          {ver.windows.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {ver.windows.map((w, i) => (
                <li key={w.start} className={`rounded-xl border p-3 text-sm ${WINDOW_LOOK[w.result]?.cls ?? ''}`}>
                  <span className="font-semibold">
                    Window {i + 1}: {WINDOW_LOOK[w.result]?.label ?? w.result}
                  </span>
                  <span className="block text-muted">
                    {fmtTime(w.start)} · {w.readings ?? 0} readings
                    {w.tail_pressure_mean_bar != null && ` · ${w.tail_pressure_mean_bar} bar`}
                    {w.tail_flow_mean_lpm != null && ` · ${w.tail_flow_mean_lpm} L/min`}
                  </span>
                  {w.reason && <span className="block text-xs text-muted">{w.reason}</span>}
                </li>
              ))}
            </ul>
          )}

          {result === 'VERIFIED_RESTORED' && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-water-200 bg-gradient-to-b from-water-50 to-white p-5">
              <Ripple icon="shield" />
              <div>
                <p className="font-display text-3xl tracking-tight">Verified Restored</p>
                <p className="text-sm text-muted">
                  {fmtTime(ver.verified_at)} · incident {incidentCode} closed · villager #{storyCode(report)} notified in the app
                </p>
                <p className="text-xs text-muted">Supply readings only. This is not a water-quality or safety certification.</p>
                <QualityLine />
              </div>
            </div>
          )}
          {result === 'RESOLVED_UNVERIFIED' && (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-lg font-bold text-amber-900">Resolved — not sensor-verified</p>
              <p className="text-sm text-amber-900">
                Closed by the Gram Panchayat on {fmtTime(ver.verified_at)}: “{ver.note}”
              </p>
            </div>
          )}
          {result === 'RESTORATION_UNCONFIRMED' && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              Readings have not recovered after the repair. The fault may still be there: re-inspect P-21. Checking continues; two windows in a row must pass.
            </p>
          )}

          {!CLOSED.includes(result) && (
            <>
              {sensorBased ? (
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <WaterLevel value={ver.passed_in_row / ver.required_windows} label={`${ver.passed_in_row}/${ver.required_windows}`} sublabel="windows" size={96} />
                  <Chip level="info">
                    Verifying · {ver.passed_in_row} of {ver.required_windows} windows passed in a row
                  </Chip>
                  {secondsLeft != null && <span className="text-sm text-muted">Current window ends in {secondsLeft} s</span>}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">No sensor covers this pipeline, so restoration cannot be sensor-verified.</p>
              )}
              {sensorBased && ver.window_seconds && (
                <p className="mt-2 text-xs text-muted">
                  Demo: supply is treated as always on, so each window is a {ver.window_seconds} s slot. Send normal readings with <code>python simulator\sim.py --scenario normal --interval 2</code>.
                </p>
              )}
              <details className="mt-4 rounded-2xl border border-black/[0.08] p-3" open={!sensorBased}>
                <summary className="cursor-pointer text-sm font-semibold">Close without sensor proof</summary>
                <p className="mt-2 text-xs text-muted">Recorded as “Resolved — not sensor-verified”, never as verified. Give the reason (for example, villagers confirmed supply).</p>
                <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} className="mt-2 w-full rounded-lg border border-black/15 p-2 text-sm" />
                <button type="button" onClick={resolve} disabled={busy || note.trim().length < 5} className="btn-outline mt-2 w-full">
                  Close as not sensor-verified
                </button>
                {message && <p className="mt-2 text-sm text-red-800">{message}</p>}
              </details>
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
              <div className="mt-4 flex flex-col gap-3 border-t border-black/[0.06] pt-4">
                <label className="block text-sm">
                  <span className="font-medium">Note (optional)</span>
                  <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} className="mt-1 min-h-11 w-full rounded-lg border border-black/15 px-3" />
                </label>
                {next === 'REPAIRED' && (
                  <label className="block text-sm">
                    <span className="font-medium">What was repaired</span>
                    <select value={failure} onChange={(e) => setFailure(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-black/15 bg-white px-3">
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
            {message && <p className="mt-3 rounded-lg bg-water-50 p-3 text-sm">{message}</p>}
          </Card>
        </div>
        <LiveRestoration incidentCode={task.incident_code} repaired={task.status === 'REPAIRED'} />
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
