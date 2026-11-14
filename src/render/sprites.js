// Пиксельные спрайты: человечки 16×20 в трёх ракурсах (спереди, сзади, сбоку) с шагами,
// 8 героев (палитра + детали), шапки, оружие, объекты карт. Всё рисуется кодом и кэшируется.

const R = Math.round;
export function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
const OUT = '#1b1424';

// ---------- базовый человечек ----------
const F_TOP = [
  '................', '.....oooooo.....', '....ohhhhhho....', '...ohhhhhhhho...', '..ohhhhhhhhhho..', '..ohhsssssshho..',
  '..ohssssssssho..', '..ossessssesso..', '..ossessssesso..', '..osdssssssdso..', '...osssssssso...', '....okkkkkko....',
  '...occcccccco...', '..oCccccccccCo..', '..oCccccccccCo..', '..osccccccccso..', '...oppppppppo...'];
const B_TOP = [
  '................', '.....oooooo.....', '....ohhhhhho....', '...ohhhhhhhho...', '..ohhhhhhhhhho..', '..ohhhhhhhhhho..',
  '..ohhhhhhhhhho..', '..ohhhhhhhhhho..', '..ohHhhhhhhHho..', '..ohhHHHHHHhho..', '...ohhhhhhhho...', '....okkkkkko....',
  '...occckkccco...', '..oCccckkcccCo..', '..oCccccccccCo..', '..osccccccccso..', '...oppppppppo...'];
const S_TOP = [
  '................', '.....oooooo.....', '....ohhhhhho....', '...ohhhhhhhho...', '..ohhhhhhhhhho..', '..ohhhhhhsssso..',
  '..ohhhhhssssso..', '..ohhhhsssesso..', '..ohhhhsssesso..', '..ohhhsssssdso..', '...ohssssssso...', '....okkkkkko....',
  '....occcccco....', '....occCCcco....', '....occCCcco....', '....occsscco....', '....oppppppo....'];
const LEGS_FB = [
  ['...opppoopppo...', '...obbboobbbo...', '....ooo..ooo....'],
  ['...opppoopppo...', '...obbbo.ooo....', '....ooo.........'],
  ['...opppoopppo...', '....ooo.obbbo...', '.........ooo....']];
const LEGS_S = [
  ['.....oppppo.....', '.....obbbbbo....', '.....ooooooo....'],
  ['...oppo..oppo...', '..obbo....obbbo.', '..oooo....ooooo.']];

