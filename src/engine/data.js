// DataRegistry: parts, rockets, missions, codex and rules are JSON in /public/data (copied from the original Unity project).
const unwrap = (json, key) => (Array.isArray(json) ? json : json[key] || []);

export class DataRegistry {
  constructor({ parts, rockets, missions, codex, rules, quiz, strings }) {
    this.partsList = unwrap(parts, 'parts');
    this.rocketsList = unwrap(rockets, 'rockets');
    this.missionsList = unwrap(missions, 'missions');
    this.codexList = unwrap(codex, 'codex');
    this.rules = normalizeRules(rules);
    this.quiz = unwrap(quiz || [], 'quiz');
    this.strings = strings || {};
    this._parts = new Map(this.partsList.map((p) => [p.id, normalizePart(p)]));
    this._rockets = new Map(this.rocketsList.map((r) => [r.id, normalizeRocket(r)]));
    this._missions = new Map(this.missionsList.map((m) => [m.id, normalizeMission(m)]));
    this._codex = new Map(this.codexList.map((c) => [c.id, c]));
  }
  get parts() { return [...this._parts.values()]; }
  get rockets() { return [...this._rockets.values()]; }
  get missions() { return [...this._missions.values()]; }
  get codex() { return [...this._codex.values()]; }
  getPart(id) { return this._parts.get(id) || null; }
  getRocket(id) { return this._rockets.get(id) || null; }
  getMission(id) { return this._missions.get(id) || null; }
  getCodex(id) { return this._codex.get(id) || null; }
  getRules() { return this.rules; }
  get summary() { return `Loaded ${this._parts.size} parts, ${this._rockets.size} rockets, ${this._missions.size} missions, ${this._codex.size} codex entries`; }

  static async load(base = './data/') {
    const names = ['parts', 'rockets', 'missions', 'codex', 'rules', 'quiz', 'strings'];
    const out = {};
    await Promise.all(names.map(async (n) => { out[n] = await (await fetch(`${base}${n}.json`)).json(); }));
    return new DataRegistry(out);
  }
}

function normalizePart(p) {
  return { description: '', powerIdleW: 0, powerActiveW: 0, massKg: 0, costK: 0, ports: [], requires: [], specs: {}, ...p,
    spec(key, fallback = 0) { return this.specs && this.specs[key] !== undefined ? this.specs[key] : fallback; },
    getPort(id) { return this.ports.find((x) => x.id === id); } };
}
function normalizeRocket(r) {
  return { stages: [], components: [], partIds: [], payloadLeoKg: 0, referencePayloadKg: 0, launchCostMUSD: 0, ...r };
}
function normalizeMission(m) {
  return { successCriteria: [], randomEvents: [], rewardImages: [], seededFaults: [], consoleChoices: [], codexIds: [], rocketOptions: [],
    launchSites: [], orbitOptionsKm: [], budgetMUSD: 0, massLimitKg: 0, durationDays: 0, groundContactsPerDay: 0, contactMinutes: 0,
    imagingPassesPerDay: 0, imagesPerPass: 0, seed: 0, targetApogeeKm: 0, parkingOrbitKm: 0, requiredDeltaVLeftMs: 0, defaultOrbitKm: 0,
    scoring: { success: 40, science: 25, budget: 10, margins: 10, decisionQuality: 10, collaboration: 5, ...(m.scoring || {}) }, ...m };
}
function normalizeRules(r) {
  const rules = { cableTypes: [], forbidden: [], warnings: [], requiredConnections: [], inlineRules: [], assemblyOrder: {}, boltJoints: [],
    pyroChannels: [], safeArm: {}, avionicsWiring: [], launchSites: [], ...r };
  rules.getCableType = (id) => rules.cableTypes.find((c) => c.id === id);
  rules.getJoint = (id) => rules.boltJoints.find((j) => j.id === id);
  rules.getLaunchSite = (id) => rules.launchSites.find((s) => s.id === id);
  rules.cableFor = (a, b) => rules.cableTypes.find((c) => c.allowed.some((p) => (p.from === a && p.to === b) || (p.from === b && p.to === a))) || null;
  return rules;
}

/** What a mission is about (flight-only missions skip the CubeSat screens). */
export const isCubeSat = (mission) => !mission || !mission.payloadType || mission.payloadType === 'cubesat_3u';
