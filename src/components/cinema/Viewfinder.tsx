'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import styles from './Viewfinder.module.css';

/**
 * Small camera instruments for the opening, drawn in SVG over the scene: the record light and
 * a running timecode, a strip of film rolling as a cue to scroll, and a focus reticle that
 * follows the pointer across the water and locks when it comes to rest.
 */

/** Cinema runs at twenty-four frames a second, so the timecode counts frames in twenty-fours. */
const FPS = 24;

const pad = (n: number) => String(n).padStart(2, '0');

/** Seconds as a timecode, hours, minutes, seconds and frames. */
export function timecode(seconds: number): string {
  const frames = Math.floor(seconds * FPS);
  const f = frames % FPS;
  const s = Math.floor(frames / FPS);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f)}`;
}

/** The record light and the take's timecode, counting from the moment the opening appears. */
export function Timecode() {
  const clock = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    let shown = '';
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const text = timecode((now - start) / 1000);
      // Only a new frame of timecode touches the page, twenty-four times a second at most.
      if (text !== shown && clock.current) clock.current.textContent = shown = text;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <p className={styles.rec} aria-hidden="true">
      <svg className={styles.light} viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="4" />
      </svg>
      <span>Rec</span>
      <span ref={clock} className={styles.clock}>
        00:00:00:00
      </span>
    </p>
  );
}

/**
 * A short length of film whose frames and sprocket holes roll downward, the way a reel feeds
 * a projector, as the cue that scrolling runs the film.
 *
 *   ▫ ┌──┐ ▫      the strip is 14 wide, holes every 6 down each edge,
 *   ▫ │  │ ▫      a frame every 12, all moving one frame per cycle
 *   ▫ └──┘ ▫
 */
export function ScrollCue() {
  return (
    <svg className={styles.cue} viewBox="0 0 14 48" aria-hidden="true">
      <defs>
        <clipPath id="cue-gate">
          <rect x="0" y="0" width="14" height="48" rx="1.5" />
        </clipPath>
      </defs>
      <g clipPath="url(#cue-gate)">
        <rect className={styles.base} x="0" y="0" width="14" height="48" />
        <g className={styles.roll}>
          {Array.from({ length: 10 }, (_, i) => (
            <g key={i} transform={`translate(0 ${i * 6 - 12})`}>
              <rect className={styles.hole} x="1.4" y="1.6" width="1.8" height="2.6" rx="0.5" />
              <rect className={styles.hole} x="10.8" y="1.6" width="1.8" height="2.6" rx="0.5" />
              {i % 2 === 0 && <rect className={styles.frame} x="4.4" y="1" width="5.2" height="10" rx="0.6" />}
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}

export interface ReticleHandle {
  /**
   * Places the reticle for this frame. `at` is the pointer in stage pixels, or null when the
   * reticle should hide, and `focus` the distance to the water under it in world units.
   */
  update(at: { readonly x: number; readonly y: number } | null, focus: number | null, dt: number): void;
}

/** Movement under this many pixels a frame counts as resting, and resting this long locks focus. */
const STILL_PX = 1.5;
const LOCK_SECONDS = 0.28;

/**
 * Four corner brackets that follow the pointer over the scene. While the pointer moves they
 * stand open, hunting; once it rests on the water they close in and the distance to the point
 * in focus appears beside them, the way a camera's autofocus confirms.
 */
export function FocusReticle({ ref, shown }: { ref: Ref<ReticleHandle>; shown: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const state = useRef({ x: 0, y: 0, rest: 0, locked: false, text: '' });

  useImperativeHandle(
    ref,
    () => ({
      update(at, focus, dt) {
        const el = root.current;
        if (!el) return;
        const s = state.current;
        el.dataset.active = String(at !== null && focus !== null);
        if (!at || focus === null) {
          s.rest = 0;
          return;
        }
        const moved = Math.hypot(at.x - s.x, at.y - s.y);
        s.rest = moved < STILL_PX ? s.rest + dt : 0;
        s.x = at.x;
        s.y = at.y;
        el.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
        const locked = s.rest > LOCK_SECONDS;
        if (locked !== s.locked) el.dataset.locked = String((s.locked = locked));
        const text = `${focus.toFixed(1)} m`;
        if (locked && text !== s.text && label.current) label.current.textContent = s.text = text;
      },
    }),
    [],
  );

  return (
    <div ref={root} className={styles.reticle} data-shown={shown} data-active="false" aria-hidden="true">
      <svg viewBox="-20 -20 40 40">
        <path d="M-15 -8 V-15 H-8" />
        <path d="M8 -15 H15 V-8" />
        <path d="M15 8 V15 H8" />
        <path d="M-8 15 H-15 V8" />
        <circle className={styles.pip} cx="0" cy="0" r="1.2" />
      </svg>
      <span ref={label} className={styles.focus} />
    </div>
  );
}