// герои: палитра и построчные замены (F — спереди, B — сзади, S — сбоку)
const HEROES = {
  brawler: { pal: { h: '#7a4a2a', H: '#5c361d', c: '#efe8d6', C: '#cfc6ae', p: '#3b5b8c', x: '#d9433b' },
    F: { 4: '..oxxxxxxxxxxo..' }, B: { 4: '..oxxxxxxxxxxo..', 5: '..ohhhhhhhhxxo..' }, S: { 4: '..oxxxxxxxxxxo..' } },
  medic: { pal: { h: '#e8c46a', H: '#c9a24a', c: '#f6f6f6', C: '#cfd6de', p: '#6fb0c4', x: '#e53935', w: '#ffffff' },
    F: { 2: '....owwxxwwo....', 3: '...owwwxxwwwo...', 13: '..oCcccxxcccCo..', 14: '..oCccxxxxccCo..' }, B: { 2: '....owwwwwwo....', 3: '...owwwwwwwwo...' }, S: { 2: '....owwwxxwo....', 3: '...owwwwxxwwo...' } },
  knight: { pal: { h: '#aab3bf', H: '#7c8794', c: '#8f9aa8', C: '#6c7684', p: '#5b6472', v: '#1b1424', x: '#d0d6de' },
    F: { 0: '.......kk.......', 1: '.....ookkoo.....', 3: '...ohxxxxxxho...', 5: '..ohhhhhhhhhho..', 6: '..ohhhhhhhhhho..', 7: '..ohvvvvvvvvho..', 8: '..ohhhhvvhhhho..', 9: '..ohhhhhhhhhho..', 10: '...ohhhhhhhho...', 13: '..oCcxxccxxcCo..' },
    B: { 0: '.......kk.......', 1: '.....ookkoo.....', 8: '..ohhhhhhhhhho..', 9: '..ohhhhhhhhhho..', 12: '...occcccccco...', 13: '..oCccccccccCo..' },
    S: { 0: '......kk........', 1: '.....okkooo.....', 5: '..ohhhhhhhhhho..', 6: '..ohhhhhhhhhho..', 7: '..ohhhhhvvvvho..', 8: '..ohhhhhhhvhho..', 9: '..ohhhhhhhhhho..', 10: '...ohhhhhhhho...' } },
  ninja: { pal: { h: '#2c2740', H: '#1f1b30', c: '#2c2740', C: '#1f1b30', p: '#2c2740', x: '#2c2740' },
    F: { 5: '..ohhhhhhhhhho..', 6: '..ohhsssssshho..', 9: '..ohxxxxxxxxho..', 10: '...oxxxxxxxxo...' },
    S: { 5: '..ohhhhhhhhhho..', 6: '..ohhhhhhsssho..', 9: '..ohhhhxxxxxxo..', 10: '...ohxxxxxxxo...' } },
  engineer: { pal: { h: '#7a4a2a', H: '#5c361d', c: '#ff8c3a', C: '#c96a22', p: '#4a5878', y: '#ffcf3a', w: '#f4f4f4' },
    F: { 2: '....oyyyyyyo....', 3: '...oyyyyyyyyo...', 4: '.oyyyyyyyyyyyyo.', 14: '..oCwwwwwwwwCo..' },
    B: { 2: '....oyyyyyyo....', 3: '...oyyyyyyyyo...', 4: '.oyyyyyyyyyyyyo.', 12: '...occcccccco...', 13: '..oCccccccccCo..', 14: '..oCwwwwwwwwCo..' },
    S: { 2: '....oyyyyyyo....', 3: '...oyyyyyyyyo...', 4: '.oyyyyyyyyyyyyo.' } },
  rocket: { pal: { h: '#6b4a2a', H: '#4f3620', c: '#8a6a44', C: '#6b4f30', p: '#4a4a55', x: '#3a3a44', w: '#9fe8ff', q: '#9ea7b3' },
    F: { 5: '..ohxwxhhxwxho..' }, B: { 12: '...occcccccco...', 13: '..oCcqqqqqqcCo..', 14: '..oCcqqqqqqcCo..', 15: '..oscqxxxxqcso..' }, S: { 5: '..ohhhhhhxwxho..', 13: '...qoccCCcco....', 14: '...qoccCCcco....' } },
  ghost: { pal: { s: '#dfe6ff', d: '#b8c2e8', h: '#5d5684', H: '#423c63', c: '#5d5684', C: '#423c63', p: '#423c63' },
    F: { 5: '..ohhhsssshhho..', 6: '..ohhsssssshho..' }, S: { 5: '..ohhhhhhhssho..', 6: '..ohhhhhhsssso..' } },
  robot: { pal: { s: '#a9b4c2', d: '#7d8898', h: '#8d98a8', H: '#6b7686', c: '#7d8898', C: '#5b6676', p: '#5b6676', g: '#5cf2ff' },
    F: { 0: '.......kk.......', 5: '..ohhhhhhhhhho..', 7: '..osggggggggso..', 8: '..osssssssssso..', 9: '..osssssssssso..', 13: '..oCcccggcccCo..' },
    B: { 0: '.......kk.......' }, S: { 0: '.......kk.......', 7: '..ohhhhsggggso..', 8: '..ohhhhsssssso..', 9: '..ohhhsssssdso..' } },
};
const BASE_PAL = { o: OUT, s: '#f3c89b', d: '#d9a074', e: '#1b1424', h: '#7a4a2a', H: '#5c361d', c: '#cccccc', C: '#999999', p: '#3a3556', b: '#2a2233' };

