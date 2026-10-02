/**
 * A hanging banner as a grid of particles joined by distance constraints, integrated with
 * position Verlet and relaxed by Jakobsen's method. It is pure arithmetic over typed arrays,
 * with no rendering in it, so it can be tested and stepped anywhere.
 *
 *   clip ●───●───●───●───●   top row, pinned at the clips, sagging a little between them
 *        │ ╲ │ ╱ │ ╲ │ ╱ │   structural edges hold the weave, diagonals resist shear,
 *        ●───●───●───●───●   and edges that skip a particle resist bending
 *        │   │   │   │   │
 *   hem  ●═══●═══●═══●═══●   bottom row, either a rigid weighted rod or a heavy weighted tape
 *
 * Banner space has its origin at the middle of the top edge, x across, y up and z toward the
 * viewer, so the cloth hangs in y < 0.
 */

export interface ClothSpec {
  readonly columns: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  /** Columns of the top row held by clips. */
  readonly clips: readonly number[];
  /**
   * Share of the cloth's width the clips hold the top edge to. Under one, the cloth between
   * clips has slack and drapes in soft swags, the folds that make hung fabric read as fabric.
   */
  readonly gather: number;
  /**
   * The hem. A rod is rigid, a banner's width long, and only its two ends carry its mass. A
   * weighted tape is the curtain's lead chain: every hem particle is heavy but free, so the
   * hem can gather with the rest of the cloth.
   */
  readonly hem: 'rod' | 'weighted';
  /** Mass of each weighted hem particle, or of each end of the rod, against one particle of cloth. */
  readonly hemMass: number;
}

export interface ClothForces {
  /** Downward acceleration in units a second squared. */
  readonly gravity: number;
  /** Air velocity in banner space. The cloth feels the part of it across its own surface. */
  readonly wind: readonly [number, number, number];
  /** A pointer pressing into the cloth along a ray, in banner space, or null. */
  readonly poke: Poke | null;
}

/**
 * A hand resting on the cloth: a soft push along the pointer's ray, strongest at its centre
 * and gone at its radius. It acts as a force, like the wind, so a held press settles into a
 * gentle dent and a moving one leaves the cloth swaying, never jittering.
 */
export interface Poke {
  readonly origin: readonly [number, number, number];
  /** Unit direction of the ray. */
  readonly direction: readonly [number, number, number];
  readonly radius: number;
  /** Acceleration at the centre of the press, in units a second squared. */
  readonly strength: number;
}

/** Share of velocity kept each step, the cloth's loss to the air and its own weave. */
const DAMPING = 0.988;
const ITERATIONS = 10;
/** How readily each kind of edge returns to its rest length per iteration. */
const STIFFNESS = { structural: 1, shear: 0.5, bend: 0.08 } as const;
/** Couples the wind's push to the cloth, in units of acceleration per unit of normal airspeed. */
const DRAG = 3.2;
/**
 * Real air is never one even push. The wind's strength varies across the cloth as two
 * travelling waves, so ripples run through the fabric instead of the whole banner swinging.
 *
 * Their wavelengths, about seven and nine tenths of a unit, are shorter than the banner, so
 * the cloth ripples within itself rather than rocking as one piece.
 *
 *   gust(x, y, t) = 1 + 0.6 · sin(9x + 3.1t) · cos(7y − 2.4t)
 */
const TURBULENCE = { depth: 0.6, across: 9, down: 7, a: 3.1, b: 2.4 } as const;

export class Cloth {
  readonly positions: Float32Array;
  private readonly previous: Float32Array;
  private readonly rest: Float32Array;
  private readonly inverseMass: Float32Array;
  private readonly edges: Int32Array;
  private readonly lengths: Float32Array;
  private readonly stiffness: Float32Array;
  private readonly normal = new Float32Array(3);
  private clock = 0;

