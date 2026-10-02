import {
  AdditiveBlending,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  GLSL3,
  Mesh,
  Quaternion,
  RawShaderMaterial,
  Vector3,
  type IUniform,
  type Matrix4,
} from 'three';
import { meshVertex } from './shaders/common';
import { beamFragment, beamVertex, lensFragment, steelFragment } from './shaders/banner';

/**
 * The hardware every cloth installation in the river shares: satin-black steel posts on round
 * feet, a top rail, clips, and uplights standing in the water with their beams through the
 * haze. Sizes are in the installation's own space, whose origin is the middle of the rail.
 */

export const UP = new Vector3(0, 1, 0);

export interface Materials {
  readonly steel: RawShaderMaterial;
  readonly lens: RawShaderMaterial;
  readonly beam: RawShaderMaterial;
}

/**
 * The three materials, sharing the scene's uniforms and the installation's lamps. `shared`
 * must carry `uDissolve`, which the steel and the lens read as the installation dissolves.
 */
export function materials(
  shared: Record<string, IUniform>,
  lamp: IUniform<number>,
  camPos: IUniform<Vector3>,
): Materials {
  return {
    steel: new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: meshVertex,
      fragmentShader: steelFragment,
      uniforms: shared,
    }),
    lens: new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: meshVertex,
      fragmentShader: lensFragment,
      uniforms: { uLamp: lamp, uDissolve: shared.uDissolve! },
    }),
    beam: new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      uniforms: { uCamPos: camPos, uLamp: lamp },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    }),
  };
}

export interface Frame {
  /** Distance between the posts' centres. */
  readonly span: number;
  /** How far below the rail the water lies. */
  readonly drop: number;
  /** How far the posts rise above the rail. */
  readonly above: number;
}

/** Two posts on round feet standing in the water, rising past the rail by `above`. */
export function posts(steel: RawShaderMaterial, { span, drop, above }: Frame): Mesh[] {
  const reach = drop + above;
  const parts: Mesh[] = [];
  for (const side of [-1, 1]) {
    const post = new Mesh(new CylinderGeometry(0.016, 0.016, reach, 12), steel);
    post.position.set((side * span) / 2, above - reach / 2, 0);
    const foot = new Mesh(new CylinderGeometry(0.075, 0.085, 0.014, 24), steel);
    foot.position.set((side * span) / 2, -drop + 0.007, 0);
    parts.push(post, foot);
  }
  return parts;
}

/** The rail between the posts, just above the clips. */
export function rail(steel: RawShaderMaterial, span: number): Mesh {
  const mesh = new Mesh(new CylinderGeometry(0.013, 0.013, span, 12), steel);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(0, 0.045, 0);
  return mesh;
}

/** One clip, hanging from the rail with its jaws on the cloth's top edge. */
export function clip(steel: RawShaderMaterial): Mesh {
  return new Mesh(new BoxGeometry(0.024, 0.052, 0.018), steel);
}

/** Where an uplight stands and the point it aims at, both in the installation's space. */
export interface Mount {
  readonly at: Vector3;
  readonly target: Vector3;
}

/** Each uplight: a housing on a stake, its glowing lens, and the cone of its beam through the haze. */
export function uplights({ steel, lens, beam }: Materials, mounts: readonly Mount[]): Mesh[] {
  const parts: Mesh[] = [];
  for (const { at, target } of mounts) {
    const aim = target.clone().sub(at).normalize();
    const turn = new Quaternion().setFromUnitVectors(UP, aim);
    const housing = new Mesh(new CylinderGeometry(0.034, 0.04, 0.1, 20), steel);
    housing.position.copy(at);
    housing.quaternion.copy(turn);
    const glass = new Mesh(new CylinderGeometry(0.029, 0.029, 0.004, 20), lens);
    glass.position.copy(at).addScaledVector(aim, 0.051);
    glass.quaternion.copy(turn);
    const stake = new Mesh(new CylinderGeometry(0.008, 0.008, 0.07, 8), steel);
    stake.position.copy(at).setY(at.y - 0.035);
    // The beam is a cone with its apex at the lamp, reaching most of the way to the cloth.
    const length = target.distanceTo(at) * 0.95;
    const cone = new Mesh(new ConeGeometry(0.42, length, 32, 1, true), beam);
    cone.position.copy(at).addScaledVector(aim, length / 2);
    cone.quaternion.setFromUnitVectors(UP, aim.clone().negate());
    cone.renderOrder = 70;
    parts.push(housing, glass, stake, cone);
  }
  return parts;
}

/**
 * The lamps' power, which strikes when it is first wanted: a few uneven flickers over a third
 * of a second, the way a cold tungsten filament catches, then steady.
 */
export class Strike {
  private static readonly PATTERN = [1, 0, 0.8, 0.15, 0.9, 0.55, 1] as const;
  private static readonly SECONDS = 0.34;
  readonly power: IUniform<number> = { value: 0 };
  private struck = -1;

  /** Sets the power for this frame from how much light is `wanted`, from zero to one. */
  update(wanted: number, time: number, still: boolean): void {
    if (wanted > 0.5 && this.struck < 0) this.struck = time;
    if (wanted < 0.2) this.struck = -1;
    const since = this.struck < 0 ? Infinity : time - this.struck;
    const { PATTERN, SECONDS } = Strike;
    const flicker = still || since >= SECONDS ? 1 : PATTERN[Math.floor((since / SECONDS) * PATTERN.length)]!;
    this.power.value = wanted * flicker;
  }

  off(): void {
    this.struck = -1;
    this.power.value = 0;
  }
}

/** Places the lamps' positions and aims in the world, for the lights the cloth and steel read. */
export function placeLamps(
  mounts: readonly Mount[],
  world: Matrix4,
  positions: Vector3[],
  directions: Vector3[],
): void {
  mounts.forEach(({ at, target }, i) => {
    positions[i]!.copy(at).applyMatrix4(world);
    directions[i]!.copy(target).applyMatrix4(world).sub(positions[i]!).normalize();
  });
}
