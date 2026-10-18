// Village network map: 3D view on real terrain by default, with the schematic plan as a choice
// and as the automatic fallback when the 3D map cannot load (offline, blocked tiles, no WebGL).
// For the Gram Panchayat it also has a sensor view: field sensor health on the house layout.
import { Component, lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { MAP_ANCHOR } from '../data/mapAnchor';
import { fmtDate } from '../data/seed';
import { HEALTH, sensorHealth } from '../data/fieldLayout';
import VillageMap from './VillageMap';
import Icon from './Icon';
import { Ripple } from './water';

// MapLibre is large, so it loads only when a 3D map is shown.
const TerrainMap = lazy(() => import('./TerrainMap'));

const LEGEND_GP = [
  ['#EF4444', 'High risk pipe'],
  ['#F59E0B', 'Medium'],
  ['#38BDF8', 'Low'],
  ['#22D3EE', 'Real water bodies (OpenStreetMap)'],
  ['#EDE6D6', 'Homes (fictional layout)'],
];
const LEGEND_CITIZEN = [
  ['#38BDF8', 'Water pipes'],
  ['#22D3EE', 'Real water bodies (OpenStreetMap)'],
  ['#EDE6D6', 'Homes (fictional layout)'],
];
// Problems first, so the list reads as a to-do list.
const STATUS_ORDER = ['damaged', 'offline', 'service', 'healthy'];

/** If the 3D map throws, show the schematic instead of breaking the page. */
class MapBoundary extends Component {
  componentDidCatch(error) {
    console.warn('3D map failed, falling back to the schematic:', error.message);
    this.props.onFail();
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  state = { crashed: false };

  render() {
    return this.state.crashed ? null : this.props.children;
  }
}

function Loading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-sm text-muted">
      <Ripple icon="map" tone="soft" />
      Loading terrain…
    </div>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="flex rounded-full border border-black/10 bg-white/60 p-1 text-sm" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`rounded-full px-4 py-1.5 transition-colors ${value === id ? 'bg-black text-white' : 'text-muted hover:text-black'}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function StatusDot({ status, className = '' }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`} style={{ background: HEALTH[status].color }} />;
}

function SensorCard({ sensor, onClose }) {
  const h = HEALTH[sensor.status];
  return (
    <div className="absolute bottom-3 left-3 z-10 w-[min(320px,calc(100%-24px))] rounded-2xl border border-white/30 bg-black/70 p-4 text-sm text-white shadow-card backdrop-blur-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-2xl leading-none tracking-tight">{sensor.code}</p>
          <p className="mt-1 text-xs text-white/70">
            {sensor.kindLabel} · {sensor.zoneName}
            {sensor.pipe ? ` · ${sensor.pipe}` : ''}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-white/60 hover:text-white" aria-label="Close sensor details">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-xs">
        <StatusDot status={sensor.status} />
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
    </div>
  );
}

function SensorList({ sensors, selected, onSelect }) {
  const sorted = [...sensors].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.code.localeCompare(b.code));
  return (
    <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map((s) => (
        <li key={s.code}>
          <button
            type="button"
            onClick={() => onSelect(s.code)}
            className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${s.code === selected ? 'border-black bg-water-50' : 'border-black/[0.08] hover:border-black/30'}`}
          >
            <StatusDot status={s.status} className="mt-1.5" />
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
  );
}

export default function NetworkMap({ step, mode = 'gp', selected, onSelect, telemetry }) {
  const [view, setView] = useState('3d');
  const [layer, setLayer] = useState('network');
  const [failed, setFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState(STATUS_ORDER);
  const [selectedSensor, setSelectedSensor] = useState(null);
  const onFail = useCallback(() => setFailed(true), []);
  const show3d = view === '3d' && !failed;
  const sensorView = mode !== 'citizen' && layer === 'sensors';

  const sensors = useMemo(() => (mode === 'citizen' ? [] : sensorHealth(telemetry)), [mode, telemetry]);
  const counts = useMemo(() => Object.fromEntries(STATUS_ORDER.map((st) => [st, sensors.filter((s) => s.status === st).length])), [sensors]);
  const current = sensors.find((s) => s.code === selectedSensor);

  const toggleStatus = (st) => setStatusFilter((f) => (f.includes(st) ? f.filter((x) => x !== st) : [...f, st]));
  const pickSensor = (code) => {
    setLayer('sensors');
    setSelectedSensor(code);
    setStatusFilter((f) => {
      const st = sensors.find((s) => s.code === code)?.status;
      return st && !f.includes(st) ? [...f, st] : f;
    });
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Segmented label="Map view" value={view} onChange={setView} options={[['3d', '3D terrain'], ['plan', 'Schematic']]} />
          {mode !== 'citizen' && <Segmented label="Map layer" value={layer} onChange={setLayer} options={[['network', 'Network'], ['sensors', 'Sensors']]} />}
        </div>
        {failed && view === '3d' && <p className="text-xs text-muted">The 3D map needs an internet connection. Showing the schematic plan.</p>}
      </div>

      {sensorView && (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Show sensors by health">
          {STATUS_ORDER.map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={statusFilter.includes(st)}
              onClick={() => toggleStatus(st)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${statusFilter.includes(st) ? 'border-black/20 bg-white/80' : 'border-black/10 text-muted opacity-60'}`}
            >
              <StatusDot status={st} />
              {HEALTH[st].label}
              <span className="font-display text-lg leading-none">{counts[st]}</span>
            </button>
          ))}
        </div>
      )}

      {show3d ? (
        <>
          <div className="relative h-[460px] overflow-hidden rounded-2xl border border-black/[0.08] bg-water-50 lg:h-[600px]">
            <MapBoundary onFail={onFail}>
            <Suspense fallback={<Loading />}>
              <TerrainMap
                step={step}
                mode={mode}
                selected={selected}
                onSelect={onSelect}
                liveNodes={telemetry?.live?.nodes}
                onFail={onFail}
                view={sensorView ? 'sensors' : 'network'}
                sensors={sensors}
                statusFilter={statusFilter}
                selectedSensor={selectedSensor}
                onSelectSensor={pickSensor}
              />
            </Suspense>
            </MapBoundary>
            <p className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-full border border-white/40 bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-md">
              Fictional demo network on real terrain · {MAP_ANCHOR.place}
            </p>
            {sensorView && current && <SensorCard sensor={current} onClose={() => setSelectedSensor(null)} />}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {(mode === 'citizen' ? LEGEND_CITIZEN : LEGEND_GP).map(([color, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
            <span>Drag to pan · right-drag or two fingers to tilt</span>
            <span>Pipes, zones, homes and sensors are simulated</span>
          </div>
        </>
      ) : (
        <VillageMap step={step} mode={mode} selected={selected} onSelect={onSelect} />
      )}

      {sensorView && (
        <>
          {!show3d && current && (
            <p className="mt-4 rounded-2xl border border-black/[0.08] p-3 text-sm">
              <StatusDot status={current.status} className="mr-2" />
              <span className="font-medium">{current.code}</span> · {HEALTH[current.status].label}
              {current.reason ? ` · ${current.reason}` : ''}
            </p>
          )}
          <SensorList sensors={sensors.filter((s) => statusFilter.includes(s.status))} selected={selectedSensor} onSelect={pickSensor} />
          <p className="mt-2 text-xs text-muted">
            Sensors marked live follow the simulated nodes (start <code>simulator\sim.py</code> to see them change). The rest are fictional demo records.
          </p>
        </>
      )}
    </div>
  );
}
