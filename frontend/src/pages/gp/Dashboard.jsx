import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { activeAlerts, areaStatus, openIncidentCount, S, visibleComplaints } from '../../demo/steps';
import { areasFor, currentIncidentCode, dataSource, HOME_VILLAGE, fmtDate, fmtTime, scripted, seed, story } from '../../data/seed';
import { useLiveTelemetry, usePolling } from '../../data/telemetry';
import { apiFetch } from '../../data/api';
import { fmtEta, LEVEL_LABEL, LEVEL_TONE, useConnectors, useFhtc, usePredictions } from '../../data/ai';
import LiveAlerts from '../../components/LiveAlerts';
import { complaintDaySeries, tailBand } from '../../data/series';
import { Card, Chip, Kpi, PageHeader, SimBadge } from '../../components/ui';
import LineChart from '../../components/LineChart';
import VillageMap from '../../components/VillageMap';
import { WaterLevel } from '../../components/water';
import { Donut, Gauge } from '../../components/viz';
import Icon from '../../components/Icon';
import { LPCD_TARGET, serviceScores, serviceSummary } from '../../data/service';
import { useQualityTests } from '../../data/quality';
import { projectBorewell } from '../../data/sources';

/** The AI models at a glance: one gauge and three short answers. */
function AiGlance({ p }) {
  const pressure = p.forecasts.find((f) => f.kind === 'pressure');
  const quality = p.quality[0];
  const high = p.failures.filter((f) => f.priority === 'HIGH').length;
  const tiles = [
    {
      icon: 'gauge', label: 'Tail pressure',
      value: pressure?.minutes_to_breach != null ? fmtEta(pressure.minutes_to_breach).replace('about ', '') : pressure?.level === 'breach' ? 'Out of band' : 'Stable',
      tone: pressure?.level === 'warning' || pressure?.level === 'breach' ? 'problem' : pressure?.level === 'watch' ? 'warning' : 'normal',
      note: pressure?.minutes_to_breach != null ? 'until it leaves the band' : pressure?.level === 'breach' ? 'now' : 'no change expected',
    },
    { icon: 'flask', label: 'Chlorine at tail', value: quality ? `${quality.predicted_residual_mg_l} mg/L` : '—', tone: quality ? LEVEL_TONE[quality.level] : 'neutral', note: quality ? LEVEL_LABEL[quality.level] : 'no data' },
    { icon: 'pipe', label: 'Pipes to inspect', value: high, tone: high ? 'warning' : 'normal', note: 'flagged HIGH' },
  ];
  const ring = { problem: 'border-rose-200 bg-rose-50 text-rose-700', warning: 'border-amber-200 bg-amber-50 text-amber-700', normal: 'border-emerald-200 bg-emerald-50 text-emerald-700', neutral: 'border-black/10 bg-white text-muted' };
  return (
    <Card title="AI early warning" accent="evidence" action={<Link to="/gp/early-warning" className="text-sm font-semibold text-brand-600">Open</Link>}>
      <div className="grid items-center gap-6 sm:grid-cols-[200px_1fr]">
        <Gauge value={p.anomaly.index} limit={50} label="Anomaly index" sublabel={p.anomaly.status === 'anomaly' ? 'unusual behaviour' : p.anomaly.status === 'normal' ? 'normal behaviour' : 'waiting for data'} />
        <ul className="grid gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <li key={t.label} className="rounded-2xl border border-black/[0.08] p-3">
              <span className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full border ${ring[t.tone]}`}>
                <Icon name={t.icon} className="h-4 w-4" />
              </span>
              <p className="text-xs text-muted">{t.label}</p>
              <p className="font-display text-3xl leading-none tracking-tight">{t.value}</p>
              <p className="mt-1 text-xs text-muted">{t.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function TapsGlance({ f }) {
  return (
    <Card title="Tap connections" accent="water" action={<Link to="/gp/taps" className="text-sm font-semibold text-brand-600">Open</Link>}>
      <div className="flex items-center gap-5">
        <Donut functional={f.functional} partial={f.partial} nonFunctional={f.non_functional} size={130} centre={`${f.functional_pct}%`} caption="functional" />
        <ul className="flex flex-col gap-1.5 text-sm">
          <li><b className="font-display text-2xl">{f.functional}</b> <span className="text-muted">working</span></li>
          <li><b className="font-display text-2xl">{f.partial}</b> <span className="text-muted">partly</span></li>
          <li><b className="font-display text-2xl">{f.non_functional}</b> <span className="text-muted">not working</span></li>
        </ul>
      </div>
    </Card>
  );
}

function PlatformsGlance({ data }) {
  return (
    <Card title="Connected platforms" accent="record" action={<Link to="/gp/integrations" className="text-sm font-semibold text-brand-600">Open</Link>}>
      <ul className="flex flex-col gap-2.5">
        {data.connectors.map((c) => (
          <li key={c.id} className="flex items-center gap-3 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.last_at && Date.now() - new Date(c.last_at).getTime() < 120000 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="flex-1 font-medium">{c.name}</span>
            <span className="text-xs text-muted">{c.direction === 'PULL' ? 'pull' : 'push'} · {c.messages} msgs</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Sandbox connectors. No live government system is contacted.</p>
    </Card>
  );
}

export default function Dashboard() {
  const { step } = useDemo();
  const api = dataSource === 'api';
  const complaints = visibleComplaints(step);
  const newComplaints = step === S.REPORTED ? complaints.length : 0;
  const zones = areasFor(HOME_VILLAGE);
  const affected = zones.filter((z) => areaStatus(step, z.id).level === 'problem').length;
  const alerts = activeAlerts(step);
  const series = complaintDaySeries();
  const { data: telemetry } = useLiveTelemetry({ withSeries: api });
  const liveNodes = telemetry?.live.nodes;
  const qualityTests = useQualityTests();
  const outlook = useMemo(() => projectBorewell(), []);
  const service = useMemo(() => serviceSummary(serviceScores(step, qualityTests)), [step, qualityTests]);
  const { data: suggestions } = usePolling(() => apiFetch('/incidents/suggestions', { role: 'gp' }), 10000, api);
  const { data: predictions } = usePredictions('gp');
  const { data: fhtc } = useFhtc('gp');
  const { data: connectors } = useConnectors('gp');
  const tail = telemetry?.series?.['sen-tail-pressure']?.filter((r) => r.quality_flag === 'ok').map((r) => r.value) ?? [];
  const liveAlerts = telemetry?.alerts.filter((a) => a.kind === 'WATER_SERVICE').length ?? 0;
  const tapLevel = fhtc ? (fhtc.functional_pct >= 95 ? 'normal' : fhtc.functional_pct >= 80 ? 'warning' : 'problem') : 'neutral';

  return (
    <div>
      <PageHeader title="Village Dashboard — Ramapuram" subtitle="Water service, alerts and maintenance at a glance">
        <SimBadge />
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open incidents" value={openIncidentCount(step)} level={openIncidentCount(step) ? 'problem' : 'normal'} icon="alert" />
        {api && fhtc ? (
          <Kpi label="Functional taps" value={`${fhtc.functional_pct}%`} level={tapLevel} icon="tap" note={`${fhtc.functional} of ${fhtc.households} homes`} />
        ) : (
          <Kpi label="New complaints" value={newComplaints} level={newComplaints ? 'warning' : 'normal'} icon="list" note={complaints.length ? `${complaints.length} today` : 'None today'} />
        )}
        {api && predictions ? (
          <Kpi label="AI warnings" value={predictions.attention_count} level={predictions.attention_count ? 'warning' : 'normal'} icon="spark" note="from the 4 models" />
        ) : (
          <Kpi label="Tasks overdue" value={0} level="normal" icon="wrench" />
        )}
        {api && telemetry ? (
          <Kpi label="Live alerts" value={liveAlerts} level={liveAlerts ? 'problem' : 'normal'} icon="sensor" note="from the sensors" />
        ) : (
          <Kpi label="Zones affected" value={`${affected} of ${zones.length}`} level={affected ? 'warning' : 'normal'} icon="map" />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          {api && predictions && <AiGlance p={predictions} />}
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
            </Card>
          )}
          {telemetry && (
            <Card title="Live alerts (sensors)" action={<span className="flex gap-3 text-sm font-semibold text-brand-600"><Link to="/gp/alerts">Alert Center</Link><Link to="/gp/water">Water Status</Link></span>}>
              <LiveAlerts alerts={telemetry.alerts} compact />
            </Card>
          )}
          {api ? (
            <Card title="Tail pressure, North Area (live)" action={<SimBadge />}>
              {tail.length > 1 ? (
                <LineChart segments={[{ label: 'last 10 minutes', values: tail }]} band={tailBand()} unit="bar" />
              ) : (
                <p className="text-sm text-muted">Waiting for readings. Start the sensor simulator.</p>
              )}
            </Card>
          ) : (
            <>
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
            </>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {api && fhtc && <TapsGlance f={fhtc} />}
          {api && connectors && <PlatformsGlance data={connectors} />}
          <Card title="Water Service Score" accent="water" action={<Link to="/gp/map?layer=service" className="text-sm font-semibold text-brand-600">See homes</Link>}>
            <div className="flex items-end gap-4">
              <p className="font-display text-6xl leading-none tracking-tight">{service.score}</p>
              <p className="pb-1 text-sm text-muted">out of 100</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <p>
                <span className="block font-display text-3xl leading-none">
                  {service.meeting}/{service.homes}
                </span>
                <span className="text-muted">homes at {LPCD_TARGET}+ L/day</span>
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
              <p className="pb-1 text-sm text-muted">{outlook.lastsToMonsoon ? 'days: lasts to the monsoon' : `days, then a ${outlook.shortfallDays}-day gap`}</p>
            </div>
          </Card>
          <Card title="Supply across zones">
            <div className="flex items-center gap-5">
              <WaterLevel value={(zones.length - affected) / zones.length} label={`${zones.length - affected}/${zones.length}`} sublabel="zones normal" tone={affected ? 'warning' : 'water'} />
              <p className="text-sm text-muted">{affected ? `${affected} zone${affected > 1 ? 's have' : ' has'} a supply problem.` : 'Every zone has normal supply.'}</p>
            </div>
          </Card>
          <Card title="Network map" action={<Link to="/gp/map" className="text-sm font-semibold text-brand-600">Open</Link>}>
            <VillageMap step={step} />
          </Card>
          <Card title="Sensor health" action={api && <Link to="/gp/water" className="text-sm font-semibold text-brand-600">Live</Link>}>
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
          </Card>
        </div>
      </div>
    </div>
  );
}
