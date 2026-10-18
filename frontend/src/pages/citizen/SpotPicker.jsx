import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { assets, areas, HOME_VILLAGE } from '../../data/seed';

const flipY = (p) => [p[0], 1000 - p[1]];

function inside([x, y], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * A geo-tagged observation: the villager taps the schematic village map where the problem is.
 * Only a place about 25 m wide is stored, only inside their own zone, and only with their agreement.
 */
export default function SpotPicker({ areaId, spot, setSpot, consent, setConsent }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const zone = areas[areaId];
  const pipes = Object.values(assets).filter((a) => a.geometry.line && areas[a.service_area_id]?.village_id === HOME_VILLAGE);

  const pick = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 1000;
    const y = 1000 - ((e.clientY - r.top) / r.height) * 1000;
    if (inside([x, y], zone.polygon)) setSpot({ x: Math.round(x), y: Math.round(y) });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold">{t('geo.title')}</p>
      <p className="text-sm text-muted">{t('geo.hint')}</p>
      <svg ref={ref} viewBox="0 0 1000 1000" onClick={pick} className="w-full cursor-crosshair touch-manipulation rounded-2xl border border-black/10 bg-water-50/60" role="img" aria-label={t('geo.title')} style={{ maxHeight: 340 }}>
        {Object.values(areas).filter((a) => a.village_id === HOME_VILLAGE).map((a) => (
          <polygon key={a.id} points={a.polygon.map(flipY).map((p) => p.join(',')).join(' ')} fill={a.id === areaId ? 'rgb(14 165 233 / 0.18)' : 'rgb(148 163 184 / 0.12)'} stroke={a.id === areaId ? '#0EA5E9' : '#CBD5E1'} strokeWidth={a.id === areaId ? 5 : 3} strokeDasharray={a.id === areaId ? undefined : '10 8'} />
        ))}
        {pipes.map((a) => (
          <polyline key={a.id} points={a.geometry.line.map(flipY).map((p) => p.join(',')).join(' ')} fill="none" stroke="#38BDF8" strokeWidth="7" strokeLinecap="round" opacity="0.7" pointerEvents="none" />
        ))}
        {spot && (
          <g pointerEvents="none">
            <circle cx={spot.x} cy={1000 - spot.y} r="46" fill="#EF4444" fillOpacity="0.2" />
            <circle cx={spot.x} cy={1000 - spot.y} r="18" fill="#EF4444" stroke="#fff" strokeWidth="6" />
          </g>
        )}
      </svg>
      {spot && (
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-3 rounded-2xl border border-black/10 p-3 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
            {t('geo.consent')}
          </label>
          <button type="button" onClick={() => { setSpot(null); setConsent(false); }} className="btn-outline min-h-10 self-start px-4 text-sm">
            {t('geo.clear')}
          </button>
        </div>
      )}
    </div>
  );
}
