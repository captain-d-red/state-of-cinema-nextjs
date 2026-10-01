import { glsl, header } from './common';
import { field } from './field';
import { look } from './terrain';

/**
 * A figure drawn in particles that rise out of the dunes, hold the shape of the number while
 * the camera is near, and sink back into the ground as it leaves.
 *
 *   scattered under the ground ──ease out, staggered──► formed into the glyph
 *        y = ground − depth                                y = station height
 *
 * The pointer pushes particles aside in screen space: outward on a bell that peaks one radius
 * from the cursor, with a little swirl, so the figure parts like grain rather than a crater.
 */
export const numbersVertex = glsl`${header}
${field}
${look}
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uCentre;
uniform float uForm;
uniform float uVisible;
uniform float uPointScale;
/** Pointer in normalised device coordinates, and how present it is. */
uniform vec3 uCursor;
in vec3 position;
in vec3 aColour;
in float aSeed;
out vec3 vColour;
out float vAlpha;
out float vLift;

const float STAGGER = 0.35;
const float SCATTER = 20.0;

void main() {
  vec3 formed = uCentre + vec3(position.xy, 0.0) + (vec3(fract(aSeed * 41.7), fract(aSeed * 79.3), fract(aSeed * 17.1)) - 0.5) * 0.019;
  vec2 spread = (vec2(fract(aSeed * 11.3), fract(aSeed * 71.1)) - 0.5) * 2.0 * SCATTER;
  vec2 groundXz = uCentre.xz + spread;
  vec3 scattered = vec3(groundXz.x, terrainHeight(groundXz) - 4.3 - fract(aSeed * 31.9) * 0.6, groundXz.y);

  float own = clamp((uForm - fract(aSeed * 53.7) * STAGGER) / (1.0 - STAGGER), 0.0, 1.0);
  own = 1.0 - pow(1.0 - own, 4.0);
  float k = smoothstep(0.0, 1.0, own);
  vec3 world = mix(scattered, formed, k);
  world += vec3(sin(uTime * 1.7 + aSeed * 13.0), cos(uTime * 1.3 + aSeed * 7.0), sin(uTime * 2.1 + aSeed * 23.0)) * 0.026 * own;

  vec4 view = viewMatrix * vec4(world, 1.0);
  vec4 clip = projectionMatrix * view;
  vec2 ndc = clip.xy / max(clip.w, 1e-4);
  vec2 away = ndc - uCursor.xy;
  float d = length(away);
  const float RADIUS = 0.09;
  float fall = exp(-d * d / (RADIUS * RADIUS)) * uCursor.z;
  float bell = (d / RADIUS) * exp(1.0 - (d / RADIUS) * (d / RADIUS));
  vec2 dir = away / max(d, 1e-4);
  clip.xy += (dir + vec2(-dir.y, dir.x) * 0.35) * bell * 0.025 * uCursor.z * clip.w;
  gl_Position = clip;

  gl_PointSize = 1.7 * uPointScale * clamp(8.0 / max(-view.z, 0.5), 0.4, 1.6) * (1.0 + fall * 1.8);
  vColour = aColour;
  vAlpha = smoothstep(0.35, 1.0, own) * uVisible;
  vLift = fall;
}
`;

export const numbersFragment = glsl`${header}
in vec3 vColour;
in float vAlpha;
in float vLift;
out vec4 fragColor;
void main() {
  vec2 c = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * 2.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  vec3 n = vec3(c, sqrt(1.0 - r2));
  vec3 l = normalize(vec3(0.4, 0.8, 0.6));
  float shade = 0.45 + 0.7 * max(dot(n, l), 0.0);
  float gloss = 0.4 * pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 16.0);
  // A particle under the pointer brightens toward white, the way grain catches a lamp.
  vec3 colour = mix(vColour * shade + gloss, vec3(1.0), clamp(vLift * 1.4, 0.0, 1.0));
  fragColor = vec4(colour, vAlpha * (1.0 - smoothstep(0.55, 1.0, r2)));
}
`;
