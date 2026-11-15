import { Severity } from './severity.js';

/** Port of TMinus.Wiring.WiringGraph: devices and the cables between their ports. A port address is "instanceId/PORT_ID". */
export const deviceOf = (address) => (address ? address.split('/')[0] : null);
export const portIdOf = (address) => { const i = address ? address.indexOf('/') : -1; return i < 0 ? null : address.slice(i + 1); };
export const addressOf = (instanceId, portId) => `${instanceId}/${portId}`;
export const shortLabel = (label) => { const i = label ? label.indexOf(' (') : -1; return i > 0 ? label.slice(0, i) : label; };

export class WiringGraph {
  constructor(rules) { this.rules = rules; this.devices = new Map(); this.cables = []; this._nextId = 1; this.listeners = new Set(); }
  addDevice(instanceId, def) { this.devices.set(instanceId, def); }
  removeDevice(instanceId) {
    for (const c of this.cables.filter((x) => deviceOf(x.a) === instanceId || deviceOf(x.b) === instanceId)) this.disconnect(c.id);
    this.devices.delete(instanceId);
  }
  device(instanceId) { return (instanceId && this.devices.get(instanceId)) || null; }
  port(address) { const d = this.device(deviceOf(address)); return d ? d.ports.find((p) => p.id === portIdOf(address)) || null : null; }
  describe(address) {
    const d = this.device(deviceOf(address)); const p = this.port(address);
    return `${d?.name ?? deviceOf(address)} ${p?.label ?? portIdOf(address)}`;
  }
  cablesAt(address) { return this.cables.filter((c) => c.a === address || c.b === address); }
  isConnected(address) { return this.cables.some((c) => c.a === address || c.b === address); }
  peersOf(address) {
    const out = [];
    for (const c of this.cables) { if (c.a === address) out.push(c.b); else if (c.b === address) out.push(c.a); }
    return out;
  }
  canConnect(a, b) {
    const res = { ok: false, cableType: null, reason: null, shortCircuit: false };
    const pa = this.port(a); const pb = this.port(b);
    if (!pa || !pb) { res.reason = 'Unknown port.'; return res; }
    if (a === b) { res.reason = 'Pick a different port.'; return res; }
    if (deviceOf(a) === deviceOf(b)) { res.reason = "A board can't be wired to itself."; return res; }
    let cable = this.rules.cableFor(pa.type, pb.type);
    if (pa.type === 'PWR_OUT' && pb.type === 'PWR_OUT') { cable = this.rules.getCableType('power'); res.shortCircuit = true; }
    if (!cable) {
      const from = this.rules.cableTypes.find((c) => c.allowed.some((x) => x.from === pa.type || x.to === pa.type));
      res.reason = from ? `${shortLabel(from.label)} can't plug into a ${pb.type} port.` : `${pa.type} and ${pb.type} don't connect.`;
      return res;
    }
    if (!pa.bus && this.isConnected(a)) { res.reason = `${this.describe(a)} already has a cable.`; return res; }
    if (!pb.bus && this.isConnected(b)) { res.reason = `${this.describe(b)} already has a cable.`; return res; }
    if (this.cables.some((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a))) { res.reason = 'Those ports are already connected.'; return res; }
    res.ok = true; res.cableType = cable.id;
    return res;
  }
  /** Returns { cable, reason }. cable is null when refused. */
  connect(a, b, reversed = false) {
    const r = this.canConnect(a, b);
    if (!r.ok) return { cable: null, reason: r.reason };
    const cable = { id: `c${this._nextId++}`, a, b, type: r.cableType, reversed: reversed && r.cableType === 'power', shortCircuit: r.shortCircuit };
    this.cables.push(cable);
    this.listeners.forEach((fn) => fn('connected', cable));
    return { cable, reason: null };
  }
  disconnect(cableId) {
    const i = this.cables.findIndex((x) => x.id === cableId);
    if (i < 0) return false;
    const [c] = this.cables.splice(i, 1);
    this.listeners.forEach((fn) => fn('removed', c));
    return true;
  }
  /** Multimeter: number of cables on the shortest path between two ports, or -1 (open circuit). */
  pathLength(from, to) {
    if (from === to) return 0;
    const dist = new Map([[from, 0]]); const q = [from];
    while (q.length) {
      const cur = q.shift();
      const port = this.port(cur);
      if (port && port.bus) {
        const dev = this.device(deviceOf(cur));
        for (const sib of dev.ports.filter((p) => p.bus && p.type === port.type)) {
          const addr = addressOf(deviceOf(cur), sib.id);
          if (dist.has(addr)) continue;
          dist.set(addr, dist.get(cur));
          if (addr === to) return dist.get(addr);
          q.push(addr);
        }
      }
      for (const next of this.peersOf(cur)) {
        if (dist.has(next)) continue;
        dist.set(next, dist.get(cur) + 1);
        if (next === to) return dist.get(next);
        q.push(next);
      }
    }
    return -1;
  }
  clear() { for (const c of [...this.cables]) this.disconnect(c.id); }
}

export function friendlyPort(type) {
  switch (type) {
    case 'PWR_IN': return 'power';
    case 'DATA': return 'data';
    case 'RF': return 'antenna (RF)';
    case 'SOLAR_IN': return 'solar panel';
    case 'BATT': return 'battery';
    case 'PYRO_IN': return 'pyro';
    default: return type.toLowerCase();
  }
}

