import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import SiteNav from '../components/SiteNav';
import VideoBackground from '../components/VideoBackground';
import LoginDialog from './Login';

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4';

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

      <section className="relative z-10 flex flex-col items-center justify-center px-6 pb-40 text-center" style={{ paddingTop: 'calc(8rem - 75px)' }}>
        <h1
          className="max-w-7xl animate-fade-rise font-display text-5xl font-normal sm:text-7xl md:text-8xl"
          style={{ lineHeight: 0.95, letterSpacing: '-2.46px', color: '#000000' }}
        >
          Beyond <em style={{ color: '#6F6F6F' }}>the tap,</em> we guard <em style={{ color: '#6F6F6F' }}>every drop.</em>
        </h1>

        <p className="mt-8 max-w-2xl animate-fade-rise-delay text-base leading-relaxed sm:text-lg" style={{ color: '#6F6F6F' }}>
          Sensors, villagers and the Gram Panchayat, flowing as one. We turn pressure readings and complaints into clear repairs, then confirm the water is truly back.
        </p>

        <Link
          to="/login"
          className="mt-12 animate-fade-rise-delay-2 rounded-full px-14 py-5 text-base transition-transform duration-200 hover:scale-[1.03]"
          style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
        >
          Begin Journey
        </Link>

        <p className="mt-6 animate-fade-rise-delay-2 text-xs" style={{ color: '#6F6F6F' }}>
          SIH 2026 prototype · fictional village and demo data
        </p>
      </section>

      {/* Keyed by the query so /login?role=gp preselects that role each time. */}
      {loginOpen && <LoginDialog key={search} onClose={closeLogin} />}
    </div>
  );
}