const HATS = { // [x, y, w, h, цвет, свечение] в координатах спрайта (голова: x 2..13, верх y=1)
  none: [],
  cap: [[4, 0, 8, 1, '#e53935'], [3, 1, 10, 3, '#e53935'], [3, 4, 11, 1, '#b71c1c'], [6, 1, 3, 1, '#ff8a80']],
  band: [[2, 4, 12, 1, '#e53935']],
  horns: [[3, 1, 10, 3, '#9ea7b3'], [3, 3, 10, 1, '#6b7380'], [1, 0, 2, 3, '#f1e6c8'], [13, 0, 2, 3, '#f1e6c8'], [0, -1, 1, 2, '#f1e6c8'], [15, -1, 1, 2, '#f1e6c8']],
  wizard: [[2, 4, 12, 1, '#4527a0'], [3, 2, 10, 2, '#5e35b1'], [5, 0, 6, 2, '#5e35b1'], [6, -2, 4, 2, '#5e35b1'], [7, -4, 2, 2, '#5e35b1'], [6, 1, 1, 1, '#ffd54f'], [9, -1, 1, 1, '#ffd54f']],
  cat: [[3, -1, 2, 3, '#3b2b2b'], [11, -1, 2, 3, '#3b2b2b'], [4, 0, 1, 1, '#ff9eb5'], [11, 0, 1, 1, '#ff9eb5']],
  cowboy: [[0, 4, 16, 1, '#8d6e63'], [4, 1, 8, 3, '#a1887f'], [4, 3, 8, 1, '#4e342e']],
  top: [[1, 4, 14, 1, '#212121'], [4, -3, 8, 7, '#2b2b2b'], [4, 2, 8, 1, '#c62828']],
  halo: [[4, -3, 8, 1, '#fff59d', 1], [3, -2, 1, 1, '#fff59d', 1], [12, -2, 1, 1, '#fff59d', 1]],
  pirate: [[2, 1, 12, 3, '#212121'], [7, 2, 2, 1, '#eeeeee']],
  flower: [[10, 1, 3, 3, '#ff80ab'], [11, 2, 1, 1, '#ffeb3b']],
  chef: [[3, 2, 10, 2, '#ffffff'], [2, -2, 12, 4, '#f5f5f5']],
};

const PAD = 6; // запас сверху под шапки
const cache = new Map();
// кадр персонажа: dir 'F'|'B'|'S', frame 0..3. Возвращает { c, g } — спрайт и слой свечения (16×26)
export function charSprite(hero, color, hat, dir, frame) {
  const key = hero + color + hat + dir + frame;
  if (cache.has(key)) return cache.get(key);
  const H = HEROES[hero] || HEROES.brawler;
  const top = (dir === 'F' ? F_TOP : dir === 'B' ? B_TOP : S_TOP).slice();
  const patch = H[dir] || {};
  for (const r in patch) top[+r] = patch[r];
  const legs = dir === 'S' ? LEGS_S[frame % 2] : LEGS_FB[[0, 1, 0, 2][frame % 4]];
  const rows = [...top, ...legs];
  const pal = { ...BASE_PAL, ...H.pal, k: color };
  const [c, g] = mk(16, 20 + PAD), [gc, gg] = mk(16, 20 + PAD);
  rows.forEach((row, y) => { for (let x = 0; x < 16; x++) { const ch = row[x], col = pal[ch]; if (col) { g.fillStyle = col; g.fillRect(x, y + PAD, 1, 1); if (ch === 'g') { gg.fillStyle = col; gg.fillRect(x - 1, y + PAD - 1, 3, 3); } } } });
  const hatDef = HATS[hat] || [];
  if (hatDef.length) {
    g.fillStyle = OUT; for (const q of hatDef) g.fillRect(q[0] - 1, q[1] + PAD - 1, q[2] + 2, q[3] + 2);
    for (const q of hatDef) { g.fillStyle = q[4]; g.fillRect(q[0], q[1] + PAD, q[2], q[3]); if (q[5]) { gg.fillStyle = q[4]; gg.fillRect(q[0] - 1, q[1] + PAD - 1, q[2] + 2, q[3] + 2); } }
  }
  const out = { c, g: gc };
  cache.set(key, out); return out;
}
// силуэт одним цветом (вспышка удара, контур силы Избранного, тень-клон)
const silCache = new Map();
export function silhouette(sprite, color) {
  let m = silCache.get(sprite); if (!m) { m = new Map(); silCache.set(sprite, m); }
  if (m.has(color)) return m.get(color);
  const [c, g] = mk(sprite.width, sprite.height);
  g.drawImage(sprite, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  m.set(color, c); return c;
}
export const SPR_W = 16;
export const SPR_H = 20 + PAD;
export const SPR_PAD = PAD;

// ---------- рисование из прямоугольников с автоконтуром ----------
function outline(c, col = OUT) {
  const g = c.getContext('2d'), w = c.width, h = c.height, im = g.getImageData(0, 0, w, h), d = im.data, add = [];
  const a = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!a(x, y) && (a(x + 1, y) || a(x - 1, y) || a(x, y + 1) || a(x, y - 1))) add.push([x, y]);
  g.fillStyle = col; for (const [x, y] of add) g.fillRect(x, y, 1, 1);
}
function px(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(R(x), R(y), R(w), R(h)); }
function disc(g, cx, cy, r, c) { g.fillStyle = c; for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(R(cx - w), R(cy + dy), w * 2 + 1, 1); } }

