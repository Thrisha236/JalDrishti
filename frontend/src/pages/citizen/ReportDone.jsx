import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { useMyComplaints } from '../../data/myComplaints';
import { Ripple } from '../../components/water';
import Timeline from './Timeline';

const RECEIVED_ONLY = [
  { key: 'timeline.received', at: null, done: true },
  { key: 'timeline.checking', at: null, done: false },
  { key: 'timeline.repairStarted', at: null, done: false },
  { key: 'timeline.restored', at: null, done: false },
];

/** Confirmation for the complaint just sent: its track ID, the photo check and its timeline. */
export default function ReportDone() {
  const { t } = useTranslation();
  const { state } = useLocation();
  const { photoUrl } = useDemo();
  const { list } = useMyComplaints();
  const submitted = state?.submitted;
  const [checking, setChecking] = useState(Boolean(photoUrl && submitted?.hasPhoto));

  useEffect(() => {
    if (!checking) return undefined;
    const id = setTimeout(() => setChecking(false), 1600);
    return () => clearTimeout(id);
  }, [checking]);

  if (!submitted) return <Navigate to="/citizen/complaints" replace />;
  const code = submitted.public_code;
  const events = list.find((c) => c.code === code)?.events ?? RECEIVED_ONLY;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      {photoUrl && submitted.hasPhoto && (
        <section className="card p-4" aria-live="polite">
          <div className="flex gap-3">
            <img src={photoUrl} alt="Your photo" className="h-20 w-20 rounded-2xl object-cover" />
            {checking ? (
              <p className="flex items-center gap-2 font-semibold">
                <Ripple size="sm" tone="soft" />
                {t('done.checking')}
              </p>
            ) : (
              <p className="font-semibold">
                {/* Translated text for the standard observation; other categories show the server's message. */}
                {!submitted.observation || submitted.observation_code === 'POSSIBLE_VISIBLE_LEAK' ? t('done.observation') : submitted.observation}
              </p>
            )}
          </div>
          {!checking && <p className="mt-3 rounded-2xl bg-water-50 p-3 text-sm text-muted">{t('done.disclaimer')}</p>}
        </section>
      )}

      <section className="card p-6 text-center">
        <Ripple icon="shield" size="lg" className="mx-auto mb-5 mt-2" />
        <h1 className="font-display text-4xl leading-none tracking-tight">{t('done.received', { code })}</h1>
        <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-4 py-1.5 text-sm">
          {t('track.id')}: <span className="font-display text-2xl leading-none">{code}</span>
        </p>
        <p className="mt-2 text-sm text-muted">{t('track.keep')}</p>
        <div className="mt-5 text-left">
          <Timeline events={events} />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link to={`/citizen/complaints/${code}`} className="btn-primary">
            {t('done.track')}
          </Link>
          <Link to="/citizen/report" className="btn-outline">
            {t('track.another')}
          </Link>
        </div>
      </section>
    </div>
  );
}
