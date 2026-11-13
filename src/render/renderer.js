// Рендер: мир в низком разрешении (пиксель-арт) → масштаб; метки, стрелки и HUD — в полном разрешении
import { CFG } from '../config.js';
import { getSprite } from './sprites.js';

const { W, H } = CFG;
const low = document.createElement('canvas'); low.width = W; low.height = H;
const lg = low.getContext('2d'); lg.imageSmoothingEnabled = false;
let bg = null;
const px = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

function buildBackground() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  ['#2b3a67', '#33497b', '#3b5a8f', '#4a6ca4', '#5a7fb8', '#6c91c7', '#7fa3d6', '#93b5e0', '#a6c4e8']
    .forEach((c, i) => px(g, c, 0, i * 24, W, 24));
  px(g, '#c4daf0', 0, 205, W, 20);
  const cloud = (x, y, s) => { px(g, '#e8f1fb', x, y, 26 * s, 6 * s); px(g, '#e8f1fb', x + 5 * s, y - 4 * s, 14 * s, 4 * s); px(g, '#cfe0f2', x, y + 5 * s, 26 * s, s); };
  cloud(20, 30, 1.2); cloud(360, 22, 1.5); cloud(200, 40, 0.9); cloud(420, 90, 0.8); cloud(40, 110, 0.7);
  // дальние острова
  px(g, '#8aa9cf', 10, 200, 40, 5); px(g, '#8aa9cf', 420, 198, 50, 7);
  px(g, '#2a6f97', 0, 222, W, 48); px(g, '#22597a', 0, 245, W, 25);
  for (let i = 0; i < 30; i++) px(g, '#5fa8d3', (i * 37) % W, 226 + (i * 7) % 40, 6, 1);
  const G = CFG.platforms[0];
  // тело острова: сужается книзу, слои земли и камня
  for (let r = 0; r < 52; r++) {
    const inset = Math.floor(r * r / 14) + (r > 0 ? 2 : 0);
    const w = G.w - inset * 2; if (w <= 4) break;
    const c = r < 4 ? '#5d3a1a' : r % 7 < 3 ? '#8d5a2b' : r > 30 ? '#6e6e78' : '#7a4c24';
    px(g, c, G.x + inset, G.y + 5 + r, w, 1);
  }
  for (let i = 0; i < 40; i++) px(g, i % 3 ? '#6b3f1d' : '#9b9ba6', G.x + 20 + (i * 53) % (G.w - 40), G.y + 9 + (i * 7) % 26, 3, 2);
  px(g, '#4caf50', G.x, G.y, G.w, 3); px(g, '#2e7d32', G.x, G.y + 3, G.w, 2);
  for (let i = 0; i < 50; i++) px(g, '#7cd47f', G.x + (i * 23) % G.w, G.y - 1, 2, 1);
  // деревья и камни для красоты
  const tree = x => { px(g, '#6b3f1d', x, G.y - 14, 3, 14); px(g, '#2e7d32', x - 6, G.y - 26, 15, 13); px(g, '#4caf50', x - 4, G.y - 28, 11, 6); };
  tree(44); tree(432);
  px(g, '#9e9e9e', 190, G.y - 4, 8, 4); px(g, '#cfcfcf', 191, G.y - 4, 5, 1);
  for (const p of CFG.platforms.slice(1)) {
    px(g, '#7a4c24', p.x, p.y, p.w, p.h + 2); px(g, '#4caf50', p.x, p.y, p.w, 2);
    px(g, '#5d3a1a', p.x + 3, p.y + p.h + 2, p.w - 6, 2); px(g, '#5d3a1a', p.x + 8, p.y + p.h + 4, p.w - 16, 1);
  }
  return cv;
}

function frameOf(p) {
  if (!p.onGround) return 'jump';
  if (Math.abs(p.vx) > 10) return Math.floor(p.animT * 8) % 2 ? 'walkA' : 'walkB';
  return 'stand';
}

function ring(g, x, y, r, c, a, fill) {
  g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = 1.5;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  if (fill) { g.globalAlpha = a * 0.25; g.fillStyle = c; g.fill(); }
  g.globalAlpha = 1;
}

// пиксельная стрелка вниз
const ARROW = ['..###..', '..###..', '..###..', '#######', '.#####.', '..###..', '...#...'];
function drawArrow(ctx, cx, by, cell, color) {
  const w = 7 * cell, x0 = cx - w / 2, y0 = by - 7 * cell;
  ctx.fillStyle = '#000';
  ARROW.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') ctx.fillRect(x0 + x * cell - cell * 0.5, y0 + y * cell - cell * 0.5, cell * 2, cell * 2); }));
  ctx.fillStyle = color;
  ARROW.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') ctx.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.5, cell + 0.5); }));
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillRect(x0 + 2 * cell, y0, cell, cell * 3);
}

