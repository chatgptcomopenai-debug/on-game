// Рендер: мир (768×384) в низком разрешении + слой свечения → камера, которая держит в кадре всех игроков.
// Поверх в полном разрешении: метки игроков, цифры урона, прицел, автонаведение, HUD.
import { CFG } from '../config.js';
import { buildMap, drawBackground, drawMovers, px, disc } from './background.js';
import { drawCharacter, drawGun, shade } from './character.js';
import { Particles } from './particles.js';
import { platsAt, supportAt } from '../sim/world.js';
import { sfx } from '../audio.js';

const { W, H } = CFG;
const R = Math.round;
const mkc = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
const [low, lg] = mkc(W, H), [glow, gl] = mkc(W, H), [bloom, bg] = mkc(W / 4, H / 4);
bg.imageSmoothingEnabled = true;
const maps = [];
const getMap = i => maps[i] || (maps[i] = buildMap(i));
export const FONT = '"Press Start 2P", system-ui, sans-serif';

const parts = new Particles();
const per = new Map();
let lastFx = 0, shake = 0, flash = null, lastNow = 0, vign = null, vignKey = '';
const cam = { cx: W / 2, cy: H / 2, h: H, init: false };

export function resetRender() { lastFx = 0; parts.a = []; per.clear(); cam.init = false; }
function flashScreen(c, a) { if (!flash || flash.a < a) flash = { c, a }; }
const hitH = p => 21 * (p.scale || 1);
const PGR = CFG.gravity * 0.8;

function ringPx(g, cx, cy, r, c, a = 1, squash = 1, dash = 0) {
  if (r < 1) return;
  g.globalAlpha = a; g.fillStyle = c;
  const n = Math.max(16, R(r * 5));
  for (let i = 0; i < n; i++) { if (dash && Math.floor(i / dash) % 2) continue; const t = i / n * Math.PI * 2; g.fillRect(R(cx + Math.cos(t) * r), R(cy + Math.sin(t) * r * squash), 1, 1); }
  g.globalAlpha = 1;
}
function both(c, x, y, w, h, a = 1) { lg.globalAlpha = a; px(lg, c, x, y, w, h); gl.globalAlpha = a; px(gl, c, x - 1, y - 1, w + 2, h + 2); lg.globalAlpha = gl.globalAlpha = 1; }
function boltLine(g, x1, y1, x2, y2, c, t, jit = 4) {
  g.strokeStyle = c; g.lineWidth = 1; g.beginPath(); g.moveTo(x1, y1);
  const n = Math.max(3, R(Math.hypot(x2 - x1, y2 - y1) / 8));
  for (let i = 1; i < n; i++) g.lineTo(x1 + (x2 - x1) * i / n + Math.sin(i * 7.3 + t * 60) * jit, y1 + (y2 - y1) * i / n + Math.cos(i * 5.1 + t * 47) * jit);
  g.lineTo(x2, y2); g.stroke();
}
function dot(c, x, y, a = 1) { lg.globalAlpha = a * 0.6; px(lg, '#0b0712', x - 2, y - 2, 4, 4); lg.globalAlpha = a; px(lg, c, x - 1, y - 1, 2, 2); gl.globalAlpha = a * 0.5; px(gl, c, x - 2, y - 2, 4, 4); lg.globalAlpha = gl.globalAlpha = 1; }
let aimPt = null;
function line(g, x1, y1, x2, y2, c, a = 1, w = 1) { g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.globalAlpha = 1; }

// ---------- реакция на новые события: частицы, звук, тряска ----------
function onFx(f) {
  const c = f.c || '#fff';
  if (f.shake) shake = Math.max(shake, f.shake);
  if (f.snd) sfx(f.snd);
  const P = parts;
  switch (f.k) {
    case 'hit': P.burst(f.x, f.y, 7, { cols: [c, '#ffffff'], speed: 95, life: 0.3, glow: true }); break;
    case 'muzzle':
      P.burst(f.x, f.y, 5, { cols: [c, '#ffffff'], speed: 90, life: 0.12, dir: Math.atan2(f.dy || 0, f.dir || 1), spread: 0.8, glow: true });
      if (f.shell) P.add({ x: f.x - (f.dir || 1) * 4, y: f.y, vx: -(f.dir || 1) * (30 + Math.random() * 30), vy: -80 - Math.random() * 40, life: 0.7, c: '#ffcf3a', grav: 500, floor: 330, size: 1 });
      break;
    case 'death':
      P.burst(f.x, f.y, f.big ? 70 : 30, { cols: [c, shade(c, 0.6), '#f3c89b', '#ffffff'], speed: f.big ? 210 : 140, life: 0.9, grav: 320, size: 2, drag: 0.96, floor: 380 });
      P.burst(f.x, f.y, f.big ? 18 : 8, { cols: ['#8a8a99', '#b4b4c4'], speed: 30, life: 1, kind: 'smoke', size: 4, grow: 10, grav: -15 });
      if (f.big) P.burst(f.x, f.y, 30, { cols: ['#ffd23f', '#ffffff'], speed: 160, life: 0.8, glow: true, size: 2 });
      flashScreen('#ffffff', f.big ? 0.55 : 0.12); break;
    case 'transform': P.burst(f.x, f.y, 60, { cols: [c, '#ffffff', '#ffd23f'], speed: 190, life: 0.9, glow: true, size: 2, drag: 0.93 }); flashScreen(c, 0.4); break;
    case 'boom': {
      const big = (f.r || 10) > 20;
      P.burst(f.x, f.y, big ? 45 : 14, { cols: ['#fff3b0', '#ffd23f', c, '#ff3d00'], speed: (f.r || 10) * 5, life: 0.5, glow: true, size: 2, grav: -40 });
      P.burst(f.x, f.y, big ? 12 : 4, { cols: ['#5a5060', '#7a7080'], speed: 25, life: 1.1, kind: 'smoke', size: 4, grow: 12, grav: -25 });
      if (big) { P.burst(f.x, f.y, 12, { cols: ['#3a3040', '#5a4a3a'], speed: 150, life: 0.8, grav: 400, size: 2, floor: 380 }); flashScreen(c, 0.15); }
      break;
    }
    case 'dust': P.burst(f.x, f.y - 1, f.n || 5, { cols: [c, '#cfc6b8'], speed: 55, life: 0.4, dir: -Math.PI / 2, spread: Math.PI * 1.1, kind: 'smoke', size: 2, grow: 6, drag: 0.85 }); break;
    case 'djump': for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; P.add({ x: f.x, y: f.y, vx: Math.cos(a) * 45, vy: Math.sin(a) * 18 + 10, life: 0.3, c: '#ffffff', kind: 'smoke', size: 2, grow: 4, drag: 0.85 }); } break;
    case 'dash': P.burst(f.x, f.y, 12, { cols: [c, shade(c, 1.4)], speed: 50, dir: f.dir > 0 ? Math.PI : 0, spread: 0.5, life: 0.3, size: 2, glow: true }); break;
    case 'smoke': P.burst(f.x, f.y, 16, { cols: [c, shade(c, 1.5)], speed: 50, life: 0.6, kind: 'smoke', size: 4, grow: 10, drag: 0.88 }); break;
    case 'pickup': P.burst(f.x, f.y, 18, { cols: [c, '#ffffff'], speed: 70, life: 0.6, glow: true, grav: -30 }); break;
    case 'pop': P.burst(f.x, f.y, 10, { cols: ['#ffffff', '#ffd23f'], speed: 40, life: 0.4, glow: true }); break;
    case 'shield': P.burst(f.x, f.y, 10, { cols: [c, '#ffffff'], speed: 70, life: 0.3, glow: true }); break;
    case 'shieldUp': case 'build': P.burst(f.x, f.y, 14, { cols: [c, '#ffffff'], speed: 60, life: 0.4, glow: true }); break;
    case 'healRing': for (let i = 0; i < 24; i++) P.add({ x: f.x + (Math.random() - 0.5) * f.r * 1.6, y: f.y + 10, vx: 0, vy: -40 - Math.random() * 40, life: 0.8, c: i % 3 ? '#7dff8a' : '#ffffff', glow: true, drag: 0.97 }); break;
    case 'freeze': case 'shatter': case 'wall':
      P.burst(f.x, f.y, f.k === 'wall' ? 16 : 10, { cols: ['#ffffff', '#cfefff', '#8ee8ff'], speed: 110, life: 0.5, grav: 350, glow: true, dir: -Math.PI / 2, spread: 2.4, floor: 380 }); break;
    case 'blizzard':
      for (let i = 0; i < 160; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 30; P.add({ x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, vx: Math.cos(a) * (140 + Math.random() * 180), vy: Math.sin(a) * (90 + Math.random() * 110), life: 1.2, c: Math.random() < 0.5 ? '#ffffff' : '#bff4ff', glow: true, drag: 0.94, size: 1 + (Math.random() < 0.3) }); }
      flashScreen('#bff4ff', 0.35); break;
    case 'quake':
      for (let i = 0; i < 50; i++) P.add({ x: Math.random() * W, y: 300 + Math.random() * 60, vx: (Math.random() - 0.5) * 30, vy: Math.random() * 40, life: 1.2, c: Math.random() < 0.5 ? '#6b4a3a' : '#9a8a7a', grav: 400, size: 2 });
      P.burst(f.x, f.y, 30, { cols: ['#d8c8b0', '#ffffff'], speed: 160, life: 0.6, kind: 'smoke', size: 3, grow: 6, dir: -Math.PI / 2, spread: Math.PI }); break;
    case 'ultflash': P.burst(f.x, f.y, 45, { cols: [c, '#ffffff'], speed: 220, life: 0.7, glow: true, size: 2 }); flashScreen(c, 0.45); break;
    case 'skybolt': flashScreen('#ffffff', 0.3); P.burst(f.x, f.y - 2, 14, { cols: ['#ffffff', c], speed: 120, life: 0.35, glow: true, dir: -Math.PI / 2, spread: Math.PI }); break;
    case 'bolt': P.burst(f.x2, f.y2, 6, { cols: ['#ffffff', c], speed: 90, life: 0.2, glow: true }); break;
    case 'beam': P.burst(f.x2, f.y2, 8, { cols: ['#ffffff', c], speed: 80, life: 0.25, glow: true }); break;
    case 'slash': for (let i = 0; i < 16; i++) { const k = i / 16; P.add({ x: f.x1 + (f.x2 - f.x1) * k, y: f.y1 + (f.y2 - f.y1) * k, vx: 0, vy: -10, life: 0.35, c: i % 2 ? c : '#1a0f2a', glow: i % 2 === 1, size: 2 }); } break;
    case 'ring': for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; P.add({ x: f.x + Math.cos(a) * f.r * 0.5, y: f.y + Math.sin(a) * f.r * 0.5, vx: Math.cos(a) * f.r * 2.2, vy: Math.sin(a) * f.r * 2.2, life: 0.4, c: i % 3 ? c : '#ffffff', glow: true, drag: 0.88, size: 2 }); } break;
    case 'cloud': case 'splat': P.burst(f.x, f.y, f.k === 'cloud' ? 26 : 10, { cols: [c, shade(c, 0.6)], speed: f.k === 'cloud' ? 60 : 70, life: 0.6, kind: f.k === 'cloud' ? 'smoke' : undefined, size: f.k === 'cloud' ? 5 : 2, grow: 8, grav: f.k === 'splat' ? 300 : 0, glow: true }); break;
    case 'splash': P.burst(f.x, f.y, 22, { cols: ['#ffffff', '#8fd3ff'], speed: 160, life: 0.7, grav: 500, dir: -Math.PI / 2, spread: 1.2 }); break;
    case 'spawn': for (let i = 0; i < 14; i++) P.add({ x: f.x + (Math.random() - 0.5) * 12, y: f.y + 10, vx: 0, vy: -60 - Math.random() * 60, life: 0.5, c: i % 2 ? c : '#ffffff', glow: true, drag: 0.95 }); break;
    case 'charge': for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, r = 22; P.add({ x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, vx: -Math.cos(a) * r * 3.5, vy: -Math.sin(a) * r * 3.5, life: 0.28, c, glow: true, drag: 0.98 }); } break;
    case 'rect': P.burst(f.x + f.w / 2, f.y + f.h, 10, { cols: ['#d8c8b0'], speed: 70, kind: 'smoke', size: 3, grow: 5, life: 0.4, dir: -Math.PI / 2, spread: 2 }); break;
    case 'puff': P.burst(f.x, f.y, 3, { cols: [c, '#ffffff'], speed: 40, life: 0.15, glow: true }); break;
    case 'pad': P.burst(f.x, f.y - 6, 16, { cols: [c, '#ffffff'], speed: 120, life: 0.5, glow: true, dir: -Math.PI / 2, spread: 1.6 }); break;
    case 'swing': P.burst(f.x, f.y, 4, { cols: ['#ffffff'], speed: 60, life: 0.12, dir: f.dir > 0 ? 0 : Math.PI, spread: 0.6 }); break;
    case 'go': flashScreen('#ffffff', 0.12); break;
  }
}

