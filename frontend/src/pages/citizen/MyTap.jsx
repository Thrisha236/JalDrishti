import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../data/api';
import { fmtDate } from '../../data/seed';
import { usePolling } from '../../data/telemetry';
import Icon from '../../components/Icon';

const TONE = {
  FUNCTIONAL: { dot: 'bg-emerald-500', ring: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  PARTIAL: { dot: 'bg-amber-500', ring: 'border-amber-200 bg-amber-50 text-amber-800' },
  NON_FUNCTIONAL: { dot: 'bg-rose-500', ring: 'border-rose-200 bg-rose-50 text-rose-800' },
};

const dayColour = (c) => (!c ? 'bg-slate-200' : !c.got_water || c.quantity === 'NONE' ? 'bg-rose-500' : c.quantity === 'LOW' ? 'bg-amber-400' : 'bg-emerald-500');

/** Big, thumb-sized choice buttons. */
function Choice({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map(([id, text, icon]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-3 text-base font-medium transition-colors ${value === id ? 'border-black bg-black text-white' : 'border-black/10 bg-white/70 hover:border-black/30'}`}
        >
          {icon && <Icon name={icon} className="h-5 w-5" />}
          {text}
        </button>
      ))}
    </div>
  );
}

function Stars({ value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}`}
          onClick={() => onChange(value === n ? null : n)}
          className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-lg font-semibold transition-colors ${value && n <= value ? 'border-amber-400 bg-amber-100 text-amber-800' : 'border-black/10 bg-white/70 text-muted'}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** The villager's own tap: its status, and the daily service check (did water come, how much, how did it look). */
export default function MyTap() {
  const { t } = useTranslation();
  const [reload, setReload] = useState(0);
  const { data } = usePolling(() => apiFetch('/households/mine', { role: 'citizen' }), 20000, true, reload);
  const [editing, setEditing] = useState(false);
  const [got, setGot] = useState(null);
  const [qty, setQty] = useState(null);
  const [look, setLook] = useState(null);
  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [thanks, setThanks] = useState(false);

  if (!data) return null;
  const today = data.checks.find((c) => c.day === new Date().toLocaleDateString('en-CA'));
  const showForm = !today || editing;
  const tone = TONE[data.status];
  const ready = got === false || (got === true && qty);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/service-checks', {
        role: 'citizen', method: 'POST', json: true,
        body: JSON.stringify({ got_water: got, ...(got ? { quantity: qty, quality: look } : {}), rating, comment: comment.trim() || null }),
      });
      setThanks(true);
      setEditing(false);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 864e5).toLocaleDateString('en-CA');
    return { d, c: data.checks.find((c) => c.day === d) };
  });
  const summary = today ? `${today.got_water ? t('tap.gotWater') : t('tap.noWater')}${today.got_water ? ` · ${today.quantity === 'LOW' ? t('tap.low') : t('tap.enough')}` : ''}` : '';

  return (
    <section className="card animate-fade-rise-delay p-6 lg:col-span-2" aria-live="polite">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full border ${tone.ring}`}>
            <Icon name="tap" className="h-6 w-6" />
          </span>
          <div>
            <h2 className="section-title">{t('tap.title')}</h2>
            <p className="text-xs text-muted">{t('tap.id', { id: data.tap_id })}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium ${tone.ring}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
          {t(`tap.status.${data.status}`)}
        </span>
      </div>
      <p className="mb-4 text-xs text-muted">{data.status_source === "villager's service check" ? t('tap.source.citizen') : t('tap.source.network')}</p>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          {showForm ? (
            <div className="flex flex-col gap-4">
              <p className="font-medium">{t('tap.checkTitle')}</p>
              <Choice label={t('tap.checkTitle')} value={got === null ? null : got ? 'yes' : 'no'} onChange={(v) => { setGot(v === 'yes'); if (v === 'no') { setQty(null); setLook(null); } }} options={[['yes', t('tap.yes'), 'drop'], ['no', t('tap.no'), 'x']]} />
              {got && (
                <>
                  <p className="font-medium">{t('tap.qtyTitle')}</p>
                  <Choice label={t('tap.qtyTitle')} value={qty} onChange={setQty} options={[['ENOUGH', t('tap.enough'), 'checkCircle'], ['LOW', t('tap.low'), 'alert']]} />
                  <p className="font-medium">{t('tap.lookTitle')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[['CLEAR', t('tap.clear')], ['COLOURED', t('tap.coloured')], ['SMELL', t('tap.smell')], ['OTHER', t('tap.other')]].map(([id, text]) => (
                      <button key={id} type="button" aria-pressed={look === id} onClick={() => setLook(look === id ? null : id)} className={`min-h-12 rounded-2xl border-2 px-3 text-sm font-medium transition-colors ${look === id ? 'border-black bg-black text-white' : 'border-black/10 bg-white/70 hover:border-black/30'}`}>
                        {text}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {got !== null && (
                <>
                  <p className="font-medium">{t('tap.rateTitle')}</p>
                  <Stars value={rating} onChange={setRating} label={t('tap.rateTitle')} />
                  <p className="-mt-2 text-xs text-muted">{t('tap.ratingHint')}</p>
                  <label className="text-sm">
                    <span className="text-muted">{t('tap.comment')}</span>
                    <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 200))} rows={2} className="mt-1 w-full rounded-2xl border border-black/15 bg-white/80 p-3" />
                  </label>
                  <button type="button" onClick={send} disabled={!ready || busy} className="btn-primary min-h-14 w-full text-lg disabled:opacity-50">
                    {t('tap.send')}
                  </button>
                </>
              )}
              {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
                <Icon name="checkCircle" className="h-6 w-6 shrink-0" />
                <span>
                  {thanks ? t('tap.sent') : t('tap.today')}
                  <span className="mt-1 block text-sm font-medium">{summary}</span>
                </span>
              </p>
              <button type="button" onClick={() => { setEditing(true); setGot(today.got_water); setQty(today.quantity === 'NONE' ? null : today.quantity); setLook(today.quality); setRating(today.rating); setComment(today.comment ?? ''); setThanks(false); }} className="btn-outline min-h-12">
                {t('tap.update')}
              </button>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 font-medium">{t('tap.history')}</p>
          <div className="flex gap-1.5" role="img" aria-label={t('tap.history')}>
            {last14.map(({ d, c }) => (
              <span key={d} title={`${fmtDate(d)}${c ? '' : ` · ${t('tap.none')}`}`} className={`h-8 flex-1 rounded-md ${dayColour(c)}`} />
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted">
            <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" />
            {t('tap.privacy')}
          </p>
        </div>
      </div>
    </section>
  );
}
