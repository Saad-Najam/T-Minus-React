import { Canvas } from '@react-three/fiber';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, ChevronsRight, FastForward, Pause, Play, Rocket, SkipForward } from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../state/store.js';
import { FlightSession } from '../engine/flightSession.js';
import { FlightPhase, C } from '../engine/flight/physics.js';
import { Severity } from '../engine/severity.js';
import FlightScene from '../three/FlightScene.jsx';
import { EngineSound, blip } from '../audio.js';
import { Panel } from '../components/ui.jsx';
import { Modal } from '../components/ui.jsx';
import { glProps, useQuality } from '../state/quality.js';

const MODES = [['chase', 'Chase'], ['ground', 'Ground'], ['map', 'Map']];
const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const km = (m) => fmt(m / 1000, 1);

function Num({ label, value, unit, tone = '' }) {
  return <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">{label}</div><div className={`hud-num mt-0.5 ${tone}`}>{value}<span className="ml-1 text-[11px] font-medium text-mute">{unit}</span></div></div>;
}

function Spark({ data, color, label, unit, fmtV }) {
  const w = 220; const h = 54; const max = Math.max(1e-6, ...data.map((d) => d.v)); const t1 = data.length ? data[data.length - 1].t : 1;
  const pts = data.map((d) => `${(d.t / Math.max(1, t1)) * w},${h - (d.v / max) * (h - 4) - 2}`).join(' ');
  return (
    <div><div className="flex justify-between text-[10px] uppercase tracking-wider text-mute"><span>{label}</span><span className="font-mono text-ink">{fmtV(data.length ? data[data.length - 1].v : 0)} {unit}</span></div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="mt-1 overflow-visible"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" /><line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="#1d2a4a" /></svg></div>
  );
}

/** Manual flight for touch screens as well as the keyboard: throttle and pitch sliders (A/D and Shift/Ctrl still work). */
function ManualControls({ man, onChange }) {
  return (
    <div className="space-y-2 rounded-xl border border-warn/30 bg-warn/5 p-2.5 text-[11px] text-mute">
      <label className="block"><span className="flex justify-between"><span>Throttle</span><b className="font-mono text-ink">{(man.throttle * 100).toFixed(0)}%</b></span><input type="range" className="mt-1 w-full" min="0" max="1" step="0.01" value={man.throttle} onChange={(e) => onChange({ ...man, throttle: +e.target.value })} aria-label="Throttle" /></label>
      <label className="block"><span className="flex justify-between"><span>Pitch (90° = up)</span><b className="font-mono text-ink">{man.pitch.toFixed(0)}°</b></span><input type="range" className="mt-1 w-full" min="0" max="180" step="1" value={man.pitch} onChange={(e) => onChange({ ...man, pitch: +e.target.value })} aria-label="Pitch" /></label>
      <div className="hidden md:block"><span className="kbd">A</span>/<span className="kbd">D</span> pitch · <span className="kbd">Shift</span>/<span className="kbd">Ctrl</span> throttle</div>
    </div>
  );
}

