import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { H, MOUNT_TRANSFORM, W } from './CubeSat3D.jsx';

// The CubeSat's wiring loom in 3D: every cable of the wiring bench is drawn as a coloured tube between the real part positions. A new cable draws
// itself in (the "plug-in" animation) and power / data / RF / pyro cables carry travelling pulses. Same rules and cables as the 2D bench.
const portOffset = (def, portId) => {
  const i = Math.max(0, def.ports.findIndex((p) => p.id === portId)); const n = def.ports.length;
  return (i - (n - 1) / 2) * Math.min(0.011, 0.07 / Math.max(1, n));
};

function endpoint(part, def, portId) {
  const T = MOUNT_TRANSFORM[part.mountId]; if (!T) return null;
  const [x, y, z] = T.pos; const ox = portOffset(def, portId);
  switch (def.mount) {
    case 'slot': return new THREE.Vector3(ox, y + 0.004, 0.036);
    case 'face_long': return new THREE.Vector3(x + (Math.abs(z) > 0.01 ? ox : 0), y + (Math.abs(x) > 0.01 ? ox : 0.02), z * 0.96);
    case 'face_end': return new THREE.Vector3(ox * 0.6, y + (part.mountId === 'TOP' ? 0.012 : -0.012), 0.012);
    case 'inline': return new THREE.Vector3(x, y + 0.006, z);
    default: return new THREE.Vector3(x, y, z);
  }
}

function Cable({ curve, color, pulse, instant, selected }) {
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 48, 0.0017, 8, false), [curve]);
  const total = geo.index.count; const pulses = useRef([]); const tube = useRef(); const born = useRef(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime; if (born.current == null) born.current = instant ? t - 5 : t; const k = Math.min(1, (t - born.current) / 0.7); const e = 1 - (1 - k) ** 3;
    geo.setDrawRange(0, Math.floor(total * e / 6) * 6);
    pulses.current.forEach((m, i) => {
      if (!m) return; m.visible = k >= 1 && pulse;
      const u = (t * 0.45 + i / 3) % 1; m.position.copy(curve.getPointAt(u)); m.scale.setScalar(0.8 + 0.5 * Math.sin(u * Math.PI));
    });
  });
  return (
    <group>
      <mesh ref={tube} geometry={geo} castShadow>
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.2} emissive={selected ? color : '#000000'} emissiveIntensity={selected ? 0.8 : 0} />
      </mesh>
      {[0, 1, 2].map((i) => <mesh key={i} ref={(m) => { pulses.current[i] = m; }} visible={false}><sphereGeometry args={[0.0034, 10, 10]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>)}
      {[0, 1].map((e) => <mesh key={`p${e}`} position={curve.getPointAt(e)}><sphereGeometry args={[0.0032, 10, 10]} /><meshStandardMaterial color="#d4a640" metalness={1} roughness={0.25} /></mesh>)}
    </group>
  );
}

export default function Cables3D({ spacecraft, data, selected }) {
  const rules = data.getRules(); const initialKeys = useRef(null);
  const items = useMemo(() => {
    const out = [];
    spacecraft.cables.forEach((c, idx) => {
      const [ia, pa] = c.fromPort.split('/'); const [ib, pb] = c.toPort.split('/');
      const A = spacecraft.parts.find((p) => p.instanceId === ia); const B = spacecraft.parts.find((p) => p.instanceId === ib); if (!A || !B) return;
      const dA = data.getPart(A.partId); const dB = data.getPart(B.partId); const a = endpoint(A, dA, pa); const b = endpoint(B, dB, pb); if (!a || !b) return;
      const portA = dA.getPort(pa); const portB = dB.getPort(pb);
      const type = c.cableType ?? rules.cableFor(portA?.type, portB?.type)?.id ?? 'data';
      const ct = rules.getCableType(type); const lane = 0.062 + (idx % 6) * 0.0045; const mid = (a.y + b.y) / 2;
      const curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3(a.x * 0.5 + lane * 0.5, a.y, Math.max(a.z, 0.03) + 0.012), new THREE.Vector3(lane, mid, 0.034 + (idx % 3) * 0.004), new THREE.Vector3(b.x * 0.5 + lane * 0.5, b.y, Math.max(b.z, 0.03) + 0.012), b], false, 'catmullrom', 0.5);
      out.push({ key: `${c.fromPort}|${c.toPort}`, curve, color: c.reversed ? '#f87171' : ct?.color ?? '#ffffff', pulse: type !== 'rf' });
    });
    return out;
  }, [spacecraft.cables, spacecraft.parts, data, rules]);
  if (!initialKeys.current) initialKeys.current = new Set(items.map((i) => i.key)); // cables that exist when the view opens are already plugged in
  return <group>{items.map((i) => <Cable key={i.key} curve={i.curve} color={i.color} pulse={i.pulse} instant={initialKeys.current.has(i.key)} selected={selected === i.key} />)}</group>;
}

export { H, W };
