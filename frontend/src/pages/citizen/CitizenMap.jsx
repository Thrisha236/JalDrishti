import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import VillageMap from '../../components/VillageMap';

export default function CitizenMap() {
  const { t } = useTranslation();
  const { step } = useDemo();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="page-title mb-4">{t('nav.map')}</h1>
      <div className="card p-3">
        <VillageMap step={step} mode="citizen" />
      </div>
    </div>
  );
}
