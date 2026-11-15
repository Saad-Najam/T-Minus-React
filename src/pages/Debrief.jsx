import { motion } from 'framer-motion';
import { Award, Camera, Check, Clipboard, GitCompare, Lock, Play, RefreshCw, Share2, Star, Trophy, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Frame from '../components/Frame.jsx';
import { LineChart, Legend, ScoreRing } from '../components/Charts.jsx';
import { Confetti, CountUp } from '../components/Motion.jsx';
import { Modal, Panel } from '../components/ui.jsx';
import { openCodex } from '../components/HoustonPanel.jsx';
import { useGame } from '../state/store.js';
import { breakdownText, timelineText } from '../engine/scoring.js';
import { Severity } from '../engine/severity.js';
import { addLeaderboard, loadLeaderboard } from '../state/persist.js';
import { decodeDesign, cleanDesign, encodeDesign } from '../engine/design.js';
import { computeSpacecraftReport } from '../engine/budget.js';
import { loadLlmConfig, narrateWithAi } from '../engine/houston/llm.js';
import { csvRow, recordOnce, starText, toCsv } from '../engine/missionLog.js';
import { classTopic, isValid, normalise, publishToTopic } from '../engine/relay.js';
import { SOURCE_RESOLUTION_M, fetchImage, isBundled, selectedRegion } from '../engine/liveImagery.js';
import { read, write } from '../state/persist.js';

const LANDSAT_GSD = 30; const TILE = 300;
const resolvedWidth = (gsd, tile = TILE) => (gsd <= 0 ? 0 : Math.max(8, Math.round(tile * Math.min(1, LANDSAT_GSD / gsd))));
const unlockedCount = (share, sent, total) => (sent <= 0 || total <= 0 ? 0 : Math.max(1, Math.min(total, Math.floor(share * total + 1e-9))));
const base = import.meta.env.BASE_URL;

/** The real Landsat image degraded to the player's camera detail: a coarser GSD gives blockier pixels (point-filtered). */
function Tile({ img, unlocked, gsd }) {
  const ref = useRef(); const w = resolvedWidth(gsd);
  useEffect(() => {
    if (!unlocked || !ref.current) return;
    const src = new Image(); src.src = `${base}images/${img.resource.split('/').pop()}.jpg`;
    src.onload = () => {
      const cv = ref.current; if (!cv) return; const ctx = cv.getContext('2d');
      const h = Math.max(8, Math.round((w * src.height) / src.width));
      const small = document.createElement('canvas'); small.width = w; small.height = h; small.getContext('2d').drawImage(src, 0, 0, w, h);
      cv.width = TILE; cv.height = Math.round(TILE * (src.height / src.width)); ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, cv.width, cv.height);
    };
  }, [unlocked, img, w]);
  return (
    <div className="w-[300px] max-w-full">
      <div className="relative overflow-hidden rounded-xl border border-line bg-[#06090f]" style={{ aspectRatio: '1 / 0.93' }}>
        {unlocked ? <canvas ref={ref} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-2 text-mute"><Lock size={26} /><span className="px-6 text-center text-xs">Not downlinked. Return more images to unlock this date.</span></div>}
      </div>
      <div className="mt-1.5 font-display text-sm font-bold">{img.date} · {img.title}</div>
      {unlocked && <div className="text-[11px] text-mute">Seen at {+gsd.toFixed(1)} m/pixel ({w} px across){gsd <= LANDSAT_GSD ? ', as sharp as Landsat' : `, Landsat sees ${LANDSAT_GSD} m`}</div>}
    </div>
  );
}

/** A real NASA Worldview (MODIS, 250 m) picture of the player's chosen region, shown at the detail of the camera that was built. */
function LiveTile({ region, gsd }) {
  const ref = useRef(); const [state, setState] = useState('loading');
  const w = Math.max(8, Math.round(TILE * Math.min(1, SOURCE_RESOLUTION_M / Math.max(gsd, 1))));
  useEffect(() => {
    let dead = false;
    fetchImage(region, 512).then((img) => {
      if (dead) return;
      if (!img || !ref.current) { setState('offline'); return; }
      const cv = ref.current; const small = document.createElement('canvas'); small.width = w; small.height = w; small.getContext('2d').drawImage(img, 0, 0, w, w);
      cv.width = TILE; cv.height = TILE; const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, TILE, TILE); setState('ok');
    });
    return () => { dead = true; };
  }, [region, w]);
  return (
    <div className="w-[300px] max-w-full">
      <div className="relative overflow-hidden rounded-xl border border-cyanx/30 bg-[#06090f]" style={{ aspectRatio: '1 / 1' }}>
        <canvas ref={ref} className={`h-full w-full ${state === 'ok' ? '' : 'hidden'}`} />
        {state !== 'ok' && <div className="flex h-full items-center justify-center px-6 text-center text-xs text-mute">{state === 'loading' ? 'Fetching the picture from NASA Worldview…' : 'No picture: you appear to be offline, or NASA Worldview did not answer.'}</div>}
      </div>
      <div className="mt-1.5 font-display text-sm font-bold">{region.name} · live from NASA Worldview</div>
      <div className="text-[11px] text-mute">MODIS Terra, 2022-08-28, shown at {+gsd.toFixed(1)} m/pixel ({w} px across); MODIS itself sees {SOURCE_RESOLUTION_M} m.</div>
    </div>
  );
}

