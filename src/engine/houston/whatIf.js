import { computeSpacecraftReport, BudgetStatus } from '../budget.js';

// Port of WhatIf + DesignCompare + CodexMatcher: "What if I use the HD camera?" answered from the game's own budget numbers, offline.
const SWAPS = [
  [['hd camera', 'imaging camera', 'hd cam', '5 m/pixel'], 'cam_hd'], [['wide camera', 'wide cam', '100 m/pixel'], 'cam_wide'],
  [['s-band', 'sband', 's band'], 'radio_sband'], [['uhf'], 'radio_uhf'], [['reaction wheel', 'star tracker', 'wheels'], 'adcs_rw'],
  [['magnetorquer'], 'adcs_mag'], [['solar wings', 'deployable wings', 'wings'], 'solar_wings'], [['body panel', 'body-mounted', 'body solar'], 'solar_body'],
  [['40 wh', '40wh', 'bigger battery', 'larger battery'], 'batt_40'], [['20 wh', '20wh', 'smaller battery'], 'batt_20'],
];
const TRIGGERS = ['what if', 'what would happen', 'swap', 'replace', 'instead of', 'switch to', 'change to'];
const codexFor = (cat) => ({ camera: 'gsd', radio: 'downlink', adcs: 'adcs', solar: 'eclipse', battery: 'battery_dod' }[cat] ?? 'eps');

export function looksLikeWhatIf(question) {
  const q = (question ?? '').toLowerCase();
  return TRIGGERS.some((t) => q.includes(t)) && SWAPS.some(([keys]) => keys.some((k) => q.includes(k)));
}

const statusWord = (s) => (s === BudgetStatus.Green ? 'OK' : s === BudgetStatus.Yellow ? 'tight' : 'RED');
function metric(name, before, after, unit, better = 'higher') {
  const d = after - before;
  const fmt = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
  if (Math.abs(d) < 1e-9) return `${name}: ${fmt(before)}${unit} (no change)`;
  const good = better === 'lower' ? d < 0 : d > 0;
  return `${name}: ${fmt(before)}${unit} → ${fmt(after)}${unit} (${good ? 'better' : 'worse'})`;
}

export function evaluateWhatIf(question, data, design, mission, rocket) {
  if (!looksLikeWhatIf(question)) return null;
  const q = question.toLowerCase();
  const newId = SWAPS.find(([keys]) => keys.some((k) => q.includes(k)))[1];
  const newDef = data.getPart(newId);
  if (!newDef) return null;
  const copy = JSON.parse(JSON.stringify(design));
  const existing = copy.parts.find((p) => data.getPart(p.partId)?.category === newDef.category);
  let oldName = 'nothing';
  if (existing) {
    if (existing.partId === newId) return { action: 'WhatIf', text: `You already use the ${newDef.name}. Ask about a different part to compare.`, reasonCode: 'what_if_same', codexId: codexFor(newDef.category) };
    oldName = data.getPart(existing.partId)?.name ?? existing.partId;
    existing.partId = newId;
  } else copy.parts.push({ instanceId: newId, partId: newId, mountId: null });
  const b = computeSpacecraftReport(design, data, mission, rocket); const a = computeSpacecraftReport(copy, data, mission, rocket);
  const lines = [
    metric('Mass', b.massKg, a.massKg, ' kg', 'lower'), metric('Cost', b.totalCostM, a.totalCostM, ' M$', 'lower'), metric('Power margin', b.marginW, a.marginW, ' W'),
    metric('Battery needed', b.requiredBatteryWh, a.requiredBatteryWh, ' Wh', 'lower'), metric('Images reaching the ground', b.imagesDownlinkedMission, a.imagesDownlinkedMission, ''),
    metric('Detail per pixel', b.gsdM, a.gsdM, ' m', 'lower'), metric('Pointing quality', b.pointingQuality, a.pointingQuality, ''),
  ];
  const status = `Power ${statusWord(b.power)} → ${statusWord(a.power)}  ·  Data ${statusWord(b.data)} → ${statusWord(a.data)}  ·  Pointing ${statusWord(b.pointing)} → ${statusWord(a.pointing)}`;
  return { action: 'WhatIf', reasonCode: 'what_if', codexId: codexFor(newDef.category),
    text: `WHAT IF: ${newDef.name} instead of ${oldName}?\n${lines.join('\n')}\n${status}\n(Numbers from the same budget model as the Integration Bay. Nothing was changed in your build.)` };
}

// ---------------------------------------------------------------- CodexMatcher
const STOP = new Set(['the', 'and', 'for', 'what', 'why', 'how', 'does', 'did', 'are', 'was', 'with', 'this', 'that', 'from', 'have', 'need', 'into', 'about', 'your', 'you', 'can', 'its', 'use', 'used']);
const words = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter((w) => w.length >= 2 && !STOP.has(w));

/** Finds the Space Guide entries a free-text question is about (whole-word hits on id and title). */
export function matchCodex(question, data, max = 3) {
  if (!data || !question?.trim()) return [];
  const q = new Set(words(question));
  for (const w of [...q]) if (w.length > 3 && w.endsWith('s')) q.add(w.slice(0, -1));
  const scored = [];
  for (const e of data.codex) {
    const keys = new Set([...words(e.title), ...words((e.id ?? '').replace(/_/g, ' '))]);
    let score = 0;
    for (const k of keys) if (q.has(k) || (k.length > 3 && k.endsWith('s') && q.has(k.slice(0, -1)))) score++;
    if (score > 0) scored.push({ id: e.id, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, max).map((s) => s.id);
}
