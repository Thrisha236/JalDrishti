import { useState } from 'react';
import { apiFetch } from '../../data/api';
import { dataSource, fmtTime } from '../../data/seed';
import { usePolling } from '../../data/telemetry';
import { Card, Chip, EmptyState, PageHeader } from '../../components/ui';
import Icon from '../../components/Icon';

const ENTITIES = ['', 'complaint', 'incident', 'task', 'alert', 'water_quality_test', 'service_check', 'risk_config'];

export default function Audit() {
  const [entity, setEntity] = useState('');
  const q = new URLSearchParams({ limit: '80', ...(entity ? { entity } : {}) });
  const { data: rows } = usePolling(() => apiFetch(`/audit?${q}`, { role: 'officer' }), 10000, dataSource === 'api', entity);
  const { data: sys } = usePolling(() => apiFetch('/system', { role: 'officer' }), 30000, dataSource === 'api');

  if (dataSource !== 'api') {
    return (
      <div>
        <PageHeader title="Audit and system" />
        <EmptyState icon="shield" title="The backend is not running">The audit log is kept by the server. Start it, then reload.</EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Audit and system" subtitle="Who did what, when, and how this deployment is set up." />

      {sys && (
        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          <Card title="This deployment" accent="record">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[['Environment', sys.environment], ['Database', sys.database], ['Demo mode', sys.demo_mode ? 'On' : 'Off'], ['Readings kept for', sys.readings_retention_days ? `${sys.readings_retention_days} days` : 'forever'], ['Sensor readings', sys.counts.readings], ['Alerts', sys.counts.alerts], ['Reports', sys.counts.complaints], ['Platform messages (mock)', sys.counts.integration_messages]].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Safeguards" accent="verify">
            <ul className="flex flex-col gap-2 text-sm">
              {[
                ['Passwords stored as scrypt hashes', true],
                [`Sign-in lockout after ${sys.safeguards.login_lockout_after} failures`, true],
                [`Rate limit ${sys.safeguards.rate_limit_per_minute || 'off'} requests a minute per client`, sys.safeguards.rate_limit_per_minute > 0],
                ['Security headers on every response', sys.safeguards.security_headers],
                ['Photos: location data removed, owner-only viewing', sys.safeguards.photos_exif_stripped],
                [`Tokens expire after ${sys.safeguards.token_ttl_hours} hours`, true],
              ].map(([label, on]) => (
                <li key={label} className="flex items-center gap-2">
                  <Icon name={on ? 'checkCircle' : 'alert'} className={`h-4 w-4 shrink-0 ${on ? 'text-emerald-600' : 'text-amber-500'}`} />
                  {label}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Card title="Audit log" accent="record" action={
        <select aria-label="Filter by what changed" value={entity} onChange={(e) => setEntity(e.target.value)} className="min-h-10 rounded-xl border border-black/15 bg-white/80 px-3 text-sm">
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e ? e.replaceAll('_', ' ') : 'Everything'}
            </option>
          ))}
        </select>
      }>
        {!rows ? (
          <p className="text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">Nothing recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Who</th>
                  <th className="pb-2 font-medium">Did</th>
                  <th className="pb-2 font-medium">To</th>
                  <th className="pb-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-black/[0.06] align-top">
                    <td className="py-2.5 whitespace-nowrap text-muted">{fmtTime(r.at)}</td>
                    <td className="py-2.5">
                      {r.actor} {r.role && <Chip level="neutral">{r.role}</Chip>}
                    </td>
                    <td className="py-2.5 font-medium">{r.action.replaceAll('_', ' ')}</td>
                    <td className="py-2.5">
                      {r.entity.replaceAll('_', ' ')} <span className="text-muted">{r.entity_id}</span>
                    </td>
                    <td className="py-2.5 text-xs text-muted">{r.details ? Object.entries(r.details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Free text, photos and passwords are never written to the log.</p>
      </Card>
    </div>
  );
}
