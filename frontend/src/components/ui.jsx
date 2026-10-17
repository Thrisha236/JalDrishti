import { useTranslation } from 'react-i18next';
import Icon from './Icon';

const LEVEL = {
  normal: { cls: 'bg-green-50 text-green-800 border-green-200', icon: 'checkCircle' },
  warning: { cls: 'bg-amber-50 text-amber-800 border-amber-200', icon: 'alert' },
  problem: { cls: 'bg-red-50 text-red-800 border-red-200', icon: 'alert' },
  info: { cls: 'bg-sky-50 text-sky-800 border-sky-200', icon: 'clock' },
  neutral: { cls: 'bg-slate-100 text-slate-700 border-slate-200', icon: 'clock' },
};

const BAND_LEVEL = { HIGH: 'problem', MEDIUM: 'warning', LOW: 'normal' };

/** Status chip: always an icon plus a word, never colour alone. */
export function Chip({ level = 'neutral', children, className = '' }) {
  const l = LEVEL[level] ?? LEVEL.neutral;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${l.cls} ${className}`}>
      <Icon name={l.icon} className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

export function LevelChip({ level }) {
  const { t } = useTranslation();
  return <Chip level={level}>{t(`level.${level}`)}</Chip>;
}

export function RiskChip({ risk }) {
  return (
    <Chip level={BAND_LEVEL[risk.band]}>
      {risk.score}/100 · {risk.band}
    </Chip>
  );
}

export function SimBadge({ children }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
      {children ?? t('app.simulated')}
    </span>
  );
}

export function Card({ title, action, children, className = '' }) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, level = 'neutral', note, icon = 'chart' }) {
  const l = LEVEL[level] ?? LEVEL.neutral;
  return (
    <div className="card flex items-center gap-4 p-4">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${l.cls}`}>
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {note && <p className="truncate text-xs text-muted">{note}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'clock', title, children }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-8 text-center">
      <Icon name={icon} className="h-8 w-8 text-slate-400" />
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
