import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, CircleHelp, Eye, Hammer, Layers, Redo2, Undo2, Wrench } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import Frame from '../components/Frame.jsx';
import FirstBuildGuide from '../components/FirstBuildGuide.jsx';
import { Panel, Meter } from '../components/ui.jsx';
import { useGame } from '../state/store.js';
import { BoltState, BoltJointState, starOrderText } from '../engine/bolts.js';
import { StudioFloor, StudioLights } from '../three/Studio.jsx';
import RocketView, { rocketLayout } from '../three/Rocket3D.jsx';
import BoltRings from '../three/BoltRings.jsx';
import LaunchPad3D from '../three/LaunchPad3D.jsx';
import CubeSat3D from '../three/CubeSat3D.jsx';
import { openCodex } from '../components/HoustonPanel.jsx';
import { STAND } from '../engine/assembly.js';
import { useQuality } from '../state/quality.js';
import Effects from '../three/Effects.jsx';

const STATE_STYLE = {
  Missing: ['bg-[#0b1224] text-mute border-dashed border-mute/50', '○'], Inserted: ['bg-[#2a3350] text-ink border-mute/60', '●'],
  UnderTorqued: ['bg-warn/20 text-warn border-warn/60', '◐'], Torqued: ['bg-ok/20 text-ok border-ok/60', '✓'], OverTorqued: ['bg-bad/20 text-bad border-bad/60', '✗'],
};

/** Smoothly frames a target (a joint or the whole stack) by moving the orbit controls. */
function CameraRig({ target, distance, controls, focus }) {
  const { camera } = useThree();
  const goal = useRef({ t: new THREE.Vector3(...target), d: distance });
  const settle = useRef(0);
  useEffect(() => { goal.current = { t: new THREE.Vector3(...target), d: distance }; settle.current = 1.8; }, [target, distance]);
  useFrame((_, dt) => {
    const c = controls.current; if (!c) return;
    const k = 1 - Math.exp(-4 * dt);
    c.target.lerp(goal.current.t, k);
    const dir = camera.position.clone().sub(c.target); const len = dir.length();
    // Looking at a flange: tilt the camera to about 50 degrees above the ring so the bolt numbers spread around it.
    if (focus && settle.current > 0) { settle.current -= dt; const want = new THREE.Vector3(0.45, 0.82, 0.62).normalize(); dir.normalize().lerp(want, k * 0.8).normalize().multiplyScalar(len); }
    dir.setLength(THREE.MathUtils.lerp(dir.length(), goal.current.d, k)); camera.position.copy(c.target).add(dir);
    c.update();
  });
  return null;
}

function Scene({ layout, data, graph, vehicle, selectedJoint, onBolt, nextBolt, stackGhost, rules, fairingOpen, payloadMounted, spacecraftParts, rocketId }) {
  const controls = useRef();
  const height = layout.height ?? 20;
  const joint = rules.boltJoints.find((j) => j.id === selectedJoint);
  const upper = joint ? layout.find((p) => p.partId === joint.upperPartId) : null;
  const target = upper ? [0, upper.y, 0] : [0, height * 0.42, 0];
  const dist = upper ? 3.4 : Math.max(14, height * (height > 40 ? 1.9 : 1.15));
  const mounted = (j) => graph.isAttached(j.lowerPartId) && graph.isAttached(j.upperPartId);
  const isPf = rocketId === 'pathfinder';
  return (
    <>
      <color attach="background" args={['#070c19']} />
      <fog attach="fog" args={['#070c19', 40, 120]} />
      <StudioLights />
      <StudioFloor y={0} size={50} color="#0b1326" />
      <LaunchPad3D rocketRadius={isPf ? 0.9 : 3} towerHeight={Math.max(14, height * 0.9)} towerX={isPf ? -4.2 : -9} />
      <Suspense fallback={null}>
        <RocketView layout={layout} present={(id) => graph.isAttached(id)} ghost={(id) => stackGhost === id} />
        {isPf && payloadMounted && (() => { const ad = layout.find((p) => p.partId === 'pf_payload_adapter'); return <group position={[0, ad.y + 0.42, 0]}><CubeSat3D parts={spacecraftParts} data={data} scale={1} onSelect={() => {}} onHover={() => {}} /></group>; })()}
        {isPf && <BoltRings joints={rules.boltJoints} layout={layout} getState={(id) => BoltJointState.loadFrom(rules.getJoint(id), vehicle)} selectedJoint={selectedJoint} onBoltClick={onBolt} nextBolt={nextBolt} mounted={mounted} />}
      </Suspense>
      <OrbitControls ref={controls} makeDefault enablePan minDistance={2.5} maxDistance={Math.max(90, height * 3.2)} maxPolarAngle={Math.PI / 2 - 0.02} target={target} enableDamping />
      <Effects bloom={0.45} />
      <CameraRig target={target} distance={dist} controls={controls} focus={!!upper} />
    </>
  );
}

