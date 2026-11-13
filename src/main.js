// Оркестрация: экраны, режимы (боты / хост / клиент), фоновая демо-битва в меню, тикер, рендер, награды
import { CFG, PASSWORD } from './config.js';
import { createWorld, addPlayer, removePlayer, startMatch, step } from './sim/world.js';
import { botInput, resetBots } from './sim/bots.js';
import { render, resetRender } from './render/renderer.js';
import { drawCharacter } from './render/character.js';
import { createInput } from './input/touch.js';
import { makeCode, hostRoom, joinRoom, snapshot, fromSnapshots } from './net/net.js';
import { initAudio, sfx, startMusic, isMuted, setMuted } from './audio.js';
import { meta, HAT_LIST, hatState, selectHat, reward, xpNeed, selectHero } from './meta.js';

const $ = id => document.getElementById(id);
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'ПК';
}
const LABEL = deviceLabel();

// ---------- холст ----------
const canvas = $('game'), ctx = canvas.getContext('2d');
const view = { s: 1, ox: 0, oy: 0, cw: 0, ch: 0, u: 1, safeL: 0, safeR: 0 };
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  view.cw = canvas.width = Math.round(innerWidth * dpr);
  view.ch = canvas.height = Math.round(innerHeight * dpr);
  view.s = Math.min(view.cw / CFG.W, view.ch / CFG.H);
  view.ox = Math.round((view.cw - CFG.W * view.s) / 2);
  view.oy = Math.round((view.ch - CFG.H * view.s) / 2);
  view.u = dpr * Math.min(1.5, Math.max(0.85, innerHeight / 360));
  view.safeL = Math.max(view.ox, 0); view.safeR = Math.max(view.ox, 0);
}
addEventListener('resize', resize); resize();

// ---------- звук: включается после первого касания ----------
function unlockAudio() { initAudio(); startMusic(); }
addEventListener('pointerdown', unlockAudio, { once: false, passive: true });
addEventListener('keydown', unlockAudio, { passive: true });
const muteBtn = $('btn-mute');
const syncMute = () => { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
muteBtn.onclick = () => { setMuted(!isMuted()); syncMute(); };
syncMute();
document.addEventListener('click', e => { if (e.target.closest('.btn-y,.btn-g,.hat')) sfx('click'); });

// ---------- состояние ----------
let nick = store.get('izb-nick') || '';
let mode = null, world = null, myId = 'me', net = null, code = '', botLvl = 1;
let ticker = null, lastTick = 0, tickN = 0, sendTimer = null, wakeLock = null;
let snapPrev = null, snapCur = null, snapAt = 0, viewWorld = null, resultsShown = false;
const remote = new Map();
const sample = createInput();
const HERO_KEYS = Object.keys(CFG.heroes);

// мышь на ПК: ЛКМ — стрелять в курсор (зажать — автоогонь), ПКМ — навык в курсор
const mouse = { down: null, x: 0, y: 0 };
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || !mode) return; mouse.down = e.button === 2 ? 'b' : 'a'; mouse.x = e.clientX; mouse.y = e.clientY; mouse.fresh = true; });
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; } });
addEventListener('pointerup', e => { if (e.pointerType === 'mouse') mouse.down = null; });
function mouseVec(w, btn) {
  const me = w && w.players.find(p => p.id === myId); if (!me) return null;
  const dpr = Math.min(devicePixelRatio || 1, 2), mx = (mouse.x * dpr - view.ox) / view.s, my = (mouse.y * dpr - view.oy) / view.s;
  const dx = mx - me.x, dy = my - (me.y - 13 * (me.scale || 1)), d = Math.hypot(dx, dy) || 1;
  const ch = w.match.chosenId === myId, P = ch && CFG.powers[me.power], Wp = me.weapon && CFG.weapons[me.weapon];
  const range = btn === 'a' ? (ch ? P.aRange || 150 : Wp ? Wp.range : 40) : (ch ? P.bRange || 150 : 60);
  const k = Math.max(0.15, Math.min(1, d / range)) / d;
  return [dx * k || 1e-3, dy * k];
}
function myInput() {
  const w = world || viewWorld;
  if (mouse.down && w && (mouse.down === 'a' || mouse.fresh)) { const v = mouseVec(w, mouse.down); if (v) sample.fire(mouse.down, v[0], v[1]); }
  mouse.fresh = false;
  return sample();
}


