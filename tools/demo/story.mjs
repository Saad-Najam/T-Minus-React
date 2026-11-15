// The 3-minute judges' demo of T-MINUS, recorded from the real production site. Scenes are sequential; each ends on an exact video time.
//   node tools/demo/story.mjs                 -> full 180 s cut into demo-work/frames
//   SCENES=3,4 node tools/demo/story.mjs      -> only those scenes (state is prepared through the store), into demo-work/test
import { startRecorder, OVERLAY, FPS } from './engine.mjs';

const URL = process.env.URL || 'http://localhost:5300/?hooks';
const only = process.env.SCENES ? process.env.SCENES.split(',').map(Number) : null;
const outDir = process.env.DRY ? 'demo-work/dry' : only ? 'demo-work/test' : 'demo-work/frames';
// scene boundaries (seconds of video)
const T = { s1: 0, s2: 10, s3: 22, s4: 52.5, s5: 79, s6: 101, s7: 111, s8: 141, s9: 154, s10: 171, end: 180 };

const rec = await startRecorder({ url: URL, outDir });
const { page } = rec;
const g = (fn, arg) => page.evaluate(fn, arg);
const btn = (re) => page.locator('button').filter({ hasText: re });
const pin = (a) => page.locator(`[data-pin="${a}"]`);
const run = (n) => !only || only.includes(n);

// ------------------------------------------------------------------ real-time setup: warm every lazy chunk, model and texture, then reset
console.log('warming up...');
await g(() => { const s = window.__game.getState(); s.applyDemo({ padReady: true }); });
for (const s of ['briefing', 'bay', 'vab', 'avionics', 'pad', 'guide', 'failure', 'settings', 'menu']) { await g((x) => window.__game.getState().go(x), s); await page.waitForTimeout(1600); }
await g(() => { const s = window.__game.getState(); s.go('flight'); }); await page.waitForTimeout(3500);
await g(() => { const s = window.__game.getState(); s.selectMission('moonshot'); s.go('vab'); }); await page.waitForTimeout(2500);
await g(() => { const s = window.__game.getState(); s.newBuild(); s.selectMission('floodwatch_1'); s.go('menu'); }); await page.waitForTimeout(1500);
await page.evaluate(OVERLAY);
{ const t = await g(() => Date.now()); await page.clock.pauseAt(new Date(t + 300)); await page.waitForTimeout(700); }
rec.recording = true; rec.frame = 0;
console.log('recording', only ? `scenes ${only}` : 'full demo');

// ------------------------------------------------------------------ state shortcuts for partial runs
const buildCube = () => g(() => { const s = window.__game.getState(); const d = s.applyDemo; d({ padReady: false }); });
async function prepare(n) {
  if (n >= 3) await g(() => { const s = window.__game.getState(); s.selectMission('floodwatch_1'); });
  if (n === 3) await g(() => window.__game.getState().go('bay'));
  if (n === 4) await g(() => { const s = window.__game.getState(); s.applyDemo({ padReady: false }); s.go('vab'); });
  if (n === 5) await g(() => { const s = window.__game.getState(); s.applyDemo({ padReady: false, badJoint: true }); s.go('pad'); });
  if (n === 7) await g(() => { const s = window.__game.getState(); s.applyDemo({ padReady: true, badJoint: true }); s.go('vab'); });
  if (n === 9) await g(() => window.__game.getState().go('menu'));
}
if (only) await prepare(only[0]);

// ================================================================== SCENE 1 — title (0-10)
if (run(1)) {
  rec.mark('s1');
  await rec.caption('<b>T-MINUS</b> &nbsp;·&nbsp; Rocket &amp; Mission Builder', { fade: 700 });
  await rec.moveTo(1180, 330, 3.0);
  await rec.caption('');
  await rec.wait(0.5);
  await rec.caption('Build it. Launch it. <b>Learn from it.</b>', { fade: 500 });
  await rec.moveTo(980, 520, 2.0);
  await rec.hover(btn(/Missions/), { dur: 1.3, hold: 0.2 });
  await rec.click(btn(/Missions/), { dur: 0.3, after: 0.1 });
  await rec.untilSec(T.s2);
}

