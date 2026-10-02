/**
 * Proves the sound is audible and follows the flight. Before the page loads, every connection
 * into the speakers is routed through an analyser, so the real output level can be read. The
 * level is measured before any gesture, after the first click starts the score, during a fast
 * flight, and once the toggle turns it off.
 *
 *   node tools/sound.mjs [url]
 */
import { chromium } from '@playwright/test';

const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:4444';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...rest) {
    if (destination instanceof AudioDestinationNode) {
      const analyser = new AnalyserNode(this.context, { fftSize: 2048 });
      window.__analyser = analyser;
      connect.call(this, analyser);
      return connect.call(analyser, destination, ...rest);
    }
    return connect.call(this, destination, ...rest);
  };
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const rms = () =>
  page.evaluate(() => {
    const a = window.__analyser;
    if (!a) return 0;
    const data = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(data);
    return Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
  });
const db = (v) => (v > 0 ? `${(20 * Math.log10(v)).toFixed(1)} dBFS` : 'silent');
// Sound is on by default, and starts at the first gesture, here a click on the river.
const before = await rms();
await page.mouse.click(700, 700);
await page.waitForTimeout(2000);
const still = await rms();
let flying = 0;
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(40);
  flying = Math.max(flying, await rms());
}
await page.getByRole('button', { name: 'Sound' }).click();
await page.waitForTimeout(1500);
const off = await rms();
console.log(
  `before a gesture ${db(before)}, after the first click ${db(still)}, flying ${db(flying)}, toggled off ${db(off)}`,
);
await browser.close();
