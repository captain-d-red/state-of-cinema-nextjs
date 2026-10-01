import {
  BufferAttribute,
  BufferGeometry,
  GLSL3,
  Group,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  RawShaderMaterial,
  Scene,
  Vector2,
  Vector3,
  type IUniform,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { createHalfFloatTarget, createScreenPass } from './gl';
import { RING_SLOTS } from './shaders/field';
import { dotsFragment, dotsVertex, dustFragment, dustVertex } from './shaders/particles';
import { ridgeFragment, terrainFragment, terrainVertex } from './shaders/terrain';
import { TERRAIN } from './world';

/**
 * Uniforms every layer of the valley shares, mutated in place and never replaced. A type alias
 * rather than an interface, so it is assignable to the record a material takes.
 */
export type ValleyUniforms = {
  readonly uTime: IUniform<number>;
  readonly uIntro: IUniform<number>;
  readonly uHover: IUniform<Vector3>;
  readonly uRings: IUniform<Vector3[]>;
  readonly uBase: IUniform<Vector3>;
  readonly uGlow: IUniform<Vector3>;
  readonly uDot: IUniform<Vector3>;
  readonly uBackground: IUniform<Vector3>;
  readonly uFocus: IUniform<Vector2>;
  readonly uCamPos: IUniform<Vector3>;
  readonly uPointScale: IUniform<number>;
  readonly uTunnel: IUniform<number>;
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

/**
 * The valley the camera flies down: the terrain, the dots on it, the dust above it and the
 * filament texture that lights both the ground and its haze.
 */
export class Valley {
  readonly group = new Group();
  readonly uniforms: ValleyUniforms;
  private readonly terrain: Mesh<PlaneGeometry, RawShaderMaterial>;
  private readonly ridges: WebGLRenderTarget;
  private readonly ridgeScene = new Scene();
  private readonly ridgeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly ridgeRect = new Vector3();
  private readonly materials: RawShaderMaterial[] = [];

  constructor(screen: BufferGeometry) {
    this.uniforms = {
      uTime: { value: 0 },
      uIntro: { value: 0 },
      uHover: { value: new Vector3() },
      uRings: { value: Array.from({ length: RING_SLOTS }, () => new Vector3(0, 0, -1)) },
      uBase: { value: new Vector3() },
      uGlow: { value: new Vector3() },
      uDot: { value: new Vector3() },
      uBackground: { value: new Vector3() },
      uFocus: { value: new Vector2() },
      uCamPos: { value: new Vector3() },
      uPointScale: { value: 1 },
      uTunnel: { value: 0 },
    };
    const shared: Record<string, IUniform> = this.uniforms;

    this.ridges = createHalfFloatTarget(RIDGE_SIZE, RIDGE_SIZE);
    this.ridgeScene.add(createScreenPass(screen, ridgeFragment, { ...shared, uRect: { value: this.ridgeRect } }));

    const plane = new PlaneGeometry(TERRAIN.size, TERRAIN.size, TERRAIN.segments, TERRAIN.segments);
    plane.rotateX(-Math.PI / 2);
    const terrainMaterial = material(terrainVertex, terrainFragment, {
      ...shared,
      uRidges: { value: this.ridges.texture },
      uRidgeRect: { value: this.ridgeRect },
    });
    this.terrain = new Mesh(plane, terrainMaterial);

    const window = { uWindow: { value: DOT_WINDOW } };
    const dots = new Points(dotGrid(), material(dotsVertex, dotsFragment, { ...shared, ...window }, true));
    const dust = new Points(
      dustCloud(),
      material(dustVertex, dustFragment, { ...shared, uWindow: { value: DUST_RADIUS * 2 } }, true),
    );
    for (const object of [this.terrain, dots, dust]) {
      object.frustumCulled = false;
      this.materials.push(object.material);
    }
    dots.renderOrder = 1;
    dust.renderOrder = 2;
    this.group.add(this.terrain, dots, dust);
  }

  /** Moves the patch and the filament texture with the camera, then bakes the filaments. */
  update(renderer: WebGLRenderer, cameraZ: number): void {
    this.terrain.position.z = Math.round(cameraZ / CELL) * CELL - TERRAIN.size * 0.3;
    const focus = this.uniforms.uFocus.value;
    this.ridgeRect.set(focus.x - RIDGE_SPAN / 2, focus.y - RIDGE_SPAN / 2, RIDGE_SPAN);
    renderer.setRenderTarget(this.ridges);
    renderer.render(this.ridgeScene, this.ridgeCamera);
  }

  dispose(): void {
    this.ridges.dispose();
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    for (const m of this.materials) m.dispose();
    this.ridgeScene.traverse((o) => ((o as Mesh).material as RawShaderMaterial | undefined)?.dispose());
  }
}
