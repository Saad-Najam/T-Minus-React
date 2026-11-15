import { describe, it, expect } from 'vitest';
import { loadData } from './helpers.js';
import { buildDemo } from '../src/engine/design.js';
import { runFlight } from '../src/engine/flightRun.js';
import { BoltJointState } from '../src/engine/bolts.js';

const data = loadData();

describe('flight sim parity with the Unity game', () => {
  it('a correct Pathfinder reaches the 550 km orbit and deploys', () => {
    const bundle = buildDemo(data, { padReady: true });
    const r = runFlight(data, bundle, "floodwatch_1");
    expect(r.record.outcome).toBe('Orbit');
    expect(r.record.orbitAchieved).toBe(true);
    expect(r.record.deployed).toBe(true);
    expect(r.record.periapsisKm).toBeGreaterThan(530);
    // The original README: the lighter payload raises max-Q only to about 41 kPa.
    expect(r.record.maxQKPa).toBeGreaterThan(35);
    expect(r.record.maxQKPa).toBeLessThan(48);
  });

  it('a clockwise one-pass joint with 3 bolts missing fails at max-Q', () => {
    const bundle = buildDemo(data, { padReady: true, badJoint: true });
    const r = runFlight(data, bundle, "floodwatch_1");
    expect(r.record.outcome).toBe('Failed');
    expect(r.record.failureCode).toBe('joint_failure');
    expect(r.record.failureCause).toBe('j_s1_interstage');
  });

  it('stays on SAFE: the igniter gets no current and the launch aborts', () => {
    const bundle = buildDemo(data, { padReady: false });
    const r = runFlight(data, bundle, "floodwatch_1");
    expect(r.record.outcome).toBe('Aborted');
    expect(r.record.failureCode).toBe('ignition_failure');
    expect(r.record.failureCause).toBe('av_safe_arm');
  });

  it('a missing separation cable leaves the stage stuck', () => {
    const bundle = buildDemo(data, { padReady: true, noSeparation: true });
    const r = runFlight(data, bundle, "floodwatch_1");
    expect(r.record.failureCode).toBe('stuck_stage');
    expect(r.record.failureCause).toBe('w_pyro2');
  });

  it('Moonshot: Saturn V reaches a 185 km parking orbit with delta-v left for TLI', () => {
    const bundle = { missionId: 'moonshot', spacecraft: null, vehicle: { rocketId: 'saturn_v', launchSiteId: 'cape_canaveral', pitchKickDeg: 3, parts: [], bolts: [], jointWarps: [], avionicsCables: [], armed: true } };
    const r = runFlight(data, bundle, "moonshot");
    expect(r.record.outcome).toBe('Orbit');
    expect(r.record.deltaVLeftMs).toBeGreaterThan(2800); // README: about 2,960-2,990 m/s for kicks of 2-6 deg
  });

  it('Rehbar-I: the sounding rocket reaches about 130 km apogee', () => {
    const bundle = { missionId: 'rehbar_1962', spacecraft: null, vehicle: { rocketId: 'rehbar_nike_cajun', launchSiteId: 'sonmiani', pitchKickDeg: 3, parts: [], bolts: [], jointWarps: [], avionicsCables: [], armed: true } };
    const r = runFlight(data, bundle, "rehbar_1962");
    expect(r.record.outcome).toBe('Apogee');
    expect(r.record.apoapsisKm).toBeGreaterThan(120);
    expect(r.record.apoapsisKm).toBeLessThan(140);
  });

  it('bolt star order and joint integrity match the rules', () => {
    const def = data.getRules().getJoint('j_s1_interstage');
    const st = new BoltJointState(def);
    for (let i = 0; i < def.boltCount; i++) st.insert(i);
    expect(st.getStatus().integrity).toBe(0);
    for (let p = 1; p <= 3; p++) for (const i of [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11]) st.applyTorque(i, st.passTargetNm(p));
    expect(st.getStatus().integrity).toBe(1);
    expect(st.sequenceErrors).toBe(0);
  });
});
