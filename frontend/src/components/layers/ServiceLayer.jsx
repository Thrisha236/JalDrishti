// Service layer: every home coloured by its Water Service Score, with the village's equity picture.
import { useMemo, useState } from 'react';
import { BAND, LPCD_TARGET, serviceScores, serviceSummary, WEIGHTS } from '../../data/service';
import { QUALITY, useQualityTests } from '../../data/quality';
import { Dot, FilterChips, MapCard } from './shared';

const BAND_ORDER = ['poor', 'fair', 'good'];
const FADED = '#D6D3CC';

function Stat({ label, value, note }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display text-5xl leading-none tracking-tight">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

function HomeCard({ s, onClose }) {
  return (
    <MapCard title={`Home ${s.house.id.split('-h').pop()}`} subtitle={`${s.house.zone.replace('sa-', '').replace(/^\w/, (c) => c.toUpperCase())} · ${Math.round(s.along * 100)}% along its lane`} onClose={onClose}>
      <p className="mb-3">
        <span className="font-display text-4xl leading-none">{s.score}</span>
        <span className="text-white/70"> / 100 · {BAND[s.band].label.split(' ')[0]}</span>
      </p>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-white/55">Quantity</dt>
          <dd>{s.lpcd} L/person/day</dd>
        </div>
        <div>
          <dt className="text-white/55">Regularity</dt>
          <dd>{s.parts.regularity}% on schedule</dd>
        </div>
        <div>
          <dt className="text-white/55">Quality</dt>
          <dd>{QUALITY[s.quality].label}</dd>
        </div>
      </dl>
      {s.leaking && <p className="mt-2 text-xs text-amber-300">Low pressure from the open P-21 incident.</p>}
    </MapCard>
  );
}

export function useServiceLayer(step, active) {
  const tests = useQualityTests();
  const [filter, setFilter] = useState(BAND_ORDER);
  const [selected, setSelected] = useState(null);
  const scores = useMemo(() => serviceScores(step, tests), [step, tests]);
  const summary = useMemo(() => serviceSummary(scores), [scores]);
  const current = scores.find((s) => s.house.id === selected);

  const houseColors = useMemo(
    () => (active ? Object.fromEntries(scores.map((s) => [s.house.id, filter.includes(s.band) ? BAND[s.band].color : FADED])) : null),
    [active, scores, filter],
  );
  const toggle = (b) => setFilter((f) => (f.includes(b) ? f.filter((x) => x !== b) : [...f, b]));

  return {
    pins: [],
    houseColors,
    onHouseClick: setSelected,
    toolbar: (
      <FilterChips label="Show homes by service" active={filter} onToggle={toggle} items={BAND_ORDER.map((b) => ({ id: b, text: BAND[b].label, color: BAND[b].color, count: summary.bands[b] }))} />
    ),
    card: current ? (
      <HomeCard s={current} onClose={() => setSelected(null)} />
    ) : (
      <MapCard title={`Village score ${summary.score}`} subtitle="Tap a home for its details">
        <p className="text-white/85">
          {summary.meeting} of {summary.homes} homes get at least {LPCD_TARGET} litres per person per day.
        </p>
      </MapCard>
    ),
    panel: (
      <div className="mt-5">
        <div className="grid gap-5 rounded-2xl border border-black/[0.08] bg-white/50 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Water Service Score" value={summary.score} note="Village average, out of 100" />
          <Stat label={`Homes at ${LPCD_TARGET}+ L/person/day`} value={`${summary.meeting}/${summary.homes}`} note="JJM quantity norm" />
          <Stat label="Equity index" value={summary.equity} note="100 = every home gets the same amount" />
          <Stat label="Poor service" value={summary.bands.poor} note="Homes scoring below 60" />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="pb-2 font-medium">Zone</th>
                <th className="pb-2 font-medium">Score</th>
                <th className="pb-2 font-medium">Avg L/person/day</th>
                <th className="pb-2 font-medium">Homes at {LPCD_TARGET}+</th>
                <th className="pb-2 font-medium">Head vs tail gap</th>
                <th className="pb-2 font-medium">Water quality</th>
              </tr>
            </thead>
            <tbody>
              {summary.zones.map((z) => (
                <tr key={z.zone.id} className="border-t border-black/[0.06]">
                  <td className="py-2.5 font-medium">{z.zone.name}</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <Dot color={BAND[z.score >= 80 ? 'good' : z.score >= 60 ? 'fair' : 'poor'].color} />
                      {z.score}
                    </span>
                  </td>
                  <td className="py-2.5 tabular-nums">{z.lpcd}</td>
                  <td className="py-2.5 tabular-nums">
                    {z.meeting}/{z.homes}
                  </td>
                  <td className="py-2.5">{z.tailGap == null ? '—' : z.tailGap > 0 ? `Tail ${z.tailGap} point${z.tailGap === 1 ? '' : 's'} worse` : 'Even'}</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <Dot color={QUALITY[z.quality].color} />
                      {QUALITY[z.quality].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Worst-served homes</h3>
            <ul className="flex flex-col gap-2">
              {summary.worst.map((s) => (
                <li key={s.house.id}>
                  <button type="button" onClick={() => setSelected(s.house.id)} className="flex w-full items-center gap-3 rounded-2xl border border-black/[0.08] p-3 text-left text-sm hover:border-black/30">
                    <Dot color={BAND[s.band].color} />
                    <span className="flex-1">
                      Home {s.house.id.split('-h').pop()} · {summary.zones.find((z) => z.zone.id === s.house.zone)?.zone.name}
                    </span>
                    <span className="text-muted">
                      {s.lpcd} L · {s.parts.regularity}% · {QUALITY[s.quality].label}
                    </span>
                    <span className="font-display text-2xl leading-none">{s.score}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-water-50 p-4 text-sm">
            <h3 className="mb-2 font-medium">How the score works</h3>
            <p>
              JJM counts a tap as working only when it gives enough water, on schedule, of safe quality. The score combines the three: quantity ({WEIGHTS.quantity * 100}%, against {LPCD_TARGET} litres per person
              per day), regularity ({WEIGHTS.regularity * 100}%, share of scheduled supply windows received) and quality ({WEIGHTS.quality * 100}%, the zone's latest field test).
            </p>
            <p className="mt-2 text-muted">
              Coverage dashboards count connections. This counts service, home by home, so tail-end and low-pressure homes stop being invisible. Per-home values are simulated in the prototype; a deployment would use tap sensors
              or sample meters.
            </p>
          </div>
        </div>
      </div>
    ),
  };
}
