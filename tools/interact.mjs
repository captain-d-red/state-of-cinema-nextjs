/**
 * Drives real input through each interaction and saves a shot of the response: a pointer
 * sweep and a click on the river, a sweep through a figure, a sweep across a banner, a
 * hard flick for the lens kick, and the trailer player.
 *
 *   node tools/interact.mjs [url] [--size laptop]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4444';
const W = 1440;
const H = 900;
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`console ${m.text()}`));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(4200);

const shot = (name) => page.screenshot({ path: path.join(outDir, `interact-${name}.png`) });
const sweep = async (x0, x1, y, steps = 40) => {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(x0 + (x1 - x0) * t, y + Math.sin(t * Math.PI * 2) * 40);
    await page.waitForTimeout(16);
  }
};
/** Scrolls to a station with the page's own keyboard stepping, which lands exactly on it. */
const toStation = async (n) => {
  await page.mouse.move(W - 4, 4);
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(1800);
};

await sweep(200, 1240, 700);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(450);
await shot('ground');

await toStation(1);
await sweep(560, 900, 330, 30);
await shot('figure');

await toStation(4);
await page.mouse.move(W / 2, H * 0.3);
await sweep(620, 840, 300, 30);
await shot('banner');

// A hard flick, caught a beat later while the lens is still kicked.
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(20);
}
await page.waitForTimeout(140);
await shot('flick');
await page.waitForTimeout(2500);

const play = page.getByRole('button', { name: 'Watch trailer' });
if (await play.isVisible()) {
  await play.click();
  await page.waitForTimeout(2500);
  await shot('trailer');
  await page.keyboard.press('Escape');
}
console.log(problems.length ? problems : 'no errors');
await browser.close();
