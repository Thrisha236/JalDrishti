import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import SiteNav from '../components/SiteNav';
import VideoBackground from '../components/VideoBackground';
import Icon from '../components/Icon';
import LoginDialog from './Login';

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4';

// The three things the problem statement asks for, each with what the prototype shows (all simulated).
const PILLARS = [
  {
    icon: 'link',
    title: 'Plugs into the national platforms',
    tag: 'Simulated connectors',
    points: ['Keyed on Sujal Gaon and Sujalam Bharat IDs', 'Incidents and monitoring flow to IMIS', 'Tap functionality goes to the JJM Dashboard', 'Sample requests go to WQMIS'],
  },
  {
    icon: 'spark',
    title: 'AI watches every tap',
    tag: 'Live on simulated sensors',
    points: ['Anomaly detection on pressure and flow', 'Functional or not, for each household tap', 'Faulty sensors never mistaken for faulty water', 'Every score explained, none a black box'],
  },
  {
    icon: 'gauge',
    title: 'Predicts before it breaks',
    tag: 'Forecasts, not guesses',
    points: ['Minutes until pressure leaves its band', 'Chlorine outlook says where to test water', 'Failure window from each pipe’s history', 'Issues shown on the map where they happen'],
  },
];

const LOOP = [
  ['spark', 'Predict'],
  ['alert', 'Report'],
  ['list', 'Review'],
  ['chart', 'Prioritise'],
  ['wrench', 'Maintain'],
  ['shield', 'Verify'],
  ['users', 'Inform'],
];

export default function Landing() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  // The popup opens only from Begin Journey or the nav links; it is part of the URL (/login, /login?role=gp).
  const loginOpen = pathname === '/login';
  const closeLogin = useCallback(() => navigate('/'), [navigate]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      <VideoBackground src={VIDEO_URL} />

      <SiteNav active="Home" />

      <section className="relative z-10 flex flex-col items-center justify-center px-6 pb-20 text-center" style={{ paddingTop: 'calc(8rem - 75px)' }}>
        <h1
          className="max-w-6xl animate-fade-rise font-display text-4xl font-extrabold sm:text-6xl md:text-7xl"
          style={{ lineHeight: 1.05, letterSpacing: '-0.035em', color: '#000000' }}
        >
          Beyond <em style={{ color: '#6F6F6F' }}>the tap,</em> we guard <em style={{ color: '#6F6F6F' }}>every drop.</em>
        </h1>

        <p className="mt-8 max-w-2xl animate-fade-rise-delay rounded-3xl bg-white/60 px-6 py-4 text-base leading-relaxed shadow-sm backdrop-blur-md sm:text-lg" style={{ color: '#3F3F46' }}>
          AI that watches every household tap, predicts problems early, and reports to the platforms the Mission already uses.
        </p>

        <Link
          to="/login"
          className="mt-10 animate-fade-rise-delay-2 rounded-full px-14 py-5 text-base transition-transform duration-200 hover:scale-[1.03]"
          style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
        >
          Begin Journey
        </Link>

        <p className="mt-6 animate-fade-rise-delay-2 rounded-full bg-white/60 px-4 py-1 text-xs backdrop-blur-md" style={{ color: '#52525B' }}>
          SIH 2026 prototype · fictional village, simulated sensors and mock platform connectors
        </p>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-5 md:grid-cols-3">
          {PILLARS.map((p) => (
            <article key={p.title} className="rounded-3xl border border-white/70 bg-white/70 p-6 text-left shadow-lg backdrop-blur-xl">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-black text-white">
                <Icon name={p.icon} className="h-6 w-6" />
              </span>
              <h2 className="font-display text-3xl leading-tight tracking-tight" style={{ color: '#000000' }}>{p.title}</h2>
              <p className="mt-1 text-xs uppercase tracking-wide" style={{ color: '#6F6F6F' }}>{p.tag}</p>
              <ul className="mt-4 flex flex-col gap-2 text-sm" style={{ color: '#27272A' }}>
                {p.points.map((x) => (
                  <li key={x} className="flex gap-2">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {x}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <ol className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 rounded-3xl border border-white/70 bg-white/70 px-6 py-5 backdrop-blur-xl" aria-label="The closed loop">
          {LOOP.map(([icon, label], i) => (
            <li key={label} className="flex items-center gap-2">
              <span className="flex items-center gap-2 rounded-full bg-black/[0.06] px-4 py-2 text-sm" style={{ color: '#000000' }}>
                <Icon name={icon} className="h-4 w-4" />
                {label}
              </span>
              {i < LOOP.length - 1 && <Icon name="arrow" className="h-4 w-4 text-zinc-400" />}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-center text-xs" style={{ color: '#52525B' }}>
          Every simulated value is labelled on screen. No real government system is contacted.
        </p>
      </section>

      {/* Keyed by the query so /login?role=gp preselects that role each time. */}
      {loginOpen && <LoginDialog key={search} onClose={closeLogin} />}
    </div>
  );
}
