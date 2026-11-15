import { buildStage } from './stage.js';

// Port of FlightVehicle / FlightVehicleFactory / FlightRuntime.
export function createVehicle(rocket, rules) {
  const g = rocket.guidance || {};
  const v = {
    id: rocket.id, stages: rocket.stages.map(buildStage),
    components: rocket.components.map((c) => ({ id: c.id, dropWithStage: c.dropWithStage || '', massKg: c.massKg, diameterM: c.diameterM || 0, jettisonAltitudeKm: c.jettisonAltitudeKm || 0 })),
    separationJoints: {},
    turnSpanM: g.turnSpanM ?? 44000, turnEndM: g.turnEndM ?? 45000, turnDeg: g.turnDeg ?? 60,
    altitudeHold: g.altitudeHold ?? false, maxClimb: g.maxClimb ?? 0.8, vrGain: g.vrGain ?? 0.02,
  };
  v.maxDiameterM = Math.max(0.01, ...v.stages.map((s) => s.diameterM), ...v.components.map((c) => c.diameterM));
  v.initialMassKg = (payloadKg) => payloadKg + v.stages.reduce((m, s) => m + s.dryMassKg + s.propMassKg, 0) + v.components.reduce((m, c) => m + c.massKg, 0);
  if (rules) {
    for (let i = 0; i + 1 < v.stages.length; i++) {
      const lower = v.stages[i].partId; const upper = v.stages[i + 1].partId;
      let joint = rules.boltJoints.find((j) => j.lowerPartId === lower && j.upperPartId === upper);
      if (!joint) joint = rules.boltJoints.find((j) => j.lowerPartId === lower || j.upperPartId === upper);
      if (joint) v.separationJoints[v.stages[i].id] = joint.id;
    }
  }
  return v;
}

export function defaultLaunchOptions(over = {}) {
  return { payloadMassKg: 150, targetAltitudeKm: 550, latitudeDeg: 25.2, longitudeDeg: 0, pitchKickDeg: 3, autopilot: true, initialAltitudeKm: 0, startInCircularOrbit: false, suborbital: false, ...over };
}

/** Bridge from game data + build reports into the pure flight solver (FlightRuntime.Create). */
export function launchOptionsFor(data, vehicleDesign, missionId, payloadKg) {
  const rocket = data.getRocket(vehicleDesign.rocketId);
  if (!rocket) throw new Error(`Unknown rocket '${vehicleDesign.rocketId}'.`);
  const rules = data.getRules();
  const site = rules.getLaunchSite(vehicleDesign.launchSiteId);
  const mission = data.getMission(missionId || 'floodwatch_1') || data.getMission('floodwatch_1');
  const target = mission && mission.parkingOrbitKm > 0 ? mission.parkingOrbitKm : mission && mission.defaultOrbitKm > 0 ? mission.defaultOrbitKm : rocket.payloadTargetAltKm;
  return defaultLaunchOptions({
    payloadMassKg: payloadKg ?? rocket.referencePayloadKg, targetAltitudeKm: target, latitudeDeg: site?.latitudeDeg ?? 0, longitudeDeg: site?.longitudeDeg ?? 0,
    pitchKickDeg: vehicleDesign.pitchKickDeg, autopilot: true, suborbital: !!mission && mission.targetApogeeKm > 0,
  });
}
