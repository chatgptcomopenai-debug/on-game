// Симуляция: без DOM. Физика, бой, силы, раунды, очки (план §1, §6)
import { CFG } from '../config.js';

const POWERS = Object.keys(CFG.powers);
const GROUND = CFG.platforms[0];
const rnd = a => a[Math.floor(Math.random() * a.length)];
export const byId = (w, id) => w.players.find(p => p.id === id);
export const isChosen = (w, p) => p && w.match.chosenId === p.id;
export const hitH = p => 17 * p.scale;
const hitW = p => 8 * p.scale;

export function createWorld() {
  return { time: 0, players: [], projs: [], teles: [], walls: [], fx: [],
    match: { phase: 'lobby', round: 0, timer: 0, chosenId: null, msg: '', msgT: 0 } };
}

export function addPlayer(w, { id, name, color, label, isBot }) {
  const p = { id, name, color, label, isBot: !!isBot, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, facing: 1,
    onGround: false, hp: CFG.hunter.hp, maxHp: CFG.hunter.hp, dead: 0, inv: 0, cdA: 0, cdB: 0, dashT: 0,
    slowT: 0, attackT: 0, coyT: 0, bufT: 0, dropT: 0, animT: 0, score: 0, dmgAcc: 0, lifeScore: 0,
    noDmgT: 0, slam: false, power: null, scale: CFG.hunter.scale, dmgLog: {}, stats: { dmg: 0, chosenTime: 0, kills: 0 } };
  w.players.push(p); placeAtSpawn(w, p); return p;
}

export function removePlayer(w, id) {
  const p = byId(w, id); if (!p) return;
  w.players = w.players.filter(q => q !== p);
  if (w.match.chosenId === id && w.match.phase !== 'lobby' && w.players.length) {
    makeChosen(w, topRecentDamager(w, p) || rnd(w.players));
  }
}

function announce(w, msg) { w.match.msg = msg; w.match.msgT = 3; }

function placeAtSpawn(w, p) {
  const ch = byId(w, w.match.chosenId);
  const sp = CFG.spawns.map(s => [s, ch && ch !== p ? Math.abs(s[0] - ch.x) + Math.abs(s[1] - ch.y) : Math.random()])
    .sort((a, b) => b[1] - a[1]);
  const s = sp[Math.floor(Math.random() * Math.min(2, sp.length))][0];
  p.x = p.px = s[0]; p.y = p.py = s[1]; p.vx = p.vy = 0; p.onGround = true;
}

function makeHunter(p) { p.power = null; p.scale = CFG.hunter.scale; p.maxHp = CFG.hunter.hp; p.slam = false; p.dmgLog = {}; }

function makeChosen(w, p) {
  const key = rnd(POWERS), pw = CFG.powers[key];
  for (const q of w.players) if (q !== p && q.power) makeHunter(q);
  p.power = key; p.scale = pw.scale || CFG.chosen.scale;
  p.maxHp = Math.round(CFG.chosen.hpPer * Math.max(1, w.players.length - 1) * pw.hpMul);
  p.hp = p.maxHp; p.inv = CFG.chosen.swapInv; p.cdA = p.cdB = 0; p.lifeScore = 0; p.dmgLog = {}; p.slam = false;
  if (p.dead > 0) { p.dead = 0; placeAtSpawn(w, p); }
  w.match.chosenId = p.id;
  w.fx.push({ k: 'ring', x: p.x, y: p.y - 12, r: 40, c: pw.color, t: 0.5, ttl: 0.5 });
  announce(w, `${p.name} — Избранный! Сила: ${pw.name}`);
}

export function startMatch(w) {
  for (const p of w.players) { p.score = 0; p.dmgAcc = 0; p.stats = { dmg: 0, chosenTime: 0, kills: 0 }; }
  w.match.round = 0; nextRound(w);
}

function nextRound(w) {
  const m = w.match; m.round++;
  w.projs = []; w.teles = []; w.walls = [];
  m.chosenId = null;
  for (const p of w.players) { makeHunter(p); p.hp = p.maxHp; p.dead = 0; p.inv = 0; p.cdA = p.cdB = 0; p.slowT = 0; }
  let ch;
  if (m.round === 1) ch = rnd(w.players);
  else { const min = Math.min(...w.players.map(p => p.score)); ch = rnd(w.players.filter(p => p.score === min)); }
  for (const p of w.players) placeAtSpawn(w, p);
  makeChosen(w, ch);
  m.phase = 'countdown'; m.timer = CFG.countdown;
}

