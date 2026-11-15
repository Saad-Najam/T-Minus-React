import { Severity } from './severity.js';
import { spacecraftWiringFaults } from './checklist.js';

export const StorageLimitMB = 2000;

// ---------------------------------------------------------------- OpsWiring: what CubeSat wiring faults do in orbit
export function evaluateWiringEffects(input) {
  const fx = { dead: false, noDownlink: false, noImaging: false, noSolar: false, deadCause: null, downlinkCause: null, imagingCause: null, solarCause: null,
    deadMessage: '', downlinkMessage: '', imagingMessage: '', solarMessage: '' };
  const categoryOf = (inst) => { const p = inst ? input.spacecraft.parts.find((x) => x.instanceId === inst) : null; return p ? input.data.getPart(p.partId)?.category : null; };
  for (const f of spacecraftWiringFaults(input)) {
    if (f.severity < Severity.Fault) continue;
    const blame = f.port ?? f.device; const category = categoryOf(f.device);
    if (f.code === 'short_circuit' || f.code === 'reversed_polarity') {
      if (!fx.dead) { fx.dead = true; fx.deadCause = blame; fx.deadMessage = `The satellite died on deployment: ${f.message}`; }
    } else if (f.code === 'missing_connection') {
      if (category === 'radio' || category === 'antenna') { if (!fx.noDownlink) { fx.noDownlink = true; fx.downlinkCause = blame; fx.downlinkMessage = `Nothing reached the ground: ${f.message}`; } }
      else if (category === 'camera' || category === 'adcs') { if (!fx.noImaging) { fx.noImaging = true; fx.imagingCause = blame; fx.imagingMessage = `No usable images were taken: ${f.message}`; } }
      else if (category === 'eps') {
        if (f.port && f.port.includes('SOLAR_IN')) { if (!fx.noSolar) { fx.noSolar = true; fx.solarCause = blame; fx.solarMessage = `The solar panels never charged the battery: ${f.message}`; } }
        else if (!fx.dead) { fx.dead = true; fx.deadCause = blame; fx.deadMessage = `The satellite had no power source: ${f.message}`; }
      } else if (category === 'obc') { if (!fx.dead) { fx.dead = true; fx.deadCause = blame; fx.deadMessage = `The flight computer never powered on: ${f.message}`; } }
    }
  }
  fx.any = fx.dead || fx.noDownlink || fx.noImaging || fx.noSolar;
  fx.messages = [fx.dead && fx.deadMessage, fx.noSolar && fx.solarMessage, fx.noDownlink && fx.downlinkMessage, fx.noImaging && fx.imagingMessage].filter(Boolean);
  return fx;
}

// ---------------------------------------------------------------- OpsSimulation: deterministic one-step-per-orbit model
export const orbitsPerDay = (periodMin) => Math.max(1, Math.round(1440 / Math.max(1, periodMin)));
export const netOrbitEnergyWh = (genW, loadW, periodMin) => ((genW - loadW) * Math.max(0, periodMin)) / 60;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const stepStateOfCharge = (soc, netWh, capWh) => (capWh <= 0 ? 0 : clamp01(soc + netWh / capWh));
export const canImage = (ready, rebooted, soc, pointing) => ready && !rebooted && soc > 0.4 && pointing > 0;

/** The day an event really happens: its data day moved by -2..+2 from the mission seed and the CubeSat's parts. */
export function eventDay(mission, e, index, design, days) {
  if (!mission || mission.seed === 0) return e.day;
  let h = Math.imul(mission.seed, 31) + Math.imul(index, 17) | 0;
  for (const p of design?.parts ?? []) for (const ch of p.partId ?? '') h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  const jitter = ((h >>> 0) % 5) - 2;
  return Math.max(1, Math.min(days, e.day + jitter));
}

const joins = (c, a, b) => (c.fromPort === a && c.toPort === b) || (c.fromPort === b && c.toPort === a);

