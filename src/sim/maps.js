// Карты вида сверху: сетка тайлов 64×40, генерируется детерминированно (одинаково у хоста и клиентов)
import { CFG } from '../config.js';

export const T = { DEEP: 0, SHALLOW: 1, GROUND: 2, ALT: 3, BLOCK: 4 };
const { MW, MH, TILE } = CFG;
export const WORLD_W = MW * TILE, WORLD_H = MH * TILE;

function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function noiseGrid(r, gw, gh) { const g = []; for (let i = 0; i < gw * gh; i++) g.push(r()); return (x, y) => {
  const fx = Math.max(0, Math.min(gw - 1.001, x / MW * (gw - 1))), fy = Math.max(0, Math.min(gh - 1.001, y / MH * (gh - 1)));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}; }

const cache = [];
export function getMap(i) {
  if (cache[i]) return cache[i];
  const def = CFG.maps[i], r = rng(101 + i * 977), noise = noiseGrid(r, 12, 8);
  const tiles = new Uint8Array(MW * MH), objects = [];
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < MW && y < MH) tiles[y * MW + x] = v; };
  const get = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? T.DEEP : tiles[y * MW + x];
  const blob = (cx, cy, rx, ry, v, rough = 0.35, only = null) => {
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (noise(x, y) - 0.5) * rough * 2;
      if (d < 1 && (only === null || only.includes(get(x, y)))) set(x, y, v);
    }
  };
  const rect = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v); };
  const id = def.id;
  if (id === 'meadow') {
    blob(32, 20, 26, 15, T.GROUND); blob(12, 12, 7, 5, T.GROUND); blob(52, 29, 7, 5, T.GROUND);
    blob(40, 15, 4, 2.6, T.SHALLOW, 0.2); // пруд
    for (let x = 10; x < 54; x++) { const y = Math.round(21 + Math.sin(x * 0.35) * 3); if (get(x, y) === T.GROUND) set(x, y, T.ALT); if (get(x, y + 1) === T.GROUND) set(x, y + 1, T.ALT); }
  } else if (id === 'volcano') {
    blob(32, 20, 27, 16, T.GROUND); blob(32, 20, 9, 5.5, T.DEEP, 0.25); blob(14, 28, 4, 2.5, T.DEEP, 0.2); blob(50, 11, 4, 2.5, T.DEEP, 0.2);
    for (let i = 0; i < 12; i++) { const x = Math.floor(8 + r() * 48), y = Math.floor(5 + r() * 30); if (get(x, y) === T.GROUND) blob(x, y, 3.4, 2.4, T.ALT, 0.9, [T.GROUND]); }
  } else if (id === 'ice') {
    blob(32, 20, 26, 15, T.GROUND); blob(10, 28, 6, 4, T.GROUND); blob(54, 12, 6, 4, T.GROUND);
    blob(32, 20, 11, 6.5, T.ALT, 0.3, [T.GROUND]); blob(16, 13, 4, 3, T.ALT, 0.3, [T.GROUND]); blob(48, 28, 4, 3, T.ALT, 0.3, [T.GROUND]);
  } else if (id === 'mushroom') {
    blob(18, 20, 15, 13, T.GROUND); blob(46, 20, 15, 13, T.GROUND);
    rect(28, 13, 36, 27, T.SHALLOW); blob(32, 15, 3, 2, T.GROUND, 0.2); blob(32, 25, 3, 2, T.GROUND, 0.2); blob(32, 20, 2.5, 1.6, T.GROUND, 0.1);
    for (let i = 0; i < 10; i++) { const x = Math.floor(5 + r() * 54), y = Math.floor(8 + r() * 24); if (get(x, y) === T.GROUND) blob(x, y, 3.6, 2.5, T.ALT, 0.9, [T.GROUND]); }
  } else if (id === 'temple') {
    rect(16, 10, 47, 29, T.GROUND); rect(8, 16, 15, 23, T.GROUND); rect(48, 16, 55, 23, T.GROUND); rect(27, 5, 36, 9, T.GROUND); rect(27, 30, 36, 34, T.GROUND);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (get(x, y) === T.GROUND && (x + y) % 2 === 0) set(x, y, T.ALT);
    rect(30, 18, 33, 21, T.DEEP); // провал в центре
  } else if (id === 'neon') {
    rect(6, 8, 22, 31, T.GROUND); rect(26, 12, 38, 27, T.GROUND); rect(42, 8, 58, 31, T.GROUND);
    rect(23, 14, 25, 16, T.GROUND); rect(23, 23, 25, 25, T.GROUND); rect(39, 14, 41, 16, T.GROUND); rect(39, 23, 41, 25, T.GROUND);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (get(x, y) === T.GROUND && (x % 4 === 0 || y % 4 === 0)) set(x, y, T.ALT);
  }
  // мелководье вокруг суши (кроме храма и крыш — там сразу обрыв)
  if (id !== 'temple' && id !== 'neon') {
    const add = [];
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (get(x, y) === T.DEEP)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = get(x + dx, y + dy); if (t === T.GROUND || t === T.ALT) { add.push([x, y]); break; } }
    for (const [x, y] of add) set(x, y, T.SHALLOW);
  }
  // препятствия
  const kinds = { meadow: ['tree', 'tree', 'tree', 'rock', 'bush'], volcano: ['rock', 'spike', 'deadtree', 'rock'], ice: ['pine', 'pine', 'crystal', 'rock'],
    mushroom: ['shroom', 'shroom', 'shroom', 'log'], temple: ['pillar', 'pillar', 'statue', 'brazier'], neon: ['vent', 'crate', 'sign', 'antenna'] }[id];
  const count = { meadow: 38, volcano: 34, ice: 36, mushroom: 36, temple: 0, neon: 30 }[id];
  const inner = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = get(x + dx, y + dy); if (t !== T.GROUND && t !== T.ALT) return false; } return true; };
  const place = (x, y, k) => { set(x, y, T.BLOCK); objects.push({ k, tx: x, ty: y }); };
  if (id === 'temple') {
    for (let x = 19; x <= 44; x += 5) for (const y of [12, 27]) place(x, y, 'pillar');
    for (const y of [16, 23]) { place(18, y, 'pillar'); place(45, y, 'pillar'); }
    for (const [x, y] of [[24, 17], [39, 17], [24, 22], [39, 22]]) place(x, y, 'statue');
    for (const [x, y] of [[10, 19], [53, 20], [31, 7], [32, 32], [28, 15], [35, 24]]) place(x, y, 'brazier');
  }
  for (let i = 0, tries = 0; i < count && tries < 4000; tries++) {
    const x = Math.floor(2 + r() * (MW - 4)), y = Math.floor(2 + r() * (MH - 4));
    if (!inner(x, y) || get(x, y) === T.BLOCK) continue;
    if (objects.some(o => Math.abs(o.tx - x) < 3 && Math.abs(o.ty - y) < 3)) continue;
    place(x, y, kinds[Math.floor(r() * kinds.length)]); i++;
  }
  // точки появления: суша, вдали от края и друг от друга
  const spawns = [];
  for (let tries = 0; spawns.length < 12 && tries < 6000; tries++) {
    const x = Math.floor(3 + r() * (MW - 6)), y = Math.floor(3 + r() * (MH - 6));
    if (!inner(x, y) || get(x, y) === T.BLOCK || !inner(x + 1, y) || !inner(x - 1, y) || !inner(x, y + 1) || !inner(x, y - 1)) continue;
    if (spawns.some(s => Math.hypot(s[0] / TILE - x, s[1] / TILE - y) < 9)) continue;
    spawns.push([x * TILE + 8, y * TILE + 10]);
  }
  const ground = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (inner(x, y) && get(x, y) !== T.BLOCK) ground.push([x * TILE + 8, y * TILE + 10]);
  const m = { idx: i, id, def, tiles, objects, spawns, ground, hot: id === 'volcano', ice: id === 'ice', noShallow: id === 'temple' || id === 'neon' };
  cache[i] = m; return m;
}

