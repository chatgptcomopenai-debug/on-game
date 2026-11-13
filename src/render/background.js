// Фоны трёх карт: небо, горы, острова (статичные слои) + анимация (вода/лава, водопад, сияние, облака)
import { CFG } from '../config.js';

const { W, H } = CFG;
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
const R = Math.round;
export function px(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(R(x), R(y), R(w), R(h)); }
export function disc(g, cx, cy, r, c) {
  g.fillStyle = c;
  for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(R(cx - w), R(cy + dy), w * 2 + 1, 1); }
}
function lerpC(a, b, k) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  return 'rgb(' + [16, 8, 0].map(s => Math.round(((A >> s) & 255) * (1 - k) + ((B >> s) & 255) * k)).join(',') + ')';
}
// вертикальный градиент полосами с дизерингом (пиксельный вид)
function skyGrad(g, stops, y0, y1) {
  const n = stops.length - 1;
  for (let y = y0; y < y1; y++) {
    const k = (y - y0) / (y1 - y0) * n, i = Math.min(n - 1, Math.floor(k)), f = k - i;
    const q = Math.floor(f * 6) / 6, q2 = Math.min(1, q + 1 / 6), frac = f * 6 - Math.floor(f * 6);
    for (let x = 0; x < W; x += 2) {
      const dith = ((x / 2 + y) % 4) / 4 < frac;
      g.fillStyle = lerpC(stops[i], stops[i + 1], dith ? q2 : q); g.fillRect(x, y, 2, 1);
    }
  }
}

export const THEMES = {
  meadow: { sky: ['#2f6fd0', '#5d9ee8', '#9fd0f7', '#dff3ff'], mtn: ['#a9c8ec', '#8db4e2', '#6f9bd4'], seaY: 224,
    sea: '#2a7ab8', sea2: '#1d5c94', seaHi: '#8fd3ff', top: '#5fd35a', top2: '#3ea84a', top3: '#2b7d38',
    dirt: ['#8f5b2c', '#7c4d25', '#6b411f', '#5a361a'], rock: '#8a909e', rockHi: '#b4bac6', tint: null, ambient: 'leaf' },
  volcano: { sky: ['#14051c', '#3d0f2e', '#8c2a35', '#ff7a3d'], mtn: ['#4a1a2c', '#33101f', '#220a15'], seaY: 228,
    sea: '#ff5a1f', sea2: '#c42f10', seaHi: '#ffd36b', lava: true, top: '#4b4250', top2: '#37303d', top3: '#2a2430',
    dirt: ['#2f2733', '#28212c', '#211b25', '#1a151e'], rock: '#4c4354', rockHi: '#6a6075', crack: '#ff7a1a', tint: 'rgba(255,90,40,0.07)', ambient: 'ember' },
  ice: { sky: ['#040820', '#0b1645', '#1c3274', '#3c5ca8'], mtn: ['#33518f', '#253f78', '#1a2f5f'], seaY: 224,
    sea: '#143063', sea2: '#0b1f45', seaHi: '#7fb8ff', top: '#f2f8ff', top2: '#c9def5', top3: '#9cb9de',
    dirt: ['#5d6f93', '#4e5f82', '#415070', '#36435f'], rock: '#7d8fb3', rockHi: '#a9b9d8', tint: 'rgba(40,70,160,0.10)', ambient: 'snow' },
};

function mountains(g, cols, baseY, seedv) {
  cols.forEach((c, li) => {
    const ph = [rand() * 9, rand() * 9, rand() * 9], amp = 34 - li * 8, base = baseY - 30 + li * 14;
    g.fillStyle = c;
    for (let x = 0; x < W; x++) {
      const h = Math.sin(x * 0.011 + ph[0]) * amp * 0.6 + Math.sin(x * 0.027 + ph[1]) * amp * 0.3 + Math.abs(Math.sin(x * 0.006 + ph[2])) * amp;
      const top = R(base - h);
      g.fillRect(x, top, 1, baseY - top + 2);
    }
  });
}

