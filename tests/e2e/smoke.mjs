// End-to-end smoke test: opens every screen in a real (headless) Chromium and fails on any console error or page error.
// Usage: npx vite --port 5199 &   node tests/e2e/smoke.mjs [url]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] || 'http://localhost:5199/';
const out = fileURLToPath(new URL('../../shots/', import.meta.url));
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' && /three|react|Warning/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const shot = async (name) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${out}${name}.png` }); console.log('shot', name); };
const g = (fn, arg) => page.evaluate(fn, arg);

await page.addInitScript((q) => localStorage.setItem('tminus.settings.v1', JSON.stringify({ quality: q })), process.env.Q || 'low');
await page.goto(url); await page.waitForSelector('h1', { timeout: 30000 }); await shot('01-menu');
await g(() => window.__game.getState().go('briefing')); await shot('02-briefing');
await g(() => { const s = window.__game.getState(); s.selectMission('floodwatch_1'); s.go('bay'); }); await shot('03-bay-empty');
await g(() => { const s = window.__game.getState(); ['eps', 'batt_20', 'dep_switch', 'obc', 'radio_sband', 'ant_patch', 'adcs_mag', 'cam_wide', 'solar_body'].forEach((p) => s.installPart(p)); }); await shot('04-bay-built');
await page.click('text=Wire'); await g(() => { const s = window.__game.getState(); s.applyDemo({ missingRf: true, padReady: false }); }); await shot('05-bay-wire');
await g(() => window.__game.getState().go('vab')); await shot('06-vab-full');
await g(() => { const s = window.__game.getState(); s.applyDemo({}); s.setSelectedJoint('j_s1_interstage'); }); await shot('07-vab-bolts');
await g(() => window.__game.getState().go('avionics')); await shot('08-avionics');
await g(() => window.__game.getState().go('pad')); await shot('09-pad');
await g(() => { const s = window.__game.getState(); s.applyDemo({ padReady: true }); s.commitLaunch(); s.go('flight'); }); await shot('10-flight-pre');
await g(() => { }); await page.click('text=Launch now'); await page.waitForTimeout(6000); await shot('11-flight-6s');
await page.waitForTimeout(9000); await shot('12-flight-15s');
await g(() => window.__game.getState().go('guide')); await shot('13-guide');
await g(() => window.__game.getState().go('settings')); await shot('14-settings');
await g(() => window.__game.getState().go('failure')); await shot('15-failure');
console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.slice(0, 20).join('\n')}` : 'No console errors.');
await browser.close();
process.exit(errors.length ? 1 : 0);
