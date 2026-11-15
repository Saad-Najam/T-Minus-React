import { create } from 'zustand';
import { DataRegistry, isCubeSat } from '../engine/data.js';
import { EventLog } from '../engine/eventLog.js';
import { Severity } from '../engine/severity.js';
import { BoltJointState, starOrder } from '../engine/bolts.js';
import { AssemblyGraph, AssemblyRules, STAND, SOCKET, PAYLOAD_PART_ID } from '../engine/assembly.js';
import { WiringGraph } from '../engine/wiring.js';
import { installPart, removePart } from '../engine/cubesat.js';
import { CrewRole, assignRoles, buildDemo, cleanDesign, decodeDesign, encodeDesign, newFlight, newLaunch, newSettings, newSpacecraft, newVehicle } from '../engine/design.js';
import { computeSpacecraftReport } from '../engine/budget.js';
import { buildChecklist } from '../engine/checklist.js';
import { runOps } from '../engine/ops.js';
import { computeScore, evaluateGoals, narrate } from '../engine/scoring.js';
import { runFlight } from '../engine/flightRun.js';
import { seedFaults, failureJobs, isFaultFixed, jobScore } from '../engine/failureLab.js';
import { KEYS, loadSettings, read, remove, saveSettings, write } from './persist.js';
import { defaultQuality } from './quality.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const events = new EventLog();

