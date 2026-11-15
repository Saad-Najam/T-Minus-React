import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

/** A display pedestal with a pulsing light ring: gives the CubeSat and the rocket a stage to stand on. */
export function Pedestal({ radius = 1.6, color = '#38d6ff' }) {
  const ring = useRef(); const ring2 = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) ring.current.material.emissiveIntensity = 1.4 + 0.6 * Math.sin(t * 1.6);
    if (ring2.current) { const k = (t * 0.35) % 1; ring2.current.scale.setScalar(0.6 + k * 0.7); ring2.current.material.opacity = 0.45 * (1 - k); }
  });
  return (
    <group>
      <mesh position={[0, 0.06, 0]} receiveShadow castShadow><cylinderGeometry args={[radius, radius * 1.06, 0.12, 96]} /><meshStandardMaterial color="#0d1428" metalness={0.85} roughness={0.28} /></mesh>
      <mesh ref={ring} position={[0, 0.125, 0]} rotation-x={-Math.PI / 2}><torusGeometry args={[radius * 0.96, 0.018, 12, 128]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} toneMapped={false} /></mesh>
      <mesh ref={ring2} position={[0, 0.13, 0]} rotation-x={-Math.PI / 2}><ringGeometry args={[radius * 0.9, radius * 0.94, 96]} /><meshBasicMaterial color={color} transparent opacity={0.4} toneMapped={false} depthWrite={false} /></mesh>
      <mesh position={[0, 0.121, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[radius * 0.94, 96]} /><meshStandardMaterial color="#0a1226" metalness={0.9} roughness={0.18} envMapIntensity={1.4} /></mesh>
    </group>
  );
}
