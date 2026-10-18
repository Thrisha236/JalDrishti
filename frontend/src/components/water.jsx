// Water-themed building blocks shared by every page: drifting waves, a fill-level gauge, ripples around a drop.
import Icon from './Icon';

// One wave period; tiled twice and drifted by half its width, so the loop is seamless.
const WAVE = 'M0 60 C240 20 480 20 720 60 S1200 100 1440 60 V120 H0 Z';

function WaveStrip({ className, opacity = 1 }) {
  return (
    <div className={`flex h-full w-[200%] ${className}`}>
      {[0, 1].map((i) => (
        <svg key={i} viewBox="0 0 1440 120" preserveAspectRatio="none" className="h-full w-1/2" aria-hidden="true">
          <path d={WAVE} fill="currentColor" fillOpacity={opacity} />
        </svg>
      ))}
    </div>
  );
}

/** Two drifting wave layers. Colour comes from the text colour, e.g. text-water-200. Pass a position class (absolute or relative). */
export function Waves({ className = '' }) {
  return (
    <div className={`pointer-events-none overflow-hidden ${className}`} aria-hidden="true">
      <div className="absolute inset-0">
        <WaveStrip className="animate-wave-drift-slow" opacity={0.45} />
      </div>
      <div className="absolute inset-0 translate-y-[18%]">
        <WaveStrip className="animate-wave-drift" />
      </div>
    </div>
  );
}

/** Faint tide along the bottom of the viewport, behind page content. */
export function WaterBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-48 bg-gradient-to-b from-transparent to-water-50/70" aria-hidden="true">
      <Waves className="absolute inset-x-0 bottom-0 h-24 text-water-100" />
    </div>
  );
}

// Caustic texture: fractal noise cut into thin bright bands, which reads as light refracted
// through moving water. stitchTiles makes it repeat seamlessly; it is rasterised once, and the
// layers only move with transforms, so the animation stays cheap.
function causticTexture(size, seed, freq) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='c' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='2' seed='${seed}' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0 0 0.15 0.95 0.15 0 0 0'/></feComponentTransfer><feGaussianBlur stdDeviation='1.1'/></filter><rect width='100%' height='100%' filter='url(#c)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const CAUSTIC_A = causticTexture(520, 7, 0.011);
const CAUSTIC_B = causticTexture(760, 19, 0.008);

const BLOBS = [
  { cls: 'left-[-10%] top-[-15%] h-[60vw] w-[60vw]', color: 'rgba(125, 211, 252, 0.45)', delay: '0s' },
  { cls: 'right-[-15%] top-[10%] h-[55vw] w-[55vw]', color: 'rgba(103, 232, 249, 0.35)', delay: '-9s' },
  { cls: 'bottom-[-20%] left-[20%] h-[60vw] w-[60vw]', color: 'rgba(165, 180, 252, 0.30)', delay: '-17s' },
  { cls: 'bottom-[-10%] right-[5%] h-[40vw] w-[40vw]', color: 'rgba(94, 234, 212, 0.28)', delay: '-23s' },
];

/**
 * Light-mode app background: soft drifting colour pools with caustic light moving over them,
 * meant to sit behind frosted-glass cards. Hidden in dark mode; still when the user prefers reduced motion.
 */
export function Caustics() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-gradient-to-br from-[#EAF4FA] via-[#F4F9FC] to-[#E8F1F8] dark:hidden" aria-hidden="true">
      {BLOBS.map((b) => (
        <div
          key={b.cls}
          className={`absolute animate-blob-drift rounded-full will-change-transform ${b.cls}`}
          style={{ background: `radial-gradient(circle, ${b.color} 0%, transparent 65%)`, animationDelay: b.delay }}
        />
      ))}
      <div className="absolute -left-[520px] -top-[520px] h-[calc(100%+1040px)] w-[calc(100%+1040px)] animate-caustic-a opacity-70 will-change-transform" style={{ backgroundImage: CAUSTIC_A }} />
      <div className="absolute -right-[760px] -top-[760px] hidden h-[calc(100%+1520px)] w-[calc(100%+1520px)] animate-caustic-b opacity-50 will-change-transform md:block" style={{ backgroundImage: CAUSTIC_B }} />
    </div>
  );
}

/** A thin wave rule used under page headings. */
export function WaveRule({ className = '' }) {
  return <Waves className={`relative h-3 w-40 text-water-300 ${className}`} />;
}

/**
 * Round gauge filled to `value` (0–1) with a moving water surface.
 * Shows a real fraction only; never use it to invent a number.
 */
export function WaterLevel({ value, label, sublabel, size = 132, tone = 'water' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = { water: 'text-water-300', warning: 'text-amber-200', problem: 'text-red-200' }[tone] ?? 'text-water-300';
  return (
    <div className="relative shrink-0 overflow-hidden rounded-full border border-water-200 bg-water-50" style={{ width: size, height: size }}>
      <div className={`absolute inset-x-0 bottom-0 animate-fill-rise ${fill}`} style={{ height: `${pct}%` }}>
        <Waves className="absolute inset-x-0 bottom-[calc(100%-1px)] h-3" />
        <div className="h-full bg-current" />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-4xl leading-none tracking-tight">{label}</span>
        {sublabel && <span className="mt-1 px-3 text-[11px] leading-tight text-muted">{sublabel}</span>}
      </div>
    </div>
  );
}

/** A drop (or other icon) with ripples spreading out from it. */
export function Ripple({ icon = 'drop', size = 'md', tone = 'ink', className = '' }) {
  const box = size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-10 w-10' : 'h-14 w-14';
  const iconSize = size === 'lg' ? 'h-9 w-9' : size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';
  const core = { ink: 'bg-black text-white', soft: 'bg-water-50 text-water-600', ok: 'bg-black text-white' }[tone];
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${box} ${className}`}>
      <span className="absolute inset-0 animate-ripple rounded-full border border-water-400" aria-hidden="true" />
      <span className="absolute inset-0 animate-ripple rounded-full border border-water-300" style={{ animationDelay: '1.4s' }} aria-hidden="true" />
      <span className={`relative flex h-full w-full items-center justify-center rounded-full ${core}`}>
        <Icon name={icon} className={iconSize} />
      </span>
    </span>
  );
}
