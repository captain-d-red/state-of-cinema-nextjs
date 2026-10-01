'use client';

import Lenis from 'lenis';
import { useEffect, useRef, useState } from 'react';
import { catalogue, type Film } from '@/data/catalogue';
import { buildStory } from '@/data/story';
import { Engine } from '@/engine/Engine';
import { SCROLL_PER_STATION } from '@/engine/scroll';
import { uiFont } from '@/lib/fonts';
import { clamp } from '@/lib/math';
import styles from './Cinema.module.css';
import { Hud } from './Hud';
import { TrailerDialog } from './TrailerDialog';

type Status = 'starting' | 'running' | 'unsupported';

const story = buildStory(catalogue);
const COUNT = story.length;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The page's one moving part. React owns the structure and the station in view, while the
 * frame loop drives the engine, so nothing re-renders at sixty frames a second.
 */
export function Cinema() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jumpRef = useRef<(station: number) => void>(() => {});
  const lenisRef = useRef<Lenis | null>(null);
  const [station, setStation] = useState(0);
  const [status, setStatus] = useState<Status>('starting');
  const [playing, setPlaying] = useState<Film | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lenis = new Lenis({ autoRaf: false, lerp: reducedMotion ? 1 : 0.08, wheelMultiplier: 0.9 });
    lenisRef.current = lenis;
    const pointer = { x: 0, y: 0, active: false, clicks: 0 };
    let engine: Engine | null = null;
    let raf = 0;
    let shown = -1;

    jumpRef.current = (target) => {
      const i = clamp(Math.round(target), 0, COUNT - 1);
      const distance = Math.abs(i - lenis.progress * (COUNT - 1));
      lenis.scrollTo((i / (COUNT - 1)) * lenis.limit, {
        duration: reducedMotion ? 0 : clamp(0.9 + distance * 0.3, 0.9, 3),
        easing: easeInOutCubic,
      });
    };

    const locate = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - box.left) / box.width) * 2 - 1;
      pointer.y = 1 - ((e.clientY - box.top) / box.height) * 2;
    };
    const onPointerMove = (e: PointerEvent) => {
      locate(e);
      pointer.active = e.pointerType !== 'touch';
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.target !== canvas) return;
      locate(e);
      pointer.active = true;
      pointer.clicks += 1;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') pointer.active = false;
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      const step =
        e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0) return;
      e.preventDefault();
      jumpRef.current(shown + step);
    };

    const resize = () => engine?.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
    const observer = new ResizeObserver(resize);

    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      if (!engine) return;
      lenis.raf(time);
      const frame = engine.frame(time, {
        position: lenis.progress * (COUNT - 1),
        pointerX: pointer.x,
        pointerY: pointer.y,
        pointerActive: pointer.active,
        clicks: pointer.clicks,
      });
      pointer.clicks = 0;
      if (frame.station !== shown) {
        shown = frame.station;
        setStation(frame.station);
      }
    };

    let disposed = false;
    const start = () => {
      if (disposed) return;
      try {
        engine = new Engine({
          canvas,
          catalogue,
          story,
          fontFamily: uiFont.style.fontFamily,
          reducedMotion,
          onError: (error) => console.error(error),
        });
      } catch (error) {
        console.error(error);
        setStatus('unsupported');
        return;
      }
      resize();
      observer.observe(canvas);
      setStatus('running');
      raf = requestAnimationFrame(tick);
    };
    // The figures are sampled from glyphs drawn in a canvas, so the face must be ready first.
    document.fonts
      .load(`700 220px ${uiFont.style.fontFamily}`)
      .catch(() => [])
      .then(start);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('keydown', onKey);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKey);
      lenis.destroy();
      lenisRef.current = null;
      engine?.dispose();
      engine = null;
    };
  }, []);

  // The page holds still under the trailer, so a wheel inside the player never flies the camera.
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    if (playing) lenis.stop();
    else lenis.start();
  }, [playing]);

  return (
    <div className={styles.root} data-status={status}>
      <div className={styles.stage}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        <Hud story={story} index={station} onPlay={setPlaying} onJump={(i) => jumpRef.current(i)} />
      </div>
      {status === 'unsupported' && (
        <p className={styles.unsupported} role="status">
          This flight needs WebGL 2, which this browser has turned off. The full list of films is below.
        </p>
      )}
      <div className={styles.track} style={{ height: `calc(100lvh + ${(COUNT - 1) * SCROLL_PER_STATION * 100}lvh)` }} />
      <TrailerDialog film={playing} onClose={() => setPlaying(null)} />
    </div>
  );
}