// демо-битва ботов на фоне меню
let demo = null, demoAcc = 0, demoLast = performance.now();
function newDemo() {
  demo = createWorld();
  ['Рыжий', 'Синий', 'Зелёный', 'Жёлтый'].forEach((n, i) => addPlayer(demo, { id: 'd' + i, name: n, color: CFG.colors[i], label: 'БОТ', isBot: true, hero: HERO_KEYS[(i * 3 + 1) % 8] }));
  startMatch(demo);
}
newDemo();

const screens = ['scr-login', 'scr-menu', 'scr-lobby', 'scr-results', 'scr-wardrobe', 'scr-help', 'scr-heroes'];
function show(id) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  const ingame = !!(mode && (id === null || id === 'scr-lobby'));
  $('controls').classList.toggle('hidden', !ingame);
  document.body.classList.toggle('ingame', ingame);
  if (id === 'scr-menu') refreshProfile();
}

function refreshProfile() {
  const M = meta();
  $('pf-nick').textContent = nick; $('pf-lvl').textContent = M.level; $('pf-coins').textContent = M.coins;
  $('pf-xp').style.width = Math.round(M.xp / xpNeed(M.level) * 100) + '%';
  $('pf-hero').textContent = (CFG.heroes[M.hero] || CFG.heroes.brawler).name.toUpperCase();
}

// ---------- вход ----------
$('in-nick').value = nick;
$('go-login').onclick = () => {
  const n = $('in-nick').value.trim().slice(0, 12), pw = $('in-pass').value.trim();
  if (!n) return void ($('login-err').textContent = 'Придумай ник');
  if (pw !== PASSWORD) return void ($('login-err').textContent = 'Неверный пароль');
  nick = n; store.set('izb-nick', n); $('in-pass').value = ''; $('login-err').textContent = '';
  show('scr-menu');
};
$('in-pass').addEventListener('keydown', e => { if (e.key === 'Enter') $('go-login').click(); });

// ---------- гардероб / помощь ----------
function hatPreview(id, color) {
  const c = document.createElement('canvas'); c.width = 24; c.height = 30;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  drawCharacter(g, null, { color, hat: id, hero: meta().hero, scale: 1, facing: 1, onGround: true, vx: 0, vy: 0, animT: 0, seed: 1 }, 12, 28, 0.5, {});
  return c;
}
function renderWardrobe(msg = '') {
  const M = meta(); $('wd-coins').textContent = M.coins; $('wd-msg').textContent = msg;
  const grid = $('wd-grid'); grid.innerHTML = '';
  for (const h of HAT_LIST) {
    const st = hatState(h), b = document.createElement('button');
    b.className = 'hat' + (M.hat === h.id ? ' sel' : '') + (st === 'locked' ? ' locked' : '');
    b.append(hatPreview(h.id, CFG.colors[0]));
    const name = document.createElement('div'); name.textContent = h.name; b.append(name);
    const pr = document.createElement('div'); pr.className = 'price';
    pr.textContent = M.hat === h.id ? 'НАДЕТО' : st === 'owned' || st === 'free' ? 'НАДЕТЬ' : st === 'locked' ? `🔒 УР.${h.lvl}` : `💰 ${h.cost}`;
    b.append(pr);
    b.onclick = () => { const r = selectHat(h.id); renderWardrobe(r === true ? `Надето: ${h.name}` : r); if (r === true) sfx('pickup'); };
    grid.append(b);
  }
}
$('go-wardrobe').onclick = () => { renderWardrobe(); show('scr-wardrobe'); };
$('wd-back').onclick = () => show('scr-menu');
$('go-help').onclick = () => show('scr-help');
// выбор героя: живые превью
let heroAnim = null;
function renderHeroes() {
  const grid = $('hero-grid'); grid.innerHTML = '';
  const cvs = [];
  for (const k of HERO_KEYS) {
    const h = CFG.heroes[k], b = document.createElement('button');
    b.className = 'hero' + (meta().hero === k ? ' sel' : '');
    const c = document.createElement('canvas'); c.width = 30; c.height = 36; cvs.push([c, k]);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = `${h.icon} ${h.name}`;
    const ds = document.createElement('div'); ds.className = 'ds'; ds.textContent = h.desc;
    const stt = document.createElement('div'); stt.className = 'stt'; stt.textContent = `❤${h.hp}  »${h.speed}${h.airJumps > 1 ? '  ⤒×3' : ''}`;
    b.append(c, nm, ds, stt);
    b.onclick = () => { selectHero(k); renderHeroes(); sfx('pickup'); };
    grid.append(b);
  }
  cancelAnimationFrame(heroAnim);
  const loop = t => {
    for (const [c, k] of cvs) {
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 30, 36);
      const sel = meta().hero === k, run = sel && Math.floor(t / 2000) % 2 === 0;
      drawCharacter(g, null, { color: CFG.colors[0], hero: k, hat: 'none', scale: 1, facing: 1, onGround: true, vx: run ? 50 : 0, vy: 0, animT: t / 1000, seed: k.length, weapon: sel ? 'pistol' : null, aimX: 1, aimY: 0, attackT: 0 }, 15, 32, t / 1000, {});
    }
    if (!$('scr-heroes').classList.contains('hidden')) heroAnim = requestAnimationFrame(loop);
  };
  heroAnim = requestAnimationFrame(loop);
}
$('go-heroes').onclick = () => { show('scr-heroes'); renderHeroes(); };
$('heroes-back').onclick = () => show('scr-menu');
try { const cm = localStorage.getItem('izb-cam'); if (cm) $('cam-mode').value = cm; } catch {}
$('cam-mode').onchange = () => { try { localStorage.setItem('izb-cam', $('cam-mode').value); } catch {} };
$('help-back').onclick = () => show('scr-menu');

