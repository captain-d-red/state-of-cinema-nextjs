/**
 * Times every animation frame in the page while real wheel input flies the whole route, and
 * reports the mean rate, the 95th percentile frame and the worst frame for each size.
 *
 *   node tools/fps.mjs [url] [--sizes fhd,uhd]
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4444';
const SIZES = { fhd: [1920, 1080], uhd: [3840, 2160], laptop: [1440, 900] };

for (const name of flag('sizes', 'fhd,uhd').split(',')) {
  const [width, height] = SIZES[name];
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);
  await page.mouse.move(width / 2, height * 0.7);
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => {
      window.__frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let i = 0; i < 160; i++) {
    await page.mouse.wheel(0, 120);
    await page.mouse.move(width / 2 + Math.sin(i / 5) * 300, height * 0.7);
    await page.waitForTimeout(50);
  }
  const frames = (await page.evaluate(() => window.__frames)).slice(5);
  const sorted = [...frames].sort((a, b) => a - b);
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  console.log(
    `${name} ${width}x${height}: ${(1000 / mean).toFixed(1)} fps, p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)} ms, worst ${sorted.at(-1).toFixed(1)} ms over ${frames.length} frames`,
  );
  await browser.close();
}
