import { glsl, header } from './common';
import { field } from './field';
import { look } from './terrain';

/**
 * A point sprite shaded as a small glossy bead: the sprite coordinate gives a hemisphere
 * normal, lit by a fixed key light from the upper right, with a Blinn highlight on top.
 */
const bead = glsl`
uniform vec3 uDot;

vec4 beadColour(vec2 coord, float alpha) {
  vec2 c = vec2(coord.x - 0.5, 0.5 - coord.y) * 2.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  vec3 n = vec3(c, sqrt(1.0 - r2));
  vec3 l = normalize(vec3(0.4, 0.8, 0.6));
  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
  float shade = 0.48 + 0.44 * max(dot(n, l), 0.0);
  float gloss = 0.34 * pow(max(dot(n, h), 0.0), 11.0);
  float edge = 1.0 - smoothstep(0.55, 1.0, r2);
  return vec4(uDot * shade + gloss, alpha * edge);
}
`;

/**
 * The bright dots strewn over the dunes. They sit on a fixed grid in world space and wrap
 * around the camera along z, so the field never runs out however far the flight goes.
 * Every few seconds a ring sweeps out from the lit patch and swells each dot it passes.
 *
 * For the finale every dot lifts off the ground into a spiral around the flight path. Its
 * angle comes from its own seed and from its fixed grid z, never the wrapped one, so the helix
 * keeps its identity as the camera moves through it.
 *
 *        ·  ·  ·            angle = seed · 2π · 0.75 + z · 0.735 − 0.21 · time
 *     ·     ◉     ·         radius = 2.05 ± a little scatter
 *        ·  ·  ·
 */
export const dotsVertex = glsl`${header}
${field}
${look}
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uWindow;
uniform float uPointScale;
in vec3 position;
in float aSeed;
out float vAlpha;

void main() {
  vec2 jitter = (hash22(position.xz * 1.37 + aSeed) - 0.5) * 0.1;
  vec2 xz = position.xz + jitter;
  float rel = mod(xz.y - uCamPos.z + uWindow * 0.5, uWindow) - uWindow * 0.5;
  xz.y = uCamPos.z + rel;
  vec3 world = vec3(xz.x, terrainHeight(xz) + 0.045, xz.y);
  if (uTunnel > 0.0001) {
    float radius = 2.05 + (fract(aSeed * 41.7) - 0.5) * 0.31;
    float angle = aSeed * 6.2831853 * 0.75 + position.z * 0.735 - uTime * 0.21;
    vec3 helix = vec3(uCamPos.x + cos(angle) * radius, uCamPos.y + sin(angle) * radius, xz.y);
    helix += vec3(sin(uTime * 0.73 + aSeed * 17.0), sin(uTime * 0.97 + aSeed * 31.0), 0.0) * 0.02;
    world = mix(world, helix, uTunnel);
  }
  vec4 view = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * view;

  float period = 2.85;
  float phase = mod(uTime, period) / period;
  float front = (1.0 - pow(1.0 - phase, 3.0)) * period * 1.85;
  float pulse = smoothstep(1.1, 0.0, abs(length(xz - uFocus) - front)) * smoothstep(0.0, 0.04, phase) * (1.0 - smoothstep(0.96, 1.0, phase));
  // Inside the tunnel a band of light runs away from the camera every four seconds.
  float band = smoothstep(4.0, 0.0, abs(xz.y - (uCamPos.z - mod(uTime, 4.0) * 18.0))) * 0.8 * uTunnel;
  float perspective = mix(clamp(8.0 / max(-view.z, 0.5), 0.4, 1.6), 1.0, uTunnel);
  float size = mix(0.44, 1.56, aSeed) * perspective * (1.0 + pulse * 0.85 * (1.0 - uTunnel) + band);
  gl_PointSize = 2.0 * uPointScale * size;

  // The boot sweeps outward from the camera, so the field appears as a wave, not all at once.
  float wave = 1.0 - smoothstep(uIntro * 50.0, uIntro * 50.0 + 4.0, length(xz - uCamPos.xz));
  float ground = (1.0 - fogAt(xz)) * clamp(1.0 + view.z * 0.05, 0.2, 1.0);
  float tunnel = clamp(1.0 + view.z / 60.0, 0.0, 1.0) * (1.0 + band * 0.5);
  vAlpha = mix(ground, tunnel, uTunnel) * wave;
}
`;

export const dotsFragment = glsl`${header}
${bead}
in float vAlpha;
out vec4 fragColor;
void main() {
  fragColor = beadColour(gl_PointCoord, vAlpha);
}
`;

/**
 * Motes rising off the dunes. Each one loops through a life of a dozen seconds, drifting
 * sideways as it climbs and fading in and out on a half sine so it never pops.
 */
export const dustVertex = glsl`${header}
${field}
${look}
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uWindow;
uniform float uPointScale;
in vec3 position;
in vec2 aSeed;
out float vAlpha;

void main() {
  float age = fract(uTime * 0.08 + aSeed.y);
  vec2 xz = position.xz + vec2(sin(uTime * 0.7 + aSeed.x * 31.7), cos(uTime * 0.5 + aSeed.x * 17.3)) * 0.085;
  float rel = mod(xz.y - uCamPos.z + uWindow * 0.5, uWindow) - uWindow * 0.5;
  xz.y = uCamPos.z + rel;
  vec3 world = vec3(xz.x, terrainHeight(xz) + age * 1.15, xz.y);
  // In the tunnel the motes stop rising and stream away down the flight path instead.
  float flow = age * 22.0 * uTunnel;
  float rel2 = mod(world.z - flow - uCamPos.z + uWindow * 0.5, uWindow) - uWindow * 0.5;
  world = mix(world, vec3(world.x, uCamPos.y + (fract(aSeed.x * 13.71) - 0.5) * 8.0, uCamPos.z + rel2), uTunnel);
  vec4 view = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = 3.0 * uPointScale * mix(0.2, 2.0, fract(aSeed.x * 7.1)) * clamp(8.0 / max(-view.z, 0.5), 0.4, 1.6);
  float wave = 1.0 - smoothstep(uIntro * 50.0, uIntro * 50.0 + 4.0, length(xz - uCamPos.xz));
  vAlpha = sin(age * 3.14159) * 0.52 * mix(1.0 - fogAt(xz), 1.0, uTunnel) * wave;
}
`;

export const dustFragment = glsl`${header}
uniform vec3 uDot;
in float vAlpha;
out vec4 fragColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  fragColor = vec4(uDot, (1.0 - smoothstep(0.35, 0.5, d)) * vAlpha);
}
`;