// ---------- общие ----------
const freeColor = () => CFG.colors.find(c => !world.players.some(p => p.color === c)) || CFG.colors[0];
const BOT_NAMES = ['Гром', 'Искра', 'Тень', 'Шторм', 'Клык', 'Вихрь', 'Ёж', 'Буря'];
const BOT_HATS = ['cap', 'band', 'horns', 'wizard', 'cowboy', 'cat', 'top', 'chef'];
function addBot() {
  if (world.players.length >= CFG.maxPlayers) return;
  let i = 1; while (world.players.some(p => p.id === 'bot' + i)) i++;
  const used = world.players.map(p => p.hero), free = HERO_KEYS.filter(h => !used.includes(h));
  addPlayer(world, { id: 'bot' + i, name: BOT_NAMES[(i - 1) % 8], color: freeColor(), label: 'БОТ', isBot: true, hero: (free.length ? free : HERO_KEYS)[Math.floor(Math.random() * (free.length || 8))] });
}
function startTicker() {
  stopTicker(); lastTick = performance.now();
  ticker = setInterval(tick, 1000 / CFG.TICK);
  try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => wakeLock = l).catch(() => {}); } catch {}
}
function stopTicker() { clearInterval(ticker); ticker = null; clearInterval(sendTimer); sendTimer = null; }

function tick() {
  const inputs = {};
  for (const p of world.players) {
    if (p.id === myId) inputs[p.id] = myInput();
    else if (p.isBot) inputs[p.id] = botInput(world, p, botLvl);
    else { const r = remote.get(p.id); if (r) { inputs[p.id] = { ...r }; r.jump = r.a = r.b = r.c = false; r.ax = r.ay = r.bx = r.by = 0; } }
  }
  step(world, inputs, 1 / CFG.TICK);
  lastTick = performance.now();
  if (mode === 'host' && ++tickN % CFG.SNAP_EVERY === 0) net.broadcast({ t: 's', s: snapshot(world) });
}

function leave(msg) {
  stopTicker();
  if (net) { try { net.close(); } catch {} net = null; }
  if (wakeLock) { try { wakeLock.release(); } catch {} wakeLock = null; }
  mode = null; world = null; viewWorld = snapPrev = snapCur = null; remote.clear(); resultsShown = false;
  document.body.classList.remove('is-host');
  resetRender();
  $('menu-err').textContent = msg || '';
  show('scr-menu');
}
$('btn-exit').onclick = () => { if (confirm('Выйти в меню?')) leave(); };
$('lobby-leave').onclick = () => leave();
$('res-menu').onclick = () => leave();

// ---------- режим с ботами ----------
$('go-bots').onclick = () => {
  mode = 'bots'; myId = 'me'; resetBots(); resetRender(); document.body.classList.add('is-host');
  botLvl = +$('bots-lvl').value;
  world = createWorld();
  addPlayer(world, { id: 'me', name: nick, color: CFG.colors[0], label: LABEL, hat: meta().hat, hero: meta().hero });
  for (let i = 0; i < +$('bots-n').value; i++) addBot();
  startMatch(world); resultsShown = false; startTicker(); show(null);
};

