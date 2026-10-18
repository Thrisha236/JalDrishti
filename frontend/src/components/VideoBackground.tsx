import { useEffect, useRef } from 'react';

const FADE_SECONDS = 0.5;

/**
 * Looping background video with a manual loop: it fades in over the first 0.5 s, fades out over the
 * last 0.5 s, then restarts from 0 after a 100 ms pause. Opacity is written straight to the element,
 * so the animation never re-renders React.
 */
export default function VideoBackground({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    let frame = 0;
    let restart: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const { currentTime, duration } = video;
      if (duration > 0 && Number.isFinite(duration)) {
        let opacity = 1;
        if (currentTime < FADE_SECONDS) opacity = currentTime / FADE_SECONDS;
        else if (duration - currentTime < FADE_SECONDS) opacity = (duration - currentTime) / FADE_SECONDS;
        video.style.opacity = String(Math.max(0, Math.min(1, opacity)));
      }
      frame = requestAnimationFrame(tick);
    };

    const onEnded = () => {
      video.style.opacity = '0';
      restart = setTimeout(() => {
        video.currentTime = 0;
        video.play().catch(() => {});
      }, 100);
    };

    video.addEventListener('ended', onEnded);
    frame = requestAnimationFrame(tick);
    video.play().catch(() => {});

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(restart);
      video.removeEventListener('ended', onEnded);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-0" aria-hidden="true">
      <video ref={videoRef} src={src} muted playsInline autoPlay preload="auto" className="h-full w-full object-cover" style={{ opacity: 0 }} />
      {/* A light wash behind the nav and headline only, so the video stays clear below it. */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-background/75 via-background/25 to-transparent" />
    </div>
  );
}
