// Симуляция без DOM: физика (движущиеся платформы, батуты), герои и навыки, оружие, 8 сил Избранного,
// зоны (яд, чёрные дыры), турели, бонусы, события карт, раунды, очки
import { CFG } from '../config.js';

const POWERS = Object.keys(CFG.powers);
const rnd = a => a[Math.floor(Math.random() * a.length)];
const rr = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PG = CFG.gravity * 0.8; // гравитация снарядов
export const byId = (w, id) => w.players.find(p => p.id === id);
export const isChosen = (w, p) => !!p && w.match.chosenId === p.id;
export const hitH = p => 21 * p.scale;
export const hitW = p => 10 * p.scale;
export const mapOf = w => CFG.maps[w.mapIdx];
export const heroOf = p => CFG.heroes[p.hero] || CFG.heroes.brawler;
const center = q => ({ x: q.x, y: q.y - hitH(q) / 2 });

// ---------- платформы ----------
const PLAT = [];
function basePlats(i) {
  if (!PLAT[i]) {
    const m = CFG.maps[i];
    PLAT[i] = [...m.solids.map(s => ({ ...s, h: 12, solid: true })), ...m.plats.map(s => ({ ...s, h: 6 })),
      ...(m.movers || []).map(s => ({ ...s, h: 6, mover: true }))];
  }
  return PLAT[i];
}
export function platsAt(mapIdx, t) {
  return basePlats(mapIdx).map(pl => pl.mover ? { ...pl, x: pl.x + Math.sin(t * pl.move.sp) * pl.move.dx, y: pl.y + Math.sin(t * pl.move.sp) * pl.move.dy } : pl);
}
export function supportAt(w, x, y) {
  let best = null;
  for (const pl of platsAt(w.mapIdx, w.time)) if (x >= pl.x && x <= pl.x + pl.w && pl.y >= y - 1 && (best === null || pl.y < best)) best = pl.y;
  return best;
}

function fx(w, o) { o.id = ++w.fxId; o.ttl = o.ttl || 0.4; o.t = o.ttl; w.fx.push(o); return o; }
function say(w, msg, t = 2.5) { w.match.msg = msg; w.match.msgT = t; }
function banner(w, text, sub, color, t = 2.2) { w.match.banner = { text, sub, color, t, ttl: t }; }
function feed(w, a, ac, b, bc, icon) { w.match.feed.push({ a, ac, b, bc, icon, t: w.time }); if (w.match.feed.length > 4) w.match.feed.shift(); }

export function createWorld(mapIdx = 0) {
  return { time: 0, mapIdx, mapOrder: [0], fixedMap: null, players: [], projs: [], teles: [], walls: [], pickups: [], zones: [], turrets: [],
    fx: [], fxId: 0, slow: 0, weaponT: CFG.pickups.first, itemT: 5,
    hazard: { phase: 'idle', t: CFG.hazards.first, k: null, dir: 1, data: [], hit: [], y: 0 },
    match: { phase: 'lobby', round: 0, timer: 0, chosenId: null, msg: '', msgT: 0, banner: null, feed: [] } };
}

export function addPlayer(w, { id, name, color, label, isBot, hat, hero }) {
  const hk = CFG.heroes[hero] ? hero : 'brawler';
  const p = { id, name, color, label, isBot: !!isBot, hat: hat || 'none', hero: hk, seed: Math.random() * 10,
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, facing: 1, onGround: false, airJumps: 1, plat: -1,
    hp: CFG.heroes[hk].hp, maxHp: CFG.heroes[hk].hp, dead: 0, inv: 0, cdA: 0, cdB: 0, dashT: 0, dashMul: 1,
    slowT: 0, frozenT: 0, stunT: 0, attackT: 0, hitT: 0, launchT: 0, coyT: 0, bufT: 0, dropT: 0, animT: 0,
    score: 0, dmgAcc: 0, lifeScore: 0, noDmgT: 0, slam: false, power: null, scale: 1, ult: 0,
    weapon: null, ammo: 0, blockT: 0, invisT: 0, speedT: 0, shield: 0, dotAcc: 0, aimX: 1, aimY: 0,
    timesChosen: 0, streak: { n: 0, t: -9 }, dmgLog: {}, stats: { dmg: 0, chosenTime: 0, kills: 0 } };
  w.players.push(p); placeAtSpawn(w, p); return p;
}

export function removePlayer(w, id) {
  const p = byId(w, id); if (!p) return;
  w.players = w.players.filter(q => q !== p);
  w.turrets = w.turrets.filter(t => t.owner !== id);
  if (w.match.chosenId === id && w.match.phase !== 'lobby' && w.players.length) makeChosen(w, topRecentDamager(w, p) || rnd(w.players));
}

function placeAtSpawn(w, p) {
  const ch = byId(w, w.match.chosenId);
  const sp = mapOf(w).spawns.map(s => [s, ch && ch !== p ? Math.abs(s[0] - ch.x) + Math.abs(s[1] - ch.y) : Math.random()])
    .sort((a, b) => b[1] - a[1]);
  const s = sp[Math.floor(Math.random() * Math.min(3, sp.length))][0];
  p.x = p.px = s[0]; p.y = p.py = s[1]; p.vx = p.vy = 0; p.onGround = true; p.plat = -1; p.airJumps = heroOf(p).airJumps;
}

function resetStatus(p) {
  p.slowT = p.frozenT = p.stunT = p.blockT = p.invisT = p.speedT = 0; p.shield = 0; p.dotAcc = 0; p.slam = false; p.dashT = 0;
}
function makeHunter(p) { p.power = null; p.scale = 1; p.maxHp = heroOf(p).hp; p.slam = false; p.dmgLog = {}; p.ult = 0; }

function dropWeapon(w, p) {
  if (!p.weapon || p.ammo <= 0) { p.weapon = null; p.ammo = 0; return; }
  const y = supportAt(w, p.x, p.y - 4);
  if (y !== null && y - p.y < 80) w.pickups.push({ id: ++w.fxId, k: 'weapon', w: p.weapon, ammo: p.ammo, x: Math.round(p.x), y, life: CFG.pickups.life });
  p.weapon = null; p.ammo = 0;
}

function makeChosen(w, p) {
  const prev = byId(w, w.match.chosenId);
  const choices = POWERS.filter(k => !prev || k !== prev.power);
  const key = rnd(choices), pw = CFG.powers[key];
  for (const q of w.players) if (q !== p && q.power) makeHunter(q);
  dropWeapon(w, p);
  p.power = key; p.scale = pw.scale || CFG.chosen.scale; p.timesChosen++;
  p.maxHp = Math.round(CFG.chosen.hpPer * Math.max(1, w.players.length - 1) * pw.hpMul);
  p.hp = p.maxHp; p.inv = CFG.chosen.swapInv; p.cdA = p.cdB = 0; p.lifeScore = 0; p.dmgLog = {};
  p.ult = 0; resetStatus(p);
  if (p.dead > 0) { p.dead = 0; placeAtSpawn(w, p); }
  w.match.chosenId = p.id;
  w.teles = w.teles.filter(t => t.hazard);
  fx(w, { k: 'transform', x: p.x, y: p.y - 14, c: pw.color, ttl: 0.9, shake: 6, snd: 'transform' });
  banner(w, p.name, `ИЗБРАННЫЙ · ${pw.icon} ${pw.name.toUpperCase()}`, pw.color);
}

export function startMatch(w) {
  for (const p of w.players) { p.score = 0; p.dmgAcc = 0; p.timesChosen = 0; p.stats = { dmg: 0, chosenTime: 0, kills: 0 }; }
  w.match.round = 0; w.match.feed = [];
  const idx = CFG.maps.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  w.mapOrder = idx;
  nextRound(w);
}

function spawnWeaponAt(w, x, y, type) {
  const W = CFG.weaponWeights; let k = type;
  if (!k) { let sum = 0; for (const q in W) sum += W[q]; let r = Math.random() * sum; for (const q in W) { r -= W[q]; if (r <= 0) { k = q; break; } } k = k || 'pistol'; }
  w.pickups.push({ id: ++w.fxId, k: 'weapon', w: k, ammo: CFG.weapons[k].ammo, x: Math.round(x), y, life: CFG.pickups.life });
}
function randomSpot(w, avoid = 40) {
  const pls = basePlats(w.mapIdx).filter(p => !p.mover);
  for (let i = 0; i < 12; i++) {
    const pl = rnd(pls), x = rr(pl.x + 10, pl.x + pl.w - 10);
    if (w.players.some(q => q.dead <= 0 && Math.abs(q.x - x) < avoid && Math.abs(q.y - pl.y) < 30)) continue;
    if (w.pickups.some(q => Math.abs(q.x - x) < 26 && q.y === pl.y)) continue;
    return [x, pl.y];
  }
  return null;
}

