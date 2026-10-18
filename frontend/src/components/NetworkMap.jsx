// Village network map: 3D view on real terrain by default, with the schematic plan as a choice
// and as the automatic fallback when the 3D map cannot load (offline, blocked tiles, no WebGL).
// For the Gram Panchayat it also has analysis layers drawn on the house layout.
import { Component, lazy, Suspense, useCallback, useState } from 'react';
import { MAP_ANCHOR } from '../data/mapAnchor';
import VillageMap from './VillageMap';
import { Ripple } from './water';
import { useSensorLayer } from './layers/SensorLayer';
import { useWhatIfLayer } from './layers/WhatIfLayer';
import { useServiceLayer } from './layers/ServiceLayer';
import { useQualityLayer } from './layers/QualityLayer';

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

const GP_LAYERS = [
  ['network', 'Network'],
  ['sensors', 'Sensors'],
  ['service', 'Service'],
  ['quality', 'Quality'],
  ['whatif', 'What-if'],
];

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

export default function NetworkMap({ step, mode = 'gp', selected, onSelect, telemetry, initialLayer = 'network' }) {
  const [view, setView] = useState('3d');
  const [layer, setLayer] = useState(initialLayer);
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  const show3d = view === '3d' && !failed;
  const activeLayer = mode === 'citizen' ? 'network' : layer;

  // Every layer's hook runs (hook rules); each only builds map content while it is active.
  const layers = {
    sensors: useSensorLayer(telemetry, activeLayer === 'sensors'),
    whatif: useWhatIfLayer(activeLayer === 'whatif'),
    service: useServiceLayer(step, activeLayer === 'service'),
    quality: useQualityLayer(activeLayer === 'quality'),
  };
  const current = layers[activeLayer];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Segmented label="Map view" value={view} onChange={setView} options={[['3d', '3D terrain'], ['plan', 'Schematic']]} />
          {mode !== 'citizen' && <Segmented label="Map layer" value={layer} onChange={setLayer} options={GP_LAYERS} />}
        </div>
        {failed && view === '3d' && <p className="text-xs text-muted">The 3D map needs an internet connection. Showing the schematic plan.</p>}
      </div>

      {current?.toolbar}

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
                  view={activeLayer}
                  pins={current?.pins}
                  onPinClick={current?.onPinClick}
                  houseColors={current?.houseColors}
                  onHouseClick={current?.onHouseClick}
                />
              </Suspense>
            </MapBoundary>
            <p className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-full border border-white/40 bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-md">
              Fictional demo network on real terrain · {MAP_ANCHOR.place}
            </p>
            {current?.card}
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

      {current?.panel}
    </div>
  );
}