// оружие (смотрит вправо, точка хвата — слева по центру)
const GUN_DEF = {
  pistol:  { w: 9, h: 7, r: [[1, 2, 6, 2, '#4a4a58'], [1, 4, 2, 2, '#2f2f3a'], [6, 2, 1, 1, '#8a8a99']] },
  smg:     { w: 12, h: 8, r: [[1, 2, 9, 2, '#4a4a58'], [3, 4, 2, 3, '#2f2f3a'], [0, 3, 2, 2, '#2f2f3a'], [8, 2, 2, 1, '#8a8a99']] },
  shotgun: { w: 14, h: 6, r: [[1, 2, 5, 2, '#7a5230'], [6, 2, 7, 1, '#4a4a58'], [6, 3, 6, 1, '#2f2f3a']] },
  sniper:  { w: 17, h: 8, r: [[1, 3, 14, 2, '#3a4a3a'], [5, 1, 4, 2, '#15151c'], [1, 5, 2, 2, '#2a352a'], [15, 3, 1, 1, '#8a8a99']] },
  grenade: { w: 12, h: 8, r: [[1, 2, 9, 4, '#55663f'], [9, 2, 2, 4, '#2a2a2a'], [3, 6, 2, 1, '#2f2f3a'], [2, 2, 6, 1, '#7a8a5a']] },
  rocket:  { w: 17, h: 8, r: [[1, 2, 13, 4, '#5a7542'], [13, 2, 3, 4, '#ff5722'], [1, 2, 12, 1, '#7c9a5e'], [5, 6, 2, 1, '#2f2f3a']] },
  laser:   { w: 12, h: 7, r: [[1, 2, 9, 2, '#d5dde2'], [9, 2, 2, 2, '#5cf2ff', 1], [3, 4, 2, 2, '#90a4ae'], [2, 2, 5, 1, '#ffffff']] },
};
const gunCache = {};
export function gunSprite(kind) {
  if (gunCache[kind]) return gunCache[kind];
  const D = GUN_DEF[kind] || GUN_DEF.pistol, [c, g] = mk(D.w, D.h), [gc, gg] = mk(D.w, D.h);
  for (const q of D.r) { px(g, q[4], q[0], q[1], q[2], q[3]); if (q[5]) px(gg, q[4], q[0] - 1, q[1] - 1, q[2] + 2, q[3] + 2); }
  outline(c);
  return (gunCache[kind] = { c, g: gc, w: D.w, h: D.h });
}

