import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { openIncidentCount } from '../../demo/steps';
import { areas, assets, currentIncidentCode, riskFor, STORY_ASSET } from '../../data/seed';
import { Card, PageHeader, RiskChip } from '../../components/ui';
import NetworkMap from '../../components/NetworkMap';
import { useLiveTelemetry } from '../../data/telemetry';

export default function GpMap() {
  const { step } = useDemo();
  const [selected, setSelected] = useState('ast-p21');
  const asset = assets[selected];
  const risk = riskFor(selected);
  const isStory = selected === STORY_ASSET;
  const { data: telemetry } = useLiveTelemetry({ withSeries: false });

  return (
    <div>
      <PageHeader title="Village Map — Ramapuram" subtitle="Tap a pipeline to see its record, or switch to Sensors to see which field sensors are healthy, faulty or due for servicing." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <NetworkMap step={step} selected={selected} onSelect={setSelected} telemetry={telemetry} />
        </Card>
        <Card title={`Pipeline ${asset.code}`}>
          <p className="mb-2 text-muted">
            {asset.name} · {areas[asset.service_area_id].name}
          </p>
          {risk && <RiskChip risk={risk} />}
          {isStory && openIncidentCount(step) > 0 && (
            <p className="mt-3 text-sm">
              Open incident <Link to={`/gp/incidents/${currentIncidentCode()}`} className="font-semibold text-brand-600">{currentIncidentCode()}</Link> · ≈ {areas[asset.service_area_id].household_count} households (estimate from zone register)
            </p>
          )}
          <Link to={`/gp/pipelines/${selected}`} className="btn-outline mt-4 w-full">
            Open health record
          </Link>
        </Card>
      </div>
    </div>
  );
}
