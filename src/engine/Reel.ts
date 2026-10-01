import {
  DoubleSide,
  GLSL3,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NormalBlending,
  PlaneGeometry,
  RawShaderMaterial,
  Raycaster,
  type Texture,
  Vector2,
  Vector3,
  type Camera,
  type IUniform,
} from 'three';
import { ATLAS } from '@/data/atlas';
import { damp, smoothstep } from '@/lib/math';
import { reelFragment, reelVertex } from './shaders/reel';

/** Poster height on the reel, and the strip width that holds a 2:3 poster between its rebates. */
const FRAME_HEIGHT = 0.62;
const FRAME_WIDTH = (FRAME_HEIGHT * (2 / 3)) / (1 - 2 * 0.16);
/** The reel winds just inside the tunnel's dots, nine frames to a turn. */
const RADIUS = 1.72;
const PER_TURN = 9;
/** Distance along the flight between neighbouring frames, and where the nearest one sits. */
const SPACING = 0.55;
const NEAREST = 1.4;
/** Frames a second the reel runs toward the camera, so every film passes in a little over three minutes. */
const SPEED = 0.35;
/** How far each frame leans its face back toward the camera, so the ones overhead still read. */
const LEAN = 0.76;

/**
 * The finale: every film in the catalogue as a frame on a strip of film wound around the
 * inside of the tunnel, running slowly toward the camera like a reel through a projector.
 * The pointer lights the frame it is on, and a click plays that film's trailer.
 *
 *          frame k ─┐            angle = 2π · s / 9
 *     ◻   ◻   ◻     │            z     = camera − 1.4 − 0.55 · s
 *   ◻   ◉   ◻       │            s     = (k − 0.35 · time) mod 72
 *     ◻   ◻   ◻   ──┘
 */
export class Reel {
  readonly mesh: InstancedMesh<PlaneGeometry, RawShaderMaterial>;
  private readonly frames: InstancedBufferAttribute;
  private readonly fades: InstancedBufferAttribute;
  private readonly matrix = new Matrix4();
  private readonly at = new Vector3();
  private readonly face = new Vector3();
  private readonly target = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly raycaster = new Raycaster();
  private hovered: number | null = null;

  constructor(
    private readonly count: number,
    glow: IUniform<Vector3>,
    private readonly atlas: IUniform<Texture | null>,
  ) {
    const geometry = new PlaneGeometry(FRAME_WIDTH, FRAME_HEIGHT);
    const frames = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) frames[i * 2] = i;
    this.frames = new InstancedBufferAttribute(frames, 2);
    this.fades = new InstancedBufferAttribute(new Float32Array(count), 1);
    geometry.setAttribute('aFrame', this.frames);
    geometry.setAttribute('aFade', this.fades);
    const uniforms = {
      uAtlas: atlas,
      uAtlasCells: { value: new Vector2(ATLAS.columns, ATLAS.rows) },
      uGlow: glow,
    };
    this.mesh = new InstancedMesh(
      geometry,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: reelVertex,
        fragmentShader: reelFragment,
        uniforms,
        transparent: true,
        depthWrite: true,
        side: DoubleSide,
        blending: NormalBlending,
      }),
      count,
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 60;
    this.mesh.visible = false;
  }

  /**
   * Winds the reel around the camera for this frame and returns the film under the pointer.
   * `tunnel` is how far the tunnel has formed, and the reel only appears once it has.
   */
  update(time: number, camera: Camera, pointer: Vector3, tunnel: number, dt: number, still: boolean): number | null {
    const show = smoothstep(0.75, 1, tunnel);
    this.mesh.visible = show > 0.001 && this.atlas.value !== null;
    if (!this.mesh.visible) {
      this.hovered = null;
      return null;
    }
    const flow = still ? 0 : time * SPEED;
    const origin = camera.position;
    for (let k = 0; k < this.count; k++) {
      const s = (((k - flow) % this.count) + this.count) % this.count;
      const angle = (2 * Math.PI * s) / PER_TURN;
      this.at.set(
        origin.x + Math.cos(angle) * RADIUS,
        origin.y + Math.sin(angle) * RADIUS,
        origin.z - NEAREST - s * SPACING,
      );
      this.face.set(-Math.cos(angle) * (1 - LEAN), -Math.sin(angle) * (1 - LEAN), LEAN).normalize();
      // Matrix4.lookAt points −z from eye to target, so the target sits behind the face for +z to face out.
      this.matrix.lookAt(this.at, this.target.copy(this.at).sub(this.face), this.up);
      this.matrix.setPosition(this.at);
      this.mesh.setMatrixAt(k, this.matrix);
      // Frames fade in as they leave the far dark and out as they slip past the camera.
      this.fades.setX(k, show * smoothstep(0, 1.2, s) * (1 - smoothstep(this.count * 0.55, this.count * 0.8, s)));
      const lit = this.frames.getY(k);
      this.frames.setY(k, damp(lit, k === this.hovered ? 1 : 0, 9, dt));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.fades.needsUpdate = true;
    this.frames.needsUpdate = true;
    this.mesh.computeBoundingSphere();

    this.hovered = null;
    if (pointer.z > 0.5) {
      this.raycaster.setFromCamera(new Vector2(pointer.x, pointer.y), camera);
      const hit = this.raycaster.intersectObject(this.mesh, false)[0];
      const id = hit?.instanceId;
      if (id !== undefined && this.fades.getX(id) > 0.3) this.hovered = id;
    }
    return this.hovered;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
