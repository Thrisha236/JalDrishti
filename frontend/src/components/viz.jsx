// Small, dependency-free charts for the early-warning, tap-connection and integration screens.
// Colours match the rest of the app: emerald = fine, amber = watch, rose = act now, sky = water.
export const TONE = { good: '#10B981', watch: '#F59E0B', bad: '#EF4444', water: '#0EA5E9', muted: '#94A3B8' };

/** Half-circle gauge for a 0-100 index with the "edge of normal" marked at 50. */
export function Gauge({ value, limit = 50, label, sublabel }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const tone = value == null ? TONE.muted : v < limit ? TONE.good : v < 75 ? TONE.watch : TONE.bad;
  const R = 78;
  const arc = (from, to) => {
    const a = (t) => [100 + R * Math.cos(Math.PI * (1 - t / 100)), 100 - R * Math.sin(Math.PI * (1 - t / 100))];
    const [x1, y1] = a(from);
    const [x2, y2] = a(to);
    return `M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}`;
  };
  const [lx, ly] = [100 + (R + 12) * Math.cos(Math.PI * (1 - limit / 100)), 100 - (R + 12) * Math.sin(Math.PI * (1 - limit / 100))];
  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 118" className="w-full" role="img" aria-label={`${label}: ${value ?? 'no data'}`}>
        <path d={arc(0, 100)} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="16" strokeLinecap="round" />
        {v > 0 && <path d={arc(0, v)} fill="none" stroke={tone} strokeWidth="16" strokeLinecap="round" style={{ transition: 'all 0.6s ease' }} />}
        <line x1={100 + (R - 12) * Math.cos(Math.PI * (1 - limit / 100))} y1={100 - (R - 12) * Math.sin(Math.PI * (1 - limit / 100))} x2={100 + (R + 9) * Math.cos(Math.PI * (1 - limit / 100))} y2={100 - (R + 9) * Math.sin(Math.PI * (1 - limit / 100))} stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" />
        <text x={lx} y={ly - 2} textAnchor="middle" fontSize="8" fill="currentColor" fillOpacity="0.6">limit</text>
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="font-display text-5xl leading-none tracking-tight">{value == null ? '—' : value}</p>
        {sublabel && <p className="mt-1 text-xs text-muted">{sublabel}</p>}
      </div>
    </div>
  );
}

