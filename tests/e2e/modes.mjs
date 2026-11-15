// Scripted modes in a real browser: Judge Mode (F9 + Space), Failure Lab job + hand-back, Apollo 12 console, Moonshot, Rehbar-I, Space Guide, Settings.
// Usage: npx vite --port 5199 &   node tests/e2e/modes.mjs [url]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] || 'http://localhost:5199/';
const out = fileURLToPath(new URL('../../shots/', import.meta.url));
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.addInitScript(() => localStorage.setItem('tminus.settings.v1', JSON.stringify({ quality: 'low' })));
const st = (fn, arg) => page.evaluate(fn, arg);
const shot = async (n) => { await page.waitForTimeout(800); await page.screenshot({ path: `${out}modes-${n}.png` }); };

// DOM-level button click (real React handlers, no per-frame actionability waits under software WebGL).
const clickBtn = async (re, { all = false, last = false, wait = 30000 } = {}) => {
  await page.waitForFunction(([src, flags]) => [...document.querySelectorAll('button')].some((b) => new RegExp(src, flags).test(b.textContent.trim())), [re.source, re.flags], { timeout: wait });
  return page.evaluate(([src, flags, all, last]) => { const r = new RegExp(src, flags); const list = [...document.querySelectorAll('button')].filter((b) => r.test(b.textContent.trim())); (all ? list : last ? list.slice(-1) : list.slice(0, 1)).forEach((b) => b.click()); return list.length; }, [re.source, re.flags, all, last]);
};
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failures++; };
const waitScreen = (s, t = 120000) => page.waitForFunction((x) => window.__game.getState().screen === x, s, { timeout: t });

await page.goto(url); await page.waitForSelector('h1');

// ---------------- Judge Mode
await page.keyboard.press('F9'); await waitScreen('bay');
check('F9 starts Judge Mode in the Integration Bay', (await page.locator('text=/1\\/6 · Integration Bay/').count()) > 0);
let faults = await st(() => window.__game.getState().checklist().filter((i) => i.id === 'sc_wiring' && !i.pass).length);
check('the demo build has the one antenna fault', faults === 1);
await page.keyboard.press('Space'); await page.waitForTimeout(500);
check('Space plugs the antenna cable (wiring check clean)', (await st(() => window.__game.getState().checklist().find((i) => i.id === 'sc_wiring').pass)) === true);
await page.keyboard.press('Space'); await waitScreen('vab'); await shot('judge-vab');
const joint = await st(() => window.__game.getState().jointState('j_s1_interstage').getStatus());
check('the VAB shows joint 1 with 3 bolts missing', joint.missing === 3 && joint.integrity < 0.6, `integrity ${joint.integrity.toFixed(2)}`);
await page.keyboard.press('Space'); await waitScreen('flight');
await waitScreen('debrief', 240000); await shot('judge-debrief-fail');
let r = await st(() => window.__game.getState().flight);
check('flight 1 is lost to joint j_s1_interstage', r.outcome === 'Failed' && r.failureCause === 'j_s1_interstage', `${r.outcome}/${r.failureCode}/${r.failureCause}`);
await page.keyboard.press('Space'); await waitScreen('flight');
await waitScreen('debrief', 240000); await page.waitForTimeout(1500); await shot('judge-debrief-orbit');
r = await st(() => ({ f: window.__game.getState().flight, s: window.__game.getState().score }));
check('flight 2 reaches orbit with 3 stars', r.f.outcome === 'Orbit' && r.s.stars === 3, `${r.f.outcome} ${r.s.total}`);
await page.keyboard.press('Space'); await waitScreen('menu');
check('Judge Mode ends and returns to the menu', (await st(() => window.__game.getState().judge)) === null);

