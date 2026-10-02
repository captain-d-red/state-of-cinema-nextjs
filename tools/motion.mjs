/**
 * Films the arrivals with real input and lays the frames out as a contact sheet, so the
 * rise of a figure and the arrival of a banner can be judged frame by frame.
 *
 *   node tools/motion.mjs [url]
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
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.mouse.move(1270, 10);

/** Steps to the next station and screenshots the arrival at a steady cadence. */
async function arrive(name, presses) {
  for (let i = 0; i < presses - 1; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(1600);
  }
  await page.keyboard.press('ArrowDown');
  const frames = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 2600) {
    frames.push({ t: Date.now() - t0, buf: await page.screenshot({ type: 'jpeg', quality: 80 }) });
  }
  const pick = [0, 300, 600, 900, 1200, 1500, 1800, 2400].map((ms) =>
    frames.reduce((a, f) => (Math.abs(f.t - ms) < Math.abs(a.t - ms) ? f : a)),
  );
  const tiles = await Promise.all(pick.map((f) => sharp(f.buf).resize(480, 300).toBuffer()));
  await sharp({ create: { width: 1920, height: 600, channels: 3, background: '#000' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 4) * 480, top: Math.floor(i / 4) * 300 })))
    .jpeg({ quality: 82 })
    .toFile(path.join(outDir, `motion-${name}.jpg`));
  console.log(name, pick.map((f) => f.t).join(' '));
}

await arrive('figure', 1);
await arrive('banner', 4);
await browser.close();
