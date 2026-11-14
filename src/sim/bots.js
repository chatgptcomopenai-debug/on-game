// ИИ ботов (вид сверху). Навигация по полю расстояний (обходит воду и препятствия).
// Охотники: ищут оружие, держат дистанцию под своё оружие, уходят из зон атак, перекатываются.
// Избранный: выбирает цель случайно с учётом расстояния и периодически меняет её.
import { CFG } from '../config.js';
import { byId, isChosen, heroOf, mapOf } from './world.js';
import { T, tileAt, flowTo } from './maps.js';

const { TILE, MW, MH } = CFG;
const mem = new Map();
export function resetBots() { mem.clear(); }
const PREF = { pistol: 110, smg: 95, shotgun: 52, sniper: 190, grenade: 110, rocket: 140, laser: 120 };
const CH_RANGE = { fire: 120, bolt: 80, ice: 130, giant: 28, poison: 110, shadow: 44, gravity: 120, wind: 110 };
const rnd = a => a[Math.floor(Math.random() * a.length)];

function safe(map, x, y) { const t = tileAt(map, x, y); return t === T.GROUND || t === T.ALT || (t === T.SHALLOW && !map.hot); }

function flowDir(w, p, tx, ty) {
  const map = mapOf(w), d = flowTo(map, tx, ty, w.time);
  const cx = Math.max(0, Math.min(MW - 1, Math.floor(p.x / TILE))), cy = Math.max(0, Math.min(MH - 1, Math.floor(p.y / TILE)));
  let best = null, bv = d[cy * MW + cx] >= 0 ? d[cy * MW + cx] : 1e9;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
    const v = d[ny * MW + nx]; if (v < 0) continue;
    if (dx && dy && (d[cy * MW + nx] < 0 || d[ny * MW + cx] < 0)) continue;
    if (v < bv) { bv = v; best = [nx, ny]; }
  }
  const gx = (best ? best[0] * TILE + 8 : tx) - p.x, gy = (best ? best[1] * TILE + 10 : ty) - p.y, L = Math.hypot(gx, gy) || 1;
  return [gx / L, gy / L];
}