/** The whole game: data, the player's build, and where they are. Engine modules stay pure; this store wires them to React. */
export const useGame = create((set, get) => ({
  // ------------------------------------------------------------ data / navigation
  data: null, ready: false, loadError: null,
  screen: 'menu', history: [], toast: null,
  // ------------------------------------------------------------ the build
  missionId: 'floodwatch_1',
  spacecraft: newSpacecraft(), vehicle: newVehicle(), crew: assignRoles(['Player 1']),
  settings: { ...newSettings(), ...loadSettings(defaultQuality()) },
  launch: newLaunch(), flight: newFlight(), events,
  ops: null, score: null, undoStack: [], redoStack: [],
  // scripted modes
  job: null, judge: null, backup: null, replay: false, lastBuildAt: 0,
  held: null, highlight: null, selectedJoint: null, codexRead: new Set(read(KEYS.codex, [])),
  markRead(id) { set((s) => { const next = new Set(s.codexRead); next.add(id); write(KEYS.codex, [...next]); return { codexRead: next }; }); },
  setSelectedJoint(id) { set({ selectedJoint: id }); },
  setHeld(held) { set({ held }); },

  // ============================================================ boot
  async boot() {
    try {
      const data = await DataRegistry.load(`${import.meta.env.BASE_URL}data/`);
      set({ data, ready: true });
      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('code=')) { await get().importCode(decodeURIComponent(hash.slice(5)), true); }
    } catch (e) { set({ loadError: String(e) }); }
  },
  go(screen) {
    const cur = get().screen;
    if (screen === cur) return;
    set((s) => ({ screen, history: [...s.history.slice(-20), cur] }));
    if (typeof window !== 'undefined') window.scrollTo?.(0, 0);
  },
  back() { const h = get().history; const prev = h[h.length - 1] ?? 'menu'; set({ screen: prev, history: h.slice(0, -1) }); },
  say(message, kind = 'info') { set({ toast: { message, kind, id: Math.random() } }); },
  setSettings(patch) { const settings = { ...get().settings, ...patch }; set({ settings }); saveSettings(settings); },
  bump() { set({ lastBuildAt: Date.now() }); },

  // ============================================================ mission / crew
  selectMission(id) {
    const { data, vehicle } = get();
    const m = data.getMission(id); if (!m) return;
    const rocketId = m.rocketOptions[0] ?? 'pathfinder';
    const rocket = data.getRocket(rocketId);
    const siteId = m.launchSites.includes(vehicle.launchSiteId) ? vehicle.launchSiteId : m.launchSites[0] ?? 'sonmiani';
    const next = { ...clone(vehicle), rocketId, launchSiteId: siteId };
    // A different rocket means a different stack: keep CubeSat work, reset the rocket build.
    const rocketChanged = vehicle.rocketId !== rocketId;
    set({ missionId: id, vehicle: rocketChanged ? { ...newVehicle(), rocketId, launchSiteId: siteId, pitchKickDeg: vehicle.pitchKickDeg } : next,
      spacecraft: { ...get().spacecraft, orbitAltitudeKm: m.defaultOrbitKm || get().spacecraft.orbitAltitudeKm }, launch: newLaunch(), flight: newFlight(), ops: null, score: null });
    if (rocket && rocketChanged) get().clearUndo();
    get().autosave();
  },
  setCrew(names) { set({ crew: assignRoles(names.length ? names : ['Player 1']) }); get().autosave(); },
  setLaunchSite(id) { set((s) => ({ vehicle: { ...s.vehicle, launchSiteId: id } })); get().autosave(); },
  setOrbit(km) { set((s) => ({ spacecraft: { ...s.spacecraft, orbitAltitudeKm: km } })); get().autosave(); },
  setPitchKick(deg) { set((s) => ({ vehicle: { ...s.vehicle, pitchKickDeg: deg } })); get().autosave(); },
  countHint(level) { set((s) => { const h = [...s.settings.hintsUsed]; h[level]++; return { settings: { ...s.settings, hintsUsed: h } }; }); },

  // ============================================================ CubeSat (Integration Bay)
  installPart(partId) {
    const { data } = get(); const def = data.getPart(partId); if (!def) return null;
    const sc = clone(get().spacecraft);
    const r = installPart(sc, def);
    if (r.error) { get().say(r.error, 'bad'); return null; }
    set({ spacecraft: sc }); events.add('IntegrationBay', 'PartInstalled', `${def.name} in ${r.mountId}`, r.instanceId);
    get().autosave(); return r;
  },
  removePart(instanceId) { const sc = clone(get().spacecraft); removePart(sc, instanceId); set({ spacecraft: sc }); get().autosave(); },
  swapPart(instanceId, partId) {
    const sc = clone(get().spacecraft); const p = sc.parts.find((x) => x.instanceId === instanceId); if (!p) return;
    p.partId = partId; set({ spacecraft: sc }); get().autosave();
  },
  addCable(a, b, reversed) {
    const { data, spacecraft } = get();
    const g = new WiringGraph(data.getRules());
    for (const p of spacecraft.parts) { const d = data.getPart(p.partId); if (d?.ports.length) g.addDevice(p.instanceId, d); }
    for (const c of spacecraft.cables) g.connect(c.fromPort, c.toPort, c.reversed);
    const { cable, reason } = g.connect(a, b, reversed);
    if (!cable) { get().say(reason, 'bad'); return false; }
    const sc = clone(spacecraft); sc.cables.push({ fromPort: a, toPort: b, cableType: cable.type, reversed: cable.reversed });
    set({ spacecraft: sc }); get().autosave(); return true;
  },
  removeCable(a, b) {
    const sc = clone(get().spacecraft);
    sc.cables = sc.cables.filter((c) => !((c.fromPort === a && c.toPort === b) || (c.fromPort === b && c.toPort === a)));
    set({ spacecraft: sc }); get().autosave();
  },
  clearCables() { set((s) => ({ spacecraft: { ...clone(s.spacecraft), cables: [] } })); get().autosave(); },
  report() { const { spacecraft, data, missionId, vehicle } = get(); return computeSpacecraftReport(spacecraft, data, data.getMission(missionId), data.getRocket(vehicle.rocketId)); },

  // ============================================================ rocket (VAB)
  _snapshotRocket() { const { vehicle } = get(); return JSON.stringify({ parts: vehicle.parts, bolts: vehicle.bolts, jointWarps: vehicle.jointWarps }); },
  _pushUndo() { set((s) => ({ undoStack: [...s.undoStack.slice(-40), get()._snapshotRocket()], redoStack: [] })); },
  clearUndo() { set({ undoStack: [], redoStack: [] }); },
  undo() {
    const { undoStack } = get(); if (!undoStack.length) return;
    const cur = get()._snapshotRocket(); const snap = JSON.parse(undoStack[undoStack.length - 1]);
    set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, cur], vehicle: { ...s.vehicle, ...snap } })); get().autosave();
  },
  redo() {
    const { redoStack } = get(); if (!redoStack.length) return;
    const cur = get()._snapshotRocket(); const snap = JSON.parse(redoStack[redoStack.length - 1]);
    set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, cur], vehicle: { ...s.vehicle, ...snap } })); get().autosave();
  },
  /** Rebuilds the assembly graph from the saved stack. */
  assemblyGraph() {
    const { data, vehicle } = get();
    const graph = new AssemblyGraph(AssemblyRules.fromData(data, vehicle.rocketId));
    for (const id of graph.rules.order) graph.addNode(id, id);
    for (const p of vehicle.parts) {
      const [lower, socket] = (p.mountId || '').split('/');
      if (lower && socket) graph.edges.push({ lower, socket, upper: p.instanceId, jointId: graph.rules.jointFor(graph.partIdOf(lower), p.partId) });
    }
    graph.jointBoltsClear = (jointId) => !BoltJointState.loadFrom(data.getRules().getJoint(jointId), get().vehicle).hasAnyBolt();
    return graph;
  },
  attachPart(upper, lower, socket) {
    const graph = get().assemblyGraph();
    const r = graph.tryAttach(upper, lower, socket);
    if (!r.ok) { get().say(r.reason, 'bad'); return false; }
    get()._pushUndo();
    set((s) => ({ vehicle: { ...s.vehicle, parts: [...s.vehicle.parts, { instanceId: upper, partId: graph.partIdOf(upper), mountId: `${lower}/${socket}` }] } }));
    events.add('VAB', 'PartAttached', `${graph.rules.name(graph.partIdOf(upper))} on ${graph.rules.name(graph.partIdOf(lower))}`, upper);
    get().autosave(); return true;
  },
  detachPart(instanceId) {
    const graph = get().assemblyGraph();
    const r = graph.tryDetach(instanceId);
    if (!r.ok) { get().say(r.reason, 'bad'); return false; }
    get()._pushUndo();
    set((s) => ({ vehicle: { ...s.vehicle, parts: s.vehicle.parts.filter((p) => p.instanceId !== instanceId) } }));
    get().autosave(); return true;
  },
  /** The next part to stack and where (used by "show me"). */
  nextStackPart() {
    const graph = get().assemblyGraph();
    for (const id of graph.rules.order) if (!graph.isAttached(id)) {
      for (const { lower, socket } of graph.freeSockets()) if (graph.canAttach(id, lower, socket).ok) return { part: id, lower, socket };
    }
    return null;
  },
  jointState(jointId) { const { data, vehicle } = get(); return BoltJointState.loadFrom(data.getRules().getJoint(jointId), vehicle); },
  /** op: fit | torque | remove | fitAll. Returns { ok, warped } for UI feedback. */
  boltAction(jointId, op, index, nm) {
    const { data } = get(); const def = data.getRules().getJoint(jointId);
    const veh = clone(get().vehicle); const st = BoltJointState.loadFrom(def, veh);
    let warped = false;
    if (op === 'fit') st.insert(index);
    else if (op === 'remove') st.remove(index);
    else if (op === 'torque') { warped = st.applyTorque(index, nm).length > 0; }
    else if (op === 'fitAll') for (let i = 0; i < st.count; i++) st.insert(i);
    get()._pushUndo();
    st.saveTo(veh); set({ vehicle: veh });
    if (warped) events.add('VAB', 'JointWarped', `Joint ${jointId} warped: a bolt was fully torqued while its neighbours were loose.`, jointId, Severity.Warning);
    get().autosave(); return { ok: true, warped };
  },
  addAvionicsCable(a, b, reversed = false) {
    const { data, vehicle } = get();
    const g = new WiringGraph(data.getRules());
    for (const def of data.parts.filter((p) => p.assembly === 'avionics')) g.addDevice(def.id, def);
    for (const c of vehicle.avionicsCables) g.connect(c.fromPort, c.toPort, c.reversed);
    const { cable, reason } = g.connect(a, b, reversed);
    if (!cable) { get().say(reason, 'bad'); return false; }
    set((s) => ({ vehicle: { ...s.vehicle, avionicsCables: [...s.vehicle.avionicsCables, { fromPort: a, toPort: b, cableType: cable.type, reversed: cable.reversed }] } }));
    get().autosave(); return true;
  },
  removeAvionicsCable(a, b) {
    set((s) => ({ vehicle: { ...s.vehicle, avionicsCables: s.vehicle.avionicsCables.filter((c) => !((c.fromPort === a && c.toPort === b) || (c.fromPort === b && c.toPort === a))) } }));
    get().autosave();
  },
  setArmed(armed) { set((s) => ({ vehicle: { ...s.vehicle, armed } })); get().autosave(); },
  pullPin(pulled = true) { set((s) => ({ spacecraft: { ...s.spacecraft, rbfPinPulled: pulled } })); get().autosave(); },

  // ============================================================ pad
  checklist() { const { data, missionId, spacecraft, vehicle } = get(); return buildChecklist({ data, missionId, spacecraft, vehicle }); },
  recordPoll(role, go) {
    set((s) => { const poll = s.launch.poll.filter((p) => !p.startsWith(`${role}:`)); poll.push(`${role}:${go ? 'GO' : 'NO-GO'}`); return { launch: { ...s.launch, poll } }; });
  },
  noGoRound() { set((s) => ({ launch: { ...s.launch, noGoRounds: s.launch.noGoRounds + 1, poll: [] } })); },
  addRemoteVote(vote) { set((s) => ({ launch: { ...s.launch, remoteVotes: [...s.launch.remoteVotes.filter((v) => v.role !== vote.role), vote] } })); },
  /** Records what the crew knew at T-0 (decision-quality score) before the flight starts. */
  commitLaunch() {
    const failing = get().checklist().filter((i) => !i.pass).map((i) => i.id);
    set((s) => ({ launch: { ...s.launch, knownFailures: failing, launched: true } }));
    events.clear();
  },

  // ============================================================ flight result -> ops -> score
  /** Called by the Flight screen when the flight ends (live or fast-forwarded). */
  finishFlight(record, flightEvents) {
    const { data, missionId, spacecraft, vehicle } = get();
    // The flight events replace the log's previous run.
    events.events.splice(0, events.events.length, ...flightEvents.filter((e) => e.system === 'flight' || e.system === 'IntegrationBay' || e.system === 'VAB'));
    const mission = data.getMission(missionId);
    const rocket = data.getRocket(vehicle.rocketId);
    let ops = null; let score = null;
    set({ flight: record });
    const state = { data, missionId, spacecraft, vehicle, flight: record, events, launch: get().launch, crew: get().crew, settings: get().settings };
    if (isCubeSat(mission) && rocket?.buildable) {
      const budget = computeSpacecraftReport(spacecraft, data, mission, rocket);
      ops = runOps(state, budget);
      score = computeScore(state, ops, budget);
    } else {
      const emptyOps = { daysAlive: 0, imagesDownlinked: 0, survived: false, wiringIssues: [], powerFailureCause: null, failures: [], timeline: [] };
      ops = emptyOps;
      score = computeScore(state, emptyOps, null);
    }
    set({ ops, score });
  },
  debrief() {
    const { data, missionId, flight, ops, score, spacecraft, vehicle } = get();
    const mission = data.getMission(missionId); const rocket = data.getRocket(vehicle.rocketId);
    const budget = isCubeSat(mission) && rocket?.buildable ? computeSpacecraftReport(spacecraft, data, mission, rocket) : null;
    const goals = evaluateGoals(mission, flight, ops, budget);
    return { mission, budget, goals, narration: narrate(mission?.name ?? 'The mission', flight, ops, score, goals, flight.flightOnly) };
  },
  resetRun() { set({ flight: newFlight(), ops: null, score: null, launch: newLaunch() }); events.clear(); },

  // ============================================================ save / load / share
  autosave() {
    const { backup } = get(); if (backup) return; // a scripted mode owns the build
    const s = get();
    const hasBuild = s.spacecraft.parts.length > 1 || s.spacecraft.cables.length > 0 || s.vehicle.parts.length > 0 || s.vehicle.bolts.length > 0 || s.vehicle.avionicsCables.length > 0;
    if (!hasBuild) return;
    clearTimeout(get()._saveTimer);
    const t = setTimeout(async () => {
      const code = await encodeDesign({ missionId: s.missionId, spacecraft: get().spacecraft, vehicle: get().vehicle });
      write(KEYS.save, { v: 1, savedAtUtc: new Date().toISOString(), design: code, crew: get().crew });
    }, 600);
    set({ _saveTimer: t });
  },
  hasSave() { return !!read(KEYS.save); },
  saveDescription() { const f = read(KEYS.save); if (!f?.savedAtUtc) return null; return `saved ${new Date(f.savedAtUtc).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`; },
  async continueSave() {
    const f = read(KEYS.save); if (!f) return false;
    const ok = await get().importCode(f.design, false);
    if (ok && f.crew?.length) set({ crew: f.crew });
    return ok;
  },
  async importCode(code, silent) {
    const { bundle, error } = await decodeDesign(code);
    if (!bundle) { if (!silent) get().say(error, 'bad'); return false; }
    const fixed = cleanDesign(bundle, get().data);
    set({ missionId: bundle.missionId, spacecraft: bundle.spacecraft, vehicle: bundle.vehicle, launch: newLaunch(), flight: newFlight(), ops: null, score: null });
    get().clearUndo();
    get().say(fixed > 0 ? `Loaded the design (${fixed} invalid item${fixed > 1 ? 's' : ''} ignored).` : 'Loaded the design.', 'ok');
    return true;
  },
  async exportCode() { const s = get(); return encodeDesign({ missionId: s.missionId, spacecraft: s.spacecraft, vehicle: s.vehicle }); },
  newBuild() { set({ spacecraft: newSpacecraft(), vehicle: { ...newVehicle(), rocketId: get().vehicle.rocketId, launchSiteId: get().vehicle.launchSiteId }, launch: newLaunch(), flight: newFlight(), ops: null, score: null }); get().clearUndo(); remove(KEYS.save); },
  applyDemo(opts) {
    const { data } = get(); const b = buildDemo(data, opts);
    set({ missionId: b.missionId, spacecraft: b.spacecraft, vehicle: b.vehicle, crew: assignRoles(['Player 1']), launch: newLaunch(), flight: newFlight(), ops: null, score: null });
    get().clearUndo(); events.clear();
  },
  /** Scripted modes (Judge Mode, repair jobs) keep the player's own build and give it back afterwards. */
  beginScript() { if (get().backup) return; const s = get(); set({ backup: clone({ missionId: s.missionId, spacecraft: s.spacecraft, vehicle: s.vehicle, crew: s.crew, hints: s.settings.hintsUsed }) }); },
  endScript() {
    const b = get().backup; if (!b) return;
    set((s) => ({ backup: null, missionId: b.missionId, spacecraft: b.spacecraft, vehicle: b.vehicle, crew: b.crew, settings: { ...s.settings, hintsUsed: b.hints }, launch: newLaunch(), flight: newFlight(), ops: null, score: null }));
    get().clearUndo();
  },

  // ============================================================ failure lab
  startJob(job) {
    get().beginScript();
    get().applyDemo({});
    const { data } = get();
    set((s) => { const veh = clone(s.vehicle); seedFaults(veh, data.getRules(), job.seededFaults); return { vehicle: veh, missionId: 'floodwatch_1', job: { id: job.id, startedAt: Date.now(), hintsAtStart: s.settings.hintsUsed.reduce((a, b) => a + b, 0) } }; });
    get().go('vab');
  },
  jobProgress() {
    const { job, data, vehicle } = get(); if (!job) return null;
    const def = data.getMission(job.id); const rules = data.getRules();
    return { def, fixed: def.seededFaults.filter((f) => isFaultFixed(f, vehicle, rules)).length, total: def.seededFaults.length };
  },
  handBackJob() {
    const { job, data, vehicle, settings } = get(); if (!job) return null;
    const def = data.getMission(job.id); const rules = data.getRules();
    const fixedList = def.seededFaults.map((f) => isFaultFixed(f, vehicle, rules));
    const fixed = fixedList.filter(Boolean).length;
    const hints = settings.hintsUsed.reduce((a, b) => a + b, 0) - job.hintsAtStart;
    const score = jobScore(def.rewardPoints, def.seededFaults.length, fixed, hints);
    events.add('failure_lab', 'job_handed_back', `${def.id}: ${fixed}/${def.seededFaults.length} faults fixed, ${hints} hints, ${score} pts`, def.id, fixed === def.seededFaults.length ? Severity.Info : Severity.Warning);
    return { def, fixedList, fixed, hints, score, minutes: (Date.now() - job.startedAt) / 60000, rules };
  },
  endJob() { set({ job: null }); get().endScript(); },
}));

export { failureJobs, starOrder, STAND, SOCKET, PAYLOAD_PART_ID, CrewRole };
