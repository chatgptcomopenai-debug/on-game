// Отрисовка карты вида сверху в один большой слой: земля, берега, обрывы, декор, тени объектов.
import { CFG } from '../config.js';
import { T, getMap, WORLD_W, WORLD_H } from '../sim/maps.js';
import { mk, objSprite, shade } from './sprites.js';

const { TILE, MW, MH } = CFG;
const R = Math.round;
const px = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(R(x), R(y), R(w), R(h)); };

export const THEMES = {
  meadow:   { ground: '#6cc24a', sa: '#5aad3e', sb: '#86d85f', alt: '#cdb07a', altS: '#b89a66', sand: '#ecdca4', shallow: '#7ed4ec', shallowS: '#a8e6f6', cliff: '#8a5a2b', cliffD: '#6b411f', cliffH: 7,
              deep: '#2f86c9', deepHi: '#7fc4f0', bg: 'water', mini: '#7fd45c', ambient: 'leaf' },
  volcano:  { ground: '#4d4456', sa: '#3f3747', sb: '#5d5367', alt: '#332c3b', altS: '#27212e', shallow: '#b8401a', shallowS: '#ff9a3a', cliff: '#2a2430', cliffD: '#1a151e', cliffH: 7,
              deep: '#ff6a1f', deepHi: '#ffd36b', bg: 'lava', mini: '#7a6f88', ambient: 'ember', tint: 'rgba(255,90,40,0.06)' },
  ice:      { ground: '#eef5ff', sa: '#dbe8f8', sb: '#ffffff', alt: '#a8d8f5', altS: '#d6f0ff', shallow: '#8fd0ee', shallowS: '#c4ecff', cliff: '#7d93b8', cliffD: '#5d7396', cliffH: 7,
              deep: '#1f4a8a', deepHi: '#6fa8e8', bg: 'water', mini: '#e4eefc', ambient: 'snow', tint: 'rgba(60,90,180,0.07)' },
  mushroom: { ground: '#7a55b8', sa: '#6947a3', sb: '#916dd2', alt: '#4fae7a', altS: '#3d9466', shallow: '#3f7f78', shallowS: '#5fb0a0', cliff: '#3e2f5e', cliffD: '#2a1f44', cliffH: 7,
              deep: '#1d3a44', deepHi: '#5fd0b8', bg: 'water', mini: '#9a78d8', ambient: 'firefly', tint: 'rgba(80,20,120,0.07)' },
  temple:   { ground: '#f1e8d4', sa: '#e6dcc4', sb: '#fbf5e6', alt: '#e2d5b8', altS: '#d3c4a2', shallow: '#f1e8d4', shallowS: '#fff', cliff: '#c2ab82', cliffD: '#a08a62', cliffH: 10, gold: '#ffcf3a',
              deep: '#8ec2f2', deepHi: '#ffffff', bg: 'clouds', mini: '#f1e8d4', ambient: 'petal' },
  neon:     { ground: '#2c2844', sa: '#262239', sb: '#35304f', alt: '#2c2844', altS: '#35304f', shallow: '#2c2844', shallowS: '#fff', cliff: '#17131f', cliffD: '#0d0a14', cliffH: 12,
              deep: '#0a0714', deepHi: '#ff2a6d', bg: 'city', mini: '#5a5578', ambient: 'rain' },
};

