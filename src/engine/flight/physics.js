// Port of TMinus.Flight.FlightConstants / FlightPhysics / Vec2d / OrbitElements. Double precision, 2D plane over a round rotating Earth.
export const C = {
  Mu: 3.986004418e14, EarthRadiusM: 6371000, EarthRotationRadS: 7.2921159e-5, G0: 9.80665, SeaLevelPressurePa: 101325,
  ScaleHeightM: 8500, AtmosphereLimitM: 150000, OrbitalCutoffMinAltitudeM: 100000, Dt: 0.05, SpeedOfSoundMs: 340, StageCd: 0.4, TransonicCd: 0.6,
};

export const v2 = (x = 0, y = 0) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const mag = (a) => Math.hypot(a.x, a.y);
export const sqr = (a) => a.x * a.x + a.y * a.y;
export const norm = (a) => { const m = Math.hypot(a.x, a.y); return m > 0 ? { x: a.x / m, y: a.y / m } : { x: 0, y: 0 }; };
export const rotate = (v, r) => ({ x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) });

export const altitude = (p) => mag(p) - C.EarthRadiusM;
export const density = (h) => (h >= C.AtmosphereLimitM || h < 0 ? 0 : 1.225 * Math.exp(-h / C.ScaleHeightM));
export const pressure = (h) => (h >= C.AtmosphereLimitM || h < 0 ? 0 : C.SeaLevelPressurePa * Math.exp(-h / C.ScaleHeightM));
export function airVelocity(p, latDeg) { const w = C.EarthRotationRadS * Math.cos((latDeg * Math.PI) / 180); return { x: -w * p.y, y: w * p.x }; }
export function dynamicPressure(p, v, latDeg) { const rho = density(altitude(p)); return 0.5 * rho * sqr(sub(v, airVelocity(p, latDeg))); }
export function dragCoefficient(relSpeed) { const mach = relSpeed / C.SpeedOfSoundMs; return mach >= 0.8 && mach <= 1.2 ? C.TransonicCd : C.StageCd; }
export const rocketEquation = (isp, m0, m1) => (isp <= 0 || m0 <= m1 || m1 <= 0 ? 0 : isp * C.G0 * Math.log(m0 / m1));

export function orbitElements(p, v) {
  const r = mag(p); const v2s = sqr(v);
  if (r <= 0) return { energy: 0, semiMajorAxisM: 0, eccentricity: 0, apoapsisM: 0, periapsisM: 0, bound: false };
  const e = v2s * 0.5 - C.Mu / r;
  const a = Math.abs(e) < 1e-12 ? Infinity : -C.Mu / (2 * e);
  const h = p.x * v.y - p.y * v.x;
  const ecc = Math.sqrt(Math.max(0, 1 + (2 * e * h * h) / (C.Mu * C.Mu)));
  const bound = e < 0 && Number.isFinite(a);
  return { energy: e, semiMajorAxisM: a, eccentricity: ecc, bound, apoapsisM: bound ? a * (1 + ecc) : Infinity, periapsisM: bound ? a * (1 - ecc) : -Infinity };
}

export const FlightPhase = { Pad: 'Pad', Ascent: 'Ascent', Coast: 'Coast', Circularize: 'Circularize', Orbit: 'Orbit', Failed: 'Failed', Aborted: 'Aborted', Apogee: 'Apogee' };
