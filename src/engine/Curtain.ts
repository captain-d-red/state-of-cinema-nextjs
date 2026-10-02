import {
  DoubleSide,
  GLSL3,
  Group,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Raycaster,
  RawShaderMaterial,
  Vector2,
  Vector3,
  type Camera,
  type IUniform,
  type Texture,
} from 'three';
import { clamp, damp } from '@/lib/math';
import { Cloth, type ClothSpec, type Poke } from './cloth';
import { Strike, clip, materials, placeLamps, posts, rail, uplights, type Mount } from './installation';
import { printCurtain, type CurtainCopy } from './print';
import { LAMPS } from './shaders/banner';
import { meshVertex } from './shaders/common';
import { curtainFragment } from './shaders/curtain';
import type { ValleyUniforms } from './Valley';
import { RIVER, valleyCentre } from './world';

/**
 * The opening: a stage curtain hung across the river on a rail between two posts, its two
 * drapes printed with the title in foil and lit from the water by two footlights. Scrolling
 * opens it. The hooks slide out along the rail and bunch at the posts, the satin gathers into
 * pleats between them, and the camera flies on through the gap.
 *
 *     ┃━●━●━●━●━●━●━●━●━●━●━●━●━┳━●━●━●━●━●━●━●━●━●━●━●━●━┃   rail, twelve hooks a drape
 *     ┃                          ┃                          ┃
 *     ┃  The state               ┃                          ┃   foil print across both drapes
 *     ┃                          ┃          of experiences  ┃
 *     ┃                          ┃                          ┃
 *   ◢ ┃              ◣           ┃           ◢              ┃ ◣
 *  ═══┻══════════════════════════╩══════════════════════════┻═══ water
 *
 *   opened:  ┃▓▓▓┃                                    ┃▓▓▓┃   each drape bunched at its post
 */
const WIDTH = 3.6;
const HEIGHT = 2.2;
const HEM = 0.12;
/** The drapes overlap a sliver where they meet, as stage curtains do, so no light shows between. */
const OVERLAP = 0.02;
const DRAPE = WIDTH / 2 + OVERLAP / 2;
const COLUMNS = 23;
const HOOKS = Array.from({ length: (COLUMNS + 1) / 2 }, (_, k) => k * 2);
const SPEC: ClothSpec = {
  columns: COLUMNS,
  rows: 29,
  width: DRAPE,
  height: HEIGHT,
  clips: HOOKS,
  hem: 'weighted',
  hemMass: 3,
  gather: 0.94,
};
/** Gathered at a post, neighbouring hooks sit this close, so each drape bunches to about a third of a unit. */
const BUNCHED = 0.028;
const SPAN = WIDTH + 0.2;
/** Where the curtain hangs, ahead of the opening's camera. */
const AHEAD = 4;
/** The hooks glide along the rail no faster than this share of the full travel a second, so a jump still draws the cloth. */
const GLIDE = 2.4;
const MOUNTS: readonly Mount[] = ([-1, 1] as const).map((side) => ({
  at: new Vector3(side * 1.05, -HEIGHT - HEM + 0.07, 1.05),
  target: new Vector3(side * 0.7, -0.52 * HEIGHT, 0),
}));
const STEP = 1 / 120;
const MAX_STEPS = 4;

interface Drape {
  readonly cloth: Cloth;
  readonly mesh: Mesh<PlaneGeometry, RawShaderMaterial>;
  readonly hooks: Mesh[];
}

export class Curtain {
  readonly group = new Group();
  readonly z: number;
  private readonly drapes: Drape[];
  private readonly strike = new Strike();
  private readonly lampPos = Array.from({ length: LAMPS }, () => new Vector3());
  private readonly lampDir = Array.from({ length: LAMPS }, () => new Vector3());
  private readonly pointer: IUniform<Vector3> = { value: new Vector3() };
  private readonly print: Texture;
  private readonly materials: RawShaderMaterial[] = [];
  private readonly raycaster = new Raycaster();
  private readonly inverse = new Matrix4();
  private readonly origin = new Vector3();
  private readonly direction = new Vector3();
  private open = 0;
  private owed = 0;

