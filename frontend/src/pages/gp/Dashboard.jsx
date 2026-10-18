import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { activeAlerts, areaStatus, openIncidentCount, S, visibleComplaints } from '../../demo/steps';
import { areasFor, currentIncidentCode, dataSource, HOME_VILLAGE, fmtDate, fmtTime, scripted, seed, story } from '../../data/seed';
import { useLiveTelemetry, usePolling } from '../../data/telemetry';
import { apiFetch } from '../../data/api';
import LiveAlerts from '../../components/LiveAlerts';
import { complaintDaySeries, tailBand } from '../../data/series';
import { Card, Chip, Kpi, PageHeader, SimBadge } from '../../components/ui';
import LineChart from '../../components/LineChart';
import VillageMap from '../../components/VillageMap';
import { WaterLevel } from '../../components/water';
import { LPCD_TARGET, serviceScores, serviceSummary } from '../../data/service';
import { useQualityTests } from '../../data/quality';
import { projectBorewell } from '../../data/sources';

export default function Dashboard() {
  const { step } = useDemo();
  const complaints = visibleComplaints(step);
  const newComplaints = step === S.REPORTED ? complaints.length : 0;
  const zones = areasFor(HOME_VILLAGE);
  const affected = zones.filter((z) => areaStatus(step, z.id).level === 'problem').length;
  const alerts = activeAlerts(step);
  const series = complaintDaySeries();
  const { data: telemetry } = useLiveTelemetry({ withSeries: false });
  const liveNodes = telemetry?.live.nodes;
  const qualityTests = useQualityTests();
  const outlook = useMemo(() => projectBorewell(), []);
  const service = useMemo(() => serviceSummary(serviceScores(step, qualityTests)), [step, qualityTests]);
  const { data: suggestions } = usePolling(() => apiFetch('/incidents/suggestions', { role: 'gp' }), 10000, dataSource === 'api');

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
          {suggestions?.length > 0 && (
            <Card title="Suggested incidents" action={<SimBadge>Evidence fusion</SimBadge>}>
              <ul className="flex flex-col gap-3">
                {suggestions.map((s) => (
                  <li key={s.asset_id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/[0.08] p-3">
                    <Chip level={s.priority === 'HIGH' ? 'problem' : 'warning'}>{s.priority}</Chip>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {s.asset_code} · evidence score {s.evidence_score}
                      </p>
                      <p className="text-sm text-muted">{s.evidence.map((e) => e.type.toLowerCase()).join(' + ')} · {s.probable_cause}</p>
                    </div>
                    <Link to={`/gp/incidents/new?asset=${s.asset_id}`} className="btn-primary min-h-10 px-3 text-sm">
                      Review evidence
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">The system proposes; the Gram Panchayat decides whether to open an incident.</p>
            </Card>
          )}
          {telemetry && (
            <Card title="Live alerts (sensors)" action={<Link to="/gp/water" className="text-sm font-semibold text-brand-600">Water Status</Link>}>
              <LiveAlerts alerts={telemetry.alerts} compact />
            </Card>
          )}
          <Card title="Story alerts" action={<SimBadge>Scripted demo</SimBadge>}>
            {alerts.length === 0 && <p className="text-muted">No active alerts. North Area was verified restored on {fmtTime(scripted.verification.verified_at)}.</p>}
            <ul className="flex flex-col gap-3">
              {alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-3 rounded-2xl border border-black/[0.08] p-3">
                  <Chip level={a.severity === 'HIGH' ? 'problem' : 'warning'}>{a.severity}</Chip>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.text}</p>
                    <p className="text-sm text-muted">
                      {a.id} · P-21 · {fmtTime(a.raised_at)}
                    </p>
                  </div>
                  {a.id === 'AL-77' && step >= S.INCIDENT && (
                    <Link to={`/gp/incidents/${currentIncidentCode()}`} className="btn-outline min-h-10 px-3 text-sm">
                      Open {currentIncidentCode()}
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
              segments={[{ label: `06:00–08:00 · ${fmtDate(story.alerts[1].raised_at)}`, values: step >= S.REPORTED ? series : series.slice(0, 13) }]}
              band={tailBand()}
              unit="bar"
              highlight={step >= S.REPORTED && step < S.VERIFIED ? 'Drop at 07:05 — 41% below baseline' : undefined}
            />
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card title="Water Service Score" accent="water" action={<Link to="/gp/map?layer=service" className="text-sm font-semibold text-brand-600">See homes</Link>}>
            <div className="flex items-end gap-4">
              <p className="font-display text-6xl leading-none tracking-tight">{service.score}</p>
              <p className="pb-1 text-sm text-muted">out of 100 · quantity, regularity and quality, home by home</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <p>
                <span className="block font-display text-3xl leading-none">
                  {service.meeting}/{service.homes}
                </span>
                <span className="text-muted">homes at {LPCD_TARGET}+ L/person/day</span>
              </p>
              <p>
                <span className="block font-display text-3xl leading-none">{service.equity}</span>
                <span className="text-muted">equity index</span>
              </p>
            </div>
          </Card>
          <Card title="Source outlook" accent="water" action={<Link to="/gp/sources" className="text-sm font-semibold text-brand-600">Plan</Link>}>
            <div className="flex items-end gap-4">
              <p className="font-display text-6xl leading-none tracking-tight">{outlook.daysLeft}</p>
              <p className="pb-1 text-sm text-muted">
                {outlook.lastsToMonsoon ? 'days: borewell lasts until the monsoon' : `days of reliable supply, then a ${outlook.shortfallDays}-day gap before the monsoon`}
              </p>
            </div>
          </Card>
          <Card title="Supply across zones">
            <div className="flex items-center gap-5">
              <WaterLevel value={(zones.length - affected) / zones.length} label={`${zones.length - affected}/${zones.length}`} sublabel="zones normal" tone={affected ? 'warning' : 'water'} />
              <p className="text-sm text-muted">
                {affected ? `${affected} zone${affected > 1 ? 's have' : ' has'} a supply problem right now.` : 'Every zone has normal supply.'}
              </p>
            </div>
          </Card>
          <Card title="Network map" action={<Link to="/gp/map" className="text-sm font-semibold text-brand-600">Open</Link>}>
            <VillageMap step={step} />
          </Card>
          <Card title="Sensor health" action={dataSource === 'api' && <Link to="/gp/water" className="text-sm font-semibold text-brand-600">Live</Link>}>
            <ul className="flex flex-col gap-2">
              {seed.sensor_nodes.map((n) => {
                const status = liveNodes?.find((x) => x.id === n.id)?.status;
                return (
                  <li key={n.id} className="flex items-center justify-between">
                    <span>
                      {n.code} · <span className="text-muted">{n.location}</span>
                    </span>
                    {status ? (
                      <Chip level={status === 'online' ? 'normal' : 'neutral'}>{{ online: 'Online', offline: 'Offline', never_reported: 'No data yet' }[status]}</Chip>
                    ) : (
                      <Chip level="normal">Online (scripted)</Chip>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted">A node going offline raises an equipment alert, not a water-supply alert.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
