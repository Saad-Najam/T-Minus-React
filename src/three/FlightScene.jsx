import { Environment, Lightformer, OrbitControls, Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import RocketView, { rocketLayout } from './Rocket3D.jsx';
import { Atmosphere, EarthGlobe } from './Earth3D.jsx';
import LaunchPad3D from './LaunchPad3D.jsx';
import CubeSat3D from './CubeSat3D.jsx';
import { mat } from './materials.js';
import { C, altitude, mag } from '../engine/flight/physics.js';
import { Clouds, Hills, PadSmoke, SunGlow, Trail, useRumble } from './FlightFX.jsx';
import Effects from './Effects.jsx';
import { useQuality } from '../state/quality.js';

const RE = C.EarthRadiusM;
const RS = 6371; // globe radius in scene units (1/1000 scale)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SKY = [new THREE.Color('#8ec1f2'), new THREE.Color('#2b5fb0'), new THREE.Color('#0b1d44'), new THREE.Color('#02040a')];

function skyColor(alt, out) {
  // 0 km bright blue → 12 km deep blue → 40 km navy → 80 km black
  if (alt < 12000) return out.copy(SKY[0]).lerp(SKY[1], alt / 12000);
  if (alt < 40000) return out.copy(SKY[1]).lerp(SKY[2], (alt - 12000) / 28000);
  return out.copy(SKY[2]).lerp(SKY[3], Math.min(1, (alt - 40000) / 40000));
}

/** Globe orientation: launch site under +Y, east along +X, then spun by the Earth's rotation. */
function globeQuaternion(lat, lon, spin) {
  const phi = (lat * Math.PI) / 180; const lam = (lon * Math.PI) / 180;
  const up = new THREE.Vector3(Math.cos(phi) * Math.cos(lam), Math.sin(phi), -Math.cos(phi) * Math.sin(lam));
  const east = new THREE.Vector3(-Math.sin(lam), 0, -Math.cos(lam));
  const north = new THREE.Vector3(-Math.sin(phi) * Math.cos(lam), Math.cos(phi), Math.sin(phi) * Math.sin(lam));
  const m = new THREE.Matrix4().makeBasis(east, up, north.clone().negate()); // scene axes -> model vectors
  const base = new THREE.Quaternion().setFromRotationMatrix(m.clone().transpose());
  const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin);
  return base.multiply(spinQ);
}

const plumeMat = () => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uPower;
    void main(){ float h = vUv.y; float core = smoothstep(0.0, 0.85, 1.0 - h);
      vec3 col = mix(vec3(1.0,0.35,0.05), vec3(1.0,0.92,0.7), core*core);
      float flick = 0.85 + 0.15*sin(uTime*60.0 + h*20.0);
      float a = pow(1.0 - h, 1.4) * flick * uPower; gl_FragColor = vec4(col, a); }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});

function Plume({ session, height }) {
  const m = useMemo(plumeMat, []); const g = useRef(); const light = useRef();
  const engines = session.rocket.id === 'saturn_v' ? [[0, 0], [1.9, 1.9], [-1.9, 1.9], [1.9, -1.9], [-1.9, -1.9]] : [[0, 0]];
  const big = session.rocket.id === 'saturn_v' ? 1 : 0.35;
  useFrame(({ clock }) => {
    const thr = session.ended && session.exploded != null ? 0 : session.lastThrottle; const alt = Math.max(0, altitude(session.sim.position));
    const spread = 1 + Math.min(4, alt / 25000);
    m.uniforms.uTime.value = clock.elapsedTime; m.uniforms.uPower.value = thr > 0.01 ? 1 : 0;
    if (g.current) { g.current.visible = thr > 0.01; g.current.scale.set(spread * big, (0.4 + thr * 1.1) * (session.rocket.id === 'saturn_v' ? 38 : 9), spread * big); }
    if (light.current) light.current.intensity = thr * 9 * (1 + 0.1 * Math.sin(clock.elapsedTime * 45));
  });
  return (
    <group>
      <group ref={g}>{engines.map(([x, z], i) => <mesh key={i} position={[x, -0.5, z]}><cylinderGeometry args={[0.45, 0.04, 1, 14, 1, true]} /><primitive object={m} attach="material" /></mesh>)}</group>
      <pointLight ref={light} position={[0, -2, 0]} color="#ff9a45" distance={90} intensity={0} />
    </group>
  );
}

