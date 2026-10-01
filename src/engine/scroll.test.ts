import { describe, expect, it } from 'vitest';
import { between, dwell } from './scroll';

describe('dwell', () => {
  it('leaves stations and midpoints where they are', () => {
    for (const p of [0, 0.5, 1, 2, 3.5, 7]) expect(dwell(p)).toBeCloseTo(p, 12);
  });

  it('moves slowest at a station and fastest halfway between', () => {
    const slope = (p: number) => (dwell(p + 1e-5) - dwell(p - 1e-5)) / 2e-5;
    expect(slope(2)).toBeCloseTo(0.3, 4);
    expect(slope(2.5)).toBeCloseTo(1.7, 4);
  });

  it('never runs backward', () => {
    for (let p = 0; p < 3; p += 0.01) expect(dwell(p + 0.01)).toBeGreaterThan(dwell(p));
  });
});

describe('between', () => {
  it('splits a position into its neighbouring stations', () => {
    expect(between(2.25, 8)).toEqual({ from: 2, to: 3, t: 0.25 });
  });

  it('holds the last station at the end of the story', () => {
    expect(between(7, 8)).toEqual({ from: 7, to: 7, t: 0 });
    expect(between(9, 8)).toEqual({ from: 7, to: 7, t: 0 });
  });

  it('clamps before the first station', () => {
    expect(between(-1, 8)).toEqual({ from: 0, to: 1, t: 0 });
  });
});
