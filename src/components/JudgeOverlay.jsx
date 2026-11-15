import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect } from 'react';
import { useGame } from '../state/store.js';

const CAPTIONS = [
  "1/6 · Integration Bay. A nearly finished FloodWatch-1 CubeSat. HOUSTON's scan finds the one fault: the radio's antenna cable is missing. Press Space to plug it in.",
  '1/6 · Antenna cable connected. The wiring check is clean. Press Space to go to the rocket.',
  '2/6 · VAB. Joint 1 (stage 1 to interstage) was tightened clockwise in one pass and 3 bolts are missing. HOUSTON flags it. We launch anyway. Press Space.',
  '3/6 · Flight. Watch dynamic pressure climb towards max-Q…',
  '4/6 · Debrief. The causal timeline traces the loss to joint j_s1_interstage. Press Space to fix the joint and fly again.',
  '5/6 · Fixed: every joint torqued in star order over three passes. Second launch…',
  '6/6 · Orbit, deployment, 30 days of operations. The satellite photographs the 2022 Sindh floods. Press Space to finish.',
];

/** Judge Mode (Prompt 18): a scripted ~3-minute FloodWatch-1 story through the real rooms. Space = next step, Esc exits. */
export default function JudgeOverlay() {
  const judge = useGame((s) => s.judge);
  const screen = useGame((s) => s.screen);

  const start = useCallback(() => {
    const g = useGame.getState();
    if (g.judge) return;
    g.beginScript();
    g.applyDemo({ missingRf: true, badJoint: true, padReady: true });
    useGame.setState({ judge: { step: 0, autoLaunch: false } });
    g.go('bay');
  }, []);
  const exit = useCallback(() => {
    const g = useGame.getState();
    if (!g.judge) return;
    useGame.setState({ judge: null }); g.endScript(); g.go('menu');
  }, []);
  const setStep = (step, extra = {}) => useGame.setState((s) => ({ judge: { ...s.judge, step, ...extra } }));

  const next = useCallback(() => {
    const g = useGame.getState(); const step = g.judge?.step;
    if (step === 0) { g.addCable('radio_sband/RF', 'ant_patch/RF', false); setStep(1); }
    else if (step === 1) { g.go('vab'); setStep(2); }
    else if (step === 2) { g.commitLaunch(); setStep(3, { autoLaunch: true, fastAfter: 0 }); g.go('flight'); }
    else if (step === 4) { g.applyDemo({ padReady: true }); g.commitLaunch(); setStep(5, { autoLaunch: true, fastAfter: 130 }); g.go('flight'); }
    else if (step === 6) exit();
  }, [exit]);

  // Step transitions that happen by themselves: the flight ends and the debrief opens.
  useEffect(() => {
    if (!judge) return;
    if (judge.step === 3 && screen === 'debrief') setStep(4);
    if (judge.step === 5 && screen === 'debrief') setStep(6);
  }, [judge, screen]);

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'F9') return; // handled in HoustonPanel (opens Judge Mode)
      const j = useGame.getState().judge; if (!j) return;
      if (e.key === ' ' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target?.tagName)) { e.preventDefault(); next(); }
      else if (e.key === 'Escape' && j.step !== 1) exit();
    };
    window.addEventListener('keydown', key); window.addEventListener('tminus:judge', start);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('tminus:judge', start); };
  }, [next, exit, start]);

  return (
    <AnimatePresence>
      {judge && (
        <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} className="pointer-events-none fixed inset-x-0 bottom-5 z-[90] flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-4xl rounded-2xl bg-gradient-to-r from-[#ff7a1a] to-[#ff9a45] px-5 py-3 text-[#190a00] shadow-glow">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.2em]"><span>Judge Mode · Space: next · Esc: exit</span>
              <span className="flex gap-1">{CAPTIONS.map((_, i) => <span key={i} className={`h-1.5 w-5 rounded-full ${i <= judge.step ? 'bg-[#190a00]' : 'bg-[#190a00]/25'}`} />)}</span></div>
            <p className="mt-1 font-display text-lg font-bold leading-snug text-white drop-shadow">{CAPTIONS[Math.min(judge.step, CAPTIONS.length - 1)]}</p>
            <div className="mt-2 flex gap-2"><button className="btn btn-sm border-[#190a00]/30 bg-[#190a00] text-white hover:bg-black" onClick={next}>Next (Space)</button><button className="btn btn-sm border-[#190a00]/30 bg-white/25 text-[#190a00] hover:bg-white/40" onClick={exit}>Exit (Esc)</button></div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