function Explosion({ session }) {
  const ref = useRef(); const frag = useMemo(() => Array.from({ length: 70 }, () => ({ v: new THREE.Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.3) * 50, (Math.random() - 0.5) * 60), s: 0.2 + Math.random() * 0.9, r: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4) })), []);
  const light = useRef(); const t0 = useRef(null); const meshes = useRef([]);
  useFrame(({ clock }) => {
    if (session.exploded == null) { t0.current = null; if (ref.current) ref.current.visible = false; return; }
    if (t0.current == null) t0.current = clock.elapsedTime;
    const t = clock.elapsedTime - t0.current; ref.current.visible = true;
    meshes.current.forEach((m, i) => { if (!m) return; const f = frag[i]; m.position.copy(f.v).multiplyScalar(t); m.position.y -= 4.9 * t * t; m.rotation.set(f.r.x * t, f.r.y * t, f.r.z * t); const s = f.s * Math.max(0, 1 - t / 4); m.scale.setScalar(s); });
    if (light.current) light.current.intensity = Math.max(0, 40 * Math.exp(-t * 2.2));
  });
  return (
    <group ref={ref} visible={false}>
      <pointLight ref={light} color="#ffb060" distance={400} intensity={0} />
      {frag.map((f, i) => <mesh key={i} ref={(m) => { meshes.current[i] = m; }}><boxGeometry args={[1, 0.6, 0.3]} /><meshStandardMaterial color={i % 3 ? '#d9d6cf' : '#ff7a1a'} emissive={i % 3 ? '#000000' : '#ff4000'} emissiveIntensity={1.2} roughness={0.6} /></mesh>)}
    </group>
  );
}

