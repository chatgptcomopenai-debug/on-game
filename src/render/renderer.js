// Рендер вида сверху. Мир рисуется в низком разрешении (высота кадра 208 px) + слой свечения, затем масштабируется.
// Камера следует за игроком. Поверх в полном разрешении: подписи, цифры урона, мини-карта, стрелки, HUD.
import { CFG } from '../config.js';
import { buildMapArt } from './tiles.js';
import { charSprite, silhouette, gunSprite, crownSprite, shade, mk, SPR_H } from './sprites.js';
import { Particles } from './particles.js';
import { WORLD_W, WORLD_H } from '../sim/maps.js';
import { sfx } from '../audio.js';

const VH = CFG.VH, { TILE, MW, MH } = CFG;
const R = Math.round;
let VW = 0, low, lg, glow, gl, bloom, bg;
function ensure(view) {
  const vw = Math.min(520, Math.ceil(VH * view.cw / view.ch / 2) * 2);
  if (vw === VW) return;
  VW = vw; [low, lg] = mk(VW, VH); [glow, gl] = mk(VW, VH); [bloom, bg] = mk(Math.ceil(VW / 4), VH / 4); bg.imageSmoothingEnabled = true;
}
export const FONT = '"Press Start 2P", system-ui, sans-serif';

const parts = new Particles(700);
const per = new Map();
let lastFx = 0, shake = 0, flash = null, lastNow = 0, vign = null, vignKey = '';
const cam = { x: 0, y: 0, init: false };
export function resetRender() { lastFx = 0; parts.a = []; per.clear(); cam.init = false; }
function flashScreen(c, a) { if (!flash || flash.a < a) flash = { c, a }; }

const px = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(R(x), R(y), R(w), R(h)); };
function disc(g, cx, cy, r, c) { r = R(r); g.fillStyle = c; for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(R(cx - w), R(cy + dy), w * 2 + 1, 1); } }
function ringPx(g, cx, cy, r, c, a = 1, dash = 0) {
  if (r < 1) return;
  g.globalAlpha = a; g.fillStyle = c;
  const n = Math.max(16, R(r * 5));
  for (let i = 0; i < n; i++) { if (dash && Math.floor(i / dash) % 2) continue; const t = i / n * Math.PI * 2; g.fillRect(R(cx + Math.cos(t) * r), R(cy + Math.sin(t) * r), 1, 1); }
  g.globalAlpha = 1;
}
function both(c, x, y, w, h, a = 1) { lg.globalAlpha = a; px(lg, c, x, y, w, h); gl.globalAlpha = a; px(gl, c, x - 1, y - 1, w + 2, h + 2); lg.globalAlpha = gl.globalAlpha = 1; }
function dot(c, x, y, a = 1) { lg.globalAlpha = a * 0.6; px(lg, '#0b0712', x - 2, y - 2, 4, 4); lg.globalAlpha = a; px(lg, c, x - 1, y - 1, 2, 2); gl.globalAlpha = a * 0.5; px(gl, c, x - 2, y - 2, 4, 4); lg.globalAlpha = gl.globalAlpha = 1; }
function boltLine(g, x1, y1, x2, y2, c, t, jit = 4) {
  g.strokeStyle = c; g.lineWidth = 1; g.beginPath(); g.moveTo(x1, y1);
  const n = Math.max(3, R(Math.hypot(x2 - x1, y2 - y1) / 8));
  for (let i = 1; i < n; i++) g.lineTo(x1 + (x2 - x1) * i / n + Math.sin(i * 7.3 + t * 60) * jit, y1 + (y2 - y1) * i / n + Math.cos(i * 5.1 + t * 47) * jit);
  g.lineTo(x2, y2); g.stroke();
}
function line(g, x1, y1, x2, y2, c, a = 1, w = 1) { g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.globalAlpha = 1; }
function sector(g, x, y, r, ang, arc, c, a) { g.globalAlpha = a; g.fillStyle = c; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, ang - arc / 2, ang + arc / 2); g.closePath(); g.fill(); g.globalAlpha = 1; }

// ---------- события симуляции → частицы, звук, тряска ----------
function onFx(f) {
  const c = f.c || '#fff', P = parts;
  if (f.shake) shake = Math.max(shake, f.shake);
  if (f.snd) sfx(f.snd);
  switch (f.k) {
    case 'hit': P.burst(f.x, f.y, 6, { cols: [c, '#ffffff'], speed: 90, life: 0.25, glow: true }); break;
    case 'muzzle':
      P.burst(f.x, f.y, f.big ? 8 : 4, { cols: [c, '#ffffff'], speed: f.big ? 120 : 80, life: 0.12, dir: Math.atan2(f.dy || 0, f.dx || 1), spread: 0.7, glow: true });
      if (f.shell) P.add({ x: f.x, y: f.y, vx: -(f.dy || 0) * 40 - (f.dx || 1) * 20, vy: (f.dx || 1) * 40 - 30, life: 0.5, c: '#ffcf3a', drag: 0.9, size: 1 });
      break;
    case 'death':
      P.burst(f.x, f.y, f.big ? 60 : 26, { cols: [c, shade(c, 0.6), '#f3c89b', '#ffffff'], speed: f.big ? 190 : 130, life: 0.7, size: 2, drag: 0.9 });
      P.burst(f.x, f.y, f.big ? 14 : 6, { cols: ['#8a8a99', '#b4b4c4'], speed: 30, life: 0.9, kind: 'smoke', size: 4, grow: 10 });
      if (f.big) P.burst(f.x, f.y, 26, { cols: ['#ffd23f', '#ffffff'], speed: 150, life: 0.8, glow: true, size: 2 });
      flashScreen('#ffffff', f.big ? 0.5 : 0.1); break;
    case 'transform': P.burst(f.x, f.y, 50, { cols: [c, '#ffffff', '#ffd23f'], speed: 170, life: 0.9, glow: true, size: 2, drag: 0.93 }); flashScreen(c, 0.35); break;
    case 'boom': {
      const big = (f.r || 10) > 20;
      P.burst(f.x, f.y, big ? 34 : 12, { cols: ['#fff3b0', '#ffd23f', c, '#ff3d00'], speed: (f.r || 10) * 4.5, life: 0.45, glow: true, size: 2, drag: 0.9 });
      P.burst(f.x, f.y, big ? 9 : 3, { cols: ['#5a5060', '#7a7080'], speed: 25, life: 1, kind: 'smoke', size: 4, grow: 11 });
      if (big) flashScreen(c, 0.12);
      break;
    }
    case 'dust': P.burst(f.x, f.y - 1, f.n || 5, { cols: [c, '#cfc6b8'], speed: 45, life: 0.4, kind: 'smoke', size: 2, grow: 6, drag: 0.85 }); break;
    case 'dash': P.burst(f.x, f.y, 10, { cols: [c, '#ffffff'], speed: 50, dir: Math.atan2(-(f.dy || 0), -(f.dx || 1)), spread: 0.8, life: 0.3, size: 2, kind: 'smoke', grow: 4 }); break;
    case 'smoke': P.burst(f.x, f.y, 14, { cols: [c, shade(c, 1.5)], speed: 45, life: 0.6, kind: 'smoke', size: 4, grow: 10, drag: 0.88 }); break;
    case 'pickup': P.burst(f.x, f.y, 14, { cols: [c, '#ffffff'], speed: 60, life: 0.5, glow: true }); break;
    case 'pop': P.burst(f.x, f.y, 8, { cols: ['#ffffff', '#ffd23f'], speed: 40, life: 0.4, glow: true }); break;
    case 'shield': case 'buff': P.burst(f.x, f.y, 12, { cols: [c, '#ffffff'], speed: 65, life: 0.35, glow: true }); break;
    case 'healRing': for (let i = 0; i < 22; i++) P.add({ x: f.x + (Math.random() - 0.5) * f.r * 1.6, y: f.y + (Math.random() - 0.5) * f.r * 1.2, vx: 0, vy: -35 - Math.random() * 30, life: 0.8, c: i % 3 ? '#7dff8a' : '#ffffff', glow: true, drag: 0.97 }); break;
    case 'freeze': case 'shatter': case 'wall': P.burst(f.x, f.y, f.big ? 18 : 10, { cols: ['#ffffff', '#cfefff', '#8ee8ff'], speed: 100, life: 0.45, glow: true, drag: 0.9 }); break;
    case 'blizzard': for (let i = 0; i < 120; i++) { const a = Math.random() * Math.PI * 2; P.add({ x: f.x, y: f.y, vx: Math.cos(a) * (80 + Math.random() * 200), vy: Math.sin(a) * (80 + Math.random() * 200), life: 1.0, c: Math.random() < 0.5 ? '#ffffff' : '#bff4ff', glow: true, drag: 0.95, size: 1 + (Math.random() < 0.3) }); } flashScreen('#bff4ff', 0.3); break;
    case 'quake': P.burst(f.x, f.y, 40, { cols: ['#d8c8b0', '#ffffff', '#9a8a7a'], speed: 190, life: 0.7, kind: 'smoke', size: 3, grow: 6 }); flashScreen('#ffffff', 0.15); break;
    case 'ultflash': P.burst(f.x, f.y, 40, { cols: [c, '#ffffff'], speed: 200, life: 0.7, glow: true, size: 2 }); flashScreen(c, 0.4); break;
    case 'skybolt': flashScreen('#ffffff', 0.25); P.burst(f.x, f.y, 14, { cols: ['#ffffff', c], speed: 110, life: 0.35, glow: true }); break;
    case 'bolt': P.burst(f.x2, f.y2, 6, { cols: ['#ffffff', c], speed: 90, life: 0.2, glow: true }); break;
    case 'beam': P.burst(f.x2, f.y2, 8, { cols: ['#ffffff', c], speed: 80, life: 0.25, glow: true }); break;
    case 'slash': for (let i = 0; i < 14; i++) { const k = i / 14; P.add({ x: f.x1 + (f.x2 - f.x1) * k, y: f.y1 + (f.y2 - f.y1) * k, vx: 0, vy: -8, life: 0.35, c: i % 2 ? c : '#1a0f2a', glow: i % 2 === 1, size: 2 }); } break;
    case 'ring': for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; P.add({ x: f.x + Math.cos(a) * f.r * 0.5, y: f.y + Math.sin(a) * f.r * 0.5, vx: Math.cos(a) * f.r * 2, vy: Math.sin(a) * f.r * 2, life: 0.38, c: i % 3 ? c : '#ffffff', glow: true, drag: 0.88, size: 2 }); } break;
    case 'gust': for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2; P.add({ x: f.x, y: f.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 0.5, c: '#e8fff6', len: 5, drag: 0.93 }); } break;
    case 'cloud': case 'splat': P.burst(f.x, f.y, f.k === 'cloud' ? 22 : 10, { cols: [c, shade(c, 0.6)], speed: 55, life: 0.6, kind: f.k === 'cloud' ? 'smoke' : undefined, size: f.k === 'cloud' ? 5 : 2, grow: 8, glow: true }); break;
    case 'splash': P.burst(f.x, f.y, 20, { cols: ['#ffffff', '#bfe9ff'], speed: 110, life: 0.6, drag: 0.9 }); for (let i = 0; i < 2; i++) P.add({ x: f.x, y: f.y, vx: 0, vy: 0, life: 0.6, c: '#ffffff', ring: 6 + i * 6 }); break;
    case 'spawn': for (let i = 0; i < 14; i++) P.add({ x: f.x + (Math.random() - 0.5) * 12, y: f.y + 8, vx: 0, vy: -60 - Math.random() * 60, life: 0.5, c: i % 2 ? c : '#ffffff', glow: true, drag: 0.95 }); break;
    case 'charge': for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, r = 22; P.add({ x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, vx: -Math.cos(a) * r * 3.5, vy: -Math.sin(a) * r * 3.5, life: 0.28, c, glow: true, drag: 0.98 }); } break;
    case 'puff': P.burst(f.x, f.y, 3, { cols: [c, '#ffffff'], speed: 40, life: 0.15, glow: true }); break;
    case 'point': P.burst(f.x, f.y + 10, 20, { cols: ['#ffd23f', '#ffffff'], speed: 90, life: 0.7, glow: true }); break;
    case 'go': flashScreen('#ffffff', 0.12); break;
  }
}

