import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { areas, fmtTime } from '../../data/seed';
import { useMyComplaints } from '../../data/myComplaints';
import Icon from '../../components/Icon';
import { EmptyState, PageHeader } from '../../components/ui';

/** Status pill: the complaint's latest step; green once water is back. */
export function StatusPill({ c }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.closed ? 'bg-emerald-50 text-emerald-800' : 'bg-sky-50 text-sky-800'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.closed ? 'bg-emerald-500' : 'bg-sky-500'}`} />
      {t(c.statusKey)}
    </span>
  );
}

/** One row: track ID, problem, where and when, how it was reported, and where it stands. */
export function ComplaintRow({ c }) {
  const { t } = useTranslation();
  return (
    <Link to={`/citizen/complaints/${c.code}`} className="card flex items-center gap-4 p-4 transition hover:border-water-300">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-water-50 text-water-600">
        <Icon name={c.channel === 'APP' ? 'drop' : 'phone'} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            #{c.code} · {t(`category.${c.category}`)}
          </span>
          <StatusPill c={c} />
        </span>
        <span className="block truncate text-sm text-muted">
          {areas[c.area]?.name}
          {c.createdAt ? ` · ${fmtTime(c.createdAt)}` : ''} · {t(`track.via.${c.channel}`)}
        </span>
      </span>
      <Icon name="arrow" />
    </Link>
  );
}

export default function MyComplaints() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { list, loading } = useMyComplaints();
  const [id, setId] = useState('');
  const open = list.filter((c) => !c.closed);
  const closed = list.filter((c) => c.closed);

  const track = (e) => {
    e.preventDefault();
    const code = id.trim().replace(/^#/, '');
    if (code) navigate(`/citizen/complaints/${code}`);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title={t('nav.complaints')} subtitle={list.length ? t('track.count', { count: list.length }) : undefined}>
        <Link to="/citizen/report" className="btn-primary">
          {t('track.another')}
        </Link>
      </PageHeader>

      <form onSubmit={track} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="section-title block">{t('track.title')}</span>
          <span className="mt-1 block text-muted">{t('track.hint')}</span>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            inputMode="numeric"
            placeholder="2048"
            aria-label={t('track.id')}
            className="mt-2 min-h-12 w-full rounded-full border border-black/15 bg-white/80 px-5 font-display text-2xl tracking-tight focus:border-black"
          />
        </label>
        <button type="submit" className="btn-primary min-h-12">
          {t('track.button')}
        </button>
      </form>

      {!loading && list.length === 0 && <EmptyState title={t('home.none')} />}
      {open.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">
            {t('track.open')} · {open.length}
          </h2>
          {open.map((c) => (
            <ComplaintRow key={c.code} c={c} />
          ))}
        </section>
      )}
      {closed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">
            {t('track.closed')} · {closed.length}
          </h2>
          {closed.map((c) => (
            <ComplaintRow key={c.code} c={c} />
          ))}
        </section>
      )}
    </div>
  );
}
