// ИИ ботов: охотники держат дистанцию, стреляют, берут бонусы и уворачиваются; Избранный преследует и жмёт ульту
import { CFG } from '../config.js';
import { byId, isChosen, supportAt, mapOf, platforms } from './world.js';

const mem = new Map();
export function resetBots() { mem.clear(); }

function safeStep(w, p, dir) {
  if (!p.onGround) return true;
  const s = supportAt(w, p.x + dir * 14, p.y - 2);
  return s !== null && s - p.y < 70;
}
function nearestPlatformX(w, p) {
  let best = null, bd = 1e9;
  for (const pl of platforms(w.mapIdx)) {
    if (pl.y < p.y - 60) continue;
    const cx = Math.max(pl.x + 10, Math.min(pl.x + pl.w - 10, p.x)), d = Math.abs(cx - p.x) + Math.max(0, p.y - pl.y) * 0.5;
    if (d < bd) { bd = d; best = cx; }
  }
  return best ?? CFG.W / 2;
}

export function botInput(w, p, level = 1) {
  const st = mem.get(p.id) || { wander: 0, react: 0, dir: 1, ultWait: Math.random() * 3 };
  mem.set(p.id, st);
  const B = CFG.bot, dt = 1 / CFG.TICK;
  const inp = { mx: 0, my: 0, jump: false, jumpHeld: true, a: false, b: false, c: false };
  if (p.dead > 0) return inp;
  const ch = isChosen(w, p), play = w.match.phase === 'play';
  let target = null;
  if (ch) {
    let bd = 1e9;
    for (const q of w.players) if (q !== p && q.dead <= 0) {
      const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y) * 1.5; if (d < bd) { bd = d; target = q; }
    }
  } else target = byId(w, w.match.chosenId);

  let want = null;
  if (!target || target.dead > 0) {
    st.wander -= dt;
    if (st.wander <= 0) { st.wander = 1 + Math.random() * 2; st.dir = Math.random() < 0.5 ? -1 : 1; }
    want = p.x + st.dir * 40;
  } else {
    const dx = target.x - p.x;
    want = ch ? target.x : target.x - Math.sign(dx || 1) * (65 + (p.id.charCodeAt(p.id.length - 1) % 3) * 18);
    // бонус рядом — за ним
    if (w.pickups.length && play) {
      const pk = w.pickups.reduce((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) < Math.abs(b.x - p.x) + Math.abs(b.y - p.y) ? a : b);
      if (Math.abs(pk.x - p.x) + Math.abs(pk.y - p.y) < (ch ? 70 : 120)) { want = pk.x; if (pk.y < p.y - 20 && p.onGround && Math.random() < 0.15) inp.jump = true; }
    }
  }
  // опасности
  const H = w.hazard;
  if (H.phase !== 'idle') {
    if (H.k === 'geyser') for (const g of H.data) if (Math.abs(g.x - p.x) < 22 && Math.random() < B.dodge[level] + 0.1) want = p.x + Math.sign(p.x - g.x || 1) * 40;
    if (H.k === 'icicles') for (const ic of H.data) if (Math.abs(ic.x - p.x) < 12 && Math.random() < B.dodge[level]) want = p.x + Math.sign(p.x - ic.x || 1) * 30;
    if (H.k === 'wind' && H.phase === 'active') want = (want ?? p.x) - H.dir * 30;
  }
  for (const te of w.teles) {
    if (ch || te.t > 0.6) continue;
    const tx = te.fixed ? te.x : (byId(w, te.owner) || p).x;
    const r = (te.r || 40) + 12;
    if (Math.abs(tx - p.x) < r && Math.random() < B.dodge[level] * 0.4) { want = p.x + Math.sign(p.x - tx || 1) * r; if (p.cdB <= 0 && Math.random() < B.dodge[level]) inp.b = true; }
  }

  const d = want - p.x;
  inp.mx = Math.abs(d) > 6 ? Math.sign(d) : 0;
  if (target && target.dead <= 0 && !ch && Math.abs(d) <= 30) inp.mx = Math.sign(target.x - p.x) * 0.12; // лицом к цели
  if (inp.mx && Math.abs(inp.mx) > 0.5 && !safeStep(w, p, Math.sign(inp.mx))) {
    // пропасть впереди: прыгаем, если цель там и есть опора, иначе стоим
    const far = supportAt(w, p.x + Math.sign(inp.mx) * 70, p.y - 60);
    if (far !== null && p.onGround) inp.jump = true; else inp.mx = Math.sign(inp.mx) * 0.1;
  }
  if (target && target.dead <= 0) {
    const dy = target.y - p.y;
    if (dy < -24 && p.onGround && Math.random() < 0.07) inp.jump = true;
    if (dy < -24 && !p.onGround && p.vy > -30 && p.airJumps > 0 && Math.random() < 0.15) inp.jump = true;
    if (dy > 24 && p.onGround && supportAt(w, p.x, p.y + 4) !== null && Math.random() < 0.04) { inp.my = 1; inp.jump = true; }
  }
  if (Math.random() < 0.006 && p.onGround) inp.jump = true;
  // спасение после падения/отброса
  if (!p.onGround && supportAt(w, p.x, p.y) === null) {
    inp.mx = Math.sign(nearestPlatformX(w, p) - p.x) || 1;
    if (p.vy > 40 && p.airJumps > 0) inp.jump = true;
    if (!ch && p.cdB <= 0 && p.vy > 100 && Math.random() < 0.3) inp.b = true;
  }
  if (!play || !target || target.dead > 0) return inp;

  const dx = target.x - p.x, dy = target.y - p.y, adx = Math.abs(dx), facingT = dx * p.facing > 0;
  st.react -= dt;
  if (!ch) {
    if (facingT && adx < 220 && Math.abs(dy) < 80 && Math.random() < B.aim[level]) inp.a = true;
    if (adx < 30 && p.cdB <= 0 && Math.random() < 0.05 * (level + 1)) inp.b = true;
  } else if (st.react <= 0) {
    st.react = B.react[level] * (0.6 + Math.random() * 0.8);
    const pw = p.power, range = pw === 'bolt' ? 95 : pw === 'giant' ? 50 : 200;
    if (adx < range && Math.abs(dy) < 55 && (facingT || pw === 'bolt')) inp.a = true;
    if (p.cdB <= 0 && adx < (pw === 'ice' ? 110 : pw === 'bolt' ? 125 : 70) && Math.random() < 0.55) inp.b = true;
    if (p.ult >= CFG.chosen.ultMax) {
      st.ultWait -= B.react[level];
      const near = w.players.filter(q => q !== p && q.dead <= 0 && Math.hypot(q.x - p.x, q.y - p.y) < 200).length;
      if (st.ultWait <= 0 && (near >= 2 || pw === 'fire' || pw === 'bolt')) { inp.c = true; st.ultWait = 1 + Math.random() * 3; }
    }
  }
  return inp;
}