function spawnAmbient(k, cx, cy) {
  const x = cx + Math.random() * VW, y = cy + Math.random() * VH;
  if (k === 'leaf' || k === 'petal') parts.add({ x, y: cy - 4, vx: 10 + Math.random() * 10, vy: 14 + Math.random() * 10, life: 12, c: k === 'petal' ? (Math.random() < 0.5 ? '#ffb3d1' : '#ffe0ef') : ['#8fe07a', '#ff9ec4', '#ffe14d'][(Math.random() * 3) | 0], wob: 25, drag: 1 });
  else if (k === 'ember') parts.add({ x, y, vx: (Math.random() - 0.5) * 10, vy: -20 - Math.random() * 25, life: 2.5, c: Math.random() < 0.6 ? '#ff7a1a' : '#ffd36b', wob: 30, drag: 1, glow: true });
  else if (k === 'snow') parts.add({ x, y: cy - 3, vx: -6 + Math.random() * 8, vy: 22 + Math.random() * 20, life: 9, c: '#ffffff', wob: 14, drag: 1 });
  else if (k === 'firefly') parts.add({ x, y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 3, c: Math.random() < 0.6 ? '#d6ff6b' : '#7dffcf', wob: 20, drag: 1, glow: true });
  else if (k === 'rain') parts.add({ x: x + 40, y: cy - 6, vx: -50, vy: 300, life: 0.8, c: '#7fa8ff', drag: 1 });
}
const AURA = { fire: '#ff7a1a', ice: '#ffffff', bolt: '#fff59d', giant: '#c77dff', poison: '#7dff4a', shadow: '#a05cff', gravity: '#9fc0ff', wind: '#e8fff6' };

// ---------- фон под островом ----------
function drawDeep(th, cx, cy, t) {
  const kind = th.bg;
  px(lg, th.deep, cx, cy, VW, VH);
  const tx0 = Math.floor(cx / TILE) - 1, ty0 = Math.floor(cy / TILE) - 1, nx = Math.ceil(VW / TILE) + 2, ny = Math.ceil(VH / TILE) + 2;
  if (kind === 'water' || kind === 'lava') {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = tx0 + i, y = ty0 + j, h = (x * 73856093 ^ y * 19349663) >>> 0;
      if (h % 3) continue;
      const ox = (h >> 4) % 10, oy = (h >> 8) % 12, ph = t * (kind === 'lava' ? 0.8 : 1.4) + (h % 17);
      lg.globalAlpha = 0.35 + 0.3 * Math.sin(ph);
      px(lg, th.deepHi, x * TILE + ox + Math.sin(ph) * 2, y * TILE + oy, 4 + (h % 3) * 2, 1);
      if (kind === 'lava' && h % 5 === 0) { lg.globalAlpha = 1; disc(lg, x * TILE + ox, y * TILE + oy + 3, 1 + ((t * 0.6 + h % 7) % 1) * 2, th.deepHi); }
    }
    lg.globalAlpha = 1;
    if (kind === 'lava') { gl.globalAlpha = 0.42; px(gl, th.deep, cx, cy, VW, VH); gl.globalAlpha = 1; }
  } else if (kind === 'clouds') {
    for (let i = 0; i < 46; i++) {
      const bx = ((i * 211 + t * (4 + i % 3 * 2)) % (WORLD_W + 200)) - 100, by = (i * 137) % WORLD_H;
      const x = cx + (bx - cx) * 0.75, y = cy + (by - cy) * 0.75;
      disc(lg, x, y, 9 + (i % 4) * 3, i % 3 ? '#ffffff' : '#dcecff'); disc(lg, x + 10, y + 3, 7 + (i % 3) * 2, '#ffffff');
    }
  } else if (kind === 'city') {
    const pxm = cx * 0.5, pym = cy * 0.5;
    for (let j = -1; j < 9; j++) for (let i = -1; i < 16; i++) {
      const gx = Math.floor(pxm / 40) + i, gy = Math.floor(pym / 40) + j, h = (gx * 73856093 ^ gy * 19349663) >>> 0;
      const x = cx + gx * 40 - pxm, y = cy + gy * 40 - pym;
      px(lg, '#15101f', x + 3, y + 3, 34, 34); px(lg, '#1c1630', x + 3, y + 3, 34, 3);
      for (let k = 0; k < 6; k++) if ((h >> k) & 1) { const c = ['#ffd36b', '#5cf2ff', '#ff6bd5'][(h >> (k + 6)) % 3]; lg.globalAlpha = 0.6; px(lg, c, x + 7 + (k % 3) * 9, y + 10 + Math.floor(k / 3) * 10, 4, 4); lg.globalAlpha = 1; }
    }
    for (let i = 0; i < 10; i++) { const y = cy + ((i * 97) % VH), x = cx + ((i * 173 + t * (60 + i * 9) * (i % 2 ? 1 : -1)) % (VW + 40) + VW + 40) % (VW + 40) - 20; both(i % 2 ? '#ff2a6d' : '#ffd36b', x, y, 5, 1, 0.8); }
  }
}