// ================================================================== SCENE 2 — briefing (10-22)
if (run(2)) {
  rec.mark('s2');
  await rec.wait(0.9);
  await rec.caption('Pick a mission: <b>FloodWatch-1</b> — image the Indus floods for 30 days', { fade: 500 });
  await rec.hover(btn(/Moonshot/).first(), { dur: 1.1, hold: 0.9 });
  await rec.click(btn(/FloodWatch-1/).first(), { dur: 0.9, after: 0.6 });
  await rec.caption('');
  await rec.moveTo(1010, 560, 1.0);
  await rec.caption('Strict limits: <b>7.72 M$</b> budget &nbsp;·&nbsp; <b>4 kg</b> mass &nbsp;·&nbsp; power &amp; data', { fade: 500 });
  await rec.moveTo(1150, 760, 1.2);
  await rec.hover(btn(/Start building/), { dur: 0.9, hold: 0.2 });
  await rec.click(btn(/Start building/), { dur: 0.2, after: 0.1 });
  await rec.untilSec(T.s3);
}

// ================================================================== SCENE 3 — Integration Bay (22-50)
if (run(3)) {
  rec.mark('s3');
  await rec.wait(0.7);
  await rec.caption('<b>Integration Bay</b> — install every subsystem, with live budgets', { fade: 500 });
  const install = async (cat, nth = 0) => { await rec.click(btn(new RegExp(`^${cat}`)), { dur: 0.45, after: 0.1 }); await rec.click(btn(/Install/).nth(nth), { dur: 0.4, after: 0.18 }); };
  await install('Power'); await install('Battery'); await install('Switch'); await install('Computer');
  await install('Radio', 1); await install('Antenna', 1); await install('ADCS'); await install('Camera'); await install('Solar');
  await rec.wait(0.8);
  await rec.caption('Every number has a one-line <b>why</b>: mass, cost, power, battery, data', { fade: 500 });
  await rec.hover('text=Power (orbit average)', { dur: 1.0, hold: 1.2 });
  await rec.caption('');
  rec.mark('wire'); await rec.click(btn(/^Wire$/), { dur: 0.8, after: 0.9 });
  await rec.caption('Wire it: cables follow real rules — and appear on the satellite <b>in 3D</b>', { fade: 500 });
  const cables = [['solar_body/SOLAR_OUT_1', 'eps/SOLAR_IN_1'], ['batt_20/BATT', 'dep_switch/BATT_IN'], ['dep_switch/BATT_OUT', 'eps/BATT'], ['eps/PWR_OUT_1', 'obc/PWR_IN']];
  for (const [a, b] of cables) { await rec.click(pin(a), { dur: 0.45, after: 0.08 }); await rec.click(pin(b), { dur: 0.45, after: 0.15 }); }
  const rest = [['eps/PWR_OUT_2', 'radio_sband/PWR_IN'], ['eps/PWR_OUT_3', 'adcs_mag/PWR_IN'], ['eps/PWR_OUT_4', 'cam_wide/PWR_IN'], ['eps/DATA', 'obc/DATA_1'], ['radio_sband/DATA', 'obc/DATA_2'], ['adcs_mag/DATA', 'obc/DATA_3'], ['cam_wide/DATA', 'obc/DATA_4'], ['radio_sband/RF', 'ant_patch/RF']];
  await rec.moveTo(1640, 560, 0.8);
  for (const [a, b] of rest) { await g(([x, y]) => window.__game.getState().addCable(x, y, false), [a, b]); await rec.wait(0.3); }
  await rec.wait(1.2);
  await rec.hover('text=12 cables, no faults', { dur: 0.8, hold: 0.8 }).catch(() => {});
  await rec.caption('');
  await rec.click(btn(/To the VAB/), { dur: 0.9, after: 0.1 });
  await rec.untilSec(T.s4);
}

