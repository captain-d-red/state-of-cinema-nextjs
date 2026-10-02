import {
  AdditiveBlending,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  GLSL3,
  Group,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
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
import { meshVertex } from './shaders/common';
import { LAMPS, beamFragment, beamVertex, clothFragment, lensFragment, steelFragment } from './shaders/banner';
import type { ValleyUniforms } from './Valley';
import { CAMERA, RIVER, valleyCentre } from './world';

/**
 * The print is the poster's own two by three, hung with its hem a little above the water.
 *
 *     ┃━━━━●━━━●━━━●━━━●━━━●━━━━┃   top bar on two posts, six clips
 *     ┃ ┌───────────────────────┐ ┃
 *     ┃ │                       │ ┃   satin print 1.28 × 1.92
 *     ┃ │        poster         │ ┃
 *     ┃ └═══════════════════════┘ ┃   weighted hem rod
 *   ◢ ┃           ◣  ◢           ┃ ◣  uplights, standing in the water
 *  ═══┻═══════════════════════════┻═══ water
 */
const WIDTH = 1.28;
const HEIGHT = 1.92;
const HEM = 0.16;
/** The whole installation is drawn at this scale, so its top bar clears the interface's header. */
const SCALE = 0.86;
const SPEC: ClothSpec = {
  columns: 21,
  rows: 31,
  width: WIDTH,
  height: HEIGHT,
  clips: [0, 4, 8, 12, 16, 20],
  rodMass: 9,
};
const POST = { inset: 0.1, radius: 0.016, above: 0.1 } as const;
/** Lamps stand ahead of the banner and aim at a point a third of the way down it. */
const LAMP = { across: 0.5, ahead: 0.8, aim: -0.62 } as const;
/** Two substeps a frame at sixty frames a second, so the weave stays stable through a gust. */
const STEP = 1 / 120;
const MAX_STEPS = 4;
/**
 * The light strikes as the camera arrives: a few uneven flickers over a third of a second,
 * the way a cold tungsten filament catches, then steady.
 */
const STRIKE = [1, 0, 0.8, 0.15, 0.9, 0.55, 1] as const;
const STRIKE_SECONDS = 0.34;

function steel(uniforms: Record<string, IUniform>): RawShaderMaterial {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: meshVertex,
    fragmentShader: steelFragment,
    uniforms,
  });
}

/**
 * A top pick printed on a satin banner and hung as an installation in the river: a steel
 * gantry standing in the water, clips along its top bar, a weighted rod in the hem and two
 * uplights that strike as the camera arrives. The cloth is simulated, so the breeze moves it,
 * the camera's passing pushes it and the pointer presses into it.
 */
export class Banner {
  readonly group = new Group();
  private readonly cloth = new Cloth(SPEC);
  private readonly fabric: Mesh<PlaneGeometry, RawShaderMaterial>;
  private readonly rod: Mesh<CylinderGeometry, RawShaderMaterial>;
  private readonly lamp: IUniform<number> = { value: 0 };
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
  private readonly up = new Vector3(0, 1, 0);
  private poster: Texture | null = null;
  private owed = 0;
  private struck = -1;

