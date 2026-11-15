// FlightStage.From(StageDef): thrust is stored in newtons.
export function buildStage(d) {
  return {
    id: d.id, partId: d.partId, dryMassKg: d.dryMassKg, propMassKg: d.propMassKg, thrustVacN: d.thrustVacKN * 1000, ispVac: d.ispVac, ispSeaLevel: d.ispSl,
    diameterM: d.diameterM, ignitionChannel: d.ignitionChannel || 0, separationChannel: d.separationChannel || 0,
  };
}
