import { Severity } from '../severity.js';
import { WiringGraph, addressOf, deviceOf, validateWiring } from '../wiring.js';
import { AssemblyGraph, AssemblyRules, STAND } from '../assembly.js';
import { BoltJointState, starOrderText } from '../bolts.js';
import { AvionicsReport } from '../avionics.js';
import { computeSpacecraftReport } from '../budget.js';
import { freeMountFor, mountLabel } from '../cubesat.js';

// Port of TMinus.Houston.AssemblyAdvisor: deterministic, offline advisor that reads only the game's own data and rules.
export const FaultSeverity = { Tip: 0, Warning: 1, Blocker: 2 };
export const HintLevel = { TextNudge: 0, Highlight: 1, ShowMe: 2 };
export const AdvisorScope = { CubeSat: 'CubeSat', Rocket: 'Rocket', Avionics: 'Avionics', Pad: 'Pad' };
const scopeOfScreen = (screen) => ({ bay: AdvisorScope.CubeSat, vab: AdvisorScope.Rocket, avionics: AdvisorScope.Avionics }[screen] ?? AdvisorScope.Pad);
const mapSeverity = (s) => (s >= Severity.Fault ? FaultSeverity.Blocker : s === Severity.Warning ? FaultSeverity.Warning : FaultSeverity.Tip);

/** Builds a snapshot of the build for advisor queries from the game state (ContextBuilder). */
export function buildContext(game, screen) {
  const { data } = game;
  const rules = data.getRules();
  const mission = data.getMission(game.missionId);
  const rocket = data.getRocket(game.vehicle.rocketId);
  const ctx = { data, rules, scope: scopeOfScreen(screen), missionId: game.missionId, vehicle: game.vehicle, rbfPinInserted: !game.spacecraft.rbfPinPulled,
    cubeSatParts: game.spacecraft.parts, cubeSatAssemblyOrder: rules.assemblyOrder.cubesat ?? null };
  if (mission) ctx.spacecraftReport = computeSpacecraftReport(game.spacecraft, data, mission, rocket);
  ctx.avionicsReport = AvionicsReport.compute(game.vehicle, rules);
  ctx.boltJoints = rules.boltJoints.map((j) => BoltJointState.loadFrom(j, game.vehicle));
  ctx.freeMountFor = (def) => freeMountFor(def, game.spacecraft.parts);

  const wiring = new WiringGraph(rules);
  for (const p of game.spacecraft.parts) { const def = data.getPart(p.partId); if (def && def.ports.length) wiring.addDevice(p.instanceId, def); }
  for (const c of game.spacecraft.cables) wiring.connect(c.fromPort, c.toPort, c.reversed);
  ctx.wiring = wiring;

  const av = new WiringGraph(rules);
  for (const def of data.parts.filter((p) => p.assembly === 'avionics')) av.addDevice(def.id, def);
  for (const c of game.vehicle.avionicsCables) av.connect(c.fromPort, c.toPort, c.reversed);
  ctx.avionicsWiring = av;

  if (rocket?.buildable) {
    const graph = new AssemblyGraph(AssemblyRules.fromData(data, rocket.id));
    for (const id of graph.rules.order) graph.addNode(id, id);
    for (const p of game.vehicle.parts) {
      const [lower, socket] = (p.mountId || '').split('/');
      graph.addNode(p.instanceId, p.partId);
      if (lower && socket) graph.edges.push({ lower, socket, upper: p.instanceId, jointId: graph.rules.jointFor(graph.partIdOf(lower), p.partId) });
    }
    ctx.graph = graph;
  }
  return ctx;
}

const mountName = mountLabel;
const defaultMountName = (t) => ({ slot: 'a free board slot (U1-U3)', face_long: 'a long side face', face_end: 'an end face', inline: 'the rail foot' }[t] ?? t);
const portCodex = (t) => ({ DATA: 'data_budget', RF: 'downlink', PYRO_OUT: 'pyro_separation', PYRO_IN: 'pyro_separation', ARM: 'safe_arm' }[t] ?? 'eps');
const consequenceCodex = (c) => ({ stuck_stage: 'pyro_separation', fairing_stuck: 'pyro_separation', no_ignition: 'pyro_separation', s2_no_thrust: 'pyro_separation', guidance_drift: 'gravity_turn', no_telemetry: 'telemetry' }[c] ?? 'staging');
const rec = (text, reasonCode, objectRef, codexId, action = 'NextStep') => ({ action, text, reasonCode, objectRef, codexId });

function isRequiredConnection(from, to, g, ctx) {
  for (const addr of [from, to]) {
    const dev = g.device(deviceOf(addr)); const port = g.port(addr);
    if (dev && port && ctx.rules.requiredConnections.some((rc) => rc.category === dev.category && rc.portTypes.includes(port.type))) return true;
  }
  return ctx.rules.avionicsWiring.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
}

