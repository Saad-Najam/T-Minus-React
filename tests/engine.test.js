import { describe, it, expect } from 'vitest';
import { loadData } from './helpers.js';
import { buildDemo, cleanDesign, decodeDesign, encodeDesign, assignRoles, designHash, encodeVote, decodeVote, CrewRole } from '../src/engine/design.js';
import { runFlight } from '../src/engine/flightRun.js';
import { computeSpacecraftReport, periodMinutes, eclipseFraction } from '../src/engine/budget.js';
import { runOps, eventDay, orbitsPerDay, stepStateOfCharge } from '../src/engine/ops.js';
import { computeScore, evaluateGoals, narrate, collaborationFraction, starsForScore } from '../src/engine/scoring.js';
import { buildChecklist } from '../src/engine/checklist.js';
import { seedFaults, isFaultFixed, jobScore, ApolloRun } from '../src/engine/failureLab.js';
import { AvionicsReport } from '../src/engine/avionics.js';
import { BoltJointState, starOrder, starOrderText } from '../src/engine/bolts.js';
import { WiringGraph, validateWiring } from '../src/engine/wiring.js';
import { AssemblyGraph, AssemblyRules, STAND } from '../src/engine/assembly.js';
import { buildContext, nextStep, scan, whereDoesThisGo, FaultSeverity } from '../src/engine/houston/advisor.js';
import { evaluateWhatIf, matchCodex } from '../src/engine/houston/whatIf.js';
import { EventLog } from '../src/engine/eventLog.js';
import { newFlight, newLaunch, newSettings } from '../src/engine/design.js';

const data = loadData();
const mission = data.getMission('floodwatch_1');
const rocket = data.getRocket('pathfinder');

function game(bundle, extra = {}) {
  return { data, missionId: bundle.missionId, spacecraft: bundle.spacecraft, vehicle: bundle.vehicle, crew: assignRoles(['Player 1']), settings: newSettings(), launch: newLaunch(), flight: newFlight(), events: new EventLog(), ...extra };
}

describe('data', () => {
  it('loads every JSON table', () => {
    expect(data.parts.length).toBeGreaterThan(35);
    expect(data.rockets.map((r) => r.id)).toEqual(expect.arrayContaining(['pathfinder', 'saturn_v', 'rehbar_nike_cajun']));
    expect(data.codex.length).toBe(28);
    expect(data.missions.find((m) => m.id === 'moonshot').requiredDeltaVLeftMs).toBe(2800);
  });
});

describe('spacecraft budget (Prompt 7 formulas)', () => {
  it('orbital period and eclipse fraction', () => {
    expect(periodMinutes(550)).toBeCloseTo(95.5, 0);
    expect(eclipseFraction(550)).toBeCloseTo(0.373, 2);
  });
  it('the demo CubeSat is inside every limit and meets the image goal', () => {
    const b = buildDemo(data, { padReady: true });
    const r = computeSpacecraftReport(b.spacecraft, data, mission, rocket);
    expect(r.massKg).toBeCloseTo(1.56, 2);
    expect(r.totalCostM).toBeCloseTo(7.609, 3);
    expect(r.hasBlockers).toBe(false);
    expect(r.imagesDownlinkedMission).toBeGreaterThanOrEqual(20);
  });
  it('removing the radio is a blocker', () => {
    const b = buildDemo(data, {});
    b.spacecraft.parts = b.spacecraft.parts.filter((p) => p.partId !== 'radio_sband');
    const r = computeSpacecraftReport(b.spacecraft, data, mission, rocket);
    expect(r.issues.map((i) => i.code)).toContain('no_radio');
    expect(r.hasBlockers).toBe(true);
  });
  it('HD camera without reaction wheels blurs (pointing quality 0.3)', () => {
    const b = buildDemo(data, {});
    b.spacecraft.parts.find((p) => p.partId === 'cam_wide').partId = 'cam_hd';
    expect(computeSpacecraftReport(b.spacecraft, data, mission, rocket).pointingQuality).toBe(0.3);
  });
});

