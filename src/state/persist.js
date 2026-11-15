// localStorage helpers: every read/write is wrapped, because storage can be blocked (private windows, previews).
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
export const read = (key, fallback = null) => safe(() => { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }, fallback);
export const write = (key, value) => safe(() => { localStorage.setItem(key, JSON.stringify(value)); return true; }, false);
export const remove = (key) => safe(() => localStorage.removeItem(key), null);

export const KEYS = { save: 'tminus.save.v1', settings: 'tminus.settings.v1', leaderboard: 'tminus.leaderboard.v1', codex: 'tminus.codex.v1' };

export const loadSettings = (defaultQuality = 'high') => ({ houstonMode: 'On', language: 'en', volume: 0.7, reduceMotion: false, quality: defaultQuality, ...read(KEYS.settings, {}) });
export const saveSettings = (s) => write(KEYS.settings, s);

export function loadLeaderboard() { return read(KEYS.leaderboard, []); }
export function addLeaderboard(entry) {
  const rows = [...loadLeaderboard(), entry].sort((a, b) => b.score - a.score).slice(0, 10);
  write(KEYS.leaderboard, rows);
  return rows;
}

export const loadCodexProgress = () => new Set(read(KEYS.codex, []));
export const saveCodexProgress = (set) => write(KEYS.codex, [...set]);
