// Port of TMinus.Assembly.AssemblyRules / AssemblyGraph: which rocket part sits on which, with order, diameter and socket checks.
export const STAND = 'STAND';
export const SOCKET = { Top: 'top', Payload: 'payload', FairingLeft: 'fairing_left', FairingRight: 'fairing_right' };
export const PAYLOAD_PART_ID = 'payload';

export class AssemblyRules {
  constructor(order, parts, joints) {
    this.order = order; this.parts = parts; this.joints = joints || new Map(); this.diameterTolerance = 0.05;
  }
  static fromData(data, rocketId) {
    const rules = data.getRules();
    const order = [...(rules.assemblyOrder[rocketId] || [])];
    const parts = {};
    for (const id of order) {
      const def = data.getPart(id);
      parts[id] = def ? { name: def.name, category: def.category, diameterM: def.diameterM || 0 }
        : { name: id === PAYLOAD_PART_ID ? 'CubeSat payload' : id, category: id, diameterM: 0 };
    }
    const joints = new Map();
    for (const j of rules.boltJoints) joints.set(`${j.lowerPartId}|${j.upperPartId}`, j.id);
    return new AssemblyRules(order, parts, joints);
  }
  name(partId) { return partId === STAND ? 'the launch stand' : this.parts[partId]?.name ?? partId; }
  category(partId) { return this.parts[partId]?.category ?? ''; }
  indexOf(partId) { return partId === STAND ? -1 : this.order.indexOf(partId); }
  socketFor(partId) {
    if (partId === PAYLOAD_PART_ID) return SOCKET.Payload;
    if (this.category(partId) === 'fairing') return partId.endsWith('left') ? SOCKET.FairingLeft : SOCKET.FairingRight;
    return SOCKET.Top;
  }
  socketsOf(partId) {
    if (partId === STAND) return [SOCKET.Top];
    const cat = this.category(partId);
    if (cat === 'payload_adapter') return [SOCKET.Payload, SOCKET.FairingLeft, SOCKET.FairingRight];
    if (cat === 'fairing' || partId === PAYLOAD_PART_ID) return [];
    return [SOCKET.Top];
  }
  expectedOnTop(lowerPartId) {
    for (let i = this.indexOf(lowerPartId) + 1; i < this.order.length; i++) if (this.socketFor(this.order[i]) === SOCKET.Top) return this.order[i];
    return null;
  }
  jointFor(lower, upper) { return this.joints.get(`${lower}|${upper}`) ?? null; }
  diameterMismatch(a, b) {
    const da = this.parts[a]?.diameterM || 0; const db = this.parts[b]?.diameterM || 0;
    if (da <= 0 || db <= 0) return null;
    if (this.category(a) === 'payload_adapter' || this.category(b) === 'payload_adapter') return null;
    return Math.abs(da - db) / Math.max(da, db) > this.diameterTolerance ? { da, db } : null;
  }
}

