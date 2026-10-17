import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { S, storyCode } from '../../demo/steps';
import { story, fmtTime } from '../../data/seed';
import Icon from '../../components/Icon';

export default function MyComplaints() {
  const { t } = useTranslation();
  const { step, report } = useDemo();
  const code = storyCode(report);
  const mine = step >= S.REPORTED ? story.complaints.filter((c) => c.public_code === code) : [];

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="page-title mb-4">{t('nav.complaints')}</h1>
      {mine.length === 0 && <p className="card p-5 text-muted">{t('home.none')}</p>}
      {mine.map((c) => (
        <Link key={c.public_code} to={`/citizen/complaints/${c.public_code}`} className="card flex items-center gap-3 p-4 hover:bg-slate-50">
          <Icon name="drop" className="h-7 w-7 text-brand-600" />
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
