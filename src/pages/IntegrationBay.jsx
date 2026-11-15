import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Box, CircleHelp, Cpu, Minus, Plus, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Frame from '../components/Frame.jsx';
import FirstBuildGuide from '../components/FirstBuildGuide.jsx';
import BudgetsPanel from '../components/BudgetsPanel.jsx';
import WiringBench from '../components/WiringBench.jsx';
import { Panel, SeverityTag } from '../components/ui.jsx';
import { useGame } from '../state/store.js';
import CubeSat3D from '../three/CubeSat3D.jsx';
import Cables3D from '../three/Cables3D.jsx';
import Effects from '../three/Effects.jsx';
import LoomView from '../three/LoomView.jsx';
import { Pedestal } from '../three/Pedestal.jsx';
import { StudioFloor, StudioLights } from '../three/Studio.jsx';
import { mountOptions, freeMountFor, mountLabel } from '../engine/cubesat.js';
import { WiringGraph } from '../engine/wiring.js';
import { validateWiring } from '../engine/wiring.js';
import { Severity } from '../engine/severity.js';
import { openCodex } from '../components/HoustonPanel.jsx';
import { useQuality } from '../state/quality.js';

const CATS = [['eps', 'Power'], ['battery', 'Battery'], ['switch', 'Switch'], ['obc', 'Computer'], ['radio', 'Radio'], ['antenna', 'Antenna'], ['adcs', 'ADCS'], ['camera', 'Camera'], ['solar', 'Solar']];
const COLUMN = { solar: 0, battery: 0, switch: 0, eps: 1, obc: 2, adcs: 2, camera: 2, radio: 3, antenna: 3 };

