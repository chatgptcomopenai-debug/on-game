// Симуляция (вид сверху, без DOM). Режим «Корона»: очки получает только Избранный; убил Избранного — стал им.
// Движение с отбрасыванием и перекатом, оружие с карты, навыки героев, 8 сил Избранного, зоны, турели, события карт.
import { CFG } from '../config.js';
import { T, getMap, tileAt, moveCircle, safePoint, WORLD_W, WORLD_H } from './maps.js';

const POWERS = Object.keys(CFG.powers);
const rnd = a => a[Math.floor(Math.random() * a.length)];
const rr = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const byId = (w, id) => w.players.find(p => p.id === id);
export const isChosen = (w, p) => !!p && w.match.chosenId === p.id;
export const heroOf = p => CFG.heroes[p.hero] || CFG.heroes.brawler;
export const bodyR = p => 6 * p.scale;
export const bodyC = p => ({ x: p.x, y: p.y - 7 * p.scale });
export const mapOf = w => getMap(w.mapIdx);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function fx(w, o) { o.id = ++w.fxId; o.ttl = o.ttl || 0.4; o.t = o.ttl; w.fx.push(o); return o; }
function say(w, msg, t = 2.5) { w.match.msg = msg; w.match.msgT = t; }
function banner(w, text, sub, color, t = 2.2) { w.match.banner = { text, sub, color, t, ttl: t }; }
function feed(w, a, ac, b, bc, icon) { w.match.feed.push({ a, ac, b, bc, icon, t: w.time }); if (w.match.feed.length > 4) w.match.feed.shift(); }

export function createWorld(mapIdx = 0) {
  return { time: 0, mapIdx, fixedMap: null, players: [], projs: [], teles: [], walls: [], pickups: [], zones: [], turrets: [],
    fx: [], fxId: 0, slow: 0, freeze: 0, weaponT: 1, itemT: 6,
    hazard: { phase: 'idle', t: CFG.hazards.first, k: null, dx: 1, dy: 0, data: [], hit: [], x: 0 },
    match: { phase: 'lobby', timer: 0, chosenId: null, target: 10, winner: null, msg: '', msgT: 0, banner: null, feed: [] } };
}

export function addPlayer(w, { id, name, color, label, isBot, hat, hero }) {
  const hk = CFG.heroes[hero] ? hero : 'brawler', H = CFG.heroes[hk];
  const p = { id, name, color, label, isBot: !!isBot, hat: hat || 'none', hero: hk, seed: Math.random() * 10,
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, kx: 0, ky: 0, ang: Math.PI / 2, moving: false, spd: H.speed,
    hp: H.hp, maxHp: H.hp, dead: 0, inv: 0, cdA: 0, cdB: 0, dodgeT: 0, ddx: 0, ddy: 0, charges: H.dodges || 1, cdD: 0, sinkT: 0, leap: null,
    slowT: 0, frozenT: 0, stunT: 0, attackT: 0, hitT: 0, animT: 0, power: null, scale: 1, ult: 0, aliveT: 0,
    weapon: null, ammo: 0, blockT: 0, invisT: 0, speedT: 0, rageT: 0, shield: 0, dotAcc: 0,
    pts: 0, dmgLog: {}, streak: { n: 0, t: -9 }, stats: { dmg: 0, kos: 0, slays: 0, picks: 0, chosenTime: 0 } };
  w.players.push(p); placeAtSpawn(w, p); return p;
}

export function removePlayer(w, id) {
  const p = byId(w, id); if (!p) return;
  w.players = w.players.filter(q => q !== p);
  w.turrets = w.turrets.filter(t => t.owner !== id);
  if (w.match.chosenId === id && w.match.phase !== 'lobby' && w.players.length) makeChosen(w, topRecentDamager(w, p) || rnd(w.players));
}

function placeAtSpawn(w, p) {
  const ch = byId(w, w.match.chosenId), m = mapOf(w);
  const taken = w.players.filter(q => q !== p && q.dead <= 0);
  const sp = m.spawns.map(s => {
    const dCh = ch && ch !== p ? Math.hypot(s[0] - ch.x, s[1] - ch.y) : 200 + Math.random() * 100;
    const dOther = taken.length ? Math.min(...taken.map(q => Math.hypot(s[0] - q.x, s[1] - q.y))) : 100;
    return [s, Math.min(dCh, 260) + Math.min(dOther, 80) * 0.5 + Math.random() * 30];
  }).sort((a, b) => b[1] - a[1]);
  const s = sp[Math.floor(Math.random() * Math.min(3, sp.length))][0];
  p.x = p.px = s[0]; p.y = p.py = s[1]; p.vx = p.vy = p.kx = p.ky = 0; p.sinkT = 0; p.leap = null;
}

function resetStatus(p) {
  p.slowT = p.frozenT = p.stunT = p.blockT = p.invisT = p.speedT = p.rageT = 0; p.shield = 0; p.dotAcc = 0; p.dodgeT = 0; p.leap = null; p.sinkT = 0;
  p.charges = heroOf(p).dodges || 1; p.cdD = 0;
}
function makeHunter(p) { p.power = null; p.scale = 1; p.maxHp = heroOf(p).hp; p.dmgLog = {}; p.ult = 0; p.aliveT = 0; }

function dropWeapon(w, p) {
  if (p.weapon && p.ammo > 0) {
    const t = tileAt(mapOf(w), p.x, p.y);
    if (t === T.GROUND || t === T.ALT) w.pickups.push({ id: ++w.fxId, k: 'weapon', w: p.weapon, ammo: p.ammo, x: Math.round(p.x), y: Math.round(p.y), life: CFG.pickups.life });
  }
  p.weapon = null; p.ammo = 0;
}

function makeChosen(w, p) {
  const prev = byId(w, w.match.chosenId), C = CFG.chosen;
  const key = rnd(POWERS.filter(k => !prev || k !== prev.power)), pw = CFG.powers[key];
  for (const q of w.players) if (q !== p && q.power) makeHunter(q);
  dropWeapon(w, p);
  p.power = key; p.scale = pw.scale || C.scale;
  p.maxHp = Math.round((C.hpBase + C.hpPer * Math.max(1, w.players.length - 1)) * pw.hpMul);
  p.hp = p.maxHp; p.inv = C.swapInv; p.cdA = p.cdB = 0; p.dmgLog = {}; p.ult = 0; p.aliveT = 0; resetStatus(p);
  if (p.dead > 0) { p.dead = 0; placeAtSpawn(w, p); }
  w.match.chosenId = p.id;
  w.teles = w.teles.filter(t => t.hazard);
  w.zones = w.zones.filter(z => !z.owner);
  // ударная волна: расталкивает охотников, чтобы нового Избранного не добили сразу
  for (const q of w.players) if (q !== p && q.dead <= 0) { const d = dist(p, q) || 1; if (d < C.swapR) { q.kx += (q.x - p.x) / d * C.swapKb; q.ky += (q.y - p.y) / d * C.swapKb; } }
  fx(w, { k: 'transform', x: p.x, y: p.y - 10, c: pw.color, ttl: 0.9, shake: 7, snd: 'transform' });
  banner(w, p.name, `ИЗБРАННЫЙ · ${pw.icon} ${pw.name.toUpperCase()}`, pw.color);
}

export function startMatch(w) {
  const m = w.match;
  w.mapIdx = w.fixedMap !== null && w.fixedMap !== undefined ? w.fixedMap : Math.floor(Math.random() * CFG.maps.length);
  w.projs = []; w.teles = []; w.walls = []; w.pickups = []; w.zones = []; w.turrets = []; w.slow = 0; w.freeze = 0;
  w.weaponT = 1.5; w.itemT = CFG.pickups.itemEvery;
  w.hazard = { phase: 'idle', t: CFG.hazards.first, k: null, dx: 1, dy: 0, data: [], hit: [], x: 0 };
  m.chosenId = null; m.feed = []; m.winner = null; m.target = CFG.match.target[Math.min(6, w.players.length)] || 10;
  for (const p of w.players) {
    p.pts = 0; p.stats = { dmg: 0, kos: 0, slays: 0, picks: 0, chosenTime: 0 }; p.streak = { n: 0, t: -9 };
    makeHunter(p); p.hp = p.maxHp; p.dead = 0; p.inv = 0; p.cdA = p.cdB = 0; p.weapon = null; p.ammo = 0; resetStatus(p);
  }
  for (const p of w.players) placeAtSpawn(w, p);
  const ch = rnd(w.players);
  makeChosen(w, ch);
  const n = Math.max(4, w.players.length + 1);
  for (let i = 0; i < n; i++) spawnWeapon(w, i === 0 ? 'pistol' : null);
  banner(w, mapOf(w).def.name.toUpperCase(), `ПЕРВЫЙ ДО ${m.target} ОЧКОВ · ${ch.name} — ИЗБРАННЫЙ`, '#ffd23f', 2.8);
  m.phase = 'countdown'; m.timer = CFG.match.countdown;
}

