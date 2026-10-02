import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DataUtils,
  GLSL3,
  Group,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  type IUniform,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { FILM_LUT, filmLut } from '@/lib/thinFilm';
import { createHalfFloatTarget, createScreenPass } from './gl';
import type { Mirror } from './Mirror';
import { dotsFragment, dotsVertex, dustFragment, dustVertex } from './shaders/particles';
import { riverFragment, riverVertex } from './shaders/river';
import { skyFragment, skyVertex } from './shaders/sky';
import { ridgeFragment, terrainFragment, terrainVertex } from './shaders/terrain';
import { Wake } from './Wake';
import { TERRAIN } from './world';

/**
 * Uniforms every layer of the valley shares, mutated in place and never replaced. A type alias
 * rather than an interface, so it is assignable to the record a material takes.
 */
export type ValleyUniforms = {
  readonly uTime: IUniform<number>;
  readonly uIntro: IUniform<number>;
  readonly uHover: IUniform<Vector3>;
  readonly uBase: IUniform<Vector3>;
  readonly uGlow: IUniform<Vector3>;
  readonly uDot: IUniform<Vector3>;
  readonly uBackground: IUniform<Vector3>;
  readonly uFocus: IUniform<Vector2>;
  readonly uCamPos: IUniform<Vector3>;
  readonly uPointScale: IUniform<number>;
  readonly uTunnel: IUniform<number>;
  /** The film on the water and the glass, as optical path difference, its spread and its strength. */
  readonly uFilm: IUniform<Vector3>;
  readonly uFilmLut: IUniform<Texture>;
};

/** Dots per world unit along each axis, and the square they cover around the camera. */
const DOT_SPACING = 0.17;
const DOT_WINDOW = 40;
const DUST_COUNT = 3000;
const DUST_RADIUS = 16;
/** The filament texture covers this many world units around the lit patch. */
const RIDGE_SPAN = 24;
const RIDGE_SIZE = 512;
/** The terrain patch steps with the camera by whole grid cells, so its vertices never swim. */
const CELL = TERRAIN.size / TERRAIN.segments;
/** The sky dome sits inside the camera's far plane. */
const SKY_RADIUS = 70;

function material(vertexShader: string, fragmentShader: string, uniforms: Record<string, IUniform>, points = false) {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: points,
    depthWrite: !points,
    blending: NormalBlending,
  });
}

function dotGrid(): BufferGeometry {
  const across = Math.round(DOT_WINDOW / DOT_SPACING);
  const positions = new Float32Array(across * across * 3);
  const seeds = new Float32Array(across * across);
  let k = 0;
  for (let j = 0; j < across; j++) {
    for (let i = 0; i < across; i++) {
      positions[k * 3] = (i + 0.5) * DOT_SPACING - DOT_WINDOW / 2;
      positions[k * 3 + 2] = (j + 0.5) * DOT_SPACING - DOT_WINDOW / 2;
      seeds[k] = Math.random();
      k++;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  return geometry;
}

function dustCloud(): BufferGeometry {
  const positions = new Float32Array(DUST_COUNT * 3);
  const seeds = new Float32Array(DUST_COUNT * 2);
  for (let i = 0; i < DUST_COUNT; i++) {
    // Square root of a uniform radius spreads the motes evenly over the disc.
    const r = Math.sqrt(Math.random()) * DUST_RADIUS;
    const a = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 2] = Math.sin(a) * r;
    seeds[i * 2] = Math.random();
    seeds[i * 2 + 1] = Math.random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 2));
  return geometry;
}

