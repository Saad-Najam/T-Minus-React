import { Severity } from '../severity.js';
import { AvionicsReport } from '../avionics.js';
import { C, FlightPhase, add, airVelocity, altitude, density, dot, dragCoefficient, dynamicPressure, mag, mul, norm, orbitElements, pressure, rotate, sub } from './physics.js';
import { autopilot, manual } from './guidance.js';

const TELEMETRY_EVERY_N_STEPS = 4;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * Port of TMinus.Flight.FlightSim: a pure two-dimensional flight solver (RK4, fixed 0.05 s step) over a round rotating Earth.
 * The 3D view only draws the samples. `joints` is a list of { jointId, failureQkPa }; `avionics` is an AvionicsReport.
 */
export class FlightSim {
  constructor(vehicle, options, avionics = null, joints = [], events = null) {
    this.vehicle = vehicle; this.options = options;
    this._avionics = avionics || AvionicsReport.perfect();
    this._events = events;
    this._fuel = vehicle.stages.map((s) => s.propMassKg);
    this._stageAttached = vehicle.stages.map(() => true);
    this._burnoutHandled = vehicle.stages.map(() => false);
    this._componentAttached = vehicle.components.map(() => true);
    this._joints = new Map();
    for (const j of joints || []) if (j) this._joints.set(j.jointId, j);
    this.outcome = { phase: FlightPhase.Pad, failureCode: null, failureCause: null, maxQPa: 0, maxQTimeS: 0, telemetry: [] };
    this.phase = FlightPhase.Pad;
    this.manualThrottle = 1; this.manualPitchDeg = 90; this.recordTelemetry = true;
    this.pitchKicked = false; this.guidanceErrorDeg = 0;
    this._fairingChecked = false; this._guidanceFailureLogged = false; this._fairingStuckLogged = false;
    this._advanceRemainder = 0; this._sampleCounter = 0; this._stageIgnited = true;
    this._time = 0; this._maxQ = 0; this.stageIndex = 0;

    this._startAngle = (options.longitudeDeg * Math.PI) / 180;
    this._rotationRate = C.EarthRotationRadS * Math.cos((options.latitudeDeg * Math.PI) / 180);
    const startRadius = C.EarthRadiusM + options.initialAltitudeKm * 1000;
    this.position = { x: startRadius * Math.cos(this._startAngle), y: startRadius * Math.sin(this._startAngle) };
    const east = { x: -Math.sin(this._startAngle), y: Math.cos(this._startAngle) };
    this.velocity = mul(east, options.startInCircularOrbit ? Math.sqrt(C.Mu / startRadius) : this._rotationRate * startRadius);
    this._mass = vehicle.initialMassKg(options.payloadMassKg);
    if (options.initialAltitudeKm > 0 || options.startInCircularOrbit) this.phase = FlightPhase.Coast;
    this.outcome.phase = this.phase;
    if (vehicle.stages.length === 0 || this._mass <= 0) this._fail('invalid_vehicle', 'No usable rocket stage is configured.', vehicle.id);
    else if (!this._avionics.s1IgnitionOk) {
      this._stageIgnited = false;
      const cause = this._cause('no_ignition');
      this._fail('ignition_failure', cause === 'av_safe_arm'
        ? 'Stage 1 did not ignite: the Safe/Arm plug was still on SAFE, so the igniter got no firing current.'
        : 'Stage 1 did not ignite; launch aborted.', cause);
      this.phase = FlightPhase.Aborted; this.outcome.phase = this.phase;
    } else this._log('launch', 'Stage 1 ignition confirmed.', null, Severity.Info);
  }

  get massKg() { return this._mass; }
  get timeS() { return this._time; }
  get terminal() { return [FlightPhase.Orbit, FlightPhase.Failed, FlightPhase.Aborted, FlightPhase.Apogee].includes(this.phase); }
  setManualControl(throttle, pitchDeg) { this.manualThrottle = clamp(throttle, 0, 1); this.manualPitchDeg = clamp(pitchDeg, 0, 180); }
  setPhase(p) { this.phase = p; this.outcome.phase = p; }
  markPitchKick() { this.pitchKicked = true; }
  fuelOf(i) { return this._fuel[i]; }
  stageAttached(i) { return this._stageAttached[i]; }
  componentAttached(i) { return this._componentAttached[i]; }

  /** Advance wall-clock seconds at a clamped warp, always stepping with 0.05 s integration. */
  advance(realSeconds, requestedWarp) {
    const maxWarp = altitude(this.position) < C.AtmosphereLimitM ? 4 : 100;
    let warp = requestedWarp >= 100 ? 100 : requestedWarp >= 4 ? 4 : requestedWarp >= 2 ? 2 : 1;
    warp = Math.min(warp, maxWarp);
    // Keep the part of a step that did not fit this frame, so x1 and x2 flights advance at 60 fps.
    this._advanceRemainder += Math.max(0, realSeconds) * warp;
    const count = Math.min(2000, Math.floor(this._advanceRemainder / C.Dt + 1e-9));
    this._advanceRemainder = Math.min(C.Dt, Math.max(0, this._advanceRemainder - count * C.Dt));
    for (let i = 0; i < count && !this.terminal; i++) this.step();
  }

