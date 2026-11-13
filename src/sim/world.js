// Симуляция без DOM: физика, бой, силы и ульты, бонусы, события карт, раунды, очки
import { CFG } from '../config.js';

const POWERS = Object.keys(CFG.powers);
const rnd = a => a[Math.floor(Math.random() * a.length)];
const rr = (a, b) => a + Math.random() * (b - a);
export const byId = (w, id) => w.players.find(p => p.id === id);
export const isChosen = (w, p) => !!p && w.match.chosenId === p.id;
export const hitH = p => 21 * p.scale;
export const hitW = p => 10 * p.scale;
export const mapOf = w => CFG.maps[w.mapIdx];

const PLAT = [];
export function platforms(i) {
  if (!PLAT[i]) {
    const m = CFG.maps[i];
    PLAT[i] = [...m.solids.map(s => ({ ...s, h: 12, solid: true })), ...m.plats.map(s => ({ ...s, h: 5 }))];
  }
  return PLAT[i];
}
// верх ближайшей опоры под точкой (или null — пропасть)
export function supportAt(w, x, y) {
  let best = null;
  for (const pl of platforms(w.mapIdx)) if (x >= pl.x && x <= pl.x + pl.w && pl.y >= y - 1 && (best === null || pl.y < best)) best = pl.y;
  return best;
}

function fx(w, o) { o.id = ++w.fxId; o.ttl = o.ttl || 0.4; o.t = o.ttl; w.fx.push(o); return o; }

export function createWorld(mapIdx = 0) {
  return { time: 0, mapIdx, mapStart: 0, players: [], projs: [], teles: [], walls: [], pickups: [], fx: [], fxId: 0,
    slow: 0, pickT: CFG.pickups.first, hazard: { phase: 'idle', t: CFG.hazards.first, k: null, dir: 1, data: [], hit: [] },
    match: { phase: 'lobby', round: 0, timer: 0, chosenId: null, msg: '', msgT: 0, banner: null, feed: [] } };
}

export function addPlayer(w, { id, name, color, label, isBot, hat }) {
  const p = { id, name, color, label, isBot: !!isBot, hat: hat || 'none', seed: Math.random() * 10,
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, facing: 1, onGround: false, airJumps: 1,
    hp: CFG.hunter.hp, maxHp: CFG.hunter.hp, dead: 0, inv: 0, cdA: 0, cdB: 0, dashT: 0, slowT: 0, frozenT: 0,
    attackT: 0, hitT: 0, launchT: 0, coyT: 0, bufT: 0, dropT: 0, animT: 0, score: 0, dmgAcc: 0, lifeScore: 0,
    noDmgT: 0, slam: false, power: null, scale: CFG.hunter.scale, ult: 0, shotN: 0,
    buffs: { triple: 0, speed: 0, shield: 0, bomb: 0 }, streak: { n: 0, t: -9 }, dmgLog: {},
    stats: { dmg: 0, chosenTime: 0, kills: 0 } };
  w.players.push(p); placeAtSpawn(w, p); return p;
}

export function removePlayer(w, id) {
  const p = byId(w, id); if (!p) return;
  w.players = w.players.filter(q => q !== p);
  if (w.match.chosenId === id && w.match.phase !== 'lobby' && w.players.length) makeChosen(w, topRecentDamager(w, p) || rnd(w.players));
}

function say(w, msg, t = 2.5) { w.match.msg = msg; w.match.msgT = t; }
function banner(w, text, sub, color, t = 2.2) { w.match.banner = { text, sub, color, t, ttl: t }; }
function feed(w, a, ac, b, bc, icon) { w.match.feed.push({ a, ac, b, bc, icon, t: w.time }); if (w.match.feed.length > 4) w.match.feed.shift(); }

function placeAtSpawn(w, p) {
  const ch = byId(w, w.match.chosenId);
  const sp = mapOf(w).spawns.map(s => [s, ch && ch !== p ? Math.abs(s[0] - ch.x) + Math.abs(s[1] - ch.y) : Math.random()])
    .sort((a, b) => b[1] - a[1]);
  const s = sp[Math.floor(Math.random() * Math.min(2, sp.length))][0];
  p.x = p.px = s[0]; p.y = p.py = s[1]; p.vx = p.vy = 0; p.onGround = true; p.airJumps = 1;
}

function makeHunter(p) { p.power = null; p.scale = CFG.hunter.scale; p.maxHp = CFG.hunter.hp; p.slam = false; p.dmgLog = {}; p.ult = 0; }

function makeChosen(w, p) {
  const key = rnd(POWERS), pw = CFG.powers[key];
  for (const q of w.players) if (q !== p && q.power) makeHunter(q);
  p.power = key; p.scale = pw.scale || CFG.chosen.scale;
  p.maxHp = Math.round(CFG.chosen.hpPer * Math.max(1, w.players.length - 1) * pw.hpMul);
  p.hp = p.maxHp; p.inv = CFG.chosen.swapInv; p.cdA = p.cdB = 0; p.lifeScore = 0; p.dmgLog = {}; p.slam = false;
  p.ult = 0; p.frozenT = 0; p.slowT = 0; p.buffs = { triple: 0, speed: 0, shield: 0, bomb: 0 };
  if (p.dead > 0) { p.dead = 0; placeAtSpawn(w, p); }
  w.match.chosenId = p.id;
  fx(w, { k: 'transform', x: p.x, y: p.y - 14, c: pw.color, ttl: 0.9, shake: 6, snd: 'transform' });
  banner(w, p.name, `ИЗБРАННЫЙ · ${pw.icon} ${pw.name.toUpperCase()}`, pw.color);
}