// ================================================================== SCENE 4 — VAB, bolting, HOUSTON (50-78)
if (run(4)) {
  rec.mark('s4');
  await rec.wait(1.1);
  await rec.caption('<b>VAB</b> — stack bottom-first; a wrong order is refused <b>with the reason</b>', { fade: 500 });
  for (let i = 0; i < 8; i++) await rec.click(btn(/^Add$/).first(), { dur: 0.4, after: 0.3 });
  await rec.wait(0.6);
  await rec.caption('Bolt every joint in <b>star order</b>, three torque passes — or it warps', { fade: 500 });
  await rec.click(btn(/interstage → stage 2/).first(), { dur: 0.8, after: 0.7 });
  await rec.click(btn(/Fit all bolts/), { dur: 0.6, after: 0.3 });
  await rec.click(btn(/^Pass 1/), { dur: 0.5, after: 0.2 });
  for (const i of [1, 7, 4, 10]) await rec.click(`button[aria-label^="Bolt ${i}:"]`, { dur: 0.4, after: 0.18 });
  // the rest of the joints get the full treatment quickly (same store action the bolt tool calls)
  await rec.caption('');
  const star = (n) => { const o = []; if (n % 4 === 0) { for (let k = 0; k < n / 4; k++) o.push(k, k + n / 2, k + n / 4, k + (3 * n) / 4); } else { const h = Math.floor((n + 1) / 2); for (let i = 0; i < h; i++) { o.push(i); if (i + h < n) o.push(i + h); } } return o; };
  const doJoint = async (id, pace) => {
    await g((j) => { const s = window.__game.getState(); s.setSelectedJoint(j); s.boltAction(j, 'fitAll'); }, id);
    for (let p = 1; p <= 3; p++) {
      const n = await g((j) => window.__game.getState().jointState(j).count, id);
      for (const i of star(n)) { await g(([j, i2, p2]) => { const s = window.__game.getState(); s.boltAction(j, 'torque', i2, s.jointState(j).passTargetNm(p2)); }, [id, i, p]); if (pace) await rec.wait(pace); }
    }
  };
  await doJoint('j_interstage_s2', 0.05);
  await doJoint('j_payload_adapter', 0); await doJoint('j_fairing_left', 0); await doJoint('j_fairing_right', 0);
  await rec.wait(0.5);
  rec.mark('rush');
  await rec.caption('Joint 1 — rushed: <b>clockwise, one pass, 3 bolts missing</b>', { fade: 500 });
  await rec.click(btn(/stage 1 → interstage/).first(), { dur: 0.9, after: 0.5 });
  await g(() => { const s = window.__game.getState(); s.boltAction('j_s1_interstage', 'fitAll'); for (const i of [9, 10, 11]) s.boltAction('j_s1_interstage', 'remove', i); });
  for (let i = 0; i < 9; i++) { await g((k) => window.__game.getState().boltAction('j_s1_interstage', 'torque', k, 45), i); await rec.wait(0.09); }
  await rec.wait(0.9);
  await rec.caption('<b>HOUSTON</b> scans the build and explains every problem', { fade: 500 });
  await rec.press('h'); await rec.wait(0.9);
  await rec.click(btn(/^Scan/), { dur: 0.8, after: 1.6 });
  await rec.press('h'); await rec.wait(0.3);
  await rec.caption('');
  await g(() => window.__game.getState().go('avionics')); await rec.wait(0.9);
  await rec.caption('Avionics ring: 11 cables — a missing one has a flight consequence', { fade: 500 });
  const links = await g(() => window.__game.getState().data.getRules().avionicsWiring.map((l) => [l.from, l.to]));
  for (const [a, b] of links) { await g(([x, y]) => window.__game.getState().addAvionicsCable(x, y), [a, b]); await rec.wait(0.13); }
  await rec.wait(0.6);
  await rec.untilSec(T.s5);
}

// ================================================================== SCENE 5 — pad + failed launch (78-100)
if (run(5)) {
  rec.mark('s5');
  await g(() => window.__game.getState().go('pad')); await rec.wait(1.2);
  await rec.caption('Pad checklist: <b>joints FAIL</b> — the crew launches anyway…', { fade: 500 });
  await rec.click(btn(/Pull the pin/), { dur: 0.7, after: 0.15 }); await rec.click(btn(/Arm Safe\/Arm/), { dur: 0.5, after: 0.3 });
  await rec.hover('text=Every joint torqued in star order', { dur: 0.7, hold: 0.9 });
  for (let i = 0; i < 4; i++) await rec.click(btn(/^GO$/).nth(i), { dur: 0.3, after: 0.1 });
  await rec.click(btn(/Start the countdown|Launch anyway/), { dur: 0.6, after: 0.1 });
  await page.waitForSelector('text=Terminal count', { timeout: 60000 }); await rec.wait(0.9);
  await rec.caption('Real physics: gravity, drag, thrust that changes with altitude', { fade: 500 });
  await rec.click(btn(/Launch now/), { dur: 0.7, after: 0.1 });
  rec.mark('fail_launch');
  await rec.wait(2.4); await rec.press('3');
  for (let i = 0; i < 40 * FPS; i++) { const boom = await g(() => window.__flight?.exploded != null); await rec.frames(1); if (boom) break; }
  rec.mark('fail_boom');
  await rec.caption('<b>Max-Q</b> — the joint fails. Vehicle lost.', { fade: 400 });
  await rec.wait(4.2);
  await rec.caption('');
  await page.waitForSelector('text=Continue to the debrief', { timeout: 20000 });
  await rec.untilSec(T.s6 - 1.4);
  await rec.click(btn(/Continue to the debrief/), { dur: 0.8, after: 0.1 });
  await rec.untilSec(T.s6);
}