/** Everything that moves with the flight. The rocket's centre stays at the scene origin (floating origin). */
function World({ session, mode, layout, xray, settings }) {
  const { camera, scene, gl } = useThree();
  const q = useQuality(); const frame = useRef(null); const decorRef = useRef(); const launchedRef = useRef(false);
  useRumble(session, mode, settings.reduceMotion);
  const controls = useRef(); const rocketPivot = useRef(); const stackRef = useRef(); const padRef = useRef(); const groundRef = useRef(); const globeRef = useRef(); const globeFade = useRef(); const marker = useRef();
  const sun = useRef(); const atm = useRef(); const starRef = useRef(); const mapLine = useRef(); const satRef = useRef();
  const parts = useRef(new Map()); const relState = useRef(new Map()); const lastT = useRef(0); const lastModeRef = useRef(null); const bg = useMemo(() => new THREE.Color(), []);
  const H = layout.height ?? 20; const Lc = H; const sat = session.bundle.spacecraft?.parts ?? [];
  const isPf = session.rocket.id === 'pathfinder'; const data = session.data;
  const site = session.sim.options;
  const groundMat = useMemo(() => { const m = mat.ground(); return m; }, []);
  const mapPoints = useMemo(() => new Float32Array(600 * 3), []);
  const predGeom = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3)); g.setDrawRange(0, 0); return g; }, []);
  const pathGeom = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(mapPoints, 3)); g.setDrawRange(0, 0); return g; }, [mapPoints]);
  const predT = useRef(0);
  const layoutY = useMemo(() => new Map(layout.map((p) => [p.partId, p.y])), [layout]);

  useEffect(() => { scene.background = new THREE.Color('#8ec1f2'); scene.fog = new THREE.FogExp2('#8ec1f2', 0.00004); return () => { scene.fog = null; }; }, [scene]);
  useEffect(() => { gl.shadowMap.enabled = settings.quality !== 'low'; }, [gl, settings.quality]);

  useFrame((state, dtReal) => {
    const sim = session.sim; const p = sim.position; const h = session.heading;
    const R = session.toScene(p); const alt = Math.max(-5, mag(p) - RE);
    const Rc = { x: R.x + h.x * Lc * 0.5, y: R.y + h.y * Lc * 0.5 };
    const rcLen = Math.hypot(Rc.x, Rc.y); const rhat = { x: Rc.x / rcLen, y: Rc.y / rcLen };
    const simDt = Math.max(0, sim.timeS - lastT.current); lastT.current = sim.timeS;
    frame.current = { Rc, alt: Math.max(-5, alt), base: R }; launchedRef.current = session.launched;
    if (decorRef.current) { decorRef.current.visible = alt < 42000 && mode !== 'map'; decorRef.current.position.set(-Rc.x, RE - Rc.y, 0); }

    // sky / lighting by altitude
    if (mode === 'map') bg.set('#02040a'); else skyColor(Math.max(0, alt), bg);
    scene.background.copy(bg); if (scene.fog) { scene.fog.color.copy(bg); scene.fog.density = 0.00004 * (1 - smooth(5000, 40000, alt)); }
    if (sun.current) sun.current.intensity = 3.2; if (starRef.current) starRef.current.visible = alt > 26000 || mode === 'map';

    // rocket pivot: the base sits half a length behind the centre along the heading
    const ang = Math.atan2(-h.x, h.y);
    if (rocketPivot.current) { rocketPivot.current.position.set(-h.x * Lc * 0.5, -h.y * Lc * 0.5, 0); rocketPivot.current.rotation.z = ang; rocketPivot.current.visible = !(session.exploded != null); }

    // pad & ground (flat, only low down)
    const groundOn = alt < 32000 && mode !== 'map';
    if (groundRef.current) { groundRef.current.visible = groundOn; groundRef.current.position.set(-Rc.x, RE - Rc.y - 0.05, 0); groundRef.current.material.opacity = 1 - smooth(14000, 30000, alt); }
    if (padRef.current) { padRef.current.visible = alt < 6000; padRef.current.position.set(-Rc.x, RE - Rc.y, 0); }

    // globe at 1/1000 scale, with a continuous altitude fade-in
    const d = mode === 'map' ? Math.max(0, alt) / 1000 : Math.max(0, alt) / 1000 + 150 * (1 - smooth(20000, 80000, alt));
    if (globeRef.current) {
      const dist = RS + d; globeRef.current.position.set(-rhat.x * dist, -rhat.y * dist, 0);
      globeRef.current.quaternion.copy(globeQuaternion(site.latitudeDeg, site.longitudeDeg, 7.2921159e-5 * sim.timeS));
      globeRef.current.visible = alt > 9000 || mode === 'map';
    }

    // debris from separated stages / fairing halves
    for (const r of session.releases) {
      let st = relState.current.get(r); if (!st) { st = { y: 0, v: r.v, dx: 0, rot: 0 }; relState.current.set(r, st); }
      st.v -= session.accel * simDt * (session.lastThrottle > 0.01 ? 1 : 0.0); st.y += st.v * simDt; st.dx += (r.dx ? Math.sign(r.dx) * 3 : 0) * simDt; st.rot += r.spin * simDt;
      for (const id of r.partIds) { const g = parts.current.get(id); if (g) { g.position.set(st.dx, (layoutY.get(id) ?? 0) + st.y, 0); g.rotation.z = st.rot; g.visible = Math.abs(st.y) < 8000; } }
    }

    // deployed CubeSat drifts out of the dispenser
    if (satRef.current) {
      const dep = session.deployed; satRef.current.visible = dep;
      if (dep) { const t = Math.max(0, sim.timeS - session.deployedAt); const ad = layout.find((x) => x.partId === 'pf_payload_adapter'); satRef.current.position.set(0.6 * t * 0.5 + 0, (ad?.y ?? 0) + 2 + 1.2 * t, 0); satRef.current.rotation.y = t * 0.6; satRef.current.rotation.x = t * 0.2; }
    }

    // cameras
    const c = controls.current;
    if (lastModeRef.current !== mode) {
      lastModeRef.current = mode;
      if (mode === 'chase') { camera.position.set(Lc * 0.8, Lc * 0.18, Lc * 1.7); camera.fov = 42; if (c) { c.target.set(0, 0, 0); } }
      camera.updateProjectionMatrix();
    }
    if (c) c.enabled = mode === 'chase';
    if (mode === 'chase') {
      let focus = new THREE.Vector3(0, 0, 0);
      if (session.deployed && satRef.current && sim.timeS - session.deployedAt < 40 && isPf) { satRef.current.getWorldPosition(focus); }
      if (c) { c.target.lerp(focus, 1 - Math.exp(-3 * dtReal)); c.minDistance = session.deployed ? 2 : Math.max(6, Lc * 0.25); c.maxDistance = Lc * 9; }
      camera.fov = 42;
    } else if (mode === 'ground') {
      const cam = { x: 190 - Rc.x, y: RE + 2 - Rc.y, z: 140 };
      camera.position.set(cam.x, cam.y, cam.z); const dist = Math.hypot(cam.x, cam.y, cam.z);
      camera.fov = Math.max(1.2, Math.min(55, (2 * Math.atan2(Lc * 1.6, dist) * 180) / Math.PI)); camera.lookAt(0, 0, 0);
    } else if (mode === 'map') {
      const cx = -Rc.x / 1000; const cy = -Rc.y / 1000;
      camera.position.set(cx, cy, RS * 3.3); camera.fov = 38; camera.lookAt(cx, cy, 0);
      if (marker.current) { marker.current.visible = true; marker.current.position.set(0, 0, 0); marker.current.scale.setScalar(160); }
      if (rocketPivot.current) rocketPivot.current.visible = false;
      // path flown and predicted
      const pts = session.path; const n = Math.min(pts.length, 599);
      for (let i = 0; i < n; i++) { const s = session.toScene(pts[pts.length - n + i]); mapPoints[i * 3] = s.x / 1000 - Rc.x / 1000; mapPoints[i * 3 + 1] = s.y / 1000 - Rc.y / 1000; mapPoints[i * 3 + 2] = 0.5; }
      pathGeom.setDrawRange(0, n); pathGeom.attributes.position.needsUpdate = true;
      predT.current -= dtReal;
      if (predT.current <= 0 && session.launched) {
        predT.current = 1; const pred = session.predictPath(190); const arr = predGeom.attributes.position.array;
        pred.forEach((q, i) => { const s = session.toScene(q); arr[i * 3] = s.x / 1000 - Rc.x / 1000; arr[i * 3 + 1] = s.y / 1000 - Rc.y / 1000; arr[i * 3 + 2] = 0.5; });
        predGeom.setDrawRange(0, pred.length); predGeom.attributes.position.needsUpdate = true;
      }
    }
    if (marker.current && mode !== 'map') marker.current.visible = false;
    if (mapLine.current) mapLine.current.visible = mode === 'map';
    camera.updateProjectionMatrix();
    if (atm.current) atm.current.visible = true;
  });

  return (
    <>
      <directionalLight ref={sun} position={[400, 700, 500]} intensity={2.8} color="#fff3e0" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-120} shadow-camera-right={120} shadow-camera-top={120} shadow-camera-bottom={-120} shadow-camera-far={1800} shadow-bias={-0.0003} />
      <hemisphereLight args={['#cfe2ff', '#6b5d42', 0.9]} />
      <Environment resolution={128} frames={1}><Lightformer form='rect' intensity={2.5} color='#ffffff' position={[0, 8, 4]} scale={[14, 4, 1]} /><Lightformer form='rect' intensity={1.4} color='#9cc8ff' position={[-8, 3, -3]} rotation-y={Math.PI / 2} scale={[10, 5, 1]} /><Lightformer form='rect' intensity={1.0} color='#ffcf9a' position={[8, 2, -2]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} /></Environment>
      <group ref={starRef} visible={false}><Stars radius={9000} depth={400} count={5000} factor={30} saturation={0} fade /></group>

      <mesh ref={groundRef} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[90000, 90000]} /><meshStandardMaterial map={groundMat.map} normalMap={groundMat.normalMap} color="#b3a176" roughness={1} transparent />
      </mesh>
      <group ref={padRef}><LaunchPad3D rocketRadius={isPf ? 0.9 : 5} towerHeight={Math.max(16, H * 0.85)} towerX={isPf ? -4.2 : -12} launchedRef={launchedRef} /></group>
      <group ref={decorRef}><Hills quality={q.particles} /></group>
      <PadSmoke session={session} frame={frame} quality={q.particles} />
      <Trail session={session} frame={frame} quality={q.particles} />
      {q.clouds && <Clouds frame={frame} quality={q.particles} />}
      <SunGlow />

      <group ref={globeRef}><Suspense fallback={null}><EarthGlobe radius={RS} segments={96} /></Suspense></group>

      <group ref={rocketPivot}>
        <group ref={stackRef}>
          <RocketView layout={layout} present={() => true} xray={xray} register={(id, g) => { if (g) parts.current.set(id, g); }} />
          {isPf && !session.deployed && (() => { const ad = layout.find((x) => x.partId === 'pf_payload_adapter'); return <group position={[0, (ad?.y ?? 0) + 0.45, 0]}><CubeSat3D parts={sat} data={data} scale={1} onSelect={() => {}} onHover={() => {}} /></group>; })()}
        </group>
        <Plume session={session} height={H} />
      </group>
      <group ref={satRef} visible={false}><CubeSat3D parts={sat} data={data} scale={1.6} onSelect={() => {}} onHover={() => {}} /></group>
      <Explosion session={session} />

      <mesh ref={marker} visible={false}><octahedronGeometry args={[1, 0]} /><meshBasicMaterial color="#ff7a1a" /></mesh>
      <group ref={mapLine} visible={false}>
        <line geometry={pathGeom}><lineBasicMaterial color="#ff7a1a" linewidth={2} /></line>
        <line geometry={predGeom}><lineBasicMaterial color="#38d6ff" transparent opacity={0.8} /></line>
      </group>
      <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.08} />
      <Effects bloom={0.7} threshold={0.78} vignette={0.6} />
    </>
  );
}

export default function FlightScene(props) {
  const layout = useMemo(() => rocketLayout(props.session.data, props.session.rocket.id), [props.session]);
  return <World {...props} layout={layout} />;
}
