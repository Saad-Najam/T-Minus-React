import { ContactShadows, Environment, Lightformer } from '@react-three/drei';

/** Studio lighting with a procedural environment (no network HDRs): key, rim and fill lightformers give metal something to reflect. */
export function StudioLights({ intensity = 1, warm = true }) {
  return (
    <>
      <ambientLight intensity={0.25 * intensity} />
      <directionalLight position={[6, 10, 5]} intensity={2.4 * intensity} color={warm ? '#fff1de' : '#ffffff'} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5} shadow-camera-far={60} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-bias={-0.0004} />
      <directionalLight position={[-7, 4, -6]} intensity={1.1 * intensity} color="#6ab8ff" />
      <pointLight position={[0, 3, 6]} intensity={0.6 * intensity} color="#ff9a52" distance={30} />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#05080f']} />
        <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 6, 4]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={2} color="#5fb4ff" position={[-6, 2, -3]} rotation-y={Math.PI / 2} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ffb070" position={[6, 1, -2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" intensity={1.4} color="#ffffff" position={[0, -2, 6]} scale={6} />
      </Environment>
    </>
  );
}

export function StudioFloor({ y = 0, size = 40, color = '#0a1124' }) {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, y - 0.002, 0]} receiveShadow>
        <circleGeometry args={[size, 96]} />
        <meshStandardMaterial color={color} roughness={0.9} metalness={0.2} />
      </mesh>
      <gridHelper args={[size * 1.2, 60, '#1b2f58', '#101c38']} position={[0, y, 0]} />
      <ContactShadows position={[0, y + 0.003, 0]} opacity={0.6} scale={size} blur={2.4} far={Math.min(size, 30)} resolution={1024} />
    </>
  );
}