export function startMatch(w) {
  for (const p of w.players) { p.score = 0; p.dmgAcc = 0; p.stats = { dmg: 0, chosenTime: 0, kills: 0 }; }
  w.match.round = 0; w.match.feed = []; w.mapStart = Math.floor(Math.random() * CFG.maps.length);
  nextRound(w);
}

function nextRound(w) {
  const m = w.match; m.round++;
  w.mapIdx = (w.mapStart + m.round - 1) % CFG.maps.length;
  w.projs = []; w.teles = []; w.walls = []; w.pickups = []; w.pickT = CFG.pickups.first;
  w.hazard = { phase: 'idle', t: CFG.hazards.first, k: null, dir: 1, data: [], hit: [] };
  m.chosenId = null;
  for (const p of w.players) {
    makeHunter(p); p.hp = p.maxHp; p.dead = 0; p.inv = 0; p.cdA = p.cdB = 0; p.slowT = 0; p.frozenT = 0;
    p.buffs = { triple: 0, speed: 0, shield: 0, bomb: 0 };
  }
  let ch;
  if (m.round === 1) ch = rnd(w.players);
  else { const min = Math.min(...w.players.map(p => p.score)); ch = rnd(w.players.filter(p => p.score === min)); }
  for (const p of w.players) placeAtSpawn(w, p);
  makeChosen(w, ch);
  banner(w, mapOf(w).name.toUpperCase(), `РАУНД ${m.round} ИЗ ${CFG.rounds} · ${ch.name} — ИЗБРАННЫЙ`, '#ffd23f', 2.6);
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
  if (t.buffs.shield > 0) {
    const ab = Math.min(t.buffs.shield, a); t.buffs.shield -= ab; a -= ab;
    fx(w, { k: 'shield', x: t.x, y: t.y - hitH(t) / 2, r: 12 * t.scale, c: '#4dc3ff', ttl: 0.3, snd: 'shield' });
    if (a <= 0) return true;
  }
  t.hp -= a; t.noDmgT = 0; if (t.hitT <= 0) t.hitT = 0.1;
  if (src) {
    src.stats.dmg += a;
    if (isChosen(w, src)) src.ult = Math.min(CFG.chosen.ultMax, src.ult + a * CFG.chosen.ultPerDmg);
    if (chosenT) {
      const e = t.dmgLog[src.id];
      t.dmgLog[src.id] = { amt: (e && e.t > w.time - 5 ? e.amt : 0) + a, t: w.time };
      src.dmgAcc += a;
      while (src.dmgAcc >= 10) { src.dmgAcc -= 10; src.score += CFG.score.per10dmg; }
    }
  }
  if (o.kb) { t.vx = o.kb * (o.dir || 1); t.vy = Math.min(t.vy, -170); t.onGround = false; t.launchT = 0.4; }
  if (o.launch) { t.vy = -o.launch; t.onGround = false; t.launchT = 0.5; }
  if (o.slow) t.slowT = Math.max(t.slowT, o.slow);
  if (o.freeze) { t.frozenT = o.freeze; fx(w, { k: 'freeze', x: t.x, y: t.y - hitH(t) / 2, c: '#8ee8ff', ttl: 0.3 }); }
  const big = a >= 20;
  fx(w, { k: 'hit', x: t.x, y: t.y - hitH(t) / 2, c: o.c || '#fff', ttl: 0.25, snd: o.snd || (big ? 'hitBig' : 'hit'), shake: big ? 3 : chosenT ? 0.6 : 1.5 });
  fx(w, { k: 'num', x: t.x + rr(-4, 4), y: t.y - hitH(t) - 4, v: Math.round(a), c: chosenT ? '#ffffff' : '#ff6b7a', big, ttl: 0.8 });
  if (t.hp <= 0) kill(w, t, src);
  return true;
}

function kill(w, t, src) {
  const wasChosen = isChosen(w, t);
  t.hp = 0; t.dead = CFG.hunterRespawn; t.vx = t.vy = 0; t.slam = false; t.frozenT = 0;
  t.buffs = { triple: 0, speed: 0, shield: 0, bomb: 0 };
  fx(w, { k: 'death', x: t.x, y: Math.min(t.y, 250) - 10, c: t.color, big: wasChosen, ttl: 0.8, shake: wasChosen ? 9 : 4, snd: wasChosen ? 'bigDeath' : 'death' });
  if (wasChosen) {
    let killer = src && src !== t ? src : null;
    if (killer) { killer.score += CFG.score.kill; killer.stats.kills++; feed(w, killer.name, killer.color, t.name, t.color, '👑'); }
    else { killer = topRecentDamager(w, t); feed(w, '☠', '#aaa', t.name, t.color, '👑'); }
    w.slow = CFG.slowmo;
    makeHunter(t);
    const others = w.players.filter(q => q !== t);
    if (!others.length) { t.dead = 0; placeAtSpawn(w, t); makeChosen(w, t); return; }
    makeChosen(w, killer || rnd(others));
  } else if (src && isChosen(w, src)) {
    src.score += CFG.score.hunterKill; src.stats.kills++;
    feed(w, src.name, src.color, t.name, t.color, '⚔');
    const s = src.streak;
    s.n = w.time - s.t < 4 ? s.n + 1 : 1; s.t = w.time;
    if (s.n === 2) say(w, `${src.name}: ДВОЙНОЕ УБИЙСТВО!`);
    else if (s.n === 3) say(w, `${src.name}: ТРОЙНОЕ УБИЙСТВО!`);
    else if (s.n >= 4) say(w, `${src.name}: НЕУДЕРЖИМ!`);
  } else feed(w, '☠', '#aaa', t.name, t.color, '⚔');
}