// ---------- прицел ----------
function aimSpec(w, me, btn) {
  const ch = w.match.chosenId === me.id && me.power;
  if (ch) {
    const P = CFG.powers[me.power];
    if (btn === 'a') return { kind: P.aAim === 'auto' ? 'range' : P.aAim, range: P.aRange, R: P.aR || 0, arc: P.aArc, c: P.color };
    return { kind: P.bAim, range: P.bRange || 60, R: P.bR || 30, c: P.color };
  }
  if (btn === 'a') {
    if (!me.weapon) return { kind: 'cone', range: CFG.punch.range + 4, arc: CFG.punch.arc, c: '#ffe14d' };
    const Wp = CFG.weapons[me.weapon];
    return { kind: Wp.aim, range: Wp.range, R: Wp.R || 0, arc: Wp.spread, c: me.weapon === 'sniper' ? '#ff2a6d' : '#ffe14d' };
  }
  const sk = (CFG.heroes[me.hero] || {}).skill;
  if (sk === 'rocketJump') return { kind: 'circle', range: CFG.skills.rocketRange, R: CFG.skills.rocketR, c: me.color };
  if (sk === 'shuriken') return { kind: 'cone', range: CFG.skills.shurRange, arc: CFG.skills.shurSpread, c: me.color };
  if (sk === 'heal') return { kind: 'self', R: CFG.skills.healR, c: '#7dff8a' };
  if (sk === 'emp') return { kind: 'self', R: CFG.skills.empR, c: '#5cf2ff' };
  return { kind: 'none' };
}
function drawAim(w, me, mx, my, aim, now) {
  if (!me || me.dead > 0 || !aim || !aim.active) return false;
  const sp = aimSpec(w, me, aim.btn), s = me.scale || 1, cx = mx, cy = my - 7 * s;
  const L = Math.hypot(aim.dx, aim.dy) || 1, dx = aim.dx / L, dy = aim.dy / L, mag = Math.max(0.2, Math.min(1, L)), c = sp.c, pul = 0.65 + 0.3 * Math.sin(now / 90);
  if (sp.kind === 'line' || sp.kind === 'laser') {
    if (sp.kind === 'laser') { line(lg, cx, cy, cx + dx * sp.range, cy + dy * sp.range, c, 0.8); line(gl, cx, cy, cx + dx * sp.range, cy + dy * sp.range, c, 0.6); }
    else for (let d = 10; d < sp.range; d += 7) dot(c, cx + dx * d, cy + dy * d, Math.max(0.4, 1 - d / sp.range) * pul + 0.2);
    ringPx(lg, cx + dx * sp.range, cy + dy * sp.range, 4, c, 0.9);
  } else if (sp.kind === 'cone') {
    const a0 = Math.atan2(dy, dx);
    sector(lg, cx, cy, sp.range, a0, sp.arc || 0.5, c, 0.2);
    for (const a of [a0 - (sp.arc || 0.5) / 2, a0 + (sp.arc || 0.5) / 2]) for (let d = 8; d < sp.range; d += 6) dot(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.8);
  } else if (sp.kind === 'circle') {
    const tx = mx + dx * sp.range * mag, ty = my + dy * sp.range * mag, D = Math.hypot(tx - mx, ty - my) || 1;
    for (let d = 10; d < D - 4; d += 7) dot(c, mx + (tx - mx) * d / D, my - 6 + (ty - my) * d / D, 0.7);
    lg.globalAlpha = 0.2; disc(lg, tx, ty, sp.R, c); lg.globalAlpha = 1;
    ringPx(lg, tx, ty, sp.R, c, pul + 0.2); ringPx(gl, tx, ty, sp.R, c, 0.7); ringPx(lg, tx, ty, sp.R * ((now / 500) % 1), '#ffffff', 0.5);
  } else if (sp.kind === 'self' || sp.kind === 'range') {
    ringPx(lg, mx, my - 6, sp.R || sp.range, c, pul, sp.kind === 'range' ? 3 : 0); ringPx(gl, mx, my - 6, sp.R || sp.range, c, 0.5);
  }
  return true;
}

const dirOf = ang => { const c = Math.cos(ang), s = Math.sin(ang); return Math.abs(c) > Math.abs(s) * 1.1 ? ['S', c < 0] : s > 0 ? ['F', false] : ['B', false]; };

