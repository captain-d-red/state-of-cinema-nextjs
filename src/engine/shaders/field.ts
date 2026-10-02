import { BEND, RIVER, TERRAIN } from '../world';
import { f, glsl, hash } from './common';

/**
 * Gradient noise and the height field. The terrain, the dust and the rising numbers all call
 * the same height functions, so nothing floats above or sinks below the ground it belongs to.
 * It brings the hash functions with it, so a shader that includes it must not include `hash`
 * again.
 */
export const field = glsl`${hash}
uniform float uTime;
/** Eases from zero to one while the scene boots, growing the dunes out of a flat plain. */
uniform float uIntro;
/** Pointer on the ground, as world x and z, and how present it is from zero to one. */
uniform vec3 uHover;

/** Perlin-style gradient noise with a quintic fade, in about −1 to 1. */
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 q = fract(p);
  vec2 u = q * q * q * (q * (q * 6.0 - 15.0) + 10.0);
  float a0 = hash12(i) * 6.2831853;
  float a1 = hash12(i + vec2(1.0, 0.0)) * 6.2831853;
  float a2 = hash12(i + vec2(0.0, 1.0)) * 6.2831853;
  float a3 = hash12(i + vec2(1.0, 1.0)) * 6.2831853;
  float n0 = dot(vec2(cos(a0), sin(a0)), q);
  float n1 = dot(vec2(cos(a1), sin(a1)), q - vec2(1.0, 0.0));
  float n2 = dot(vec2(cos(a2), sin(a2)), q - vec2(0.0, 1.0));
  float n3 = dot(vec2(cos(a3), sin(a3)), q - vec2(1.0, 1.0));
  return mix(mix(n0, n1, u.x), mix(n2, n3, u.x), u.y) * 1.414;
}

/** Two octaves of dunes, the second at two and a half times the frequency and under half the height. */
float dunes(vec2 xz) {
  vec2 p = xz * ${f(TERRAIN.noiseScale)};
  return (gnoise(p) + 0.45 * gnoise(p * 2.5 + 13.1)) * ${f(TERRAIN.relief)};
}

/** The valley's winding centre line, the same sine as \`valleyCentre\` in world.ts. */
float valleyCentre(float z) {
  return ${f(BEND.amplitude)} * sin(6.2831853 * z / ${f(BEND.period)});
}

/**
 * The valley walls, flat across the flight path and climbing as a power of the distance
 * past it, measured from the winding centre line rather than from x = 0.
 */
float valley(vec2 xz) {
  float d = max(abs(xz.x - valleyCentre(xz.y)) - ${f(TERRAIN.corridorWidth)}, 0.0);
  // The walls rise and fall along their length on a slow noise, so their crests read as a
  // range of hills against the sky instead of one smooth curve.
  float range = 0.72 + 0.56 * (gnoise(xz * 0.13 + 4.1) * 0.5 + 0.5) + 0.12 * gnoise(xz * 0.47);
  return pow(d, ${f(TERRAIN.corridorSharpness)}) * ${f(TERRAIN.corridorHeight)} * range;
}

/** How far the river bed sinks below the dunes, full inside the corridor and none past the shore. */
float bed(vec2 xz) {
  float d = abs(xz.x - valleyCentre(xz.y));
  return ${f(RIVER.depth)} * (1.0 - smoothstep(${f(TERRAIN.corridorWidth - 0.3)}, ${f(TERRAIN.corridorWidth + RIVER.shore)}, d));
}

float terrainHeight(vec2 xz) {
  return dunes(xz) * uIntro + valley(xz) - bed(xz);
}

/** The height of whatever is on top, the water where the river covers the bed and the ground elsewhere. */
float surfaceHeight(vec2 xz) {
  return max(terrainHeight(xz), ${f(RIVER.level)});
}
`;
