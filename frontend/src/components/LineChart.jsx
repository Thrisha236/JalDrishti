// Minimal SVG line chart with a shaded normal band and labelled segments (e.g. before / after repair).
export default function LineChart({ segments, band, unit, height = 180, highlight }) {
  const all = segments.flatMap((s) => s.values);
  const lo = Math.min(...all, band?.[0] ?? Infinity);
  const hi = Math.max(...all, band?.[1] ?? -Infinity);
  const pad = (hi - lo) * 0.15 || 0.1;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const W = 600;
  const H = height;
  const left = 40;
  const gap = 18;
  const usable = W - left - gap * (segments.length - 1);
  const total = all.length;
  const y = (v) => H - 24 - ((v - yMin) / (yMax - yMin)) * (H - 40);

  let cursor = left;
  const drawn = segments.map((s) => {
    const width = (s.values.length / total) * usable;
    const step = width / Math.max(s.values.length - 1, 1);
    const pts = s.values.map((v, i) => [cursor + i * step, y(v)]);
    const out = { ...s, x0: cursor, x1: cursor + width, pts };
    cursor += width + gap;
    return out;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Line chart in ${unit}`}>
      {band && (
        <>
          <rect x={left} y={y(band[1])} width={W - left} height={y(band[0]) - y(band[1])} fill="#DCFCE7" />
          <text x={W - 4} y={y(band[1]) - 4} textAnchor="end" fontSize="11" fill="#15803D">
            normal band {band[0]}–{band[1]} {unit}
          </text>
        </>
      )}
      {[yMin + pad, (yMin + yMax) / 2, yMax - pad].map((v) => (
        <text key={v} x={left - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748B">
          {v.toFixed(2)}
        </text>
      ))}
      {drawn.map((s) => (
        <g key={s.label}>
          <polyline
            points={s.pts.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke={s.color ?? '#0F766E'}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <text x={(s.x0 + s.x1) / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#475569">
            {s.label}
          </text>
        </g>
      ))}
      {highlight && (
        <text x={left + 4} y={14} fontSize="12" fontWeight="600" fill="#B91C1C">
          {highlight}
        </text>
      )}
    </svg>
  );
}
