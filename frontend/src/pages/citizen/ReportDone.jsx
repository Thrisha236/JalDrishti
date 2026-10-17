import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { S } from '../../demo/steps';
import Icon from '../../components/Icon';
import Timeline from './Timeline';

export default function ReportDone() {
  const { t } = useTranslation();
  const { step, photoUrl } = useDemo();
  const [checking, setChecking] = useState(Boolean(photoUrl));

  useEffect(() => {
    if (!photoUrl) return undefined;
    const id = setTimeout(() => setChecking(false), 1600);
    return () => clearTimeout(id);
  }, [photoUrl]);

  if (step < S.REPORTED) return <Navigate to="/citizen/report" replace />;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      {photoUrl && (
        <section className="card p-4" aria-live="polite">
          <div className="flex gap-3">
            <img src={photoUrl} alt="Your photo" className="h-20 w-20 rounded-xl object-cover" />
            {checking ? (
              <p className="flex items-center gap-2 font-semibold">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                {t('done.checking')}
              </p>
            ) : (
              <p className="font-semibold">{t('done.observation')}</p>
            )}
          </div>
          {!checking && <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{t('done.disclaimer')}</p>}
        </section>
      )}

      <section className="card p-5 text-center">
        <span className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-b from-green-50 to-green-100 text-green-700 shadow-card">
          <Icon name="shield" className="h-9 w-9" />
        </span>
        <h1 className="text-2xl font-bold">{t('done.received', { code: '2048' })}</h1>
        <div className="mt-4 text-left">
          <Timeline step={step} />
        </div>
        <Link to="/citizen/complaints/2048" className="btn-primary mt-4 w-full">
          {t('done.track')}
        </Link>
      </section>
    </div>
  );
}
