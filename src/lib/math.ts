export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Frame-rate independent exponential smoothing. `lambda` is the decay rate per second,
 * so a value moves the same distance toward its target at 30, 60 or 144 frames a second.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/**
 * Formats cumulative minutes as the running time of the long take, for example
 * `118:24:05` for 118 hours, 24 minutes and 5 seconds.
 */
export function formatRunningTime(totalMinutes: number): string {
  const seconds = Math.max(0, Math.floor(totalMinutes * 60));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
