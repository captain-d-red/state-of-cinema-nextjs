import { describe, expect, it } from 'vitest';
import { formatOklch, hexToLinear, linearSrgbToOklab, linearToHex, oklabToOklch, oklchToLinearSrgb } from './color';

describe('color', () => {
  it('round-trips hex through linear light', () => {
    for (const hex of ['#000000', '#ffffff', '#b1667d', '#308baf', '#0c0d0e']) {
      expect(linearToHex(hexToLinear(hex))).toBe(hex);
    }
  });

  it('puts white at full lightness with no chroma', () => {
    const { L, C } = oklabToOklch(linearSrgbToOklab([1, 1, 1]));
    expect(L).toBeCloseTo(1, 3);
    expect(C).toBeLessThan(1e-3);
  });

  it('gamut maps by lowering chroma and keeping hue', () => {
    const request = { L: 0.6, C: 0.4, h: 2.4 };
    const rgb = oklchToLinearSrgb(request);
    for (const channel of rgb) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
    const mapped = oklabToOklch(linearSrgbToOklab(rgb));
    expect(mapped.h).toBeCloseTo(request.h, 2);
    expect(mapped.L).toBeCloseTo(request.L, 2);
    expect(mapped.C).toBeLessThan(request.C);
  });

  it('rejects anything but six-digit hex', () => {
    expect(() => hexToLinear('#fff')).toThrow(/six-digit/);
  });

  it('formats colours the way a colourist reads them', () => {
    expect(formatOklch({ L: 0.624, C: 0.1412, h: Math.PI / 2 })).toBe('oklch(62% 0.14 90°)');
  });
});
