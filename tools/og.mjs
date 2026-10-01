/**
 * Renders the share image from the live scene: the title station at 1200 × 630, rendered at
 * twice that and scaled down for clean edges, written where Next serves it as the Open Graph
 * and Twitter card image.
 *
 *   node tools/og.mjs [url]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4444';
const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app');
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(7000);
const shot = await page.screenshot({ type: 'png' });
for (const name of ['opengraph-image.jpg', 'twitter-image.jpg']) {
  await sharp(shot).resize(1200, 630).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(appDir, name));
}
console.log('share images written');
await browser.close();
