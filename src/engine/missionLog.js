import { read, write } from '../state/persist.js';

// Port of MissionLog: every debriefed flight, kept in this browser (the debrief compares with your last attempt; mission cards show your best).
const KEY = 'tminus.missionlog.v1';
export const MAX_ENTRIES = 50;
let recordedFlight = null; let previousOfRecorded = null;

export const loadLog = () => read(KEY, []);
export const forMission = (missionId) => loadLog().filter((e) => e.missionId === missionId).sort((a, b) => (a.whenUtc < b.whenUtc ? 1 : -1));
export const bestOf = (missionId) => loadLog().filter((e) => e.missionId === missionId).sort((a, b) => b.score - a.score)[0] ?? null;
export const attempts = (missionId) => loadLog().filter((e) => e.missionId === missionId).length;

/** Adds the entry once per flight (the debrief can be opened again for the same flight). Returns the attempt before this one, or null. */
export function recordOnce(flight, entry) {
  if (recordedFlight === flight) return previousOfRecorded;
  previousOfRecorded = forMission(entry.missionId)[0] ?? null;
  recordedFlight = flight;
  let all = loadLog();
  all.push({ ...entry, whenUtc: new Date().toISOString() });
  if (all.length > MAX_ENTRIES) all = all.sort((a, b) => (a.whenUtc < b.whenUtc ? 1 : -1)).slice(0, MAX_ENTRIES);
  write(KEY, all);
  return previousOfRecorded;
}

// A cell that starts with = + - @ can run as a formula in a spreadsheet: neutralise it. Same CSV columns as the Unity version, so the teacher page reads both.
const csv = (v) => {
  let s = v == null ? '' : String(v);
  if (s.length > 0 && '=+-@'.includes(s[0])) s = `'${s}`;
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const CSV_HEADER = 'students,date_utc,mission,score,stars,outcome,failure_code,failure_cause';
export const csvRow = (students, e) => [csv(students), csv(e.whenUtc), csv(e.missionId), e.score.toFixed(1), String(e.stars), csv(e.outcome), csv(e.code), csv(e.cause)].join(',');
export const toCsv = (students) => `${CSV_HEADER}\n${loadLog().sort((a, b) => (a.whenUtc < b.whenUtc ? -1 : 1)).map((e) => csvRow(students, e)).join('\n')}\n`;
export const starText = (n) => '★'.repeat(Math.max(0, Math.min(3, n))) + '☆'.repeat(3 - Math.max(0, Math.min(3, n)));
