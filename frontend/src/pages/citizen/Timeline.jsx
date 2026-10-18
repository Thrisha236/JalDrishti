import { useTranslation } from 'react-i18next';
import { fmtTime } from '../../data/seed';
import Icon from '../../components/Icon';

/** One complaint's progress: drop markers joined by a flowing pipe. `events` come from useMyComplaints. */
export default function Timeline({ events }) {
  const { t } = useTranslation();
  return (
    <ol className="relative flex flex-col gap-4">
      {events.map((it, i) => (
        <li key={it.key} className="flex gap-3">
          <span className="flex flex-col items-center">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${it.done ? 'bg-black text-white' : 'border border-water-200 bg-water-50 text-water-300'}`}>
              <Icon name={it.done ? 'drop' : 'clock'} className="h-4 w-4" />
            </span>
            {i < events.length - 1 && (
              <svg className="mt-1 h-6 w-2" viewBox="0 0 2 24" aria-hidden="true">
                <line x1="1" y1="0" x2="1" y2="24" strokeWidth="2" strokeLinecap="round" stroke={events[i + 1].done ? 'rgb(var(--water-600))' : 'rgb(var(--water-200))'} strokeDasharray={events[i + 1].done ? '3 5' : undefined} className={events[i + 1].done ? 'animate-flow' : ''} />
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
