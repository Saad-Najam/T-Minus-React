import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../state/store.js';

/** A number that counts up to its value (score, images, days) — instantly when reduce-motion is on. */
export function CountUp({ value, decimals = 0, duration = 1.3, delay = 0, className = '' }) {
  const reduce = useGame((s) => s.settings.reduceMotion);
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setShown(value); return undefined; }
    let raf; let start = null;
    const tick = (t) => { if (start == null) start = t + delay * 1000; const k = Math.max(0, Math.min(1, (t - start) / (duration * 1000))); setShown(value * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [value, duration, delay, reduce]);
  return <span className={className}>{shown.toFixed(decimals)}</span>;
}

/** Confetti burst for a good result: canvas particles, 2.8 s, never blocks clicks. */
export function Confetti({ run = true, count = 140 }) {
  const ref = useRef(); const reduce = useGame((s) => s.settings.reduceMotion);
  useEffect(() => {
    if (!run || reduce) return undefined;
    const cv = ref.current; const ctx = cv.getContext('2d'); const w = (cv.width = window.innerWidth); const h = (cv.height = window.innerHeight);
    const colors = ['#ff7a1a', '#ffb36b', '#38d6ff', '#4ade80', '#ffd24a', '#ffffff', '#c084fc'];
    const parts = Array.from({ length: count }, () => ({ x: w * (0.3 + Math.random() * 0.4), y: h * 0.35, vx: (Math.random() - 0.5) * 16, vy: -8 - Math.random() * 12, s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0] }));
    let raf; const t0 = performance.now();
    const tick = (now) => {
      const age = (now - t0) / 1000; ctx.clearRect(0, 0, w, h);
      parts.forEach((p) => { p.vy += 0.38; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / 2.8); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
      if (age < 2.8) raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [run, reduce, count]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[70]" aria-hidden="true" />;
}

/** Card that tilts toward the pointer (3D hover), with a moving highlight. */
export function TiltCard({ children, className = '', max = 6, onClick, as = 'div', ...rest }) {
  const x = useMotionValue(0); const y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [max, -max]), { stiffness: 220, damping: 20 }); const ry = useSpring(useTransform(x, [-0.5, 0.5], [-max, max]), { stiffness: 220, damping: 20 });
  const glow = useTransform([x, y], ([a, b]) => `radial-gradient(260px circle at ${(a + 0.5) * 100}% ${(b + 0.5) * 100}%, rgba(255,160,80,0.16), transparent 60%)`);
  const reduce = useGame((s) => s.settings.reduceMotion);
  const M = motion[as];
  return (
    <M {...rest} onClick={onClick} className={`relative ${className}`} style={{ rotateX: reduce ? 0 : rx, rotateY: reduce ? 0 : ry, transformPerspective: 900 }} whileTap={{ scale: 0.985 }}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width - 0.5); y.set((e.clientY - r.top) / r.height - 0.5); }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      <motion.span className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glow }} />
      {children}
    </M>
  );
}

/** Loading state: a little rocket that keeps launching. */
export function RocketLoader({ label = 'Loading' }) {
  return (
    <div className="flex flex-col items-center gap-5" role="status">
      <div className="relative h-24 w-16 overflow-hidden">
        <motion.svg viewBox="0 0 40 64" className="absolute left-1/2 top-3 h-16 w-10 -translate-x-1/2" animate={{ y: [6, -4, 6] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
          <path d="M20 2c7 6 10 14 10 24l-4 10H14l-4-10C10 16 13 8 20 2z" fill="#e8eefc" /><circle cx="20" cy="20" r="4.5" fill="#38d6ff" /><path d="M10 28l-7 10 7-2zM30 28l7 10-7-2z" fill="#ff7a1a" />
          <motion.path d="M16 36h8l-4 18z" fill="#ffb36b" animate={{ scaleY: [0.7, 1.25, 0.8], opacity: [0.8, 1, 0.8] }} style={{ transformOrigin: '20px 36px' }} transition={{ duration: 0.3, repeat: Infinity }} />
        </motion.svg>
        {[0, 1, 2].map((i) => <motion.span key={i} className="absolute bottom-0 left-1/2 h-1.5 w-1.5 rounded-full bg-white/40" animate={{ y: [0, 20], opacity: [0.6, 0], x: (i - 1) * 6 }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.25 }} />)}
      </div>
      <span className="font-display text-sm uppercase tracking-[0.3em] text-mute">{label}</span>
    </div>
  );
}
