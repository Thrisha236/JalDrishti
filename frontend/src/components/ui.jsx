import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { Ripple, Waves, WaveRule } from './water';

const LEVEL = {
  normal: { cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: 'checkCircle' },
  warning: { cls: 'bg-amber-50 text-amber-800 border-amber-200', icon: 'alert' },
  problem: { cls: 'bg-rose-50 text-rose-800 border-rose-200', icon: 'alert' },
  info: { cls: 'bg-sky-50 text-sky-800 border-sky-200', icon: 'clock' },
  neutral: { cls: 'bg-white text-muted border-black/10', icon: 'clock' },
};

/**
 * One colour per kind of information, used on card headers and navigation:
 * water & sensors (sky), alerts (rose), pipeline risk (amber), maintenance (violet),
 * people & complaints (orange), maps (emerald), records (indigo), verification (teal), evidence (cyan).
 */
export const ACCENT = {
  water: { bar: 'from-sky-400 to-cyan-400', chip: 'bg-sky-50 text-sky-700', text: 'text-sky-600', icon: 'drop' },
  alert: { bar: 'from-rose-400 to-orange-300', chip: 'bg-rose-50 text-rose-700', text: 'text-rose-600', icon: 'alert' },
  risk: { bar: 'from-amber-300 to-orange-400', chip: 'bg-amber-50 text-amber-700', text: 'text-amber-600', icon: 'pipe' },
  task: { bar: 'from-violet-400 to-indigo-400', chip: 'bg-violet-50 text-violet-700', text: 'text-violet-600', icon: 'wrench' },
  people: { bar: 'from-orange-300 to-amber-300', chip: 'bg-orange-50 text-orange-700', text: 'text-orange-600', icon: 'users' },
  map: { bar: 'from-emerald-400 to-teal-400', chip: 'bg-emerald-50 text-emerald-700', text: 'text-emerald-600', icon: 'map' },
  record: { bar: 'from-indigo-300 to-sky-300', chip: 'bg-indigo-50 text-indigo-700', text: 'text-indigo-600', icon: 'list' },
  verify: { bar: 'from-teal-400 to-emerald-400', chip: 'bg-teal-50 text-teal-700', text: 'text-teal-600', icon: 'shield' },
  evidence: { bar: 'from-cyan-400 to-sky-500', chip: 'bg-cyan-50 text-cyan-700', text: 'text-cyan-600', icon: 'chart' },
};

// When a card does not name its accent, pick one from its title.
const ACCENT_RULES = [
  [/alert/i, 'alert'],
  [/restoration|verif|progress/i, 'verify'],
  [/task|maintenance|assignment|repair|action/i, 'task'],
  [/complaint|village|report/i, 'people'],
  [/map|location|zone/i, 'map'],
  [/pipeline|risk|inspection|failure|cause/i, 'risk'],
  [/sensor|pressure|flow|supply|water|tank|pump/i, 'water'],
  [/history|profile|version|publish|record/i, 'record'],
  [/suggest|evidence|decision|missing|caveat/i, 'evidence'],
];

function accentFor(title) {
  if (typeof title !== 'string') return 'water';
  return ACCENT_RULES.find(([re]) => re.test(title))?.[1] ?? 'water';
}

const BAND_LEVEL = { HIGH: 'problem', MEDIUM: 'warning', LOW: 'normal' };

/** Status chip: always an icon plus a word, never colour alone. */
export function Chip({ level = 'neutral', children, className = '' }) {
  const l = LEVEL[level] ?? LEVEL.neutral;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${l.cls} ${className}`}>
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
    <span className="inline-flex items-center rounded-full border border-black/10 px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-muted">
      {children ?? t('app.simulated')}
    </span>
  );
}

export function Card({ title, action, children, className = '', accent }) {
  const a = ACCENT[accent ?? accentFor(title)];
  return (
    <section className={`card relative p-6 ${className}`}>
      {title && <span className={`absolute inset-x-8 top-0 h-[3px] rounded-b-full bg-gradient-to-r ${a.bar}`} aria-hidden="true" />}
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-3">
          {title && (
            <div className="flex min-w-0 items-center gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${a.chip}`}>
                <Icon name={a.icon} className="h-[18px] w-[18px]" />
              </span>
              <h2 className="section-title">{title}</h2>
            </div>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, level = 'neutral', note, icon = 'chart' }) {
  const l = LEVEL[level] ?? LEVEL.neutral;
  const tide = { problem: 'text-rose-100', warning: 'text-amber-100', normal: 'text-emerald-50' }[level] ?? 'text-sky-50';
  return (
    <div className="card relative flex items-center gap-4 overflow-hidden p-5">
      <Waves className={`absolute inset-x-0 bottom-0 h-6 ${tide}`} />
      <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${l.cls}`}>
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div className="relative min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 font-display text-5xl leading-none tracking-tight">{value}</p>
        {note && <p className="mt-1 truncate text-xs text-muted">{note}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'drop', title, children }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <Ripple icon={icon} tone="soft" className="mb-2" />
      <p className="section-title">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Page heading. Text after " — " is set in grey italics, like the landing headline. */
export function PageHeader({ title, subtitle, children }) {
  const [main, emphasis] = typeof title === 'string' ? title.split(' — ') : [title];
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="animate-fade-rise">
        <h1 className="page-title">
          {main}
          {emphasis && <em className="text-muted"> {emphasis}</em>}
        </h1>
        <WaveRule className="mt-3" />
        {subtitle && <p className="mt-3 max-w-2xl text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