function spawnAmbient(k) {
  if (k === 'leaf' || k === 'petal') parts.add({ x: Math.random() * W, y: -4, vx: 8 + Math.random() * 10, vy: 12 + Math.random() * 10, life: 20, c: k === 'petal' ? (Math.random() < 0.5 ? '#ffb3d1' : '#ffe0ef') : ['#6fdc6a', '#ff9ec4', '#ffe14d'][(Math.random() * 3) | 0], wob: 25, drag: 1, size: 1 + (Math.random() < 0.3) });
  else if (k === 'ember') parts.add({ x: Math.random() * W, y: H, vx: (Math.random() - 0.5) * 10, vy: -25 - Math.random() * 35, life: 8, c: Math.random() < 0.6 ? '#ff7a1a' : '#ffd36b', wob: 30, drag: 1, glow: true });
  else if (k === 'snow') parts.add({ x: Math.random() * (W + 40) - 20, y: -3, vx: -4 + Math.random() * 8, vy: 16 + Math.random() * 20, life: 20, c: Math.random() < 0.7 ? '#ffffff' : '#cfe0ff', wob: 14, drag: 1, size: 1 + (Math.random() < 0.15) });
  else if (k === 'firefly') parts.add({ x: Math.random() * W, y: 120 + Math.random() * 220, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 5, c: Math.random() < 0.6 ? '#d6ff6b' : '#7dffcf', wob: 20, drag: 1, glow: true });
  else if (k === 'rain') parts.add({ x: Math.random() * (W + 80), y: -6, vx: -60, vy: 340, life: 1.3, c: '#7fa8ff', len: 1, drag: 1, size: 1 });
}
function auraParticles(p, x, y, power, dt) {
  const s = p.scale, h = 21 * s;
  if (Math.random() > dt * 22) return;
  const rx = x + (Math.random() - 0.5) * 12 * s, ry = y - Math.random() * h;
  const col = { fire: '#ff7a1a', ice: '#ffffff', bolt: '#fff59d', giant: '#c77dff', poison: '#7dff4a', shadow: '#a05cff', gravity: '#9fc0ff', wind: '#e8fff6' }[power];
  if (power === 'fire') parts.add({ x: rx, y: ry, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 30, life: 0.6, c: Math.random() < 0.5 ? col : '#ffd23f', glow: true, drag: 0.97 });
  else if (power === 'bolt') parts.add({ x: rx, y: ry, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.12, c: col, glow: true, drag: 0.8 });
  else if (power === 'shadow') parts.add({ x: rx, y: ry, vx: (Math.random() - 0.5) * 10, vy: -15, life: 0.7, c: Math.random() < 0.5 ? '#1a0f2a' : col, kind: 'smoke', size: 3, grow: 4, drag: 0.95 });
  else if (power === 'poison') parts.add({ x: rx, y: ry, vx: 0, vy: 25, life: 0.5, c: col, glow: true, grav: 200 });
  else if (power === 'gravity') { const a = Math.random() * 6.28; parts.add({ x: x + Math.cos(a) * 18 * s, y: y - h / 2 + Math.sin(a) * 18 * s, vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 40, life: 0.4, c: col, glow: true, drag: 0.98 }); }
  else if (power === 'wind') parts.add({ x: rx - 10, y: ry, vx: 90, vy: 0, life: 0.25, c: col, len: 4, drag: 1 });
  else parts.add({ x: rx, y: ry, vx: 0, vy: power === 'ice' ? 10 : -10, life: 0.7, c: col, glow: true, drag: 0.97 });
}

