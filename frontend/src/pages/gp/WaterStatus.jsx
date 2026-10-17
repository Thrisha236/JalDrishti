import { dataSource, fmtTime } from '../../data/seed';
import { CHART_SENSORS, POLL_MS, useLiveTelemetry } from '../../data/telemetry';
import { Card, Chip, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import LineChart from '../../components/LineChart';

const NAMES = {
  'sen-tail-pressure': 'Tail pressure · P-21 end',
  'sen-tail-flow': 'Tail flow · P-21 end',
  'sen-head-pressure': 'Head pressure · tank outlet',
  'sen-head-flow': 'Head flow · tank outlet',
  'sen-pump-current': 'Pump current',
  'sen-tank-level': 'Tank level',
};

const NODE_LEVEL = { online: 'normal', offline: 'neutral', never_reported: 'neutral' };
const NODE_TEXT = { online: 'Online', offline: 'Offline', never_reported: 'No data yet' };

function value(v, unit) {
  return v == null ? '—' : `${v.toFixed(unit === 'bar' ? 2 : 1)} ${unit}`;
}

function SensorCard({ sensor, readings }) {
  const latest = sensor.latest;
  const [lo, hi] = sensor.normal_band;
  const outOfBand = latest && (latest.value < lo || latest.value > hi);
  const offline = sensor.node_status !== 'online';
  const level = offline ? 'neutral' : latest?.quality_flag !== 'ok' ? 'warning' : outOfBand ? 'problem' : 'normal';
  const label = offline ? 'Node offline' : latest?.quality_flag === 'out_of_range' ? 'Suspect reading' : outOfBand ? 'Outside normal band' : 'Normal';
  const values = readings.filter((r) => r.quality_flag === 'ok').map((r) => r.value);

  return (
    <Card
      title={NAMES[sensor.id] ?? sensor.id}
      action={<Chip level={level}>{label}</Chip>}
    >
      <p className={`text-3xl font-bold ${offline ? 'text-slate-400' : ''}`}>{value(latest?.value, sensor.unit)}</p>
      <p className="mb-2 text-xs text-muted">
        {latest ? `last reading ${fmtTime(latest.ts)}` : 'no readings yet'} · normal {lo}–{hi} {sensor.unit}
      </p>
      {values.length >= 2 ? (
        <LineChart segments={[{ label: `last 10 min · ${values.length} readings`, values, color: outOfBand && !offline ? '#B91C1C' : '#0F766E' }]} band={sensor.normal_band} unit={sensor.unit} height={140} />
      ) : (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-muted">Waiting for readings…</p>
      )}
    </Card>
  );
}

export default function WaterStatus() {
  const { data, error, updatedAt } = useLiveTelemetry();

  if (dataSource !== 'api') {
    return (
      <div>
        <PageHeader title="Water Status" />
        <EmptyState icon="sensor" title="Live sensor data needs the backend">
          Start the API, then the simulator: <code className="rounded bg-slate-100 px-1">python simulator/sim.py</code>
        </EmptyState>
      </div>
    );
  }

  const live = data?.live;
  const noData = live && live.nodes.every((n) => n.status === 'never_reported');

  return (
    <div>
      <PageHeader title="Water Status — live sensors" subtitle={`Refreshes every ${POLL_MS / 1000} s${updatedAt ? ` · updated ${updatedAt.toLocaleTimeString()}` : ''}`}>
        <SimBadge>Simulated sensor data</SimBadge>
      </PageHeader>

      {error && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Could not refresh: {error}. Showing the last data received.</p>}

      {live && (
        <div className="mb-5 grid gap-3 md:grid-cols-2">
          {live.nodes.map((n) => (
            <div key={n.id} className="card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">
                  {n.code} <span className="font-normal text-muted">· {n.location}</span>
                </p>
                <p className="text-sm text-muted">
                  {n.last_seen_at ? `last seen ${n.seconds_since}s ago` : 'never reported'}
                  {n.battery_v != null && ` · battery ${n.battery_v.toFixed(2)} V`} · {n.power}
                </p>
              </div>
              <Chip level={NODE_LEVEL[n.status]}>{NODE_TEXT[n.status]}</Chip>
            </div>
          ))}
        </div>
      )}
      {live?.nodes.some((n) => n.status === 'offline') && (
        <p className="mb-5 rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm">
          <span className="font-semibold">Equipment issue, not a water fault:</span> a node stopped reporting (after {live.offline_after_seconds} s of silence). Its last values are greyed out
          and are not used as evidence of a supply problem.
        </p>
      )}

      {noData ? (
        <EmptyState icon="sensor" title="No sensor readings yet">
          Start the simulator from the repository folder: <code className="rounded bg-slate-100 px-1">python simulator/sim.py</code>
        </EmptyState>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {live &&
            CHART_SENSORS.map((id) => {
              const sensor = live.sensors.find((s) => s.id === id);
              return sensor ? <SensorCard key={id} sensor={sensor} readings={data.series[id] ?? []} /> : null;
            })}
        </div>
      )}
    </div>
  );
}