/** state = { data, missionId, spacecraft, vehicle, flight, events }. Returns an OpsReport. */
export function runOps(state, budget) {
  const { data, flight, events } = state;
  const mission = data.getMission(state.missionId);
  const report = { powered: false, survived: false, daysAlive: 0, imagesTaken: 0, imagesDownlinked: 0, storedMB: 0, downlinkedMB: 0, capacityWh: budget.batteryWh, finalSoc: 0,
    rewardGsdM: budget.gsdM, rewardImageShare: 0, rewardImageQuality: 0, powerFailureCause: null, timeline: [], failures: [], wiringIssues: [],
    rewardCredit: mission?.rewardCredit ?? '', rewardTitle: '', rewardPlaceholder: '' };
  const powerIssue = budget.issues.find((i) => i.code === 'power_negative');
  if (powerIssue) { report.failures.push(powerIssue.message); events.addAt(flight.flightTimeS, 'operations', 'power_budget_deficit', powerIssue.message, powerIssue.codexId ?? 'eclipse', Severity.Fault); }
  const firstImage = mission?.rewardImages?.[0];
  report.rewardTitle = firstImage?.title ?? 'Lake Manchar — Landsat reward';
  const inlineRule = data.getRules().inlineRules.find((r) => r.fromCategory === 'battery' && r.toCategory === 'eps');
  const switchPartId = inlineRule?.partId ?? 'dep_switch';
  const sc = state.spacecraft;
  const sw = sc.parts.find((p) => data.getPart(p.partId)?.id === switchPartId);
  const battery = sc.parts.find((p) => data.getPart(p.partId)?.category === 'battery');
  const eps = sc.parts.find((p) => data.getPart(p.partId)?.category === 'eps');
  const powerCable = !!(sw && battery && eps && sc.cables.some((c) => joins(c, `${battery.instanceId}/BATT`, `${sw.instanceId}/BATT_IN`)) && sc.cables.some((c) => joins(c, `${sw.instanceId}/BATT_OUT`, `${eps.instanceId}/BATT`)));
  report.powered = !!(flight.deployed && sc.rbfPinPulled && sw && powerCable);
  if (!report.powered) {
    report.powerFailureCause = !flight.deployed ? 'deployment' : !sc.rbfPinPulled ? 'rbf_pin' : 'deployment_switch';
    report.failures.push(!flight.deployed ? 'The launch did not deploy a satellite; operations could not begin.' : !sc.rbfPinPulled ? 'RBF pin was still installed; satellite never powered on.' : 'Deployment switch missing or not wired inline; satellite never powered on.');
    events.addAt(flight.flightTimeS, 'operations', 'satellite_no_power', report.failures[0], report.powerFailureCause, Severity.Fault);
  }

  const fx = evaluateWiringEffects({ data, spacecraft: sc });
  if (report.powered) {
    const firstDay = flight.flightTimeS + 86400;
    if (fx.dead) {
      report.powered = false; report.powerFailureCause = 'wiring'; report.failures.push(fx.deadMessage);
      events.addAt(flight.flightTimeS, 'operations', 'satellite_wiring_dead', fx.deadMessage, fx.deadCause, Severity.Fault);
    } else {
      if (fx.noSolar) events.addAt(firstDay, 'operations', 'wiring_no_solar', fx.solarMessage, fx.solarCause, Severity.Fault);
      if (fx.noDownlink) events.addAt(firstDay, 'operations', 'wiring_no_downlink', fx.downlinkMessage, fx.downlinkCause, Severity.Fault);
      if (fx.noImaging) events.addAt(firstDay, 'operations', 'wiring_no_imaging', fx.imagingMessage, fx.imagingCause, Severity.Fault);
    }
    for (const m of fx.messages) { report.wiringIssues.push(m); if (!fx.dead) report.failures.push(m); }
  }

  const days = Math.max(1, mission?.durationDays || 30);
  const plan = (mission?.randomEvents ?? []).map((e, i) => ({ ev: e, day: eventDay(mission, e, i, sc, days) })).sort((a, b) => a.day - b.day);
  let soc = 1; let stored = 0; let down = 0; let capacity = Math.max(0, budget.batteryWh);
  let taken = 0; let sent = 0; let eventIndex = 0; let aliveDays = 0;
  const period = Math.max(1, budget.periodMin);
  const orbitPowerWh = netOrbitEnergyWh(fx.noSolar ? 0 : budget.generationW, budget.consumptionW, period);
  const perDay = orbitsPerDay(period);
  for (let day = 1; day <= days; day++) {
    let reboot = false; let outage = false;
    while (eventIndex < plan.length && plan[eventIndex].day === day) {
      const ev = plan[eventIndex++].ev;
      if (ev.type === 'solar_storm') reboot = true;
      if (ev.type === 'ground_outage') outage = true;
      if (ev.type === 'battery_ageing') capacity *= Math.max(0, 1 - (ev.value <= 1 ? ev.value : ev.value / 100));
      const pct = ev.value <= 1 ? ev.value * 100 : ev.value;
      const msg = ev.type === 'solar_storm' ? 'Solar storm rebooted the flight computer; one science day was lost.' : ev.type === 'ground_outage' ? "Ground station outage prevented today's downlink." : `Battery ageing reduced usable capacity by ${+pct.toFixed(1)}%.`;
      report.failures.push(msg);
      events.addAt(flight.flightTimeS + day * 86400, 'operations', ev.type, msg, ev.codexId ?? ev.id, Severity.Warning);
    }
    if (report.powered) {
      for (let n = 0; n < perDay; n++) soc = stepStateOfCharge(soc, orbitPowerWh, capacity);
      if (!fx.noImaging && canImage(true, reboot, soc, budget.pointingQuality)) {
        const count = Math.max(0, mission?.imagesPerPass ?? 3); const each = Math.max(0, budget.imageMB);
        for (let i = 0; i < count; i++) if (stored + each <= Math.min(StorageLimitMB, budget.storageMB)) { stored += each; taken++; }
      }
      const rate = fx.noDownlink ? 0 : data.getPart(budget.radioId)?.spec('dataRateKbps') ?? 0;
      const contactMB = (rate * (mission?.groundContactsPerDay ?? 4) * (mission?.contactMinutes ?? 8) * 60) / 8 / 1000;
      if (!outage && soc > 0.05) {
        const sentToday = Math.min(stored, contactMB);
        stored -= sentToday; down += sentToday;
        // Whole images from the running total: a slow link still finishes an image over several days.
        sent = budget.imageMB > 0 ? Math.floor(down / budget.imageMB + 1e-9) : 0;
      }
      if (report.powered) aliveDays++;
      if (soc <= 0.001) {
        report.powered = false; report.failures.push('Battery depleted: the spacecraft stopped collecting science and radioing home.');
        events.addAt(flight.flightTimeS + day * 86400, 'operations', 'battery_depleted', 'Battery depleted; spacecraft went silent.', 'battery_dod', Severity.Fault);
      }
    }
    report.timeline.push({ day, stateOfCharge: soc, storedMB: stored, downlinkedMB: down, imagesTaken: taken, imagesDownlinked: sent });
  }
  report.daysAlive = aliveDays;
  report.survived = report.powered && report.daysAlive === days;
  Object.assign(report, { finalSoc: soc, storedMB: stored, downlinkedMB: down, imagesTaken: taken, imagesDownlinked: sent, rewardImageQuality: budget.pointingQuality });
  const imageCriterion = mission?.successCriteria.find((c) => c.metric === 'imagesDownlinked');
  report.rewardImageShare = Math.min(1, imageCriterion && imageCriterion.threshold > 0 ? sent / imageCriterion.threshold : 0);
  report.rewardPlaceholder = !firstImage ? 'No reward image metadata is available.' : !firstImage.resource ? 'Reward images are not available for this mission yet.'
    : `Real Landsat images of the 2022 floods, shown at your camera's detail. Your design: ${+budget.gsdM.toFixed(1)} m/pixel GSD, ${(report.rewardImageQuality * 100).toFixed(0)}% pointing quality and ${(report.rewardImageShare * 100).toFixed(0)}% of the image goal returned (each third unlocks one more date).`;
  events.addAt(flight.flightTimeS + days * 86400, 'operations', 'operations_complete', `Operations ended after ${report.daysAlive} days; ${sent} images downlinked.`, null, Severity.Info);
  return report;
}