function respawn(w, p) {
  placeAtSpawn(w, p); p.hp = p.maxHp; p.inv = CFG.spawnInv; p.dead = 0;
  fx(w, { k: 'spawn', x: p.x, y: p.y - 10, c: p.color, ttl: 0.5, snd: 'spawn' });
}

// ---------- атаки ----------
function aimAt(p, t, range) {
  if (t && t.dead <= 0 && (t.x - p.x) * p.facing > 0) {
    const dx = t.x - p.x, dy = (t.y - hitH(t) / 2) - (p.y - hitH(p) * 0.6), d = Math.hypot(dx, dy);
    if (d < range && Math.abs(dy) < d * 0.9) return [dx / d, dy / d];
  }
  return [p.facing, 0];
}
function nearestHunter(w, p, range, from = p, exclude = []) {
  let best = null, bd = range;
  for (const q of w.players) {
    if (q === p || isChosen(w, q) || q.dead > 0 || exclude.includes(q)) continue;
    const d = Math.hypot(q.x - from.x, (q.y - 10) - (from.y - 10));
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
  w.projs.push({ x: p.x + p.facing * 6 * p.scale, y: p.y - hitH(p) * 0.6, vx: dir[0] * spd, vy: dir[1] * spd,
    r, dmg, owner: p.id, team: isChosen(w, p) ? 'c' : 'h', ttl: range / spd, kind, c, ...extra });
}
function areaHit(w, owner, cx, cy, r, dmg, c, o = {}) {
  for (const q of w.players) {
    if (q === owner || isChosen(w, q) || q.dead > 0) continue;
    if (Math.hypot(q.x - cx, (q.y - 10) - cy) <= r + 5) damage(w, q, dmg, owner, { c, dir: Math.sign(q.x - cx) || 1, ...o });
  }
}
const rot = (d, a) => [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a)];

function attackA(w, p) {
  p.attackT = 0.22;
  if (!isChosen(w, p)) {
    const H = CFG.hunter;
    p.cdA = H.shotCd;
    if (p.buffs.bomb > 0) {
      p.buffs.bomb--;
      w.projs.push({ x: p.x + p.facing * 6, y: p.y - 14, vx: p.facing * 170, vy: -230, grav: true, r: 3, dmg: CFG.pickups.bombDmg,
        R: CFG.pickups.bombR, owner: p.id, team: 'h', ttl: 1.5, kind: 'bomb', c: '#ff8c3a' });
      fx(w, { k: 'muzzle', x: p.x + p.facing * 8, y: p.y - 14, dir: p.facing, c: '#ff8c3a', ttl: 0.1, snd: 'throw' });
      return;
    }
    p.shotN++;
    const charged = p.shotN % H.chargeEvery === 0;
    const dir = aimAt(p, byId(w, w.match.chosenId), H.aimRange);
    const spread = p.buffs.triple > 0 ? [-0.16, 0, 0.16] : [0];
    for (const a of spread) shoot(w, p, rot(dir, a), H.shotSpeed * (charged ? 1.15 : 1), H.shotDmg * (charged ? H.chargeMul : 1),
      charged ? 3 : 2, charged ? 'big' : 'shot', p.color, H.shotRange);
    fx(w, { k: 'muzzle', x: p.x + p.facing * 8, y: p.y - 13, dir: p.facing, c: p.color, ttl: 0.1, snd: charged ? 'charge' : 'shot' });
    return;
  }
  const pw = CFG.powers[p.power]; p.cdA = pw.aCd;
  if (p.power === 'fire') {
    shoot(w, p, aimAt(p, frontHunter(w, p, 220), 220), pw.aSpeed, pw.aDmg, 5, 'fire', pw.color, 280);
    fx(w, { k: 'muzzle', x: p.x + p.facing * 12, y: p.y - 18, dir: p.facing, c: pw.color, ttl: 0.1, snd: 'fire' });
  } else if (p.power === 'ice') {
    shoot(w, p, aimAt(p, frontHunter(w, p, 230), 230), pw.aSpeed, pw.aDmg, 3, 'ice', pw.color, 250, { slow: pw.slowT });
    fx(w, { k: 'muzzle', x: p.x + p.facing * 12, y: p.y - 18, dir: p.facing, c: pw.color, ttl: 0.1, snd: 'iceShot' });
  } else if (p.power === 'bolt') {
    let from = { x: p.x, y: p.y - 8 }, hit = [], t = nearestHunter(w, p, pw.aRange);
    if (!t) { fx(w, { k: 'bolt', x1: p.x, y1: p.y - 18, x2: p.x + p.facing * 45, y2: p.y - 18 + rr(-8, 8), c: pw.color, ttl: 0.15, snd: 'zapSmall' }); return; }
    for (let i = 0; i <= pw.aJumps && t; i++) {
      fx(w, { k: 'bolt', x1: from.x, y1: from.y - 10, x2: t.x, y2: t.y - 10, c: pw.color, ttl: 0.22, snd: i ? null : 'zap' });
      damage(w, t, pw.aDmg, p, { c: pw.color, snd: 'zapHit' }); hit.push(t); from = t;
      t = nearestHunter(w, p, pw.aJump, from, hit);
    }
  } else if (p.power === 'giant') {
    w.teles.push({ k: 'cone', owner: p.id, t: pw.aTele, ttl: pw.aTele, dmg: pw.aDmg, c: pw.color });
    fx(w, { k: 'charge', x: p.x, y: p.y - 20, c: pw.color, ttl: 0.3, snd: 'windup' });
  }
}