// ---------- хост ----------
function lobbyMsg() {
  return { t: 'lobby', code, players: world.players.map(p => ({ id: p.id, name: p.name, color: p.color, label: p.label, isBot: p.isBot })) };
}
function renderLobby(l) {
  $('lobby-code').textContent = l.code;
  $('lobby-list').innerHTML = '';
  for (const p of l.players) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = p.color;
    left.append(dot, document.createTextNode(p.name + (p.id === myId ? ' (ты)' : '')));
    const right = document.createElement('span'); right.textContent = p.label; right.style.color = '#a99fc4';
    li.append(left, right); $('lobby-list').append(li);
  }
  $('lobby-hint').textContent = `Игроков: ${l.players.length}/${CFG.maxPlayers}. Скажи друзьям код и пароль`;
}
function lobbyChanged() { const l = lobbyMsg(); renderLobby(l); net && net.broadcast(l); }

$('go-host').onclick = () => {
  mode = 'host'; myId = 'host'; resetBots(); resetRender(); document.body.classList.add('is-host');
  botLvl = +$('bots-lvl').value;
  code = makeCode();
  world = createWorld();
  addPlayer(world, { id: 'host', name: nick, color: CFG.colors[0], label: LABEL, hat: meta().hat, hero: meta().hero });
  $('menu-err').textContent = 'Создаём комнату…';
  net = hostRoom(code, {
    onOpen() { $('menu-err').textContent = ''; startTicker(); lobbyChanged(); show('scr-lobby'); },
    onError(e) { leave(e); },
    onJoin(id, msg) {
      if (world.match.phase !== 'lobby') return 'Матч уже идёт';
      if (world.players.length >= CFG.maxPlayers) return 'Комната заполнена';
      addPlayer(world, { id, name: String(msg.name || 'Игрок').slice(0, 12), color: freeColor(), label: String(msg.label || '?').slice(0, 10), hat: String(msg.hat || 'none').slice(0, 12), hero: String(msg.hero || 'brawler') });
      return true;
    },
    onJoined() { lobbyChanged(); },
    onMsg(id, msg) {
      if (msg.t !== 'in') return;
      const r = remote.get(id) || {};
      remote.set(id, { mx: +msg.mx || 0, my: +msg.my || 0, jumpHeld: !!msg.jumpHeld,
        jump: r.jump || !!msg.jump, a: r.a || !!msg.a, b: r.b || !!msg.b, c: r.c || !!msg.c,
        ax: msg.a ? +msg.ax || 0 : r.ax || 0, ay: msg.a ? +msg.ay || 0 : r.ay || 0, bx: msg.b ? +msg.bx || 0 : r.bx || 0, by: msg.b ? +msg.by || 0 : r.by || 0 });
    },
    onLeave(id) { removePlayer(world, id); remote.delete(id); if (world.match.phase === 'lobby') lobbyChanged(); },
  });
};
$('bot-add').onclick = () => { addBot(); lobbyChanged(); };
$('bot-del').onclick = () => { const b = [...world.players].reverse().find(p => p.isBot); if (b) { removePlayer(world, b.id); lobbyChanged(); } };
$('go-start').onclick = () => {
  if (world.players.length < 2) return void ($('lobby-hint').textContent = 'Нужно минимум 2 игрока (добавь бота)');
  startMatch(world); resultsShown = false; net.broadcast({ t: 'start' }); show(null);
};
$('go-rematch').onclick = () => {
  startMatch(world); resultsShown = false; if (net) net.broadcast({ t: 'start' }); show(null);
};