function islandBody(g, th, s, depth, mapId, emit) {
  const cx0 = s.x + s.w / 2;
  for (let r = 0; r < depth; r++) {
    const k = r / depth, half = (s.w / 2 + 2) * (1 - Math.pow(k, 1.5)) + Math.sin(r * 0.5 + s.x) * 2;
    if (half < 2) break;
    const cx = cx0 + Math.sin(r * 0.13 + s.x * 0.1) * 3;
    const band = th.dirt[Math.min(3, Math.floor((r + Math.sin(r * 0.7) * 2) / (depth / 4)))];
    px(g, band, cx - half, s.y + 4 + r, half * 2, 1);
    px(g, th.dirt[3], cx + half - 2, s.y + 4 + r, 2, 1);
    px(g, shadeHex(band, 1.15), cx - half, s.y + 4 + r, 1, 1);
  }
  // камни и вкрапления
  for (let i = 0; i < s.w / 6; i++) {
    const r = 6 + rand() * depth * 0.6, k = r / depth, half = (s.w / 2) * (1 - Math.pow(k, 1.5)) - 4;
    if (half < 3) continue;
    const x = cx0 + (rand() * 2 - 1) * half, y = s.y + 4 + r;
    px(g, th.rock, x, y, 3, 2); px(g, th.rockHi, x, y, 2, 1);
  }
  if (th.crack) for (let i = 0; i < s.w / 45; i++) {
    let x = s.x + 10 + rand() * (s.w - 20), y = s.y + 6;
    for (let j = 0; j < 4 + rand() * 6; j++) { px(g, th.crack, x, y, 1, 1); emit.push([x, y, 1, 1, th.crack]); x += rand() < 0.5 ? 1 : -1; y += 1 + R(rand()); }
  }
  // низ: корни / лавовые капли / сосульки
  for (let i = 0; i < s.w / 9; i++) {
    const r = depth * (0.3 + rand() * 0.5), k = r / depth, half = (s.w / 2) * (1 - Math.pow(k, 1.5)) - 2;
    const x = R(cx0 + (rand() * 2 - 1) * half), y = R(s.y + 4 + r), len = 4 + R(rand() * 12);
    if (mapId === 'ice') { for (let j = 0; j < len; j++) px(g, j < len / 2 ? '#cfe9ff' : '#9fd0f7', x, y + j, Math.max(1, 2 - (j > len / 2 ? 1 : 0)), 1); }
    else if (mapId === 'volcano') { if (rand() < 0.4) { px(g, '#ff7a1a', x, y, 1, 2); emit.push([x, y, 1, 2, '#ff9a3a']); } }
    else { let xx = x; for (let j = 0; j < len; j++) { px(g, j % 5 === 4 ? '#4caf50' : '#5a3a1e', xx, y + j, 1, 1); if (rand() < 0.2) xx += rand() < 0.5 ? -1 : 1; } if (rand() < 0.5) px(g, '#6fdc6a', xx - 1, y + len, 3, 2); }
  }
}
function shadeHex(c, k) { const n = parseInt(c.slice(1), 16); return 'rgb(' + [16, 8, 0].map(s => Math.min(255, Math.round(((n >> s) & 255) * k))).join(',') + ')'; }

function surface(g, th, s, mapId, emit, big) {
  px(g, th.top, s.x - 1, s.y, s.w + 2, 2);
  px(g, th.top2, s.x - 1, s.y + 2, s.w + 2, 2);
  px(g, th.top3, s.x, s.y + 4, s.w, 1);
  for (let x = s.x; x < s.x + s.w; x += 2 + R(rand() * 3)) {
    const h = 1 + R(rand() * 2);
    px(g, rand() < 0.5 ? th.top : th.top2, x, s.y - h, 1, h);
    if (big && mapId === 'meadow' && rand() < 0.08) { const fc = ['#ff6b9a', '#ffe14d', '#ffffff', '#b28dff'][R(rand() * 3)]; px(g, '#2b7d38', x, s.y - 3, 1, 3); px(g, fc, x - 1, s.y - 4, 3, 1); px(g, fc, x, s.y - 5, 1, 3); }
    if (mapId === 'ice' && rand() < 0.15) px(g, '#ffffff', x, s.y - h - 1, 1, 1);
  }
  // нависающий край
  px(g, th.top2, s.x - 2, s.y + 1, 2, 3); px(g, th.top2, s.x + s.w, s.y + 1, 2, 3);
  if (mapId === 'ice') for (let x = s.x + 2; x < s.x + s.w - 2; x += 3 + R(rand() * 5)) { const l = 2 + R(rand() * 5); for (let j = 0; j < l; j++) px(g, j > l / 2 ? '#bfe2ff' : '#e8f6ff', x, s.y + 5 + j, j > l * 0.7 ? 1 : 2, 1); }
  if (mapId === 'volcano' && big) for (let i = 0; i < s.w / 30; i++) { const x = s.x + 8 + rand() * (s.w - 16); px(g, '#ff7a1a', x, s.y + 1, 3, 1); emit.push([x, s.y + 1, 3, 1, '#ff9a3a']); }
}

