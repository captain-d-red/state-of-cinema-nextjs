import { describe, expect, it } from 'vitest';
import { REEL, reelSlot } from './reelLayout';

describe('reelSlot', () => {
  it('puts every frame on the reel radius around the camera', () => {
    for (const k of [0, 5, 40]) {
      const { x, y } = reelSlot(k, 0, 72);
      expect(Math.hypot(x, y)).toBeCloseTo(REEL.radius, 10);
    }
  });

  it('steps each frame a fixed distance further along the flight', () => {
    expect(reelSlot(1, 0, 72).z - reelSlot(2, 0, 72).z).toBeCloseTo(REEL.spacing, 10);
  });

  it('wraps a frame that runs past the camera to the far end of the reel', () => {
    expect(reelSlot(0, 0.5, 72).s).toBeCloseTo(71.5, 10);
  });

  it('hides frames at the camera and in the far distance, and shows those between', () => {
    expect(reelSlot(0, 0, 72).fade).toBe(0);
    expect(reelSlot(71, 0, 72).fade).toBe(0);
    expect(reelSlot(10, 0, 72).fade).toBe(1);
  });
});