// ================================================================== SCENE 6 — failed debrief (100-112)
if (run(6)) {
  rec.mark('s6');
  await rec.wait(1.4);
  await rec.caption('The debrief traces the <b>cause</b> — not just “you failed”', { fade: 500 });
  await rec.hover('text=Causal timeline', { dur: 1.0, hold: 0.3 });
  await rec.scroll('ol.relative', 9999, 3.0).catch(() => {});
  await rec.wait(1.2);
  await rec.hover('text=Top fixes', { dur: 1.0, hold: 1.0 }).catch(() => {});
  await rec.caption('');
  await rec.untilSec(T.s7 - 1.2);
  await rec.click(btn(/Redesign/), { dur: 0.9, after: 0.1 });
  await rec.untilSec(T.s7);
}

// ================================================================== SCENE 7 — fix and reach orbit (112-146)
if (run(7)) {
  rec.mark('s7');
  await rec.wait(0.8);
  await rec.caption('Fix it: all 12 bolts, <b>star order</b>, three passes', { fade: 500 });
  await rec.click(btn(/stage 1 → interstage/).first(), { dur: 0.8, after: 0.4 });
  await g(() => { const s = window.__game.getState(); for (let i = 0; i < 12; i++) s.boltAction('j_s1_interstage', 'remove', i); });
  await rec.wait(0.4);
  await g(() => window.__game.getState().boltAction('j_s1_interstage', 'fitAll'));
  const star = (n) => { const o = []; for (let k = 0; k < n / 4; k++) o.push(k, k + n / 2, k + n / 4, k + (3 * n) / 4); return o; };
  for (let p = 1; p <= 3; p++) for (const i of star(12)) { await g(([k, p2]) => { const s = window.__game.getState(); s.boltAction('j_s1_interstage', 'torque', k, s.jointState('j_s1_interstage').passTargetNm(p2)); }, [i, p]); await rec.wait(0.055); }
  await rec.wait(0.5);
  await rec.caption('');
  await rec.click(btn(/To the pad/), { dur: 0.8, after: 0.1 });
  await page.waitForSelector('text=Launch control', { timeout: 30000 }); await rec.wait(0.6);
  await rec.click(btn(/Start the countdown|Launch anyway/), { dur: 0.7, after: 0.1 });
  await page.waitForSelector('text=Terminal count', { timeout: 60000 }); await rec.wait(0.5);
  await rec.caption('Second attempt: <b>countdown</b>…', { fade: 400 });
  await rec.click(btn(/Start countdown/), { dur: 0.7, after: 0.1 });
  await rec.skip(6.5); await rec.wait(3.6);
  rec.mark('ok_launch');
  await rec.caption('Stage separation · fairing release · <b>orbit</b>', { fade: 400 });
  await rec.press('3'); await rec.wait(4.2);
  await g(() => window.__flight?.jumpTo(118)); await rec.wait(4.8);
  await g(() => window.__flight?.jumpTo(186)); await rec.wait(2.8);
  await rec.press('4'); await g(() => window.__flight?.jumpTo(2330)); await rec.press('c'); await rec.press('c'); await rec.wait(2.0);
  await rec.caption('<b>Orbit achieved</b> — the CubeSat deploys', { fade: 400 });
  for (let i = 0; i < 10 * FPS; i++) { const done = await g(() => window.__flight?.ended); await rec.frames(1); if (done) break; }
  rec.mark('ok_orbit');
  await rec.wait(1.6);
  await rec.caption('');
  await page.waitForSelector('text=Continue to the debrief', { timeout: 20000 });
  await rec.untilSec(T.s8 - 1.2);
  await rec.click(btn(/Continue to the debrief/), { dur: 0.7, after: 0.1 });
  await rec.untilSec(T.s8);
}

