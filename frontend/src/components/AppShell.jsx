import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDemo } from '../demo/DemoContext';
import { LANGUAGES } from '../i18n';
import { villages, HOME_VILLAGE, areas, CITIZEN_AREA, dataSource } from '../data/seed';
import Icon from './Icon';
import DemoBar from './DemoBar';

const NAV = {
  citizen: [
    { to: '/citizen', icon: 'home', key: 'nav.home', end: true },
    { to: '/citizen/report', icon: 'alert', key: 'nav.report' },
    { to: '/citizen/complaints', icon: 'list', key: 'nav.complaints' },
    { to: '/citizen/map', icon: 'map', key: 'nav.map' },
  ],
  gp: [
    { to: '/gp', icon: 'home', label: 'Home', end: true },
    { to: '/gp/water', icon: 'sensor', label: 'Water Status' },
    { to: '/gp/complaints', icon: 'list', label: 'Complaints' },
    { to: '/gp/pipelines', icon: 'pipe', label: 'Pipeline Health' },
    { to: '/gp/map', icon: 'map', label: 'Village Map' },
    { to: '/gp/tasks/T-118', icon: 'wrench', label: 'Maintenance' },
  ],
  officer: [
    { to: '/officer', icon: 'chart', label: 'Overview', end: true },
    { to: '/officer/pipelines', icon: 'pipe', label: 'High-risk pipelines' },
  ],
};

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
          className={`rounded-full px-3 py-1 text-sm font-medium ${i18n.language === l.code ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink hover:bg-slate-200'} ${compact ? 'px-2' : ''}`}
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
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const items = NAV[role] ?? [];
  const label = (it) => it.label ?? t(it.key);
  const context = role === 'officer' ? 'Demo block · 3 villages' : role === 'citizen' ? `${villages[HOME_VILLAGE].name} · ${areas[CITIZEN_AREA].name}` : `${villages[HOME_VILLAGE].name} Gram Panchayat`;

  const switchRole = () => {
    setRole(null);
    navigate('/');
  };

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Icon name="drop" className="h-6 w-6" />
          </span>
          <div>
            <p className="font-bold leading-tight">JalRakshak</p>
            <p className="text-xs text-muted">{ROLE_LABEL[role]}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium ${isActive ? 'bg-brand-600 text-white' : 'text-ink hover:bg-slate-100'}`
              }
            >
              <Icon name={it.icon} />
              {label(it)}
            </NavLink>
          ))}
        </nav>
        {role === 'citizen' && (
          <div className="mb-3">
            <LanguageSwitch compact />
          </div>
        )}
        <button type="button" onClick={switchRole} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-muted hover:bg-slate-100">
          <Icon name="logout" />
          {t('nav.switchRole')}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white md:hidden">
              <Icon name="drop" />
            </span>
            <p className="truncate text-sm text-muted">
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
                className={`hidden rounded-md px-2 py-0.5 text-xs font-semibold sm:inline ${dataSource === 'api' ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}`}
                title={dataSource === 'api' ? 'Data served by the JalRakshak API' : 'Backend not running: showing the demo seed bundled with the app'}
              >
                {dataSource === 'api' ? 'API connected' : 'Offline demo data'}
              </span>
            )}
            <span className="hidden rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 sm:inline">Prototype</span>
            <button type="button" onClick={switchRole} className="rounded-lg p-2 text-muted hover:bg-slate-100 md:hidden" aria-label={t('nav.switchRole')}>
              <Icon name="logout" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-40 pt-5 md:pb-24">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white md:hidden" aria-label="Main">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? 'text-brand-600' : 'text-muted'}`}
          >
            <Icon name={it.icon} />
            <span className="max-w-full truncate px-1">{label(it)}</span>
          </NavLink>
        ))}
      </nav>

      <DemoBar />
    </div>
  );
}