// объекты карт: возвращает { c, g, ax, ay } — холст, свечение, якорь (основание)
const objCache = {};
export function objSprite(k, variant = 0) {
  const key = k + variant; if (objCache[key]) return objCache[key];
  let w = 16, h = 16, ax = 8, ay = 14, draw = () => {}, glow = null;
  const v = variant;
  if (k === 'tree') { w = 30; h = 38; ax = 15; ay = 35; draw = g => { px(g, '#6b4423', 13, 24, 4, 11); px(g, '#8a5a30', 13, 24, 1, 11); disc(g, 15, 15, 11, '#2f8a3c'); disc(g, 9, 19, 7, '#2f8a3c'); disc(g, 21, 19, 7, '#2f8a3c'); disc(g, 14, 12, 8, '#45ab4a'); disc(g, 11, 9, 4, '#62c95a'); for (let i = 0; i < 5; i++) px(g, v % 2 ? '#ff6b7a' : '#ffd23f', 6 + (i * 7 + v * 3) % 18, 8 + (i * 5) % 14, 2, 2); }; }
  else if (k === 'bush') { w = 18; h = 14; ax = 9; ay = 12; draw = g => { disc(g, 6, 8, 4, '#2f8a3c'); disc(g, 11, 7, 5, '#3a9c44'); disc(g, 9, 5, 3, '#62c95a'); px(g, '#ff6b7a', 5, 6, 1, 1); px(g, '#ff6b7a', 12, 8, 1, 1); }; }
  else if (k === 'rock') { w = 18; h = 14; ax = 9; ay = 12; draw = g => { disc(g, 8, 8, 5, '#8a8f9c'); disc(g, 11, 9, 4, '#757a88'); px(g, '#b4bac6', 5, 4, 5, 2); px(g, '#5f6470', 6, 11, 8, 1); }; }
  else if (k === 'deadtree') { w = 22; h = 30; ax = 11; ay = 28; draw = g => { px(g, '#2a2025', 10, 8, 3, 20); px(g, '#2a2025', 4, 12, 7, 2); px(g, '#2a2025', 3, 8, 2, 5); px(g, '#2a2025', 12, 16, 7, 2); px(g, '#2a2025', 18, 11, 2, 6); px(g, '#2a2025', 9, 3, 2, 6); px(g, '#3d3038', 10, 8, 1, 20); }; }
  else if (k === 'spike') { w = 16; h = 24; ax = 8; ay = 22; draw = (g, gg) => { for (let i = 0; i < 16; i++) px(g, i % 3 ? '#2a2233' : '#3d3350', 8 - i * 0.3, 4 + i, 1 + i * 0.6, 1); px(g, '#6a5a8a', 7, 6, 1, 8); px(g, '#ff7a1a', 4, 20, 8, 2); px(gg, '#ff7a1a', 3, 19, 10, 4); }; glow = true; }
  else if (k === 'pine') { w = 24; h = 38; ax = 12; ay = 35; draw = g => { px(g, '#5a3a22', 11, 29, 3, 6); for (let i = 0; i < 5; i++) { const ww = 6 + i * 4, y = 4 + i * 5; px(g, '#1f5a4c', 12 - ww / 2, y, ww, 6); px(g, '#2d7a66', 12 - ww / 2, y + 1, 2, 4); px(g, '#f4f9ff', 12 - ww / 2, y, ww, 2); } px(g, '#f4f9ff', 11, 2, 2, 3); }; }
  else if (k === 'crystal') { w = 16; h = 22; ax = 8; ay = 20; draw = (g, gg) => { const c = v % 2 ? '#c77dff' : '#8ee8ff'; px(g, c, 6, 3, 4, 17); px(g, c, 2, 10, 3, 10); px(g, c, 11, 8, 3, 12); px(g, '#ffffff', 7, 4, 1, 10); px(g, shade(c, 0.7), 9, 5, 1, 15); px(gg, c, 1, 2, 14, 19); }; glow = true; }
  else if (k === 'shroom') { w = 30; h = 34; ax = 15; ay = 32; draw = (g, gg) => { const c = ['#e8436a', '#3ad6b0', '#ff8a3a'][v % 3]; px(g, '#efe7f5', 12, 14, 6, 18); px(g, '#cfc3de', 16, 14, 2, 18); for (let r = 0; r < 12; r++) { const half = 13 * Math.sqrt(1 - Math.pow(r / 12, 2)); px(g, r > 8 ? shade(c, 1.25) : c, 15 - half, 14 - r, half * 2, 1); } px(g, shade(c, 0.6), 2, 14, 26, 2); for (const [x, y] of [[8, 8], [15, 5], [21, 9], [12, 11], [19, 12]]) { disc(g, x, y, 1, '#fff6ea'); px(gg, c, x - 2, y - 2, 5, 5); } }; glow = true; }
  else if (k === 'log') { w = 22; h = 12; ax = 11; ay = 10; draw = g => { px(g, '#6b4423', 2, 3, 18, 6); px(g, '#8a5a30', 2, 3, 18, 2); disc(g, 19, 6, 3, '#c9a06a'); disc(g, 19, 6, 1, '#8a5a30'); px(g, '#4fae7a', 5, 2, 6, 2); }; }
  else if (k === 'pillar') { w = 16; h = 38; ax = 8; ay = 35; draw = (g, gg) => { px(g, '#efe6d2', 4, 5, 8, 28); px(g, '#ffffff', 4, 5, 2, 28); px(g, '#c9b896', 10, 5, 2, 28); px(g, '#efe6d2', 2, 2, 12, 4); px(g, '#efe6d2', 2, 32, 12, 3); px(g, '#ffcf3a', 2, 6, 12, 1); px(gg, '#ffcf3a', 2, 5, 12, 3); if (v % 3 === 0) px(g, '#c9b896', 3, 2, 4, 2); }; glow = true; }
  else if (k === 'statue') { w = 16; h = 30; ax = 8; ay = 28; draw = g => { px(g, '#cfc3a8', 2, 22, 12, 6); px(g, '#e0d6bd', 2, 22, 12, 2); px(g, '#b8ab8c', 5, 10, 6, 12); disc(g, 8, 6, 4, '#b8ab8c'); px(g, '#d6caa9', 5, 10, 2, 12); px(g, '#b8ab8c', 2, 12, 3, 2); px(g, '#b8ab8c', 11, 12, 3, 2); }; }
  else if (k === 'brazier') { w = 14; h = 20; ax = 7; ay = 18; draw = (g, gg) => { px(g, '#6b5a3a', 5, 10, 4, 8); px(g, '#8a7648', 2, 8, 10, 3); px(g, '#ff7a1a', 4, 3, 6, 5); px(g, '#ffd23f', 5, 4, 4, 4); px(g, '#fff3b0', 6, 5, 2, 3); disc(gg, 7, 5, 6, '#ff9a3a'); }; glow = true; }
  else if (k === 'vent') { w = 18; h = 16; ax = 9; ay = 14; draw = g => { px(g, '#5b6676', 1, 3, 16, 11); px(g, '#7d8898', 1, 3, 16, 2); px(g, '#3a4250', 4, 7, 10, 5); for (let i = 0; i < 4; i++) px(g, '#5b6676', 5 + i * 2.5, 7, 1, 5); }; }
  else if (k === 'crate') { w = 16; h = 16; ax = 8; ay = 14; draw = g => { px(g, '#4a4566', 1, 2, 14, 12); px(g, '#6a6590', 1, 2, 14, 2); px(g, '#34304f', 1, 7, 14, 1); px(g, '#34304f', 7, 2, 1, 12); }; }
  else if (k === 'sign') { w = 26; h = 30; ax = 13; ay = 28; draw = (g, gg) => { const c = v % 2 ? '#ff2a6d' : '#5cf2ff'; px(g, '#3a3550', 12, 14, 2, 14); px(g, '#15121f', 2, 2, 22, 13); px(g, c, 3, 3, 20, 1); px(g, c, 3, 13, 20, 1); for (let i = 0; i < 5; i++) px(g, c, 5 + i * 4, 6, 2, 5); px(gg, c, 1, 1, 24, 15); }; glow = true; }
  else if (k === 'antenna') { w = 10; h = 34; ax = 5; ay = 32; draw = (g, gg) => { px(g, '#5a5578', 4, 4, 2, 28); px(g, '#5a5578', 1, 12, 8, 1); px(g, '#5a5578', 2, 20, 6, 1); px(g, '#ff2a6d', 3, 1, 4, 3); disc(gg, 5, 2, 4, '#ff2a6d'); }; glow = true; }
  const [c, g] = mk(w, h), [gc, gg] = mk(w, h);
  draw(g, gg); outline(c);
  return (objCache[key] = { c, g: glow ? gc : null, ax, ay, w, h });
}

// корона Избранного
let crown = null;
export function crownSprite() {
  if (crown) return crown;
  const [c, g] = mk(11, 8);
  px(g, '#ffd23f', 1, 4, 9, 3); px(g, '#ffd23f', 1, 2, 1, 2); px(g, '#ffd23f', 5, 1, 1, 3); px(g, '#ffd23f', 9, 2, 1, 2); px(g, '#fff3b0', 2, 4, 7, 1); px(g, '#ff3b5c', 5, 5, 1, 1); px(g, '#5cf2ff', 2, 5, 1, 1); px(g, '#5cf2ff', 8, 5, 1, 1);
  outline(c);
  return (crown = c);
}
