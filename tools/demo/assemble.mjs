// Assembles the demo video: frames -> H.264 1080p30, ambient music + engine/boom/chime sound design (all synthesised here with ffmpeg),
// narration cues placed on the recorded video markers, music ducked under the voice, loudness normalised.
//   node tools/demo/assemble.mjs            -> demo-output/T-MINUS_Demo_1080p.mp4 (+ _NoVoiceover.mp4)
//   node tools/demo/assemble.mjs --audio    -> only builds the audio (demo-work/audio/*.wav), for checking
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const work = 'demo-work'; const audio = path.join(work, 'audio'); const outDir = 'demo-output';
fs.mkdirSync(audio, { recursive: true }); fs.mkdirSync(outDir, { recursive: true });
const ff = (args, label) => { const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }); if (r.status !== 0) { console.error(`ffmpeg failed (${label}):\n${r.stderr}`); process.exit(1); } };
const probe = (f) => parseFloat(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout);
const tl = fs.existsSync(path.join(work, 'timeline.json')) ? JSON.parse(fs.readFileSync(path.join(work, 'timeline.json'), 'utf8')) : { marks: {}, frames: 5400, fps: 30 };
const DUR = 180; const M = tl.marks;
console.log('marks:', JSON.stringify(M));

// ------------------------------------------------------------------ music: a slowly evolving ambient pad (Am9 -> Fmaj7 -> Cmaj9 -> G6), reverb, gentle swell
const chords = [[110, 164.81, 220, 261.63, 329.63, 493.88], [87.31, 130.81, 174.61, 220, 261.63, 329.63], [130.81, 196, 261.63, 329.63, 392, 587.33], [98, 146.83, 196, 246.94, 329.63, 392]];
chords.forEach((c, i) => {
  const voices = c.map((f, k) => `${(0.2 / (1 + k * 0.35)).toFixed(3)}*(sin(2*PI*${f}*t)+0.55*sin(2*PI*${(f * 1.004).toFixed(3)}*t)+0.25*sin(2*PI*${f * 2}*t))`).join('+');
  const env = `(0.78+0.22*sin(2*PI*0.09*t+${i}))`;
  ff(['-f', 'lavfi', '-i', `aevalsrc='(${voices})*${env}|(${voices})*(0.78+0.22*sin(2*PI*0.11*t+${i + 1}))':s=44100:d=52`, '-af', 'lowpass=f=2600,aecho=0.8:0.88:700|1300:0.35|0.25', path.join(audio, `pad_${i}.wav`)], `pad ${i}`);
});
ff(['-i', path.join(audio, 'pad_0.wav'), '-i', path.join(audio, 'pad_1.wav'), '-i', path.join(audio, 'pad_2.wav'), '-i', path.join(audio, 'pad_3.wav'), '-filter_complex',
  '[0][1]acrossfade=d=6:c1=tri:c2=tri[a];[a][2]acrossfade=d=6:c1=tri:c2=tri[b];[b][3]acrossfade=d=6:c1=tri:c2=tri,atrim=0:182,afade=t=in:d=4,afade=t=out:st=176:d=4,volume=0.55', path.join(audio, 'music.wav')], 'music');

// ------------------------------------------------------------------ sound effects
const sfx = [];
const at = (name, t, file, vol = 1) => sfx.push({ name, t, file, vol });
const rumble = (name, len) => ff(['-f', 'lavfi', '-i', `anoisesrc=color=brown:d=${len}:amplitude=0.9:sample_rate=44100`, '-af', `lowpass=f=240,highpass=f=28,volume=1.4,afade=t=in:d=1.4,afade=t=out:st=${len - 1.6}:d=1.6`, path.join(audio, `${name}.wav`)], name);
const failLen = Math.max(6, (M.fail_boom ?? 96) - (M.fail_launch ?? 88) + 1.2); const okLen = Math.max(8, (M.ok_orbit ?? 138) - (M.ok_launch ?? 124) + 1.4);
rumble('rumble_fail', failLen); rumble('rumble_ok', okLen);
ff(['-f', 'lavfi', '-i', 'anoisesrc=color=brown:d=3.2:amplitude=1', '-af', 'lowpass=f=300,highpass=f=24,volume=3.2,afade=t=in:d=0.02,afade=t=out:st=0.2:d=3.0', path.join(audio, 'boom.wav')], 'boom');
ff(['-f', 'lavfi', '-i', "aevalsrc='0.28*exp(-1.6*t)*(sin(2*PI*880*t)+0.6*sin(2*PI*1318.5*t)+0.45*sin(2*PI*1760*t)+0.3*sin(2*PI*2637*t))':s=44100:d=3.5", path.join(audio, 'chime.wav')], 'chime');
at('rumble_fail', M.fail_launch ?? 88, 'rumble_fail', 0.55); at('boom', M.fail_boom ?? 96, 'boom', 0.8);
at('rumble_ok', M.ok_launch ?? 124, 'rumble_ok', 0.5); at('chime', (M.ok_orbit ?? 138) - 0.5, 'chime', 0.7); at('chime2', M.s8 ?? 141, 'chime', 0.45);

