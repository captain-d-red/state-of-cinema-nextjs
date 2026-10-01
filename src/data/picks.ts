/**
 * The editorial top three, best last so the run of picks builds to it. These are the
 * curator's choice, not a measurement, and the copy says "pick" for that reason.
 *
 * Each pick names the light its valley takes on. A poster's measured key colour suits most
 * stations, but these three posters all measure as the same orange, so the curator lights
 * each one from a colour its own poster is remembered for instead: Blade Runner's sodium
 * orange, the Spider-Verse's magenta and Arrakis's desert gold.
 */
export const TOP_PICKS = [
  { slug: 'blade-runner-2049', tint: '#ff6a3d' },
  { slug: 'across-the-spider-verse', tint: '#e0307e' },
  { slug: 'dune-part-two', tint: '#e8a03a' },
] as const;
