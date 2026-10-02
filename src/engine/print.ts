import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace } from 'three';

/** What is printed on the curtain: the title in foil, and small lines in ink at its corners. */
export interface CurtainCopy {
  readonly kicker: string;
  readonly corner: string;
  readonly title: readonly [string, string];
  readonly foot: string;
  readonly cue: string;
}

/**
 * The print is laid out on a canvas of the curtain's own proportion, 3.6 by 2.2, and read as
 * two masks: foil in the red channel and ink in the green.
 *
 *   ┌──────────────────────────────────────────┐
 *   │ KICKER                            CORNER │   ink, small capitals, spaced
 *   │ The state                                │   foil, the opening line, set left
 *   │                         of experiences   │   foil, the closing line, set right
 *   │ FOOT                                 CUE │   ink
 *   └──────────────────────────────────────────┘
 */
const WIDTH = 2048;
const HEIGHT = Math.round(WIDTH / (3.6 / 2.2));
const MARGIN = { side: 0.075, top: 0.13, bottom: 0.1 } as const;
/** The title's size as a share of the print's height, shrunk if a line would cross the margins. */
const TITLE = 0.22;
const SMALL = 0.027;

export function printCurtain(copy: CurtainCopy, fontFamily: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable for the curtain print');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalCompositeOperation = 'lighter';
  const side = WIDTH * MARGIN.side;
  const room = WIDTH - 2 * side;

  // The two title lines share one size, the largest at which the longer still fits.
  ctx.font = `450 ${HEIGHT * TITLE}px ${fontFamily}`;
  ctx.letterSpacing = `${-0.035 * HEIGHT * TITLE}px`;
  const widest = Math.max(...copy.title.map((line) => ctx.measureText(line).width));
  const size = HEIGHT * TITLE * Math.min(1, room / widest);
  ctx.font = `450 ${size}px ${fontFamily}`;
  ctx.letterSpacing = `${-0.035 * size}px`;
  ctx.fillStyle = '#f00';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(copy.title[0], side - size * 0.04, HEIGHT * 0.45);
  ctx.textAlign = 'right';
  ctx.fillText(copy.title[1], WIDTH - side, HEIGHT * 0.45 + size * 1.02);

  const small = HEIGHT * SMALL;
  ctx.font = `650 ${small}px ${fontFamily}`;
  ctx.letterSpacing = `${0.14 * small}px`;
  ctx.fillStyle = '#0f0';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(copy.kicker.toUpperCase(), side, HEIGHT * MARGIN.top);
  ctx.textAlign = 'right';
  ctx.fillText(copy.corner.toUpperCase(), WIDTH - side, HEIGHT * MARGIN.top);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(copy.foot.toUpperCase(), side, HEIGHT * (1 - MARGIN.bottom));
  ctx.textAlign = 'right';
  ctx.fillText(copy.cue.toUpperCase(), WIDTH - side, HEIGHT * (1 - MARGIN.bottom));

  const texture = new CanvasTexture(canvas);
  // The masks are data, not colour, so they are read as they are written.
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  return texture;
}
