import { isCubeSat } from './data.js';
import { BudgetStatus } from './budget.js';
import { Severity } from './severity.js';

// ---------------------------------------------------------------- MissionGoals
export function evaluateGoals(mission, flight, ops, budget) {
  if (!mission) return [];
  return mission.successCriteria.map((c) => {
    const g = { id: c.id, text: c.text, met: false, measured: 'not measured' };
    switch (c.metric) {
      case 'deployed': g.met = !!flight?.deployed; g.measured = g.met ? 'deployed' : 'not deployed'; break;
      case 'daysAlive': g.met = !!ops && ops.daysAlive >= c.threshold; g.measured = `${ops?.daysAlive ?? 0} days`; break;
      case 'imagesDownlinked': g.met = !!ops && ops.imagesDownlinked >= c.threshold; g.measured = `${ops?.imagesDownlinked ?? 0} images`; break;
      case 'costMUSD': g.met = !!budget && budget.totalCostM <= c.threshold + 1e-9; g.measured = budget ? `${budget.totalCostM.toFixed(2)} M$` : 'n/a'; break;
      case 'periapsisKm': g.met = !!flight && flight.periapsisKm >= c.threshold; g.measured = flight ? `${flight.periapsisKm.toFixed(0)} km` : 'n/a'; break;
      case 'deltaVLeftMs': g.met = !!flight && flight.orbitAchieved && flight.deltaVLeftMs >= c.threshold; g.measured = flight ? `${Math.round(flight.deltaVLeftMs).toLocaleString('en-US')} m/s` : 'n/a'; break;
      case 'apogeeKm': g.met = !!flight && flight.apoapsisKm >= c.threshold; g.measured = flight ? `${flight.apoapsisKm.toFixed(0)} km` : 'n/a'; break;
      default:
    }
    return g;
  });
}

// ---------------------------------------------------------------- Scoring
export const starsForScore = (s) => (s >= 85 ? 3 : s >= 60 ? 2 : s >= 35 ? 1 : 0);
const r1 = (x) => Math.round(x * 10) / 10;
const addLine = (score, id, label, max, fraction) => {
  max = Math.max(0, max); fraction = Math.max(0, Math.min(1, fraction));
  score.breakdown.push({ id, label, maximum: max, points: r1(max * fraction) });
};

/** Known FAILs at launch, NO-GO rounds and hints used, as one fraction. */
export function decisionFraction(launch, settings) {
  let d = launch.knownFailures.length === 0 ? 1 : Math.max(0, 1 - new Set(launch.knownFailures).size * 0.2);
  d *= 1 / (1 + Math.max(0, launch.noGoRounds) * 0.05);
  const hints = (settings?.hintsUsed ?? []).filter((x) => x > 0).reduce((a, b) => a + b, 0);
  return d * Math.max(0.75, 1 - hints * 0.02);
}

/** Team collaboration: more real people sharing the four roles scores higher (1 player 40%, 2 = 60%, 3 = 80%, 4 = 100%), and every role must have voted. */
export function collaborationFraction(crew, poll) {
  const players = Math.max(1, Math.min(4, new Set((crew ?? []).map((c) => c.name)).size));
  const people = 0.4 + (0.6 * (players - 1)) / 3;
  const votes = poll?.length ?? 0;
  const polled = votes === 0 ? 0 : new Set(poll.map((p) => p.split(':')[0])).size;
  const roles = votes === 0 ? 1 : Math.min(1, polled / 4);
  return people * roles;
}

