import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { S } from '../../demo/steps';
import { nextOfflineCode } from '../../data/myComplaints';
import { areasFor, HOME_VILLAGE, CITIZEN_AREA, dataSource, reloadData } from '../../data/seed';
import { apiFetch } from '../../data/api';
import Icon from '../../components/Icon';
import { PageHeader } from '../../components/ui';

const CATEGORIES = [
  { id: 'NO_WATER', icon: 'x' },
  { id: 'LOW_WATER', icon: 'drop' },
  { id: 'DIRTY_WATER', icon: 'alert' },
  { id: 'BAD_SMELL', icon: 'smell' },
  { id: 'LEAKAGE', icon: 'pipe' },
  { id: 'DAMAGED_TAP', icon: 'tap' },
  { id: 'OTHER', icon: 'more' },
];

const MAX_PHOTO_MB = 8;

export default function Report() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { step, advanceTo, report, setReport, reports, addReport, photoUrl, setPhotoUrl } = useDemo();
  const fileRef = useRef(null);
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [shareLocation, setShareLocation] = useState(true);
  const [area, setArea] = useState(CITIZEN_AREA);
  const [photoFile, setPhotoFile] = useState(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  // A new report starts without the previous report's photo.
  useEffect(() => {
    setPhotoUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, [setPhotoUrl]);

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError(t('report.errorType'));
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) return setError(t('report.errorTooLarge'));
    setError('');
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
    setPhotoFile(file);
  };

  const removePhoto = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setPhotoFile(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!category) return setError(t('report.pick'));
    setError('');
    // Each complaint gets its own track ID. The first one is also the demo story's complaint.
    const firstOfStory = !report && step < S.REPORTED;
    let submitted;
    if (dataSource !== 'api') {
      // Offline demo: nothing leaves the browser.
      const code = nextOfflineCode(reports);
      submitted = { public_code: code, category, area, hasPhoto: Boolean(photoFile), createdAt: new Date().toISOString(), channel: 'APP' };
      addReport(submitted);
      if (firstOfStory) setReport(submitted);
    } else {
      const form = new FormData();
      form.append('category', category);
      form.append('service_area_id', area);
      form.append('share_location', String(shareLocation));
      if (description.trim()) form.append('description', description.trim());
      if (photoFile) form.append('photo', photoFile);
      setSending(true);
      try {
        const saved = await apiFetch('/complaints', { role: 'citizen', method: 'POST', body: form });
        const analysis = saved.image_analysis?.[0];
        submitted = {
          public_code: saved.public_code,
          category: saved.category,
          area: saved.service_area_id,
          hasPhoto: saved.media.length > 0,
          observation_code: analysis?.observation_code ?? null,
          observation: analysis?.message ?? null,
        };
        if (firstOfStory) setReport(submitted);
        await reloadData();
      } catch (err) {
        setSending(false);
        const key = { 409: 'report.errorDuplicate', 413: 'report.errorTooLarge', 415: 'report.errorType' }[err.status];
        return setError(key ? t(key, { detail: err.message }) : t('report.errorGeneric'));
      }
      setSending(false);
    }
    advanceTo(S.REPORTED);
    navigate('/citizen/report/done', { state: { submitted } });
  };

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title={t('report.title')} />
      <Link to="/citizen/phone" className="card flex items-center gap-3 p-4 transition hover:border-water-300">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Icon name="phone" className="h-5 w-5" />
        </span>
        <span className="flex-1 text-sm">{t('report.byPhone')}</span>
        <Icon name="arrow" />
      </Link>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('report.title')}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={category === c.id}
            onClick={() => setCategory(c.id)}
            className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center font-semibold shadow-card transition ${category === c.id ? 'border-brand-600 bg-brand-50' : 'border-transparent bg-white hover:border-black/[0.08]'}`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-b from-brand-50 to-brand-100 text-brand-600">
              <Icon name={c.icon} className="h-6 w-6" />
            </span>
            {t(`category.${c.id}`)}
          </button>
        ))}
      </div>

      <section className="card p-4">
        <p className="mb-2 font-semibold">{t('report.addPhoto')}</p>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
        {photoUrl ? (
          <div className="flex items-center gap-3">
            <img src={photoUrl} alt="Selected photo preview" className="h-24 w-24 rounded-xl object-cover" />
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-outline min-h-10 px-3 text-sm">
                <Icon name="camera" className="h-4 w-4" />
                {t('report.replace')}
              </button>
              <button type="button" onClick={removePhoto} className="btn-outline min-h-10 px-3 text-sm text-red-700">
                <Icon name="x" className="h-4 w-4" />
                {t('report.remove')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-black/15 text-muted hover:bg-water-50">
            <Icon name="camera" className="h-7 w-7" />
            {t('report.addPhoto')}
          </button>
        )}
      </section>

      <label className="card block p-4">
        <span className="mb-2 block font-semibold">{t('report.more')}</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 200))} rows={3} className="w-full rounded-xl border border-black/15 p-3 text-base" />
        <span className="mt-1 block text-right text-xs text-muted">{description.length} / 200</span>
      </label>

      <button type="button" disabled className="btn-outline justify-start" title="Voice notes arrive in a later stage">
        <Icon name="mic" />
        {t('report.voice')}
      </button>

      <section className="card flex flex-col gap-3 p-4">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block font-semibold">{t('report.location')}</span>
            <span className="block text-sm text-muted">{t('report.locationHint')}</span>
          </span>
          <input type="checkbox" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} className="h-6 w-6 accent-brand-600" />
        </label>
        <label className="block">
          <span className="mb-1 block font-semibold">{t('report.area')}</span>
          <select value={area} onChange={(e) => setArea(e.target.value)} className="min-h-12 w-full rounded-xl border border-black/15 bg-white px-3">
            {areasFor(HOME_VILLAGE).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && <p className="rounded-xl bg-red-50 p-3 font-medium text-red-800" role="alert">{error}</p>}

      <button type="submit" className="btn-primary text-lg" disabled={sending}>
        {sending ? '…' : t('report.submit')}
      </button>
    </form>
  );
}