/** Ranked valid targets for a held item (part id or port address "instance/PORT"). */
export function whereDoesThisGo(held, ctx) {
  const results = [];
  if (!ctx || !held) return results;
  const item = held.trim();
  if (item.includes('/')) {
    const g = ctx.avionicsWiring.port(item) ? ctx.avionicsWiring : ctx.wiring;
    const fromPort = g?.port(item);
    if (fromPort) {
      for (const [inst, def] of g.devices) for (const port of def.ports) {
        const addr = addressOf(inst, port.id);
        const c = g.canConnect(item, addr);
        if (addr === item || !c.ok || c.shortCircuit) continue;
        const required = isRequiredConnection(item, addr, g, ctx);
        results.push({ action: 'WhereDoesThisGo', text: `Connect to ${g.describe(addr)}${required ? ' (required)' : ''}`, reasonCode: required ? 'required_connection' : 'valid_target', objectRef: addr, codexId: portCodex(fromPort.type) });
      }
      results.sort((a, b) => (b.reasonCode === 'required_connection') - (a.reasonCode === 'required_connection'));
      return results;
    }
  }
  const def = ctx.data.getPart(item);
  if (def && def.category === 'battery')
    results.push({ action: 'WhereDoesThisGo', text: 'Battery power goes to the EPS BATT port, through the deployment switch (battery -> switch -> EPS)', reasonCode: 'required_connection', objectRef: 'eps/BATT', codexId: 'eps' });
  if (ctx.graph && ctx.graph.partIdOf(item)) {
    for (const { lower, socket } of ctx.graph.freeSockets())
      if (ctx.graph.canAttach(item, lower, socket).ok) results.push({ action: 'WhereDoesThisGo', text: `Mount on ${ctx.graph.rules.name(ctx.graph.partIdOf(lower))} (${socket})`, reasonCode: 'valid_target', objectRef: `${lower}/${socket}`, codexId: 'staging' });
    const free = ctx.graph.freeSockets();
    if (results.length === 0 && free.length) {
      const reason = ctx.graph.canAttach(item, free[0].lower, free[0].socket).reason;
      results.push({ action: 'WhereDoesThisGo', text: `Not yet: ${reason}`, reasonCode: 'wrong_order', objectRef: item, codexId: 'staging' });
    }
  }
  if (def && def.assembly === 'cubesat' && def.mount !== 'frame') {
    const mount = ctx.freeMountFor?.(def);
    results.push({ action: 'WhereDoesThisGo', text: mount ? `Install the ${def.name} in ${mountName(mount)}` : `Install the ${def.name} on ${defaultMountName(def.mount)}`, reasonCode: 'valid_mount', objectRef: mount ?? def.mount, codexId: def.codexId ?? 'eps' });
  }
  return results;
}

export function boltCoach(joint) {
  if (!joint) return null;
  const next = joint.nextBolt(); const pass = joint.currentPass();
  return { jointId: joint.def.id, nextBoltNumber: next >= 0 ? next + 1 : -1, currentPass: Math.min(pass, 3), targetTorqueNm: joint.passTargetNm(pass), starOrderText: starOrderText(joint.count) };
}

function jointMounted(joint, ctx) {
  if (ctx.graph) {
    const lo = ctx.graph.partIdOf(joint.def.lowerPartId); const up = ctx.graph.partIdOf(joint.def.upperPartId);
    return !!lo && ctx.graph.isAttached(joint.def.lowerPartId) && !!up && ctx.graph.isAttached(joint.def.upperPartId);
  }
  if (ctx.vehicle && ctx.vehicle.parts.length > 0) return ctx.vehicle.parts.some((p) => p.instanceId === joint.def.lowerPartId) && ctx.vehicle.parts.some((p) => p.instanceId === joint.def.upperPartId);
  return joint.hasAnyBolt();
}

