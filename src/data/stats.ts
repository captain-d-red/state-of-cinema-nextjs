import type { Film } from './catalogue';

export interface Group {
  /** Every name that shares the top count, so a tie is reported as a tie. */
  readonly names: readonly string[];
  /** How many films each of those names has. */
  readonly each: number;
  /** The films belonging to any of those names, in catalogue order. */
  readonly slugs: readonly string[];
}

export interface CatalogueStats {
  readonly films: number;
  readonly minutes: number;
  /** Total running time rounded down to whole hours, so the figure never overstates. */
  readonly hours: number;
  readonly firstYear: number;
  readonly lastYear: number;
  readonly years: number;
  readonly directors: number;
  readonly topGenre: Group;
  readonly topDirectors: Group;
  readonly longest: Film;
}

/** Counts by key and returns every key tied at the highest count, alphabetically. */
function topGroup(films: readonly Film[], keysOf: (film: Film) => readonly string[]): Group {
  const counts = new Map<string, number>();
  for (const film of films) for (const key of keysOf(film)) counts.set(key, (counts.get(key) ?? 0) + 1);
  const each = Math.max(...counts.values());
  const names = [...counts].filter(([, n]) => n === each).map(([name]) => name);
  names.sort((a, b) => a.localeCompare(b));
  const slugs = films.filter((f) => keysOf(f).some((k) => names.includes(k))).map((f) => f.slug);
  return { names, each, slugs };
}

export function catalogueStats(films: readonly Film[]): CatalogueStats {
  if (films.length === 0) throw new Error('catalogueStats needs at least one film');
  const minutes = films.reduce((sum, f) => sum + f.minutes, 0);
  const years = films.map((f) => f.year);
  return {
    films: films.length,
    minutes,
    hours: Math.floor(minutes / 60),
    firstYear: Math.min(...years),
    lastYear: Math.max(...years),
    years: new Set(years).size,
    directors: new Set(films.map((f) => f.director)).size,
    topGenre: topGroup(films, (f) => f.genres),
    topDirectors: topGroup(films, (f) => [f.director]),
    longest: films.reduce((a, b) => (b.minutes > a.minutes ? b : a)),
  };
}
