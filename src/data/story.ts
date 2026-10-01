import type { Catalogue, Film } from './catalogue';
import { TOP_PICKS } from './picks';
import { catalogueStats } from './stats';

/**
 * One stop on the flight. Every station carries the colour the valley takes on around it,
 * taken from the poster of a film the station is about, so the world shifts with the story.
 */
export type Station =
  | { readonly kind: 'title'; readonly tint: string }
  | {
      readonly kind: 'stat';
      readonly tint: string;
      readonly value: number;
      readonly label: string;
      readonly detail: string;
      /** The films the figure counts, whose poster colours its particles carry. */
      readonly films: readonly string[];
    }
  | { readonly kind: 'pick'; readonly tint: string; readonly rank: number; readonly film: Film }
  | { readonly kind: 'outro'; readonly tint: string };

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const spell = (n: number): string => NUMBER_WORDS[n] ?? String(n);

function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The night teal the flight opens and closes in, Dune's key colour at a low light. */
const OPENING_TINT = '#2f9a98';

/** The whole flight, in order. Every figure is computed from the catalogue it is given. */
export function buildStory({ films }: Catalogue): readonly Station[] {
  const stats = catalogueStats(films);
  const { topGenre, topDirectors } = stats;
  const find = (slug: string): Film => {
    const film = films.find((f) => f.slug === slug);
    if (!film) throw new Error(`${slug} is not in the catalogue`);
    return film;
  };
  const firstOf = (slugs: readonly string[]): Film => find(slugs[0] ?? films[0]!.slug);
  const many = topDirectors.names.length > 1;

  const picks = TOP_PICKS.map((slug, i) => {
    const film = find(slug);
    return { kind: 'pick', tint: film.palette.key, rank: TOP_PICKS.length - i, film } as const;
  });

  return [
    { kind: 'title', tint: OPENING_TINT },
    {
      kind: 'stat',
      tint: OPENING_TINT,
      value: stats.films,
      label: 'Films in the catalogue',
      detail: `${stats.years} years of cinema, from ${stats.firstYear} to ${stats.lastYear}.`,
      films: films.map((f) => f.slug),
    },
    {
      kind: 'stat',
      tint: stats.longest.palette.key,
      value: stats.hours,
      label: 'Hours to watch',
      detail: `${stats.longest.title} runs longest, at ${stats.longest.minutes} minutes.`,
      films: films.map((f) => f.slug),
    },
    {
      kind: 'stat',
      tint: firstOf(topGenre.slugs).palette.key,
      value: topGenre.slugs.length,
      label: `${listNames(topGenre.names)} films`,
      detail: 'The genre the catalogue holds the most of.',
      films: topGenre.slugs,
    },
    {
      kind: 'stat',
      tint: firstOf(topDirectors.slugs).palette.key,
      value: topDirectors.slugs.length,
      label: many ? `By ${spell(topDirectors.names.length)} directors` : 'By one director',
      detail: `${listNames(topDirectors.names)}, ${spell(topDirectors.each)} films${many ? ' each' : ''}.`,
      films: topDirectors.slugs,
    },
    ...picks,
    { kind: 'outro', tint: OPENING_TINT },
  ];
}
