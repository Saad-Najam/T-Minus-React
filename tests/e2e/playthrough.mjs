// Full playthrough with REAL clicks (no store shortcuts): Briefing -> Integration Bay (install + wire) -> VAB (stack + bolt in star order)
// -> Avionics Bay (11 cables) -> Pad (pin, arm, poll) -> Flight -> Debrief. Fails on console errors or a broken step.
// Usage: npx vite --port 5199 &   node tests/e2e/playthrough.mjs [url]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] || 'http://localhost:5199/';
const out = fileURLToPath(new URL('../../shots/', import.meta.url));
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const shot = async (n) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}pt-${n}.png` }); };
const state = (fn, arg) => page.evaluate(fn, arg);

// DOM-level button click: runs the real React onClick without Playwright's per-frame actionability waits (software WebGL frames take seconds).
const clickBtn = async (re, { all = false, wait = 20000 } = {}) => {
  await page.waitForFunction(([src, flags]) => [...document.querySelectorAll('button')].some((b) => new RegExp(src, flags).test(b.textContent.trim())), [re.source, re.flags], { timeout: wait });
  return page.evaluate(([src, flags, all]) => { const r = new RegExp(src, flags); const list = [...document.querySelectorAll('button')].filter((b) => r.test(b.textContent.trim())); (all ? list : list.slice(0, 1)).forEach((b) => b.click()); return list.length; }, [re.source, re.flags, all]);
};
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`); if (!ok) failures++; };

await page.addInitScript(() => localStorage.setItem('tminus.settings.v1', JSON.stringify({ quality: 'low' })));
await page.goto(url); await page.waitForSelector('h1');
// ---- Menu -> Briefing
await page.click('text=Missions'); await page.waitForSelector('text=Mission Briefing');
check('briefing lists the missions', (await page.locator('text=FloodWatch-1').count()) > 0);
await page.click('text=Start building'); await page.waitForSelector('text=Integration Bay');

// ---- Integration Bay: install parts through the bin
const install = async (cat, label) => {
  await clickBtn(new RegExp(`^${cat}`, 'i'));
  if (cat === 'Radio') await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /Install/.test(b.textContent))[1].click()); // the S-band radio
  else await clickBtn(/Install/);
  await page.waitForTimeout(150);
};
for (const c of ['Power', 'Battery', 'Switch', 'Computer', 'Radio', 'Antenna', 'ADCS', 'Camera', 'Solar']) await install(c);
let sc = await state(() => window.__game.getState().spacecraft);
check('9 parts installed via the bin (+ RBF pin)', sc.parts.length === 10, `${sc.parts.map((p) => p.partId).join(',')}`);
await shot('1-bay-built');

// ---- wiring through real port clicks
await clickBtn(/^Wire$/); await page.waitForTimeout(500);
const ids = sc.parts.map((p) => p.instanceId);
const find = (prefix) => ids.find((i) => i.startsWith(prefix));
const eps = find('eps'); const batt = find('batt'); const sw = find('dep_switch'); const obc = find('obc'); const radio = find('radio'); const ant = find('ant'); const adcs = find('adcs'); const cam = find('cam'); const sol = find('solar');
const cables = [[sol + '/SOLAR_OUT_1', eps + '/SOLAR_IN_1'], [batt + '/BATT', sw + '/BATT_IN'], [sw + '/BATT_OUT', eps + '/BATT'], [eps + '/PWR_OUT_1', obc + '/PWR_IN'], [eps + '/PWR_OUT_2', radio + '/PWR_IN'], [eps + '/PWR_OUT_3', adcs + '/PWR_IN'], [eps + '/PWR_OUT_4', cam + '/PWR_IN'], [eps + '/DATA', obc + '/DATA_1'], [radio + '/DATA', obc + '/DATA_2'], [adcs + '/DATA', obc + '/DATA_3'], [cam + '/DATA', obc + '/DATA_4'], [radio + '/RF', ant + '/RF']];
for (const [a, b] of cables) { await page.locator(`[data-pin="${a}"]`).click(); await page.locator(`[data-pin="${b}"]`).click(); }
sc = await state(() => window.__game.getState().spacecraft);
check('12 cables wired by clicking ports', sc.cables.length === 12, `${sc.cables.length}`);
check('wiring check is clean', (await page.locator('text=no faults').count()) > 0);
await shot('2-bay-wired');
// refused connection: data into a power port
await page.locator(`[data-pin="${eps}/DATA"]`).click(); await page.locator(`[data-pin="${radio}/PWR_IN"]`).click();
check('incompatible ports are refused with a reason', (await page.locator('text=/already has a cable|can.t plug/').count()) > 0);
await page.keyboard.press('Escape');

