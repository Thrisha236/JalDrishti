import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../../demo/DemoContext';
import { S } from '../../demo/steps';
import { areasFor, HOME_VILLAGE, CITIZEN_AREA } from '../../data/seed';
import Icon from '../../components/Icon';

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
  const { step, advanceTo, setReport, photoUrl, setPhotoUrl } = useDemo();
  const fileRef = useRef(null);
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [shareLocation, setShareLocation] = useState(true);
  const [area, setArea] = useState(CITIZEN_AREA);
  const [error, setError] = useState('');

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Please choose an image file.');
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) return setError(`Photo must be under ${MAX_PHOTO_MB} MB.`);
    setError('');
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
  };

  const removePhoto = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!category) return setError(t('report.pick'));
    setReport({ category, description, shareLocation, area, hasPhoto: Boolean(photoUrl) });
    advanceTo(S.REPORTED);
    navigate('/citizen/report/done');
  };

  if (step >= S.REPORTED) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="card p-5">
          <p className="mb-4">{t('report.already', { code: '2048' })}</p>
          <button type="button" onClick={() => navigate('/citizen/complaints/2048')} className="btn-primary w-full">
            {t('done.track')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="page-title">{t('report.title')}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('report.title')}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={category === c.id}
            onClick={() => setCategory(c.id)}
            className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center font-semibold shadow-card transition ${category === c.id ? 'border-brand-600 bg-brand-50' : 'border-transparent bg-white hover:border-slate-200'}`}
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
          <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-muted hover:bg-slate-50">
            <Icon name="camera" className="h-7 w-7" />
            {t('report.addPhoto')}
          </button>
        )}
      </section>

      <label className="card block p-4">
        <span className="mb-2 block font-semibold">{t('report.more')}</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 200))} rows={3} className="w-full rounded-xl border border-slate-300 p-3 text-base" />
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
          <select value={area} onChange={(e) => setArea(e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3">
            {areasFor(HOME_VILLAGE).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && <p className="rounded-xl bg-red-50 p-3 font-medium text-red-800" role="alert">{error}</p>}

      <button type="submit" className="btn-primary text-lg">
        {t('report.submit')}
      </button>
    </form>
  );
}