  constructor(readonly spec: ClothSpec) {
    const { columns, rows, width, height, clips, hem, hemMass, gather } = spec;
    const count = columns * rows;
    this.positions = new Float32Array(count * 3);
    this.inverseMass = new Float32Array(count).fill(1);
    // The constraints take their rest lengths from the cloth laid flat, before the clips gather it.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const i = (r * columns + c) * 3;
        this.positions[i] = (c / (columns - 1) - 0.5) * width;
        this.positions[i + 1] = 0 - (r / (rows - 1)) * height;
      }
    }
    for (const c of clips) this.inverseMass[c] = 0;
    const foot = (rows - 1) * columns;
    for (let c = 0; c < columns; c++) {
      if (hem === 'weighted' || c === 0 || c === columns - 1) this.inverseMass[foot + c] = 1 / hemMass;
    }
    this.previous = this.positions.slice();
    this.rest = this.positions.slice();

    const pairs: number[] = [];
    const kinds: number[] = [];
    const link = (a: number, b: number, k: number) => {
      pairs.push(a, b);
      kinds.push(k);
    };
    const at = (r: number, c: number) => r * columns + c;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if (c + 1 < columns) link(at(r, c), at(r, c + 1), STIFFNESS.structural);
        if (r + 1 < rows) link(at(r, c), at(r + 1, c), STIFFNESS.structural);
        if (c + 1 < columns && r + 1 < rows) {
          link(at(r, c), at(r + 1, c + 1), STIFFNESS.shear);
          link(at(r, c + 1), at(r + 1, c), STIFFNESS.shear);
        }
        if (c + 2 < columns) link(at(r, c), at(r, c + 2), STIFFNESS.bend);
        if (r + 2 < rows) link(at(r, c), at(r + 2, c), STIFFNESS.bend);
      }
    }
    this.edges = Int32Array.from(pairs);
    this.stiffness = Float32Array.from(kinds);
    this.lengths = new Float32Array(kinds.length);
    for (let e = 0; e < kinds.length; e++) this.lengths[e] = this.distance(pairs[e * 2]!, pairs[e * 2 + 1]!);

    // Then the clips draw the top edge in, and every row is drawn in less the further it hangs
    // below them, with a slight wave toward and away from the viewer between each pair of
    // clips, so the slack buckles into alternating folds rather than at random.
    for (let r = 0; r < rows; r++) {
      const take = 1 - (1 - gather) * (1 - r / (rows - 1)) ** 2;
      for (let c = 0; c < columns; c++) {
        const i = (r * columns + c) * 3;
        this.positions[i] = this.positions[i]! * take;
        const between = (c / (columns - 1)) * (clips.length - 1);
        this.positions[i + 2] = 0.012 * Math.sin(between * Math.PI) * (1 - r / (rows - 1));
      }
    }
    this.previous.set(this.positions);
    this.rest.set(this.positions);
  }

  /** Puts the cloth back flat and still, hanging from its clips. */
  reset(): void {
    this.positions.set(this.rest);
    this.previous.set(this.rest);
  }

  /**
   * Moves the clip at `column` to a new place in banner space. Clips are driven, not simulated,
   * so the cloth follows them the way a curtain follows its hooks along a rail.
   */
  moveClip(column: number, x: number, y: number, z: number): void {
    const k = column * 3;
    this.positions[k] = this.previous[k] = x;
    this.positions[k + 1] = this.previous[k + 1] = y;
    this.positions[k + 2] = this.previous[k + 2] = z;
  }

  /** Where every particle was hung, as x, y and z in banner space, before any force moved it. */
  get hung(): Readonly<Float32Array> {
    return this.rest;
  }

  /** Where the clip at `column` was hung, in banner space. */
  clipAt(column: number): readonly [number, number, number] {
    const k = column * 3;
    return [this.rest[k]!, this.rest[k + 1]!, this.rest[k + 2]!];
  }

  /** Advances the cloth by `dt` seconds. */
  step(dt: number, forces: ClothForces): void {
    const p = this.positions;
    const q = this.previous;
    const count = this.inverseMass.length;
    const dt2 = dt * dt;
    const [wx, wy, wz] = forces.wind;
    this.clock += dt;
    const t = this.clock;
    for (let i = 0; i < count; i++) {
      if (this.inverseMass[i] === 0) continue;
      const k = i * 3;
      const vx = (p[k]! - q[k]!) / dt;
      const vy = (p[k + 1]! - q[k + 1]!) / dt;
      const vz = (p[k + 2]! - q[k + 2]!) / dt;
      // Air pushes along the cloth's normal in proportion to the airspeed across it.
      this.normalAt(i);
      const n = this.normal;
      const gust =
        1 +
        TURBULENCE.depth *
          Math.sin(p[k]! * TURBULENCE.across + t * TURBULENCE.a) *
          Math.cos(p[k + 1]! * TURBULENCE.down - t * TURBULENCE.b);
      const across = (wx * gust - vx) * n[0]! + (wy * gust - vy) * n[1]! + (wz * gust - vz) * n[2]!;
      // The push is a force, so it moves a particle in inverse proportion to its mass, and the
      // heavy ends of the hem rod barely feel the air that billows the cloth around them.
      const push = DRAG * across * this.inverseMass[i]!;
      const press = forces.poke ? this.pressAt(k, forces.poke) * this.inverseMass[i]! : 0;
      const d = forces.poke?.direction;
      const ax = push * n[0]! + (d ? d[0] * press : 0);
      const ay = push * n[1]! - forces.gravity + (d ? d[1] * press : 0);
      const az = push * n[2]! + (d ? d[2] * press : 0);
      for (let a = 0; a < 3; a++) {
        const now = p[k + a]!;
        p[k + a] = now + (now - q[k + a]!) * DAMPING + [ax, ay, az][a]! * dt2;
        q[k + a] = now;
      }
    }
    for (let it = 0; it < ITERATIONS; it++) {
      this.relax();
      if (this.spec.hem === 'rod') this.straightenRod();
    }
  }

  /** The press's acceleration at the particle starting at index `k`, falling off with distance from the ray. */
  private pressAt(k: number, { origin, direction, radius, strength }: Poke): number {
    const p = this.positions;
    const ox = p[k]! - origin[0];
    const oy = p[k + 1]! - origin[1];
    const oz = p[k + 2]! - origin[2];
    const along = ox * direction[0] + oy * direction[1] + oz * direction[2];
    const off = Math.hypot(ox - along * direction[0], oy - along * direction[1], oz - along * direction[2]);
    if (off >= radius) return 0;
    const fall = 1 - off / radius;
    return strength * fall * fall * (3 - 2 * fall);
  }

  private distance(a: number, b: number): number {
    const p = this.positions;
    return Math.hypot(p[a * 3]! - p[b * 3]!, p[a * 3 + 1]! - p[b * 3 + 1]!, p[a * 3 + 2]! - p[b * 3 + 2]!);
  }

  private relax(): void {
    const p = this.positions;
    const w = this.inverseMass;
    const edges = this.edges;
    for (let e = 0; e < this.lengths.length; e++) {
      const a = edges[e * 2]!;
      const b = edges[e * 2 + 1]!;
      const wa = w[a]!;
      const wb = w[b]!;
      const sum = wa + wb;
      if (sum === 0) continue;
      const dx = p[b * 3]! - p[a * 3]!;
      const dy = p[b * 3 + 1]! - p[a * 3 + 1]!;
      const dz = p[b * 3 + 2]! - p[a * 3 + 2]!;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1e-9) continue;
      const shift = ((d - this.lengths[e]!) / (d * sum)) * this.stiffness[e]!;
      p[a * 3] = p[a * 3]! + dx * shift * wa;
      p[a * 3 + 1] = p[a * 3 + 1]! + dy * shift * wa;
      p[a * 3 + 2] = p[a * 3 + 2]! + dz * shift * wa;
      p[b * 3] = p[b * 3]! - dx * shift * wb;
      p[b * 3 + 1] = p[b * 3 + 1]! - dy * shift * wb;
      p[b * 3 + 2] = p[b * 3 + 2]! - dz * shift * wb;
    }
  }

  /** The hem is a rigid rod: its ends keep the banner's width apart and the row lies evenly between them. */
  private straightenRod(): void {
    const { columns, rows, width } = this.spec;
    const p = this.positions;
    const first = (rows - 1) * columns;
    const last = first + columns - 1;
    const dx = p[last * 3]! - p[first * 3]!;
    const dy = p[last * 3 + 1]! - p[first * 3 + 1]!;
    const dz = p[last * 3 + 2]! - p[first * 3 + 2]!;
    const d = Math.hypot(dx, dy, dz);
    const fix = d > 1e-9 ? (d - width) / (2 * d) : 0;
    for (let a = 0; a < 3; a++) {
      const delta = [dx, dy, dz][a]! * fix;
      p[first * 3 + a] = p[first * 3 + a]! + delta;
      p[last * 3 + a] = p[last * 3 + a]! - delta;
    }
    for (let c = 1; c < columns - 1; c++) {
      const t = c / (columns - 1);
      for (let a = 0; a < 3; a++) {
        p[(first + c) * 3 + a] = p[first * 3 + a]! + (p[last * 3 + a]! - p[first * 3 + a]!) * t;
      }
    }
  }

  /** The cloth's normal at a particle from its neighbours across and down, facing +z at rest. */
  private normalAt(i: number): void {
    const { columns, rows } = this.spec;
    const r = Math.floor(i / columns);
    const c = i % columns;
    const left = r * columns + Math.max(c - 1, 0);
    const right = r * columns + Math.min(c + 1, columns - 1);
    const up = Math.max(r - 1, 0) * columns + c;
    const down = Math.min(r + 1, rows - 1) * columns + c;
    const p = this.positions;
    const ax = p[right * 3]! - p[left * 3]!;
    const ay = p[right * 3 + 1]! - p[left * 3 + 1]!;
    const az = p[right * 3 + 2]! - p[left * 3 + 2]!;
    const bx = p[up * 3]! - p[down * 3]!;
    const by = p[up * 3 + 1]! - p[down * 3 + 1]!;
    const bz = p[up * 3 + 2]! - p[down * 3 + 2]!;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    this.normal[0] = nx / len;
    this.normal[1] = ny / len;
    this.normal[2] = nz / len;
  }
}