function nextRound(w) {
  const m = w.match; m.round++;
  w.mapIdx = w.fixedMap !== null && w.fixedMap !== undefined ? w.fixedMap : w.mapOrder[(m.round - 1) % w.mapOrder.length];
  w.projs = []; w.teles = []; w.walls = []; w.pickups = []; w.zones = []; w.turrets = [];
  w.weaponT = CFG.pickups.weaponEvery; w.itemT = CFG.pickups.itemEvery;
  w.hazard = { phase: 'idle', t: CFG.hazards.first, k: null, dir: 1, data: [], hit: [], y: 0 };
  m.chosenId = null;
  for (const p of w.players) { makeHunter(p); p.hp = p.maxHp; p.dead = 0; p.inv = 0; p.cdA = p.cdB = 0; p.weapon = null; p.ammo = 0; resetStatus(p); }
  // честная очередь: Избранным становится тот, кто был им реже всех (при равенстве — меньше очков, потом случайно)
  const minT = Math.min(...w.players.map(p => p.timesChosen));
  let c = w.players.filter(p => p.timesChosen === minT);
  const minS = Math.min(...c.map(p => p.score)); c = c.filter(p => p.score - minS < 30);
  const ch = rnd(c);
  for (const p of w.players) placeAtSpawn(w, p);
  makeChosen(w, ch);
  const n = Math.max(3, w.players.length);
  for (let i = 0; i < n; i++) { const s = randomSpot(w, 0); if (s) spawnWeaponAt(w, s[0], s[1], i === 0 ? 'pistol' : null); }
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
  if (t.blockT > 0) { fx(w, { k: 'shield', x: t.x, y: t.y - hitH(t) / 2, c: '#ffd23f', ttl: 0.25, snd: 'block' }); return false; }
  const chosenT = isChosen(w, t);
  let a = amt;
  if (src && !isChosen(w, src) && isLastHunter(w, src)) a *= CFG.comeback;
  if (t.shield > 0) {
    const ab = Math.min(t.shield, a); t.shield -= ab; a -= ab;
    if (!o.dot) fx(w, { k: 'shield', x: t.x, y: t.y - hitH(t) / 2, c: '#4dc3ff', ttl: 0.3, snd: 'shield' });
    if (a <= 0) return true;
  }
  t.hp -= a; t.noDmgT = 0; if (t.hitT <= 0 && !o.dot) t.hitT = 0.28; t.invisT = 0;
  if (src && src !== t) {
    src.stats.dmg += a;
    if (isChosen(w, src)) src.ult = Math.min(CFG.chosen.ultMax, src.ult + a * CFG.chosen.ultPerDmg);
    if (chosenT) {
      const e = t.dmgLog[src.id];
      t.dmgLog[src.id] = { amt: (e && e.t > w.time - 5 ? e.amt : 0) + a, t: w.time };
      src.dmgAcc += a;
      while (src.dmgAcc >= 10) { src.dmgAcc -= 10; src.score += CFG.score.per10dmg; }
    }
  }
  const kbMul = t.power === 'giant' ? 0.35 : chosenT ? 0.6 : 1;
  if (o.kb) { t.vx = o.kb * kbMul * (o.dir || 1); t.vy = Math.min(t.vy, -170 * kbMul); t.onGround = false; t.launchT = 0.4; }
  if (o.launch) { t.vy = -o.launch * (chosenT ? 0.6 : 1); t.onGround = false; t.launchT = 0.5; }
  if (o.slow) t.slowT = Math.max(t.slowT, o.slow);
  if (o.freeze) { t.frozenT = o.freeze; fx(w, { k: 'freeze', x: t.x, y: t.y - hitH(t) / 2, c: '#8ee8ff', ttl: 0.3 }); }
  if (o.stun) { t.stunT = o.stun; fx(w, { k: 'stun', x: t.x, y: t.y - hitH(t), c: '#5cf2ff', ttl: o.stun }); w.teles = w.teles.filter(q => q.owner !== t.id || q.hazard); t.slam = false; }
  const big = a >= 20;
  if (!o.dot) fx(w, { k: 'hit', x: t.x, y: t.y - hitH(t) / 2, c: o.c || '#fff', ttl: 0.25, snd: o.snd || (big ? 'hitBig' : 'hit'), shake: big ? 3 : chosenT ? 0.6 : 1.5 });
  fx(w, { k: 'num', x: t.x + rr(-5, 5), y: t.y - hitH(t) - 4, v: Math.round(a), c: o.dot ? '#9dff6a' : chosenT ? '#ffffff' : '#ff6b7a', big, small: o.dot, ttl: 0.8 });
  if (t.hp <= 0) kill(w, t, src);
  return true;
}