// ---------- камера ----------
function updateCam(view, w, dt, mode) {
  const aspect = view.cw / view.ch, maxH = Math.min(H, W / aspect);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const alive = w.players.filter(p => p.dead <= 0);
  for (const p of alive) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y - hitH(p)); y1 = Math.max(y1, p.y); }
  if (aimPt && alive.length) { x0 = Math.min(x0, aimPt.x + 40); x1 = Math.max(x1, aimPt.x - 40); y0 = Math.min(y0, aimPt.y + 30); y1 = Math.max(y1, aimPt.y); }
  let h, cx, cy;
  if (mode === 'full' || !alive.length || w.match.phase === 'lobby' && alive.length < 2) { h = maxH; cx = W / 2; cy = H - maxH / 2; }
  else {
    x0 -= 90; x1 += 90; y0 -= 60; y1 += 50;
    h = Math.max(240, y1 - y0, (x1 - x0) / aspect); h = Math.min(maxH, h);
    cx = (x0 + x1) / 2; cy = (y0 + y1) / 2 + 10;
  }
  const hw = h * aspect / 2;
  cx = Math.max(hw, Math.min(W - hw, cx)); cy = Math.max(h / 2, Math.min(H - h / 2, cy));
  if (!cam.init) { cam.cx = cx; cam.cy = cy; cam.h = h; cam.init = true; }
  const k = Math.min(1, dt * 2.6);
  cam.h += (h - cam.h) * k; cam.cx += (cx - cam.cx) * k; cam.cy += (cy - cam.cy) * k;
  const chw = cam.h * aspect / 2;
  cam.cx = Math.max(chw, Math.min(W - chw, cam.cx)); cam.cy = Math.max(cam.h / 2, Math.min(H - cam.h / 2, cam.cy));
  view.s = view.ch / cam.h; view.ox = -(cam.cx - chw) * view.s; view.oy = -(cam.cy - cam.h / 2) * view.s;
  view.camX = cam.cx - chw; view.camY = cam.cy - cam.h / 2; view.camW = chw * 2; view.camH = cam.h;
}

// ---------- прицел своего игрока ----------
function autoTargetFor(w, me, range) {
  const mc = { x: me.x, y: me.y - hitH(me) / 2 };
  if (w.match.chosenId !== me.id) {
    const c = w.players.find(p => p.id === w.match.chosenId);
    if (c && c.dead <= 0 && Math.hypot(c.x - mc.x, c.y - hitH(c) / 2 - mc.y) < range) return c;
    return null;
  }
  let best = null, bd = range;
  for (const q of w.players) { if (q === me || q.dead > 0 || q.invisT > 0) continue; const d = Math.hypot(q.x - mc.x, q.y - hitH(q) / 2 - mc.y); if (d < bd) { bd = d; best = q; } }
  return best;
}
function aimSpec(w, me, btn) {
  const ch = w.match.chosenId === me.id;
  if (ch) {
    const P = CFG.powers[me.power];
    if (btn === 'a') return { kind: P.aAim === 'auto' ? 'line' : P.aAim, range: P.aRange || (me.power === 'giant' ? 60 : me.power === 'shadow' ? P.aDist : 120), R: me.power === 'poison' ? P.puddleR + 6 : 0, c: P.color };
    return { kind: P.bAim, range: P.bRange || (me.power === 'wind' ? 140 : 40), R: P.bR || 30, c: P.color };
  }
  if (btn === 'a') {
    if (!me.weapon) return { kind: 'line', range: 40, c: '#ffe14d' };
    const Wp = CFG.weapons[me.weapon];
    return { kind: Wp.aim, range: Wp.range, R: Wp.R || 0, spread: Wp.spread, c: me.weapon === 'sniper' ? '#ff2a6d' : '#ffe14d' };
  }
  return { kind: 'line', range: 60, c: me.color };
}
function drawAim(w, me, aim, now) {
  if (!me || me.dead > 0) return null;
  const s = me.scale || 1, mx = me.x + (aim && aim.dx < 0 ? -1 : 1) * 6 * s, my = me.y - hitH(me) * 0.6;
  if (!aim || !aim.active) { aimPt = null; return null; }
  const sp = aimSpec(w, me, aim.btn);
  const L = Math.hypot(aim.dx, aim.dy) || 1, dx = aim.dx / L, dy = aim.dy / L, mag = Math.max(0.15, Math.min(1, L));
  const c = sp.c, pul = 0.6 + 0.3 * Math.sin(now / 90);
  if (sp.kind === 'line' || sp.kind === 'laser') {
    const len = sp.range;
    if (sp.kind === 'laser') { line(lg, mx, my, mx + dx * len, my + dy * len, c, 0.8); line(gl, mx, my, mx + dx * len, my + dy * len, c, 0.6); }
    else for (let d = 6; d < len; d += 6) dot(c, mx + dx * d, my + dy * d, Math.max(0.4, 1 - d / len) * pul + 0.25);
    aimPt = { x: mx + dx * len, y: my + dy * len };
    ringPx(lg, mx + dx * len, my + dy * len, 4, c, 0.9);
  } else if (sp.kind === 'cone') {
    const a0 = Math.atan2(dy, dx), half = (sp.spread || 0.4) / 2;
    for (const a of [a0 - half, a0 + half]) for (let d = 6; d < sp.range; d += 6) dot(c, mx + Math.cos(a) * d, my + Math.sin(a) * d, 0.8);
    for (let a = a0 - half; a <= a0 + half; a += 0.06) dot(c, mx + Math.cos(a) * sp.range, my + Math.sin(a) * sp.range, 0.9);
    aimPt = { x: mx + dx * sp.range, y: my + dy * sp.range };
  } else if (sp.kind === 'arc' || sp.kind === 'circle') {
    let tx = Math.max(8, Math.min(W - 8, mx + dx * sp.range * mag)), ty = my + dy * sp.range * mag;
    const gy = supportAt(w, tx, ty - 30); if (gy !== null) ty = gy;
    if (sp.kind === 'arc') {
      const T = Math.max(0.3, Math.min(0.8, Math.hypot(tx - mx, ty - 4 - my) / 340)), vx = (tx - mx) / T, vy = (ty - 4 - my) / T - 0.5 * PGR * T;
      const N = 44, ph = (now / 60) % 2;
      let top = my;
      for (let i = 1; i < N; i++) { const tt = T * i / N, yy = my + vy * tt + 0.5 * PGR * tt * tt; top = Math.min(top, yy); if ((i + Math.floor(ph)) % 2) continue; dot(c, mx + vx * tt, yy, 0.95); }
      aimPt = { x: tx, y: Math.min(ty, top) };
    } else { const D = Math.hypot(tx - mx, ty - my) || 1; for (let d = 6; d < D; d += 6) dot(c, mx + (tx - mx) * d / D, my + (ty - my) * d / D, 0.75); aimPt = { x: tx, y: ty }; }
    const r = sp.R || 16;
    lg.globalAlpha = 0.18; disc(lg, tx, ty - 3, r, c); lg.globalAlpha = 1;
    ringPx(lg, tx, ty - 3, r, c, pul + 0.2); ringPx(gl, tx, ty - 3, r, c, 0.7); ringPx(lg, tx, ty - 3, r * (0.5 + 0.5 * ((now / 500) % 1)), '#ffffff', 0.5);
  } else if (sp.kind === 'self') {
    ringPx(lg, me.x, me.y - 12, sp.R, c, pul); ringPx(gl, me.x, me.y - 12, sp.R, c, 0.6);
  }
  return true;
}

