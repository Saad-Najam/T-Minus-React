import { Severity } from './severity.js';
import { WiringGraph, validateWiring } from './wiring.js';
import { computeSpacecraftReport, BudgetStatus } from './budget.js';
import { BoltJointState } from './bolts.js';
import { AvionicsReport } from './avionics.js';
import { CrewRole, assignRoles } from './design.js';
import { isCubeSat } from './data.js';

/** Port of PrelaunchChecklist: filled from the real build (budget, wiring, bolts, avionics, payload mass). */
export const SceneNames = { IntegrationBay: 'bay', VAB: 'vab', AvionicsBay: 'avionics', MissionBriefing: 'briefing' };

export function spacecraftWiringFaults({ data, spacecraft }) {
  const g = new WiringGraph(data.getRules());
  for (const p of spacecraft.parts) {
    const def = data.getPart(p.partId);
    if (def && def.ports.length > 0) g.addDevice(p.instanceId, def);
  }
  for (const c of spacecraft.cables) g.connect(c.fromPort, c.toPort, c.reversed);
  return validateWiring(g);
}

export const earthBoostMs = (latDeg) => 7.2921159e-5 * 6371000 * Math.cos((latDeg * Math.PI) / 180);

export function buildChecklist(input) {
  const { data, missionId, spacecraft, vehicle } = input;
  const rules = data.getRules();
  const mission = data.getMission(missionId);
  const rocket = data.getRocket(vehicle.rocketId);
  const report = computeSpacecraftReport(spacecraft, data, mission, rocket);
  const items = [];
  const item = (id, role, title, pass, detail, fixScene, codexId) => ({ id, role, title, pass, detail, fixScene: pass ? null : fixScene, codexId, action: null });

  // Spacecraft & Comms
  const missingParts = report.issues.filter((i) => i.code.startsWith('no_')).map((i) => i.message);
  for (const cat of ['eps', 'obc']) if (!spacecraft.parts.some((p) => data.getPart(p.partId)?.category === cat)) missingParts.push(`No ${cat === 'eps' ? 'EPS board' : 'flight computer'}.`);
  items.push(item('sc_parts', CrewRole.SpacecraftComms, 'CubeSat has every subsystem', missingParts.length === 0,
    missingParts.length === 0 ? 'Power, computer, radio + antenna, ADCS, camera and panels fitted.' : missingParts.join(' '), SceneNames.IntegrationBay, 'eps'));
  const faults = spacecraftWiringFaults(input);
  const bad = faults.filter((f) => f.severity >= Severity.Fault).length;
  items.push(item('sc_wiring', CrewRole.SpacecraftComms, 'CubeSat wiring check', bad === 0,
    bad === 0 ? `${spacecraft.cables.length} cables, no faults.` : `${bad} wiring fault(s): ${faults.find((f) => f.severity >= Severity.Fault).message}`, SceneNames.IntegrationBay, 'eps'));
  const powerOk = report.power !== BudgetStatus.Red && report.battery !== BudgetStatus.Red;
  items.push(item('sc_power', CrewRole.SpacecraftComms, 'Power and battery margins', powerOk,
    `Uses ${report.consumptionW.toFixed(2)} W of ${report.generationW.toFixed(2)} W; battery needs ${report.requiredBatteryWh.toFixed(1)} of ${report.batteryWh.toFixed(0)} Wh.`, SceneNames.IntegrationBay, 'eclipse'));
  items.push(item('sc_data', CrewRole.SpacecraftComms, 'Data budget meets the image goal', report.data === BudgetStatus.Green,
    report.imageGoal > 0 ? `About ${report.imagesDownlinkedMission.toFixed(0)} of ${report.imageGoal} images will reach the ground.` : `${report.downlinkPerDayMB.toFixed(1)} MB/day downlink.`, SceneNames.IntegrationBay, 'downlink'));
  items.push({ id: 'pad_rbf', role: CrewRole.SpacecraftComms, title: 'Remove-Before-Flight pin pulled', pass: spacecraft.rbfPinPulled,
    detail: spacecraft.rbfPinPulled ? 'Pin removed: the satellite will wake up after deployment.' : 'Still inserted: the satellite would never switch on.',
    action: spacecraft.rbfPinPulled ? null : 'pull_rbf', codexId: 'rbf_pin', fixScene: null });

  // Propulsion & Structures
  if (rocket && rocket.buildable) {
    const needed = (rules.assemblyOrder[rocket.id] || []).length;
    const mounted = vehicle.parts.length;
    items.push(item('rk_stack', CrewRole.PropulsionStructures, 'Rocket fully stacked', needed > 0 && mounted >= needed, `${mounted} of ${needed} parts mounted.`, SceneNames.VAB, 'staging'));
    const joints = BoltJointState.allStatuses(rules, vehicle);
    const weak = joints.filter((j) => j.integrity < 0.999);
    items.push(item('rk_joints', CrewRole.PropulsionStructures, 'Every joint torqued in star order', weak.length === 0,
      weak.length === 0 ? `All ${joints.length} joints at 100% integrity.`
        : weak.map((j) => `${j.jointId}: ${(j.integrity * 100).toFixed(0)}% (${j.torqued}/${j.boltCount} torqued${j.missing > 0 ? `, ${j.missing} missing` : ''}${j.sequenceErrors > 0 ? ', warped' : ''}).`).join(' '),
      SceneNames.VAB, 'star_pattern'));
    const av = AvionicsReport.compute(vehicle, rules);
    items.push(item('rk_avionics', CrewRole.PropulsionStructures, 'Avionics ring wired', av.allOk,
      av.allOk ? `All ${av.requiredLinks} cables in place.` : `${av.consequences.length} missing: ${av.consequences[0].message}`, SceneNames.AvionicsBay, 'pyro_separation'));
    items.push(item('rk_payload', CrewRole.PropulsionStructures, 'Payload within rocket capacity', report.massKg <= rocket.payloadLeoKg,
      `${report.massKg.toFixed(2)} kg payload, ${rocket.name} lifts ${rocket.payloadLeoKg.toFixed(0)} kg to orbit.`, SceneNames.VAB, 'delta_v'));
  }

  // Science & Budget
  items.push(item('sb_budget', CrewRole.ScienceBudget, 'Within mission budget', report.cost !== BudgetStatus.Red, `${report.totalCostM.toFixed(3)} M$ of ${report.budgetM.toFixed(2)} M$.`, SceneNames.IntegrationBay, null));
  items.push(item('sb_mass', CrewRole.ScienceBudget, 'Within the 3U mass limit', report.mass !== BudgetStatus.Red, `${report.massKg.toFixed(2)} kg of ${report.massLimitKg.toFixed(1)} kg.`, SceneNames.IntegrationBay, null));
  items.push(item('sb_pointing', CrewRole.ScienceBudget, 'Camera can point accurately enough', report.pointingQuality >= 1,
    !report.adcsId ? 'No ADCS fitted.' : `Image quality ${report.pointingQuality.toFixed(1)}; resolution ≈ ${+report.gsdM.toFixed(1)} m/pixel at ${report.altitudeKm.toFixed(0)} km.`, SceneNames.IntegrationBay, 'adcs'));

  // Flight Director
  const site = rules.getLaunchSite(vehicle.launchSiteId);
  items.push(item('fd_site', CrewRole.FlightDirector, 'Launch site chosen', !!site,
    site ? `${site.name} (${site.latitudeDeg.toFixed(1)}°N): Earth's spin gives ${earthBoostMs(site.latitudeDeg).toFixed(0)} m/s eastward.` : 'Pick Sonmiani or Cape Canaveral.', SceneNames.MissionBriefing, 'launching_east'));
  items.push({ id: 'pad_arm', role: CrewRole.FlightDirector, title: 'Safe/Arm plug ARMED (pad clear)', pass: vehicle.armed,
    detail: vehicle.armed ? 'Pyro circuits live. Ready for terminal count.' : 'Still SAFE: nothing can ignite or separate.', action: vehicle.armed ? null : 'arm', codexId: 'safe_arm', fixScene: null });

  // A flight-only mission has no CubeSat to check, and the Saturn V's circuits are armed for you.
  let out = items;
  if (!isCubeSat(mission)) out = out.filter((i) => !(i.id.startsWith('sc_') || i.id === 'pad_rbf' || i.id.startsWith('sb_')));
  if (rocket && !rocket.buildable) out = out.filter((i) => i.id !== 'pad_arm');
  return out;
}

export { assignRoles };
