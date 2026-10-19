import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { dataSource, fmtTime } from '../../data/seed';
import { acknowledgeAlert, KIND_ICON, SEVERITY_TONE, useAlertFeed } from '../../data/ai';
import { Chip, EmptyState, Kpi, PageHeader, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';

const KIND_TINT = {
  WATER_SERVICE: 'bg-sky-50 text-sky-700',
  EQUIPMENT_HEALTH: 'bg-slate-100 text-slate-700',
  AI_PREDICTION: 'bg-fuchsia-50 text-fuchsia-700',
  WATER_QUALITY: 'bg-teal-50 text-teal-700',
  COMMUNITY: 'bg-orange-50 text-orange-700',
};

const age = (min) => (min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`);

function AlertRow({ a, role, onAck }) {
  const [busy, setBusy] = useState(false);
  const ack = async () => {
    setBusy(true);
    try {
      await acknowledgeAlert(a.id, role);
      onAck();
    } catch {
      /* the next refresh shows the truth */
    }
    setBusy(false);
  };
  const base = role === 'officer' ? '/officer' : '/gp';
  return (
    <li className={`rounded-2xl border p-4 ${a.escalated ? 'border-rose-300 bg-rose-50/70' : 'border-black/[0.08] bg-white/40'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${KIND_TINT[a.kind]}`}>
          <Icon name={KIND_ICON[a.kind]} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Chip level={SEVERITY_TONE[a.severity]}>{a.severity}</Chip>
            <span className="text-xs text-muted">{a.kind_label}</span>
            {a.escalated && <Chip level="problem">Escalated: no one has acknowledged</Chip>}
            {a.status === 'CLEARED' && <Chip level="normal">Cleared</Chip>}
          </div>
          <p className="font-medium">{a.text}</p>
          <p className="mt-1 text-xs text-muted">
            {a.id} · {a.zone}
            {a.sujal_gaon_id ? ` (${a.sujal_gaon_id})` : ''} · {a.asset_code} · raised {fmtTime(a.raised_at)} · {a.status === 'OPEN' ? `open ${age(a.age_minutes)}` : `lasted ${age(a.age_minutes)}`}
          </p>
          {a.details?.disclaimer && <p className="mt-1 text-xs text-muted">{a.details.disclaimer}</p>}
          {a.acknowledged_at && (
            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
              <Icon name="check" className="h-3.5 w-3.5" />
              Acknowledged by {a.acknowledged_by} at {fmtTime(a.acknowledged_at)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {a.status === 'OPEN' && !a.acknowledged_at && (
            <button type="button" onClick={ack} disabled={busy} className="btn-primary min-h-10 px-4 text-sm">
              Acknowledge
            </button>
          )}
          {role === 'gp' && a.status === 'OPEN' && ['AI_PREDICTION', 'WATER_SERVICE'].includes(a.kind) && (
            <Link to={`/gp/incidents/new?asset=${a.asset_id}`} className="btn-outline min-h-10 px-4 text-sm">
              Review evidence
            </Link>
          )}
          {role === 'gp' && a.kind === 'WATER_QUALITY' && (
            <Link to="/gp/quality" className="btn-outline min-h-10 px-4 text-sm">
              Water Quality
            </Link>
          )}
          <Link to={`${base}/pipelines/${a.asset_id}`} className="text-center text-xs text-muted underline">
            {a.asset_code} record
          </Link>
        </div>
      </div>
    </li>
  );
}

export default function AlertCenter() {
  const { role } = useDemo();
  const [status, setStatus] = useState('open');
  const [kind, setKind] = useState(null);
  const { data, reload } = useAlertFeed(role, { status, kind });

  if (dataSource !== 'api') {
    return (
      <div>
        <PageHeader title="Alert Center — every alert, one place" />
        <EmptyState icon="alert" title="The backend is not running">Alerts are raised on the server from live readings, the AI models, field tests and villagers' reports. Start it, then reload.</EmptyState>
      </div>
    );
  }

  const c = data?.counts;
  return (
    <div>
      <PageHeader title="Alert Center — every alert, one place" subtitle="Supply, pressure and leaks; equipment faults; AI predictions; water quality; and what villagers report.">
        <SimBadge>Demo sensor feed</SimBadge>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open alerts" value={c?.open ?? '—'} level={c?.open ? 'warning' : 'normal'} icon="alert" />
        <Kpi label="High severity" value={c?.high ?? '—'} level={c?.high ? 'problem' : 'normal'} icon="sensor" />
        <Kpi label="Not acknowledged" value={c?.unacknowledged ?? '—'} level={c?.unacknowledged ? 'warning' : 'normal'} icon="clock" />
        <Kpi label="Escalated" value={c?.escalated ?? '—'} level={c?.escalated ? 'problem' : 'normal'} icon="users" note="High, unseen for 30 min" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-black/10 bg-white/60 p-1 text-sm" role="group" aria-label="Status">
          {[['open', 'Open'], ['cleared', 'Cleared'], ['all', 'All']].map(([id, text]) => (
            <button key={id} type="button" aria-pressed={status === id} onClick={() => setStatus(id)} className={`rounded-full px-4 py-1.5 ${status === id ? 'bg-black text-white' : 'text-muted hover:text-black'}`}>
              {text}
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={kind === null} onClick={() => setKind(null)} className={`rounded-full border px-3 py-1.5 text-sm ${kind === null ? 'border-black/30 bg-white' : 'border-black/10 text-muted'}`}>
          All kinds
        </button>
        {(data?.kinds ?? []).map((k) => (
          <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${kind === k.id ? 'border-black/30 bg-white' : 'border-black/10 text-muted'}`}>
            <Icon name={KIND_ICON[k.id]} className="h-4 w-4" />
            {k.label}
            <span className="font-display text-base leading-none">{c?.by_kind[k.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {!data ? (
        <p className="text-muted">Loading…</p>
      ) : data.alerts.length === 0 ? (
        <EmptyState icon="checkCircle" title="Nothing to show">No alerts match. Start the simulator with a fault (for example <code>python simulator\sim.py --scenario leak</code>) to see them appear.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.alerts.map((a) => (
            <AlertRow key={a.id} a={a} role={role} onAck={reload} />
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted">Alerts reach IMIS (mock) as they open, are acknowledged and clear. A high alert nobody acknowledges for 30 minutes is shown as escalated to the block officer.</p>
    </div>
  );
}
