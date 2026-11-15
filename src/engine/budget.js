import { Severity } from './severity.js';

// Port of TMinus.Core.SpacecraftBudget. Budgets for a 3U CubeSat at a target altitude:
// T = 2π√(r³/μ); eclipse fraction = asin(R/r)/π (worst case); generation = Σ peak × sunlit × pointing;
// battery needs eclipse energy / 0.3 (max depth of discharge); downlink = rate × contacts × minutes.
export const Mu = 3.986004418e14;
export const EarthRadiusKm = 6371.0;
export const MaxDepthOfDischarge = 0.3;
export const ImagingMinutesPerPass = 10;
export const MagnetorquerImageQuality = 0.3;
export const BudgetStatus = { Green: 'Green', Yellow: 'Yellow', Red: 'Red' };

export const periodMinutes = (altKm) => { const r = (EarthRadiusKm + altKm) * 1000; return (2 * Math.PI * Math.sqrt((r * r * r) / Mu)) / 60; };
export const eclipseFraction = (altKm) => Math.asin(EarthRadiusKm / (EarthRadiusKm + altKm)) / Math.PI;

export function computeSpacecraftReport(design, data, mission, rocket) {
  const r = { issues: [] };
  const add = (code, severity, message, codexId) => r.issues.push({ code, severity, message, codexId: codexId ?? null });
  const parts = design.parts.map((p) => data.getPart(p.partId)).filter(Boolean);
  const frame = data.getPart('frame_3u');
  if (frame && parts.every((p) => p.id !== 'frame_3u')) parts.push(frame);

  // orbit
  r.altitudeKm = design.orbitAltitudeKm > 0 ? design.orbitAltitudeKm : mission?.defaultOrbitKm ?? 550;
  r.periodMin = periodMinutes(r.altitudeKm);
  const fe = eclipseFraction(r.altitudeKm);
  r.sunlitFraction = 1 - fe; r.eclipseMin = fe * r.periodMin;

  // mass and cost
  r.massKg = parts.reduce((s, p) => s + p.massKg, 0);
  r.massLimitKg = !mission ? 4.0 : mission.massLimitKg > 0 ? mission.massLimitKg : 100.0;
  r.spacecraftCostK = parts.reduce((s, p) => s + p.costK, 0);
  r.launchCostM = rocket?.launchCostMUSD ?? 0;
  r.totalCostM = r.launchCostM + r.spacecraftCostK / 1000;
  r.budgetM = mission?.budgetMUSD ?? 0;
  r.mass = r.massKg > r.massLimitKg ? BudgetStatus.Red : r.massKg > r.massLimitKg * 0.9 ? BudgetStatus.Yellow : BudgetStatus.Green;
  r.cost = r.budgetM <= 0 ? BudgetStatus.Green : r.totalCostM > r.budgetM + 1e-9 ? BudgetStatus.Red : r.totalCostM > r.budgetM * 0.99 ? BudgetStatus.Yellow : BudgetStatus.Green;
  if (r.mass === BudgetStatus.Red) add('over_mass', Severity.Blocker, `Too heavy: ${r.massKg.toFixed(2)} kg, the 3U limit is ${r.massLimitKg.toFixed(1)} kg.`, 'staging');
  if (r.cost === BudgetStatus.Red) add('over_budget', Severity.Blocker, `Over budget: ${r.totalCostM.toFixed(3)} M USD of ${r.budgetM.toFixed(2)} M (launch ${r.launchCostM.toFixed(1)} M + spacecraft ${r.spacecraftCostK.toFixed(0)} k).`, null);

  // power
  const contacts = mission?.groundContactsPerDay ?? 4;
  const contactMin = mission?.contactMinutes ?? 8;
  const passes = mission?.imagingPassesPerDay ?? 1;
  const contactDuty = (contacts * contactMin) / 1440;
  const imagingDuty = (passes * ImagingMinutesPerPass) / 1440;
  const camera = parts.find((p) => p.category === 'camera');
  const radio = parts.find((p) => p.category === 'radio');
  const adcs = parts.find((p) => p.category === 'adcs');
  r.cameraId = camera?.id ?? null; r.radioId = radio?.id ?? null; r.adcsId = adcs?.id ?? null;
  r.alwaysOnW = parts.reduce((s, p) => s + p.powerIdleW, 0);
  r.imagingW = camera ? (camera.powerActiveW - camera.powerIdleW) * imagingDuty : 0;
  r.transmitW = radio ? (radio.powerActiveW - radio.powerIdleW) * contactDuty : 0;
  r.consumptionW = r.alwaysOnW + r.imagingW + r.transmitW;
  r.generationW = parts.filter((p) => p.category === 'solar').reduce((s, p) => s + p.spec('peakW') * r.sunlitFraction * p.spec('pointingFactor', 0.6), 0);
  r.marginW = r.generationW - r.consumptionW;
  r.power = r.marginW < 0 ? BudgetStatus.Red : r.marginW < 0.1 * r.consumptionW ? BudgetStatus.Yellow : BudgetStatus.Green;
  if (r.generationW <= 0) add('no_solar', Severity.Blocker, 'No solar panels: the battery will run flat.', 'eclipse');
  else if (r.power === BudgetStatus.Red) add('power_negative', Severity.Blocker, `Power deficit: makes ${r.generationW.toFixed(2)} W but uses ${r.consumptionW.toFixed(2)} W on average. Add panels or remove loads.`, 'eclipse');
  else if (r.power === BudgetStatus.Yellow) add('power_tight', Severity.Warning, `Power margin under 10% (${r.marginW.toFixed(2)} W).`, 'eclipse');

  // battery
  r.batteryWh = parts.filter((p) => p.category === 'battery').reduce((s, p) => s + p.spec('capacityWh'), 0);
  r.eclipseEnergyWh = (r.consumptionW * r.eclipseMin) / 60;
  r.requiredBatteryWh = r.eclipseEnergyWh / MaxDepthOfDischarge;
  r.battery = r.batteryWh < r.requiredBatteryWh ? BudgetStatus.Red : r.batteryWh < r.requiredBatteryWh * 1.2 ? BudgetStatus.Yellow : BudgetStatus.Green;
  if (r.batteryWh <= 0) add('no_battery', Severity.Blocker, 'No battery: nothing powers the satellite in eclipse.', 'battery_dod');
  else if (r.battery === BudgetStatus.Red) add('battery_small', Severity.Fault, `Battery too small: needs ${r.requiredBatteryWh.toFixed(1)} Wh to stay under 30% depth of discharge, has ${r.batteryWh.toFixed(0)} Wh.`, 'battery_dod');

  // data
  const obc = parts.find((p) => p.category === 'obc');
  r.storageMB = obc?.spec('storageMB') ?? 0;
  r.imageMB = camera?.spec('imageMB') ?? 0;
  r.imagesPerDay = camera ? passes * (mission?.imagesPerPass ?? 3) : 0;
  r.dataPerDayMB = r.imagesPerDay * r.imageMB;
  const rateKbps = radio?.spec('dataRateKbps') ?? 0;
  r.downlinkPerDayMB = (rateKbps * contacts * contactMin * 60) / 8 / 1000;
  r.durationDays = mission?.durationDays > 0 ? mission.durationDays : 30;
  r.daysUntilFull = r.downlinkPerDayMB >= r.dataPerDayMB || r.storageMB <= 0 ? Infinity : r.storageMB / (r.dataPerDayMB - r.downlinkPerDayMB);
  const imagesSendable = r.imageMB > 0 ? (r.downlinkPerDayMB * r.durationDays) / r.imageMB : 0;
  r.imagesDownlinkedMission = Math.min(imagesSendable, r.imagesPerDay * r.durationDays);
  const goal = mission?.successCriteria.find((c) => c.metric === 'imagesDownlinked');
  r.imageGoal = goal ? Math.trunc(goal.threshold) : 0;
  if (!camera) { r.data = BudgetStatus.Red; add('no_camera', Severity.Blocker, 'No camera: this mission needs images.', 'gsd'); }
  else if (!radio) { r.data = BudgetStatus.Red; add('no_radio', Severity.Blocker, "No radio: images can't reach the ground.", 'downlink'); }
  else if (r.imageGoal > 0 && r.imagesDownlinkedMission < r.imageGoal) {
    r.data = BudgetStatus.Yellow;
    add('downlink_short', Severity.Warning, `Only about ${r.imagesDownlinkedMission.toFixed(0)} images reach the ground in ${r.durationDays} days (${r.downlinkPerDayMB.toFixed(1)} MB/day downlink); the goal is ${r.imageGoal}. A faster radio (S-band) fixes this.`, 'downlink');
  } else r.data = BudgetStatus.Green;

  // pointing and resolution
  const needsWheels = !!camera && camera.requires.includes('adcs_rw');
  const hasWheels = adcs?.id === 'adcs_rw';
  r.pointingQuality = !adcs ? 0 : needsWheels && !hasWheels ? MagnetorquerImageQuality : 1.0;
  r.gsdM = camera ? (camera.spec('gsdMAt550') * r.altitudeKm) / 550 : 0;
  r.pointing = !adcs ? BudgetStatus.Red : r.pointingQuality < 1 ? BudgetStatus.Yellow : BudgetStatus.Green;
  if (!adcs) add('no_adcs', Severity.Blocker, "No ADCS: the satellite will tumble and the camera can't aim.", 'adcs');
  else if (r.pointingQuality < 1) add('pointing_coarse', Severity.Warning, `${camera.name} needs reaction wheels. With magnetorquers it blurs: image quality ${r.pointingQuality.toFixed(1)}.`, 'adcs');

  r.issues.sort((a, b) => b.severity - a.severity);
  r.hasBlockers = r.issues.some((i) => i.severity >= Severity.Blocker);
  return r;
}
