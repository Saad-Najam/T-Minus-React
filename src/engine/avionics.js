// Port of TMinus.Core.AvionicsReport: what the rocket's avionics wiring means for the flight.
const sameLink = (c, a, b) => (c.fromPort === a && c.toPort === b) || (c.fromPort === b && c.toPort === a);

export class AvionicsReport {
  constructor({ armed = false } = {}) { this.consequences = []; this.armed = armed; this.wiredLinks = 0; this.requiredLinks = 0; }
  has(c) { return this.consequences.some((x) => x.consequence === c); }
  first(c) { return this.consequences.find((x) => x.consequence === c) || null; }
  get powerOk() { return !this.has('no_avionics_power') && !this.has('no_flight_computer'); }
  // Safe/Arm: while the plug is on SAFE the pyro circuits are blocked, so nothing can fire at T-0.
  get s1IgnitionOk() { return this.powerOk && this.armed && !this.has('no_ignition'); }
  get stageSeparationOk() { return this.powerOk && !this.has('stuck_stage'); }
  get s2IgnitionOk() { return this.powerOk && !this.has('s2_no_thrust'); }
  get guidanceOk() { return this.powerOk && !this.has('guidance_drift'); }
  get telemetryOk() { return this.powerOk && !this.has('no_telemetry'); }
  get fairingSeparationOk() { return this.powerOk && !this.has('fairing_stuck'); }
  get allOk() { return this.consequences.length === 0; }

  causeId(consequence) {
    const direct = this.first(consequence);
    if (direct) return direct.linkId;
    if (!this.powerOk) return (this.first('no_avionics_power') || this.first('no_flight_computer'))?.linkId ?? null; // power cascade: blame the power cable
    if (consequence === 'no_ignition' && !this.armed) return 'av_safe_arm';
    return null;
  }
  /** All-OK report (Saturn V / sounding rocket have no buildable avionics). Counts as armed. */
  static perfect() { return new AvionicsReport({ armed: true }); }

  static compute(vehicle, rules) {
    const r = new AvionicsReport({ armed: vehicle?.armed ?? false });
    const cables = vehicle?.avionicsCables ?? [];
    for (const link of rules.avionicsWiring) {
      r.requiredLinks++;
      const wired = cables.some((c) => sameLink(c, link.from, link.to) && !c.reversed);
      if (wired) { r.wiredLinks++; continue; }
      r.consequences.push({ linkId: link.id, consequence: link.consequence, message: link.message });
    }
    return r;
  }
}