function drawCard(info) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 630; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1200, 630); g.addColorStop(0, '#04070f'); g.addColorStop(1, '#10204a'); x.fillStyle = g; x.fillRect(0, 0, 1200, 630);
  x.fillStyle = '#ff7a1a'; x.font = '700 28px Rajdhani, sans-serif'; x.fillText('T-MINUS · ROCKET & MISSION BUILDER', 60, 70);
  x.fillStyle = '#e8eefc'; x.font = '700 72px Rajdhani, sans-serif'; x.fillText(info.mission, 60, 170);
  x.font = '600 150px Rajdhani, sans-serif'; x.fillStyle = '#ffb36b'; x.fillText(info.score.toFixed(1), 60, 330); x.font = '600 36px Inter, sans-serif'; x.fillStyle = '#8a98b8'; x.fillText('/ 100', 480, 330);
  x.font = '700 70px Inter, sans-serif'; x.fillStyle = '#ffd24a'; x.fillText('★'.repeat(info.stars) + '☆'.repeat(3 - info.stars), 60, 420);
  x.font = '500 26px Inter, sans-serif'; x.fillStyle = '#c9d4f0'; info.lines.forEach((l, i) => x.fillText(l, 60, 480 + i * 34));
  x.fillStyle = '#5d6c90'; x.font = '400 18px Inter, sans-serif'; x.fillText('Not affiliated with or endorsed by NASA · Landsat: NASA/USGS', 60, 610);
  return c;
}

