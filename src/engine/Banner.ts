import {
  CylinderGeometry,
  DoubleSide,
  GLSL3,
  Group,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Raycaster,
  RawShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  type Camera,
  type IUniform,
} from 'three';
import type { Film } from '@/data/catalogue';
import { smoothstep } from '@/lib/math';
import { Cloth, type ClothSpec, type Poke } from './cloth';
import { Strike, UP, clip, materials, placeLamps, posts, rail, uplights, type Mount } from './installation';
import { meshVertex } from './shaders/common';
import { LAMPS, clothFragment } from './shaders/banner';
import type { ValleyUniforms } from './Valley';
import { CAMERA, RIVER, valleyCentre } from './world';

/**
 * The print is the poster's own two by three, hung with its hem a little above the water. The
 * rail, the clips, the cloth and its rod are flown: they hoist up the posts and out of the
 * frame as the camera leaves, so the camera never flies into the cloth.
 *
 *     ┃                           ┃   posts rise far above the rail, out of the frame
 *     ┃━━━━●━━━●━━━●━━━●━━━●━━━━┃   rail and six clips, flown
 *     ┃ ┌───────────────────────┐ ┃
 *     ┃ │        poster         │ ┃   satin print 1.28 × 1.92
 *     ┃ └═══════════════════════┘ ┃   weighted hem rod
 *   ◢ ┃           ◣  ◢           ┃ ◣  uplights, standing in the water
 *  ═══┻═══════════════════════════┻═══ water
 */
const WIDTH = 1.28;
const HEIGHT = 1.92;
const HEM = 0.16;
/** The whole installation is drawn at this scale, so its rail clears the interface's header. */
const SCALE = 0.86;
const SPEC: ClothSpec = {
  columns: 21,
  rows: 31,
  width: WIDTH,
  height: HEIGHT,
  clips: [0, 4, 8, 12, 16, 20],
  hem: 'rod',
  hemMass: 20,
  gather: 0.9,
};
/** How far the flown section hoists, enough to lift the hem above the frame as the camera nears. */
const HOIST = 3.6;
const SPAN = WIDTH + 0.2;
/** Lamps stand ahead of the banner and aim at a point a third of the way down it. */
const MOUNTS: readonly Mount[] = ([-1, 1] as const).map((side) => ({
  at: new Vector3(side * 0.5, -HEIGHT - HEM + 0.07, 0.8),
  target: new Vector3(side * 0.18, -0.62 * HEIGHT, 0),
}));
/** Two substeps a frame at sixty frames a second, so the weave stays stable through a gust. */
const STEP = 1 / 120;
const MAX_STEPS = 4;

