// Sensors layer: field sensor health (healthy, needs servicing, damaged, offline) on the house layout.
import { useMemo, useState } from 'react';
import { fmtDate } from '../../data/seed';
import { HEALTH, sensorHealth } from '../../data/fieldLayout';
import { Dot, FilterChips, MapCard } from './shared';

// Problems first, so the list reads as a to-do list.
const STATUS_ORDER = ['damaged', 'offline', 'service', 'healthy'];
const PULSE = { healthy: 'slow', service: 'slow', damaged: 'fast', offline: 'none' };

function SensorCard({ sensor, onClose }) {
  const h = HEALTH[sensor.status];
  return (
    <MapCard title={sensor.code} subtitle={`${sensor.kindLabel} · ${sensor.zoneName}${sensor.pipe ? ` · ${sensor.pipe}` : ''}`} onClose={onClose}>
      <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-xs">
        <Dot color={h.color} />
        {h.label}
      </p>
      {sensor.reason && <p className="mb-3 text-white/85">{sensor.reason}</p>}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-white/55">Battery</dt>
          <dd>
            {sensor.battery == null ? (
              'Mains powered or unknown'
            ) : (
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/15">
                  <span className="block h-full rounded-full" style={{ width: `${sensor.battery}%`, background: sensor.battery < 25 ? HEALTH.service.color : HEALTH.healthy.color }} />
                </span>
                {sensor.battery}%
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-white/55">Last serviced</dt>
          <dd>{fmtDate(sensor.lastService)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-white/55">Data</dt>
          <dd>{sensor.isLive ? `Live from ${sensor.live.node === 'node-a' ? 'Node A' : 'Node B'} (simulated device)` : 'Demo record (fictional sensor)'}</dd>
        </div>
      </dl>
    </MapCard>
  );
}

/** Everything the map needs for the sensors layer. `telemetry` is the live API data (or null offline). */
export function useSensorLayer(telemetry, active) {
  const [filter, setFilter] = useState(STATUS_ORDER);
  const [selected, setSelected] = useState(null);
  const sensors = useMemo(() => sensorHealth(telemetry), [telemetry]);
  const current = sensors.find((s) => s.code === selected);

  const select = (code) => {
    setSelected(code);
    const st = sensors.find((s) => s.code === code)?.status;
    if (st && !filter.includes(st)) setFilter((f) => [...f, st]);
  };
  const toggle = (st) => setFilter((f) => (f.includes(st) ? f.filter((x) => x !== st) : [...f, st]));
  const shown = sensors.filter((s) => filter.includes(s.status));

  const pins = useMemo(
    () =>
      active
        ? shown.map((s) => ({
            id: s.code,
            at: s.at,
            color: HEALTH[s.status].color,
            label: s.code,
            selected: s.code === selected,
            pulse: PULSE[s.status],
            ariaLabel: `${s.code}, ${s.kindLabel}: ${HEALTH[s.status].label}`,
          }))
        : [],
    [active, sensors, filter, selected],
  );

  const sorted = [...shown].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.code.localeCompare(b.code));

  return {
    pins,
    onPinClick: select,
    houseColors: null,
    toolbar: (
      <FilterChips
        label="Show sensors by health"
        active={filter}
        onToggle={toggle}
        items={STATUS_ORDER.map((st) => ({ id: st, text: HEALTH[st].label, color: HEALTH[st].color, count: sensors.filter((s) => s.status === st).length }))}
      />
    ),
    card: current && <SensorCard sensor={current} onClose={() => setSelected(null)} />,
    panel: (
      <>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((s) => (
            <li key={s.code}>
              <button
                type="button"
                onClick={() => select(s.code)}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${s.code === selected ? 'border-black bg-water-50' : 'border-black/[0.08] hover:border-black/30'}`}
              >
                <Dot color={HEALTH[s.status].color} className="mt-1.5" />
                <span className="min-w-0">
                  <span className="block font-medium">
                    {s.code} <span className="font-normal text-muted">· {s.zoneName}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">{s.reason ?? s.kindLabel}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Sensors marked live follow the simulated nodes (start <code>simulator\sim.py</code> to see them change). The rest are fictional demo records.
        </p>
      </>
    ),
  };
}
