import { ArrowLeft, Bot, Globe, Maximize, Monitor, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Panel } from '../components/ui.jsx';
import { useGame } from '../state/store.js';
import { loadLlmConfig, saveLlmConfig } from '../engine/houston/llm.js';
import { remove, KEYS } from '../state/persist.js';
import { resetGuides } from '../components/FirstBuildGuide.jsx';

function Seg({ value, options, onChange }) {
  return <div className="inline-flex rounded-xl border border-line bg-[#070d1c] p-0.5">{options.map(([v, label]) => <button key={v} onClick={() => onChange(v)} className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${value === v ? 'bg-accent/20 text-accent2 ring-1 ring-accent/40' : 'text-mute hover:text-ink'}`}>{label}</button>)}</div>;
}
const Row = ({ icon: Icon, title, hint, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/50 py-4 last:border-0"><div className="flex min-w-0 items-start gap-3"><Icon size={18} className="mt-0.5 text-cyanx" /><div><div className="font-semibold">{title}</div>{hint && <div className="text-xs text-mute">{hint}</div>}</div></div>{children}</div>
);

export default function Settings() {
  const { settings, setSettings, go, say } = useGame();
  const [cfg, setCfg] = useState({ enabled: false, endpointUrl: '', clientToken: '', timeoutSec: 15 });
  useEffect(() => { loadLlmConfig().then((c) => setCfg((x) => ({ ...x, ...c }))); }, []);
  const fullscreen = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch { say('Fullscreen is not available here.', 'warn'); } };
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line/70 bg-[#050a16]/85 px-4 py-3"><button className="btn btn-ghost btn-sm" onClick={() => go('menu')}><ArrowLeft size={16} />Menu</button><h1 className="font-display text-2xl font-bold tracking-wide">Settings</h1></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8"><div className="mx-auto grid max-w-3xl gap-4">
        <Panel title="HOUSTON" pad={false}><div className="px-5">
          <Row icon={Bot} title="Assistant" hint="On: full help. Hints only: it answers questions but does not explain unprompted. Off: no help (the challenge mode).">
            <Seg value={settings.houstonMode} onChange={(v) => setSettings({ houstonMode: v })} options={[['On', 'On'], ['HintsOnly', 'Hints only'], ['Off', 'Off']]} /></Row>
          <Row icon={Globe} title="Language" hint="HOUSTON answers in Urdu (experimental: needs the AI service). The interface stays in English.">
            <Seg value={settings.language} onChange={(v) => setSettings({ language: v })} options={[['en', 'English'], ['ur', 'اردو']]} /></Row>
        </div></Panel>
        <Panel title="Sound & display" pad={false}><div className="px-5">
          <Row icon={Volume2} title="Volume"><div className="flex items-center gap-3"><input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(e) => setSettings({ volume: +e.target.value })} className="w-52" aria-label="Volume" /><span className="w-10 font-mono text-sm">{Math.round(settings.volume * 100)}%</span></div></Row>
          <Row icon={Monitor} title="Graphics quality" hint="Lower it on an older laptop or phone. Low turns off shadows and renders at reduced resolution."><Seg value={settings.quality} onChange={(v) => setSettings({ quality: v })} options={[['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} /></Row>
          <Row icon={Maximize} title="Fullscreen"><button className="btn btn-sm" onClick={fullscreen}>Toggle fullscreen</button></Row>
          <Row icon={Monitor} title="Reduce motion" hint="Removes screen shake, flashes and long animations."><Seg value={settings.reduceMotion ? 'on' : 'off'} onChange={(v) => setSettings({ reduceMotion: v === 'on' })} options={[['off', 'Off'], ['on', 'On']]} /></Row>
        </div></Panel>
        <Panel title="HOUSTON AI service (optional)">
          <p className="mb-3 text-sm text-mute">HOUSTON always works offline. To get natural-language explanations, point this at the T-MINUS proxy (the <span className="font-mono">proxy/</span> folder of the original project, deployed on Vercel). No API keys are stored in this app.</p>
          <div className="grid gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />Use the AI service</label>
            <input className="field font-mono text-xs" placeholder="https://YOUR-PROJECT.vercel.app/api/houston" value={cfg.endpointUrl} onChange={(e) => setCfg({ ...cfg, endpointUrl: e.target.value })} aria-label="Proxy endpoint URL" />
            <input className="field font-mono text-xs" placeholder="Client token (optional)" value={cfg.clientToken} onChange={(e) => setCfg({ ...cfg, clientToken: e.target.value })} aria-label="Client token" />
            <div><button className="btn btn-primary btn-sm" onClick={() => { saveLlmConfig(cfg); say('Saved. HOUSTON will use the service for free questions and debrief wording.', 'ok'); }}>Save</button></div></div>
        </Panel>
        <Panel title="Guided first build">
          <p className="mb-3 text-sm text-mute">The first time you enter the Integration Bay, the VAB or the Avionics Bay, HOUSTON walks you through five steps. Replay it any time.</p>
          <button className="btn btn-sm" onClick={() => { resetGuides(); say('The guided first build will start again in each room.', 'ok'); }}>Replay the guided first build</button>
        </Panel>
        <Panel title="Your data"><p className="mb-3 text-sm text-mute">Your build, settings and Space Guide progress live in this browser only. Clearing site data erases them; design codes are the backup.</p>
          <button className="btn btn-sm text-bad" onClick={() => { Object.values(KEYS).forEach(remove); say('Saved build, scores and progress were cleared.', 'ok'); }}><Trash2 size={14} />Clear saved build and scores</button></Panel>
        <p className="text-center text-xs text-mute">T-MINUS web edition · see CREDITS for NASA data sources · not affiliated with or endorsed by NASA.</p>
      </div></div>
    </div>
  );
}