export function tileAt(m, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  return (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? T.DEEP : m.tiles[ty * MW + tx];
}
export const walkable = t => t === T.GROUND || t === T.ALT || t === T.SHALLOW;
const hitBlock = (m, x, y, r, walls) => {
  for (const [ox, oy] of [[-r, -r * 0.6], [r, -r * 0.6], [-r, r * 0.6], [r, r * 0.6]]) if (tileAt(m, x + ox, y - 2 + oy) === T.BLOCK) return true;
  if (walls) for (const wl of walls) if (Math.hypot(wl.x - x, wl.y - (y - 2)) < wl.r + r) return true;
  return false;
};
// движение круга с остановкой о препятствия (по осям — скольжение вдоль стен)
export function moveCircle(m, p, dx, dy, r = CFG.bodyR, walls = null) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  for (let i = 0; i < steps; i++) {
    const nx = p.x + dx / steps; if (!hitBlock(m, nx, p.y, r, walls)) p.x = nx;
    const ny = p.y + dy / steps; if (!hitBlock(m, p.x, ny, r, walls)) p.y = ny;
  }
  p.x = Math.max(4, Math.min(WORLD_W - 4, p.x)); p.y = Math.max(8, Math.min(WORLD_H - 4, p.y));
}
// ближайшая к цели безопасная точка на отрезке от (fx,fy) к (tx,ty)
export function safePoint(m, fx, fy, tx, ty) {
  for (let k = 1; k >= 0; k -= 0.06) {
    const x = fx + (tx - fx) * k, y = fy + (ty - fy) * k, t = tileAt(m, x, y);
    if ((t === T.GROUND || t === T.ALT) && !hitBlock(m, x, y, CFG.bodyR, null)) return [x, y];
  }
  return [fx, fy];
}
// поле расстояний (BFS) до точки — навигация ботов
const flows = new Map();
export function flowTo(m, x, y, time) {
  const tx = Math.max(0, Math.min(MW - 1, Math.floor(x / TILE))), ty = Math.max(0, Math.min(MH - 1, Math.floor(y / TILE))), key = m.idx * 10000 + ty * MW + tx;
  const c = flows.get(key);
  if (c && time - c.t < 0.6 && time >= c.t) return c.d;
  const d = new Int16Array(MW * MH).fill(-1), q = [ty * MW + tx]; d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], cx = cur % MW, cy = (cur - cx) / MW;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const ni = ny * MW + nx, t = m.tiles[ni];
      if (d[ni] >= 0 || !(t === T.GROUND || t === T.ALT || (t === T.SHALLOW && !m.hot))) continue;
      d[ni] = d[cur] + (t === T.SHALLOW ? 3 : 1); q.push(ni);
    }
  }
  if (flows.size > 40) flows.clear();
  flows.set(key, { d, t: time }); return d;
}
