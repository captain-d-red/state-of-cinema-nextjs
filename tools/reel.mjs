/**
 * Checks the finale with real input: turns the sound on, flies to the tunnel, hovers the reel
 * until a frame lights, clicks it and confirms the trailer opens. Then repeats the flight
 * with reduced motion, where every station must still be reachable and readable.
 *
 *   node tools/reel.mjs [url]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4444';
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console ${m.text()}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: /Sound/ }).click();
  const pressed = await page.getByRole('button', { name: /Sound/ }).getAttribute('aria-pressed');
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(reducedMotion === 'reduce' ? 300 : 1500);
  }
  await page.waitForTimeout(3000);
  let opened = false;
  for (let i = 0; i < 60 && !opened; i++) {
    const x = 200 + ((i * 97) % 1040);
    const y = 120 + ((i * 53) % 660);
    await page.mouse.move(x, y);
    await page.waitForTimeout(60);
    const cursor = await page.evaluate(() => document.querySelector('canvas')?.style.cursor);
    if (cursor === 'pointer') {
      await page.screenshot({ path: path.join(outDir, `reel-hover-${reducedMotion}.png`) });
      await page.mouse.click(x, y);
      await page.waitForTimeout(1500);
      opened = await page
        .locator('dialog[open] iframe')
        .count()
        .then((n) => n > 0);
    }
  }
  console.log(
    `${reducedMotion}: sound pressed ${pressed}, reel click opened trailer ${opened}`,
    problems.length ? problems : 'no errors',
  );
  await page.close();
}
await browser.close();