  runForSimSeconds(seconds) {
    const end = this._time + Math.max(0, seconds);
    while (this._time + 1e-9 < end && !this.terminal) this.step();
  }

  step() {
    if (this.terminal) return;
    if (this._burnoutPending()) this._handleBurnout();
    if (this.terminal) return;
    const command = this.options.autopilot ? autopilot(this) : manual(this);
    this._updateManualPhase();
    this._checkStrandedOrbit();
    if (!this._avionics.guidanceOk) {
      this.guidanceErrorDeg += 0.5 * C.Dt;
      if (!this._guidanceFailureLogged) {
        this._guidanceFailureLogged = true;
        this._log('guidance_drift', 'IMU guidance is unavailable; pitch error is growing by 0.5 degrees per second.', this._cause('guidance_drift'), Severity.Fault);
      }
      command.thrustDirection = norm(rotate(command.thrustDirection, (this.guidanceErrorDeg * Math.PI) / 180));
    }
    if (!this._stageIgnited || this.stageIndex < 0 || this.stageIndex >= this.vehicle.stages.length || this._fuel[this.stageIndex] <= 0) command.throttle = 0;
    this.lastCommand = command;
    this._integrate(C.Dt, command);
    this._holdDownOnPad();
    this._time += C.Dt;
    const h = altitude(this.position);
    const q = dynamicPressure(this.position, this.velocity, this.options.latitudeDeg);
    if (q > this._maxQ) { this._maxQ = q; this.outcome.maxQPa = q; this.outcome.maxQTimeS = this._time; }
    this._checkJointFailure(q);
    this._checkFairing(h);
    // A sounding rocket's flight ends at its highest point: when it stops climbing.
    if (this.options.suborbital && this.phase !== FlightPhase.Pad && !this.terminal && this._time > 3 && h > 1000 && dot(norm(this.position), this.velocity) <= 0) {
      this.setPhase(FlightPhase.Apogee);
      this._log('apogee', `Apogee reached at ${(h / 1000).toFixed(1)} km.`, null, Severity.Info);
    }
    if (h < -10 && this._time > 2) this._fail('impact', 'The vehicle fell back to Earth.', null);
    if (this._burnoutPending()) this._handleBurnout();
    if (this.recordTelemetry && (++this._sampleCounter % TELEMETRY_EVERY_N_STEPS === 0 || this.terminal)) this.outcome.telemetry.push(this.sample(command));
    this.outcome.phase = this.phase;
  }

  _burnoutPending() {
    const i = this.stageIndex;
    return i >= 0 && i < this._fuel.length && this._fuel[i] <= 1e-9 && !this._burnoutHandled[i];
  }

  /** Phase changes for manual control: lift-off once thrust beats weight; orbit once the whole path is above the atmosphere. */
  _updateManualPhase() {
    if (this.options.autopilot) return;
    if (this.phase === FlightPhase.Pad) {
      if (this._stageIgnited && this.stageIndex >= 0 && this.stageIndex < this.vehicle.stages.length) {
        const s = this.vehicle.stages[this.stageIndex];
        const sl = (s.thrustVacN * s.ispSeaLevel) / Math.max(1, s.ispVac);
        if (sl * this.manualThrottle > this._mass * C.G0) this.setPhase(FlightPhase.Ascent);
      }
      return;
    }
    const launchedFromGround = this.options.initialAltitudeKm <= 0 && !this.options.startInCircularOrbit;
    if (launchedFromGround && [FlightPhase.Ascent, FlightPhase.Coast, FlightPhase.Circularize].includes(this.phase)) {
      const o = orbitElements(this.position, this.velocity);
      if (o.bound && o.periapsisM - C.EarthRadiusM >= C.AtmosphereLimitM) this.setPhase(FlightPhase.Orbit);
    }
  }

  /** All propellant gone while coasting but the path stays above the atmosphere: a stable orbit, just not the target one. */
  _checkStrandedOrbit() {
    if (this.phase !== FlightPhase.Coast && this.phase !== FlightPhase.Circularize) return;
    if (this.options.initialAltitudeKm > 0 || this.options.startInCircularOrbit) return;
    if (this._fuel.some((f) => f > 1e-6)) return;
    const o = orbitElements(this.position, this.velocity);
    if (!o.bound || o.periapsisM - C.EarthRadiusM < C.AtmosphereLimitM) return;
    this._log('orbit_off_target', 'Out of propellant, but the whole path stays above the atmosphere: a stable orbit, though not the target one.', null, Severity.Warning);
    this.setPhase(FlightPhase.Orbit);
  }

