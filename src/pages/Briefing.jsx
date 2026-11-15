import { motion } from 'framer-motion';
import { ArrowRight, Check, Clipboard, Coins, Globe2, Scale, Target, Users, Weight } from 'lucide-react';
import { useEffect, useState } from 'react';
import Frame from '../components/Frame.jsx';
import { Panel } from '../components/ui.jsx';
import { TiltCard } from '../components/Motion.jsx';
import { useGame } from '../state/store.js';
import { isCubeSat } from '../engine/data.js';
import { openCodex } from '../components/HoustonPanel.jsx';
import { DATE, REGIONS, SOURCE_RESOLUTION_M, isBundled, selectRegion, selectedRegion } from '../engine/liveImagery.js';
import { attempts, bestOf, starText } from '../engine/missionLog.js';

const diffColor = { Beginner: 'text-ok', 'Beginner / Intermediate': 'text-ok', Intermediate: 'text-warn', Advanced: 'text-bad' };

export default function Briefing() {
  const { data, missionId, selectMission, vehicle, setLaunchSite, crew, setCrew, spacecraft, setOrbit, go, importCode, exportCode, say } = useGame();
  const missions = data.missions.filter((m) => !m.locked).sort((a, b) => (a.priority === 'P0' ? 0 : 1) - (b.priority === 'P0' ? 0 : 1));
  const mission = data.getMission(missionId) ?? missions[0];
  const [players, setPlayers] = useState([...new Set(crew.map((c) => c.name))]);
  const [code, setCode] = useState(''); const [paste, setPaste] = useState('');
  const [region, setRegion] = useState(() => selectedRegion().id);
  useEffect(() => { exportCode().then(setCode); }, [exportCode, spacecraft, vehicle, missionId]);
  const rules = data.getRules();
  const cube = isCubeSat(mission);
  const rocket = data.getRocket(mission.rocketOptions[0]);

  const start = () => { setCrew(players.filter(Boolean)); go(!cube ? 'vab' : 'bay'); };
  const setCount = (n) => { const p = Array.from({ length: n }, (_, i) => players[i] ?? `Player ${i + 1}`); setPlayers(p); };

  return (
    <Frame screen="briefing" title="Mission Briefing">
      <div className="grid min-h-0 gap-3 lg:h-full lg:grid-cols-[320px_minmax(0,1fr)_320px]">
        <Panel title="Choose a mission" className="min-h-0 lg:overflow-y-auto" pad={false}>
          <div className="space-y-2 p-3">
            {missions.map((m, i) => (
              <TiltCard as="button" key={m.id} max={4} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => selectMission(m.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${m.id === mission.id ? 'border-accent bg-accent/10 shadow-glow' : 'border-line bg-[#0a1226]/70 hover:border-cyanx/40'}`}>
                <div className="flex items-center gap-2"><span className="chip !px-2 !py-0.5">{m.priority}</span><span className={`text-[11px] font-semibold ${diffColor[m.difficulty] ?? 'text-mute'}`}>{m.difficulty}</span>{m.startHere && <span className="chip ml-auto border-accent/50 text-accent2">Start here</span>}</div>
                <div className="mt-1.5 font-display text-lg font-bold leading-tight">{m.name}</div>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-mute">{m.objective}</p>
                {bestOf(m.id) && <p className="mt-1.5 font-mono text-[11px] text-accent2">Best {bestOf(m.id).score.toFixed(1)} {starText(bestOf(m.id).stars)} · {attempts(m.id)} attempt{attempts(m.id) === 1 ? '' : 's'}</p>}
              </TiltCard>
            ))}
          </div>
        </Panel>

        <motion.div key={mission.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel relative flex min-h-0 flex-col overflow-y-auto p-5 md:p-7">
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-accent/10 to-transparent" />
          <div className="relative">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent2">{rocket?.name ?? 'Mission'} · {mission.payloadType === 'cubesat_3u' ? '3U CubeSat' : mission.payloadType}</div>
            <h2 className="mt-1 font-display text-4xl font-bold leading-none tracking-wide">{mission.name}</h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink/90">{mission.objective}</p>
            {mission.storyCard && <blockquote className="mt-4 max-w-2xl border-l-2 border-cyanx/60 pl-4 text-sm leading-relaxed text-mute">{mission.storyCard}</blockquote>}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[[Coins, 'Budget', mission.budgetMUSD ? `${mission.budgetMUSD} M$` : 'None'], [Weight, 'Mass limit', mission.massLimitKg ? `${mission.massLimitKg} kg` : '—'], [Globe2, 'Orbit', mission.parkingOrbitKm ? `${mission.parkingOrbitKm} km parking` : mission.targetApogeeKm ? `${mission.targetApogeeKm} km apogee` : `${spacecraft.orbitAltitudeKm} km`], [Scale, 'Duration', mission.durationDays ? `${mission.durationDays} days` : 'Flight only']].map(([Icon, label, v]) => (
                <div key={label} className="rounded-xl border border-line bg-[#0a1226]/70 p-3"><div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-mute"><Icon size={12} />{label}</div><div className="mt-1 font-display text-xl font-bold">{v}</div></div>
              ))}
            </div>

            <h3 className="panel-title mt-7 flex items-center gap-2"><Target size={14} />Success criteria</h3>
            <ul className="mt-2 space-y-2">{mission.successCriteria.map((c) => <li key={c.id} className="flex items-center gap-3 rounded-lg border border-line bg-[#0a1226]/60 px-3 py-2 text-sm"><span className="flex h-5 w-5 items-center justify-center rounded border border-mute/60 text-transparent"><Check size={12} /></span>{c.text}</li>)}</ul>

            {mission.scoring && <><h3 className="panel-title mt-7">How you are scored</h3>
              <div className="mt-2 flex flex-wrap gap-2">{Object.entries(mission.scoring).filter(([, v]) => v > 0).map(([k, v]) => <span key={k} className="chip">{k.replace(/([A-Z])/g, ' $1')} <b className="text-ink">{v}</b></span>)}</div></>}

            {mission.codexIds?.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{mission.codexIds.map((id) => data.getCodex(id) && <button key={id} className="chip hover:border-cyanx hover:text-ink" onClick={() => openCodex(id)}>📖 {data.getCodex(id).title}</button>)}</div>}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button className="btn btn-primary px-6 py-3 text-base" onClick={start}>{cube ? 'Start building' : 'Inspect the rocket'} <ArrowRight size={18} /></button>
              {mission.id === 'moonshot' && <span className="text-xs text-mute">Your one choice is the pitch kick. Stage figures come from Wikipedia's Saturn V article (see CREDITS).</span>}
            </div>
          </div>
        </motion.div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Panel title="Launch site">
            <div className="space-y-2">
              {mission.launchSites.map((id) => { const s = rules.getLaunchSite(id); return (
                <button key={id} onClick={() => setLaunchSite(id)} className={`w-full rounded-xl border p-3 text-left ${vehicle.launchSiteId === id ? 'border-accent bg-accent/10' : 'border-line hover:border-cyanx/40'}`}>
                  <div className="font-display text-base font-bold">{s.name}</div><div className="font-mono text-[11px] text-mute">{s.latitudeDeg.toFixed(1)}°N · Earth's spin gives {(7.2921159e-5 * 6371000 * Math.cos((s.latitudeDeg * Math.PI) / 180)).toFixed(0)} m/s eastward</div></button>
              ); })}
            </div>
            <button className="mt-2 text-[11px] text-cyanx hover:underline" onClick={() => openCodex('launching_east')}>Why launch east?</button>
          </Panel>
          {cube && (
            <Panel title="Target region">
              <div className="space-y-1.5">{REGIONS.map((r) => <button key={r.id} onClick={() => { selectRegion(r.id); setRegion(r.id); }} className={`w-full rounded-lg border px-3 py-1.5 text-left text-[12px] ${region === r.id ? 'border-accent bg-accent/10' : 'border-line hover:border-cyanx/40'}`}>{r.name}</button>)}</div>
              <p className="mt-2 text-[11px] leading-snug text-mute">{isBundled(selectedRegion()) ? 'The debrief shows the three bundled Landsat images of the Lake Manchar floods (works offline).' : `The debrief will also show a real NASA picture of ${selectedRegion().name} (MODIS, ${SOURCE_RESOLUTION_M} m per pixel, ${DATE}) if you are online.`}</p>
            </Panel>
          )}
          {cube && mission.orbitOptionsKm.length > 0 && (
            <Panel title="Target orbit"><div className="grid grid-cols-3 gap-2">{mission.orbitOptionsKm.map((km) => <button key={km} onClick={() => setOrbit(km)} className={`btn btn-sm ${spacecraft.orbitAltitudeKm === km ? 'border-accent bg-accent/15 text-accent2' : ''}`}>{km} km</button>)}</div></Panel>
          )}
          <Panel title="Crew" right={<Users size={14} className="text-mute" />}>
            <div className="mb-2 grid grid-cols-4 gap-1.5">{[1, 2, 3, 4].map((n) => <button key={n} className={`btn btn-sm !px-0 ${players.length === n ? 'border-accent bg-accent/15 text-accent2' : ''}`} onClick={() => setCount(n)}>{n}</button>)}</div>
            <div className="space-y-1.5">{players.map((p, i) => <input key={i} className="field !py-1.5" value={p} onChange={(e) => setPlayers(players.map((x, j) => (j === i ? e.target.value : x)))} onBlur={() => setCrew(players.filter(Boolean))} aria-label={`Player ${i + 1} name`} />)}</div>
            <ul className="mt-3 space-y-1 text-[11px] text-mute">{crew.map((c) => <li key={c.role} className="flex justify-between"><span>{c.role.replace(/([A-Z])/g, ' $1').trim()}</span><span className="text-ink">{c.name}</span></li>)}</ul>
            <p className="mt-2 text-[11px] text-mute">1–4 players share four roles. More real people score higher for collaboration.</p>
          </Panel>
          <Panel title="Design code">
            <p className="mb-2 text-[11px] text-mute">A shareable text code for your whole build (mission + CubeSat + rocket).</p>
            <div className="flex gap-2"><input className="field !py-1.5 font-mono text-[10px]" readOnly value={code} aria-label="Your design code" /><button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(code); say('Design code copied.', 'ok'); }}><Clipboard size={14} /></button></div>
            <div className="mt-2 flex gap-2"><input className="field !py-1.5 font-mono text-[10px]" placeholder="Paste a TM1- code…" value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Paste a design code" /><button className="btn btn-sm" onClick={async () => { if (await importCode(paste)) setPaste(''); }}>Load</button></div>
          </Panel>
        </div>
      </div>
    </Frame>
  );
}
