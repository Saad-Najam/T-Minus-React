import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';
import CubeSat3D from './CubeSat3D.jsx';
import Cables3D from './Cables3D.jsx';
import Effects from './Effects.jsx';
import { StudioLights } from './Studio.jsx';
import { Pedestal } from './Pedestal.jsx';
import { useQuality } from '../state/quality.js';

/** The same wiring, seen on the real satellite: a live 3D loom next to the schematic bench. */
export default function LoomView({ spacecraft, data }) {
  const q = useQuality();
  return (
    <div className="panel relative h-72 overflow-hidden xl:h-full" aria-label="3D view of the wiring loom">
      <Canvas camera={{ position: [2.4, 1.9, 3.2], fov: 40 }} dpr={q.dpr} shadows={q.shadows}>
        <color attach="background" args={['#060b18']} />
        <Suspense fallback={null}>
          <StudioLights intensity={0.9} />
          <Pedestal radius={1.2} />
          <group position={[0, 0.2, 0]} scale={0.75}><CubeSat3D parts={spacecraft.parts} data={data} scale={7} onSelect={() => {}} onHover={() => {}} /><group scale={7}><Cables3D spacecraft={spacecraft} data={data} /></group></group>
        </Suspense>
        <OrbitControls enablePan={false} target={[0, 1.1, 0]} minDistance={2} maxDistance={7} autoRotate autoRotateSpeed={1.1} maxPolarAngle={Math.PI / 2 - 0.05} />
        <Effects bloom={0.6} />
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 chip">3D loom</div>
    </div>
  );
}
