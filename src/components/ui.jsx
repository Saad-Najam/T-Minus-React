import { AnimatePresence, motion } from 'framer-motion';
import { Check, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import { useEffect } from 'react';
import { useGame } from '../state/store.js';
import { BudgetStatus } from '../engine/budget.js';

export const statusColor = { Green: '#4ade80', Yellow: '#fbbf24', Red: '#f87171' };
export const statusText = { Green: 'OK', Yellow: 'TIGHT', Red: 'PROBLEM' };

/** Section panel with an uppercase title. */
export function Panel({ title, right, children, className = '', pad = true }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between px-4 pt-3.5">
          <h3 className="panel-title">{title}</h3>
          {right}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

/** A budget meter. Colour is paired with a text status, never alone. */
export function Meter({ label, value, max, unit = '', status = BudgetStatus.Green, detail, decimals = 2 }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const c = statusColor[status];
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold text-ink">{label}</span>
        <span className="font-mono text-xs text-mute">
          <span className="text-ink">{value.toFixed(decimals)}</span> / {max.toFixed(decimals)} {unit}
          <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${c}22`, color: c }}>{status === 'Green' ? '✓' : status === 'Yellow' ? '△' : '✗'} {statusText[status]}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#0b1430]">
        <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${c}99, ${c})` }} initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 140, damping: 22 }} />
      </div>
      {detail && <p className="text-[11px] leading-snug text-mute">{detail}</p>}
    </div>
  );
}

export function Stat({ label, value, unit, tone = 'text-ink', sub }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">{label}</div>
      <div className={`hud-num mt-1 ${tone}`}>{value}<span className="ml-1 text-xs font-medium text-mute">{unit}</span></div>
      {sub && <div className="mt-0.5 text-[10px] text-mute">{sub}</div>}
    </div>
  );
}

export function Kbd({ children }) { return <span className="kbd">{children}</span>; }

export function Modal({ open, onClose, title, children, wide = false, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
          <motion.div role="dialog" aria-modal="true" aria-label={title} className={`panel flex max-h-[90vh] w-full flex-col ${wide ? 'max-w-4xl' : 'max-w-xl'}`} initial={{ y: 24, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
            <header className="flex items-center justify-between border-b border-line/70 px-5 py-3.5">
              <h2 className="font-display text-xl font-bold tracking-wide">{title}</h2>
              <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
            {footer && <footer className="flex justify-end gap-2 border-t border-line/70 px-5 py-3">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const toastIcon = { ok: Check, bad: CircleAlert, warn: TriangleAlert, info: Info };
export function Toasts() {
  const toast = useGame((s) => s.toast);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => useGame.setState({ toast: null }), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  const Icon = toast ? toastIcon[toast.kind] ?? Info : Info;
  const color = toast?.kind === 'bad' ? 'text-bad' : toast?.kind === 'ok' ? 'text-ok' : toast?.kind === 'warn' ? 'text-warn' : 'text-cyanx';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id} className="panel pointer-events-auto flex max-w-xl items-start gap-3 px-4 py-3 text-sm" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
            <Icon size={18} className={`mt-0.5 shrink-0 ${color}`} />
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { RocketLoader } from './Motion.jsx';
export function Spinner({ label = 'Loading' }) {
  return <RocketLoader label={label} />;
}
export function SpinnerPlain({ label = 'Loading' }) {
  return (
    <div className="flex flex-col items-center gap-4" role="status">
      <div className="h-12 w-12 animate-spin rounded-full border-2 border-line border-t-accent" />
      <span className="font-display text-sm uppercase tracking-[0.3em] text-mute">{label}</span>
    </div>
  );
}

export const Fade = ({ children, className = '', delay = 0 }) => (
  <motion.div className={className} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease: 'easeOut' }}>{children}</motion.div>
);

export function SeverityTag({ severity }) {
  const map = { 2: ['✗ BLOCKER', 'text-bad border-bad/40 bg-bad/10'], 1: ['△ WARNING', 'text-warn border-warn/40 bg-warn/10'], 0: ['· TIP', 'text-cyanx border-cyanx/40 bg-cyanx/10'] };
  const [text, cls] = map[severity] ?? map[0];
  return <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${cls}`}>{text}</span>;
}
