import { Severity } from './severity.js';

/** Single log for assembly, flight and operations events (port of TMinus.Core.EventLog). */
export class EventLog {
  constructor(clock = () => 0) { this.clock = clock; this.events = []; this.listeners = new Set(); }
  get all() { return this.events; }
  add(system, code, message, causeId = null, severity = Severity.Info) { return this.addAt(this.clock(), system, code, message, causeId, severity); }
  addAt(time, system, code, message, causeId = null, severity = Severity.Info) {
    const e = { time, system, code, message, causeId, severity };
    this.events.push(e);
    this.listeners.forEach((fn) => fn(e));
    return e;
  }
  clear() { this.events.length = 0; }
  onAdd(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
