import { AvionicsReport } from './avionics.js';
import { BoltJointState } from './bolts.js';

// Port of FailureLab / FailureJobTracker scoring / Apollo12Console.Run. Jobs are missions whose id starts with "failure_".
export const failureJobs = (data) => data.missions.filter((m) => m.id.startsWith('failure_')).sort((a, b) => (a.difficulty === 'Beginner' ? 0 : 1) - (b.difficulty === 'Beginner' ? 0 : 1));

const matches = (c, rules, linkId) => {
  const l = rules.avionicsWiring.find((x) => x.id === linkId);
  return (c.fromPort === l.from && c.toPort === l.to) || (c.fromPort === l.to && c.toPort === l.from);
};

/** Breaks a correct build with the job's faults: "bolts_missing:<joint>:<n>", "unplugged:<link>", "wrong_port:<link>:<port>". */
export function seedFaults(vehicle, rules, faults) {
  for (const f of faults) {
    const p = f.split(':');
    if (p[0] === 'bolts_missing') {
      const def = rules.boltJoints.find((j) => j.id === p[1]);
      const st = BoltJointState.loadFrom(def, vehicle);
      const n = p.length > 2 ? parseInt(p[2], 10) : 1;
      for (let i = def.boltCount - n; i < def.boltCount; i++) st.remove(i);
      st.saveTo(vehicle);
    } else if (p[0] === 'unplugged') {
      vehicle.avionicsCables = vehicle.avionicsCables.filter((c) => !matches(c, rules, p[1]));
    } else if (p[0] === 'wrong_port') {
      const link = rules.avionicsWiring.find((l) => l.id === p[1]);
      vehicle.avionicsCables = vehicle.avionicsCables.filter((c) => !matches(c, rules, p[1]));
      vehicle.avionicsCables.push({ fromPort: p[2], toPort: link.to, cableType: link.cableType, reversed: false });
    }
  }
}

/** True once the player has fixed this seeded fault. */
export function isFaultFixed(fault, vehicle, rules) {
  const p = fault.split(':');
  if (p[0] === 'bolts_missing') return BoltJointState.loadFrom(rules.boltJoints.find((j) => j.id === p[1]), vehicle).nextBolt() < 0;
  if (p[0] === 'unplugged' || p[0] === 'wrong_port') {
    const ok = AvionicsReport.compute(vehicle, rules).consequences.every((c) => c.linkId !== p[1]);
    // A wrong-port cable must also be taken out, not just a second cable added.
    return ok && (p[0] !== 'wrong_port' || !vehicle.avionicsCables.some((c) => c.fromPort === p[2] || c.toPort === p[2]));
  }
  return false;
}

export function describeFault(fault, rules) {
  const p = fault.split(':');
  const link = rules.avionicsWiring.find((l) => l.id === p[1]);
  if (p[0] === 'bolts_missing') return `${p[2]} bolts missing on joint ${p[1]}. Under load the joint flexes and fails near max-Q.`;
  if (p[0] === 'unplugged') return `Cable ${p[1]} unplugged: ${link?.message}`;
  if (p[0] === 'wrong_port') return `Cable ${p[1]} plugged into ${p[2]} instead of ${link?.from}: ${link?.message}`;
  return fault;
}

/** Points: reward for each fixed fault, minus 10 per HOUSTON hint and 50 per fault left in. */
export const jobScore = (reward, faults, fixedCount, hints) =>
  Math.max(0, Math.round(reward * (faults === 0 ? 1 : fixedCount / faults)) - 10 * hints - 50 * (faults - fixedCount));

// ---------------------------------------------------------------- Apollo 12 EECOM console (state machine)
export const APOLLO = { strikeT: 36.5, secondStrikeT: 52, startT: 30, window: 20,
  lights: ['FC 1', 'FC 2', 'FC 3', 'MAIN BUS A', 'MAIN BUS B', 'AC BUS 1', 'AC BUS 2', 'SCE', 'CMC', 'IMU', 'BAT CHG', 'MASTER ALARM'],
  tlm: [['MAIN BUS A', '28.4 V'], ['MAIN BUS B', '28.3 V'], ['FC 1 AMPS', '31.0 A'], ['FC 2 AMPS', '30.6 A'], ['SCE', '5.01 V'], ['CABIN P', '5.0 psi']] };

export class ApolloRun {
  constructor() { this.step = 1; this.wrong = 0; this.timedOut = false; this.feedback = ''; }
  /** step 1 = restore telemetry, 2 = restore power, 3 = done */
  pick(choice) {
    this.feedback = choice.why;
    if (choice.correctAtStep === this.step) { this.step++; return true; }
    this.wrong++; return false;
  }
  score(reward) { return Math.max(0, reward - 60 * this.wrong - (this.timedOut ? Math.floor(reward / 2) : 0)); }
}
