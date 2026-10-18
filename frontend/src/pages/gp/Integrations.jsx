import { useState } from 'react';
import { useDemo } from '../../demo/DemoContext';
import { dataSource, fmtTime } from '../../data/seed';
import { syncNow, useIntegrations } from '../../data/ai';
import { Card, Chip, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';

// Where each connector sits in the diagram (SVG units).
const SLOT = {
  sujal_gaon: { x: 10, y: 150, in: true },
  imis: { x: 520, y: 10 },
  jjm_dashboard: { x: 520, y: 100 },
  meri_panchayat: { x: 520, y: 190 },
  wqmis: { x: 520, y: 280 },
};
const CENTRE = { x: 245, y: 148, w: 170, h: 84 };
const isRecent = (iso) => iso && Date.now() - new Date(iso).getTime() < 2 * 60 * 1000;

function Flow({ connectors }) {
  return (
    <svg viewBox="0 0 740 360" className="w-full" role="img" aria-label="Data flow between JalRakshak and the national platforms (mock)">
      {connectors.map((c) => {
        const s = SLOT[c.id];
        const live = isRecent(c.last_at);
        const y = s.y + 30;
        const [x1, x2] = s.in ? [s.x + 215, CENTRE.x] : [CENTRE.x + CENTRE.w, s.x];
        const from = s.in ? [x1, y] : [x1, CENTRE.y + CENTRE.h / 2];
        const to = s.in ? [x2, CENTRE.y + CENTRE.h / 2] : [x2, y];
        const mid = (from[0] + to[0]) / 2;
        const d = `M${from[0]} ${from[1]} C${mid} ${from[1]} ${mid} ${to[1]} ${to[0]} ${to[1]}`;
        return (
          <g key={c.id}>
            <path d={d} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" />
            <path d={d} fill="none" stroke={live ? '#0EA5E9' : 'currentColor'} strokeOpacity={live ? 1 : 0.0} strokeWidth="2.5" strokeDasharray="6 8" className={live ? 'animate-flow' : ''} />
            <path d={`M${to[0] - 8} ${to[1] - 5} L${to[0]} ${to[1]} L${to[0] - 8} ${to[1] + 5}`} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2" />
            <text x={mid} y={(from[1] + to[1]) / 2 - 8} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.55">{s.in ? 'IDs, registry' : c.id === 'imis' ? 'incidents, alerts, monitoring' : c.id === 'jjm_dashboard' ? 'tap functionality' : c.id === 'meri_panchayat' ? 'reports, validations' : 'results, sample requests'}</text>
          </g>
        );
      })}
      <g>
        <rect x={CENTRE.x} y={CENTRE.y} width={CENTRE.w} height={CENTRE.h} rx="22" fill="#000" />
        <text x={CENTRE.x + CENTRE.w / 2} y={CENTRE.y + 38} textAnchor="middle" fontSize="22" fill="#fff" fontFamily="'Plus Jakarta Sans', Inter, sans-serif" fontWeight="700">JalRakshak</text>
        <text x={CENTRE.x + CENTRE.w / 2} y={CENTRE.y + 60} textAnchor="middle" fontSize="10" fill="#fff" fillOpacity="0.7">sensors · villagers · GP</text>
      </g>
      {connectors.map((c) => {
        const s = SLOT[c.id];
        const live = isRecent(c.last_at);
        return (
          <g key={`${c.id}-node`}>
            <rect x={s.x} y={s.y} width="215" height="60" rx="16" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity="0.2" />
            <circle cx={s.x + 18} cy={s.y + 18} r="4" fill={live ? '#10B981' : '#94A3B8'} />
            <text x={s.x + 30} y={s.y + 22} fontSize="13" fontWeight="600" fill="currentColor">{c.name}</text>
            <text x={s.x + 16} y={s.y + 42} fontSize="10" fill="currentColor" fillOpacity="0.6">{c.messages} messages · MOCK</text>
          </g>
        );
      })}
    </svg>
  );
}

function ConnectorCard({ c }) {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white/40 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-display text-2xl leading-none tracking-tight">{c.name}</p>
        <Chip level="info">{c.direction === 'PULL' ? 'Pull' : 'Push'}</Chip>
        <Chip level="normal">Connected (mock)</Chip>
      </div>
      <p className="mb-3 text-sm text-muted">{c.purpose}</p>
      <ul className="mb-3 flex flex-wrap gap-1.5">
        {c.carries.map((x) => (
          <li key={x} className="rounded-full bg-black/[0.05] px-2.5 py-0.5 text-xs">{x}</li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        {c.last_at ? (
          <>
            Last message {fmtTime(c.last_at)} · <span className="font-mono">{c.last_ref}</span>
          </>
        ) : (
          'No messages yet. Press Sync now, or start the simulator.'
        )}
      </p>
    </div>
  );
}

function Crosswalk({ villages }) {
  return (
    <Card title="ID crosswalk" accent="record" action={<SimBadge>Demo IDs</SimBadge>}>
      <p className="mb-4 text-sm text-muted">Every village, zone and scheme is keyed on the national IDs, so incidents and repairs attach to the right place in IMIS.</p>
      <div className="flex flex-col gap-5">
        {villages.map((v) => (
          <div key={v.village_id}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-display text-2xl leading-none tracking-tight">{v.village}</span>
              <Chip level="neutral">{v.lgd_code}</Chip>
              {v.schemes.map((s) => (
                <Chip key={s.scheme_id} level="info">{s.sujalam_bharat_id}</Chip>
              ))}
              <span className="text-xs text-muted">{v.district}, {v.state} · {v.assets} assets matched</span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {v.service_areas.map((a) => (
                <li key={a.service_area_id} className="flex items-center gap-3 rounded-xl border border-black/[0.08] p-3 text-sm">
                  <Icon name={a.resolved ? 'checkCircle' : 'clock'} className={`h-5 w-5 shrink-0 ${a.resolved ? 'text-emerald-600' : 'text-amber-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-muted">{a.resolved ? a.sujal_gaon_id : (a.note ?? 'Not issued yet')}</span>
                  </span>
                  <span className="text-xs text-muted">{a.households} homes</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EventRow({ e }) {
  const push = e.direction === 'PUSH';
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${push ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>
          <Icon name="arrow" className={`h-4 w-4 ${push ? '' : 'rotate-180'}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{e.summary}</p>
          <p className="text-xs text-muted">
            {e.connector_name} · {push ? 'sent' : 'received'} {fmtTime(e.at)} · <span className="font-mono">{e.external_ref}</span> · {e.trigger === 'manual' ? 'Sync now' : 'automatic'}
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-muted">Show message</summary>
            <pre className="mt-1 max-h-56 overflow-auto rounded-xl bg-black/[0.05] p-3 text-[11px] leading-relaxed">{JSON.stringify(e.payload, null, 2)}</pre>
          </details>
        </div>
      </div>
    </li>
  );
}

export default function Integrations() {
  const { role } = useDemo();
  const { data, reload } = useIntegrations(role);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  if (dataSource !== 'api') {
    return (
      <div>
        <PageHeader title="Integrations — national platforms" />
        <EmptyState icon="shield" title="The backend is not running">The mock connectors run on the server. Start it, then reload.</EmptyState>
      </div>
    );
  }

  const sync = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await syncNow(role);
      setNote(`${r.messages} messages sent to the mock platforms.`);
      reload();
    } catch (e) {
      setNote(e.message);
    }
    setBusy(false);
  };

  return (
    <div>
      <PageHeader title="Integrations — national platforms" subtitle="How JalRakshak plugs into Sujal Gaon, IMIS, the JJM Dashboard and WQMIS. Every connector here is simulated.">
        <button type="button" onClick={sync} disabled={busy} className="btn-primary">
          <Icon name="arrow" className="h-4 w-4" />
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      </PageHeader>

      <div className="mb-5 flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="note">
        <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          <b>Mock connectors.</b> No real government system is contacted. Messages use an illustrative format, not the official schema, and every ID is a demo value. Real integration needs authorised access and the official specification.
        </p>
      </div>
      {note && <p className="mb-4 text-sm text-muted" role="status">{note}</p>}

      {!data ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <Card title="Data flow" accent="water">
            <Flow connectors={data.overview.connectors} />
            <p className="text-xs text-muted">Lines light up while a message is moving (the last 2 minutes). New sensor readings, incident changes and tap-functionality changes are sent automatically; Sync now sends everything at once.</p>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            {data.overview.connectors.map((c) => (
              <ConnectorCard key={c.id} c={c} />
            ))}
          </div>
          <Crosswalk villages={data.crosswalk.villages} />
          <Card title="Message log" accent="record">
            {data.events.length === 0 ? (
              <p className="text-sm text-muted">No messages yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-black/[0.06]">
                {data.events.map((e) => (
                  <EventRow key={e.id} e={e} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