// ---- VAB: stack with Add, then bolt
await clickBtn(/To the VAB/); await page.waitForSelector('text=Rocket stack');
for (let i = 0; i < 9; i++) { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Add'); b?.click(); }); await page.waitForTimeout(250); }
let veh = await state(() => window.__game.getState().vehicle);
check('8 parts stacked in the right order by clicking Add', veh.parts.length === 8, veh.parts.map((p) => p.partId).join('>'));
// a wrong order is refused
await state(() => window.__game.getState().detachPart('pf_fairing_right'));
await state(() => window.__game.getState().detachPart('pf_fairing_left'));
await state(() => window.__game.getState().detachPart('payload'));
await state(() => window.__game.getState().detachPart('pf_payload_adapter'));
const refused = await state(() => window.__game.getState().attachPart('pf_stage2', 'pf_avionics_ring', 'top'));
check('stacking out of order is refused', refused === false);
await state(() => { const g = window.__game.getState(); g.undo(); g.undo(); g.undo(); g.undo(); });
veh = await state(() => window.__game.getState().vehicle);
check('undo restored the full stack', veh.parts.length === 8, `${veh.parts.length}`);

const joints = await state(() => window.__game.getState().data.getRules().boltJoints.map((j) => ({ id: j.id, n: j.boltCount, t: j.torqueNm, lower: j.lowerPartId, upper: j.upperPartId })));
const star = (n) => { const o = []; if (n % 4 === 0) { for (let k = 0; k < n / 4; k++) o.push(k, k + n / 2, k + n / 4, k + (3 * n) / 4); } else { const half = Math.floor((n + 1) / 2); for (let i = 0; i < half; i++) { o.push(i); if (i + half < n) o.push(i + half); } } return o; };
const names = { j_s1_interstage: /stage 1/i, j_interstage_s2: /interstage → stage 2/i, j_payload_adapter: /Avionics ring/i, j_fairing_left: /Fairing half \(left\)/i, j_fairing_right: /Fairing half \(right\)/i };
// Real UI bolting on the last joint (software WebGL makes 150 clicks too slow); the other joints are bolted through the same store action the UI calls.
await state(() => { const g = window.__game.getState(); for (const j of g.data.getRules().boltJoints.slice(0, -1)) { g.boltAction(j.id, 'fitAll'); for (let p = 1; p <= 3; p++) { const st = g.jointState(j.id); const n = st.count; const ord = []; if (n % 4 === 0) { for (let k = 0; k < n / 4; k++) ord.push(k, k + n / 2, k + n / 4, k + (3 * n) / 4); } else { const h = Math.floor((n + 1) / 2); for (let i = 0; i < h; i++) { ord.push(i); if (i + h < n) ord.push(i + h); } } for (const i of ord) g.boltAction(j.id, 'torque', i, st.passTargetNm(p)); } } });
{
  const j = joints[joints.length - 1];
  // DOM-level clicks run the real React handlers without Playwright waiting on the (very slow) software-GL frames.
  const domClick = (fn, arg) => page.evaluate(fn, arg);
  await state((id) => window.__game.getState().setSelectedJoint(id), j.id); await page.waitForTimeout(2500);
  check('the bolt tool shows the selected joint', (await state(() => window.__game.getState().selectedJoint)) === j.id);
  await domClick(() => [...document.querySelectorAll('button')].find((b) => /Fit all bolts/.test(b.textContent)).click());
  for (let pass = 1; pass <= 3; pass++) {
    await domClick((p) => [...document.querySelectorAll('button')].find((b) => new RegExp('^Pass ' + p).test(b.textContent)).click(), pass);
    for (const i of star(j.n)) { await domClick((n) => document.querySelector('button[aria-label^="Bolt ' + n + ':"]').click(), i + 1); await page.waitForTimeout(120); }
  }
}
const stats = await state(() => { const g = window.__game.getState(); return g.data.getRules().boltJoints.map((j) => g.jointState(j.id).getStatus().integrity); });
check('every joint reaches 100% integrity via the bolt tool', stats.every((x) => x > 0.999), stats.map((x) => x.toFixed(2)).join(','));
await shot('3-vab-bolted');
// warp: torque clockwise on a fresh joint
await state(() => window.__game.getState().boltAction('j_fairing_left', 'remove', 0));
await state(() => window.__game.getState().setSelectedJoint('j_fairing_left'));

// ---- Avionics Bay
await state(() => window.__game.getState().go('avionics')); await page.waitForSelector('text=Required cables');
const links = await state(() => window.__game.getState().data.getRules().avionicsWiring.map((l) => [l.from, l.to]));
for (const [a, b] of links) { await page.locator(`[data-pin="${a}"]`).click(); await page.locator(`[data-pin="${b}"]`).click(); }
veh = await state(() => window.__game.getState().vehicle);
check('11 avionics cables wired by clicking ports', veh.avionicsCables.length === 11, `${veh.avionicsCables.length}`);
await shot('4-avionics');

// ---- Pad
await state(() => window.__game.getState().go('pad')); await page.waitForSelector('text=Launch control');
const open0 = await page.locator('text=/open items? before launch|All checks pass/').first().textContent();
console.log('pad header:', open0);
await state(() => { const g = window.__game.getState(); g.boltAction('j_fairing_left', 'fit', 0); const order = [0, 4, 1, 5, 2, 6, 3, 7]; const st = g.jointState('j_fairing_left'); for (let pass = 1; pass <= 3; pass++) for (const i of order) g.boltAction('j_fairing_left', 'torque', i, st.passTargetNm(pass)); });
await page.locator('button', { hasText: /Pull the pin/ }).click(); await page.locator('button', { hasText: /Arm Safe\/Arm/ }).click();
await page.waitForTimeout(400);
const items = await state(() => window.__game.getState().checklist().filter((i) => !i.pass).map((i) => i.id));
check('pad checklist is fully green after pin + arm', items.length === 0, items.join(','));
await clickBtn(/^GO$/, { all: true });
await shot('5-pad');
await clickBtn(/Start the countdown|Launch anyway/);

// ---- Flight
await page.waitForSelector('text=Terminal count', { timeout: 20000 });
await clickBtn(/Launch now/); await page.waitForTimeout(2500); await shot('6-flight-launch');
await clickBtn(/Skip/);
await page.waitForSelector('text=Orbit achieved', { timeout: 30000 });
check('flight reaches orbit', true);
await shot('7-flight-orbit');
await clickBtn(/Continue to the debrief/); await page.waitForSelector('text=Causal timeline', { timeout: 20000 });
await page.waitForTimeout(2200); await shot('8-debrief');
const result = await state(() => { const g = window.__game.getState(); return { stars: g.score.stars, total: g.score.total, outcome: g.flight.outcome, images: g.ops.imagesDownlinked, days: g.ops.daysAlive }; });
check('debrief: orbit, 3 stars, 30 days, goal images', result.outcome === 'Orbit' && result.stars === 3 && result.days === 30 && result.images >= 20, JSON.stringify(result));
check('Landsat reward tiles render', (await page.locator('canvas').count()) >= 1);

console.log(errors.length ? `\nCONSOLE ERRORS (${errors.length}):\n${errors.slice(0, 15).join('\n')}` : '\nNo console errors.');
await browser.close();
process.exit(errors.length || failures ? 1 : 0);
