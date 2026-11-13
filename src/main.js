// Оркестрация: экраны, режимы (боты / хост / клиент), тикер симуляции, рендер
import { CFG, PASSWORD } from './config.js';
import { createWorld, addPlayer, removePlayer, startMatch, step } from './sim/world.js';
import { botInput, resetBots } from './sim/bots.js';
import { render } from './render/renderer.js';
import { createInput } from './input/touch.js';
import { makeCode, hostRoom, joinRoom, snapshot, fromSnapshots } from './net/net.js';

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
const view = { s: 1, ox: 0, oy: 0, cw: 0, ch: 0, u: 1, safeL: 0 };
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  view.cw = canvas.width = Math.round(innerWidth * dpr);
  view.ch = canvas.height = Math.round(innerHeight * dpr);
  view.s = Math.min(view.cw / CFG.W, view.ch / CFG.H);
  view.ox = Math.round((view.cw - CFG.W * view.s) / 2);
  view.oy = Math.round((view.ch - CFG.H * view.s) / 2);
  view.u = dpr * Math.min(1.25, Math.max(0.8, innerHeight / 400));
  view.safeL = Math.max(view.ox, 0);
}
addEventListener('resize', resize); resize();

// ---------- состояние ----------
let nick = store.get('izb-nick') || '';
let mode = null, world = null, myId = 'me', net = null, code = '';
let ticker = null, lastTick = 0, tickN = 0, sendTimer = null, wakeLock = null;
let snapPrev = null, snapCur = null, snapAt = 0, viewWorld = null, resultsShown = false;
const remote = new Map();
const sample = createInput();
const idle = createWorld(); // фон для меню

const screens = ['scr-login', 'scr-menu', 'scr-lobby', 'scr-results'];
function show(id) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  $('controls').classList.toggle('hidden', !(mode && (id === null || id === 'scr-lobby')));
  if (id && document.activeElement && document.activeElement.blur && id !== 'scr-login' && id !== 'scr-menu') document.activeElement.blur();
}

// ---------- вход ----------
$('in-nick').value = nick;
$('go-login').onclick = () => {
  const n = $('in-nick').value.trim().slice(0, 12), pw = $('in-pass').value.trim();
  if (!n) return void ($('login-err').textContent = 'Придумай ник');
  if (pw !== PASSWORD) return void ($('login-err').textContent = 'Неверный пароль');
  nick = n; store.set('izb-nick', n); $('in-pass').value = ''; $('login-err').textContent = '';
  $('menu-nick').textContent = nick; show('scr-menu');
};
$('in-pass').addEventListener('keydown', e => { if (e.key === 'Enter') $('go-login').click(); });

// ---------- общие ----------
const freeColor = () => CFG.colors.find(c => !world.players.some(p => p.color === c)) || CFG.colors[0];
function addBot() {
  if (world.players.length >= CFG.maxPlayers) return;
  let i = 1; while (world.players.some(p => p.id === 'bot' + i)) i++;
  addPlayer(world, { id: 'bot' + i, name: 'Бот ' + i, color: freeColor(), label: 'БОТ', isBot: true });
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
    if (p.id === myId) inputs[p.id] = sample();
    else if (p.isBot) inputs[p.id] = botInput(world, p);
    else { const r = remote.get(p.id); if (r) { inputs[p.id] = { ...r }; r.jump = r.a = r.b = false; } }
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
  $('menu-err').textContent = msg || '';
  show('scr-menu');
}
$('btn-exit').onclick = () => { if (confirm('Выйти в меню?')) leave(); };
$('lobby-leave').onclick = () => leave();
$('res-menu').onclick = () => leave();

