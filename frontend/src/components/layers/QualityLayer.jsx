// Quality layer: where water was tested and the latest verdict, with homes in unsafe or watched zones tinted.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate } from '../../data/seed';
import { fieldLayout } from '../../data/fieldLayout';
import { latestByPoint, QUALITY, testPoints, useQualityTests, verdict, zoneQuality } from '../../data/quality';
import { Dot, MapCard } from './shared';

const ZONE_TINT = { unsafe: '#FCA5A5', watch: '#FCD34D' };
const PULSE = { unsafe: 'fast', watch: 'slow', safe: 'none', untested: 'none' };

export function useQualityLayer(active) {
  const tests = useQualityTests();
  const [selected, setSelected] = useState(null);
  const points = useMemo(() => testPoints(), []);
  const latest = useMemo(() => latestByPoint(tests), [tests]);

  const pins = useMemo(() => {
    if (!active) return [];
    return points.map((p) => {
      const t = latest[p.id];
      const status = t ? verdict(t).status : 'untested';
      return {
        id: p.id,
        at: p.at,
        color: QUALITY[status].color,
        label: p.type === 'tap' ? p.label.split(' ').pop() : p.type === 'tank' ? 'Tank' : 'Source',
        selected: p.id === selected,
        pulse: PULSE[status],
        ariaLabel: `${p.label}: ${QUALITY[status].label}`,
      };
    });
  }, [active, points, latest, selected]);

  const houseColors = useMemo(() => {
    if (!active) return null;
    const tint = {};
    return Object.fromEntries(
      fieldLayout().houses.map((h) => {
        tint[h.zone] ??= ZONE_TINT[zoneQuality(h.zone, tests)] ?? null;
        return [h.id, tint[h.zone]];
      }),
    );
  }, [active, tests]);

  const point = points.find((p) => p.id === selected);
  const test = point && latest[point.id];
  const v = test && verdict(test);

  return {
    pins,
    onPinClick: setSelected,
    houseColors,
    toolbar: (
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        {['safe', 'watch', 'unsafe'].map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <Dot color={QUALITY[s].color} />
            {QUALITY[s].label}
          </span>
        ))}
        <span>Homes are tinted when their zone's water is under watch or unsafe.</span>
        <Link to="/gp/quality" className="font-semibold text-black">
          Log a test
        </Link>
      </div>
    ),
    card: point ? (
      <MapCard title={point.label} subtitle={test ? `${fmtDate(test.date)} · ${test.tester}` : 'Not tested yet'} onClose={() => setSelected(null)}>
        {v ? (
          <>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-xs">
              <Dot color={QUALITY[v.status].color} />
              {QUALITY[v.status].label}
            </p>
            <ul className="text-xs text-white/85">
              {Object.entries(test.values).map(([k, val]) => (
                <li key={k}>
                  {k === 'bacteria' ? `Bacteria: ${val}` : `${k[0].toUpperCase()}${k.slice(1)}: ${val}`}
                  {v.issues.some((i) => i.param.id === k) && ' ⚠'}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-white/80">No test recorded at this point.</p>
        )}
      </MapCard>
    ) : null,
    panel: null,
  };
}