function attackB(w, p) {
  const pw = CFG.powers[p.power];
  const cd = pw.bCd * (w.players.length >= 5 ? CFG.bigLobbyCdMul : 1);
  if (p.power === 'giant') {
    if (!p.onGround) return;
    p.vy = -pw.bJump; p.onGround = false; p.slam = true; p.launchT = 1;
    fx(w, { k: 'dust', x: p.x, y: p.y, c: '#d8c8b0', ttl: 0.3, n: 10, snd: 'bigJump' });
  } else if (p.power === 'fire') {
    w.teles.push({ k: 'ring', owner: p.id, r: pw.bR, t: pw.bTele, ttl: pw.bTele, dmg: pw.bDmg, c: pw.color });
    fx(w, { k: 'charge', x: p.x, y: p.y - 14, c: pw.color, ttl: 0.4, snd: 'windup' });
  } else if (p.power === 'bolt') {
    const ox = p.x, oy = p.y;
    p.x = Math.max(16, Math.min(CFG.W - 16, p.x + p.facing * pw.bDist)); p.px = p.x;
    fx(w, { k: 'bolt', x1: ox, y1: oy - 14, x2: p.x, y2: p.y - 14, c: pw.color, ttl: 0.3, snd: 'teleport' });
    fx(w, { k: 'ring', x: p.x, y: p.y - 12, r: pw.bR, c: pw.color, ttl: 0.35, shake: 3 });
    areaHit(w, p, p.x, p.y - 12, pw.bR, pw.bDmg, pw.color, { snd: 'zapHit' });
  } else if (p.power === 'ice') {
    w.walls.push({ x: p.x + p.facing * 26 - 4, y: p.y - pw.wallH, w: 8, h: pw.wallH, t: pw.wallT, ttl: pw.wallT });
    fx(w, { k: 'wall', x: p.x + p.facing * 26, y: p.y, c: pw.color, ttl: 0.3, snd: 'iceWall', shake: 2 });
  }
  p.cdB = cd; p.attackT = 0.25;
}

function ultimate(w, p) {
  const pw = CFG.powers[p.power];
  p.ult = 0; p.attackT = 0.4;
  fx(w, { k: 'ultflash', x: p.x, y: p.y - 20, c: pw.color, ttl: 0.6, shake: 5, snd: 'ult' });
  banner(w, pw.ultName.toUpperCase() + '!', p.name, pw.color, 1.6);
  const hunters = w.players.filter(q => q !== p && q.dead <= 0);
  if (p.power === 'fire') {
    for (let i = 0; i < pw.uN; i++) {
      const tg = hunters.length && Math.random() < 0.75 ? rnd(hunters) : null;
      const x = Math.max(20, Math.min(CFG.W - 20, tg ? tg.x + rr(-28, 28) : rr(30, CFG.W - 30)));
      const y = supportAt(w, x, tg ? tg.y - 30 : 0) ?? 262;
      w.teles.push({ k: 'meteor', fixed: true, x, y, r: pw.uR, t: pw.uTele + i * pw.uSpan / pw.uN, ttl: pw.uTele, dmg: pw.uDmg, c: pw.color, owner: p.id });
    }
  } else if (p.power === 'bolt') {
    for (const h of hunters) for (let s = 0; s < pw.uStrikes; s++)
      w.teles.push({ k: 'strike', fixed: true, track: h.id, x: h.x, y: h.y, r: pw.uR, t: pw.uTele + s * pw.uGap, ttl: pw.uTele, dmg: pw.uDmg, c: pw.color, owner: p.id });
  } else if (p.power === 'ice') {
    fx(w, { k: 'blizzard', x: p.x, y: p.y - 20, r: pw.uR, c: pw.color, ttl: 1.6, snd: 'blizzard', shake: 4 });
    areaHit(w, p, p.x, p.y - 10, pw.uR, pw.uDmg, pw.color, { freeze: pw.uFreeze, slow: pw.uSlow, snd: 'freeze' });
  } else if (p.power === 'giant') {
    fx(w, { k: 'quake', x: p.x, y: p.y, c: pw.color, ttl: 1.2, shake: 12, snd: 'quake' });
    for (const q of hunters) if (q.onGround) damage(w, q, pw.uDmg, p, { c: pw.color, launch: pw.uLaunch });
  }
}

