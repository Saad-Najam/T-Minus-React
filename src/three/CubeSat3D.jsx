import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useRef, useState } from 'react';
import { mat } from './materials.js';

// Port of CubeSatModel's frame + placeholder part shapes. Units are metres; the whole group is scaled up to be viewable.
export const W = 0.1; export const H = 0.34;
const h = W / 2 - 0.004;
const SLOT_POS = {};
['U1A', 'U1B', 'U2A', 'U2B', 'U3A', 'U3B'].forEach((id, i) => { const u = Math.floor(i / 2); const c = (H / 6) * (2 * u + 1); SLOT_POS[id] = [0, c + (i % 2 === 0 ? -0.026 : 0.026), 0]; });
export const MOUNT_TRANSFORM = {
  ...Object.fromEntries(Object.entries(SLOT_POS).map(([k, p]) => [k, { pos: p, rot: [0, 0, 0] }])),
  '+X': { pos: [W / 2 + 0.002, H / 2, 0], rot: [0, Math.PI / 2, 0] }, '-X': { pos: [-W / 2 - 0.002, H / 2, 0], rot: [0, -Math.PI / 2, 0] },
  '+Z': { pos: [0, H / 2, W / 2 + 0.002], rot: [0, 0, 0] }, '-Z': { pos: [0, H / 2, -W / 2 - 0.002], rot: [0, Math.PI, 0] },
  TOP: { pos: [0, H + 0.002, 0], rot: [0, 0, 0] }, BOTTOM: { pos: [0, -0.002, 0], rot: [Math.PI, 0, 0] },
  RAIL: { pos: [h, -0.006, -h], rot: [0, 0, 0] }, PIN: { pos: [-h - 0.006, H * 0.82, -h - 0.006], rot: [0, 0, 0] },
};

function Frame() {
  const rails = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  return (
    <group>
      {rails.map(([x, z], i) => <mesh key={i} position={[x * h, H / 2, z * h]} castShadow><boxGeometry args={[0.0085, H, 0.0085]} /><primitive object={mat.frame()} attach="material" /></mesh>)}
      {[0.004, H - 0.004, H / 3, (2 * H) / 3].map((y) => (
        <group key={y} position={[0, y, 0]}>
          <mesh position={[0, 0, -h]}><boxGeometry args={[W, 0.006, 0.006]} /><primitive object={mat.frame()} attach="material" /></mesh>
          <mesh position={[0, 0, h]}><boxGeometry args={[W, 0.006, 0.006]} /><primitive object={mat.frame()} attach="material" /></mesh>
          <mesh position={[-h, 0, 0]}><boxGeometry args={[0.006, 0.006, W]} /><primitive object={mat.frame()} attach="material" /></mesh>
          <mesh position={[h, 0, 0]}><boxGeometry args={[0.006, 0.006, W]} /><primitive object={mat.frame()} attach="material" /></mesh>
        </group>
      ))}
    </group>
  );
}

const Box = ({ s, p = [0, 0, 0], m, r }) => <mesh position={p} rotation={r} castShadow receiveShadow><boxGeometry args={s} /><primitive object={m} attach="material" /></mesh>;

/** A circuit board with chips; `tint` distinguishes the board kinds. */
function Board({ children, tint = '#15703a' }) {
  return (
    <group>
      <mesh castShadow receiveShadow><boxGeometry args={[0.088, 0.004, 0.088]} /><meshStandardMaterial color={tint} roughness={0.45} metalness={0.35} /></mesh>
      <Box s={[0.02, 0.005, 0.02]} p={[-0.02, 0.0045, 0.015]} m={mat.chip()} /><Box s={[0.012, 0.004, 0.026]} p={[0.022, 0.004, -0.012]} m={mat.chip()} />
      <Box s={[0.03, 0.002, 0.004]} p={[0, 0.003, -0.034]} m={mat.gold()} />
      {children}
    </group>
  );
}