describe('wiring rules', () => {
  const graph = (b) => { const g = new WiringGraph(data.getRules()); b.spacecraft.parts.forEach((p) => { const d = data.getPart(p.partId); if (d.ports.length) g.addDevice(p.instanceId, d); }); b.spacecraft.cables.forEach((c) => g.connect(c.fromPort, c.toPort, c.reversed)); return g; };
  it('the demo build has no wiring faults', () => expect(validateWiring(graph(buildDemo(data, {})))).toEqual([]));
  it('a missing antenna cable is reported for radio and antenna', () => {
    const f = validateWiring(graph(buildDemo(data, { missingRf: true })));
    expect(f.filter((x) => x.code === 'missing_connection').length).toBe(2);
  });
  it('two power outputs make a short circuit, mismatched ports are refused, polarity is reported', () => {
    const g = graph(buildDemo(data, {}));
    g.clear();
    expect(g.connect('eps/PWR_OUT_1', 'eps/PWR_OUT_2').reason).toMatch(/itself/);
    expect(g.connect('eps/DATA', 'radio_sband/PWR_IN').cable).toBeNull();
    const { cable } = g.connect('eps/PWR_OUT_1', 'obc/PWR_IN', true);
    expect(cable.reversed).toBe(true);
    expect(validateWiring(g).some((x) => x.code === 'reversed_polarity')).toBe(true);
  });
  it('battery straight into the EPS says the deployment switch is not inline', () => {
    const g = graph(buildDemo(data, {})); g.disconnect(g.cables.find((c) => c.a === 'dep_switch/BATT_OUT').id); g.disconnect(g.cables.find((c) => c.a === 'batt_20/BATT').id);
    g.connect('batt_20/BATT', 'eps/BATT');
    expect(validateWiring(g).some((x) => x.code === 'switch_not_inline')).toBe(true);
  });
  it('multimeter path length', () => { const g = graph(buildDemo(data, {})); expect(g.pathLength('eps/PWR_OUT_1', 'obc/PWR_IN')).toBe(1); expect(g.pathLength('batt_20/BATT', 'dep_switch/BATT_IN')).toBe(1); expect(g.pathLength('batt_20/BATT', 'eps/BATT')).toBe(-1); // the switch is open: no continuity through it
     expect(g.pathLength('batt_20/BATT', 'solar_body/SOLAR_OUT_2')).toBe(-1); });
});

describe('assembly graph', () => {
  const mk = () => { const g = new AssemblyGraph(AssemblyRules.fromData(data, 'pathfinder')); g.rules.order.forEach((id) => g.addNode(id, id)); return g; };
  it('enforces the stacking order', () => {
    const g = mk();
    expect(g.tryAttach('pf_stage2', STAND, 'top').reason).toMatch(/Wrong order/);
    expect(g.tryAttach('pf_stage1', STAND, 'top').ok).toBe(true);
    expect(g.tryAttach('pf_stage2', 'pf_stage1', 'top').ok).toBe(false);
    expect(g.tryAttach('pf_interstage', 'pf_stage1', 'top').ok).toBe(true);
  });
  it('undo / redo and detach rules', () => {
    const g = mk(); g.tryAttach('pf_stage1', STAND, 'top'); g.tryAttach('pf_interstage', 'pf_stage1', 'top');
    expect(g.tryDetach('pf_stage1').reason).toMatch(/Remove first/);
    g.jointBoltsClear = () => false; expect(g.tryDetach('pf_interstage').reason).toMatch(/Unbolt/);
    g.jointBoltsClear = () => true; expect(g.tryDetach('pf_interstage').ok).toBe(true);
    expect(g.undo()).toBe(true); expect(g.isAttached('pf_interstage')).toBe(true); expect(g.redo()).toBe(true); expect(g.isAttached('pf_interstage')).toBe(false);
  });
});

describe('bolts', () => {
  const def = data.getRules().getJoint('j_s1_interstage');
  it('star order for 12 and 8 bolts', () => { expect(starOrderText(12)).toBe('1-7-4-10-2-8-5-11-3-9-6-12'); expect(starOrder(8).length).toBe(8); expect(starOrderText(5)).toBe('1-4-2-5-3'); });
  it('tightening a bolt fully while neighbours are loose warps the joint', () => {
    const s = new BoltJointState(def); for (let i = 0; i < 12; i++) s.insert(i);
    const loose = s.applyTorque(0, 45); expect(loose.length).toBe(2); expect(s.sequenceErrors).toBe(1);
    expect(s.getStatus().integrity).toBe(0); // 1/12 torqued minus the warp penalty, clamped at zero
    expect(s.getStatus().integrity).toBeGreaterThanOrEqual(0);
  });
  it('over-torque strips a bolt', () => { const s = new BoltJointState(def); s.insert(0); s.applyTorque(0, 60); expect(s.stateOf(0)).toBe('OverTorqued'); });
  it('the coach points at the next bolt in star order', () => { const s = new BoltJointState(def); expect(s.nextBolt()).toBe(0); for (let i = 0; i < 12; i++) s.insert(i); s.applyTorque(0, 13.5); expect(s.nextBolt()).toBe(6); });
});

