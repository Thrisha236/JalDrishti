// Village network map: 3D view on real terrain by default, with the schematic plan as a choice
// and as the automatic fallback when the 3D map cannot load (offline, blocked tiles, no WebGL).
import { lazy, Suspense, useCallback, useState } from 'react';
import { MAP_ANCHOR } from '../data/mapAnchor';
import VillageMap from './VillageMap';
import { Ripple } from './water';

// MapLibre is large, so it loads only when a 3D map is shown.
const TerrainMap = lazy(() => import('./TerrainMap'));

const LEGEND_GP = [
  ['#EF4444', 'High risk pipe'],
  ['#F59E0B', 'Medium'],
  ['#38BDF8', 'Low'],
  ['#22D3EE', 'Real water bodies (OpenStreetMap)'],
];
const LEGEND_CITIZEN = [
  ['#38BDF8', 'Water pipes'],
  ['#22D3EE', 'Real water bodies (OpenStreetMap)'],
];

function Loading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-sm text-muted">
      <Ripple icon="map" tone="soft" />
      Loading terrain…
    </div>
  );
}

export default function NetworkMap({ step, mode = 'gp', selected, onSelect, liveNodes }) {
  const [view, setView] = useState('3d');
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  const show3d = view === '3d' && !failed;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full border border-black/10 bg-white/60 p-1 text-sm" role="group" aria-label="Map view">
          {[
            ['3d', '3D terrain'],
            ['plan', 'Schematic'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`rounded-full px-4 py-1.5 transition-colors ${view === id ? 'bg-black text-white' : 'text-muted hover:text-black'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {failed && view === '3d' && <p className="text-xs text-muted">The 3D map needs an internet connection. Showing the schematic plan.</p>}
      </div>

      {show3d ? (
        <>
          <div className="relative h-[460px] overflow-hidden rounded-2xl border border-black/[0.08] bg-water-50 lg:h-[600px]">
            <Suspense fallback={<Loading />}>
              <TerrainMap step={step} mode={mode} selected={selected} onSelect={onSelect} liveNodes={liveNodes} onFail={onFail} />
            </Suspense>
            <p className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-full border border-white/40 bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-md">
              Fictional demo network on real terrain · {MAP_ANCHOR.place}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {(mode === 'citizen' ? LEGEND_CITIZEN : LEGEND_GP).map(([color, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
            <span>Drag to pan · right-drag or two fingers to tilt</span>
            <span>Pipes, zones and sensors are simulated</span>
          </div>
        </>
      ) : (
        <VillageMap step={step} mode={mode} selected={selected} onSelect={onSelect} />
      )}
    </div>
  );
}