function topRecentDamager(w, t) {
  let best = null, bv = 0;
  for (const id in t.dmgLog) {
    const e = t.dmgLog[id], q = byId(w, id);
    if (q && q !== t && e.t > w.time - 5 && e.amt > bv) { best = q; bv = e.amt; }
  }
  return best;
}

function isLastHunter(w, p) {
  const hs = w.players.filter(q => !isChosen(w, q));
  if (hs.length < 2) return false;
  const min = Math.min(...hs.map(q => q.score));
  return p.score === min && hs.filter(q => q.score === min).length === 1;
}

function damage(w, t, amt, src, o = {}) {
  if (!t || t.dead > 0 || t.inv > 0) return false;
  const chosenT = isChosen(w, t);
  let a = amt;
  if (src && !isChosen(w, src) && isLastHunter(w, src)) a *= CFG.comeback;
  t.hp -= a; t.noDmgT = 0;
  if (src) {
    src.stats.dmg += a;
    if (chosenT) {
      const e = t.dmgLog[src.id];
      t.dmgLog[src.id] = { amt: (e && e.t > w.time - 5 ? e.amt : 0) + a, t: w.time };
      src.dmgAcc += a;
      while (src.dmgAcc >= 10) { src.dmgAcc -= 10; src.score += CFG.score.per10dmg; }
    }
  }
  if (o.kb) { t.vx = o.kb * (o.dir || 1); t.vy = -150; t.onGround = false; }
  if (o.slow) t.slowT = o.slow;
  w.fx.push({ k: 'hit', x: t.x, y: t.y - hitH(t) / 2, c: o.c || '#fff', t: 0.25, ttl: 0.25 });
  if (t.hp <= 0) kill(w, t, src);
  return true;
}

function kill(w, t, src) {
  t.hp = 0; t.dead = CFG.hunterRespawn; t.vx = t.vy = 0; t.slam = false;
  w.fx.push({ k: 'ring', x: t.x, y: Math.min(t.y, 260) - 8, r: 22, c: t.color, t: 0.4, ttl: 0.4 });
  if (isChosen(w, t)) {
    let killer = src && src !== t ? src : null;
    if (killer) { killer.score += CFG.score.kill; killer.stats.kills++; }
    else killer = topRecentDamager(w, t);
    makeHunter(t);
    const others = w.players.filter(q => q !== t);
    if (!others.length) { t.dead = 0; placeAtSpawn(w, t); makeChosen(w, t); return; }
    makeChosen(w, killer || rnd(others));
  } else if (src && isChosen(w, src)) {
    src.score += CFG.score.hunterKill; src.stats.kills++;
  }
}

function respawn(w, p) {
  placeAtSpawn(w, p); p.hp = p.maxHp; p.inv = CFG.spawnInv; p.dead = 0;
}

