import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../demo/DemoContext';
import { LANGUAGES } from '../i18n';
import { villages, HOME_VILLAGE, areas, CITIZEN_AREA, dataSource } from '../data/seed';
import Icon from './Icon';
import DemoBar from './DemoBar';
import { Caustics, WaterBackdrop } from './water';
import { signOut } from '../data/api';

const NAV = {
  citizen: [
    { to: '/citizen', icon: 'home', key: 'nav.home', end: true, tint: 'text-sky-600' },
    { to: '/citizen/report', icon: 'alert', key: 'nav.report', tint: 'text-rose-600' },
    { to: '/citizen/complaints', icon: 'list', key: 'nav.complaints', tint: 'text-orange-600' },
    { to: '/citizen/map', icon: 'map', key: 'nav.map', tint: 'text-emerald-600' },
  ],
  gp: [
    { to: '/gp', icon: 'home', label: 'Home', end: true, tint: 'text-sky-600' },
    { to: '/gp/water', icon: 'sensor', label: 'Water Status', tint: 'text-cyan-600' },
    { to: '/gp/complaints', icon: 'list', label: 'Complaints', tint: 'text-orange-600' },
    { to: '/gp/pipelines', icon: 'pipe', label: 'Pipeline Health', tint: 'text-amber-600' },
    { to: '/gp/map', icon: 'map', label: 'Village Map', tint: 'text-emerald-600' },
    { to: '/gp/tasks', icon: 'wrench', label: 'Maintenance', tint: 'text-violet-600' },
  ],
  officer: [
    { to: '/officer', icon: 'chart', label: 'Overview', end: true, tint: 'text-sky-600' },
    { to: '/officer/pipelines', icon: 'pipe', label: 'High-risk pipelines', tint: 'text-amber-600' },
    { to: '/officer/risk-rules', icon: 'list', label: 'Risk rules', tint: 'text-indigo-600' },
  ],
};

const THEME_KEY = 'jalrakshak.theme';

function storedDark() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark';
  } catch {
    return false;
  }
}

/** Dark mode for the signed-in app. The class sits on <html> only while the app is open, so the landing page stays light. */
function useDarkMode() {
  const [dark, setDark] = useState(storedDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      // Storage blocked: the choice lasts until the page is closed.
    }
    return () => document.documentElement.classList.remove('dark');
  }, [dark]);
  return [dark, setDark];
}

function ThemeToggle({ dark, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="flex h-9 items-center gap-1 rounded-full border border-black/10 bg-white/70 p-1 transition-colors hover:border-black/30"
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${dark ? 'text-muted' : 'bg-black text-white'}`}>
        <Icon name="sun" className="h-4 w-4" />
      </span>
      <span className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${dark ? 'bg-black text-white' : 'text-muted'}`}>
        <Icon name="moon" className="h-4 w-4" />
      </span>
    </button>
  );
}

const ROLE_LABEL = { citizen: 'Villager', gp: 'Gram Panchayat', officer: 'Government Officer' };

function LanguageSwitch({ compact }) {
  const { i18n } = useTranslation();
  return (
    <div className="flex gap-1" role="group" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => i18n.changeLanguage(l.code)}
          aria-pressed={i18n.language === l.code}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${i18n.language === l.code ? 'bg-black text-white' : 'text-muted hover:text-black'} ${compact ? 'px-2' : ''}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export default function AppShell() {
  const { role, setRole } = useDemo();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dark, setDark] = useDarkMode();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const items = NAV[role] ?? [];
  const label = (it) => it.label ?? t(it.key);
  const context = role === 'officer' ? 'Demo block · 3 villages' : role === 'citizen' ? `${villages[HOME_VILLAGE].name} · ${areas[CITIZEN_AREA].name}` : `${villages[HOME_VILLAGE].name} Gram Panchayat`;

  const switchRole = () => {
    signOut();
    setRole(null);
    navigate('/login');
  };

  return (
    <div className="relative min-h-screen bg-app md:flex">
      <Caustics />
      <WaterBackdrop />

      {/* Desktop sidebar */}
      <aside className="glass-bar sticky top-0 z-10 hidden h-screen w-64 shrink-0 flex-col border-r px-5 py-6 md:flex xl:w-72">
        <Link to="/" className="mb-8 block">
          <span className="font-display text-3xl tracking-tight">
            JalRakshak
            <sup className="ml-0.5 inline-block align-super">
              <Icon name="drop" className="inline h-3 w-3" />
            </sup>
          </span>
          <span className="mt-1 block text-xs text-muted">{ROLE_LABEL[role]}</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-full px-4 text-[0.95rem] transition-colors ${isActive ? 'bg-black text-white' : 'text-muted hover:bg-water-50 hover:text-black'}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={it.icon} className={`h-5 w-5 ${isActive ? '' : it.tint}`} />
                  {label(it)}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {role === 'citizen' && (
          <div className="mb-3">
            <LanguageSwitch compact />
          </div>
        )}
        <button type="button" onClick={switchRole} className="flex min-h-11 items-center gap-3 rounded-full px-4 text-sm text-muted transition-colors hover:bg-water-50 hover:text-black">
          <Icon name="logout" className="h-[18px] w-[18px]" />
          {t('nav.switchRole')}
        </button>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="glass-bar sticky top-0 z-20 flex items-center justify-between gap-2 border-b px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="font-display text-2xl tracking-tight md:hidden">
              JalRakshak
            </Link>
            <p className="hidden truncate text-sm text-muted sm:block">
              <Icon name="pin" className="mr-1 inline h-4 w-4" />
              {context}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {role === 'citizen' && (
              <div className="md:hidden">
                <LanguageSwitch compact />
              </div>
            )}
            {role !== 'citizen' && (
              <span
                className={`hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs sm:inline-flex ${dataSource === 'api' ? 'border-water-200 bg-water-50 text-water-900' : 'border-black/10 text-muted'}`}
                title={dataSource === 'api' ? 'Data served by the JalRakshak API' : 'Backend not running: showing the demo seed bundled with the app'}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dataSource === 'api' ? 'bg-water-600' : 'bg-muted'}`} />
                {dataSource === 'api' ? 'API connected' : 'Offline demo data'}
              </span>
            )}
            <span className="hidden rounded-full border border-black/10 px-3 py-1 text-xs text-muted sm:inline">Prototype</span>
            <ThemeToggle dark={dark} onToggle={() => setDark((d) => !d)} />
            <button type="button" onClick={switchRole} className="rounded-full p-2 text-muted hover:bg-water-50 md:hidden" aria-label={t('nav.switchRole')}>
              <Icon name="logout" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1680px] flex-1 px-5 pb-40 pt-8 md:px-10 md:pb-24 xl:px-14">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="glass-bar fixed inset-x-0 bottom-0 z-30 flex border-t md:hidden" aria-label="Main">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive ? 'text-black' : 'text-muted'}`}
          >
            {({ isActive }) => (
              <>
                <span className={`flex h-7 w-10 items-center justify-center rounded-full ${isActive ? `bg-water-100 ${it.tint}` : ''}`}>
                  <Icon name={it.icon} />
                </span>
                <span className="max-w-full truncate px-1">{label(it)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <DemoBar />
    </div>
  );
}
