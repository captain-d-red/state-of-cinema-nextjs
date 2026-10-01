/**
 * Layout of public/films/atlas.webp, every poster as one cell in catalogue order. A cell of
 * 240 × 360 stays sharp on a frame of the reel at 4K, and the whole sheet fits one texture.
 */
export const ATLAS = { src: '/films/atlas.webp', columns: 12, cellWidth: 240, cellHeight: 360 } as const;