function coneRect(p) {
  const pw = CFG.powers.giant;
  return { x: p.facing > 0 ? p.x + 4 : p.x - 4 - pw.aW, y: p.y - pw.aH, w: pw.aW, h: pw.aH };
}

function explodeBomb(w, pr) {
  const src = byId(w, pr.owner), R = pr.R;
  fx(w, { k: 'boom', x: pr.x, y: pr.y, r: R, c: '#ff8c3a', ttl: 0.45, shake: 4, snd: 'explode' });
  const ch = byId(w, w.match.chosenId);
  if (ch && ch.dead <= 0 && Math.hypot(ch.x - pr.x, (ch.y - hitH(ch) / 2) - pr.y) < R + hitW(ch)) damage(w, ch, pr.dmg, src, { c: '#ff8c3a' });
}

// ---------- бонусы ----------
function pickType() {
  const W = CFG.pickups.weights; let sum = 0; for (const k in W) sum += W[k];
  let r = Math.random() * sum; for (const k in W) { r -= W[k]; if (r <= 0) return k; } return 'heal';
}
function pickupStep(w, dt) {
  const C = CFG.pickups;
  w.pickT -= dt;
  if (w.pickT <= 0 && w.pickups.length < C.max) {
    w.pickT = C.every;
    const pls = platforms(w.mapIdx);
    for (let i = 0; i < 8; i++) {
      const pl = rnd(pls), x = rr(pl.x + 8, pl.x + pl.w - 8);
      if (w.players.some(q => Math.abs(q.x - x) < 40 && Math.abs(q.y - pl.y) < 30)) continue;
      if (w.pickups.some(q => Math.abs(q.x - x) < 30 && q.y === pl.y)) continue;
      w.pickups.push({ id: ++w.fxId, k: pickType(), x: Math.round(x), y: pl.y, life: C.life });
      fx(w, { k: 'pop', x, y: pl.y - 8, c: '#fff', ttl: 0.3 });
      break;
    }
  }
  for (const pk of w.pickups) {
    pk.life -= dt;
    for (const p of w.players) {
      if (p.dead > 0 || pk.life <= 0) continue;
      if (Math.abs(p.x - pk.x) < 9 + hitW(p) / 2 && p.y > pk.y - 16 && p.y - hitH(p) < pk.y) {
        pk.life = 0;
        const info = CFG.pickupInfo[pk.k];
        if (isChosen(w, p)) {
          p.ult = Math.min(CFG.chosen.ultMax, p.ult + CFG.chosen.ultPickup);
          fx(w, { k: 'pickup', x: pk.x, y: pk.y - 8, c: CFG.powers[p.power].color, label: '+УЛЬТА', ttl: 0.8, snd: 'pickup' });
        } else {
          p.score += CFG.score.pickup;
          if (pk.k === 'heal') p.hp = Math.min(p.maxHp, p.hp + C.heal);
          else if (pk.k === 'triple') p.buffs.triple = C.tripleT;
          else if (pk.k === 'speed') p.buffs.speed = C.speedT;
          else if (pk.k === 'shield') p.buffs.shield = C.shield;
          else if (pk.k === 'bomb') p.buffs.bomb = C.bombs;
          fx(w, { k: 'pickup', x: pk.x, y: pk.y - 8, c: info.color, label: info.name, ttl: 0.8, snd: 'pickup' });
        }
      }
    }
  }
  w.pickups = w.pickups.filter(p => p.life > 0);
}

