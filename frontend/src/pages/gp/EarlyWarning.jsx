import { Link } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { dataSource, fmtDate } from '../../data/seed';
import { LEVEL_LABEL, LEVEL_TONE, PRIORITY_TONE, fmtEta, usePredictions } from '../../data/ai';
import { Card, Chip, EmptyState, Kpi, PageHeader, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';
import { ChlorineMeter, FailureTrack, ForecastChart, Gauge } from '../../components/viz';

const SCENARIOS = [
  ['degrading', 'a slow leak starts: watch the forecast warn first'],
  ['leak', 'a leak: the anomaly model and the alerts both fire'],
  ['pump-off', 'the pump stops: every model goes red'],
  ['normal', 'everything normal'],
];

function NoData({ reason }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 p-5 text-sm text-muted">
      <p className="mb-3 font-medium text-ink">Waiting for sensor data</p>
      <p className="mb-3">{reason ?? 'Start the sensor simulator to see the models work:'}</p>
      <ul className="flex flex-col gap-1.5">
        {SCENARIOS.map(([s, what]) => (
          <li key={s} className="flex flex-wrap items-baseline gap-2">
            <code className="rounded bg-black/[0.06] px-2 py-0.5 text-xs text-ink">python simulator\sim.py --scenario {s} --interval 2</code>
            <span className="text-xs">{what}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnomalyCard({ a }) {
  const tone = a.status === 'anomaly' ? 'problem' : a.status === 'normal' ? 'normal' : 'neutral';
  const word = { anomaly: 'Unusual behaviour', normal: 'Behaving normally', insufficient_data: 'Not enough data' }[a.status];
  return (
    <Card title="Network behaviour" accent="evidence" action={<Chip level={tone}>{word}</Chip>}>
      {a.status === 'insufficient_data' ? (
        <NoData reason={a.reason} />
      ) : (
        <div className="grid items-center gap-6 md:grid-cols-2">
          <Gauge value={a.index} limit={a.limit_index} label="Anomaly index" sublabel="50 = edge of normal" />
          <div>
            {a.explanation.length ? (
              <ul className="flex flex-col gap-2">
                {a.explanation.map((line) => (
                  <li key={line} className="flex gap-2 text-sm">
                    <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Icon name="checkCircle" className="h-5 w-5 text-emerald-600" />
                All five signals match normal operation.
              </p>
            )}
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
              {a.features.slice(0, 4).map((f) => (
                <li key={f.key}>
                  {f.label}: <span className="text-ink">{f.value} {f.unit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">{a.model} · last {a.window_seconds / 60} min of trusted sensors</p>
    </Card>
  );
}

function ForecastCard({ f }) {
  const title = f.kind === 'pressure' ? 'Tail pressure forecast' : 'Tank level forecast';
  const level = { stable: ['normal', 'Stable'], watch: ['warning', 'Watch'], warning: ['problem', 'Breach soon'], breach: ['problem', 'Out of band'] }[f.level] ?? ['neutral', '—'];
  return (
    <Card title={title} accent="water" action={f.status === 'ok' && <Chip level={level[0]}>{level[1]}</Chip>}>
      {f.status !== 'ok' ? (
        <p className="text-sm text-muted">{f.reason}</p>
      ) : (
        <>
          <ForecastChart forecast={f} height={f.kind === 'pressure' ? 180 : 130} />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {f.minutes_to_breach != null && (
              <span className="font-display text-3xl leading-none tracking-tight">
                {fmtEta(f.minutes_to_breach).replace('about ', '')}
                <span className="ml-2 text-sm font-sans text-muted">to breach</span>
              </span>
            )}
            <span className="text-muted">{f.message ?? 'No change expected: the trend is flat.'}</span>
          </div>
          <p className="mt-2 text-xs text-muted">Confidence {f.confidence} · {f.readings} readings · fit R² {f.r2}</p>
        </>
      )}
    </Card>
  );
}

function QualityCard({ q, canLog }) {
  return (
    <Card title="Water-quality outlook" accent="verify" action={<Chip level={LEVEL_TONE[q.level]}>{LEVEL_LABEL[q.level]}</Chip>}>
      <p className="text-sm text-muted">
        Tail of {q.asset_code} · {q.basis === 'measured' ? 'measured' : 'predicted'} free chlorine <span className="text-ink">{q.predicted_residual_mg_l} mg/L</span>{q.basis === 'measured' && <span> (model expects {q.model_residual_mg_l})</span>}
      </p>
      <div className="mt-1 mb-4">
        <ChlorineMeter value={q.predicted_residual_mg_l} />
      </div>
      <dl className="mb-4 grid grid-cols-3 gap-3 text-center">
        {[
          ['Water age', `${q.water_age_hours} h`],
          ['Tail pressure', `${q.tail_pressure_bar} bar`],
          ['Tail flow', `${q.tail_flow_lpm} L/min`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-black/[0.04] p-3">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-display text-2xl leading-none tracking-tight">{v}</dd>
          </div>
        ))}
      </dl>
      {q.reasons.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5 text-sm">
          {q.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              {r}
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-start gap-2 rounded-2xl border border-black/10 p-3 text-sm">
        <Icon name="flask" className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
        <span>
          {q.action} {canLog && <Link to="/gp/quality" className="font-medium underline">Log a field test</Link>}
        </span>
      </p>
      <p className="mt-3 text-xs text-muted">
        Source: {q.data_source}. {q.basis === 'measured' ? 'Read by the residual-chlorine probe at the tail end; the decay model is kept as a cross-check.' : `Assumes ${q.assumptions.chlorine_dose_mg_l} mg/L dosed at the tank and ${q.assumptions.decay_per_hour}/h decay`}{q.assumptions.diameter_assumed && q.basis !== 'measured' ? ', and a 100 mm pipe (diameter not recorded)' : ''}. An indicator of where to test, never a safety certificate.
      </p>
    </Card>
  );
}

const PATTERN = {
  steady: ['normal', 'Steady'],
  intermittent: ['problem', 'Intermittent'],
  off: ['problem', 'No water'],
  unsteady: ['warning', 'Unsteady'],
};

function RegularityCard({ r }) {
  const [tone, label] = PATTERN[r.pattern] ?? ['neutral', 'Not enough data'];
  return (
    <Card title="Supply regularity" accent="water" action={<Chip level={r.status === 'ok' ? tone : 'neutral'}>{r.status === 'ok' ? label : 'Waiting for data'}</Chip>}>
      {r.status !== 'ok' ? (
        <p className="text-sm text-muted">{r.reason}</p>
      ) : (
        <>
          <div className="flex items-end gap-4">
            <span className="font-display text-6xl leading-none tracking-tight">{r.on_pct}<span className="text-2xl text-muted">%</span></span>
            <span className="pb-1 text-sm text-muted">of the last {r.window_minutes} minutes of supply hours had water at the tail end</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/[0.06]" role="img" aria-label={`Water present ${r.on_pct}% of the time`}>
            <div className={`h-full rounded-full ${r.pattern === 'steady' ? 'bg-emerald-500' : r.pattern === 'intermittent' ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${r.on_pct}%`, transition: 'width 0.6s ease' }} />
          </div>
          <p className="mt-3 text-sm">{r.message}</p>
          <p className="mt-2 text-xs text-muted">{r.transitions} switches between water and no water · {r.readings} readings · {r.model}</p>
        </>
      )}
    </Card>
  );
}

function ClustersCard({ rows, base }) {
  return (
    <Card title="Clusters of villager reports" accent="people" action={<Chip level="warning">{rows.length} found</Chip>}>
      <ul className="flex flex-col gap-3">
        {rows.map((c) => (
          <li key={c.id} className="rounded-2xl border border-black/[0.08] p-3 text-sm">
            <p className="font-medium">
              {c.size} reports near <Link to={`${base}/${c.asset_id}`} className="underline">{c.asset_code}</Link>
              <span className="font-normal text-muted"> · within {Math.max(c.radius_m, 1)} m · {Object.entries(c.categories).map(([k, n]) => `${n} ${k.replaceAll('_', ' ').toLowerCase()}`).join(', ')}</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              Reports {c.complaint_codes.map((x) => `#${x}`).join(', ')}.{c.coarse ? ' Shared at zone level, so the cluster shows the zone.' : ' Geo-tagged to about 25 m.'} Several reports along one pipeline point to a network fault, not separate household problems.
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">DBSCAN: at least 3 reports within 120 m in the last 24 hours.</p>
    </Card>
  );
}

function FailureCard({ rows, asOf, base }) {
  return (
    <Card title="Infrastructure failure outlook" accent="risk" action={<SimBadge>As of {fmtDate(asOf)}</SimBadge>}>
      <ul className="flex flex-col divide-y divide-black/[0.06]">
        {rows.slice(0, 6).map((r) => (
          <li key={r.asset_id} className="py-3 first:pt-0 last:pb-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link to={`${base}/${r.asset_id}`} className="font-medium hover:underline">{r.asset_code}</Link>
              <Chip level={PRIORITY_TONE[r.priority]}>{r.priority}</Chip>
              <span className="text-xs text-muted">risk {r.risk_score}/100</span>
              <span className="ml-auto text-xs text-muted">
                {r.timing === 'overdue' && `${r.days_overdue} days past the expected window`}
                {r.timing === 'due_soon' && 'inside the expected window soon'}
                {r.timing === 'later' && 'next failure not expected yet'}
                {r.timing === 'unknown' && 'too little history'}
              </span>
            </div>
            <FailureTrack lastFailure={r.last_failure} window={r.window} asOf={asOf} />
            <p className="mt-1.5 text-xs text-muted">
              {r.mtbf_days ? `Fails about every ${r.mtbf_days} days · last ${fmtDate(r.last_failure)} · inspect within ${r.inspect_within_days} days` : r.basis}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Black bar = today. Shaded = when the next failure is expected, from each pipe's own repair history. A ranking, not a probability.</p>
    </Card>
  );
}

function ModelCards({ models }) {
  return (
    <details className="card p-6">
      <summary className="section-title cursor-pointer">How these models work</summary>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {models.map((m) => (
          <div key={m.id} className="rounded-2xl border border-black/[0.08] p-4 text-sm">
            <p className="font-medium">{m.name} <span className="font-normal text-muted">· {m.method}</span></p>
            <dl className="mt-2 grid gap-1 text-muted">
              <div><dt className="inline text-ink">Looks at: </dt><dd className="inline">{m.inputs}</dd></div>
              <div><dt className="inline text-ink">Produces: </dt><dd className="inline">{m.output}</dd></div>
              <div><dt className="inline text-ink">Trained on: </dt><dd className="inline">{m.training}</dd></div>
              <div><dt className="inline text-ink">Limits: </dt><dd className="inline">{m.limits}</dd></div>
            </dl>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function EarlyWarning() {
  const { role } = useDemo();
  const { data: p, error } = usePredictions(role);

  if (dataSource !== 'api') {
    return (
      <div>
        <PageHeader title="AI Early Warning — before villagers notice" />
        <EmptyState icon="alert" title="The backend is not running">The AI models run on the server. Start it, then reload this page.</EmptyState>
      </div>
    );
  }

  const pressure = p?.forecasts.find((f) => f.kind === 'pressure');
  const tank = p?.forecasts.find((f) => f.kind === 'tank_level');
  const quality = p?.quality[0];
  const failuresHigh = p?.failures.filter((f) => f.priority === 'HIGH').length ?? 0;

  return (
    <div>
      <PageHeader title="AI Early Warning — before villagers notice" subtitle="Four small models read the live sensors and the repair records, and say what is about to go wrong.">
        <SimBadge>Demo sensor feed</SimBadge>
      </PageHeader>
      {error && !p && <p className="mb-4 text-sm text-rose-700">{error}</p>}
      {!p ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Need attention" value={p.attention_count} level={p.attention_count ? 'problem' : 'normal'} icon="alert" note="across the four models" />
            <Kpi label="Anomaly index" value={p.anomaly.index ?? '—'} level={p.anomaly.status === 'anomaly' ? 'problem' : p.anomaly.status === 'normal' ? 'normal' : 'neutral'} icon="sensor" note="50 = edge of normal" />
            <Kpi
              label="Pressure forecast"
              value={pressure?.minutes_to_breach != null ? fmtEta(pressure.minutes_to_breach).replace('about ', '') : pressure?.level === 'breach' ? 'Out' : '—'}
              level={pressure?.level === 'warning' || pressure?.level === 'breach' ? 'problem' : pressure?.level === 'watch' ? 'warning' : 'normal'}
              icon="gauge"
              note={pressure?.level === 'breach' ? 'already out of band' : 'to leave normal band'}
            />
            <Kpi label="Chlorine at tail" value={quality ? `${quality.predicted_residual_mg_l}` : '—'} level={quality ? LEVEL_TONE[quality.level] : 'neutral'} icon="flask" note={quality ? `mg/L ${quality.basis === 'measured' ? 'measured' : 'predicted'} · ${LEVEL_LABEL[quality.level]}` : 'no data'} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <AnomalyCard a={p.anomaly} />
            {pressure && <ForecastCard f={pressure} />}
            {quality && <QualityCard q={quality} canLog={role === 'gp'} />}
            {p.regularity && <RegularityCard r={p.regularity} />}
            {p.clusters?.length > 0 && <ClustersCard rows={p.clusters} base={role === 'officer' ? '/officer/pipelines' : '/gp/pipelines'} />}
            <div className="flex flex-col gap-5">
              <FailureCard rows={p.failures} asOf={p.as_of} base={role === 'officer' ? '/officer/pipelines' : '/gp/pipelines'} />
              {tank && <ForecastCard f={tank} />}
            </div>
          </div>
          <div className="mt-5">
            <ModelCards models={p.models} />
          </div>
          <p className="mt-4 text-xs text-muted">{p.note} {failuresHigh} pipeline{failuresHigh === 1 ? '' : 's'} flagged HIGH for inspection.</p>
        </>
      )}
    </div>
  );
}
