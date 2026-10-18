import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../demo/DemoContext';
import { LANGUAGES } from '../i18n';
import { dataSource } from '../data/seed';
import { login } from '../data/api';
import Icon from '../components/Icon';
import { Ripple } from '../components/water';

const ROLES = [
  { id: 'citizen', icon: 'user', home: '/citizen', username: 'villager1' },
  { id: 'gp', icon: 'building', home: '/gp', username: 'gp.ramapuram' },
  { id: 'officer', icon: 'users', home: '/officer', username: 'officer.block' },
];
// Fictional demo accounts created by the seed loader. Not real people; change JALRAKSHAK_DEMO_PASSWORD to rotate.
const DEMO_PASSWORD = 'jalrakshak-demo';

/** Sign-in popup shown over the landing video. */
export default function LoginDialog({ onClose }) {
  const { t, i18n } = useTranslation();
  const { setRole } = useDemo();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initial = ROLES.find((r) => r.id === params.get('role')) ?? ROLES[0];
  const [choice, setChoice] = useState(initial.id);
  const [username, setUsername] = useState(initial.username);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (id) => {
    setChoice(id);
    setUsername(ROLES.find((r) => r.id === id).username);
    setError('');
  };

  // The site nav links to /login?role=…; follow it when the link changes while this page is open.
  const roleParam = params.get('role');
  useEffect(() => {
    if (ROLES.some((r) => r.id === roleParam)) pick(roleParam);
  }, [roleParam]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-white/30 px-4 py-8 backdrop-blur-[6px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-md animate-fade-rise">
        <div className="card bg-white/90 p-6 sm:p-8">
          <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-muted transition-colors hover:bg-water-50 hover:text-black" aria-label="Close">
            <Icon name="x" />
          </button>
          <div className="mb-6 text-center">
            <p className="mb-3 text-xs text-muted">{t('app.demoLogin')}</p>
            <h1 id="login-title" className="font-display text-4xl font-normal sm:text-5xl" style={{ lineHeight: 0.95, letterSpacing: '-1.5px' }}>
              Step <em className="text-muted">into the flow.</em>
            </h1>
            <p className="mt-3 text-sm text-muted">{t('app.tagline')}</p>
          </div>

          <div className="mb-6 flex justify-center gap-2" role="group" aria-label="Language">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => i18n.changeLanguage(l.code)}
                aria-pressed={i18n.language === l.code}
                className={`min-h-10 rounded-full px-4 text-sm transition-colors ${i18n.language === l.code ? 'bg-black text-white' : 'text-muted hover:text-black'}`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <h2 className="section-title mb-3">{t('login.who')}</h2>
          <div className="flex flex-col gap-2" role="radiogroup">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={choice === r.id}
                onClick={() => pick(r.id)}
                className={`flex min-h-16 items-center gap-4 rounded-2xl border p-3 text-left transition ${choice === r.id ? 'border-black bg-water-50' : 'border-black/[0.08] bg-white/60 hover:border-black/30'}`}
              >
                {choice === r.id ? (
                  <Ripple icon={r.icon} size="sm" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-water-50 text-water-600">
                    <Icon name={r.icon} className="h-5 w-5" />
                  </span>
                )}
                <span className="flex-1">
                  <span className="block font-medium">{t(`login.${r.id}`)}</span>
                  <span className="block text-sm text-muted">{t(`login.${r.id}Hint`)}</span>
                </span>
                {choice === r.id && <Icon name="checkCircle" className="h-5 w-5" />}
              </button>
            ))}
          </div>

          <form onSubmit={go} className="mt-6 flex flex-col gap-3">
            {dataSource === 'api' && (
              <>
                <label className="block text-sm">
                  <span className="text-muted">Username</span>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="mt-1 min-h-12 w-full rounded-full border border-black/15 bg-white/80 px-5 focus:border-black" />
                </label>
                <label className="block text-sm">
                  <span className="text-muted">Password</span>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="mt-1 min-h-12 w-full rounded-full border border-black/15 bg-white/80 px-5 focus:border-black" />
                </label>
                <p className="px-1 text-xs text-muted">Demo accounts are filled in for you. They belong to fictional users.</p>
              </>
            )}
            {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary mt-2 w-full py-4 text-base">
              {t('login.continue')}
              <Icon name="arrow" />
            </button>
          </form>
          <p className="mt-5 text-center text-xs text-muted">Fictional village and demo users. No personal data is collected.</p>
        </div>
      </div>
    </div>
  );
}