describe('avionics', () => {
  it('safe/arm on SAFE blocks ignition and blames the plug', () => {
    const b = buildDemo(data, {}); const r = AvionicsReport.compute(b.vehicle, data.getRules());
    expect(r.allOk).toBe(true); expect(r.s1IgnitionOk).toBe(false); expect(r.causeId('no_ignition')).toBe('av_safe_arm');
  });
  it('a dead PDU cascades: nothing works and the power cable is blamed', () => {
    const b = buildDemo(data, { padReady: true }); b.vehicle.avionicsCables = b.vehicle.avionicsCables.filter((c) => !c.fromPort.startsWith('av_battery'));
    const r = AvionicsReport.compute(b.vehicle, data.getRules());
    expect(r.s1IgnitionOk).toBe(false); expect(r.causeId('stuck_stage')).toBe('w_batt_pdu');
  });
});

describe('operations, scoring and the debrief', () => {
  const full = (opts) => {
    const b = buildDemo(data, { padReady: true, ...opts });
    const fl = runFlight(data, b, 'floodwatch_1'); const g = game(b, { flight: fl.record, events: fl.events });
    const budget = computeSpacecraftReport(b.spacecraft, data, mission, rocket);
    const ops = runOps(g, budget); const score = computeScore(g, ops, budget);
    return { b, fl, g, budget, ops, score };
  };
  it('a perfect build earns 3 stars and meets every goal', () => {
    const { ops, score, g, budget } = full();
    expect(ops.survived).toBe(true); expect(ops.daysAlive).toBe(30); expect(ops.imagesDownlinked).toBeGreaterThanOrEqual(20);
    expect(score.stars).toBe(3); expect(score.total).toBeGreaterThan(85);
    expect(evaluateGoals(mission, g.flight, ops, budget).every((x) => x.met)).toBe(true);
    expect(narrate('FloodWatch-1', g.flight, ops, score, evaluateGoals(mission, g.flight, ops, budget))).toMatch(/succeeded/);
  });
  it('a failed joint explains the cause and scores low', () => {
    const { score, g, ops } = full({ badJoint: true });
    expect(g.flight.failureCode).toBe('joint_failure'); expect(score.total).toBeLessThan(35);
    expect(score.fixes[0]).toMatch(/star pattern/); expect(narrate('FloodWatch-1', g.flight, ops, score, [])).toMatch(/j_s1_interstage/);
  });
  it('a missing antenna cable means nothing reaches the ground', () => {
    const { ops } = full({ missingRf: true });
    expect(ops.imagesDownlinked).toBe(0); expect(ops.wiringIssues[0]).toMatch(/Nothing reached the ground/);
  });
  it('RBF pin left in: the satellite never powers on', () => {
    const b = buildDemo(data, { padReady: true }); b.spacecraft.rbfPinPulled = false;
    const fl = runFlight(data, b, 'floodwatch_1'); const g = game(b, { flight: fl.record, events: fl.events });
    const ops = runOps(g, computeSpacecraftReport(b.spacecraft, data, mission, rocket));
    expect(ops.powered).toBe(false); expect(ops.powerFailureCause).toBe('rbf_pin');
  });
  it('random events move by at most two days and are deterministic', () => {
    const b = buildDemo(data, {}); const e = mission.randomEvents[0];
    const d1 = eventDay(mission, e, 0, b.spacecraft, 30); const d2 = eventDay(mission, e, 0, b.spacecraft, 30);
    expect(d1).toBe(d2); expect(Math.abs(d1 - e.day)).toBeLessThanOrEqual(2);
  });
  it('battery state of charge is clamped and orbits per day is sensible', () => { expect(stepStateOfCharge(0.9, 5, 10)).toBe(1); expect(stepStateOfCharge(0.1, -5, 10)).toBe(0); expect(orbitsPerDay(95.5)).toBe(15); });
  it('collaboration grows with real people and needs every role to vote', () => {
    expect(collaborationFraction(assignRoles(['A']), [])).toBeCloseTo(0.4); expect(collaborationFraction(assignRoles(['A', 'B', 'C', 'D']), [])).toBeCloseTo(1);
    expect(collaborationFraction(assignRoles(['A', 'B', 'C', 'D']), ['FlightDirector:GO', 'ScienceBudget:GO'])).toBeCloseTo(0.5);
    expect(starsForScore(85)).toBe(3); expect(starsForScore(60)).toBe(2); expect(starsForScore(35)).toBe(1); expect(starsForScore(34)).toBe(0);
  });
  it('Moonshot and Rehbar-I are scored as flight-only missions', () => {
    for (const [id, rid, site] of [['moonshot', 'saturn_v', 'cape_canaveral'], ['rehbar_1962', 'rehbar_nike_cajun', 'sonmiani']]) {
      const b = { missionId: id, spacecraft: null, vehicle: { rocketId: rid, launchSiteId: site, pitchKickDeg: 3, parts: [], bolts: [], jointWarps: [], avionicsCables: [], armed: true } };
      const fl = runFlight(data, b, id); const g = game(b, { flight: fl.record, events: fl.events });
      const score = computeScore(g, { daysAlive: 0, imagesDownlinked: 0, survived: false, wiringIssues: [] }, null);
      expect(score.stars).toBeGreaterThanOrEqual(2); expect(score.breakdown.map((l) => l.id)).toEqual(['success', 'margins', 'decision']);
    }
  });
});

