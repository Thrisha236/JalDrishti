import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDemo } from '../../demo/DemoContext';
import { complaintStatus, S, visibleComplaints } from '../../demo/steps';
import { areas, assets, currentIncidentCode, dataSource, fmtTime, HOME_VILLAGE, labelOf, story, STORY_ASSET } from '../../data/seed';
import { apiFetch, photoUrlFor } from '../../data/api';
import { Card, Chip, EmptyState, PageHeader, SimBadge } from '../../components/ui';
import Icon from '../../components/Icon';

/** Complaints for the inbox: from the API (with descriptions and photos) or, offline, the seed fixtures. */
function useInbox(step, localPhotoUrl) {
  const [state, setState] = useState({ list: [], photos: {}, error: null, loading: dataSource === 'api' });

  useEffect(() => {
    if (step < S.REPORTED) return setState({ list: [], photos: {}, error: null, loading: false });
    if (dataSource !== 'api') {
      const list = visibleComplaints(step).map((c) => ({ ...c, image_analysis: c.media.length ? story.image_analysis : [] }));
      const photos = Object.fromEntries(list.flatMap((c) => c.media.map((m) => [m.id, localPhotoUrl])).filter(([, url]) => url));
      return setState({ list, photos, error: null, loading: false });
    }
    let cancelled = false;
    const urls = [];
    (async () => {
      try {
        const list = await apiFetch(`/complaints?village_id=${HOME_VILLAGE}`, { role: 'gp' });
        if (cancelled) return;
        setState({ list, photos: {}, error: null, loading: false });
        for (const c of list) {
          for (const m of c.media) {
            const url = await photoUrlFor(m.id, 'gp').catch(() => null);
            if (!url) continue;
            urls.push(url);
            if (cancelled) return;
            setState((s) => ({ ...s, photos: { ...s.photos, [m.id]: url } }));
          }
        }
      } catch (err) {
        if (!cancelled) setState({ list: [], photos: {}, error: err.message, loading: false });
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [step, localPhotoUrl]);

  return state;
}

export default function Complaints() {
  const { step, advanceTo, photoUrl } = useDemo();
  const navigate = useNavigate();
  const { list, photos, error, loading } = useInbox(step, photoUrl);
  const [selected, setSelected] = useState(null);
  const status = complaintStatus(step);
  const c = list.find((x) => x.public_code === selected) ?? list.find((x) => x.media.length) ?? list[0];
  const photoOf = (x) => (x.media[0] ? photos[x.media[0].id] : null);

  const openIncident = () => {
    if (dataSource === 'api') {
      navigate(`/gp/incidents/new?asset=${STORY_ASSET}`); // review the fused evidence first; the GP decides there
      return;
    }
    advanceTo(S.INCIDENT);
    navigate('/gp/incidents/INC-0311');
  };

  if (error) {
    return (
      <div>
        <PageHeader title="Complaints" />
        <EmptyState icon="alert" title="Could not load complaints">{error}</EmptyState>
      </div>
    );
  }
  if (!loading && list.length === 0) {
    return (
      <div>
        <PageHeader title="Complaints" />
        <EmptyState title="No complaints yet">Complaints from villagers appear here with photo evidence.</EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Complaints" subtitle={loading ? 'Loading…' : `${list.length} open · Ramapuram`}>
        <SimBadge>{dataSource === 'api' ? 'Live from API · fixtures marked' : 'Simulated data'}</SimBadge>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <ul className="flex flex-col divide-y divide-slate-100">
            {list.map((x) => (
              <li key={x.public_code}>
                <button
                  type="button"
                  onClick={() => setSelected(x.public_code)}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${c?.public_code === x.public_code ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                >
                  {photoOf(x) ? (
                    <img src={photoOf(x)} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Icon name={x.media.length ? 'camera' : 'drop'} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      #{x.public_code} · {labelOf(x.category)}
                      {x.is_simulated && <span className="ml-2 text-xs font-normal text-muted">(fixture)</span>}
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
              (photoOf(c) ? (
                <img src={photoOf(c)} alt={`Photo attached to complaint ${c.public_code}`} className="mb-3 max-h-56 w-full rounded-xl object-cover" />
              ) : (
                <p className="mb-3 rounded-xl bg-slate-100 p-4 text-sm text-muted">{dataSource === 'api' ? 'Loading photo…' : 'Photo attached (not available in this browser session).'}</p>
              ))}
            <dl className="mb-3 grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-muted">Note</dt>
              <dd className="col-span-2">{c.description ?? '—'}</dd>
              <dt className="text-muted">Location</dt>
              <dd className="col-span-2">
                {areas[c.service_area_id].name} ({c.location.precision === 'not_shared' ? 'location not shared' : 'approx. 1 km'})
              </dd>
              <dt className="text-muted">Asset</dt>
              <dd className="col-span-2">
                {c.linked_asset_id ? `${assets[c.linked_asset_id].code} (linked)` : `Not linked yet · nearest pipeline ${assets[STORY_ASSET].code}`}
              </dd>
            </dl>
            {c.image_analysis?.[0] && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-semibold">Simulated image observation</p>
                <p>{c.image_analysis[0].message}</p>
                <p className="mt-1 text-xs text-muted">{c.image_analysis[0].disclaimer}</p>
              </div>
            )}
            {step === S.REPORTED ? (
              <button type="button" onClick={openIncident} className="btn-primary w-full">
                {dataSource === 'api' ? 'Review evidence for P-21' : 'Link to P-21 and open incident'}
              </button>
            ) : (
              <Link to={`/gp/incidents/${currentIncidentCode()}`} className="btn-outline w-full">
                Open incident {currentIncidentCode()}
              </Link>
            )}
            <p className="mt-3 text-xs text-muted">Photos are shown only to the villager who sent them and to officials for this village. Location data is removed from every photo.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
