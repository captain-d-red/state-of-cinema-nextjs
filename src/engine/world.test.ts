import { describe, expect, it } from 'vitest';
import { BEND, cameraZ, stationZ, valleyCentre } from './world';

describe('stations', () => {
  it('frames the title at the origin and spaces the rest along the flight', () => {
    expect(stationZ(0)).toBe(0);
    expect(stationZ(2) - stationZ(1)).toBe(-9);
  });

  it('stands the camera behind each station by the look-ahead distance', () => {
    expect(cameraZ(3) - stationZ(3)).toBe(5.5);
  });
});

describe('valleyCentre', () => {
  it('runs straight through the origin and swings no further than the bend amplitude', () => {
    expect(valleyCentre(0)).toBe(0);
    for (let z = -80; z <= 10; z += 0.5) expect(Math.abs(valleyCentre(z))).toBeLessThanOrEqual(BEND.amplitude + 1e-9);
  });

  it('completes one swing per period', () => {
    expect(valleyCentre(-BEND.period)).toBeCloseTo(0, 10);
    expect(valleyCentre(-BEND.period / 4)).toBeCloseTo(-BEND.amplitude, 10);
  });
});