// ---------- события карт ----------
function hazardStep(w, dt) {
  const H = w.hazard, HZ = CFG.hazards, m = mapOf(w);
  H.t -= dt;
  if (H.phase === 'idle' && H.t <= 0) {
    H.phase = 'warn'; H.t = HZ.warn; H.k = m.hazard; H.hit = [];
    const alive = w.players.filter(p => p.dead <= 0);
    if (H.k === 'wind') H.dir = Math.random() < 0.5 ? -1 : 1;
    else if (H.k === 'geyser') {
      const solids = m.solids; H.data = [];
      for (let i = 0; i < 3; i++) {
        const tg = alive.length && i < 2 ? rnd(alive) : null, s = rnd(solids);
        let x = tg ? tg.x + rr(-12, 12) : rr(s.x + 12, s.x + s.w - 12);
        const y = supportAt(w, x, tg ? tg.y - 2 : 0);
        if (y === null) { x = rr(s.x + 12, s.x + s.w - 12); H.data.push({ x, y: s.y }); } else H.data.push({ x, y });
      }
    } else if (H.k === 'icicles') {
      H.data = [];
      for (let i = 0; i < HZ.icicleN; i++) H.data.push({ x: i < alive.length ? alive[i].x + rr(-10, 10) : rr(30, CFG.W - 30), d: rr(0, 0.6) });
    }
    fx(w, { k: 'warn', x: 0, y: 0, ttl: 0.3, snd: 'warn' });
    say(w, `⚠ ${m.hazardName}!`, HZ.warn);
  } else if (H.phase === 'warn' && H.t <= 0) {
    H.phase = 'active';
    if (H.k === 'wind') { H.t = HZ.windT; fx(w, { k: 'gust', x: 0, y: 0, ttl: 0.3, snd: 'wind' }); }
    else if (H.k === 'geyser') { H.t = HZ.geyserT; for (const g of H.data) fx(w, { k: 'boom', x: g.x, y: g.y, r: 16, c: '#ff7a1a', ttl: 0.4, shake: 3, snd: 'geyser' }); }
    else if (H.k === 'icicles') {
      H.t = 2;
      for (const ic of H.data) w.projs.push({ x: ic.x, y: -10 - ic.d * 150, vx: 0, vy: 0, grav: true, r: 3, dmg: HZ.icicleDmg, team: 'x', ttl: 2.5, kind: 'icicle', c: '#cfefff' });
    }
  } else if (H.phase === 'active') {
    if (H.k === 'geyser') {
      for (const g of H.data) for (const p of w.players) {
        if (p.dead > 0 || p.inv > 0 || H.hit.includes(p.id + g.x)) continue;
        if (Math.abs(p.x - g.x) < 10 + hitW(p) / 2 && p.y <= g.y + 1 && p.y > g.y - 130) {
          H.hit.push(p.id + g.x); damage(w, p, HZ.geyserDmg, null, { c: '#ff7a1a', launch: 380, snd: 'burn' });
        }
      }
    }
    if (H.t <= 0) { H.phase = 'idle'; H.t = HZ.every; H.data = []; }
  }
}

const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);

