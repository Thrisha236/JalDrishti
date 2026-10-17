import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../demo/DemoContext';
import { LANGUAGES } from '../i18n';
import Icon from '../components/Icon';

const ROLES = [
  { id: 'citizen', icon: 'user', home: '/citizen' },
  { id: 'gp', icon: 'building', home: '/gp' },
  { id: 'officer', icon: 'users', home: '/officer' },
];

export default function Login() {
  const { t, i18n } = useTranslation();
  const { setRole } = useDemo();
  const navigate = useNavigate();
  const [choice, setChoice] = useState('citizen');

  const go = () => {
    setRole(choice);
    navigate(ROLES.find((r) => r.id === choice).home);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-canvas p-4">
      <div className="card w-full max-w-md p-6">
        <p className="mb-4 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{t('app.demoLogin')}</p>
        <div className="mb-5 flex flex-col items-center text-center">
          <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-card">
            <Icon name="drop" className="h-9 w-9" />
          </span>
          <h1 className="text-3xl font-bold">JalRakshak</h1>
          <p className="text-muted">{t('app.tagline')}</p>
        </div>

        <div className="mb-5 flex justify-center gap-2" role="group" aria-label="Language">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => i18n.changeLanguage(l.code)}
              aria-pressed={i18n.language === l.code}
              className={`min-h-11 rounded-full px-4 font-medium ${i18n.language === l.code ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <h2 className="section-title mb-3">{t('login.who')}</h2>
        <div className="flex flex-col gap-3" role="radiogroup">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={choice === r.id}
              onClick={() => setChoice(r.id)}
              className={`flex min-h-16 items-center gap-4 rounded-2xl border-2 p-3 text-left transition ${choice === r.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-600 shadow-card">
                <Icon name={r.icon} className="h-6 w-6" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{t(`login.${r.id}`)}</span>
                <span className="block text-sm text-muted">{t(`login.${r.id}Hint`)}</span>
              </span>
              {choice === r.id && <Icon name="checkCircle" className="h-6 w-6 text-brand-600" />}
            </button>
          ))}
        </div>

        <button type="button" onClick={go} className="btn-primary mt-6 w-full text-lg">
          {t('login.continue')}
          <Icon name="arrow" />
        </button>
        <p className="mt-4 text-center text-xs text-muted">Fictional village and demo users. No personal data is collected.</p>
      </div>
    </div>
  );
}
