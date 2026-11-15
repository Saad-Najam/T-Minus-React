import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { BoltState } from '../engine/bolts.js';

export const boltColor = { Missing: '#0b1224', Inserted: '#aab4c4', UnderTorqued: '#fbbf24', Torqued: '#4ade80', OverTorqued: '#f87171' };

/** Position of bolt i of a joint on its flange (the fairing joints are half rings). */
export function boltPosition(jointId, i, count, R) {
  const half = jointId === 'j_fairing_left' ? [-Math.PI / 2 + 0.2, Math.PI / 2 - 0.2] : jointId === 'j_fairing_right' ? [Math.PI / 2 + 0.2, (3 * Math.PI) / 2 - 0.2] : null;
  const a = half ? half[0] + ((half[1] - half[0]) * i) / Math.max(1, count - 1) : (i / count) * Math.PI * 2;
  return [Math.cos(a) * R, 0, Math.sin(a) * R];
}

function Bolt({ pos, state, size, active, next, label, onClick, showLabel }) {
  const ref = useRef();
  useFrame(({ clock }) => { if (ref.current && next) ref.current.scale.setScalar(1 + 0.25 * Math.sin(clock.elapsedTime * 7)); else if (ref.current) ref.current.scale.setScalar(1); });
  const col = boltColor[state];
  const missing = state === BoltState.Missing;
  return (
    <group position={pos}>
      <group ref={ref}>
        <mesh onClick={(e) => { e.stopPropagation(); onClick?.(); }} onPointerOver={() => { if (active) document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }} castShadow>
          {missing ? <torusGeometry args={[size * 0.8, size * 0.22, 8, 20]} /> : <cylinderGeometry args={[size, size, size * 0.8, 6]} />}
          <meshStandardMaterial color={missing ? (active ? '#38d6ff' : '#26365e') : col} roughness={0.35} metalness={missing ? 0 : 0.85} emissive={next ? '#ff7a1a' : missing && active ? '#0b3a4a' : '#000000'} emissiveIntensity={next ? 1.6 : 0.8} />
        </mesh>
        {!missing && <mesh position={[0, size * 0.42, 0]}><cylinderGeometry args={[size * 0.55, size * 0.55, size * 0.06, 6]} /><meshStandardMaterial color="#0a0a0a" /></mesh>}
      </group>
      {showLabel && <Html center position={[0, size * 2.2, 0]} distanceFactor={5} style={{ pointerEvents: 'none' }}><span className="rounded bg-[#050a16]/85 px-1 font-mono text-[10px] font-bold" style={{ color: next ? '#ff7a1a' : '#e8eefc' }}>{label}</span></Html>}
    </group>
  );
}

/** All flange rings of the stack; the selected joint's bolts are big, numbered and clickable. */
export default function BoltRings({ joints, layout, getState, selectedJoint, onBoltClick, nextBolt, mounted }) {
  return (
    <group>
      {joints.map((j) => {
        if (!mounted(j)) return null;
        const upper = layout.find((p) => p.partId === j.upperPartId); const lower = layout.find((p) => p.partId === j.lowerPartId);
        if (!upper) return null;
        const D = Math.max(upper.D || 1.2, lower?.D || 1.2) || 1.2;
        const R = D / 2 + 0.035; // bolt heads sit on a visible flange band just outside the skin, so they can be seen and clicked
        const st = getState(j.id); const sel = selectedJoint === j.id;
        return (
          <group key={j.id} position={[0, upper.y + 0.01, 0]}>
            {Array.from({ length: j.boltCount }, (_, i) => (
              <Bolt key={i} pos={boltPosition(j.id, i, j.boltCount, R)} state={st.stateOf(i)} size={sel ? 0.065 : 0.035} active={sel}
                next={sel && nextBolt === i} label={i + 1} showLabel={sel} onClick={sel ? () => onBoltClick(j.id, i) : undefined} />
            ))}
            <mesh rotation-x={Math.PI / 2} castShadow><torusGeometry args={[R - 0.02, sel ? 0.03 : 0.018, 10, 72]} /><meshStandardMaterial color="#b9c1cc" metalness={0.9} roughness={0.3} /></mesh>
            {sel && <mesh rotation-x={Math.PI / 2}><torusGeometry args={[R + 0.05, 0.01, 8, 64]} /><meshBasicMaterial color="#38d6ff" transparent opacity={0.55} /></mesh>}
          </group>
        );
      })}
    </group>
  );
}
