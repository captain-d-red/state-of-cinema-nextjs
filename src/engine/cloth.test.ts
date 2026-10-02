import { describe, expect, it } from 'vitest';
import { Cloth, type ClothForces, type ClothSpec } from './cloth';

const SPEC: ClothSpec = {
  columns: 9,
  rows: 13,
  width: 1,
  height: 1.5,
  clips: [0, 4, 8],
  hem: 'rod',
  hemMass: 6,
  gather: 1,
};
const STILL: ClothForces = { gravity: 9.8, wind: [0, 0, 0], poke: null };
const settle = (cloth: Cloth, forces: ClothForces, steps = 600) => {
  for (let i = 0; i < steps; i++) cloth.step(1 / 120, forces);
};
const at = (cloth: Cloth, i: number) => Array.from(cloth.positions.slice(i * 3, i * 3 + 3));

describe('Cloth', () => {
  it('keeps every clip exactly where it was hung', () => {
    const cloth = new Cloth(SPEC);
    const before = SPEC.clips.map((c) => at(cloth, c));
    settle(cloth, { ...STILL, wind: [0.5, 0, 2] });
    expect(SPEC.clips.map((c) => at(cloth, c))).toEqual(before);
  });

  it('hangs under its own weight without stretching more than a few percent', () => {
    const cloth = new Cloth(SPEC);
    settle(cloth, STILL);
    const bottom = at(cloth, (SPEC.rows - 1) * SPEC.columns + 4)[1]!;
    expect(-bottom).toBeGreaterThan(SPEC.height * 0.98);
    expect(-bottom).toBeLessThan(SPEC.height * 1.05);
  });

  it('keeps the hem rod straight and a banner width long', () => {
    const cloth = new Cloth(SPEC);
    settle(cloth, { ...STILL, wind: [0, 0, 1.5] });
    const first = (SPEC.rows - 1) * SPEC.columns;
    const [ax, ay, az] = at(cloth, first);
    const [bx, by, bz] = at(cloth, first + SPEC.columns - 1);
    expect(Math.hypot(bx! - ax!, by! - ay!, bz! - az!)).toBeCloseTo(SPEC.width, 3);
    const [mx, , mz] = at(cloth, first + 4);
    expect(mx!).toBeCloseTo((ax! + bx!) / 2, 4);
    expect(mz!).toBeCloseTo((az! + bz!) / 2, 4);
  });

  it('drapes in swags between the clips when they gather the cloth', () => {
    const cloth = new Cloth({ ...SPEC, gather: 0.85 });
    settle(cloth, STILL);
    const between = 2 * SPEC.columns + 2;
    expect(Math.abs(at(cloth, between)[2]!)).toBeGreaterThan(0.01);
  });

  it('follows its clips along the rail and bunches as they close up', () => {
    const cloth = new Cloth({ ...SPEC, hem: 'weighted', clips: [0, 2, 4, 6, 8] });
    settle(cloth, STILL, 120);
    // Draw every clip toward the left end, the way a curtain opens.
    for (let step = 0; step < 240; step++) {
      for (const [i, c] of [0, 2, 4, 6, 8].entries()) {
        const [x0, y0] = cloth.clipAt(c);
        cloth.moveClip(c, x0 + (-0.5 + i * 0.03 - x0) * Math.min(1, step / 120), y0, 0);
      }
      cloth.step(1 / 120, STILL);
    }
    expect(at(cloth, 8)[0]!).toBeCloseTo(-0.5 + 4 * 0.03, 6);
    // The free cloth beside the last clip has been carried most of the way across.
    expect(at(cloth, 4 * SPEC.columns + 8)[0]!).toBeLessThan(0);
    // And the gathered cloth has folded toward and away from the viewer to make room.
    const depth = Math.max(...[1, 3, 5, 7].map((c) => Math.abs(at(cloth, 2 * SPEC.columns + c)[2]!)));
    expect(depth).toBeGreaterThan(0.03);
  });

  it('follows a pinch while it is held and swings free once it is let go', () => {
    const cloth = new Cloth(SPEC);
    settle(cloth, STILL, 240);
    const centre = 6 * SPEC.columns + 4;
    const [x, y] = at(cloth, centre);
    const pinch = cloth.nearest([x!, y!, 2], [0, 0, -1], 0.1);
    expect(pinch?.index).toBe(centre);
    cloth.grab(centre);
    for (let i = 0; i < 120; i++) {
      cloth.hold(x!, y!, Math.min(0.4, i * 0.01));
      cloth.step(1 / 120, STILL);
    }
    expect(at(cloth, centre)[2]).toBeCloseTo(0.4, 6);
    // The cloth around the pinch is drawn out with it.
    expect(at(cloth, centre + 1)[2]!).toBeGreaterThan(0.2);
    cloth.release();
    expect(cloth.held).toBeNull();
    settle(cloth, STILL, 1200);
    expect(Math.abs(at(cloth, centre)[2]!)).toBeLessThan(0.02);
  });

  it('billows downwind', () => {
    const cloth = new Cloth(SPEC);
    settle(cloth, { ...STILL, wind: [0, 0, 2] }, 240);
    expect(at(cloth, 6 * SPEC.columns + 4)[2]!).toBeGreaterThan(0.02);
  });

  it('gives under a press and springs back once it ends', () => {
    const cloth = new Cloth(SPEC);
    settle(cloth, STILL, 240);
    const centre = 6 * SPEC.columns + 4;
    const [x, y] = at(cloth, centre);
    const poke = { origin: [x!, y!, 1] as const, direction: [0, 0, -1] as const, radius: 0.3, strength: 8 };
    settle(cloth, { ...STILL, poke }, 60);
    expect(at(cloth, centre)[2]!).toBeLessThan(-0.03);
    settle(cloth, STILL, 900);
    expect(Math.abs(at(cloth, centre)[2]!)).toBeLessThan(0.01);
  });
});