export function render(ctx, view, w, alpha, myId) {
  if (!bg) bg = buildBackground();
  const t = w.time, m = w.match, P = CFG.powers;
  lg.drawImage(bg, 0, 0);
  for (let i = 0; i < 8; i++) px(lg, '#8cc8ea', ((i * 61 + t * 12) % (W + 10)) - 5, 230 + i * 4, 5, 1);
  // стены льда
  for (const wl of w.walls) { lg.globalAlpha = 0.85; px(lg, '#8ee8ff', wl.x, wl.y, wl.w, wl.h); px(lg, '#e0fbff', wl.x + 1, wl.y, 2, wl.h); lg.globalAlpha = 1; }
  const pos = [];
  for (const p of w.players) {
    if (p.dead > 0) continue;
    const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha;
    pos.push([p, x, y]);
    const sc = p.scale || 1, chosen = m.chosenId === p.id;
    lg.globalAlpha = 0.3; px(lg, '#000', x - 5 * sc, y, 10 * sc, 1); lg.globalAlpha = 1;
    if (chosen && P[p.power]) { // аура силы
      const c = P[p.power].color, pulse = 0.25 + 0.15 * Math.sin(t * 8);
      lg.globalAlpha = pulse; lg.fillStyle = c;
      lg.beginPath(); lg.ellipse(x, y - 9 * sc, 9 * sc, 12 * sc, 0, 0, Math.PI * 2); lg.fill(); lg.globalAlpha = 1;
    }
    if (p.inv > 0 && Math.floor(t * 12) % 2) continue;
    const spr = getSprite(p.color, frameOf(p), p.attackT > 0.1);
    lg.save(); lg.translate(Math.round(x), Math.round(y - 18 * sc));
    if (p.facing < 0) lg.scale(-1, 1);
    lg.drawImage(spr, Math.round(-6 * sc), 0, Math.round(12 * sc), Math.round(18 * sc));
    lg.restore();
    if (p.slowT > 0) { lg.globalAlpha = 0.4; px(lg, '#8ee8ff', x - 6 * sc, y - 18 * sc, 12 * sc, 18 * sc); lg.globalAlpha = 1; }
    if (chosen) { // корона
      const cx = Math.round(x), cy = Math.round(y - 18 * sc - 4);
      lg.save(); lg.translate(cx, cy); lg.scale(sc / 1.5, sc / 1.5); lg.translate(-cx, -cy);
      px(lg, '#ffd23f', cx - 4, cy + 1, 9, 3); px(lg, '#ffd23f', cx - 4, cy - 1, 1, 2); px(lg, '#ffd23f', cx, cy - 2, 1, 3); px(lg, '#ffd23f', cx + 4, cy - 1, 1, 2);
      px(lg, '#ff4d4d', cx, cy + 2, 1, 1); lg.restore();
    }
    if (p.slam) ring(lg, x, p.y - 6, P.giant.bR, P.giant.color, 0.5 + 0.3 * Math.sin(t * 30), true);
  }
  // телеграфы
  for (const te of w.teles) {
    const o = w.players.find(q => q.id === te.owner); if (!o) continue;
    const k = 1 - te.t / te.ttl, a = 0.35 + 0.5 * k;
    if (te.k === 'ring') ring(lg, o.x, o.y - 10, te.r, te.c, a, true);
    else {
      const g = P.giant, rx = o.facing > 0 ? o.x + 4 : o.x - 4 - g.aW;
      lg.globalAlpha = a * 0.4; px(lg, te.c, rx, o.y - g.aH, g.aW, g.aH);
      lg.globalAlpha = a; lg.strokeStyle = te.c; lg.strokeRect(rx + 0.5, o.y - g.aH + 0.5, g.aW - 1, g.aH - 1); lg.globalAlpha = 1;
    }
  }
  // снаряды
  for (const pr of w.projs) {
    const x = pr.x - pr.vx * (1 - alpha) / CFG.TICK, y = pr.y - pr.vy * (1 - alpha) / CFG.TICK;
    if (pr.kind === 'fire') { px(lg, '#ff7a1a', x - 3, y - 3, 7, 7); px(lg, '#ffe83a', x - 1, y - 1, 3, 3); px(lg, '#ff4d00', x - 3 - Math.sign(pr.vx) * 4, y - 1, 3, 3); }
    else if (pr.kind === 'ice') { px(lg, '#8ee8ff', x - 3, y - 1, 6, 3); px(lg, '#fff', x - 1, y, 2, 1); }
    else { px(lg, '#fff', x - 1, y - 1, 3, 3); px(lg, pr.c, x - 1 - Math.sign(pr.vx) * 3, y, 3, 1); }
  }
  // эффекты
  for (const f of w.fx) {
    const k = f.t / f.ttl;
    if (f.k === 'ring') ring(lg, f.x, f.y, f.r * (1.1 - k * 0.4), f.c, k, false);
    else if (f.k === 'hit') { lg.globalAlpha = k; for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.6; px(lg, f.c, f.x + Math.cos(a) * (1 - k) * 8, f.y + Math.sin(a) * (1 - k) * 8, 2, 2); } lg.globalAlpha = 1; }
    else if (f.k === 'rect') { lg.globalAlpha = k * 0.7; px(lg, f.c, f.x, f.y, f.w, f.h); lg.globalAlpha = 1; }
    else if (f.k === 'bolt') {
      lg.globalAlpha = k; lg.strokeStyle = f.c; lg.lineWidth = 1.5; lg.beginPath(); lg.moveTo(f.x1, f.y1);
      for (let i = 1; i < 6; i++) lg.lineTo(f.x1 + (f.x2 - f.x1) * i / 6 + Math.sin(i * 7 + t * 50) * 3, f.y1 + (f.y2 - f.y1) * i / 6 + Math.cos(i * 5 + t * 40) * 3);
      lg.lineTo(f.x2, f.y2); lg.stroke(); lg.globalAlpha = 1;
    }
  }

  // ---- вывод на экран ----
  const { s, ox, oy, cw, ch, u } = view;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#22597a'; ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(low, ox, oy, W * s, H * s);
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineJoin = 'round';
  const fs = Math.round(11 * u);
  ctx.font = `bold ${fs}px system-ui, sans-serif`;
  const placed = [];
  for (const [p, x, y] of pos.sort((a, b) => a[1] - b[1])) {
    const me = p.id === myId, sc = p.scale || 1, chosen = m.chosenId === p.id;
    const bob = me ? Math.sin(t * 6) * 2 * u : 0;
    const sx = ox + x * s;
    const cell = Math.max(2, Math.round((me ? 2.2 : 1.6) * u));
    const txt = `${me ? '▶ ' : ''}${p.name} · ${p.label}`;
    const tw = ctx.measureText(txt).width + 6 * u, lh = fs + 9 * u;
    const sy = oy + (y - 18 * sc - (chosen ? 7 : 2)) * s - 2 * u;
    let by = sy - 7 * cell - 6 * u;
    // раздвигаем подписи (стрелка остаётся у персонажа)
    for (let k = 0; k < 6; k++) {
      const hit = placed.find(r => Math.abs(r.x - sx) < (r.w + tw) / 2 && Math.abs(r.y - by) < lh);
      if (!hit) break; by = hit.y - lh;
    }
    placed.push({ x: sx, y: by, w: tw });
    drawArrow(ctx, sx, sy + bob, cell, p.color);
    const bw = 30 * u;
    ctx.fillStyle = '#000a'; ctx.fillRect(sx - bw / 2 - u, by - u, bw + 2 * u, 5 * u);
    ctx.fillStyle = chosen ? P[p.power]?.color || '#fff' : p.color; ctx.fillRect(sx - bw / 2, by, bw * Math.max(0, p.hp / p.maxHp), 3 * u);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3 * u; ctx.fillStyle = p.color;
    ctx.strokeText(txt, sx, by - 2 * u); ctx.fillText(txt, sx, by - 2 * u);
  }
  drawHud(ctx, view, w, myId);
}

