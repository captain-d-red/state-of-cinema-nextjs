export interface Film {
  readonly slug: string;
  readonly title: string;
  readonly year: number;
  readonly director: string;
  readonly minutes: number;
  readonly genres: readonly string[];
  readonly logline: string;
  readonly image: { readonly src: string; readonly width: number; readonly height: number };
  /** The poster's most vivid colour and a second one, as sRGB hex. */
  readonly palette: { readonly key: string; readonly accent: string };
  readonly trailer: { readonly id: string; readonly aspect: number } | null;
}

export interface Catalogue {
  readonly films: readonly Film[];
}

function fail(message: string): never {
  throw new Error(`films.json: ${message}`);
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isHex = (value: unknown): boolean => isString(value) && /^#[0-9a-f]{6}$/i.test(value);

function assertFilm(film: unknown, i: number): asserts film is Film {
  if (!isRecord(film) || !isString(film.slug) || !isString(film.title)) fail(`film ${i} has no slug or title`);
  const { slug } = film;
  if (!isNumber(film.year) || !isNumber(film.minutes)) fail(`${slug} has no year or runtime`);
  if (!isString(film.director) || !isString(film.logline)) fail(`${slug} is missing credits`);
  if (!Array.isArray(film.genres) || !film.genres.every(isString)) fail(`${slug} has no genres`);
  const { image, palette, trailer } = film;
  if (!isRecord(image) || !isString(image.src) || !isNumber(image.width) || !isNumber(image.height)) {
    fail(`${slug} has no image`);
  }
  if (!isRecord(palette) || !isHex(palette.key) || !isHex(palette.accent)) fail(`${slug} has no palette`);
  if (trailer !== null && (!isRecord(trailer) || !isString(trailer.id) || !isNumber(trailer.aspect))) {
    fail(`${slug} has a malformed trailer`);
  }
}

/** Validates the catalogue once, where it enters the app, and orders it by release year. */
export function parseCatalogue(data: unknown): Catalogue {
  if (!isRecord(data) || !Array.isArray(data.films) || data.films.length === 0) fail('expected a films array');
  const films: Film[] = [];
  data.films.forEach((film: unknown, i) => {
    assertFilm(film, i);
    films.push(film);
  });
  const slugs = new Set(films.map((f) => f.slug));
  if (slugs.size !== films.length) fail('slugs must be unique');
  // A stable sort keeps the catalogue's own order inside each year.
  films.sort((a, b) => a.year - b.year);
  return { films };
}
