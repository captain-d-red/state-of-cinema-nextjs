import { describe, expect, it } from 'vitest';
import type { Film } from './catalogue';
import { catalogueStats } from './stats';

const film = (slug: string, year: number, director: string, minutes: number, genres: string[]): Film => ({
  slug,
  title: slug,
  year,
  director,
  minutes,
  genres,
  logline: 'x',
  image: { src: `/${slug}.webp`, width: 2, height: 3 },
  palette: { key: '#000000', accent: '#000000' },
  trailer: null,
});

const films = [
  film('a', 2010, 'Ada', 100, ['Drama', 'Sci-Fi']),
  film('b', 2012, 'Bo', 130, ['Sci-Fi']),
  film('c', 2012, 'Ada', 95, ['Comedy']),
  film('d', 2015, 'Bo', 140, ['Drama']),
];

describe('catalogueStats', () => {
  const stats = catalogueStats(films);

  it('sums running time and floors it to whole hours', () => {
    expect(stats.minutes).toBe(465);
    expect(stats.hours).toBe(7);
  });

  it('spans the release years and counts the distinct ones', () => {
    expect([stats.firstYear, stats.lastYear, stats.years]).toEqual([2010, 2015, 3]);
  });

  it('reports a tie for the top genre as a tie, with the films of both', () => {
    expect(stats.topGenre.names).toEqual(['Drama', 'Sci-Fi']);
    expect(stats.topGenre.each).toBe(2);
    expect(stats.topGenre.slugs).toEqual(['a', 'b', 'd']);
  });

  it('finds every director tied at the top count', () => {
    expect(stats.topDirectors.names).toEqual(['Ada', 'Bo']);
    expect(stats.topDirectors.slugs).toHaveLength(4);
  });

  it('picks the longest film', () => {
    expect(stats.longest.slug).toBe('d');
  });

  it('refuses an empty catalogue', () => {
    expect(() => catalogueStats([])).toThrow();
  });
});
