// Issues layer: everything observed right now (sensor alerts, AI warnings, water-quality risk, equipment faults and
// taps that are short of water), placed where it is happening. Driven by the live readings and the AI models.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildIssues, KIND, SEVERITY } from '../../data/issues';
import { useQualityTests } from '../../data/quality';
import { Dot, FilterChips, MapCard } from './shared';

const KIND_ORDER = ['alert', 'ai', 'quality', 'taps', 'equipment'];
const KIND_COLOR = { alert: '#EF4444', ai: '#C026D3', quality: '#14B8A6', taps: '#3B82F6', equipment: '#94A3B8' };
const HOME = { PARTIAL: '#FBBF24', NON_FUNCTIONAL: '#EF4444' };

export function useIssuesLayer({ telemetry, predictions, fhtc }, active) {
  const tests = useQualityTests();
  const [filter, setFilter] = useState(KIND_ORDER);
  const [selected, setSelected] = useState(null);
  const issues = useMemo(() => buildIssues({ telemetry, predictions, fhtc, tests }), [telemetry, predictions, fhtc, tests]);
  const shown = issues.filter((i) => filter.includes(i.kind));
  const current = issues.find((i) => i.id === selected);
  const toggle = (k) => setFilter((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const pins = useMemo(
    () =>
      active
        ? shown.map((i) => ({
            id: i.id, at: i.at, color: SEVERITY[i.severity].color, label: i.short, selected: i.id === selected,
            pulse: i.severity === 'high' ? 'fast' : 'slow', ariaLabel: `${SEVERITY[i.severity].label}: ${i.title}`,
          }))
        : [],
    [active, issues, filter, selected],
  );

  // Homes short of water are coloured, so the cause (a leak up the lane) and the effect (dry taps) are on one picture.
  const houseColors = useMemo(() => {
    if (!active || !fhtc || !filter.includes('taps')) return null;
    const colours = {};
    fhtc.zones.forEach((z) => {
      Object.entries(HOME).forEach(([status, colour]) => z.affected_map_ids[status].forEach((id) => (colours[id] = colour)));
    });
    return colours;
  }, [active, fhtc, filter]);

  return {
    pins,
    onPinClick: setSelected,
    houseColors,
    toolbar: (
      <FilterChips
        label="Show issues by kind"
        active={filter}
        onToggle={toggle}
        items={KIND_ORDER.map((k) => ({ id: k, text: KIND[k].label, color: KIND_COLOR[k], count: issues.filter((i) => i.kind === k).length }))}
      />
    ),
    card: current && (
      <MapCard title={current.title} subtitle={`${SEVERITY[current.severity].label} · ${KIND[current.kind].label}`} onClose={() => setSelected(null)}>
        <p className="mb-3 text-white/85">{current.detail}</p>
        {current.link && (
          <Link to={current.link.to} className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black">
            {current.link.label}
          </Link>
        )}
      </MapCard>
    ),
    panel: (
      <div className="mt-4">
        {issues.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/15 p-4 text-sm text-muted">
            Nothing is wrong right now. Start the sensor simulator with a fault to see issues appear on the map: <code>python simulator\sim.py --scenario leak --interval 2</code>
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setSelected(i.id)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${i.id === selected ? 'border-black bg-water-50' : 'border-black/[0.08] hover:border-black/30'}`}
                >
                  <Dot color={SEVERITY[i.severity].color} className="mt-1.5" />
                  <span className="min-w-0">
                    <span className="block font-medium">{i.title}</span>
                    <span className="block truncate text-xs text-muted">{i.detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Built from the live sensor readings and the AI models; on the demo sensor feed. Homes are tinted amber (below 55 L/person/day) or red (very little water).</p>
      </div>
    ),
  };
}
