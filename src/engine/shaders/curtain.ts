import { glsl, header } from './common';
import { field } from './field';
import { film } from './film';
import { LAMPS, lamps } from './banner';
import { look } from './terrain';

/**
 * The opening's stage curtain: plum-black satin with the title foil-printed across both drapes.
 * The print texture carries two masks, the foil type in red and the small ink type in green.
 *
 * Satin and ink are lit by the footlights with a little wrap. The foil is a metal under a thin
 * film, so it reflects rather than scatters: it mirrors the glow around it and the lamps'
 * broad highlight, coloured by the film's Newton series. The film's thickness sweeps across
 * the print and the angle it is seen at shifts the whole series, so every fold carries the
 * colours somewhere else, and a band of brighter, warmer foil gathers where the pointer is.
 */
export const curtainFragment = glsl`${header}
${field}
${look}
${film}
${lamps}
uniform sampler2D uPrint;
/** The pointer on the print, in print coordinates, and how engaged it is from zero to one. */
uniform vec3 uPointer;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
out vec4 fragColor;

const vec3 SATIN = vec3(0.034, 0.026, 0.052);
const vec3 INK = vec3(0.6, 0.58, 0.64);
/** Threads per unit of the print, too fine to see except as a shimmer. */
const vec2 WEAVE = vec2(520.0, 320.0);

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  // Each drape's texture coordinate is already its place on the shared print.
  vec2 print = vUv;
  vec2 mask = texture(uPrint, print).rg;
  bool front = gl_FrontFacing;
  // The print is on the face toward the audience, and the back of each drape is plain satin.
  if (!front) mask = vec2(0.0);
  vec3 n = normalize(vNormal) * (front ? 1.0 : -1.0);
  vec3 v = normalize(uCamPos - vWorld);
  float cosI = clamp(dot(n, v), 0.0, 1.0);
  vec2 thread = abs(fract(print * WEAVE) - 0.5);
  float weave = 0.965 + 0.07 * smoothstep(0.1, 0.4, max(thread.x, thread.y));

  vec3 diffuse = uGlow * 0.05 + uBase * 0.03 + 0.008;
  float broad = 0.0;
  float sharp = 0.0;
  for (int i = 0; i < ${LAMPS}; i++) {
    vec3 l;
    vec3 light = lampLight(i, vWorld, l);
    diffuse += light * max((dot(n, l) + 0.12) / 1.12, 0.0);
    float nh = max(dot(n, normalize(l + v)), 0.0);
    broad += pow(nh, 7.0) * luminance(light);
    sharp += pow(nh, 70.0) * luminance(light);
  }
  float grazing = pow(1.0 - cosI, 3.0);
  vec3 satin = SATIN * weave * diffuse + (sharp * 0.1 + grazing * 0.04 * uLamp) * mix(vec3(1.0), uGlow, 0.3);
  vec3 ink = INK * weave * diffuse;

  vec2 off = (print - uPointer.xy) * vec2(2.2, 1.0);
  float near = uPointer.z * exp(-dot(off, off) * 9.0);
  // The foil's colour cycles on its own. The film's thickness swings through a whole stretch
  // of the series every sixteen seconds, in a wave that travels along the lines, and two noise
  // fields flowing in different directions pool and stretch it, so the colours slide through
  // the letters like oil turning on water and never come back the same.
  float t = uTime;
  float cycle = sin(t * 6.2831853 / 16.0 - print.x * 2.4 + print.y * 0.8);
  float sweep = dot(print - 0.5, vec2(1.0, 0.45)) * 1.6;
  float flow =
    0.45 * gnoise(print * vec2(2.4, 1.6) + vec2(t * 0.11, -t * 0.08)) +
    0.25 * gnoise(print * vec2(5.5, 3.9) - vec2(t * 0.17, t * 0.12));
  float opd = uFilm.x + uFilm.y * (sweep + flow) + 280.0 * cycle + 220.0 * near;
  vec3 series = filmColour(opd, cosI);
  series = mix(series, vec3(luminance(series)), 0.15);
  vec3 around = skyColour(reflect(-v, n)) * 1.4 + uGlow * 0.05;
  vec3 foil = series * (around + vec3(broad * 0.55 + sharp * 1.6) + 0.07 * uLamp) * (1.0 + 1.1 * near);

  vec3 colour = mix(mix(satin, ink, mask.g), foil, mask.r);
  fragColor = vec4(mix(colour, fogColour(-v, distance(uCamPos, vWorld)), fogAt(vWorld.xz) * 0.85), 1.0);
}
`;