export default function IntegrationBay() {
  const { data, spacecraft, missionId, vehicle, installPart, removePart, addCable, removeCable, setOrbit, clearCables } = useGame();
  const highlight = useGame((s) => s.highlight);
  const mission = data.getMission(missionId); const rocket = data.getRocket(vehicle.rocketId);
  const report = useGame((s) => s.report)();
  const q = useQuality();
  const [tab, setTab] = useState('build');
  const [cat, setCat] = useState('eps');
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  const catalogue = useMemo(() => data.parts.filter((p) => p.assembly === 'cubesat' && p.mount !== 'frame' && p.mount !== 'pin'), [data]);
  const shown = catalogue.filter((p) => p.category === cat);
  const placed = spacecraft.parts.filter((p) => p.partId !== 'rbf_pin' || true);
  const selDef = selected ? data.getPart(spacecraft.parts.find((p) => p.instanceId === selected)?.partId) : null;

  // The RBF pin is part of the build (it is pulled at the pad); install it automatically.
  useEffect(() => { const g = useGame.getState(); if (!g.spacecraft.parts.some((p) => p.partId === 'rbf_pin')) g.installPart('rbf_pin'); }, [spacecraft.parts]);

  const devices = useMemo(() => spacecraft.parts.map((p) => ({ instanceId: p.instanceId, def: data.getPart(p.partId) })).filter((d) => d.def && d.def.ports.length > 0), [spacecraft.parts, data]);
  const faults = useMemo(() => {
    const g = new WiringGraph(data.getRules());
    devices.forEach((d) => g.addDevice(d.instanceId, d.def)); spacecraft.cables.forEach((c) => g.connect(c.fromPort, c.toPort, c.reversed));
    return validateWiring(g);
  }, [devices, spacecraft.cables, data]);
  const free = useMemo(() => (selDef ? [] : []), [selDef]);

  const count = (id) => spacecraft.parts.filter((p) => p.partId === id).length;
  const isHl = (id) => highlight && highlight.ref === id && Date.now() - highlight.at < 9000;

  const onSelect = useCallback((id) => { setSelected(id); const p = useGame.getState().spacecraft.parts.find((x) => x.instanceId === id); useGame.setState({ held: p?.partId ?? null }); }, []);

  return (
    <Frame screen="bay" title="Integration Bay" right={<button className="btn btn-primary btn-sm" onClick={() => useGame.getState().go('vab')}>To the VAB <ArrowRight size={14} /></button>}>
      <FirstBuildGuide room="bay" />
      <div className="grid min-h-0 grid-cols-1 gap-3 lg:h-full lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* Parts bin */}
        <Panel title="Parts bin" className="flex max-h-[60vh] min-h-0 flex-col lg:max-h-none" pad={false}>
          <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-3">
            {CATS.map(([id, label]) => (
              <button key={id} onClick={() => setCat(id)} className={`rounded-lg border px-2 py-1 font-display text-[12px] font-semibold uppercase tracking-wider transition ${cat === id ? 'border-accent bg-accent/15 text-accent2' : 'border-line text-mute hover:text-ink'}`}>{label}{count(catalogue.find((p) => p.category === id)?.id) > 0 && <span className="ml-1 text-ok">●</span>}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
            {shown.map((p) => {
              const have = count(p.id); const blocked = freeMountFor(p, spacecraft.parts) == null;
              return (
                <motion.div key={p.id} layout className={`rounded-xl border bg-[#0a1226]/90 p-3 transition ${isHl(p.id) ? 'pulse-ring border-accent' : have ? 'border-ok/40' : 'border-line hover:border-cyanx/40'}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1"><div className="font-display text-[15px] font-bold leading-tight">{p.name}</div><p className="mt-0.5 text-[11px] leading-snug text-mute">{p.description}</p></div>
                    <button className="btn btn-ghost btn-sm !p-1.5" title="Ask HOUSTON where this goes" onClick={() => window.dispatchEvent(new CustomEvent('tminus:ask', { detail: { partId: p.id } }))}><CircleHelp size={15} className="text-cyanx" /></button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-mute"><span>{p.massKg.toFixed(2)} kg</span><span>{p.costK} k$</span>{(p.powerIdleW > 0 || p.powerActiveW > 0) && <span>{p.powerIdleW}/{p.powerActiveW} W</span>}{p.specs?.peakW && <span>peak {p.specs.peakW} W</span>}{p.specs?.capacityWh && <span>{p.specs.capacityWh} Wh</span>}{p.specs?.dataRateKbps && <span>{p.specs.dataRateKbps} kbps</span>}{p.specs?.gsdMAt550 && <span>{p.specs.gsdMAt550} m/px</span>}</div>
                  {p.requires?.length > 0 && <div className="mt-1 text-[10px] text-warn">Needs {p.requires.map((r) => data.getPart(r)?.name ?? r).join(', ')} for full image quality</div>}
                  <button className="btn btn-sm mt-2.5 w-full" disabled={blocked} onClick={() => { const r = installPart(p.id); if (r) setSelected(r.instanceId); }}>
                    <Plus size={14} />{blocked ? `No free ${p.mount === 'slot' ? 'slot' : 'face'}` : `Install${have ? ` another (${have})` : ''} · ${mountLabel(freeMountFor(p, spacecraft.parts))}`}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </Panel>

        {/* Centre: 3D + wiring */}
        <div className="relative flex h-[72vh] min-h-0 flex-col gap-2 lg:h-auto">
          <div className="flex items-center gap-1 self-start rounded-xl border border-line/70 bg-panel/80 p-1">
            {[['build', 'Build', Box], ['wire', 'Wire', Cpu]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)} className={`relative flex items-center gap-2 rounded-lg px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wider ${tab === id ? 'text-ink' : 'text-mute hover:text-ink'}`}>
                {tab === id && <motion.span layoutId="bay-tab" className="absolute inset-0 rounded-lg bg-accent/20 ring-1 ring-accent/50" />}<Icon size={14} className="relative" /><span className="relative">{label}</span>
              </button>
            ))}
            <span className="px-3 text-[11px] text-mute">{spacecraft.parts.length - 1} parts · {spacecraft.cables.length} cables</span>
          </div>
          <div className="panel relative min-h-0 flex-1 overflow-hidden">
            {tab === 'build' ? (
              <>
                <Canvas shadows={q.shadows} camera={{ position: [4.4, 2.5, 6.0], fov: 36 }} dpr={q.dpr} onPointerMissed={() => { setSelected(null); useGame.setState({ held: null }); }}>
                  <color attach="background" args={['#060b18']} />
                  <fog attach="fog" args={['#060b18', 10, 30]} />
                  <Suspense fallback={null}>
                    <StudioLights />
                    <StudioFloor size={14} />
                    <Pedestal radius={1.35} />
                    <group position={[0, 0.25, 0]}><CubeSat3D parts={spacecraft.parts} data={data} selected={selected} hovered={hovered} onSelect={onSelect} onHover={setHovered} scale={7} /><group scale={7}><Cables3D spacecraft={spacecraft} data={data} /></group></group>
                  </Suspense>
                  <OrbitControls makeDefault enablePan={false} minDistance={2.2} maxDistance={11} target={[0, 1.25, 0]} maxPolarAngle={Math.PI / 2 - 0.03} autoRotate={!selected && !useGame.getState().settings.reduceMotion} autoRotateSpeed={0.7} enableDamping />
                  <Effects bloom={0.5} />
                </Canvas>
                <div className="pointer-events-none absolute left-3 top-3 text-[11px] text-mute">Drag to orbit · scroll to zoom · click a part to inspect</div>
                <AnimatePresence>
                  {selDef && (
                    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} className="panel absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-3 p-3 sm:left-auto sm:w-[360px]">
                      <div className="min-w-0 flex-1"><div className="font-display text-base font-bold">{selDef.name}</div><div className="text-[11px] text-mute">{mountLabel(spacecraft.parts.find((p) => p.instanceId === selected)?.mountId)} · {selDef.massKg.toFixed(2)} kg · {selDef.costK} k$</div></div>
                      {selDef.codexId && <button className="btn btn-sm" onClick={() => openCodex(selDef.codexId)}>Why?</button>}
                      {selDef.id !== 'rbf_pin' && <button className="btn btn-sm text-bad" onClick={() => { removePart(selected); setSelected(null); }}><Trash2 size={14} />Remove</button>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : (
              <div className="grid h-full min-h-0 gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_300px]">
                <WiringBench devices={devices} cables={spacecraft.cables} columnOf={(d) => COLUMN[d.category] ?? 1}
                  onConnect={(a, b, rev) => addCable(a, b, rev)} onRemove={removeCable} faultPorts={faults.map((f) => f.port).filter(Boolean)} />
                <LoomView spacecraft={spacecraft} data={data} />
              </div>
            )}
          </div>
          {tab === 'wire' && (
            <div className="panel max-h-40 overflow-y-auto p-3">
              <div className="mb-1.5 flex items-center justify-between"><h4 className="panel-title">Wiring check</h4><button className="btn btn-ghost btn-sm" onClick={clearCables}><RotateCcw size={13} />Clear all cables</button></div>
              {faults.length === 0 ? <p className="text-xs text-ok">✓ {spacecraft.cables.length} cables, no faults.</p> : (
                <ul className="space-y-1.5">{faults.map((f, i) => <li key={i} className="flex gap-2 text-[12px]"><SeverityTag severity={f.severity >= Severity.Fault ? 2 : f.severity === Severity.Warning ? 1 : 0} /><span>{f.message}{f.codexId && <button className="ml-1 text-cyanx hover:underline" onClick={() => openCodex(f.codexId)}>why?</button>}</span></li>)}</ul>
              )}
            </div>
          )}
        </div>

        {/* Budgets */}
        <Panel title="Budgets" className="min-h-0 lg:overflow-y-auto"><BudgetsPanel report={report} mission={mission} orbit={spacecraft.orbitAltitudeKm} onOrbit={setOrbit} /></Panel>
      </div>
    </Frame>
  );
}
