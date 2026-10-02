import { linearToSrgb, type Vec3 } from './color';

/**
 * The colour a thin transparent film reflects, the sheen of oil on water, a soap bubble or the
 * coating on a camera lens. Light reflected from the film's top and bottom surfaces travels
 * paths that differ by the optical path difference (OPD), and each wavelength is brightened or
 * cancelled by how many of its own lengths fit in that difference.
 *
 *        air          ╲ r₁        ╱ r₂          OPD = 2 · n · d · cos θₜ
 *   ─────────────────── ╲ ───── ╱ ────────────
 *        film  n, d       ╲   ╱                 R(λ) ∝ sin²(π · OPD / λ)
 *   ────────────────────── ╲╱ ────────────────  (one reflection flips phase, so a film
 *        substrate                                thinner than light is black)
 *
 * The spectrum is integrated against the CIE 1931 observer, so the colours are the real
 * Newton series: gold, magenta, violet, blue, cyan and mint, softening toward white as the
 * film thickens and the orders overlap.
 */

/** Wavelength range and step of the spectral integration, in nanometres. */
const SPECTRUM = { from: 380, to: 780, step: 5 } as const;

/** Refractive index of the film, an oil or a lacquer. */
export const FILM_INDEX = 1.45;

/** One lobe of a piecewise Gaussian, with a different width either side of its peak. */
const lobe = (wavelength: number, peak: number, below: number, above: number): number => {
  const t = (wavelength - peak) / (wavelength < peak ? below : above);
  return Math.exp(-0.5 * t * t);
};

/**
 * The CIE 1931 two degree colour matching functions, from the multi-lobe fit of Wyman, Sloan
 * and Shirley (2013), accurate to well under one percent of the tabulated curves.
 */
export function observer(wavelength: number): Vec3 {
  const x =
    1.056 * lobe(wavelength, 599.8, 37.9, 31.0) +
    0.362 * lobe(wavelength, 442.0, 16.0, 26.7) -
    0.065 * lobe(wavelength, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(wavelength, 568.8, 46.9, 40.5) + 0.286 * lobe(wavelength, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(wavelength, 437.0, 11.8, 36.0) + 0.681 * lobe(wavelength, 459.0, 26.0, 13.8);
  return [x, y, z];
}

const xyzToLinearSrgb = ([x, y, z]: Vec3): Vec3 => [
  3.2406 * x - 1.5372 * y - 0.4986 * z,
  -0.9689 * x + 1.8758 * y + 0.0415 * z,
  0.0557 * x - 0.204 * y + 1.057 * z,
];

/** Integrates a spectrum against the observer and returns linear sRGB. */
function integrate(spectrum: (wavelength: number) => number): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let w = SPECTRUM.from; w <= SPECTRUM.to; w += SPECTRUM.step) {
    const [ox, oy, oz] = observer(w);
    const s = spectrum(w);
    x += ox * s;
    y += oy * s;
    z += oz * s;
  }
  return xyzToLinearSrgb([x, y, z]);
}

/** A flat spectrum's colour, which every film colour is divided by so a thick film averages to white. */
const WHITE = integrate(() => 1);

/**
 * Linear sRGB reflected by a film at one optical path difference, scaled so the average over
 * many orders is one on every channel. Channels can reach about two at a bright order, and dip
 * a little below zero where the colour lies outside sRGB, so callers clamp after mixing.
 */
export function filmColour(opd: number): Vec3 {
  const c = integrate((w) => 2 * Math.sin((Math.PI * opd) / w) ** 2);
  return [c[0] / WHITE[0], c[1] / WHITE[1], c[2] / WHITE[2]];
}

/** Optical path difference of a film of thickness `d` nanometres, seen at `cosIncidence` from its normal. */
export function opdOf(d: number, cosIncidence: number): number {
  const sin = Math.sqrt(Math.max(0, 1 - cosIncidence * cosIncidence));
  const cosTransmitted = Math.sqrt(1 - (sin / FILM_INDEX) ** 2);
  return 2 * FILM_INDEX * d * cosTransmitted;
}

/** The lookup texture's reach in nanometres of optical path difference, and its texel count. */
export const FILM_LUT = { maxOpd: 1800, size: 256 } as const;

/** Film colours from zero to `FILM_LUT.maxOpd`, as RGBA rows for a one-dimensional texture. */
export function filmLut(): Float32Array {
  const data = new Float32Array(FILM_LUT.size * 4);
  for (let i = 0; i < FILM_LUT.size; i++) {
    const [r, g, b] = filmColour((i / (FILM_LUT.size - 1)) * FILM_LUT.maxOpd);
    data.set([r, g, b, 1], i * 4);
  }
  return data;
}

/**
 * The colour of a film at one optical path difference as an sRGB hex string, scaled so its
 * brightest channel is full, the light a station takes from one band of the sheen.
 */
export function filmTint(opd: number): string {
  const c = filmColour(opd).map((v) => Math.max(v, 0));
  const peak = Math.max(...c, 1e-6);
  return `#${c
    .map((v) =>
      Math.round(linearToSrgb(v / peak) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