export class AssemblyGraph {
  constructor(rules) {
    this.rules = rules; this.partOf = new Map([[STAND, STAND]]); this.edges = [];
    this.undoStack = []; this.redoStack = []; this.listeners = new Set();
    /** Hook: false while a joint still has bolts in it. */
    this.jointBoltsClear = () => true;
  }
  addNode(instanceId, partId) { this.partOf.set(instanceId, partId); }
  partIdOf(instanceId) { return this.partOf.get(instanceId) ?? null; }
  get instances() { return [...this.partOf.keys()].filter((k) => k !== STAND); }
  edgeBelow(instanceId) { return this.edges.find((e) => e.upper === instanceId) || null; }
  isAttached(instanceId) { return instanceId === STAND || !!this.edgeBelow(instanceId); }
  edgeAt(lower, socket) { return this.edges.find((e) => e.lower === lower && e.socket === socket) || null; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  dependents(instanceId) {
    const out = []; const q = [instanceId];
    while (q.length) { const id = q.shift(); for (const e of this.edges.filter((x) => x.lower === id)) { out.push(e.upper); q.push(e.upper); } }
    return out;
  }
  freeSockets() {
    const out = [];
    for (const [inst, part] of this.partOf) {
      if (!this.isAttached(inst)) continue;
      for (const s of this.rules.socketsOf(part)) if (!this.edgeAt(inst, s)) out.push({ lower: inst, socket: s });
    }
    return out;
  }
  firstStackPart() { return this.rules.order.find((p) => this.rules.socketFor(p) === SOCKET.Top) ?? null; }
  canAttach(upper, lower, socket) {
    const fail = (reason) => ({ ok: false, reason });
    const upperPart = this.partIdOf(upper); const lowerPart = this.partIdOf(lower);
    if (!upperPart || !lowerPart) return fail('Unknown part.');
    if (this.isAttached(upper)) return fail(`${this.rules.name(upperPart)} is already on the rocket.`);
    if (!this.isAttached(lower)) return fail(`${this.rules.name(lowerPart)} isn't on the rocket yet.`);
    if (!this.rules.socketsOf(lowerPart).includes(socket)) return fail(`${this.rules.name(lowerPart)} has no ${socket} mount.`);
    if (this.edgeAt(lower, socket)) return fail(`That mount on ${this.rules.name(lowerPart)} is already taken.`);
    if (this.rules.socketFor(upperPart) !== socket) return fail(`${this.rules.name(upperPart)} doesn't mount there.`);
    if (lower !== STAND) {
      const mm = this.rules.diameterMismatch(upperPart, lowerPart);
      if (mm) return fail(`Diameter mismatch: ${mm.db.toFixed(2)} m vs ${mm.da.toFixed(2)} m. An adapter is needed.`);
    }
    if (socket === SOCKET.Top) {
      const expected = lower === STAND ? this.firstStackPart() : this.rules.expectedOnTop(lowerPart);
      if (expected !== upperPart) {
        const iu = this.rules.indexOf(upperPart); const il = this.rules.indexOf(lowerPart);
        let reason;
        if (lower === STAND) reason = `Wrong order: ${this.rules.name(expected)} goes on the stand first.`;
        else if (iu < il) reason = `Wrong order: ${this.rules.name(upperPart)} goes below ${this.rules.name(lowerPart)}.`;
        else if (expected == null) reason = `Nothing stacks on top of ${this.rules.name(lowerPart)}.`;
        else reason = `Wrong order: ${this.rules.name(expected)} goes on ${this.rules.name(lowerPart)} first.`;
        return fail(reason);
      }
    }
    return { ok: true, reason: null };
  }
  tryAttach(upper, lower, socket) {
    const r = this.canAttach(upper, lower, socket);
    if (!r.ok) return r;
    const edge = { lower, socket, upper, jointId: this.rules.jointFor(this.partIdOf(lower), this.partIdOf(upper)) };
    this._attach(edge); this.undoStack.push({ attach: true, edge }); this.redoStack.length = 0;
    return r;
  }
  canDetach(instanceId) {
    const edge = this.edgeBelow(instanceId);
    if (!edge) return { ok: false, reason: "It isn't attached." };
    const deps = this.edges.filter((e) => e.lower === instanceId).map((e) => this.rules.name(this.partIdOf(e.upper)));
    if (deps.length) return { ok: false, reason: `Remove first: ${deps.join(', ')}.` };
    if (edge.jointId && !this.jointBoltsClear(edge.jointId)) return { ok: false, reason: `Unbolt it first: joint ${edge.jointId} still has bolts in.` };
    return { ok: true, reason: null };
  }
  tryDetach(instanceId) {
    const r = this.canDetach(instanceId);
    if (!r.ok) return r;
    const edge = this.edgeBelow(instanceId);
    this._detach(edge); this.undoStack.push({ attach: false, edge }); this.redoStack.length = 0;
    return r;
  }
  undo() {
    const op = this.undoStack.pop(); if (!op) return false;
    if (op.attach) this._detach(op.edge); else this._attach(op.edge);
    this.redoStack.push(op); return true;
  }
  redo() {
    const op = this.redoStack.pop(); if (!op) return false;
    if (op.attach) this._attach(op.edge); else this._detach(op.edge);
    this.undoStack.push(op); return true;
  }
  _attach(e) { this.edges.push(e); this.listeners.forEach((f) => f()); }
  _detach(e) { this.edges.splice(this.edges.indexOf(e), 1); this.listeners.forEach((f) => f()); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  clearHistory() { this.undoStack.length = 0; this.redoStack.length = 0; }
  isComplete() { return this.instances.every((i) => this.isAttached(i)); }
}
