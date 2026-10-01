/**
 * Colour math in OKLab, shared by the catalogue build script and the runtime.
 * Linear sRGB is the working space, and every function is pure.
 */

export type Vec3 = readonly [number, number, number];

export interface Oklch {
  readonly L: number;
  readonly C: number;
  /** Hue in radians, in the range [0, 2π). */
  readonly h: number;
}

const TAU = Math.PI * 2;

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function linearSrgbToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinearSrgb([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function oklabToOklch([L, a, b]: Vec3): Oklch {
  const h = Math.atan2(b, a);
  return { L, C: Math.hypot(a, b), h: h < 0 ? h + TAU : h };
}

export function oklchToOklab({ L, C, h }: Oklch): Vec3 {
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

function inGamut([r, g, b]: Vec3, eps = 1e-4): boolean {
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
}

/**
 * Converts OKLCH to linear sRGB, lowering chroma by bisection until the colour
 * fits the gamut, so hue and lightness survive and only saturation gives way.
 */
export function oklchToLinearSrgb(color: Oklch): Vec3 {
  let rgb = oklabToLinearSrgb(oklchToOklab(color));
  if (inGamut(rgb)) return clamp01(rgb);
  let lo = 0;
  let hi = color.C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const candidate = oklabToLinearSrgb(oklchToOklab({ ...color, C: mid }));
    if (inGamut(candidate)) {
      lo = mid;
      rgb = candidate;
    } else {
      hi = mid;
    }
  }
  return clamp01(oklabToLinearSrgb(oklchToOklab({ ...color, C: lo })));
}

function clamp01([r, g, b]: Vec3): Vec3 {
  const c = (v: number) => Math.min(1, Math.max(0, v));
  return [c(r), c(g), c(b)];
}

export function linearToHex(rgb: Vec3): string {
  return `#${rgb
    .map((v) => Math.round(linearToSrgb(Math.min(1, Math.max(0, v))) * 255))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function hexToLinear(hex: string): Vec3 {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Not a six-digit hex colour: ${hex}`);
  const n = Number.parseInt(m[1], 16);
  const channel = (shift: number) => srgbToLinear(((n >> shift) & 255) / 255);
  return [channel(16), channel(8), channel(0)];
}

/** Formats a colour the way a colourist reads it, for example `oklch(62% 0.14 42°)`. */
export function formatOklch({ L, C, h }: Oklch): string {
  return `oklch(${Math.round(L * 100)}% ${C.toFixed(2)} ${Math.round((h * 180) / Math.PI)}°)`;
}
