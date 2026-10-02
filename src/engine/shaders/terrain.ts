import { MAX_HAZE_STEPS } from '../quality';
import { TERRAIN } from '../world';
import { f, glsl, header } from './common';
import { field } from './field';
import { film } from './film';

/**
 * Colours and light of the valley, already in linear light. The engine blends them between
 * stations, so the world drifts toward the colour of each station.
 */
export const look = glsl`
/** The glowing floor of the valley, the brightest the ground gets. */
uniform vec3 uBase;
/** Light that grazes the dunes and lights the haze, a lifted version of the base. */
uniform vec3 uGlow;
/** The night everything fades into. */
uniform vec3 uBackground;
/** Centre of the lit patch on the ground, a little ahead of the camera. */
uniform vec2 uFocus;
uniform vec3 uCamPos;
/** Zero over the dunes, one once the flight has become a tunnel and the ground has gone. */
uniform float uTunnel;

/** Backlight from low on the horizon ahead, seventeen degrees up, the light the river glitters toward. */
const vec3 LIGHT = normalize(vec3(-0.017, 0.292, -0.956));

/** Share of the night at a ground point, zero in the lit patch and one past its rim. */
float fogAt(vec2 xz) {
  return smoothstep(1.4, 6.6, length(xz - uFocus));
}

/**
 * The night sky along a direction. It is dark overhead and glows with the station's light low
 * on the horizon, most of all straight ahead down the river, and the glow goes out once the
 * flight has become a tunnel.
 */
vec3 skyColour(vec3 dir) {
  float above = max(dir.y, 0.0);
  float ahead = max(-dir.z, 0.0);
  float glow = exp(-above * 7.0) * (0.18 + 0.82 * ahead * ahead) * (1.0 - uTunnel);
  return uBackground + uGlow * glow * 0.22;
}

/**
 * What the far ground fades into. Near the lit patch it is the night, so the banks stand dark
 * against the glow, and past that the air between grows thick enough to take on the sky's own
 * colour, so the farthest ridges dissolve into the horizon instead of cutting it.
 */
vec3 fogColour(vec3 dir, float distance) {
  float air = smoothstep(9.0, 34.0, distance);
  return mix(uBackground, skyColour(dir), 0.12 + 0.6 * air);
}

/** Screen blend, which brightens toward white without washing a colour out the way adding does. */
vec3 screen(vec3 base, vec3 light) {
  return 1.0 - (1.0 - clamp(base, 0.0, 1.0)) * (1.0 - clamp(light, 0.0, 1.0));
}
`;

/**
 * Bright filaments where two drifting noise fields both cross zero, the look of light
 * refracted through moving air. Baked once a frame into a texture the ground, the water and
 * their haze read many times over.
 */
export const ridgeFragment = glsl`${header}
${field}
/** World rectangle the texture covers, as minimum x, minimum z and side length. */
uniform vec3 uRect;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 xz = uRect.xy + vUv * uRect.z;
  float t = uTime * 0.26;
  vec2 p = xz * 0.72;
  float a = gnoise(p + vec2(t * 0.6, t * 0.4));
  float b = gnoise(p * 1.37 - vec2(t * 0.3, -t * 0.5));
  float ridge = pow(clamp((1.0 - abs(a)) * (1.0 - abs(b)), 0.0, 1.0), 2.1);
  fragColor = vec4(ridge, 0.0, 0.0, 1.0);
}
`;

/**
 * Haze hanging in the air over the lit patch, gathered by a short march from the eye toward a
 * surface point. Each step samples the filaments at its own height, so the air glows most
 * near the ground and the water.
 *
 *   eye ●───·───·───·───·───·───● surface      haze ∝ Σ ridge³ · e^(−1.06·y)
 */
export const haze = glsl`
uniform sampler2D uRidges;
uniform vec3 uRidgeRect;

/** Steps of the march for this pass, fewer on phones and in the reflection, within the loop's bound. */
uniform int uHazeSteps;
const float HAZE_REACH = 11.0;

float ridgeAt(vec2 xz) {
  vec2 uv = (xz - uRidgeRect.xy) / uRidgeRect.z;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return texture(uRidges, uv).r * inside;
}

vec3 hazeTo(vec3 world, float focus) {
  if (focus <= 0.01) return vec3(0.0);
  vec3 toSurface = world - uCamPos;
  float len = length(toSurface);
  vec3 dir = toSurface / len;
  float reach = min(len, HAZE_REACH);
  float stride = reach / float(uHazeSteps);
  // A per-pixel offset turns the banding of a short march into fine noise.
  float t = hash12(gl_FragCoord.xy) * stride;
  float sum = 0.0;
  for (int i = 0; i < ${MAX_HAZE_STEPS}; i++) {
    if (i >= uHazeSteps) break;
    vec3 p = uCamPos + dir * t;
    if (p.y > 0.0) {
      float near = 1.0 - smoothstep(1.4 * 0.6, 6.6, length(p.xz - uFocus));
      sum += pow(ridgeAt(p.xz), 3.3) * exp(-p.y * 1.06) * near;
    }
    t += stride;
  }
  return sum * uGlow * 0.71 * stride * pow(focus, 1.6) * smoothstep(0.45, 1.0, uIntro);
}
`;