function freeSpot(w, avoid = 50) {
  const g = mapOf(w).ground;
  for (let i = 0; i < 14; i++) {
    const s = rnd(g);
    if (w.players.some(q => q.dead <= 0 && Math.hypot(q.x - s[0], q.y - s[1]) < avoid)) continue;
    if (w.pickups.some(q => Math.hypot(q.x - s[0], q.y - s[1]) < 40)) continue;
    return s;
  }
  return null;
}
function spawnWeapon(w, type) {
  const s = freeSpot(w, 30); if (!s) return;
  let k = type;
  if (!k) { const W = CFG.weaponWeights; let sum = 0; for (const q in W) sum += W[q]; let r = Math.random() * sum; for (const q in W) { r -= W[q]; if (r <= 0) { k = q; break; } } k = k || 'pistol'; }
  w.pickups.push({ id: ++w.fxId, k: 'weapon', w: k, ammo: CFG.weapons[k].ammo, x: s[0], y: s[1], life: CFG.pickups.life });
  fx(w, { k: 'pop', x: s[0], y: s[1] - 6, c: '#fff', ttl: 0.3 });
}

function topRecentDamager(w, t) {
  let best = null, bv = 0;
  for (const id in t.dmgLog) { const e = t.dmgLog[id], q = byId(w, id); if (q && q !== t && e.t > w.time - 6 && e.amt > bv) { best = q; bv = e.amt; } }
  return best;
}

function addPoint(w, p, n, why) {
  p.pts += n;
  fx(w, { k: 'point', x: p.x, y: p.y - 26 * p.scale, v: '+' + n + ' 👑', c: '#ffd23f', ttl: 1.1, snd: 'point' });
  if (why) say(w, why, 1.6);
  if (p.pts >= w.match.target && w.match.phase === 'play') finish(w, p);
}
function finish(w, winner) {
  const m = w.match;
  if (!winner) { const max = Math.max(...w.players.map(p => p.pts)); winner = w.players.filter(p => p.pts === max).sort((a, b) => b.stats.dmg - a.stats.dmg)[0]; }
  m.winner = winner ? winner.id : null; m.phase = 'finish'; m.timer = 2.4; w.slow = 1.2;
  banner(w, winner ? `ПОБЕДИЛ ${winner.name}!` : 'МАТЧ ОКОНЧЕН', winner ? `${winner.pts} очков короны` : '', '#ffd23f', 2.4);
  fx(w, { k: 'win', x: 0, y: 0, ttl: 1, snd: 'win', shake: 6 });
}

// o: { c, kb, kx, ky (направление), slow, freeze, stun, dot, snd }
function damage(w, t, amt, src, o = {}) {
  if (!t || t.dead > 0 || t.inv > 0 || t.leap) return false;
  if (t.blockT > 0) { fx(w, { k: 'shield', x: t.x, y: t.y - 8, c: '#ffd23f', ttl: 0.25, snd: 'block' }); return false; }
  const chosenT = isChosen(w, t);
  let a = amt;
  if (t.shield > 0) {
    const ab = Math.min(t.shield, a); t.shield -= ab; a -= ab;
    if (!o.dot) fx(w, { k: 'shield', x: t.x, y: t.y - 8, c: '#4dc3ff', ttl: 0.3, snd: 'shield' });
    if (a <= 0) return true;
  }
  t.hp -= a; t.noDmgT = 0; if (t.hitT <= 0 && !o.dot) t.hitT = 0.28; t.invisT = 0;
  if (src && src !== t) {
    src.stats.dmg += a;
    if (isChosen(w, src)) src.ult = Math.min(CFG.chosen.ultMax, src.ult + a * CFG.chosen.ultPerDmg);
    if (chosenT) { const e = t.dmgLog[src.id]; t.dmgLog[src.id] = { amt: (e && e.t > w.time - 6 ? e.amt : 0) + a, t: w.time }; }
  }
  if (o.kb) {
    const mul = t.power === 'giant' ? 0.25 : chosenT ? 0.5 : 1, L = Math.hypot(o.kx || 0, o.ky || 0) || 1;
    t.kx += (o.kx || 0) / L * o.kb * mul; t.ky += (o.ky || 0) / L * o.kb * mul;
  }
  if (o.slow) t.slowT = Math.max(t.slowT, o.slow);
  if (o.freeze) { t.frozenT = o.freeze; fx(w, { k: 'freeze', x: t.x, y: t.y - 8, c: '#8ee8ff', ttl: 0.3 }); }
  if (o.stun) { t.stunT = o.stun; fx(w, { k: 'stun', x: t.x, y: t.y - 20, c: '#5cf2ff', ttl: 0.3 }); if (chosenT) w.teles = w.teles.filter(q => q.owner !== t.id || q.hazard); }
  const big = a >= 20;
  if (!o.dot) {
    fx(w, { k: 'hit', x: t.x, y: t.y - 8 * t.scale, c: o.c || '#fff', ttl: 0.25, snd: o.snd || (big ? 'hitBig' : 'hit'), shake: big ? 3.5 : chosenT ? 0.5 : 1.5 });
    if (big) w.freeze = Math.max(w.freeze, CFG.hitstop.big);
  }
  fx(w, { k: 'num', x: t.x + rr(-5, 5), y: t.y - 20 * t.scale, v: Math.round(a), c: o.dot ? '#9dff6a' : chosenT ? '#ffffff' : '#ff6b7a', big, small: o.dot || a < 6, ttl: 0.7 });
  if (t.hp <= 0) kill(w, t, src);
  return true;
}

function kill(w, t, src) {
  const wasChosen = isChosen(w, t), m = w.match;
  dropWeapon(w, t);
  t.hp = 0; t.dead = CFG.hunterRespawn; t.vx = t.vy = t.kx = t.ky = 0; resetStatus(t);
  fx(w, { k: 'death', x: t.x, y: t.y - 8, c: t.color, big: wasChosen, ttl: 0.8, shake: wasChosen ? 9 : 4, snd: wasChosen ? 'bigDeath' : 'death' });
  w.freeze = Math.max(w.freeze, wasChosen ? CFG.hitstop.kill : CFG.hitstop.big);
  if (m.phase !== 'play') { if (wasChosen) { t.dead = 0; placeAtSpawn(w, t); t.hp = t.maxHp; } return; }
  if (wasChosen) {
    let killer = src && src !== t ? src : topRecentDamager(w, t);
    feed(w, killer ? killer.name : '☠', killer ? killer.color : '#aaa', t.name, t.color, '👑');
    w.slow = CFG.slowmo;
    makeHunter(t);
    const others = w.players.filter(q => q !== t);
    if (!others.length) { t.dead = 0; placeAtSpawn(w, t); makeChosen(w, t); return; }
    const next = killer || rnd(others);
    if (killer) { killer.stats.slays++; addPoint(w, killer, CFG.score.slay); }
    if (m.phase === 'play') makeChosen(w, next);
  } else if (src && isChosen(w, src)) {
    src.stats.kos++;
    feed(w, src.name, src.color, t.name, t.color, '⚔');
    const s = src.streak; s.n = w.time - s.t < 5 ? s.n + 1 : 1; s.t = w.time;
    addPoint(w, src, CFG.score.ko, s.n === 2 ? `${src.name}: ДВОЙНОЙ УДАР!` : s.n === 3 ? `${src.name}: ТРОЙНОЙ УДАР!` : s.n >= 4 ? `${src.name}: НЕУДЕРЖИМ!` : null);
  } else feed(w, '☠', '#aaa', t.name, t.color, '⚔');
}

function respawn(w, p) {
  placeAtSpawn(w, p); p.hp = p.maxHp; p.inv = CFG.spawnInv; p.dead = 0;
  fx(w, { k: 'spawn', x: p.x, y: p.y - 8, c: p.color, ttl: 0.5, snd: 'spawn' });
}

