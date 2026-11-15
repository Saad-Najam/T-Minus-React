import { ArrowLeft, ArrowRight, CircleAlert, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import Frame from '../components/Frame.jsx';
import FirstBuildGuide from '../components/FirstBuildGuide.jsx';
import WiringBench from '../components/WiringBench.jsx';
import { Panel } from '../components/ui.jsx';
import { openCodex } from '../components/HoustonPanel.jsx';
import { useGame } from '../state/store.js';
import { AvionicsReport } from '../engine/avionics.js';

const COLUMN = { av_battery: 0, av_pdu: 0, av_flight_computer: 1, av_imu: 2, av_telemetry: 2, av_antenna: 2, av_igniter_s1: 3, av_igniter_s2: 3, av_stage_sep: 3, av_fairing_sep: 3, av_safe_arm: 3 };

export default function AvionicsBay() {
  const { data, vehicle, addAvionicsCable, removeAvionicsCable, setArmed, job } = useGame();
  const rules = data.getRules();
  const devices = useMemo(() => data.parts.filter((p) => p.assembly === 'avionics').map((def) => ({ instanceId: def.id, def })), [data]);
  const report = useMemo(() => AvionicsReport.compute(vehicle, rules), [vehicle, rules]);

  return (
    <Frame screen="avionics" title="Avionics Bay" right={<><button className="btn btn-sm" onClick={() => useGame.getState().go('vab')}><ArrowLeft size={14} />VAB</button>{!job && <button className="btn btn-primary btn-sm" onClick={() => useGame.getState().go('pad')}>To the pad <ArrowRight size={14} /></button>}</>}>
      <FirstBuildGuide room="avionics" />
      <div className="grid min-h-0 gap-3 lg:h-full lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="panel h-[75vh] min-h-0 p-3 lg:h-auto">
          <WiringBench devices={devices} cables={vehicle.avionicsCables} columnOf={(d) => COLUMN[d.id] ?? 1}
            onConnect={(a, b, rev) => addAvionicsCable(a, b, rev)} onRemove={removeAvionicsCable}
            faultPorts={report.consequences.map((c) => rules.avionicsWiring.find((l) => l.id === c.linkId)?.from).filter(Boolean)}
            emptyHint="Wire the flight computer, batteries, pyro separation, Safe/Arm plug and telemetry: 11 cables. A missing cable has a flight consequence." />
        </div>
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          <Panel title="Safe / Arm plug">
            <div className={`flex items-center gap-3 rounded-xl border p-3 ${vehicle.armed ? 'border-bad/50 bg-bad/10' : 'border-ok/40 bg-ok/10'}`}>
              {vehicle.armed ? <ShieldAlert className="text-bad" /> : <ShieldCheck className="text-ok" />}
              <div className="flex-1"><div className="font-display text-lg font-bold">{vehicle.armed ? 'ARMED' : 'SAFE'}</div><div className="text-[11px] text-mute">{rules.safeArm.message}</div></div>
            </div>
            <button className="btn btn-sm mt-3 w-full" onClick={() => setArmed(!vehicle.armed)}>{vehicle.armed ? 'Switch to SAFE' : 'Arm (normally done at the pad)'}</button>
            <button className="mt-2 text-[11px] text-cyanx hover:underline" onClick={() => openCodex('safe_arm')}>Why a Safe/Arm plug?</button>
          </Panel>
          <Panel title={`Required cables · ${report.wiredLinks}/${report.requiredLinks}`} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-[#0b1430]"><div className="h-full rounded-full bg-gradient-to-r from-accent to-ok transition-all" style={{ width: `${(report.wiredLinks / report.requiredLinks) * 100}%` }} /></div>
            <ul className="space-y-1.5">
              {rules.avionicsWiring.map((l) => {
                const miss = report.consequences.find((c) => c.linkId === l.id);
                return (
                  <li key={l.id} className={`rounded-lg border p-2 text-[11px] leading-snug ${miss ? 'border-bad/30 bg-bad/5' : 'border-ok/25 bg-ok/5'}`}>
                    <div className="flex items-center gap-1.5 font-mono font-bold">{miss ? <CircleAlert size={12} className="text-bad" /> : <span className="text-ok">✓</span>}<span className={miss ? 'text-bad' : 'text-ok'}>{l.id}</span><span className="text-mute">{l.cableType}</span></div>
                    <div className="mt-0.5 text-mute">{l.from.replace('/', ' ')} → {l.to.replace('/', ' ')}</div>
                    {miss && <div className="mt-1 text-ink">{l.message}</div>}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </Frame>
  );
}