function SolarPlate({ w = 0.094, l = 0.31, deployed = false }) {
  const cells = [];
  const nx = 3; const ny = deployed ? 9 : 8;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) cells.push([(-w / 2) + (w / nx) * (i + 0.5), (-l / 2) + (l / ny) * (j + 0.5)]);
  return (
    <group>
      <mesh castShadow><boxGeometry args={[w, l, 0.003]} /><meshStandardMaterial color="#0a1a44" roughness={0.3} metalness={0.7} /></mesh>
      {cells.map(([x, y], i) => <mesh key={i} position={[x, y, 0.002]}><boxGeometry args={[w / nx - 0.004, l / ny - 0.004, 0.001]} /><primitive object={mat.solarGrid()} attach="material" /></mesh>)}
    </group>
  );
}

function Shape({ def }) {
  const c = def.category;
  if (c === 'eps') return <Board tint="#1a5b8f"><Box s={[0.03, 0.01, 0.014]} p={[0.012, 0.007, 0.03]} m={mat.copper()} /></Board>;
  if (c === 'obc') return <Board tint="#2a6b3a"><Box s={[0.032, 0.006, 0.032]} p={[0, 0.005, 0]} m={mat.chip()} /></Board>;
  if (c === 'radio') return <Board tint={def.id === 'radio_sband' ? '#7a2a8f' : '#8f5a1a'}><Box s={[0.04, 0.012, 0.025]} p={[0, 0.008, 0.02]} m={mat.frame()} /></Board>;
  if (c === 'adcs') return (
    <Board tint="#8f2a3a">
      {def.id === 'adcs_rw' ? <mesh position={[0, 0.012, 0]} rotation-x={Math.PI / 2} castShadow><torusGeometry args={[0.022, 0.007, 12, 28]} /><primitive object={mat.gold()} attach="material" /></mesh>
        : <Box s={[0.05, 0.006, 0.05]} p={[0, 0.005, 0]} m={mat.copper()} />}
    </Board>
  );
  if (c === 'battery') return <group><Box s={[def.id === 'batt_40' ? 0.086 : 0.07, 0.022, 0.07]} p={[0, 0.003, 0]} m={mat.battery()} /><Box s={[0.02, 0.004, 0.02]} p={[0, 0.016, 0]} m={mat.gold()} /></group>;
  if (c === 'solar') {
    if (def.id === 'solar_wings') return (
      <group>
        <group rotation={[Math.PI / 2, 0, 0]}><SolarPlate w={0.094} l={0.3} /></group>
        <group position={[0.099, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><SolarPlate w={0.094} l={0.3} deployed /></group>
        <group position={[-0.099, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><SolarPlate w={0.094} l={0.3} deployed /></group>
      </group>
    );
    return <group position={[0, 0, 0.0015]}><SolarPlate /></group>;
  }
  if (c === 'antenna') {
    if (def.id === 'ant_uhf') return <group><mesh position={[0, 0.07, 0]} castShadow><cylinderGeometry args={[0.0012, 0.0012, 0.14, 8]} /><primitive object={mat.frame()} attach="material" /></mesh><Box s={[0.012, 0.004, 0.012]} p={[0, 0.002, 0]} m={mat.gold()} /></group>;
    return <group><Box s={[0.07, 0.006, 0.07]} p={[0, 0.003, 0]} m={mat.gold()} /><Box s={[0.05, 0.003, 0.05]} p={[0, 0.007, 0]} m={mat.chip()} /></group>;
  }
  if (c === 'camera') {
    const hd = def.id === 'cam_hd'; const r = hd ? 0.032 : 0.02; const len = hd ? 0.07 : 0.035;
    return (
      <group>
        <mesh position={[0, len / 2, 0]} castShadow><cylinderGeometry args={[r, r * 1.08, len, 32]} /><primitive object={mat.frame()} attach="material" /></mesh>
        <mesh position={[0, len + 0.001, 0]}><cylinderGeometry args={[r * 0.82, r * 0.82, 0.004, 32]} /><primitive object={mat.lens()} attach="material" /></mesh>
        <mesh position={[0, len + 0.0035, 0]}><torusGeometry args={[r * 0.84, 0.0022, 8, 32]} /><primitive object={mat.gold()} attach="material" /></mesh>
        <Box s={[0.07, 0.008, 0.07]} p={[0, 0.004, 0]} m={mat.chip()} />
      </group>
    );
  }
  if (c === 'switch') return <group><Box s={[0.016, 0.01, 0.016]} p={[0, 0, 0]} m={mat.chip()} /><Box s={[0.006, 0.006, 0.01]} p={[0, 0.008, 0]} m={mat.gold()} /></group>;
  if (c === 'pin') return (
    <group>
      <mesh rotation-z={Math.PI / 2} castShadow><cylinderGeometry args={[0.0025, 0.0025, 0.03, 10]} /><primitive object={mat.red()} attach="material" /></mesh>
      <mesh position={[-0.02, -0.02, 0]} rotation-y={0.2}><planeGeometry args={[0.03, 0.05]} /><meshStandardMaterial color="#e32b1f" side={2} /></mesh>
    </group>
  );
  return null;
}

function Installed({ placed, def, selected, hovered, onSelect, onHover, scaleBy }) {
  const g = useRef(); const t = useRef(0);
  const T = MOUNT_TRANSFORM[placed.mountId];
  useFrame((_, dt) => {
    if (!g.current) return;
    t.current = Math.min(1, t.current + dt / 0.5);
    const k = 1 - (1 - t.current) ** 3; // ease-out slide-in
    const slot = def.mount === 'slot';
    g.current.position.set(0, slot ? (1 - k) * 0.25 : 0, slot ? 0 : (1 - k) * 0.12);
    const c1 = 1.70158; const back = 1 + (c1 + 1) * (t.current - 1) ** 3 + c1 * (t.current - 1) ** 2; // easeOutBack: a little overshoot when it seats
    g.current.scale.setScalar(0.7 + 0.3 * back);
  });
  if (!T) return null;
  const glow = selected ? '#ff7a1a' : hovered ? '#38d6ff' : null;
  return (
    <group position={T.pos} rotation={T.rot}>
      <group ref={g} onClick={(e) => { e.stopPropagation(); onSelect(placed.instanceId); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(placed.instanceId); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = ''; }}>
        <Shape def={def} />
        {glow && <mesh><boxGeometry args={[0.1, 0.03, 0.1]} /><meshBasicMaterial color={glow} transparent opacity={0.18} depthWrite={false} wireframe /></mesh>}
        {(selected || hovered) && <Html center distanceFactor={6} position={[0, 0.03, 0]} style={{ pointerEvents: 'none' }}><span className="chip whitespace-nowrap border-accent/50 bg-[#0a1020]/90 text-ink" style={{ fontSize: 10 * scaleBy }}>{def.name}</span></Html>}
      </group>
    </group>
  );
}

/** The 3U frame with every installed part. `scale` makes the 34 cm satellite fill the view. */
export default function CubeSat3D({ parts, data, selected, hovered, onSelect, onHover, scale = 7, freeMounts = [], labelMounts = false }) {
  const [hm, setHm] = useState(null);
  return (
    <group scale={scale}>
      <Frame />
      {parts.map((p) => { const def = data.getPart(p.partId); return def ? <Installed key={p.instanceId} placed={p} def={def} selected={selected === p.instanceId} hovered={hovered === p.instanceId} onSelect={onSelect} onHover={onHover} scaleBy={1} /> : null; })}
      {freeMounts.map((m) => {
        const T = MOUNT_TRANSFORM[m]; if (!T) return null;
        return (
          <group key={m} position={T.pos} rotation={T.rot}>
            <mesh onPointerOver={(e) => { e.stopPropagation(); setHm(m); }} onPointerOut={() => setHm(null)}>
              <sphereGeometry args={[0.0065, 14, 14]} /><meshBasicMaterial color={hm === m ? '#ff7a1a' : '#38d6ff'} transparent opacity={hm === m ? 0.95 : 0.55} depthWrite={false} />
            </mesh>
            {(labelMounts || hm === m) && <Html center distanceFactor={7} position={[0, 0.014, 0]} style={{ pointerEvents: 'none' }}><span className="rounded bg-[#050a16]/85 px-1 py-0.5 font-mono text-[9px] text-cyanx">{m}</span></Html>}
          </group>
        );
      })}
    </group>
  );
}
