import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { areas, fmtTime } from '../../data/seed';
import { useMyComplaints } from '../../data/myComplaints';
import { EmptyState, PageHeader } from '../../components/ui';
import { Ripple } from '../../components/water';
import { StatusPill } from './MyComplaints';
import Timeline from './Timeline';

/** Tracking page for one complaint, found by its track ID among the villager's own complaints. */
export default function ComplaintDetail() {
  const { code } = useParams();
  const { t } = useTranslation();
  const { list, loading } = useMyComplaints();
  const c = list.find((x) => x.code === code);

  if (!c) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <PageHeader title={t('track.title')} />
        {!loading && (
          <EmptyState icon="list" title={t('track.notFound', { code })}>
            <Link to="/citizen/complaints" className="btn-outline mt-3">
              {t('nav.complaints')}
            </Link>
          </EmptyState>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title={`#${c.code} — ${t(`category.${c.category}`)}`}
        subtitle={`${areas[c.area]?.name ?? ''}${c.createdAt ? ` · ${t('track.reported', { when: fmtTime(c.createdAt) })}` : ''} · ${t(`track.via.${c.channel}`)}`}
      >
        <StatusPill c={c} />
      </PageHeader>

      <section className="card p-6">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-4 py-1.5 text-sm">
          {t('track.id')}: <span className="font-display text-2xl leading-none">{c.code}</span>
        </p>
        <Timeline events={c.events} />
      </section>

      {c.closed && (
        <section className="card flex items-center gap-4 p-5" aria-live="polite">
          <Ripple icon="checkCircle" />
          <p className="font-medium">{t('detail.restoredMsg')}</p>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/citizen/report" className="btn-outline">
          {c.closed ? t('detail.stillProblem') : t('track.another')}
        </Link>
        <Link to="/citizen/complaints" className="btn-outline">
          {t('nav.complaints')}
        </Link>
      </div>
    </div>
  );
}