  constructor(openingCameraZ: number, valley: ValleyUniforms, copy: CurtainCopy, fontFamily: string) {
    this.z = openingCameraZ - AHEAD;
    this.print = printCurtain(copy, fontFamily);
    const lights = { uLampPos: { value: this.lampPos }, uLampDir: { value: this.lampDir }, uLamp: this.strike.power };
    const shared: Record<string, IUniform> = { ...valley, ...lights };
    const kit = materials(shared, this.strike.power, valley.uCamPos);

    this.drapes = ([-1, 1] as const).map((side) => {
      const cloth = new Cloth(SPEC);
      const material = new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: meshVertex,
        fragmentShader: curtainFragment,
        uniforms: { ...shared, uPrint: { value: this.print }, uPointer: this.pointer },
        side: DoubleSide,
      });
      const geometry = new PlaneGeometry(DRAPE, HEIGHT, COLUMNS - 1, SPEC.rows - 1);
      // A drape's cloth is centred on its own middle, a quarter of the curtain either side.
      const centre = (side * (WIDTH - OVERLAP)) / 4;
      // The print is mapped from where each thread hangs once the hooks have gathered it, so
      // the two drapes carry the same letter at the same place where they overlap.
      const uv = geometry.attributes.uv!;
      const hung = cloth.hung;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (centre - side * hung[i * 3]! + WIDTH / 2) / WIDTH, 1 + hung[i * 3 + 1]! / HEIGHT);
      }
      const mesh = new Mesh(geometry, material);
      mesh.position.x = centre;
      // Both drapes are the same cloth, column zero at the post, and the right one is its mirror
      // image, so their free inner edges hang alike and the print runs on across the meeting.
      mesh.scale.x = -side;
      // The right drape hangs a hair behind the left, so they overlap rather than intersect.
      mesh.position.z = side > 0 ? -0.012 : 0;
      const hooks = HOOKS.map(() => clip(kit.steel));
      for (const hook of hooks) mesh.add(hook);
      this.materials.push(material);
      return { cloth, mesh, hooks };
    });
    this.group.add(rail(kit.steel, SPAN), ...posts(kit.steel, { span: SPAN, drop: HEIGHT + HEM, above: 0.24 }));
    this.group.add(...uplights(kit, MOUNTS), ...this.drapes.map((d) => d.mesh));
    this.materials.push(kit.steel, kit.lens, kit.beam);
    this.group.traverse((o) => (o.frustumCulled = false));

    this.group.position.set(valleyCentre(this.z), RIVER.level + HEM + HEIGHT, this.z);
    this.group.rotation.y = Math.atan2(valleyCentre(openingCameraZ) - valleyCentre(this.z), AHEAD);
    this.group.updateMatrixWorld(true);
    placeLamps(MOUNTS, this.group.matrixWorld, this.lampPos, this.lampDir);
    for (const drape of this.drapes) {
      for (let i = 0; i < 240; i++) drape.cloth.step(STEP, { gravity: 9.8, wind: [0, 0, 0], poke: null });
      this.drape(drape);
    }
  }

  /** The print, so the engine can upload it before the curtain is first seen. */
  get texture(): Texture {
    return this.print;
  }

  /** Where the footlights stand in the world, and how bright they are, for the water they light. */
  get lamps(): { readonly positions: readonly Vector3[]; readonly power: number } {
    return { positions: this.lampPos, power: this.strike.power.value };
  }

  /**
   * Opens the curtain to `wanted`, from zero closed to one gathered at the posts, strikes the
   * footlights with the scene's intro, and steps both drapes. `pointer` is in normalised device
   * coordinates with its presence in z.
   */
  update(
    time: number,
    cameraZ: number,
    wanted: number,
    intro: number,
    camera: Camera,
    pointer: Vector3,
    dt: number,
    still: boolean,
  ) {
    const ahead = cameraZ - this.z;
    this.group.visible = ahead > 0.05;
    if (!this.group.visible) {
      this.strike.off();
      return;
    }
    this.strike.update(intro > 0.55 ? 1 : 0, time, still);
    this.open = still ? wanted : this.open + clamp(wanted - this.open, -GLIDE * dt, GLIDE * dt);
    for (const drape of this.drapes) this.hang(drape, still ? 1 : this.open * this.open * (3 - 2 * this.open));
    this.aim(camera, pointer, dt);
    if (still) {
      for (const drape of this.drapes) {
        for (let i = 0; i < 4; i++) drape.cloth.step(STEP, { gravity: 9.8, wind: [0, 0, 0], poke: null });
        this.drape(drape);
      }
      return;
    }

    // A faint draught along the river, far softer than the banners feel, since a heavy curtain
    // hardly stirs, plus the air the camera pushes ahead of itself as it nears.
    const breeze = 0.35 * Math.sin(time * 0.43) + 0.15 * Math.sin(time * 1.1 + 0.8);
    const wind: [number, number, number] = [0, 0, breeze];
    this.owed = Math.min(this.owed + dt, MAX_STEPS * STEP);
    const steps = Math.floor(this.owed / STEP);
    this.owed -= steps * STEP;
    for (const drape of this.drapes) {
      const poke = this.pokeFrom(drape, camera, pointer);
      for (let i = 0; i < steps; i++) drape.cloth.step(STEP, { gravity: 9.8, wind, poke });
      this.drape(drape);
    }
  }

  /** Places a drape's hooks along the rail for an opening from zero, closed, to one, gathered at its post. */
  private hang({ cloth, hooks }: Drape, open: number): void {
    HOOKS.forEach((column, k) => {
      const [x, y, z] = cloth.clipAt(column);
      // The outermost hook stays at its post, and each one inward stacks up beside it.
      const outer = cloth.clipAt(HOOKS[0]!)[0];
      const gathered = outer + k * BUNCHED;
      const at = x + (gathered - x) * open;
      cloth.moveClip(column, at, y, z);
      hooks[k]!.position.set(at, 0.014, 0.004);
    });
  }

  /** Finds the pointer on the print, for the foil's brighter band. */
  private aim(camera: Camera, pointer: Vector3, dt: number): void {
    const p = this.pointer.value;
    let hit = false;
    if (pointer.z > 0.5) {
      this.raycaster.setFromCamera(new Vector2(pointer.x, pointer.y), camera);
      this.inverse.copy(this.group.matrixWorld).invert();
      this.origin.copy(this.raycaster.ray.origin).applyMatrix4(this.inverse);
      this.direction.copy(this.raycaster.ray.direction).transformDirection(this.inverse);
      if (Math.abs(this.direction.z) > 1e-4) {
        const t = -this.origin.z / this.direction.z;
        const u = (this.origin.x + this.direction.x * t) / WIDTH + 0.5;
        const v = 1 + (this.origin.y + this.direction.y * t) / HEIGHT;
        hit = u > 0 && u < 1 && v > 0 && v < 1;
        if (hit) p.set(damp(p.x, u, 10, dt), damp(p.y, v, 10, dt), p.z);
      }
    }
    p.z = damp(p.z, hit ? 1 : 0, hit ? 6 : 2.5, dt);
  }

  /** The pointer's ray in a drape's own space while it is over that drape, or null. */
  private pokeFrom({ mesh }: Drape, camera: Camera, pointer: Vector3): Poke | null {
    if (pointer.z < 0.5) return null;
    this.raycaster.setFromCamera(new Vector2(pointer.x, pointer.y), camera);
    this.inverse.copy(mesh.matrixWorld).invert();
    this.origin.copy(this.raycaster.ray.origin).applyMatrix4(this.inverse);
    this.direction.copy(this.raycaster.ray.direction).transformDirection(this.inverse);
    if (Math.abs(this.direction.z) < 1e-4) return null;
    const t = -this.origin.z / this.direction.z;
    const x = this.origin.x + this.direction.x * t;
    const y = this.origin.y + this.direction.y * t;
    if (Math.abs(x) > DRAPE / 2 || y > 0 || y < -HEIGHT) return null;
    return {
      origin: [this.origin.x, this.origin.y, this.origin.z],
      direction: [this.direction.x, this.direction.y, this.direction.z],
      radius: 0.26,
      strength: 4,
    };
  }

  private drape({ cloth, mesh }: Drape): void {
    const position = mesh.geometry.attributes.position!;
    (position.array as Float32Array).set(cloth.positions);
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  dispose(): void {
    this.print.dispose();
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    for (const m of this.materials) m.dispose();
  }
}
