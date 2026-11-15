import { motion } from 'framer-motion';
import { AlertTriangle, Check, ClipboardCheck, Copy, Rocket, ShieldCheck, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Frame from '../components/Frame.jsx';
import { Panel } from '../components/ui.jsx';
import { useGame } from '../state/store.js';
import { CrewRole, decodeVote, designHash, encodeVote, roleName } from '../engine/design.js';
import { openCodex } from '../components/HoustonPanel.jsx';
import { isValid as roomValid, latestPad, newRoomCode, padMessage, poll as pollRoom, publish as publishRoom } from '../engine/relay.js';
import { VOTE_PREFIX } from '../engine/design.js';

const ROLES = [CrewRole.FlightDirector, CrewRole.PropulsionStructures, CrewRole.SpacecraftComms, CrewRole.ScienceBudget];
const SCENE_LABEL = { bay: 'Integration Bay', vab: 'VAB', avionics: 'Avionics Bay', briefing: 'Briefing' };

export default function Pad() {
  const game = useGame();
  const { data, crew, launch, vehicle, spacecraft, missionId, pullPin, setArmed, recordPoll, noGoRound, commitLaunch, go, addRemoteVote, say } = game;
  const items = game.checklist();
  const rocket = data.getRocket(vehicle.rocketId);
  const failing = items.filter((i) => !i.pass);
  const [count, setCount] = useState(null);
  const [voteCode, setVoteCode] = useState('');
  const [padCode, setPadCode] = useState('');
  const [myRole, setMyRole] = useState(CrewRole.FlightDirector);
  const roles = ROLES.filter((r) => items.some((i) => i.role === r));
  const bundle = useMemo(() => ({ missionId, spacecraft, vehicle }), [missionId, spacecraft, vehicle]);
  useEffect(() => { import('../engine/design.js').then((m) => m.encodeDesign(bundle)).then(setPadCode); }, [bundle]);

  // Live room (audit F25): the host's pad code and the crew's votes travel through a free public relay; copy-paste still works offline.
  const [room, setRoom] = useState(''); const [joinCode, setJoinCode] = useState(''); const [roomMsg, setRoomMsg] = useState(''); const sinceId = useRef(null);
  useEffect(() => {
    if (!roomValid(room)) return undefined;
    let dead = false;
    const tick = async () => {
      const msgs = await pollRoom(room, sinceId.current);
      if (dead || !msgs) { if (!dead && !msgs) setRoomMsg('Could not reach the relay. Copying codes by hand still works.'); return; }
      if (msgs.length) sinceId.current = msgs[msgs.length - 1].id ?? sinceId.current;
      for (const m of msgs) {
        if (!m.text.startsWith(VOTE_PREFIX)) continue;
        const { vote } = decodeVote(m.text);
        if (vote && vote.designHash === designHash(useGame.getState().spacecraft ? { missionId: useGame.getState().missionId, spacecraft: useGame.getState().spacecraft, vehicle: useGame.getState().vehicle } : bundle)) addRemoteVote(vote);
      }
      setRoomMsg(`Live: room ${room} · checked ${new Date().toLocaleTimeString()}`);
    };
    tick(); const id = setInterval(tick, 4000);
    return () => { dead = true; clearInterval(id); };
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps
  const createRoom = async () => {
    const code = newRoomCode(); setRoom(code); sinceId.current = null; setRoomMsg('Room created. Sending your pad code…');
    const msg = padMessage(padCode); const ok = msg ? await publishRoom(code, msg) : false;
    setRoomMsg(ok ? `Room ${code}: teammates enter this code to join. Votes appear here by themselves.` : 'Room created, but the pad code could not be sent (offline or too long). Share the pad code by hand.');
  };
  const joinRoom = async () => {
    if (!roomValid(joinCode)) { setRoomMsg('That is not a room code. It has 12 letters and digits, like K7QF-3MXA-RD2T.'); return; }
    setRoomMsg('Joining…'); const msgs = await pollRoom(joinCode, null); const code = latestPad(msgs);
    if (!msgs) { setRoomMsg('Could not reach the relay. Paste the pad code by hand instead.'); return; }
    if (!code) { setRoomMsg('The room has no pad code yet. Ask the host to open the Pad.'); return; }
    if (await game.importCode(code)) { setRoom(joinCode); setRoomMsg('Joined. Your role list is below; press Send my vote when ready.'); }
  };
  const sendVote = async () => { const ok = await publishRoom(room, myVote()); say(ok ? 'Vote sent to the room.' : 'Could not reach the relay: use Copy my vote code.', ok ? 'ok' : 'warn'); };

  const votes = Object.fromEntries(launch.poll.map((p) => p.split(':')));
  const remote = Object.fromEntries(launch.remoteVotes.filter((v) => v.designHash === designHash(bundle)).map((v) => [v.role, v.go ? 'GO' : 'NO-GO']));
  const allVotes = { ...remote, ...votes };
  const allGo = roles.every((r) => allVotes[r] === 'GO');
  const anyNoGo = roles.some((r) => allVotes[r] === 'NO-GO');

  useEffect(() => {
    if (count == null) return undefined;
    if (count <= 0) { commitLaunch(); go('flight'); return undefined; }
    const t = setTimeout(() => setCount((c) => c - 1), 900);
    return () => clearTimeout(t);
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  const byRole = (r) => items.filter((i) => i.role === r);
  const doAction = (a) => (a === 'pull_rbf' ? pullPin(true) : setArmed(true));
  const owner = (r) => crew.find((c) => c.role === r)?.name;
  const castVote = (r, go_) => { recordPoll(r, go_); if (!go_) { noGoRound(); say(`${roleName(r)} called NO-GO. Fix the open items, then poll again.`, 'warn'); } };
  const myVote = () => encodeVote({ role: myRole, go: byRole(myRole).every((i) => i.pass), name: crew.find((c) => c.role === myRole)?.name ?? 'Crew', designHash: designHash(bundle), openItems: byRole(myRole).filter((i) => !i.pass).length });

  return (
    <Frame screen="pad" title="Launch Pad">
      <div className="grid min-h-0 gap-3 lg:h-full lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-1">
          <div className="panel flex flex-wrap items-center gap-4 p-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${failing.length ? 'bg-bad/15 text-bad' : 'bg-ok/15 text-ok'}`}>{failing.length ? <AlertTriangle size={28} /> : <ShieldCheck size={28} />}</div>
            <div className="flex-1"><h2 className="font-display text-2xl font-bold">{failing.length ? `${failing.length} open item${failing.length > 1 ? 's' : ''} before launch` : 'All checks pass — ready for the GO / NO-GO poll'}</h2>
              <p className="text-sm text-mute">{rocket?.name} · {data.getRules().getLaunchSite(vehicle.launchSiteId)?.name}. You may launch with open items, but every known FAIL costs decision-quality points and the debrief will name it.</p></div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {roles.map((r) => (
              <Panel key={r} title={roleName(r)} right={<span className="text-[11px] text-mute">{owner(r)}</span>}>
                <ul className="space-y-2">
                  {byRole(r).map((it) => (
                    <motion.li key={it.id} layout className={`rounded-xl border p-3 ${it.pass ? 'border-ok/30 bg-ok/5' : 'border-bad/35 bg-bad/5'}`}>
                      <div className="flex items-start gap-2.5"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${it.pass ? 'bg-ok text-[#04120a]' : 'bg-bad text-[#1a0505]'}`}>{it.pass ? <Check size={13} /> : <X size={13} />}</span>
                        <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[13px] font-semibold"><span className="font-mono text-[10px] font-bold">{it.pass ? 'PASS' : 'FAIL'}</span>{it.title}</div><p className="mt-0.5 text-[12px] leading-snug text-mute">{it.detail}</p></div></div>
                      {!it.pass && <div className="mt-2 flex flex-wrap gap-2 pl-7">
                        {it.action && <button className="btn btn-sm btn-primary" onClick={() => doAction(it.action)}>{it.action === 'pull_rbf' ? 'Pull the pin' : 'Arm Safe/Arm'}</button>}
                        {it.fixScene && <button className="btn btn-sm" onClick={() => go(it.fixScene)}>Fix in {SCENE_LABEL[it.fixScene]}</button>}
                        {it.codexId && <button className="btn btn-ghost btn-sm" onClick={() => openCodex(it.codexId)}>Why?</button>}</div>}
                    </motion.li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center gap-2 border-t border-line/60 pt-3">
                  <span className="text-[11px] uppercase tracking-wider text-mute">Poll</span>
                  <button className={`btn btn-sm ${allVotes[r] === 'GO' ? 'border-ok bg-ok/20 text-ok' : ''}`} onClick={() => castVote(r, true)}><ThumbsUp size={13} />GO</button>
                  <button className={`btn btn-sm ${allVotes[r] === 'NO-GO' ? 'border-bad bg-bad/20 text-bad' : ''}`} onClick={() => castVote(r, false)}><ThumbsDown size={13} />NO-GO</button>
                  {remote[r] && !votes[r] && <span className="ml-auto text-[10px] text-cyanx">remote vote</span>}
                </div>
              </Panel>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          <Panel title="Launch control">
            <div className="space-y-2.5">
              {roles.map((r) => <div key={r} className="flex items-center justify-between text-[13px]"><span className="text-mute">{roleName(r)}</span><span className={`font-mono text-xs font-bold ${allVotes[r] === 'GO' ? 'text-ok' : allVotes[r] === 'NO-GO' ? 'text-bad' : 'text-mute'}`}>{allVotes[r] ?? '—'}</span></div>)}
            </div>
            <div className="divider my-4" />
            {count == null ? (
              <>
                <button className="btn btn-primary w-full py-3.5 text-base" disabled={!allGo && !anyNoGo ? false : anyNoGo} onClick={() => setCount(0)}><Rocket size={18} />{allGo ? 'Start the countdown' : 'Launch anyway'}</button>
                {anyNoGo && <p className="mt-2 flex items-start gap-1.5 text-[11px] text-bad"><AlertTriangle size={12} className="mt-0.5 shrink-0" />A role called NO-GO. Resolve it and poll again — or reset the poll to override (it costs decision points).</p>}
                {anyNoGo && <button className="btn btn-sm mt-2 w-full" onClick={() => game.noGoRound()}>Reset the poll (override)</button>}
                {!allGo && !anyNoGo && <p className="mt-2 text-[11px] text-mute">Tip: run the poll first. Roles that haven't voted count as unconfirmed.</p>}
              </>
            ) : (
              <div className="text-center"><motion.div key={count} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-8xl font-bold text-accent text-glow">{count > 0 ? count : 'T-0'}</motion.div>
                <button className="btn btn-sm mt-3" onClick={() => setCount(null)}>Abort countdown</button></div>
            )}
          </Panel>
          <Panel title="Remote crew (no server)">
            <p className="mb-2 text-[11px] leading-snug text-mute">Teammates on other computers paste your pad code, see only their role's checklist, and send back a vote code.</p>
            <div className="mb-3 rounded-xl border border-cyanx/30 bg-cyanx/5 p-3">
              <div className="panel-title text-cyanx">Live room</div>
              {roomValid(room) ? <div className="mt-1 font-mono text-lg font-bold tracking-widest text-accent2">{room}</div> : null}
              <div className="mt-2 flex flex-wrap gap-2"><button className="btn btn-sm" onClick={createRoom}>Host a room</button>{roomValid(room) && <button className="btn btn-sm" onClick={sendVote}>Send my vote</button>}</div>
              <div className="mt-2 flex gap-2"><input className="field !py-1.5 font-mono text-[11px]" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Room code to join" aria-label="Room code" /><button className="btn btn-sm" onClick={joinRoom}>Join</button></div>
              {roomMsg && <p className="mt-2 text-[11px] text-mute" role="status">{roomMsg}</p>}
            </div>
            <div className="flex gap-2"><input className="field !py-1.5 font-mono text-[10px]" readOnly value={padCode} aria-label="Pad code" /><button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(padCode); say('Pad code copied.', 'ok'); }}><Copy size={13} /></button></div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-mute">I am: <select className="field !w-auto !py-1 text-xs" value={myRole} onChange={(e) => setMyRole(e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{roleName(r)}</option>)}</select></div>
            <button className="btn btn-sm mt-2 w-full" onClick={() => { navigator.clipboard?.writeText(myVote()); say('Vote code copied. Send it to your host.', 'ok'); }}><ClipboardCheck size={14} />Copy my vote code</button>
            <div className="mt-3 flex gap-2"><input className="field !py-1.5 font-mono text-[10px]" value={voteCode} onChange={(e) => setVoteCode(e.target.value)} placeholder="Paste a TMV1- vote…" aria-label="Vote code" />
              <button className="btn btn-sm" onClick={() => { const { vote, error } = decodeVote(voteCode); if (!vote) { say(error, 'bad'); return; } if (vote.designHash !== designHash(bundle)) { say('That vote is for an older version of the design.', 'warn'); return; } addRemoteVote(vote); setVoteCode(''); say(`${vote.name || 'A teammate'} voted ${vote.go ? 'GO' : 'NO-GO'} for ${roleName(vote.role)}.`, 'ok'); }}>Add</button></div>
          </Panel>
        </div>
      </div>
    </Frame>
  );
}