// ---------- прицеливание ----------
function autoTarget(w, p, range) {
  if (!isChosen(w, p)) { const c = byId(w, w.match.chosenId); return c && c.dead <= 0 && !c.leap && dist(bodyC(c), bodyC(p)) < range + bodyR(c) ? c : null; }
  let best = null, bd = range;
  for (const q of w.players) { if (q === p || q.dead > 0 || q.invisT > 0) continue; const d = dist(bodyC(q), bodyC(p)); if (d < bd) { bd = d; best = q; } }
  return best;
}
// направление и точка цели: ручной прицел (вектор силой 0..1) или автонаводка на цель (с упреждением)
function aimInfo(w, p, ax, ay, range, lead = 0) {
  const c = bodyC(p); let r;
  if (ax || ay) {
    const L = Math.hypot(ax, ay) || 1, mag = clamp(L, 0.2, 1);
    r = { dx: ax / L, dy: ay / L, tx: p.x + ax / L * range * mag, ty: p.y + ay / L * range * mag, manual: true };
  } else {
    const t = autoTarget(w, p, range);
    if (t) {
      const tc = bodyC(t); let tx = tc.x, ty = tc.y;
      if (lead) { const tt = Math.min(0.5, dist(tc, c) / lead); tx += (t.vx + t.kx) * tt * 0.7; ty += (t.vy + t.ky) * tt * 0.7; }
      const dx = tx - c.x, dy = ty - c.y, L = Math.hypot(dx, dy) || 1;
      r = { dx: dx / L, dy: dy / L, tx: t.x, ty: t.y, target: t };
    } else r = { dx: Math.cos(p.ang), dy: Math.sin(p.ang), tx: p.x + Math.cos(p.ang) * range * 0.6, ty: p.y + Math.sin(p.ang) * range * 0.6 };
  }
  r.tx = clamp(r.tx, 8, WORLD_W - 8); r.ty = clamp(r.ty, 12, WORLD_H - 8);
  p.ang = Math.atan2(r.dy, r.dx);
  return r;
}
const rot = (dx, dy, a) => [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
const muzzle = (p, a) => { const c = bodyC(p), k = 8 * p.scale; return { x: c.x + a.dx * k, y: c.y + a.dy * k }; };

function proj(w, p, a, o) {
  const m = muzzle(p, a);
  w.projs.push({ x: m.x, y: m.y, owner: p.id, team: isChosen(w, p) ? 'c' : 'h', r: 2, hits: [], ...o });
}
function lob(w, p, a, T0, o) {
  const m = bodyC(p);
  w.projs.push({ x: m.x, y: m.y, vx: 0, vy: 0, owner: p.id, team: isChosen(w, p) ? 'c' : 'h', r: 3, hits: [], ttl: T0 + 0.1,
    lob: { sx: m.x, sy: m.y, tx: a.tx, ty: a.ty, T: T0, t: 0 }, ...o });
}
function hitHunters(w, owner, cx, cy, r, dmg, c, o = {}) {
  for (const q of w.players) {
    if (q === owner || isChosen(w, q) || q.dead > 0) continue;
    if (Math.hypot(q.x - cx, q.y - 6 - cy) <= r + 5) damage(w, q, dmg, owner, { c, kx: q.x - cx, ky: q.y - 6 - cy, ...o });
  }
}
function hitChosenArea(w, src, cx, cy, r, dmg, c, o = {}) {
  const ch = byId(w, w.match.chosenId);
  if (ch && ch.dead <= 0 && ch !== src && Math.hypot(ch.x - cx, ch.y - 7 - cy) <= r + bodyR(ch)) damage(w, ch, dmg, src, { c, kx: ch.x - cx, ky: ch.y - 7 - cy, ...o });
}
function hitAll(w, cx, cy, r, dmg, c, o = {}) {
  for (const q of w.players) { if (q.dead > 0) continue; if (Math.hypot(q.x - cx, q.y - 6 - cy) <= r + 5) damage(w, q, dmg, null, { c, kx: q.x - cx, ky: q.y - 6 - cy, ...o }); }
}

// ---------- охотник: оружие, кулак, навыки ----------
const WSND = { pistol: 'shot', smg: 'smg', shotgun: 'shotgun', sniper: 'sniper', grenade: 'throw', rocket: 'rocketFire', laser: 'laser' };
function fireWeapon(w, p, inp) {
  const W = CFG.weapons[p.weapon];
  const a = aimInfo(w, p, inp.ax, inp.ay, W.range, W.speed || 0);
  p.cdA = W.cd / (p.rageT > 0 ? CFG.skills.rageMul : 1); p.attackT = 0.2; p.ammo--; p.invisT = 0;
  const m = muzzle(p, a);
  p.kx -= a.dx * (W.kb || 0) * 0.25; p.ky -= a.dy * (W.kb || 0) * 0.25; // отдача
  if (W.hitscan) {
    let x = m.x, y = m.y, hit = null; const ch = byId(w, w.match.chosenId), map = mapOf(w);
    for (let d = 0; d < W.range; d += 3) {
      x = m.x + a.dx * d; y = m.y + a.dy * d;
      if (ch && ch.dead <= 0 && !ch.leap && Math.hypot(x - ch.x, y - (ch.y - 7 * ch.scale)) < bodyR(ch) + 2) { hit = ch; break; }
      if (tileAt(map, x, y + 6) === T.BLOCK || w.walls.some(wl => Math.hypot(wl.x - x, wl.y - y) < wl.r)) break;
    }
    fx(w, { k: 'beam', x1: m.x, y1: m.y, x2: x, y2: y, c: '#5cf2ff', ttl: 0.18 });
    if (hit) damage(w, hit, W.dmg, p, { c: '#5cf2ff', kb: W.kb, kx: a.dx, ky: a.dy });
  } else if (p.weapon === 'grenade') {
    lob(w, p, a, clamp(Math.hypot(a.tx - p.x, a.ty - p.y) / 240, 0.35, 0.75), { kind: 'grenade', dmg: W.dmg, R: W.R, c: '#ff8c3a', kb: W.kb });
  } else if (p.weapon === 'rocket') {
    proj(w, p, a, { vx: a.dx * W.speed, vy: a.dy * W.speed, kind: 'rocket', r: 3, dmg: W.dmg, R: W.R, ttl: W.range / W.speed, c: '#ff8c3a', kb: W.kb });
  } else {
    const n = W.pellets || 1;
    for (let i = 0; i < n; i++) {
      const [dx, dy] = rot(a.dx, a.dy, (n > 1 ? (i / (n - 1) - 0.5) : (Math.random() - 0.5)) * W.spread);
      proj(w, p, a, { vx: dx * W.speed, vy: dy * W.speed, kind: p.weapon === 'sniper' ? 'sniper' : 'bullet', r: p.weapon === 'sniper' ? 2.5 : 1.5,
        dmg: W.dmg, ttl: W.range / W.speed * (0.85 + Math.random() * 0.15), c: p.color, pierce: W.pierce, kb: W.kb });
    }
  }
  fx(w, { k: 'muzzle', x: m.x, y: m.y, dx: a.dx, dy: a.dy, c: p.weapon === 'laser' ? '#5cf2ff' : '#ffd23f', ttl: 0.1, snd: WSND[p.weapon], shell: !W.hitscan && p.weapon !== 'grenade' && p.weapon !== 'rocket', big: W.kb > 100 });
  if (p.ammo <= 0) { p.weapon = null; fx(w, { k: 'empty', x: p.x, y: p.y - 24, c: '#cccccc', ttl: 0.7, snd: 'empty' }); }
}

function punch(w, p, inp) {
  const P = CFG.punch, a = aimInfo(w, p, inp.ax, inp.ay, 40);
  p.cdA = P.cd; p.attackT = 0.2; p.vx += a.dx * 60; p.vy += a.dy * 60;
  const c = bodyC(p);
  fx(w, { k: 'swing', x: c.x, y: c.y, ang: p.ang, r: P.range, arc: P.arc, c: '#ffffff', ttl: 0.16, snd: 'swing' });
  const ch = byId(w, w.match.chosenId);
  if (ch && ch.dead <= 0) {
    const cc = bodyC(ch), d = dist(cc, c), da = Math.abs(((Math.atan2(cc.y - c.y, cc.x - c.x) - p.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (d < P.range + bodyR(ch) && da < P.arc / 2 + 0.3) damage(w, ch, P.dmg, p, { kb: P.kb, kx: a.dx, ky: a.dy, snd: 'punch' });
  }
}

function startLeap(w, p, tx, ty, T0) {
  const [sx, sy] = safePoint(mapOf(w), p.x, p.y, tx, ty);
  p.leap = { sx: p.x, sy: p.y, tx: sx, ty: sy, T: T0, t: 0 }; p.vx = p.vy = p.kx = p.ky = 0;
  return [sx, sy];
}

function heroSkill(w, p, inp) {
  const H = heroOf(p), S = CFG.skills;
  p.cdB = H.cd;
  switch (H.skill) {
    case 'rage': p.rageT = S.rageT; fx(w, { k: 'buff', x: p.x, y: p.y - 8, c: '#ff4d5e', ttl: 0.4, snd: 'rage' }); break;
    case 'block': p.blockT = S.blockT; fx(w, { k: 'buff', x: p.x, y: p.y - 8, c: '#ffd23f', ttl: 0.3, snd: 'shieldUp' }); break;
    case 'heal':
      for (const q of w.players) if (q.dead <= 0 && !isChosen(w, q) && (q === p || dist(q, p) < S.healR)) {
        const add = Math.min(S.heal, q.maxHp - q.hp); q.hp += add;
        if (add > 0) fx(w, { k: 'num', x: q.x, y: q.y - 20, v: '+' + Math.round(add), c: '#7dff8a', ttl: 0.8 });
      }
      fx(w, { k: 'healRing', x: p.x, y: p.y - 4, r: S.healR, c: '#7dff8a', ttl: 0.6, snd: 'heal' }); break;
    case 'shuriken': {
      const a = aimInfo(w, p, inp.bx, inp.by, S.shurRange, S.shurSpeed);
      for (let i = 0; i < S.shurN; i++) { const [dx, dy] = rot(a.dx, a.dy, (i / (S.shurN - 1) - 0.5) * S.shurSpread); proj(w, p, a, { vx: dx * S.shurSpeed, vy: dy * S.shurSpeed, kind: 'shuriken', r: 2, dmg: S.shurDmg, ttl: S.shurRange / S.shurSpeed, c: '#d0d6de', kb: 30 }); }
      p.attackT = 0.2; fx(w, { k: 'muzzle', ...muzzle(p, a), dx: a.dx, dy: a.dy, c: '#ffffff', ttl: 0.1, snd: 'whoosh' }); break;
    }
    case 'turret': {
      const a = aimInfo(w, p, inp.bx, inp.by, 26), tx = p.x + a.dx * 16, ty = p.y + a.dy * 12, t = tileAt(mapOf(w), tx, ty);
      if (t !== T.GROUND && t !== T.ALT) { p.cdB = 0.4; return; }
      w.turrets = w.turrets.filter(q => q.owner !== p.id);
      w.turrets.push({ id: ++w.fxId, x: Math.round(tx), y: Math.round(ty), owner: p.id, t: S.turretT, cd: 0.6, c: p.color, ang: p.ang });
      fx(w, { k: 'buff', x: tx, y: ty - 6, c: p.color, ttl: 0.4, snd: 'build' }); break;
    }
    case 'invis': p.invisT = S.invisT; fx(w, { k: 'smoke', x: p.x, y: p.y - 8, c: '#c9c3ff', ttl: 0.4, snd: 'poof' }); break;
    case 'rocketJump': {
      const a = aimInfo(w, p, inp.bx, inp.by, S.rocketRange);
      const far = !a.manual && !a.target ? [p.x + a.dx * S.rocketRange * 0.8, p.y + a.dy * S.rocketRange * 0.8] : [a.tx, a.ty];
      fx(w, { k: 'boom', x: p.x, y: p.y - 2, r: 16, c: '#ff8c3a', ttl: 0.35, shake: 3, snd: 'rocketFire' });
      hitChosenArea(w, p, p.x, p.y - 4, S.rocketR, S.rocketDmg, '#ff8c3a', { kb: 200 });
      const [lx, ly] = startLeap(w, p, far[0], far[1], S.rocketT); p.leap.boom = true;
      w.teles.push({ k: 'circle', style: 'ally', x: lx, y: ly, r: S.rocketR, t: S.rocketT, ttl: S.rocketT, owner: p.id, c: p.color, noHit: true }); break;
    }
    case 'emp':
      fx(w, { k: 'ring', x: p.x, y: p.y - 6, r: S.empR, c: '#5cf2ff', ttl: 0.4, shake: 3, snd: 'emp' });
      hitChosenArea(w, p, p.x, p.y - 6, S.empR, S.empDmg, '#5cf2ff', { stun: S.empStun }); break;
  }
}

// ---------- Избранный: силы ----------
function nearestHunter(w, p, range, from = p, exclude = []) {
  let best = null, bd = range;
  for (const q of w.players) { if (q === p || isChosen(w, q) || q.dead > 0 || q.invisT > 0 || exclude.includes(q)) continue; const d = dist(q, from); if (d < bd) { bd = d; best = q; } }
  return best;
}

function attackA(w, p, inp) {
  const pw = CFG.powers[p.power], k = p.power; p.cdA = pw.aCd; p.attackT = 0.22;
  const a = aimInfo(w, p, inp.ax, inp.ay, pw.aRange, pw.aSpeed || 0);
  if (k === 'fire') {
    proj(w, p, a, { vx: a.dx * pw.aSpeed, vy: a.dy * pw.aSpeed, kind: 'fire', r: 5, dmg: pw.aDmg, ttl: pw.aRange / pw.aSpeed, c: pw.color, kb: 90 });
    fx(w, { k: 'muzzle', ...muzzle(p, a), dx: a.dx, dy: a.dy, c: pw.color, ttl: 0.1, snd: 'fire' });
  } else if (k === 'ice') {
    proj(w, p, a, { vx: a.dx * pw.aSpeed, vy: a.dy * pw.aSpeed, kind: 'ice', r: 3, dmg: pw.aDmg, ttl: pw.aRange / pw.aSpeed, c: pw.color, slow: pw.slowT, kb: 40 });
    fx(w, { k: 'muzzle', ...muzzle(p, a), dx: a.dx, dy: a.dy, c: pw.color, ttl: 0.1, snd: 'iceShot' });
  } else if (k === 'bolt') {
    let from = p, hit = [], t = a.target && !isChosen(w, a.target) ? a.target : nearestHunter(w, p, pw.aRange);
    if (!t) { const c = bodyC(p); fx(w, { k: 'bolt', x1: c.x, y1: c.y, x2: c.x + a.dx * 50, y2: c.y + a.dy * 50, c: pw.color, ttl: 0.15, snd: 'zapSmall' }); return; }
    for (let i = 0; i <= pw.aJumps && t; i++) {
      fx(w, { k: 'bolt', x1: from.x, y1: from.y - 8, x2: t.x, y2: t.y - 8, c: pw.color, ttl: 0.22, snd: i ? null : 'zap' });
      damage(w, t, pw.aDmg, p, { c: pw.color, snd: 'zapHit', kb: 50, kx: t.x - from.x, ky: t.y - from.y }); hit.push(t); from = t;
      t = nearestHunter(w, p, pw.aJump, from, hit);
    }
  } else if (k === 'giant') {
    w.teles.push({ k: 'cone', owner: p.id, ang: p.ang, arc: pw.aArc, r: pw.aRange, t: pw.aTele, ttl: pw.aTele, dmg: pw.aDmg, c: pw.color, kb: pw.aKb });
    fx(w, { k: 'charge', x: p.x, y: p.y - 12, c: pw.color, ttl: 0.3, snd: 'windup' });
  } else if (k === 'poison') {
    lob(w, p, a, clamp(Math.hypot(a.tx - p.x, a.ty - p.y) / 230, 0.35, 0.75), { kind: 'glob', dmg: pw.aDmg, R: pw.aR, c: pw.color });
    fx(w, { k: 'muzzle', ...muzzle(p, a), dx: a.dx, dy: a.dy, c: pw.color, ttl: 0.1, snd: 'glob' });
  } else if (k === 'shadow') {
    const ox = p.x, oy = p.y, map = mapOf(w);
    for (let i = 0; i < 8; i++) { const bx = p.x, by = p.y; moveCircle(map, p, a.dx * pw.aDist / 8, a.dy * pw.aDist / 8); if (tileAt(map, p.x, p.y) === T.DEEP) { p.x = bx; p.y = by; break; } }
    for (const q of w.players) {
      if (q === p || isChosen(w, q) || q.dead > 0) continue;
      const ex = p.x - ox, ey = p.y - oy, t = clamp(((q.x - ox) * ex + (q.y - oy) * ey) / (ex * ex + ey * ey || 1), 0, 1);
      if (Math.hypot(q.x - (ox + ex * t), q.y - (oy + ey * t)) < 14) damage(w, q, pw.aDmg, p, { c: pw.color, kb: 150, kx: a.dx, ky: a.dy });
    }
    p.px = p.x; p.py = p.y;
    fx(w, { k: 'slash', x1: ox, y1: oy - 8, x2: p.x, y2: p.y - 8, c: pw.color, ttl: 0.25, snd: 'slash' });
  } else if (k === 'gravity') {
    proj(w, p, a, { vx: a.dx * pw.aSpeed, vy: a.dy * pw.aSpeed, kind: 'orb', r: 4, dmg: pw.aDmg, ttl: pw.aRange / pw.aSpeed * 1.3, c: pw.color, home: true, kb: 60 });
    fx(w, { k: 'muzzle', ...muzzle(p, a), dx: a.dx, dy: a.dy, c: pw.color, ttl: 0.1, snd: 'orb' });
  } else if (k === 'wind') {
    proj(w, p, a, { vx: a.dx * pw.aSpeed, vy: a.dy * pw.aSpeed, kind: 'blade', r: 5, dmg: pw.aDmg, ttl: pw.aRange / pw.aSpeed, c: pw.color, pierce: true, kb: pw.aKb });
    fx(w, { k: 'muzzle', ...muzzle(p, a), dx: a.dx, dy: a.dy, c: pw.color, ttl: 0.1, snd: 'whoosh' });
  }
}

function attackB(w, p, inp) {
  const pw = CFG.powers[p.power], k = p.power, map = mapOf(w);
  const a = aimInfo(w, p, inp.bx, inp.by, pw.bRange || 60);
  if (k === 'fire') {
    w.teles.push({ k: 'circle', follow: true, owner: p.id, x: p.x, y: p.y - 6, r: pw.bR, t: pw.bTele, ttl: pw.bTele, dmg: pw.bDmg, c: pw.color, kb: 220, style: 'ring', snd: 'fireRing' });
    fx(w, { k: 'charge', x: p.x, y: p.y - 8, c: pw.color, ttl: 0.4, snd: 'windup' });
  } else if (k === 'giant') {
    const [lx, ly] = startLeap(w, p, a.tx, a.ty, pw.bT);
    w.teles.push({ k: 'circle', owner: p.id, x: lx, y: ly, r: pw.bR, t: pw.bT, ttl: pw.bT, dmg: pw.bDmg, c: pw.color, kb: 240, style: 'slam', snd: 'slam' });
    fx(w, { k: 'dust', x: p.x, y: p.y, c: '#d8c8b0', ttl: 0.3, n: 10, snd: 'bigJump' });
  } else if (k === 'bolt' || k === 'shadow') {
    let tx = a.tx, ty = a.ty;
    if (k === 'shadow' && !a.manual && a.target) { tx = a.target.x - a.dx * -14; ty = a.target.y - a.dy * -14; }
    const ox = p.x, oy = p.y, [sx, sy] = safePoint(map, p.x, p.y, tx, ty);
    p.x = p.px = sx; p.y = p.py = sy; p.kx = p.ky = 0;
    if (k === 'bolt') fx(w, { k: 'bolt', x1: ox, y1: oy - 8, x2: sx, y2: sy - 8, c: pw.color, ttl: 0.3, snd: 'teleport' });
    else fx(w, { k: 'smoke', x: ox, y: oy - 8, c: '#1a0f2a', ttl: 0.4, snd: 'blink' });
    fx(w, { k: 'ring', x: sx, y: sy - 6, r: pw.bR, c: pw.color, ttl: 0.35, shake: 3 });
    hitHunters(w, p, sx, sy - 6, pw.bR, pw.bDmg, pw.color, { kb: 160, snd: k === 'bolt' ? 'zapHit' : null });
  } else if (k === 'ice') {
    const cx = p.x + a.dx * 26, cy = p.y - 4 + a.dy * 26, nx = -a.dy, ny = a.dx;
    for (let i = -pw.wallLen; i <= pw.wallLen; i++) w.walls.push({ x: cx + nx * i * 9, y: cy + ny * i * 9, r: 7, t: pw.wallT, ttl: pw.wallT });
    fx(w, { k: 'wall', x: cx, y: cy, c: pw.color, ttl: 0.3, snd: 'iceWall', shake: 2 });
  } else if (k === 'poison') {
    w.zones.push({ id: ++w.fxId, k: 'poison', x: a.tx, y: a.ty, r: pw.bR, t: pw.bT, ttl: pw.bT, dps: pw.bDps, owner: p.id, c: pw.color });
    fx(w, { k: 'cloud', x: a.tx, y: a.ty, r: pw.bR, c: pw.color, ttl: 0.4, snd: 'gas' });
  } else if (k === 'gravity') {
    w.zones.push({ id: ++w.fxId, k: 'hole', x: a.tx, y: a.ty - 4, r: pw.bR, t: pw.bT, ttl: pw.bT, pull: pw.bPull, dmg: pw.bDmg, owner: p.id, c: pw.color });
    fx(w, { k: 'charge', x: a.tx, y: a.ty - 4, c: pw.color, ttl: 0.4, snd: 'hole' });
  } else if (k === 'wind') {
    const c = bodyC(p);
    w.projs.push({ x: c.x + a.dx * 12, y: c.y + a.dy * 12, vx: a.dx * pw.bSpeed, vy: a.dy * pw.bSpeed, owner: p.id, team: 'c', r: 13, hits: [], kind: 'tornado', dmg: pw.bDmg, kb: pw.bKb, ttl: pw.bRange / pw.bSpeed, c: pw.color, pierce: true });
    fx(w, { k: 'dust', x: p.x + a.dx * 12, y: p.y + a.dy * 12, c: '#e8fff6', n: 8, ttl: 0.3, snd: 'tornado' });
  }
  p.cdB = pw.bCd; p.attackT = 0.25;
}

function ultimate(w, p) {
  const pw = CFG.powers[p.power], k = p.power, g = mapOf(w).ground;
  p.ult = 0; p.attackT = 0.4;
  fx(w, { k: 'ultflash', x: p.x, y: p.y - 10, c: pw.color, ttl: 0.6, shake: 6, snd: 'ult' });
  banner(w, pw.ultName.toUpperCase() + '!', p.name, pw.color, 1.6);
  w.freeze = Math.max(w.freeze, 0.12);
  const hunters = w.players.filter(q => q !== p && q.dead <= 0);
  if (k === 'fire') {
    for (let i = 0; i < pw.uN; i++) {
      const tg = hunters.length && Math.random() < 0.75 ? rnd(hunters) : null, s = tg ? [tg.x + rr(-28, 28), tg.y + rr(-22, 22)] : rnd(g);
      w.teles.push({ k: 'circle', style: 'meteor', x: s[0], y: s[1], r: pw.uR, t: pw.uTele + i * pw.uSpan / pw.uN, ttl: pw.uTele, dmg: pw.uDmg, c: pw.color, owner: p.id, kb: 160, snd: 'explode' });
    }
  } else if (k === 'bolt') {
    for (const h of hunters) for (let s = 0; s < pw.uStrikes; s++)
      w.teles.push({ k: 'circle', style: 'strike', track: h.id, x: h.x, y: h.y, r: pw.uR, t: pw.uTele + s * pw.uGap, ttl: pw.uTele, dmg: pw.uDmg, c: pw.color, owner: p.id, kb: 80, snd: 'thunder' });
  } else if (k === 'ice') {
    fx(w, { k: 'blizzard', x: p.x, y: p.y - 8, r: pw.uR, c: pw.color, ttl: 1.6, snd: 'blizzard', shake: 4 });
    hitHunters(w, p, p.x, p.y - 6, pw.uR, pw.uDmg, pw.color, { freeze: pw.uFreeze, slow: pw.uSlow, snd: 'freeze' });
  } else if (k === 'giant') {
    fx(w, { k: 'quake', x: p.x, y: p.y, r: pw.uR, c: pw.color, ttl: 1.0, shake: 12, snd: 'quake' });
    hitHunters(w, p, p.x, p.y - 6, pw.uR, pw.uDmg, pw.color, { stun: pw.uStun, kb: pw.uKb });
  } else if (k === 'poison') {
    for (let i = 0; i < pw.uN; i++) {
      const tg = hunters.length ? hunters[i % hunters.length] : null, s = tg ? [tg.x + rr(-16, 16), tg.y + rr(-12, 12)] : rnd(g);
      w.zones.push({ id: ++w.fxId, k: 'poison', x: s[0], y: s[1], r: pw.uR, t: pw.uT, ttl: pw.uT, dps: pw.uDps, owner: p.id, c: pw.color });
    }
    fx(w, { k: 'cloud', x: p.x, y: p.y - 8, r: 70, c: pw.color, ttl: 0.6, snd: 'gas' });
  } else if (k === 'shadow') {
    for (let i = 0; i < pw.uN; i++) {
      const an = i / pw.uN * Math.PI * 2;
      w.projs.push({ x: p.x + Math.cos(an) * 18, y: p.y - 8 + Math.sin(an) * 14, vx: Math.cos(an) * 60, vy: Math.sin(an) * 60, owner: p.id, team: 'c', r: 7, hits: [], kind: 'clone', dmg: pw.uDmg, ttl: pw.uT, c: pw.color, homing: pw.uSpeed, kb: 120 });
    }
  } else if (k === 'gravity') {
    w.zones.push({ id: ++w.fxId, k: 'hole', x: p.x, y: p.y - 8, r: 40, big: true, reach: pw.uR, t: pw.uT, ttl: pw.uT, pull: pw.uPull, dmg: pw.uDmg, kb: pw.uKb, owner: p.id, c: pw.color, followOwner: true });
  } else if (k === 'wind') {
    hitHunters(w, p, p.x, p.y - 6, pw.uR, pw.uDmg, pw.color, { kb: pw.uKb });
    fx(w, { k: 'gust', x: p.x, y: p.y - 6, r: pw.uR, c: pw.color, ttl: 0.6, shake: 8, snd: 'wind' });
    for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2; w.projs.push({ x: p.x + Math.cos(an) * 14, y: p.y - 7 + Math.sin(an) * 14, vx: Math.cos(an) * 150, vy: Math.sin(an) * 150, owner: p.id, team: 'c', r: 13, hits: [], kind: 'tornado', dmg: pw.bDmg, kb: pw.bKb, ttl: 1.4, c: pw.color, pierce: true }); }
  }
}

// ---------- бонусы ----------
function pickupStep(w, dt) {
  const C = CFG.pickups;
  w.weaponT -= dt; w.itemT -= dt;
  const nW = w.pickups.filter(q => q.k === 'weapon').length, nI = w.pickups.length - nW;
  if (w.weaponT <= 0) { w.weaponT = C.weaponEvery; if (nW < C.maxWeapons) spawnWeapon(w); }
  if (w.itemT <= 0) {
    w.itemT = C.itemEvery;
    if (nI < C.maxItems) { const s = freeSpot(w); if (s) { w.pickups.push({ id: ++w.fxId, k: 'item', w: rnd(['heal', 'heal', 'shield', 'speed']), x: s[0], y: s[1], life: C.life }); fx(w, { k: 'pop', x: s[0], y: s[1] - 6, c: '#fff', ttl: 0.3 }); } }
  }
  for (const pk of w.pickups) {
    pk.life -= dt;
    for (const p of w.players) {
      if (p.dead > 0 || pk.life <= 0 || p.leap) continue;
      if (Math.hypot(p.x - pk.x, p.y - pk.y) > 11 + bodyR(p) * 0.5) continue;
      if (isChosen(w, p)) {
        if (pk.k !== 'item') continue;
        pk.life = 0; p.ult = Math.min(CFG.chosen.ultMax, p.ult + CFG.chosen.ultPickup);
        fx(w, { k: 'pickup', x: pk.x, y: pk.y - 8, c: CFG.powers[p.power].color, label: '+УЛЬТА', ttl: 0.8, snd: 'pickup' });
      } else if (pk.k === 'weapon') {
        const cur = p.weapon && CFG.weapons[p.weapon];
        if (p.weapon && p.weapon !== pk.w && p.ammo > cur.ammo * 0.3) continue;
        const same = p.weapon === pk.w;
        pk.life = 0; p.ammo = same ? Math.min(CFG.weapons[pk.w].ammo * 2, p.ammo + pk.ammo) : pk.ammo; p.weapon = pk.w; p.stats.picks++;
        fx(w, { k: 'pickup', x: pk.x, y: pk.y - 8, c: '#ffd23f', label: CFG.weapons[pk.w].name, ttl: 0.8, snd: 'reload' });
      } else {
        pk.life = 0; const it = CFG.items[pk.w];
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
    H.phase = 'warn'; H.t = HZ.warn; H.k = m.def.hazard; H.hit = []; H.data = [];
    const spots = (n, jit) => { const out = []; for (let i = 0; i < n; i++) { const tg = i < alive.length ? alive[i] : null, s = tg ? [tg.x + rr(-jit, jit), tg.y + rr(-jit, jit)] : rnd(m.ground); out.push({ x: s[0], y: s[1] }); } return out; };
    if (H.k === 'wind') { const a = Math.random() * Math.PI * 2; H.dx = Math.cos(a); H.dy = Math.sin(a); }
    else if (H.k === 'geyser') H.data = spots(HZ.geyserN, 14);
    else if (H.k === 'ice') H.data = spots(HZ.iceN, 30);
    else if (H.k === 'spores') H.data = spots(HZ.sporeN, 20);
    else if (H.k === 'storm') H.data = spots(HZ.stormN, 18);
    else if (H.k === 'laser') { H.dx = Math.random() < 0.5 ? 1 : -1; H.x = H.dx > 0 ? 40 : WORLD_W - 40; }
    fx(w, { k: 'warn', x: 0, y: 0, ttl: 0.3, snd: 'warn' });
    say(w, `⚠ ${m.def.hazardName}!`, HZ.warn);
  } else if (H.phase === 'warn' && H.t <= 0) {
    H.phase = 'active';
    const strike = (r, dmg, style, snd, gap) => H.data.forEach((s, i) => w.teles.push({ k: 'circle', style, hazard: true, x: s.x, y: s.y, r, t: 0.05 + i * gap, ttl: 0.05, dmg, c: style === 'geyser' ? '#ff7a1a' : style === 'ice' ? '#cfefff' : '#ffe83a', kb: 160, snd }));
    if (H.k === 'wind') { H.t = HZ.windT; fx(w, { k: 'gustAll', x: 0, y: 0, ttl: 0.3, snd: 'wind' }); }
    else if (H.k === 'geyser') { H.t = 1; strike(HZ.geyserR, HZ.geyserDmg, 'geyser', 'geyser', 0.08); }
    else if (H.k === 'ice') { H.t = 1.6; strike(HZ.iceR, HZ.iceDmg, 'ice', 'shatter', 0.16); }
    else if (H.k === 'storm') { H.t = 1.5; strike(HZ.stormR, HZ.stormDmg, 'strike', 'thunder', 0.15); }
    else if (H.k === 'spores') { H.t = HZ.sporeT; for (const s of H.data) w.zones.push({ id: ++w.fxId, k: 'poison', x: s.x, y: s.y, r: HZ.sporeR, t: HZ.sporeT, ttl: HZ.sporeT, dps: HZ.sporeDps, owner: null, c: '#d77dff' }); fx(w, { k: 'gustAll', x: 0, y: 0, ttl: 0.3, snd: 'gas' }); }
    else if (H.k === 'laser') { H.t = HZ.laserT; fx(w, { k: 'gustAll', x: 0, y: 0, ttl: 0.3, snd: 'laserBig', shake: 3 }); }
  } else if (H.phase === 'active') {
    if (H.k === 'laser') {
      H.x += H.dx * (WORLD_W - 80) / HZ.laserT * dt;
      for (const p of w.players) { if (p.dead > 0 || H.hit.includes(p.id)) continue; if (Math.abs(p.x - H.x) < 6 + bodyR(p)) { H.hit.push(p.id); damage(w, p, HZ.laserDmg, null, { c: '#ff2a6d', kb: 200, kx: H.dx, ky: 0, snd: 'burn' }); } }
    }
    if (H.t <= 0) { H.phase = 'idle'; H.t = HZ.every; H.data = []; }
  }
}

const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);

// ---------- главный шаг ----------
export function step(w, inputs, rdt) {
  const m = w.match;
  for (const f of w.fx) f.t -= rdt;
  w.fx = w.fx.filter(f => f.t > 0);
  m.msgT = Math.max(0, m.msgT - rdt);
  if (m.banner) { m.banner.t -= rdt; if (m.banner.t <= 0) m.banner = null; }
  if (w.freeze > 0) { w.freeze -= rdt; for (const p of w.players) { p.px = p.x; p.py = p.y; } return; } // стоп-кадр при сильном ударе
  let dt = rdt;
  if (w.slow > 0) { w.slow -= rdt; dt = rdt * CFG.slowmoScale; }
  w.time += dt;
  if (m.phase === 'end') return;
  if (m.phase === 'countdown') {
    const before = Math.ceil(m.timer); m.timer -= dt;
    if (Math.ceil(m.timer) !== before && m.timer > 0) fx(w, { k: 'tick', x: 0, y: 0, ttl: 0.2, snd: 'count' });
    if (m.timer <= 0) { m.phase = 'play'; m.timer = CFG.match.time; fx(w, { k: 'go', x: 0, y: 0, ttl: 0.2, snd: 'go' }); }
  } else if (m.phase === 'play') {
    m.timer -= dt;
    if (m.timer <= 0) finish(w, null);
  } else if (m.phase === 'finish') { m.timer -= rdt; if (m.timer <= 0) { m.phase = 'end'; return; } }
  const play = m.phase === 'play';
  if (play) { pickupStep(w, dt); hazardStep(w, dt); }
  const map = mapOf(w), H = w.hazard;
  const windOn = play && H.k === 'wind' && H.phase === 'active';

  for (const p of w.players) {
    p.px = p.x; p.py = p.y;
    for (const k of ['inv', 'cdA', 'cdB', 'slowT', 'attackT', 'hitT', 'frozenT', 'stunT', 'blockT', 'invisT', 'speedT', 'rageT']) p[k] = Math.max(0, p[k] - dt);
    p.noDmgT = (p.noDmgT || 0) + dt;
    if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0) { if (m.phase !== 'finish') respawn(w, p); else p.dead = 0.05; } continue; }
    const ch = isChosen(w, p) && !!p.power, pw = ch ? CFG.powers[p.power] : null, hero = heroOf(p);
    const maxCh = hero.dodges || 1;
    if (p.charges < maxCh) { p.cdD -= dt; if (p.cdD <= 0) { p.charges++; p.cdD = CFG.dodge.cd; } }
    // прыжок по дуге (ракетчик, гигант)
    if (p.leap) {
      const L = p.leap; L.t += dt; const k = Math.min(1, L.t / L.T);
      p.x = L.sx + (L.tx - L.sx) * k; p.y = L.sy + (L.ty - L.sy) * k; p.animT += dt;
      if (k >= 1) {
        p.leap = null; p.inv = Math.max(p.inv, 0.15);
        fx(w, { k: 'dust', x: p.x, y: p.y, c: '#e8e0d0', n: 12, ttl: 0.4, snd: 'land' });
        if (L.boom) { fx(w, { k: 'boom', x: p.x, y: p.y - 4, r: CFG.skills.rocketR, c: '#ff8c3a', ttl: 0.4, shake: 4, snd: 'explode' }); hitChosenArea(w, p, p.x, p.y - 4, CFG.skills.rocketR, CFG.skills.rocketDmg, '#ff8c3a', { kb: 200 }); }
      }
      continue;
    }
    const locked = p.frozenT > 0 || p.stunT > 0;
    const inp = locked ? {} : (inputs[p.id] || {});
    let speed = ch ? CFG.chosen.speed * pw.speedMul : hero.speed;
    if (p.speedT > 0) speed *= CFG.items.speed.mul;
    if (p.rageT > 0) speed *= CFG.skills.rageSpeed;
    if (p.invisT > 0) speed *= CFG.skills.invisSpeed;
    if (p.blockT > 0) speed *= 0.6;
    if (p.slowT > 0) speed *= 1 - CFG.powers.ice.slow;
    const tile = tileAt(map, p.x, p.y);
    if (tile === T.SHALLOW) speed *= 0.62;
    p.spd = speed;
    let mx = inp.mx || 0, my = inp.my || 0; const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    p.moving = ml > 0.15;
    if (p.moving && p.attackT <= 0) p.ang = Math.atan2(my, mx);

    if (play) {
      if (inp.a && p.cdA <= 0) { if (ch) attackA(w, p, inp); else if (p.weapon) fireWeapon(w, p, inp); else punch(w, p, inp); }
      if (inp.b && p.cdB <= 0) { if (ch) attackB(w, p, inp); else heroSkill(w, p, inp); }
      if (inp.c && ch && p.ult >= CFG.chosen.ultMax) ultimate(w, p);
    }
    if (p.leap) continue;
    if (inp.d && !ch && p.charges > 0 && p.dodgeT <= 0 && m.phase !== 'finish') {
      const dl = ml > 0.15 ? 1 : 0; p.ddx = dl ? mx / (ml > 1 ? 1 : ml) : Math.cos(p.ang); p.ddy = dl ? my / (ml > 1 ? 1 : ml) : Math.sin(p.ang);
      if (p.charges === maxCh) p.cdD = CFG.dodge.cd;
      p.charges--; p.dodgeT = CFG.dodge.time; p.inv = Math.max(p.inv, CFG.dodge.inv); p.kx = p.ky = 0;
      fx(w, { k: 'dash', x: p.x, y: p.y - 6, dx: p.ddx, dy: p.ddy, c: p.color, ttl: 0.3, snd: 'dash' });
    }
    if (p.dodgeT > 0) {
      p.dodgeT -= dt; p.vx = p.ddx * CFG.dodge.speed; p.vy = p.ddy * CFG.dodge.speed;
    } else {
      const acc = CFG.accel * (map.ice && tile === T.ALT ? 0.16 : 1) * dt;
      p.vx = approach(p.vx, mx * speed, acc); p.vy = approach(p.vy, my * speed, acc);
    }
    const kd = Math.exp(-CFG.kbDecay * dt); p.kx *= kd; p.ky *= kd;
    const wx = windOn ? H.dx * CFG.hazards.windSpeed : 0, wy = windOn ? H.dy * CFG.hazards.windSpeed : 0;
    moveCircle(map, p, (p.vx + p.kx + wx) * dt, (p.vy + p.ky + wy) * dt, CFG.bodyR, ch ? null : w.walls);
    if (p.moving || p.dodgeT > 0) p.animT += dt;
    // вода / лава / обрыв
    const t2 = tileAt(map, p.x, p.y);
    if (t2 === T.DEEP && p.dodgeT <= 0) { p.sinkT += dt; if (p.sinkT > CFG.sinkTime) { fx(w, { k: 'splash', x: p.x, y: p.y, c: '#fff', ttl: 0.5, snd: 'splash' }); kill(w, p, null); continue; } }
    else p.sinkT = 0;
    if (t2 === T.SHALLOW && map.hot && play) { p.dotAcc += 12 * dt; if (p.dotAcc >= 4) { p.dotAcc -= 4; damage(w, p, 4, null, { dot: true, c: '#ff7a1a' }); if (p.dead > 0) continue; } }
    if (ch && play) {
      if (p.noDmgT > CFG.chosen.regenDelay) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * CFG.chosen.regen * dt);
      p.ult = Math.min(CFG.chosen.ultMax, p.ult + CFG.chosen.ultPerSec * dt);
      p.stats.chosenTime += dt; p.aliveT += dt;
      if (p.aliveT >= CFG.match.surviveEvery) { p.aliveT -= CFG.match.surviveEvery; addPoint(w, p, CFG.score.survive, `${p.name} держит корону!`); }
    }
  }

  // турели
  for (const tu of w.turrets) {
    tu.t -= dt; tu.cd -= dt;
    const ch = byId(w, m.chosenId), owner = byId(w, tu.owner);
    if (!owner) tu.t = 0;
    if (play && tu.cd <= 0 && ch && ch.dead <= 0 && owner && !ch.leap) {
      const c = bodyC(ch), dx = c.x - tu.x, dy = c.y - (tu.y - 8), d = Math.hypot(dx, dy);
      if (d < CFG.skills.turretRange) {
        tu.cd = CFG.skills.turretCd; tu.ang = Math.atan2(dy, dx);
        w.projs.push({ x: tu.x + dx / d * 7, y: tu.y - 8 + dy / d * 7, vx: dx / d * 300, vy: dy / d * 300, owner: tu.owner, team: 'h', r: 1.5, hits: [], kind: 'bullet', dmg: CFG.skills.turretDmg, ttl: 0.6, c: tu.c, kb: 15 });
        fx(w, { k: 'muzzle', x: tu.x + dx / d * 8, y: tu.y - 8 + dy / d * 8, dx: dx / d, dy: dy / d, c: '#ffd23f', ttl: 0.08, snd: 'turret' });
      }
    }
  }
  w.turrets = w.turrets.filter(t => t.t > 0);

  // зоны
  for (const z of w.zones) {
    z.t -= dt;
    const owner = z.owner ? byId(w, z.owner) : null;
    if (z.owner && (!owner || !isChosen(w, owner))) { z.t = Math.min(z.t, 0); continue; }
    if (z.followOwner && owner) { z.x = owner.x; z.y = owner.y - 8; }
    for (const q of w.players) {
      if (q.dead > 0 || q === owner || q.leap) continue;
      if (z.owner && isChosen(w, q)) continue;
      const dx = z.x - q.x, dy = z.y - (q.y - 6), d = Math.hypot(dx, dy) || 1;
      if (z.k === 'poison' && d < z.r) {
        q.dotAcc += z.dps * dt; q.slowT = Math.max(q.slowT, 0.25);
        if (q.dotAcc >= 4) { q.dotAcc -= 4; damage(w, q, 4, owner, { dot: true, c: z.c }); }
      } else if (z.k === 'hole' && z.t > 0) {
        const reach = z.reach || z.r * 2.2;
        if (d < reach && d > 6 && q.dodgeT <= 0) { const f = z.pull * (z.big ? 1 : 1.2 - d / reach) * dt; moveCircle(map, q, dx / d * f, dy / d * f); }
      }
    }
    if (z.k === 'hole' && z.t <= 0 && owner) {
      fx(w, { k: 'boom', x: z.x, y: z.y, r: z.big ? z.r * 1.6 : z.r, c: z.c, ttl: 0.5, shake: z.big ? 10 : 5, snd: 'explode' });
      hitHunters(w, owner, z.x, z.y, z.big ? z.r * 1.8 : z.r, z.dmg, z.c, { kb: z.kb || 220 });
    }
  }
  w.zones = w.zones.filter(z => z.t > 0);

  // снаряды
  for (const pr of w.projs) {
    pr.ttl -= dt;
    if (pr.lob) {
      const L = pr.lob; L.t += dt; const k = Math.min(1, L.t / L.T);
      pr.x = L.sx + (L.tx - L.sx) * k; pr.y = L.sy + (L.ty - L.sy) * k; pr.h = Math.sin(Math.PI * k) * (18 + L.T * 30);
      if (k >= 1) pr.ttl = 0;
    } else {
      if (pr.home || pr.homing) {
        let tg = null, bd = 1e9;
        for (const q of w.players) { if (isChosen(w, q) || q.dead > 0 || q.invisT > 0 || pr.hits.includes(q.id)) continue; const d = Math.hypot(q.x - pr.x, q.y - 7 - pr.y); if (d < bd) { bd = d; tg = q; } }
        if (tg) {
          const dx = tg.x - pr.x, dy = tg.y - 7 - pr.y, d = Math.hypot(dx, dy) || 1;
          if (pr.homing) { pr.vx += (dx / d * pr.homing - pr.vx) * Math.min(1, dt * 3); pr.vy += (dy / d * pr.homing - pr.vy) * Math.min(1, dt * 3); }
          else { const sp = Math.hypot(pr.vx, pr.vy); pr.vx += dx / d * sp * dt * 2; pr.vy += dy / d * sp * dt * 2; const s2 = Math.hypot(pr.vx, pr.vy) || 1; pr.vx *= sp / s2; pr.vy *= sp / s2; }
        }
      }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (pr.kind !== 'clone' && pr.kind !== 'tornado' && tileAt(map, pr.x, pr.y + 6) === T.BLOCK) { pr.ttl = 0; pr.blocked = true; }
      if (pr.team === 'h') for (const wl of w.walls) if (Math.hypot(wl.x - pr.x, wl.y - pr.y) < wl.r + pr.r) { pr.ttl = 0; pr.blocked = true; fx(w, { k: 'hit', x: pr.x, y: pr.y, c: '#8ee8ff', ttl: 0.2, snd: 'block' }); break; }
      if (pr.ttl > 0) {
        const src = byId(w, pr.owner);
        for (const q of w.players) {
          if (q.dead > 0 || q.id === pr.owner || pr.hits.includes(q.id) || q.leap) continue;
          if ((pr.team === 'h') !== isChosen(w, q)) continue;
          const c = bodyC(q);
          if (Math.hypot(c.x - pr.x, c.y - pr.y) < bodyR(q) + pr.r) {
            if (pr.kind === 'rocket') { pr.ttl = 0; break; }
            damage(w, q, pr.dmg, src, { c: pr.c, slow: pr.slow, kb: pr.kb, kx: pr.vx, ky: pr.vy, snd: pr.kind === 'fire' ? 'burn' : pr.kind === 'ice' ? 'freeze' : null });
            if (pr.kind === 'fire') fx(w, { k: 'boom', x: pr.x, y: pr.y, r: 12, c: pr.c, ttl: 0.3 });
            pr.hits.push(q.id);
            if (!pr.pierce || pr.kind === 'clone') { pr.ttl = 0; break; }
          }
        }
      }
    }
    if (pr.ttl <= 0 && !pr.done) {
      pr.done = true;
      const src = byId(w, pr.owner);
      if (pr.kind === 'grenade' || pr.kind === 'rocket') {
        fx(w, { k: 'boom', x: pr.x, y: pr.y, r: pr.R, c: '#ff8c3a', ttl: 0.45, shake: pr.kind === 'rocket' ? 5 : 4, snd: 'explode' });
        hitChosenArea(w, src, pr.x, pr.y, pr.R, pr.dmg, '#ff8c3a', { kb: pr.kb });
      } else if (pr.kind === 'glob') {
        const P = CFG.powers.poison;
        fx(w, { k: 'splat', x: pr.x, y: pr.y, c: pr.c, ttl: 0.3, snd: 'splat' });
        if (src && isChosen(w, src)) { hitHunters(w, src, pr.x, pr.y, pr.R, pr.dmg, pr.c); w.zones.push({ id: ++w.fxId, k: 'poison', x: pr.x, y: pr.y, r: pr.R, t: P.puddleT, ttl: P.puddleT, dps: P.puddleDps, owner: pr.owner, c: pr.c, puddle: true }); }
      } else if (pr.kind === 'fire' && !pr.hits.length) fx(w, { k: 'boom', x: pr.x, y: pr.y, r: 9, c: pr.c, ttl: 0.25 });
      else if (pr.kind === 'clone') fx(w, { k: 'smoke', x: pr.x, y: pr.y, c: '#1a0f2a', ttl: 0.4 });
      else if (!pr.hits.length || pr.blocked) fx(w, { k: 'puff', x: pr.x, y: pr.y, c: pr.c, ttl: 0.2 });
    }
  }
  w.projs = w.projs.filter(p => p.ttl > 0);

  // телеграфы атак
  for (const t of w.teles) {
    if (t.track) { const h = byId(w, t.track); if (h && h.dead <= 0 && t.t > 0.35) { t.x = h.x; t.y = h.y; } }
    const o = t.owner ? byId(w, t.owner) : null;
    if (t.follow && o) { t.x = o.x; t.y = o.y - 6; }
    t.t -= dt;
    if (t.t > 0) continue;
    if (t.noHit) continue;
    if (!t.hazard && (!o || o.dead > 0 || !isChosen(w, o))) continue;
    if (t.k === 'cone') {
      const c = bodyC(o);
      fx(w, { k: 'swing', x: c.x, y: c.y, ang: t.ang, r: t.r, arc: t.arc, c: t.c, ttl: 0.2, big: true, shake: 4, snd: 'smash' });
      for (const q of w.players) {
        if (q === o || isChosen(w, q) || q.dead > 0) continue;
        const qc = bodyC(q), d = dist(qc, c), da = Math.abs(((Math.atan2(qc.y - c.y, qc.x - c.x) - t.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d < t.r + 6 && da < t.arc / 2) damage(w, q, t.dmg, o, { c: t.c, kb: t.kb, kx: Math.cos(t.ang), ky: Math.sin(t.ang) });
      }
    } else {
      const st = t.style;
      if (st === 'strike') fx(w, { k: 'skybolt', x: t.x, y: t.y, r: t.r, c: t.c, ttl: 0.3, shake: 3, snd: t.snd });
      else if (st === 'ring' || st === 'slam') { fx(w, { k: 'ring', x: t.x, y: t.y, r: t.r, c: t.c, ttl: 0.4, shake: st === 'slam' ? 8 : 5, snd: t.snd }); fx(w, { k: 'boom', x: t.x, y: t.y, r: t.r * 0.55, c: t.c, ttl: 0.35 }); }
      else if (st === 'ice') { fx(w, { k: 'shatter', x: t.x, y: t.y, c: t.c, ttl: 0.3, snd: t.snd, shake: 3, big: true }); fx(w, { k: 'ring', x: t.x, y: t.y, r: t.r, c: t.c, ttl: 0.3 }); }
      else fx(w, { k: 'boom', x: t.x, y: t.y - 2, r: t.r, c: t.c, ttl: 0.45, shake: 4, snd: t.snd });
      if (t.hazard) hitAll(w, t.x, t.y, t.r, t.dmg, t.c, { kb: t.kb });
      else hitHunters(w, o, t.x, t.y, t.r, t.dmg, t.c, { kb: t.kb });
    }
  }
  w.teles = w.teles.filter(t => t.t > 0);
  for (const wl of w.walls) wl.t -= dt;
  w.walls = w.walls.filter(x => x.t > 0);
}
