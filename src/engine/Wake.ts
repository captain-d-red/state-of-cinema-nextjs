import { Vector2, Vector3, Vector4, type BufferGeometry, type Texture, type WebGLRenderer } from 'three';
import { PingPong } from './gl';
import { DROP_SLOTS, wakeFragment } from './shaders/wake';

/**
 * The river's surface as a simulated height field, in one fixed world rectangle over the whole
 * flight, so a ring stays where it was made while the camera flies on.
 */
export const WAKE = {
  rect: { x: -4.5, z: -80, width: 9, depth: 96 },
  texelsPerUnit: 20,
  /**
   * Steps a second. A ring moves about 0.7 texels a step, so twenty-four steps a second carry
   * it under a unit a second, a slow, heavy roll, and the water shader blends between steps so
   * the slow rate never shows as stutter. It must not follow the display's refresh rate.
   */
  rate: 24,
  /** Share of a ring's height kept per step, about two and a half seconds for it to halve. */
  damping: 0.988,
  /**
   * The pointer's reach, and the sine it holds the water to: under a centimetre high at one
   * beat a second, so each ring is about seven tenths of a unit from the next, some fourteen texels.
   */
  pointer: { radius: 0.085, height: 0.009, hz: 1.2 },
  /** Height of the impulse a click drops into the water, a little over twice the pointer's swell. */
  drop: 0.028,
} as const;

/** Most steps run in one frame, so a stalled tab catches up gently instead of in one lurch. */
const MAX_STEPS = 4;

export class Wake {
  readonly rect = new Vector4(WAKE.rect.x, WAKE.rect.z, WAKE.rect.width, WAKE.rect.depth);
  /** One texel of the surface in texture coordinates. */
  readonly texel = new Vector2();
  private readonly sim: PingPong;
  private readonly segment = new Vector4();
  private readonly source = new Vector3(0, WAKE.pointer.radius, 0);
  private readonly drops = Array.from({ length: DROP_SLOTS }, () => new Vector3());
  private readonly pending: { x: number; z: number }[] = [];
  private owed = 0;
  private clock = 0;

  constructor(screen: BufferGeometry) {
    const size = new Vector2(
      Math.round(WAKE.rect.width * WAKE.texelsPerUnit),
      Math.round(WAKE.rect.depth * WAKE.texelsPerUnit),
    );
    this.texel.set(1 / size.x, 1 / size.y);
    this.sim = new PingPong(
      size.x,
      size.y,
      screen,
      wakeFragment,
      {
        uState: { value: null },
        uTexel: { value: this.texel },
        uRect: { value: this.rect },
        uDamping: { value: WAKE.damping },
        uSegment: { value: this.segment },
        uSource: { value: this.source },
        uDrops: { value: this.drops },
      },
      'uState',
    );
  }

  /** Height and last height of the surface, in the red and green channels. */
  get texture(): Texture {
    return this.sim.texture;
  }

  /** How far the present moment lies between the last two steps, for blending them, zero to one. */
  get blend(): number {
    return this.owed;
  }

  /** Queues a drop where a click landed on the water, in world x and z. */
  drop(x: number, z: number): void {
    if (this.pending.length < DROP_SLOTS) this.pending.push({ x, z });
  }

  /**
   * Advances the surface by the time since the last frame, in whole fixed steps. `pointer` is
   * the pointer's path over the water this frame in world x and z, and `presence` how much it
   * is there, from zero to one.
   */
  update(renderer: WebGLRenderer, dt: number, pointer: readonly [number, number, number, number], presence: number) {
    this.owed = Math.min(this.owed + dt * WAKE.rate, MAX_STEPS);
    this.segment.set(...pointer);
    for (; this.owed >= 1; this.owed -= 1) {
      this.clock += 1 / WAKE.rate;
      this.source.x = WAKE.pointer.height * Math.sin(2 * Math.PI * WAKE.pointer.hz * this.clock);
      this.source.z = presence;
      for (let i = 0; i < DROP_SLOTS; i++) {
        const drop = this.pending[i];
        this.drops[i]!.set(drop?.x ?? 0, drop?.z ?? 0, drop ? WAKE.drop : 0);
      }
      this.pending.length = 0;
      this.sim.step(renderer);
    }
  }

  dispose(): void {
    this.sim.dispose();
  }
}
