/**
 * Films the first seconds after the page opens, from the loader to the settled title, and
 * lays them out as a contact sheet.
 *
 *   node tools/boot.mjs [url]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4444';
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const t0 = Date.now();
await page.goto(url, { waitUntil: 'commit' });
const frames = [];
while (Date.now() - t0 < 6500)
  frames.push({ t: Date.now() - t0, buf: await page.screenshot({ type: 'jpeg', quality: 78 }) });
const pick = [300, 900, 1500, 2100, 2700, 3500, 4500, 6200].map((ms) =>
  frames.reduce((a, f) => (Math.abs(f.t - ms) < Math.abs(a.t - ms) ? f : a)),
);
const tiles = await Promise.all(pick.map((f) => sharp(f.buf).resize(480, 300).toBuffer()));
await sharp({ create: { width: 1920, height: 600, channels: 3, background: '#000' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % 4) * 480, top: Math.floor(i / 4) * 300 })))
  .jpeg({ quality: 82 })
  .toFile(path.join(outDir, 'boot.jpg'));
console.log(pick.map((f) => f.t).join(' '));
await browser.close();
