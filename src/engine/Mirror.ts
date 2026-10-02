import {
  Matrix4,
  PerspectiveCamera,
  Plane,
  Vector3,
  Vector4,
  type Object3D,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { createHalfFloatTarget } from './gl';

/**
 * The scene as seen in the water: the camera mirrored through the plane y = level, rendered
 * into its own target. The mirrored camera's near plane is tilted onto the water with an
 * oblique projection, so nothing under the surface leaks into the reflection, and that works
 * for every material without each shader clipping for itself.
 *
 *          eye ●                       reflection matrix maps a world point to where its
 *              ╲      ╱ ● objects      image lies in the target, as bias · P′ · V′
 *   ═══════════╲════╱═══════ y = level
 *                ╲╱
 *          eye′  ●   mirrored camera, looking up through the water
 */
export class Mirror {
  readonly target: WebGLRenderTarget;
  /** World position to reflection texture coordinates, projective. */
  readonly matrix = new Matrix4();
  private readonly camera = new PerspectiveCamera();
  private readonly normal = new Vector3(0, 1, 0);
  private readonly plane = new Plane();
  private readonly clip = new Vector4();
  private readonly q = new Vector4();
  private readonly at = new Vector3();
  private readonly ahead = new Vector3();
  private readonly rotation = new Matrix4();
  private static readonly BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

  /** `scale` is the reflection's share of the drawing buffer on each axis, low since ripples blur it anyway. */
  constructor(
    private readonly level: number,
    private readonly scale: number,
  ) {
    this.target = createHalfFloatTarget(1, 1, { depthBuffer: true });
  }

  resize(width: number, height: number): void {
    this.target.setSize(Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale)));
  }

  /** Where the mirrored eye stands, for shaders that light from the viewer's position. */
  get position(): Vector3 {
    return this.camera.position;
  }

  /** Mirrors `eye` through the water and updates the reflection matrix to match. */
  place(eye: PerspectiveCamera): void {
    const c = this.camera;
    c.copy(eye, false);
    c.position.copy(eye.position).setY(2 * this.level - eye.position.y);
    this.rotation.extractRotation(eye.matrixWorld);
    this.ahead.set(0, 0, -1).applyMatrix4(this.rotation).add(eye.position);
    this.at.copy(this.ahead).setY(2 * this.level - this.ahead.y);
    c.up.set(0, 1, 0).applyMatrix4(this.rotation).reflect(this.normal);
    c.lookAt(this.at);
    c.updateMatrixWorld();
    c.projectionMatrix.copy(eye.projectionMatrix);

    // Lengyel's oblique near plane: replace the projection's third row so its near plane is
    // the water plane in the mirrored camera's view space.
    this.plane.setFromNormalAndCoplanarPoint(this.normal, this.at.set(0, this.level, 0));
    this.plane.applyMatrix4(c.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const e = c.projectionMatrix.elements;
    this.q.set(
      (Math.sign(this.clip.x) + e[8]!) / e[0]!,
      (Math.sign(this.clip.y) + e[9]!) / e[5]!,
      -1,
      (1 + e[10]!) / e[14]!,
    );
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    e[2] = this.clip.x;
    e[6] = this.clip.y;
    e[10] = this.clip.z + 1;
    e[14] = this.clip.w;
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();

    this.matrix.copy(Mirror.BIAS).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
  }

  /** Renders `scene` as reflected in the water, with `hidden` (the water itself) left out. */
  render(renderer: WebGLRenderer, scene: Object3D, hidden: Object3D): void {
    const c = this.camera;
    const visible = hidden.visible;
    hidden.visible = false;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, c);
    hidden.visible = visible;
  }

  dispose(): void {
    this.target.dispose();
  }
}
