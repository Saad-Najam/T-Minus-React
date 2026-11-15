import { motion } from 'framer-motion';
import { ArrowLeft, BookOpen, Check, ExternalLink, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useGame } from '../state/store.js';

function Quiz({ entry, quiz }) {
  const [picked, setPicked] = useState(null);
  const options = useMemo(() => [quiz.correct, ...quiz.wrong].map((t, i) => ({ t, i })).sort((a, b) => ((a.i * 7919 + entry.id.length * 31) % 11) - ((b.i * 7919 + entry.id.length * 31) % 11)), [quiz, entry.id]);
  return (
    <div className="mt-6 rounded-2xl border border-cyanx/30 bg-cyanx/5 p-5">
      <div className="panel-title text-cyanx">Check yourself</div>
      <p className="mt-2 font-display text-xl font-bold">{quiz.q}</p>
      <div className="mt-3 grid gap-2">
        {options.map((o) => { const done = picked != null; const right = o.t === quiz.correct; const sel = picked === o.t;
          return <button key={o.t} disabled={done} onClick={() => setPicked(o.t)} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition ${done ? (right ? 'border-ok bg-ok/10' : sel ? 'border-bad bg-bad/10' : 'border-line opacity-50') : 'border-line hover:border-cyanx/60'}`}>
            {done && (right ? <Check size={16} className="text-ok" /> : sel ? <X size={16} className="text-bad" /> : null)}{o.t}</button>; })}
      </div>
      {picked && <p className={`mt-3 text-sm ${picked === quiz.correct ? 'text-ok' : 'text-warn'}`}>{picked === quiz.correct ? 'Correct!' : `Not quite — the answer is: ${quiz.correct}.`}</p>}
    </div>
  );
}

export default function SpaceGuide() {
  const { data, go, codexRead } = useGame();
  const [q, setQ] = useState(''); const [sel, setSel] = useState(data.codex[0]?.id);
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return data.codex.filter((e) => !s || `${e.title} ${e.short} ${e.long} ${e.id}`.toLowerCase().includes(s)); }, [q, data]);
  const e = data.getCodex(sel); const quiz = data.quiz.find((x) => x.id === sel);
  const pick = (id) => { setSel(id); useGame.getState().markRead(id); };
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line/70 bg-[#050a16]/85 px-4 py-3 backdrop-blur">
        <button className="btn btn-ghost btn-sm" onClick={() => go('menu')}><ArrowLeft size={16} />Menu</button>
        <BookOpen className="text-accent" size={20} /><h1 className="font-display text-2xl font-bold tracking-wide">Space Guide</h1>
        <span className="chip ml-2">{codexRead.size} of {data.codex.length} read</span>
        <div className="relative ml-auto w-full max-w-xs"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" /><input className="field !pl-9" placeholder="Search 28 topics…" value={q} onChange={(ev) => setQ(ev.target.value)} aria-label="Search the Space Guide" /></div>
      </header>
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 md:grid-cols-[320px_minmax(0,1fr)] md:overflow-hidden md:p-4">
        <nav className="panel max-h-64 min-h-0 overflow-y-auto p-2 md:max-h-none" aria-label="Topics">
          {list.map((c) => <button key={c.id} onClick={() => pick(c.id)} className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${sel === c.id ? 'bg-accent/15 text-ink ring-1 ring-accent/40' : 'text-mute hover:bg-white/5 hover:text-ink'}`}>
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${codexRead.has(c.id) ? 'bg-ok' : 'bg-line'}`} /><span><span className="block font-display text-[15px] font-bold leading-tight">{c.title}</span><span className="mt-0.5 block line-clamp-1 text-[11px]">{c.short}</span></span></button>)}
          {list.length === 0 && <p className="p-4 text-sm text-mute">No topic matches “{q}”.</p>}
        </nav>
        <motion.article key={sel} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel min-h-0 p-6 md:overflow-y-auto md:p-8">
          {e ? (
            <div className="mx-auto max-w-2xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent2">{e.id.replace(/_/g, ' ')}</div>
              <h2 className="mt-1 font-display text-4xl font-bold leading-tight">{e.title}</h2>
              <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/5 p-4 text-[15px] leading-relaxed">{e.short}</p>
              <p className="mt-4 text-[15px] leading-[1.75] text-ink/85">{e.long}</p>
              {(e.source || e.sourceUrl) && <div className="mt-5 flex items-center gap-2 text-sm text-mute"><span>Source:</span>{e.sourceUrl ? <a className="inline-flex items-center gap-1 text-cyanx hover:underline" href={e.sourceUrl} target="_blank" rel="noreferrer noopener">{e.source ?? e.sourceUrl}<ExternalLink size={13} /></a> : <span className="text-ink">{e.source}</span>}</div>}
              {quiz && <Quiz key={e.id} entry={e} quiz={quiz} />}
            </div>
          ) : <p className="text-mute">Pick a topic.</p>}
        </motion.article>
      </div>
    </div>
  );
}