// ================================================================== SCENE 8 — success debrief (146-162)
if (run(8)) {
  rec.mark('s8');
  await rec.wait(1.0);
  await rec.caption('<b>30 days</b> of operations: power · storage · downlink → <b>3 stars</b>', { fade: 500 });
  await rec.wait(3.2);
  await rec.caption('');
  await rec.scroll('div.overflow-y-auto.p-3, div.grid.overflow-y-auto', 700, 2.0).catch(() => {});
  await rec.wait(0.6);
  await rec.caption('Real <b>NASA Landsat</b> images of the 2022 floods — at <b>your camera’s</b> resolution', { fade: 500 });
  await rec.scroll('div.overflow-y-auto.p-3, div.grid.overflow-y-auto', 1500, 2.6).catch(() => {});
  await rec.wait(2.2);
  await rec.caption('');
  await rec.untilSec(T.s9);
}

// ================================================================== SCENE 9 — more features montage (162-175)
if (run(9)) {
  rec.mark('s9');
  await g(() => { const s = window.__game.getState(); s.selectMission('moonshot'); s.go('vab'); }); await rec.wait(0.6);
  await rec.caption('<b>Moonshot</b> — fly a detailed Saturn V to parking orbit', { fade: 400 });
  await rec.moveTo(900, 500, 1.0); await rec.wait(2.6);
  await g(() => window.__game.getState().go('failure')); await rec.wait(0.5);
  await rec.caption('<b>Failure Lab</b> — repair real spaceflight failures, Apollo 12 included', { fade: 400 });
  await rec.hover(btn(/Take the job/).first(), { dur: 0.9, hold: 2.0 });
  await g(() => window.__game.getState().go('guide')); await rec.wait(0.4);
  await rec.caption('<b>Space Guide</b> — 28 topics with sources and quizzes', { fade: 400 });
  await rec.moveTo(760, 420, 0.9); await rec.wait(2.2);
  await rec.caption('Works on <b>phones, tablets and desktops</b>', { fade: 400 });
  await g(() => {
    const f = document.createElement('div'); f.id = '__phone'; f.style.cssText = 'position:fixed;right:90px;top:90px;z-index:2147481000;width:392px;height:850px;border-radius:44px;border:10px solid #151b2e;box-shadow:0 40px 100px rgba(0,0,0,.8),0 0 0 2px #2b3556;overflow:hidden;background:#04070f';
    f.innerHTML = '<iframe src="/?hooks" style="width:372px;height:830px;border:0"></iframe>'; document.body.appendChild(f);
  });
  await rec.wait(2.2);
  await g(() => { const w = document.querySelector('#__phone iframe')?.contentWindow; w?.__game?.getState().go('briefing'); });
  await rec.wait(2.5);
  await g(() => { const w = document.querySelector('#__phone iframe')?.contentWindow; w?.__game?.getState().go('bay'); });
  await rec.untilSec(T.s10);
}

// ================================================================== SCENE 10 — end card (175-180)
if (run(10)) {
  rec.mark('s10');
  await rec.caption('');
  await rec.card(`<div><div style="font:700 150px/1 Rajdhani,Inter,sans-serif;letter-spacing:.06em">T<span style="color:#ff7a1a">–</span>MINUS</div>
    <div style="margin-top:22px;font:600 44px Inter,sans-serif;color:#cdd9f5">Build it. Launch it. <span style="color:#ffb36b">Learn from it.</span></div>
    <div style="margin-top:46px;font:500 28px Inter,sans-serif;color:#8a98b8">React · Three.js · Vite &nbsp;|&nbsp; real flight physics · 3D wiring · HOUSTON mentor</div>
    <div style="margin-top:22px;font:600 30px 'JetBrains Mono',monospace;color:#38d6ff">github.com/Saad-Najam/T-Pulse-React</div>
    <div style="margin-top:38px;font:400 20px Inter,sans-serif;color:#5d6c90">NASA Space Apps Challenge 2026 · Space Mission Design Game · Not affiliated with or endorsed by NASA</div></div>`, { fade: 700 });
  await rec.untilSec(T.end);
}

console.log(`done: ${rec.frame} frames = ${(rec.frame / FPS).toFixed(1)} s; page errors: ${rec.errors.length ? rec.errors.join(' | ') : 'none'}`);
await rec.finish();
