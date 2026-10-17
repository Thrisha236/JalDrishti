import { Link } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { activeAlerts, areaStatus, openIncidentCount, S, visibleComplaints } from '../../demo/steps';
import { areasFor, HOME_VILLAGE, fmtTime, seed, story } from '../../data/seed';
import { complaintDaySeries, tailBand } from '../../data/series';
import { Card, Chip, Kpi, PageHeader, SimBadge } from '../../components/ui';
import LineChart from '../../components/LineChart';
import VillageMap from '../../components/VillageMap';

export default function Dashboard() {
  const { step } = useDemo();
  const complaints = visibleComplaints(step);
  const newComplaints = step === S.REPORTED ? complaints.length : 0;
  const zones = areasFor(HOME_VILLAGE);
  const affected = zones.filter((z) => areaStatus(step, z.id).level === 'problem').length;
  const alerts = activeAlerts(step);
  const series = complaintDaySeries();

  return (
    <div>
      <PageHeader title="Village Dashboard — Ramapuram" subtitle="Water service, alerts and maintenance at a glance">
        <SimBadge />
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open incidents" value={openIncidentCount(step)} level={openIncidentCount(step) ? 'problem' : 'normal'} icon="alert" />
        <Kpi label="New complaints" value={newComplaints} level={newComplaints ? 'warning' : 'normal'} icon="list" note={complaints.length ? `${complaints.length} today` : 'None today'} />
        <Kpi label="Tasks overdue" value={0} level="normal" icon="wrench" />
        <Kpi label="Zones affected" value={`${affected} of ${zones.length}`} level={affected ? 'warning' : 'normal'} icon="map" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card title="Alerts" action={<SimBadge />}>
            {alerts.length === 0 && <p className="text-muted">No active alerts. North Area was verified restored on {fmtTime(story.verification.verified_at)}.</p>}
            <ul className="flex flex-col gap-3">
              {alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 p-3">
                  <Chip level={a.severity === 'HIGH' ? 'problem' : 'warning'}>{a.severity}</Chip>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.text}</p>
                    <p className="text-sm text-muted">
                      {a.id} · P-21 · {fmtTime(a.raised_at)}
                    </p>
                  </div>
                  {a.id === 'AL-77' && step >= S.INCIDENT && (
                    <Link to="/gp/incidents/INC-0311" className="btn-outline min-h-10 px-3 text-sm">
                      Open INC-0311
                    </Link>
                  )}
                  {a.id === 'AL-77' && step === S.REPORTED && (
                    <Link to="/gp/complaints" className="btn-primary min-h-10 px-3 text-sm">
                      Review complaints
                    </Link>
                  )}
                  {a.id === 'AL-76' && (
                    <Link to="/gp/pipelines/ast-p21" className="btn-outline min-h-10 px-3 text-sm">
                      View P-21
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Tail pressure, North Area (Node B)" action={<SimBadge />}>
            <LineChart
              segments={[{ label: `06:00–08:00 · ${fmtTime(story.complaints[0].created_at).split(',')[0]}`, values: step >= S.REPORTED ? series : series.slice(0, 13) }]}
              band={tailBand}
              unit="bar"
              highlight={step >= S.REPORTED && step < S.VERIFIED ? 'Drop at 07:05 — 41% below baseline' : undefined}
            />
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card title="Network map" action={<Link to="/gp/map" className="text-sm font-semibold text-brand-600">Open</Link>}>
            <VillageMap step={step} />
          </Card>
          <Card title="Sensor health">
            <ul className="flex flex-col gap-2">
              {seed.sensor_nodes.map((n) => (
                <li key={n.id} className="flex items-center justify-between">
                  <span>
                    {n.code} · <span className="text-muted">{n.location}</span>
                  </span>
                  <Chip level="normal">Online</Chip>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">A node going offline raises an equipment alert, not a water-supply alert.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
