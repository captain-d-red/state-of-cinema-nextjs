import { TERRAIN } from '../world';
import { f, glsl, header } from './common';
import { field } from './field';

/**
 * Colours of the valley, already in linear light. The engine blends them between stations,
 * so the world drifts toward the poster colour of the film each station is about.
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

/** Share of the night at a ground point, zero in the lit patch and one past its rim. */
float fogAt(vec2 xz) {
  return smoothstep(1.4, 6.6, length(xz - uFocus));
}
`;

/**
 * Bright filaments where two drifting noise fields both cross zero, the look of light
 * refracted through moving air. Baked once a frame into a texture the terrain and its haze
 * read many times over.
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

export const terrainVertex = glsl`${header}
${field}
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
  vWorld = world.xyz;
  vRelief = world.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The ground. Dune hollows glow with the base colour and crests fall to near black, a
 * backlight grazes the slopes, light filaments play across the floor, and a short march
 * from the eye gathers the same filaments as haze hanging in the air above them.
 *
 *   eye ●───·───·───·───·───·───● ground       each · samples the filaments at its own
 *            haze ∝ ridge³ · e^(−1.06·y)        height, so the air glows most near the floor
 */
export const terrainFragment = glsl`${header}
${field}
${look}
uniform sampler2D uRidges;
uniform vec3 uRidgeRect;
in vec3 vWorld;
in float vRelief;
out vec4 fragColor;

const vec3 CREST = vec3(0.0036, 0.0045, 0.0065);
/** Backlight from just behind the flight path and seventeen degrees up. */
const vec3 LIGHT = normalize(vec3(-0.017, 0.292, -0.956));
const int HAZE_STEPS = 18;
const float HAZE_REACH = 11.0;

float ridgeAt(vec2 xz) {
  vec2 uv = (xz - uRidgeRect.xy) / uRidgeRect.z;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return texture(uRidges, uv).r * inside;
}

void main() {
  float fog = fogAt(vWorld.xz);
  // Height includes the valley walls, so the walls climb into the crest colour and frame the glow.
  float crest = smoothstep(-1.0, 1.0, vRelief / ${f(TERRAIN.relief)});
  // The intro starts every point at the crest colour, so the floor lights up out of the dark.
  vec3 colour = mix(uBase, CREST, mix(1.0, crest, smoothstep(0.0, 0.7, uIntro)));

  vec3 n = normalize(cross(dFdy(vWorld), dFdx(vWorld)));
  n *= sign(n.y);
  n.xz *= 0.23;
  // Fine grain on the slopes from the gradient of a high-frequency noise.
  vec2 g = vWorld.xz * 77.7;
  float g0 = gnoise(g);
  n.xz -= vec2(gnoise(g + vec2(0.6, 0.0)) - g0, gnoise(g + vec2(0.0, 0.6)) - g0) / 0.6 * 0.32;
  n = normalize(n);

  float lambert = max(dot(n, LIGHT), 0.0);
  vec3 lit = colour * (0.45 + 0.55 * lambert * uGlow);
  float ridge = ridgeAt(vWorld.xz);
  lit += uGlow * ridge * 0.14 * smoothstep(0.3, 0.85, uIntro);

  float focus = 1.0 - fog;
  if (focus > 0.01) {
    vec3 toGround = vWorld - uCamPos;
    float len = length(toGround);
    vec3 dir = toGround / len;
    float reach = min(len, HAZE_REACH);
    float stride = reach / float(HAZE_STEPS);
    // A per-pixel offset turns the banding of a short march into fine noise.
    float t = hash12(gl_FragCoord.xy) * stride;
    float haze = 0.0;
    for (int i = 0; i < HAZE_STEPS; i++) {
      vec3 p = uCamPos + dir * t;
      if (p.y > 0.0) {
        float near = 1.0 - smoothstep(1.4 * 0.6, 6.6, length(p.xz - uFocus));
        haze += pow(ridgeAt(p.xz), 3.3) * exp(-p.y * 1.06) * near;
      }
      t += stride;
    }
    lit += haze * uGlow * 0.71 * stride * pow(focus, 1.6) * smoothstep(0.45, 1.0, uIntro);
  }

  fragColor = vec4(mix(lit, uBackground, max(fog, uTunnel)), 1.0);
}
`;
