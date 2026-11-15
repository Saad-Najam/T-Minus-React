import { EventLog } from './eventLog.js';
import { Severity } from './severity.js';
import { C, FlightPhase, add, altitude, dot, mag, mul, norm, sub } from './flight/physics.js';
import { createFlight, isDeployed, makeFlightRecord, outcomeOf, rocketAssembled, twrAtLiftoff } from './flightRun.js';

/**
 * Live flight (port of FlightController): countdown, lift-off checks, time warp, banners, the event feed, released stages and the
 * end-of-flight record. Pure JS: the 3D scene and the HUD only read it.
 */
export class FlightSession {
  constructor(data, bundle, missionId, { replay = false, autoLaunch = false, warp = 1 } = {}) {
    this.data = data; this.bundle = bundle; this.missionId = missionId;
    this.events = new EventLog(() => this.sim?.timeS ?? 0);
    const f = createFlight(data, bundle, missionId, { events: this.events });
    Object.assign(this, f);
    this.sim.options.pitchKickDeg = bundle.vehicle.pitchKickDeg > 0 ? bundle.vehicle.pitchKickDeg : 3;
    this.mission = data.getMission(missionId);
    this.launched = false; this.ended = false; this.deployed = false; this.replay = replay;
    this.warp = warp; this.timeFactor = 1; this.paused = false; this.countdown = null; this._cdTimer = 0;
    this.feed = []; this.banner = null; this.releases = []; this.exploded = null;
    this.path = []; this._lastPathT = -10; this._maxQ = 0; this._maxQCalled = false; this._lastPhase = FlightPhase.Pad; this._pending = [...this.events.all];
    this.record = null; this.endedAt = 0; this.heading = { x: 0, y: 1 }; this.lastThrottle = 0; this.accel = 0;
    this.e0 = norm({ x: -Math.sin(this.sim._startAngle), y: Math.cos(this.sim._startAngle) });
    this.r0 = { x: Math.cos(this.sim._startAngle), y: Math.sin(this.sim._startAngle) };
    this.listeners = new Set();
    this.events.onAdd((e) => this._onEvent(e));
    this.maxThrust = Math.max(1, ...this.sim.vehicle.stages.map((s) => s.thrustVacN));
    this.autoLaunch = autoLaunch; this.replaySlowFrom = Infinity;
    if (replay) { this.replaySlowFrom = Math.max(0, (bundle.expectedFailT ?? 0) - 7); }
    this.feedPush(0, 'Flight computer ready. Awaiting launch command.', Severity.Info);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(type, data) { this.listeners.forEach((fn) => fn(type, data)); }
  feedPush(t, text, severity = Severity.Info) { this.feed.push({ t, text, severity, id: this.feed.length }); if (this.feed.length > 40) this.feed.shift(); }
  setBanner(text, good) { this.banner = { text, good, at: performance.now(), id: Math.random() }; }

  /** scene frame: X = east at the launch site, Y = up at the launch site. */
  toScene(p) { return { x: dot(p, this.e0), y: dot(p, this.r0) }; }
  dirToScene(d) { return { x: dot(d, this.e0), y: dot(d, this.r0) }; }
  get twr() { return twrAtLiftoff(this.sim); }
  get lastSample() { const t = this.sim.outcome.telemetry; return t.length ? t[t.length - 1] : null; }

  startCountdown(pitchKickDeg) {
    if (this.launched || this.ended || this.countdown != null) return;
    this.pendingKick = pitchKickDeg; this.countdown = 10; this._cdTimer = 1;
    this.feedPush(0, 'Countdown started · terminal checks green');
    this._emit('countdown', 10);
  }
  cancelCountdown() { this.countdown = null; this._emit('countdown', null); }

  /** T-0: check the stack and lift-off thrust, then release the clamps. */
  launch(pitchKickDeg = this.sim.options.pitchKickDeg) {
    if (this.launched || this.ended) return;
    this.countdown = null;
    this.sim.options.pitchKickDeg = pitchKickDeg; this.bundle.vehicle.pitchKickDeg = pitchKickDeg;
    const check = rocketAssembled(this.data, this.bundle.vehicle);
    if (!check.ok) {
      this.events.add('flight', 'abort_unbuilt', `The rocket is not fully assembled: ${check.mounted} of ${check.needed} parts are mounted.`, 'rk_stack', Severity.Fault);
      this.setBanner(`ABORT: rocket not assembled (${check.mounted} of ${check.needed} parts)`, false);
      this._finish('Aborted', 'abort_unbuilt', 'rk_stack'); return;
    }
    if (this.twr < 1) {
      this.events.add('flight', 'abort_low_twr', `Not enough thrust to lift off: TWR ${this.twr.toFixed(2)}`, null, Severity.Fault);
      this.setBanner(`ABORT: not enough thrust to lift off (TWR ${this.twr.toFixed(2)})`, false);
      this._finish('Aborted', 'abort_low_twr', null); return;
    }
    this.launched = true; this._pending.forEach((e) => this._onEvent(e)); this._pending = [];
    if (this.sim.phase === FlightPhase.Pad) this.setBanner('IGNITION · LIFTOFF', true);
    this._emit('launch');
  }

  /** Advance by a frame of real time. */
  update(dt) {
    if (this.paused) return;
    if (this.countdown != null && this.countdown > 0) {
      this._cdTimer -= dt;
      while (this._cdTimer <= 0 && this.countdown > 0) {
        this.countdown--; this._cdTimer += 1; this._emit('countdown', this.countdown);
        this.feedPush(0, this.countdown > 0 ? `T-${String(this.countdown).padStart(2, '0')}` : 'T-0 · release hold-downs');
        if (this.countdown === 0) this.launch(this.pendingKick);
      }
    }
    if (this.launched && !this.ended) {
      if (this.replay && this.timeFactor >= 1 && this.sim.timeS >= this.replaySlowFrom) { this.timeFactor = 0.2; this.warp = 1; this.setBanner('SLOW MOTION', true); }
      this.sim.advance(dt * this.timeFactor, this.warp);
      this._afterStep();
    }
    const last = this.lastSample;
    this.lastThrottle = last ? last.thrustN / this.maxThrust : 0;
    if (last) this.accel = last.thrustN / Math.max(1, last.massKg);
    // Heading: along the thrust while burning, along the airflow velocity while coasting.
    if (this.sim.phase !== FlightPhase.Pad || this.launched) {
      const rel = sub(this.sim.velocity, { x: 0, y: 0 });
      const cmd = this.sim.lastCommand?.thrustDirection;
      const dir = this.lastThrottle > 0.01 && cmd ? cmd : mag(rel) > 20 ? norm(rel) : cmd ?? norm(this.sim.position);
      const s = this.dirToScene(dir);
      this.heading = norm({ x: this.heading.x + (s.x - this.heading.x) * Math.min(1, dt * 3), y: this.heading.y + (s.y - this.heading.y) * Math.min(1, dt * 3) });
    } else this.heading = this.dirToScene(norm(this.sim.position));
  }

  _afterStep() {
    const last = this.lastSample;
    if (last) {
      if (last.dynamicPressurePa > this._maxQ) this._maxQ = last.dynamicPressurePa;
      else if (!this._maxQCalled && this._maxQ > 5000 && last.dynamicPressurePa < this._maxQ * 0.97) {
        this._maxQCalled = true; this.setBanner(`MAX-Q · ${(this._maxQ / 1000).toFixed(1)} kPa`, true);
        this.feedPush(this.sim.timeS, `Max-Q passed: ${(this._maxQ / 1000).toFixed(1)} kPa`);
      }
    }
    if (this.sim.timeS - this._lastPathT >= 1) { this._lastPathT = this.sim.timeS; this.path.push({ ...this.sim.position }); }
    if (this.sim.phase !== this._lastPhase) {
      this._lastPhase = this.sim.phase;
      if (this.sim.phase === FlightPhase.Orbit) this._onOrbit();
      else if (this.sim.phase === FlightPhase.Apogee) this._onApogee();
      else if (this.sim.phase === FlightPhase.Failed || this.sim.phase === FlightPhase.Aborted) this._finish(this.sim.phase, this.sim.outcome.failureCode, this.sim.outcome.failureCause);
    }
  }

  _onApogee() {
    const km = (this.lastSample?.altitudeM ?? 0) / 1000;
    this.setBanner(`APOGEE · ${km.toFixed(0)} km`, true); this.feedPush(this.sim.timeS, `Apogee ${km.toFixed(1)} km`);
    this._finish('Apogee', null, null);
  }
  _onOrbit() {
    this.setBanner('ORBIT ACHIEVED', true);
    this.events.addAt(this.sim.timeS, 'flight', 'orbit_achieved', 'Orbit achieved.', null, Severity.Info);
    if (this.avionics.fairingSeparationOk && this.rocket.buildable) {
      this.deployed = true; this.deployedAt = this.sim.timeS;
      this.events.addAt(this.sim.timeS + 1, 'flight', 'cubesat_deployed', 'CubeSat sprang out of the dispenser.', null, Severity.Info);
      this.feedPush(this.sim.timeS, 'CubeSat deployed'); this._emit('deploy');
    } else if (this.rocket.buildable) this.feedPush(this.sim.timeS, "CubeSat can't deploy: the fairing is still closed.", Severity.Fault);
    this._finish('Orbit', null, null);
  }

  _onEvent(e) {
    if (e.system !== 'flight') return;
    this.feedPush(e.time, e.message, e.severity);
    const stages = this.rocket.stages;
    switch (e.code) {
      case 'stage_separation': {
        const spent = Math.max(0, this.sim.stageIndex); const stage = stages[spent];
        const ids = new Set(); if (stage) ids.add(stage.partId);
        for (const c of this.rocket.components) if (stage && c.dropWithStage === stage.id && c.partId) ids.add(c.partId);
        this.releases.push({ partIds: [...ids], t0: this.sim.timeS, v: -6, y: 0, spin: 0.15, dx: 0 });
        this.setBanner('STAGE SEPARATION', true); break;
      }
      case 'stage_ignition': this.setBanner('STAGE 2 IGNITION', true); break;
      case 'fairing_jettison':
        this.releases.push({ partIds: ['pf_fairing_left'], t0: this.sim.timeS, v: 0, y: 0, spin: 0.5, dx: -8 }, { partIds: ['pf_fairing_right'], t0: this.sim.timeS, v: 0, y: 0, spin: -0.5, dx: 8 });
        this.setBanner('FAIRING SEPARATION', true); break;
      case 'joint_failure': this.exploded = this.sim.timeS; this.setBanner(`VEHICLE LOST: ${e.message}`, false); break;
      case 'stuck_stage': this.setBanner('STAGE SEPARATION FAILED', false); break;
      case 'ignition_failure': this.setBanner('NO IGNITION · ABORT', false); break;
      case 's2_no_thrust': this.setBanner('STAGE 2 DID NOT LIGHT', false); break;
      case 'guidance_drift': this.setBanner('GUIDANCE LOST: NO IMU', false); break;
      case 'impact': if (this.exploded == null) this.exploded = this.sim.timeS; break;
      default:
    }
  }

  _finish(outcome, code, cause) {
    if (this.ended) return;
    this.ended = true; this.endedAt = performance.now();
    const o = typeof outcome === 'string' ? outcome : outcomeOf(this.sim);
    this.record = makeFlightRecord(this.sim, this.rocket, this.deployed || isDeployed(o, this.rocket, this.avionics), o, code ?? undefined, cause ?? undefined);
    this._emit('end', this.record);
  }

  /**
   * Replay scrubber (audit F24): the simulation is deterministic, so any moment of the flight can be rebuilt by flying it again up to that time.
   * Used by the failure replay; the debrief record of the real attempt is never touched.
   */
  seek(t) {
    this.events = new EventLog(() => this.sim?.timeS ?? 0);
    const f = createFlight(this.data, this.bundle, this.missionId, { events: this.events });
    this.sim = f.sim; this.avionics = f.avionics; this.sim.options.pitchKickDeg = this.bundle.vehicle.pitchKickDeg > 0 ? this.bundle.vehicle.pitchKickDeg : 3;
    this.events.onAdd((e) => this._onEvent(e));
    this.releases = []; this.exploded = null; this.feed = []; this.path = []; this._lastPathT = -10; this._maxQ = 0; this._maxQCalled = false; this._lastPhase = FlightPhase.Pad;
    this.ended = false; this.record = null; this.launched = true; this.banner = null;
    const keepEmit = this._emit; this._emit = () => {}; // the end event of the original flight must not fire again while scrubbing
    let guard = 0;
    while (this.sim.timeS < t && !this.sim.terminal && guard++ < 100000) { this.sim.step(); this._afterStep(); }
    this._emit = keepEmit; this.ended = false;
    this.paused = true;
  }

  /** Jumps the simulation forward to a given flight time (events, stage releases and the feed still happen on the way). Used by the demo recorder. */
  jumpTo(t) {
    let guard = 0;
    while (this.launched && !this.ended && this.sim.timeS < t && guard++ < 200000) { this.sim.step(); this._afterStep(); }
  }

  /** Jumps to the end of the flight (Judge Mode, "skip"). The events and the record are the same as flying it live. */
  fastForward() {
    let guard = 0;
    while (this.launched && !this.ended && guard++ < 400) { this.sim.advance(2, 100); this._afterStep(); }
  }

  /** Predicted path from the current state, two-body only (for the map camera). */
  predictPath(points = 160) {
    const out = []; let p = { ...this.sim.position }; let v = { ...this.sim.velocity };
    const r0 = mag(p); const period = 2 * Math.PI * Math.sqrt((r0 ** 3) / C.Mu);
    const dt = Math.min(60, period / points * 1.5);
    for (let i = 0; i < points * 2; i++) {
      out.push(p);
      const r = mag(p); const a = mul(p, -C.Mu / (r * r * r));
      const vh = add(v, mul(a, dt / 2)); p = add(p, mul(vh, dt)); const r2 = mag(p); v = add(vh, mul(mul(p, -C.Mu / (r2 * r2 * r2)), dt / 2));
      if (altitude(p) < -1000) break;
    }
    return out;
  }
}