// --- атаки ---
function aimAt(p, t, range) {
  if (t && t.dead <= 0 && (t.x - p.x) * p.facing > 0) {
    const dx = t.x - p.x, dy = (t.y - hitH(t) / 2) - (p.y - hitH(p) / 2), d = Math.hypot(dx, dy);
    if (d < range) return [dx / d, dy / d];
  }
  return [p.facing, 0];
}
function nearestHunter(w, p, range, from = p, exclude = []) {
  let best = null, bd = range;
  for (const q of w.players) {
    if (q === p || isChosen(w, q) || q.dead > 0 || exclude.includes(q)) continue;
    const d = Math.hypot(q.x - from.x, (q.y - 8) - (from.y - 8));
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function frontHunter(w, p, range) {
  let best = null, bd = range;
  for (const q of w.players) {
    if (q === p || isChosen(w, q) || q.dead > 0 || (q.x - p.x) * p.facing <= 0) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function shoot(w, p, dir, spd, dmg, r, kind, c, range, extra = {}) {
  w.projs.push({ x: p.x + p.facing * 5 * p.scale, y: p.y - hitH(p) * 0.6, vx: dir[0] * spd, vy: dir[1] * spd,
    r, dmg, owner: p.id, team: isChosen(w, p) ? 'c' : 'h', ttl: range / spd, kind, c, ...extra });
}
function areaHit(w, owner, cx, cy, r, dmg, c, kb = 0) {
  for (const q of w.players) {
    if (q === owner || isChosen(w, q) || q.dead > 0) continue;
    if (Math.hypot(q.x - cx, (q.y - 8) - cy) <= r + 5) damage(w, q, dmg, owner, { c, kb, dir: Math.sign(q.x - cx) || 1 });
  }
}

function attackA(w, p) {
  p.attackT = 0.25;
  if (!isChosen(w, p)) {
    const H = CFG.hunter;
    p.cdA = H.shotCd;
    shoot(w, p, aimAt(p, byId(w, w.match.chosenId), H.aimRange), H.shotSpeed, H.shotDmg, 2, 'shot', p.color, H.shotRange);
    return;
  }
  const pw = CFG.powers[p.power]; p.cdA = pw.aCd;
  if (p.power === 'fire') shoot(w, p, aimAt(p, frontHunter(w, p, 200), 200), pw.aSpeed, pw.aDmg, 4, 'fire', pw.color, 260);
  else if (p.power === 'ice') shoot(w, p, aimAt(p, frontHunter(w, p, 220), 220), pw.aSpeed, pw.aDmg, 3, 'ice', pw.color, 240, { slow: pw.slowT });
  else if (p.power === 'bolt') {
    let from = { x: p.x, y: p.y - 6 }, hit = [], t = nearestHunter(w, p, pw.aRange);
    if (!t) { w.fx.push({ k: 'bolt', x1: p.x, y1: p.y - 14, x2: p.x + p.facing * 40, y2: p.y - 14, c: pw.color, t: 0.15, ttl: 0.15 }); return; }
    for (let i = 0; i <= pw.aJumps && t; i++) {
      w.fx.push({ k: 'bolt', x1: from.x, y1: from.y - 8, x2: t.x, y2: t.y - 8, c: pw.color, t: 0.2, ttl: 0.2 });
      damage(w, t, pw.aDmg, p, { c: pw.color }); hit.push(t); from = t;
      t = nearestHunter(w, p, pw.aJump, from, hit);
    }
  } else if (p.power === 'giant') {
    w.teles.push({ k: 'cone', owner: p.id, t: pw.aTele, ttl: pw.aTele, dmg: pw.aDmg, c: pw.color });
  }
}

function attackB(w, p) {
  const pw = CFG.powers[p.power];
  const cd = pw.bCd * (w.players.length >= 5 ? CFG.bigLobbyCdMul : 1);
  if (p.power === 'giant') { if (!p.onGround) return; p.vy = -pw.bJump; p.onGround = false; p.slam = true; }
  else if (p.power === 'fire') w.teles.push({ k: 'ring', owner: p.id, r: pw.bR, t: pw.bTele, ttl: pw.bTele, dmg: pw.bDmg, c: pw.color });
  else if (p.power === 'bolt') {
    const ox = p.x;
    p.x = Math.max(GROUND.x + 4, Math.min(GROUND.x + GROUND.w - 4, p.x + p.facing * pw.bDist)); p.px = p.x;
    w.fx.push({ k: 'bolt', x1: ox, y1: p.y - 12, x2: p.x, y2: p.y - 12, c: pw.color, t: 0.25, ttl: 0.25 });
    w.fx.push({ k: 'ring', x: p.x, y: p.y - 10, r: pw.bR, c: pw.color, t: 0.3, ttl: 0.3 });
    areaHit(w, p, p.x, p.y - 10, pw.bR, pw.bDmg, pw.color);
  } else if (p.power === 'ice') {
    w.walls.push({ x: p.x + p.facing * 24 - 3, y: p.y - pw.wallH, w: 6, h: pw.wallH, t: pw.wallT });
  }
  p.cdB = cd; p.attackT = 0.25;
}

function coneRect(p) {
  const pw = CFG.powers.giant;
  return { x: p.facing > 0 ? p.x + 4 : p.x - 4 - pw.aW, y: p.y - pw.aH, w: pw.aW, h: pw.aH };
}
export function teleShape(w, t) {
  const o = byId(w, t.owner); if (!o) return null;
  if (t.k === 'cone') return { rect: coneRect(o) };
  return { cx: o.x, cy: o.y - 10, r: t.r };
}

const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);

// --- главный шаг ---
export function step(w, inputs, dt) {
  const m = w.match;
  w.time += dt;
  m.msgT = Math.max(0, m.msgT - dt);
  if (m.phase === 'end') return;
  if (m.phase === 'countdown') { m.timer -= dt; if (m.timer <= 0) { m.phase = 'play'; m.timer = CFG.roundTime; } }
  else if (m.phase === 'play') {
    m.timer -= dt;
    if (m.timer <= 0) {
      const ch = byId(w, m.chosenId);
      if (ch && ch.dead <= 0) ch.score += CFG.score.survive;
      m.phase = 'roundEnd'; m.timer = CFG.roundEndTime;
      announce(w, ch ? `Раунд окончен! ${ch.name} выстоял(а) +${CFG.score.survive}` : 'Раунд окончен!');
    }
  } else if (m.phase === 'roundEnd') {
    m.timer -= dt;
    if (m.timer <= 0) { if (m.round >= CFG.rounds) { m.phase = 'end'; return; } nextRound(w); }
  }
  const canAct = m.phase === 'play' || m.phase === 'lobby';

  for (const p of w.players) {
    p.px = p.x; p.py = p.y;
    p.inv = Math.max(0, p.inv - dt); p.cdA = Math.max(0, p.cdA - dt); p.cdB = Math.max(0, p.cdB - dt);
    p.slowT = Math.max(0, p.slowT - dt); p.attackT = Math.max(0, p.attackT - dt); p.noDmgT += dt;
    if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0) respawn(w, p); continue; }
    const inp = inputs[p.id] || {};
    const ch = isChosen(w, p), pw = ch ? CFG.powers[p.power] : null;
    let speed = ch ? CFG.chosen.speed * pw.speedMul : CFG.hunter.speed;
    if (p.slowT > 0) speed *= 1 - CFG.powers.ice.slow;
    const mx = Math.max(-1, Math.min(1, inp.mx || 0));
    if (mx) p.facing = Math.sign(mx);

    if (canAct && m.phase !== 'lobby') {
      if (inp.a && p.cdA <= 0) attackA(w, p);
      if (inp.b && p.cdB <= 0) {
        if (ch) attackB(w, p);
        else { p.dashT = CFG.dashTime; p.cdB = CFG.dashCd; p.inv = Math.max(p.inv, CFG.dashInv); }
      }
    } else if (inp.b && p.cdB <= 0 && !ch) { p.dashT = CFG.dashTime; p.cdB = CFG.dashCd; }
    if (inp.a && m.phase === 'lobby') p.attackT = 0.25;

    if (p.dashT > 0) { p.dashT -= dt; p.vx = p.facing * CFG.dashSpeed; p.vy = 0; }
    else {
      p.vx = approach(p.vx, mx * speed, (mx ? CFG.accel : CFG.friction) * dt);
      p.vy += CFG.gravity * dt;
    }
    p.coyT = p.onGround ? CFG.coyote : Math.max(0, p.coyT - dt);
    p.bufT = inp.jump ? CFG.jumpBuffer : Math.max(0, p.bufT - dt);
    if ((inp.my || 0) > 0.6 && inp.jump) { p.dropT = 0.25; p.bufT = 0; }
    if (p.bufT > 0 && p.coyT > 0) { p.vy = -CFG.jumpVel * (ch ? 0.95 : 1); p.bufT = 0; p.coyT = 0; p.onGround = false; }
    if (!inp.jumpHeld && !p.slam && p.vy < -120 && p.vy > -CFG.jumpVel - 1) p.vy = -120;
    p.dropT = Math.max(0, p.dropT - dt);

    const oldY = p.y;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.x = Math.max(4, Math.min(CFG.W - 4, p.x));
    const wasGround = p.onGround; p.onGround = false;
    if (p.vy >= 0) {
      for (const pl of CFG.platforms) {
        if (!pl.solid && p.dropT > 0) continue;
        if (p.x > pl.x - 3 && p.x < pl.x + pl.w + 3 && oldY <= pl.y + 0.01 && p.y >= pl.y) {
          p.y = pl.y; p.vy = 0; p.onGround = true; break;
        }
      }
    }
    if (p.onGround && p.slam) {
      p.slam = false;
      const g = CFG.powers.giant;
      w.fx.push({ k: 'ring', x: p.x, y: p.y - 6, r: g.bR, c: g.color, t: 0.35, ttl: 0.35 });
      areaHit(w, p, p.x, p.y - 6, g.bR, g.bDmg, g.color, 120);
    }
    p.animT += dt;
    if (ch && m.phase === 'play') {
      if (p.noDmgT > CFG.chosen.regenDelay) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * CFG.chosen.regen * dt);
      p.stats.chosenTime += dt;
      const add = Math.min(CFG.score.perSec * dt, CFG.score.maxPerLife - p.lifeScore);
      if (add > 0) { p.lifeScore += add; p.score += add; }
    }
    if (p.y > CFG.fallY) kill(w, p, null);
  }

  // снаряды
  for (const pr of w.projs) {
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.ttl -= dt;
    if (pr.y > GROUND.y && pr.x > GROUND.x && pr.x < GROUND.x + GROUND.w) pr.ttl = 0;
    if (pr.team === 'h') for (const wl of w.walls)
      if (pr.x > wl.x - pr.r && pr.x < wl.x + wl.w + pr.r && pr.y > wl.y && pr.y < wl.y + wl.h) { pr.ttl = 0; w.fx.push({ k: 'hit', x: pr.x, y: pr.y, c: '#8ee8ff', t: 0.2, ttl: 0.2 }); }
    if (pr.ttl <= 0) continue;
    const src = byId(w, pr.owner);
    for (const q of w.players) {
      if (q.dead > 0 || q.id === pr.owner) continue;
      const qc = isChosen(w, q);
      if ((pr.team === 'h') !== qc) continue;
      const hw = hitW(q) / 2 + pr.r * (pr.team === 'h' ? 1.2 : 1), h = hitH(q);
      if (pr.x > q.x - hw && pr.x < q.x + hw && pr.y > q.y - h - pr.r && pr.y < q.y + pr.r) {
        damage(w, q, pr.dmg, src, { c: pr.c, slow: pr.slow });
        if (pr.kind === 'fire') w.fx.push({ k: 'ring', x: pr.x, y: pr.y, r: 12, c: pr.c, t: 0.25, ttl: 0.25 });
        pr.ttl = 0; break;
      }
    }
  }
  w.projs = w.projs.filter(p => p.ttl > 0);

  // телеграфы атак
  for (const t of w.teles) {
    t.t -= dt;
    if (t.t > 0) continue;
    const o = byId(w, t.owner); if (!o || o.dead > 0 || !isChosen(w, o)) continue;
    if (t.k === 'ring') {
      w.fx.push({ k: 'ring', x: o.x, y: o.y - 10, r: t.r, c: t.c, t: 0.35, ttl: 0.35 });
      areaHit(w, o, o.x, o.y - 10, t.r, t.dmg, t.c);
    } else if (t.k === 'cone') {
      const r = coneRect(o);
      w.fx.push({ k: 'rect', ...r, c: t.c, t: 0.2, ttl: 0.2 });
      for (const q of w.players) {
        if (q === o || isChosen(w, q) || q.dead > 0) continue;
        if (q.x + 4 > r.x && q.x - 4 < r.x + r.w && q.y > r.y && q.y - hitH(q) < r.y + r.h)
          damage(w, q, t.dmg, o, { c: t.c, kb: CFG.powers.giant.aKb, dir: o.facing });
      }
    }
  }
  w.teles = w.teles.filter(t => t.t > 0);
  for (const wl of w.walls) wl.t -= dt;
  w.walls = w.walls.filter(x => x.t > 0);
  for (const f of w.fx) f.t -= dt;
  w.fx = w.fx.filter(f => f.t > 0);
}
