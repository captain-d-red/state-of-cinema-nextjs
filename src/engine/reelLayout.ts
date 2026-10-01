import { smoothstep } from '@/lib/math';

/** The reel winds just inside the tunnel's dots, nine frames to a turn. */
export const REEL = {
  radius: 1.72,
  perTurn: 9,
  /** Distance along the flight between neighbouring frames, and where the nearest one sits. */
  spacing: 0.55,
  nearest: 1.4,
  /** Frames a second the reel runs toward the camera, so every film passes in a little over three minutes. */
  speed: 0.35,
} as const;

export interface ReelSlot {
  /** Place along the reel, zero at the camera end and growing into the distance. */
  readonly s: number;
  readonly angle: number;
  /** Offset from the camera in world units. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Opacity, in from the far dark and out as the frame slips past the camera. */
  readonly fade: number;
}

/**
 * Where frame `k` of a reel of `count` frames sits once the reel has run `flow` frames toward
 * the camera. The place wraps, so a frame that passes the camera rejoins at the far end.
 *
 *   s     = (k − flow) mod count
 *   angle = 2π · s / 9
 *   z     = −1.4 − 0.55 · s
 */
export function reelSlot(k: number, flow: number, count: number): ReelSlot {
  const s = (((k - flow) % count) + count) % count;
  const angle = (2 * Math.PI * s) / REEL.perTurn;
  return {
    s,
    angle,
    x: Math.cos(angle) * REEL.radius,
    y: Math.sin(angle) * REEL.radius,
    z: -REEL.nearest - s * REEL.spacing,
    fade: smoothstep(0, 1.2, s) * (1 - smoothstep(count * 0.55, count * 0.8, s)),
  };
}