function tree(g, x, y, mapId) {
  if (mapId === 'meadow') {
    px(g, '#5a361a', x - 1, y - 14, 3, 14); px(g, '#7c4d25', x - 1, y - 14, 1, 14);
    disc(g, x, y - 20, 8, '#2b7d38'); disc(g, x - 4, y - 17, 6, '#2b7d38'); disc(g, x + 5, y - 17, 6, '#2b7d38');
    disc(g, x - 1, y - 22, 6, '#3ea84a'); disc(g, x - 3, y - 24, 3, '#5fd35a');
    for (let i = 0; i < 4; i++) px(g, '#ff5d73', x - 6 + R(rand() * 12), y - 24 + R(rand() * 10), 2, 2);
  } else if (mapId === 'ice') {
    px(g, '#4a2f20', x, y - 5, 2, 5);
    for (let i = 0; i < 4; i++) { const w = 12 - i * 3, yy = y - 6 - i * 5; px(g, '#1f4f45', x + 1 - w / 2, yy, w, 4); px(g, '#f2f8ff', x + 1 - w / 2, yy, w, 1); px(g, '#2d6b5e', x + 1 - w / 2, yy + 1, 2, 3); }
  } else {
    px(g, '#1d1518', x, y - 16, 2, 16);
    px(g, '#1d1518', x - 5, y - 13, 5, 1); px(g, '#1d1518', x - 6, y - 15, 1, 2); px(g, '#1d1518', x + 2, y - 10, 5, 1); px(g, '#1d1518', x + 6, y - 13, 1, 3);
  }
}

