// Фоны шести карт: небо и дальний план (параллакс), острова (статичный слой), движущиеся платформы,
// анимация (вода/лава/облака/бездна, водопад, сияние, неон)
import { CFG } from '../config.js';

const { W, H } = CFG;
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = Math.round;
const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
export function px(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(R(x), R(y), R(w), R(h)); }
export function disc(g, cx, cy, r, c) {
  g.fillStyle = c;
  for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(R(cx - w), R(cy + dy), w * 2 + 1, 1); }
}
function lerpC(a, b, k) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  return 'rgb(' + [16, 8, 0].map(s => Math.round(((A >> s) & 255) * (1 - k) + ((B >> s) & 255) * k)).join(',') + ')';
}
function shadeHex(c, k) { const n = parseInt(c.slice(1), 16); return 'rgb(' + [16, 8, 0].map(s => Math.min(255, Math.round(((n >> s) & 255) * k))).join(',') + ')'; }
function skyGrad(g, stops, y0, y1, w = W) {
  const n = stops.length - 1;
  for (let y = y0; y < y1; y++) {
    const k = (y - y0) / (y1 - y0) * n, i = Math.min(n - 1, Math.floor(k)), f = k - i;
    const q = Math.floor(f * 6) / 6, q2 = Math.min(1, q + 1 / 6), frac = f * 6 - Math.floor(f * 6);
    for (let x = 0; x < w; x += 2) { g.fillStyle = lerpC(stops[i], stops[i + 1], ((x / 2 + y) % 4) / 4 < frac ? q2 : q); g.fillRect(x, y, 2, 1); }
  }
}

export const THEMES = {
  meadow: { sky: ['#2f6fd0', '#5d9ee8', '#9fd0f7', '#dff3ff'], far: ['#a9c8ec', '#8db4e2', '#6f9bd4'], seaY: 344, sea: 'water',
    seaC: '#2a7ab8', sea2: '#1d5c94', seaHi: '#8fd3ff', top: '#5fd35a', top2: '#3ea84a', top3: '#2b7d38',
    dirt: ['#8f5b2c', '#7c4d25', '#6b411f', '#5a361a'], rock: '#8a909e', rockHi: '#b4bac6', ambient: 'leaf', body: 'island', plat: 'rock' },
  volcano: { sky: ['#14051c', '#3d0f2e', '#8c2a35', '#ff7a3d'], far: ['#4a1a2c', '#33101f', '#220a15'], seaY: 348, sea: 'lava',
    seaC: '#ff5a1f', sea2: '#c42f10', seaHi: '#ffd36b', top: '#4b4250', top2: '#37303d', top3: '#2a2430',
    dirt: ['#2f2733', '#28212c', '#211b25', '#1a151e'], rock: '#4c4354', rockHi: '#6a6075', crack: '#ff7a1a', tint: 'rgba(255,90,40,0.07)', ambient: 'ember', body: 'island', plat: 'rock' },
  ice: { sky: ['#040820', '#0b1645', '#1c3274', '#3c5ca8'], far: ['#33518f', '#253f78', '#1a2f5f'], seaY: 344, sea: 'water',
    seaC: '#143063', sea2: '#0b1f45', seaHi: '#7fb8ff', top: '#f2f8ff', top2: '#c9def5', top3: '#9cb9de',
    dirt: ['#5d6f93', '#4e5f82', '#415070', '#36435f'], rock: '#7d8fb3', rockHi: '#a9b9d8', tint: 'rgba(40,70,160,0.10)', ambient: 'snow', body: 'island', plat: 'rock' },
  mushroom: { sky: ['#140726', '#2e1250', '#5e2a7e', '#c46aa8'], far: ['#2a1440', '#1f0f30', '#160a22'], seaY: 352, sea: 'water',
    seaC: '#1d3a3a', sea2: '#132828', seaHi: '#7dffcf', top: '#9a6be0', top2: '#7448b8', top3: '#53308c',
    dirt: ['#4a3a5e', '#3e3050', '#332844', '#2a2038'], rock: '#6a5a8a', rockHi: '#9a8abf', tint: 'rgba(80,20,120,0.08)', ambient: 'firefly', body: 'island', plat: 'mushroom' },
  temple: { sky: ['#3a5fc8', '#7fa8ea', '#ffd2a0', '#fff0d8'], far: ['#ffe2c8', '#f5cdb0', '#e8b898'], seaY: 340, sea: 'clouds',
    seaC: '#fff4ea', sea2: '#f6dccb', seaHi: '#ffffff', top: '#f4ecdc', top2: '#ddcfb2', top3: '#c2b08c',
    dirt: ['#d8c49c', '#c9b38a', '#b9a178', '#a68e66'], rock: '#e8dcc0', rockHi: '#fff8e8', gold: '#ffcf3a', ambient: 'petal', body: 'temple', plat: 'marble' },
  neon: { sky: ['#05020f', '#12062a', '#2a0b45', '#5a1468'], far: ['#1a0f30', '#130a26', '#0d061b'], seaY: 352, sea: 'abyss',
    seaC: '#07040f', sea2: '#030208', seaHi: '#ff2a6d', top: '#4a4566', top2: '#35304d', top3: '#262238',
    dirt: ['#1e1a30', '#1a1629', '#161323', '#12101c'], rock: '#3a3550', rockHi: '#5a5578', ambient: 'rain', body: 'roof', plat: 'metal' },
};