function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }

function drawHud(ctx, view, w, myId) {
  const { cw, ch, u } = view, m = w.match, P = CFG.powers;
  if (m.phase === 'lobby') return;
  const label = (txt, x, y, size, color = '#fff', align = 'center') => {
    ctx.font = `bold ${Math.round(size * u)}px system-ui, sans-serif`; ctx.textAlign = align;
    ctx.lineWidth = 4 * u; ctx.strokeStyle = '#000'; ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y);
  };
  ctx.textBaseline = 'top';
  const timer = m.phase === 'play' ? fmt(m.timer) : m.phase === 'countdown' ? fmt(CFG.roundTime) : '0:00';
  label(`Раунд ${m.round}/${CFG.rounds}   ${timer}`, cw / 2, 8 * u, 15);
  const c = w.players.find(p => p.id === m.chosenId);
  if (c && P[c.power]) {
    const bw = Math.min(cw * 0.42, 320 * u), x = cw / 2 - bw / 2, y = 30 * u;
    ctx.fillStyle = '#000b'; ctx.fillRect(x - 2 * u, y - 2 * u, bw + 4 * u, 14 * u);
    ctx.fillStyle = P[c.power].color; ctx.fillRect(x, y, bw * Math.max(0, c.hp / c.maxHp), 10 * u);
    label(`👑 ${c.name}${c.id === myId ? ' (ты)' : ''} — ${P[c.power].name}  ${Math.ceil(c.hp)}`, cw / 2, y + 14 * u, 12, P[c.power].color);
  }
  // таблица очков
  const list = [...w.players].sort((a, b) => b.score - a.score);
  list.forEach((p, i) => label(`${i + 1}. ${p.name}  ${Math.floor(p.score)}${p.id === m.chosenId ? ' 👑' : ''}`,
    10 * u + view.safeL, 8 * u + i * 15 * u, 12, p.color, 'left'));
  const me = w.players.find(p => p.id === myId);
  if (me && me.dead > 0 && m.phase === 'play') label(`Возрождение через ${Math.ceil(me.dead)}…`, cw / 2, ch * 0.42, 18);
  if (m.phase === 'countdown') label(String(Math.ceil(m.timer)), cw / 2, ch * 0.3, 48, '#ffd23f');
  if (m.msgT > 0 && m.msg) label(m.msg, cw / 2, ch * 0.2, 15, '#ffd23f');
}
