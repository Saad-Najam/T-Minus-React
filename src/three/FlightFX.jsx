import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { C, altitude, mag } from '../engine/flight/physics.js';

const RE = C.EarthRadiusM;
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** One soft-particle material for smoke, trail and clouds: round, feathered sprites with per-particle size and alpha. */
function useSoftMaterial(color = '#ffffff', lit = 1) {
  return useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 }, uColor: { value: new THREE.Color(color) }, uLit: { value: lit } },
    vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
      void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 0.0, 900.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; uniform vec3 uColor; uniform float uLit;
      void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; if (d > 1.0) discard; float soft = smoothstep(1.0, 0.0, d); float shade = 0.82 + 0.18 * (0.5 - p.y); gl_FragColor = vec4(uColor * shade * uLit, soft * soft * vA); }`,
    transparent: true, depthWrite: false,
  }), [color, lit]);
}

function useParticles(n) {
  return useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    return g;
  }, [n]);
}

function useScale(mat) { const { gl } = useThree(); return () => { mat.uniforms.uScale.value = gl.domElement.height * 0.5 / Math.tan(Math.PI / 8); }; }

/** Billowing smoke and steam blasted out from the pad at lift-off. `frame` carries the rocket centre every frame (floating origin). */
export function PadSmoke({ session, frame, quality }) {
  const N = Math.round(70 * quality); const geo = useParticles(N); const mat = useSoftMaterial('#d8d4cc'); const rescale = useScale(mat);
  const seeds = useMemo(() => { const r = mulberry(7); return Array.from({ length: N }, () => ({ a: r() * Math.PI * 2, s: 0.5 + r(), h: r() })); }, [N]);
  useFrame(() => {
    rescale(); const f = frame.current; if (!f) return;
    const t = session.sim.timeS; const on = session.launched && t < 38;
    const P = geo.attributes.position.array; const S = geo.attributes.aSize.array; const A = geo.attributes.aAlpha.array;
    for (let i = 0; i < N; i++) {
      const sd = seeds[i]; const spawn = (i / N) * 7; const age = t - spawn; const life = 26;
      if (!on || age < 0 || age > life) { A[i] = 0; S[i] = 0; continue; }
      const u = age / life; const r = 4 + age * 8.5 * sd.s; const side = Math.cos(sd.a) * r; const depth = Math.sin(sd.a) * r * 0.9;
      P[i * 3] = -f.Rc.x + side; P[i * 3 + 1] = RE - f.Rc.y + 1 + age * 1.6 * sd.s + sd.h * 4; P[i * 3 + 2] = depth;
      S[i] = 9 + age * 5.5 * sd.s; A[i] = 0.62 * (1 - u) * Math.min(1, age * 2);
    }
    geo.attributes.position.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}

/** The rocket's exhaust trail: puffs left behind in the sky that widen and fade. */
export function Trail({ session, frame, quality }) {
  const N = Math.round(150 * quality); const geo = useParticles(N); const mat = useSoftMaterial('#f1ece4'); const rescale = useScale(mat);
  const pool = useRef({ items: [], last: -1 });
  useFrame(() => {
    rescale(); const f = frame.current; if (!f) return; const sim = session.sim; const t = sim.timeS;
    const p = pool.current;
    if (t < p.last) { p.items.length = 0; p.last = -1; }
    if (session.launched && session.lastThrottle > 0.05 && t - p.last >= 0.18 && !session.ended) {
      p.last = t; const b = f.base; p.items.push({ x: b.x, y: b.y, t, j: (Math.random() - 0.5) * 1.6, k: Math.random() });
      if (p.items.length > N) p.items.shift();
    }
    const P = geo.attributes.position.array; const S = geo.attributes.aSize.array; const A = geo.attributes.aAlpha.array;
    for (let i = 0; i < N; i++) {
      const it = p.items[i]; if (!it) { A[i] = 0; S[i] = 0; continue; }
      const age = t - it.t; const life = 16; const u = age / life; if (u > 1) { A[i] = 0; S[i] = 0; continue; }
      P[i * 3] = it.x - f.Rc.x + it.j * age * 0.4; P[i * 3 + 1] = it.y - f.Rc.y - age * 0.5; P[i * 3 + 2] = it.j * 0.5;
      S[i] = 2.5 + age * 2.4 * (0.8 + it.k * 0.4); A[i] = 0.5 * (1 - u) * (1 - u) * Math.min(1, age * 3);
    }
    geo.attributes.position.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={4} />;
}

/** A layer of cumulus around 1.5-5 km: the rocket punches through it on the way up. Static in the world, soft-lit. */
export function Clouds({ frame, quality }) {
  const clusters = Math.round(26 * quality); const N = clusters * 6; const geo = useParticles(N); const mat = useSoftMaterial('#ffffff', 1.0); const rescale = useScale(mat);
  const data = useMemo(() => {
    const r = mulberry(21); const arr = [];
    for (let c = 0; c < clusters; c++) {
      const cx = (r() - 0.5) * 60000; const cz = (r() - 0.5) * 50000 - 4000; const cy = 1500 + r() * 3600; const base = 400 + r() * 900;
      for (let k = 0; k < 6; k++) arr.push({ x: cx + (r() - 0.5) * base * 2.2, y: cy + (r() - 0.35) * base * 0.5, z: cz + (r() - 0.5) * base * 1.6, s: base * (0.7 + r() * 0.9), a: 0.55 + r() * 0.3 });
    }
    return arr;
  }, [clusters]);
  useFrame(() => {
    rescale(); const f = frame.current; if (!f) return;
    const P = geo.attributes.position.array; const S = geo.attributes.aSize.array; const A = geo.attributes.aAlpha.array;
    const fade = 1 - Math.max(0, Math.min(1, (f.alt - 9000) / 9000)); // dissolve above the weather
    data.forEach((c, i) => { P[i * 3] = -f.Rc.x + c.x; P[i * 3 + 1] = RE - f.Rc.y + c.y; P[i * 3 + 2] = c.z; S[i] = c.s; A[i] = c.a * fade; });
    geo.attributes.position.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />;
}

/** Low blue-green ridges on the horizon so the launch site has depth. Moves with the ground. */
export function Hills({ quality }) {
  const hills = useMemo(() => {
    const r = mulberry(5); const out = [];
    const n = Math.round(46 * Math.max(0.5, quality));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r() * 0.1; const d = 14000 + r() * 16000; out.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h: 500 + r() * 1700, w: 2500 + r() * 4500, c: r() }); }
    return out;
  }, [quality]);
  return (
    <group>
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, h.h * 0.38, h.z]} scale={[h.w, h.h, h.w * 0.8]}>
          <coneGeometry args={[1, 1, 7, 1]} /><meshStandardMaterial color={h.c > 0.5 ? '#46604f' : '#5b6b52'} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** The sun: a glow that always sits in the sky, and brightens into lens flare in space. */
export function SunGlow({ dir = [0.45, 0.62, 0.64] }) {
  const ref = useRef(); const { camera } = useThree();
  const tex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.08, 'rgba(255,235,190,0.95)'); g.addColorStop(0.3, 'rgba(255,190,120,0.35)'); g.addColorStop(1, 'rgba(255,160,80,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
  const d = useMemo(() => new THREE.Vector3(...dir).normalize(), [dir]);
  useFrame(() => { if (!ref.current) return; ref.current.position.copy(camera.position).addScaledVector(d, 20000); ref.current.lookAt(camera.position); });
  return <mesh ref={ref} renderOrder={-5}><planeGeometry args={[7000, 7000]} /><meshBasicMaterial map={tex} transparent depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>;
}

/** Camera rumble: shakes the view while the engines are loud and the air is thick. Removes its own previous offset so it never drifts. */
export function useRumble(session, mode, reduce) {
  const { camera } = useThree(); const off = useRef(new THREE.Vector3());
  useFrame(({ clock }) => {
    camera.position.sub(off.current); off.current.set(0, 0, 0);
    if (reduce || mode === 'map' || !session.launched || session.ended) return;
    const alt = Math.max(0, altitude(session.sim.position)); const amp = session.lastThrottle * Math.exp(-alt / 4500) * (mode === 'ground' ? 0.5 : 0.22);
    const t = clock.elapsedTime * 38; off.current.set(Math.sin(t * 1.3) * amp, Math.sin(t * 1.9 + 1) * amp, Math.sin(t * 1.1 + 2) * amp * 0.6); camera.position.add(off.current);
  });
}

export { mag };
