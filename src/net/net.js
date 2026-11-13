// Сеть: PeerJS, звезда, авторитетный хост (план §1). Код комнаты 5 символов, peerId = izb-<КОД>
import { CFG, PASSWORD } from '../config.js';

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeCode = () => Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');
const peerOpts = () => ({ config: { iceServers: CFG.iceServers }, debug: 1 });

export function hostRoom(code, h) {
  const peer = new Peer('izb-' + code, peerOpts());
  const conns = new Map();
  peer.on('open', () => h.onOpen());
  peer.on('error', e => h.onError(e.type === 'unavailable-id' ? 'Код занят, попробуй ещё раз' : 'Ошибка сети: ' + e.type));
  peer.on('connection', conn => {
    conn.on('data', msg => {
      if (msg.t === 'hello') {
        if (msg.pass !== PASSWORD) { conn.send({ t: 'deny', why: 'Неверный пароль' }); setTimeout(() => conn.close(), 300); return; }
        const r = h.onJoin(conn.peer, msg);
        if (r !== true) { conn.send({ t: 'deny', why: r }); setTimeout(() => conn.close(), 300); return; }
        conns.set(conn.peer, conn); conn.send({ t: 'welcome', id: conn.peer }); h.onJoined && h.onJoined(conn.peer);
      } else if (conns.has(conn.peer)) h.onMsg(conn.peer, msg);
    });
    conn.on('close', () => { if (conns.delete(conn.peer)) h.onLeave(conn.peer); });
  });
  return {
    broadcast(msg) { for (const c of conns.values()) if (c.open) c.send(msg); },
    send(id, msg) { const c = conns.get(id); if (c && c.open) c.send(msg); },
    close() { peer.destroy(); },
  };
}

export function joinRoom(code, hello, h) {
  const peer = new Peer(peerOpts());
  let conn = null, ok = false, done = false;
  const fail = setTimeout(() => { if (!ok) { done = true; h.onError('Не удалось подключиться. Проверь код или попробуй Wi‑Fi'); peer.destroy(); } }, 10000);
  peer.on('open', () => {
    conn = peer.connect('izb-' + code, { reliable: true });
    conn.on('open', () => conn.send({ t: 'hello', ...hello }));
    conn.on('data', msg => {
      if (msg.t === 'deny') { clearTimeout(fail); done = true; h.onError(msg.why); peer.destroy(); return; }
      if (msg.t === 'welcome') { ok = true; clearTimeout(fail); }
      h.onMsg(msg);
    });
    conn.on('close', () => { if (ok && !done) h.onClose(); });
  });
  peer.on('error', e => {
    if (done) return; clearTimeout(fail); done = true;
    h.onError(e.type === 'peer-unavailable' ? 'Комната не найдена' : 'Ошибка сети: ' + e.type);
  });
  return { send(msg) { if (conn && conn.open) conn.send(msg); }, close() { done = true; peer.destroy(); } };
}

// компактный снапшот мира
const r1 = v => Math.round(v * 10) / 10;
export function snapshot(w) {
  return { t: r1(w.time), mi: w.mapIdx, fid: w.fxId, m: w.match, hz: w.hazard, pk: w.pickups, zo: w.zones, tu: w.turrets,
    p: w.players.map(p => ({ id: p.id, name: p.name, color: p.color, label: p.label, isBot: p.isBot, hat: p.hat, hero: p.hero, seed: p.seed,
      x: r1(p.x), y: r1(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), facing: p.facing, onGround: p.onGround,
      hp: Math.round(p.hp), maxHp: p.maxHp, dead: r1(p.dead), inv: r1(p.inv), attackT: r1(p.attackT), hitT: r1(p.hitT),
      dashT: r1(p.dashT), frozenT: r1(p.frozenT), stunT: r1(p.stunT), power: p.power, scale: p.scale, score: Math.floor(p.score), slam: p.slam,
      animT: r1(p.animT), cdA: r1(p.cdA), cdB: r1(p.cdB), slowT: r1(p.slowT), ult: Math.floor(p.ult), weapon: p.weapon, ammo: p.ammo,
      blockT: r1(p.blockT), invisT: r1(p.invisT), speedT: r1(p.speedT), shield: Math.round(p.shield), aimX: r1(p.aimX), aimY: r1(p.aimY), stats: p.stats })),
    pr: w.projs.map(q => ({ x: r1(q.x), y: r1(q.y), vx: Math.round(q.vx), vy: Math.round(q.vy), kind: q.kind, c: q.c })),
    te: w.teles, wa: w.walls, fx: w.fx };
}

export function fromSnapshots(prev, cur) {
  const pm = new Map((prev ? prev.p : []).map(p => [p.id, p]));
  return { time: cur.t, mapIdx: cur.mi, fxId: cur.fid, match: cur.m, hazard: cur.hz, pickups: cur.pk, zones: cur.zo || [], turrets: cur.tu || [], projs: cur.pr, teles: cur.te, walls: cur.wa, fx: cur.fx,
    players: cur.p.map(p => { const o = pm.get(p.id); return { ...p, px: o && o.dead <= 0 ? o.x : p.x, py: o && o.dead <= 0 ? o.y : p.y }; }) };
}
