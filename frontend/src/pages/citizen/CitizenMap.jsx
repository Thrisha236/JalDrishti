import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import VillageMap from '../../components/VillageMap';
import { PageHeader } from '../../components/ui';

export default function CitizenMap() {
  const { t } = useTranslation();
  const { step } = useDemo();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('nav.map')} />
      <div className="card p-3">
        <VillageMap step={step} mode="citizen" />
      </div>
    </div>
  );
}