export default function Vab() {
  const game = useGame();
  const q = useQuality();
  const { data, vehicle, spacecraft, missionId, selectedJoint, setSelectedJoint, undo, redo, undoStack, redoStack, boltAction, attachPart, detachPart, setPitchKick, job } = game;
  const rules = data.getRules(); const rocket = data.getRocket(vehicle.rocketId);
  const mission = data.getMission(missionId);
  const layout = useMemo(() => rocketLayout(data, vehicle.rocketId), [data, vehicle.rocketId]);
  const graph = useMemo(() => game.assemblyGraph(), [vehicle.parts, vehicle.rocketId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [wrench, setWrench] = useState(null); // N·m on the wrench; null = follow the coach
  const [xray, setXray] = useState(false);
  const [info, setInfo] = useState(null);
  const order = graph.rules.order;
  const buildable = !!rocket?.buildable;
  const highlight = useGame((s) => s.highlight);

  const joint = rules.boltJoints.find((j) => j.id === selectedJoint);
  const jointState = joint ? BoltJointState.loadFrom(joint, vehicle) : null;
  const nextBolt = jointState ? jointState.nextBolt() : -1;
  const pass = jointState ? jointState.currentPass() : 1;
  const coachNm = jointState ? jointState.passTargetNm(pass) : 0;
  const wrenchNm = wrench ?? coachNm;
  const nextGhost = buildable ? game.nextStackPart()?.part : null;
  const mountedJoints = rules.boltJoints.filter((j) => graph.isAttached(j.lowerPartId) && graph.isAttached(j.upperPartId));

  useEffect(() => { if (buildable && !selectedJoint && mountedJoints.length) setSelectedJoint(mountedJoints[0].id); }, [buildable, mountedJoints.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); useGame.getState().undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); useGame.getState().redo(); }
      if (e.key === 'Escape') useGame.getState().setSelectedJoint(null);
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey) { const j = useGame.getState().selectedJoint; useGame.getState().setSelectedJoint(null); setTimeout(() => useGame.getState().setSelectedJoint(j ?? mountedJoints[0]?.id ?? null), 30); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [mountedJoints]);

  const stackPart = (id) => {
    if (graph.isAttached(id)) return;
    for (const { lower, socket } of graph.freeSockets()) if (graph.canAttach(id, lower, socket).ok) { attachPart(id, lower, socket); return; }
    const first = graph.freeSockets().find(() => true);
    const reason = first ? graph.canAttach(id, first.lower, first.socket).reason : 'Nothing to attach to.';
    useGame.getState().say(reason, 'bad');
  };
  const unstack = (id) => detachPart(id);
  const topPart = [...order].reverse().find((id) => graph.isAttached(id));

  const clickBolt = (jointId, i) => {
    const st = BoltJointState.loadFrom(rules.getJoint(jointId), vehicle);
    if (!st.present[i]) { boltAction(jointId, 'fit', i); return; }
    const res = boltAction(jointId, 'torque', i, wrenchNm);
    if (res.warped) useGame.getState().say(`Joint warped! You fully torqued bolt ${i + 1} while its neighbours were still loose. Follow the star order.`, 'warn');
  };

  const payloadMounted = graph.isAttached('payload');
  const stats = joint ? jointState.getStatus() : null;

  if (!buildable) {
    // Saturn V / Rehbar-I: inspect-only models.
    return (
      <Frame screen="vab" title={rocket?.name ?? 'Rocket'} right={<button className="btn btn-primary btn-sm" onClick={() => game.go('pad')}>To the pad <ArrowRight size={14} /></button>}>
        <div className="grid min-h-0 gap-3 lg:h-full lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="panel relative overflow-hidden">
            <Canvas shadows={q.shadows} camera={{ position: [28, 30, 60], fov: 40, near: 0.5, far: 600 }} dpr={q.dpr}>
              <Scene layout={layout} data={data} graph={{ isAttached: () => true, freeSockets: () => [] }} vehicle={vehicle} selectedJoint={null} rules={{ boltJoints: [], getJoint: () => null }} spacecraftParts={[]} rocketId={rocket.id} />
            </Canvas>
            <div className="pointer-events-none absolute left-3 top-3 text-[11px] text-mute">Inspect only · drag to orbit · scroll to zoom</div>
          </div>
          <Panel title={`${rocket?.name} · inspect`} className="overflow-y-auto">
            <p className="mb-3 text-sm text-mute">{rocket?.description}</p>
            <div className="space-y-2">{rocket?.stages.map((s) => (
              <div key={s.id} className="rounded-xl border border-line bg-[#0a1226]/80 p-3 text-xs"><div className="font-display text-sm font-bold">{s.name}</div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px] text-mute"><span>Dry {s.dryMassKg.toLocaleString()} kg</span><span>Prop {s.propMassKg.toLocaleString()} kg</span><span>Thrust {s.thrustVacKN.toLocaleString()} kN</span><span>Isp {s.ispSl}/{s.ispVac} s</span><span>{s.engineCount} × {s.engineName}</span><span>Ø {s.diameterM} m</span></div>
                {s.source && <div className="mt-1 text-[10px] text-mute/80">{s.source}{s.illustrative ? ' · game value' : ''}</div>}</div>
            ))}</div>
            <button className="btn btn-primary mt-4 w-full" onClick={() => game.go('pad')}>To the pad <ArrowRight size={15} /></button>
          </Panel>
        </div>
      </Frame>
    );
  }

  return (
    <Frame screen="vab" title="VAB · Assembly"
      right={<><button className="btn btn-sm" onClick={() => game.go('avionics')}>Avionics Bay</button><button className="btn btn-primary btn-sm" onClick={() => (job ? window.dispatchEvent(new CustomEvent('tminus:handback')) : game.go('pad'))}>{job ? 'Hand the rocket back' : 'To the pad'} <ArrowRight size={14} /></button></>}>
      <FirstBuildGuide room="vab" />
      <div className="grid min-h-0 gap-3 lg:h-full lg:grid-cols-[290px_minmax(0,1fr)_330px]">
        {/* Stack */}
        <Panel title="Rocket stack" className="flex max-h-[60vh] min-h-0 flex-col lg:max-h-none" pad={false} right={<div className="flex gap-1"><button className="btn btn-ghost btn-sm !p-1.5" onClick={undo} disabled={!undoStack.length} aria-label="Undo"><Undo2 size={15} /></button><button className="btn btn-ghost btn-sm !p-1.5" onClick={redo} disabled={!redoStack.length} aria-label="Redo"><Redo2 size={15} /></button></div>}>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {order.map((id, idx) => {
              const att = graph.isAttached(id); const def = data.getPart(id); const isNext = nextGhost === id;
              const name = graph.rules.name(id); const isTop = topPart === id;
              return (
                <motion.div layout key={id} className={`rounded-xl border p-2.5 ${att ? 'border-ok/40 bg-ok/5' : isNext ? 'border-accent/50 bg-accent/5' : 'border-line bg-[#0a1226]/70'} ${highlight?.ref === id && Date.now() - highlight.at < 9000 ? 'pulse-ring' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${att ? 'border-ok text-ok' : 'border-line text-mute'}`}>{att ? <Check size={13} /> : idx + 1}</span>
                    <div className="min-w-0 flex-1"><div className="font-display text-[14px] font-bold leading-tight">{name}</div>{def && <div className="font-mono text-[10px] text-mute">{def.massKg} kg · {def.lengthM} m{def.diameterM ? ` · Ø${def.diameterM} m` : ''}</div>}</div>
                    <button className="btn btn-ghost btn-sm !p-1.5" aria-label={`Ask HOUSTON about ${name}`} onClick={() => window.dispatchEvent(new CustomEvent('tminus:ask', { detail: { partId: id } }))}><CircleHelp size={14} className="text-cyanx" /></button>
                    {att ? <button className="btn btn-sm !px-2 text-bad" disabled={!isTop && id !== 'payload' && !id.startsWith('pf_fairing')} onClick={() => unstack(id)}>Remove</button>
                      : <button className={`btn btn-sm !px-2 ${isNext ? 'btn-primary' : ''}`} onClick={() => stackPart(id)}>Add</button>}
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="border-t border-line/70 p-3 text-[11px] leading-snug text-mute">Parts stack bottom-first onto the launch stand. Wrong order or a diameter mismatch is refused with the reason. A joint with bolts in it must be unbolted before its part can come off.</div>
        </Panel>

        {/* 3D */}
        <div className="panel relative h-[65vh] min-h-0 overflow-hidden lg:h-auto">
          <Canvas shadows={q.shadows} camera={{ position: [8, 8, 14], fov: 38, near: 0.1, far: 400 }} dpr={q.dpr}>
            <Scene layout={layout} data={data} graph={graph} vehicle={vehicle} selectedJoint={selectedJoint} onBolt={clickBolt} nextBolt={nextBolt} stackGhost={nextGhost}
              rules={rules} payloadMounted={payloadMounted} spacecraftParts={spacecraft.parts} rocketId={vehicle.rocketId} />
          </Canvas>
          <div className="pointer-events-none absolute left-3 top-3 space-y-0.5 text-[11px] text-mute"><div>Drag to orbit · scroll to zoom · <span className="kbd">F</span> focus joint · <span className="kbd">Esc</span> leave bolt tool</div><div>{xray ? 'X-ray on' : ''}</div></div>
          <div className="absolute right-3 top-3 flex gap-2"><button className={`btn btn-sm ${xray ? 'border-cyanx text-cyanx' : ''}`} onClick={() => setXray((x) => !x)}><Eye size={14} />X-ray</button></div>
          {stats && selectedJoint && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center"><div className="panel pointer-events-auto flex items-center gap-4 px-4 py-2.5 text-xs"><span className="font-display text-sm font-bold uppercase tracking-wider text-accent2">{joint.id}</span><span className="text-mute">Star order <span className="font-mono text-ink">{starOrderText(joint.boltCount)}</span></span><span className="text-mute">Pass <b className="text-ink">{Math.min(pass, 3)}/3</b></span><span className="text-mute">Wrench <b className="font-mono text-ink">{wrenchNm.toFixed(1)} N·m</b></span></div></div>
          )}
        </div>

        {/* Joints / bolt tool */}
        <Panel title="Bolted joints" className="min-h-0 lg:overflow-y-auto">
          <div className="space-y-2">
            {rules.boltJoints.map((j) => {
              const s = BoltJointState.loadFrom(j, vehicle).getStatus(); const mounted = graph.isAttached(j.lowerPartId) && graph.isAttached(j.upperPartId); const sel = selectedJoint === j.id;
              return (
                <button key={j.id} disabled={!mounted} onClick={() => setSelectedJoint(sel ? null : j.id)} className={`w-full rounded-xl border p-2.5 text-left transition disabled:opacity-35 ${sel ? 'border-accent bg-accent/10' : 'border-line bg-[#0a1226]/70 hover:border-cyanx/40'} ${highlight?.ref === j.id && Date.now() - highlight.at < 9000 ? 'pulse-ring' : ''}`}>
                  <div className="flex items-center justify-between text-[12px]"><span className="font-semibold">{graph.rules.name(j.lowerPartId).replace('Pathfinder ', '')} → {graph.rules.name(j.upperPartId).replace('Pathfinder ', '')}</span><span className="font-mono text-[10px] text-mute">{j.boltCount}× {j.size}</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#0b1430]"><div className="h-full rounded-full transition-all" style={{ width: `${s.integrity * 100}%`, background: s.integrity > 0.999 ? '#4ade80' : s.integrity > 0.6 ? '#fbbf24' : '#f87171' }} /></div>
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-mute"><span>integrity {(s.integrity * 100).toFixed(0)}% · fails above {s.failureQkPa.toFixed(1)} kPa</span>{s.sequenceErrors > 0 && <span className="text-warn">warped</span>}</div>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {joint && jointState && (
              <motion.div key={joint.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-3 border-t border-line/70 pt-4">
                <div className="flex items-center gap-2"><Wrench size={16} className="text-accent" /><h4 className="font-display text-base font-bold uppercase tracking-wide">Bolt tool</h4><button className="ml-auto text-[11px] text-cyanx hover:underline" onClick={() => openCodex(joint.codexId)}>why star order?</button></div>
                <div className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((p) => <button key={p} className={`btn btn-sm !px-1 ${Math.abs(wrenchNm - jointState.passTargetNm(p)) < 0.05 ? 'border-accent bg-accent/15 text-accent2' : ''} ${pass === p ? 'ring-1 ring-cyanx/60' : ''}`} onClick={() => setWrench(jointState.passTargetNm(p))}>Pass {p}<span className="ml-1 font-mono text-[10px] text-mute">{jointState.passTargetNm(p).toFixed(1)}</span></button>)}</div>
                <div>
                  <div className="mb-1 flex justify-between text-[11px] text-mute"><span>Wrench setting</span><span className="font-mono text-ink">{wrenchNm.toFixed(1)} N·m <span className="text-mute">(target {joint.torqueNm} ±{joint.tolerancePct}%)</span></span></div>
                  <input type="range" className="w-full" min={0} max={joint.torqueNm * 1.5} step={0.5} value={wrenchNm} onChange={(e) => setWrench(+e.target.value)} aria-label="Wrench torque" />
                  <div className="relative mt-1 h-2 rounded-full bg-[#0b1430]"><div className="absolute inset-y-0 rounded-full bg-ok/40" style={{ left: `${((joint.torqueNm * (1 - joint.tolerancePct / 100)) / (joint.torqueNm * 1.5)) * 100}%`, width: `${((joint.torqueNm * 0.2) / (joint.torqueNm * 1.5)) * 100}%` }} /><div className="absolute inset-y-[-2px] right-0 w-0.5 bg-bad/70" style={{ left: `${(1.1 / 1.5) * 100}%` }} /></div>
                  <div className="mt-1 flex justify-between font-mono text-[9px] text-mute"><span>0</span><span className="text-ok">target band</span><span className="text-bad">over-torque ›</span></div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: joint.boltCount }, (_, i) => { const st = jointState.stateOf(i); const [cls, sym] = STATE_STYLE[st]; return (
                    <button key={i} onClick={() => clickBolt(joint.id, i)} onContextMenu={(e) => { e.preventDefault(); boltAction(joint.id, 'remove', i); }} aria-label={`Bolt ${i + 1}: ${st}`} title={`Bolt ${i + 1} · ${st}${jointState.torque[i] ? ` · ${jointState.torque[i].toFixed(1)} N·m` : ''} (right-click removes)`}
                      className={`relative flex h-9 w-9 items-center justify-center rounded-lg border font-mono text-[11px] font-bold transition hover:scale-105 ${cls} ${nextBolt === i ? 'ring-2 ring-accent shadow-glow' : ''}`}><span className="absolute left-0.5 top-0 text-[8px] opacity-70">{i + 1}</span><span className="text-sm">{sym}</span></button>
                  ); })}
                </div>
                <div className="flex flex-wrap gap-2"><button className="btn btn-sm" onClick={() => boltAction(joint.id, 'fitAll')}><Hammer size={13} />Fit all bolts</button><button className="btn btn-sm" onClick={() => { for (let i = 0; i < joint.boltCount; i++) boltAction(joint.id, 'remove', i); }}>Remove all</button></div>
                <p className="text-[11px] leading-snug text-mute">Click a hole to fit a bolt, then click it again to torque it to the wrench setting. Follow the <b className="text-ink">star order</b> over 3 passes. Tightening a bolt fully while its neighbours are loose <b className="text-warn">warps</b> the joint; too much torque strips the bolt. Symbols as well as colours show each bolt's state.</p>
                {nextBolt >= 0 ? <div className="rounded-lg border border-accent/40 bg-accent/10 p-2 text-xs">Next: bolt <b>{nextBolt + 1}</b> — {jointState.present[nextBolt] ? `torque to ${jointState.passTargetNm(pass).toFixed(1)} N·m` : 'fit it first'} (pass {pass}/3)</div> : <div className="rounded-lg border border-ok/40 bg-ok/10 p-2 text-xs text-ok">✓ Joint complete: 100% integrity.</div>}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4 space-y-3 border-t border-line/70 pt-4">
            <h4 className="panel-title flex items-center gap-1.5"><Layers size={13} />Flight setup</h4>
            <div><div className="mb-1 flex justify-between text-xs"><span className="text-mute">Pitch kick</span><span className="font-mono">{vehicle.pitchKickDeg.toFixed(1)}°</span></div><input type="range" className="w-full" min={0} max={10} step={0.5} value={vehicle.pitchKickDeg} onChange={(e) => setPitchKick(+e.target.value)} aria-label="Pitch kick" /><p className="mt-1 text-[11px] text-mute">A small sideways tip right after liftoff starts the gravity turn.</p></div>
            <div className="grid grid-cols-2 gap-2">{(mission?.launchSites ?? []).map((id) => { const s = rules.getLaunchSite(id); return <button key={id} className={`btn btn-sm ${vehicle.launchSiteId === id ? 'border-accent bg-accent/15 text-accent2' : ''}`} onClick={() => game.setLaunchSite(id)}>{s?.name.split(',')[0]}</button>; })}</div>
          </div>
        </Panel>
      </div>
    </Frame>
  );
}