// ------------------------------------------------------------------ narration placement (never overlapping, never earlier than its anchor)
const cfg = JSON.parse(fs.readFileSync('tools/demo/narration.json', 'utf8'));
const placed = []; let prevEnd = 0;
for (const c of cfg.cues) {
  const f = path.join(audio, `cue_${c.id}.wav`); if (!fs.existsSync(f)) { console.error(`missing ${f} — run tools/demo/narrate.ps1 first`); process.exit(1); }
  const d = probe(f); const want = (M[c.at] ?? 0) + c.off; const start = Math.max(want, prevEnd + 0.3);
  placed.push({ id: c.id, f, start, d, shifted: +(start - want).toFixed(2) }); prevEnd = start + d;
}
console.log('narration:\n' + placed.map((p) => `  ${p.id.padEnd(12)} ${p.start.toFixed(1).padStart(6)}s → ${(p.start + p.d).toFixed(1).padStart(6)}s  (${p.d.toFixed(1)}s${p.shifted > 0.05 ? `, pushed +${p.shifted}s` : ''})`).join('\n'));
if (prevEnd > DUR) console.log(`!! narration runs past the end (${prevEnd.toFixed(1)}s)`);

function mix(withVoice, outFile) {
  const inputs = []; const filters = []; let n = 0;
  const add = (file, delay, vol) => { inputs.push('-i', file); filters.push(`[${n}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${Math.round(delay * 1000)}|${Math.round(delay * 1000)},volume=${vol}[a${n}]`); return n++; };
  const music = add(path.join(audio, 'music.wav'), 0, 1);
  const fx = sfx.map((s) => add(path.join(audio, `${s.file}.wav`), s.t, s.vol));
  const voice = withVoice ? placed.map((p) => add(p.f, p.start, 1.35)) : [];
  let g = filters.join(';') + ';';
  if (withVoice) {
    g += `${voice.map((i) => `[a${i}]`).join('')}amix=inputs=${voice.length}:normalize=0:duration=longest,apad=whole_dur=${DUR}[voice];[voice]asplit=2[vs][vo];`;
    g += `[a${music}][vs]sidechaincompress=threshold=0.02:ratio=9:attack=30:release=500:makeup=1[duck];`;
    g += `[duck]${fx.map((i) => `[a${i}]`).join('')}[vo]amix=inputs=${fx.length + 2}:normalize=0:duration=longest,`;
  } else {
    g += `[a${music}]${fx.map((i) => `[a${i}]`).join('')}amix=inputs=${fx.length + 1}:normalize=0:duration=longest,`;
  }
  g += `atrim=0:${DUR},loudnorm=I=-16:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo[out]`;
  ff([...inputs, '-filter_complex', g, '-map', '[out]', '-t', String(DUR), '-c:a', 'pcm_s16le', outFile], 'mix');
}
mix(true, path.join(audio, 'mix_voice.wav')); mix(false, path.join(audio, 'mix_music.wav'));
console.log('audio mixed');
if (process.argv.includes('--audio')) process.exit(0);

// ------------------------------------------------------------------ video
const frames = fs.readdirSync(path.join(work, 'frames')).filter((f) => f.endsWith('.jpg')).length;
console.log(`frames: ${frames} (${(frames / 30).toFixed(1)} s)`);
const encode = (audioFile, outFile) => ff(['-framerate', '30', '-i', path.join(work, 'frames', 'f_%05d.jpg'), '-i', audioFile,
  '-vf', `scale=1920:1080:flags=lanczos,fade=t=in:st=0:d=0.6,fade=t=out:st=${(frames / 30 - 0.9).toFixed(2)}:d=0.9,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-level', '4.2', '-r', '30', '-g', '60', '-bf', '2', '-tune', 'film',
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', '-metadata', 'title=T-MINUS demo', outFile], `encode ${outFile}`);
encode(path.join(audio, 'mix_voice.wav'), path.join(outDir, 'T-MINUS_Demo_1080p.mp4'));
encode(path.join(audio, 'mix_music.wav'), path.join(outDir, 'T-MINUS_Demo_1080p_NoVoiceover.mp4'));
for (const f of fs.readdirSync(outDir)) { const p = path.join(outDir, f); console.log(`${f}: ${(fs.statSync(p).size / 1048576).toFixed(1)} MB, ${probe(p).toFixed(2)} s`); }
