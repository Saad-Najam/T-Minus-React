import { Canvas } from '@react-three/fiber';
import { motion } from 'framer-motion';
import { BookOpen, Download, FlaskConical, Gavel, Play, Rocket, Settings as Cog, Sparkles, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useGame } from '../state/store.js';
import { SpaceBackdrop } from '../three/Earth3D.jsx';
import Effects from '../three/Effects.jsx';
import { Modal } from '../components/ui.jsx';
import { glProps, useQuality } from '../state/quality.js';

const item = { hidden: { opacity: 0, x: -24 }, show: (i) => ({ opacity: 1, x: 0, transition: { delay: 0.25 + i * 0.07, duration: 0.45, ease: 'easeOut' } }) };

function MenuButton({ i, icon: Icon, title, sub, onClick, primary, disabled }) {
  return (
    <motion.button custom={i} variants={item} initial="hidden" animate="show" onClick={onClick} disabled={disabled}
      className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border px-4 py-3 text-left transition disabled:opacity-40 ${primary ? 'border-accent/60 bg-gradient-to-r from-accent/25 to-accent/5 shadow-glow hover:from-accent/40' : 'border-line/80 bg-panel/60 hover:border-cyanx/50 hover:bg-panel2/80'}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${primary ? 'bg-accent text-[#1b0b00]' : 'bg-[#0d1731] text-cyanx group-hover:text-accent2'}`}><Icon size={20} /></span>
      <span className="min-w-0">
        <span className="block font-display text-lg font-bold uppercase leading-tight tracking-wider">{title}</span>
        <span className="block truncate text-xs text-mute">{sub}</span>
      </span>
      <span className="absolute inset-y-0 right-0 w-1 bg-accent opacity-0 transition group-hover:opacity-100" />
    </motion.button>
  );
}

export default function MainMenu() {
  const { data, go, selectMission, continueSave, hasSave, saveDescription, importCode, applyDemo, say } = useGame();
  const q = useQuality();
  const [loadOpen, setLoadOpen] = useState(false);
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(null);
  useEffect(() => { setSaved(hasSave() ? saveDescription() : null); }, [hasSave, saveDescription]);

  const startJudge = () => window.dispatchEvent(new CustomEvent('tminus:judge'));
  const sandbox = () => { selectMission('sandbox'); go('bay'); };
  const doContinue = async () => { if (await continueSave()) go('briefing'); else say('There is no saved build to continue.', 'warn'); };

  return (
    <div className="relative h-full overflow-hidden">
      <Canvas className="!absolute inset-0" camera={{ position: [0, 0, 9], fov: 42 }} dpr={q.dpr} gl={glProps()}>
        <SpaceBackdrop data={data} />
        <Effects bloom={0.8} threshold={0.7} vignette={0.7} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#02040a] via-[#02040a]/70 to-transparent" />
      <div className="pointer-events-none absolute inset-0 scan-grid opacity-40 [mask-image:linear-gradient(90deg,black,transparent_60%)]" />

      <div className="relative z-10 flex h-full flex-col justify-between overflow-y-auto p-6 md:p-10 lg:p-14">
        <div className="max-w-xl">
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="chip border-accent/40 text-accent2"><Rocket size={12} /> NASA Space Apps Challenge 2026 · Space Mission Design Game</motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 font-display text-6xl font-bold uppercase leading-[0.9] tracking-[0.06em] text-glow md:text-8xl">
            T<span className="text-accent">–</span>MINUS
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-3 max-w-md text-[15px] leading-relaxed text-mute">
            Build a 3U CubeSat and its rocket part by part. Torque every bolt, wire every cable, launch with real physics, operate for 30 days — and learn why every mission succeeds or fails.
          </motion.p>
        </div>

        <div className="mt-8 grid max-w-xl gap-2.5">
          {saved && <MenuButton i={0} icon={Play} primary title="Continue" sub={`Your last build · ${saved}`} onClick={doContinue} />}
          <MenuButton i={1} icon={Rocket} primary={!saved} title="Missions" sub="FloodWatch-1, Moonshot, Rehbar-I 1962" onClick={() => go('briefing')} />
          <MenuButton i={2} icon={Gavel} title="Judge Mode" sub="A 3-minute guided story · press F9 anywhere" onClick={startJudge} />
          <MenuButton i={3} icon={FlaskConical} title="Failure Lab" sub="Repair jobs from real spaceflight history" onClick={() => go('failure')} />
          <MenuButton i={4} icon={BookOpen} title="Space Guide" sub="28 searchable science topics, each with its source" onClick={() => go('guide')} />
          <div className="grid grid-cols-3 gap-2.5">
            <motion.button custom={5} variants={item} initial="hidden" animate="show" className="btn" onClick={sandbox}><Wrench size={15} />Sandbox</motion.button>
            <motion.button custom={6} variants={item} initial="hidden" animate="show" className="btn" onClick={() => setLoadOpen(true)}><Download size={15} />Load code</motion.button>
            <motion.button custom={7} variants={item} initial="hidden" animate="show" className="btn" onClick={() => go('settings')}><Cog size={15} />Settings</motion.button>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-3 text-[11px] text-mute">
          <span className="flex items-center gap-2"><Sparkles size={12} className="text-accent" />Works fully offline · Ages 12+ · Not affiliated with or endorsed by NASA</span>
          <span>Earth: NASA Blue Marble, NASA Earth Observatory · Landsat: NASA/USGS</span>
        </div>
      </div>

      <Modal open={loadOpen} onClose={() => setLoadOpen(false)} title="Load a design code"
        footer={<><button className="btn" onClick={() => setLoadOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={async () => { if (await importCode(code)) { setLoadOpen(false); go('briefing'); } }}>Load design</button></>}>
        <p className="mb-3 text-sm text-mute">Paste a <span className="kbd">TM1-…</span> code from a teammate (or from the Unity version of T-MINUS). It restores the mission, the CubeSat and the rocket.</p>
        <textarea className="field h-36 font-mono text-xs" value={code} onChange={(e) => setCode(e.target.value)} placeholder="TM1-H4sIAAAAAAAA…" aria-label="Design code" />
        <button className="btn btn-sm mt-3" onClick={() => { applyDemo({ padReady: true }); setLoadOpen(false); say('Loaded the flight-ready demo build.', 'ok'); go('briefing'); }}>…or load the flight-ready demo build</button>
      </Modal>
    </div>
  );
}
