// What-if layer: pick a valve (or the tank outlet) to close for repair and see which homes lose
// water, the best time today to do the work, and the advance notice for affected households.
import { useMemo, useState } from 'react';
import { areas } from '../../data/seed';
import { fieldLayout } from '../../data/fieldLayout';
import { bestWindow, shutdownNotice, TANK_OUTLET, whatIf } from '../../data/whatIf';
import { Dot, MapCard } from './shared';

const CUT = '#EF4444';
const LANGS = [
  ['en', 'English'],
  ['te', 'తెలుగు'],
  ['hi', 'हिंदी'],
];

export function useWhatIfLayer(active) {
  const [code, setCode] = useState('V-04');
  const [hours, setHours] = useState(4);
  const [lang, setLang] = useState('en');
  const layout = fieldLayout();

  const result = useMemo(() => whatIf(code), [code]);
  const zoneIds = Object.keys(result.byZone);
  const slot = useMemo(() => bestWindow(zoneIds, hours), [zoneIds.join(), hours]);
  const pipeCode = code === TANK_OUTLET ? 'OHT-1 outlet' : result.valve?.pipeCode;
  const notice = slot && zoneIds.length ? shutdownNotice({ zoneNames: zoneIds.map((z) => areas[z].name), from: slot.from, to: slot.to, pipeCode }) : null;

  const houseColors = useMemo(() => (active ? Object.fromEntries([...result.cutIds].map((id) => [id, CUT])) : null), [active, result]);

  const pins = useMemo(() => {
    if (!active) return [];
    const valvePins = layout.valves.map((v) => ({
      id: v.code,
      at: v.at,
      color: v.code === code ? CUT : '#0EA5E9',
      label: v.code,
      selected: v.code === code,
      pulse: v.code === code ? 'fast' : 'none',
      ariaLabel: `Valve ${v.code} on ${v.pipeCode}${v.code === code ? ', closed in this plan' : ''}`,
    }));
    const tankPin = layout.tank && {
      id: TANK_OUTLET,
      at: layout.tank,
      color: code === TANK_OUTLET ? CUT : '#0EA5E9',
      label: 'Tank outlet',
      selected: code === TANK_OUTLET,
      pulse: code === TANK_OUTLET ? 'fast' : 'none',
      ariaLabel: 'Overhead tank outlet',
    };
    return tankPin ? [tankPin, ...valvePins] : valvePins;
  }, [active, code, layout]);

  const options = [{ code: TANK_OUTLET, label: 'Tank outlet', sub: 'All lanes' }, ...layout.valves.map((v) => ({ code: v.code, label: v.code, sub: `${v.pipeCode}${v.fictional ? ' · added for demo' : ' · in seed'}` }))];

  return {
    pins,
    onPinClick: setCode,
    houseColors,
    toolbar: (
      <p className="mb-3 text-sm text-muted">Pick a valve on the map or below. Homes shown in red lose water while it is closed.</p>
    ),
    card: (
      <MapCard title={`${code === TANK_OUTLET ? 'Tank outlet' : code} closed`} subtitle={`${pipeCode} · ${hours} h repair`}>
        <p>
          <span className="font-display text-4xl leading-none">{result.cut.length}</span>
          <span className="text-white/70"> of {result.total} homes without water</span>
        </p>
        {slot && (
          <p className="mt-2 text-xs text-white/80">
            Best time today: {slot.from}–{slot.to}
            {slot.missed.length === 0 ? ' · no supply window missed' : ` · misses ${slot.missed.length} supply window${slot.missed.length > 1 ? 's' : ''}`}
          </p>
        )}
      </MapCard>
    ),
    panel: (
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium">Close for repair</h3>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Valve to close">
            {options.map((o) => (
              <button
                key={o.code}
                type="button"
                role="radio"
                aria-checked={code === o.code}
                onClick={() => setCode(o.code)}
                className={`rounded-2xl border px-3 py-2 text-left text-sm transition-colors ${code === o.code ? 'border-black bg-black text-white' : 'border-black/10 bg-white/60 hover:border-black/30'}`}
              >
                <span className="block font-medium">{o.label}</span>
                <span className={`block text-xs ${code === o.code ? 'text-white/70' : 'text-muted'}`}>{o.sub}</span>
              </button>
            ))}
          </div>
          <label className="mt-5 block text-sm">
            <span className="flex justify-between">
              <span className="font-medium">Repair time</span>
              <span className="text-muted">{hours} h</span>
            </span>
            <input type="range" min="1" max="10" step="1" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-2 w-full accent-black" />
          </label>
          <p className="mt-4 text-xs text-muted">
            Simplified model: a closed valve cuts every home further down the same lane. A real hydraulic model would also show lower pressure elsewhere. Valves marked "added for demo" are fictional.
          </p>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white/50 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-muted">Homes without water</p>
              <p className="font-display text-5xl leading-none tracking-tight">{result.cut.length}</p>
              <p className="text-xs text-muted">of {result.total} in the village</p>
            </div>
            <div>
              <p className="text-sm text-muted">By zone</p>
              <ul className="mt-1 text-sm">
                {zoneIds.length === 0 && <li className="text-muted">None</li>}
                {zoneIds.map((z) => (
                  <li key={z} className="flex items-center gap-2">
                    <Dot color={CUT} />
                    {areas[z].name}: {result.byZone[z]} homes
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {slot && (
            <div className={`mt-4 rounded-xl p-3 text-sm ${slot.missed.length ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
              <p className="font-medium">
                Best time today: {slot.from}–{slot.to}
              </p>
              <p>
                {slot.missed.length === 0
                  ? 'Falls between scheduled supply windows, so no household misses a supply.'
                  : `No slot of ${hours} h avoids supply. This one misses: ${slot.missed.map((w) => w.label).join(', ')}. Consider a tanker for those homes.`}
              </p>
            </div>
          )}

          {notice && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Advance notice to {result.cut.length} households</p>
                <div className="flex gap-1" role="group" aria-label="Notice language">
                  {LANGS.map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={lang === id} onClick={() => setLang(id)} className={`rounded-full px-2.5 py-0.5 text-xs ${lang === id ? 'bg-black text-white' : 'text-muted hover:text-black'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="rounded-xl bg-water-50 p-3 text-sm">{notice[lang]}</p>
              <p className="mt-1 text-xs text-muted">Preview only. SMS and voice delivery are not connected in the prototype; Telugu and Hindi need native review.</p>
            </div>
          )}
        </div>
      </div>
    ),
  };
}
