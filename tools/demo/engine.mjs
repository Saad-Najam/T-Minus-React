// Deterministic screen recorder for the T-MINUS demo video.
// It drives the real production site in GPU-accelerated Chrome with a CONTROLLED CLOCK (page.clock): every video frame is one fixed
// 1/30 s step of the page's time, followed by a screenshot. Nothing depends on how fast the machine renders, so the result is perfectly
// smooth, exactly timed 1080p30 footage of the actual website (captions and a cursor are drawn into the page itself).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const W = 1920, H = 1080, FPS = 30;
const frameMs = 1000 / FPS;

const DRY = !!process.env.DRY;
export async function startRecorder({ url, outDir, quality = DRY ? 'low' : 'high', jpegQuality = 94 }) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy', '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-features=TranslateUI'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.addInitScript((q) => {
    localStorage.setItem('tminus.settings.v1', JSON.stringify({ quality: q, houstonMode: 'On', volume: 0.7 }));
    ['bay', 'vab', 'avionics'].forEach((r) => localStorage.setItem(`tminus.guide.done.${r}`, 'true')); // no first-build tutorial bar in the demo
  }, quality);
  await page.clock.install({ time: new Date('2026-11-15T10:00:00Z') });
  await page.goto(url); await page.waitForSelector('h1', { timeout: 60000 });

  const cdp = await ctx.newCDPSession(page); const writes = [];
  const rec = { page, browser, errors, frame: 0, skipped: 0, marks: {}, cursor: { x: 960, y: 560, fromX: 960, fromY: 560, toX: 960, toY: 560, t: 1, dur: 1 }, recording: false, outDir };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  async function frameOnce() {
    const c = rec.cursor;
    if (c.t < 1) { c.t = Math.min(1, c.t + 1 / Math.max(1, c.dur * FPS)); const e = ease(c.t); c.x = c.fromX + (c.toX - c.fromX) * e; c.y = c.fromY + (c.toY - c.fromY) * e; }
    await page.mouse.move(c.x, c.y);
    await page.evaluate(([x, y]) => { const el = document.getElementById('__cur'); if (el) el.style.transform = `translate(${x}px,${y}px)`; }, [c.x, c.y]);
    await page.clock.runFor(frameMs);
    if (rec.recording && DRY) rec.frame++;
    else if (rec.recording) {
      // Make sure the GPU has finished drawing, then capture; if the picture is suspiciously small (a half-presented, black 3D canvas) take it again.
      await page.evaluate(() => { for (const c of document.querySelectorAll('canvas')) { const gl = c.getContext('webgl2') || c.getContext('webgl'); gl?.finish?.(); } });
      let shot = Buffer.alloc(0);
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: jpegQuality, optimizeForSpeed: true, fromSurface: true });
        shot = Buffer.from(data, 'base64');
        const prev = rec.lastSize ?? 0;
        if (!(prev > 150000 && shot.length < prev * 0.55)) break; // plausible frame
        rec.retakes = (rec.retakes ?? 0) + 1; await page.waitForTimeout(40 + attempt * 40);
      }
      rec.lastSize = shot.length;
      writes.push(fs.promises.writeFile(path.join(outDir, `f_${String(rec.frame).padStart(5, '0')}.jpg`), shot));
      if (writes.length > 24) await Promise.all(writes.splice(0));
      rec.frame++;
    }
  }
  rec.frames = async (n) => { for (let i = 0; i < n; i++) { await frameOnce(); if (process.env.STOP_SEC && rec.frame / FPS >= +process.env.STOP_SEC) { await rec.finish(); process.exit(0); } } };
  rec.wait = (sec) => rec.frames(Math.round(sec * FPS));
  rec.now = () => rec.frame / FPS;
  rec.untilFrame = async (f) => { const n = f - rec.frame; if (n < 0) console.log(`  !! story overran by ${(-n / FPS).toFixed(2)}s`); else await rec.frames(n); };
  rec.untilSec = (s) => rec.untilFrame(Math.round(s * FPS));
  /** Advance the page's time without capturing frames (a jump cut: countdown dead time, loading). */
  rec.skip = async (sec) => { await page.clock.runFor(sec * 1000); rec.skipped += sec; };
  rec.mark = (name) => { rec.marks[name] = +rec.now().toFixed(3); console.log(`  mark ${name} @ ${rec.marks[name]}s`); };

  // ----------------------------------------------------------------- cursor
  rec.moveTo = async (x, y, dur = 0.7) => { const c = rec.cursor; c.fromX = c.x; c.fromY = c.y; c.toX = x; c.toY = y; c.t = 0; c.dur = dur; await rec.wait(dur); };
  const center = async (loc, nth = 0) => { const l = typeof loc === 'string' ? page.locator(loc) : loc; const el = l.nth(nth); await el.scrollIntoViewIfNeeded().catch(() => {}); const b = await el.boundingBox(); if (!b) throw new Error(`no box for ${loc}`); return [b.x + b.width / 2, b.y + b.height / 2]; };
  rec.hover = async (loc, { dur = 0.7, nth = 0, hold = 0.15 } = {}) => { const [x, y] = await center(loc, nth); await rec.moveTo(x, y, dur); if (hold) await rec.wait(hold); };
  rec.click = async (loc, { dur = 0.7, nth = 0, after = 0.25 } = {}) => {
    const [x, y] = await center(loc, nth); await rec.moveTo(x, y, dur);
    await page.evaluate(([x, y]) => window.__ripple?.(x, y), [x, y]);
    await page.mouse.down(); await rec.frames(2); await page.mouse.up(); await rec.wait(after);
  };
  /** A click on an element that may be rapidly re-rendered: fire the DOM click after moving the cursor onto it. */
  rec.press = (key) => page.keyboard.press(key);
  rec.scroll = async (sel, to, dur = 1.2) => {
    const from = await page.evaluate((s) => document.querySelector(s)?.scrollTop ?? 0, sel); const n = Math.max(1, Math.round(dur * FPS));
    for (let i = 1; i <= n; i++) { const e = ease(i / n); await page.evaluate(([s, y]) => { const el = document.querySelector(s); if (el) el.scrollTop = y; }, [sel, from + (to - from) * e]); await frameOnce(); }
  };

  // ----------------------------------------------------------------- captions and cards (tweened on the page's own, controlled clock)
  rec.caption = (text, { fade = 350 } = {}) => page.evaluate(([t, f]) => window.__caption(t, f), [text, fade]);
  rec.card = (html, { fade = 500 } = {}) => page.evaluate(([h, f]) => window.__card(h, f), [html, fade]);

  rec.finish = async () => {
    rec.recording = false; await Promise.all(writes); await browser.close();
    const tlFile = path.join(outDir, '..', 'timeline.json'); let prevMarks = {};
    try { prevMarks = JSON.parse(fs.readFileSync(tlFile, 'utf8')).marks ?? {}; } catch { /* first run */ }
    fs.writeFileSync(tlFile, JSON.stringify({ fps: FPS, frames: rec.frame, marks: { ...prevMarks, ...rec.marks }, skipped: rec.skipped, retakes: rec.retakes ?? 0, errors }, null, 2));
  };
  return rec;
}