export default function Flight() {
  const store = useGame();
  const q = useQuality();
  const { data, missionId, spacecraft, vehicle, settings, judge, replay, flight } = store;
  const [mode, setMode] = useState('chase');
  const [hud, setHud] = useState(null);
  const [banner, setBanner] = useState(null);
  const [feed, setFeed] = useState([]);
  const [chart, setChart] = useState({ alt: [], q: [], v: [] });
  const [pre, setPre] = useState(true);
  const [kick, setKick] = useState(vehicle.pitchKickDeg || 3);
  const [ended, setEnded] = useState(null);
  const [xray, setXray] = useState(false);
  const [paused, setPaused] = useState(false);
  const [warp, setWarpState] = useState(1);
  const [auto, setAuto] = useState(true);
  const [manual, setManual] = useState({ throttle: 1, pitch: 90 });
  const engine = useRef(null); const lastBanner = useRef(null);
  const keys = useRef({});

  const session = useMemo(() => {
    const bundle = { missionId, spacecraft, vehicle: JSON.parse(JSON.stringify(vehicle)) };
    const s = new FlightSession(data, bundle, missionId, { replay, autoLaunch: !!judge?.autoLaunch || replay, warp: replay || judge ? 4 : 1 });
    if (replay) s.replaySlowFrom = Math.max(0, (flight.flightTimeS ?? 0) - 7);
    return s;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('hooks')) { window.__flight = session; return () => { if (window.__flight === session) delete window.__flight; }; } return undefined; }, [session]);

  // frame loop
  useEffect(() => {
    let raf; let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!session.sim.options.autopilot) {
        const k = keys.current; let { throttle, pitch } = manualRef.current;
        if (k.a || k.arrowleft) pitch += 30 * dt; if (k.d || k.arrowright) pitch -= 30 * dt;
        if (k.shift) throttle += 0.7 * dt; if (k.control) throttle -= 0.7 * dt;
        pitch = Math.max(0, Math.min(180, pitch)); throttle = Math.max(0, Math.min(1, throttle));
        manualRef.current = { throttle, pitch }; session.sim.setManualControl(throttle, pitch);
      }
      session.update(dt);
      if (judge?.fastAfter && session.launched && !session.ended && session.sim.timeS > judge.fastAfter) session.fastForward();
      const th = session.lastThrottle; engine.current?.set(session.launched && !session.ended ? th : 0, Math.max(0, (session.lastSample?.altitudeM ?? 0)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [session, judge]);
  const manualRef = useRef({ throttle: 1, pitch: 90 });

  useEffect(() => { engine.current = new EngineSound(settings.volume); return () => engine.current?.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { engine.current?.setVolume(settings.volume); }, [settings.volume]);

  // HUD snapshot at 10 Hz
  useEffect(() => {
    const id = setInterval(() => {
      const s = session.lastSample; const sim = session.sim;
      setHud({ t: sim.timeS, phase: sim.phase, s, twr: session.twr, countdown: session.countdown, launched: session.launched, stage: sim.stageIndex, mass: sim.massKg, man: { ...manualRef.current } });
      setFeed([...session.feed].slice(-7));
      if (session.banner && session.banner.id !== lastBanner.current) { lastBanner.current = session.banner.id; setBanner(session.banner); blip(settings.volume, session.banner.good ? 880 : 180, 0.2, session.banner.good ? 'sine' : 'sawtooth'); setTimeout(() => setBanner((b) => (b && b.id === session.banner?.id ? null : b)), 3200); }
      if (s && session.launched && !session.ended) {
        setChart((c) => { const n = { alt: [...c.alt], q: [...c.q], v: [...c.v] }; if (!n.alt.length || s.timeS - n.alt[n.alt.length - 1].t >= 1) { n.alt.push({ t: s.timeS, v: s.altitudeM / 1000 }); n.q.push({ t: s.timeS, v: s.dynamicPressurePa / 1000 }); n.v.push({ t: s.timeS, v: s.orbitalSpeedMs }); } return n; });
      }
    }, 100);
    return () => clearInterval(id);
  }, [session, settings.volume]);

  // end of flight
  useEffect(() => session.on((type, payload) => {
    if (type === 'launch') setPre(false);
    if (type === 'end') { if (!session.replay) useGame.getState().finishFlight(payload, session.events.all); setEnded(payload); }
  }), [session]);

  const toDebrief = useCallback(() => { useGame.setState({ replay: false }); useGame.getState().go('debrief'); }, []);
  useEffect(() => {
    if (!ended) return undefined;
    if (replay) return undefined;
    if (judge) { const t = setTimeout(toDebrief, ended.outcome === 'Orbit' ? 6500 : 5000); return () => clearTimeout(t); }
    return undefined;
  }, [ended, judge, replay, toDebrief]);
  useEffect(() => { if (judge?.autoLaunch || replay) { setPre(false); session.launch(session.sim.options.pitchKickDeg); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // keys
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase(); keys.current[k] = true;
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      if (k === 'c') setMode((m) => MODES[(MODES.findIndex((x) => x[0] === m) + 1) % MODES.length][0]);
      if (k >= '1' && k <= '4') { const w = [1, 2, 4, 100][+k - 1]; session.warp = w; setWarpState(w); }
      if (k === ' ' && !judge && session.launched) { e.preventDefault(); session.paused = !session.paused; setPaused(session.paused); }
    };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [session, judge]);

  const s = hud?.s;
  const stages = session.rocket.stages;
  const phaseLabel = { Pad: 'ON THE PAD', Ascent: 'ASCENT', Coast: 'COAST', Circularize: 'CIRCULARISE', Orbit: 'IN ORBIT', Failed: 'VEHICLE LOST', Aborted: 'ABORTED', Apogee: 'APOGEE' }[hud?.phase ?? 'Pad'];
  const bad = hud?.phase === FlightPhase.Failed || hud?.phase === FlightPhase.Aborted;
  const setWarp = (w) => { session.warp = w; setWarpState(w); };
  const toggleAuto = () => { const a = !auto; setAuto(a); session.sim.options.autopilot = a; if (!a) { manualRef.current = { throttle: 1, pitch: 90 }; session.sim.setManualControl(1, 90); } };
  const mission = data.getMission(missionId);

  return (
    <div className={`relative h-full overflow-hidden bg-black ${session.exploded != null && !ended ? 'shake' : ''}`}>
      <Canvas shadows={q.shadows} camera={{ position: [10, 3, 22], fov: 42, near: 0.5, far: 30000 }} dpr={q.dpr} gl={glProps()}>
        <Suspense fallback={null}><FlightScene session={session} mode={mode} xray={xray} settings={settings} /></Suspense>
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55))]" />
      {session.exploded != null && <div className="flash-red pointer-events-none absolute inset-0" />}

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 py-3">
        <button className="btn btn-sm" onClick={() => useGame.getState().go('pad')} disabled={session.launched && !session.ended}>← Pad</button>
        <div><div className="font-display text-lg font-bold leading-none tracking-wide">{mission?.name}</div><div className="text-[11px] text-mute">{session.rocket.name}</div></div>
        <div className={`chip ml-2 ${bad ? 'border-bad/60 text-bad' : hud?.phase === 'Orbit' ? 'border-ok/60 text-ok' : 'border-cyanx/50 text-cyanx'}`}>{phaseLabel}</div>
        <div className="hud-num ml-2 text-accent2">{hud && (hud.t >= 0 ? `T+${hud.t.toFixed(1)}s` : '')}</div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line bg-panel/80 p-0.5">{MODES.map(([id, label]) => <button key={id} onClick={() => setMode(id)} className={`rounded-lg px-3 py-1 font-display text-[13px] font-bold uppercase tracking-wider ${mode === id ? 'bg-accent/25 text-accent2' : 'text-mute hover:text-ink'}`}>{label}</button>)}</div>
          <span className="kbd">C</span>
          <div className="flex rounded-xl border border-line bg-panel/80 p-0.5">{[1, 2, 4, 100].map((w, i) => <button key={w} onClick={() => setWarp(w)} className={`rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${warp === w ? 'bg-cyanx/20 text-cyanx' : 'text-mute hover:text-ink'}`}>×{w}<span className="ml-0.5 text-[8px] opacity-60">{i + 1}</span></button>)}</div>
          <button className="btn btn-sm" onClick={() => { session.paused = !session.paused; setPaused(session.paused); }} disabled={!session.launched || ended}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>
          <button className="btn btn-sm" onClick={() => setXray((x) => !x)}>X-ray</button>
          {session.launched && !ended && <button className="btn btn-sm" onClick={() => session.fastForward()} title="Skip to the end of the flight"><SkipForward size={14} />Skip</button>}
        </div>
      {/* compact HUD for phones and small tablets */}
      <div className="w-full md:hidden [@media(max-height:560px)]:!block">
        <div className="panel grid grid-cols-4 gap-2 px-3 py-2">
          <Num label="Alt" value={s ? km(s.altitudeM) : '0.0'} unit="km" /><Num label="Speed" value={s ? fmt(s.surfaceSpeedMs) : '0'} unit="m/s" /><Num label="Q" value={s ? fmt(s.dynamicPressurePa / 1000, 1) : '0'} unit="kPa" /><Num label="Δv" value={s ? fmt(s.deltaVRemainingMs) : '—'} unit="m/s" />
        </div>
        <div className="mt-1.5 flex gap-1.5">{stages.map((st, i) => { const pct = s?.propellantPercent?.[i] ?? 100; return <div key={st.id} className="flex-1 rounded-lg border border-line bg-panel/80 px-2 py-1"><div className="flex justify-between text-[9px] uppercase tracking-wider text-mute"><span>{st.name}</span><span className="font-mono">{fmt(pct, 0)}%</span></div><div className="mt-0.5 h-1 overflow-hidden rounded-full bg-[#0b1430]"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div></div>; })}</div>
        {feed.length > 0 && <div className="mt-1.5 truncate rounded-lg border border-line/60 bg-panel/70 px-3 py-1 text-[11px]">{feed[feed.length - 1].text}</div>}
        <button className={`btn btn-sm mt-1.5 w-full ${auto ? '' : 'border-warn text-warn'}`} onClick={toggleAuto}>Autopilot {auto ? 'ON' : 'OFF'}</button>
        {!auto && <div className="mt-1.5"><ManualControls man={hud?.man ?? manual} onChange={(m) => { manualRef.current = m; session.sim.setManualControl(m.throttle, m.pitch); setManual(m); }} /></div>}
      </div>

      </div>

      {/* telemetry */}
      <div className="absolute bottom-24 left-4 z-20 hidden w-[230px] space-y-4 md:block [@media(max-height:560px)]:!hidden"><div className="panel space-y-4 p-4">
        <Num label="Altitude" value={s ? km(s.altitudeM) : '0.0'} unit="km" tone="text-ink" />
        <Num label="Surface speed" value={s ? fmt(s.surfaceSpeedMs) : '0'} unit="m/s" />
        <Num label="Orbital speed" value={s ? fmt(s.orbitalSpeedMs) : '0'} unit="m/s" />
        <Num label="Dynamic pressure (Q)" value={s ? fmt(s.dynamicPressurePa / 1000, 1) : '0.0'} unit="kPa" tone={s && s.dynamicPressurePa > 30000 ? 'text-warn' : ''} />
        <Num label="Acceleration" value={s ? fmt(s.accelerationG, 2) : '0.00'} unit="g" />
        <div className="space-y-2 border-t border-line/60 pt-3"><Spark data={chart.alt} color="#38d6ff" label="Altitude" unit="km" fmtV={(v) => fmt(v, 1)} /><Spark data={chart.q} color="#ff7a1a" label="Q" unit="kPa" fmtV={(v) => fmt(v, 1)} /><Spark data={chart.v} color="#4ade80" label="Speed" unit="m/s" fmtV={(v) => fmt(v)} /></div>
      </div></div>

      <div className="absolute bottom-24 right-4 z-20 hidden w-[250px] md:block [@media(max-height:560px)]:!hidden"><div className="panel space-y-3 p-4">
        <div className="panel-title">Propellant</div>
        {stages.map((st, i) => { const pct = s?.propellantPercent?.[i] ?? 100; const active = (hud?.stage ?? 0) === i; const gone = !session.sim.stageAttached(i);
          return <div key={st.id} className={gone ? 'opacity-35' : ''}><div className="flex justify-between text-[11px]"><span className={active ? 'font-bold text-accent2' : 'text-mute'}>{st.name}{active && hud?.launched ? ' ●' : ''}</span><span className="font-mono">{fmt(pct, 0)}%</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#0b1430]"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: active ? 'linear-gradient(90deg,#ff7a1a,#ffb36b)' : '#3a4a78' }} /></div></div>; })}
        <div className="grid grid-cols-2 gap-3 border-t border-line/60 pt-3">
          <Num label="Δv remaining" value={s ? fmt(s.deltaVRemainingMs) : '—'} unit="m/s" />
          <Num label="Throttle" value={s ? fmt(s.throttle * 100) : '0'} unit="%" />
          <Num label="Apoapsis" value={s && Number.isFinite(s.apoapsisM) ? km(s.apoapsisM - C.EarthRadiusM) : '—'} unit="km" />
          <Num label="Periapsis" value={s && Number.isFinite(s.periapsisM) && s.periapsisM > 0 ? km(s.periapsisM - C.EarthRadiusM) : '—'} unit="km" />
          <Num label="Thrust/weight" value={s ? fmt(s.thrustToWeight, 2) : '—'} unit="" />
          <Num label="Mass" value={hud ? fmt(hud.mass) : '—'} unit="kg" />
        </div>
        <button className={`btn btn-sm w-full ${auto ? '' : 'border-warn text-warn'}`} onClick={toggleAuto}>Autopilot {auto ? 'ON' : 'OFF'}</button>
        {!auto && <ManualControls man={hud?.man ?? manual} onChange={(m) => { manualRef.current = m; session.sim.setManualControl(m.throttle, m.pitch); setManual(m); }} />}
      </div></div>

      {/* feed */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-20 hidden w-[min(520px,45vw)] md:block"><ul className="space-y-1">
        {feed.slice(-4).map((f) => <li key={f.id} className={`rounded-lg border px-3 py-1 text-[12px] backdrop-blur ${f.severity >= Severity.Fault ? 'border-bad/40 bg-bad/15 text-bad' : f.severity === Severity.Warning ? 'border-warn/40 bg-warn/10 text-warn' : 'border-line/60 bg-panel/70'}`}><span className="mr-2 font-mono text-[10px] text-mute">T+{f.t.toFixed(0)}s</span>{f.text}</li>)}</ul></div>

      {/* banner & countdown */}
      <AnimatePresence>
        {banner && <motion.div key={banner.id} initial={{ y: -20, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center">
          <div className={`rounded-2xl border px-8 py-3 font-display text-3xl font-bold uppercase tracking-[0.2em] backdrop-blur ${banner.good ? 'border-accent/60 bg-black/50 text-accent2 shadow-glow' : 'border-bad/60 bg-bad/20 text-bad'}`}>{banner.text}</div></motion.div>}
      </AnimatePresence>
      {hud?.countdown != null && hud.countdown >= 0 && !hud.launched && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"><motion.div key={hud.countdown} initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-[10rem] font-bold text-accent text-glow">{hud.countdown > 0 ? hud.countdown : 'T-0'}</motion.div></div>}

      {/* prelaunch */}
      <AnimatePresence>
        {pre && !ended && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} className="absolute inset-x-0 bottom-6 z-30 flex justify-center px-4">
            <div className="panel max-h-[78vh] w-full max-w-xl space-y-3 overflow-y-auto p-4 md:space-y-4 md:p-5">
              <div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold">Terminal count</h2><span className="chip border-ok/50 text-ok">Checks green</span></div>
              <div className="grid grid-cols-3 gap-4"><Num label="Thrust / weight" value={fmt(session.twr, 2)} unit="" tone={session.twr < 1 ? 'text-bad' : 'text-ok'} /><Num label="Lift-off mass" value={fmt(session.sim.massKg)} unit="kg" /><Num label="Target" value={mission?.targetApogeeKm ? `${mission.targetApogeeKm}` : fmt(session.sim.options.targetAltitudeKm)} unit="km" /></div>
              <div><div className="mb-1 flex justify-between text-xs"><span className="text-mute">Pitch kick (how far the rocket tips over right after liftoff)</span><span className="font-mono">{kick.toFixed(1)}°</span></div><input type="range" className="w-full" min={0} max={10} step={0.5} value={kick} onChange={(e) => setKick(+e.target.value)} aria-label="Pitch kick" /></div>
              <div className="flex gap-2"><button className="btn btn-primary flex-1 py-3" onClick={() => { session.startCountdown(kick); setPre(false); }}><Rocket size={17} />Start countdown (T-10)</button><button className="btn" onClick={() => { session.sim.options.pitchKickDeg = kick; setPre(false); session.launch(kick); }}><ChevronsRight size={16} />Launch now</button></div>
              <p className="text-[11px] text-mute">Autopilot flies a gravity turn: straight up, then tip over gradually. <span className="kbd">1</span>–<span className="kbd">4</span> change time warp, <span className="kbd">C</span> cycles the camera.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* end of flight */}
      <Modal open={!!ended && !replay} onClose={() => {}} title={ended?.outcome === 'Orbit' ? 'Orbit achieved' : ended?.outcome === 'Apogee' ? 'Apogee reached' : ended?.outcome === 'Aborted' ? 'Launch aborted' : 'Vehicle lost'}
        footer={<><button className="btn" onClick={() => useGame.getState().go('vab')}>Back to the VAB</button><button className="btn btn-primary" onClick={toDebrief}>Continue to the debrief <ChevronsRight size={16} /></button></>}>
        {ended && <div className="space-y-3"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Num label="Flight time" value={fmt(ended.flightTimeS)} unit="s" /><Num label="Max-Q" value={fmt(ended.maxQKPa, 1)} unit="kPa" /><Num label="Apoapsis" value={fmt(ended.apoapsisKm)} unit="km" /><Num label="Periapsis" value={fmt(ended.periapsisKm)} unit="km" /></div>
          {ended.failureCode && <p className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm"><b className="font-mono">{ended.failureCode}</b>{ended.failureCause ? ` · cause: ${ended.failureCause}` : ''}</p>}
          <p className="text-sm text-mute">The debrief traces what happened second by second and explains the cause.</p></div>}
      </Modal>
      {replay && (
        <div className="absolute inset-x-3 bottom-4 z-30 mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-line bg-panel/90 px-4 py-3 backdrop-blur">
          <button className="btn btn-sm" onClick={() => { session.paused = !session.paused; setPaused(session.paused); }}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>
          <input type="range" className="flex-1" min={0} max={Math.max(1, Math.floor(flight.flightTimeS))} step={1} value={Math.min(Math.floor(session.sim.timeS), Math.floor(flight.flightTimeS))} aria-label="Scrub the replay" onChange={(e) => { session.seek(+e.target.value); setPaused(true); setEnded(null); }} />
          <span className="w-20 text-right font-mono text-xs text-mute">T+{(hud?.t ?? 0).toFixed(0)}s</span>
          <button className="btn btn-primary btn-sm" onClick={toDebrief}>Back to the debrief</button>
        </div>
      )}
      {hud?.phase === 'Orbit' && mode === 'chase' && null}
    </div>
  );
}
