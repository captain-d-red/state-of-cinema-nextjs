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
 * Every particle is a tiny print of one of the films the figure counts.
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
in float aPoster;
in float aSeed;
out float vPoster;
out float vAlpha;

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

  // Prints under the pointer zoom up to twice their size, like frames pulled toward a loupe.
  gl_PointSize = 9.0 * uPointScale * clamp(8.0 / max(-view.z, 0.5), 0.4, 1.6) * (1.0 + fall);
  vPoster = aPoster;
  vAlpha = smoothstep(0.35, 1.0, own) * uVisible;
}
`;

/**
 * A tiny print of one poster. The point sprite is square and the poster two by three, so the
 * print fills the middle two thirds across and the full height, with a hairline of the
 * valley's light around it.
 */
export const numbersFragment = glsl`${header}
uniform sampler2D uAtlas;
uniform vec2 uAtlasCells;
uniform vec3 uGlow;
in float vPoster;
in float vAlpha;
out vec4 fragColor;

void main() {
  vec2 p = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);
  float x = (p.x - 1.0 / 6.0) * 1.5;
  if (x < 0.0 || x > 1.0) discard;
  vec2 cell = vec2(mod(vPoster, uAtlasCells.x), floor(vPoster / uAtlasCells.x));
  vec2 uv = (cell + vec2(x, 1.0 - p.y)) / uAtlasCells;
  vec3 poster = texture(uAtlas, vec2(uv.x, 1.0 - uv.y)).rgb;
  float edge = min(min(x, 1.0 - x), min(p.y, 1.0 - p.y));
  vec3 colour = mix(poster * 1.15, uGlow, (1.0 - smoothstep(0.0, 0.08, edge)) * 0.6);
  fragColor = vec4(colour, vAlpha);
}
`;
