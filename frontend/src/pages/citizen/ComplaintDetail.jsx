import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { S, storyCode } from '../../demo/steps';
import { areas, story } from '../../data/seed';
import { PageHeader } from '../../components/ui';
import { Ripple } from '../../components/water';
import Timeline from './Timeline';

export default function ComplaintDetail() {
  const { code } = useParams();
  const { t } = useTranslation();
  const { step, report } = useDemo();
  const c = story.complaints.find((x) => x.public_code === code);
  if (!c || code !== storyCode(report) || step < S.REPORTED) return <Navigate to="/citizen/complaints" replace />;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title={`#${c.public_code} — ${t(`category.${c.category}`)}`} subtitle={areas[c.service_area_id].name} />

      <section className="card p-6">
        <Timeline step={step} />
      </section>

      {step >= S.VERIFIED && (
        <section className="card flex items-center gap-4 p-5" aria-live="polite">
          <Ripple icon="checkCircle" />
          <p className="font-medium">{t('detail.restoredMsg')}</p>
        </section>
      )}

      <Link to="/citizen" className="btn-outline">
        {t('detail.stillProblem')}
      </Link>
    </div>
  );
}