  _holdDownOnPad() {
    if (this.phase !== FlightPhase.Pad) return;
    const radial = norm(this.position);
    this.position = mul(radial, C.EarthRadiusM);
    this.velocity = sub(this.velocity, mul(radial, dot(this.velocity, radial)));
  }

  _cause(consequence) { return this._avionics.causeId(consequence); }

  _handleBurnout() {
    const spent = this.stageIndex;
    this._burnoutHandled[spent] = true;
    const st = this.vehicle.stages;
    this._log('stage_cutoff', `${st[spent].id} propellant depleted.`, st[spent].id, Severity.Info);
    if (spent + 1 >= st.length) return;
    if (!this._avionics.stageSeparationOk) { this._fail('stuck_stage', 'Stage separation command failed; the upper stage remains attached.', this._cause('stuck_stage')); return; }
    const jointId = this.vehicle.separationJoints[st[spent].id] ?? st[spent].id;
    const joint = this._joints.get(jointId);
    if (joint && this._maxQ / 1000 > joint.failureQkPa) { this._fail('joint_failure', `${jointId} failed under dynamic pressure.`, jointId); return; }
    this._dropStage(spent);
    this._log('stage_separation', `${st[spent].id} separated.`, jointId, Severity.Info);
    this.stageIndex++;
    this._stageIgnited = this._avionics.s2IgnitionOk;
    if (!this._stageIgnited) this._log('s2_no_thrust', 'Stage 2 igniter is not wired; the upper stage will coast.', this._cause('s2_no_thrust'), Severity.Fault);
    else this._log('stage_ignition', `${st[this.stageIndex].id} ignition confirmed.`, st[this.stageIndex].id, Severity.Info);
  }

  _dropStage(index) {
    if (!this._stageAttached[index]) return;
    this._stageAttached[index] = false;
    this._mass = Math.max(0, this._mass - this.vehicle.stages[index].dryMassKg - this._fuel[index]);
    this.vehicle.components.forEach((c, i) => {
      if (this._componentAttached[i] && c.dropWithStage === this.vehicle.stages[index].id) { this._mass -= c.massKg; this._componentAttached[i] = false; }
    });
  }

  _checkJointFailure(qPa) {
    const qKpa = qPa / 1000;
    for (const joint of this._joints.values()) {
      if (qKpa > joint.failureQkPa) { this._fail('joint_failure', `${joint.jointId} failed above its ${joint.failureQkPa.toFixed(1)} kPa limit.`, joint.jointId); return; }
    }
  }

  _checkFairing(altitudeM) {
    if (this._fairingChecked || altitudeM < 110000) return;
    this._fairingChecked = true;
    const comps = this.vehicle.components;
    const hasFairing = comps.some((c, i) => this._componentAttached[i] && c.jettisonAltitudeKm >= 110);
    if (!hasFairing) return;
    if (!this._avionics.fairingSeparationOk) {
      if (this._fairingStuckLogged) return;
      this._fairingStuckLogged = true;
      this._log('fairing_stuck', 'Fairing separation failed; the fairing stays attached.', this._cause('fairing_stuck'), Severity.Fault);
      return;
    }
    comps.forEach((c, i) => { if (this._componentAttached[i] && c.jettisonAltitudeKm >= 110) { this._mass -= c.massKg; this._componentAttached[i] = false; } });
    this._log('fairing_jettison', 'Fairing released above 110 km.', null, Severity.Info);
  }

  _integrate(dt, command) {
    const y = { p: this.position, v: this.velocity, mass: this._mass, prop: this.stageIndex >= 0 && this.stageIndex < this._fuel.length ? this._fuel[this.stageIndex] : 0 };
    const k1 = this._derivative(y, command, dt);
    const k2 = this._derivative(mAdd(y, mScale(k1, dt * 0.5)), command, dt);
    const k3 = this._derivative(mAdd(y, mScale(k2, dt * 0.5)), command, dt);
    const k4 = this._derivative(mAdd(y, mScale(k3, dt)), command, dt);
    const sum = mAdd(mAdd(k1, mScale(k2, 2)), mAdd(mScale(k3, 2), k4));
    const next = mAdd(y, mScale(sum, dt / 6));
    const newProp = clamp(next.prop, 0, y.prop);
    const consumed = y.prop - newProp;
    this.position = next.p; this.velocity = next.v;
    this._mass = Math.max(1, y.mass - consumed);
    if (this.stageIndex >= 0 && this.stageIndex < this._fuel.length) this._fuel[this.stageIndex] = newProp;
  }

