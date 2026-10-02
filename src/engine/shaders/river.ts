import { RIVER } from '../world';
import { WAKE } from '../Wake';
import { f, glsl, header } from './common';
import { field } from './field';
import { film } from './film';
import { haze, look } from './terrain';

export const riverVertex = glsl`${header}
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTunnel;
in vec3 position;
out vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position.x, ${f(RIVER.level)}, position.z, 1.0);
  // The water drains away with the ground as the tunnel forms.
  world.y -= uTunnel * uTunnel * 8.0;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The river: a glowing emulsion under a thin film of oil, the way the sheen of a lens coating
 * sits on dark glass. Two things reach the eye from each point.
 *
 *   light from inside the water, the station's colour     (1 − F) · body · film tint
 *   the world above, reflected in the surface              F · mirror · film colour
 *
 * F is Schlick's Fresnel term, so the river is a dark glowing pool underfoot and a mirror
 * toward the horizon. The film's thickness drifts in slow pools, and the wake stretches and
 * thins it, so every ring the pointer sends out is drawn in the film's own Newton colours.
 * The wake's slopes bend the reflection and break the light ahead into a glitter path.
 */
export const riverFragment = glsl`${header}
${field}
${look}
${haze}
${film}
uniform sampler2D uMirror;
uniform mat4 uMirrorMatrix;
uniform sampler2D uWake;
uniform vec4 uWakeRect;
uniform vec2 uWakeTexel;
/** How far the present lies between the wake's last two steps. */
uniform float uWakeBlend;
in vec3 vWorld;
out vec4 fragColor;

/** Reflectance looking straight down. The oil raises the water's two percent to about four, as glass has. */
const float F0 = 0.04;
/** World units between neighbouring wake texels, for turning height differences into slopes. */
const float WAKE_STEP = ${f(1 / WAKE.texelsPerUnit)};
/** Optical path difference the film gains per unit of wake height, so a centimetre swell shifts it a whole order. */
const float WAKE_OPD = 42000.0;

/** The wake's height between its last two steps, so a slow simulation still moves smoothly. */
float wakeAt(vec2 uv) {
  vec2 h = texture(uWake, uv).rg;
  return mix(h.g, h.r, uWakeBlend);
}

vec2 wakeSlope(vec2 uv, out float height) {
  height = wakeAt(uv);
  float hx = wakeAt(uv + vec2(uWakeTexel.x, 0.0)) - wakeAt(uv - vec2(uWakeTexel.x, 0.0));
  float hz = wakeAt(uv + vec2(0.0, uWakeTexel.y)) - wakeAt(uv - vec2(0.0, uWakeTexel.y));
  return vec2(hx, hz) / (2.0 * WAKE_STEP);
}

void main() {
  vec3 toEye = uCamPos - vWorld;
  vec3 v = normalize(toEye);
  float fog = fogAt(vWorld.xz);

  float height;
  vec2 slope = wakeSlope((vWorld.xz - uWakeRect.xy) / uWakeRect.zw, height);
  // Capillary ripples from the gradient of a slow drifting noise, so still water still lives.
  vec2 c = vWorld.xz * 5.3 + vec2(uTime * 0.21, -uTime * 0.17);
  float c0 = gnoise(c);
  slope += vec2(gnoise(c + vec2(0.35, 0.0)) - c0, gnoise(c + vec2(0.0, 0.35)) - c0) * 0.05;
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));

  float cosI = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosI, 5.0);

  float pools = gnoise(vWorld.xz * 0.31 + vec2(uTime * 0.035, -uTime * 0.02)) * 0.7 + gnoise(vWorld.xz * 0.9 - uTime * 0.05) * 0.3;
  float opd = uFilm.x + uFilm.y * pools + height * WAKE_OPD;
  vec3 sheen = mix(vec3(1.0), filmColour(opd, cosI), uFilm.z);

  vec4 projected = uMirrorMatrix * vec4(vWorld, 1.0);
  vec2 mirrorUv = projected.xy / projected.w + n.xz * 0.045;
  vec3 mirrored = texture(uMirror, mirrorUv).rgb;

  // Under the surface the station's light gathers in slow pools, the filaments seen through the
  // water, shifted by the slope as refraction would shift them.
  float pool = ridgeAt(vWorld.xz * 0.93 + n.xz * 0.6 + vec2(3.1, -1.7));
  vec3 body = uBase * (0.05 + 0.4 * pool) * smoothstep(0.0, 0.6, uIntro) * mix(vec3(1.0), sheen, 0.5);
  vec3 lit = body * (1.0 - fresnel);
  // The film reflects a faint overcast of the station's light as well as the mirror, so its
  // colours show underfoot where the mirror only sees the dark sky overhead.
  vec3 overcast = uGlow * 0.07 * smoothstep(0.3, 1.0, uIntro);
  float filmReflect = mix(fresnel, max(fresnel, 0.22), uFilm.z);
  lit += overcast * sheen * filmReflect;

  // The light ahead, glittering off every ripple that tilts toward it. The film only half
  // colours the glints, so the path stays a light on the water rather than a neon line.
  vec3 h = normalize(LIGHT + v);
  float glint = pow(max(dot(n, h), 0.0), 700.0) * 1.6 + pow(max(dot(n, h), 0.0), 60.0) * 0.025;
  lit += mix(uGlow, vec3(1.0), 0.6) * mix(vec3(1.0), sheen, 0.5) * min(glint, 2.5) * smoothstep(0.5, 1.0, uIntro);
  // The haze over open water is thinner than over the sand, so the mirror stays clear.
  lit += hazeTo(vWorld, 1.0 - fog) * 0.5;
  lit = mix(lit, mix(fogColour(-v, length(toEye)), uBackground, uTunnel), max(fog, uTunnel));

  // The reflection reaches past the lit patch, because the far river still mirrors the glow on the horizon.
  lit += mirrored * sheen * min(filmReflect * 1.6, 1.0) * (1.0 - 0.5 * fog) * (1.0 - uTunnel);
  fragColor = vec4(lit, 1.0);
}
`;
