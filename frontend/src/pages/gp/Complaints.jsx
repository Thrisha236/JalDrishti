import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { complaintStatus, S, visibleComplaints } from '../../demo/steps';
import { areas, assets, fmtTime, labelOf, story } from '../../data/seed';
import { Card, Chip, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';

export default function Complaints() {
  const { step, advanceTo, photoUrl } = useDemo();
  const navigate = useNavigate();
  const list = visibleComplaints(step);
  const [selected, setSelected] = useState('2048');
  const c = list.find((x) => x.public_code === selected);
  const status = complaintStatus(step);
  const analysis = story.image_analysis[0];

  const openIncident = () => {
    advanceTo(S.INCIDENT);
    navigate('/gp/incidents/INC-0311');
  };

  if (list.length === 0) {
    return (
      <div>
        <PageHeader title="Complaints" />
        <EmptyState title="No complaints yet">Complaints from villagers appear here with photo evidence.</EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Complaints" subtitle={`${list.length} today · North Area`}>
        <SimBadge />
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <ul className="flex flex-col divide-y divide-slate-100">
            {list.map((x) => (
              <li key={x.public_code}>
                <button
                  type="button"
                  onClick={() => setSelected(x.public_code)}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${selected === x.public_code ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                >
                  {x.media.length && photoUrl ? (
                    <img src={photoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Icon name={x.media.length ? 'camera' : 'drop'} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      #{x.public_code} · {labelOf(x.category)}
                    </span>
                    <span className="block text-sm text-muted">
                      {areas[x.service_area_id].name} · {fmtTime(x.created_at)}
                    </span>
                  </span>
                  <Chip level={status === 'SUBMITTED' ? 'warning' : status === 'RESOLVED_VERIFIED' ? 'normal' : 'info'}>
                    {status === 'SUBMITTED' ? 'New' : status === 'RESOLVED_VERIFIED' ? 'Resolved' : 'Linked to P-21'}
                  </Chip>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {c && (
          <Card className="lg:col-span-2" title={`Complaint #${c.public_code}`}>
            {c.media.length > 0 &&
              (photoUrl ? (
                <img src={photoUrl} alt={`Photo attached to complaint ${c.public_code}`} className="mb-3 max-h-56 w-full rounded-xl object-cover" />
              ) : (
                <p className="mb-3 rounded-xl bg-slate-100 p-4 text-sm text-muted">Photo attached (not available in this browser session).</p>
              ))}
            <dl className="mb-3 grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-muted">Note</dt>
              <dd className="col-span-2">{c.description ?? '—'}</dd>
              <dt className="text-muted">Location</dt>
              <dd className="col-span-2">{areas[c.service_area_id].name} (approx. 1 km)</dd>
              <dt className="text-muted">Asset</dt>
              <dd className="col-span-2">{assets[c.linked_asset_id].code} (nearest pipeline)</dd>
            </dl>
            {c.media.length > 0 && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-semibold">Simulated image observation</p>
                <p>{analysis.message}</p>
                <p className="mt-1 text-xs text-muted">{analysis.disclaimer}</p>
              </div>
            )}
            {step === S.REPORTED ? (
              <button type="button" onClick={openIncident} className="btn-primary w-full">
                Link to P-21 and open incident
              </button>
            ) : (
              <Link to="/gp/incidents/INC-0311" className="btn-outline w-full">
                Open incident INC-0311
              </Link>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
