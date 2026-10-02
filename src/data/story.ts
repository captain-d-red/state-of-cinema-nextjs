import { filmTint } from '@/lib/thinFilm';
import type { Catalogue, Film } from './catalogue';
import { TOP_PICKS } from './picks';
import { OFFER } from './platform';
import { catalogueStats } from './stats';

/**
 * The oil film on the river at a station: its optical path difference in nanometres, how far
 * that wanders across the water, and how strongly it colours the light, from zero to one.
 */
export interface Sheen {
  readonly opd: number;
  readonly spread: number;
  readonly strength: number;
}

/**
 * One stop on the flight. Every station carries the colour the valley takes on around it and
 * the film on its water, so the world shifts with the story.
 */
export type Station = { readonly tint: string; readonly sheen: Sheen } & (
  | { readonly kind: 'title' }
  | {
      readonly kind: 'stat';
      readonly value: number;
      readonly label: string;
      readonly detail: string;
      /** The films the figure counts, whose posters its particles are printed with. */
      readonly films: readonly string[];
    }
  | { readonly kind: 'pick'; readonly rank: number; readonly film: Film }
  | { readonly kind: 'outro' }
);

/**
 * The flight opens and closes in coated glass: a lavender grey light, and a film whose
 * thickness wanders across a whole order, so the river shows every colour of the sheen at once.
 */
const OPENING = { tint: '#b9b2e0', sheen: { opd: 700, spread: 230, strength: 1 } } as const;

/**
 * Each figure takes its light from one band of the opening sheen, in the order the film runs:
 * magenta, violet, azure and mint. The film holds near that band, so the river shows one colour.
 */
const band = (opd: number) => ({ tint: filmTint(opd), sheen: { opd, spread: 28, strength: 0.75 } }) as const;
const BANDS = { magenta: band(505), violet: band(560), azure: band(665), mint: band(760) } as const;

/** The picks are lit by their own posters, so their water is a clean mirror with only a silver film. */
const SILVER = { opd: 260, spread: 40, strength: 0.3 } as const;

/**
 * The whole flight, in order: the entry journey a visitor takes before signing up. It opens on
 * the curtain, counts what is on air across live, sport and news, narrows to the films, then
 * to three picked for this visitor, and closes on the invitation to start watching. The films
 * figure is computed from the catalogue it is given.
 */
export function buildStory({ films }: Catalogue): readonly Station[] {
  const stats = catalogueStats(films);
  const find = (slug: string): Film => {
    const film = films.find((f) => f.slug === slug);
    if (!film) throw new Error(`${slug} is not in the catalogue`);
    return film;
  };
  const everything = films.map((f) => f.slug);

  const picks = TOP_PICKS.map(({ slug, tint }, i) => {
    const film = find(slug);
    return { kind: 'pick', tint, sheen: SILVER, rank: TOP_PICKS.length - i, film } as const;
  });

  return [
    { kind: 'title', ...OPENING },
    {
      kind: 'stat',
      ...BANDS.magenta,
      value: OFFER.liveChannels,
      label: 'Live channels',
      detail: 'News, sport and entertainment, on air right now.',
      films: everything,
    },
    {
      kind: 'stat',
      ...BANDS.violet,
      value: OFFER.leagues,
      label: 'Leagues, live',
      detail: 'Every match as it happens, and every replay after.',
      films: everything,
    },
    {
      kind: 'stat',
      ...BANDS.azure,
      value: OFFER.newsHours,
      label: 'Hours of news a day',
      detail: 'Local, national and world desks, always on.',
      films: everything,
    },
    {
      kind: 'stat',
      ...BANDS.mint,
      value: stats.films,
      label: 'The best films',
      detail: `Our most watched of ${stats.years} years of cinema, ${stats.firstYear} to ${stats.lastYear}.`,
      films: everything,
    },
    ...picks,
    { kind: 'outro', ...OPENING },
  ];
}
