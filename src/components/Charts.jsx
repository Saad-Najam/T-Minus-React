import { useId } from 'react';

/** Small dependency-free SVG line / area chart with axes, used by the debrief (flight telemetry and the 30-day operations). */
export function LineChart({ series, xLabel, yLabel, height = 150, xMax, markerX, yMax, area = false, formatX = (v) => v.toFixed(0), formatY = (v) => v.toFixed(0) }) {
  const id = useId().replace(/:/g, '');
  const w = 560; const padL = 44; const padB = 24; const padT = 10; const padR = 10; const h = height;
  const xs = series.flatMap((s) => s.points.map((p) => p.x)); const ys = series.flatMap((s) => s.points.map((p) => p.y));
  const mx = xMax ?? Math.max(1, ...xs); const my = yMax ?? Math.max(1e-6, ...ys) * 1.08;
  const X = (x) => padL + (x / mx) * (w - padL - padR); const Y = (y) => h - padB - (y / my) * (h - padB - padT);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`${yLabel} against ${xLabel}`}>
      <defs>{series.map((s, i) => <linearGradient key={i} id={`${id}g${i}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity="0.35" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient>)}</defs>
      {ticks.map((t) => <g key={t}><line x1={padL} x2={w - padR} y1={Y(my * t / 1.08 * 1.08 * 1)} y2={Y(my * t)} stroke="#17233f" /><text x={padL - 6} y={Y(my * t) + 3} textAnchor="end" fontSize="9" fill="#8a98b8">{formatY(my * t)}</text></g>)}
      {ticks.map((t) => <text key={`x${t}`} x={X(mx * t)} y={h - 8} textAnchor="middle" fontSize="9" fill="#8a98b8">{formatX(mx * t)}</text>)}
      <text x={w - padR} y={h - 8} textAnchor="end" fontSize="9" fill="#5d6c90" />
      {series.map((s, i) => {
        const d = s.points.map((p, j) => `${j ? 'L' : 'M'} ${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
        const last = s.points[s.points.length - 1];
        return (
          <g key={i}>
            {area && last && <path d={`${d} L ${X(last.x)} ${Y(0)} L ${X(s.points[0].x)} ${Y(0)} Z`} fill={`url(#${id}g${i})`} />}
            <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeDasharray={s.dash} />
          </g>
        );
      })}
      {markerX != null && <line x1={X(markerX)} x2={X(markerX)} y1={padT} y2={h - padB} stroke="#ff7a1a" strokeWidth="1.5" strokeDasharray="3 3" />}
    </svg>
  );
}

export function Legend({ items }) {
  return <div className="flex flex-wrap gap-3 text-[11px] text-mute">{items.map((i) => <span key={i.label} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: i.color }} />{i.label}</span>)}</div>;
}

export function ScoreRing({ value, max = 100, size = 150, stroke = 12, color = '#ff7a1a', children }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#12203d" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)' }} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
