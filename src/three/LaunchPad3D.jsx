import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { mat } from './materials.js';

/** Launch stand, flame trench and service tower (procedural, real scale). */
export default function LaunchPad3D({ radius = 22, tower = true, towerHeight = 24, towerX = -4.2, rocketRadius = 0.9, launchedRef }) {
  const armA = useRef(); const armB = useRef(); const open = useRef(0);
  useFrame((_, dt) => { open.current = Math.min(1, Math.max(0, open.current + (launchedRef?.current ? dt / 1.6 : 0))); const e = open.current * open.current * (3 - 2 * open.current); if (armA.current) armA.current.rotation.y = e * 1.35; if (armB.current) armB.current.rotation.y = e * -1.35; });
  const beams = [];
  const legs = [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]];
  for (let y = 0; y < towerHeight; y += 3) {
    beams.push(<mesh key={`h${y}`} position={[0, y + 1.5, 0]} castShadow><boxGeometry args={[1.9, 0.12, 1.9]} /><primitive object={mat.frame()} attach="material" /></mesh>);
    legs.forEach(([x, z], i) => beams.push(
      <mesh key={`d${y}${i}`} position={[x * 0.5, y + 1.5, 0]} rotation-z={(i % 2 ? 1 : -1) * 0.5}><boxGeometry args={[0.07, 3.4, 0.07]} /><primitive object={mat.frame()} attach="material" /></mesh>,
    ));
  }
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow><circleGeometry args={[radius, 96]} /><primitive object={mat.concrete()} attach="material" /></mesh>
      <mesh position={[0, 0.12, 0]} receiveShadow castShadow><cylinderGeometry args={[rocketRadius * 2.3, rocketRadius * 2.6, 0.3, 48]} /><primitive object={mat.concrete()} attach="material" /></mesh>
      {[0, 1, 2, 3].map((i) => <mesh key={i} position={[Math.cos((i * Math.PI) / 2 + Math.PI / 4) * rocketRadius * 0.95, 0.38, Math.sin((i * Math.PI) / 2 + Math.PI / 4) * rocketRadius * 0.95]} castShadow><boxGeometry args={[0.28, 0.35, 0.28]} /><primitive object={mat.red()} attach="material" /></mesh>)}
      {tower && (
        <group position={[towerX - rocketRadius, 0, 0]}>
          {legs.map(([x, z], i) => <mesh key={i} position={[x, towerHeight / 2, z]} castShadow><boxGeometry args={[0.14, towerHeight, 0.14]} /><primitive object={mat.frame()} attach="material" /></mesh>)}
          {beams}
          <mesh position={[0, towerHeight + 0.3, 0]}><boxGeometry args={[2.2, 0.5, 2.2]} /><primitive object={mat.saturnBlack()} attach="material" /></mesh>
          {[[armA, 9, 0.9], [armB, Math.max(5, towerHeight * 0.55), -0.9]].map(([ref, y, z], i) => (
            <group key={i} ref={ref} position={[0.95, y, 0]}><mesh position={[rocketRadius * 0.5 + 0.55, 0, 0]} castShadow><boxGeometry args={[rocketRadius + 1.2, 0.16, 0.7]} /><primitive object={mat.frame()} attach="material" /></mesh>
              <mesh position={[rocketRadius + 1.1, 0.12, 0]}><boxGeometry args={[0.25, 0.25, 0.25]} /><meshStandardMaterial color="#e32b1f" emissive="#500" /></mesh></group>
          ))}
        </group>
      )}
      <pointLight position={[-3, 6, 3]} intensity={0.6} color="#ffd6a5" distance={30} />
    </group>
  );
}
