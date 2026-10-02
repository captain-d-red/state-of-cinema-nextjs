import { glsl, hash, header } from './common';
import { look } from './terrain';

/** A dome that travels with the eye, so the sky has no edge however far the flight goes. */
export const skyVertex = glsl`${header}
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uCamPos;
in vec3 position;
out vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(uCamPos + position, 1.0);
}
`;

/**
 * The sky's colour with stars in it. Directions are binned on a grid over longitude and
 * latitude, about one star in thirty cells is lit, and each twinkles on its own slow beat.
 */
export const skyFragment = glsl`${header}
${hash}
${look}
uniform float uTime;
in vec3 vDir;
out vec4 fragColor;

const vec2 STAR_CELLS = vec2(520.0, 180.0);

void main() {
  vec3 dir = normalize(vDir);
  vec2 sphere = vec2(atan(dir.x, -dir.z) / 6.2831853 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265 + 0.5);
  vec2 p = sphere * STAR_CELLS;
  vec2 cell = floor(p);
  float lit = step(0.967, hash12(cell));
  vec2 at = fract(p) - 0.5 - (hash22(cell) - 0.5) * 0.6;
  float star = lit * (1.0 - smoothstep(0.0, 0.22, length(at * vec2(1.0, STAR_CELLS.y / STAR_CELLS.x * 2.9))));
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + hash12(cell + 5.0) * 1.8) + hash12(cell + 9.0) * 6.2831853);
  float high = smoothstep(0.02, 0.3, dir.y);
  vec3 colour = skyColour(dir) + mix(uGlow, vec3(1.0), 0.75) * star * twinkle * high * 0.35 * (1.0 - uTunnel);
  fragColor = vec4(colour, 1.0);
}
`;