// ---------- клиент ----------
$('go-join').onclick = () => {
  const c = $('in-code').value.trim().toUpperCase();
  if (c.length !== 5) return void ($('menu-err').textContent = 'Код — 5 символов');
  mode = 'client'; code = c; resetRender(); document.body.classList.remove('is-host');
  $('menu-err').textContent = 'Подключаемся…';
  net = joinRoom(c, { name: nick, label: LABEL, pass: PASSWORD, hat: meta().hat, hero: meta().hero }, {
    onMsg(msg) {
      if (msg.t === 'welcome') {
        myId = msg.id; $('menu-err').textContent = '';
        sendTimer = setInterval(() => net && net.send({ t: 'in', ...myInput() }), 1000 / CFG.TICK);
      } else if (msg.t === 'lobby') { renderLobby(msg); if (!snapCur || snapCur.m.phase === 'lobby') show('scr-lobby'); }
      else if (msg.t === 'start') { resultsShown = false; show(null); }
      else if (msg.t === 's') { snapPrev = snapCur; snapCur = msg.s; snapAt = performance.now(); viewWorld = fromSnapshots(snapPrev, snapCur); }
    },
    onClose() { leave('Хост вышел из игры'); },
    onError(e) { leave(e); },
  });
};
$('in-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('go-join').click(); });

// ---------- итоги ----------
function showResults(w) {
  resultsShown = true;
  const list = [...w.players].sort((a, b) => b.score - a.score);
  $('res-list').innerHTML = '';
  list.forEach((p, i) => {
    const li = document.createElement('li');
    const l = document.createElement('span'); l.textContent = `${['🥇', '🥈', '🥉'][i] || i + 1 + '.'} ${p.name}`; l.style.color = p.color;
    const r = document.createElement('span'); r.textContent = Math.floor(p.score); r.style.color = '#ffd23f';
    li.append(l, r); $('res-list').append(li);
  });
  const by = f => list.reduce((a, b) => (f(b) > f(a) ? b : a));
  const dm = by(p => p.stats.dmg), ct = by(p => p.stats.chosenTime), kl = by(p => p.stats.kills);
  $('res-awards').textContent = `💥 Урон: ${dm.name} (${Math.round(dm.stats.dmg)}) · 👑 Дольше Избранный: ${ct.name} (${Math.round(ct.stats.chosenTime)}с) · ⚔ Убийства: ${kl.name} (${kl.stats.kills})`;
  const place = list.findIndex(p => p.id === myId);
  if (place >= 0) {
    const r = reward(list[place].score, place, list.length);
    $('res-reward').textContent = `+${r.coins} 💰  +${r.xp} XP` + (r.levelUp ? `  ⬆ УРОВЕНЬ ${r.level}!` : '') + (r.unlocked.length ? `  🎩 Новое: ${r.unlocked.join(', ')}` : '');
  } else $('res-reward').textContent = '';
  show('scr-results');
}

// ---------- кадр ----------
function frame(now) {
  let w = null, alpha = 1;
  if (mode === 'client') { w = viewWorld; alpha = Math.min(1, (now - snapAt) / (CFG.SNAP_EVERY * 1000 / CFG.TICK)); }
  else if (world) { w = world; alpha = Math.min(1, (now - lastTick) / (1000 / CFG.TICK)); }
  if (!w) {
    demoAcc += Math.min(0.1, (now - demoLast) / 1000); demoLast = now;
    const dt = 1 / CFG.TICK;
    while (demoAcc >= dt) {
      const inp = {}; for (const p of demo.players) inp[p.id] = botInput(demo, p, 1);
      step(demo, inp, dt); demoAcc -= dt;
      if (demo.match.phase === 'end') newDemo();
    }
    w = demo; alpha = demoAcc / dt;
  } else demoLast = now;
  render(ctx, view, w, alpha, mode ? myId : null, { aim: sample.aim, camMode: $('cam-mode').value });
  if (mode && w !== demo) {
    const me = w.players.find(p => p.id === myId);
    if (me) {
      const ch = w.match.chosenId === myId;
      const pw = ch && CFG.powers[me.power], hero = CFG.heroes[me.hero] || CFG.heroes.brawler;
      const bb = $('btn-b'), lbl = ch ? '★' : hero.icon; if (bb.textContent !== lbl) bb.textContent = lbl;
      const ab = $('btn-a'), Wp = me.weapon && CFG.weapons[me.weapon];
      const albl = ch ? pw.icon : Wp ? Wp.icon : '✊', ammo = !ch && Wp ? String(me.ammo) : '';
      if (ab.dataset.l !== albl + ammo) { ab.dataset.l = albl + ammo; ab.textContent = albl; if (ammo) { const sp = document.createElement('span'); sp.className = 'ammo'; sp.textContent = ammo; ab.append(sp); } }
      const bMax = ch ? pw.bCd : hero.cd, aMax = ch ? pw.aCd : Wp ? Wp.cd : CFG.punch.cd;
      bb.style.setProperty('--p', (1 - Math.min(1, (me.cdB || 0) / bMax)).toFixed(2));
      $('btn-a').style.setProperty('--p', (1 - Math.min(1, (me.cdA || 0) / aMax)).toFixed(2));
      bb.classList.toggle('cd', me.cdB > 0); $('btn-a').classList.toggle('cd', me.cdA > 0.05);
      const cb = $('btn-c'); cb.classList.toggle('hidden', !ch);
      if (ch) { const k = Math.min(1, (me.ult || 0) / CFG.chosen.ultMax); cb.style.setProperty('--p', k.toFixed(2)); cb.classList.toggle('ready', k >= 1); }
    }
    if (w.match.phase === 'end' && !resultsShown) showResults(w);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
show('scr-login');
window.__game = { get world() { return world || viewWorld; }, get mode() { return mode; }, get demo() { return demo; } }; // для QA
