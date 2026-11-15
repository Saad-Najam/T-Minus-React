import { BoltJointState, starOrder } from './bolts.js';

// Design model (port of TMinus.Core Designs / DesignCode / DesignValidator / CrewCodes). Field names match the Unity game,
// so a design code made in either version loads in the other.
export const CrewRole = { FlightDirector: 'FlightDirector', PropulsionStructures: 'PropulsionStructures', SpacecraftComms: 'SpacecraftComms', ScienceBudget: 'ScienceBudget' };
export const roleName = (r) => ({ FlightDirector: 'Flight Director', PropulsionStructures: 'Propulsion & Structures', SpacecraftComms: 'Spacecraft & Comms' }[r] ?? 'Science & Budget');

export const newSpacecraft = () => ({ parts: [], cables: [], rbfPinPulled: false, orbitAltitudeKm: 550 });
export const newVehicle = () => ({ rocketId: 'pathfinder', parts: [], bolts: [], jointWarps: [], avionicsCables: [], armed: false, pitchKickDeg: 3, launchSiteId: 'sonmiani' });
export const newLaunch = () => ({ knownFailures: [], poll: [], noGoRounds: 0, launched: false, remoteVotes: [] });
export const newFlight = () => ({ flown: false, orbitAchieved: false, deployed: false, outcome: '', failureCode: '', failureCause: '', maxQKPa: 0, maxQTimeS: 0,
  apoapsisKm: 0, periapsisKm: 0, flightTimeS: 0, flightOnly: false, deltaVLeftMs: 0, telemetry: [] });
export const newSettings = () => ({ houstonMode: 'On', language: 'en', hintsUsed: [0, 0, 0] });

