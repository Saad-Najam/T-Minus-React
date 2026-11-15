import { AvionicsReport } from './avionics.js';
import { BoltJointState } from './bolts.js';
import { computeSpacecraftReport } from './budget.js';
import { EventLog } from './eventLog.js';
import { Severity } from './severity.js';
import { FlightSim } from './flight/sim.js';
import { createVehicle, launchOptionsFor } from './flight/vehicle.js';
import { C, FlightPhase } from './flight/physics.js';

/** True when every part of a buildable rocket is stacked (the same test as the checklist's "Rocket fully stacked"). */
export function rocketAssembled(data, vehicle) {
  const rocket = data.getRocket(vehicle.rocketId);
  if (!rocket || !rocket.buildable) return { ok: true, mounted: vehicle.parts.length, needed: 0 };
  const needed = (data.getRules().assemblyOrder[rocket.id] || []).length;
  return { ok: needed === 0 || vehicle.parts.length >= needed, mounted: vehicle.parts.length, needed };
}

/**
 * Builds a FlightSim from a design bundle (FlightRuntime.Create + FlightController.EnsureInitialized). When a rocket is not buildable
 * (Saturn V, Rehbar-I) its avionics and joints are perfect, exactly as in the Unity game. A buildable rocket carries the player's CubeSat mass.
 */
export function createFlight(data, bundle, missionId, { events } = {}) {
  const vehicleDesign = bundle.vehicle;
  const rocket = data.getRocket(vehicleDesign.rocketId) ?? data.getRocket('pathfinder');
  const rules = data.getRules();
  const mission = data.getMission(missionId);
  const payloadKg = rocket.buildable && bundle.spacecraft ? computeSpacecraftReport(bundle.spacecraft, data, mission, rocket).massKg : undefined;
  const options = launchOptionsFor(data, { ...vehicleDesign, rocketId: rocket.id }, missionId, payloadKg);
  if (rocket.buildable && bundle.spacecraft?.orbitAltitudeKm > 0) options.targetAltitudeKm = bundle.spacecraft.orbitAltitudeKm;
  options.pitchKickDeg = vehicleDesign.pitchKickDeg > 0 ? vehicleDesign.pitchKickDeg : 3;
  const avionics = rocket.buildable ? AvionicsReport.compute(vehicleDesign, rules) : AvionicsReport.perfect();
  const joints = rocket.buildable ? BoltJointState.allStatuses(rules, vehicleDesign).map((s) => ({ jointId: s.jointId, failureQkPa: s.failureQkPa })) : [];
  const vehicle = createVehicle(rocket, rules);
  const sim = new FlightSim(vehicle, options, avionics, joints, events);
  return { sim, avionics, rocket, options };
}

export function twrAtLiftoff(sim) {
  const s = sim.vehicle.stages[0];
  const thrustSl = s.thrustVacN * (s.ispVac > 0 ? s.ispSeaLevel / s.ispVac : 1);
  return thrustSl / (sim.massKg * C.G0);
}

/** What the debrief stores about a finished flight (FlightController.Finish). */
export function makeFlightRecord(sim, rocket, deployed, outcome, failureCode, failureCause) {
  const last = sim.outcome.telemetry[sim.outcome.telemetry.length - 1];
  const tel = [];
  let nextT = 0;
  for (const s of sim.outcome.telemetry) if (s.timeS >= nextT) { nextT = s.timeS + 1; tel.push({ t: s.timeS, altitudeKm: s.altitudeM / 1000, speedMs: s.orbitalSpeedMs, qKPa: s.dynamicPressurePa / 1000 }); }
  return {
    flown: true, outcome, orbitAchieved: outcome === 'Orbit', deployed, failureCode: failureCode ?? sim.outcome.failureCode ?? '', failureCause: failureCause ?? sim.outcome.failureCause ?? '',
    maxQKPa: sim.outcome.maxQPa / 1000, maxQTimeS: sim.outcome.maxQTimeS,
    apoapsisKm: last ? (last.apoapsisM - C.EarthRadiusM) / 1000 : 0, periapsisKm: last ? (last.periapsisM - C.EarthRadiusM) / 1000 : 0,
    flightTimeS: sim.timeS, flightOnly: !rocket.buildable, deltaVLeftMs: last ? last.deltaVRemainingMs : 0, telemetry: tel,
  };
}

export function outcomeOf(sim) {
  switch (sim.phase) {
    case FlightPhase.Orbit: return 'Orbit';
    case FlightPhase.Apogee: return 'Apogee';
    case FlightPhase.Aborted: return 'Aborted';
    default: return 'Failed';
  }
}

/** The CubeSat springs out once the fairing can open (FlightController.OnOrbit). Saturn V / Rehbar-I carry no CubeSat. */
export const isDeployed = (outcome, rocket, avionics) => outcome === 'Orbit' && rocket.buildable && avionics.fairingSeparationOk;

/** Headless: fly the whole mission (used by tests, fast-forward and Judge Mode). */
export function runFlight(data, bundle, missionId, { maxSimSeconds = 4000 } = {}) {
  const events = new EventLog();
  const f = createFlight(data, bundle, missionId, { events });
  const check = rocketAssembled(data, bundle.vehicle);
  if (!check.ok) {
    events.add('flight', 'abort_unbuilt', `The rocket is not fully assembled: ${check.mounted} of ${check.needed} parts are mounted.`, 'rk_stack', Severity.Fault);
    return { ...f, events, record: makeFlightRecord(f.sim, f.rocket, false, 'Aborted', 'abort_unbuilt', 'rk_stack') };
  }
  if (twrAtLiftoff(f.sim) < 1) {
    events.add('flight', 'abort_low_twr', `Not enough thrust to lift off: TWR ${twrAtLiftoff(f.sim).toFixed(2)}`, null, Severity.Fault);
    return { ...f, events, record: makeFlightRecord(f.sim, f.rocket, false, 'Aborted', 'abort_low_twr', null) };
  }
  f.sim.runForSimSeconds(maxSimSeconds);
  const outcome = outcomeOf(f.sim);
  return { ...f, events, record: makeFlightRecord(f.sim, f.rocket, isDeployed(outcome, f.rocket, f.avionics), outcome) };
}