/** Prioritised faults for the current scope (Bay: wiring + budgets; VAB: joints + avionics; Avionics: ring; Pad: everything). */
export function scan(ctx) {
  const faults = [];
  if (!ctx) return faults;
  const pad = ctx.scope === AdvisorScope.Pad;
  if (ctx.scope === AdvisorScope.CubeSat || pad) {
    for (const wf of validateWiring(ctx.wiring)) faults.push({ severity: mapSeverity(wf.severity), what: wf.message, where: wf.port ?? wf.device, why: wf.code, codexId: wf.codexId, fixAction: 'wire' });
    for (const i of ctx.spacecraftReport?.issues ?? []) faults.push({ severity: mapSeverity(i.severity), what: i.message, where: i.code, why: i.code, codexId: i.codexId, fixAction: 'budget' });
  }
  if (ctx.scope === AdvisorScope.Rocket || pad) {
    for (const joint of ctx.boltJoints ?? []) {
      if (!jointMounted(joint, ctx)) continue;
      const s = joint.getStatus(); const id = joint.def.id;
      if (s.missing > 0) faults.push({ severity: FaultSeverity.Blocker, what: `${s.missing} of ${s.boltCount} bolts missing on ${id}.`, where: id, why: 'bolts_missing', codexId: 'star_pattern', fixAction: 'bolt' });
      if (s.sequenceErrors > 0) faults.push({ severity: FaultSeverity.Warning, what: `Joint ${id} warped: bolts were fully torqued out of sequence (integrity ${(s.integrity * 100).toFixed(0)}%).`, where: id, why: 'joint_warped', codexId: 'star_pattern', fixAction: 'rebolt' });
      if (s.over > 0) faults.push({ severity: FaultSeverity.Warning, what: `${s.over} over-torqued (stripped) bolt${s.over > 1 ? 's' : ''} on ${id}: remove and replace.`, where: id, why: 'bolts_overtorqued', codexId: 'torque', fixAction: 'rebolt' });
      const loose = s.under + s.inserted;
      if (loose > 0) faults.push({ severity: FaultSeverity.Warning, what: `${loose} bolt${loose > 1 ? 's' : ''} on ${id} not yet at full torque (pass ${joint.currentPass()}/3).`, where: id, why: 'bolts_not_torqued', codexId: 'torque', fixAction: 'bolt' });
    }
  }
  if (ctx.scope === AdvisorScope.Rocket || ctx.scope === AdvisorScope.Avionics || pad) {
    for (const wf of validateWiring(ctx.avionicsWiring)) faults.push({ severity: mapSeverity(wf.severity), what: `Avionics: ${wf.message}`, where: wf.port ?? wf.device, why: wf.code, codexId: wf.codexId, fixAction: 'wire_avionics' });
    for (const c of ctx.avionicsReport?.consequences ?? []) {
      const link = ctx.rules.avionicsWiring.find((l) => l.id === c.linkId);
      faults.push({ severity: FaultSeverity.Blocker, what: c.message, where: link ? link.from : c.linkId, why: c.consequence, codexId: consequenceCodex(c.consequence), fixAction: 'wire_avionics' });
    }
  }
  if (pad) {
    if (ctx.rbfPinInserted) faults.push({ severity: FaultSeverity.Warning, what: 'Remove-Before-Flight pin is still in: the satellite would never switch on.', where: 'rbf_pin', why: 'rbf_pin_in', codexId: 'rbf_pin', fixAction: 'pull_pin' });
    if (ctx.vehicle && !ctx.vehicle.armed) faults.push({ severity: FaultSeverity.Warning, what: 'Safe/Arm plug is SAFE: arm it at the pad, after the pad is cleared.', where: 'av_safe_arm', why: 'not_armed', codexId: 'safe_arm', fixAction: 'arm' });
  } else if (ctx.vehicle?.armed && (ctx.scope === AdvisorScope.Rocket || ctx.scope === AdvisorScope.Avionics)) {
    faults.push({ severity: FaultSeverity.Blocker, what: 'Safe/Arm is ARMED inside the VAB: pyro circuits are live. Switch it to SAFE.', where: 'av_safe_arm', why: 'armed_in_vab', codexId: 'safe_arm', fixAction: 'safe' });
  }
  return faults.sort((a, b) => b.severity - a.severity);
}

// ---------------------------------------------------------------- NextStep
const INSTALL = {
  eps: ['eps', 'Install the EPS (electrical power system) board first: everything else draws power through it.'],
  battery: ['batt_20', 'Install a battery: it carries the satellite through every eclipse.'],
  dep_switch: ['dep_switch', 'Install the deployment switch: it keeps the satellite off inside the dispenser.'],
  obc: ['obc', 'Install the flight computer (OBC): it stores images and runs the schedule.'],
  radio: ['radio_uhf', 'Install a radio to send data home (UHF is cheap, S-band is about 100 times faster).'],
  antenna: ['ant_uhf', 'Install an antenna on an end face (pick the one that matches your radio).'],
  adcs: ['adcs_mag', 'Install an ADCS so the satellite can point its camera.'],
  camera: ['cam_wide', 'Install the camera payload on an end face.'],
  solar: ['solar_body', 'Attach solar panels to a long face: no panels, no power.'],
};
const blockerStep = (ctx) => { const b = scan(ctx).find((f) => f.severity === FaultSeverity.Blocker); return b ? rec(`Fix: ${b.what}`, 'fix_blocker', b.where, b.codexId) : null; };
const isStepPlaced = (step, ctx) => (ctx.cubeSatParts ?? []).some((p) => p.partId === step || ctx.data.getPart(p.partId)?.category === step);

