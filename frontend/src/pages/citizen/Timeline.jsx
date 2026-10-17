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
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${it.done ? 'bg-green-600 text-white' : 'border-2 border-slate-300 bg-white text-slate-300'}`}>
              <Icon name="check" className="h-4 w-4" />
            </span>
            {i < items.length - 1 && <span className={`mt-1 h-6 w-0.5 ${items[i + 1].done ? 'bg-green-600' : 'bg-slate-200'}`} />}
          </span>
          <span>
            <span className={`block font-semibold ${it.done ? '' : 'text-muted'}`}>{t(it.key)}</span>
            {it.done && it.at && <span className="block text-sm text-muted">{fmtTime(it.at)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
