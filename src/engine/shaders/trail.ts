import { glsl, header } from './common';

/**
 * Where the pointer has passed over the ground, as a fading mark in a world-space texture.
 * Each step the mark spreads a little into its neighbours, decays, and gains a stamp along
 * the segment from the last pointer position to this one, so a fast sweep leaves no gaps.
 *
 *   m ← max(decay · mix(m, mean of 4 neighbours, spread), stamp)
 *
 * Taking the larger of the two rather than the sum keeps a resting pointer from building
 * an ever brighter spot.
 */
export const trailFragment = glsl`${header}
uniform sampler2D uTrail;
uniform vec2 uTexel;
/** World rectangle the texture covers, as minimum x, minimum z, width and depth. */
uniform vec4 uRect;
/** Pointer segment this step in world x and z, from xy to zw. */
uniform vec4 uSegment;
/** Stamp radius in world units, and stamp strength, zero when the pointer is off the ground. */
uniform vec2 uStamp;
uniform float uDecay;
in vec2 vUv;
out vec4 fragColor;

void main() {
  float m = texture(uTrail, vUv).r;
  float mean = 0.25 * (
    texture(uTrail, vUv + vec2(uTexel.x, 0.0)).r +
    texture(uTrail, vUv - vec2(uTexel.x, 0.0)).r +
    texture(uTrail, vUv + vec2(0.0, uTexel.y)).r +
    texture(uTrail, vUv - vec2(0.0, uTexel.y)).r
  );
  m = mix(m, mean, 0.5) * uDecay;
  vec2 xz = uRect.xy + vUv * uRect.zw;
  vec2 ab = uSegment.zw - uSegment.xy;
  float along = clamp(dot(xz - uSegment.xy, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  vec2 d = xz - (uSegment.xy + ab * along);
  float stamp = exp(-dot(d, d) / (uStamp.x * uStamp.x)) * uStamp.y;
  fragColor = vec4(max(m, stamp), 0.0, 0.0, 1.0);
}
`;
