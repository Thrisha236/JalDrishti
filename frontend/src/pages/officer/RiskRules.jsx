import { useEffect, useState } from 'react';
import { dataSource, fmtTime, labelOf } from '../../data/seed';
import { apiFetch, publicGet } from '../../data/api';
import { Card, Chip, EmptyState, PageHeader } from '../../components/ui';

/** The policy knobs an officer may change. Everything else in the rules stays as in the active version. */
function knobsOf(cfg) {
  const band = (name) => cfg.bands.find((b) => b.band === name);
  return {
    mediumMin: band('MEDIUM').min,
    highMin: band('HIGH').min,
    ageFullYears: cfg.factors.age.full_years,
    staleMonths: cfg.factors.corrosion_observation.stale_after_months,
    materials: { ...cfg.factors.material_susceptibility.points_by_material },
  };
}

function applyKnobs(cfg, k) {
  const next = structuredClone(cfg);
  next.bands = [
    { ...cfg.bands.find((b) => b.band === 'LOW'), min: 0, max: k.mediumMin - 1 },
    { ...cfg.bands.find((b) => b.band === 'MEDIUM'), min: k.mediumMin, max: k.highMin - 1 },
    { ...cfg.bands.find((b) => b.band === 'HIGH'), min: k.highMin, max: 100 },
  ];
  next.factors.age.full_years = k.ageFullYears;
  next.factors.corrosion_observation.stale_after_months = k.staleMonths;
  next.factors.material_susceptibility.points_by_material = k.materials;
  return next;
}

function changes(prev, cur) {
  if (!prev) return ['Initial rules'];
  const a = knobsOf(prev);
  const b = knobsOf(cur);
  const out = [];
  if (a.mediumMin !== b.mediumMin) out.push(`MEDIUM from ${a.mediumMin} → ${b.mediumMin}`);
  if (a.highMin !== b.highMin) out.push(`HIGH from ${a.highMin} → ${b.highMin}`);
  if (a.ageFullYears !== b.ageFullYears) out.push(`full age points at ${a.ageFullYears} → ${b.ageFullYears} years`);
  if (a.staleMonths !== b.staleMonths) out.push(`inspection stale after ${a.staleMonths} → ${b.staleMonths} months`);
  for (const m of Object.keys(b.materials)) if (a.materials[m] !== b.materials[m]) out.push(`${labelOf(m)} ${a.materials[m]} → ${b.materials[m]} pts`);
  return out.length ? out : ['No change to the editable settings'];
}

function NumberField({ label, value, onChange, min, max, hint }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 min-h-11 w-full rounded-lg border border-black/15 px-3" />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export default function RiskRules() {
  const [versions, setVersions] = useState(null);
  const [knobs, setKnobs] = useState(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const list = await publicGet('/risk/config/versions');
    setVersions(list);
    setKnobs(knobsOf(list.find((v) => v.is_active).config));
  };

  useEffect(() => {
    if (dataSource === 'api') load().catch((e) => setMessage({ kind: 'error', text: e.message }));
  }, []);

  if (dataSource !== 'api') {
    return (
      <div>
        <PageHeader title="Risk rules" />
        <EmptyState title="Editing risk rules needs the backend">Start the API to view versions and publish changes.</EmptyState>
      </div>
    );
  }
  if (!versions || !knobs) return <p className="text-muted">Loading…</p>;

  const active = versions.find((v) => v.is_active);
  const publish = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await apiFetch('/risk/config', {
        role: 'officer',
        method: 'POST',
        body: JSON.stringify({ note, config: applyKnobs(active.config, knobs) }),
        json: true,
      });
      setNote('');
      setMessage({ kind: 'ok', text: `Published ${saved.version}. All pipeline scores now use it.` });
      await load();
    } catch (err) {
      setMessage({ kind: 'error', text: err.problems?.join(' · ') ?? err.message });
    }
    setBusy(false);
  };
  const activate = async (version) => {
    setBusy(true);
    try {
      await apiFetch(`/risk/config/${version}/activate`, { role: 'officer', method: 'POST' });
      setMessage({ kind: 'ok', text: `${version} is active again.` });
      await load();
    } catch (err) {
      setMessage({ kind: 'error', text: err.message });
    }
    setBusy(false);
  };
  const setMaterial = (m, v) => setKnobs((k) => ({ ...k, materials: { ...k.materials, [m]: v } }));

  return (
    <div>
      <PageHeader title="Risk rules" subtitle={`Active: ${active.version}. Scores rank inspection priority; they are not failure probabilities.`} />
      {message && (
        <p className={`mb-4 rounded-xl p-3 text-sm ${message.kind === 'ok' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'}`} role="status">
          {message.text}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-5">
        <Card title="Publish a new version" className="lg:col-span-3">
          <form onSubmit={publish} className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="MEDIUM starts at score" value={knobs.mediumMin} min={1} max={98} onChange={(v) => setKnobs((k) => ({ ...k, mediumMin: v }))} />
              <NumberField label="HIGH starts at score" value={knobs.highMin} min={2} max={99} onChange={(v) => setKnobs((k) => ({ ...k, highMin: v }))} />
              <NumberField label="Full age points at (years)" value={knobs.ageFullYears} min={6} max={80} onChange={(v) => setKnobs((k) => ({ ...k, ageFullYears: v }))} />
              <NumberField label="Inspection counts as stale after (months)" value={knobs.staleMonths} min={1} max={120} onChange={(v) => setKnobs((k) => ({ ...k, staleMonths: v }))} />
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Material susceptibility points (max {active.config.factors.material_susceptibility.max})</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(knobs.materials).map(([m, v]) => (
                  <NumberField key={m} label={labelOf(m)} value={v} min={0} max={active.config.factors.material_susceptibility.max} onChange={(x) => setMaterial(m, x)} />
                ))}
              </div>
            </fieldset>
            <label className="block text-sm">
              <span className="font-medium">Reason for the change (kept in the audit log)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} minLength={5} maxLength={300} required className="mt-1 min-h-11 w-full rounded-lg border border-black/15 px-3" />
            </label>
            <p className="rounded-lg bg-water-50 p-3 text-sm">
              <span className="font-semibold">This change: </span>
              {changes(active.config, applyKnobs(active.config, knobs)).join(' · ')}
            </p>
            <button type="submit" className="btn-primary" disabled={busy}>
              Publish and activate
            </button>
          </form>
        </Card>

        <Card title="Versions" className="lg:col-span-2">
          <ol className="flex flex-col gap-3">
            {versions.map((v, i) => (
              <li key={v.version} className="rounded-2xl border border-black/[0.08] p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{v.version}</span>
                  {v.is_active ? (
                    <Chip level="normal">Active</Chip>
                  ) : (
                    <button type="button" onClick={() => activate(v.version)} disabled={busy} className="btn-outline min-h-9 px-3 text-xs">
                      Activate
                    </button>
                  )}
                </div>
                <p className="text-muted">
                  {fmtTime(v.created_at)} · {v.created_by ?? 'seed'}
                </p>
                <p className="mt-1">{v.note}</p>
                <p className="mt-1 text-xs text-muted">{changes(versions[i + 1]?.config, v.config).join(' · ')}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
