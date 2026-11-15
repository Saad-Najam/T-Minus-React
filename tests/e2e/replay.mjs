// Failure replay + scrubber: fly a bad joint, open the replay, drag the scrubber to several moments, check the simulation really jumps and nothing throws.
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5175/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = []; page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('tminus.settings.v1', JSON.stringify({ quality: 'low' })));
await page.goto(url); await page.waitForSelector('h1');
const t = await page.evaluate(async () => {
  const g = window.__game.getState(); g.applyDemo({ padReady: true, badJoint: true });
  const f = window.__game.getState(); // fresh state: applyDemo replaced the build
  const m = await import('/src/engine/flightRun.js'); const r = m.runFlight(f.data, { missionId: f.missionId, spacecraft: f.spacecraft, vehicle: f.vehicle }, 'floodwatch_1');
  f.finishFlight(r.record, r.events.all); window.__game.setState({ replay: true }); f.go('flight'); return r.record.flightTimeS;
});
console.log('failure at T+', t.toFixed(1));
await page.waitForSelector('input[aria-label="Scrub the replay"]', { timeout: 120000 });
const setSlider = (v) => page.evaluate((v) => { const el = document.querySelector('input[aria-label="Scrub the replay"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const readT = async () => { await page.waitForTimeout(1200); return page.evaluate(() => document.body.innerText.match(/T\+(\d+)s/g)?.slice(-1)[0]); };
let ok = true;
for (const frac of [0.2, 0.6, 1.0, 0.1]) { await setSlider(Math.floor(t * frac)); const shown = await readT(); const want = Math.floor(t * frac); const n = parseInt(shown?.match(/\d+/)?.[0] ?? '-1', 10); const good = Math.abs(n - want) <= 2; ok = ok && good; console.log(good ? 'PASS' : 'FAIL', `scrub to ${want}s -> HUD ${shown}`); }
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.slice(0, 8).join('\n') : 'No console errors.');
await browser.close(); process.exit(errors.length || !ok ? 1 : 0);