// ---------- главный шаг ----------
export function step(w, inputs, rdt) {
  const m = w.match;
  let dt = rdt;
  if (w.slow > 0) { w.slow -= rdt; dt = rdt * CFG.slowmoScale; }
  w.time += dt;
  m.msgT = Math.max(0, m.msgT - rdt);
  if (m.banner) { m.banner.t -= rdt; if (m.banner.t <= 0) m.banner = null; }
  if (m.phase === 'end') return;
  if (m.phase === 'countdown') {
    const before = Math.ceil(m.timer); m.timer -= dt;
    if (Math.ceil(m.timer) !== before && m.timer > 0) fx(w, { k: 'tick', x: 0, y: 0, ttl: 0.2, snd: 'count' });
    if (m.timer <= 0) { m.phase = 'play'; m.timer = CFG.roundTime; fx(w, { k: 'go', x: 0, y: 0, ttl: 0.2, snd: 'go' }); }
  } else if (m.phase === 'play') {
    m.timer -= dt;
    if (m.timer <= 0) {
      const ch = byId(w, m.chosenId);
      if (ch && ch.dead <= 0) ch.score += CFG.score.survive;
      m.phase = 'roundEnd'; m.timer = CFG.roundEndTime;
      banner(w, 'РАУНД ОКОНЧЕН', ch ? `${ch.name} выстоял(а) +${CFG.score.survive}` : '', '#ffd23f', 3);
      fx(w, { k: 'end', x: 0, y: 0, ttl: 0.2, snd: 'roundEnd' });
    }
  } else if (m.phase === 'roundEnd') {
    m.timer -= dt;
    if (m.timer <= 0) { if (m.round >= CFG.rounds) { m.phase = 'end'; fx(w, { k: 'win', x: 0, y: 0, ttl: 1, snd: 'win' }); return; } nextRound(w); }
  }
  const play = m.phase === 'play';
  if (play) { pickupStep(w, dt); hazardStep(w, dt); }
  const map = mapOf(w), plats = platforms(w.mapIdx);
  const wind = play && w.hazard.k === 'wind' && w.hazard.phase === 'active' ? w.hazard.dir * CFG.hazards.windSpeed : 0;

  for (const p of w.players) {
    p.px = p.x; p.py = p.y;
    for (const k of ['inv', 'cdA', 'cdB', 'slowT', 'attackT', 'hitT', 'frozenT', 'launchT']) p[k] = Math.max(0, p[k] - dt);
    p.buffs.triple = Math.max(0, p.buffs.triple - dt); p.buffs.speed = Math.max(0, p.buffs.speed - dt);
    p.noDmgT += dt;
    if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0 && m.phase !== 'roundEnd') respawn(w, p); continue; }
    const frozen = p.frozenT > 0;
    const inp = frozen ? {} : (inputs[p.id] || {});
    const ch = isChosen(w, p), pw = ch ? CFG.powers[p.power] : null;
    let speed = ch ? CFG.chosen.speed * pw.speedMul : CFG.hunter.speed;
    if (p.buffs.speed > 0) speed *= CFG.pickups.speedMul;
    if (p.slowT > 0) speed *= 1 - CFG.powers.ice.slow;
    const mx = Math.max(-1, Math.min(1, inp.mx || 0));
    if (mx && p.dashT <= 0) p.facing = Math.sign(mx);

    if (play) {
      if (inp.a && p.cdA <= 0) attackA(w, p);
      if (inp.b && p.cdB <= 0) {
        if (ch) attackB(w, p);
        else { p.dashT = CFG.dashTime; p.cdB = CFG.dashCd; p.inv = Math.max(p.inv, CFG.dashInv); fx(w, { k: 'dash', x: p.x, y: p.y - 10, dir: p.facing, c: p.color, ttl: 0.3, snd: 'dash' }); }
      }
      if (inp.c && ch && p.ult >= CFG.chosen.ultMax) ultimate(w, p);
    } else if (inp.b && p.cdB <= 0 && !ch && m.phase !== 'roundEnd') { p.dashT = CFG.dashTime; p.cdB = CFG.dashCd; fx(w, { k: 'dash', x: p.x, y: p.y - 10, dir: p.facing, c: p.color, ttl: 0.3, snd: 'dash' }); }
    if (inp.a && !play) p.attackT = 0.22;

    if (p.dashT > 0) { p.dashT -= dt; p.vx = p.facing * CFG.dashSpeed; p.vy = 0; }
    else {
      const fr = p.onGround ? map.friction : 1;
      const acc = p.onGround ? (mx ? CFG.accel * Math.max(0.45, fr) : CFG.friction * fr) : CFG.airAccel;
      if (p.launchT <= 0 || mx) p.vx = approach(p.vx, mx * speed, acc * dt);
      const ff = (inp.my || 0) > 0.6 && p.vy > 0 && !p.onGround;
      p.vy = Math.min(p.vy + CFG.gravity * dt * (ff ? CFG.fastFallMul : 1), CFG.maxFall * (ff ? 1.3 : 1));
    }
    p.coyT = p.onGround ? CFG.coyote : Math.max(0, p.coyT - dt);
    p.bufT = inp.jump ? CFG.jumpBuffer : Math.max(0, p.bufT - dt);
    if ((inp.my || 0) > 0.6 && inp.jump && p.onGround && !plats.find(pl => pl.solid && Math.abs(pl.y - p.y) < 1 && p.x >= pl.x - 3 && p.x <= pl.x + pl.w + 3)) { p.dropT = 0.25; p.bufT = 0; p.onGround = false; }
    if (p.bufT > 0) {
      if (p.coyT > 0) { p.vy = -CFG.jumpVel * (ch ? 0.95 : 1); p.bufT = 0; p.coyT = 0; p.onGround = false; fx(w, { k: 'dust', x: p.x, y: p.y, c: '#ffffff', n: 4, ttl: 0.3, snd: 'jump' }); }
      else if (p.airJumps > 0 && !p.slam) { p.vy = -CFG.djumpVel * (ch ? 0.95 : 1); p.airJumps--; p.bufT = 0; p.launchT = 0; fx(w, { k: 'djump', x: p.x, y: p.y, c: '#ffffff', ttl: 0.3, snd: 'djump' }); }
    }
    if (!inp.jumpHeld && !p.slam && p.launchT <= 0 && p.vy < -140 && p.vy > -CFG.jumpVel - 1) p.vy = -140;
    p.dropT = Math.max(0, p.dropT - dt);

    const oldY = p.y, vyImpact = p.vy;
    p.x += (p.vx + wind) * dt; p.y += p.vy * dt;
    p.x = Math.max(4, Math.min(CFG.W - 4, p.x));
    const wasGround = p.onGround; p.onGround = false;
    if (p.vy >= 0) {
      for (const pl of plats) {
        if (!pl.solid && p.dropT > 0) continue;
        if (p.x > pl.x - 3 && p.x < pl.x + pl.w + 3 && oldY <= pl.y + 0.01 && p.y >= pl.y) {
          p.y = pl.y; p.vy = 0; p.onGround = true; p.airJumps = 1; break;
        }
      }
    }
    if (p.onGround && !wasGround && vyImpact > 330) fx(w, { k: 'dust', x: p.x, y: p.y, c: '#e8e0d0', n: Math.min(12, vyImpact / 50 | 0), ttl: 0.3, snd: 'land' });
    if (p.onGround && p.slam) {
      p.slam = false;
      const g = CFG.powers.giant;
      fx(w, { k: 'ring', x: p.x, y: p.y - 6, r: g.bR, c: g.color, ttl: 0.4, shake: 7, snd: 'slam' });
      fx(w, { k: 'dust', x: p.x, y: p.y, c: '#d8c8b0', n: 16, ttl: 0.4 });
      areaHit(w, p, p.x, p.y - 6, g.bR, g.bDmg, g.color, { kb: 140 });
    }
    p.animT += dt;
    if (ch && play) {
      if (p.noDmgT > CFG.chosen.regenDelay) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * CFG.chosen.regen * dt);
      p.ult = Math.min(CFG.chosen.ultMax, p.ult + CFG.chosen.ultPerSec * dt);
      p.stats.chosenTime += dt;
      const add = Math.min(CFG.score.perSec * dt, CFG.score.maxPerLife - p.lifeScore);
      if (add > 0) { p.lifeScore += add; p.score += add; }
    }
    if (p.y > CFG.fallY) { fx(w, { k: 'splash', x: p.x, y: 226, c: '#fff', ttl: 0.5, snd: 'splash' }); kill(w, p, null); }
  }

  // снаряды
  for (const pr of w.projs) {
    if (pr.grav) pr.vy += CFG.gravity * 0.8 * dt;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.ttl -= dt;
    if (pr.vy >= 0 || pr.kind !== 'bomb') for (const pl of plats) if (pl.solid && pr.x > pl.x && pr.x < pl.x + pl.w && pr.y > pl.y && pr.y < pl.y + 50) { pr.ttl = 0; break; }
    if (pr.kind === 'icicle' || pr.kind === 'bomb') for (const pl of plats) if (!pl.solid && pr.vy > 0 && pr.x > pl.x && pr.x < pl.x + pl.w && pr.y > pl.y && pr.y < pl.y + 6) { pr.ttl = 0; break; }
    if (pr.team === 'h') for (const wl of w.walls)
      if (pr.x > wl.x - pr.r && pr.x < wl.x + wl.w + pr.r && pr.y > wl.y && pr.y < wl.y + wl.h) { pr.ttl = 0; pr.blocked = true; fx(w, { k: 'hit', x: pr.x, y: pr.y, c: '#8ee8ff', ttl: 0.2, snd: 'block' }); }
    if (pr.ttl > 0) {
      const src = byId(w, pr.owner);
      for (const q of w.players) {
        if (q.dead > 0 || q.id === pr.owner) continue;
        if (pr.team !== 'x' && (pr.team === 'h') !== isChosen(w, q)) continue;
        const hw = hitW(q) / 2 + pr.r * (pr.team === 'h' ? 1.3 : 1), h = hitH(q);
        if (pr.x > q.x - hw && pr.x < q.x + hw && pr.y > q.y - h - pr.r && pr.y < q.y + pr.r) {
          if (pr.kind !== 'bomb') damage(w, q, pr.dmg, src, { c: pr.c, slow: pr.slow, snd: pr.kind === 'fire' ? 'burn' : pr.kind === 'ice' ? 'freeze' : null });
          if (pr.kind === 'fire') fx(w, { k: 'boom', x: pr.x, y: pr.y, r: 14, c: pr.c, ttl: 0.3 });
          pr.ttl = 0; break;
        }
      }
    }
    if (pr.ttl <= 0) {
      if (pr.kind === 'bomb') explodeBomb(w, pr);
      else if (pr.kind === 'icicle') fx(w, { k: 'shatter', x: pr.x, y: pr.y, c: '#cfefff', ttl: 0.3, snd: 'shatter' });
      else if (pr.kind === 'fire' && !pr.blocked) fx(w, { k: 'boom', x: pr.x, y: pr.y, r: 10, c: pr.c, ttl: 0.25 });
      else if (!pr.blocked && pr.y < 260) fx(w, { k: 'puff', x: pr.x, y: pr.y, c: pr.c, ttl: 0.2 });
    }
  }
  w.projs = w.projs.filter(p => p.ttl > 0);

  // телеграфы атак
  for (const t of w.teles) {
    if (t.track) { const h = byId(w, t.track); if (h && h.dead <= 0 && t.t > 0.3) { t.x = h.x; t.y = h.y; } }
    t.t -= dt;
    if (t.t > 0) continue;
    const o = byId(w, t.owner); if (!o || o.dead > 0 || !isChosen(w, o)) continue;
    if (t.k === 'ring') {
      fx(w, { k: 'ring', x: o.x, y: o.y - 12, r: t.r, c: t.c, ttl: 0.4, shake: 5, snd: 'fireRing' });
      fx(w, { k: 'boom', x: o.x, y: o.y - 12, r: t.r * 0.6, c: t.c, ttl: 0.35 });
      areaHit(w, o, o.x, o.y - 12, t.r, t.dmg, t.c, { snd: 'burn' });
    } else if (t.k === 'cone') {
      const r = coneRect(o);
      fx(w, { k: 'rect', ...r, c: t.c, ttl: 0.2, shake: 4, snd: 'smash' });
      fx(w, { k: 'dust', x: r.x + r.w / 2, y: o.y, c: '#d8c8b0', n: 8, ttl: 0.3 });
      for (const q of w.players) {
        if (q === o || isChosen(w, q) || q.dead > 0) continue;
        if (q.x + 5 > r.x && q.x - 5 < r.x + r.w && q.y > r.y && q.y - hitH(q) < r.y + r.h)
          damage(w, q, t.dmg, o, { c: t.c, kb: CFG.powers.giant.aKb, dir: o.facing });
      }
    } else if (t.k === 'meteor') {
      fx(w, { k: 'boom', x: t.x, y: t.y - 4, r: t.r, c: t.c, ttl: 0.45, shake: 4, snd: 'explode' });
      areaHit(w, o, t.x, t.y - 8, t.r, t.dmg, t.c, { launch: 200 });
    } else if (t.k === 'strike') {
      fx(w, { k: 'skybolt', x: t.x, y: t.y, c: t.c, ttl: 0.3, shake: 3, snd: 'thunder' });
      areaHit(w, o, t.x, t.y - 10, t.r, t.dmg, t.c);
    }
  }
  w.teles = w.teles.filter(t => t.t > 0);
  for (const wl of w.walls) wl.t -= dt;
  w.walls = w.walls.filter(x => x.t > 0);
  for (const f of w.fx) f.t -= rdt;
  w.fx = w.fx.filter(f => f.t > 0);
}
