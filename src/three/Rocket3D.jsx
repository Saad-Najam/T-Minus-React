import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { applyPbr, mat } from './materials.js';
import SaturnPart from './SaturnV.jsx';

const base = import.meta.env.BASE_URL;
const PF_MODELS = ['pf_stage1', 'pf_interstage', 'pf_stage2', 'pf_avionics_ring', 'pf_payload_adapter', 'pf_fairing_left', 'pf_fairing_right'];
PF_MODELS.forEach((id) => useGLTF.preload(`${base}models/${id}.glb`));

/** y (metres, from the bottom of the stack) of the base of every part, from the part lengths in parts.json. */
export function rocketLayout(data, rocketId) {
  const rocket = data.getRocket(rocketId);
  const out = [];
  if (!rocket) return out;
  if (rocketId === 'pathfinder') {
    const L = (id) => data.getPart(id).lengthM;
    let y = 0.3; // stand clearance for the engine bells
    const stack = ['pf_stage1', 'pf_interstage', 'pf_stage2', 'pf_avionics_ring', 'pf_payload_adapter'];
    for (const id of stack) { out.push({ partId: id, y, L: L(id), D: data.getPart(id).diameterM, kind: 'glb' }); y += L(id); }
    out.push({ partId: 'pf_fairing_left', y, L: L('pf_fairing_left'), D: 1.2, kind: 'glb' }, { partId: 'pf_fairing_right', y, L: L('pf_fairing_right'), D: 1.2, kind: 'glb' });
    out.payloadY = y; out.height = y + 2.5;
    return out;
  }
  let y = 0.4;
  for (const id of rocket.partIds) {
    const p = data.getPart(id);
    out.push({ partId: id, y, L: p.lengthM, D: p.diameterM, kind: 'procedural' });
    y += p.lengthM;
  }
  out.height = y;
  return out;
}

function GlbPart({ partId, xray }) {
  const { scene } = useGLTF(`${base}models/${partId}.glb`);
  const obj = useMemo(() => { const c = scene.clone(true); applyPbr(c, { xray }); return c; }, [scene, xray]);
  return <primitive object={obj} />;
}

const Cyl = ({ r1, r2 = r1, h, y = 0, m, seg = 40 }) => <mesh position={[0, y + h / 2, 0]} castShadow receiveShadow><cylinderGeometry args={[r2, r1, h, seg]} /><primitive object={m} attach="material" /></mesh>;