export function buildMap(mapIdx) {
  seed = 11 + mapIdx * 97;
  const map = CFG.maps[mapIdx], th = THEMES[map.id];
  const [sky, sg] = mk(), [isl, ig] = mk(), [glw, gg] = mk();
  const emit = [];
  skyGrad(sg, th.sky, 0, th.seaY);
  // светила
  if (map.id === 'meadow') { disc(gg, 392, 46, 22, 'rgba(255,240,170,0.35)'); disc(sg, 392, 46, 14, '#fff6c8'); disc(sg, 392, 46, 11, '#fffbe6'); }
  if (map.id === 'volcano') { disc(gg, 110, 150, 40, 'rgba(255,90,40,0.35)'); disc(sg, 110, 150, 28, '#ff8a4a'); disc(sg, 110, 150, 24, '#ffb36b'); }
  if (map.id === 'ice') {
    for (let i = 0; i < 90; i++) { const x = R(rand() * W), y = R(rand() * 150); px(sg, rand() < 0.2 ? '#ffffff' : '#9fb6e8', x, y, 1, 1); }
    disc(gg, 405, 40, 18, 'rgba(200,220,255,0.3)'); disc(sg, 405, 40, 11, '#e8efff'); disc(sg, 409, 37, 9, th.sky[0]);
  }
  // облака на дальнем плане
  if (map.id !== 'ice') for (let i = 0; i < 6; i++) {
    const x = rand() * W, y = 30 + rand() * 90, c = map.id === 'meadow' ? 'rgba(255,255,255,0.55)' : 'rgba(255,140,90,0.25)';
    for (let j = 0; j < 4; j++) disc(sg, x + j * 9, y + Math.sin(j) * 2, 5 + R(rand() * 4), c);
  }
  mountains(sg, th.mtn, th.seaY, mapIdx);
  if (map.id === 'volcano') { // вулкан на горизонте
    for (let y = 0; y < 90; y++) { const half = 14 + y * 0.9; px(sg, '#2a0c18', 360 - half, th.seaY - 90 + y, half * 2, 1); }
    px(sg, '#ff7a1a', 352, th.seaY - 91, 16, 2); disc(gg, 360, th.seaY - 92, 16, 'rgba(255,120,40,0.5)');
    for (let i = 0; i < 6; i++) { const x = 354 + rand() * 12; for (let j = 0; j < 20 + rand() * 25; j++) px(sg, '#ff7a1a', x + Math.sin(j * 0.4) * 2, th.seaY - 90 + j * 1.5, 1, 1); }
  }
  // острова
  for (const s of map.solids) {
    islandBody(ig, th, s, Math.min(78, s.w * 0.42), map.id, emit);
    surface(ig, th, s, map.id, emit, true);
  }
  // декор на земле
  const decoX = map.id === 'meadow' ? [[0.06, 'tree'], [0.94, 'tree'], [0.5, 'rock']] : map.id === 'ice' ? [[0.08, 'tree'], [0.92, 'tree'], [0.25, 'crystal'], [0.75, 'crystal']] : [[0.12, 'tree'], [0.85, 'tree'], [0.4, 'crystal']];
  map.solids.forEach((s, si) => decoX.forEach(([k, kind]) => {
    if (map.solids.length > 1 && ((si === 0 && k > 0.6) || (si === 1 && k < 0.4))) return;
    const x = R(map.solids.length > 1 ? s.x + s.w * (si === 0 ? k * 1.6 : (k - 0.4) * 1.6) : s.x + s.w * k);
    if (kind === 'tree') tree(ig, x, s.y, map.id);
    else if (kind === 'rock') { disc(ig, x, s.y - 2, 4, th.rock); px(ig, th.rockHi, x - 2, s.y - 5, 3, 1); }
    else { const c = map.id === 'ice' ? '#8ee8ff' : '#ff7a1a'; const parts = [[x, s.y - 9, 2, 9], [x - 3, s.y - 5, 2, 5], [x + 3, s.y - 6, 2, 6]]; for (const q of parts) { px(ig, c, ...q); emit.push([...q, c]); } px(ig, '#ffffff', x, s.y - 8, 1, 3); }
  }));
  // парящие платформы
  for (const p of map.plats) {
    const depth = 9 + R(p.w / 10);
    for (let r = 0; r < depth; r++) {
      const half = (p.w / 2) * (1 - Math.pow(r / depth, 1.3)), cx = p.x + p.w / 2;
      if (half < 1) break;
      px(ig, th.dirt[Math.min(3, R(r / depth * 3))], cx - half, p.y + 3 + r, half * 2, 1);
    }
    surface(ig, th, { x: p.x, y: p.y, w: p.w }, map.id, emit, false);
    if (map.id !== 'meadow') { const x = p.x + p.w / 2 + R(rand() * 10 - 5), c = map.id === 'ice' ? '#8ee8ff' : '#ff7a1a'; px(ig, c, x, p.y + 6, 2, 3); emit.push([x, p.y + 6, 2, 3, c]); }
  }
  for (const e of emit) { gg.fillStyle = e[4]; gg.fillRect(R(e[0]) - 1, R(e[1]) - 1, e[2] + 2, e[3] + 2); }
  // облака-спрайты для дрейфа
  const clouds = [];
  for (let i = 0; i < (map.id === 'meadow' ? 5 : 3); i++) {
    const c = document.createElement('canvas'); c.width = 60; c.height = 24; const g = c.getContext('2d');
    const col = map.id === 'meadow' ? ['#ffffff', '#e3f1ff'] : map.id === 'volcano' ? ['#5a2a3a', '#46202e'] : ['#2b3f74', '#22335f'];
    for (let j = 0; j < 5; j++) disc(g, 10 + j * 10, 14 - (j % 2) * 3, 6 + (j % 3), col[1]);
    for (let j = 0; j < 5; j++) disc(g, 10 + j * 10, 12 - (j % 2) * 3, 5 + (j % 3), col[0]);
    clouds.push({ c, x: rand() * W, y: 20 + rand() * 110, v: 3 + rand() * 6 });
  }
  return { map, th, sky, isl, glw, clouds };
}

