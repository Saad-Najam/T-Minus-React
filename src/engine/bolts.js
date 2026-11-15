// Port of TMinus.Core.BoltMath / BoltJointState: star order, torque passes and joint integrity.
export const BoltState = { Missing: 'Missing', Inserted: 'Inserted', Torqued: 'Torqued', UnderTorqued: 'UnderTorqued', OverTorqued: 'OverTorqued' };

export const PassFractions = [0.3, 0.7, 1.0];
export const LooseFraction = 0.3;
export const FullFraction = 0.95;
export const OverPenalty = 0.15;
export const MaxWarpPenalty = 0.35;

export const warpPenalty = (sequenceErrors) => MaxWarpPenalty * Math.min(1, sequenceErrors / 3);

/** 0-based tightening order. N divisible by 4: k, k+N/2, k+N/4, k+3N/4. Else alternate opposite holes. */
export function starOrder(n) {
  const order = [];
  if (n <= 0) return order;
  if (n % 4 === 0) {
    for (let k = 0; k < n / 4; k++) order.push(k, k + n / 2, k + n / 4, k + (3 * n) / 4);
  } else {
    const half = Math.floor((n + 1) / 2);
    for (let i = 0; i < half; i++) { order.push(i); if (i + half < n) order.push(i + half); }
  }
  return order;
}
export const starOrderText = (n) => starOrder(n).map((i) => i + 1).join('-');

export class BoltJointState {
  constructor(def) {
    this.def = def;
    this.present = new Array(def.boltCount).fill(false);
    this.torque = new Array(def.boltCount).fill(0);
    this.sequenceErrors = 0;
    this._sequence = 0;
  }
  get count() { return this.def.boltCount; }
  get target() { return this.def.torqueNm; }
  get tol() { return this.def.tolerancePct / 100; }

  stateOf(i) {
    if (!this.present[i]) return BoltState.Missing;
    const t = this.torque[i];
    if (t > this.target * (1 + this.tol)) return BoltState.OverTorqued;
    if (t >= this.target * (1 - this.tol)) return BoltState.Torqued;
    if (t <= 0) return BoltState.Inserted;
    return BoltState.UnderTorqued;
  }
  insert(i) { if (this.present[i]) return; this.present[i] = true; this.torque[i] = 0; }
  remove(i) {
    this.present[i] = false; this.torque[i] = 0;
    if (!this.present.some(Boolean)) this.sequenceErrors = 0; // a fully stripped joint starts fresh
  }
  _neighbours(i) { return this.count < 3 ? [] : [(i + 1) % this.count, (i - 1 + this.count) % this.count]; }

  /** Tighten bolt i to nm (a wrench never loosens). Returns still-loose neighbours if torqued too early (the joint warps). */
  applyTorque(i, nm) {
    const loose = [];
    if (!this.present[i] || nm <= this.torque[i]) return loose;
    const wasFull = this.torque[i] >= this.target * FullFraction;
    this.torque[i] = nm;
    this._sequence++;
    if (!wasFull && nm >= this.target * FullFraction) {
      for (const n of this._neighbours(i)) if (!this.present[n] || this.torque[n] < this.target * LooseFraction) loose.push(n);
      if (loose.length > 0) this.sequenceErrors++;
    }
    return loose;
  }
  /** 1, 2 or 3 = the pass in progress; 4 = all passes done. */
  currentPass() {
    for (let p = 0; p < PassFractions.length; p++) {
      const need = this.target * PassFractions[p] * (1 - this.tol);
      for (let i = 0; i < this.count; i++) if (!this.present[i] || this.torque[i] < need) return p + 1;
    }
    return 4;
  }
  passTargetNm(pass) { return this.target * PassFractions[Math.min(Math.max(pass, 1), 3) - 1]; }
  /** Next bolt (0-based) in star order that needs work this pass, or -1 when finished. */
  nextBolt() {
    const pass = this.currentPass();
    if (pass > 3) return -1;
    const need = this.passTargetNm(pass) * (1 - this.tol);
    for (const i of starOrder(this.count)) if (!this.present[i] || this.torque[i] < need) return i;
    return -1;
  }
  getStatus() {
    const s = { jointId: this.def.id, boltCount: this.count, maxQkPa: this.def.maxQkPa, sequenceErrors: this.sequenceErrors, missing: 0, inserted: 0, torqued: 0, under: 0, over: 0 };
    for (let i = 0; i < this.count; i++) {
      switch (this.stateOf(i)) {
        case BoltState.Missing: s.missing++; break;
        case BoltState.Inserted: s.inserted++; break;
        case BoltState.Torqued: s.torqued++; break;
        case BoltState.UnderTorqued: s.under++; break;
        case BoltState.OverTorqued: s.over++; break;
        default:
      }
    }
    const share = this.count > 0 ? s.torqued / this.count : 0;
    s.integrity = Math.max(0, Math.min(1, share - warpPenalty(s.sequenceErrors) - OverPenalty * s.over));
    s.failureQkPa = s.maxQkPa * s.integrity; // dynamic pressure this joint survives
    return s;
  }
  hasAnyBolt() { return this.present.some(Boolean); }

  saveTo(design) {
    design.bolts = design.bolts.filter((b) => b.jointId !== this.def.id);
    for (let i = 0; i < this.count; i++) if (this.present[i]) design.bolts.push({ jointId: this.def.id, boltIndex: i, torqueNm: this.torque[i], sequence: this._sequence });
    design.jointWarps = design.jointWarps.filter((w) => w.jointId !== this.def.id);
    if (this.sequenceErrors > 0) design.jointWarps.push({ jointId: this.def.id, count: this.sequenceErrors });
  }
  static loadFrom(def, design) {
    const s = new BoltJointState(def);
    if (!design) return s;
    for (const b of design.bolts) {
      if (b.jointId !== def.id || b.boltIndex < 0 || b.boltIndex >= s.count) continue;
      s.present[b.boltIndex] = true; s.torque[b.boltIndex] = b.torqueNm; s._sequence = Math.max(s._sequence, b.sequence);
    }
    for (const w of design.jointWarps) if (w.jointId === def.id) s.sequenceErrors = w.count;
    return s;
  }
  static allStatuses(rules, design) { return rules.boltJoints.map((j) => BoltJointState.loadFrom(j, design).getStatus()); }
}
