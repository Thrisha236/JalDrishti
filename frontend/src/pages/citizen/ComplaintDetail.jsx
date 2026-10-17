import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { S, storyCode } from '../../demo/steps';
import { areas, story } from '../../data/seed';
import Icon from '../../components/Icon';
import Timeline from './Timeline';

export default function ComplaintDetail() {
  const { code } = useParams();
  const { t } = useTranslation();
  const { step, report } = useDemo();
  const c = story.complaints.find((x) => x.public_code === code);
  if (!c || code !== storyCode(report) || step < S.REPORTED) return <Navigate to="/citizen/complaints" replace />;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="page-title">
        #{c.public_code} · {t(`category.${c.category}`)}
      </h1>
      <p className="-mt-3 text-muted">{areas[c.service_area_id].name}</p>

      <section className="card p-5">
        <Timeline step={step} />
      </section>

      {step >= S.VERIFIED && (
        <section className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-900" aria-live="polite">
          <Icon name="checkCircle" className="h-7 w-7 shrink-0" />
          <p className="font-semibold">{t('detail.restoredMsg')}</p>
        </section>
      )}

      <Link to="/citizen" className="btn-outline">
        {t('detail.stillProblem')}
      </Link>
    </div>
  );
}
