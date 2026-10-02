/**
 * What the platform streams beyond its films, as the entry flight counts it for a visitor who
 * has not signed up yet. In the product these come from the channel guide and the sports and
 * news schedules, and this is the one place they are set.
 */
export const OFFER = {
  /** Linear channels a visitor can watch live. */
  liveChannels: 120,
  /** Leagues and tournaments carried live this season. */
  leagues: 38,
  /** Hours of live news every day, across the news channels. */
  newsHours: 24,
} as const;

/** The categories the platform is browsed by, in the order the entry flight meets them. */
export const CATEGORIES = ['Live', 'Sport', 'News', 'Films'] as const;
