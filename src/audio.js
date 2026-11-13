// Звук: синтез эффектов через WebAudio (без файлов) + простая чиптюн-музыка
let ac = null, master = null, sfxBus = null, musBus = null, noiseBuf = null, musicOn = false, musicTimer = null;
let muted = false;
try { muted = localStorage.getItem('izb-mute') === '1'; } catch {}
const last = {};

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ac.destination);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
  musBus = ac.createGain(); musBus.gain.value = 0.16; musBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m; try { localStorage.setItem('izb-mute', m ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.7, ac.currentTime, 0.05);
}

function tone({ type = 'square', f = 440, f2 = null, dur = 0.1, vol = 0.3, delay = 0, bus = sfxBus }) {
  const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise({ dur = 0.2, vol = 0.3, f = 1200, f2 = null, type = 'lowpass', delay = 0, bus = sfxBus }) {
  const t0 = ac.currentTime + delay, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t0);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(bus); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
}

const S = {
  shot: () => tone({ f: 1250, f2: 520, dur: 0.06, vol: 0.07 }),
  charge: () => { tone({ type: 'sawtooth', f: 900, f2: 220, dur: 0.14, vol: 0.12 }); noise({ dur: 0.08, vol: 0.08, f: 4000 }); },
  throw: () => tone({ type: 'triangle', f: 300, f2: 600, dur: 0.12, vol: 0.15 }),
  hit: () => { noise({ dur: 0.05, vol: 0.14, f: 3000 }); tone({ f: 260, f2: 120, dur: 0.05, vol: 0.08 }); },
  hitBig: () => { noise({ dur: 0.14, vol: 0.3, f: 1800, f2: 300 }); tone({ type: 'sawtooth', f: 180, f2: 50, dur: 0.16, vol: 0.2 }); },
  jump: () => tone({ f: 330, f2: 660, dur: 0.09, vol: 0.06 }),
  djump: () => { tone({ f: 500, f2: 1000, dur: 0.1, vol: 0.06 }); noise({ dur: 0.08, vol: 0.05, f: 3000, type: 'highpass' }); },
  land: () => noise({ dur: 0.07, vol: 0.08, f: 600 }),
  dash: () => noise({ dur: 0.16, vol: 0.14, f: 500, f2: 3500, type: 'bandpass' }),
  pickup: () => { tone({ f: 880, dur: 0.07, vol: 0.12 }); tone({ f: 1320, dur: 0.1, vol: 0.12, delay: 0.07 }); tone({ f: 1760, dur: 0.12, vol: 0.1, delay: 0.14 }); },
  explode: () => { noise({ dur: 0.5, vol: 0.45, f: 1400, f2: 80 }); tone({ type: 'sine', f: 120, f2: 30, dur: 0.4, vol: 0.4 }); },
  geyser: () => { noise({ dur: 0.7, vol: 0.35, f: 400, f2: 2500, type: 'bandpass' }); tone({ type: 'sine', f: 90, f2: 40, dur: 0.5, vol: 0.3 }); },
  fire: () => { noise({ dur: 0.2, vol: 0.2, f: 700, f2: 2000, type: 'bandpass' }); tone({ type: 'sawtooth', f: 160, f2: 90, dur: 0.18, vol: 0.08 }); },
  fireRing: () => { noise({ dur: 0.45, vol: 0.4, f: 2500, f2: 200 }); tone({ type: 'sine', f: 140, f2: 40, dur: 0.35, vol: 0.35 }); },
  burn: () => noise({ dur: 0.15, vol: 0.18, f: 1500, type: 'bandpass' }),
  iceShot: () => { tone({ type: 'triangle', f: 1800, f2: 1200, dur: 0.08, vol: 0.12 }); tone({ type: 'triangle', f: 2400, dur: 0.05, vol: 0.06, delay: 0.03 }); },
  freeze: () => { tone({ type: 'triangle', f: 2000, f2: 3000, dur: 0.15, vol: 0.1 }); noise({ dur: 0.15, vol: 0.1, f: 6000, type: 'highpass' }); },
  iceWall: () => { noise({ dur: 0.3, vol: 0.25, f: 5000, f2: 1500, type: 'highpass' }); tone({ type: 'triangle', f: 400, f2: 900, dur: 0.2, vol: 0.12 }); },
  blizzard: () => { noise({ dur: 1.4, vol: 0.35, f: 600, f2: 3000, type: 'bandpass' }); },
  shatter: () => { noise({ dur: 0.12, vol: 0.18, f: 5000, type: 'highpass' }); tone({ type: 'triangle', f: 2600, f2: 1800, dur: 0.06, vol: 0.06 }); },
  zap: () => { noise({ dur: 0.12, vol: 0.22, f: 5000, type: 'highpass' }); tone({ type: 'sawtooth', f: 1500, f2: 200, dur: 0.12, vol: 0.12 }); },
  zapSmall: () => tone({ type: 'sawtooth', f: 1200, f2: 300, dur: 0.08, vol: 0.08 }),
  zapHit: () => { noise({ dur: 0.08, vol: 0.15, f: 4000, type: 'highpass' }); tone({ type: 'square', f: 300, f2: 100, dur: 0.06, vol: 0.1 }); },
  teleport: () => { tone({ type: 'square', f: 200, f2: 1800, dur: 0.14, vol: 0.12 }); noise({ dur: 0.2, vol: 0.18, f: 5000, type: 'highpass' }); },
  thunder: () => { noise({ dur: 0.7, vol: 0.45, f: 3000, f2: 100 }); tone({ type: 'sine', f: 70, f2: 30, dur: 0.6, vol: 0.35 }); },
  windup: () => tone({ type: 'sawtooth', f: 120, f2: 260, dur: 0.25, vol: 0.12 }),
  smash: () => { noise({ dur: 0.3, vol: 0.4, f: 800, f2: 100 }); tone({ type: 'sine', f: 110, f2: 35, dur: 0.3, vol: 0.4 }); },
  bigJump: () => tone({ type: 'sawtooth', f: 100, f2: 300, dur: 0.3, vol: 0.15 }),
  slam: () => { noise({ dur: 0.5, vol: 0.5, f: 900, f2: 60 }); tone({ type: 'sine', f: 90, f2: 25, dur: 0.5, vol: 0.5 }); },
  quake: () => { noise({ dur: 1.2, vol: 0.5, f: 300, f2: 60 }); tone({ type: 'sine', f: 55, f2: 25, dur: 1.1, vol: 0.5 }); },
  ult: () => { tone({ type: 'sawtooth', f: 110, f2: 880, dur: 0.5, vol: 0.18 }); tone({ type: 'square', f: 220, f2: 1760, dur: 0.5, vol: 0.08, delay: 0.05 }); noise({ dur: 0.6, vol: 0.2, f: 300, f2: 6000, type: 'bandpass' }); },
  transform: () => { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', f, dur: 0.14, vol: 0.12, delay: i * 0.07 })); noise({ dur: 0.5, vol: 0.25, f: 200, f2: 5000, type: 'bandpass' }); },
  death: () => { tone({ type: 'square', f: 600, f2: 80, dur: 0.35, vol: 0.14 }); noise({ dur: 0.25, vol: 0.2, f: 2000, f2: 200 }); },
  bigDeath: () => { noise({ dur: 1, vol: 0.5, f: 2000, f2: 60 }); tone({ type: 'sawtooth', f: 400, f2: 40, dur: 0.9, vol: 0.25 }); tone({ type: 'sine', f: 80, f2: 20, dur: 0.9, vol: 0.4 }); },
  spawn: () => { tone({ type: 'triangle', f: 400, f2: 900, dur: 0.15, vol: 0.08 }); },
  splash: () => noise({ dur: 0.4, vol: 0.3, f: 1500, f2: 300 }),
  shield: () => tone({ type: 'triangle', f: 700, f2: 500, dur: 0.12, vol: 0.12 }),
  block: () => tone({ type: 'triangle', f: 1500, f2: 900, dur: 0.06, vol: 0.08 }),
  warn: () => { [0, 0.25, 0.5].forEach(d => tone({ type: 'square', f: 880, dur: 0.12, vol: 0.1, delay: d })); },
  wind: () => noise({ dur: 4.5, vol: 0.25, f: 300, f2: 1200, type: 'bandpass' }),
  count: () => tone({ type: 'square', f: 440, dur: 0.12, vol: 0.14 }),
  go: () => { tone({ type: 'square', f: 880, dur: 0.3, vol: 0.16 }); tone({ type: 'square', f: 1320, dur: 0.3, vol: 0.1, delay: 0.05 }); },
  roundEnd: () => { [784, 659, 523].forEach((f, i) => tone({ type: 'square', f, dur: 0.18, vol: 0.12, delay: i * 0.12 })); },
  win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ type: 'square', f, dur: 0.16, vol: 0.12, delay: i * 0.12 })); },
  click: () => tone({ type: 'square', f: 900, f2: 1200, dur: 0.04, vol: 0.08 }),
};