// ---------------------------------------------------------------- design codes ("TM1-" + base64(gzip(json)))
export const CODE_PREFIX = 'TM1-';
const MAX_JSON_CHARS = 512 * 1024;
const toBase64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function pipeBytes(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeDesign(bundle) {
  const json = JSON.stringify({ v: 1, ...bundle });
  const gz = await pipeBytes(new TextEncoder().encode(json), new CompressionStream('gzip'));
  return CODE_PREFIX + toBase64(gz);
}

export async function decodeDesign(code) {
  try {
    let c = (code || '').trim();
    if (c.startsWith(CODE_PREFIX)) c = c.slice(CODE_PREFIX.length);
    const raw = await pipeBytes(fromBase64(c), new DecompressionStream('gzip'));
    // A pasted code is untrusted: stop a "zip bomb" from eating memory (real codes are a few kB).
    if (raw.length > MAX_JSON_CHARS * 4) return { bundle: null, error: 'That design code is too large.' };
    const bundle = JSON.parse(new TextDecoder().decode(raw));
    if (!bundle) return { bundle: null, error: 'Empty design code.' };
    bundle.spacecraft = { ...newSpacecraft(), ...(bundle.spacecraft || {}) };
    bundle.vehicle = { ...newVehicle(), ...(bundle.vehicle || {}) };
    return { bundle, error: null };
  } catch (e) {
    return { bundle: null, error: `That isn't a valid design code (${e.name || 'Error'}).` };
  }
}

/** Cleans a design that came from outside (pasted code, save file). Unknown ids and out-of-range numbers are dropped or clamped. */
export function cleanDesign(b, data) {
  if (!b || !data) return 0;
  let fixed = 0;
  const rules = data.getRules();
  b.spacecraft = b.spacecraft || newSpacecraft(); b.vehicle = b.vehicle || newVehicle();
  const sc = b.spacecraft; const v = b.vehicle;
  sc.parts = sc.parts || []; sc.cables = sc.cables || []; v.parts = v.parts || []; v.bolts = v.bolts || []; v.jointWarps = v.jointWarps || []; v.avionicsCables = v.avionicsCables || [];
  const clamp = (x, lo, hi) => (Number.isNaN(x) || x == null ? lo : Math.max(lo, Math.min(hi, x)));
  const drop = (arr, pred) => { const n = arr.length; const keep = arr.filter((x) => !pred(x)); arr.length = 0; arr.push(...keep); return n - keep.length; };

  const mission = b.missionId ? data.getMission(b.missionId) : null;
  if (!mission || mission.locked) { if (b.missionId) fixed++; b.missionId = 'floodwatch_1'; }
  if (!data.getRocket(v.rocketId)) { v.rocketId = 'pathfinder'; fixed++; }
  if (!rules.getLaunchSite(v.launchSiteId)) { v.launchSiteId = rules.launchSites[0]?.id ?? 'sonmiani'; fixed++; }
  const orbit = clamp(sc.orbitAltitudeKm, 150, 2000); if (Math.abs(orbit - sc.orbitAltitudeKm) > 1e-9) { sc.orbitAltitudeKm = orbit; fixed++; }
  const kick = clamp(v.pitchKickDeg, 0, 10); if (Math.abs(kick - v.pitchKickDeg) > 1e-9) { v.pitchKickDeg = kick; fixed++; }

  const seen = new Set();
  fixed += drop(sc.parts, (p) => !p || !p.instanceId || !data.getPart(p.partId) || seen.has(p.instanceId) || !seen.add(p.instanceId));
  const instances = new Set(sc.parts.map((p) => p.instanceId));
  const dev = (a) => (a && a.indexOf('/') > 0 ? a.slice(0, a.indexOf('/')) : null);
  const portOk = (c, set) => c && dev(c.fromPort) && dev(c.toPort) && set.has(dev(c.fromPort)) && set.has(dev(c.toPort));
  fixed += drop(sc.cables, (c) => !portOk(c, instances));
  fixed += drop(v.parts, (p) => !p || !p.instanceId || !p.partId);
  const joints = new Map(rules.boltJoints.map((j) => [j.id, j.boltCount]));
  fixed += drop(v.bolts, (x) => !x || !joints.has(x.jointId) || x.boltIndex < 0 || x.boltIndex >= joints.get(x.jointId));
  for (const x of v.bolts) if (Number.isNaN(x.torqueNm) || x.torqueNm < 0 || x.torqueNm > 1000) { x.torqueNm = clamp(x.torqueNm, 0, 1000); fixed++; }
  fixed += drop(v.jointWarps, (w) => !w || !joints.has(w.jointId));
  for (const w of v.jointWarps) if (w.count < 0 || w.count > 99) { w.count = clamp(w.count, 0, 99); fixed++; }
  const avionics = new Set(data.parts.filter((p) => p.assembly === 'avionics').map((p) => p.id));
  fixed += drop(v.avionicsCables, (c) => !portOk(c, avionics));
  return fixed;
}

// ---------------------------------------------------------------- crew roles and remote votes
export function assignRoles(players) {
  const roles = [CrewRole.FlightDirector, CrewRole.PropulsionStructures, CrewRole.SpacecraftComms, CrewRole.ScienceBudget];
  const n = Math.max(1, Math.min(4, players.length));
  const owner = n === 1 ? [0, 0, 0, 0] : n === 2 ? [0, 1, 1, 0] : n === 3 ? [0, 1, 2, 0] : [0, 1, 2, 3];
  return roles.map((role, i) => ({ name: players[owner[i]] ?? `Player ${owner[i] + 1}`, role }));
}

export const VOTE_PREFIX = 'TMV1-';
export function designHash(bundle) {
  // FNV-1a (64-bit) over the design's JSON, so a vote for an older build is noticed.
  let h = 14695981039346656037n;
  const json = JSON.stringify({ v: 1, ...bundle });
  for (let i = 0; i < json.length; i++) { h ^= BigInt(json.charCodeAt(i)); h = (h * 1099511628211n) & 0xffffffffffffffffn; }
  return h.toString(16).padStart(16, '0');
}
export const encodeVote = (vote) => VOTE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, ...vote }))));
export function decodeVote(code) {
  try {
    const c = (code || '').trim();
    if (!c.startsWith(VOTE_PREFIX) || c.length > 4096) return { vote: null, error: `That is not a crew vote code (it should start with ${VOTE_PREFIX}).` };
    const vote = JSON.parse(decodeURIComponent(escape(atob(c.slice(VOTE_PREFIX.length)))));
    if (!vote || !Object.values(CrewRole).includes(vote.role)) return { vote: null, error: 'That vote code has no valid role.' };
    vote.name = (vote.name || '').slice(0, 40);
    return { vote, error: null };
  } catch { return { vote: null, error: 'That vote code is damaged. Copy it again from your teammate.' }; }
}

