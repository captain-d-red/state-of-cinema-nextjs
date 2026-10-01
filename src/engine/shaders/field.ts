import { BEND, TERRAIN } from '../world';
import { f, glsl, hash } from './common';

/** Ring slots a click can occupy at once. A fifth click reuses the oldest slot. */
export const RING_SLOTS = 4;

/**
 * Gradient noise, the height field and everything that disturbs it. The terrain, its dots,
 * the dust and the rising numbers all call `terrainHeight`, so a ripple moves every layer
 * together and nothing floats above or sinks below the ground it belongs to. It brings the
 * hash functions with it, so a shader that includes it must not include `hash` again.
 */
export const field = glsl`${hash}
uniform float uTime;
/** Eases from zero to one while the scene boots, growing the dunes out of a flat plain. */
uniform float uIntro;
/** Pointer on the ground, as world x and z, and how present it is from zero to one. */
uniform vec3 uHover;
/** Click rings, as world x and z and the time each started. A negative time is an empty slot. */
uniform vec3 uRings[${RING_SLOTS}];

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
  return pow(d, ${f(TERRAIN.corridorSharpness)}) * ${f(TERRAIN.corridorHeight)};
}

/**
 * A click sends one ring out across the dunes. Its height is a sine under a Gaussian
 * envelope that travels at constant speed, and it swells then dies as t·e^(1−t) over its life.
 */
float rings(vec2 xz) {
  float sum = 0.0;
  for (int i = 0; i < ${RING_SLOTS}; i++) {
    vec3 ring = uRings[i];
    float age = uTime - ring.z;
    if (ring.z < 0.0 || age < 0.0 || age > 4.0) continue;
    float r = length(xz - ring.xy);
    float front = r - age * 1.6;
    float envelope = exp(-front * front / 1.6);
    float life = age / 0.9;
    sum += sin(front * 5.7) * envelope * life * exp(1.0 - life) * exp(-r * 0.12);
  }
  return sum * 0.08;
}

float terrainHeight(vec2 xz) {
  float hover = exp(-dot(xz - uHover.xy, xz - uHover.xy) / 0.42) * 0.11 * uHover.z;
  return (dunes(xz) + rings(xz) + hover) * uIntro + valley(xz);
}
`;