export const terrainVertex = glsl`${header}
${field}
${look}
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
out vec3 vWorld;
out float vRelief;
void main() {
  vec4 world = modelMatrix * vec4(position.x, 0.0, position.z, 1.0);
  // Noise is sampled at world coordinates, so the patch can follow the camera without the
  // ground sliding along with it.
  world.y = terrainHeight(world.xz);
  vRelief = world.y;
  // As the tunnel forms the ground falls away beneath it, so it no longer hides the lower helix.
  world.y -= uTunnel * uTunnel * 8.0;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The banks. Dune hollows glow with the base colour and crests fall to near black, the
 * backlight grazes the slopes, light filaments play across the sand, and grains of mica
 * glitter where they happen to face the light, the more so under the pointer.
 *
 * Over all of it lies the same coating as the water: a film whose thickness drifts across
 * the dunes and climbs with their height, so its Newton colours run up the hillsides in soft
 * bands and slide as the eye moves, the way a coated lens shifts colour as it turns.
 */
export const terrainFragment = glsl`${header}
${field}
${look}
${haze}
${film}
in vec3 vWorld;
in float vRelief;
out vec4 fragColor;

const vec3 CREST = vec3(0.0036, 0.0045, 0.0065);
/** Mica grains per world unit along each axis, and the share of them that are reflective. */
const float GRAIN = 90.0;
const float MICA = 0.22;

/**
 * One grain of mica per cell, a tiny mirror tilted at random. It flashes when the light ahead
 * reflects off it into the eye. Grains fade as they shrink below a pixel, so the far bank
 * shimmers instead of crawling.
 */
float glitter(vec3 world, vec3 n, vec3 v, float torch) {
  vec2 p = world.xz * GRAIN;
  vec2 cell = floor(p);
  vec2 jitter = hash22(cell) - 0.5;
  float present = step(1.0 - MICA * (1.0 + 2.0 * torch), hash12(cell + 17.0));
  // Grains lie at all angles, so some face the eye looking down at the shore as well as the far slopes.
  vec3 tilt = normalize(n + vec3(jitter.x, 0.0, jitter.y) * 2.4);
  float flash = pow(max(dot(reflect(-v, tilt), LIGHT), 0.0), 30.0);
  float speck = 1.0 - smoothstep(0.12, 0.34, length(fract(p) - 0.5 - jitter * 0.3));
  float resolved = 1.0 - smoothstep(0.35, 0.9, max(fwidth(p.x), fwidth(p.y)));
  return flash * present * speck * resolved;
}

void main() {
  float fog = fogAt(vWorld.xz);
  vec3 toEye = uCamPos - vWorld;
  vec3 v = normalize(toEye);
  // Height includes the valley walls, so the walls climb into the crest colour and frame the glow.
  float crest = smoothstep(-1.0, 1.0, vRelief / ${f(TERRAIN.relief)});
  // The intro starts every point at the crest colour, so the floor lights up out of the dark.
  vec3 colour = mix(uBase, CREST, mix(1.0, crest, smoothstep(0.0, 0.7, uIntro)));

  vec3 n = normalize(cross(dFdy(vWorld), dFdx(vWorld)));
  n *= sign(n.y);
  vec3 surface = n;
  n.xz *= 0.23;
  // Fine grain on the slopes from the gradient of a high-frequency noise.
  vec2 g = vWorld.xz * 77.7;
  float g0 = gnoise(g);
  n.xz -= vec2(gnoise(g + vec2(0.6, 0.0)) - g0, gnoise(g + vec2(0.0, 0.6)) - g0) / 0.6 * 0.32;
  n = normalize(n);

  // The coating's thickness drifts in slow pools and climbs with the height of the dunes, so
  // a hillside wears a run of the series from its foot to its crest. A station that holds one
  // band has almost no spread, so its banks keep to that one colour.
  float drift = gnoise(vWorld.xz * 0.16 + vec2(uTime * 0.02, -uTime * 0.015)) * 0.65 + gnoise(vWorld.xz * 0.5 - uTime * 0.03) * 0.35;
  float opd = uFilm.x + uFilm.y * (drift + vRelief * 1.15);
  vec3 series = filmColour(opd, clamp(dot(surface, v), 0.0, 1.0));
  // Drawn a fifth of the way toward its own grey, the series reads as the pastel of coated glass.
  series = mix(series, vec3(dot(series, vec3(0.2126, 0.7152, 0.0722))), 0.2) + 0.06;
  vec3 coat = mix(vec3(1.0), series, uFilm.z * 0.85);

  float lambert = max(dot(n, LIGHT), 0.0);
  vec3 lit = colour * (0.45 + 0.55 * lambert * uGlow) * coat;
  lit += uGlow * coat * ridgeAt(vWorld.xz) * 0.14 * smoothstep(0.3, 0.85, uIntro);
  // Slopes that face the glow on the horizon mirror it faintly through the coating.
  float sheen = pow(1.0 - clamp(dot(surface, v), 0.0, 1.0), 3.0);
  lit += coat * skyColour(reflect(-v, surface)) * sheen * 0.6 * uFilm.z;

  vec2 off = vWorld.xz - uHover.xy;
  float torch = exp(-dot(off, off) / 0.35) * uHover.z;
  float near = 1.0 - smoothstep(2.5, 9.0, length(toEye));
  float spark = glitter(vWorld, surface, v, torch) * near * smoothstep(0.6, 1.0, uIntro);
  lit += mix(uGlow, vec3(1.0), 0.55) * mix(vec3(1.0), coat, 0.6) * spark * (2.0 + 4.0 * torch);
  lit += uGlow * coat * torch * 0.05;

  lit += hazeTo(vWorld, 1.0 - fog) * coat;
  fragColor = vec4(mix(lit, mix(fogColour(-v, length(toEye)), uBackground, uTunnel), max(fog, uTunnel)), 1.0);
}
`;
