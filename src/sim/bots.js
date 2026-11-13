// ИИ ботов. Охотники: сначала ищут оружие, держат дистанцию по оружию, применяют навыки героя.
// Избранный: выбирает цель случайно с учётом расстояния и периодически меняет её (не охотится только на игрока).
import { CFG } from '../config.js';
import { byId, isChosen, supportAt, platsAt, heroOf } from './world.js';

const mem = new Map();
export function resetBots() { mem.clear(); }

function safeStep(w, p, dir) {
  if (!p.onGround) return true;
  const s = supportAt(w, p.x + dir * 14, p.y - 2);
  return s !== null && s - p.y < 80;
}
function nearestPlatformX(w, p) {
  let best = null, bd = 1e9;
  for (const pl of platsAt(w.mapIdx, w.time)) {
    if (pl.y < p.y - 70) continue;
    const cx = Math.max(pl.x + 10, Math.min(pl.x + pl.w - 10, p.x)), d = Math.abs(cx - p.x) + Math.max(0, p.y - pl.y) * 0.5;
    if (d < bd) { bd = d; best = cx; }
  }
  return best ?? CFG.W / 2;
}
const PREF = { pistol: 130, smg: 110, shotgun: 60, sniper: 280, grenade: 170, rocket: 190, laser: 170 };

