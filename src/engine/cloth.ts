/**
 * A hanging banner as a grid of particles joined by distance constraints, integrated with
 * position Verlet and relaxed by Jakobsen's method. It is pure arithmetic over typed arrays,
 * with no rendering in it, so it can be tested and stepped anywhere.
 *
 *   clip ●───●───●───●───●   top row, pinned at the clips, sagging a little between them
 *        │ ╲ │ ╱ │ ╲ │ ╱ │   structural edges hold the weave, diagonals resist shear,
 *        ●───●───●───●───●   and edges that skip a particle resist bending
 *        │   │   │   │   │
 *   rod  ●═══●═══●═══●═══●   bottom row, a rigid weighted rod that keeps the cloth hanging true
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
  /** Mass of each end of the hem rod against one particle of cloth. */
  readonly rodMass: number;
}

export interface ClothForces {
  /** Downward acceleration in units a second squared. */
  readonly gravity: number;
  /** Air velocity in banner space. The cloth feels the part of it across its own surface. */
  readonly wind: readonly [number, number, number];
  /** A pointer pressing into the cloth along a ray, in banner space, or null. */
  readonly poke: Poke | null;
}

export interface Poke {
  readonly origin: readonly [number, number, number];
  /** Unit direction of the ray. */
  readonly direction: readonly [number, number, number];
  readonly radius: number;
  /** How far the press pushes the cloth along the ray at its centre. */
  readonly depth: number;
}

/** Share of velocity kept each step, the cloth's loss to the air and its own weave. */
const DAMPING = 0.988;
const ITERATIONS = 10;
/** How readily each kind of edge returns to its rest length per iteration. */
const STIFFNESS = { structural: 1, shear: 0.5, bend: 0.08 } as const;
/** Couples the wind's push to the cloth, in units of acceleration per unit of normal airspeed. */
const DRAG = 1.6;

export class Cloth {
  readonly positions: Float32Array;
  private readonly previous: Float32Array;
  private readonly rest: Float32Array;
  private readonly inverseMass: Float32Array;
  private readonly edges: Int32Array;
  private readonly lengths: Float32Array;
  private readonly stiffness: Float32Array;
  private readonly normal = new Float32Array(3);

  constructor(readonly spec: ClothSpec) {
    const { columns, rows, width, height, clips, rodMass } = spec;
    const count = columns * rows;
    this.positions = new Float32Array(count * 3);
    this.inverseMass = new Float32Array(count).fill(1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const i = (r * columns + c) * 3;
        this.positions[i] = (c / (columns - 1) - 0.5) * width;
        this.positions[i + 1] = 0 - (r / (rows - 1)) * height;
      }
    }
    for (const c of clips) this.inverseMass[c] = 0;
    const rod = (rows - 1) * columns;
    this.inverseMass[rod] = 1 / rodMass;
    this.inverseMass[rod + columns - 1] = 1 / rodMass;
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
  }

  /** Puts the cloth back flat and still, hanging from its clips. */
  reset(): void {
    this.positions.set(this.rest);
    this.previous.set(this.rest);
  }

  /** Advances the cloth by `dt` seconds. */
  step(dt: number, forces: ClothForces): void {
    const p = this.positions;
    const q = this.previous;
    const count = this.inverseMass.length;
    const dt2 = dt * dt;
    const [wx, wy, wz] = forces.wind;
    for (let i = 0; i < count; i++) {
      if (this.inverseMass[i] === 0) continue;
      const k = i * 3;
      const vx = (p[k]! - q[k]!) / dt;
      const vy = (p[k + 1]! - q[k + 1]!) / dt;
      const vz = (p[k + 2]! - q[k + 2]!) / dt;
      // Air pushes along the cloth's normal in proportion to the airspeed across it.
      this.normalAt(i);
      const n = this.normal;
      const across = (wx - vx) * n[0]! + (wy - vy) * n[1]! + (wz - vz) * n[2]!;
      const ax = DRAG * across * n[0]!;
      const ay = DRAG * across * n[1]! - forces.gravity;
      const az = DRAG * across * n[2]!;
      for (let a = 0; a < 3; a++) {
        const now = p[k + a]!;
        p[k + a] = now + (now - q[k + a]!) * DAMPING + [ax, ay, az][a]! * dt2;
        q[k + a] = now;
      }
    }
    for (let it = 0; it < ITERATIONS; it++) {
      this.relax();
      this.straightenRod();
    }
    if (forces.poke) this.press(forces.poke);
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

  /** Pushes particles near the ray along it, deepest at its centre, as a fingertip presses fabric. */
  private press({ origin, direction, radius, depth }: Poke): void {
    const p = this.positions;
    for (let i = 0; i < this.inverseMass.length; i++) {
      if (this.inverseMass[i] === 0) continue;
      const k = i * 3;
      const ox = p[k]! - origin[0];
      const oy = p[k + 1]! - origin[1];
      const oz = p[k + 2]! - origin[2];
      const along = ox * direction[0] + oy * direction[1] + oz * direction[2];
      const off = Math.hypot(ox - along * direction[0], oy - along * direction[1], oz - along * direction[2]);
      if (off >= radius) continue;
      const fall = (1 - off / radius) ** 2;
      // Only push forward of where the press has already reached, so a held press does not keep sinking.
      const push = Math.max(0, depth * fall - Math.max(0, along - this.restDepth(i, origin, direction)));
      p[k] = p[k]! + direction[0] * push * 0.2;
      p[k + 1] = p[k + 1]! + direction[1] * push * 0.2;
      p[k + 2] = p[k + 2]! + direction[2] * push * 0.2;
    }
  }

  /** How far along the ray a particle's rest position lies. */
  private restDepth(i: number, origin: readonly number[], direction: readonly number[]): number {
    const r = this.rest;
    return (
      (r[i * 3]! - origin[0]!) * direction[0]! +
      (r[i * 3 + 1]! - origin[1]!) * direction[1]! +
      (r[i * 3 + 2]! - origin[2]!) * direction[2]!
    );
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
