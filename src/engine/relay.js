// Port of CrewRelay (audit F20 / F25): live rooms with no server of our own. A free public message service (ntfy.sh) carries crew votes,
// the host's pad code and class results. A room is a random topic name; whoever knows the code can read and send in it, which is why the code
// is long, and why a vote only counts for the exact build it was made for. Only crew vote codes, pad codes and result rows travel through it.
export const BASE_URL = 'https://ntfy.sh/';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I: a code is read aloud and typed
export const PAD_PREFIX = 'PAD:';
export const MAX_PAD_LENGTH = 3800; // the service refuses a message over 4096 bytes

/** For example "K7QF-3MXA-RD2T": 12 characters from 32, about 60 bits. */
export function newRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12)); let out = '';
  for (let i = 0; i < 12; i++) { if (i > 0 && i % 4 === 0) out += '-'; out += ALPHABET[bytes[i] % ALPHABET.length]; }
  return out;
}
export const normalise = (room) => (room ?? '').trim().toUpperCase().replace(/ /g, '').replace(/-/g, '');
export const isValid = (room) => { const r = normalise(room); return r.length === 12 && [...r].every((c) => ALPHABET.includes(c)); };
export const topic = (room) => `tminus-${normalise(room).toLowerCase()}`;
/** A class room: students send results here and the teacher page (public/teacher.html) shows them live. */
export const classTopic = (code) => `tminus-class-${normalise(code).toLowerCase()}`;

async function send(t, text) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 10000);
  try { const r = await fetch(BASE_URL + t, { method: 'POST', body: text ?? '', headers: { 'Content-Type': 'text/plain' }, signal: ctrl.signal }); return r.ok; } catch { return false; } finally { clearTimeout(timer); }
}
export const publishToTopic = (t, text) => send(t, text);
export const publish = (room, text) => (isValid(room) ? send(topic(room), text) : Promise.resolve(false));

/** The service answers with one JSON object per line; only lines with event "message" are crew messages. */
export function parseMessages(ndjson) {
  const list = [];
  for (const line of (ndjson ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o.event === 'message' && o.message && o.message.length <= 4096) list.push({ id: o.id, text: o.message }); } catch { /* not JSON: skipped */ }
  }
  return list;
}
/** Messages since a given id (or the last 30 minutes the first time). null when it could not be reached. */
export async function poll(room, sinceId) {
  if (!isValid(room)) return null;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 10000);
  try { const r = await fetch(`${BASE_URL}${topic(room)}/json?poll=1&since=${sinceId || '30m'}`, { signal: ctrl.signal }); return r.ok ? parseMessages(await r.text()) : null; } catch { return null; } finally { clearTimeout(timer); }
}
export const padMessage = (padCode) => (!padCode || padCode.length > MAX_PAD_LENGTH ? null : PAD_PREFIX + padCode);
export function latestPad(messages) {
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) if (messages[i].text?.startsWith(PAD_PREFIX)) return messages[i].text.slice(PAD_PREFIX.length).trim();
  return null;
}
