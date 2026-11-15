import { motion } from 'framer-motion';
import { ArrowLeft, Bot, Menu } from 'lucide-react';
import { useGame } from '../state/store.js';
import { isCubeSat } from '../engine/data.js';

const STEPS = [
  { id: 'briefing', label: 'Briefing' },
  { id: 'bay', label: 'Integration Bay', cube: true },
  { id: 'vab', label: 'VAB' },
  { id: 'avionics', label: 'Avionics', build: true },
  { id: 'pad', label: 'Pad' },
  { id: 'flight', label: 'Flight' },
  { id: 'debrief', label: 'Debrief' },
];

/** Top bar shared by every game room: the mission loop as a stepper, mission name and HOUSTON toggle. */
export default function Frame({ screen, title, children, right, noPad = false }) {
  const go = useGame((s) => s.go);
  const data = useGame((s) => s.data);
  const missionId = useGame((s) => s.missionId);
  const vehicle = useGame((s) => s.vehicle);
  const job = useGame((s) => s.job);
  const mission = data.getMission(missionId);
  const rocket = data.getRocket(vehicle.rocketId);
  const steps = STEPS.filter((s) => (!s.cube || isCubeSat(mission)) && (!s.build || rocket?.buildable));
  const activeIdx = steps.findIndex((s) => s.id === screen);
  const openPause = () => window.dispatchEvent(new CustomEvent('tminus:pause'));
  const toggleHouston = () => window.dispatchEvent(new CustomEvent('tminus:houston'));
  return (
    <div className="relative flex h-full flex-col">
      <header className="relative z-30 flex shrink-0 items-center gap-3 border-b border-line/70 bg-[#050a16]/85 px-3 py-2 backdrop-blur md:px-5">
        <button className="btn btn-ghost btn-sm" onClick={() => go('menu')} aria-label="Main menu"><ArrowLeft size={16} /><span className="hidden md:inline">Menu</span></button>
        <div className="hidden min-w-0 md:block">
          <div className="font-display text-lg font-bold leading-none tracking-wide">{title}</div>
          <div className="mt-0.5 truncate text-[11px] text-mute">{job ? `JOB · ${data.getMission(job.id)?.name.replace('Failure Lab: ', '')}` : mission?.name}</div>
        </div>
        <nav className="mx-auto flex min-w-0 items-center gap-1 overflow-x-auto px-2" aria-label="Mission steps">
          {steps.map((s, i) => {
            const active = i === activeIdx; const done = i < activeIdx;
            return (
              <button key={s.id} onClick={() => go(s.id)} disabled={s.id === 'flight' || s.id === 'debrief'} aria-current={active ? 'step' : undefined}
                className={`relative flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 font-display text-[13px] font-semibold uppercase tracking-wider transition ${active ? 'text-ink' : done ? 'text-ok/90 hover:text-ink' : 'text-mute hover:text-ink'} disabled:cursor-default disabled:hover:text-mute`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${active ? 'border-accent bg-accent text-[#1b0b00]' : done ? 'border-ok/60 text-ok' : 'border-line'}`}>{done ? '✓' : i + 1}</span>
                <span className="hidden lg:inline">{s.label}</span>
                {active && <motion.span layoutId="step-underline" className="absolute inset-x-2 -bottom-[9px] h-[2px] rounded bg-accent shadow-glow" />}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {right}
          <button className="btn btn-sm" onClick={toggleHouston} title="HOUSTON (H)"><Bot size={15} className="text-cyanx" /><span className="hidden md:inline">HOUSTON</span><span className="kbd hidden md:inline-flex">H</span></button>
          <button className="btn btn-ghost btn-sm" onClick={openPause} aria-label="Menu (P)"><Menu size={16} /></button>
        </div>
      </header>
      <main className={`relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden lg:overflow-hidden ${noPad ? '' : 'p-3 md:p-4'}`}>{children}</main>
    </div>
  );
}