export function computeScore(s, ops, budget) {
  const m = s.data.getMission(s.missionId);
  const w = m?.scoring ?? { success: 40, science: 25, budget: 10, margins: 10, decisionQuality: 10, collaboration: 5 };
  if (!isCubeSat(m)) return flightOnlyScore(s, m, w);
  const score = { total: 0, stars: 0, breakdown: [], fixes: [] };
  addLine(score, 'success', 'Mission success', w.success, s.flight.deployed && ops.survived ? 1 : s.flight.deployed ? 0.45 : 0);
  const science = m?.successCriteria.find((c) => c.metric === 'imagesDownlinked')?.threshold ?? 20;
  addLine(score, 'science', 'Science returned', w.science, science <= 0 ? 1 : Math.min(1, ops.imagesDownlinked / science));
  let cost = budget.budgetM > 0 ? Math.max(0, Math.min(1, (budget.budgetM - budget.totalCostM) / Math.max(0.01, budget.budgetM * 0.1))) : 1;
  if (budget.totalCostM <= budget.budgetM + 1e-6) cost = 1;
  addLine(score, 'budget', 'Budget', w.budget, budget.budgetM <= 0 ? 1 : cost);
  const healthy = [budget.power, budget.battery, budget.data, budget.pointing, budget.mass].filter((x) => x !== BudgetStatus.Red).length;
  addLine(score, 'margins', 'Design margins', w.margins, healthy / 5);
  addLine(score, 'decision', 'Decision quality', w.decisionQuality, decisionFraction(s.launch, s.settings));
  addLine(score, 'crew', 'Team roles', w.collaboration, collaborationFraction(s.crew, s.launch.poll));
  score.total = r1(score.breakdown.reduce((a, l) => a + l.points, 0));
  score.stars = starsForScore(score.total);
  buildFixes(score, s, ops, budget);
  return score;
}

function flightOnlyScore(s, m, w) {
  const score = { total: 0, stars: 0, breakdown: [], fixes: [] };
  const f = s.flight;
  const goals = evaluateGoals(m, f, { daysAlive: 0, imagesDownlinked: 0 }, null);
  const apogeeMission = !!m && m.targetApogeeKm > 0;
  const reached = apogeeMission ? f.outcome === 'Apogee' : f.orbitAchieved;
  const met = goals.length === 0 ? (reached ? 1 : 0) : goals.filter((g) => g.met).length / goals.length;
  addLine(score, 'success', 'Mission success', w.success, reached ? Math.max(0.5, met) : met * 0.5);
  const need = m && m.requiredDeltaVLeftMs > 0 ? m.requiredDeltaVLeftMs : 1;
  addLine(score, 'margins', apogeeMission ? 'Height reached' : 'Propellant margin', w.margins, !reached ? 0 : apogeeMission ? Math.min(1, f.apoapsisKm / m.targetApogeeKm) : Math.min(1, f.deltaVLeftMs / need));
  addLine(score, 'decision', 'Decision quality', w.decisionQuality, decisionFraction(s.launch, s.settings));
  score.total = r1(score.breakdown.reduce((a, l) => a + l.points, 0));
  score.stars = starsForScore(score.total);
  if (!reached) score.fixes.push(!f.failureCode ? (apogeeMission ? 'Fly again: the rocket has to climb to its highest point.' : 'Fly again: reach the parking orbit first.')
    : `The flight ended with ${f.failureCode}. Read the timeline for the cause, then try a different pitch kick.`);
  else if (apogeeMission) { if (f.apoapsisKm < m.targetApogeeKm) score.fixes.push(`The rocket reached ${f.apoapsisKm.toFixed(0)} km and the target is about ${m.targetApogeeKm.toFixed(0)} km. A smaller pitch kick keeps the climb steeper.`); }
  else if (f.deltaVLeftMs < need) score.fixes.push(`Only ${Math.round(f.deltaVLeftMs).toLocaleString('en-US')} m/s were left for the Moon burn and ${Math.round(need).toLocaleString('en-US')} are needed. Try a different pitch kick: a poor climb wastes propellant on gravity and drag.`);
  return score;
}

function buildFixes(s, state, ops, budget) {
  const f = state.flight;
  const joint = f.failureCode === 'joint_failure';
  if (joint) s.fixes.push("Torque every bolt in the joint's star pattern and verify the joint integrity before launch.");
  else if (f.failureCode === 'abort_unbuilt') s.fixes.push('Stack every part of the rocket in the VAB and bolt each joint before you go to the pad.');
  else if (f.failureCode === 'ignition_failure' && f.failureCause === 'av_safe_arm') s.fixes.push('Arm the Safe/Arm plug at the pad (pre-launch checklist) before the countdown: on SAFE the igniters get no firing current.');
  else if (!f.deployed) s.fixes.push('Restore the deployment path: check the separation pyro cable, fairing release and dispenser.');
  if (ops.powerFailureCause === 'rbf_pin') s.fixes.push('Pull the remove-before-flight pin at the pad before launch.');
  if (ops.powerFailureCause === 'deployment_switch') s.fixes.push('Wire the deployment switch inline between the battery and EPS.');
  if (ops.wiringIssues.length > 0 && s.fixes.length < 3) s.fixes.push(`Fix the CubeSat wiring (Integration Bay > Wire): ${ops.wiringIssues[0]}`);
  for (const issue of budget.issues) {
    if (s.fixes.length >= 3) break;
    if (!s.fixes.some((x) => x.toLowerCase().includes(issue.code.toLowerCase()))) s.fixes.push(issue.message);
  }
  const goal = state.data.getMission(state.missionId)?.successCriteria.find((c) => c.metric === 'imagesDownlinked')?.threshold ?? 20;
  if (!joint && f.deployed && ops.imagesDownlinked < goal && s.fixes.length < 3) s.fixes.push('Increase downlink capacity or image quality/power margin so more usable images reach the ground.');
  while (s.fixes.length > 3) s.fixes.pop();
}