/** Port of WiringValidator: short circuits, reversed polarity, rail overload, required connections, battery path, inline switch. */
export function validateWiring(g) {
  const faults = [];
  const rules = g.rules;
  for (const c of g.cables) {
    if (c.shortCircuit) faults.push({ code: 'short_circuit', severity: Severity.Blocker, cableId: c.id, port: c.a, device: deviceOf(c.a), codexId: 'eps',
      message: `Short circuit: ${g.describe(c.a)} is wired to ${g.describe(c.b)}. Two outputs fight each other.` });
    else if (c.reversed) faults.push({ code: 'reversed_polarity', severity: Severity.Blocker, cableId: c.id, port: c.b, device: deviceOf(c.b), codexId: 'eps',
      message: `Reversed polarity between ${g.describe(c.a)} and ${g.describe(c.b)}: red and black are swapped.` });
  }
  // rail loads
  for (const [inst, def] of g.devices) {
    for (const port of def.ports.filter((p) => p.type === 'PWR_OUT' && p.maxPowerW > 0)) {
      const addr = addressOf(inst, port.id); let load = 0; const loads = [];
      for (const peer of g.peersOf(addr)) {
        const p = g.port(peer);
        if (!p || p.type !== 'PWR_IN') continue;
        const d = g.device(deviceOf(peer)); const w = Math.max(d.powerIdleW, d.powerActiveW);
        load += w; loads.push(`${d.name} ${+w.toFixed(1)} W`);
      }
      if (load > port.maxPowerW + 1e-9) faults.push({ code: 'rail_overload', severity: Severity.Fault, port: addr, device: inst, codexId: 'eps',
        message: `${def.name} ${port.label} is rated ${port.maxPowerW.toFixed(0)} W but feeds ${+load.toFixed(1)} W (${loads.join(', ')}). Spread the loads over more outputs.` });
    }
  }
  // required connections
  for (const [inst, def] of g.devices) {
    for (const rc of rules.requiredConnections.filter((r) => r.category === def.category)) {
      const missing = []; let connected = 0;
      for (const type of rc.portTypes) {
        const any = def.ports.some((p) => p.type === type && g.isConnected(addressOf(inst, p.id)));
        if (any) connected++; else missing.push(friendlyPort(type));
      }
      const ok = rc.minConnected > 0 ? connected >= rc.minConnected : missing.length === 0;
      if (ok) continue;
      const first = def.ports.find((p) => rc.portTypes.includes(p.type) && !g.isConnected(addressOf(inst, p.id)));
      faults.push({ code: 'missing_connection', severity: Severity.Blocker, device: inst, codexId: rc.codexId, port: first ? addressOf(inst, first.id) : null,
        message: `${def.name}: ${rc.message} Not connected: ${missing.join(', ')}.` });
    }
  }
  // battery path
  const devices = [...g.devices.entries()];
  for (const [inst, def] of devices.filter(([, d]) => d.category === 'battery')) {
    for (const port of def.ports.filter((p) => p.type === 'BATT')) {
      for (const peer of g.peersOf(addressOf(inst, port.id))) {
        const peerDev = g.device(deviceOf(peer)); const peerPort = g.port(peer);
        if (peerPort?.type === 'PWR_IN') {
          const w = rules.warnings.find((x) => x.code === 'battery_bypasses_eps');
          faults.push({ code: 'battery_bypasses_eps', severity: Severity.Warning, device: inst, port: peer, codexId: 'eps',
            message: w?.message ?? `Battery wired straight to ${peerDev?.name}: it bypasses the EPS.` });
        } else if (peerDev?.category === 'eps') {
          const inline = rules.inlineRules.find((r) => r.fromCategory === 'battery' && r.toCategory === 'eps');
          faults.push({ code: 'switch_not_inline', severity: Severity.Blocker, device: inst, port: peer, codexId: inline?.codexId ?? 'deployment_switch',
            message: `${inline?.message ?? 'The deployment switch must sit between the battery and the EPS.'} Right now the battery goes straight into the EPS, so the satellite would switch on inside the dispenser.` });
        }
      }
    }
  }
  for (const inline of rules.inlineRules) {
    const hasFrom = devices.some(([, d]) => d.category === inline.fromCategory);
    const hasTo = devices.some(([, d]) => d.category === inline.toCategory);
    if (!hasFrom || !hasTo) continue;
    const sw = devices.find(([, d]) => d.id === inline.partId);
    if (!sw) { faults.push({ code: 'switch_missing', severity: Severity.Blocker, codexId: inline.codexId, message: `No deployment switch fitted. ${inline.message}` }); continue; }
    const sides = sw[1].ports.map((p) => g.peersOf(addressOf(sw[0], p.id)).map((x) => g.device(deviceOf(x))?.category));
    const toFrom = sides.some((s) => s.includes(inline.fromCategory)); const toTo = sides.some((s) => s.includes(inline.toCategory));
    const already = faults.some((f) => f.code === 'switch_not_inline');
    if ((!toFrom || !toTo) && !already) faults.push({ code: 'switch_not_inline', severity: Severity.Blocker, device: sw[0], codexId: inline.codexId,
      message: `${sw[1].name}: ${inline.message} It needs one cable to the battery and one to the EPS.` });
  }
  return faults.sort((a, b) => b.severity - a.severity);
}