  constructor(
    film: Film,
    private readonly z: number,
    valley: ValleyUniforms,
    onError: (error: unknown) => void,
  ) {
    const shared: Record<string, IUniform> = valley;
    const lights = { uLampPos: { value: this.lampPos }, uLampDir: { value: this.lampDir }, uLamp: this.lamp };
    const uPoster: IUniform<Texture | null> = { value: null };

    const geometry = new PlaneGeometry(WIDTH, HEIGHT, SPEC.columns - 1, SPEC.rows - 1);
    const clothMaterial = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: meshVertex,
      fragmentShader: clothFragment,
      uniforms: { ...shared, ...lights, uPoster },
      side: DoubleSide,
    });
    this.fabric = new Mesh(geometry, clothMaterial);
    this.fabric.frustumCulled = false;

    const metal = steel({ ...shared, ...lights });
    const top = POST.above;
    const reach = HEIGHT + HEM + top;
    const postX = WIDTH / 2 + POST.inset;
    for (const side of [-1, 1]) {
      const post = new Mesh(new CylinderGeometry(POST.radius, POST.radius, reach, 12), metal);
      post.position.set(side * postX, top - reach / 2, 0);
      const foot = new Mesh(new CylinderGeometry(0.075, 0.085, 0.014, 24), metal);
      foot.position.set(side * postX, -HEIGHT - HEM + 0.007, 0);
      this.group.add(post, foot);
    }
    const bar = new Mesh(new CylinderGeometry(0.013, 0.013, postX * 2, 12), metal);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.045, 0);
    this.group.add(bar);
    for (const c of SPEC.clips) {
      const clip = new Mesh(new BoxGeometry(0.024, 0.052, 0.018), metal);
      clip.position.set((c / (SPEC.columns - 1) - 0.5) * WIDTH, 0.014, 0.004);
      this.group.add(clip);
    }
    this.rod = new Mesh(new CylinderGeometry(0.011, 0.011, WIDTH + 0.05, 12), metal);
    this.group.add(this.rod);

    const lens = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: meshVertex,
      fragmentShader: lensFragment,
      uniforms: { uLamp: this.lamp },
    });
    const beam = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      uniforms: { uCamPos: valley.uCamPos, uLamp: this.lamp },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    const target = new Vector3();
    const turn = new Quaternion();
    for (const side of [-1, 1]) {
      const at = new Vector3(side * LAMP.across, -HEIGHT - HEM + 0.07, LAMP.ahead);
      target.set(side * 0.18, LAMP.aim * HEIGHT, 0);
      const aim = target.clone().sub(at).normalize();
      turn.setFromUnitVectors(this.up, aim);
      const housing = new Mesh(new CylinderGeometry(0.034, 0.04, 0.1, 20), metal);
      housing.position.copy(at);
      housing.quaternion.copy(turn);
      const glass = new Mesh(new CylinderGeometry(0.029, 0.029, 0.004, 20), lens);
      glass.position.copy(at).addScaledVector(aim, 0.051);
      glass.quaternion.copy(turn);
      const stake = new Mesh(new CylinderGeometry(0.008, 0.008, 0.07, 8), metal);
      stake.position.copy(at).setY(at.y - 0.035);
      // The beam is a cone with its apex at the lamp, reaching most of the way to the cloth.
      const length = target.distanceTo(at) * 0.95;
      const cone = new Mesh(new ConeGeometry(0.42, length, 32, 1, true), beam);
      cone.position.copy(at).addScaledVector(aim, length / 2);
      cone.quaternion.setFromUnitVectors(this.up, aim.clone().negate());
      cone.renderOrder = 70;
      this.group.add(housing, glass, stake, cone);
    }
    this.group.add(this.fabric);
    this.materials.push(clothMaterial, metal, lens, beam);
    this.group.traverse((o) => (o.frustumCulled = false));

    this.group.scale.setScalar(SCALE);
    this.group.position.set(valleyCentre(z), RIVER.level + (HEM + HEIGHT) * SCALE, z);
    // The banner turns to face where the camera stands to frame it, across the river's bend.
    this.group.rotation.y = Math.atan2(valleyCentre(z + CAMERA.lookAhead) - valleyCentre(z), CAMERA.lookAhead);
    this.group.visible = false;
    this.group.updateMatrixWorld(true);
    for (let i = 0; i < LAMPS; i++) {
      const side = i === 0 ? -1 : 1;
      this.lampPos[i]!.set(side * LAMP.across, -HEIGHT - HEM + 0.07, LAMP.ahead).applyMatrix4(this.group.matrixWorld);
      this.lampDir[i]!.set(side * 0.18, LAMP.aim * HEIGHT, 0)
        .applyMatrix4(this.group.matrixWorld)
        .sub(this.lampPos[i]!)
        .normalize();
    }
    // The cloth settles under its own weight before anyone sees it.
    for (let i = 0; i < 240; i++) this.cloth.step(STEP, { gravity: 9.8, wind: [0, 0, 0], poke: null });
    this.drape();

    fetch(film.image.src, { signal: this.abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`${film.image.src} failed with ${response.status}`);
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob, { imageOrientation: 'flipY' }))
      .then((bitmap) => {
        const texture = new Texture(bitmap);
        texture.flipY = false;
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 8;
        texture.needsUpdate = true;
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

  /** The print, once it has arrived, so the engine can upload it before the banner is first seen. */
  get texture(): Texture | null {
    return this.poster;
  }

  /**
   * Strikes the lamps as the camera arrives and steps the cloth. `speed` is the camera's speed
   * in units a second, whose passing air pushes the banner, and `pointer` is in normalised
   * device coordinates with its presence in z.
   */
  update(time: number, cameraZ: number, speed: number, camera: Camera, pointer: Vector3, dt: number, still: boolean) {
    const rel = cameraZ - CAMERA.lookAhead - this.z;
    this.group.visible = rel > -4 && rel < 14 && this.poster !== null;
    if (!this.group.visible) {
      this.struck = -1;
      this.lamp.value = 0;
      return;
    }
    const wanted = smoothstep(7, 2.5, rel);
    if (wanted > 0.5 && this.struck < 0) this.struck = time;
    if (wanted < 0.2) this.struck = -1;
    const since = this.struck < 0 ? Infinity : time - this.struck;
    const flicker =
      still || since >= STRIKE_SECONDS ? 1 : STRIKE[Math.floor((since / STRIKE_SECONDS) * STRIKE.length)]!;
    this.lamp.value = wanted * flicker;
    if (still) return;

    // A light breeze down the river, gusting on a few slow incommensurate beats, plus the air
    // the camera pushes ahead of itself as it flies close.
    const gust = 0.7 + 0.45 * Math.sin(time * 0.61) + 0.25 * Math.sin(time * 1.73 + 1.1);
    const wake = speed * 0.3 * smoothstep(9, 1, Math.abs(rel));
    const wind: [number, number, number] = [0.45 * Math.sin(time * 0.37), 0.1 * Math.sin(time * 0.9), gust - wake];
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
    this.placeRod();
  }

  /** The pointer's ray in banner space while it is over the print, or null. */
  private pokeFrom(camera: Camera, pointer: Vector3): Poke | null {
    if (pointer.z < 0.5) return null;
    this.raycaster.setFromCamera(new Vector2(pointer.x, pointer.y), camera);
    this.inverse.copy(this.group.matrixWorld).invert();
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

  private placeRod(): void {
    const p = this.cloth.positions;
    const first = (SPEC.rows - 1) * SPEC.columns;
    const last = first + SPEC.columns - 1;
    this.a.set(p[first * 3]!, p[first * 3 + 1]!, p[first * 3 + 2]!);
    this.b.set(p[last * 3]!, p[last * 3 + 1]!, p[last * 3 + 2]!);
    this.rod.position.copy(this.a).add(this.b).multiplyScalar(0.5);
    this.rod.quaternion.setFromUnitVectors(this.up, this.b.sub(this.a).normalize());
  }

  dispose(): void {
    this.abort.abort();
    this.poster?.dispose();
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    for (const m of this.materials) m.dispose();
  }
}