describe('pre-launch checklist', () => {
  it('flags the SAFE plug and the RBF pin, with fix actions', () => {
    const b = buildDemo(data, {}); const items = buildChecklist({ data, missionId: 'floodwatch_1', spacecraft: b.spacecraft, vehicle: b.vehicle });
    expect(items.filter((i) => !i.pass).map((i) => i.id).sort()).toEqual(['pad_arm', 'pad_rbf']);
    expect(items.find((i) => i.id === 'pad_arm').action).toBe('arm');
  });
  it('a bad joint fails the joints item and points at the VAB', () => {
    const b = buildDemo(data, { padReady: true, badJoint: true }); const it = buildChecklist({ data, missionId: 'floodwatch_1', spacecraft: b.spacecraft, vehicle: b.vehicle }).find((i) => i.id === 'rk_joints');
    expect(it.pass).toBe(false); expect(it.fixScene).toBe('vab');
  });
  it('flight-only missions drop the CubeSat items', () => {
    const items = buildChecklist({ data, missionId: 'moonshot', spacecraft: buildDemo(data, {}).spacecraft, vehicle: { rocketId: 'saturn_v', launchSiteId: 'cape_canaveral', parts: [], bolts: [], jointWarps: [], avionicsCables: [], armed: false } });
    expect(items.map((i) => i.id)).toEqual(['fd_site']);
  });
});

describe('failure lab', () => {
  it('Broken Pathfinder: three seeded faults appear and are fixed again', () => {
    const job = data.getMission('failure_broken_pathfinder'); const rules = data.getRules(); const b = buildDemo(data, { padReady: true });
    seedFaults(b.vehicle, rules, job.seededFaults);
    expect(job.seededFaults.every((f) => !isFaultFixed(f, b.vehicle, rules))).toBe(true);
    const fl = runFlight(data, b, 'floodwatch_1'); expect(fl.record.outcome).not.toBe('Orbit');
    // fix: refit and torque bolts in star order, replug the cables
    const st = BoltJointState.loadFrom(rules.getJoint('j_interstage_s2'), b.vehicle); for (let i = 0; i < 12; i++) st.insert(i);
    for (let p = 1; p <= 3; p++) for (const i of starOrder(12)) st.applyTorque(i, st.passTargetNm(p)); st.saveTo(b.vehicle);
    b.vehicle.avionicsCables.push({ fromPort: 'av_flight_computer/PYRO_OUT_3', toPort: 'av_igniter_s2/PYRO_IN' });
    b.vehicle.avionicsCables = b.vehicle.avionicsCables.filter((c) => c.fromPort !== 'av_flight_computer/DATA_3');
    b.vehicle.avionicsCables.push({ fromPort: 'av_flight_computer/DATA_1', toPort: 'av_imu/DATA' });
    expect(job.seededFaults.every((f) => isFaultFixed(f, b.vehicle, rules))).toBe(true);
  });
  it('job score: 10 per hint, 50 per fault left in', () => { expect(jobScore(300, 3, 3, 0)).toBe(300); expect(jobScore(300, 3, 3, 2)).toBe(280); expect(jobScore(300, 3, 1, 0)).toBe(0); });
  it('Apollo 12: right calls in order, wrong calls cost 60', () => {
    const job = data.getMission('failure_apollo12'); const r = new ApolloRun();
    const [a, b] = [job.consoleChoices.find((c) => c.correctAtStep === 1), job.consoleChoices.find((c) => c.correctAtStep === 2)];
    expect(r.pick(job.consoleChoices.find((c) => c.correctAtStep === 0))).toBe(false); expect(r.pick(b)).toBe(false); expect(r.pick(a)).toBe(true); expect(r.pick(b)).toBe(true);
    expect(r.step).toBe(3); expect(r.score(300)).toBe(180);
  });
});