// анимированная часть фона: облака, сияние, водопад, вода/лава с отражением
export function drawBackground(lg, gl, B, t) {
  const { th, map } = B;
  lg.drawImage(B.sky, 0, 0);
  gl.drawImage(B.glw, 0, 0);
  if (map.id === 'ice') { // северное сияние
    for (let b = 0; b < 3; b++) {
      const col = ['#3dffb0', '#7d5cff', '#3df0ff'][b];
      for (let x = 0; x < W; x += 2) {
        const y = 40 + b * 14 + Math.sin(x * 0.018 + t * 0.4 + b * 2) * 14 + Math.sin(x * 0.05 - t * 0.7) * 4;
        const h = 10 + Math.sin(x * 0.03 + t + b) * 6;
        lg.globalAlpha = 0.10; lg.fillStyle = col; lg.fillRect(x, R(y), 2, R(h));
        gl.globalAlpha = 0.18; gl.fillStyle = col; gl.fillRect(x, R(y), 2, R(h));
      }
    }
    lg.globalAlpha = gl.globalAlpha = 1;
    for (let i = 0; i < 12; i++) { const x = (i * 97) % W, y = (i * 53) % 140; if (Math.sin(t * 3 + i * 7) > 0.7) px(lg, '#ffffff', x, y, 1, 1); }
  }
  for (const c of B.clouds) { const x = ((c.x + t * c.v) % (W + 70)) - 65; lg.globalAlpha = map.id === 'meadow' ? 0.9 : 0.7; lg.drawImage(c.c, R(x), R(c.y)); }
  lg.globalAlpha = 1;
  // море / лава
  const sy = th.seaY;
  px(lg, th.sea, 0, sy, W, H - sy); px(lg, th.sea2, 0, sy + 18, W, H - sy - 18);
  // отражение островов
  lg.save(); lg.globalAlpha = th.lava ? 0.18 : 0.28;
  for (let y = 0; y < H - sy; y += 2) {
    const off = R(Math.sin(y * 0.4 + t * 2.5) * (1 + y * 0.05));
    lg.drawImage(B.isl, 0, sy - y - 2, W, 2, off, sy + y, W, 2);
  }
  lg.restore();
  for (let i = 0; i < 26; i++) {
    const y = sy + 2 + (i * 7) % (H - sy - 2), len = 4 + (i % 4) * 3, x = ((i * 67 + t * (8 + (i % 3) * 4) * (i % 2 ? 1 : -1)) % (W + 20) + W + 20) % (W + 20) - 10;
    px(lg, th.seaHi, x, y, len, 1);
    if (th.lava) { gl.fillStyle = th.seaHi; gl.fillRect(R(x), y, len, 1); }
  }
  if (th.lava) { gl.globalAlpha = 0.55; gl.fillStyle = th.sea; gl.fillRect(0, sy, W, H - sy); gl.globalAlpha = 1;
    for (let i = 0; i < 5; i++) { const k = (t * 0.7 + i * 0.37) % 1, x = (i * 113 + 40) % W; disc(lg, x, sy + 6 + (i % 3) * 10, R(1 + k * 3), k > 0.85 ? th.sea : th.seaHi); } }
  px(lg, th.seaHi, 0, sy, W, 1);
  lg.drawImage(B.isl, 0, 0);
  // водопад (луг)
  if (map.id === 'meadow') {
    const s = map.solids[0], x0 = s.x + 18, top = s.y + 6;
    for (let x = 0; x < 9; x++) for (let y = top; y < sy; y += 1) {
      const v = (((y * 0.6 - t * 90 + x * 13) % 9) + 9) % 9;
      lg.fillStyle = v < 0.8 ? '#ffffff' : v < 4 ? '#7fd0f7' : '#3f9ad8';
      if (y > top + (x % 3)) lg.fillRect(x0 + x, y, 1, 1);
    }
    lg.globalAlpha = 0.6; disc(lg, x0 + 4, sy, 7 + R(Math.sin(t * 6) * 1.5), '#ffffff'); lg.globalAlpha = 1;
  }
}
