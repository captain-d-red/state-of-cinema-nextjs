/**
 * The world in units of roughly a metre. The camera flies along −z down a shallow valley of
 * dust, and the story's stations stand in the valley one after another.
 *
 *            camera ◉──── looks 5.5 ahead and slightly down
 *                    ╲
 *   ╲  wall           ╲          station content at z₀            wall  ╱
 *    ╲_________________●______________▲______________________________╱
 *         valley floor, |x| < 1.8, then the walls climb as (|x| − 1.8)^1.85
 */
export const CAMERA = {
  height: 1.2,
  lookAhead: 5.5,
  lookHeight: 0.1,
  /** Tall screens look further down, so the valley fills the frame instead of the night sky. */
  lookHeightTall: -0.9,
  /** Vertical field of view in degrees, wider on tall screens so the valley still reads. */
  fov: 52,
  fovTall: 72,
} as const;

export const TERRAIN = {
  /** Side of the square patch that travels with the camera. */
  size: 60,
  segments: 300,
  /** Frequency and height of the dunes. */
  noiseScale: 0.36,
  relief: 0.16,
  /** The valley the camera flies down: flat inside the width, climbing past it. */
  corridorWidth: 1.8,
  corridorHeight: 0.42,
  corridorSharpness: 1.85,
} as const;

/** Distance along the flight between neighbouring stations. */
export const STATION_SPACING = 9;
/** Where the first station after the title stands. */
export const FIRST_STATION_Z = -6;

/** World z a station's content stands at. Station 0 is the title, framed at the origin. */
export const stationZ = (index: number): number => (index === 0 ? 0 : FIRST_STATION_Z - (index - 1) * STATION_SPACING);

/** Where the camera stands to frame a station. */
export const cameraZ = (index: number): number => stationZ(index) + CAMERA.lookAhead;

/**
 * The valley winds like a river bed, so the flight banks through long bends instead of
 * running straight. Its centre line swings across x as a sine of z.
 *
 *   centre(z) = 1.6 · sin(2π · z / 36)        one full swing every four stations
 */
export const BEND = { amplitude: 1.6, period: 36 } as const;

export const valleyCentre = (z: number): number => BEND.amplitude * Math.sin((2 * Math.PI * z) / BEND.period);
