'use client';

import Lenis from 'lenis';
import { useEffect, useRef, useState } from 'react';
import { catalogue, type Film } from '@/data/catalogue';
import { CATEGORIES } from '@/data/platform';
import { buildStory } from '@/data/story';
import { Engine } from '@/engine/Engine';
import { QUALITY, pickQuality, type Quality } from '@/engine/quality';
import { SCROLL_PER_STATION } from '@/engine/scroll';
import { uiFont } from '@/lib/fonts';
import { clamp } from '@/lib/math';
import { Sound } from '@/lib/sound';
import styles from './Cinema.module.css';
import { Hud } from './Hud';
import { Logotype } from './Logotype';
import { TrailerDialog } from './TrailerDialog';
import { FocusReticle, type ReticleHandle } from './Viewfinder';

type Status = 'starting' | 'running' | 'unsupported';

const story = buildStory(catalogue);
const COUNT = story.length;
/** The last pick in the story is number one, the film the outro offers to play. */
const topPick = story.flatMap((s) => (s.kind === 'pick' ? [s.film] : [])).at(-1) ?? null;
/**
 * The quality profile for this device. `?quality=full` or `?quality=handheld` overrides the
 * choice, so the two can be compared on the same phone.
 */
function chooseQuality(): Quality {
  const forced = new URLSearchParams(window.location.search).get('quality');
  if (forced === 'full' || forced === 'handheld') return QUALITY[forced];
  return pickQuality({
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    shortSide: Math.min(window.screen.width, window.screen.height),
  });
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Frames the stage as a true 16:9 with black bars, for recording. False lets it fill the window. */
const LETTERBOX = false;
/** What the opening's curtain is printed with: the title in foil, small lines in ink at its corners. */
const CURTAIN = {
  kicker: 'A first look',
  corner: CATEGORIES.join(' · '),
  title: ['The state', 'of experiences'],
  foot: 'The best of everything, picked for you',
  cue: 'A flight in seven reels',
} as const;

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
  const [started, setStarted] = useState(false);
  const countRef = useRef<HTMLSpanElement>(null);
  const reticleRef = useRef<ReticleHandle>(null);
  const meterRef = useRef<HTMLOutputElement>(null);
  const [playing, setPlaying] = useState<Film | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const soundRef = useRef<Sound | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const quality = chooseQuality();
    document.documentElement.dataset.quality = quality.name;
    const meter = new URLSearchParams(window.location.search).has('fps') ? meterRef.current : null;
    let meterFrames = 0;
    let meterSince = 0;
    const lenis = new Lenis({ autoRaf: false, lerp: reducedMotion ? 1 : 0.08, wheelMultiplier: 0.9 });
    lenisRef.current = lenis;
    const pointer = { x: 0, y: 0, active: false, down: false };
    /** Whether the press now ending pinched the cloth, so its click does not also drop a ring. */
    let pinched = false;
    /** Taps and clicks since the last frame, in normalised device coordinates. */
    let taps: { x: number; y: number }[] = [];
    let engine: Engine | null = null;
    let raf = 0;
    let shown = -1;
    let hovered: number | null = null;
    let began = false;
    let lastTime = 0;

    jumpRef.current = (target) => {
      const i = clamp(Math.round(target), 0, COUNT - 1);
      const distance = Math.abs(i - lenis.progress * (COUNT - 1));
      // Leaving the opening takes longer, because the curtain opens before the flight begins.
      const curtain = lenis.progress * (COUNT - 1) < 0.5 && i > 0 ? 1.4 : 0;
      lenis.scrollTo((i / (COUNT - 1)) * lenis.limit, {
        duration: reducedMotion ? 0 : clamp(0.9 + distance * 0.3, 0.9, 3) + curtain,
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
      // A mouse or pen press can pinch the cloth. A finger's press scrolls, so it never does.
      pointer.down = e.pointerType !== 'touch' && e.button === 0;
      pinched = false;
    };
    // A click fires for a tap but never for a swipe, so only a deliberate press sends a ring.
    const onClick = (e: MouseEvent) => {
      if (pinched) {
        pinched = false;
        return;
      }
      if (hovered !== null) {
        setPlaying(catalogue.films[hovered] ?? null);
        return;
      }
      const box = canvas.getBoundingClientRect();
      taps.push({ x: ((e.clientX - box.left) / box.width) * 2 - 1, y: 1 - ((e.clientY - box.top) / box.height) * 2 });
    };
    const onPointerUp = (e: PointerEvent) => {
      pointer.down = false;
      if (e.pointerType === 'touch') pointer.active = false;
    };
    const onPointerLeave = () => {
      pointer.active = false;
      pointer.down = false;
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
        pointerDown: pointer.down,
        taps,
      });
      if (frame.grip === 'held') pinched = true;
      taps = [];
      hovered = frame.hoveredFilm;
      // The reticle reads the scene under a mouse at the opening, in the stage's own pixels.
      const aiming = shown === 0 && pointer.active && hovered === null && frame.grip === 'none';
      reticleRef.current?.update(
        aiming
          ? { x: (pointer.x * 0.5 + 0.5) * canvas.clientWidth, y: (0.5 - pointer.y * 0.5) * canvas.clientHeight }
          : null,
        frame.focus,
        (time - lastTime) / 1000,
      );
      lastTime = time;
      if (!began) {
        if (countRef.current) countRef.current.textContent = String(Math.round(frame.loaded * 100));
        if (frame.started) {
          began = true;
          setStarted(true);
        }
      }
      soundRef.current?.update(frame);
      if (meter && engine) {
        meterFrames += 1;
        if (time - meterSince >= 500) {
          const fps = (meterFrames * 1000) / (time - meterSince);
          meter.textContent = `${fps.toFixed(0)} fps · ${quality.name} · ${engine.renderRatio.toFixed(2)}×`;
          meterFrames = 0;
          meterSince = time;
        }
      }
      canvas.style.cursor =
        frame.grip === 'held' ? 'grabbing' : frame.grip === 'over' ? 'grab' : hovered !== null ? 'pointer' : '';
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
          curtain: CURTAIN,
          reducedMotion,
          quality,
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
    canvas.addEventListener('click', onClick);

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
      canvas.removeEventListener('click', onClick);
      lenis.destroy();
      lenisRef.current = null;
      soundRef.current?.dispose();
      soundRef.current = null;
      engine?.dispose();
      engine = null;
    };
  }, []);

  // Sound starts from the toggle, the user gesture browsers require, and the trailer silences it.
  const toggleSound = () => {
    const next = !soundOn;
    soundRef.current ??= next ? new Sound() : null;
    setSoundOn(next);
  };
  useEffect(() => {
    soundRef.current?.setEnabled(soundOn && !playing);
  }, [soundOn, playing]);

  // The page holds still under the trailer, so a wheel inside the player never flies the camera.
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    if (playing) lenis.stop();
    else lenis.start();
  }, [playing]);

  return (
    <div className={styles.root} data-status={status}>
      <div className={styles.stage} data-frame={LETTERBOX ? '16:9' : undefined}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        <FocusReticle ref={reticleRef} shown={started && station === 0} />
        {/* Frame meter, shown with ?fps in the address, for checking the rate on a real phone. */}
        <output ref={meterRef} className={styles.meter} aria-hidden="true" />
        {started && (
          <Hud
            story={story}
            index={station}
            topPick={topPick}
            soundOn={soundOn}
            onToggleSound={toggleSound}
            onPlay={setPlaying}
            onJump={(i) => jumpRef.current(i)}
          />
        )}
        <div className={styles.loader} data-done={started || status === 'unsupported'} aria-hidden={started}>
          <Logotype className={styles.loaderMark} />
          <p className={styles.loaderCount} role="status">
            <span ref={countRef}>0</span>%
          </p>
        </div>
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
