import { glsl, header } from './common';
import { field } from './field';
import { look } from './terrain';

/** Two uplights stand in the water before each banner. */
export const LAMPS = 2;

/** Light from the two uplights, shared by the cloth and the steel. */
const lamps = glsl`
uniform vec3 uLampPos[${LAMPS}];
uniform vec3 uLampDir[${LAMPS}];
/** How bright the lamps are, zero while they are off, one at full power. */
uniform float uLamp;

/** Tungsten at about 3200 kelvin, in linear light. */
const vec3 TUNGSTEN = vec3(1.0, 0.78, 0.56);

/**
 * Light arriving at a point from one lamp: a spot with a soft-edged cone, falling off with the
 * square of the distance. \`l\` is set to the unit direction toward the lamp.
 */
vec3 lampLight(int i, vec3 p, out vec3 l) {
  vec3 to = uLampPos[i] - p;
  float d2 = dot(to, to);
  l = to * inversesqrt(d2);
  float cone = smoothstep(0.62, 0.9, dot(-l, uLampDir[i]));
  return TUNGSTEN * cone * uLamp * 3.2 / (1.0 + d2);
}
`;

/**
 * A poster printed on satin and hung under two lamps. The print's colour is lit by the lamps
 * with a little wrap, the way light creeps around a soft fold; the weave scatters a sheen that
 * brightens at grazing angles; the night and the station's light fill in from around it; and
 * the light on the horizon behind glows through the thin cloth where it faces away.
 */
export const clothFragment = glsl`${header}
${field}
${look}
${lamps}
uniform sampler2D uPoster;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
out vec4 fragColor;

/** Threads per unit of the print's width and height, a weave too fine to see except as a shimmer. */
const vec2 WEAVE = vec2(260.0, 390.0);

void main() {
  bool front = gl_FrontFacing;
  vec3 n = normalize(vNormal) * (front ? 1.0 : -1.0);
  vec3 v = normalize(uCamPos - vWorld);
  vec3 print = texture(uPoster, vUv).rgb;
  // Seen from behind, the print shows through the cloth, dimmer and duller.
  vec3 albedo = front ? print : mix(print, vec3(dot(print, vec3(0.2126, 0.7152, 0.0722))), 0.6) * 0.35;
  vec2 thread = abs(fract(vUv * WEAVE) - 0.5);
  float weave = 0.965 + 0.07 * smoothstep(0.1, 0.4, max(thread.x, thread.y));
  albedo *= weave;

  vec3 lit = albedo * (uGlow * 0.05 + uBase * 0.04 + 0.012);
  float sheen = 0.0;
  for (int i = 0; i < ${LAMPS}; i++) {
    vec3 l;
    vec3 light = lampLight(i, vWorld, l);
    float wrap = max((dot(n, l) + 0.3) / 1.3, 0.0);
    lit += albedo * light * wrap;
    vec3 h = normalize(l + v);
    sheen += pow(max(dot(n, h), 0.0), 24.0) * 0.12 * dot(light, vec3(0.333));
  }
  // Satin's sheen rises toward grazing angles, where the threads line up with the eye.
  float grazing = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  lit += (sheen + grazing * 0.05 * uLamp) * mix(vec3(1.0), uGlow, 0.3);
  float through = max(dot(-n, LIGHT), 0.0);
  lit += print * uGlow * through * 0.12;

  float fog = fogAt(vWorld.xz);
  fragColor = vec4(mix(lit, fogColour(-v, distance(uCamPos, vWorld)), fog * 0.85), 1.0);
}
`;

/** Satin-black anodised steel for the frame, the clips and the rod. */
export const steelFragment = glsl`${header}
${field}
${look}
${lamps}
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uCamPos - vWorld);
  vec3 r = reflect(-v, n);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 lit = skyColour(r) * (0.25 + fresnel) * 0.6 + vec3(0.006);
  for (int i = 0; i < ${LAMPS}; i++) {
    vec3 l;
    vec3 light = lampLight(i, vWorld, l);
    lit += light * (max(dot(n, l), 0.0) * 0.03 + pow(max(dot(r, l), 0.0), 60.0) * 0.9);
  }
  lit += mix(uGlow, vec3(1.0), 0.5) * pow(max(dot(r, LIGHT), 0.0), 40.0) * 0.4;
  fragColor = vec4(mix(lit, fogColour(-v, distance(uCamPos, vWorld)), fogAt(vWorld.xz) * 0.85), 1.0);
}
`;

/** The glowing front of a lamp, bright enough to bloom. */
export const lensFragment = glsl`${header}
uniform float uLamp;
out vec4 fragColor;
void main() {
  fragColor = vec4(vec3(1.0, 0.78, 0.56) * (0.04 + 7.0 * uLamp), 1.0);
}
`;

/**
 * The beam a lamp throws through the haze. A cone drawn additively, brightest along its axis
 * and near the lamp, and fading at its silhouette, where the eye looks through the least air.
 */
export const beamVertex = glsl`${header}
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec3 normal;
in vec2 uv;
out vec3 vWorld;
out vec3 vNormal;
out float vAlong;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vAlong = uv.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const beamFragment = glsl`${header}
uniform vec3 uCamPos;
uniform float uLamp;
in vec3 vWorld;
in vec3 vNormal;
in float vAlong;
out vec4 fragColor;
void main() {
  vec3 v = normalize(uCamPos - vWorld);
  float edge = pow(abs(dot(normalize(vNormal), v)), 1.6);
  float fade = smoothstep(0.0, 0.9, vAlong) * smoothstep(1.0, 0.85, vAlong);
  fragColor = vec4(vec3(1.0, 0.78, 0.56) * edge * fade * 0.035 * uLamp, 1.0);
}
`;