function cubeSatStep(ctx) {
  if (!ctx.cubeSatAssemblyOrder) return null;
  for (const step of ctx.cubeSatAssemblyOrder) {
    if (step === 'frame_3u' || step === 'rbf_pin') continue;
    if (!isStepPlaced(step, ctx)) {
      const [partId, base] = INSTALL[step] ?? [step, `Install the ${ctx.data.getPart(step)?.name ?? step}.`];
      const def = ctx.data.getPart(partId);
      const mount = def ? ctx.freeMountFor?.(def) : null;
      return rec(base + (mount ? ` It will go in ${mountName(mount)}.` : ''), 'assembly_order', partId, def?.codexId ?? 'eps');
    }
  }
  const wf = validateWiring(ctx.wiring).find((f) => f.severity >= Severity.Fault);
  return wf ? rec(wf.message, 'wiring_needed', wf.port ?? wf.device, wf.codexId) : null;
}
function rocketStep(ctx) {
  if (ctx.graph && !ctx.graph.isComplete()) {
    for (const partId of ctx.graph.rules.order) if (!ctx.graph.isAttached(partId)) return rec(`Stack the ${ctx.graph.rules.name(partId)} next (bottom first).`, 'assembly_order', partId, 'staging');
  }
  for (const joint of ctx.boltJoints ?? []) {
    if (!jointMounted(joint, ctx)) continue;
    const next = joint.nextBolt();
    if (next < 0) continue;
    const pass = joint.currentPass();
    return rec(!joint.present[next] ? `Fit bolt ${next + 1} on ${joint.def.id} (star order ${starOrderText(joint.count)}).`
      : `Torque bolt ${next + 1} on ${joint.def.id} to ${+joint.passTargetNm(pass).toFixed(1)} N·m (pass ${pass}/3, star order).`, 'bolt_needed', joint.def.id, 'star_pattern');
  }
  return null;
}
function avionicsStep(ctx) {
  const c = ctx.avionicsReport?.consequences[0];
  if (!c) return null;
  const link = ctx.rules.avionicsWiring.find((l) => l.id === c.linkId);
  const g = ctx.avionicsWiring;
  const route = !link ? c.linkId : `${g.describe(link.from)} → ${g.describe(link.to)}`;
  const where = ctx.scope === AdvisorScope.Avionics ? '' : 'Open the Avionics bay and ';
  return rec(`${where}connect ${route}. Without it: ${c.message}`, 'avionics_wiring', link?.from ?? c.linkId, consequenceCodex(c.consequence));
}
const armedStep = (ctx) => (ctx.vehicle?.armed ? rec('Switch Safe/Arm to SAFE before touching any cable: the pyro circuits are live.', 'safe_first', 'av_safe_arm', 'safe_arm') : null);
function padStep(ctx) {
  if (ctx.rbfPinInserted) return rec('Pull the Remove-Before-Flight pin (pad checklist).', 'rbf_pin', 'rbf_pin', 'rbf_pin');
  if (ctx.vehicle && !ctx.vehicle.armed) return rec('Arm the Safe/Arm plug now that the pad is clear.', 'safe_arm', 'av_safe_arm', 'safe_arm');
  return null;
}

/** The next action for the current scope, in dependency order, skipping finished steps. */
export function nextStep(ctx) {
  if (!ctx) return rec('No build information yet.', 'none', null, null);
  switch (ctx.scope) {
    case AdvisorScope.CubeSat: return cubeSatStep(ctx) ?? blockerStep(ctx) ?? rec('The CubeSat is built and wired. Next: build the rocket in the VAB.', 'cubesat_ready', null, 'eps');
    case AdvisorScope.Rocket: return rocketStep(ctx) ?? avionicsStep(ctx) ?? blockerStep(ctx) ?? rec('The rocket is stacked, bolted and wired. Next: go to the pad.', 'rocket_ready', null, 'staging');
    case AdvisorScope.Avionics: return armedStep(ctx) ?? avionicsStep(ctx) ?? blockerStep(ctx) ?? rec('All 11 avionics cables are in place. Back to the VAB.', 'avionics_ready', null, 'pyro_separation');
    default: return cubeSatStep(ctx) ?? rocketStep(ctx) ?? avionicsStep(ctx) ?? blockerStep(ctx) ?? padStep(ctx) ?? rec('Build complete! All checks pass and the pad is ready: run the GO/NO-GO poll.', 'ready_for_launch', null, 'staging');
  }
}
export { STAND };