const arts = [];
export function buildMapArt(i) {
  if (arts[i]) return arts[i];
  const map = getMap(i), th = THEMES[map.id], id = map.id;
  const [ground, g] = mk(WORLD_W, WORLD_H), [glow, gg] = mk(WORLD_W, WORLD_H), [mini, mg] = mk(MW, MH);
  let seed = 31 + i * 131; const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const at = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? T.DEEP : map.tiles[y * MW + x];
  const land = t => t === T.GROUND || t === T.ALT || t === T.BLOCK;
  // 1) заливка тайлов
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = at(x, y), X = x * TILE, Y = y * TILE;
    if (t === T.SHALLOW) {
      px(g, th.shallow, X, Y, TILE, TILE);
      for (let k = 0; k < 2; k++) px(g, th.shallowS, X + rand() * 12, Y + 2 + rand() * 12, 3 + rand() * 3, 1);
      if (id === 'volcano') { for (let k = 0; k < 3; k++) { const cx = X + rand() * 13, cy = Y + rand() * 13; px(g, '#ffb347', cx, cy, 2, 1); px(gg, '#ff7a1a', cx - 1, cy - 1, 4, 3); } gg.globalAlpha = 0.25; px(gg, '#ff5a1f', X, Y, TILE, TILE); gg.globalAlpha = 1; }
      px(mg, shade(th.mini, 0.7), x, y, 1, 1);
    } else if (land(t)) {
      const beach = (id === 'meadow' || id === 'mushroom') && t !== T.ALT && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === T.SHALLOW);
      const alt = t === T.ALT || (t === T.BLOCK && id === 'temple' && (x + y) % 2 === 0);
      const base = beach ? (th.sand || shade(th.ground, 0.8)) : alt ? th.alt : th.ground;
      px(g, base, X, Y, TILE, TILE);
      if (id === 'temple') { px(g, alt ? th.altS : th.sa, X, Y + 15, TILE, 1); px(g, alt ? th.altS : th.sa, X + 15, Y, 1, TILE); px(g, '#ffffff', X, Y, TILE, 1); }
      else if (id === 'neon') {
        px(g, th.sa, X, Y + 15, TILE, 1); px(g, th.sa, X + 15, Y, 1, TILE);
        if (t === T.ALT) { const c = (x + y) % 8 < 4 ? '#5cf2ff' : '#ff2a6d'; gg.globalAlpha = 0.45; if (x % 4 === 0) { px(g, c, X + 7, Y, 2, TILE); px(gg, c, X + 7, Y, 2, TILE); } if (y % 4 === 0) { px(g, c, X, Y + 7, TILE, 2); px(gg, c, X, Y + 7, TILE, 2); } gg.globalAlpha = 1; }
      } else {
        const sa = beach ? shade(base, 0.92) : alt ? th.altS : th.sa, sb = beach ? shade(base, 1.15) : alt ? shade(th.alt, 1.12) : th.sb;
        for (let k = 0; k < 5; k++) px(g, k % 2 ? sa : sb, X + rand() * 14, Y + rand() * 14, 1 + (rand() < 0.4 ? 1 : 0), 1 + (rand() < 0.3 ? 1 : 0));
        if (!alt && !beach && t !== T.BLOCK) {
          if (id === 'meadow') { if (rand() < 0.35) { const tx = X + 2 + rand() * 11, ty = Y + 3 + rand() * 10; px(g, th.sb, tx, ty, 1, 3); px(g, th.sb, tx + 2, ty + 1, 1, 2); } if (rand() < 0.07) { const fc = ['#ff6b9a', '#ffe14d', '#ffffff', '#b28dff'][R(rand() * 3)], fx = X + 3 + rand() * 9, fy = Y + 3 + rand() * 9; px(g, fc, fx - 1, fy, 3, 1); px(g, fc, fx, fy - 1, 1, 3); px(g, '#ffcf3a', fx, fy, 1, 1); } }
          if (id === 'mushroom' && rand() < 0.09) { const fx = X + 3 + rand() * 9, fy = Y + 4 + rand() * 8; px(g, '#efe7f5', fx, fy, 1, 3); px(g, '#7dffcf', fx - 1, fy - 1, 3, 2); px(gg, '#7dffcf', fx - 2, fy - 2, 5, 4); }
          if (id === 'volcano' && rand() < 0.06) { let cx = X + 2 + rand() * 10, cy = Y + 2; for (let k = 0; k < 6; k++) { px(g, '#ff7a1a', cx, cy, 1, 1); px(gg, '#ff7a1a', cx - 1, cy - 1, 3, 3); cx += rand() < 0.5 ? 1 : -1; cy += 2; } }
          if (id === 'ice' && rand() < 0.2) px(g, '#ffffff', X + rand() * 12, Y + rand() * 12, 2, 2);
        }
        if (alt && id === 'ice') { for (let k = 0; k < 2; k++) { const sx = X + rand() * 10, sy = Y + rand() * 10; for (let j = 0; j < 4; j++) px(g, '#ffffff', sx + j, sy + j, 1, 1); } }
      }
      px(mg, alt ? shade(th.mini, 0.88) : th.mini, x, y, 1, 1);
    }
  }
  // 2) края: обрывы вниз, блики сверху, пена на мелководье
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = at(x, y), X = x * TILE, Y = y * TILE;
    if (land(t)) {
      const s = at(x, y + 1), n = at(x, y - 1), wv = at(x - 1, y), e = at(x + 1, y);
      if (s === T.DEEP) {
        px(g, th.cliff, X, Y + TILE, TILE, th.cliffH); px(g, th.cliffD, X, Y + TILE + th.cliffH - 2, TILE, 2); px(g, shade(th.cliff, 1.2), X, Y + TILE, TILE, 1);
        for (let k = 0; k < 3; k++) px(g, th.cliffD, X + 2 + k * 5 + (x % 2), Y + TILE + 2, 1, th.cliffH - 4);
        if (th.gold) { px(g, th.gold, X, Y + TILE, TILE, 2); px(gg, th.gold, X, Y + TILE - 1, TILE, 4); }
        if (id === 'neon') { const c = x % 3 ? '#ffd36b' : '#5cf2ff'; if ((x * 7 + y) % 3) { px(g, c, X + 4, Y + TILE + 4, 3, 4); px(g, c, X + 10, Y + TILE + 4, 3, 4); px(gg, c, X + 3, Y + TILE + 3, 11, 6); } }
        px(g, '#1b1424', X, Y + TILE + th.cliffH, TILE, 1);
      } else if (s === T.SHALLOW) px(g, shade(th.shallow, 0.8), X, Y + TILE, TILE, 2);
      if (!land(n)) { px(g, shade(th.ground, 1.18), X, Y, TILE, 1); if (n === T.DEEP) px(g, '#1b1424', X, Y - 1, TILE, 1); }
      if (!land(wv)) { px(g, shade(th.ground, 0.85), X, Y, 1, TILE); if (wv === T.DEEP) px(g, '#1b1424', X - 1, Y, 1, TILE); }
      if (!land(e)) { px(g, shade(th.ground, 0.85), X + 15, Y, 1, TILE); if (e === T.DEEP) px(g, '#1b1424', X + TILE, Y, 1, TILE + (s === T.DEEP ? th.cliffH : 0)); }
    } else if (t === T.SHALLOW) {
      g.globalAlpha = 0.75;
      if (at(x, y + 1) === T.DEEP) px(g, '#ffffff', X, Y + 14, TILE, 2);
      if (at(x, y - 1) === T.DEEP) px(g, '#ffffff', X, Y, TILE, 2);
      if (at(x - 1, y) === T.DEEP) px(g, '#ffffff', X, Y, 2, TILE);
      if (at(x + 1, y) === T.DEEP) px(g, '#ffffff', X + 14, Y, 2, TILE);
      g.globalAlpha = 1;
      if (id === 'volcano') { gg.globalAlpha = 0.5; px(gg, '#ff7a1a', X, Y, TILE, TILE); gg.globalAlpha = 1; }
    }
  }
  // 2б) скругление углов берега: срезаем внешние углы суши и мелководья
  const cls = t => land(t) ? 2 : t === T.SHALLOW ? 1 : 0;
  const CUT = [[0, 0, 5], [0, 1, 3], [0, 2, 2], [0, 3, 1], [0, 4, 1]]; // [строка, _, ширина] ступеньками
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const c0 = cls(at(x, y)); if (!c0) continue;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const a1 = cls(at(x + sx, y)), a2 = cls(at(x, y + sy));
      if (c0 === 1 && a1 === 2 && a2 === 2) { // внутренний угол пруда/берега: закругляем сушей
        const X = x * TILE, Y = y * TILE, col = th.sand || th.ground;
        CUT.forEach(([, i, wd]) => px(g, col, sx < 0 ? X : X + TILE - wd, sy < 0 ? Y + i : Y + TILE - 1 - i, wd, 1));
        continue;
      }
      if (a1 >= c0 || a2 >= c0) continue;
      const low = Math.min(a1, a2), X = x * TILE, Y = y * TILE;
      CUT.forEach(([, i, wd]) => {
        const px0 = sx < 0 ? X : X + TILE - wd, py0 = sy < 0 ? Y + i : Y + TILE - 1 - i;
        if (low === 0) { g.clearRect(px0, py0, wd, 1); gg.clearRect(px0, py0, wd, 1); if (sy > 0 && c0 === 2) g.clearRect(px0, py0 + 1, wd, th.cliffH + 1); }
        else px(g, th.shallow, px0, py0, wd, 1);
      });
    }
  }
  // 3) объекты и их тени
  const objects = map.objects.map((o, n) => {
    const spr = objSprite(o.k, n % 3), bx = o.tx * TILE + 8, by = o.ty * TILE + 13;
    g.globalAlpha = 0.28; g.fillStyle = '#000';
    g.beginPath(); g.ellipse(bx, by, spr.w * 0.36, 4, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    return { spr, x: bx, y: by, k: o.k, tall: spr.h > 26 };
  }).sort((a, b) => a.y - b.y);
  return (arts[i] = { map, th, ground, glow, mini, objects });
}
