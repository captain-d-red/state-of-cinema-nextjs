import { FILM_INDEX, FILM_LUT } from '@/lib/thinFilm';
import { f, glsl } from './common';

/**
 * The thin-film colour of `lib/thinFilm.ts` for shaders, read from a lookup texture of the
 * same spectral integral, so every surface that carries the sheen shows the same Newton series
 * the station colours are picked from.
 */
export const film = glsl`
uniform sampler2D uFilmLut;
/**
 * The film the light is passing through: its optical path difference in nanometres at normal
 * incidence, how far the thickness wanders across the surface, and how strongly it colours
 * what it reflects, from zero for plain glass or water to one.
 */
uniform vec3 uFilm;

/** Reflected colour of a film whose optical path difference at normal incidence is \`opd\`, seen at \`cosI\`. */
vec3 filmColour(float opd, float cosI) {
  float sinT = sqrt(max(0.0, 1.0 - cosI * cosI)) / ${f(FILM_INDEX)};
  float path = opd * sqrt(1.0 - sinT * sinT);
  // Texel i holds the colour at i / (size − 1) of the reach, so its centre is at (i + ½) / size.
  float i = clamp(path / ${f(FILM_LUT.maxOpd)}, 0.0, 1.0) * ${f(FILM_LUT.size - 1)};
  return texture(uFilmLut, vec2((i + 0.5) / ${f(FILM_LUT.size)}, 0.5)).rgb;
}
`;
