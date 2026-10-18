import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { S, storyCode } from '../../demo/steps';
import { story, fmtTime } from '../../data/seed';
import Icon from '../../components/Icon';
import { EmptyState, PageHeader } from '../../components/ui';

export default function MyComplaints() {
  const { t } = useTranslation();
  const { step, report } = useDemo();
  const code = storyCode(report);
  const mine = step >= S.REPORTED ? story.complaints.filter((c) => c.public_code === code) : [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('nav.complaints')} />
      {mine.length === 0 && <EmptyState title={t('home.none')} />}
      {mine.map((c) => (
        <Link key={c.public_code} to={`/citizen/complaints/${c.public_code}`} className="card flex items-center gap-4 p-4 transition hover:border-water-300">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-water-50 text-water-600">
            <Icon name="drop" className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">
              #{c.public_code} · {t(`category.${c.category}`)}
            </span>
            <span className="block text-sm text-muted">{fmtTime(c.created_at)}</span>
          </span>
          <Icon name="arrow" />
        </Link>
      ))}
    </div>
  );
}
