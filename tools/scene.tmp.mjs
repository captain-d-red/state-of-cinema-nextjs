import { chromium } from '@playwright/test';
import sharp from 'sharp';
const out = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const film = async (reduced) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  await page.goto('http://localhost:4444', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);
  await page.mouse.move(1430, 10);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(1500); }
  await page.keyboard.press('ArrowDown');
  const frames = [];
  const t0 = Date.now();
  for (const ms of [500, 1000, 1500, 2000, 2600, 3200, 3800, 4400]) {
    while (Date.now() - t0 < ms) await page.waitForTimeout(10);
    frames.push(await page.screenshot({ type: 'jpeg', quality: 85, clip: { x: 520, y: 0, width: 400, height: 450 } }));
  }
  const tiles = await Promise.all(frames.map((f) => sharp(f).toBuffer()));
  await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#000' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 4) * 400, top: Math.floor(i / 4) * 450 })))
    .jpeg({ quality: 85 }).toFile(`${out}/banner-${reduced ? 'reduced' : 'motion'}.jpg`);
  console.log(reduced ? 'reduced' : 'motion', problems.length ? problems.join(' | ') : 'no errors');
  await page.close();
};
await film(false);
await film(true);
await browser.close();