// ---------- главный кадр ----------
export function render(ctx, view, w, alpha, myId, opts = {}) {
  const now = performance.now(), dt = Math.min(0.05, (now - (lastNow || now)) / 1000); lastNow = now;
  const m = w.match, PW = CFG.powers;
  const B = getMap(w.mapIdx || 0), th = B.th;
  if ((w.fxId ?? 0) < lastFx) lastFx = 0;
  for (const f of w.fx) if (f.id > lastFx) onFx(f);
  for (const f of w.fx) lastFx = Math.max(lastFx, f.id || 0);
  parts.update(dt);
  const rate = { leaf: 3, ember: 16, snow: 30, firefly: 6, rain: 70, petal: 5 }[th.ambient] || 0;
  let n = rate * dt; while (n > 0) { if (Math.random() < n) spawnAmbient(th.ambient); n--; }
  updateCam(view, w, dt, opts.camMode);

  gl.clearRect(0, 0, W, H);
  drawBackground(lg, gl, B, now / 1000, cam.cx);
  const pls = platsAt(w.mapIdx || 0, w.time);
  drawMovers(lg, gl, B, pls);

  // события карты
  const Hz = w.hazard;
  if (Hz && Hz.phase !== 'idle') {
    if (Hz.k === 'wind' && Hz.phase === 'active') for (let i = 0; i < 4; i++)
      parts.add({ x: Hz.dir > 0 ? -20 : W + 20, y: Math.random() * 330, vx: Hz.dir * (300 + Math.random() * 220), vy: 0, life: 2.5, c: '#ffffff', len: 6 + (Math.random() * 12 | 0), drag: 1 });
    if (Hz.k === 'geyser') for (const g of Hz.data) {
      if (Hz.phase === 'warn') {
        both('#ff7a1a', g.x - 7, g.y - 1, 14, 2, 0.5 + 0.5 * Math.sin(now / 60));
        if (Math.random() < 0.4) parts.add({ x: g.x + (Math.random() - 0.5) * 10, y: g.y - 1, vx: 0, vy: -30 - Math.random() * 40, life: 0.5, c: '#ffd36b', glow: true, grav: 100 });
      } else {
        for (let y = g.y; y > g.y - 140; y -= 2) { const wv = 7 + Math.sin(y * 0.3 + now / 40) * 2; px(lg, (y + R(now / 20)) % 8 < 4 ? '#ffd36b' : '#ff7a1a', g.x - wv, y, wv * 2, 2); px(gl, '#ff7a1a', g.x - wv - 2, y, wv * 2 + 4, 2); }
        both('#ffffff', g.x - 2, g.y - 140, 4, 138, 0.6);
        if (Math.random() < 0.8) parts.add({ x: g.x + (Math.random() - 0.5) * 10, y: g.y - 138, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 0.8, c: '#ffb347', glow: true, grav: 300, size: 2 });
      }
    }
    if (Hz.k === 'icicles' && Hz.phase === 'warn') for (const ic of Hz.data) {
      const sh = R(Math.sin(now / 30 + ic.x) * 1);
      for (let j = 0; j < 8; j++) px(lg, j < 4 ? '#e8f6ff' : '#9fd0f7', ic.x - (j < 5 ? 1 : 0) + sh, j, j < 5 ? 3 : 1, 1);
      const gy = supportAt(w, ic.x, 0) ?? 340; lg.globalAlpha = 0.25 + 0.2 * Math.sin(now / 80); px(lg, '#ff3b5c', ic.x - 5, gy - 1, 10, 2); lg.globalAlpha = 1;
    }
    if ((Hz.k === 'spores' || Hz.k === 'storm') && Hz.phase === 'warn') for (const s of Hz.data) {
      const c = Hz.k === 'spores' ? '#d77dff' : '#ffe83a', r = Hz.k === 'spores' ? CFG.hazards.sporeR : 26;
      ringPx(lg, s.x, s.y - 3, r * (1 - Hz.t / CFG.hazards.warn * 0.5), c, 0.5 + 0.4 * Math.sin(now / 60), 0.4); ringPx(gl, s.x, s.y - 3, r, c, 0.5, 0.4);
      if (Hz.k === 'spores' && Math.random() < 0.3) parts.add({ x: s.x + (Math.random() - 0.5) * r, y: s.y, vx: 0, vy: -20, life: 0.8, c, glow: true });
      if (Hz.k === 'storm' && Math.random() < 0.3) { lg.globalAlpha = 0.3; px(lg, c, s.x - 1, 0, 2, s.y); lg.globalAlpha = 1; }
    }
    if (Hz.k === 'laser') {
      if (Hz.phase === 'warn') { for (let x = 0; x < W; x += 6) if ((x / 6 + R(now / 60)) % 2) both('#ff2a6d', x, Hz.y, 3, 1, 0.7); }
      else { both('#ff2a6d', 0, Hz.y - 2, W, 4, 0.9); px(lg, '#ffffff', 0, Hz.y - 1, W, 2); gl.globalAlpha = 0.8; px(gl, '#ff2a6d', 0, Hz.y - 6, W, 12); gl.globalAlpha = 1;
        if (Math.random() < 0.8) parts.add({ x: Math.random() * W, y: Hz.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.3, c: '#ff6b9a', glow: true }); }
    }
  }

  // зоны
  for (const z of w.zones || []) {
    const k = Math.min(1, z.t / 0.4, (z.ttl - z.t) / 0.3 + 0.2);
    if (z.k === 'poison') {
      lg.globalAlpha = 0.22 * k; disc(lg, z.x, z.y - z.r * 0.25, R(z.r * 0.9), z.c); lg.globalAlpha = 1;
      gl.globalAlpha = 0.3 * k; disc(gl, z.x, z.y - z.r * 0.25, R(z.r * 0.7), z.c); gl.globalAlpha = 1;
      ringPx(lg, z.x, z.y - z.r * 0.25, z.r * 0.9, z.c, 0.5 * k, 0.55, 3);
      if (Math.random() < 0.5) parts.add({ x: z.x + (Math.random() - 0.5) * z.r * 1.6, y: z.y - Math.random() * z.r * 0.6, vx: 0, vy: -12, life: 0.8, c: Math.random() < 0.5 ? z.c : shade(z.c, 1.4), kind: 'smoke', size: 3, grow: 5, drag: 0.97 });
    } else if (z.k === 'hole') {
      const r = z.big ? z.r * (1 + 0.1 * Math.sin(now / 80)) : z.r * 0.4;
      gl.globalAlpha = 0.6; disc(gl, z.x, z.y, R(r * 1.8), z.c); gl.globalAlpha = 1;
      disc(lg, z.x, z.y, R(r * 1.15), shade(z.c, 0.5)); disc(lg, z.x, z.y, R(r), '#05030c');
      ringPx(lg, z.x, z.y, r * 1.3, '#ffffff', 0.6); ringPx(lg, z.x, z.y, (z.reach || z.r * 2.4) * (0.6 + 0.4 * ((now / 600) % 1)), z.c, 0.35, 1, 4);
      for (let i = 0; i < (z.big ? 6 : 3); i++) { const a = Math.random() * 6.28, rr = (z.reach || z.r * 2) * (0.5 + Math.random() * 0.5); parts.add({ x: z.x + Math.cos(a) * rr, y: z.y + Math.sin(a) * rr, vx: -Math.cos(a) * rr * 1.6 - Math.sin(a) * 60, vy: -Math.sin(a) * rr * 1.6 + Math.cos(a) * 60, life: 0.5, c: i % 2 ? z.c : '#ffffff', glow: true, drag: 0.98 }); }
    }
  }
  // ледяные стены
  for (const wl of w.walls) {
    const a = Math.min(1, wl.t / 0.4);
    lg.globalAlpha = 0.85 * a; px(lg, '#8ee8ff', wl.x, wl.y, wl.w, wl.h); px(lg, '#e0fbff', wl.x + 1, wl.y, 2, wl.h); px(lg, '#5cc8e8', wl.x + wl.w - 2, wl.y, 2, wl.h);
    for (let y = wl.y + 4; y < wl.y + wl.h; y += 9) px(lg, '#ffffff', wl.x + 3, y, 2, 1);
    lg.globalAlpha = 1; gl.globalAlpha = 0.5 * a; px(gl, '#8ee8ff', wl.x - 2, wl.y - 2, wl.w + 4, wl.h + 4); gl.globalAlpha = 1;
  }
  // бонусы: оружие и предметы
  for (const pk of w.pickups || []) {
    if (pk.life < 3 && Math.floor(now / 120) % 2) continue;
    const by = pk.y - 9 + Math.sin(now / 250 + pk.x) * 2;
    if (pk.k === 'weapon') {
      gl.globalAlpha = 0.5 + 0.2 * Math.sin(now / 200); disc(gl, pk.x, by, 8, '#ffd23f'); gl.globalAlpha = 1;
      lg.globalAlpha = 0.35; px(lg, '#ffd23f', pk.x - 6, pk.y - 1, 12, 1); lg.globalAlpha = 1;
      drawGun(lg, gl, pk.w, pk.x - 3, by, 1);
      if (Math.random() < 0.05) parts.add({ x: pk.x + (Math.random() - 0.5) * 12, y: by + 4, vx: 0, vy: -20, life: 0.6, c: '#ffd23f', glow: true });
    } else {
      const info = CFG.items[pk.w];
      disc(gl, pk.x, by, 8, info.color);
      disc(lg, pk.x, by, 6, '#170f1f'); disc(lg, pk.x, by, 5, info.color); disc(lg, pk.x, by, 3, shade(info.color, 1.4));
      px(lg, '#ffffff', pk.x - 2, by - 3, 2, 1);
    }
  }
  // турели
  for (const tu of w.turrets || []) {
    const blink = tu.t < 2 && Math.floor(now / 100) % 2;
    px(lg, '#170f1f', tu.x - 6, tu.y - 6, 12, 6); px(lg, '#5b6676', tu.x - 5, tu.y - 5, 10, 5); px(lg, '#7d8898', tu.x - 5, tu.y - 5, 10, 1);
    px(lg, '#170f1f', tu.x - 4, tu.y - 13, 8, 8); px(lg, '#9ea7b3', tu.x - 3, tu.y - 12, 6, 6);
    for (let i = 0; i < 8; i++) px(lg, '#3a3a44', tu.x + (tu.ax || tu.facing) * i - 0.5, tu.y - 9 + (tu.ay || 0) * i - 0.5, 2, 2);
    if (!blink) both(tu.c, tu.x - 1, tu.y - 11, 2, 2);
  }

  // телеграфы
  for (const te of w.teles) {
    if (te.t > te.ttl && !te.hazard) continue;
    const k = 1 - Math.min(1, te.t / te.ttl), pulse = 0.5 + 0.5 * Math.sin(now / 45);
    const o = w.players.find(q => q.id === te.owner);
    if (te.k === 'ring' && o) {
      lg.globalAlpha = 0.12 + 0.25 * k; disc(lg, o.x, o.y - 12, te.r, te.c); lg.globalAlpha = 1;
      ringPx(lg, o.x, o.y - 12, te.r, te.c, 0.6 + 0.4 * pulse); ringPx(gl, o.x, o.y - 12, te.r, te.c, 0.8); ringPx(lg, o.x, o.y - 12, te.r * (1 - k), '#ffffff', 0.8);
    } else if (te.k === 'cone' && o) {
      const g = PW.giant, rx = o.facing > 0 ? o.x + 4 : o.x - 4 - g.aW;
      lg.globalAlpha = 0.15 + 0.35 * k; px(lg, te.c, rx, o.y - g.aH, g.aW, g.aH); lg.globalAlpha = 1;
      lg.strokeStyle = te.c; lg.globalAlpha = 0.7 + 0.3 * pulse; lg.strokeRect(rx + 0.5, o.y - g.aH + 0.5, g.aW - 1, g.aH - 1); lg.globalAlpha = 1;
    } else if (te.k === 'meteor') {
      ringPx(lg, te.x, te.y - 2, te.r, te.c, 0.5 + 0.5 * pulse, 0.35); ringPx(gl, te.x, te.y - 2, te.r, te.c, 0.6, 0.35); ringPx(lg, te.x, te.y - 2, te.r * (1 - k), '#ffffff', 0.8, 0.35);
      const mx = te.x + (1 - k) * 90, my = te.y - (1 - k) * 300 - 6;
      disc(gl, mx, my, 9, '#ff9a3a'); disc(lg, mx, my, 6, '#ff5722'); disc(lg, mx, my, 4, '#ffb347'); disc(lg, mx - 1, my - 1, 2, '#fff3b0');
      if (Math.random() < 0.9) parts.add({ x: mx + 3, y: my - 3, vx: 30, vy: -60, life: 0.4, c: Math.random() < 0.5 ? '#ff7a1a' : '#5a5060', glow: true, size: 2, drag: 0.9 });
    } else if (te.k === 'strike') {
      ringPx(lg, te.x, te.y - 2, te.r, te.c, 0.5 + 0.5 * pulse, 0.35);
      if (Math.random() < 0.5) { lg.globalAlpha = 0.25 + 0.3 * k; px(lg, te.c, te.x - 1, 0, 2, te.y); lg.globalAlpha = 1; }
    }
  }

  // персонажи
  const pos = [];
  const me = w.players.find(p => p.id === myId);
  for (const p of w.players) {
    let st = per.get(p.id);
    if (!st) { st = { scarf: [], wasG: true, land: 0, lag: p.hp, lagMax: p.maxHp }; per.set(p.id, st); }
    if (p.dead > 0) { st.scarf = []; continue; }
    const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha;
    const s = p.scale || 1, chosen = m.chosenId === p.id, power = chosen ? p.power : null;
    const invis = p.invisT > 0, isMe = p.id === myId;
    if (!invis || isMe) pos.push([p, x, y]);
    if (p.onGround && !st.wasG) st.land = 0.12; st.wasG = p.onGround; st.land = Math.max(0, st.land - dt);
    st.lag = st.lagMax !== p.maxHp ? p.hp : Math.max(p.hp, st.lag - (st.lag - p.hp) * dt * 3 - dt * 5); st.lagMax = p.maxHp;
    const baseA = invis ? (isMe ? 0.4 : 0.1) : 1;
    const gy = supportAt(w, x, y - 1);
    if (gy !== null && !invis) { const hgt = Math.max(0, gy - y), sw = Math.max(2, R((8 - hgt / 12) * s)); lg.globalAlpha = 0.28; px(lg, '#000', x - sw, gy, sw * 2, 1); lg.globalAlpha = 1; }
    if (chosen && PW[power]) {
      const pc = PW[power].color, pul = 0.25 + 0.12 * Math.sin(now / 120);
      gl.globalAlpha = pul + 0.25; disc(gl, x, y - 11 * s, R(12 * s), pc); gl.globalAlpha = 1;
      lg.globalAlpha = pul * 0.5; disc(lg, x, y - 11 * s, R(11 * s), pc); lg.globalAlpha = 1;
      auraParticles(p, x, y, power, dt);
      if (p.slam) ringPx(lg, x, (supportAt(w, x, y) ?? y) - 2, PW.giant.bR, PW.giant.color, 0.5 + 0.4 * Math.sin(now / 30), 0.35);
    }
    // шарф цвета игрока
    const anchor = { x: x - p.facing * 2 * s, y: y - 13 * s };
    if (!st.scarf.length) for (let i = 0; i < 5; i++) st.scarf.push({ ...anchor });
    let prev = anchor;
    const windX = Hz && Hz.k === 'wind' && Hz.phase === 'active' ? Hz.dir * 1.5 : 0;
    for (const q of st.scarf) {
      const tx = prev.x - p.facing * 2.2 * s - p.vx * 0.01 + windX, ty = prev.y + 0.7 + Math.sin(now / 90 + q.x) * 0.4 - p.vy * 0.004;
      q.x += (tx - q.x) * 0.55; q.y += (ty - q.y) * 0.55; prev = q;
    }
    lg.globalAlpha = baseA;
    if (!power || power === 'ice') {
      const sc = shade(p.color, 1.2), sd = shade(p.color, 0.6);
      for (const q of st.scarf) px(lg, '#170f1f', q.x - 1, q.y - 1, 3 * s, 3 * s);
      st.scarf.forEach((q, i) => px(lg, i % 2 ? sc : sd, q.x, q.y, 2 * s, (i === 4 ? 1 : 2) * s));
    }
    const sq = st.land > 0 ? [1.15, 0.85] : !p.onGround && p.vy < -160 ? [0.9, 1.1] : [1, 1];
    if (p.inv > 0 && Math.floor(now / 70) % 2) lg.globalAlpha = baseA * 0.45;
    const aimingMe = isMe && opts.aim && opts.aim.active && opts.aim.btn === 'a';
    const pp = aimingMe ? { ...p, aimX: opts.aim.dx || p.facing, aimY: opts.aim.dy, facing: (opts.aim.dx || p.facing) < 0 ? -1 : 1 } : p;
    drawCharacter(lg, invis ? null : gl, pp, x, y, now / 1000, { power, sx: sq[0], sy: sq[1], flash: p.hitT > 0.22 ? "#ffffff" : null, aiming: aimingMe });
    lg.globalAlpha = 1;
    if (p.slowT > 0 && !(p.frozenT > 0)) { lg.globalAlpha = 0.3; px(lg, '#8ee8ff', x - 6 * s, y - 22 * s, 12 * s, 22 * s); lg.globalAlpha = 1; }
    if (p.frozenT > 0) { lg.globalAlpha = 0.65; px(lg, '#bff4ff', x - 8 * s, y - 25 * s, 16 * s, 25 * s); lg.globalAlpha = 1; px(lg, '#ffffff', x - 7 * s, y - 24 * s, 2, 18 * s); ringPx(gl, x, y - 12 * s, 12 * s, '#8ee8ff', 0.6); }
    if (p.stunT > 0) for (let i = 0; i < 3; i++) { const a = now / 150 + i * 2.1; both('#ffe83a', x + Math.cos(a) * 8 * s, y - 24 * s + Math.sin(a) * 2, 2, 2); }
    if (p.shield > 0) { ringPx(lg, x, y - 11 * s, 14 * s, '#4dc3ff', 0.5 + 0.3 * Math.sin(now / 100)); ringPx(gl, x, y - 11 * s, 14 * s, '#4dc3ff', 0.6); }
    if (p.blockT > 0) { ringPx(lg, x, y - 11 * s, 15 * s, '#ffd23f', 0.8); ringPx(gl, x, y - 11 * s, 16 * s, '#ffd23f', 0.8); both('#ffd23f', x + p.facing * 9 * s - 2, y - 18 * s, 4, 14 * s, 0.9); }
    if (p.speedT > 0 && Math.abs(p.vx) > 20 && Math.random() < 0.5) parts.add({ x: x - p.facing * 5, y: y - Math.random() * 18, vx: -p.facing * 30, vy: 0, life: 0.25, c: '#7dff8a', glow: true, len: 4 });
    if (p.dashT > 0) { lg.globalAlpha = 0.35 * baseA; drawCharacter(lg, null, p, x - p.facing * 10, y, now / 1000, { power, flash: p.hero === 'ninja' ? '#1a0f2a' : p.color, noOutline: true }); lg.globalAlpha = 1; }
  }

  // снаряды
  for (const pr of w.projs) {
    const x = pr.x - pr.vx * (1 - alpha) / CFG.TICK, y = pr.y - pr.vy * (1 - alpha) / CFG.TICK, dx = Math.sign(pr.vx) || 1, ang = Math.atan2(pr.vy, pr.vx);
    switch (pr.kind) {
      case 'fire':
        disc(gl, x, y, 8, '#ff9a3a'); disc(lg, x, y, 5, '#ff5722'); disc(lg, x, y, 3, '#ffb347'); disc(lg, x, y, 1, '#fff3b0');
        if (Math.random() < 0.9) parts.add({ x: x - dx * 3, y: y + (Math.random() - 0.5) * 6, vx: -dx * 20, vy: -20, life: 0.35, c: Math.random() < 0.5 ? '#ff7a1a' : '#ffd23f', glow: true, size: 2, drag: 0.9 });
        break;
      case 'ice': both('#bff4ff', x - 4, y - 1, 8, 3); px(lg, '#ffffff', x - 1, y, 3, 1); break;
      case 'grenade': disc(lg, x, y, 3, '#4a5a3a'); px(lg, '#6b7a5a', x - 1, y - 2, 2, 1); if (Math.floor(now / 90) % 2) both('#ff3b3b', x, y - 3, 1, 1); if (Math.random() < 0.4) parts.add({ x, y, vx: 0, vy: 0, life: 0.3, c: '#9a9aa8', kind: 'smoke', size: 2, grow: 3 }); break;
      case 'rocket':
        for (let i = 0; i < 7; i++) px(lg, i < 2 ? '#ff5722' : '#4f6b3a', x - Math.cos(ang) * i, y - Math.sin(ang) * i - 1, 2, 3);
        both('#ffd23f', x - Math.cos(ang) * 8, y - Math.sin(ang) * 8 - 1, 2, 2);
        parts.add({ x: x - Math.cos(ang) * 8, y: y - Math.sin(ang) * 8, vx: -Math.cos(ang) * 40 + (Math.random() - 0.5) * 20, vy: -Math.sin(ang) * 40 + (Math.random() - 0.5) * 20, life: 0.5, c: Math.random() < 0.3 ? '#ffd23f' : '#8a8a99', kind: Math.random() < 0.3 ? undefined : 'smoke', size: 3, grow: 6, glow: true });
        break;
      case 'glob': disc(gl, x, y, 6, pr.c); disc(lg, x, y, 4, '#3f8f2a'); disc(lg, x, y, 3, pr.c); px(lg, '#e0ffd0', x - 1, y - 2, 1, 1); if (Math.random() < 0.5) parts.add({ x, y, vx: 0, vy: 20, life: 0.4, c: pr.c, grav: 300, glow: true }); break;
      case 'orb': disc(gl, x, y, 8, pr.c); disc(lg, x, y, 4, '#0b0f30'); ringPx(lg, x, y, 5, pr.c, 1); ringPx(lg, x, y, 3 + Math.sin(now / 60), '#ffffff', 0.8); break;
      case 'blade': for (let i = -3; i <= 3; i++) both(i === 0 ? '#ffffff' : pr.c, x - dx * Math.abs(i) * 1.2, y + i * 2, 2, 2, 1 - Math.abs(i) * 0.15); break;
      case 'tornado':
        for (let i = 0; i < 12; i++) { const yy = y - i * 3, wv = 3 + i * 1.4, off = Math.sin(now / 50 + i * 0.8) * 3; lg.globalAlpha = 0.75; px(lg, i % 2 ? '#e8fff6' : '#9fe8d0', x - wv + off, yy, wv * 2, 2); }
        lg.globalAlpha = 1; gl.globalAlpha = 0.4; px(gl, '#b8ffe6', x - 12, y - 36, 24, 36); gl.globalAlpha = 1;
        if (Math.random() < 0.6) parts.add({ x: x + (Math.random() - 0.5) * 20, y: y - Math.random() * 30, vx: (Math.random() - 0.5) * 60, vy: -40, life: 0.4, c: '#ffffff', len: 3, drag: 0.95 });
        break;
      case 'clone':
        drawCharacter(lg, null, { color: '#1a0f2a', hero: 'ghost', hat: 'none', scale: 1.2, facing: dx, onGround: false, vx: pr.vx, vy: -50, animT: now / 1000, seed: 3 }, x, y + 12, now / 1000, { flash: '#1a0f2a', outline: '#a05cff' });
        gl.globalAlpha = 0.5; disc(gl, x, y, 10, '#a05cff'); gl.globalAlpha = 1; both('#ff3b5c', x + dx * 2, y - 8, 2, 1);
        break;
      case 'icicle': for (let j = 0; j < 9; j++) px(lg, j < 4 ? '#e8f6ff' : '#9fd0f7', x - (j < 5 ? 1 : 0), y - 9 + j, j < 5 ? 3 : 1, 1); px(gl, '#8ee8ff', x - 2, y - 9, 5, 10); break;
      case 'sniper': for (let i = 0; i < 14; i++) both(i < 3 ? '#ffffff' : '#ff6b9a', x - Math.cos(ang) * i, y - Math.sin(ang) * i, 1, 1, 1 - i / 14); break;
      default: {
        for (let i = 0; i < 5; i++) { lg.globalAlpha = 1 - i / 5; px(lg, i < 2 ? '#fff6c8' : pr.c, x - Math.cos(ang) * i, y - Math.sin(ang) * i, 1, 1); }
        lg.globalAlpha = 1; both('#ffe9a0', x - 0.5, y - 0.5, 2, 1);
      }
    }
  }

  const aiming = drawAim(w, me, opts.aim, now);
  parts.draw(lg, gl);

  // эффекты из симуляции
  for (const f of w.fx) {
    const k = f.t / f.ttl;
    if (f.k === 'ring') { ringPx(lg, f.x, f.y, f.r * (1.15 - k * 0.5), f.c, k); ringPx(gl, f.x, f.y, f.r * (1.15 - k * 0.5), f.c, k); ringPx(lg, f.x, f.y, f.r * (1.1 - k * 0.6), '#ffffff', k * 0.7); }
    else if (f.k === 'boom') { const r = (f.r || 10) * (0.35 + (1 - k) * 0.55); gl.globalAlpha = k; disc(gl, f.x, f.y, R(r * 1.2), f.c); gl.globalAlpha = 1; lg.globalAlpha = k * 0.9; disc(lg, f.x, f.y, R(r), k > 0.8 ? '#ffffff' : k > 0.45 ? '#ffd36b' : f.c); if (k < 0.8) { lg.globalAlpha = k * 0.6; disc(lg, f.x, f.y, R(r * 0.55), '#fff3b0'); } lg.globalAlpha = 1; ringPx(lg, f.x, f.y, (f.r || 10) * (1.1 - k * 0.5), '#ffffff', k * 0.8); }
    else if (f.k === 'rect') { lg.globalAlpha = k * 0.7; px(lg, f.c, f.x, f.y, f.w, f.h); lg.globalAlpha = 1; gl.globalAlpha = k * 0.6; px(gl, f.c, f.x, f.y, f.w, f.h); gl.globalAlpha = 1; }
    else if (f.k === 'bolt') { lg.globalAlpha = Math.min(1, k * 1.5); boltLine(lg, f.x1, f.y1, f.x2, f.y2, '#ffffff', now / 1000, 3); gl.globalAlpha = k; boltLine(gl, f.x1, f.y1, f.x2, f.y2, f.c, now / 1000, 5); lg.globalAlpha = gl.globalAlpha = 1; }
    else if (f.k === 'beam') { line(lg, f.x1, f.y1, f.x2, f.y2, '#ffffff', k, 1); line(gl, f.x1, f.y1, f.x2, f.y2, f.c, k, 3); }
    else if (f.k === 'slash') { line(lg, f.x1, f.y1, f.x2, f.y2, '#ffffff', k, 2); line(gl, f.x1, f.y1, f.x2, f.y2, f.c, k, 5); }
    else if (f.k === 'swing') { for (let i = -3; i <= 3; i++) both('#ffffff', f.x + f.dir * (3 - Math.abs(i)) * 1.5, f.y + i * 2, 2, 2, k * 0.8); }
    else if (f.k === 'skybolt') { lg.globalAlpha = k; boltLine(lg, f.x + 10, 0, f.x, f.y, '#ffffff', now / 1000, 6); gl.globalAlpha = k; boltLine(gl, f.x + 10, 0, f.x, f.y, f.c, now / 1000, 9); px(gl, f.c, f.x - 6, 0, 12, f.y); lg.globalAlpha = gl.globalAlpha = 1; }
    else if (f.k === 'healRing') { ringPx(lg, f.x, f.y, f.r * (1 - k * 0.7), '#7dff8a', k); ringPx(gl, f.x, f.y, f.r * (1 - k * 0.7), '#7dff8a', k); }
    else if (f.k === 'transform' || f.k === 'ultflash') {
      gl.globalAlpha = k * 0.7; lg.globalAlpha = k * 0.5;
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + now / 900, L = 30 + (1 - k) * 200; for (let j = 8; j < L; j += 3) { px(gl, f.c, f.x + Math.cos(a) * j, f.y + Math.sin(a) * j, 2, 2); if (j < L * 0.6) px(lg, '#ffffff', f.x + Math.cos(a) * j, f.y + Math.sin(a) * j, 1, 1); } }
      gl.globalAlpha = lg.globalAlpha = 1;
    }
    else if (f.k === 'blizzard') { lg.globalAlpha = k * 0.25; disc(lg, f.x, f.y, R(f.r * (1.1 - k * 0.6)), '#dff8ff'); lg.globalAlpha = 1; }
  }
  if (th.tint) { lg.fillStyle = th.tint; lg.fillRect(0, 0, W, H); }

  // ---------- на экран ----------
  const { s, cw, ch, u } = view;
  shake = Math.max(0, shake - dt * 30);
  const shx = shake > 0.1 ? (Math.random() - 0.5) * shake * 0.6 : 0, shy = shake > 0.1 ? (Math.random() - 0.5) * shake * 0.6 : 0;
  const sx = view.camX + shx, sy = view.camY + shy;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(low, sx, sy, view.camW, view.camH, 0, 0, cw, ch);
  bg.clearRect(0, 0, W / 4, H / 4); bg.drawImage(glow, 0, 0, W / 4, H / 4);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.9; ctx.drawImage(bloom, sx / 4, sy / 4, view.camW / 4, view.camH / 4, 0, 0, cw, ch);
  ctx.globalAlpha = 0.3; ctx.drawImage(glow, sx, sy, view.camW, view.camH, 0, 0, cw, ch);
  ctx.restore();
  const vk = cw + 'x' + ch;
  if (vignKey !== vk) { vignKey = vk; vign = document.createElement('canvas'); vign.width = cw; vign.height = ch; const g = vign.getContext('2d'); const gr = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.4, cw / 2, ch / 2, Math.max(cw, ch) * 0.75); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = gr; g.fillRect(0, 0, cw, ch); }
  ctx.drawImage(vign, 0, 0);
  if (flash) { ctx.globalAlpha = flash.a; ctx.fillStyle = flash.c; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; flash.a -= dt * 2.2; if (flash.a <= 0) flash = null; }

  drawLabels(ctx, view, w, pos, myId, now);
  // автонаведение: прицел на текущую цель
  if (me && me.dead <= 0 && !aiming && m.phase === 'play') {
    const ch2 = m.chosenId === myId;
    const range = ch2 ? (CFG.powers[me.power].aRange || 130) : me.weapon ? CFG.weapons[me.weapon].range : 0;
    const tg = range ? autoTargetFor(w, me, range) : null;
    if (tg) {
      const tx = view.ox + tg.x * s, ty = view.oy + (tg.y - hitH(tg) / 2) * s, r = (hitH(tg) * 0.6 + 4) * s, a = now / 400;
      ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 2 * u;
      for (let i = 0; i < 4; i++) { const b = a + i * Math.PI / 2; ctx.beginPath(); ctx.arc(tx, ty, r, b, b + 0.7); ctx.stroke(); }
      ctx.fillStyle = '#ff3b5c'; ctx.fillRect(tx - u, ty - u, 2 * u, 2 * u);
    }
  }
  drawHud(ctx, view, w, myId, now);
}

