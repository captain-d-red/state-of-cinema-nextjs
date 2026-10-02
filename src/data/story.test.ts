import { describe, expect, it } from 'vitest';
import { catalogue } from './catalogue';
import { TOP_PICKS } from './picks';
import { buildStory } from './story';

describe('buildStory', () => {
  const story = buildStory(catalogue);

  it('opens on the title and closes on the outro', () => {
    expect(story[0]!.kind).toBe('title');
    expect(story.at(-1)!.kind).toBe('outro');
  });

  it('counts live, sport and news before it narrows to the films, the whole catalogue', () => {
    const labels = story.flatMap((s) => (s.kind === 'stat' ? [s.label] : []));
    expect(labels).toEqual(['Live channels', 'Leagues, live', 'Hours of news a day', 'The best films']);
    const films = story.filter((s) => s.kind === 'stat').at(-1);
    expect(films?.kind === 'stat' && films.value).toBe(catalogue.films.length);
  });

  it('runs the picks from third to first, best last', () => {
    const ranks = story.flatMap((s) => (s.kind === 'pick' ? [s.rank] : []));
    expect(ranks).toEqual([3, 2, 1]);
    const last = story.filter((s) => s.kind === 'pick').at(-1);
    expect(last?.kind === 'pick' && last.film.slug).toBe(TOP_PICKS.at(-1)?.slug);
  });

  it('gives every station a hex tint', () => {
    for (const s of story) expect(s.tint).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