export function botInput(w, p, level = 1) {
  const st = mem.get(p.id) || { react: 0, ultWait: Math.random() * 3, target: null, switchT: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 1, wander: null, wanderT: 0, lx: 0, ly: 0, stuckT: 0, escT: 0, ex: 0, ey: 0 };
  mem.set(p.id, st);
  const B = CFG.bot, dt = 1 / CFG.TICK;
  const inp = { mx: 0, my: 0, a: false, b: false, c: false, d: false, ax: 0, ay: 0, bx: 0, by: 0 };
  if (p.dead > 0 || p.leap) return inp;
  const map = mapOf(w), ch = isChosen(w, p), play = w.match.phase === 'play', hero = heroOf(p);
  let target = null;
  if (ch) {
    st.switchT -= dt;
    let cur = st.target && byId(w, st.target);
    if (!cur || cur.dead > 0 || cur.invisT > 0 || st.switchT <= 0) {
      const cands = w.players.filter(q => q !== p && q.dead <= 0 && !(q.invisT > 0));
      if (cands.length) {
        const ws = cands.map(q => 1 / (Math.hypot(q.x - p.x, q.y - p.y) + 70) * (q.isBot ? 1 : 0.8));
        let r = Math.random() * ws.reduce((a, b) => a + b, 0), pick = cands[0];
        for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) { pick = cands[i]; break; } }
        st.target = pick.id; cur = pick; st.switchT = 2.5 + Math.random() * 3;
      } else cur = null;
    }
    target = cur;
  } else { target = byId(w, w.match.chosenId); if (target && (target.dead > 0)) target = null; }

  let mv = [0, 0], goal = null;
  const d2 = q => Math.hypot(q.x - p.x, q.y - p.y);
  if (!ch && play) {
    const ws = w.pickups.filter(q => q.k === 'weapon');
    if (!p.weapon && ws.length) goal = ws.reduce((a, b) => d2(a) < d2(b) ? a : b);
    if (!goal && p.hp < p.maxHp * 0.5) { const it = w.pickups.filter(q => q.k === 'item' && q.w === 'heal' && d2(q) < 220); if (it.length) goal = it[0]; }
    if (!goal && p.weapon && p.ammo <= CFG.weapons[p.weapon].ammo * 0.3 && ws.length) { const near = ws.filter(q => d2(q) < 120); if (near.length) goal = near[0]; }
  } else if (ch && play) { const it = w.pickups.filter(q => q.k === 'item' && d2(q) < 70); if (it.length) goal = it[0]; }

  const tdist = target ? d2(target) : 1e9;
  if (goal) mv = flowDir(w, p, goal.x, goal.y);
  else if (!target) {
    st.wanderT -= dt;
    if (!st.wander || st.wanderT <= 0 || d2({ x: st.wander[0], y: st.wander[1] }) < 20) { st.wander = rnd(map.ground); st.wanderT = 3 + Math.random() * 3; }
    mv = flowDir(w, p, st.wander[0], st.wander[1]);
  } else {
    const pref = ch ? CH_RANGE[p.power] || 100 : p.weapon ? PREF[p.weapon] : (target.hp < target.maxHp * 0.12 ? 8 : 135);
    st.strafeT -= dt; if (st.strafeT <= 0) { st.strafeT = 0.8 + Math.random() * 1.6; st.strafe = -st.strafe; }
    const ux = (target.x - p.x) / (tdist || 1), uy = (target.y - p.y) / (tdist || 1);
    if (tdist > pref + 22) mv = flowDir(w, p, target.x, target.y);
    else if (tdist < pref - 26 && pref > 40) mv = [-ux * 0.9 - uy * st.strafe * 0.4, -uy * 0.9 + ux * st.strafe * 0.4];
    else if (pref > 40) mv = [-uy * st.strafe, ux * st.strafe];
    else mv = [ux, uy];
  }

  // опасные зоны: уйти из круга, по возможности перекатом
  let urgent = false;
  const flee = (cx, cy, r, soon) => {
    const d = Math.hypot(p.x - cx, p.y - 6 - cy);
    if (d < r + 12) { const L = d || 1; mv = [(p.x - cx) / L || 1, (p.y - 6 - cy) / L]; urgent = true; if (soon && !ch && p.charges > 0 && Math.random() < B.dodge[level] * 0.5) inp.d = true; }
  };
  if (Math.random() < B.dodge[level] + 0.2) {
    for (const te of w.teles) {
      if (te.noHit || (ch && !te.hazard) || te.t > 1.0) continue;
      if (te.k === 'cone') { const o = byId(w, te.owner); if (o && d2(o) < te.r + 14) flee(o.x, o.y - 6, te.r, true); }
      else flee(te.x, te.y, te.r, te.t < 0.45);
    }
    for (const z of w.zones) if (!(ch && z.owner)) flee(z.x, z.y, z.k === 'hole' ? z.r * 1.2 : z.r, false);
    const H = w.hazard;
    if (H.phase === 'warn') {
      const r = { geyser: CFG.hazards.geyserR, ice: CFG.hazards.iceR, storm: CFG.hazards.stormR, spores: CFG.hazards.sporeR }[H.k];
      if (r) for (const s of H.data) flee(s.x, s.y, r, false);
    }
    if (H.k === 'laser' && H.phase === 'active' && Math.abs(p.x - H.x) < 34 && (p.x - H.x) * H.dx > 0) { mv = [-H.dx, 0]; urgent = true; if (!ch && p.charges > 0 && Math.abs(p.x - H.x) < 22) inp.d = true; }
    if (H.k === 'wind' && H.phase === 'active' && !urgent) { mv = [mv[0] - H.dx * 0.6, mv[1] - H.dy * 0.6]; }
    if (!ch) for (const pr of w.projs) {
      if (pr.team !== 'c' || pr.lob) continue;
      const dx = p.x - pr.x, dy = p.y - 7 - pr.y, d = Math.hypot(dx, dy);
      if (d < 60 && dx * pr.vx + dy * pr.vy > 0 && Math.random() < B.dodge[level] * 0.25) { const L = Math.hypot(pr.vx, pr.vy) || 1; mv = [-pr.vy / L * st.strafe, pr.vx / L * st.strafe]; if (d < 30 && p.charges > 0 && Math.random() < 0.3) inp.d = true; }
    }
  }
  // не упереться и не свалиться: проверяем точку впереди, пробуем обойти
  st.escT -= dt;
  if (Math.hypot(p.x - st.lx, p.y - st.ly) < 0.4 && (mv[0] || mv[1])) st.stuckT += dt; else st.stuckT = 0;
  st.lx = p.x; st.ly = p.y;
  if (st.stuckT > 0.5) { const a = Math.random() * Math.PI * 2; st.ex = Math.cos(a); st.ey = Math.sin(a); st.escT = 0.45; st.stuckT = 0; }
  if (st.escT > 0 && !urgent) mv = [st.ex, st.ey];
  let L = Math.hypot(mv[0], mv[1]);
  if (L > 0.01) {
    mv = [mv[0] / L, mv[1] / L];
    const here = safe(map, p.x, p.y);
    if (here) {
      let ok = false;
      for (const a of [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2]) {
        const c = Math.cos(a), s = Math.sin(a), x = mv[0] * c - mv[1] * s, y = mv[0] * s + mv[1] * c;
        if (safe(map, p.x + x * 12, p.y + y * 12) && safe(map, p.x + x * 22, p.y + y * 22)) { mv = [x, y]; ok = true; break; }
      }
      if (!ok) mv = [0, 0];
    } else { // в воде/на краю: к ближайшей суше
      let best = null, bd = 1e9;
      for (let a = 0; a < 6.28; a += 0.4) for (const r of [14, 28, 44]) { const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (safe(map, x, y) && r < bd) { bd = r; best = [Math.cos(a), Math.sin(a)]; } }
      if (best) mv = best;
      if (!ch && p.charges > 0 && tileAt(map, p.x, p.y) === T.DEEP) inp.d = true;
    }
  }
  inp.mx = mv[0]; inp.my = mv[1];
  if (!play || !target || target.dead > 0) return inp;

  // атака
  const dx = target.x - p.x, dy = (target.y - 7 * target.scale) - (p.y - 7 * p.scale), dist = Math.hypot(dx, dy) || 1;
  const aimAt = (range, err) => { const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 2 * err, m = Math.max(0.2, Math.min(1, dist / range)); return [Math.cos(a) * m, Math.sin(a) * m]; };
  st.react -= dt;
  if (!ch) {
    const W = p.weapon && CFG.weapons[p.weapon];
    if (W) {
      if (dist < W.range * 0.95 && !target.leap) { inp.a = true; if (level < 2 || W.aim === 'circle') [inp.ax, inp.ay] = aimAt(W.range, B.aimErr[level]); }
    } else if (dist < 24) inp.a = true;
    if (dist < 34 && p.weapon && p.charges > 0 && Math.random() < 0.04 * (level + 1)) inp.d = true;
    if (p.cdB <= 0 && st.react <= 0) {
      st.react = B.react[level] * 2;
      const s = hero.skill;
      [inp.bx, inp.by] = aimAt(s === 'rocketJump' ? CFG.skills.rocketRange : CFG.skills.shurRange, 0.1);
      if (s === 'heal' && (p.hp < p.maxHp * 0.6 || w.players.some(q => !isChosen(w, q) && q.dead <= 0 && q.hp < q.maxHp * 0.5 && Math.hypot(q.x - p.x, q.y - p.y) < 60))) inp.b = true;
      else if (s === 'turret' && dist < 150) inp.b = true;
      else if (s === 'invis' && (p.hp < p.maxHp * 0.5 || dist < 50)) inp.b = true;
      else if (s === 'emp' && dist < 52) inp.b = true;
      else if (s === 'block' && dist < 70 && (target.attackT > 0 || w.teles.some(t => t.owner === target.id))) inp.b = true;
      else if (s === 'rage' && p.weapon && dist < 150) inp.b = true;
      else if (s === 'shuriken' && dist < 130) inp.b = true;
      else if (s === 'rocketJump' && dist > 40 && dist < 105 && p.hp > p.maxHp * 0.4) inp.b = true;
    }
  } else if (st.react <= 0) {
    st.react = B.react[level] * (0.6 + Math.random() * 0.8);
    const pw = p.power, P = CFG.powers[pw];
    const range = pw === 'giant' ? 44 : pw === 'shadow' ? 60 : P.aRange * 0.92;
    if (dist < range) { inp.a = true; [inp.ax, inp.ay] = aimAt(P.aRange, B.aimErr[level] * 0.6); }
    const near = w.players.filter(q => q !== p && q.dead <= 0 && Math.hypot(q.x - p.x, q.y - p.y) < 56).length;
    const bOk = { fire: near >= 1, bolt: dist > 50 && dist < 150, ice: dist < 70, giant: dist > 46 && dist < 130, poison: dist < 170, shadow: dist > 40 && dist < 150, gravity: dist < 170, wind: dist < 150 }[pw];
    if (p.cdB <= 0 && bOk && Math.random() < 0.6) { inp.b = true; [inp.bx, inp.by] = aimAt(P.bRange || 60, 0.05); }
    if (p.ult >= CFG.chosen.ultMax) {
      st.ultWait -= B.react[level];
      const n2 = w.players.filter(q => q !== p && q.dead <= 0 && Math.hypot(q.x - p.x, q.y - p.y) < 170).length;
      if (st.ultWait <= 0 && n2 >= 1) { inp.c = true; st.ultWait = 1 + Math.random() * 3; }
    }
  }
  return inp;
}
