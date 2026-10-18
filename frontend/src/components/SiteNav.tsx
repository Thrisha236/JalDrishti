import { Link } from 'react-router-dom';
import Icon from './Icon';

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/login?role=citizen', label: 'Villagers' },
  { to: '/login?role=gp', label: 'Panchayat' },
  { to: '/login?role=officer', label: 'Officers' },
];

/** Top navigation for the public pages (landing and sign-in). */
export default function SiteNav({ active = 'Home' }: { active?: string }) {
  return (
    <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-8 py-6" aria-label="Site">
      <Link to="/" className="font-display text-3xl tracking-tight" style={{ color: '#000000' }}>
        JalRakshak
        <sup className="ml-0.5 inline-block align-super">
          <Icon name="drop" className="inline h-3 w-3" />
        </sup>
      </Link>
      <ul className="hidden items-center gap-8 md:flex">
        {LINKS.map((l) => (
          <li key={l.label}>
            <Link
              to={l.to}
              className="text-sm transition-colors hover:!text-black"
              style={{ color: l.label === active ? '#000000' : '#6F6F6F' }}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        to="/login"
        className="rounded-full px-6 py-2.5 text-sm transition-transform duration-200 hover:scale-[1.03]"
        style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
      >
        Begin Journey
      </Link>
    </nav>
  );
}
