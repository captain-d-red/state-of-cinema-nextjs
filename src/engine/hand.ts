import { Matrix4, Raycaster, Vector2, Vector3, type Camera, type Object3D } from 'three';
import type { Cloth } from './cloth';

/** What the pointer is doing to the cloth, for the cursor: nothing, hovering it, or holding it. */
export type Grip = 'none' | 'over' | 'held';

/** A cloth the hand can reach: the simulation, the object whose space it lives in, and its extent there. */
export interface Reachable {
  readonly cloth: Cloth;
  readonly space: Object3D;
  readonly halfWidth: number;
  readonly height: number;
}

/** The pointer in normalised device coordinates with its presence in z, and whether its button is down. */
export interface HandInput {
  readonly pointer: Vector3;
  readonly down: boolean;
}

/** A pinch pulls the cloth at most this far from where it hung, so it stretches but never tears free. */
const MAX_PULL = 0.5;
/** How close to the pointer's ray a thread must be for the press to catch it. */
const REACH = 0.3;

/**
 * The hand that pinches cloth. Pressing over a cloth takes hold of the thread nearest the
 * pointer's ray; while the button stays down that thread follows the pointer at the depth it
 * was caught, dragging the cloth around it; letting go lets it swing free with the hand's speed.
 */
export class Hand {
  private readonly raycaster = new Raycaster();
  private readonly inverse = new Matrix4();
  private readonly origin = new Vector3();
  private readonly direction = new Vector3();
  private readonly hung = new Vector3();
  private held: { readonly target: Reachable; readonly along: number } | null = null;
  private wasDown = false;

  /** Moves the pinch for this frame and returns the grip. Call it before the cloths step. */
  update(camera: Camera, { pointer, down }: HandInput, reachable: readonly Reachable[]): Grip {
    const pressed = down && !this.wasDown;
    this.wasDown = down;
    if (!down || pointer.z < 0.5) {
      this.held?.target.cloth.release();
      this.held = null;
      return pointer.z > 0.5 && reachable.some((r) => this.hits(camera, pointer, r)) ? 'over' : 'none';
    }
    if (pressed) {
      let best: { target: Reachable; index: number; along: number } | null = null;
      for (const target of reachable) {
        if (!this.hits(camera, pointer, target)) continue;
        const catchAt = target.cloth.nearest(this.tuple(this.origin), this.tuple(this.direction), REACH);
        if (catchAt && (!best || catchAt.along < best.along)) best = { target, ...catchAt };
      }
      if (best) {
        best.target.cloth.grab(best.index);
        this.held = { target: best.target, along: best.along };
      }
    }
    if (!this.held) return 'none';
    const { target, along } = this.held;
    this.ray(camera, pointer, target.space);
    const index = target.cloth.held!;
    const rest = target.cloth.hung;
    this.hung.set(rest[index * 3]!, rest[index * 3 + 1]!, rest[index * 3 + 2]!);
    const at = this.origin.addScaledVector(this.direction, along);
    // The pinch stretches the cloth only so far from where the thread hung.
    const pull = at.sub(this.hung);
    if (pull.length() > MAX_PULL) pull.setLength(MAX_PULL);
    pull.add(this.hung);
    target.cloth.hold(pull.x, pull.y, pull.z);
    return 'held';
  }

  /** Whether the pointer's ray crosses a cloth's resting plane inside its extent, leaving the ray in its space. */
  private hits(camera: Camera, pointer: Vector3, { space, halfWidth, height }: Reachable): boolean {
    this.ray(camera, pointer, space);
    if (Math.abs(this.direction.z) < 1e-4) return false;
    const t = -this.origin.z / this.direction.z;
    const x = this.origin.x + this.direction.x * t;
    const y = this.origin.y + this.direction.y * t;
    return t > 0 && Math.abs(x) <= halfWidth && y <= 0 && y >= -height;
  }

  /** The pointer's ray in `space`, written into the hand's origin and direction. */
  private ray(camera: Camera, pointer: Vector3, space: Object3D): void {
    this.raycaster.setFromCamera(new Vector2(pointer.x, pointer.y), camera);
    this.inverse.copy(space.matrixWorld).invert();
    this.origin.copy(this.raycaster.ray.origin).applyMatrix4(this.inverse);
    this.direction.copy(this.raycaster.ray.direction).transformDirection(this.inverse);
  }

  private tuple(v: Vector3): [number, number, number] {
    return [v.x, v.y, v.z];
  }
}
