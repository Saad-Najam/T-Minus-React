import { useMemo } from 'react';
import * as THREE from 'three';
import { mat, pbr } from './materials.js';

// A detailed procedural Saturn V (the original also used a procedural model; NASA's 3D model is not bundled). Origin of each part = its base centre.
const white = () => mat.saturnWhite(); const black = () => mat.saturnBlack(); const metal = () => pbr.Metal_Grey(); const dark = () => pbr.Engine_Dark();
const copper = () => mat.copper();

const Cyl = ({ r1, r2 = r1, h, y = 0, m, seg = 64, open = false, theta, len }) => (
  <mesh position={[0, y + h / 2, 0]} castShadow receiveShadow><cylinderGeometry args={[r2, r1, h, seg, 1, open, theta, len]} /><primitive object={m} attach="material" /></mesh>
);

/** F-1 style bell nozzle: a lathe profile, with a bright throat ring. */
function Nozzle({ x = 0, z = 0, r = 1.7, h = 5.2, y = 0 }) {
  const geo = useMemo(() => { const pts = []; for (let i = 0; i <= 14; i++) { const u = i / 14; pts.push(new THREE.Vector2(0.38 * r + (r - 0.38 * r) * Math.pow(u, 1.9), h * (1 - u))); } return new THREE.LatheGeometry(pts, 36); }, [r, h]);
  return (
    <group position={[x, y, z]}>
      <mesh geometry={geo} castShadow><primitive object={dark()} attach="material" /><meshStandardMaterial color="#26221f" metalness={0.9} roughness={0.35} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, h, 0]}><cylinderGeometry args={[0.45 * r, 0.45 * r, 0.5, 24]} /><primitive object={metal()} attach="material" /></mesh>
    </group>
  );
}

function Fin() {
  const geo = useMemo(() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(4.6, -0.6); s.lineTo(4.6, 5.6); s.lineTo(0, 11.5); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false }); }, []);
  return <mesh geometry={geo} position={[0, 0, -0.15]} castShadow><primitive object={black()} attach="material" /></mesh>;
}

function SIC({ L, r }) {
  return (
    <group>
      <Cyl r1={r} h={L} m={white()} y={3.4} />
      <Cyl r1={r * 0.98} h={3.4} m={black()} y={0} />
      {/* painted black quadrants of the lower stage */}
      {[0, 1, 2, 3].map((i) => <Cyl key={i} r1={r + 0.025} h={L * 0.52} y={3.4} m={black()} seg={20} open theta={(i * Math.PI) / 2 + Math.PI / 4 - 0.35} len={0.7} />)}
      {[0.45, 0.62, 0.8].map((k, i) => <Cyl key={i} r1={r + 0.03} h={0.45} y={L * k} m={black()} />)}
      {/* fins and fairings */}
      {[0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 2 + Math.PI / 4; return (
        <group key={i} rotation-y={-a}><group position={[r - 0.05, 2.4, 0]}><Fin /></group>
          <mesh position={[r + 0.35, 4, 0]} castShadow><coneGeometry args={[1.5, 6.2, 18]} /><primitive object={white()} attach="material" /></mesh></group>
      ); })}
      {/* five F-1 engines */}
      {[[0, 0], [2.1, 2.1], [-2.1, 2.1], [2.1, -2.1], [-2.1, -2.1]].map(([x, z], i) => <Nozzle key={i} x={x} z={z} y={-0.2} r={i === 0 ? 1.55 : 1.7} h={5.4} />)}
      <Cyl r1={r * 0.62} h={0.5} y={2.8} m={metal()} seg={48} />
    </group>
  );
}

function SII({ L, r }) {
  return (
    <group>
      <Cyl r1={r} h={L} m={white()} />
      <Cyl r1={r + 0.03} h={0.5} y={0.2} m={black()} /><Cyl r1={r + 0.03} h={0.5} y={L - 0.7} m={black()} />
      {/* interstage with vents */}
      <Cyl r1={r} h={3.4} y={-3.4} m={black()} />
      {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[Math.cos((i / 12) * Math.PI * 2) * (r + 0.09), -1.7, Math.sin((i / 12) * Math.PI * 2) * (r + 0.09)]} rotation-y={-(i / 12) * Math.PI * 2}><boxGeometry args={[0.18, 2.0, 1.1]} /><primitive object={white()} attach="material" /></mesh>)}
    </group>
  );
}

function SIVB({ L, r }) {
  return (
    <group>
      <Cyl r1={r * 1.52} r2={r} h={3.6} y={-3.6} m={white()} />
      <Cyl r1={r} h={L} m={white()} /><Cyl r1={r + 0.03} h={0.4} y={0.6} m={black()} /><Cyl r1={r + 0.03} h={0.4} y={L - 0.8} m={black()} />
      <Nozzle r={1.0} h={3.0} y={-3.4} />
    </group>
  );
}

function SpacecraftStack({ r }) {
  const sm = 1.95;
  return (
    <group>
      <Cyl r1={r} h={8.2} m={white()} />                                        {/* spacecraft-lunar-module adapter */}
      <Cyl r1={r} r2={sm} h={3.6} y={8.2} m={white()} />
      <Cyl r1={sm} h={6.0} y={11.8} m={copper()} seg={48} /><Cyl r1={sm + 0.02} h={0.3} y={11.8} m={black()} />   {/* service module */}
      <Cyl r1={sm} r2={0.55} h={3.5} y={17.8} m={white()} seg={48} />              {/* command module */}
      {/* launch escape system */}
      {[0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 2 + Math.PI / 4; return <mesh key={i} position={[Math.cos(a) * 0.55, 22.4, Math.sin(a) * 0.55]} castShadow><cylinderGeometry args={[0.06, 0.06, 5.4, 6]} /><primitive object={black()} attach="material" /></mesh>; })}
      <Cyl r1={0.62} h={5.0} y={24.9} m={white()} seg={32} />
      <mesh position={[0, 31.2, 0]} castShadow><coneGeometry args={[0.62, 2.8, 32]} /><primitive object={white()} attach="material" /></mesh>
      <mesh position={[0, 32.9, 0]}><cylinderGeometry args={[0.04, 0.04, 1.6, 6]} /><primitive object={metal()} attach="material" /></mesh>
      {[0, 1].map((i) => <mesh key={i} position={[0, 29.6, 0]} rotation-y={i * Math.PI / 2}><boxGeometry args={[2.6, 0.06, 0.5]} /><primitive object={black()} attach="material" /></mesh>)}
    </group>
  );
}

export default function SaturnPart({ partId, D, L }) {
  const r = D / 2;
  switch (partId) {
    case 'saturnv_sic': return <SIC L={L} r={r} />;
    case 'saturnv_sii': return <SII L={L} r={r} />;
    case 'saturnv_sivb': return <SIVB L={L} r={r} />;
    case 'saturnv_iu': return <group><Cyl r1={r} h={L} m={black()} />{[0.2, 0.5, 0.8].map((k) => <Cyl key={k} r1={r + 0.01} h={0.06} y={L * k} m={white()} />)}</group>;
    case 'saturnv_spacecraft': return <SpacecraftStack r={r} />;
    default: return null;
  }
}