/** The film colours as a one-dimensional half-float texture, filtered so the colours blend between texels. */
function filmTexture(): DataTexture {
  const colours = filmLut();
  const halves = new Uint16Array(colours.length);
  for (let i = 0; i < colours.length; i++) halves[i] = DataUtils.toHalfFloat(colours[i]!);
  const texture = new DataTexture(halves, FILM_LUT.size, 1, RGBAFormat, HalfFloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The valley the camera flies down: the night sky, the banks, the river between them, the
 * dust above, and the filament texture that lights the ground and its haze. The river's
 * surface is simulated, so the pointer stirs it.
 */
export class Valley {
  readonly group = new Group();
  readonly uniforms: ValleyUniforms;
  /** The water, which the mirror leaves out of its own reflection. */
  readonly river: Mesh<PlaneGeometry, RawShaderMaterial>;
  readonly wake: Wake;
  private readonly terrain: Mesh<PlaneGeometry, RawShaderMaterial>;
  private readonly ridges: WebGLRenderTarget;
  private readonly ridgeScene = new Scene();
  private readonly ridgeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly ridgeRect = new Vector3();
  private readonly materials: RawShaderMaterial[] = [];
  private readonly dots: Points<BufferGeometry, RawShaderMaterial>;

  /** The last click in the tunnel, as normalised device x and y and the time it landed. */
  readonly pulse = new Vector3(0, 0, -10);
  readonly aspect: IUniform<number> = { value: 1 };

  constructor(screen: BufferGeometry, mirror: Mirror, cursor: IUniform<Vector3>) {
    this.uniforms = {
      uTime: { value: 0 },
      uIntro: { value: 0 },
      uHover: { value: new Vector3() },
      uBase: { value: new Vector3() },
      uGlow: { value: new Vector3() },
      uDot: { value: new Vector3() },
      uBackground: { value: new Vector3() },
      uFocus: { value: new Vector2() },
      uCamPos: { value: new Vector3() },
      uPointScale: { value: 1 },
      uTunnel: { value: 0 },
      uFilm: { value: new Vector3() },
      uFilmLut: { value: filmTexture() },
    };
    const shared: Record<string, IUniform> = this.uniforms;

    this.ridges = createHalfFloatTarget(RIDGE_SIZE, RIDGE_SIZE);
    this.ridgeScene.add(createScreenPass(screen, ridgeFragment, { ...shared, uRect: { value: this.ridgeRect } }));
    const ridges = { uRidges: { value: this.ridges.texture }, uRidgeRect: { value: this.ridgeRect } };

    const sky = new Mesh(new SphereGeometry(SKY_RADIUS, 48, 24), material(skyVertex, skyFragment, shared));
    sky.material.side = BackSide;
    sky.material.depthWrite = false;
    sky.renderOrder = -10;

    const plane = new PlaneGeometry(TERRAIN.size, TERRAIN.size, TERRAIN.segments, TERRAIN.segments);
    plane.rotateX(-Math.PI / 2);
    this.terrain = new Mesh(plane, material(terrainVertex, terrainFragment, { ...shared, ...ridges }));

    this.wake = new Wake(screen);
    const water = new PlaneGeometry(TERRAIN.size, TERRAIN.size, 1, 1);
    water.rotateX(-Math.PI / 2);
    this.river = new Mesh(
      water,
      material(riverVertex, riverFragment, {
        ...shared,
        ...ridges,
        uMirror: { value: mirror.target.texture },
        uMirrorMatrix: { value: mirror.matrix },
        uWake: { value: this.wake.texture },
        uWakeRect: { value: this.wake.rect },
        uWakeTexel: { value: this.wake.texel },
        uWakeBlend: { value: 0 },
      }),
    );

    this.dots = new Points(
      dotGrid(),
      material(
        dotsVertex,
        dotsFragment,
        {
          ...shared,
          uWindow: { value: DOT_WINDOW },
          uCursor: cursor,
          uAspect: this.aspect,
          uPulse: { value: this.pulse },
        },
        true,
      ),
    );
    const dots = this.dots;
    const dust = new Points(
      dustCloud(),
      material(dustVertex, dustFragment, { ...shared, uWindow: { value: DUST_RADIUS * 2 } }, true),
    );
    for (const object of [sky, this.terrain, this.river, dots, dust]) {
      object.frustumCulled = false;
      this.materials.push(object.material);
    }
    dots.renderOrder = 1;
    dust.renderOrder = 2;
    this.group.add(sky, this.terrain, this.river, dots, dust);
  }

  /** Moves the patches and the filament texture with the camera, bakes them and advances the water. */
  update(
    renderer: WebGLRenderer,
    cameraZ: number,
    dt: number,
    pointer: readonly [number, number, number, number],
    presence: number,
  ): void {
    const z = Math.round(cameraZ / CELL) * CELL - TERRAIN.size * 0.3;
    this.terrain.position.z = z;
    // The stars only exist in the tunnel, so there is nothing to draw before it forms.
    this.dots.visible = this.uniforms.uTunnel.value > 0.001;
    this.river.position.z = z;
    const focus = this.uniforms.uFocus.value;
    this.ridgeRect.set(focus.x - RIDGE_SPAN / 2, focus.y - RIDGE_SPAN / 2, RIDGE_SPAN);
    renderer.setRenderTarget(this.ridges);
    renderer.render(this.ridgeScene, this.ridgeCamera);
    this.wake.update(renderer, dt, pointer, presence);
    this.river.material.uniforms.uWake!.value = this.wake.texture;
    this.river.material.uniforms.uWakeBlend!.value = this.wake.blend;
  }

  dispose(): void {
    this.ridges.dispose();
    this.wake.dispose();
    this.uniforms.uFilmLut.value.dispose();
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    for (const m of this.materials) m.dispose();
    this.ridgeScene.traverse((o) => ((o as Mesh).material as RawShaderMaterial | undefined)?.dispose());
  }
}