// ---------------------------------------------------------------- demo builds (Judge Mode, Failure Lab)
export const DEMO_CUBESAT_PARTS = ['eps', 'batt_20', 'dep_switch', 'obc', 'radio_sband', 'ant_patch', 'adcs_mag', 'cam_wide', 'solar_body', 'rbf_pin'];
export const DEMO_CUBESAT_CABLES = [
  ['solar_body/SOLAR_OUT_1', 'eps/SOLAR_IN_1'], ['batt_20/BATT', 'dep_switch/BATT_IN'], ['dep_switch/BATT_OUT', 'eps/BATT'], ['eps/PWR_OUT_1', 'obc/PWR_IN'],
  ['eps/PWR_OUT_2', 'radio_sband/PWR_IN'], ['eps/PWR_OUT_3', 'adcs_mag/PWR_IN'], ['eps/PWR_OUT_4', 'cam_wide/PWR_IN'], ['eps/DATA', 'obc/DATA_1'],
  ['radio_sband/DATA', 'obc/DATA_2'], ['adcs_mag/DATA', 'obc/DATA_3'], ['cam_wide/DATA', 'obc/DATA_4'], ['radio_sband/RF', 'ant_patch/RF'],
];
const DEMO_MOUNTS = { eps: 'U1A', batt_20: 'U1B', obc: 'U2A', radio_sband: 'U2B', adcs_mag: 'U3A', ant_patch: 'TOP', cam_wide: 'BOTTOM', solar_body: '-Z', dep_switch: 'RAIL', rbf_pin: 'PIN' };

/** A flight-ready S-band CubeSat on a stacked, bolted, fully wired Pathfinder. Options inject the classic faults. */
export function buildDemo(data, { missingRf = false, badJoint = false, noSeparation = false, padReady = false } = {}) {
  const rules = data.getRules();
  const sc = newSpacecraft();
  for (const p of DEMO_CUBESAT_PARTS) sc.parts.push({ instanceId: p, partId: p, mountId: DEMO_MOUNTS[p] ?? 'U3B' });
  for (const [a, b] of DEMO_CUBESAT_CABLES) if (!(missingRf && a === 'radio_sband/RF')) sc.cables.push({ fromPort: a, toPort: b, cableType: null, reversed: false });
  const v = newVehicle();
  let below = 'STAND';
  for (const id of rules.assemblyOrder.pathfinder) {
    const socket = id === 'payload' ? 'payload' : id.startsWith('pf_fairing') ? (id.endsWith('left') ? 'fairing_left' : 'fairing_right') : 'top';
    const lower = socket === 'top' ? below : 'pf_payload_adapter';
    v.parts.push({ instanceId: id, partId: id, mountId: `${lower}/${socket}` });
    if (socket === 'top') below = id;
  }
  for (const j of rules.boltJoints) {
    const st = new BoltJointState(j);
    const bad = badJoint && j.id === 'j_s1_interstage';
    for (let i = 0; i < j.boltCount; i++) if (!(bad && i >= j.boltCount - 3)) st.insert(i);
    if (bad) for (let i = 0; i < j.boltCount - 3; i++) st.applyTorque(i, st.target); // clockwise in one pass
    else for (let pass = 1; pass <= 3; pass++) for (const i of starOrder(j.boltCount)) st.applyTorque(i, st.passTargetNm(pass));
    st.saveTo(v);
  }
  for (const l of rules.avionicsWiring) if (!(noSeparation && l.id === 'w_pyro2')) v.avionicsCables.push({ fromPort: l.from, toPort: l.to, cableType: l.cableType, reversed: false });
  sc.rbfPinPulled = padReady; v.armed = padReady;
  return { missionId: 'floodwatch_1', spacecraft: sc, vehicle: v };
}
