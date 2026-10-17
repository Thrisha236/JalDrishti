import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../demo/DemoContext';
import { LANGUAGES } from '../i18n';
import { dataSource } from '../data/seed';
import { login } from '../data/api';
import Icon from '../components/Icon';

const ROLES = [
  { id: 'citizen', icon: 'user', home: '/citizen', username: 'villager1' },
  { id: 'gp', icon: 'building', home: '/gp', username: 'gp.ramapuram' },
  { id: 'officer', icon: 'users', home: '/officer', username: 'officer.block' },
];
// Fictional demo accounts created by the seed loader. Not real people; change JALRAKSHAK_DEMO_PASSWORD to rotate.
const DEMO_PASSWORD = 'jalrakshak-demo';

export default function Login() {
  const { t, i18n } = useTranslation();
  const { setRole } = useDemo();
  const navigate = useNavigate();
  const [choice, setChoice] = useState('citizen');
  const [username, setUsername] = useState(ROLES[0].username);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (id) => {
    setChoice(id);
    setUsername(ROLES.find((r) => r.id === id).username);
    setError('');
  };

  const go = async (e) => {
    e.preventDefault();
    let role = choice;
    if (dataSource === 'api') {
      setBusy(true);
      try {
        role = (await login(username.trim(), password)).role;
      } catch (err) {
        setError(err.status === 429 ? err.message : 'Wrong username or password');
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setRole(role);
    navigate(ROLES.find((r) => r.id === role)?.home ?? '/');
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
              onClick={() => pick(r.id)}
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

        <form onSubmit={go} className="mt-5 flex flex-col gap-3">
          {dataSource === 'api' && (
            <>
              <label className="block text-sm">
                <span className="font-medium">Username</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3" />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3" />
              </label>
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Demo accounts are filled in for you. They belong to fictional users.</p>
            </>
          )}
          {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800" role="alert">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full text-lg">
            {t('login.continue')}
            <Icon name="arrow" />
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">Fictional village and demo users. No personal data is collected.</p>
      </div>
    </div>
  );
}
