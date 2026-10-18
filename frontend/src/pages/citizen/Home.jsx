import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { areaStatus, complaintStatus, S, storyCode } from '../../demo/steps';
import { CITIZEN_AREA, dataSource, fmtDate, fmtTime, scheduleFor } from '../../data/seed';
import { apiFetch } from '../../data/api';
import { usePolling } from '../../data/telemetry';
import { LevelChip, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';
import { Waves, WaterLevel } from '../../components/water';
import { latestByPoint, QUALITY, useQualityTests, zoneQuality } from '../../data/quality';

/** Latest field-test verdict for the villager's area; a boil-water notice when it failed. */
function QualityNote() {
  const { t } = useTranslation();
  const tests = useQualityTests();
  const status = zoneQuality(CITIZEN_AREA, tests);
  const last = Object.values(latestByPoint(tests))
    .filter((x) => x.point.zone === CITIZEN_AREA)
    .map((x) => x.date)
    .sort()
    .at(-1);
  const unsafe = status === 'unsafe';
  return (
    <section className={`card animate-fade-rise-delay p-6 ${unsafe ? 'border-rose-200 bg-rose-50/80' : ''}`} aria-live="polite">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="flask" className="h-5 w-5 text-teal-600" />
        <h2 className="section-title">{t('quality.title')}</h2>
      </div>
      <p className="flex items-start gap-3">
        <span className="mt-1.5 inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: QUALITY[status].color }} />
        <span className={unsafe ? 'font-medium text-rose-900' : ''}>{t(`quality.${status}`, { date: fmtDate(last) })}</span>
      </p>
      <p className="mt-2 text-xs text-muted">{t('quality.who')}</p>
    </section>
  );
}

/** API mode: the villager's in-app notifications, newest first. */
function Updates() {
  const { t } = useTranslation();
  const { data } = usePolling(() => apiFetch('/notifications/mine', { role: 'citizen' }), 10000);
  return (
    <section className="card p-6">
      <h2 className="section-title mb-3">{t('notify.title')}</h2>
      {!data?.length ? (
        <p className="text-muted">{t('notify.none')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((n) => (
            <li key={`${n.message_key}-${n.complaint_code}`} className="flex gap-3">
              <Icon name="drop" className="mt-0.5 h-5 w-5 shrink-0 text-water-600" />
              <span>
                <span className="block">{t(`notify.${n.message_key}`, { code: n.complaint_code })}</span>
                <span className="block text-sm text-muted">{fmtTime(n.at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">{t('notify.channel')}</p>
    </section>
  );
}

// The orb pictures the area's status; it is not a measured level.
const ORB = { normal: { value: 0.78, tone: 'water' }, warning: { value: 0.42, tone: 'warning' }, problem: { value: 0.18, tone: 'problem' } };

export default function CitizenHome() {
  const { t } = useTranslation();
  const { step, report } = useDemo();
  const code = storyCode(report);
  const status = areaStatus(step, CITIZEN_AREA);
  const schedule = scheduleFor(CITIZEN_AREA);
  const cStatus = complaintStatus(step);

  return (
    <div className="mx-auto grid max-w-6xl items-start gap-5 lg:grid-cols-2">
      <section className="card animate-fade-rise p-6" aria-live="polite">
        <div className="mb-4 flex items-center justify-between">
          <LevelChip level={status.level} />
          <SimBadge />
        </div>
        <div className="flex items-center gap-5">
          <WaterLevel {...ORB[status.level]} label={<Icon name={status.level === 'normal' ? 'drop' : 'alert'} className="h-8 w-8" />} size={104} />
          <p className="font-display text-3xl leading-tight tracking-tight">{t(status.key)}</p>
        </div>
      </section>

      <section className="card animate-fade-rise-delay p-6">
        <div className="mb-4 flex items-center gap-2">
          <Icon name="clock" className="h-5 w-5 text-water-600" />
          <h2 className="section-title">{t('home.timing')}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {schedule.windows.map(([a, b]) => (
            <div key={a} className="relative overflow-hidden rounded-2xl border border-water-100 bg-water-50 p-4 text-center">
              <Waves className="absolute inset-x-0 bottom-0 h-4 text-water-100" />
              <p className="relative whitespace-nowrap font-display text-2xl tracking-tight sm:text-3xl">
                {a} – {b}
              </p>
            </div>
          ))}
        </div>
      </section>

      <QualityNote />

      <Link to="/citizen/report" className="relative flex min-h-20 animate-fade-rise-delay-2 items-center gap-4 overflow-hidden rounded-3xl bg-black p-5 text-white shadow-card transition-transform duration-200 hover:scale-[1.02]">
        <Waves className="absolute inset-x-0 bottom-0 h-8 text-white/10" />
        <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
          <Icon name="alert" className="h-7 w-7" />
        </span>
        <span className="relative flex-1">
          <span className="block font-display text-2xl tracking-tight">{t('home.reportCta')}</span>
          <span className="block text-sm text-white/70">{t('home.reportSub')}</span>
        </span>
        <Icon name="arrow" className="relative h-6 w-6" />
      </Link>

      <section className="card p-6">
        <h2 className="section-title mb-3">{t('home.myComplaints')}</h2>
        {cStatus ? (
          <Link to={`/citizen/complaints/${code}`} className="flex items-center gap-3 rounded-2xl border border-black/[0.08] p-3 transition hover:border-water-300 hover:bg-water-50">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-water-50 text-water-600">
              <Icon name="drop" className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">#{code} · {t(`category.${report?.category ?? 'LOW_WATER'}`)}</span>
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

      {dataSource === 'api' && <Updates />}
    </div>
  );
}