/** DOM overlay injected into the page: arrow cursor with click ripple, lower-third caption, full-screen title/end cards. */
export const OVERLAY = `
(() => {
  if (document.getElementById('__demo')) return;
  const css = document.createElement('style'); css.textContent = \`
    #__demo, #__demo * { box-sizing: border-box; }
    #__cur { position: fixed; left: 0; top: 0; z-index: 2147483000; pointer-events: none; will-change: transform; }
    #__cur svg { position: absolute; left: -3px; top: -2px; filter: drop-shadow(0 2px 5px rgba(0,0,0,.65)); }
    .__rip { position: fixed; z-index: 2147482990; pointer-events: none; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 3px solid #ff7a1a; box-shadow: 0 0 22px rgba(255,122,26,.85); }
    #__cap { position: fixed; left: 50%; bottom: 62px; z-index: 2147482000; pointer-events: none; transform: translateX(-50%); max-width: 1380px; padding: 16px 34px 16px 28px; border-radius: 18px;
      background: linear-gradient(160deg, rgba(10,16,34,.9), rgba(5,9,22,.92)); border: 1px solid rgba(110,150,230,.28); border-left: 5px solid #ff7a1a; box-shadow: 0 22px 60px -20px rgba(0,0,0,.9);
      color: #f2f6ff; font: 600 30px/1.3 Inter, system-ui, sans-serif; letter-spacing: .1px; opacity: 0; text-align: left; backdrop-filter: blur(10px); }
    #__cap b { color: #ffb36b; font-weight: 700; }
    #__card { position: fixed; inset: 0; z-index: 2147482500; pointer-events: none; opacity: 0; display: flex; align-items: center; justify-content: center; text-align: center;
      background: radial-gradient(ellipse at 50% 40%, rgba(12,22,48,.93), rgba(3,5,12,.97)); color: #f2f6ff; font-family: Inter, system-ui, sans-serif; }
  \`; document.head.appendChild(css);
  const root = document.createElement('div'); root.id = '__demo'; root.innerHTML = \`
    <div id="__cur"><svg width="34" height="40" viewBox="0 0 24 28"><path d="M3 2l17 11-7.6 1.5L9.5 22z" fill="#fff" stroke="#0a1020" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
    <div id="__cap"></div><div id="__card"></div>\`; document.body.appendChild(root);
  // tween opacity with the (controlled) page clock
  const tween = (el, to, ms) => { const from = parseFloat(el.style.opacity || '0'); const t0 = performance.now(); el.__t = t0;
    const step = (now) => { if (el.__t !== t0) return; const k = Math.min(1, (now - t0) / Math.max(1, ms)); el.style.opacity = String(from + (to - from) * k); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  window.__caption = (text, fade) => { const el = document.getElementById('__cap'); if (!text) { tween(el, 0, fade); return; } el.innerHTML = text; tween(el, 1, fade); };
  window.__card = (html, fade) => { const el = document.getElementById('__card'); if (!html) { tween(el, 0, fade); return; } el.innerHTML = html; tween(el, 1, fade); };
  window.__ripple = (x, y) => { const r = document.createElement('div'); r.className = '__rip'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 520); r.style.transform = 'scale(' + (1 + k * 4.5) + ')'; r.style.opacity = String(1 - k); if (k < 1) requestAnimationFrame(step); else r.remove(); }; requestAnimationFrame(step); };
})();`;
