/**
 * Scroll is time in the darkroom. Each station of the story owns one stretch of the page,
 * and a dwell holds the view at a station before hurrying to the next.
 */

/** Scroll distance per station, as a share of the viewport height. */
export const SCROLL_PER_STATION = 1.1;

/**
 * How strongly the view holds at a station. Zero is a constant speed, and near one the view
 * lingers at each station and hurries between them.
 */
export const DWELL = 0.7;

/**
 * Eases a continuous station position so integers hold still. Over each unit the curve is
 * p − k·sin(2πp)/2π, whose slope 1 − k·cos(2πp) is lowest, 1 − k, at every station.
 */
export function dwell(position: number, strength = DWELL): number {
  return position - (strength * Math.sin(2 * Math.PI * position)) / (2 * Math.PI);
}

export interface Between {
  /** The station at or before the position. */
  readonly from: number;
  /** The station after it, or the same station at the end of the story. */
  readonly to: number;
  /** Progress from one to the other, zero to one. */
  readonly t: number;
}

/** Splits a dwelled position into the two stations it lies between. */
export function between(position: number, count: number): Between {
  const clamped = Math.min(Math.max(position, 0), count - 1);
  const from = Math.min(Math.floor(clamped), count - 1);
  const to = Math.min(from + 1, count - 1);
  return { from, to, t: to === from ? 0 : clamped - from };
}
