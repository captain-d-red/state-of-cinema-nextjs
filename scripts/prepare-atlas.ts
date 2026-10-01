/**
 * Builds the poster atlas the tunnel's reel reads from, out of the full-size poster sources.
 *
 *   node scripts/prepare-atlas.ts [--src <dir>]
 *
 * public/films/atlas.webp holds every poster as one cell in catalogue order, twelve to a row.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ATLAS } from '../src/data/atlas.ts';
import { parseCatalogue } from '../src/data/parse.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argSrc = process.argv.indexOf('--src');
const srcDir = path.resolve(
  argSrc > 0 && process.argv[argSrc + 1]
    ? process.argv[argSrc + 1]!
    : path.join(root, '..', 'state-of-cinema-nextjs-local-scripts', 'poster-src'),
);

const { films } = parseCatalogue(JSON.parse(await fs.readFile(path.join(root, 'src', 'data', 'films.json'), 'utf8')));
if (films.length > ATLAS.columns * ATLAS.rows) {
  throw new Error(`${films.length} films do not fit an atlas of ${ATLAS.columns} × ${ATLAS.rows} cells`);
}
const rows = ATLAS.rows;
const cells = await Promise.all(
  films.map(async (film, i) => ({
    input: await sharp(path.join(srcDir, `${film.slug}.jpg`))
      .resize(ATLAS.cellWidth, ATLAS.cellHeight, { fit: 'cover' })
      .toBuffer(),
    left: (i % ATLAS.columns) * ATLAS.cellWidth,
    top: Math.floor(i / ATLAS.columns) * ATLAS.cellHeight,
  })),
);
await sharp({
  create: { width: ATLAS.columns * ATLAS.cellWidth, height: rows * ATLAS.cellHeight, channels: 3, background: '#000' },
})
  .composite(cells)
  .webp({ quality: 84 })
  .toFile(path.join(root, 'public', 'films', 'atlas.webp'));
console.log(`atlas.webp: ${films.length} posters in ${ATLAS.columns} × ${rows}`);