// ---------------------------------------------------------------- Debrief narration (offline three-sentence summary)
export function narrate(missionName, f, ops, score, goals, flightOnly = false) {
  const fix = score.fixes[0] ?? null;
  const met = goals?.filter((g) => g.met).length ?? 0; const total = goals?.length ?? 0;
  const stars = `${score.stars} star${score.stars === 1 ? '' : 's'}`;
  if (!f || !f.flown) return 'No flight was flown, so there is nothing to debrief yet. Build, check the pad list and launch.';
  if (flightOnly && f.outcome === 'Apogee')
    return `${missionName}: the rocket climbed to ${f.apoapsisKm.toFixed(0)} km before it stopped rising (${met} of ${total} goals met, ${stars}). ${fix ? `To score higher: ${fix}` : 'At that height a sodium cloud would show the winds high in the atmosphere, as in 1962.'}`;
  if (!f.orbitAchieved) {
    const what = f.outcome === 'Aborted' ? `The launch was aborted (${f.failureCode})` : `The rocket was lost ${f.flightTimeS.toFixed(0)} seconds after liftoff (${f.failureCode})`;
    const cause = f.failureCause ? ` The cause points to ${f.failureCause}.` : '';
    return `${what}.${cause} A mission is lost at the weakest connection, which is why the checklist exists. ${fix ? `Next: ${fix}` : 'Next: fix what the timeline names and fly again.'}`;
  }
  if (flightOnly) return `${missionName} reached its parking orbit with ${Math.round(f.deltaVLeftMs).toLocaleString('en-US')} m/s left for the next burn (${met} of ${total} goals met, ${stars}). ${fix ? `To score higher: ${fix}` : 'A good flight: the climb wasted little propellant.'}`;
  if (!f.deployed) return `${missionName} reached orbit, but the CubeSat never left the rocket. A satellite that is not released earns nothing. ${fix ? `Next: ${fix}` : 'Next: check the separation and fairing wiring.'}`;
  if (ops && ops.wiringIssues.length > 0) return `${missionName} reached orbit and deployed, but a wiring fault limited the satellite: ${ops.wiringIssues[0]} ${fix ? `Next: ${fix}` : 'Next: fix that cable in the Integration Bay.'}`;
  if (ops && !ops.survived) return `${missionName} reached orbit, but the satellite stayed alive for only ${ops.daysAlive} days. Power and battery margins decide how long a CubeSat lives. ${fix ? `Next: ${fix}` : 'Next: add power margin or battery.'}`;
  return `${missionName} succeeded: orbit, deployment, ${ops?.daysAlive ?? 0} days alive and ${ops?.imagesDownlinked ?? 0} images downlinked (${met} of ${total} goals met, ${stars}).${fix ? ` To score higher: ${fix}` : ' Try a harder challenge variant or a different orbit.'}`;
}

export const timelineText = (events, flightEndS) => events.map((e) => {
  const when = e.system === 'operations' ? `Day ${Math.max(0, Math.round((e.time - flightEndS) / 86400))}` : `T+${e.time.toFixed(0)}s`;
  return `${when} ${e.code}: ${e.message}${e.causeId ? ` (cause ${e.causeId})` : ''}`;
}).join('\n');
export const breakdownText = (score) => `${score.breakdown.map((l) => `${l.label} ${+l.points.toFixed(1)}/${+l.maximum.toFixed(1)}`).join('; ')}; total ${score.total.toFixed(1)}/100, ${score.stars} stars`;
export { Severity };
