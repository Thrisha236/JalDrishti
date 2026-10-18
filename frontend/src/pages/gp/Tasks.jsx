import { Link } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { S } from '../../demo/steps';
import { dataSource, fmtTime, labelOf, story } from '../../data/seed';
import { apiFetch } from '../../data/api';
import { usePolling } from '../../data/telemetry';
import { Card, Chip, EmptyState, PageHeader } from '../../components/ui';

export default function Tasks() {
  const { step } = useDemo();
  const live = usePolling(() => apiFetch('/tasks', { role: 'gp' }), 10000, dataSource === 'api');
  const tasks =
    dataSource === 'api'
      ? live.data ?? []
      : step >= S.ASSIGNED
        ? [{ ...story.task, status: step >= S.REPAIRED ? 'REPAIRED' : 'ASSIGNED', assignee_name: 'Ravi (Technician, demo)' }]
        : [];

  return (
    <div>
      <PageHeader title="Maintenance" subtitle="Tasks created from incidents" />
      {tasks.length === 0 ? (
        <EmptyState icon="wrench" title="No maintenance tasks yet">Open an incident from the evidence, then create its task.</EmptyState>
      ) : (
        <Card>
          <ul className="flex flex-col divide-y divide-black/[0.06]">
            {tasks.map((t) => (
              <li key={t.code}>
                <Link to={`/gp/tasks/${t.code}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-water-50">
                  <span className="font-semibold text-brand-600">{t.code}</span>
                  <span className="text-muted">
                    {t.incident_code} · {t.assignee_name} · due {fmtTime(t.due_at)}
                  </span>
                  <Chip level={t.status === 'REPAIRED' ? 'normal' : 'info'} className="ml-auto">
                    {labelOf(t.status)}
                  </Chip>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