/** Fetches a poster and decodes it bottom row first, the order a texture with flipY off expects. */
async function loadPoster(src: string, signal: AbortSignal): Promise<Texture> {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error(`${src} failed with ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY' });
  const texture = new Texture(bitmap);
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A top pick printed on a satin banner and hung as an installation in the river: a steel
 * gantry standing in the water, clips along its rail, a weighted rod in the hem and two
 * uplights that strike as the camera arrives. The cloth is simulated, so the breeze moves it,
 * the camera's passing pushes it and the pointer presses into it.
 */
export class Banner {
  readonly group = new Group();
  /** The rail, clips, cloth and rod, which hoist together. */
  private readonly flown = new Group();
  private readonly cloth = new Cloth(SPEC);
  private readonly fabric: Mesh<PlaneGeometry, RawShaderMaterial>;
  private readonly rod: Mesh<CylinderGeometry, RawShaderMaterial>;
  private readonly strike = new Strike();
  private readonly lampPos = Array.from({ length: LAMPS }, () => new Vector3());
  private readonly lampDir = Array.from({ length: LAMPS }, () => new Vector3());
  private readonly materials: RawShaderMaterial[] = [];
  private readonly abort = new AbortController();
  private readonly raycaster = new Raycaster();
  private readonly inverse = new Matrix4();
  private readonly origin = new Vector3();
  private readonly direction = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private poster: Texture | null = null;
  private owed = 0;

  constructor(
    film: Film,
    private readonly z: number,
    valley: ValleyUniforms,
    onError: (error: unknown) => void,
  ) {
    const lights = { uLampPos: { value: this.lampPos }, uLampDir: { value: this.lampDir }, uLamp: this.strike.power };
    const shared: Record<string, IUniform> = { ...valley, ...lights };
    const uPoster: IUniform<Texture | null> = { value: null };

    const clothMaterial = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: meshVertex,
      fragmentShader: clothFragment,
      uniforms: { ...shared, uPoster },
      side: DoubleSide,
    });
    this.fabric = new Mesh(new PlaneGeometry(WIDTH, HEIGHT, SPEC.columns - 1, SPEC.rows - 1), clothMaterial);
    const kit = materials(shared, this.strike.power, valley.uCamPos);
    this.rod = new Mesh(new CylinderGeometry(0.011, 0.011, WIDTH + 0.05, 12), kit.steel);
    this.flown.add(rail(kit.steel, SPAN), this.fabric, this.rod);
    for (const c of SPEC.clips) {
      const jaw = clip(kit.steel);
      jaw.position.set((c / (SPEC.columns - 1) - 0.5) * WIDTH * SPEC.gather, 0.014, 0.004);
      this.flown.add(jaw);
    }
    this.group.add(...posts(kit.steel, { span: SPAN, drop: HEIGHT + HEM, above: HOIST + 0.3 }));
    this.group.add(...uplights(kit, MOUNTS), this.flown);
    this.materials.push(clothMaterial, kit.steel, kit.lens, kit.beam);
    this.group.traverse((o) => (o.frustumCulled = false));

    this.group.scale.setScalar(SCALE);
    this.group.position.set(valleyCentre(z), RIVER.level + (HEM + HEIGHT) * SCALE, z);
    // The banner turns to face where the camera stands to frame it, across the river's bend.
    this.group.rotation.y = Math.atan2(valleyCentre(z + CAMERA.lookAhead) - valleyCentre(z), CAMERA.lookAhead);
    this.group.visible = false;
    this.group.updateMatrixWorld(true);
    placeLamps(MOUNTS, this.group.matrixWorld, this.lampPos, this.lampDir);
    // The cloth settles under its own weight before anyone sees it.
    for (let i = 0; i < 240; i++) this.cloth.step(STEP, { gravity: 9.8, wind: [0, 0, 0], poke: null });
    this.drape();

    loadPoster(film.image.src, this.abort.signal)
      .then((texture) => {
        this.poster = texture;
        uPoster.value = texture;
      })
      .catch((error: unknown) => {
        if (!this.abort.signal.aborted) onError(error);
      });
  }

  /** Whether the poster has arrived, for the loading readout. */
  get ready(): boolean {
    return this.poster !== null;
  }

  /** Where the uplights stand in the world, and how bright they are, for the water they light. */
  get lamps(): { readonly positions: readonly Vector3[]; readonly power: number } {
    return { positions: this.lampPos, power: this.strike.power.value };
  }

  /** The print, once it has arrived, so the engine can upload it before the banner is first seen. */
  get texture(): Texture | null {
    return this.poster;
  }

  /**
   * Strikes the lamps as the camera arrives, hoists the banner as it leaves, and steps the
   * cloth. `speed` is the camera's speed in units a second, whose passing air pushes the
   * banner, and `pointer` is in normalised device coordinates with its presence in z.
   */
  update(time: number, cameraZ: number, speed: number, camera: Camera, pointer: Vector3, dt: number, still: boolean) {
    const rel = cameraZ - CAMERA.lookAhead - this.z;
    this.group.visible = rel > -4 && rel < 14 && this.poster !== null;
    if (!this.group.visible) {
      this.strike.off();
      return;
    }
    this.strike.update(smoothstep(7, 2.5, rel), time, still);
    // Leaving, the flown section rises up the posts on an ease, clear before the camera arrives.
    this.flown.position.y = HOIST * smoothstep(-0.6, -3.4, rel);
    if (still) return;

    // A breeze along the river that turns back and forth on two slow incommensurate beats, so
    // the banner sways and breathes instead of leaning, plus the air the camera pushes ahead
    // of itself as it flies close.
    const breeze = 1.3 * (0.7 * Math.sin(time * 0.55) + 0.3 * Math.sin(time * 1.37 + 0.6)) + 0.15;
    const wake = Math.min(speed * 0.15, 1) * smoothstep(9, 1, Math.abs(rel));
    const wind: [number, number, number] = [0.35 * Math.sin(time * 0.41), 0, breeze - wake];
    const poke = this.pokeFrom(camera, pointer);
    this.owed = Math.min(this.owed + dt, MAX_STEPS * STEP);
    for (; this.owed >= STEP; this.owed -= STEP) this.cloth.step(STEP, { gravity: 9.8, wind, poke });
    this.drape();
  }

  /** Copies the simulated cloth into the mesh and lays the hem rod along its bottom row. */
  private drape(): void {
    const position = this.fabric.geometry.attributes.position!;
    (position.array as Float32Array).set(this.cloth.positions);
    position.needsUpdate = true;
    this.fabric.geometry.computeVertexNormals();
    const p = this.cloth.positions;
    const first = (SPEC.rows - 1) * SPEC.columns;
    const last = first + SPEC.columns - 1;
    this.a.set(p[first * 3]!, p[first * 3 + 1]!, p[first * 3 + 2]!);
    this.b.set(p[last * 3]!, p[last * 3 + 1]!, p[last * 3 + 2]!);
    this.rod.position.copy(this.a).add(this.b).multiplyScalar(0.5);
    this.rod.quaternion.setFromUnitVectors(UP, this.b.sub(this.a).normalize());
  }

  /** The pointer's ray in the cloth's space while it is over the print, or null. */
  private pokeFrom(camera: Camera, pointer: Vector3): Poke | null {
    if (pointer.z < 0.5) return null;
    this.raycaster.setFromCamera(new Vector2(pointer.x, pointer.y), camera);
    this.inverse.copy(this.flown.matrixWorld).invert();
    this.origin.copy(this.raycaster.ray.origin).applyMatrix4(this.inverse);
    this.direction.copy(this.raycaster.ray.direction).transformDirection(this.inverse);
    if (Math.abs(this.direction.z) < 1e-4) return null;
    const t = -this.origin.z / this.direction.z;
    const x = this.origin.x + this.direction.x * t;
    const y = this.origin.y + this.direction.y * t;
    if (Math.abs(x) > WIDTH / 2 || y > 0 || y < -HEIGHT) return null;
    return {
      origin: [this.origin.x, this.origin.y, this.origin.z],
      direction: [this.direction.x, this.direction.y, this.direction.z],
      radius: 0.2,
      depth: 0.14,
    };
  }

  dispose(): void {
    this.abort.abort();
    this.poster?.dispose();
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    for (const m of this.materials) m.dispose();
  }
}
