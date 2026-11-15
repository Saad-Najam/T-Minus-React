import { AnimatePresence, motion } from 'framer-motion';
import { GraduationCap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../state/store.js';
import { buildContext, nextStep } from '../engine/houston/advisor.js';
import { read, write } from '../state/persist.js';

// Port of FirstBuildGuide (audit F2): the first time a player enters the Integration Bay, the VAB or the Avionics Bay, a bar at the top shows
// the next step from HOUSTON's advisor, one at a time. After five steps it hands over. Guided steps are not counted as hints.
// Skip any time; Settings can replay it. Not shown in scripted demos, nor when HOUSTON is off.
const STEPS_TO_TEACH = 5;
const ROOMS = ['bay', 'vab', 'avionics'];
const key = (room) => `tminus.guide.done.${room}`;
export const guideDone = (room) => !!read(key(room), false);
export const markGuideDone = (room) => write(key(room), true);
export const resetGuides = () => ROOMS.forEach((r) => write(key(r), false));

export default function FirstBuildGuide({ room }) {
  const mode = useGame((s) => s.settings.houstonMode);
  const scripted = useGame((s) => !!s.backup || !!s.judge);
  const [active, setActive] = useState(() => ROOMS.includes(room) && !guideDone(room));
  const [text, setText] = useState('Starting the guided build…');
  const [ref, setRef] = useState(null); const [closing, setClosing] = useState(false);
  const last = useRef(null); const steps = useRef(0);

  useEffect(() => {
    if (!active || mode === 'Off' || scripted) return undefined;
    const tick = () => {
      const g = useGame.getState(); const rec = nextStep(buildContext(g, room)); if (!rec) return;
      setRef(rec.objectRef ?? null);
      if (rec.text !== last.current) { if (last.current != null) steps.current++; last.current = rec.text; }
      const allDone = rec.reasonCode?.endsWith('_ready');
      if (steps.current >= STEPS_TO_TEACH || allDone) {
        setText("You've got it. HOUSTON is on H whenever you want help, and N shows the next step."); setRef(null); markGuideDone(room); setClosing(true);
        setTimeout(() => setActive(false), 5000); return;
      }
      setText(`Guided build, step ${steps.current + 1} of ${STEPS_TO_TEACH}:  ${rec.text}`);
    };
    tick();
    const id = setInterval(() => { if (!closing) tick(); }, 700);
    return () => clearInterval(id);
  }, [active, mode, scripted, room, closing]);

  if (!active || mode === 'Off' || scripted) return null;
  return (
    <AnimatePresence>
      <motion.div initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -24, opacity: 0 }} className="pointer-events-none fixed inset-x-0 bottom-3 z-[45] flex justify-center px-3 lg:bottom-4 lg:justify-start lg:px-5" role="status">
        <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-b-2xl border border-t-[3px] border-line border-t-ok bg-[#050a16]/95 px-3 py-2 shadow-lg md:px-4 md:py-2.5">
          <GraduationCap size={20} className="hidden shrink-0 text-ok sm:block" />
          <p className="min-w-0 flex-1 text-[12px] leading-snug md:text-[14px]">{text}</p>
          {ref && <button className="btn btn-sm border-ok/50 text-ok" onClick={() => useGame.setState({ highlight: { ref, at: Date.now() } })}>Show me</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => { markGuideDone(room); setActive(false); }}>Skip tutorial</button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
