/**
 * Measures GPU time per frame with timer queries, at rest on a film and during a fast flight
 * through the dissolve, on an emulated phone or any other size. Every animation frame is
 * wrapped in one TIME_ELAPSED query, so the figure is the GPU cost of everything the page
 * draws in that frame, independent of the display's refresh rate.
 *
 *   node tools/gpu.mjs [url] [--size iphone16promax|laptop|uhd]
 */
import { chromium } from '@playwright/test';

const SIZES = {
  iphone16promax: { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  uhd: { viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 },
};

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4444';
const size = SIZES[flag('size', 'iphone16promax')];

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-privileged-webgl-extensions'],
});
const page = await browser.newPage(size);
await page.addInitScript(() => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    const gl = getContext.call(this, type, options);
    if (type === 'webgl2' && gl && !window.__gl) window.__gl = gl;
    return gl;
  };
  window.__gpu = [];
  const pending = [];
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((t) => {
      const gl = window.__gl;
      const ext = gl?.getExtension('EXT_disjoint_timer_query_webgl2');
      // Collect finished queries from earlier frames before starting this one.
      while (ext && pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = pending.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) window.__gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
      }
      const query = ext ? gl.createQuery() : null;
      if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      try {
        callback(t);
      } finally {
        if (query) {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          pending.push(query);
        }
      }
    });
});

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
  return `median ${at(0.5).toFixed(2)} ms, p95 ${at(0.95).toFixed(2)} ms, worst ${(s.at(-1) ?? 0).toFixed(2)} ms (${s.length} frames)`;
};
const sample = async (ms) => {
  await page.evaluate(() => (window.__gpu.length = 0));
  await page.waitForTimeout(ms);
  return page.evaluate(() => [...window.__gpu]);
};

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
const rest = await sample(2000);
await page.evaluate(() => (window.__gpu.length = 0));
for (let i = 0; i < 60; i++) {
  await page.mouse.wheel(0, 140);
  await page.waitForTimeout(40);
}
await page.waitForTimeout(400);
const flight = await page.evaluate(() => [...window.__gpu]);
const quality = await page.evaluate(() => document.documentElement.dataset.quality ?? 'n/a');
console.log(`quality ${quality}`);
console.log(`at rest  ${stats(rest)}`);
console.log(`in flight ${stats(flight)}`);
await browser.close();