  _derivative(y, command, dt) {
    const r = Math.max(1, mag(y.p)); const alt = r - C.EarthRadiusM;
    const gravity = mul(y.p, -C.Mu / (r * r * r));
    const rel = sub(y.v, airVelocity(y.p, this.options.latitudeDeg));
    const rho = density(alt); const speed = mag(rel);
    const area = (Math.PI * this.vehicle.maxDiameterM * this.vehicle.maxDiameterM) / 4;
    const drag = 0.5 * rho * speed * speed * dragCoefficient(speed) * area;
    const dragAccel = y.mass > 0 && speed > 0 ? mul(rel, -drag / (speed * y.mass)) : { x: 0, y: 0 };
    let thrust = 0; let mdot = 0;
    if (this.stageIndex >= 0 && this.stageIndex < this.vehicle.stages.length && this._stageIgnited && y.prop > 0 && command.throttle > 0) {
      const stage = this.vehicle.stages[this.stageIndex];
      const nominal = (stage.thrustVacN / (C.G0 * stage.ispVac)) * command.throttle;
      mdot = Math.min(nominal, y.prop / dt);
      const isp = stage.ispVac - ((stage.ispVac - stage.ispSeaLevel) * pressure(alt)) / C.SeaLevelPressurePa;
      thrust = mdot * C.G0 * isp;
    }
    const accel = add(add(gravity, dragAccel), mul(command.thrustDirection, thrust / Math.max(1, y.mass)));
    return { p: y.v, v: accel, mass: -mdot, prop: -mdot };
  }

  _fail(code, message, cause) {
    this.outcome.failureCode = code; this.outcome.failureCause = cause;
    if (this.phase !== FlightPhase.Aborted) this.setPhase(FlightPhase.Failed);
    this._log(code, message, cause, Severity.Fault);
  }
  _log(code, message, cause, severity) { this._events?.addAt(this._time, 'flight', code, message, cause, severity); }

  // ------------------------------------------------------------------ telemetry
  sample(command) {
    const alt = altitude(this.position);
    const rel = sub(this.velocity, airVelocity(this.position, this.options.latitudeDeg));
    const orbit = orbitElements(this.position, this.velocity);
    const q = dynamicPressure(this.position, this.velocity, this.options.latitudeDeg);
    const thrust = this._currentThrust(command.throttle, alt);
    const fuel = this._fuel.map((f, i) => (this.vehicle.stages[i].propMassKg > 0 ? (100 * f) / this.vehicle.stages[i].propMassKg : 0));
    return {
      timeS: this._time, altitudeM: alt, downrangeM: this._downrange(), surfaceSpeedMs: mag(rel), orbitalSpeedMs: mag(this.velocity),
      accelerationG: thrust / Math.max(1, this._mass) / C.G0, dynamicPressurePa: q, massKg: this._mass, throttle: command.throttle, thrustN: thrust,
      thrustToWeight: thrust / Math.max(1, this._mass * C.G0), deltaVRemainingMs: this.deltaVRemaining(),
      apoapsisM: orbit.apoapsisM, periapsisM: orbit.periapsisM, stageIndex: this.stageIndex, propellantPercent: fuel, phase: this.phase,
    };
  }
  _currentThrust(throttle, alt) {
    if (this.stageIndex < 0 || this.stageIndex >= this.vehicle.stages.length || !this._stageIgnited) return 0;
    const s = this.vehicle.stages[this.stageIndex];
    const isp = s.ispVac - ((s.ispVac - s.ispSeaLevel) * pressure(alt)) / C.SeaLevelPressurePa;
    return ((s.thrustVacN * isp) / Math.max(1, s.ispVac)) * Math.max(0, Math.min(1, throttle));
  }
  deltaVRemaining() {
    let m = this._mass; let sum = 0;
    for (let i = Math.max(0, this.stageIndex); i < this.vehicle.stages.length; i++) {
      if (!this._stageAttached[i]) continue;
      const s = this.vehicle.stages[i]; const prop = this._fuel[i];
      if (prop <= 0 || m <= prop) { m -= s.dryMassKg; continue; }
      sum += s.ispVac * C.G0 * Math.log(m / (m - prop));
      m -= prop + s.dryMassKg;
      for (const c of this.vehicle.components) if (c.dropWithStage === s.id) m -= c.massKg;
    }
    return sum;
  }
  _downrange() {
    const angle = Math.atan2(this.position.y, this.position.x);
    let delta = angle - this._startAngle - this._rotationRate * this._time;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    return delta * C.EarthRadiusM;
  }
}

const mAdd = (a, b) => ({ p: add(a.p, b.p), v: add(a.v, b.v), mass: a.mass + b.mass, prop: a.prop + b.prop });
const mScale = (a, s) => ({ p: mul(a.p, s), v: mul(a.v, s), mass: a.mass * s, prop: a.prop * s });
