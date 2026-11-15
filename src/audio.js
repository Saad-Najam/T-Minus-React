// Tiny WebAudio layer (port of AudioFx / EngineSound): an engine rumble that follows thrust and altitude, plus UI blips. No audio files needed.
let ctx = null;
const getCtx = () => {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
};

export function blip(volume = 0.7, freq = 660, dur = 0.09, type = 'sine') {
  const c = getCtx(); if (!c || volume <= 0) return;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.12 * volume, c.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + 0.02);
}

export class EngineSound {
  constructor(volume = 0.7) {
    this.volume = volume; this.c = getCtx(); if (!this.c) return;
    const len = this.c.sampleRate * 2; const buf = this.c.createBuffer(1, len, this.c.sampleRate); const d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // brown noise
    this.src = this.c.createBufferSource(); this.src.buffer = buf; this.src.loop = true;
    this.filter = this.c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 400;
    this.gain = this.c.createGain(); this.gain.gain.value = 0;
    this.src.connect(this.filter).connect(this.gain).connect(this.c.destination); this.src.start();
  }
  set(thrust, altitudeM) {
    if (!this.c) return;
    const air = Math.exp(-altitudeM / 12000); // thin air: the roar fades with altitude
    this.gain.gain.setTargetAtTime(this.volume * 0.9 * thrust * (0.15 + 0.85 * air), this.c.currentTime, 0.1);
    this.filter.frequency.setTargetAtTime(220 + 900 * thrust * air, this.c.currentTime, 0.2);
  }
  setVolume(v) { this.volume = v; }
  stop() { try { this.src?.stop(); this.c?.suspend(); } catch { /* already stopped */ } }
}
