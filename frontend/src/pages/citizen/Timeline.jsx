import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { citizenTimeline, storyCode } from '../../demo/steps';
import { fmtTime } from '../../data/seed';
import Icon from '../../components/Icon';

export default function Timeline({ step }) {
  const { t } = useTranslation();
  const { report } = useDemo();
  const items = citizenTimeline(step, storyCode(report));
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