export default function Debrief() {
  const game = useGame();
  const { data, flight, ops, score, spacecraft, vehicle, missionId, events, crew, go, say } = game;
  const [status, setStatus] = useState('');
  const [lbOpen, setLbOpen] = useState(false); const [cmpOpen, setCmpOpen] = useState(false);
  const [name, setName] = useState('Player'); const [rows, setRows] = useState(loadLeaderboard);
  const [scrub, setScrub] = useState(null); const [cmpCode, setCmpCode] = useState(''); const [cmp, setCmp] = useState(null);
  const [aiText, setAiText] = useState(null);
  const [prev, setPrev] = useState(null); const [lastEntry, setLastEntry] = useState(null);
  const [classCode, setClassCode] = useState(() => read('tminus.classCode', '')); const [classMsg, setClassMsg] = useState('');
  const d = useMemo(() => (flight.flown && score ? game.debrief() : null), [flight, score]); // eslint-disable-line react-hooks/exhaustive-deps
  const timeline = useMemo(() => [...events.all].filter((e) => e.system === 'flight' || e.system === 'operations').sort((a, b) => a.time - b.time), [events.all.length, flight]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!d || game.judge) return; // a Judge Mode demo is not an attempt
    const entry = { missionId, score: score.total, stars: score.stars, outcome: flight.outcome, code: flight.failureCode || '', cause: flight.failureCause || '', whenUtc: new Date().toISOString() };
    setPrev(recordOnce(flight, entry)); setLastEntry(entry);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!d) return;
    loadLlmConfig().then((cfg) => narrateWithAi({ ...cfg, language: game.settings.language }, { mission: d.mission?.name, causalTimeline: timelineText(timeline, flight.flightTimeS), scoreBreakdown: breakdownText(score), fixes: score.fixes, language: game.settings.language }).then((t) => t && setAiText(t)));
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) {
    return <Frame screen="debrief" title="Debrief"><div className="flex h-full items-center justify-center"><div className="panel max-w-md space-y-3 p-8 text-center"><h2 className="font-display text-2xl font-bold">No flight yet</h2><p className="text-sm text-mute">Build, check the pad list and launch. The debrief explains every success and failure.</p><button className="btn btn-primary" onClick={() => go('pad')}>To the pad</button></div></div></Frame>;
  }
  const success = flight.outcome === 'Orbit' || flight.outcome === 'Apogee';
  const tel = flight.telemetry;
  const sc = scrub ?? (tel.length ? tel.length - 1 : 0); const cur = tel[sc];
  const goalsMet = d.goals.filter((g) => g.met).length;
  const images = d.mission?.rewardImages ?? [];
  const unlocked = unlockedCount(ops.rewardImageShare ?? 0, ops.imagesDownlinked ?? 0, images.length);
  const cube = !flight.flightOnly && d.budget;
  const failTime = flight.outcome === 'Failed' ? flight.flightTimeS : null;

  const shareText = `T-MINUS · ${d.mission?.name}: ${score.total.toFixed(1)}/100 ${'★'.repeat(score.stars)}${'☆'.repeat(3 - score.stars)} — ${flight.outcome}${flight.failureCode ? ` (${flight.failureCode})` : ''}. ${breakdownText(score)}`;
  const savePicture = () => {
    const lines = [flight.outcome === 'Orbit' ? `Orbit ${flight.periapsisKm.toFixed(0)}×${flight.apoapsisKm.toFixed(0)} km · max-Q ${flight.maxQKPa.toFixed(1)} kPa` : `${flight.outcome}${flight.failureCode ? ` · ${flight.failureCode}` : ''}`, cube ? `${ops.daysAlive} days alive · ${ops.imagesDownlinked} images downlinked` : `Flight time ${flight.flightTimeS.toFixed(0)} s`, ...d.goals.slice(0, 2).map((g) => `${g.met ? '✓' : '✗'} ${g.text}`)];
    drawCard({ mission: d.mission?.name ?? 'Mission', score: score.total, stars: score.stars, lines }).toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `t-minus-${missionId}-${Date.now()}.png`; a.click(); setStatus('Picture saved to your downloads.'); });
  };
  const submitScore = async () => { const code = await encodeDesign({ missionId, spacecraft, vehicle }); setRows(addLeaderboard({ name: name.trim() || 'Player', score: score.total, code, date: new Date().toISOString() })); say('Saved to the local leaderboard.', 'ok'); };
  const compare = async () => {
    const { bundle, error } = await decodeDesign(cmpCode); if (!bundle) { say(error, 'bad'); return; }
    cleanDesign(bundle, data); const mission = data.getMission(missionId); const rocket = data.getRocket(vehicle.rocketId);
    setCmp({ a: computeSpacecraftReport(spacecraft, data, mission, rocket), b: computeSpacecraftReport(bundle.spacecraft, data, mission, data.getRocket(bundle.vehicle.rocketId) ?? rocket) });
  };

  return (
    <Frame screen="debrief" title="Mission Debrief" right={<><button className="btn btn-sm" onClick={() => { game.resetRun(); go('vab'); }}><RefreshCw size={14} />Redesign</button><button className="btn btn-primary btn-sm" onClick={() => { game.commitLaunch(); go('flight'); }}>Fly again</button></>}>
      {success && score.stars >= 2 && <Confetti count={score.stars === 3 ? 170 : 90} />}
      <div className="grid h-full min-h-0 gap-3 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_minmax(0,1fr)]">
        {/* score */}
        <div className="flex flex-col gap-3 lg:col-span-2 xl:col-span-1">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className={`panel relative overflow-hidden p-5 ${success ? 'ring-1 ring-ok/30' : 'ring-1 ring-bad/30'}`}>
            <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${success ? 'from-ok/15' : 'from-bad/15'} to-transparent`} />
            <div className="relative flex items-center gap-5">
              <ScoreRing value={score.total} color={success ? '#4ade80' : '#ff7a1a'}><div className="font-display text-4xl font-bold leading-none"><CountUp value={score.total} decimals={1} /></div><div className="text-[10px] uppercase tracking-widest text-mute">of 100</div></ScoreRing>
              <div><div className={`font-display text-2xl font-bold uppercase leading-tight ${success ? 'text-ok' : 'text-bad'}`}>{flight.outcome === 'Orbit' ? 'Orbit achieved' : flight.outcome === 'Apogee' ? 'Apogee reached' : flight.outcome === 'Aborted' ? 'Launch aborted' : 'Mission lost'}</div>
                <div className="mt-2 flex gap-1">{[0, 1, 2].map((i) => <motion.span key={i} initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.4 + i * 0.25, type: 'spring' }}><Star size={28} className={i < score.stars ? 'fill-[#ffd24a] text-[#ffd24a]' : 'text-line'} /></motion.span>)}</div>
                <div className="mt-2 text-xs text-mute">{goalsMet} of {d.goals.length} goals met</div></div>
            </div>
            <p className="relative mt-4 text-[14px] leading-relaxed text-ink/90">{aiText ?? d.narration}</p>
            {aiText && <p className="mt-1 text-[10px] text-cyanx">Worded by HOUSTON's AI from the facts below.</p>}
          </motion.div>
          <Panel title="Goals">
            <ul className="space-y-1.5">{d.goals.map((g) => <li key={g.id} className="flex items-center gap-2.5 rounded-lg border border-line/70 bg-[#0a1226]/70 px-3 py-2 text-[13px]"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${g.met ? 'bg-ok text-[#04120a]' : 'bg-bad text-[#1a0505]'}`}>{g.met ? <Check size={12} /> : <X size={12} />}</span><span className="flex-1">{g.text}</span><span className="font-mono text-[11px] text-mute">{g.measured}</span></li>)}</ul>
          </Panel>
          <Panel title="Score breakdown">
            <ul className="space-y-2.5">{score.breakdown.map((l) => <li key={l.id}><div className="flex justify-between text-[12px]"><span>{l.label}</span><span className="font-mono text-mute"><b className="text-ink">{l.points.toFixed(1)}</b> / {l.maximum.toFixed(0)}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#0b1430]"><motion.div className="h-full rounded-full bg-gradient-to-r from-accent to-accent2" initial={{ width: 0 }} animate={{ width: `${l.maximum ? (l.points / l.maximum) * 100 : 0}%` }} transition={{ duration: 0.9, delay: 0.2 }} /></div></li>)}</ul>
          </Panel>
          {score.fixes.length > 0 && <Panel title="Top fixes"><ol className="space-y-2 text-[13px]">{score.fixes.map((f, i) => <li key={i} className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 font-mono text-[11px] font-bold text-accent2">{i + 1}</span><span>{f}</span></li>)}</ol></Panel>}
          <Panel title="Share & compete">
            <div className="grid grid-cols-2 gap-2"><button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(shareText); setStatus('Result copied to the clipboard.'); }}><Clipboard size={14} />Share result</button><button className="btn btn-sm" onClick={savePicture}><Camera size={14} />Save picture</button><button className="btn btn-sm" onClick={() => setLbOpen(true)}><Trophy size={14} />Leaderboard</button><button className="btn btn-sm" onClick={() => setCmpOpen(true)}><GitCompare size={14} />Compare design</button></div>
            {prev && <p className="mt-3 rounded-lg border border-line bg-[#0a1226]/70 px-3 py-2 text-[12px]">Your last attempt: <b className="font-mono">{prev.score.toFixed(1)}</b> {starText(prev.stars)} → this one <b className="font-mono">{score.total.toFixed(1)}</b> <span className={score.total >= prev.score ? 'text-ok' : 'text-bad'}>({score.total >= prev.score ? '+' : ''}{(score.total - prev.score).toFixed(1)})</span></p>}
            <button className="btn btn-sm mt-2 w-full" onClick={() => { const names = [...new Set(crew.map((c) => c.name))].join(' + '); navigator.clipboard?.writeText(toCsv(names)); setStatus('Results copied (CSV): paste them on the teacher page.'); }}>Export results (CSV)</button>
            {lastEntry && (
              <div className="mt-3 border-t border-line/60 pt-3">
                <div className="panel-title">Send this result to my class</div>
                <p className="mt-1 text-[11px] leading-snug text-mute">Type the class code shown on your teacher's results page (teacher.html). This sends your team name, the mission, your score and how the flight ended to anyone who has that code. Nothing is sent unless you press the button.</p>
                <div className="mt-2 flex gap-2"><input className="field !py-1.5 font-mono text-xs" value={classCode} onChange={(e) => setClassCode(e.target.value)} placeholder="K7QF-3MXA-RD2T" aria-label="Class code" />
                  <button className="btn btn-sm" onClick={async () => {
                    if (!isValid(classCode)) { setClassMsg('That is not a class code. It has 12 letters and digits, like K7QF-3MXA-RD2T.'); return; }
                    write('tminus.classCode', normalise(classCode)); setClassMsg('Sending…');
                    const names = [...new Set(crew.map((c) => c.name))].join(' + ');
                    const ok = await publishToTopic(classTopic(classCode), csvRow(names, lastEntry));
                    setClassMsg(ok ? 'Sent. Your teacher sees it now.' : 'Could not reach the relay (are you online?). Use Export results (CSV) instead.');
                  }}>Send</button></div>
                {classMsg && <p className="mt-1 text-[11px] text-mute" role="status">{classMsg}</p>}
              </div>
            )}
            {status && <p className="mt-2 text-[11px] text-ok" role="status">{status}</p>}
          </Panel>
        </div>

        {/* timeline + flight data */}
        <div className="flex min-h-0 flex-col gap-3">
          <Panel title="Causal timeline" className="min-h-0">
            <ol className="relative max-h-[420px] space-y-1 overflow-y-auto border-l border-line pl-4 pr-1">
              {timeline.map((e, i) => {
                const ops_ = e.system === 'operations'; const when = ops_ ? `Day ${Math.max(0, Math.round((e.time - flight.flightTimeS) / 86400))}` : `T+${e.time.toFixed(0)}s`;
                const tone = e.severity >= Severity.Fault ? 'border-bad/50 bg-bad/10' : e.severity === Severity.Warning ? 'border-warn/40 bg-warn/10' : 'border-line/70 bg-[#0a1226]/60';
                return (
                  <li key={i} className={`relative rounded-lg border px-3 py-1.5 text-[12px] ${tone}`}>
                    <span className={`absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full ring-2 ring-[#050a16] ${e.severity >= Severity.Fault ? 'bg-bad' : e.severity === Severity.Warning ? 'bg-warn' : 'bg-cyanx'}`} />
                    <div className="flex items-baseline gap-2"><span className="font-mono text-[10px] text-mute">{when}</span><span className="font-mono text-[10px] font-bold uppercase text-mute">{e.code}</span>{e.causeId && <span className="ml-auto rounded bg-accent/20 px-1.5 font-mono text-[10px] font-bold text-accent2">cause: {e.causeId}</span>}</div>
                    <div className="mt-0.5 leading-snug">{e.message}</div>
                  </li>
                );
              })}
            </ol>
          </Panel>
          {tel.length > 1 && (
            <Panel title="Flight data">
              <LineChart xLabel="time (s)" yLabel="altitude (km)" series={[{ color: '#38d6ff', points: tel.map((t) => ({ x: t.t, y: t.altitudeKm })) }]} xMax={tel[tel.length - 1].t} markerX={cur?.t} formatY={(v) => v.toFixed(0)} height={130} area />
              <div className="mt-1 grid grid-cols-2 gap-3"><LineChart xLabel="time (s)" yLabel="Q (kPa)" series={[{ color: '#ff7a1a', points: tel.map((t) => ({ x: t.t, y: t.qKPa })) }]} xMax={tel[tel.length - 1].t} markerX={cur?.t} formatY={(v) => v.toFixed(0)} height={110} area />
                <LineChart xLabel="time (s)" yLabel="speed (m/s)" series={[{ color: '#4ade80', points: tel.map((t) => ({ x: t.t, y: t.speedMs })) }]} xMax={tel[tel.length - 1].t} markerX={cur?.t} formatY={(v) => v.toFixed(0)} height={110} area /></div>
              <div className="mt-2 flex items-center gap-3"><input type="range" className="flex-1" min={0} max={tel.length - 1} value={sc} onChange={(e) => setScrub(+e.target.value)} aria-label="Scrub the flight" />
                <span className="w-56 text-right font-mono text-[11px] text-mute">T+{cur?.t.toFixed(0)}s · {cur?.altitudeKm.toFixed(1)} km · {cur?.speedMs.toFixed(0)} m/s · Q {cur?.qKPa.toFixed(1)}</span></div>
              <div className="mt-2 flex flex-wrap gap-2">{failTime != null && <button className="btn btn-sm" onClick={() => { useGame.setState({ replay: true }); go('flight'); }}><Play size={13} />Watch the failure replay</button>}<span className="text-[11px] text-mute self-center">Max-Q {flight.maxQKPa.toFixed(1)} kPa at T+{flight.maxQTimeS.toFixed(0)}s · <button className="text-cyanx hover:underline" onClick={() => openCodex('max_q')}>what is max-Q?</button></span></div>
            </Panel>
          )}
        </div>

        {/* operations + reward */}
        <div className="flex min-h-0 flex-col gap-3">
          {cube && (
            <Panel title="30 days of operations">
              <div className="grid grid-cols-4 gap-3 text-center">{[['Days alive', ops.daysAlive], ['Images taken', ops.imagesTaken], ['Downlinked', ops.imagesDownlinked], ['Battery', ops.finalSoc * 100]].map(([l, v]) => <div key={l} className="rounded-xl border border-line bg-[#0a1226]/70 p-2"><div className="font-display text-2xl font-bold"><CountUp value={+v} delay={0.4} />{l === 'Battery' ? '%' : ''}</div><div className="text-[10px] uppercase tracking-wider text-mute">{l}</div></div>)}</div>
              {ops.timeline.length > 0 && <div className="mt-3"><LineChart xLabel="day" yLabel="state of charge" xMax={ops.timeline.length} yMax={1} series={[{ color: '#4ade80', points: ops.timeline.map((t) => ({ x: t.day, y: t.stateOfCharge })) }]} formatY={(v) => `${(v * 100).toFixed(0)}%`} height={120} area />
                <LineChart xLabel="day" yLabel="MB" xMax={ops.timeline.length} series={[{ color: '#ff7a1a', points: ops.timeline.map((t) => ({ x: t.day, y: t.storedMB })) }, { color: '#38d6ff', points: ops.timeline.map((t) => ({ x: t.day, y: t.downlinkedMB })) }]} height={120} formatY={(v) => v.toFixed(0)} /><Legend items={[{ label: 'battery', color: '#4ade80' }, { label: 'stored MB', color: '#ff7a1a' }, { label: 'downlinked MB', color: '#38d6ff' }]} /></div>}
              {ops.failures.length > 0 && <ul className="mt-3 space-y-1.5">{ops.failures.slice(0, 6).map((f, i) => <li key={i} className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-1.5 text-[12px]">{f}</li>)}</ul>}
            </Panel>
          )}
          {cube && images.length > 0 && (
            <Panel title="Science reward · Landsat, Lake Manchar" right={<Award size={15} className="text-accent" />}>
              <p className="mb-3 text-[12px] text-mute">Real NASA/USGS Landsat images of the 2022 floods, shown at your camera's detail ({+(d.budget?.gsdM ?? 0).toFixed(1)} m/pixel). Each third of the image goal returned unlocks one more date.</p>
              <div className="flex flex-wrap gap-4">{images.map((img, i) => <Tile key={img.date} img={img} unlocked={i < unlocked} gsd={d.budget?.gsdM ?? 100} />)}{!isBundled(selectedRegion()) && !game.judge && <LiveTile region={selectedRegion()} gsd={d.budget?.gsdM ?? 100} />}</div>
              <p className="mt-3 text-[10px] text-mute">{d.mission.rewardCredit}</p>
            </Panel>
          )}
          {!cube && <Panel title="Flight summary"><div className="grid grid-cols-2 gap-3 text-sm"><div>Flight time <b className="font-mono">{flight.flightTimeS.toFixed(0)} s</b></div><div>Apoapsis <b className="font-mono">{flight.apoapsisKm.toFixed(0)} km</b></div><div>Periapsis <b className="font-mono">{flight.periapsisKm.toFixed(0)} km</b></div><div>Δv left <b className="font-mono">{Math.round(flight.deltaVLeftMs).toLocaleString()} m/s</b></div></div></Panel>}
        </div>
      </div>

      <Modal open={lbOpen} onClose={() => setLbOpen(false)} title="Local leaderboard" footer={<button className="btn btn-primary" onClick={submitScore}>Save my {score.total.toFixed(1)}</button>}>
        <div className="mb-3 flex items-center gap-2"><span className="text-sm text-mute">Name</span><input className="field !w-52" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} aria-label="Your name" /></div>
        <ol className="space-y-1.5">{rows.length === 0 && <li className="text-sm text-mute">No scores yet on this computer.</li>}{rows.map((r, i) => <li key={i} className="flex items-center gap-3 rounded-lg border border-line bg-[#0a1226]/70 px-3 py-2 text-sm"><span className="w-6 font-display text-lg font-bold text-accent2">{i + 1}</span><span className="flex-1">{r.name}</span><span className="font-mono">{r.score.toFixed(1)}</span><button className="text-[11px] text-cyanx hover:underline" onClick={() => { navigator.clipboard?.writeText(r.code); say('Design code copied.', 'ok'); }}>copy code</button></li>)}</ol>
        <p className="mt-3 text-[11px] text-mute">The leaderboard is local to this browser.</p>
      </Modal>
      <Modal open={cmpOpen} onClose={() => setCmpOpen(false)} title="Compare with a shared design" footer={<button className="btn btn-primary" onClick={compare}>Compare</button>}>
        <textarea className="field h-24 font-mono text-xs" placeholder="Paste a TM1- design code…" value={cmpCode} onChange={(e) => setCmpCode(e.target.value)} aria-label="Design code to compare" />
        {cmp && <table className="mt-4 w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-mute"><th>Metric</th><th>Yours</th><th>Shared</th></tr></thead><tbody>
          {[['Mass (kg)', 'massKg', 2, 'lower'], ['Cost (M$)', 'totalCostM', 3, 'lower'], ['Power margin (W)', 'marginW', 2, 'higher'], ['Images to ground', 'imagesDownlinkedMission', 0, 'higher'], ['Detail (m/px)', 'gsdM', 1, 'lower']].map(([l, k, dec, better]) => { const a = cmp.a[k]; const b = cmp.b[k]; const good = better === 'lower' ? b < a : b > a; return <tr key={k} className="border-t border-line/60"><td className="py-1.5">{l}</td><td className="font-mono">{a.toFixed(dec)}</td><td className={`font-mono ${Math.abs(a - b) < 1e-9 ? '' : good ? 'text-ok' : 'text-bad'}`}>{b.toFixed(dec)}</td></tr>; })}</tbody></table>}
      </Modal>
    </Frame>
  );
}
