import { describe, expect, it } from 'vitest';
import { FILM_LUT, filmColour, filmLut, filmTint, opdOf } from './thinFilm';

const brightest = ([r, g, b]: readonly [number, number, number]) => (r >= g && r >= b ? 'r' : g >= b ? 'g' : 'b');

describe('thin film', () => {
  it('reflects nothing when the film is far thinner than light', () => {
    for (const c of filmColour(0)) expect(Math.abs(c)).toBeLessThan(1e-9);
  });

  it('averages close to white over the reach of the lookup table, so the sheen tints without dimming', () => {
    const mean = [0, 0, 0];
    const samples = 360;
    for (let i = 0; i < samples; i++) {
      const c = filmColour((i / (samples - 1)) * FILM_LUT.maxOpd);
      for (let k = 0; k < 3; k++) mean[k]! += c[k]! / samples;
    }
    for (const m of mean) {
      expect(m).toBeGreaterThan(0.85);
      expect(m).toBeLessThan(1.15);
    }
  });

  it('runs through the Newton series in order: gold, magenta, blue, mint', () => {
    expect(brightest(filmColour(400))).toBe('r');
    expect(filmColour(400)[1]).toBeGreaterThan(filmColour(400)[2]);
    const magenta = filmColour(505);
    expect(magenta[0]).toBeGreaterThan(magenta[1]);
    expect(magenta[2]).toBeGreaterThan(magenta[1]);
    expect(brightest(filmColour(650))).toBe('b');
    expect(brightest(filmColour(760))).toBe('g');
  });

  it('shortens the path as the film is seen at a slant', () => {
    expect(opdOf(200, 1)).toBeCloseTo(2 * 1.45 * 200, 6);
    expect(opdOf(200, 0.3)).toBeLessThan(opdOf(200, 1));
  });

  it('writes one RGBA texel per step of the lookup table', () => {
    const lut = filmLut();
    expect(lut.length).toBe(FILM_LUT.size * 4);
    expect(lut[3]).toBe(1);
  });

  it('names a band by its full-brightness hex colour', () => {
    expect(filmTint(650)).toMatch(/^#[0-9a-f]{6}$/);
    expect(filmTint(650).slice(5)).toBe('ff');
  });
});
