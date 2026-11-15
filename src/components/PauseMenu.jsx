import { Home, Maximize, Play, RotateCcw, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useGame } from '../state/store.js';
import { Kbd, Modal } from './ui.jsx';

const CONTROLS = [
  ['Everywhere', [['H', 'HOUSTON panel'], ['N', 'Next step'], ['Shift+S', 'Scan the build'], ['F9', 'Judge Mode demo'], ['P', 'This menu']]],
  ['VAB', [['Drag / right-drag', 'Orbit the rocket'], ['Scroll', 'Zoom'], ['F', 'Focus the selected joint'], ['Esc', 'Leave the bolt tool'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo']]],
  ['Bolting & wiring', [['Click a hole', 'Fit a bolt, then torque it'], ['Click port, then port', 'Run a cable'], ['Esc', 'Cancel']]],
  ['Flight', [['C', 'Cycle camera (chase / ground / map)'], ['1 2 3 4', 'Time warp ×1 / ×2 / ×4 / ×100'], ['A / D', 'Pitch (autopilot off)'], ['Shift / Ctrl', 'Throttle (autopilot off)']]],
];

export default function PauseMenu() {
  const [open, setOpen] = useState(false);
  const [controls, setControls] = useState(false);
  const screen = useGame((s) => s.screen);
  const settings = useGame((s) => s.settings);
  const { go, setSettings } = useGame.getState();

  useEffect(() => {
    const key = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      if ((e.key === 'p' || e.key === 'P') && screen !== 'menu') setOpen((o) => !o);
      if (e.key === 'F1') { setControls(true); setOpen(true); e.preventDefault(); }
    };
    const evt = () => setOpen(true);
    window.addEventListener('keydown', key); window.addEventListener('tminus:pause', evt);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('tminus:pause', evt); };
  }, [screen]);

  const fullscreen = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch { /* not allowed */ } };
  const close = () => { setOpen(false); setControls(false); };
  return (
    <Modal open={open} onClose={close} title={controls ? 'Controls' : 'Paused'} wide={controls}>
      {controls ? (
        <div className="grid gap-5 md:grid-cols-2">
          {CONTROLS.map(([where, rows]) => (
            <div key={where}><h4 className="panel-title mb-2">{where}</h4><ul className="space-y-1.5 text-sm">{rows.map(([k, d]) => <li key={k} className="flex items-center justify-between gap-3"><Kbd>{k}</Kbd><span className="text-right text-mute">{d}</span></li>)}</ul></div>
          ))}
          <div className="md:col-span-2"><button className="btn" onClick={() => setControls(false)}>Back</button></div>
        </div>
      ) : (
        <div className="space-y-3">
          <button className="btn btn-primary w-full" onClick={close}><Play size={16} />Resume</button>
          <label className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm"><Volume2 size={16} className="text-cyanx" />Volume
            <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(e) => setSettings({ volume: +e.target.value })} className="ml-auto w-44" aria-label="Volume" /></label>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn" onClick={() => setControls(true)}>Controls</button>
            <button className="btn" onClick={fullscreen}><Maximize size={15} />Fullscreen</button>
            <button className="btn" onClick={() => { close(); window.dispatchEvent(new CustomEvent('tminus:restart-room')); }}><RotateCcw size={15} />Restart this room</button>
            <button className="btn" onClick={() => { close(); go('menu'); }}><Home size={15} />Main menu</button>
          </div>
          <p className="text-center text-xs text-mute">Your build is saved automatically in this browser.</p>
        </div>
      )}
    </Modal>
  );
}
