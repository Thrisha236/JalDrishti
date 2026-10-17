// Alerts from the rules engine. Water alerts and equipment alerts look different on purpose:
// a silent or faulty sensor must never read like a water-supply failure.
import { assets, fmtTime, labelOf } from '../data/seed';
import { Chip } from './ui';
import Icon from './Icon';

export default function LiveAlerts({ alerts, compact = false }) {
  if (!alerts) return null;
  if (alerts.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
        <Icon name="checkCircle" className="h-5 w-5" />
        No live alerts. All trusted sensors are within their rules.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => {
        const water = a.kind === 'WATER_SERVICE';
        return (
          <li key={a.id} className={`flex flex-wrap items-start gap-3 rounded-xl border p-3 ${water ? 'border-red-200 bg-red-50' : 'border-slate-300 bg-slate-50'}`}>
            {water ? <Chip level="problem">Water · {a.severity}</Chip> : <Chip level="neutral">Equipment</Chip>}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{a.text}</p>
              {!compact && (
                <p className="text-xs text-muted">
                  {a.id} · {labelOf(a.rule_code)} · {assets[a.asset_id]?.code ?? a.asset_id} · since {fmtTime(a.raised_at)}
                  {a.details?.supply_window && ` · ${a.details.supply_window}`}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
