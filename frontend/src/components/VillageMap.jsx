// Schematic village map drawn from seed geometry (metres on a 1000 x 1000 plan, not a real-world map).
import { useTranslation } from 'react-i18next';
import { seed, riskFor, HOME_VILLAGE, CITIZEN_AREA } from '../data/seed';
import { areaStatus, S, visibleComplaints } from '../demo/steps';
import { SimBadge } from './ui';
import { fieldLayout } from '../data/fieldLayout';

// Theme variables and translucent fills, so the map works in light and dark mode.
const ZONE_FILL = { normal: 'rgb(var(--water-100))', warning: 'rgb(251 191 36 / 0.22)', problem: 'rgb(248 113 113 / 0.22)' };
const BAND_STROKE = { HIGH: '#DC2626', MEDIUM: '#D97706', LOW: 'rgb(var(--water-600))' };
const flipY = (p) => [p[0], 1000 - p[1]];

/** `pins`, `onPinClick` and `houseColors` come from the active map layer (the same ones the 3D map draws). */
export default function VillageMap({ step, mode = 'gp', selected, onSelect, pins = [], onPinClick, houseColors }) {
  const { t } = useTranslation();
  const areas = seed.service_areas.filter((a) => a.village_id === HOME_VILLAGE);
  const assetList = seed.assets.filter((a) => areas.some((z) => z.id === a.service_area_id));
  // Complaints whose sender chose not to share a location are counted but not drawn.
  const complaints = visibleComplaints(step).filter((c) => Number.isFinite(c.location?.x));
  const showCluster = complaints.length > 0 && step < S.VERIFIED;
  const cx = complaints.reduce((s, c) => s + c.location.x, 0) / (complaints.length || 1);
  const cy = complaints.reduce((s, c) => s + c.location.y, 0) / (complaints.length || 1);
  const pointIcon = { source: 'S', pump: 'P', tank: 'T', valve: 'V' };

  return (
    <div>
      <svg viewBox="0 0 1000 1000" className="w-full rounded-2xl border border-water-200 bg-water-50/60" role="img" aria-label="Schematic village water network map">
        {areas.map((z) => {
          const status = areaStatus(step, z.id);
          const pts = z.polygon.map(flipY);
          const lx = Math.min(...pts.map((p) => p[0]));
          const ly = Math.min(...pts.map((p) => p[1]));
          return (
            <g key={z.id}>
              <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={ZONE_FILL[status.level]} stroke="rgb(var(--water-300))" strokeDasharray="8 6" strokeWidth="3" />
              <text x={lx + 16} y={ly + 40} fontSize="30" fontWeight="700" fill="rgb(var(--ink))">
                {z.name}
                {mode === 'citizen' && z.id === CITIZEN_AREA ? ' (you)' : ''}
              </text>
            </g>
          );
        })}

        {assetList.filter((a) => a.geometry.line).map((a) => {
          const risk = riskFor(a.id);
          const pts = a.geometry.line.map(flipY);
          const mid = pts[Math.floor(pts.length / 2)];
          const isSel = selected === a.id;
          return (
            <g key={a.id} onClick={() => onSelect?.(a.id)} className={onSelect ? 'cursor-pointer' : ''}>
              <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="transparent" strokeWidth="40" />
              <polyline
                points={pts.map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke={mode === 'citizen' ? 'rgb(var(--water-600))' : BAND_STROKE[risk.band]}
                strokeWidth={isSel ? 16 : risk.band === 'HIGH' && mode !== 'citizen' ? 12 : 8}
                strokeLinecap="round"
              />
              {/* Water moving through the pipe */}
              <polyline
                points={pts.map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke="#FFFFFF"
                strokeOpacity="0.75"
                strokeWidth="3"
                strokeDasharray="4 20"
                strokeLinecap="round"
                className="animate-flow"
                pointerEvents="none"
              />
              {mode !== 'citizen' && (
                <text x={mid[0] + 14} y={mid[1] - 14} fontSize="28" fontWeight="700" fill={BAND_STROKE[risk.band]}>
                  {a.code}
                </text>
              )}
            </g>
          );
        })}

        {assetList.filter((a) => a.geometry.point).map((a) => {
          const [x, y] = flipY(a.geometry.point);
          return (
            <g key={a.id}>
              <circle cx={x} cy={y} r="22" fill="rgb(var(--white))" stroke="rgb(var(--ink))" strokeWidth="4" />
              <text x={x} y={y + 9} textAnchor="middle" fontSize="24" fontWeight="700" fill="rgb(var(--ink))">
                {pointIcon[a.type] ?? '?'}
              </text>
            </g>
          );
        })}

        {mode !== 'citizen' &&
          seed.sensor_nodes.map((n) => {
            const asset = seed.assets.find((a) => a.id === n.asset_id);
            const p = asset.geometry.point ?? asset.geometry.line.at(-1);
            const [x, y] = flipY(p);
            const bx = x + 146 > 1000 ? x - 146 : x + 18;
            const by = y - 52 < 0 ? y + 18 : y - 52;
            return (
              <g key={n.id}>
                <rect x={bx} y={by} width="128" height="36" rx="18" fill="rgb(var(--ink))" />
                <text x={bx + 64} y={by + 25} textAnchor="middle" fontSize="22" fill="rgb(var(--white))">
                  {n.code} ●
                </text>
              </g>
            );
          })}

        {houseColors &&
          fieldLayout().houses
            .filter((h) => houseColors[h.id])
            .map((h) => {
              const [x, y] = flipY(h.centre);
              return <rect key={h.id} x={x - 7} y={y - 7} width="14" height="14" rx="3" fill={houseColors[h.id]} stroke="rgb(var(--white))" strokeWidth="2" />;
            })}

        {showCluster && (
          <g>
            <circle cx={cx} cy={1000 - cy} r="95" fill="#EF4444" fillOpacity="0.15" stroke="#DC2626" strokeWidth="3" strokeDasharray="10 8" />
            <text x={cx} y={1000 - cy - 110} textAnchor="middle" fontSize="26" fontWeight="700" fill="#DC2626">
              {mode === 'citizen' ? 'Your report (approx. area)' : `${complaints.length} complaints (approx.)`}
            </text>
          </g>
        )}
        {pins.map((p) => {
          const [x, y] = flipY(p.at);
          const fast = p.pulse === 'fast';
          return (
            <g key={p.id} onClick={() => onPinClick?.(p.id)} className="cursor-pointer" role="button" aria-label={p.ariaLabel ?? p.label}>
              {p.pulse !== 'none' && (
                <circle cx={x} cy={y} r="18" fill={p.color} fillOpacity="0.35">
                  <animate attributeName="r" values="16;40;16" dur={fast ? '1.2s' : '2.6s'} repeatCount="indefinite" />
                  <animate attributeName="fill-opacity" values="0.45;0;0.45" dur={fast ? '1.2s' : '2.6s'} repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={x} cy={y} r={p.selected ? 20 : 15} fill={p.color} stroke="rgb(var(--white))" strokeWidth="5" />
              <text x={x + 28} y={y + 9} fontSize="26" fontWeight="700" fill="rgb(var(--ink))" stroke="rgb(var(--white))" strokeWidth="7" paintOrder="stroke" strokeLinejoin="round">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {mode !== 'citizen' && (
          <>
            <span><span className="mr-1 inline-block h-2 w-4 rounded bg-red-700" />High risk</span>
            <span><span className="mr-1 inline-block h-2 w-4 rounded bg-amber-700" />Medium</span>
            <span><span className="mr-1 inline-block h-2 w-4 rounded bg-water-600" />Low</span>
          </>
        )}
        <span>S source · P pump · T tank · V valve</span>
        <span>Schematic, not to scale</span>
        <SimBadge />
      </div>
      {mode === 'citizen' && <p className="sr-only">{t('status.available')}</p>}
    </div>
  );
}
