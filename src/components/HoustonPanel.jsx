import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Bot, CornerDownLeft, HelpCircle, Lightbulb, ScanSearch, SkipForward, Sparkles, Wand2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../state/store.js';
import { FaultSeverity, HintLevel, boltCoach, buildContext, nextStep, scan, whereDoesThisGo } from '../engine/houston/advisor.js';
import { evaluateWhatIf } from '../engine/houston/whatIf.js';
import { askHouston, loadLlmConfig } from '../engine/houston/llm.js';
import { Modal, SeverityTag } from './ui.jsx';
import { performRecommendation } from '../engine/houston/actions.js';

const ROOM_OF = { bay: 'bay', vab: 'vab', avionics: 'avionics' };

/** Opens a Space Guide entry from anywhere. */
export const openCodex = (id) => window.dispatchEvent(new CustomEvent('tminus:codex', { detail: id }));

function CodexHost() {
  const data = useGame((s) => s.data);
  const [id, setId] = useState(null);
  useEffect(() => { const h = (e) => { setId(e.detail); useGame.getState().markRead?.(e.detail); }; window.addEventListener('tminus:codex', h); return () => window.removeEventListener('tminus:codex', h); }, []);
  const e = id ? data.getCodex(id) : null;
  return (
    <Modal open={!!e} onClose={() => setId(null)} title={e?.title ?? ''}>
      {e && (
        <div className="space-y-4 text-[15px] leading-relaxed">
          <p className="rounded-xl border border-cyanx/30 bg-cyanx/5 p-3 text-ink">{e.short}</p>
          <p className="text-mute">{e.long}</p>
          {e.sourceUrl && <a className="inline-flex items-center gap-1.5 text-sm text-cyanx underline-offset-4 hover:underline" href={e.sourceUrl} target="_blank" rel="noreferrer noopener"><BookOpen size={14} /> Source: {e.source ?? e.sourceUrl}</a>}
        </div>
      )}
    </Modal>
  );
}

