import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { citizenTimeline, S, storyCode } from '../../demo/steps';
import { apiFetch } from '../../data/api';
import { dataSource, fmtTime } from '../../data/seed';
import { usePolling } from '../../data/telemetry';
import Icon from '../../components/Icon';

const LIVE_KEYS = { received: 'timeline.received', checking: 'timeline.checking', repair_started: 'timeline.repairStarted' };

/** API mode: real events for the villager's own complaint, including how it was closed. */
function useLiveTimeline(code, step) {
  const { advanceTo } = useDemo();
  const { data } = usePolling(() => apiFetch('/complaints/mine', { role: 'citizen' }), 10000, dataSource === 'api' && step >= S.REPORTED);
  const mine = data?.find((c) => c.public_code === code);
  const at = Object.fromEntries((mine?.progress ?? []).map((e) => [e.key, e.at]));
  const closedAt = at.restored ?? at.resolved_unverified;
  useEffect(() => {
    if (closedAt) advanceTo(S.VERIFIED);
  }, [closedAt, advanceTo]);
  if (!mine) return null;
  return [
    ...Object.entries(LIVE_KEYS).map(([k, key]) => ({ key, at: at[k] ?? null, done: Boolean(at[k]) })),
    { key: at.resolved_unverified ? 'timeline.resolvedUnverified' : 'timeline.restored', at: closedAt ?? null, done: Boolean(closedAt) },
  ];
}

export default function Timeline({ step }) {
  const { t } = useTranslation();
  const { report } = useDemo();
  const code = storyCode(report);
  const live = useLiveTimeline(code, step);
  const items = live ?? citizenTimeline(step, code);
  return (
    <ol className="relative flex flex-col gap-4">
      {items.map((it, i) => (
        <li key={it.key} className="flex gap-3">
          <span className="flex flex-col items-center">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${it.done ? 'bg-black text-white' : 'border border-water-200 bg-water-50 text-water-300'}`}>
              <Icon name={it.done ? 'drop' : 'clock'} className="h-4 w-4" />
            </span>
            {i < items.length - 1 && (
              <svg className="mt-1 h-6 w-2" viewBox="0 0 2 24" aria-hidden="true">
                <line x1="1" y1="0" x2="1" y2="24" strokeWidth="2" strokeLinecap="round" stroke={items[i + 1].done ? 'rgb(var(--water-600))' : 'rgb(var(--water-200))'} strokeDasharray={items[i + 1].done ? '3 5' : undefined} className={items[i + 1].done ? 'animate-flow' : ''} />
              </svg>
            )}
          </span>
          <span>
            <span className={`block font-medium ${it.done ? '' : 'text-muted'}`}>{t(it.key)}</span>
            {it.done && it.at && <span className="block text-sm text-muted">{fmtTime(it.at)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