// ---------------- Failure Lab: Broken Pathfinder
await page.locator('text=Failure Lab').first().click(); await page.waitForSelector('text=Broken Pathfinder'); await shot('failure-board');
await clickBtn(/Take the job/); await waitScreen('vab');
await page.waitForSelector('text=/faults fixed 0\\/3/');
check('the job starts with 0 of 3 faults fixed and a flight that fails', true);
const flightBroken = await st(async () => { const m = await import('/src/engine/flightRun.js'); const g = window.__game.getState(); return m.runFlight(g.data, { missionId: g.missionId, spacecraft: g.spacecraft, vehicle: g.vehicle }, 'floodwatch_1').record.outcome; });
check('the broken rocket does not reach orbit', flightBroken !== 'Orbit', flightBroken);
// fix through the store (the UI paths for these are covered by playthrough.mjs)
await st(() => {
  const g = window.__game.getState(); const rules = g.data.getRules();
  g.boltAction('j_interstage_s2', 'fitAll');
  for (let p = 1; p <= 3; p++) { const s = g.jointState('j_interstage_s2'); for (const i of [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11]) g.boltAction('j_interstage_s2', 'torque', i, s.passTargetNm(p)); }
  g.removeAvionicsCable('av_flight_computer/DATA_3', 'av_imu/DATA');
  g.addAvionicsCable('av_flight_computer/DATA_1', 'av_imu/DATA'); g.addAvionicsCable('av_flight_computer/PYRO_OUT_3', 'av_igniter_s2/PYRO_IN');
});
await page.waitForSelector('text=/faults fixed 3\\/3/', { timeout: 10000 });
await clickBtn(/Hand it back/); await page.waitForSelector('text=/Job debrief/');
const jd = await page.locator('text=/3 of 3.*faults fixed/').count();
check('hand-back debrief reports 3 of 3 fixed with the lesson', jd > 0 && (await page.locator('text=The lesson').count()) > 0); await shot('failure-debrief');
await clickBtn(/Back to the job board/); await page.waitForSelector('text=Apollo 12');
check('the player build is restored after the job', (await st(() => window.__game.getState().backup)) === null);

// ---------------- Apollo 12
await page.evaluate(() => [...document.querySelectorAll('h3')].find((h) => /Apollo/.test(h.textContent)).closest('div.panel').querySelector('button').click()); await page.waitForSelector('text=EECOM');
await page.waitForFunction(() => /LIGHTNING/.test(document.body.innerText), null, { timeout: 20000 });
await clickBtn(/Fuel cells: RESET/); await page.waitForTimeout(300);
check('a wrong call is explained', (await page.locator('text=/^✗/').count()) > 0);
await clickBtn(/SCE to AUX/); await page.waitForTimeout(300);
await clickBtn(/Fuel cells: RESET/); await page.waitForSelector('text=/JOB DEBRIEF/'); await shot('apollo');
check('Apollo 12 job debrief with 1 wrong call = 240 pts', (await page.locator('text=/240 \\/ 300/').count()) > 0);
await clickBtn(/Back to the job board/);

// ---------------- Moonshot and Rehbar-I (flight-only missions)
for (const [id, label] of [['moonshot', 'Orbit achieved'], ['rehbar_1962', 'Apogee reached']]) {
  await st((m) => { const g = window.__game.getState(); g.selectMission(m); g.go('briefing'); }, id);
  await clickBtn(/Inspect the rocket/); await waitScreen('vab'); await shot(`${id}-inspect`);
  await st(() => window.__game.getState().go('pad')); await page.waitForSelector('text=Launch control');
  const items = await st(() => window.__game.getState().checklist().map((i) => i.id));
  check(`${id}: pad checklist has no CubeSat items`, items.join() === 'fd_site', items.join());
  await clickBtn(/^GO$/); await clickBtn(/Start the countdown/);
  await page.waitForSelector('text=Terminal count', { timeout: 20000 }); await clickBtn(/Launch now/);
  await page.waitForTimeout(1500); await clickBtn(/Skip/); await page.waitForSelector(`text=${label}`, { timeout: 60000 }); await shot(`${id}-end`);
  await clickBtn(/Continue to the debrief/); await waitScreen('debrief');
  const res = await st(() => ({ f: window.__game.getState().flight, s: window.__game.getState().score }));
  check(`${id}: flight-only debrief scores ${label}`, res.s.stars >= 2, `${res.f.outcome} ${res.s.total} apogee ${res.f.apoapsisKm.toFixed(0)} dv ${Math.round(res.f.deltaVLeftMs)}`);
}

// ---------------- Guide + settings
await st(() => window.__game.getState().go('guide')); await page.waitForSelector('text=28'); await page.locator('input[aria-label="Search the Space Guide"]').fill('bolt');
check('Space Guide search filters topics', (await page.locator('nav[aria-label="Topics"] button').count()) < 28);
await page.locator('nav[aria-label="Topics"] button').first().click(); await page.waitForSelector('text=Check yourself');
await shot('guide');
await st(() => window.__game.getState().go('settings')); await clickBtn(/Hints only/);
check('settings persist', (await st(() => window.__game.getState().settings.houstonMode)) === 'HintsOnly');

console.log(errors.length ? `\nCONSOLE ERRORS (${errors.length}):\n${errors.slice(0, 15).join('\n')}` : '\nNo console errors.');
await browser.close();
process.exit(errors.length || failures ? 1 : 0);
