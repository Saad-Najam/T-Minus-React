import { C, FlightPhase, add, altitude, airVelocity, dot, mag, mul, norm, orbitElements, pressure, sub } from './physics.js';

// Port of TMinus.Flight.FlightGuidance (autopilot, sounding-rocket profile, altitude hold, manual control).
export function autopilot(sim) {
  const state = sim.position;
  const radial = norm(state);
  const east = { x: -radial.y, y: radial.x };
  const air = airVelocity(state, sim.options.latitudeDeg);
  const relative = sub(sim.velocity, air);
  let direction = radial;
  const h = altitude(state);
  const relativeSpeed = mag(relative);
  const targetRadius = C.EarthRadiusM + sim.options.targetAltitudeKm * 1000;
  let throttle = 1;
  if (sim.options.suborbital) return suborbital(sim, radial, east, h);

  if (sim.phase === FlightPhase.Pad) {
    const first = sim.vehicle.stages[sim.stageIndex];
    const seaLevelThrust = (first.thrustVacN * first.ispSeaLevel) / Math.max(1, first.ispVac);
    if (seaLevelThrust * sim.manualThrottle > sim.massKg * C.G0) sim.setPhase(FlightPhase.Ascent);
    else direction = radial; // Hold-down clamps keep a sub-TWR vehicle on the pad.
  }
  if (sim.phase === FlightPhase.Ascent) {
    const orbit = orbitElements(state, sim.velocity);
    if (h >= C.OrbitalCutoffMinAltitudeM && orbit.bound && orbit.apoapsisM >= targetRadius && dot(relative, radial) > 0) {
      sim.setPhase(FlightPhase.Coast); throttle = 0;
    } else if (relativeSpeed < 100 && h < 1000) direction = radial;
    else {
      if (!sim.pitchKicked) sim.markPitchKick();
      const v = sim.vehicle;
      const turn = Math.max(0, Math.min(1, (h - 1000) / v.turnSpanM));
      const pitch = ((sim.options.pitchKickDeg + turn * v.turnDeg) * Math.PI) / 180;
      direction = h >= v.turnEndM ? east : add(mul(radial, Math.cos(pitch)), mul(east, Math.sin(pitch)));
      if (v.altitudeHold && h >= v.turnEndM) direction = altitudeHold(sim, radial, east, relative, h, v);
    }
  }
  if (sim.phase === FlightPhase.Coast) {
    throttle = 0;
    if (dot(relative, radial) <= 0) { sim.setPhase(FlightPhase.Circularize); throttle = 1; direction = norm(sim.velocity); }
  } else if (sim.phase === FlightPhase.Circularize) {
    direction = norm(sim.velocity);
    const orbit = orbitElements(state, sim.velocity);
    if (orbit.bound && orbit.periapsisM >= targetRadius - 10000) { sim.setPhase(FlightPhase.Orbit); throttle = 0; }
  }
  if (sim.phase === FlightPhase.Orbit || sim.phase === FlightPhase.Failed || sim.phase === FlightPhase.Aborted) throttle = 0;
  return { throttle, thrustDirection: norm(direction) };
}

/** A sounding rocket: lift off once thrust beats weight, straight up for 300 m, then a fixed small tilt towards the east. */
function suborbital(sim, radial, east, h) {
  if (sim.phase === FlightPhase.Pad) {
    const first = sim.vehicle.stages[sim.stageIndex];
    if (((first.thrustVacN * first.ispSeaLevel) / Math.max(1, first.ispVac)) * sim.manualThrottle > sim.massKg * C.G0) sim.setPhase(FlightPhase.Ascent);
  }
  const kick = (sim.options.pitchKickDeg * Math.PI) / 180;
  if (!sim.pitchKicked && h >= 300) sim.markPitchKick();
  const direction = h < 300 ? radial : add(mul(radial, Math.cos(kick)), mul(east, Math.sin(kick)));
  const done = sim.phase === FlightPhase.Failed || sim.phase === FlightPhase.Aborted || sim.phase === FlightPhase.Apogee;
  return { throttle: done ? 0 : 1, thrustDirection: norm(direction) };
}

/** For a stage whose thrust cannot hold its weight: tilt the thrust up from the horizon just enough to cancel the sinking. */
function altitudeHold(sim, radial, east, relative, h, v) {
  const index = Math.max(0, Math.min(sim.stageIndex, v.stages.length - 1));
  const s = v.stages[index];
  const isp = s.ispVac - ((s.ispVac - s.ispSeaLevel) * pressure(h)) / C.SeaLevelPressurePa;
  const accel = (s.thrustVacN * isp) / Math.max(1, s.ispVac) / Math.max(1, sim.massKg);
  const r = mag(sim.position);
  const g = C.Mu / (r * r);
  const sideways = dot(relative, east); const climb = dot(relative, radial);
  const need = g - (sideways * sideways) / r - v.vrGain * climb; // upward acceleration still needed
  const sin = Math.max(0, Math.min(v.maxClimb, need / accel));
  if (accel < 1.5 * g || sin > 0.05) return add(mul(radial, sin), mul(east, Math.sqrt(1 - sin * sin)));
  return east;
}

export function manual(sim) {
  const radial = norm(sim.position);
  const tangent = { x: -radial.y, y: radial.x };
  const a = (sim.manualPitchDeg * Math.PI) / 180;
  return { throttle: sim.manualThrottle, thrustDirection: norm(add(mul(radial, Math.sin(a)), mul(tangent, Math.cos(a)))) };
}
