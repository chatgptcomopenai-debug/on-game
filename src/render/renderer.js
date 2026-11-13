// Рендер: мир в низком разрешении → масштаб на экран; метки игроков — в полном разрешении
import { CFG } from '../config.js';
import { getSprite } from './sprites.js';

const { W, H } = CFG;
const low = document.createElement('canvas'); low.width = W; low.height = H;
const lg = low.getContext('2d');
let bg = null;

function px(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); }

function buildBackground() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const sky = ['#2b3a67', '#3b5a8f', '#5a7fb8', '#7fa3d6', '#a6c4e8'];
  sky.forEach((c, i) => px(g, c, 0, i * 26, W, 26));
  px(g, '#c4daf0', 0, 130, W, 20);
  // облака
  const cloud = (x, y, s) => { px(g, '#e8f1fb', x, y, 22 * s, 5 * s); px(g, '#e8f1fb', x + 4 * s, y - 3 * s, 12 * s, 3 * s); px(g, '#cfe0f2', x, y + 4 * s, 22 * s, 1 * s); };
  cloud(18, 34, 1); cloud(240, 24, 1.3); cloud(150, 44, 0.8); cloud(280, 70, 0.7);
  // море
  px(g, '#2a6f97', 0, 150, W, 30); px(g, '#22597a', 0, 165, W, 15);
  for (let i = 0; i < 18; i++) px(g, '#5fa8d3', (i * 37) % W, 153 + (i * 7) % 24, 6, 1);
  // остров: земля сужается книзу
  const ground = CFG.platforms[0];
  px(g, '#4caf50', ground.x, ground.y, ground.w, 3);
  px(g, '#2e7d32', ground.x, ground.y + 3, ground.w, 2);
  for (let r = 0; r < 30; r++) {
    const inset = Math.floor(r * r / 9) + (r > 0 ? 2 : 0);
    const w = ground.w - inset * 2; if (w <= 0) break;
    px(g, r % 6 < 3 ? '#8d5a2b' : '#7a4c24', ground.x + inset, ground.y + 5 + r, w, 1);
  }
  for (let i = 0; i < 14; i++) px(g, '#6b3f1d', ground.x + 10 + (i * 53) % 200, ground.y + 8 + (i * 5) % 12, 3, 2);
  for (let i = 0; i < 20; i++) px(g, '#66bb6a', ground.x + (i * 23) % ground.w, ground.y - 1, 2, 1);
  // парящие платформы
  for (const p of CFG.platforms.slice(1)) {
    px(g, '#9e9e9e', p.x, p.y, p.w, p.h); px(g, '#cfcfcf', p.x, p.y, p.w, 1);
    px(g, '#6d6d6d', p.x + 2, p.y + p.h, p.w - 4, 2);
  }
  return cv;
}

function frameOf(p) {
  if (!p.onGround) return 'jump';
  if (Math.abs(p.vx) > 10) return Math.floor(p.animT * 8) % 2 ? 'walkA' : 'walkB';
  return 'stand';
}

export function render(ctx, view, world, alpha, myId) {
  if (!bg) bg = buildBackground();
  lg.drawImage(bg, 0, 0);
  // блики моря
  const t = world.time;
  for (let i = 0; i < 6; i++) px(lg, '#8cc8ea', ((i * 61 + t * 12) % (W + 10)) - 5, 158 + i * 3, 4, 1);
  const pos = [];
  for (const p of world.players) {
    if (p.dead > 0) continue;
    const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha;
    pos.push([p, x, y]);
    lg.globalAlpha = 0.3; px(lg, '#000', x - 5, y, 10, 1); lg.globalAlpha = 1;
    const spr = getSprite(p.color, frameOf(p), p.attackT > 0.1);
    lg.save();
    lg.translate(Math.round(x), Math.round(y) - 18);
    if (p.facing < 0) { lg.scale(-1, 1); lg.drawImage(spr, -6, 0); } else lg.drawImage(spr, -6, 0);
    lg.restore();
  }
  // на экран
  const { s, ox, oy, cw, ch } = view;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#22597a'; ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(low, ox, oy, W * s, H * s);
  // метки: цвет игрока + устройство + стрелочка
  const fs = Math.max(11, Math.round(s * 5));
  ctx.font = `bold ${fs}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (const [p, x, y] of pos) {
    const sx = ox + x * s, sy = oy + (y - 21) * s;
    const a = s * 2.2, me = p.id === myId;
    ctx.fillStyle = p.color; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(2, s * 0.6);
    ctx.beginPath(); ctx.moveTo(sx - a, sy - a * 1.2); ctx.lineTo(sx + a, sy - a * 1.2); ctx.lineTo(sx, sy); ctx.closePath();
    ctx.stroke(); ctx.fill();
    const txt = me ? `ТЫ · ${p.label}` : p.label;
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, fs / 4);
    ctx.strokeText(txt, sx, sy - a * 1.5); ctx.fillText(txt, sx, sy - a * 1.5);
  }
}
