// Small pieces shared by the map's analysis layers.
import Icon from '../Icon';

export function Dot({ color, className = '' }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`} style={{ background: color }} />;
}

/** Dark glass card shown over the bottom-left of the 3D map. */
export function MapCard({ title, subtitle, onClose, children }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 w-[min(340px,calc(100%-24px))] rounded-2xl border border-white/30 bg-black/70 p-4 text-sm text-white shadow-card backdrop-blur-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-2xl leading-none tracking-tight">{title}</p>
          {subtitle && <p className="mt-1 text-xs text-white/70">{subtitle}</p>}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-full p-1 text-white/60 hover:text-white" aria-label="Close details">
            <Icon name="x" className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** Toggle chips that show or hide categories, each with a colour dot and a count. */
export function FilterChips({ label, items, active, onToggle }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={label}>
      {items.map(({ id, text, color, count }) => (
        <button
          key={id}
          type="button"
          aria-pressed={active.includes(id)}
          onClick={() => onToggle(id)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${active.includes(id) ? 'border-black/20 bg-white/80' : 'border-black/10 text-muted opacity-60'}`}
        >
          <Dot color={color} />
          {text}
          <span className="font-display text-lg leading-none">{count}</span>
        </button>
      ))}
    </div>
  );
}
