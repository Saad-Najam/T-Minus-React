// Screenshots the main rooms at phone and tablet sizes and reports horizontal overflow / unreachable content.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const url = process.argv[2] || 'http://localhost:5199/';
const out = fileURLToPath(new URL('../../shots/', import.meta.url));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
for (const [name, w, h] of (process.env.SIZES ? JSON.parse(process.env.SIZES) : [['phone', 390, 844], ['phone-land', 844, 390], ['tablet', 820, 1100], ['laptop', 1366, 768], ['desktop', 1920, 1080]])) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: name.startsWith('phone') || name === 'tablet', isMobile: name.startsWith('phone') });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  await page.addInitScript(() => localStorage.setItem('tminus.settings.v1', JSON.stringify({ quality: 'low' })));
  await page.goto(url); await page.waitForSelector('h1');
  for (const s of (process.env.ROOMS ? process.env.ROOMS.split(',') : ['menu', 'bay', 'vab', 'pad', 'flight', 'debrief'])) {
    await page.evaluate((x) => { const g = window.__game.getState(); if (['vab', 'pad', 'avionics', 'flight'].includes(x)) g.applyDemo({ padReady: true }); g.go(x); }, s);
    await page.waitForTimeout(3000);
    const m = await page.evaluate(() => { const de = document.documentElement; const wide = [...document.querySelectorAll('main *, h1, button')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 2) && getComputedStyle(e).position !== 'fixed' && !e.closest('[class*=overflow-auto],[class*=overflow-x]'); }).length; const main = document.querySelector('main'); return { wide, sw: de.scrollWidth, cw: de.clientWidth, mainScroll: main ? main.scrollHeight > main.clientHeight + 4 : null, mainOverflowY: main ? getComputedStyle(main).overflowY : null }; });
    console.log(name, s, JSON.stringify(m), m.sw > m.cw + 2 ? 'HORIZONTAL OVERFLOW' : '');
    await page.screenshot({ path: `${out}resp-${name}-${s}.png`, timeout: 150000 });
  }
  await page.close();
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
