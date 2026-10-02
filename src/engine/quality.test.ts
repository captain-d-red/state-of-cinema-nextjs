import { describe, expect, it } from 'vitest';
import { FrameGovernor, GOVERNOR, MAX_HAZE_STEPS, QUALITY, pickQuality } from './quality';

describe('pickQuality', () => {
  it('gives touch-first devices and small screens the handheld profile', () => {
    expect(pickQuality({ coarsePointer: true, shortSide: 1024 }).name).toBe('handheld');
    expect(pickQuality({ coarsePointer: false, shortSide: 440 }).name).toBe('handheld');
  });

  it('gives a desktop with a mouse the full profile', () => {
    expect(pickQuality({ coarsePointer: false, shortSide: 900 }).name).toBe('full');
  });

  it('keeps the handheld profile strictly cheaper, and inside the shader loop bound', () => {
    const { full, handheld } = QUALITY;
    expect(handheld.maxPixelRatio).toBeLessThan(full.maxPixelRatio);
    expect(handheld.samples).toBeLessThan(full.samples);
    expect(handheld.mirrorScale).toBeLessThan(full.mirrorScale);
    expect(handheld.hazeSteps).toBeLessThan(full.hazeSteps);
    expect(handheld.dust).toBeLessThan(full.dust);
    for (const q of [full, handheld]) expect(q.hazeSteps).toBeLessThanOrEqual(MAX_HAZE_STEPS);
  });
});

describe('FrameGovernor', () => {
  const fill = (g: FrameGovernor, ms: number, at: number) => {
    let out: number | null = null;
    for (let i = 0; i < GOVERNOR.window; i++) out = g.sample(ms, at);
    return out;
  };

  it('leaves a device that holds sixty frames a second alone', () => {
    expect(fill(new FrameGovernor(1.5), 16.7, 10_000)).toBeNull();
  });

  it('steps the pixel ratio down when frames run long', () => {
    const g = new FrameGovernor(1.5);
    expect(fill(g, 33, 10_000)).toBe(1.25);
    expect(g.pixelRatio).toBe(1.25);
  });

  it('waits out its cooldown between steps and never goes below the floor', () => {
    const g = new FrameGovernor(1.25);
    expect(fill(g, 40, 10_000)).toBe(1);
    expect(fill(g, 40, 10_500)).toBeNull();
    expect(fill(g, 40, 20_000)).toBeNull();
    expect(g.pixelRatio).toBe(GOVERNOR.floor);
  });
});
