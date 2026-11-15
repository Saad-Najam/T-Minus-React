import { AnimatePresence, motion } from 'framer-motion';
import { Component, Suspense, lazy, useEffect } from 'react';
import { useGame } from './state/store.js';
import { Spinner, Toasts } from './components/ui.jsx';
import PauseMenu from './components/PauseMenu.jsx';
import HoustonPanel from './components/HoustonPanel.jsx';
import JudgeOverlay from './components/JudgeOverlay.jsx';
import { JobBar } from './pages/FailureLab.jsx';
import MainMenu from './pages/MainMenu.jsx';

// Heavy rooms are code-split: the menu loads first, each room's 3D code loads when it is opened.
const Briefing = lazy(() => import('./pages/Briefing.jsx'));
const IntegrationBay = lazy(() => import('./pages/IntegrationBay.jsx'));
const Vab = lazy(() => import('./pages/Vab.jsx'));
const AvionicsBay = lazy(() => import('./pages/AvionicsBay.jsx'));
const Pad = lazy(() => import('./pages/Pad.jsx'));
const Flight = lazy(() => import('./pages/Flight.jsx'));
const Debrief = lazy(() => import('./pages/Debrief.jsx'));
const SpaceGuide = lazy(() => import('./pages/SpaceGuide.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const FailureLab = lazy(() => import('./pages/FailureLab.jsx'));

const SCREENS = { menu: MainMenu, briefing: Briefing, bay: IntegrationBay, vab: Vab, avionics: AvionicsBay, pad: Pad, flight: Flight, debrief: Debrief, guide: SpaceGuide, settings: Settings, failure: FailureLab };

class Boundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[T-MINUS] screen crashed', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="panel max-w-lg space-y-4 p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-bad">Something went wrong in this room</h2>
          <p className="text-sm text-mute">{String(this.state.error.message || this.state.error)}</p>
          <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); useGame.getState().go('menu'); }}>Back to the main menu</button>
        </div>
      </div>
    );
  }
}

export default function App() {
  const ready = useGame((s) => s.ready);
  const loadError = useGame((s) => s.loadError);
  const screen = useGame((s) => s.screen);
  const settings = useGame((s) => s.settings);

  useEffect(() => { useGame.getState().boot(); }, []);
  useEffect(() => {
    document.body.dataset.lang = settings.language;
    document.documentElement.lang = settings.language;
    document.documentElement.classList.toggle('reduce-motion', !!settings.reduceMotion);
  }, [settings.language, settings.reduceMotion]);

  if (loadError) return <div className="flex h-full items-center justify-center p-8 text-center text-bad">Could not load the game data: {loadError}</div>;
  if (!ready) return <div className="flex h-full items-center justify-center"><Spinner label="Loading mission data" /></div>;

  const Screen = SCREENS[screen] ?? MainMenu;
  return (
    <div className="relative h-full w-full overflow-hidden">
      <Boundary key={screen}>
        <AnimatePresence mode="wait">
          <motion.div key={screen} className="h-full w-full" initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
            <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner label="Loading room" /></div>}><Screen /></Suspense>
          </motion.div>
        </AnimatePresence>
      </Boundary>
      <HoustonPanel />
      <JudgeOverlay />
      <JobBar />
      <PauseMenu />
      <Toasts />
    </div>
  );
}