/** Ring split into functional / partial / non-functional, with the percentage functional in the middle. */
export function Donut({ functional, partial, nonFunctional, size = 180, centre, caption }) {
  const total = functional + partial + nonFunctional || 1;
  const r = 70;
  const c = 2 * Math.PI * r;
  const parts = [
    [functional, TONE.good],
    [partial, TONE.watch],
    [nonFunctional, TONE.bad],
  ];
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" role="img" aria-label={`${functional} functional, ${partial} partly working, ${nonFunctional} not working`}>
        <circle cx="90" cy="90" r={r} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="20" />
        {parts.map(([n, color]) => {
          const len = (n / total) * c;
          const el = n > 0 && <circle key={color} cx="90" cy="90" r={r} fill="none" stroke={color} strokeWidth="20" strokeDasharray={`${Math.max(len - 2, 0)} ${c - Math.max(len - 2, 0)}`} strokeDashoffset={-offset} style={{ transition: 'all 0.6s ease' }} />;
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-5xl leading-none tracking-tight">{centre}</span>
        {caption && <span className="mt-1 px-4 text-[11px] leading-tight text-muted">{caption}</span>}
      </div>
    </div>
  );
}

/** One horizontal bar split into functional / partial / non-functional shares. */
export function StackBar({ functional, partial, nonFunctional, height = 12 }) {
  const total = functional + partial + nonFunctional || 1;
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-black/[0.06]" style={{ height }} role="img" aria-label={`${functional} functional, ${partial} partly, ${nonFunctional} not working`}>
      {[
        [functional, TONE.good],
        [partial, TONE.watch],
        [nonFunctional, TONE.bad],
      ].map(([n, color]) => n > 0 && <span key={color} style={{ width: `${(n / total) * 100}%`, background: color, transition: 'width 0.6s ease' }} />)}
    </div>
  );
}

/**
 * Recent readings (solid), the projected trend (dashed), the normal band (green) and "now".
 * `forecast` is one item from /predictions `forecasts`.
 */
export function ForecastChart({ forecast, height = 170 }) {
  const W = 600;
  const H = height;
  const left = 44;
  const bottom = 26;
  const hist = forecast.history ?? [];
  const proj = forecast.projection ?? [];
  const [low, high] = forecast.normal_band;
  // The scale follows the readings and the band; a steep projection runs off the chart instead of squashing it.
  const values = [...hist.map((p) => p.value), low, high];
  const pad = 0.12 * (Math.max(...values) - Math.min(...values) || 1);
  const yMin = Math.min(...values) - pad;
  const yMax = Math.max(...values) + pad;
  const tMin = Math.min(-forecast.window_minutes, ...hist.map((p) => p.t));
  const tMax = Math.max(15, ...proj.map((p) => p.t));
  const x = (t) => left + ((t - tMin) / (tMax - tMin)) * (W - left - 8);
  const y = (v) => H - bottom - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin) * (H - bottom - 10);
  const line = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const breaching = forecast.level === 'warning' || forecast.level === 'breach';
  const accent = breaching ? TONE.bad : forecast.level === 'watch' ? TONE.watch : TONE.water;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${forecast.kind} trend and forecast`}>
      <rect x={left} y={y(high)} width={W - left - 8} height={Math.max(0, y(low) - y(high))} fill="#10B981" fillOpacity="0.12" />
      <text x={W - 10} y={y(high) + 12} textAnchor="end" fontSize="10" fill="#059669">normal {low}–{high} {forecast.unit}</text>
      {[yMin + (yMax - yMin) * 0.1, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.1].map((v) => (
        <text key={v} x={left - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.55">{v.toFixed(2)}</text>
      ))}
      <line x1={x(0)} x2={x(0)} y1={8} y2={H - bottom} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="3 3" />
      <text x={x(0)} y={H - 8} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.6">now</text>
      <text x={left} y={H - 8} fontSize="10" fill="currentColor" fillOpacity="0.5">{Math.abs(Math.round(tMin))} min ago</text>
      <text x={W - 8} y={H - 8} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity="0.5">+{tMax} min</text>
      {hist.length > 1 && <path d={line(hist)} fill="none" stroke={TONE.water} strokeWidth="2.2" strokeLinejoin="round" />}
      {proj.length > 1 && <path d={line(proj)} fill="none" stroke={accent} strokeWidth="2.2" strokeDasharray="6 5" />}
      {proj.length > 0 && <circle cx={x(0)} cy={y(proj[0].value)} r="4.5" fill={accent} />}
    </svg>
  );
}

/** Predicted residual chlorine on a scale from 0 to 0.8 mg/L, with the watch and at-risk zones shaded. */
export function ChlorineMeter({ value, atRisk = 0.2, watch = 0.4, max = 0.8 }) {
  const pct = (v) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="relative pt-6">
      <div className="relative h-4 overflow-hidden rounded-full">
        <span className="absolute inset-y-0 left-0 bg-rose-300/70" style={{ width: pct(atRisk) }} />
        <span className="absolute inset-y-0 bg-amber-300/70" style={{ left: pct(atRisk), width: `calc(${pct(watch)} - ${pct(atRisk)})` }} />
        <span className="absolute inset-y-0 right-0 bg-emerald-300/70" style={{ left: pct(watch) }} />
      </div>
      <span className="absolute top-0 -translate-x-1/2 transition-all duration-700" style={{ left: pct(value) }}>
        <span className="block rounded-full bg-black px-2 py-0.5 text-xs text-white">{value.toFixed(2)}</span>
        <span className="mx-auto block h-2 w-px bg-black" />
      </span>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>0</span>
        <span>{atRisk} min</span>
        <span>{watch}</span>
        <span>{max} mg/L</span>
      </div>
    </div>
  );
}

/** A failure window on a time axis: last failure, the expected window, and today. */
export function FailureTrack({ lastFailure, window: win, asOf }) {
  if (!lastFailure || !win) return <div className="h-2 rounded-full bg-black/[0.06]" aria-hidden="true" />;
  const d = (s) => new Date(s).getTime();
  const start = d(lastFailure);
  const end = Math.max(d(win[1]), d(asOf)) + 45 * 864e5;
  const pos = (s) => `${((d(s) - start) / (end - start)) * 100}%`;
  const overdue = d(asOf) > d(win[1]);
  return (
    <div className="relative h-5" role="img" aria-label={overdue ? 'Failure window has passed' : 'Failure window ahead'}>
      <span className="absolute inset-x-0 top-2 h-1 rounded-full bg-black/[0.08]" />
      <span className="absolute top-1 h-3 rounded-full" style={{ left: pos(win[0]), width: `calc(${pos(win[1])} - ${pos(win[0])})`, background: overdue ? '#FCA5A5' : '#FCD34D' }} />
      <span className="absolute top-0 h-5 w-0.5 -translate-x-1/2 rounded bg-black" style={{ left: pos(asOf) }} />
    </div>
  );
}
