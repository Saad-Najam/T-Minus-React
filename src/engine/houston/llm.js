import { scan, nextStep } from './advisor.js';
import { matchCodex } from './whatIf.js';

/**
 * Port of HoustonLLMClient. Sends a small JSON packet + question to the optional proxy (proxy/api/houston.ts in the original repo),
 * and falls back to Space Guide text on timeout, error or when disabled. No API keys live in this app: the proxy URL is configured
 * by the player in Settings (stored in localStorage) or by /houston.config.json next to the page.
 */
export const LLM_CONFIG_KEY = 'tminus.houston.config';
const cache = new Map();

export async function loadLlmConfig() {
  try { const saved = JSON.parse(localStorage.getItem(LLM_CONFIG_KEY) || 'null'); if (saved) return saved; } catch { /* storage blocked */ }
  try {
    const r = await fetch('./houston.config.json');
    if (r.ok) return await r.json();
  } catch { /* no config file: offline mode */ }
  return { enabled: false, endpointUrl: '', timeoutSec: 15, clientToken: '', language: 'en' };
}

export function saveLlmConfig(cfg) { try { localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ } }

export function buildPacket(question, rec, ctx, game) {
  const codexIds = new Set(); if (rec?.codexId) codexIds.add(rec.codexId);
  for (const id of matchCodex(question, ctx.data, 5)) if (codexIds.size < 5) codexIds.add(id);
  const codex = [...codexIds].map((id) => ctx.data.getCodex(id)).filter(Boolean).map((c) => ({ id: c.id, title: c.title, shortText: c.short, longText: c.long }));
  const mission = ctx.data.getMission(ctx.missionId);
  return {
    mission: mission ? { id: mission.id, objective: mission.objective } : null, scene: ctx.scope, playerRole: game.crew?.[0]?.role ?? 'FlightDirector',
    currentStep: rec?.text, advisorRecommendation: rec?.text, faults: scan(ctx).slice(0, 5).map((f) => f.what), codex,
    events: game.events.all.slice(-10).map((e) => `[${e.time.toFixed(1)}s] ${e.system}/${e.code} ${e.message}`), language: game.settings.language,
  };
}

export function fallbackAnswer(question, rec, data) {
  const best = matchCodex(question, data, 1);
  if (best.length) { const e = data.getCodex(best[0]); if (e) return e.short ?? e.long ?? rec?.text ?? ''; }
  if (rec?.codexId) { const ce = data.getCodex(rec.codexId); if (ce) return `${rec.text} — ${ce.short}`; }
  return rec?.text ?? 'I\'m here to help. Ask me about any part, bolt, or cable.';
}

async function post(cfg, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (cfg.timeoutSec || 15) * 1000);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.clientToken) headers['x-houston-token'] = cfg.clientToken;
    const r = await fetch(cfg.endpointUrl, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok) return null;
    return (await r.json())?.text || null;
  } catch { return null; } finally { clearTimeout(timer); }
}

/** Ask HOUSTON. Returns { text, offline }. */
export async function askHouston(question, rec, ctx, game, cfg) {
  const fb = () => ({ text: fallbackAnswer(question, rec, ctx.data), offline: true });
  if (!cfg?.enabled || !cfg.endpointUrl) return fb();
  const key = `${question}|${rec?.text}|${scan(ctx).map((f) => f.why).join(',')}|${game.settings.language}`;
  if (cache.has(key)) return { text: cache.get(key), offline: false };
  const text = await post(cfg, { packet: buildPacket(question, rec, ctx, game), question });
  if (text) { cache.set(key, text); return { text, offline: false }; }
  return fb();
}

/** The AI's wording of the debrief facts (three sentences), or null when HOUSTON's AI is off. */
export async function narrateWithAi(cfg, packet) {
  if (!cfg?.enabled || !cfg.endpointUrl) return null;
  return post(cfg, { packet: { type: 'debrief', ...packet }, question: 'Narrate the debrief' });
}

export { nextStep };