// ---------- режим с ботами ----------
$('go-bots').onclick = () => {
  mode = 'bots'; myId = 'me'; resetBots(); document.body.classList.add('is-host');
  world = createWorld();
  addPlayer(world, { id: 'me', name: nick, color: CFG.colors[0], label: LABEL });
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
    const right = document.createElement('span'); right.textContent = p.label; right.style.color = '#c9cbe0';
    li.append(left, right); $('lobby-list').append(li);
  }
  $('lobby-hint').textContent = `Игроков: ${l.players.length}/${CFG.maxPlayers}. Скажи друзьям код и пароль`;
}
function lobbyChanged() { const l = lobbyMsg(); renderLobby(l); net && net.broadcast(l); }

$('go-host').onclick = () => {
  mode = 'host'; myId = 'host'; resetBots(); document.body.classList.add('is-host');
  code = makeCode();
  world = createWorld();
  addPlayer(world, { id: 'host', name: nick, color: CFG.colors[0], label: LABEL });
  $('menu-err').textContent = 'Создаём комнату…';
  net = hostRoom(code, {
    onOpen() { $('menu-err').textContent = ''; startTicker(); lobbyChanged(); show('scr-lobby'); },
    onError(e) { leave(e); },
    onJoin(id, msg) {
      if (world.match.phase !== 'lobby') return 'Матч уже идёт';
      if (world.players.length >= CFG.maxPlayers) return 'Комната заполнена';
      addPlayer(world, { id, name: String(msg.name || 'Игрок').slice(0, 12), color: freeColor(), label: String(msg.label || '?').slice(0, 10) });
      return true;
    },
    onJoined() { lobbyChanged(); },
    onMsg(id, msg) {
      if (msg.t !== 'in') return;
      const r = remote.get(id) || {};
      remote.set(id, { mx: +msg.mx || 0, my: +msg.my || 0, jumpHeld: !!msg.jumpHeld,
        jump: r.jump || !!msg.jump, a: r.a || !!msg.a, b: r.b || !!msg.b });
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
  mode = 'client'; code = c; document.body.classList.remove('is-host');
  $('menu-err').textContent = 'Подключаемся…';
  net = joinRoom(c, { name: nick, label: LABEL, pass: PASSWORD }, {
    onMsg(msg) {
      if (msg.t === 'welcome') {
        myId = msg.id; $('menu-err').textContent = '';
        sendTimer = setInterval(() => net && net.send({ t: 'in', ...sample() }), 1000 / CFG.TICK);
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
    const r = document.createElement('span'); r.textContent = Math.floor(p.score);
    li.append(l, r); $('res-list').append(li);
  });
  const by = f => list.reduce((a, b) => (f(b) > f(a) ? b : a));
  const dm = by(p => p.stats.dmg), ct = by(p => p.stats.chosenTime);
  $('res-awards').textContent = `💥 Больше всего урона: ${dm.name} (${Math.round(dm.stats.dmg)}) · 👑 Дольше всех Избранный: ${ct.name} (${Math.round(ct.stats.chosenTime)} с)`;
  show('scr-results');
}

// ---------- рендер ----------
function frame(now) {
  let w = null, alpha = 1;
  if (mode === 'client') { w = viewWorld; alpha = Math.min(1, (now - snapAt) / (CFG.SNAP_EVERY * 1000 / CFG.TICK)); }
  else if (world) { w = world; alpha = Math.min(1, (now - lastTick) / (1000 / CFG.TICK)); }
  if (!w) { idle.time = now / 1000; w = idle; }
  render(ctx, view, w, alpha, myId);
  if (mode && w !== idle) {
    const me = w.players.find(p => p.id === myId);
    if (me) {
      const ch = w.match.chosenId === myId;
      const bb = $('btn-b'); const lbl = ch ? '★' : '⇢'; if (bb.textContent !== lbl) bb.textContent = lbl;
      bb.classList.toggle('cd', me.cdB > 0); $('btn-a').classList.toggle('cd', me.cdA > 0.05);
    }
    if (w.match.phase === 'end' && !resultsShown) showResults(w);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
show(nick ? 'scr-login' : 'scr-login');
window.__game = { get world() { return world || viewWorld; }, get mode() { return mode; } }; // для QA