// ---------- метки над игроками ----------
const ARROW = ['..###..', '..###..', '..###..', '#######', '.#####.', '..###..', '...#...'];
function drawArrow(ctx, cx, by, cell, color) {
  const x0 = cx - 3.5 * cell, y0 = by - 7 * cell;
  ctx.fillStyle = '#000';
  ARROW.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') ctx.fillRect(x0 + x * cell - cell * 0.6, y0 + y * cell - cell * 0.6, cell * 2.2, cell * 2.2); }));
  ctx.fillStyle = color;
  ARROW.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') ctx.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.5, cell + 0.5); }));
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x0 + 2 * cell, y0, cell, cell * 3);
}
function text(ctx, str, x, y, size, color, align = 'center') {
  ctx.font = `${R(size)}px ${FONT}`; ctx.textAlign = align;
  ctx.lineWidth = Math.max(2, size * 0.32); ctx.strokeStyle = '#0b0712'; ctx.lineJoin = 'round';
  ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
}
export const HERO_ICON = k => (CFG.heroes[k] || CFG.heroes.brawler).icon;

function drawLabels(ctx, view, w, pos, myId, now) {
  const { s, ox, oy, u } = view, m = w.match;
  ctx.textBaseline = 'bottom';
  const fs = 6.5 * u, placed = [];
  for (const [p, x, y] of pos.sort((a, b) => a[1] - b[1])) {
    const me = p.id === myId, sc = p.scale || 1, chosen = m.chosenId === p.id;
    const bob = me ? Math.sin(now / 160) * 2 * u : 0;
    const sx = ox + x * s, sy = oy + (y - 22 * sc - (chosen ? 9 : 3)) * s - 2 * u;
    const cell = Math.max(2, R((me ? 2.1 : 1.5) * u));
    ctx.font = `${R(fs)}px ${FONT}`;
    const txt = p.isBot ? p.name : `${p.name}·${p.label}`;
    const tw = ctx.measureText(txt).width + 6 * u, lh = fs + 9 * u;
    let by = sy - 7 * cell - 5 * u;
    for (let k = 0; k < 6; k++) { const hit = placed.find(r => Math.abs(r.x - sx) < (r.w + tw) / 2 && Math.abs(r.y - by) < lh); if (!hit) break; by = hit.y - lh; }
    placed.push({ x: sx, y: by, w: tw });
    drawArrow(ctx, sx, sy + bob, cell, p.color);
    if (!chosen) {
      const st = per.get(p.id), bw = 26 * u, hx = sx - bw / 2;
      ctx.fillStyle = '#0b0712'; ctx.fillRect(hx - u, by - u, bw + 2 * u, 5 * u);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(hx, by, bw * Math.max(0, (st ? st.lag : p.hp) / p.maxHp), 3 * u);
      const k = Math.max(0, p.hp / p.maxHp);
      ctx.fillStyle = k < 0.3 ? '#ff3b5c' : p.color; ctx.fillRect(hx, by, bw * k, 3 * u);
      if (p.shield > 0) { ctx.fillStyle = '#4dc3ff'; ctx.fillRect(hx, by - 2 * u, bw * Math.min(1, p.shield / CFG.items.shield.amt), u * 1.5); }
    }
    text(ctx, (me ? '▶' : '') + txt, sx, by - 2 * u, fs, p.color);
    if (p.weapon && !chosen) { ctx.font = `${R(6 * u)}px system-ui`; ctx.textAlign = 'left'; ctx.fillText(CFG.weapons[p.weapon].icon, sx + tw / 2, by - 2 * u); }
  }
  for (const f of w.fx) {
    const k = f.t / f.ttl;
    if (f.k === 'num') {
      const size = (f.big ? 10 : f.small ? 5.5 : 7) * u * (k > 0.8 ? 1 + (k - 0.8) * 2.5 : 1);
      ctx.globalAlpha = Math.min(1, k * 2.5);
      text(ctx, String(f.v), ox + f.x * s, oy + (f.y - (1 - k) * 16) * s, size, f.c);
      ctx.globalAlpha = 1;
    } else if ((f.k === 'pickup' && f.label) || f.k === 'empty') {
      ctx.globalAlpha = Math.min(1, k * 2);
      text(ctx, f.k === 'empty' ? 'ПУСТО!' : f.label, ox + f.x * s, oy + (f.y - 8 - (1 - k) * 18) * s, 7 * u, f.c);
      ctx.globalAlpha = 1;
    }
  }
  ctx.textBaseline = 'middle';
  for (const pk of w.pickups || []) {
    if (pk.k !== 'item' || (pk.life < 3 && Math.floor(now / 120) % 2)) continue;
    const info = CFG.items[pk.w], by = pk.y - 9 + Math.sin(now / 250 + pk.x) * 2;
    ctx.font = `${R(7 * u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText(info.icon, ox + pk.x * s, oy + by * s + u * 0.5);
  }
}

function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function pill(ctx, x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, h / 2) : ctx.rect(x, y, w, h); ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawHud(ctx, view, w, myId, now) {
  const { cw, ch, u, safeL } = view, m = w.match, PW = CFG.powers;
  if (m.phase === 'lobby') return;
  ctx.textBaseline = 'middle';
  const tLeft = m.phase === 'play' ? m.timer : m.phase === 'countdown' ? CFG.roundTime : 0;
  const urgent = m.phase === 'play' && m.timer < 10;
  pill(ctx, cw / 2 - 52 * u, 6 * u, 104 * u, 22 * u, 'rgba(11,7,18,0.72)', 'rgba(255,255,255,0.15)');
  text(ctx, fmt(tLeft), cw / 2, 15 * u, (urgent ? 11 + Math.sin(now / 80) : 11) * u, urgent ? '#ff3b5c' : '#ffffff');
  for (let i = 0; i < CFG.rounds; i++) { ctx.fillStyle = i < m.round ? '#ffd23f' : 'rgba(255,255,255,0.25)'; ctx.fillRect(cw / 2 - 20 * u + i * 9 * u, 24 * u, 6 * u, 2 * u); }
  const c = w.players.find(p => p.id === m.chosenId);
  if (c && PW[c.power]) {
    const pw = PW[c.power], bw = Math.min(cw * 0.44, 300 * u), x = cw / 2 - bw / 2, y = 34 * u, st = per.get(c.id);
    text(ctx, `${pw.icon} ${c.name}${c.id === myId ? ' (ТЫ)' : ''} · ${pw.name.toUpperCase()}`, x, y + 2 * u, 7 * u, pw.color, 'left');
    text(ctx, `${Math.ceil(c.hp)}`, x + bw, y + 2 * u, 7.5 * u, '#ffffff', 'right');
    const by = y + 8 * u;
    ctx.fillStyle = 'rgba(11,7,18,0.85)'; ctx.fillRect(x - 2 * u, by - 2 * u, bw + 4 * u, 12 * u);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, by, bw * Math.max(0, (st ? st.lag : c.hp) / c.maxHp), 8 * u);
    const g = ctx.createLinearGradient(0, by, 0, by + 8 * u); g.addColorStop(0, shade(pw.color, 1.3)); g.addColorStop(1, shade(pw.color, 0.7));
    ctx.fillStyle = g; ctx.fillRect(x, by, bw * Math.max(0, c.hp / c.maxHp), 8 * u);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 1; i < 10; i++) ctx.fillRect(x + bw * i / 10, by, u, 8 * u);
    const uk = (c.ult || 0) / CFG.chosen.ultMax;
    ctx.fillStyle = 'rgba(11,7,18,0.85)'; ctx.fillRect(x - u, by + 11 * u, bw * 0.5 + 2 * u, 4 * u);
    ctx.fillStyle = uk >= 1 ? (Math.floor(now / 150) % 2 ? '#ffffff' : '#ffd23f') : '#ffd23f'; ctx.fillRect(x, by + 12 * u, bw * 0.5 * uk, 2 * u);
    if (uk >= 1) text(ctx, c.id === myId ? `УЛЬТА: ${pw.ultName.toUpperCase()} 💥` : 'УЛЬТА ГОТОВА!', x + bw * 0.5 + 6 * u, by + 13 * u, 6 * u, '#ffd23f', 'left');
  }
  const list = [...w.players].sort((a, b) => b.score - a.score), lx = 8 * u + safeL;
  list.forEach((p, i) => {
    const y = 12 * u + i * 13 * u, me = p.id === myId;
    if (me) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(lx - 3 * u, y - 6 * u, 112 * u, 12 * u); }
    ctx.fillStyle = p.color; ctx.fillRect(lx, y - 3 * u, 6 * u, 6 * u);
    text(ctx, `${p.name.slice(0, 8)}${p.id === m.chosenId ? '👑' : ''}`, lx + 10 * u, y, 6.5 * u, me ? '#ffffff' : '#d9d4e8', 'left');
    text(ctx, String(Math.floor(p.score)), lx + 106 * u, y, 6.5 * u, '#ffd23f', 'right');
  });
  let fy = 44 * u;
  for (const e of m.feed || []) {
    const age = w.time - e.t; if (age > 5) continue;
    ctx.globalAlpha = Math.min(1, (5 - age) * 2);
    const right = cw - 10 * u - (view.safeR || 0);
    ctx.font = `${R(6 * u)}px ${FONT}`; const bw2 = ctx.measureText(e.b).width;
    text(ctx, e.b, right, fy, 6 * u, e.bc, 'right'); text(ctx, e.icon, right - bw2 - 8 * u, fy, 6 * u, '#ffffff'); text(ctx, e.a, right - bw2 - 15 * u, fy, 6 * u, e.ac, 'right');
    ctx.globalAlpha = 1; fy += 12 * u;
  }
  const me = w.players.find(p => p.id === myId);
  if (me && m.phase === 'play' && me.dead <= 0) {
    const ch2 = m.chosenId === myId, by = ch - 14 * u;
    if (!ch2) {
      const Wp = me.weapon && CFG.weapons[me.weapon];
      if (Wp) text(ctx, `${Wp.icon} ${Wp.name.toUpperCase()}  ${me.ammo}`, cw / 2, by, 8 * u, me.ammo <= Wp.ammo * 0.25 ? '#ff6b7a' : '#ffd23f');
      else { ctx.globalAlpha = 0.65 + 0.35 * Math.sin(now / 200); text(ctx, '✊ НЕТ ОРУЖИЯ — ПОДБЕРИ 🔫 НА КАРТЕ', cw / 2, by, 7 * u, '#ffffff'); ctx.globalAlpha = 1; }
      const items = [];
      if (me.speedT > 0) items.push(['»', Math.ceil(me.speedT) + 'с', '#7dff8a']);
      if (me.shield > 0) items.push(['🛡', Math.ceil(me.shield), '#4dc3ff']);
      if (me.invisT > 0) items.push(['👻', Math.ceil(me.invisT) + 'с', '#c9c3ff']);
      if (me.blockT > 0) items.push(['🛡', 'БЛОК', '#ffd23f']);
      items.forEach((it, i) => text(ctx, `${it[0]}${it[1]}`, cw / 2 + (i - (items.length - 1) / 2) * 50 * u, by - 14 * u, 7 * u, it[2]));
      if (me.hp / me.maxHp < 0.3) { ctx.fillStyle = `rgba(255,30,60,${0.12 + 0.08 * Math.sin(now / 120)})`; ctx.fillRect(0, 0, cw, ch); }
    }
  }
  if (me && me.dead > 0 && m.phase === 'play') text(ctx, `ВОЗРОЖДЕНИЕ ${Math.ceil(me.dead)}`, cw / 2, ch * 0.45, 10 * u, '#ffffff');
  if (me && me.frozenT > 0) text(ctx, 'ЗАМОРОЖЕН!', cw / 2, ch * 0.6, 9 * u, '#8ee8ff');
  if (me && me.stunT > 0) text(ctx, 'ОГЛУШЁН!', cw / 2, ch * 0.6, 9 * u, '#5cf2ff');
  if (m.phase === 'countdown') { const n = Math.ceil(m.timer), f = m.timer - Math.floor(m.timer); text(ctx, String(n), cw / 2, ch * 0.5, (28 + f * 18) * u, '#ffd23f'); }
  if (m.phase === 'play' && m.timer > CFG.roundTime - 0.8) text(ctx, 'БОЙ!', cw / 2, ch * 0.5, (30 + (m.timer - CFG.roundTime + 0.8) * 30) * u, '#ffffff');
  if (m.banner) {
    const b = m.banner, pr = 1 - b.t / b.ttl, a = Math.min(1, b.t / 0.35, pr / 0.08);
    const sc = pr < 0.12 ? 1.5 - pr * 4.2 : 1, y = ch * 0.3;
    ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#0b0712'; ctx.fillRect(0, y - 20 * u, cw, 40 * u); ctx.globalAlpha = a;
    ctx.fillStyle = b.color; ctx.fillRect(0, y - 20 * u, cw, 2 * u); ctx.fillRect(0, y + 18 * u, cw, 2 * u);
    text(ctx, b.text, cw / 2, y - 4 * u, 15 * u * sc, b.color);
    if (b.sub) text(ctx, b.sub, cw / 2, y + 10 * u, 6.5 * u, '#ffffff');
    ctx.globalAlpha = 1;
  }
  if (m.msgT > 0 && m.msg) {
    const warn = m.msg.startsWith('⚠');
    ctx.globalAlpha = Math.min(1, m.msgT * 3) * (warn ? 0.6 + 0.4 * Math.sin(now / 70) : 1);
    text(ctx, m.msg, cw / 2, ch * 0.46, 10 * u, warn ? '#ff3b5c' : '#ffd23f');
    ctx.globalAlpha = 1;
  }
}
