import { describe, expect, it } from 'vitest';
import { Cloth, type ClothForces, type ClothSpec } from './cloth';

const SPEC: ClothSpec = { columns: 9, rows: 13, width: 1, height: 1.5, clips: [0, 4, 8], rodMass: 6 };
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
    const poke = { origin: [x!, y!, 1] as const, direction: [0, 0, -1] as const, radius: 0.3, depth: 0.15 };
    settle(cloth, { ...STILL, poke }, 60);
    expect(at(cloth, centre)[2]!).toBeLessThan(-0.03);
    settle(cloth, STILL, 900);
    expect(Math.abs(at(cloth, centre)[2]!)).toBeLessThan(0.01);
  });
});
