import { useFrame, useLoader } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import CubeSat3D from './CubeSat3D.jsx';

const base = import.meta.env.BASE_URL;

/** NASA Blue Marble Next Generation (credit: NASA Earth Observatory), as in the original game. */
export function useEarthTexture() {
  const t = useLoader(THREE.TextureLoader, `${base}images/BlueMarble.jpg`);
  useMemo(() => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; }, [t]);
  return t;
}

const atmosphereMat = (color = '#5cb8ff', power = 3.2, strength = 1.5) => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uStrength: { value: strength } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 uColor; uniform float uPower; uniform float uStrength; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(0.0, 0.72 - dot(vN, vV)), uPower); gl_FragColor = vec4(uColor, 1.0) * f * uStrength; }',
  side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});

/** Procedural cloud cover: fractal value noise baked once into an alpha texture (no download). */
let cloudTex = null;
function cloudTexture() {
  if (cloudTex) return cloudTex;
  const W = 512; const H = 256; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); const img = x.createImageData(W, H);
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (px, py, period) => { const gx = (px / W) * period; const gy = (py / H) * (period / 2); const i = Math.floor(gx); const j = Math.floor(gy); const fx = gx - i; const fy = gy - j; const u = fx * fx * (3 - 2 * fx); const v = fy * fy * (3 - 2 * fy); const w = Math.floor(period);
    const a = hash(i % w, j); const b = hash((i + 1) % w, j); const cc = hash(i % w, j + 1); const d = hash((i + 1) % w, j + 1); return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v; };
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    let n = 0; let amp = 0.55; let per = 6; for (let o = 0; o < 5; o++) { n += noise(px, py, per) * amp; amp *= 0.5; per *= 2; }
    const lat = Math.abs(py / H - 0.5) * 2; const a = Math.max(0, Math.min(1, (n - 0.5) * 3.2)) * (1 - 0.35 * lat * lat); const k = (py * W + px) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = a * 235;
  }
  x.putImageData(img, 0, 0); cloudTex = new THREE.CanvasTexture(c); cloudTex.wrapS = THREE.RepeatWrapping; cloudTex.colorSpace = THREE.SRGBColorSpace; return cloudTex;
}
function CloudShell({ radius }) {
  const ref = useRef(); useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.004; });
  return <mesh ref={ref} scale={radius * 1.007}><sphereGeometry args={[1, 96, 96]} /><meshStandardMaterial map={cloudTexture()} transparent depthWrite={false} roughness={1} metalness={0} /></mesh>;
}

export function Atmosphere({ radius, thickness = 0.04, color, opacity = 1 }) {
  const m = useMemo(() => atmosphereMat(color), [color]);
  m.uniforms.uStrength.value = 1.5 * opacity;
  return <mesh scale={radius * (1 + thickness)}><sphereGeometry args={[1, 96, 96]} /><primitive object={m} attach="material" /></mesh>;
}

/** The Blue Marble globe. Position/orientation come from the parent group. */
export function EarthGlobe({ radius = 1, segments = 128 }) {
  const map = useEarthTexture();
  return (
    <group>
      <mesh castShadow receiveShadow scale={radius}>
        <sphereGeometry args={[1, segments, segments]} />
        <meshStandardMaterial map={map} roughness={0.85} metalness={0} emissiveMap={map} emissive="#1a2a44" emissiveIntensity={0.18} />
      </mesh>
      <Atmosphere radius={radius} />
      <CloudShell radius={radius} />
    </group>
  );
}

/** Menu backdrop: a slowly turning Earth, an orbiting CubeSat and a field of stars. */
function SatOrbit({ data, radius }) {
  const g = useRef();
  useFrame(({ clock }) => { const t = clock.elapsedTime * 0.25; if (g.current) { g.current.position.set(Math.cos(t) * radius, Math.sin(t * 0.6) * radius * 0.25, Math.sin(t) * radius); g.current.rotation.y = -t; g.current.rotation.x = t * 0.5; } });
  const parts = useMemo(() => ['eps', 'obc', 'radio_sband', 'adcs_rw', 'batt_40'].map((id, i) => ({ instanceId: id, partId: id, mountId: ['U1A', 'U2A', 'U2B', 'U3A', 'U1B'][i] }))
    .concat([{ instanceId: 'sw', partId: 'solar_wings', mountId: '+X' }, { instanceId: 'ant', partId: 'ant_patch', mountId: 'TOP' }, { instanceId: 'cam', partId: 'cam_hd', mountId: 'BOTTOM' }]), []);
  return <group ref={g}><CubeSat3D parts={parts} data={data} scale={1.4} onSelect={() => {}} onHover={() => {}} /></group>;
}

export function SpaceBackdrop({ data, interactive = false }) {
  const earth = useRef(); const { camera, pointer } = useThree();
  useFrame((_, dt) => {
    if (earth.current) earth.current.rotation.y += dt * 0.035;
    // gentle parallax: the camera drifts a little toward the pointer
    const k = 1 - Math.exp(-2.2 * dt); camera.position.x += (pointer.x * 0.55 - camera.position.x) * k; camera.position.y += (pointer.y * 0.32 - camera.position.y) * k; camera.lookAt(0, 0, 0);
  });
  return (
    <>
      <color attach="background" args={['#02040a']} />
      <ambientLight intensity={0.12} />
      <directionalLight position={[8, 3, 6]} intensity={3.4} color="#fff3e0" />
      <directionalLight position={[-8, -2, -4]} intensity={0.35} color="#3a6bd8" />
      <Stars radius={90} depth={60} count={4500} factor={4.2} saturation={0} fade speed={0.6} />
      <group position={[3.4, -1.7, -3]} rotation={[0.35, 0, 0.25]} ref={earth}>
        <Suspense fallback={null}><EarthGlobe radius={4.4} /></Suspense>
      </group>
      {data && <Suspense fallback={null}><group position={[3.4, -1.7, -3]}><SatOrbit data={data} radius={6.6} /></group></Suspense>}
    </>
  );
}
