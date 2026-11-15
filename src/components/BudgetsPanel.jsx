import { Orbit } from 'lucide-react';
import { useGame } from '../state/store.js';
import { Meter, SeverityTag } from './ui.jsx';
import { Severity } from '../engine/severity.js';
import { openCodex } from './HoustonPanel.jsx';
import { BudgetStatus } from '../engine/budget.js';

const sevToTag = (s) => (s >= Severity.Fault ? 2 : s === Severity.Warning ? 1 : 0);

/** Live power, data, mass and cost budgets with a one-line "why" for every number (the game's core teaching idea). */
export default function BudgetsPanel({ report, mission, orbit, onOrbit, compact = false }) {
  const orbits = mission?.orbitOptionsKm?.length ? mission.orbitOptionsKm : [400, 550, 800];
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="panel-title flex items-center gap-1.5"><Orbit size={13} />Orbit</span><span className="font-mono text-[11px] text-mute">T {report.periodMin.toFixed(1)} min · eclipse {report.eclipseMin.toFixed(1)} min</span></div>
        <div className="grid grid-cols-3 gap-2">{orbits.map((km) => <button key={km} onClick={() => onOrbit(km)} className={`btn btn-sm ${orbit === km ? 'border-accent bg-accent/15 text-accent2' : ''}`}>{km} km</button>)}</div>
        <p className="mt-1.5 text-[11px] text-mute">Lower orbit = sharper images (GSD {report.gsdM > 0 ? `${+report.gsdM.toFixed(1)} m/px` : '—'}) but a slightly different eclipse time. The period comes from T = 2π√(r³/μ).</p>
      </div>
      <Meter label="Mass" value={report.massKg} max={report.massLimitKg} unit="kg" status={report.mass} detail="A 3U CubeSat has a strict mass limit: every gram needs rocket propellant." />
      <Meter label="Cost" value={report.totalCostM} max={report.budgetM || report.totalCostM || 1} unit="M$" decimals={3} status={report.cost}
        detail={`Launch ${report.launchCostM.toFixed(1)} M$ + spacecraft ${report.spacecraftCostK.toFixed(0)} k$.${report.budgetM <= 0 ? ' No budget limit in the Sandbox.' : ''}`} />
      <Meter label="Power (orbit average)" value={report.consumptionW} max={Math.max(report.generationW, report.consumptionW, 0.01)} unit="W" status={report.power}
        detail={`Panels make ${report.generationW.toFixed(2)} W (sunlit ${(report.sunlitFraction * 100).toFixed(0)}% × pointing); the satellite uses ${report.consumptionW.toFixed(2)} W.`} />
      <Meter label="Battery" value={report.batteryWh} max={Math.max(report.requiredBatteryWh, report.batteryWh, 0.1)} unit="Wh" decimals={1} status={report.battery}
        detail={`Needs ${report.requiredBatteryWh.toFixed(1)} Wh: eclipse energy ÷ 0.3, so the battery never drains below 70%.`} />
      {!compact && (
        <>
          <Meter label="Data returned" value={report.imagesDownlinkedMission} max={Math.max(report.imageGoal, report.imagesDownlinkedMission, 1)} unit="images" decimals={0} status={report.data}
            detail={`Downlink ${report.downlinkPerDayMB.toFixed(1)} MB/day vs ${report.dataPerDayMB.toFixed(1)} MB/day captured. Goal: ${report.imageGoal || '—'} images in ${report.durationDays} days.`} />
          <Meter label="Pointing quality" value={report.pointingQuality} max={1} status={report.pointing} decimals={1}
            detail={report.adcsId ? `Resolution ≈ ${+report.gsdM.toFixed(1)} m per pixel at ${report.altitudeKm.toFixed(0)} km.` : 'No ADCS: the camera cannot aim.'} />
        </>
      )}
      {report.issues.length > 0 && (
        <ul className="space-y-1.5">
          {report.issues.slice(0, 6).map((i, k) => (
            <li key={k} className="flex gap-2 rounded-lg border border-line/70 bg-[#0a1226]/80 p-2 text-[12px] leading-snug"><SeverityTag severity={sevToTag(i.severity)} /><span className="min-w-0 flex-1">{i.message}{i.codexId && <button className="ml-1 text-cyanx hover:underline" onClick={() => openCodex(i.codexId)}>why?</button>}</span></li>
          ))}
        </ul>
      )}
      {report.issues.length === 0 && report.mass === BudgetStatus.Green && <p className="rounded-lg border border-ok/30 bg-ok/5 p-2 text-xs text-ok">✓ Every budget is within its limits.</p>}
    </div>
  );
}