export function sfx(name) {
  if (!ac || muted || !name || !S[name]) return;
  const now = ac.currentTime;
  if (last[name] && now - last[name] < 0.035) return;
  last[name] = now;
  try { S[name](); } catch {}
}

// музыка: 4 такта, бас + арпеджио + ударные, 132 BPM
const PROG = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export function startMusic() {
  if (!ac || musicOn) return; musicOn = true;
  const spb = 60 / 132 / 4; let step = 0, next = ac.currentTime + 0.1;
  musicTimer = setInterval(() => {
    while (next < ac.currentTime + 0.25) {
      const bar = Math.floor(step / 16) % 4, s = step % 16, ch = PROG[bar], d = next - ac.currentTime;
      if (s % 4 === 0) tone({ type: 'triangle', f: mtof(ch[0] - 24), dur: spb * 3.5, vol: 0.5, delay: d, bus: musBus });
      if (s % 2 === 0) tone({ type: 'square', f: mtof(ch[(s / 2) % 3] + 12 + (s >= 8 ? 12 : 0)), dur: spb * 1.4, vol: 0.12, delay: d, bus: musBus });
      if (s % 8 === 0) tone({ type: 'sine', f: 150, f2: 40, dur: 0.15, vol: 0.7, delay: d, bus: musBus });
      if (s % 8 === 4) noise({ dur: 0.1, vol: 0.35, f: 2000, type: 'bandpass', delay: d, bus: musBus });
      if (s % 2 === 1) noise({ dur: 0.03, vol: 0.15, f: 8000, type: 'highpass', delay: d, bus: musBus });
      next += spb; step++;
    }
  }, 60);
}
export function stopMusic() { musicOn = false; clearInterval(musicTimer); }