function kill(w, t, src) {
  const wasChosen = isChosen(w, t);
  dropWeapon(w, t);
  t.hp = 0; t.dead = CFG.hunterRespawn; t.vx = t.vy = 0; resetStatus(t);
  fx(w, { k: 'death', x: t.x, y: Math.min(t.y, CFG.H - 20) - 10, c: t.color, big: wasChosen, ttl: 0.8, shake: wasChosen ? 9 : 4, snd: wasChosen ? 'bigDeath' : 'death' });
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

// ---------- прицеливание ----------
function autoTarget(w, p, range) {
  const pc = center(p);
  if (!isChosen(w, p)) {
    const c = byId(w, w.match.chosenId);
    if (c && c.dead <= 0) { const cc = center(c); if (Math.hypot(cc.x - pc.x, cc.y - pc.y) < range) return c; }
    return null;
  }
  let best = null, bd = range;
  for (const q of w.players) {
    if (q === p || q.dead > 0 || q.invisT > 0) continue;
    const cc = center(q), d = Math.hypot(cc.x - pc.x, cc.y - pc.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
const muzzle = p => ({ x: p.x + p.facing * 6 * p.scale, y: p.y - hitH(p) * 0.6 });
function face(p, dx) { if (Math.abs(dx) > 0.05) p.facing = Math.sign(dx); }
// направление и точка цели: ручной прицел (вектор с силой 0..1) или автонаводка
function aimInfo(w, p, inp, range, ground = false) {
  let r;
  if (inp && (inp.ax || inp.ay)) {
    const L = Math.hypot(inp.ax, inp.ay) || 1, mag = clamp(L, 0.15, 1);
    face(p, inp.ax); const m = muzzle(p);
    r = { dx: inp.ax / L, dy: inp.ay / L, tx: m.x + inp.ax / L * range * mag, ty: m.y + inp.ay / L * range * mag, manual: true };
  } else {
    const t = autoTarget(w, p, range);
    if (t) {
      face(p, t.x - p.x); const m = muzzle(p), c = center(t);
      const dx = c.x - m.x, dy = c.y - m.y, L = Math.hypot(dx, dy) || 1;
      r = { dx: dx / L, dy: dy / L, tx: c.x, ty: ground ? t.y : c.y, target: t };
    } else { const m = muzzle(p); r = { dx: p.facing, dy: 0, tx: m.x + p.facing * range * 0.5, ty: ground ? p.y : m.y }; }
  }
  if (ground) {
    r.tx = clamp(r.tx, 8, CFG.W - 8);
    const gy = supportAt(w, r.tx, r.ty - 30);
    r.ty = gy !== null ? gy : r.ty;
  }
  p.aimX = r.dx; p.aimY = r.dy;
  return r;
}
function arcVel(fx0, fy0, tx, ty) {
  const T = clamp(Math.hypot(tx - fx0, ty - fy0) / 340, 0.3, 0.8);
  return [(tx - fx0) / T, (ty - fy0) / T - 0.5 * PG * T];
}
const rot = (dx, dy, a) => [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];

function proj(w, p, o) {
  const m = muzzle(p);
  w.projs.push({ x: m.x, y: m.y, owner: p.id, team: isChosen(w, p) ? 'c' : 'h', r: 2, hits: [], ...o });
}
function hitHunters(w, owner, cx, cy, r, dmg, c, o = {}) {
  for (const q of w.players) {
    if (q === owner || isChosen(w, q) || q.dead > 0) continue;
    const cc = center(q);
    if (Math.hypot(cc.x - cx, cc.y - cy) <= r + 6) damage(w, q, dmg, owner, { c, dir: Math.sign(q.x - cx) || 1, ...o });
  }
}
function hitChosenArea(w, src, cx, cy, r, dmg, c, o = {}) {
  const ch = byId(w, w.match.chosenId);
  if (ch && ch.dead <= 0 && ch !== src) { const cc = center(ch); if (Math.hypot(cc.x - cx, cc.y - cy) <= r + hitW(ch) / 2) damage(w, ch, dmg, src, { c, dir: Math.sign(ch.x - cx) || 1, ...o }); }
}
function hitAll(w, cx, cy, r, dmg, c, o = {}) {
  for (const q of w.players) { if (q.dead > 0) continue; const cc = center(q); if (Math.hypot(cc.x - cx, cc.y - cy) <= r + 6) damage(w, q, dmg, null, { c, dir: Math.sign(q.x - cx) || 1, ...o }); }
}

// ---------- охотник: оружие, кулак, навыки ----------
const WSND = { pistol: 'shot', smg: 'smg', shotgun: 'shotgun', sniper: 'sniper', grenade: 'throw', rocket: 'rocketFire', laser: 'laser' };
function fireWeapon(w, p, inp) {
  const W = CFG.weapons[p.weapon];
  const a = aimInfo(w, p, inp, W.range, W.aim === 'arc');
  p.cdA = W.cd; p.attackT = 0.2; p.ammo--; p.invisT = 0;
  const m = muzzle(p);
  if (W.hitscan) {
    let x = m.x, y = m.y, hit = null; const ch = byId(w, w.match.chosenId);
    const pls = platsAt(w.mapIdx, w.time).filter(q => q.solid);
    for (let d = 0; d < W.range; d += 3) {
      x = m.x + a.dx * d; y = m.y + a.dy * d;
      if (ch && ch.dead <= 0 && Math.abs(x - ch.x) < hitW(ch) / 2 + 2 && y > ch.y - hitH(ch) && y < ch.y) { hit = ch; break; }
      if (w.walls.some(wl => x > wl.x && x < wl.x + wl.w && y > wl.y && y < wl.y + wl.h)) break;
      if (pls.some(q => x > q.x && x < q.x + q.w && y > q.y && y < q.y + 40)) break;
    }
    fx(w, { k: 'beam', x1: m.x, y1: m.y, x2: x, y2: y, c: '#5cf2ff', ttl: 0.18, snd: 'laser' });
    if (hit) damage(w, hit, W.dmg, p, { c: '#5cf2ff' });
  } else if (W.aim === 'arc') {
    const [vx, vy] = arcVel(m.x, m.y, a.tx, a.ty - 4);
    proj(w, p, { vx, vy, grav: true, kind: 'grenade', r: 3, dmg: W.dmg, R: W.R, ttl: 2.2, c: '#ff8c3a' });
  } else if (p.weapon === 'rocket') {
    proj(w, p, { vx: a.dx * W.speed, vy: a.dy * W.speed, kind: 'rocket', r: 3, dmg: W.dmg, R: W.R, ttl: W.range / W.speed, c: '#ff8c3a' });
  } else {
    const n = W.pellets || 1;
    for (let i = 0; i < n; i++) {
      const [dx, dy] = rot(a.dx, a.dy, (n > 1 ? (i / (n - 1) - 0.5) : (Math.random() - 0.5)) * W.spread);
      proj(w, p, { vx: dx * W.speed, vy: dy * W.speed, kind: p.weapon === 'sniper' ? 'sniper' : 'bullet', r: p.weapon === 'sniper' ? 2 : 1.5,
        dmg: W.dmg, ttl: W.range / W.speed * (0.85 + Math.random() * 0.15), c: p.color, pierce: W.pierce, kb: W.kb });
    }
  }
  fx(w, { k: 'muzzle', x: m.x, y: m.y, dir: a.dx, dy: a.dy, c: p.weapon === 'laser' ? '#5cf2ff' : '#ffd23f', ttl: 0.1, snd: WSND[p.weapon], shell: !W.hitscan && W.aim !== 'arc' && p.weapon !== 'rocket' });
  if (p.ammo <= 0) { p.weapon = null; fx(w, { k: 'empty', x: p.x, y: p.y - 26, c: '#aaa', ttl: 0.6, snd: 'empty' }); }
}

function punch(w, p, inp) {
  const P = CFG.punch;
  aimInfo(w, p, inp, 60);
  p.cdA = P.cd; p.attackT = 0.2;
  const rx = p.facing > 0 ? p.x + 3 : p.x - 3 - P.w, ry = p.y - hitH(p) * 0.85;
  fx(w, { k: 'swing', x: p.x + p.facing * 12, y: ry + P.h / 2, dir: p.facing, c: '#ffffff', ttl: 0.15, snd: 'swing' });
  const ch = byId(w, w.match.chosenId);
  if (ch && ch.dead <= 0 && ch.x + hitW(ch) / 2 > rx && ch.x - hitW(ch) / 2 < rx + P.w && ch.y > ry && ch.y - hitH(ch) < ry + P.h)
    damage(w, ch, P.dmg, p, { kb: P.kb, dir: p.facing, snd: 'punch' });
}

function heroSkill(w, p, inp) {
  const H = heroOf(p), S = CFG.skills;
  p.cdB = H.cd;
  if (inp && inp.bx) face(p, inp.bx);
  switch (H.skill) {
    case 'dash': p.dashT = CFG.dashTime; p.dashMul = 1; p.inv = Math.max(p.inv, CFG.dashInv); fx(w, { k: 'dash', x: p.x, y: p.y - 10, dir: p.facing, c: p.color, ttl: 0.3, snd: 'dash' }); break;
    case 'shadowDash': p.dashT = CFG.dashTime * 1.4; p.dashMul = S.shadowDashMul; p.inv = Math.max(p.inv, 0.32); fx(w, { k: 'smoke', x: p.x, y: p.y - 10, c: '#2a2240', ttl: 0.4, snd: 'dash' }); break;
    case 'block': p.blockT = S.blockT; fx(w, { k: 'shieldUp', x: p.x, y: p.y - 12, c: '#ffd23f', ttl: 0.3, snd: 'shieldUp' }); break;
    case 'heal':
      for (const q of w.players) if (q.dead <= 0 && !isChosen(w, q) && (q === p || Math.hypot(q.x - p.x, q.y - p.y) < S.healR)) {
        const add = Math.min(S.heal, q.maxHp - q.hp); q.hp += add;
        if (add > 0) fx(w, { k: 'num', x: q.x, y: q.y - hitH(q) - 4, v: '+' + Math.round(add), c: '#7dff8a', ttl: 0.8 });
      }
      fx(w, { k: 'healRing', x: p.x, y: p.y - 10, r: S.healR, c: '#7dff8a', ttl: 0.6, snd: 'heal' }); break;
    case 'turret': {
      const tx = clamp(p.x + p.facing * 12, 8, CFG.W - 8), y = supportAt(w, tx, p.y - 4);
      if (y === null || y - p.y > 30) { p.cdB = 0.4; return; }
      w.turrets = w.turrets.filter(t => t.owner !== p.id);
      w.turrets.push({ id: ++w.fxId, x: Math.round(tx), y, owner: p.id, t: S.turretT, cd: 0.6, facing: p.facing, c: p.color, ax: p.facing, ay: 0 });
      fx(w, { k: 'build', x: tx, y: y - 6, c: p.color, ttl: 0.4, snd: 'build' }); break;
    }
    case 'invis': p.invisT = S.invisT; fx(w, { k: 'smoke', x: p.x, y: p.y - 10, c: '#c9c3ff', ttl: 0.4, snd: 'poof' }); break;
    case 'rocketJump':
      p.vy = -S.rocketVel; p.onGround = false; p.launchT = 0.35; p.airJumps = heroOf(p).airJumps; p.plat = -1;
      fx(w, { k: 'boom', x: p.x, y: p.y - 2, r: 18, c: '#ff8c3a', ttl: 0.35, shake: 3, snd: 'explode' });
      hitChosenArea(w, p, p.x, p.y - 6, S.rocketR, S.rocketDmg, '#ff8c3a', { kb: 200 }); break;
    case 'emp':
      fx(w, { k: 'ring', x: p.x, y: p.y - 12, r: S.empR, c: '#5cf2ff', ttl: 0.4, shake: 3, snd: 'emp' });
      hitChosenArea(w, p, p.x, p.y - 12, S.empR, S.empDmg, '#5cf2ff', { stun: S.empStun }); break;
  }
}

// ---------- Избранный: силы ----------
function coneRect(p) {
  const pw = CFG.powers.giant;
  return { x: p.facing > 0 ? p.x + 4 : p.x - 4 - pw.aW, y: p.y - pw.aH, w: pw.aW, h: pw.aH };
}
function nearestHunter(w, p, range, from = p, exclude = []) {
  let best = null, bd = range;
  for (const q of w.players) {
    if (q === p || isChosen(w, q) || q.dead > 0 || q.invisT > 0 || exclude.includes(q)) continue;
    const d = Math.hypot(q.x - from.x, (q.y - 10) - (from.y - 10));
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

function attackA(w, p, inp) {
  const pw = CFG.powers[p.power]; p.cdA = pw.aCd; p.attackT = 0.22;
  const k = p.power;
  if (k === 'fire') {
    const a = aimInfo(w, p, inp, pw.aRange);
    proj(w, p, { vx: a.dx * pw.aSpeed, vy: a.dy * pw.aSpeed, kind: 'fire', r: 5, dmg: pw.aDmg, ttl: pw.aRange / pw.aSpeed, c: pw.color });
    fx(w, { k: 'muzzle', ...muzzle(p), dir: a.dx, dy: a.dy, c: pw.color, ttl: 0.1, snd: 'fire' });
  } else if (k === 'ice') {
    const a = aimInfo(w, p, inp, pw.aRange);
    proj(w, p, { vx: a.dx * pw.aSpeed, vy: a.dy * pw.aSpeed, kind: 'ice', r: 3, dmg: pw.aDmg, ttl: pw.aRange / pw.aSpeed, c: pw.color, slow: pw.slowT });
    fx(w, { k: 'muzzle', ...muzzle(p), dir: a.dx, dy: a.dy, c: pw.color, ttl: 0.1, snd: 'iceShot' });
  } else if (k === 'bolt') {
    const a = aimInfo(w, p, inp, pw.aRange);
    let from = { x: p.x, y: p.y - 8 }, hit = [], t = a.target && !isChosen(w, a.target) ? a.target : nearestHunter(w, p, pw.aRange);
    if (!t) { fx(w, { k: 'bolt', x1: p.x, y1: p.y - 18, x2: p.x + a.dx * 55, y2: p.y - 18 + a.dy * 55, c: pw.color, ttl: 0.15, snd: 'zapSmall' }); return; }
    for (let i = 0; i <= pw.aJumps && t; i++) {
      fx(w, { k: 'bolt', x1: from.x, y1: from.y - 10, x2: t.x, y2: t.y - 10, c: pw.color, ttl: 0.22, snd: i ? null : 'zap' });
      damage(w, t, pw.aDmg, p, { c: pw.color, snd: 'zapHit' }); hit.push(t); from = t;
      t = nearestHunter(w, p, pw.aJump, from, hit);
    }
  } else if (k === 'giant') {
    aimInfo(w, p, inp, 80);
    w.teles.push({ k: 'cone', owner: p.id, t: pw.aTele, ttl: pw.aTele, dmg: pw.aDmg, c: pw.color });
    fx(w, { k: 'charge', x: p.x, y: p.y - 20, c: pw.color, ttl: 0.3, snd: 'windup' });
  } else if (k === 'poison') {
    const a = aimInfo(w, p, inp, pw.aRange, true), m = muzzle(p);
    const [vx, vy] = arcVel(m.x, m.y, a.tx, a.ty - 3);
    proj(w, p, { vx, vy, grav: true, kind: 'glob', r: 4, dmg: pw.aDmg, ttl: 2.2, c: pw.color });
    fx(w, { k: 'muzzle', ...m, dir: a.dx, dy: a.dy, c: pw.color, ttl: 0.1, snd: 'glob' });
  } else if (k === 'shadow') {
    const a = aimInfo(w, p, inp, 120);
    const ox = p.x, oy = p.y, ex = clamp(p.x + a.dx * pw.aDist, 8, CFG.W - 8), ey = a.dy < -0.3 ? p.y + a.dy * pw.aDist * 0.6 : p.y;
    for (const q of w.players) {
      if (q === p || isChosen(w, q) || q.dead > 0) continue;
      const c = center(q), t = clamp(((c.x - ox) * (ex - ox) + (c.y - (oy - 12)) * (ey - oy)) / ((ex - ox) ** 2 + (ey - oy) ** 2 || 1), 0, 1);
      if (Math.hypot(c.x - (ox + (ex - ox) * t), c.y - (oy - 12 + (ey - oy) * t)) < 16) damage(w, q, pw.aDmg, p, { c: pw.color, kb: 120, dir: Math.sign(ex - ox) || 1 });
    }
    p.x = p.px = ex; if (ey < p.y) { p.y = p.py = ey; p.vy = Math.min(p.vy, -60); p.onGround = false; }
    fx(w, { k: 'slash', x1: ox, y1: oy - 14, x2: ex, y2: ey - 14, c: pw.color, ttl: 0.25, snd: 'slash' });
  } else if (k === 'gravity') {
    const a = aimInfo(w, p, inp, pw.aRange);
    proj(w, p, { vx: a.dx * pw.aSpeed, vy: a.dy * pw.aSpeed, kind: 'orb', r: 4, dmg: pw.aDmg, ttl: pw.aRange / pw.aSpeed * 1.3, c: pw.color, home: true });
    fx(w, { k: 'muzzle', ...muzzle(p), dir: a.dx, dy: a.dy, c: pw.color, ttl: 0.1, snd: 'orb' });
  } else if (k === 'wind') {
    const a = aimInfo(w, p, inp, pw.aRange);
    proj(w, p, { vx: a.dx * pw.aSpeed, vy: a.dy * pw.aSpeed, kind: 'blade', r: 5, dmg: pw.aDmg, ttl: pw.aRange / pw.aSpeed, c: pw.color, pierce: true, kb: pw.aKb });
    fx(w, { k: 'muzzle', ...muzzle(p), dir: a.dx, dy: a.dy, c: pw.color, ttl: 0.1, snd: 'whoosh' });
  }
}

function attackB(w, p, inp) {
  const pw = CFG.powers[p.power], k = p.power;
  const cd = pw.bCd * (w.players.length >= 5 ? CFG.bigLobbyCdMul : 1);
  const binp = inp ? { ax: inp.bx || 0, ay: inp.by || 0 } : null;
  if (k === 'giant') {
    if (!p.onGround) return;
    p.vy = -pw.bJump; p.onGround = false; p.slam = true; p.launchT = 1; p.plat = -1;
    fx(w, { k: 'dust', x: p.x, y: p.y, c: '#d8c8b0', ttl: 0.3, n: 10, snd: 'bigJump' });
  } else if (k === 'fire') {
    w.teles.push({ k: 'ring', owner: p.id, r: pw.bR, t: pw.bTele, ttl: pw.bTele, dmg: pw.bDmg, c: pw.color });
    fx(w, { k: 'charge', x: p.x, y: p.y - 14, c: pw.color, ttl: 0.4, snd: 'windup' });
  } else if (k === 'bolt') {
    const a = aimInfo(w, p, binp, pw.bRange, true), ox = p.x, oy = p.y;
    p.x = p.px = clamp(a.tx, 10, CFG.W - 10); p.y = p.py = a.ty; p.vy = 0; p.plat = -1;
    fx(w, { k: 'bolt', x1: ox, y1: oy - 14, x2: p.x, y2: p.y - 14, c: pw.color, ttl: 0.3, snd: 'teleport' });
    fx(w, { k: 'ring', x: p.x, y: p.y - 12, r: pw.bR, c: pw.color, ttl: 0.35, shake: 3 });
    hitHunters(w, p, p.x, p.y - 12, pw.bR, pw.bDmg, pw.color, { snd: 'zapHit' });
  } else if (k === 'ice') {
    const a = aimInfo(w, p, binp, 40);
    const x = clamp(p.x + Math.sign(a.dx || p.facing) * 28, 6, CFG.W - 14);
    w.walls.push({ x: x - 4, y: p.y - pw.wallH, w: 8, h: pw.wallH, t: pw.wallT, ttl: pw.wallT });
    fx(w, { k: 'wall', x, y: p.y, c: pw.color, ttl: 0.3, snd: 'iceWall', shake: 2 });
  } else if (k === 'poison') {
    const a = aimInfo(w, p, binp, pw.bRange, true);
    w.zones.push({ id: ++w.fxId, k: 'poison', x: a.tx, y: a.ty, r: pw.bR, t: pw.bT, ttl: pw.bT, dps: pw.bDps, owner: p.id, c: pw.color });
    fx(w, { k: 'cloud', x: a.tx, y: a.ty - 10, r: pw.bR, c: pw.color, ttl: 0.4, snd: 'gas' });
  } else if (k === 'shadow') {
    const a = aimInfo(w, p, binp, pw.bRange, true), ox = p.x, oy = p.y;
    let tx = a.tx;
    if (!a.manual && a.target) tx = a.target.x - Math.sign(a.target.x - p.x || 1) * -16;
    p.x = p.px = clamp(tx, 10, CFG.W - 10); p.y = p.py = a.ty; p.vy = 0; p.plat = -1;
    fx(w, { k: 'smoke', x: ox, y: oy - 12, c: '#1a0f2a', ttl: 0.4 });
    fx(w, { k: 'ring', x: p.x, y: p.y - 12, r: pw.bR, c: pw.color, ttl: 0.35, shake: 2, snd: 'blink' });
    hitHunters(w, p, p.x, p.y - 12, pw.bR, pw.bDmg, pw.color);
  } else if (k === 'gravity') {
    const a = aimInfo(w, p, binp, pw.bRange, true);
    w.zones.push({ id: ++w.fxId, k: 'hole', x: a.tx, y: a.ty - 22, r: pw.bR, t: pw.bT, ttl: pw.bT, pull: pw.bPull, dmg: pw.bDmg, owner: p.id, c: pw.color });
    fx(w, { k: 'charge', x: a.tx, y: a.ty - 22, c: pw.color, ttl: 0.4, snd: 'hole' });
  } else if (k === 'wind') {
    const a = aimInfo(w, p, binp, 60), dir = Math.sign(a.dx || p.facing);
    w.projs.push({ x: p.x + dir * 10, y: p.y - 1, vx: dir * pw.bSpeed, vy: 0, owner: p.id, team: 'c', r: 12, hits: [], kind: 'tornado', dmg: pw.bDmg, launch: pw.bLaunch, ttl: 2.6, c: pw.color, pierce: true, ground: true });
    fx(w, { k: 'dust', x: p.x + dir * 10, y: p.y, c: '#e8fff6', n: 8, ttl: 0.3, snd: 'tornado' });
  }
  p.cdB = cd; p.attackT = 0.25;
}

function ultimate(w, p) {
  const pw = CFG.powers[p.power], k = p.power;
  p.ult = 0; p.attackT = 0.4;
  fx(w, { k: 'ultflash', x: p.x, y: p.y - 20, c: pw.color, ttl: 0.6, shake: 5, snd: 'ult' });
  banner(w, pw.ultName.toUpperCase() + '!', p.name, pw.color, 1.6);
  const hunters = w.players.filter(q => q !== p && q.dead <= 0);
  const groundAt = (x, y) => supportAt(w, x, y) ?? (CFG.H - 40);
  if (k === 'fire') {
    for (let i = 0; i < pw.uN; i++) {
      const tg = hunters.length && Math.random() < 0.75 ? rnd(hunters) : null;
      const x = clamp(tg ? tg.x + rr(-30, 30) : rr(40, CFG.W - 40), 20, CFG.W - 20);
      w.teles.push({ k: 'meteor', fixed: true, x, y: groundAt(x, tg ? tg.y - 30 : 0), r: pw.uR, t: pw.uTele + i * pw.uSpan / pw.uN, ttl: pw.uTele, dmg: pw.uDmg, c: pw.color, owner: p.id });
    }
  } else if (k === 'bolt') {
    for (const h of hunters) for (let s = 0; s < pw.uStrikes; s++)
      w.teles.push({ k: 'strike', fixed: true, track: h.id, x: h.x, y: h.y, r: pw.uR, t: pw.uTele + s * pw.uGap, ttl: pw.uTele, dmg: pw.uDmg, c: pw.color, owner: p.id });
  } else if (k === 'ice') {
    fx(w, { k: 'blizzard', x: p.x, y: p.y - 20, r: pw.uR, c: pw.color, ttl: 1.6, snd: 'blizzard', shake: 4 });
    hitHunters(w, p, p.x, p.y - 10, pw.uR, pw.uDmg, pw.color, { freeze: pw.uFreeze, slow: pw.uSlow, snd: 'freeze' });
  } else if (k === 'giant') {
    fx(w, { k: 'quake', x: p.x, y: p.y, c: pw.color, ttl: 1.2, shake: 12, snd: 'quake' });
    for (const q of hunters) if (q.onGround) damage(w, q, pw.uDmg, p, { c: pw.color, launch: pw.uLaunch });
  } else if (k === 'poison') {
    for (let i = 0; i < pw.uN; i++) {
      const tg = hunters.length ? hunters[i % hunters.length] : null;
      const x = clamp(tg ? tg.x + rr(-20, 20) : rr(40, CFG.W - 40), 20, CFG.W - 20);
      w.zones.push({ id: ++w.fxId, k: 'poison', x, y: groundAt(x, tg ? tg.y - 20 : 0), r: pw.uR, t: pw.uT, ttl: pw.uT, dps: pw.uDps, owner: p.id, c: pw.color });
    }
    fx(w, { k: 'cloud', x: p.x, y: p.y - 20, r: 80, c: pw.color, ttl: 0.6, snd: 'gas' });
  } else if (k === 'shadow') {
    for (let i = 0; i < pw.uN; i++) {
      const a = i / pw.uN * Math.PI * 2;
      w.projs.push({ x: p.x + Math.cos(a) * 20, y: p.y - 14 + Math.sin(a) * 10, vx: Math.cos(a) * 60, vy: -40, owner: p.id, team: 'c', r: 7, hits: [], kind: 'clone', dmg: pw.uDmg, ttl: pw.uT, c: pw.color, homing: pw.uSpeed, look: p.color });
    }
  } else if (k === 'gravity') {
    w.zones.push({ id: ++w.fxId, k: 'hole', x: CFG.W / 2, y: 190, r: 46, big: true, reach: pw.uR, t: pw.uT, ttl: pw.uT, pull: pw.uPull, dmg: pw.uDmg, kb: pw.uKb, owner: p.id, c: pw.color });
  } else if (k === 'wind') {
    for (let i = 0; i < pw.uN; i++) {
      const dir = i % 2 ? -1 : 1, y = groundAt(p.x + dir * 20, p.y - 30);
      w.projs.push({ x: p.x + dir * (16 + i * 18), y: y - 1, vx: dir * (pw.bSpeed + i * 30), vy: 0, owner: p.id, team: 'c', r: 12, hits: [], kind: 'tornado', dmg: pw.bDmg, launch: pw.bLaunch, ttl: 3, c: pw.color, pierce: true, ground: true });
    }
    hitHunters(w, p, p.x, p.y - 12, 260, pw.uDmg, pw.color, { kb: pw.uKb });
    fx(w, { k: 'gust', x: p.x, y: p.y, ttl: 0.4, shake: 6, snd: 'wind' });
  }
}

// ---------- бонусы ----------
function pickupStep(w, dt) {
  const C = CFG.pickups;
  w.weaponT -= dt; w.itemT -= dt;
  const nW = w.pickups.filter(q => q.k === 'weapon').length, nI = w.pickups.length - nW;
  if (w.weaponT <= 0) { w.weaponT = C.weaponEvery; if (nW < C.maxWeapons) { const s = randomSpot(w); if (s) { spawnWeaponAt(w, s[0], s[1]); fx(w, { k: 'pop', x: s[0], y: s[1] - 8, c: '#fff', ttl: 0.3 }); } } }
  if (w.itemT <= 0) {
    w.itemT = C.itemEvery;
    if (nI < C.maxItems) { const s = randomSpot(w); if (s) { w.pickups.push({ id: ++w.fxId, k: 'item', w: rnd(['heal', 'heal', 'shield', 'speed']), x: Math.round(s[0]), y: s[1], life: C.life }); fx(w, { k: 'pop', x: s[0], y: s[1] - 8, c: '#fff', ttl: 0.3 }); } }
  }
  for (const pk of w.pickups) {
    pk.life -= dt;
    for (const p of w.players) {
      if (p.dead > 0 || pk.life <= 0) continue;
      if (!(Math.abs(p.x - pk.x) < 9 + hitW(p) / 2 && p.y > pk.y - 16 && p.y - hitH(p) < pk.y)) continue;
      if (isChosen(w, p)) {
        if (pk.k !== 'item') continue;
        pk.life = 0; p.ult = Math.min(CFG.chosen.ultMax, p.ult + CFG.chosen.ultPickup);
        fx(w, { k: 'pickup', x: pk.x, y: pk.y - 8, c: CFG.powers[p.power].color, label: '+УЛЬТА', ttl: 0.8, snd: 'pickup' });
      } else if (pk.k === 'weapon') {
        const cur = p.weapon && CFG.weapons[p.weapon];
        if (p.weapon && p.weapon !== pk.w && p.ammo > cur.ammo * 0.25) continue;
        const same = p.weapon === pk.w;
        pk.life = 0; p.ammo = same ? Math.min(CFG.weapons[pk.w].ammo * 2, p.ammo + pk.ammo) : pk.ammo; p.weapon = pk.w; p.score += CFG.score.pickup;
        fx(w, { k: 'pickup', x: pk.x, y: pk.y - 8, c: '#ffd23f', label: CFG.weapons[pk.w].name, ttl: 0.8, snd: 'reload' });
      } else {
        pk.life = 0; const it = CFG.items[pk.w]; p.score += CFG.score.pickup;
        if (pk.w === 'heal') p.hp = Math.min(p.maxHp, p.hp + it.amt);
        else if (pk.w === 'shield') p.shield = it.amt;
        else if (pk.w === 'speed') p.speedT = it.t;
        fx(w, { k: 'pickup', x: pk.x, y: pk.y - 8, c: it.color, label: it.name, ttl: 0.8, snd: 'pickup' });
      }
    }
  }
  w.pickups = w.pickups.filter(p => p.life > 0);
}

// ---------- события карт ----------
function hazardStep(w, dt) {
  const H = w.hazard, HZ = CFG.hazards, m = mapOf(w);
  H.t -= dt;
  const alive = w.players.filter(p => p.dead <= 0);
  if (H.phase === 'idle' && H.t <= 0) {
    H.phase = 'warn'; H.t = HZ.warn; H.k = m.hazard; H.hit = []; H.data = [];
    const near = (n, jit) => { const out = []; for (let i = 0; i < n; i++) { const tg = alive.length && i < alive.length ? alive[i] : null; out.push(tg ? tg.x + rr(-jit, jit) : rr(30, CFG.W - 30)); } return out; };
    if (H.k === 'wind') H.dir = Math.random() < 0.5 ? -1 : 1;
    else if (H.k === 'geyser') for (const x0 of near(4, 14)) { let x = x0, y = supportAt(w, x, 0); const s = rnd(m.solids); if (y === null || y < 280) { x = rr(s.x + 12, s.x + s.w - 12); y = s.y; } H.data.push({ x, y: supportAt(w, x, 250) ?? s.y }); }
    else if (H.k === 'icicles') for (const x of near(HZ.icicleN, 12)) H.data.push({ x: clamp(x, 10, CFG.W - 10), d: rr(0, 0.6) });
    else if (H.k === 'spores') for (const x of near(HZ.sporeN, 20)) { const tg = alive.find(a => Math.abs(a.x - x) < 25); H.data.push({ x, y: supportAt(w, x, tg ? tg.y - 20 : 0) ?? 300 }); }
    else if (H.k === 'storm') for (const x of near(HZ.stormN, 18)) { const tg = alive.find(a => Math.abs(a.x - x) < 25); H.data.push({ x, y: supportAt(w, x, tg ? tg.y - 20 : 0) ?? 300 }); }
    else if (H.k === 'laser') { const tg = alive.length ? rnd(alive) : null; H.y = tg ? tg.y - 10 : 260; H.dir = Math.random() < 0.5 ? -1 : 1; }
    fx(w, { k: 'warn', x: 0, y: 0, ttl: 0.3, snd: 'warn' });
    say(w, `⚠ ${m.hazardName}!`, HZ.warn);
  } else if (H.phase === 'warn' && H.t <= 0) {
    H.phase = 'active';
    if (H.k === 'wind') { H.t = HZ.windT; fx(w, { k: 'gust', x: 0, y: 0, ttl: 0.3, snd: 'wind' }); }
    else if (H.k === 'geyser') { H.t = HZ.geyserT; for (const g of H.data) fx(w, { k: 'boom', x: g.x, y: g.y, r: 16, c: '#ff7a1a', ttl: 0.4, shake: 3, snd: 'geyser' }); }
    else if (H.k === 'icicles') { H.t = 2; for (const ic of H.data) w.projs.push({ x: ic.x, y: -10 - ic.d * 150, vx: 0, vy: 0, grav: true, r: 3, dmg: HZ.icicleDmg, team: 'x', ttl: 2.5, kind: 'icicle', c: '#cfefff', hits: [] }); }
    else if (H.k === 'spores') { H.t = HZ.sporeT; for (const s of H.data) w.zones.push({ id: ++w.fxId, k: 'poison', x: s.x, y: s.y, r: HZ.sporeR, t: HZ.sporeT, ttl: HZ.sporeT, dps: HZ.sporeDps, owner: null, c: '#d77dff' }); fx(w, { k: 'gust', x: 0, y: 0, ttl: 0.3, snd: 'gas' }); }
    else if (H.k === 'storm') { H.t = 1.5; H.data.forEach((s, i) => w.teles.push({ k: 'strike', fixed: true, hazard: true, x: s.x, y: s.y, r: 26, t: 0.05 + i * 0.15, ttl: 0.05, dmg: HZ.stormDmg, c: '#ffe83a' })); }
    else if (H.k === 'laser') { H.t = HZ.laserT; fx(w, { k: 'gust', x: 0, y: 0, ttl: 0.3, snd: 'laserBig', shake: 3 }); }
  } else if (H.phase === 'active') {
    if (H.k === 'geyser') for (const g of H.data) for (const p of w.players) {
      if (p.dead > 0 || p.inv > 0 || H.hit.includes(p.id + g.x)) continue;
      if (Math.abs(p.x - g.x) < 10 + hitW(p) / 2 && p.y <= g.y + 1 && p.y > g.y - 140) { H.hit.push(p.id + g.x); damage(w, p, HZ.geyserDmg, null, { c: '#ff7a1a', launch: 400, snd: 'burn' }); }
    }
    if (H.k === 'laser') for (const p of w.players) {
      if (p.dead > 0 || H.hit.includes(p.id)) continue;
      if (p.y > H.y && p.y - hitH(p) < H.y) { H.hit.push(p.id); damage(w, p, HZ.laserDmg, null, { c: '#ff2a6d', kb: 160, dir: H.dir, snd: 'burn' }); }
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
  const map = mapOf(w), pls = platsAt(w.mapIdx, w.time), plsPrev = platsAt(w.mapIdx, w.time - dt);
  const wind = play && w.hazard.k === 'wind' && w.hazard.phase === 'active' ? w.hazard.dir * CFG.hazards.windSpeed : 0;

  for (const p of w.players) {
    p.px = p.x; p.py = p.y;
    for (const k of ['inv', 'cdA', 'cdB', 'slowT', 'attackT', 'hitT', 'frozenT', 'stunT', 'launchT', 'blockT', 'invisT', 'speedT']) p[k] = Math.max(0, p[k] - dt);
    p.noDmgT += dt;
    if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0 && m.phase !== 'roundEnd') respawn(w, p); continue; }
    // перенос движущейся платформой
    if (p.onGround && p.plat >= 0 && pls[p.plat] && pls[p.plat].mover) { p.x += pls[p.plat].x - plsPrev[p.plat].x; p.y = pls[p.plat].y; }
    const locked = p.frozenT > 0 || p.stunT > 0;
    const inp = locked ? {} : (inputs[p.id] || {});
    const ch = isChosen(w, p), pw = ch ? CFG.powers[p.power] : null, hero = heroOf(p);
    let speed = ch ? CFG.chosen.speed * pw.speedMul : hero.speed;
    if (p.speedT > 0) speed *= CFG.items.speed.mul;
    if (p.invisT > 0) speed *= CFG.skills.invisSpeed;
    if (p.blockT > 0) speed *= 0.6;
    if (p.slowT > 0) speed *= 1 - CFG.powers.ice.slow;
    const mx = clamp(inp.mx || 0, -1, 1);
    if (mx && p.dashT <= 0 && p.attackT <= 0.05) p.facing = Math.sign(mx);

    if (play) {
      if (inp.a && p.cdA <= 0) { if (ch) attackA(w, p, inp); else if (p.weapon) fireWeapon(w, p, inp); else punch(w, p, inp); }
      if (inp.b && p.cdB <= 0) { if (ch) attackB(w, p, inp); else heroSkill(w, p, inp); }
      if (inp.c && ch && p.ult >= CFG.chosen.ultMax) ultimate(w, p);
    } else if (inp.b && p.cdB <= 0 && !ch && m.phase !== 'roundEnd' && ['dash', 'shadowDash'].includes(hero.skill)) heroSkill(w, p, inp);

    if (p.dashT > 0) { p.dashT -= dt; p.vx = p.facing * CFG.dashSpeed * p.dashMul; p.vy = 0; }
    else {
      const fr = p.onGround ? map.friction : 1;
      const acc = p.onGround ? (mx ? CFG.accel * Math.max(0.45, fr) : CFG.friction * fr) : CFG.airAccel;
      if (p.launchT <= 0 || mx) p.vx = approach(p.vx, mx * speed, acc * dt);
      const ff = (inp.my || 0) > 0.6 && p.vy > 0 && !p.onGround;
      p.vy = Math.min(p.vy + CFG.gravity * dt * (ff ? CFG.fastFallMul : 1), CFG.maxFall * (ff ? 1.3 : 1));
    }
    p.coyT = p.onGround ? CFG.coyote : Math.max(0, p.coyT - dt);
    p.bufT = inp.jump ? CFG.jumpBuffer : Math.max(0, p.bufT - dt);
    const onSolid = p.onGround && p.plat >= 0 && pls[p.plat] && pls[p.plat].solid;
    if ((inp.my || 0) > 0.6 && inp.jump && p.onGround && !onSolid) { p.dropT = 0.25; p.bufT = 0; p.onGround = false; p.plat = -1; }
    const airJ = ch ? 1 : hero.airJumps;
    if (p.bufT > 0) {
      if (p.coyT > 0) { p.vy = -CFG.jumpVel * (ch ? 0.95 : 1); p.bufT = 0; p.coyT = 0; p.onGround = false; p.plat = -1; fx(w, { k: 'dust', x: p.x, y: p.y, c: '#ffffff', n: 4, ttl: 0.3, snd: 'jump' }); }
      else if (p.airJumps > 0 && !p.slam) { p.vy = -CFG.djumpVel * (ch ? 0.95 : 1); p.airJumps--; p.bufT = 0; p.launchT = 0; fx(w, { k: 'djump', x: p.x, y: p.y, c: '#ffffff', ttl: 0.3, snd: 'djump' }); }
    }
    if (!inp.jumpHeld && !p.slam && p.launchT <= 0 && p.vy < -140 && p.vy > -CFG.jumpVel - 1) p.vy = -140;
    p.dropT = Math.max(0, p.dropT - dt);

    const oldY = p.y, vyImpact = p.vy;
    p.x += (p.vx + wind) * dt; p.y += p.vy * dt;
    p.x = clamp(p.x, 4, CFG.W - 4);
    const wasGround = p.onGround; p.onGround = false; p.plat = -1;
    if (p.vy >= 0) {
      for (let i = 0; i < pls.length; i++) {
        const pl = pls[i];
        if (!pl.solid && p.dropT > 0) continue;
        if (p.x > pl.x - 3 && p.x < pl.x + pl.w + 3 && oldY <= plsPrev[i].y + 1.5 && p.y >= pl.y) {
          p.y = pl.y; p.vy = 0; p.onGround = true; p.airJumps = airJ; p.plat = i; break;
        }
      }
    }
    // батуты
    if (p.onGround && map.pads) for (const pad of map.pads) if (Math.abs(pad.y - p.y) < 1 && p.x > pad.x - 2 && p.x < pad.x + pad.w + 2) {
      p.vy = -CFG.padVel; p.onGround = false; p.plat = -1; p.launchT = 0.5; p.airJumps = airJ;
      fx(w, { k: 'pad', x: pad.x + pad.w / 2, y: pad.y, c: '#ff6bd5', ttl: 0.3, snd: 'boing' });
    }
    if (p.onGround && !wasGround && vyImpact > 330) fx(w, { k: 'dust', x: p.x, y: p.y, c: '#e8e0d0', n: Math.min(12, vyImpact / 50 | 0), ttl: 0.3, snd: 'land' });
    if (p.onGround && p.slam) {
      p.slam = false;
      const g = CFG.powers.giant;
      fx(w, { k: 'ring', x: p.x, y: p.y - 6, r: g.bR, c: g.color, ttl: 0.4, shake: 7, snd: 'slam' });
      fx(w, { k: 'dust', x: p.x, y: p.y, c: '#d8c8b0', n: 16, ttl: 0.4 });
      hitHunters(w, p, p.x, p.y - 6, g.bR, g.bDmg, g.color, { kb: 140 });
    }
    p.animT += dt;
    if (ch && play) {
      if (p.noDmgT > CFG.chosen.regenDelay) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * CFG.chosen.regen * dt);
      p.ult = Math.min(CFG.chosen.ultMax, p.ult + CFG.chosen.ultPerSec * dt);
      p.stats.chosenTime += dt;
      const add = Math.min(CFG.score.perSec * dt, CFG.score.maxPerLife - p.lifeScore);
      if (add > 0) { p.lifeScore += add; p.score += add; }
    }
    if (p.y > CFG.fallY) { fx(w, { k: 'splash', x: p.x, y: CFG.H - 40, c: '#fff', ttl: 0.5, snd: 'splash' }); kill(w, p, null); }
  }

  // турели
  for (const tu of w.turrets) {
    tu.t -= dt; tu.cd -= dt;
    const ch = byId(w, m.chosenId), owner = byId(w, tu.owner);
    if (!owner) tu.t = 0;
    if (play && tu.cd <= 0 && ch && ch.dead <= 0 && owner) {
      const c = center(ch), dx = c.x - tu.x, dy = c.y - (tu.y - 9), d = Math.hypot(dx, dy);
      if (d < CFG.skills.turretRange) {
        tu.cd = CFG.skills.turretCd; tu.ax = dx / d; tu.ay = dy / d; tu.facing = Math.sign(dx) || 1;
        w.projs.push({ x: tu.x + tu.ax * 7, y: tu.y - 9 + tu.ay * 7, vx: tu.ax * 330, vy: tu.ay * 330, owner: tu.owner, team: 'h', r: 1.5, hits: [], kind: 'bullet', dmg: CFG.skills.turretDmg, ttl: 0.8, c: tu.c });
        fx(w, { k: 'muzzle', x: tu.x + tu.ax * 8, y: tu.y - 9 + tu.ay * 8, dir: tu.ax, dy: tu.ay, c: '#ffd23f', ttl: 0.08, snd: 'turret' });
      }
    }
  }
  w.turrets = w.turrets.filter(t => t.t > 0);

  // зоны
  for (const z of w.zones) {
    z.t -= dt;
    const owner = z.owner ? byId(w, z.owner) : null;
    if (z.owner && (!owner || !isChosen(w, owner))) { z.t = Math.min(z.t, 0.3); }
    for (const q of w.players) {
      if (q.dead > 0 || q === owner) continue;
      if (z.owner && isChosen(w, q)) continue;
      const c = center(q), dx = z.x - c.x, dy = z.y - c.y, d = Math.hypot(dx, dy) || 1;
      if (z.k === 'poison' && Math.hypot(c.x - z.x, (c.y - (z.y - 10)) * 1.4) < z.r) {
        q.dotAcc += z.dps * dt; q.slowT = Math.max(q.slowT, 0.25);
        if (q.dotAcc >= 4) { q.dotAcc -= 4; damage(w, q, 4, owner, { dot: true, c: z.c }); }
      } else if (z.k === 'hole') {
        const reach = z.reach || z.r * 2.4;
        if (d < reach && z.t > 0) {
          const f = z.pull * (z.big ? 1 : 1 - d / reach) * dt * (z.big ? 1.6 : 2.2);
          q.x = clamp(q.x + dx / d * Math.min(f, d), 4, CFG.W - 4);
          if (dy < 0) { q.y += dy / d * Math.min(f, d) * 0.7; q.onGround = false; q.plat = -1; q.vy = Math.min(q.vy, 0); }
        }
      }
    }
    if (z.k === 'hole' && z.t <= 0 && !z.done && owner && isChosen(w, owner)) {
      z.done = true;
      fx(w, { k: 'boom', x: z.x, y: z.y, r: z.r, c: z.c, ttl: 0.5, shake: z.big ? 10 : 5, snd: 'explode' });
      hitHunters(w, owner, z.x, z.y, z.big ? z.r * 2 : z.r, z.dmg, z.c, { kb: z.kb || 200 });
    }
  }
  w.zones = w.zones.filter(z => z.t > 0);

  // снаряды
  const solidPls = pls.filter(q => q.solid);
  for (const pr of w.projs) {
    if (pr.grav) pr.vy += PG * dt;
    if (pr.home || pr.homing) {
      let tg = null, bd = 1e9;
      const cands = pr.team === 'c' ? w.players.filter(q => !isChosen(w, q) && q.dead <= 0 && q.invisT <= 0) : [];
      for (const q of cands) { const d = Math.hypot(q.x - pr.x, q.y - 10 - pr.y); if (d < bd) { bd = d; tg = q; } }
      if (tg) {
        const dx = tg.x - pr.x, dy = tg.y - 10 - pr.y, d = Math.hypot(dx, dy) || 1;
        if (pr.homing) { pr.vx += (dx / d * pr.homing - pr.vx) * Math.min(1, dt * 3); pr.vy += (dy / d * pr.homing - pr.vy) * Math.min(1, dt * 3); }
        else { const sp = Math.hypot(pr.vx, pr.vy); pr.vx += dx / d * sp * dt * 2.2; pr.vy += dy / d * sp * dt * 2.2; const s2 = Math.hypot(pr.vx, pr.vy) || 1; pr.vx *= sp / s2; pr.vy *= sp / s2; }
      }
    }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.ttl -= dt;
    if (pr.kind === 'tornado') { const gy = supportAt(w, pr.x, pr.y - 6); if (gy !== null && gy - pr.y < 20) pr.y = gy - 1; else pr.vy += PG * dt * 0.5; }
    else if (pr.kind !== 'clone') {
      for (const pl of solidPls) if (pr.x > pl.x && pr.x < pl.x + pl.w && pr.y > pl.y && pr.y < pl.y + 60) { pr.ttl = 0; break; }
      if (pr.grav && pr.vy > 0) for (const pl of pls) if (!pl.solid && pr.x > pl.x && pr.x < pl.x + pl.w && pr.y > pl.y && pr.y < pl.y + 6) { pr.ttl = 0; break; }
    }
    if (pr.team === 'h') for (const wl of w.walls)
      if (pr.x > wl.x - pr.r && pr.x < wl.x + wl.w + pr.r && pr.y > wl.y && pr.y < wl.y + wl.h) { pr.ttl = 0; pr.blocked = true; fx(w, { k: 'hit', x: pr.x, y: pr.y, c: '#8ee8ff', ttl: 0.2, snd: 'block' }); }
    if (pr.ttl > 0) {
      const src = byId(w, pr.owner);
      for (const q of w.players) {
        if (q.dead > 0 || q.id === pr.owner || pr.hits.includes(q.id)) continue;
        if (pr.team !== 'x' && (pr.team === 'h') !== isChosen(w, q)) continue;
        const hw = hitW(q) / 2 + pr.r * (pr.team === 'h' ? 1.3 : 1), h = hitH(q);
        if (pr.x > q.x - hw && pr.x < q.x + hw && pr.y > q.y - h - pr.r && pr.y < q.y + pr.r) {
          if (pr.kind === 'grenade' || pr.kind === 'rocket' || pr.kind === 'glob') { pr.ttl = 0; break; }
          damage(w, q, pr.dmg, pr.team === 'x' ? null : src, { c: pr.c, slow: pr.slow, kb: pr.kb, launch: pr.launch, dir: Math.sign(pr.vx) || 1,
            snd: pr.kind === 'fire' ? 'burn' : pr.kind === 'ice' ? 'freeze' : null });
          if (pr.kind === 'fire') fx(w, { k: 'boom', x: pr.x, y: pr.y, r: 14, c: pr.c, ttl: 0.3 });
          pr.hits.push(q.id);
          if (!pr.pierce) { pr.ttl = 0; break; }
          if (pr.kind === 'clone') { pr.ttl = 0; fx(w, { k: 'smoke', x: pr.x, y: pr.y, c: '#1a0f2a', ttl: 0.4 }); break; }
        }
      }
    }
    if (pr.ttl <= 0 && !pr.done) {
      pr.done = true;
      const src = byId(w, pr.owner);
      if (pr.kind === 'grenade' || pr.kind === 'rocket') {
        fx(w, { k: 'boom', x: pr.x, y: pr.y, r: pr.R, c: '#ff8c3a', ttl: 0.45, shake: pr.kind === 'rocket' ? 5 : 4, snd: 'explode' });
        hitChosenArea(w, src, pr.x, pr.y, pr.R, pr.dmg, '#ff8c3a', { kb: 160 });
      } else if (pr.kind === 'glob') {
        const pw = CFG.powers.poison, gy = supportAt(w, pr.x, pr.y - 8) ?? pr.y;
        fx(w, { k: 'splat', x: pr.x, y: pr.y, c: pr.c, ttl: 0.3, snd: 'splat' });
        hitHunters(w, src, pr.x, pr.y, 16, pr.dmg, pr.c);
        if (gy - pr.y < 30) w.zones.push({ id: ++w.fxId, k: 'poison', x: pr.x, y: gy, r: pw.puddleR, t: pw.puddleT, ttl: pw.puddleT, dps: pw.puddleDps, owner: pr.owner, c: pr.c, puddle: true });
      } else if (pr.kind === 'icicle') fx(w, { k: 'shatter', x: pr.x, y: pr.y, c: '#cfefff', ttl: 0.3, snd: 'shatter' });
      else if (pr.kind === 'fire' && !pr.blocked) fx(w, { k: 'boom', x: pr.x, y: pr.y, r: 10, c: pr.c, ttl: 0.25 });
      else if (pr.kind === 'clone') fx(w, { k: 'smoke', x: pr.x, y: pr.y, c: '#1a0f2a', ttl: 0.4 });
      else if (!pr.blocked && pr.y < CFG.H - 20) fx(w, { k: 'puff', x: pr.x, y: pr.y, c: pr.c, ttl: 0.2 });
    }
  }
  w.projs = w.projs.filter(p => p.ttl > 0);

  // телеграфы
  for (const t of w.teles) {
    if (t.track) { const h = byId(w, t.track); if (h && h.dead <= 0 && t.t > 0.3) { t.x = h.x; t.y = h.y; } }
    t.t -= dt;
    if (t.t > 0) continue;
    if (t.hazard) { fx(w, { k: 'skybolt', x: t.x, y: t.y, c: t.c, ttl: 0.3, shake: 3, snd: 'thunder' }); hitAll(w, t.x, t.y - 10, t.r, t.dmg, t.c); continue; }
    const o = byId(w, t.owner); if (!o || o.dead > 0 || !isChosen(w, o)) continue;
    if (t.k === 'ring') {
      fx(w, { k: 'ring', x: o.x, y: o.y - 12, r: t.r, c: t.c, ttl: 0.4, shake: 5, snd: 'fireRing' });
      fx(w, { k: 'boom', x: o.x, y: o.y - 12, r: t.r * 0.6, c: t.c, ttl: 0.35 });
      hitHunters(w, o, o.x, o.y - 12, t.r, t.dmg, t.c, { snd: 'burn' });
    } else if (t.k === 'cone') {
      const r = coneRect(o);
      fx(w, { k: 'rect', ...r, c: t.c, ttl: 0.2, shake: 4, snd: 'smash' });
      for (const q of w.players) {
        if (q === o || isChosen(w, q) || q.dead > 0) continue;
        if (q.x + 5 > r.x && q.x - 5 < r.x + r.w && q.y > r.y && q.y - hitH(q) < r.y + r.h) damage(w, q, t.dmg, o, { c: t.c, kb: CFG.powers.giant.aKb, dir: o.facing });
      }
    } else if (t.k === 'meteor') {
      fx(w, { k: 'boom', x: t.x, y: t.y - 4, r: t.r, c: t.c, ttl: 0.45, shake: 4, snd: 'explode' });
      hitHunters(w, o, t.x, t.y - 8, t.r, t.dmg, t.c, { launch: 200 });
    } else if (t.k === 'strike') {
      fx(w, { k: 'skybolt', x: t.x, y: t.y, c: t.c, ttl: 0.3, shake: 3, snd: 'thunder' });
      hitHunters(w, o, t.x, t.y - 10, t.r, t.dmg, t.c);
    }
  }
  w.teles = w.teles.filter(t => t.t > 0);
  for (const wl of w.walls) wl.t -= dt;
  w.walls = w.walls.filter(x => x.t > 0);
  for (const f of w.fx) f.t -= rdt;
  w.fx = w.fx.filter(f => f.t > 0);
}
