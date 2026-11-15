import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Check, FlaskConical, Timer, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../components/ui.jsx';
import { useGame } from '../state/store.js';
import { APOLLO, ApolloRun, describeFault, failureJobs } from '../engine/failureLab.js';

const garbage = () => Array.from({ length: 6 }, () => '#%&*0123456789XZ?'[Math.floor(Math.random() * 17)]).join('');

/** Apollo 12, 14 Nov 1969: you are EECOM after the lightning strikes. 20 seconds per call; every pick explains itself. */
function ApolloConsole({ job, onClose }) {
  const run = useRef(new ApolloRun()); const reduce = useGame((s) => s.settings.reduceMotion);
  const [, force] = useState(0); const [t, setT] = useState(APOLLO.startT); const [left, setLeft] = useState(APOLLO.window);
  const t0 = useRef(performance.now()); const stepStart = useRef(-1); const [flash, setFlash] = useState(false); const [done, setDone] = useState(false); const [tick, setTick] = useState(0);
  const struck = t >= APOLLO.strikeT;
  useEffect(() => {
    const id = setInterval(() => {
      const now = (performance.now() - t0.current) / 1000 + APOLLO.startT; setT(now); setTick((k) => k + 1);
      const st = now >= APOLLO.strikeT; if (st && stepStart.current < 0) stepStart.current = performance.now();
      const l = st ? APOLLO.window - (performance.now() - stepStart.current) / 1000 : APOLLO.window; setLeft(l);
      setFlash((now >= APOLLO.strikeT && now < APOLLO.strikeT + 0.4) || (now >= APOLLO.secondStrikeT && now < APOLLO.secondStrikeT + 0.4));
      const r = run.current;
      if (st && l <= 0 && r.step <= 2) {
        r.timedOut = true; const right = job.consoleChoices.find((c) => c.correctAtStep === r.step);
        r.feedback = `Out of time. The call was "${right?.label}". ${right?.why}`; r.bad = true; r.step++; stepStart.current = performance.now(); force((x) => x + 1);
        if (r.step > 2) finish();
      }
    }, 100);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = () => { setDone(true); useGame.getState().events.add('failure_lab', 'job_complete', `${job.id}: ${run.current.wrong} wrong calls, timed out=${run.current.timedOut}, ${run.current.score(job.rewardPoints)} pts`, job.id); };
  const pick = (c) => {
    const r = run.current; if (r.step > 2 || !struck) return;
    const right = r.pick(c); r.bad = !right; if (right) stepStart.current = performance.now(); force((x) => x + 1); if (r.step > 2) finish();
  };
  const r = run.current;
  return (
    <div className={`panel relative mx-auto w-full max-w-4xl overflow-hidden p-5 md:p-7 ${flash && !reduce ? 'flash-red' : ''}`}>
      <div className="flex items-center gap-3"><span className="chip border-bad/50 text-bad">EECOM · MISSION CONTROL</span><button className="btn btn-ghost btn-sm ml-auto" onClick={onClose}>Leave ✕</button></div>
      <div className="mt-4 font-mono text-2xl font-bold tabular-nums text-accent2">T+{t.toFixed(1)} s · ALT {(t * t * 0.0055).toFixed(1)} km<span className="ml-3 text-sm text-mute">{r.step > 2 ? 'all systems restored' : struck ? `DECIDE: ${Math.max(0, left).toFixed(0)} s` : 'nominal ascent'}</span></div>
      <p className="mt-2 text-[15px]">{r.step > 2 ? 'Telemetry and power are back. The Saturn V never stopped flying.' : struck ? 'LIGHTNING. Fuel cells offline, caution lights everywhere, telemetry is garbage. What\'s your call, EECOM?' : job.clientNote}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{APOLLO.lights.map((n, i) => { const on = struck && (r.step === 1 || (r.step === 2 && i < 3) || (i === APOLLO.lights.length - 1 && r.step < 3)) && (Math.floor(t * 3) + i) % 4 !== 0;
          return <div key={n} className={`rounded-lg border px-2 py-2 text-center font-mono text-[11px] font-bold transition ${on ? 'border-warn bg-warn/25 text-warn' : 'border-line bg-[#0a1226] text-mute'}`}>{on ? '▲ ' : ''}{n}</div>; })}</div>
        <div className="rounded-xl border border-line bg-black/50 p-3 font-mono text-[12px]">{APOLLO.tlm.map(([name, ok], i) => <div key={name} className="flex justify-between"><span className="text-mute">{name}</span><span className={!struck || r.step > 2 ? 'text-ok' : r.step === 1 ? 'text-bad' : i < 4 ? 'text-bad' : 'text-ok'}>{!struck ? ok : r.step === 1 ? garbage() : i < 4 && r.step === 2 ? 'OFFLINE' : ok}</span></div>)}<span className="hidden">{tick}</span></div>
      </div>
      {r.feedback && <p className={`mt-4 rounded-xl border p-3 text-sm ${r.bad ? 'border-bad/40 bg-bad/10' : 'border-ok/40 bg-ok/10'}`}>{r.bad ? '✗ ' : '✓ '}{r.feedback}</p>}
      {!done ? <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">{job.consoleChoices.map((c) => <button key={c.id} disabled={!struck} onClick={() => pick(c)} className="btn justify-start py-3 font-mono text-sm">{c.label}</button>)}</div> : (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 p-4"><div className="font-display text-xl font-bold">JOB DEBRIEF · {r.score(job.rewardPoints)} / {job.rewardPoints} pts · {r.wrong} wrong call{r.wrong === 1 ? '' : 's'}{r.timedOut ? ' · ran out of time' : ''}</div><p className="mt-2 text-sm text-ink/90">{job.lesson}</p><p className="mt-1 text-xs text-mute">Read more in the Space Guide: Apollo 12 lightning strike.</p><button className="btn btn-primary btn-sm mt-3" onClick={onClose}>Back to the job board</button></div>
      )}
    </div>
  );
}

export default function FailureLab() {
  const { data, go, startJob } = useGame();
  const jobs = useMemo(() => failureJobs(data), [data]); const [apollo, setApollo] = useState(null);
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line/70 bg-[#050a16]/85 px-4 py-3"><button className="btn btn-ghost btn-sm" onClick={() => go('menu')}><ArrowLeft size={16} />Menu</button><FlaskConical className="text-accent" size={20} /><h1 className="font-display text-2xl font-bold tracking-wide">Failure Lab</h1></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
        {apollo ? <ApolloConsole job={apollo} onClose={() => setApollo(null)} /> : (
          <div className="mx-auto max-w-5xl">
            <p className="max-w-2xl text-[15px] text-mute">Repair jobs from real spaceflight history. Find what's broken, fix it, learn why it matters. HOUSTON can help, but every hint costs points.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {jobs.map((job, i) => (
                <motion.div key={job.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="panel flex flex-col p-5">
                  <div className="flex items-center gap-2"><span className={`chip ${job.difficulty === 'Beginner' ? 'text-ok' : 'text-warn'}`}>{job.difficulty}</span><span className="chip">{job.consoleChoices.length ? <><Timer size={11} />console</> : <><Zap size={11} />{job.seededFaults.length} faults</>}</span><span className="ml-auto font-mono text-sm text-accent2">{job.rewardPoints} pts</span></div>
                  <h3 className="mt-3 font-display text-2xl font-bold leading-tight">{job.name.replace('Failure Lab: ', '')}</h3>
                  <p className="mt-1 text-sm text-ink/90">{job.objective}</p>
                  <p className="mt-3 rounded-lg border-l-2 border-accent bg-accent/5 px-3 py-2 text-[13px] italic text-mute">Client note: {job.clientNote ?? job.objective}</p>
                  <button className="btn btn-primary mt-4 self-start" onClick={() => (job.consoleChoices.length ? setApollo(job) : startJob(job))}>Take the job ›</button>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The job sheet shown over the VAB / Avionics Bay: faults fixed so far, and the hand-back debrief. */
export function JobBar() {
  const job = useGame((s) => s.job); const screen = useGame((s) => s.screen); const vehicle = useGame((s) => s.vehicle); const settings = useGame((s) => s.settings);
  const [result, setResult] = useState(null);
  useEffect(() => { const h = () => setResult(useGame.getState().handBackJob()); window.addEventListener('tminus:handback', h); return () => window.removeEventListener('tminus:handback', h); }, []);
  if (!job || !['vab', 'avionics', 'pad', 'bay'].includes(screen)) return null;
  const p = useGame.getState().jobProgress(); if (!p) return null;
  const hints = settings.hintsUsed.reduce((a, b) => a + b, 0) - job.hintsAtStart;
  void vehicle;
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-[62px] z-[50] flex justify-center px-4"><div className="pointer-events-auto flex max-w-2xl items-center gap-3 rounded-xl border border-line bg-[#050a16]/95 px-4 py-2 text-xs shadow-lg">
        <FlaskConical size={15} className="text-accent" /><div><div className="font-display text-sm font-bold uppercase tracking-wide">JOB · {p.def.name.replace('Failure Lab: ', '')} · faults fixed {p.fixed}/{p.total} · HOUSTON hints {hints}</div><div className="text-mute">Bolts: VAB bolt tool. Cables: Avionics Bay. HOUSTON's Scan helps, at a cost.</div></div>
        <button className="btn btn-primary btn-sm" onClick={() => setResult(useGame.getState().handBackJob())}>Hand it back</button></div></div>
      <Modal open={!!result} onClose={() => {}} title={`Job debrief · ${result?.def.name.replace('Failure Lab: ', '') ?? ''}`} wide
        footer={<button className="btn btn-primary" onClick={() => { setResult(null); useGame.getState().endJob(); useGame.getState().go('failure'); }}>Back to the job board</button>}>
        {result && <div className="space-y-4"><p className="text-lg"><b>{result.fixed} of {result.def.seededFaults.length}</b> faults fixed in {result.minutes.toFixed(1)} min · {result.hints} HOUSTON hint{result.hints === 1 ? '' : 's'} · <b className="text-accent2">{result.score} / {result.def.rewardPoints} pts</b></p>
          <ul className="space-y-2">{result.def.seededFaults.map((f, i) => <li key={f} className={`flex gap-3 rounded-xl border p-3 text-sm ${result.fixedList[i] ? 'border-ok/40 bg-ok/10' : 'border-bad/40 bg-bad/10'}`}>{result.fixedList[i] ? <Check size={18} className="shrink-0 text-ok" /> : <X size={18} className="shrink-0 text-bad" />}<span><b>{result.fixedList[i] ? 'FIXED' : 'STILL BROKEN'}</b> · {describeFault(f, result.rules)}</span></li>)}</ul>
          <p className="text-sm text-mute">How you found them: {result.hints === 0 ? 'on your own, with the inspection tools.' : `with ${result.hints} HOUSTON hint${result.hints > 1 ? 's' : ''}.`}</p>
          <p className="rounded-xl border-l-2 border-accent bg-accent/5 p-3 text-sm"><b>The lesson:</b> {result.def.lesson}</p></div>}
      </Modal>
    </>
  );
}
export { AlertTriangle };
