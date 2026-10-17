import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { areaStatus, complaintStatus, S } from '../../demo/steps';
import { CITIZEN_AREA, scheduleFor } from '../../data/seed';
import { LevelChip, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';

const TONE = {
  normal: 'from-green-50 to-white border-green-200',
  warning: 'from-amber-50 to-white border-amber-200',
  problem: 'from-red-50 to-white border-red-200',
};

export default function CitizenHome() {
  const { t } = useTranslation();
  const { step } = useDemo();
  const status = areaStatus(step, CITIZEN_AREA);
  const schedule = scheduleFor(CITIZEN_AREA);
  const cStatus = complaintStatus(step);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <section className={`rounded-2xl border bg-gradient-to-b p-5 shadow-card ${TONE[status.level]}`} aria-live="polite">
        <div className="mb-2 flex items-center justify-between">
          <LevelChip level={status.level} />
          <SimBadge />
        </div>
        <div className="flex items-start gap-3">
          <Icon name={status.level === 'normal' ? 'drop' : 'alert'} className="mt-1 h-8 w-8 shrink-0 text-brand-600" />
          <p className="text-xl font-bold leading-snug">{t(status.key)}</p>
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="clock" className="h-6 w-6 text-brand-600" />
          <h2 className="section-title">{t('home.timing')}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {schedule.windows.map(([a, b]) => (
            <div key={a} className="rounded-xl bg-brand-50 p-3 text-center">
              <p className="text-lg font-bold">
                {a} – {b}
              </p>
            </div>
          ))}
        </div>
      </section>

      <Link to="/citizen/report" className="flex min-h-20 items-center gap-4 rounded-2xl bg-gradient-to-b from-brand-500 to-brand-600 p-5 text-white shadow-card">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
          <Icon name="alert" className="h-7 w-7" />
        </span>
        <span className="flex-1">
          <span className="block text-xl font-bold">{t('home.reportCta')}</span>
          <span className="block text-sm text-white/85">{t('home.reportSub')}</span>
        </span>
        <Icon name="arrow" className="h-6 w-6" />
      </Link>

      <section className="card p-5">
        <h2 className="section-title mb-3">{t('home.myComplaints')}</h2>
        {cStatus ? (
          <Link to="/citizen/complaints/2048" className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
            <Icon name="list" className="h-6 w-6 text-brand-600" />
            <span className="flex-1">
              <span className="block font-semibold">#2048 · {t('category.LOW_WATER')}</span>
              <span className="block text-sm text-muted">
                {t(step >= S.VERIFIED ? 'timeline.restored' : step >= S.ASSIGNED ? 'timeline.repairStarted' : step >= S.INCIDENT ? 'timeline.checking' : 'timeline.received')}
              </span>
            </span>
            <Icon name="arrow" />
          </Link>
        ) : (
          <p className="text-muted">{t('home.none')}</p>
        )}
      </section>
    </div>
  );
}