export default function HoustonPanel() {
  const game = useGame();
  const { settings, screen, data, go } = game;
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ who: 'h', text: "HOUSTON here. Ask me for the next step, scan your build, or ask where something goes. I'll always say why." }]);
  const [q, setQ] = useState('');
  const [typing, setTyping] = useState(false);
  const [cfg, setCfg] = useState(null);
  const end = useRef();
  const off = settings.houstonMode === 'Off';
  const ctxFor = useCallback(() => buildContext(useGame.getState(), ROOM_OF[useGame.getState().screen] ?? useGame.getState().screen), []);

  useEffect(() => { loadLlmConfig().then(setCfg); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, typing]);

  const add = useCallback((m) => setMsgs((x) => [...x.slice(-60), m]), []);
  const highlight = (ref) => { if (ref) useGame.setState({ highlight: { ref, at: Date.now() } }); };

  const onNext = useCallback(() => {
    const rec = nextStep(ctxFor()); game.countHint(HintLevel.TextNudge);
    add({ who: 'h', tag: 'NEXT', text: rec.text, codex: rec.codexId, rec }); highlight(rec.objectRef);
  }, [add, ctxFor, game]);
  const onScan = useCallback(() => {
    const faults = scan(ctxFor()); game.countHint(HintLevel.TextNudge);
    if (!faults.length) { add({ who: 'h', tag: 'SCAN', text: '0 problems found here.' }); return; }
    add({ who: 'h', tag: 'SCAN', text: `${faults.length} problem${faults.length > 1 ? 's' : ''}, most serious first:`, faults: faults.slice(0, 8), more: Math.max(0, faults.length - 8) });
    highlight(faults[0].where);
  }, [add, ctxFor, game]);
  const onWhere = useCallback(() => {
    const held = useGame.getState().held;
    if (!held) { add({ who: 'h', text: 'Select a part (or start a cable from a port) first, then ask where it goes.' }); return; }
    const targets = whereDoesThisGo(held, ctxFor());
    if (!targets.length) { add({ who: 'h', text: `Nothing can take ${held} right now.` }); return; }
    game.countHint(HintLevel.Highlight);
    add({ who: 'h', tag: 'GOES TO', text: targets[0].text, codex: targets[0].codexId, rec: targets[0] }); highlight(targets[0].objectRef);
  }, [add, ctxFor, game]);
  const onShow = useCallback(async () => {
    const rec = nextStep(ctxFor()); game.countHint(HintLevel.ShowMe);
    const done = await performRecommendation(rec, ctxFor());
    add({ who: 'h', tag: 'SHOWN', text: done ? `Done for you: ${rec.text}` : `I can't do that one automatically. ${rec.text}`, codex: rec.codexId }); highlight(rec.objectRef);
  }, [add, ctxFor, game]);
  const ask = useCallback(async (question) => {
    if (!question.trim()) return;
    add({ who: 'u', text: question });
    const st = useGame.getState();
    const whatIf = evaluateWhatIf(question, data, st.spacecraft, data.getMission(st.missionId), data.getRocket(st.vehicle.rocketId));
    if (whatIf) { game.countHint(HintLevel.TextNudge); add({ who: 'h', tag: 'WHAT IF', text: whatIf.text, codex: whatIf.codexId }); return; }
    const ctx = ctxFor(); const rec = nextStep(ctx);
    const useAi = st.settings.houstonMode !== 'HintsOnly' && cfg?.enabled;
    setTyping(!!useAi);
    const { text, offline } = useAi ? await askHouston(question, rec, ctx, st, { ...cfg, language: st.settings.language }) : await askHouston(question, rec, ctx, st, null);
    setTyping(false);
    add({ who: 'h', text: text + (offline ? '  [offline]' : ''), codex: rec?.codexId, rec });
  }, [add, cfg, ctxFor, data, game]);

  useEffect(() => {
    const key = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      if (settings.houstonMode === 'Off' && (e.key === 'h' || e.key === 'H' || e.key === 'n' || e.key === 'N')) return;
      const k = e.key;
      if ((k === 'h' || k === 'H') && !e.ctrlKey && !e.metaKey) { setOpen((o) => !o); e.preventDefault(); }
      else if ((k === 'n' || k === 'N') && !e.ctrlKey && !e.metaKey && ['bay', 'vab', 'avionics', 'pad', 'briefing'].includes(useGame.getState().screen)) { setOpen(true); onNext(); }
      else if ((k === 's' || k === 'S') && e.shiftKey) { setOpen(true); onScan(); e.preventDefault(); }
      else if (k === 'F9') { window.dispatchEvent(new CustomEvent('tminus:judge')); e.preventDefault(); }
    };
    const toggle = () => setOpen((o) => !o);
    const askPart = (e) => {
      const { partId, text } = e.detail || {};
      setOpen(true);
      if (text) { ask(text); return; }
      useGame.setState({ held: partId });
      const ctx = ctxFor(); const targets = whereDoesThisGo(partId, ctx);
      add({ who: 'h', tag: targets.length ? 'GOES TO' : 'INFO', text: targets[0]?.text ?? `Tell me about ${data.getPart(partId)?.name ?? partId} — try asking a question.`, codex: targets[0]?.codexId ?? data.getPart(partId)?.codexId });
      if (targets[0]) { game.countHint(HintLevel.Highlight); highlight(targets[0].objectRef); }
    };
    window.addEventListener('keydown', key); window.addEventListener('tminus:houston', toggle); window.addEventListener('tminus:ask', askPart);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('tminus:houston', toggle); window.removeEventListener('tminus:ask', askPart); };
  }, [add, ask, ctxFor, data, game, onNext, onScan, settings.houstonMode]);

  const hints = settings.hintsUsed;
  const coachJoint = (() => { const st = useGame.getState(); if (st.screen !== 'vab' || !st.selectedJoint) return null; return boltCoach(st.jointState(st.selectedJoint)); })();

  return (
    <>
      <CodexHost />
      <AnimatePresence>
        {open && !off && (
          <motion.aside initial={{ x: 420, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 420, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="panel fixed bottom-3 right-3 top-[58px] z-[60] flex w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden" aria-label="HOUSTON assistant">
            <header className="flex items-center gap-3 border-b border-line/70 px-4 py-3">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyanx/30 to-accent/20"><Bot size={20} className="text-cyanx" /><span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-ok ring-2 ring-panel" /></span>
              <div className="min-w-0 flex-1"><div className="font-display text-lg font-bold leading-none tracking-wide">HOUSTON</div><div className="mt-0.5 text-[11px] text-mute">{cfg?.enabled ? 'AI explanations on' : 'Offline advisor'} · {settings.houstonMode === 'HintsOnly' ? 'hints only' : 'on'}</div></div>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close HOUSTON"><X size={16} /></button>
            </header>
            <div className="grid grid-cols-2 gap-2 border-b border-line/70 p-3">
              <button className="btn btn-sm justify-start" onClick={onNext}><SkipForward size={14} className="text-accent" />Next step <span className="kbd ml-auto">N</span></button>
              <button className="btn btn-sm justify-start" onClick={onScan}><ScanSearch size={14} className="text-accent" />Scan <span className="kbd ml-auto">⇧S</span></button>
              <button className="btn btn-sm justify-start" onClick={onWhere}><HelpCircle size={14} className="text-cyanx" />Where does it go?</button>
              <button className="btn btn-sm justify-start" onClick={onShow}><Wand2 size={14} className="text-cyanx" />Show me</button>
            </div>
            {coachJoint && coachJoint.nextBoltNumber > 0 && (
              <div className="mx-3 mt-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-xs"><div className="font-display text-[13px] font-bold uppercase tracking-wider text-accent2">Bolt coach · {coachJoint.jointId}</div>
                <div className="mt-1 text-ink">Next bolt <b>{coachJoint.nextBoltNumber}</b> · pass {coachJoint.currentPass}/3 · {coachJoint.targetTorqueNm.toFixed(1)} N·m</div><div className="font-mono text-mute">Star order {coachJoint.starOrderText}</div></div>
            )}
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
              {msgs.map((m, i) => (
                <div key={i} className={`rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ${m.who === 'u' ? 'ml-8 bg-[#16264a] text-[#cfe2ff]' : 'mr-4 border border-line/70 bg-[#0b1430]'}`}>
                  {m.tag && <span className="mr-2 rounded bg-cyanx/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyanx">{m.tag}</span>}
                  <span className="whitespace-pre-line">{m.text}</span>
                  {m.faults && <ul className="mt-2 space-y-1.5">{m.faults.map((f, j) => <li key={j} className="flex gap-2"><SeverityTag severity={f.severity} /><span className="min-w-0 flex-1">{f.what}{f.codexId && <button className="ml-1.5 text-cyanx underline-offset-2 hover:underline" onClick={() => openCodex(f.codexId)}>why?</button>}</span></li>)}{m.more > 0 && <li className="text-mute">… and {m.more} more.</li>}</ul>}
                  {m.codex && data.getCodex(m.codex) && <button className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-cyanx hover:underline" onClick={() => openCodex(m.codex)}><BookOpen size={12} />Space Guide: {data.getCodex(m.codex).title}</button>}
                </div>
              ))}
              {typing && <div className="mr-4 flex items-center gap-1 px-3 py-2">{[0, 1, 2].map((i) => <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-cyanx" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.18 }} />)}</div>}
              <div ref={end} />
            </div>
            <footer className="border-t border-line/70 p-3">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = q; setQ(''); ask(t); }}>
                <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything… or “what if I use the HD camera?”" aria-label="Ask HOUSTON" maxLength={300} />
                <button className="btn btn-primary btn-sm" type="submit" aria-label="Send"><CornerDownLeft size={15} /></button>
              </form>
              <div className="mt-2 flex items-center justify-between text-[10px] text-mute"><span className="flex items-center gap-1"><Lightbulb size={11} />Hints used: {hints[0]} nudge · {hints[1]} highlight · {hints[2]} show-me</span><span className="flex items-center gap-1"><Sparkles size={11} />each hint trims decision score</span></div>
            </footer>
          </motion.aside>
        )}
      </AnimatePresence>
      {!open && !off && screen !== 'menu' && screen !== 'flight' && (
        <button onClick={() => setOpen(true)} className="btn fixed bottom-4 right-4 z-[55] rounded-full border-cyanx/40 px-4 shadow-cyan" aria-label="Open HOUSTON"><Bot size={18} className="text-cyanx" />HOUSTON</button>
      )}
      {go && null}
    </>
  );
}