// ---------- главный кадр ----------
export function render(ctx, view, w, alpha, myId, opts = {}) {
  ensure(view);
  const now = performance.now(), dt = Math.min(0.05, (now - (lastNow || now)) / 1000); lastNow = now;
  const m = w.match, PW = CFG.powers, tnow = now / 1000;
  const art = buildMapArt(w.mapIdx || 0), th = art.th;
  if ((w.fxId ?? 0) < lastFx) lastFx = 0;
  for (const f of w.fx) if (f.id > lastFx) onFx(f);
  for (const f of w.fx) lastFx = Math.max(lastFx, f.id || 0);
  parts.update(dt);

  // позиции игроков с интерполяцией (свой — с предсказанием, если есть)
  const P = w.players.map(p => {
    let x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha;
    if (p.id === myId && opts.pred) { x = opts.pred.x; y = opts.pred.y; }
    return { p, x, y };
  });
  const meE = P.find(e => e.p.id === myId), me = meE && meE.p;
  const chE = P.find(e => e.p.id === m.chosenId);
  // камера
  const focus = meE && me.dead <= 0 ? meE : chE && chE.p.dead <= 0 ? chE : meE || chE || { x: WORLD_W / 2, y: WORLD_H / 2 };
  let fx0 = focus.x, fy0 = focus.y - 10;
  if (meE && me.dead <= 0 && opts.aim && opts.aim.active) { fx0 += opts.aim.dx * 34; fy0 += opts.aim.dy * 24; }
  const tx = Math.max(0, Math.min(WORLD_W - VW, fx0 - VW / 2)), ty = Math.max(0, Math.min(WORLD_H - VH, fy0 - VH / 2));
  if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
  const ck = Math.min(1, dt * (myId ? 7 : 2.5)); cam.x += (tx - cam.x) * ck; cam.y += (ty - cam.y) * ck;
  shake = Math.max(0, shake - dt * 30);
  const cx = R(cam.x + (shake > 0.1 ? (Math.random() - 0.5) * shake * 0.7 : 0)), cy = R(cam.y + (shake > 0.1 ? (Math.random() - 0.5) * shake * 0.7 : 0));
  const sc0 = view.ch / VH, offX0 = (view.cw - VW * sc0) / 2;
  view.s = sc0; view.ox = offX0 - cam.x * sc0; view.oy = -cam.y * sc0;
  const rate = { leaf: 2, ember: 9, snow: 16, firefly: 5, rain: 50, petal: 3 }[th.ambient] || 0;
  let nA = rate * dt; while (nA > 0) { if (Math.random() < nA) spawnAmbient(th.ambient, cx, cy); nA--; }

  lg.setTransform(1, 0, 0, 1, -cx, -cy); gl.setTransform(1, 0, 0, 1, 0, 0); gl.clearRect(0, 0, VW, VH); gl.setTransform(1, 0, 0, 1, -cx, -cy);
  drawDeep(th, cx, cy, tnow);
  if (th.bg === 'lava') { gl.globalCompositeOperation = 'destination-out'; gl.drawImage(art.ground, cx, cy, VW, VH, cx, cy, VW, VH); gl.globalCompositeOperation = 'source-over'; }
  lg.drawImage(art.ground, cx, cy, VW, VH, cx, cy, VW, VH);
  gl.drawImage(art.glow, cx, cy, VW, VH, cx, cy, VW, VH);

  // --- слой земли: события карты, зоны, телеграфы, прицел ---
  const Hz = w.hazard;
  if (Hz && Hz.phase !== 'idle') {
    const HZ = CFG.hazards;
    if (Hz.k === 'wind' && Hz.phase === 'active') for (let i = 0; i < 3; i++) parts.add({ x: cx + Math.random() * VW - Hz.dx * 60, y: cy + Math.random() * VH - Hz.dy * 60, vx: Hz.dx * 300, vy: Hz.dy * 300, life: 0.7, c: '#ffffff', len: Math.abs(Hz.dx) > 0.5 ? 8 : 2, drag: 1 });
    if (Hz.phase === 'warn') {
      const r = { geyser: HZ.geyserR, ice: HZ.iceR, storm: HZ.stormR, spores: HZ.sporeR }[Hz.k], c = { geyser: '#ff7a1a', ice: '#cfefff', storm: '#ffe83a', spores: '#d77dff' }[Hz.k];
      if (r) for (const s of Hz.data) { const k = 1 - Hz.t / HZ.warn; lg.globalAlpha = 0.12 + 0.2 * k; disc(lg, s.x, s.y, r, c); lg.globalAlpha = 1; ringPx(lg, s.x, s.y, r, c, 0.6 + 0.4 * Math.sin(now / 60)); ringPx(lg, s.x, s.y, r * (1 - k), '#ffffff', 0.7); ringPx(gl, s.x, s.y, r, c, 0.5); }
      if (Hz.k === 'laser') { for (let y = cy; y < cy + VH; y += 6) if ((R(y / 6) + R(now / 80)) % 2) both('#ff2a6d', Hz.x - 1, y, 2, 3, 0.8); }
    } else if (Hz.k === 'laser') {
      both('#ff2a6d', Hz.x - 3, cy, 6, VH, 0.9); px(lg, '#ffffff', Hz.x - 1, cy, 2, VH); gl.globalAlpha = 0.7; px(gl, '#ff2a6d', Hz.x - 8, cy, 16, VH); gl.globalAlpha = 1;
      for (let i = 0; i < 2; i++) parts.add({ x: Hz.x, y: cy + Math.random() * VH, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 40, life: 0.3, c: '#ff6b9a', glow: true });
    }
  }
  for (const z of w.zones || []) {
    const k = Math.min(1, z.t / 0.4, (z.ttl - z.t) / 0.3 + 0.2);
    if (z.k === 'poison') {
      lg.globalAlpha = 0.26 * k; disc(lg, z.x, z.y, z.r, z.c); lg.globalAlpha = 1; gl.globalAlpha = 0.25 * k; disc(gl, z.x, z.y, z.r * 0.8, z.c); gl.globalAlpha = 1;
      ringPx(lg, z.x, z.y, z.r, z.c, 0.7 * k, 3);
      if (Math.random() < 0.5) parts.add({ x: z.x + (Math.random() - 0.5) * z.r * 1.6, y: z.y + (Math.random() - 0.5) * z.r * 1.4, vx: 0, vy: -10, life: 0.8, c: Math.random() < 0.5 ? z.c : shade(z.c, 1.4), kind: 'smoke', size: 3, grow: 5, drag: 0.97 });
    } else if (z.k === 'hole') {
      const r = z.big ? z.r * 0.5 * (1 + 0.1 * Math.sin(now / 80)) : z.r * 0.35, reach = z.reach || z.r * 2.2;
      lg.globalAlpha = 0.14; disc(lg, z.x, z.y, Math.min(reach, 150), z.c); lg.globalAlpha = 1;
      gl.globalAlpha = 0.6; disc(gl, z.x, z.y, r * 1.8, z.c); gl.globalAlpha = 1;
      disc(lg, z.x, z.y, r * 1.2, shade(z.c, 0.5)); disc(lg, z.x, z.y, r, '#05030c'); ringPx(lg, z.x, z.y, r * 1.35, '#ffffff', 0.6);
      ringPx(lg, z.x, z.y, reach * (1 - ((now / 700) % 1)), z.c, 0.4, 4);
      for (let i = 0; i < (z.big ? 5 : 2); i++) { const a = Math.random() * 6.28, rr = reach * (0.5 + Math.random() * 0.5); parts.add({ x: z.x + Math.cos(a) * rr, y: z.y + Math.sin(a) * rr, vx: -Math.cos(a) * rr * 1.6 - Math.sin(a) * 50, vy: -Math.sin(a) * rr * 1.6 + Math.cos(a) * 50, life: 0.5, c: i % 2 ? z.c : '#ffffff', glow: true, drag: 0.98 }); }
    }
  }
  for (const te of w.teles) {
    if (te.t > te.ttl && !te.hazard) continue;
    const k = 1 - Math.min(1, te.t / te.ttl), pulse = 0.5 + 0.5 * Math.sin(now / 45);
    if (te.k === 'cone') {
      const o = P.find(e => e.p.id === te.owner); if (!o) continue;
      const oy = o.y - 7 * o.p.scale;
      sector(lg, o.x, oy, te.r, te.ang, te.arc, te.c, 0.2 + 0.4 * k); sector(lg, o.x, oy, te.r * k, te.ang, te.arc, '#ffffff', 0.25); sector(gl, o.x, oy, te.r, te.ang, te.arc, te.c, 0.3);
    } else {
      lg.globalAlpha = (te.style === 'ally' ? 0.1 : 0.14) + 0.26 * k; disc(lg, te.x, te.y, te.r, te.c); lg.globalAlpha = 1;
      ringPx(lg, te.x, te.y, te.r, te.c, 0.6 + 0.4 * pulse); ringPx(gl, te.x, te.y, te.r, te.c, 0.7); ringPx(lg, te.x, te.y, te.r * (1 - k), '#ffffff', 0.85);
    }
  }
  const mxp = meE ? meE.x : 0, myp = meE ? meE.y : 0;
  const aiming = drawAim(w, me, mxp, myp, opts.aim, now);
  for (const pk of w.pickups || []) { const c = pk.k === 'weapon' ? '#ffd23f' : CFG.items[pk.w].color; lg.globalAlpha = 0.3; disc(lg, pk.x, pk.y, 7, '#000'); lg.globalAlpha = 1; ringPx(lg, pk.x, pk.y, 8 + Math.sin(now / 200 + pk.x) * 1.5, c, 0.8); gl.globalAlpha = 0.5; disc(gl, pk.x, pk.y, 7, c); gl.globalAlpha = 1; }

  // --- объекты и персонажи по глубине ---
  const list = [];
  for (const o of art.objects) { if (o.x < cx - 30 || o.x > cx + VW + 30 || o.y < cy - 8 || o.y > cy + VH + 44) continue; list.push({ y: o.y, o }); }
  for (const e of P) if (e.p.dead <= 0) list.push({ y: e.y + (e.p.leap ? 400 : 0), e });
  for (const tu of w.turrets || []) list.push({ y: tu.y, tu });
  for (const pk of w.pickups || []) list.push({ y: pk.y - 2, pk });
  for (const wl of w.walls || []) list.push({ y: wl.y + 4, wl });
  list.sort((a, b) => a.y - b.y);
  const pos = [];
  for (const it of list) {
    if (it.o) {
      const o = it.o, sx = o.x - o.spr.ax, sy = o.y - o.spr.ay;
      const hide = o.tall && P.some(e => e.p.dead <= 0 && Math.abs(e.x - o.x) < o.spr.w / 2 + 2 && e.y < o.y && e.y > o.y - o.spr.h + 4);
      lg.globalAlpha = hide ? 0.45 : 1; lg.drawImage(o.spr.c, sx, sy); lg.globalAlpha = 1;
      if (o.spr.g) gl.drawImage(o.spr.g, sx, sy);
      if (o.k === 'brazier' && Math.random() < 0.4) parts.add({ x: o.x + (Math.random() - 0.5) * 4, y: o.y - 14, vx: 0, vy: -25, life: 0.5, c: Math.random() < 0.5 ? '#ff7a1a' : '#ffd23f', glow: true });
    } else if (it.pk) {
      const pk = it.pk; if (pk.life < 3 && Math.floor(now / 120) % 2) continue;
      const by = pk.y - 9 + Math.sin(now / 250 + pk.x) * 2;
      if (pk.k === 'weapon') { const gs = gunSprite(pk.w); lg.drawImage(gs.c, R(pk.x - gs.w / 2), R(by - gs.h / 2)); gl.drawImage(gs.g, R(pk.x - gs.w / 2), R(by - gs.h / 2)); }
      else { const info = CFG.items[pk.w]; disc(lg, pk.x, by, 6, '#1b1424'); disc(lg, pk.x, by, 5, info.color); disc(lg, pk.x, by, 3, shade(info.color, 1.4)); px(lg, '#ffffff', pk.x - 2, by - 3, 2, 1); disc(gl, pk.x, by, 6, info.color); }
    } else if (it.tu) {
      const tu = it.tu, blink = tu.t < 2 && Math.floor(now / 100) % 2;
      lg.globalAlpha = 0.3; disc(lg, tu.x, tu.y, 6, '#000'); lg.globalAlpha = 1;
      px(lg, '#1b1424', tu.x - 6, tu.y - 7, 12, 8); px(lg, '#5b6676', tu.x - 5, tu.y - 6, 10, 6); px(lg, '#7d8898', tu.x - 5, tu.y - 6, 10, 1);
      px(lg, '#1b1424', tu.x - 4, tu.y - 13, 8, 8); px(lg, '#9ea7b3', tu.x - 3, tu.y - 12, 6, 6);
      for (let i = 0; i < 8; i++) px(lg, '#3a3a44', tu.x + Math.cos(tu.ang) * i - 1, tu.y - 9 + Math.sin(tu.ang) * i - 1, 2, 2);
      if (!blink) both(tu.c, tu.x - 1, tu.y - 11, 2, 2);
    } else if (it.wl) {
      const wl = it.wl, a = Math.min(1, wl.t / 0.4);
      lg.globalAlpha = 0.9 * a; px(lg, '#1b1424', wl.x - 6, wl.y - 16, 12, 22); px(lg, '#8ee8ff', wl.x - 5, wl.y - 15, 10, 20); px(lg, '#e0fbff', wl.x - 4, wl.y - 15, 3, 20); px(lg, '#5cc8e8', wl.x + 2, wl.y - 13, 3, 18); px(lg, '#ffffff', wl.x - 3, wl.y - 12, 1, 8);
      lg.globalAlpha = 1; gl.globalAlpha = 0.45 * a; px(gl, '#8ee8ff', wl.x - 7, wl.y - 17, 14, 24); gl.globalAlpha = 1;
    } else {
      const { p, x, y } = it.e, s = p.scale || 1, chosen = m.chosenId === p.id && !!p.power, isMe = p.id === myId;
      let st = per.get(p.id); if (!st) { st = { lag: p.hp, lagMax: p.maxHp }; per.set(p.id, st); }
      st.lag = st.lagMax !== p.maxHp ? p.hp : Math.max(p.hp, st.lag - (st.lag - p.hp) * dt * 3 - dt * 5); st.lagMax = p.maxHp;
      const invis = p.invisT > 0, baseA = invis ? (isMe ? 0.45 : 0.08) : 1;
      if (!invis || isMe) pos.push([p, x, y]);
      const lift = p.leap ? Math.sin(Math.PI * Math.min(1, p.leap.t / p.leap.T)) * 34 : 0;
      lg.globalAlpha = 0.3 * baseA; lg.fillStyle = '#000'; lg.beginPath(); lg.ellipse(x, y + 1, Math.max(1, (6 - lift * 0.08) * s), Math.max(0.5, (2.6 - lift * 0.03) * s), 0, 0, Math.PI * 2); lg.fill(); lg.globalAlpha = 1;
      let ang = p.ang; if (isMe && opts.aim && opts.aim.active && opts.aim.btn === 'a') ang = Math.atan2(opts.aim.dy, opts.aim.dx);
      const [dir, flip] = dirOf(ang);
      const walking = p.moving && !p.leap && !(p.dodgeT > 0), frame = walking ? Math.floor(p.animT * 9) % 4 : 0;
      const spr = charSprite(p.hero, p.color, p.hat, dir, frame);
      const bob = walking && frame % 2 ? -1 : 0, w16 = 16 * s, h26 = SPR_H * s;
      const dx0 = R(x - w16 / 2), dy0 = R(y - h26 + 1 + bob - lift);
      const drawSpr = (img, ox = 0, oy = 0) => { if (flip) { lg.save(); lg.translate(dx0 + w16 + ox, dy0 + oy); lg.scale(-1, 1); lg.drawImage(img, 0, 0, w16, h26); lg.restore(); } else lg.drawImage(img, dx0 + ox, dy0 + oy, w16, h26); };
      if (chosen) {
        const pc = PW[p.power].color, pul = 0.3 + 0.12 * Math.sin(now / 120);
        gl.globalAlpha = pul * 0.45; disc(gl, x, y - 9 * s - lift, 10 * s, pc); gl.globalAlpha = 1;
        ringPx(lg, x, y, 9 * s + Math.sin(now / 150) * 1.5, pc, 0.8); ringPx(gl, x, y, 9 * s, pc, 0.7);
        if (Math.random() < dt * 20) { const c = AURA[p.power]; parts.add({ x: x + (Math.random() - 0.5) * 12 * s, y: y - Math.random() * 18 * s, vx: (Math.random() - 0.5) * 12, vy: -18 - Math.random() * 18, life: 0.6, c: Math.random() < 0.6 ? c : '#ffffff', glow: true, drag: 0.97 }); }
        lg.globalAlpha = baseA; const sil = silhouette(spr.c, pc); for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) drawSpr(sil, ox, oy);
      }
      if (p.dodgeT > 0) { lg.globalAlpha = 0.35; drawSpr(silhouette(spr.c, p.color), -(p.x - p.px) * 2.5, -(p.y - p.py) * 2.5); lg.globalAlpha = 1; }
      lg.globalAlpha = (p.inv > 0 && !p.leap && Math.floor(now / 70) % 2 ? 0.5 : 1) * baseA;
      const gun = !chosen && p.weapon ? gunSprite(p.weapon) : null;
      const drawGun = () => { if (!gun) return; const hx = x + Math.cos(ang) * 4 * s, hy = y - 7 * s + bob - lift + Math.sin(ang) * 3 * s; lg.save(); lg.translate(R(hx), R(hy)); lg.rotate(ang); if (Math.cos(ang) < 0) lg.scale(1, -1); lg.drawImage(gun.c, 1 + (p.attackT > 0.12 ? -2 : 0), -gun.h / 2); lg.restore(); };
      if (dir === 'B') drawGun();
      drawSpr(p.hitT > (chosen ? 0.245 : 0.2) ? silhouette(spr.c, '#ffffff') : spr.c);
      if (dir !== 'B') drawGun();
      if (!invis) { if (flip) { gl.save(); gl.translate(dx0 + w16, dy0); gl.scale(-1, 1); gl.drawImage(spr.g, 0, 0, w16, h26); gl.restore(); } else gl.drawImage(spr.g, dx0, dy0, w16, h26); }
      lg.globalAlpha = 1;
      if (chosen) { const cr = crownSprite(), by = dy0 - 4 + Math.sin(now / 250) * 1.5; lg.drawImage(cr, R(x - 5.5), R(by)); gl.globalAlpha = 0.9; gl.drawImage(cr, R(x - 5.5), R(by)); gl.globalAlpha = 1; }
      const top = y - 22 * s - lift;
      if (p.slowT > 0 && !(p.frozenT > 0)) { lg.globalAlpha = 0.3; px(lg, '#8ee8ff', x - 6 * s, top, 12 * s, 22 * s); lg.globalAlpha = 1; }
      if (p.frozenT > 0) { lg.globalAlpha = 0.6; px(lg, '#bff4ff', x - 8 * s, top - 2, 16 * s, 25 * s); lg.globalAlpha = 1; px(lg, '#ffffff', x - 7 * s, top, 2, 16 * s); ringPx(gl, x, y - 10 * s, 12 * s, '#8ee8ff', 0.6); }
      if (p.stunT > 0) for (let i = 0; i < 3; i++) { const a = now / 150 + i * 2.1; both('#ffe83a', x + Math.cos(a) * 8 * s, top - 2 + Math.sin(a) * 2, 2, 2); }
      if (p.shield > 0) { ringPx(lg, x, y - 9 * s, 12 * s, '#4dc3ff', 0.5 + 0.3 * Math.sin(now / 100)); ringPx(gl, x, y - 9 * s, 12 * s, '#4dc3ff', 0.6); }
      if (p.blockT > 0) { ringPx(lg, x, y - 9 * s, 13 * s, '#ffd23f', 0.9); ringPx(lg, x, y - 9 * s, 12 * s, '#fff3b0', 0.6); ringPx(gl, x, y - 9 * s, 13 * s, '#ffd23f', 0.9); }
      if (p.rageT > 0 && Math.random() < 0.5) parts.add({ x: x + (Math.random() - 0.5) * 10, y: y - Math.random() * 18, vx: 0, vy: -30, life: 0.3, c: '#ff4d5e', glow: true });
      if (p.speedT > 0 && p.moving && Math.random() < 0.5) parts.add({ x, y: y - Math.random() * 14, vx: -Math.cos(p.ang) * 30, vy: -Math.sin(p.ang) * 30, life: 0.25, c: '#7dff8a', glow: true });
      if (walking && Math.random() < dt * 6) parts.add({ x: x - Math.cos(p.ang) * 3, y, vx: 0, vy: -4, life: 0.3, c: '#ffffff', kind: 'smoke', size: 1, grow: 4 });
    }
  }

  // --- снаряды ---
  for (const pr of w.projs) {
    const x = pr.lob ? pr.x : pr.x - pr.vx * (1 - alpha) / CFG.TICK, yg = pr.lob ? pr.y : pr.y - pr.vy * (1 - alpha) / CFG.TICK, y = yg - (pr.h || 0), ang = Math.atan2(pr.vy, pr.vx);
    if (pr.lob) { lg.globalAlpha = 0.3; disc(lg, x, yg, 3, '#000'); lg.globalAlpha = 1; }
    switch (pr.kind) {
      case 'fire': disc(gl, x, y, 8, '#ff9a3a'); disc(lg, x, y, 5, '#ff5722'); disc(lg, x, y, 3, '#ffb347'); disc(lg, x, y, 1, '#fff3b0'); if (Math.random() < 0.8) parts.add({ x: x - Math.cos(ang) * 4, y: y - Math.sin(ang) * 4, vx: 0, vy: -12, life: 0.3, c: Math.random() < 0.5 ? '#ff7a1a' : '#ffd23f', glow: true, size: 2 }); break;
      case 'ice': for (let i = 0; i < 6; i++) both(i < 2 ? '#ffffff' : '#8ee8ff', x - Math.cos(ang) * i, y - Math.sin(ang) * i, 2, 2, 1 - i / 7); break;
      case 'grenade': disc(lg, x, y, 3, '#1b1424'); disc(lg, x, y, 2, '#55663f'); if (Math.floor(now / 90) % 2) both('#ff3b3b', x, y - 1, 1, 1); break;
      case 'glob': disc(gl, x, y, 6, pr.c); disc(lg, x, y, 4, '#1b1424'); disc(lg, x, y, 3, pr.c); px(lg, '#e0ffd0', x - 1, y - 2, 1, 1); break;
      case 'rocket': for (let i = 0; i < 7; i++) px(lg, i < 2 ? '#ff5722' : '#5a7542', x - Math.cos(ang) * i - 1, y - Math.sin(ang) * i - 1, 3, 3); parts.add({ x: x - Math.cos(ang) * 8, y: y - Math.sin(ang) * 8, vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.5) * 16, life: 0.4, c: Math.random() < 0.3 ? '#ffd23f' : '#8a8a99', kind: 'smoke', size: 2, grow: 6, glow: true }); break;
      case 'orb': disc(gl, x, y, 8, pr.c); disc(lg, x, y, 4, '#0b0f30'); ringPx(lg, x, y, 5, pr.c, 1); ringPx(lg, x, y, 3 + Math.sin(now / 60), '#ffffff', 0.8); break;
      case 'blade': for (let i = -3; i <= 3; i++) both(i === 0 ? '#ffffff' : pr.c, x - Math.cos(ang) * Math.abs(i) * 1.5 - Math.sin(ang) * i * 2, y - Math.sin(ang) * Math.abs(i) * 1.5 + Math.cos(ang) * i * 2, 2, 2, 1 - Math.abs(i) * 0.15); break;
      case 'tornado': for (let i = 0; i < 9; i++) { const yy = y + 5 - i * 3, wv = 3 + i * 1.3, off = Math.sin(now / 50 + i * 0.8) * 3; lg.globalAlpha = 0.8; px(lg, i % 2 ? '#e8fff6' : '#9fe8d0', x - wv + off, yy, wv * 2, 2); } lg.globalAlpha = 1; gl.globalAlpha = 0.35; disc(gl, x, y - 6, 12, '#b8ffe6'); gl.globalAlpha = 1; if (Math.random() < 0.6) parts.add({ x: x + (Math.random() - 0.5) * 22, y: y - Math.random() * 20, vx: (Math.random() - 0.5) * 70, vy: -30, life: 0.35, c: '#ffffff', drag: 0.95 }); break;
      case 'clone': { const spr = charSprite('ghost', '#a05cff', 'none', 'F', Math.floor(now / 120) % 4), sil = silhouette(spr.c, '#1a0f2a'); lg.drawImage(sil, R(x - 9), R(y - 20), 19, 31); gl.globalAlpha = 0.5; disc(gl, x, y - 6, 10, '#a05cff'); gl.globalAlpha = 1; both('#ff3b5c', x - 3, y - 9, 2, 2); both('#ff3b5c', x + 2, y - 9, 2, 2); break; }
      case 'shuriken': { const a = now / 40; for (let i = 0; i < 4; i++) px(lg, '#d0d6de', x + Math.cos(a + i * 1.57) * 2, y + Math.sin(a + i * 1.57) * 2, 2, 2); px(lg, '#1b1424', x, y, 1, 1); break; }
      case 'sniper': for (let i = 0; i < 16; i++) both(i < 3 ? '#ffffff' : '#ff6b9a', x - Math.cos(ang) * i, y - Math.sin(ang) * i, 1, 1, 1 - i / 16); break;
      default: for (let i = 0; i < 6; i++) { lg.globalAlpha = 1 - i / 6; px(lg, i < 2 ? '#fff6c8' : pr.c, x - Math.cos(ang) * i, y - Math.sin(ang) * i, i < 2 ? 2 : 1, i < 2 ? 2 : 1); } lg.globalAlpha = 1; gl.globalAlpha = 0.8; px(gl, '#ffe9a0', x - 2, y - 2, 4, 4); gl.globalAlpha = 1;
    }
  }
  for (const p of parts.a) if (p.ring) ringPx(lg, p.x, p.y, p.ring + (1 - p.life / p.max) * 10, '#ffffff', p.life / p.max);
  parts.draw(lg, gl);
  for (const f of w.fx) {
    const k = f.t / f.ttl;
    if (f.k === 'ring' || f.k === 'healRing') { ringPx(lg, f.x, f.y, f.r * (1.15 - k * 0.5), f.c, k); ringPx(gl, f.x, f.y, f.r * (1.15 - k * 0.5), f.c, k); ringPx(lg, f.x, f.y, f.r * (1.1 - k * 0.6), '#ffffff', k * 0.7); }
    else if (f.k === 'boom') { const r = (f.r || 10) * (0.35 + (1 - k) * 0.55); gl.globalAlpha = k; disc(gl, f.x, f.y, r * 1.2, f.c); gl.globalAlpha = 1; lg.globalAlpha = k * 0.9; disc(lg, f.x, f.y, r, k > 0.8 ? '#ffffff' : k > 0.45 ? '#ffd36b' : f.c); lg.globalAlpha = 1; ringPx(lg, f.x, f.y, (f.r || 10) * (1.1 - k * 0.5), '#ffffff', k * 0.8); }
    else if (f.k === 'bolt') { lg.globalAlpha = Math.min(1, k * 1.5); boltLine(lg, f.x1, f.y1, f.x2, f.y2, '#ffffff', tnow, 3); gl.globalAlpha = k; boltLine(gl, f.x1, f.y1, f.x2, f.y2, f.c, tnow, 5); lg.globalAlpha = gl.globalAlpha = 1; }
    else if (f.k === 'beam') { line(lg, f.x1, f.y1, f.x2, f.y2, '#ffffff', k, 1); line(gl, f.x1, f.y1, f.x2, f.y2, f.c, k, 3); }
    else if (f.k === 'slash') { line(lg, f.x1, f.y1, f.x2, f.y2, '#ffffff', k, 2); line(gl, f.x1, f.y1, f.x2, f.y2, f.c, k, 5); }
    else if (f.k === 'swing') { const a0 = f.ang - f.arc / 2 + f.arc * (1 - k) * 0.6; lg.globalAlpha = k; lg.strokeStyle = f.big ? f.c : '#ffffff'; lg.lineWidth = f.big ? 4 : 2; lg.beginPath(); lg.arc(f.x, f.y, f.r * 0.8, a0, a0 + f.arc * 0.6); lg.stroke(); lg.globalAlpha = 1; if (f.big) sector(gl, f.x, f.y, f.r, f.ang, f.arc, f.c, k * 0.5); }
    else if (f.k === 'skybolt') { lg.globalAlpha = k; boltLine(lg, f.x + 6, f.y - 160, f.x, f.y, '#ffffff', tnow, 6); gl.globalAlpha = k; boltLine(gl, f.x + 6, f.y - 160, f.x, f.y, f.c, tnow, 9); disc(gl, f.x, f.y, f.r || 14, f.c); lg.globalAlpha = gl.globalAlpha = 1; }
    else if (f.k === 'transform' || f.k === 'ultflash') { gl.globalAlpha = k * 0.7; lg.globalAlpha = k * 0.5; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + now / 900, L = 20 + (1 - k) * 130; for (let j = 8; j < L; j += 3) { px(gl, f.c, f.x + Math.cos(a) * j, f.y + Math.sin(a) * j, 2, 2); if (j < L * 0.6) px(lg, '#ffffff', f.x + Math.cos(a) * j, f.y + Math.sin(a) * j, 1, 1); } } gl.globalAlpha = lg.globalAlpha = 1; }
    else if (f.k === 'blizzard' || f.k === 'quake' || f.k === 'gust') { ringPx(lg, f.x, f.y, f.r * (1 - k), f.k === 'quake' ? '#d8c8b0' : '#dff8ff', k); ringPx(lg, f.x, f.y, f.r * (1 - k) * 0.7, '#ffffff', k * 0.7); }
  }
  if (th.tint) { lg.fillStyle = th.tint; lg.fillRect(cx, cy, VW, VH); }

  // --- на экран ---
  const { s, cw, ch, u } = view, offX = offX0;
  ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#0b0712'; ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(low, offX, 0, VW * s, ch);
  bg.clearRect(0, 0, bloom.width, bloom.height); bg.drawImage(glow, 0, 0, bloom.width, bloom.height);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.85; ctx.drawImage(bloom, offX, 0, VW * s, ch); ctx.globalAlpha = 0.28; ctx.drawImage(glow, offX, 0, VW * s, ch); ctx.restore();
  const vk = cw + 'x' + ch;
  if (vignKey !== vk) { vignKey = vk; vign = document.createElement('canvas'); vign.width = cw; vign.height = ch; const g = vign.getContext('2d'); const gr = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.45, cw / 2, ch / 2, Math.max(cw, ch) * 0.75); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.42)'); g.fillStyle = gr; g.fillRect(0, 0, cw, ch); }
  ctx.drawImage(vign, 0, 0);
  if (flash) { ctx.globalAlpha = flash.a; ctx.fillStyle = flash.c; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; flash.a -= dt * 2.4; if (flash.a <= 0) flash = null; }
  const W2S = (x, y) => [offX + (x - cx) * s, (y - cy) * s];
  drawLabels(ctx, view, w, pos, myId, now, W2S);
  if (me && me.dead <= 0 && !aiming && m.phase === 'play') { // автонаведение: рамка на цели
    const isCh = m.chosenId === myId && me.power, range = isCh ? CFG.powers[me.power].aRange : me.weapon ? CFG.weapons[me.weapon].range : 0;
    let tg = null;
    if (range) { if (!isCh) { if (chE && chE.p.dead <= 0 && Math.hypot(chE.x - mxp, chE.y - myp) < range + 8) tg = chE; } else { let bd = range; for (const e of P) { if (e.p === me || e.p.dead > 0 || e.p.invisT > 0) continue; const d = Math.hypot(e.x - mxp, e.y - myp); if (d < bd) { bd = d; tg = e; } } } }
    if (tg) { const [sx2, sy2] = W2S(tg.x, tg.y - 9 * tg.p.scale), r = 13 * tg.p.scale * s, a = now / 400; ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 2 * u; for (let i = 0; i < 4; i++) { const b = a + i * Math.PI / 2; ctx.beginPath(); ctx.arc(sx2, sy2, r, b, b + 0.7); ctx.stroke(); } }
  }
  drawHud(ctx, view, w, myId, now, art, P, W2S, cx, cy);
}

