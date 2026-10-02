/**
 * How much work a frame is allowed. A desktop GPU draws the flight at full quality with room to
 * spare, while a phone has a sixth to a tenth of that throughput, so phones and tablets get a
 * profile that keeps the look and spends far less where the eye does not resolve it at arm's
 * length: the haze is soft by nature and needs fewer steps, the reflection is blurred by the
 * ripples anyway, and the dust is too fine to count.
 */
export interface Quality {
  readonly name: 'full' | 'handheld';
  /** Highest device pixel ratio the drawing buffer is rendered at. */
  readonly maxPixelRatio: number;
  /** Multisample count of the scene target. */
  readonly samples: number;
  /** The reflection's resolution, as a share of the drawing buffer on each axis. */
  readonly mirrorScale: number;
  /** Steps of the haze march, in the view and in the reflection. */
  readonly hazeSteps: number;
  readonly mirrorHazeSteps: number;
  /** Motes of dust in the air over the river. */
  readonly dust: number;
}

export const QUALITY: Readonly<Record<Quality['name'], Quality>> = {
  full: { name: 'full', maxPixelRatio: 2, samples: 4, mirrorScale: 0.5, hazeSteps: 18, mirrorHazeSteps: 8, dust: 3000 },
  handheld: {
    name: 'handheld',
    maxPixelRatio: 1.5,
    samples: 2,
    mirrorScale: 0.34,
    hazeSteps: 9,
    mirrorHazeSteps: 4,
    dust: 1600,
  },
};

/** The most haze steps any profile asks for, the bound of the shader's loop. */
export const MAX_HAZE_STEPS = Math.max(QUALITY.full.hazeSteps, QUALITY.handheld.hazeSteps);

export interface Device {
  /** Whether the primary pointer is a finger, from `(pointer: coarse)`. */
  readonly coarsePointer: boolean;
  /** Shorter side of the screen in CSS pixels. */
  readonly shortSide: number;
}

/** Touch-first devices and small screens take the handheld profile. */
export function pickQuality({ coarsePointer, shortSide }: Device): Quality {
  return coarsePointer || shortSide < 600 ? QUALITY.handheld : QUALITY.full;
}

/**
 * Watches how long frames take and lowers the pixel ratio when a device cannot keep up, so an
 * older phone settles at a density it can hold instead of stuttering. It only ever steps
 * down, and waits between steps so one slow moment does not cost the whole visit its sharpness.
 *
 *   frames ─► median of the last 90 ─► above 20 ms? ─► pixel ratio − 0.25, then wait 2 s
 */
export const GOVERNOR = {
  window: 90,
  /** Median frame interval above which the device is falling short of sixty frames a second. */
  budgetMs: 20,
  step: 0.25,
  floor: 1,
  cooldownMs: 2000,
} as const;

export class FrameGovernor {
  private readonly intervals: number[] = [];
  private lastStep = -Infinity;

  constructor(private ratio: number) {}

  get pixelRatio(): number {
    return this.ratio;
  }

  /** Records one frame interval and returns a lower pixel ratio when the device has been falling behind, or null. */
  sample(intervalMs: number, nowMs: number): number | null {
    this.intervals.push(intervalMs);
    if (this.intervals.length > GOVERNOR.window) this.intervals.shift();
    if (this.intervals.length < GOVERNOR.window || nowMs - this.lastStep < GOVERNOR.cooldownMs) return null;
    if (this.ratio <= GOVERNOR.floor) return null;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    if (median <= GOVERNOR.budgetMs) return null;
    this.ratio = Math.max(GOVERNOR.floor, this.ratio - GOVERNOR.step);
    this.lastStep = nowMs;
    this.intervals.length = 0;
    return this.ratio;
  }
}
