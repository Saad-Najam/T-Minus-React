import { Cable, Gauge, Trash2, Zap } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { WiringGraph, addressOf } from '../engine/wiring.js';
import { useGame } from '../state/store.js';

const CAT_ACCENT = { eps: '#ff7a1a', battery: '#4ade80', obc: '#38d6ff', radio: '#c084fc', antenna: '#c084fc', adcs: '#f472b6', camera: '#fbbf24', solar: '#60a5fa', switch: '#9ca3af', avionics_device: '#38d6ff' };
const OUT_TYPES = new Set(['PWR_OUT', 'SOLAR_OUT', 'PYRO_OUT']);
const patternClass = { solid: '', dashed: 'cable-dashed', ringed: 'cable-ringed', striped: 'cable-striped' };

/**
 * The wiring bench: devices as cards, ports as pins, cables as coloured, patterned wires (colour is never the only signal).
 * Click a port, then a compatible port, to run a cable. Click a cable to select it. The multimeter reports the cables on the path between two ports.
 */
export default function WiringBench({ devices, cables, onConnect, onRemove, columnOf, faultPorts = [], emptyHint }) {
  const data = useGame((s) => s.data);
  const highlight = useGame((s) => s.highlight);
  const rules = data.getRules();
  const wrap = useRef(null);
  const [pending, setPending] = useState(null);
  const [selected, setSelected] = useState(null);
  const [reversed, setReversed] = useState(false);
  const [meter, setMeter] = useState(false);
  const [probe, setProbe] = useState(null);
  const [reading, setReading] = useState(null);
  const [geo, setGeo] = useState({});

  const graph = useMemo(() => {
    const g = new WiringGraph(rules);
    for (const d of devices) g.addDevice(d.instanceId, d.def);
    for (const c of cables) g.connect(c.fromPort, c.toPort, c.reversed);
    return g;
  }, [devices, cables, rules]);

  const columns = useMemo(() => {
    const cols = [[], [], [], []];
    for (const d of devices) cols[Math.min(3, Math.max(0, columnOf(d.def)))].push(d);
    return cols;
  }, [devices, columnOf]);

  const measure = useCallback(() => {
    const root = wrap.current; if (!root) return;
    const inner = root.firstChild; if (!inner) return;
    const base = inner.getBoundingClientRect(); const out = {};
    root.querySelectorAll('[data-pin]').forEach((el) => { const r = el.getBoundingClientRect(); out[el.dataset.pin] = { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top }; });
    setGeo(out);
  }, []);
  useLayoutEffect(() => { measure(); }, [measure, devices, cables]);
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure]);
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') { setPending(null); setProbe(null); setSelected(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) {
        const c = cables.find((x) => `${x.fromPort}|${x.toPort}` === selected);
        if (c) { onRemove(c.fromPort, c.toPort); setSelected(null); }
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [selected, cables, onRemove]);
  useEffect(() => { useGame.setState({ held: pending }); }, [pending]);

  const clickPort = (addr) => {
    if (meter) {
      if (!probe) { setProbe(addr); setReading(null); return; }
      setReading({ a: probe, b: addr, n: graph.pathLength(probe, addr) }); setProbe(null); return;
    }
    if (!pending) { setPending(addr); setSelected(null); return; }
    if (pending === addr) { setPending(null); return; }
    if (onConnect(pending, addr, reversed)) setPending(null);
  };

  const validTargets = useMemo(() => {
    const s = new Set();
    if (!pending) return s;
    for (const d of devices) for (const p of d.def.ports) { const a = addressOf(d.instanceId, p.id); if (a !== pending && graph.canConnect(pending, a).ok) s.add(a); }
    return s;
  }, [pending, devices, graph]);

  const cableColor = (type) => rules.getCableType(type)?.color ?? '#ffffff';
  const cablePath = (a, b) => {
    const A = geo[a]; const B = geo[b]; if (!A || !B) return null;
    const dx = Math.max(60, Math.abs(B.x - A.x) * 0.45);
    const sx = A.x <= B.x ? 1 : -1;
    return `M ${A.x} ${A.y} C ${A.x + sx * dx} ${A.y}, ${B.x - sx * dx} ${B.y}, ${B.x} ${B.y}`;
  };
  const removeSelected = () => {
    const c = cables.find((x) => `${x.fromPort}|${x.toPort}` === selected);
    if (c) { onRemove(c.fromPort, c.toPort); setSelected(null); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-mute">
          {rules.cableTypes.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel/70 px-2 py-1">
              <svg width="30" height="8"><line x1="0" y1="4" x2="30" y2="4" stroke={c.color} strokeWidth="3" className={patternClass[c.pattern]} /></svg>{c.label.replace(/ \(.*\)/, '')}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs" title="Plug a power cable with red and black swapped (a mistake HOUSTON will catch)">
            <input type="checkbox" checked={reversed} onChange={(e) => setReversed(e.target.checked)} /><Zap size={13} className="text-bad" />Swap polarity
          </label>
          <button className={`btn btn-sm ${meter ? 'border-cyanx bg-cyanx/15 text-cyanx' : ''}`} onClick={() => { setMeter((m) => !m); setProbe(null); setReading(null); setPending(null); }}><Gauge size={14} />Multimeter</button>
          <button className="btn btn-sm" disabled={!selected} onClick={removeSelected}><Trash2 size={14} />Remove cable</button>
        </div>
      </div>
      <div className="min-h-[1.6rem] text-xs">
        {meter ? (
          <span className="text-cyanx">Multimeter: click two ports.{probe && <> Probe A on <b>{graph.describe(probe)}</b>.</>}
            {reading && <b className="ml-2 text-ink">{reading.n < 0 ? `OPEN CIRCUIT between ${graph.describe(reading.a)} and ${graph.describe(reading.b)}` : `Continuity: ${reading.n} cable${reading.n === 1 ? '' : 's'} between ${graph.describe(reading.a)} and ${graph.describe(reading.b)}`}</b>}</span>
        ) : pending ? (
          <span className="text-accent2">Cable started at <b>{graph.describe(pending)}</b> — click a glowing port to finish, or press <span className="kbd">Esc</span>.</span>
        ) : <span className="text-mute">{emptyHint ?? 'Click a port, then another port, to run a cable. Click a cable to select it.'}</span>}
      </div>

      <div ref={wrap} className="min-h-0 flex-1 overflow-auto rounded-2xl border border-line/70 bg-[#050b1a]/80 p-4 scan-grid">
        <div className="relative grid min-w-[640px] grid-cols-4 gap-x-9 gap-y-4">
          {columns.map((col, ci) => (
            <div key={ci} className="flex flex-col justify-center gap-4">
              {col.map((d) => (
                <div key={d.instanceId} className="relative z-10 rounded-xl border bg-[#0a1226]/92 shadow-lg" style={{ borderColor: `${CAT_ACCENT[d.def.category] ?? '#38d6ff'}55` }}>
                  <div className="flex items-center gap-2 border-b border-line/70 px-3 py-1.5" style={{ background: `linear-gradient(90deg, ${CAT_ACCENT[d.def.category] ?? '#38d6ff'}22, transparent)` }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: CAT_ACCENT[d.def.category] ?? '#38d6ff' }} />
                    <span className="truncate font-display text-[13px] font-bold uppercase tracking-wide">{d.def.name}</span>
                  </div>
                  <ul className="space-y-0.5 py-1.5">
                    {d.def.ports.map((p) => {
                      const addr = addressOf(d.instanceId, p.id);
                      const right = OUT_TYPES.has(p.type) || p.type === 'RF' || p.type === 'ARM';
                      const connected = graph.isConnected(addr); const valid = validTargets.has(addr); const isPending = pending === addr || probe === addr;
                      const fault = faultPorts.includes(addr);
                      const hl = highlight && (highlight.ref === addr || highlight.ref === d.instanceId) && Date.now() - highlight.at < 9000;
                      return (
                        <li key={p.id} className={`relative flex items-center gap-2 px-3 py-[3px] text-[11px] ${right ? 'flex-row-reverse text-right' : ''}`}>
                          <button data-pin={addr} onClick={() => clickPort(addr)} aria-label={`${d.def.name} ${p.label ?? p.id}${connected ? ', connected' : ''}`}
                            className={`relative h-3.5 w-3.5 shrink-0 rounded-full border-2 transition ${isPending ? 'scale-125 border-accent bg-accent' : valid ? 'pulse-ring border-cyanx bg-cyanx/60' : connected ? 'border-ok bg-ok/70' : fault ? 'border-bad bg-bad/60' : 'border-mute bg-[#0a1226] hover:border-cyanx'} ${hl ? 'pulse-ring border-accent' : ''}`}
                            style={{ [right ? 'marginRight' : 'marginLeft']: -16 }} />
                          <span className={`min-w-0 flex-1 truncate ${connected ? 'text-ink' : 'text-mute'}`}>{p.label ?? p.id}
                            <span className="ml-1.5 font-mono text-[9px] text-mute/70">{p.type}{p.maxPowerW ? ` ≤${p.maxPowerW}W` : ''}{p.bus ? ' bus' : ''}</span></span>
                        </li>
                      );
                    })}
                    {d.def.ports.length === 0 && <li className="px-3 py-1 text-[11px] text-mute">No electrical ports</li>}
                  </ul>
                </div>
              ))}
            </div>
          ))}
          <svg className="pointer-events-none absolute left-0 top-0 z-0 h-full w-full overflow-visible" aria-hidden="true">
            {cables.map((c) => {
              const d = cablePath(c.fromPort, c.toPort); if (!d) return null;
              const live = graph.cables.find((x) => (x.a === c.fromPort && x.b === c.toPort) || (x.b === c.fromPort && x.a === c.toPort));
              const t = rules.getCableType(live?.type ?? c.cableType);
              const key = `${c.fromPort}|${c.toPort}`; const sel = selected === key;
              return (
                <g key={key}>
                  <path d={d} fill="none" stroke="transparent" strokeWidth="14" style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onClick={() => { setSelected(sel ? null : key); setPending(null); }} />
                  <path d={d} fill="none" stroke="#000" strokeOpacity=".5" strokeWidth={sel ? 7 : 5} />
                  <path d={d} fill="none" stroke={live?.shortCircuit || c.reversed ? '#f87171' : cableColor(t?.id)} strokeWidth={sel ? 4.5 : 3} className={patternClass[t?.pattern]} strokeLinecap="round" />
                  {c.reversed && geo[c.toPort] && <text x={geo[c.toPort].x - 18} y={geo[c.toPort].y - 8} fill="#f87171" fontSize="10" fontWeight="700">± swapped</text>}
                </g>
              );
            })}
          </svg>
        </div>
        {devices.length === 0 && <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-mute"><Cable size={28} /><span className="text-sm">Install parts first — they appear here as boards to wire.</span></div>}
      </div>
    </div>
  );
}
