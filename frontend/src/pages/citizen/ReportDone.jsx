import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { S, storyCode } from '../../demo/steps';
import { Ripple } from '../../components/water';
import Timeline from './Timeline';

export default function ReportDone() {
  const { t } = useTranslation();
  const { step, photoUrl, report } = useDemo();
  const [checking, setChecking] = useState(Boolean(photoUrl));

  useEffect(() => {
    if (!photoUrl) return undefined;
    const id = setTimeout(() => setChecking(false), 1600);
    return () => clearTimeout(id);
  }, [photoUrl]);

  if (step < S.REPORTED) return <Navigate to="/citizen/report" replace />;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      {photoUrl && (
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
                {!report?.observation || report.observation_code === 'POSSIBLE_VISIBLE_LEAK' ? t('done.observation') : report.observation}
              </p>
            )}
          </div>
          {!checking && <p className="mt-3 rounded-2xl bg-water-50 p-3 text-sm text-muted">{t('done.disclaimer')}</p>}
        </section>
      )}

      <section className="card p-6 text-center">
        <Ripple icon="shield" size="lg" className="mx-auto mb-5 mt-2" />
        <h1 className="font-display text-4xl leading-none tracking-tight">{t('done.received', { code: storyCode(report) })}</h1>
        <div className="mt-4 text-left">
          <Timeline step={step} />
        </div>
        <Link to={`/citizen/complaints/${storyCode(report)}`} className="btn-primary mt-4 w-full">
          {t('done.track')}
        </Link>
      </section>
    </div>
  );
}
