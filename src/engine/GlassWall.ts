import {
  Euler,
  GLSL3,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  NormalBlending,
  Quaternion,
  RawShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  type Camera,
  type IUniform,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Film } from '@/data/catalogue';
import { hexToLinear } from '@/lib/color';
import { clamp, smoothstep } from '@/lib/math';
import { glassFragment, glassVertex } from './shaders/glass';
import { CAMERA, valleyCentre } from './world';

/** A poster is two by three, so the wall is eight tiles across and twelve down. */
const COLUMNS = 8;
const ROWS = 12;
const HEIGHT = 1.92;
const WIDTH = (HEIGHT * 2) / 3;
const DEPTH = 0.06;
/** Share of each cell the tile fills, leaving hairline joints between tiles. */
const FILL = 0.955;
/** The wall's foot stands this far above the ground. */
const BASE = 0.06;
/**
 * The wall turns in edge-on, settles nearly square to the camera and swings away on the way
 * out, as yaw angles in radians.
 */
const YAW = { enter: 1.54, held: 0.12, exit: -1.75 } as const;
/** Pointer reach in normalised device coordinates, and how long a flipped tile takes to settle. */
const HOVER_RADIUS = 0.24;
const HOVER_SETTLE = 0.35;

const piecewise = (x: number): number => {
  if (x <= 0 || x >= 1.5) return 0;
  if (x < 0.5) return smoothstep(0, 1, x / 0.5);
  if (x < 1) return 1;
  return 1 - smoothstep(0, 1, (x - 1) / 0.5);
};

/**
 * A top pick shown as a poster held in a wall of glass tiles. The tiles turn in row by row
 * from the bottom as the camera arrives, with a ripple across each row, and turn away again
 * as it leaves. The pointer flips the tiles it passes, and they settle back behind it.
 */
export class GlassWall {
  readonly group = new Group();
  private readonly mesh: InstancedMesh<RoundedBoxGeometry, RawShaderMaterial>;
  private readonly opacity: IUniform<number> = { value: 0 };
  private readonly delays = new Float32Array(COLUMNS * ROWS);
  private readonly kicks = new Float32Array(COLUMNS * ROWS);
  private readonly centres: Vector3[] = [];
  private readonly matrix = new Matrix4();
  private readonly turn = new Quaternion();
  private readonly euler = new Euler();
  private readonly offset = new Vector3();
  private readonly scale = new Vector3();
  private readonly probe = new Vector3();
  private readonly abort = new AbortController();
  private poster: Texture | null = null;

  constructor(
    film: Film,
    private readonly z: number,
    camPos: IUniform<Vector3>,
    onError: (error: unknown) => void,
  ) {
    const cell = new Vector2(WIDTH / COLUMNS, HEIGHT / ROWS);
    const geometry = new RoundedBoxGeometry(cell.x * FILL, cell.y * FILL, DEPTH, 3, Math.min(cell.x, cell.y) * 0.12);
    const tiles = new Float32Array(COLUMNS * ROWS * 2);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLUMNS; c++) {
        const i = r * COLUMNS + c;
        tiles[i * 2] = c;
        tiles[i * 2 + 1] = r;
        this.centres.push(new Vector3((c - (COLUMNS - 1) / 2) * cell.x, (r - (ROWS - 1) / 2) * cell.y, 0));
        // Rows turn in from the bottom, and a slow sine across the columns makes each row a wave.
        this.delays[i] = (r / ROWS) * 0.45 + 0.06 * Math.sin(0.45 * c + 0.2 * r);
      }
    }
    geometry.setAttribute('aTile', new InstancedBufferAttribute(tiles, 2));
    const uniforms = {
      uPoster: { value: null as Texture | null },
      uCamPos: camPos,
      uTint: { value: new Vector3(...hexToLinear(film.palette.key)) },
      uOpacity: this.opacity,
      uGrid: { value: new Vector2(COLUMNS, ROWS) },
      uCell: { value: cell },
    };
    this.mesh = new InstancedMesh(
      geometry,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: glassVertex,
        fragmentShader: glassFragment,
        uniforms,
        transparent: true,
        blending: NormalBlending,
      }),
      COLUMNS * ROWS,
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 50;
    this.group.add(this.mesh);
    this.group.position.set(valleyCentre(z), BASE + HEIGHT / 2, z);
    this.group.visible = false;

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
        texture.needsUpdate = true;
        this.poster = texture;
        uniforms.uPoster.value = texture;
      })
      .catch((error: unknown) => {
        if (!this.abort.signal.aborted) onError(error);
      });
  }

  /** Whether the poster has arrived, for the loading readout. */
  get ready(): boolean {
    return this.poster !== null;
  }

  /**
   * Places every tile for this frame. Arrival runs from zero, far ahead, to one when the
   * camera frames the wall, and on to two once it has passed, so one number drives both the
   * turn in and the turn away.
   */
  update(cameraZ: number, camera: Camera, cursor: Vector3, dt: number, still: boolean): void {
    const rel = cameraZ - CAMERA.lookAhead - this.z;
    const arrival = smoothstep(7, 1, rel) + smoothstep(-0.5, -3.5, rel);
    this.group.visible = arrival > 0.001 && arrival < 1.999 && this.poster !== null;
    if (!this.group.visible) return;
    const inn = smoothstep(0, 1, Math.min(arrival, 1));
    const out = smoothstep(1, 2, Math.max(arrival, 1));
    this.group.rotation.y = YAW.enter + (YAW.held - YAW.enter) * inn + (YAW.exit - YAW.held) * out;
    this.opacity.value = still ? 1 : clamp(inn * 3, 0, 1) * (1 - out);
    this.group.updateMatrixWorld();

    const decay = Math.exp(-dt / HOVER_SETTLE);
    for (let i = 0; i < this.centres.length; i++) {
      const shown = still ? (arrival > 0.5 && arrival < 1.5 ? 1 : 0) : piecewise(arrival - this.delays[i]!);
      // A tile under the pointer is kicked, and the kick decays, so a moving pointer leaves a wake.
      this.probe.copy(this.centres[i]!).applyMatrix4(this.group.matrixWorld).project(camera);
      const d = Math.hypot(this.probe.x - cursor.x, this.probe.y - cursor.y) / HOVER_RADIUS;
      const kick = still ? 0 : (d < 1 ? (1 - d * d) ** 2 : 0) * cursor.z;
      this.kicks[i] = Math.max(this.kicks[i]! * decay, kick);
      const flip = (1 - shown) * Math.PI + this.kicks[i]! * 1.5;
      this.euler.set(flip, (1 - shown) * 0.6 * Math.sin(0.7 * i), 0);
      this.turn.setFromEuler(this.euler);
      const s = Math.max(0.001, shown) * (1 - this.kicks[i]! * 0.25);
      this.matrix.compose(this.offset.copy(this.centres[i]!), this.turn, this.scale.set(s, s, s));
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.abort.abort();
    this.poster?.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