function farLayer(g, th, map, w) {
  const baseY = th.seaY;
  if (map.id === 'neon') { // городской силуэт с окнами
    th.far.forEach((c, li) => {
      let x = -10;
      while (x < w) {
        const bw = 18 + R(rand() * 34), bh = 60 + R(rand() * 120) - li * 30, top = baseY - bh;
        px(g, c, x, top, bw, bh + 4);
        for (let wy = top + 4; wy < baseY - 6; wy += 6) for (let wx = x + 3; wx < x + bw - 3; wx += 5) if (rand() < 0.28) px(g, ['#ffd36b', '#5cf2ff', '#ff6bd5'][R(rand() * 2.4)], wx, wy, 2, 2);
        if (rand() < 0.3) px(g, '#ff2a6d', x + bw / 2, top - 6, 1, 6);
        x += bw + R(rand() * 6);
      }
    });
    return;
  }
  if (map.id === 'mushroom') { // силуэт леса и гигантских грибов
    th.far.forEach((c, li) => {
      for (let x = 0; x < w; x++) { const h = 40 + Math.sin(x * 0.05 + li) * 10 + Math.sin(x * 0.13) * 6 - li * 12; px(g, c, x, baseY - h, 1, h + 2); }
      for (let i = 0; i < 5; i++) { const x = rand() * w, hgt = 70 + rand() * 80 - li * 20, r = 16 + rand() * 18; px(g, c, x - 2, baseY - hgt, 5, hgt); disc(g, x, baseY - hgt, R(r), c); px(g, th.sky[0], x - r, baseY - hgt + 1, r * 2 + 1, r + 2); disc(g, x, baseY - hgt, R(r), c); px(g, c, x - r, baseY - hgt, r * 2, 2); }
    });
    return;
  }
  th.far.forEach((c, li) => {
    const ph = [rand() * 9, rand() * 9, rand() * 9], amp = 50 - li * 12, base = baseY - 40 + li * 18;
    g.fillStyle = c;
    for (let x = 0; x < w; x++) {
      const h = Math.sin(x * 0.009 + ph[0]) * amp * 0.6 + Math.sin(x * 0.023 + ph[1]) * amp * 0.3 + Math.abs(Math.sin(x * 0.005 + ph[2])) * amp;
      const top = R(base - h); g.fillRect(x, top, 1, baseY - top + 2);
      if (map.id === 'ice' && li === 0 && rand() < 0.5) px(g, '#c9def5', x, top, 1, 2);
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
  for (let i = 0; i < s.w / 9; i++) {
    const r = depth * (0.3 + rand() * 0.5), k = r / depth, half = (s.w / 2) * (1 - Math.pow(k, 1.5)) - 2;
    const x = R(cx0 + (rand() * 2 - 1) * half), y = R(s.y + 4 + r), len = 4 + R(rand() * 12);
    if (mapId === 'ice') { for (let j = 0; j < len; j++) px(g, j < len / 2 ? '#cfe9ff' : '#9fd0f7', x, y + j, Math.max(1, 2 - (j > len / 2 ? 1 : 0)), 1); }
    else if (mapId === 'volcano') { if (rand() < 0.4) { px(g, '#ff7a1a', x, y, 1, 2); emit.push([x, y, 1, 2, '#ff9a3a']); } }
    else if (mapId === 'mushroom') { if (rand() < 0.5) { px(g, '#7dffcf', x, y, 1, 1); emit.push([x, y, 1, 1, '#7dffcf']); } let xx = x; for (let j = 0; j < len; j++) px(g, '#3a2a4e', xx, y + j, 1, 1); }
    else { let xx = x; for (let j = 0; j < len; j++) { px(g, j % 5 === 4 ? '#4caf50' : '#5a3a1e', xx, y + j, 1, 1); if (rand() < 0.2) xx += rand() < 0.5 ? -1 : 1; } if (rand() < 0.5) px(g, '#6fdc6a', xx - 1, y + len, 3, 2); }
  }
}
function templeBody(g, th, s, emit) {
  // ступенчатое основание из блоков песчаника + золотой бордюр
  for (let r = 0; r < 70; r++) {
    const step = Math.floor(r / 10), inset = step * 12 + (r > 60 ? (r - 60) * 3 : 0);
    const w = s.w - inset * 2; if (w < 10) break;
    const c = th.dirt[step % 4];
    px(g, c, s.x + inset, s.y + 5 + r, w, 1);
    if (r % 10 === 0) px(g, th.dirt[3], s.x + inset, s.y + 5 + r, w, 1);
    for (let x = s.x + inset + ((step % 2) * 9); x < s.x + inset + w; x += 18) px(g, th.dirt[3], x, s.y + 5 + r, 1, 1);
  }
  px(g, th.gold, s.x, s.y + 5, s.w, 2); emit.push([s.x, s.y + 5, s.w, 2, '#ffcf3a']);
}
function roofBody(g, th, s, emit) {
  // здание до самого низа: стены, окна, неоновая вывеска
  px(g, th.dirt[0], s.x, s.y + 4, s.w, H - s.y);
  px(g, th.dirt[2], s.x + s.w - 4, s.y + 4, 4, H - s.y);
  for (let y = s.y + 12; y < H; y += 10) for (let x = s.x + 6; x < s.x + s.w - 8; x += 9) {
    const lit = rand() < 0.35, c = lit ? ['#ffd36b', '#5cf2ff', '#ff6bd5'][R(rand() * 2.4)] : '#0e0b18';
    px(g, c, x, y, 4, 5); if (lit) emit.push([x, y, 4, 5, c]);
  }
  const sx = s.x + 14 + rand() * (s.w - 70), sc = rand() < 0.5 ? '#ff2a6d' : '#5cf2ff';
  px(g, '#0b0712', sx - 2, s.y + 16, 48, 14); px(g, sc, sx, s.y + 18, 44, 1); px(g, sc, sx, s.y + 27, 44, 1);
  for (let i = 0; i < 6; i++) px(g, sc, sx + 3 + i * 7, s.y + 20, 4, 6);
  emit.push([sx - 1, s.y + 17, 46, 12, sc]);
}

function surface(g, th, s, mapId, emit, big) {
  if (th.body === 'roof') {
    px(g, th.top, s.x - 2, s.y, s.w + 4, 3); px(g, th.top2, s.x - 2, s.y + 3, s.w + 4, 2);
    px(g, '#5cf2ff', s.x - 2, s.y + 4, s.w + 4, 1); emit.push([s.x - 2, s.y + 4, s.w + 4, 1, '#5cf2ff']);
    if (big) for (let x = s.x + 10; x < s.x + s.w - 20; x += 46 + R(rand() * 30)) { px(g, '#5b6676', x, s.y - 8, 14, 8); px(g, '#7d8898', x, s.y - 8, 14, 1); px(g, '#3a3550', x + 3, s.y - 6, 8, 4); }
    return;
  }
  if (th.body === 'temple') {
    px(g, th.top, s.x - 2, s.y, s.w + 4, 3); px(g, th.top2, s.x - 2, s.y + 3, s.w + 4, 2);
    for (let x = s.x; x < s.x + s.w; x += 16) px(g, th.top3, x, s.y, 1, 4);
    return;
  }
  px(g, th.top, s.x - 1, s.y, s.w + 2, 2);
  px(g, th.top2, s.x - 1, s.y + 2, s.w + 2, 2);
  px(g, th.top3, s.x, s.y + 4, s.w, 1);
  for (let x = s.x; x < s.x + s.w; x += 2 + R(rand() * 3)) {
    const h = 1 + R(rand() * 2);
    px(g, rand() < 0.5 ? th.top : th.top2, x, s.y - h, 1, h);
    if (big && mapId === 'meadow' && rand() < 0.08) { const fc = ['#ff6b9a', '#ffe14d', '#ffffff', '#b28dff'][R(rand() * 3)]; px(g, '#2b7d38', x, s.y - 3, 1, 3); px(g, fc, x - 1, s.y - 4, 3, 1); px(g, fc, x, s.y - 5, 1, 3); }
    if (big && mapId === 'mushroom' && rand() < 0.06) { px(g, '#d9d0f0', x, s.y - 3, 1, 3); px(g, '#7dffcf', x - 1, s.y - 4, 3, 1); emit.push([x - 1, s.y - 4, 3, 1, '#7dffcf']); }
    if (mapId === 'ice' && rand() < 0.15) px(g, '#ffffff', x, s.y - h - 1, 1, 1);
  }
  px(g, th.top2, s.x - 2, s.y + 1, 2, 3); px(g, th.top2, s.x + s.w, s.y + 1, 2, 3);
  if (mapId === 'ice') for (let x = s.x + 2; x < s.x + s.w - 2; x += 3 + R(rand() * 5)) { const l = 2 + R(rand() * 5); for (let j = 0; j < l; j++) px(g, j > l / 2 ? '#bfe2ff' : '#e8f6ff', x, s.y + 5 + j, j > l * 0.7 ? 1 : 2, 1); }
  if (mapId === 'volcano' && big) for (let i = 0; i < s.w / 30; i++) { const x = s.x + 8 + rand() * (s.w - 16); px(g, '#ff7a1a', x, s.y + 1, 3, 1); emit.push([x, s.y + 1, 3, 1, '#ff9a3a']); }
}

function platform(g, th, p, mapId, emit) {
  if (th.plat === 'mushroom') {
    // шляпка гриба на ножке
    const cx = p.x + p.w / 2, capC = ['#e8436a', '#ff8a3a', '#b84ae8'][R(rand() * 2)];
    px(g, '#e8e0f0', cx - 3, p.y + 5, 6, 40); px(g, '#c8bede', cx + 1, p.y + 5, 2, 40);
    for (let r = 0; r < 8; r++) { const half = p.w / 2 * Math.sqrt(1 - Math.pow(r / 8, 2) * 0.6) + 2; px(g, r < 2 ? shadeHex(capC, 1.25) : capC, cx - half, p.y - 1 + r, half * 2, 1); }
    px(g, shadeHex(capC, 0.6), p.x - 2, p.y + 6, p.w + 4, 1);
    for (let i = 0; i < p.w / 12; i++) { const x = p.x + 4 + rand() * (p.w - 8); disc(g, x, p.y + 2 + R(rand() * 3), 1, '#fff6ea'); }
    return;
  }
  if (th.plat === 'marble') {
    px(g, th.top, p.x - 1, p.y, p.w + 2, 3); px(g, th.top2, p.x, p.y + 3, p.w, 3); px(g, th.gold, p.x, p.y + 6, p.w, 1);
    emit.push([p.x, p.y + 6, p.w, 1, '#ffcf3a']);
    for (let r = 0; r < 6; r++) px(g, th.dirt[1], p.x + 4 + r * 2, p.y + 7 + r, p.w - 8 - r * 4, 1);
    return;
  }
  if (th.plat === 'metal') {
    px(g, '#4a4566', p.x, p.y, p.w, 3); px(g, '#5a5578', p.x, p.y, p.w, 1); px(g, '#262238', p.x, p.y + 3, p.w, 3);
    const c = rand() < 0.5 ? '#ff2a6d' : '#5cf2ff'; px(g, c, p.x, p.y + 6, p.w, 1); emit.push([p.x, p.y + 6, p.w, 1, c]);
    for (let x = p.x + 4; x < p.x + p.w - 2; x += 12) px(g, '#262238', x, p.y + 7, 2, 10);
    return;
  }
  const depth = 9 + R(p.w / 10);
  for (let r = 0; r < depth; r++) { const half = (p.w / 2) * (1 - Math.pow(r / depth, 1.3)), cx = p.x + p.w / 2; if (half < 1) break; px(g, th.dirt[Math.min(3, R(r / depth * 3))], cx - half, p.y + 3 + r, half * 2, 1); }
  surface(g, th, { x: p.x, y: p.y, w: p.w }, mapId, emit, false);
  if (mapId !== 'meadow') { const x = p.x + p.w / 2 + R(rand() * 10 - 5), c = mapId === 'ice' ? '#8ee8ff' : '#ff7a1a'; px(g, c, x, p.y + 6, 2, 3); emit.push([x, p.y + 6, 2, 3, c]); }
}

function tree(g, x, y, mapId, emit) {
  if (mapId === 'meadow') {
    px(g, '#5a361a', x - 1, y - 18, 3, 18); px(g, '#7c4d25', x - 1, y - 18, 1, 18);
    disc(g, x, y - 26, 10, '#2b7d38'); disc(g, x - 5, y - 22, 7, '#2b7d38'); disc(g, x + 6, y - 22, 7, '#2b7d38');
    disc(g, x - 1, y - 28, 7, '#3ea84a'); disc(g, x - 3, y - 31, 3, '#5fd35a');
    for (let i = 0; i < 5; i++) px(g, '#ff5d73', x - 7 + R(rand() * 14), y - 31 + R(rand() * 12), 2, 2);
  } else if (mapId === 'ice') {
    px(g, '#4a2f20', x, y - 6, 2, 6);
    for (let i = 0; i < 5; i++) { const w = 15 - i * 3, yy = y - 7 - i * 5; px(g, '#1f4f45', x + 1 - w / 2, yy, w, 4); px(g, '#f2f8ff', x + 1 - w / 2, yy, w, 1); px(g, '#2d6b5e', x + 1 - w / 2, yy + 1, 2, 3); }
  } else if (mapId === 'mushroom') {
    const c = rand() < 0.5 ? '#e8436a' : '#3ad6b0';
    px(g, '#e8e0f0', x - 2, y - 22, 5, 22); disc(g, x, y - 24, 11, c); px(g, '#1a0b2e', x - 12, y - 24, 25, 12); disc(g, x, y - 24, 11, c); px(g, shadeHex(c, 0.6), x - 11, y - 24, 23, 2);
    for (let i = 0; i < 4; i++) { const sx = x - 7 + R(rand() * 14), sy = y - 32 + R(rand() * 6); disc(g, sx, sy, 1, '#fff6ea'); emit.push([sx - 1, sy - 1, 3, 3, c]); }
  } else if (mapId === 'temple') {
    px(g, '#e8dcc0', x - 4, y - 34, 9, 34); px(g, '#fff8e8', x - 4, y - 34, 2, 34); px(g, '#c2b08c', x + 3, y - 34, 2, 34);
    px(g, '#f4ecdc', x - 6, y - 37, 13, 3); px(g, '#ffcf3a', x - 6, y - 34, 13, 1); emit.push([x - 6, y - 34, 13, 1, '#ffcf3a']);
    if (rand() < 0.5) px(g, '#1a0b2e', x - 4, y - 37, 3, 2);
  } else if (mapId === 'neon') {
    px(g, '#3a3550', x, y - 30, 2, 30); px(g, '#ff2a6d', x - 1, y - 32, 4, 2); emit.push([x - 2, y - 33, 6, 4, '#ff2a6d']);
  } else {
    px(g, '#1d1518', x, y - 18, 2, 18);
    px(g, '#1d1518', x - 5, y - 14, 5, 1); px(g, '#1d1518', x - 6, y - 16, 1, 2); px(g, '#1d1518', x + 2, y - 11, 5, 1); px(g, '#1d1518', x + 6, y - 14, 1, 3);
  }
}

export function buildMap(mapIdx) {
  seed = 11 + mapIdx * 97;
  const map = CFG.maps[mapIdx], th = THEMES[map.id];
  const FW = W + 200;
  const [sky, sg] = mk(), [far, fg] = mk(FW, H), [isl, ig] = mk(), [glw, gg] = mk();
  const emit = [];
  skyGrad(sg, th.sky, 0, th.seaY);
  if (map.id === 'meadow') { disc(gg, 600, 60, 30, 'rgba(255,240,170,0.35)'); disc(sg, 600, 60, 18, '#fff6c8'); disc(sg, 600, 60, 14, '#fffbe6'); }
  if (map.id === 'volcano') { disc(gg, 170, 230, 54, 'rgba(255,90,40,0.35)'); disc(sg, 170, 230, 36, '#ff8a4a'); disc(sg, 170, 230, 31, '#ffb36b'); }
  if (map.id === 'temple') { disc(gg, 384, 250, 70, 'rgba(255,220,150,0.4)'); disc(sg, 384, 250, 40, '#fff0c8'); }
  if (map.id === 'ice' || map.id === 'neon' || map.id === 'mushroom') for (let i = 0; i < 140; i++) px(sg, rand() < 0.2 ? '#ffffff' : '#9fb6e8', R(rand() * W), R(rand() * 220), 1, 1);
  if (map.id === 'ice') { disc(gg, 640, 54, 24, 'rgba(200,220,255,0.3)'); disc(sg, 640, 54, 14, '#e8efff'); disc(sg, 645, 50, 11, th.sky[0]); }
  if (map.id === 'neon') { disc(gg, 120, 60, 26, 'rgba(255,60,140,0.35)'); disc(sg, 120, 60, 16, '#ff6bb0'); for (let y = 50; y < 76; y += 4) px(sg, th.sky[1], 100, y, 40, 1); }
  if (map.id === 'mushroom') { disc(gg, 600, 70, 30, 'rgba(180,255,220,0.25)'); disc(sg, 600, 70, 18, '#d8fff0'); }
  if (map.id === 'meadow' || map.id === 'temple' || map.id === 'volcano') for (let i = 0; i < 8; i++) {
    const x = rand() * W, y = 30 + rand() * 140, c = map.id === 'volcano' ? 'rgba(255,140,90,0.25)' : 'rgba(255,255,255,0.55)';
    for (let j = 0; j < 4; j++) disc(sg, x + j * 10, y + Math.sin(j) * 2, 6 + R(rand() * 4), c);
  }
  farLayer(fg, th, map, FW);
  if (map.id === 'volcano') {
    for (let y = 0; y < 130; y++) { const half = 18 + y * 1.0; px(fg, '#2a0c18', 650 - half, th.seaY - 130 + y, half * 2, 1); }
    px(fg, '#ff7a1a', 640, th.seaY - 131, 20, 2);
    for (let i = 0; i < 7; i++) { const x = 642 + rand() * 16; for (let j = 0; j < 30 + rand() * 40; j++) px(fg, '#ff7a1a', x + Math.sin(j * 0.4) * 2, th.seaY - 130 + j * 1.5, 1, 1); }
  }
  // острова
  for (const s of map.solids) {
    if (th.body === 'temple') templeBody(ig, th, s, emit);
    else if (th.body === 'roof') roofBody(ig, th, s, emit);
    else islandBody(ig, th, s, Math.min(90, s.w * 0.42), map.id, emit);
    surface(ig, th, s, map.id, emit, true);
  }
  // декор
  map.solids.forEach(s => {
    const n = Math.max(1, R(s.w / 160));
    for (let i = 0; i < n + 1; i++) {
      const x = R(s.x + 14 + (s.w - 28) * (n === 0 ? 0.5 : i / n));
      if ((map.pads || []).some(pd => Math.abs(pd.x + pd.w / 2 - x) < 20)) continue;
      tree(ig, x, s.y, map.id, emit);
    }
  });
  for (const p of map.plats) platform(ig, th, p, map.id, emit);
  // батуты-грибы
  for (const pd of map.pads || []) {
    const cx = pd.x + pd.w / 2;
    px(ig, '#e8e0f0', cx - 2, pd.y - 5, 4, 5);
    for (let r = 0; r < 5; r++) px(ig, r < 2 ? '#ff9ee8' : '#ff6bd5', cx - pd.w / 2 - 1 + r * 0.5, pd.y - 9 + r, pd.w + 2 - r, 1);
    disc(ig, cx - 4, pd.y - 7, 1, '#ffffff'); disc(ig, cx + 4, pd.y - 7, 1, '#ffffff');
    emit.push([cx - pd.w / 2, pd.y - 9, pd.w, 5, '#ff6bd5']);
  }
  for (const e of emit) { gg.fillStyle = e[4]; gg.fillRect(R(e[0]) - 1, R(e[1]) - 1, e[2] + 2, e[3] + 2); }
  // движущиеся платформы — отдельные спрайты
  const movers = (map.movers || []).map(mv => {
    const [c, g] = mk(mv.w + 8, 30), [cg, cgg] = mk(mv.w + 8, 30), em = [];
    platform(g, th, { x: 4, y: 4, w: mv.w }, map.id, em);
    px(g, th.gold || '#ffcf3a', 4, 4 + 7, mv.w, 1); em.push([4, 11, mv.w, 1, '#ffcf3a']);
    for (const e of em) { cgg.fillStyle = e[4]; cgg.fillRect(R(e[0]) - 1, R(e[1]) - 1, e[2] + 2, e[3] + 2); }
    return { c, cg };
  });
  // облака-спрайты
  const clouds = [];
  for (let i = 0; i < (map.id === 'meadow' || map.id === 'temple' ? 6 : 3); i++) {
    const [c, g] = mk(70, 26);
    const col = map.id === 'meadow' || map.id === 'temple' ? ['#ffffff', '#e3f1ff'] : map.id === 'volcano' ? ['#5a2a3a', '#46202e'] : map.id === 'neon' ? ['#2a1040', '#200a33'] : ['#2b3f74', '#22335f'];
    for (let j = 0; j < 6; j++) disc(g, 10 + j * 10, 15 - (j % 2) * 3, 6 + (j % 3), col[1]);
    for (let j = 0; j < 6; j++) disc(g, 10 + j * 10, 13 - (j % 2) * 3, 5 + (j % 3), col[0]);
    clouds.push({ c, x: rand() * W, y: 20 + rand() * 150, v: 3 + rand() * 6 });
  }
  return { map, th, sky, far, isl, glw, clouds, movers };
}

export function drawBackground(lg, gl, B, t, camCX) {
  const { th, map } = B;
  lg.drawImage(B.sky, 0, 0);
  gl.drawImage(B.glw, 0, 0);
  if (map.id === 'ice' || map.id === 'mushroom') {
    const cols = map.id === 'ice' ? ['#3dffb0', '#7d5cff', '#3df0ff'] : ['#ff6bd5', '#7d5cff', '#7dffcf'];
    for (let b = 0; b < 3; b++) for (let x = 0; x < W; x += 2) {
      const y = 50 + b * 18 + Math.sin(x * 0.012 + t * 0.4 + b * 2) * 18 + Math.sin(x * 0.04 - t * 0.7) * 5, h = 12 + Math.sin(x * 0.02 + t + b) * 7;
      lg.globalAlpha = 0.09; lg.fillStyle = cols[b]; lg.fillRect(x, R(y), 2, R(h));
      gl.globalAlpha = 0.15; gl.fillStyle = cols[b]; gl.fillRect(x, R(y), 2, R(h));
    }
    lg.globalAlpha = gl.globalAlpha = 1;
  }
  for (let i = 0; i < 14; i++) { const x = (i * 97) % W, y = (i * 53) % 200; if (Math.sin(t * 3 + i * 7) > 0.75 && map.id !== 'meadow' && map.id !== 'temple') px(lg, '#ffffff', x, y, 1, 1); }
  for (const c of B.clouds) { const x = ((c.x + t * c.v) % (W + 80)) - 75; lg.globalAlpha = 0.85; lg.drawImage(c.c, R(x), R(c.y)); }
  lg.globalAlpha = 1;
  // дальний план с параллаксом
  const off = Math.max(-200, Math.min(0, -100 + (camCX - W / 2) * 0.3));
  lg.drawImage(B.far, R(off), 0);
  const sy = th.seaY;
  if (th.sea === 'clouds') {
    px(lg, th.seaC, 0, sy, W, H - sy);
    for (let i = 0; i < 26; i++) { const x = ((i * 53 + t * (6 + (i % 3) * 3)) % (W + 60)) - 30, y = sy + 4 + (i % 4) * 9; disc(lg, x, y, 10 + (i % 3) * 4, i % 2 ? '#ffffff' : th.sea2); }
    px(lg, th.seaHi, 0, sy, W, 2);
  } else if (th.sea === 'abyss') {
    px(lg, th.seaC, 0, sy, W, H - sy);
    for (let i = 0; i < 18; i++) {
      const y = sy + 8 + (i % 5) * 6, x = ((i * 89 + t * (40 + (i % 3) * 25) * (i % 2 ? 1 : -1)) % (W + 40) + W + 40) % (W + 40) - 20, c = i % 2 ? '#ff2a6d' : '#ffd36b';
      px(lg, c, x, y, 6, 1); gl.fillStyle = c; gl.fillRect(R(x) - 1, y - 1, 8, 3);
    }
  } else {
    px(lg, th.seaC, 0, sy, W, H - sy); px(lg, th.sea2, 0, sy + 18, W, H - sy - 18);
    lg.save(); lg.globalAlpha = th.sea === 'lava' ? 0.18 : 0.28;
    for (let y = 0; y < H - sy; y += 2) { const o = R(Math.sin(y * 0.4 + t * 2.5) * (1 + y * 0.05)); lg.drawImage(B.isl, 0, sy - y - 2, W, 2, o, sy + y, W, 2); }
    lg.restore();
    for (let i = 0; i < 34; i++) {
      const y = sy + 2 + (i * 7) % (H - sy - 2), len = 4 + (i % 4) * 3, x = ((i * 67 + t * (8 + (i % 3) * 4) * (i % 2 ? 1 : -1)) % (W + 20) + W + 20) % (W + 20) - 10;
      px(lg, th.seaHi, x, y, len, 1);
      if (th.sea === 'lava') { gl.fillStyle = th.seaHi; gl.fillRect(R(x), y, len, 1); }
    }
    if (th.sea === 'lava') {
      gl.globalAlpha = 0.55; gl.fillStyle = th.seaC; gl.fillRect(0, sy, W, H - sy); gl.globalAlpha = 1;
      for (let i = 0; i < 7; i++) { const k = (t * 0.7 + i * 0.37) % 1, x = (i * 113 + 40) % W; disc(lg, x, sy + 6 + (i % 3) * 10, R(1 + k * 3), k > 0.85 ? th.seaC : th.seaHi); }
    }
    px(lg, th.seaHi, 0, sy, W, 1);
  }
  lg.drawImage(B.isl, 0, 0);
  if (map.id === 'meadow') {
    const s = map.solids[0], x0 = s.x + 20, top = s.y + 6;
    for (let x = 0; x < 10; x++) for (let y = top; y < sy; y++) {
      const v = (((y * 0.6 - t * 90 + x * 13) % 9) + 9) % 9;
      lg.fillStyle = v < 0.8 ? '#ffffff' : v < 4 ? '#7fd0f7' : '#3f9ad8';
      if (y > top + (x % 3)) lg.fillRect(x0 + x, y, 1, 1);
    }
    lg.globalAlpha = 0.6; disc(lg, x0 + 5, sy, 8 + R(Math.sin(t * 6) * 1.5), '#ffffff'); lg.globalAlpha = 1;
  }
}

export function drawMovers(lg, gl, B, plats) {
  let i = 0;
  for (const pl of plats) {
    if (!pl.mover) continue;
    const s = B.movers[i++]; if (!s) continue;
    lg.drawImage(s.c, R(pl.x - 4), R(pl.y - 4)); gl.drawImage(s.cg, R(pl.x - 4), R(pl.y - 4));
  }
}