// ---------- подписи ----------
const ARROW = ['..###..', '..###..', '#######', '.#####.', '..###..', '...#...'];
function drawArrow(ctx, x, by, cell, color) {
  const x0 = x - 3.5 * cell, y0 = by - 6 * cell;
  ctx.fillStyle = '#000'; ARROW.forEach((r, yy) => [...r].forEach((c, xx) => { if (c === '#') ctx.fillRect(x0 + xx * cell - cell * 0.6, y0 + yy * cell - cell * 0.6, cell * 2.2, cell * 2.2); }));
  ctx.fillStyle = color; ARROW.forEach((r, yy) => [...r].forEach((c, xx) => { if (c === '#') ctx.fillRect(x0 + xx * cell, y0 + yy * cell, cell + 0.5, cell + 0.5); }));
}
function text(ctx, str, x, y, size, color, align = 'center') {
  ctx.font = `${R(size)}px ${FONT}`; ctx.textAlign = align;
  ctx.lineWidth = Math.max(2, size * 0.32); ctx.strokeStyle = '#0b0712'; ctx.lineJoin = 'round';
  ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function drawLabels(ctx, view, w, pos, myId, now, W2S) {
  const { s, u } = view, m = w.match;
  ctx.textBaseline = 'bottom';
  const fs = 6 * u;
  for (const [p, x, y] of pos) {
    const me = p.id === myId, sc = p.scale || 1, chosen = m.chosenId === p.id && !!p.power;
    const lift = p.leap ? Math.sin(Math.PI * Math.min(1, p.leap.t / p.leap.T)) * 34 : 0;
    const [sx, sy0] = W2S(x, y - 25 * sc - (chosen ? 9 : 0) - lift), sy = sy0 - 2 * u;
    const cell = Math.max(2, R((me ? 1.9 : 1.3) * u)), bob = me ? Math.sin(now / 160) * 2 * u : 0;
    drawArrow(ctx, sx, sy + bob, cell, p.color);
    let by = sy - 6 * cell - 4 * u;
    if (!chosen) {
      const st = per.get(p.id), bw = 24 * u, hx = sx - bw / 2;
      ctx.fillStyle = '#0b0712'; ctx.fillRect(hx - u, by - u, bw + 2 * u, 5 * u);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(hx, by, bw * Math.max(0, (st ? st.lag : p.hp) / p.maxHp), 3 * u);
      const k = Math.max(0, p.hp / p.maxHp); ctx.fillStyle = k < 0.3 ? '#ff3b5c' : me ? '#7dff8a' : p.color; ctx.fillRect(hx, by, bw * k, 3 * u);
      if (p.shield > 0) { ctx.fillStyle = '#4dc3ff'; ctx.fillRect(hx, by - 2 * u, bw * Math.min(1, p.shield / CFG.items.shield.amt), u * 1.5); }
      by -= 2 * u;
    }
    text(ctx, me ? `ТЫ·${p.label}` : p.isBot ? p.name : `${p.name}·${p.label}`, sx, by, fs, p.color);
  }
  for (const f of w.fx) {
    const k = f.t / f.ttl;
    if (f.k === 'num') { const [sx, sy] = W2S(f.x, f.y - (1 - k) * 14); ctx.globalAlpha = Math.min(1, k * 2.5) * (f.small ? 0.75 : 1); text(ctx, String(f.v), sx, sy, (f.big ? 11 : f.small ? 5 : 7.5) * u * (k > 0.8 ? 1 + (k - 0.8) * 2.5 : 1), f.c); ctx.globalAlpha = 1; }
    else if ((f.k === 'pickup' && f.label) || f.k === 'empty') { const [sx, sy] = W2S(f.x, f.y - 6 - (1 - k) * 16); ctx.globalAlpha = Math.min(1, k * 2); text(ctx, f.k === 'empty' ? 'ПУСТО!' : f.label, sx, sy, 6.5 * u, f.c); ctx.globalAlpha = 1; }
    else if (f.k === 'point') { const [sx, sy] = W2S(f.x, f.y - (1 - k) * 22); ctx.globalAlpha = Math.min(1, k * 2.5); text(ctx, f.v, sx, sy, 12 * u * (k > 0.85 ? 1 + (k - 0.85) * 4 : 1), '#ffd23f'); ctx.globalAlpha = 1; }
  }
  ctx.textBaseline = 'middle';
  for (const pk of w.pickups || []) {
    if (pk.k !== 'item' || (pk.life < 3 && Math.floor(now / 120) % 2)) continue;
    const [sx, sy] = W2S(pk.x, pk.y - 9 + Math.sin(now / 250 + pk.x) * 2);
    ctx.font = `${R(7 * s)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(CFG.items[pk.w].icon, sx, sy + s * 0.5);
  }
}

function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function panel(ctx, x, y, w, h, r, fill, stroke) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawHud(ctx, view, w, myId, now, art, P, W2S, cx, cy) {
  const { cw, ch, u } = view, m = w.match, PW = CFG.powers;
  if (m.phase === 'lobby') return;
  ctx.textBaseline = 'middle';
  const me = w.players.find(p => p.id === myId), c = w.players.find(p => p.id === m.chosenId);
  // гонка за очками короны
  const list = [...w.players].sort((a, b) => b.pts - a.pts), n = list.length, chipW = 46 * u, gap = 4 * u, total = n * chipW + (n - 1) * gap, x0 = cw / 2 - total / 2;
  list.forEach((p, i) => {
    const x = x0 + i * (chipW + gap), mine = p.id === myId, isC = p.id === m.chosenId;
    panel(ctx, x, 5 * u, chipW, 17 * u, 5 * u, mine ? 'rgba(255,255,255,0.22)' : 'rgba(11,7,18,0.7)', isC ? '#ffd23f' : 'rgba(255,255,255,0.12)');
    ctx.fillStyle = p.color; ctx.fillRect(x + 4 * u, 9 * u, 8 * u, 8 * u);
    text(ctx, `${p.pts}`, x + chipW - 6 * u, 14 * u, 9 * u, isC ? '#ffd23f' : '#ffffff', 'right');
    if (isC) { ctx.font = `${R(8 * u)}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('👑', x + 20 * u, 14 * u); }
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 3 * u, 19.5 * u, chipW - 6 * u, 1.5 * u); ctx.fillStyle = p.color; ctx.fillRect(x + 3 * u, 19.5 * u, (chipW - 6 * u) * Math.min(1, p.pts / m.target), 1.5 * u);
  });
  const tLeft = m.phase === 'play' ? m.timer : m.phase === 'countdown' ? CFG.match.time : 0, urgent = m.phase === 'play' && m.timer < 20;
  text(ctx, `до ${m.target}  ·  ${fmt(tLeft)}`, cw / 2, 28 * u, 6.5 * u, urgent ? '#ff6b7a' : '#d9d4e8');
  // полоса Избранного
  if (c && PW[c.power]) {
    const pw = PW[c.power], bw = Math.min(cw * 0.34, 230 * u), x = cw / 2 - bw / 2, y = 35 * u, st = per.get(c.id);
    ctx.fillStyle = 'rgba(11,7,18,0.85)'; ctx.fillRect(x - 2 * u, y - 2 * u, bw + 4 * u, 10 * u);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, bw * Math.max(0, (st ? st.lag : c.hp) / c.maxHp), 6 * u);
    ctx.fillStyle = pw.color; ctx.fillRect(x, y, bw * Math.max(0, c.hp / c.maxHp), 6 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x, y, bw * Math.max(0, c.hp / c.maxHp), 2 * u);
    text(ctx, `${pw.icon} ${c.name}${c.id === myId ? ' (ТЫ)' : ''} · ${pw.name.toUpperCase()}`, cw / 2, y + 13 * u, 6 * u, pw.color);
    const uk = (c.ult || 0) / CFG.chosen.ultMax;
    if (c.id === myId) { ctx.fillStyle = 'rgba(11,7,18,0.85)'; ctx.fillRect(x, y + 18 * u, bw, 3 * u); ctx.fillStyle = uk >= 1 && Math.floor(now / 150) % 2 ? '#ffffff' : '#ffd23f'; ctx.fillRect(x, y + 18 * u, bw * uk, 3 * u); if (uk >= 1) text(ctx, `💥 УЛЬТА ГОТОВА: ${pw.ultName.toUpperCase()}`, cw / 2, y + 27 * u, 6 * u, '#ffd23f'); }
  }
  // мини-карта
  const mm = 1.35 * u, mw = MW * mm, mh = MH * mm, mx = cw - mw - 10 * u - (view.safeR || 0), my = 50 * u;
  panel(ctx, mx - 3 * u, my - 3 * u, mw + 6 * u, mh + 6 * u, 4 * u, 'rgba(11,7,18,0.6)', 'rgba(255,255,255,0.15)');
  ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 0.9; ctx.drawImage(art.mini, mx, my, mw, mh); ctx.globalAlpha = 1;
  const k2 = mm / TILE;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(mx + cx * k2, my + cy * k2, VW * k2, VH * k2);
  for (const pk of w.pickups || []) if (pk.k === 'weapon') { ctx.fillStyle = '#ffd23f'; ctx.fillRect(mx + pk.x * k2 - u * 0.7, my + pk.y * k2 - u * 0.7, u * 1.4, u * 1.4); }
  for (const e of P) { const p = e.p; if (p.dead > 0 || (p.invisT > 0 && p.id !== myId)) continue; const isC = p.id === m.chosenId, r = (isC ? 3.2 : 2.2) * u; ctx.fillStyle = isC ? '#ffd23f' : '#0b0712'; ctx.beginPath(); ctx.arc(mx + e.x * k2, my + e.y * k2, r + u, 0, 6.3); ctx.fill(); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(mx + e.x * k2, my + e.y * k2, r, 0, 6.3); ctx.fill(); if (p.id === myId) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = u; ctx.stroke(); } }
  // стрелки на тех, кто за экраном
  const offArrow = (e, color, icon) => {
    const [sx, sy] = W2S(e.x, e.y - 8); if (sx > 20 * u && sx < cw - 20 * u && sy > 20 * u && sy < ch - 20 * u) return;
    const a = Math.atan2(sy - ch / 2, sx - cw / 2), rx = cw / 2 - 30 * u, ry = ch / 2 - 62 * u, k = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
    const ax = cw / 2 + Math.cos(a) * k; let ay = ch / 2 + Math.sin(a) * k; const pul = 1 + 0.12 * Math.sin(now / 150);
    if (ax > mx - 16 * u && ay < my + mh + 18 * u) ay = my + mh + 18 * u; // не залезать на мини-карту
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.scale(pul, pul);
    ctx.fillStyle = '#0b0712'; ctx.beginPath(); ctx.moveTo(13 * u, 0); ctx.lineTo(-7 * u, -10 * u); ctx.lineTo(-7 * u, 10 * u); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(10 * u, 0); ctx.lineTo(-5 * u, -7 * u); ctx.lineTo(-5 * u, 7 * u); ctx.closePath(); ctx.fill(); ctx.restore();
    if (icon) { ctx.font = `${R(9 * u)}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(icon, ax - Math.cos(a) * 16 * u, ay - Math.sin(a) * 16 * u); }
  };
  if (me && m.phase !== 'end') {
    const cE = P.find(e => e.p.id === m.chosenId);
    if (m.chosenId !== myId) { if (cE && cE.p.dead <= 0) offArrow(cE, '#ffd23f', '👑'); }
    else for (const e of P) if (e.p !== me && e.p.dead <= 0 && !(e.p.invisT > 0)) offArrow(e, e.p.color, null);
    if (m.chosenId !== myId && !me.weapon && me.dead <= 0) { let best = null, bd = 1e9; for (const pk of w.pickups || []) if (pk.k === 'weapon') { const d = Math.hypot(pk.x - me.x, pk.y - me.y); if (d < bd) { bd = d; best = pk; } } if (best) offArrow(best, '#ffffff', '🔫'); }
  }
  // лента
  let fy = my + mh + 12 * u;
  for (const e of m.feed || []) {
    const age = w.time - e.t; if (age > 5) continue;
    ctx.globalAlpha = Math.min(1, (5 - age) * 2);
    const right = cw - 10 * u - (view.safeR || 0); ctx.font = `${R(5.5 * u)}px ${FONT}`; const bw2 = ctx.measureText(e.b).width;
    text(ctx, e.b, right, fy, 5.5 * u, e.bc, 'right'); text(ctx, e.icon, right - bw2 - 8 * u, fy, 5.5 * u, '#ffffff'); text(ctx, e.a, right - bw2 - 15 * u, fy, 5.5 * u, e.ac, 'right');
    ctx.globalAlpha = 1; fy += 11 * u;
  }
  // моё состояние
  if (me && m.phase === 'play' && me.dead <= 0) {
    const by = ch - 12 * u;
    if (m.chosenId !== myId) {
      const Wp = me.weapon && CFG.weapons[me.weapon];
      if (Wp) text(ctx, `${Wp.icon} ${Wp.name.toUpperCase()} ${me.ammo}`, cw / 2, by, 7 * u, me.ammo <= Wp.ammo * 0.25 ? '#ff6b7a' : '#ffd23f');
      else { ctx.globalAlpha = 0.7 + 0.3 * Math.sin(now / 200); text(ctx, 'НЕТ ОРУЖИЯ — БЕГИ ПО СТРЕЛКЕ 🔫', cw / 2, by, 6.5 * u, '#ffffff'); ctx.globalAlpha = 1; }
      if (me.hp / me.maxHp < 0.3) { ctx.fillStyle = `rgba(255,30,60,${0.1 + 0.07 * Math.sin(now / 120)})`; ctx.fillRect(0, 0, cw, ch); }
    } else text(ctx, 'ТЫ ИЗБРАННЫЙ: ВЫБИВАЙ ОХОТНИКОВ, ЗА КАЖДОГО +1 👑', cw / 2, by, 6 * u, '#ffd23f');
  }
  if (me && me.dead > 0 && m.phase === 'play') text(ctx, `ВОЗРОЖДЕНИЕ ${Math.ceil(me.dead)}`, cw / 2, ch * 0.42, 10 * u, '#ffffff');
  if (me && me.frozenT > 0) text(ctx, 'ЗАМОРОЖЕН!', cw / 2, ch * 0.62, 8 * u, '#8ee8ff');
  if (me && me.stunT > 0) text(ctx, 'ОГЛУШЁН!', cw / 2, ch * 0.62, 8 * u, '#5cf2ff');
  if (m.phase === 'countdown') { const nn = Math.ceil(m.timer), f = m.timer - Math.floor(m.timer); text(ctx, String(nn), cw / 2, ch * 0.5, (26 + f * 16) * u, '#ffd23f'); }
  if (m.phase === 'play' && m.timer > CFG.match.time - 0.8) text(ctx, 'БОЙ!', cw / 2, ch * 0.5, (28 + (m.timer - CFG.match.time + 0.8) * 28) * u, '#ffffff');
  if (m.banner) {
    const b = m.banner, pr = 1 - b.t / b.ttl, a = Math.min(1, b.t / 0.35, pr / 0.08), sc = pr < 0.12 ? 1.5 - pr * 4.2 : 1, y = ch * 0.28;
    ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#0b0712'; ctx.fillRect(0, y - 19 * u, cw, 38 * u); ctx.globalAlpha = a;
    ctx.fillStyle = b.color; ctx.fillRect(0, y - 19 * u, cw, 2 * u); ctx.fillRect(0, y + 17 * u, cw, 2 * u);
    text(ctx, b.text, cw / 2, y - 4 * u, 14 * u * sc, b.color); if (b.sub) text(ctx, b.sub, cw / 2, y + 9 * u, 6 * u, '#ffffff');
    ctx.globalAlpha = 1;
  }
  if (m.msgT > 0 && m.msg) { const warn = m.msg.startsWith('⚠'); ctx.globalAlpha = Math.min(1, m.msgT * 3) * (warn ? 0.6 + 0.4 * Math.sin(now / 70) : 1); text(ctx, m.msg, cw / 2, ch * 0.72, 8 * u, warn ? '#ff3b5c' : '#ffd23f'); ctx.globalAlpha = 1; }
}