describe('HOUSTON advisor', () => {
  const ctxFor = (bundle, screen) => buildContext(game(bundle), screen);
  it('next step walks the CubeSat assembly order, then wiring, then the rocket', () => {
    const empty = { missionId: 'floodwatch_1', spacecraft: { parts: [], cables: [], rbfPinPulled: false, orbitAltitudeKm: 550 }, vehicle: buildDemo(data, {}).vehicle };
    expect(nextStep(ctxFor(empty, 'bay')).text).toMatch(/EPS/);
    const full = buildDemo(data, {}); expect(nextStep(ctxFor(full, 'bay')).reasonCode).toBe('cubesat_ready');
    const noRf = buildDemo(data, { missingRf: true }); expect(nextStep(ctxFor(noRf, 'bay')).reasonCode).toBe('wiring_needed');
  });
  it('scan finds a bad joint and ranks blockers first', () => {
    const f = scan(ctxFor(buildDemo(data, { badJoint: true, padReady: false }), 'vab'));
    expect(f[0].severity).toBe(FaultSeverity.Blocker); expect(f.some((x) => x.why === 'bolts_missing')).toBe(true); expect(f.some((x) => x.why === 'joint_warped')).toBe(true);
  });
  it('scan warns that ARMED inside the VAB is dangerous', () => expect(scan(ctxFor(buildDemo(data, { padReady: true }), 'vab')).some((x) => x.why === 'armed_in_vab')).toBe(true));
  it('where does this go: a cable end lists compatible ports, required first', () => {
    const t = whereDoesThisGo('radio_sband/RF', ctxFor(buildDemo(data, { missingRf: true }), 'bay')); expect(t[0].objectRef).toBe('ant_patch/RF'); expect(t[0].reasonCode).toBe('required_connection');
  });
  it('what-if answers from the budget model, never from the AI', () => {
    const b = buildDemo(data, {}); const a = evaluateWhatIf('What if I use the HD camera instead?', data, b.spacecraft, mission, rocket);
    expect(a.text).toMatch(/WHAT IF: HD imaging camera|WHAT IF:/); expect(a.text).toMatch(/Cost/); expect(evaluateWhatIf('hello', data, b.spacecraft, mission, rocket)).toBeNull();
  });
  it('codex matcher finds entries by title words', () => { expect(matchCodex('what does the EPS do?', data, 1)).toEqual(['eps']); expect(matchCodex('tell me about bolts and star patterns', data, 2)).toContain('star_pattern'); });
});

describe('design codes', () => {
  it('round-trips through gzip + base64 and is cleaned on import', async () => {
    const b = buildDemo(data, { padReady: true }); const code = await encodeDesign(b);
    expect(code.startsWith('TM1-')).toBe(true);
    const { bundle, error } = await decodeDesign(code); expect(error).toBeNull(); expect(bundle.spacecraft.parts.length).toBe(10);
    bundle.vehicle.rocketId = 'nonsense'; bundle.spacecraft.parts.push({ instanceId: 'x', partId: 'does_not_exist' }); bundle.spacecraft.orbitAltitudeKm = 99999;
    expect(cleanDesign(bundle, data)).toBeGreaterThanOrEqual(3); expect(bundle.vehicle.rocketId).toBe('pathfinder'); expect(bundle.spacecraft.orbitAltitudeKm).toBe(2000);
  });
  it('rejects garbage', async () => expect((await decodeDesign('TM1-not-a-code')).bundle).toBeNull());
  it('crew vote codes carry the design hash', () => {
    const b = buildDemo(data, {}); const v = encodeVote({ role: CrewRole.ScienceBudget, go: true, name: 'Aisha', designHash: designHash(b), openItems: 0 });
    const { vote } = decodeVote(v); expect(vote.role).toBe('ScienceBudget'); expect(vote.designHash).toBe(designHash(b)); expect(decodeVote('TMV1-@@@').vote).toBeNull();
  });
});
