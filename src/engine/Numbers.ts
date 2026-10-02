import {
  BufferAttribute,
  BufferGeometry,
  GLSL3,
  Group,
  NormalBlending,
  Points,
  RawShaderMaterial,
  Vector2,
  Vector3,
  type IUniform,
  type Texture,
} from 'three';
import { clamp, smoothstep } from '@/lib/math';
import { ATLAS } from '@/data/atlas';
import { numbersFragment, numbersVertex } from './shaders/numbers';
import type { ValleyUniforms } from './Valley';
import { CAMERA, valleyCentre } from './world';

/**
 * Posters in one figure. Each particle is a tiny print of one of the films the figure counts,
 * so the number is built out of those films, and this many fill a three digit figure solidly.
 */
const PARTICLES = 2400;
/** Height of a figure's glyphs in world units, and how far above the ground it stands. */
const GLYPH_HEIGHT = 1.4;
const LIFT = 0.02;
/** How far either side of its framing the camera may be with the figure whole, and the ramp past that. */
const FORM_AHEAD = 1;
const FORM_SPAN = 6;
/** Seconds a figure takes to rise into shape, and the longer, softer time it takes to sink. */
const FORM_IN = 0.49;
const FORM_OUT = 1.44;
/** Pixels of the glyph raster, rows per world unit of glyph height. */
const RASTER = 220;

export interface Figure {
  readonly value: number;
  readonly z: number;
  /** Catalogue indices of the films the figure counts, whose posters it is built from. */
  readonly posters: readonly number[];
}

/** Random points inside the glyphs of a string, in world units centred on the origin. */
function sampleGlyphs(text: string, count: number, fontFamily: string): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(text.length * RASTER * 0.7 + RASTER * 0.4);
  canvas.height = Math.ceil(RASTER * 1.3);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is unavailable for sampling glyphs');
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${RASTER}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const points = new Float32Array(count * 3);
  const scale = GLYPH_HEIGHT / RASTER;
  // Rejection sampling over the raster gives each inked pixel the same chance, so the
  // particles spread evenly through the strokes.
  for (let found = 0, tries = 0; found < count && tries < count * 400; tries++) {
    const x = Math.floor(Math.random() * canvas.width);
    const y = Math.floor(Math.random() * canvas.height);
    if (data[(y * canvas.width + x) * 4 + 3]! <= 80) continue;
    points[found * 3] = (x - canvas.width / 2) * scale;
    points[found * 3 + 1] = -(y - canvas.height / 2) * scale;
    found++;
  }
  return points;
}

/** One rising figure per stat station, each built from tiny prints of the films it counts. */
export class Numbers {
  readonly group = new Group();
  private readonly figures: {
    readonly z: number;
    readonly uniforms: { uForm: IUniform<number>; uVisible: IUniform<number> };
    readonly material: RawShaderMaterial;
    form: number;
  }[] = [];

  constructor(
    figures: readonly Figure[],
    valley: ValleyUniforms,
    cursor: IUniform<Vector3>,
    atlas: IUniform<Texture | null>,
    fontFamily: string,
  ) {
    const shared: Record<string, IUniform> = valley;
    for (const figure of figures) {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new BufferAttribute(sampleGlyphs(String(figure.value), PARTICLES, fontFamily), 3),
      );
      const posters = new Float32Array(PARTICLES);
      const seeds = new Float32Array(PARTICLES);
      for (let i = 0; i < PARTICLES; i++) {
        // Films take turns, so every film the figure counts appears in it a fair number of times.
        posters[i] = figure.posters[i % figure.posters.length]!;
        seeds[i] = Math.random();
      }
      geometry.setAttribute('aPoster', new BufferAttribute(posters, 1));
      geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
      const uniforms = { uForm: { value: 0 }, uVisible: { value: 0 } };
      const material = new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: numbersVertex,
        fragmentShader: numbersFragment,
        uniforms: {
          ...shared,
          ...uniforms,
          uCentre: { value: new Vector3(valleyCentre(figure.z), LIFT + GLYPH_HEIGHT / 2, figure.z) },
          uCursor: cursor,
          uAtlas: atlas,
          uAtlasCells: { value: new Vector2(ATLAS.columns, ATLAS.rows) },
        },
        transparent: true,
        // Depth tested, so a figure rises out of the river and the opening's curtain hides it.
        depthWrite: false,
        blending: NormalBlending,
      });
      const points = new Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = 100;
      this.group.add(points);
      this.figures.push({ z: figure.z, uniforms, material, form: 0 });
    }
  }

  /**
   * A figure forms while the camera is within its window, measured from where the camera
   * stands to frame it. The form value chases that target at its own rate, quicker to rise than
   * to sink, so a fast scroll never snaps a figure in or out.
   */
  update(cameraZ: number, dt: number, still: boolean): void {
    for (const figure of this.figures) {
      const past = cameraZ - CAMERA.lookAhead - figure.z;
      const wanted =
        (1 - smoothstep(FORM_AHEAD, FORM_AHEAD + FORM_SPAN, past)) *
        smoothstep(-(FORM_AHEAD + FORM_SPAN), -FORM_AHEAD, past);
      const rate = dt / (wanted >= figure.form ? FORM_IN : FORM_OUT);
      figure.form = still ? wanted : figure.form + clamp(wanted - figure.form, -rate, rate);
      figure.uniforms.uForm.value = figure.form;
      figure.uniforms.uVisible.value =
        smoothstep(-(FORM_AHEAD + 10), -FORM_AHEAD, past) * (1 - smoothstep(FORM_AHEAD, FORM_AHEAD + 10, past));
    }
  }

  dispose(): void {
    for (const { material } of this.figures) material.dispose();
    this.group.traverse((o) => (o as Points).geometry?.dispose());
  }
}