/** Procedural stand-ins (as in the Unity game): Saturn V stages and the Rehbar-I Nike/Cajun solids. */
function Procedural({ partId, D, L }) {
  const r = D / 2; const w = mat.saturnWhite(); const b = mat.saturnBlack();
  if (partId.startsWith('saturnv_')) return <SaturnPart partId={partId} D={D} L={L} />;
  switch (partId) {
    case 'saturnv_sic': return (
      <group>
        <Cyl r1={r} h={L} m={w} seg={64} />
        {[0.12, 0.34, 0.56, 0.78].map((k, i) => <Cyl key={i} r1={r + 0.02} h={L * 0.09} y={L * k} m={b} seg={64} />)}
        {[0, 1, 2, 3].map((i) => <mesh key={i} position={[Math.cos((i * Math.PI) / 2 + Math.PI / 4) * (r + 1), 4, Math.sin((i * Math.PI) / 2 + Math.PI / 4) * (r + 1)]} rotation-y={-((i * Math.PI) / 2 + Math.PI / 4)} castShadow><boxGeometry args={[4, 8, 0.25]} /><primitive object={b} attach="material" /></mesh>)}
        {[[0, 0], [1.9, 1.9], [-1.9, 1.9], [1.9, -1.9], [-1.9, -1.9]].map(([x, z], i) => <mesh key={i} position={[x, -0.2, z]} castShadow><cylinderGeometry args={[0.55, 1.5, 2.2, 24]} /><primitive object={mat.pbrEngine ?? b} attach="material" /></mesh>)}
      </group>
    );
    case 'saturnv_sii': return (<group><Cyl r1={r} h={L} m={w} seg={64} />{[0.08, 0.9].map((k, i) => <Cyl key={i} r1={r + 0.02} h={L * 0.07} y={L * k} m={b} seg={64} />)}</group>);
    case 'saturnv_sivb': return (<group><Cyl r1={r} h={L} m={w} seg={48} /><Cyl r1={r + 0.02} h={L * 0.08} y={L * 0.06} m={b} seg={48} /><Cyl r1={r * 0.4} r2={r * 0.3} h={1.2} y={-0.8} m={b} /></group>);
    case 'saturnv_iu': return <Cyl r1={r} h={L} m={b} seg={48} />;
    case 'saturnv_spacecraft': return (
      <group>
        <Cyl r1={r} h={9} m={w} seg={48} />
        <Cyl r1={r} r2={r * 0.45} h={3.5} y={9} m={w} seg={48} />
        <mesh position={[0, 15, 0]}><cylinderGeometry args={[0.05, 0.05, 9.5, 8]} /><primitive object={b} attach="material" /></mesh>
        <mesh position={[0, 21.2, 0]}><coneGeometry args={[r * 0.45, 3.6, 32]} /><primitive object={w} attach="material" /></mesh>
      </group>
    );
    case 'rehbar_nike': return (
      <group>
        <Cyl r1={r} h={L} m={mat.saturnWhite()} seg={32} />
        {[0, 1, 2, 3].map((i) => <mesh key={i} position={[Math.cos((i * Math.PI) / 2) * (r + 0.25), 0.55, Math.sin((i * Math.PI) / 2) * (r + 0.25)]} rotation-y={-(i * Math.PI) / 2}><boxGeometry args={[0.55, 1.1, 0.03]} /><primitive object={b} attach="material" /></mesh>)}
        <mesh position={[0, -0.12, 0]}><cylinderGeometry args={[0.13, 0.2, 0.3, 20]} /><primitive object={b} attach="material" /></mesh>
      </group>
    );
    case 'rehbar_cajun': return (
      <group>
        <Cyl r1={r} h={L} m={mat.saturnWhite()} seg={32} />
        <mesh position={[0, L + 0.5, 0]} castShadow><coneGeometry args={[r, 1.0, 24]} /><primitive object={b} attach="material" /></mesh>
        {[0, 1, 2].map((i) => <mesh key={i} position={[Math.cos((i * Math.PI * 2) / 3) * (r + 0.1), 0.3, Math.sin((i * Math.PI * 2) / 3) * (r + 0.1)]} rotation-y={-(i * Math.PI * 2) / 3}><boxGeometry args={[0.3, 0.6, 0.02]} /><primitive object={b} attach="material" /></mesh>)}
      </group>
    );
    default: return <Cyl r1={r} h={L} m={w} />;
  }
}

/**
 * The rocket as a set of part groups. `present(partId)` says whether a part is drawn solid; `ghost(partId)` draws a cyan hologram.
 * `register(partId, group)` lets the flight scene move released stages.
 */
export default function RocketView({ layout, present = () => true, ghost = () => false, xray = false, register }) {
  return (
    <group>
      {layout.map((p) => {
        const solid = present(p.partId); const gh = !solid && ghost(p.partId);
        if (!solid && !gh) return null;
        return (
          <group key={p.partId} position={[0, p.y, 0]} ref={(g) => register?.(p.partId, g)} userData={{ partId: p.partId }}>
            {gh ? <GhostBox D={p.D} L={p.L} /> : p.kind === 'glb' ? <GlbPart partId={p.partId} xray={xray} /> : <Procedural partId={p.partId} D={p.D} L={p.L} />}
          </group>
        );
      })}
    </group>
  );
}

function GhostBox({ D, L }) {
  return (
    <group position={[0, L / 2, 0]}>
      <mesh><cylinderGeometry args={[D / 2, D / 2, L, 32]} /><meshBasicMaterial color="#38d6ff" transparent opacity={0.16} depthWrite={false} /></mesh>
      <mesh><cylinderGeometry args={[D / 2 + 0.01, D / 2 + 0.01, L, 32, 1, true]} /><meshBasicMaterial color="#38d6ff" wireframe transparent opacity={0.45} /></mesh>
    </group>
  );
}

export { THREE };
