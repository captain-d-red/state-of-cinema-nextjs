import { f, glsl, header } from './common';

/** Click drops the surface can carry at once. A fifth click in one frame waits for the next. */
export const DROP_SLOTS = 4;

/**
 * One step of the surface of the river, as the discrete wave equation on a height field. Each
 * texel keeps its height now and one step ago, and the next height follows from its four
 * neighbours, so a disturbance spreads as rings at a fixed speed and loses a little energy
 * every step.
 *
 *   hₜ₊₁ = ( ½ · (h←  + h→ + h↑ + h↓)ₜ − hₜ₋₁ ) · damping
 *
 * The pointer drives the surface where it rests, holding the water there to a slow sine, so a
 * still pointer sends out a steady train of rings and a moving one draws a wake behind it.
 * A click drops a single heavier impulse.
 */
export const wakeFragment = glsl`${header}
uniform sampler2D uState;
uniform vec2 uTexel;
/** World rectangle the surface covers, as minimum x, minimum z, width and depth. */
uniform vec4 uRect;
uniform float uDamping;
/** Pointer path this step, from xy to zw in world x and z. */
uniform vec4 uSegment;
/** Height the pointer holds the water to, its radius, and how present it is from zero to one. */
uniform vec3 uSource;
/** Click drops as world x, world z and height, zero height for an empty slot. */
uniform vec3 uDrops[${DROP_SLOTS}];
in vec2 vUv;
out vec4 fragColor;

const float DROP_RADIUS = ${f(0.16)};

void main() {
  vec2 state = texture(uState, vUv).rg;
  float around =
    texture(uState, vUv + vec2(uTexel.x, 0.0)).r +
    texture(uState, vUv - vec2(uTexel.x, 0.0)).r +
    texture(uState, vUv + vec2(0.0, uTexel.y)).r +
    texture(uState, vUv - vec2(0.0, uTexel.y)).r;
  float next = (0.5 * around - state.g) * uDamping;

  vec2 xz = uRect.xy + vUv * uRect.zw;
  vec2 ab = uSegment.zw - uSegment.xy;
  float along = clamp(dot(xz - uSegment.xy, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  vec2 off = xz - (uSegment.xy + ab * along);
  float near = exp(-dot(off, off) / (uSource.y * uSource.y)) * uSource.z;
  next = mix(next, uSource.x, near);

  for (int i = 0; i < ${DROP_SLOTS}; i++) {
    vec2 d = xz - uDrops[i].xy;
    next += uDrops[i].z * exp(-dot(d, d) / (DROP_RADIUS * DROP_RADIUS));
  }

  // The rim of the rectangle absorbs, so rings fade out at its edge instead of bouncing back.
  vec2 rim = min(vUv, 1.0 - vUv) / (uTexel * 12.0);
  float keep = clamp(min(rim.x, rim.y), 0.0, 1.0);
  fragColor = vec4(next * keep, state.r * keep, 0.0, 1.0);
}
`;