export function botInput(w, p, level = 1) {
  const st = mem.get(p.id) || { wander: 0, react: 0, dir: 1, ultWait: Math.random() * 3, target: null, switchT: 0, off: (Math.random() - 0.5) * 50 };
  mem.set(p.id, st);
  const B = CFG.bot, dt = 1 / CFG.TICK;
  const inp = { mx: 0, my: 0, jump: false, jumpHeld: true, a: false, b: false, c: false, ax: 0, ay: 0, bx: 0, by: 0 };
  if (p.dead > 0) return inp;
  const ch = isChosen(w, p), play = w.match.phase === 'play', hero = heroOf(p);
  let target = null;
  if (ch) {
    st.switchT -= dt;
    let cur = st.target && byId(w, st.target);
    if (!cur || cur.dead > 0 || cur.invisT > 0 || st.switchT <= 0) {
      const cands = w.players.filter(q => q !== p && q.dead <= 0 && !(q.invisT > 0));
      if (cands.length) {
        const ws = cands.map(q => 1 / (Math.hypot(q.x - p.x, q.y - p.y) + 80) * (q.isBot ? 1 : 0.8));
        let r = Math.random() * ws.reduce((a, b) => a + b, 0), pick = cands[0];
        for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) { pick = cands[i]; break; } }
        st.target = pick.id; cur = pick; st.switchT = 2.5 + Math.random() * 3;
      } else cur = null;
    }
    target = cur;
  } else target = byId(w, w.match.chosenId);

  let want = null, goal = null;
  if (!ch && play && !p.weapon && w.pickups.length) { // без оружия — к ближайшему оружию
    const ws = w.pickups.filter(q => q.k === 'weapon');
    if (ws.length) goal = ws.reduce((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) * 1.5 < Math.abs(b.x - p.x) + Math.abs(b.y - p.y) * 1.5 ? a : b);
  }
  if (!goal && !ch && p.hp < p.maxHp * 0.5) { const it = w.pickups.find(q => q.k === 'item' && q.w === 'heal' && Math.abs(q.x - p.x) < 200); if (it) goal = it; }
  if (!goal && ch && w.pickups.length) { const it = w.pickups.find(q => q.k === 'item' && Math.abs(q.x - p.x) < 80); if (it) goal = it; }
  if (goal) {
    want = goal.x;
    if (goal.y < p.y - 20 && p.onGround && Math.random() < 0.18) inp.jump = true;
    if (goal.y < p.y - 20 && !p.onGround && p.vy > -20 && p.airJumps > 0 && Math.random() < 0.2) inp.jump = true;
    if (goal.y > p.y + 20 && p.onGround && Math.random() < 0.06) { inp.my = 1; inp.jump = true; }
  } else if (!target || target.dead > 0) {
    st.wander -= dt;
    if (st.wander <= 0) { st.wander = 1 + Math.random() * 2; st.dir = Math.random() < 0.5 ? -1 : 1; }
    want = p.x + st.dir * 40;
  } else {
    const dx = target.x - p.x;
    const keep = ch ? 0 : (p.weapon ? PREF[p.weapon] : 14) + st.off * (p.weapon ? 1 : 0);
    want = ch ? target.x : target.x - Math.sign(dx || 1) * Math.max(10, keep);
  }
  // опасности
  const H = w.hazard;
  if (H.phase !== 'idle') {
    if ((H.k === 'geyser' || H.k === 'spores' || H.k === 'storm') && H.data) for (const g of H.data) if (Math.abs(g.x - p.x) < 30 && Math.random() < B.dodge[level] + 0.1) want = p.x + Math.sign(p.x - g.x || 1) * 50;
    if (H.k === 'icicles') for (const ic of H.data) if (Math.abs(ic.x - p.x) < 12 && Math.random() < B.dodge[level]) want = p.x + Math.sign(p.x - ic.x || 1) * 30;
    if (H.k === 'wind' && H.phase === 'active') want = (want ?? p.x) - H.dir * 30;
    if (H.k === 'laser' && H.phase === 'warn' && p.y > H.y && p.y - 21 < H.y && p.onGround && Math.random() < B.dodge[level] * 0.4) inp.jump = true;
  }
  for (const z of w.zones) if (!ch && Math.hypot(z.x - p.x, z.y - p.y) < z.r + 20 && Math.random() < B.dodge[level]) want = p.x + Math.sign(p.x - z.x || 1) * (z.r + 30);
  for (const te of w.teles) {
    if (ch || te.t > 0.6) continue;
    const tx = te.fixed ? te.x : (byId(w, te.owner) || p).x, r = (te.r || 40) + 12;
    if (Math.abs(tx - p.x) < r && Math.random() < B.dodge[level] * 0.4) { want = p.x + Math.sign(p.x - tx || 1) * r; if (p.cdB <= 0 && ['dash', 'shadowDash', 'block'].includes(hero.skill) && Math.random() < B.dodge[level]) inp.b = true; }
  }

  const d = want - p.x;
  inp.mx = Math.abs(d) > 6 ? Math.sign(d) : 0;
  if (target && target.dead <= 0 && !ch && !goal && Math.abs(d) <= 30) inp.mx = Math.sign(target.x - p.x) * 0.12;
  if (inp.mx && Math.abs(inp.mx) > 0.5 && !safeStep(w, p, Math.sign(inp.mx))) {
    const far = supportAt(w, p.x + Math.sign(inp.mx) * 70, p.y - 60);
    if (far !== null && p.onGround) inp.jump = true; else inp.mx = Math.sign(inp.mx) * 0.1;
  }
  if (target && target.dead <= 0 && !goal) {
    const dy = target.y - p.y;
    if (dy < -24 && p.onGround && Math.random() < 0.07) inp.jump = true;
    if (dy < -24 && !p.onGround && p.vy > -30 && p.airJumps > 0 && Math.random() < 0.15) inp.jump = true;
    if (dy > 24 && p.onGround && supportAt(w, p.x, p.y + 4) !== null && Math.random() < 0.04) { inp.my = 1; inp.jump = true; }
  }
  if (Math.random() < 0.006 && p.onGround) inp.jump = true;
  if (!p.onGround && supportAt(w, p.x, p.y) === null) {
    inp.mx = Math.sign(nearestPlatformX(w, p) - p.x) || 1;
    if (p.vy > 40 && p.airJumps > 0) inp.jump = true;
    if (!ch && p.cdB <= 0 && ['dash', 'shadowDash', 'rocketJump'].includes(hero.skill) && p.vy > 100 && Math.random() < 0.3) inp.b = true;
  }
  if (!play || !target || target.dead > 0) return inp;

  const dx = target.x - p.x, dy = target.y - p.y, adx = Math.abs(dx), dist = Math.hypot(dx, dy);
  st.react -= dt;
  if (!ch) {
    const W = p.weapon && CFG.weapons[p.weapon];
    if (W) { if (dist < W.range * 0.95 && Math.random() < B.aim[level]) inp.a = true; }
    else if (dist < 26 && Math.random() < 0.5) inp.a = true;
    if (p.cdB <= 0 && st.react <= 0) {
      st.react = B.react[level] * 2;
      const s = hero.skill;
      if (s === 'heal' && (p.hp < p.maxHp * 0.6 || w.players.some(q => !isChosen(w, q) && q.dead <= 0 && q.hp < q.maxHp * 0.5 && Math.hypot(q.x - p.x, q.y - p.y) < 80))) inp.b = true;
      else if (s === 'turret' && dist < 220 && p.onGround) inp.b = true;
      else if (s === 'invis' && (p.hp < p.maxHp * 0.5 || dist < 60)) inp.b = true;
      else if (s === 'emp' && dist < 75) inp.b = true;
      else if (s === 'block' && dist < 70 && (target.attackT > 0 || w.teles.some(t => t.owner === target.id))) inp.b = true;
      else if (s === 'rocketJump' && (dist < 35 || (dy < -50 && adx < 60))) inp.b = true;
      else if ((s === 'dash' || s === 'shadowDash') && dist < 35 && Math.random() < 0.3) inp.b = true;
    }
  } else if (st.react <= 0) {
    st.react = B.react[level] * (0.6 + Math.random() * 0.8);
    const pw = p.power, P = CFG.powers[pw];
    const d0 = dist || 1, ma = Math.min(1, d0 / (P.aRange || 140)), mb = Math.min(1, d0 / (P.bRange || 140));
    inp.ax = dx / d0 * ma; inp.ay = (dy - 6) / d0 * ma; inp.bx = dx / d0 * mb; inp.by = dy / d0 * mb;
    const range = pw === 'bolt' ? 120 : pw === 'giant' ? 52 : pw === 'shadow' ? 70 : 240;
    if (dist < range) inp.a = true;
    const bRange = { fire: 60, bolt: 160, ice: 90, giant: 70, poison: 220, shadow: 180, gravity: 220, wind: 200 }[pw];
    if (p.cdB <= 0 && dist < bRange && Math.random() < 0.55) inp.b = true;
    if (p.ult >= CFG.chosen.ultMax) {
      st.ultWait -= B.react[level];
      const near = w.players.filter(q => q !== p && q.dead <= 0 && Math.hypot(q.x - p.x, q.y - p.y) < 220).length;
      if (st.ultWait <= 0 && (near >= 2 || ['fire', 'bolt', 'poison', 'shadow', 'gravity'].includes(pw))) { inp.c = true; st.ultWait = 1 + Math.random() * 3; }
    }
    void P;
  }
  return inp;
}
