import { useDemo } from '../../demo/DemoContext';
import { S } from '../../demo/steps';
import { fmtTime, labelOf, story, users } from '../../data/seed';
import { tailBand, verificationSeries, complaintDaySeries } from '../../data/series';
import { Card, Chip, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';
import LineChart from '../../components/LineChart';

export default function Task() {
  const { step, advanceTo } = useDemo();
  const task = story.task;
  const ver = story.verification;

  if (step < S.ASSIGNED) {
    return (
      <div>
        <PageHeader title="Maintenance" />
        <EmptyState icon="wrench" title="No open maintenance tasks">Tasks are created from an incident by the Gram Panchayat.</EmptyState>
      </div>
    );
  }

  const repaired = step >= S.REPAIRED;
  const verified = step >= S.VERIFIED;
  const updates = repaired ? task.updates : task.updates.slice(0, 1);
  const [w1, w2] = verificationSeries();
  const before = complaintDaySeries().slice(13);

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
            <p className="mt-1 text-sm text-muted">Contact details are not shown in the prototype.</p>
          </Card>
          <Card title="Progress">
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
            {!repaired && (
              <button type="button" onClick={() => advanceTo(S.REPAIRED)} className="btn-primary mt-4 w-full">
                Record inspection and repair
              </button>
            )}
          </Card>
        </div>

        <Card title="Restoration check" className="lg:col-span-3" action={<SimBadge />}>
          {!repaired ? (
            <p className="text-muted">Available after the repair is recorded. The incident closes only when readings recover.</p>
          ) : (
            <>
              <p className="mb-3 text-sm">
                <span className="font-semibold">Rule:</span> {ver.rule}.
              </p>
              <LineChart
                segments={[
                  { label: 'Before repair', values: before, color: '#B91C1C' },
                  ...(verified
                    ? [
                        { label: 'Window 1', values: w1 },
                        { label: 'Window 2', values: w2 },
                      ]
                    : []),
                ]}
                band={tailBand}
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
                        {fmtTime(ver.verified_at)} · complaint #2048 closed and villager notified
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
                </>
              )}
            </>
          )}
          {repaired && !verified && <Chip level="info" className="mt-3">Verifying</Chip>}
        </Card>
      </div>
    </div>
  );
}
