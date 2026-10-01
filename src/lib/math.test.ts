import { describe, expect, it } from 'vitest';
import { damp, formatRunningTime, smoothstep } from './math';

describe('damp', () => {
  it('lands in the same place whatever the frame rate', () => {
    const run = (fps: number) => {
      let value = 0;
      for (let i = 0; i < fps; i++) value = damp(value, 1, 4, 1 / fps);
      return value;
    };
    expect(run(30)).toBeCloseTo(run(144), 10);
  });
});

describe('smoothstep', () => {
  it('clamps outside its edges', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});

describe('formatRunningTime', () => {
  it('prints hours, minutes and seconds', () => {
    expect(formatRunningTime(0)).toBe('00:00:00');
    expect(formatRunningTime(118 * 60 + 24 + 5 / 60)).toBe('118:24:05');
  });
});
