// Оркестрация: экраны, режимы (боты / хост / клиент), демо-битва в меню, тикер, рендер, награды
import { CFG, PASSWORD } from './config.js';
import { createWorld, addPlayer, removePlayer, startMatch, step } from './sim/world.js';
import { botInput, resetBots } from './sim/bots.js';
import { getMap, moveCircle } from './sim/maps.js';
import { render, resetRender } from './render/renderer.js';
import { charSprite } from './render/sprites.js';
import { createInput } from './input/touch.js';
import { makeCode, hostRoom, joinRoom, snapshot, fromSnapshots } from './net/net.js';
import { initAudio, sfx, startMusic, isMuted, setMuted } from './audio.js';
import { meta, HAT_LIST, hatState, selectHat, selectHero, heroUnlocked, reward, xpNeed, league, questInfo } from './meta.js';

const $ = id => document.getElementById(id);
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'ПК';
}
const LABEL = deviceLabel(), HERO_KEYS = Object.keys(CFG.heroes);

// ---------- холст ----------
const canvas = $('game'), ctx = canvas.getContext('2d');
const view = { s: 1, ox: 0, oy: 0, cw: 0, ch: 0, u: 1, safeR: 0 };
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  view.dpr = dpr; view.cw = canvas.width = Math.round(innerWidth * dpr); view.ch = canvas.height = Math.round(innerHeight * dpr);
  view.u = dpr * Math.min(1.5, Math.max(0.85, innerHeight / 360));
}
addEventListener('resize', resize); resize();

// ---------- звук ----------
function unlockAudio() { initAudio(); startMusic(); }
addEventListener('pointerdown', unlockAudio, { passive: true }); addEventListener('keydown', unlockAudio, { passive: true });
const muteBtn = $('btn-mute'), syncMute = () => { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
muteBtn.onclick = () => { setMuted(!isMuted()); syncMute(); }; syncMute();
document.addEventListener('click', e => { if (e.target.closest('.btn-y,.btn-g,.hat,.hero')) sfx('click'); });

// ---------- состояние ----------
let nick = store.get('izb-nick') || '';
let mode = null, world = null, myId = 'me', net = null, code = '', botLvl = 1;
let ticker = null, lastTick = 0, tickN = 0, sendTimer = null, wakeLock = null;
let snapPrev = null, snapCur = null, snapAt = 0, viewWorld = null, resultsShown = false;
const pred = { x: 0, y: 0, init: false };
const remote = new Map();
const sample = createInput();

// мышь на ПК: ЛКМ — стрелять в курсор (зажать — автоогонь), ПКМ — навык в курсор
const mouse = { down: null, x: 0, y: 0, fresh: false };
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || !mode) return; mouse.down = e.button === 2 ? 'b' : 'a'; mouse.x = e.clientX; mouse.y = e.clientY; mouse.fresh = true; });
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; } });
addEventListener('pointerup', e => { if (e.pointerType === 'mouse') mouse.down = null; });
function mouseVec(w, btn) {
  const me = w && w.players.find(p => p.id === myId); if (!me) return null;
  const px = mode === 'client' && pred.init ? pred.x : me.x, py = mode === 'client' && pred.init ? pred.y : me.y;
  const mx = (mouse.x * view.dpr - view.ox) / view.s, my = (mouse.y * view.dpr - view.oy) / view.s;
  const dx = mx - px, dy = my - (py - 7), d = Math.hypot(dx, dy) || 1;
  const ch = w.match.chosenId === myId && me.power, P = ch && CFG.powers[me.power], Wp = me.weapon && CFG.weapons[me.weapon];
  const range = btn === 'a' ? (ch ? P.aRange : Wp ? Wp.range : 40) : (ch ? P.bRange || 60 : CFG.skills.rocketRange);
  const k = Math.max(0.2, Math.min(1, d / range)) / d;
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
  ['Гром', 'Искра', 'Тень', 'Шторм'].forEach((n, i) => addPlayer(demo, { id: 'd' + i, name: n, color: CFG.colors[i], label: 'БОТ', isBot: true, hero: HERO_KEYS[(i * 3 + 1) % 8] }));
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
  const M = meta(), lg = league();
  if (!heroUnlocked(M.hero)) selectHero('brawler');
  $('pf-nick').textContent = nick; $('pf-lvl').textContent = M.level; $('pf-coins').textContent = M.coins;
  $('pf-tro').textContent = M.trophies; $('pf-league').textContent = `${lg[2]} ${lg[1]}`;
  $('pf-xp').style.width = Math.round(M.xp / xpNeed(M.level) * 100) + '%';
  $('pf-hero').textContent = CFG.heroes[meta().hero].name.toUpperCase();
  const ul = $('quests'); ul.innerHTML = '';
  for (const q of M.quests) {
    const d = questInfo(q), li = document.createElement('li');
    const t = document.createElement('div'); t.textContent = d.text; const r = document.createElement('span'); r.className = 'qr'; r.textContent = `+${d.coins}💰`; t.append(r);
    const b = document.createElement('div'); b.className = 'qb'; const i = document.createElement('i'); i.style.width = Math.round(d.p / d.n * 100) + '%'; b.append(i);
    const n = document.createElement('div'); n.textContent = `${Math.floor(d.p)} / ${d.n}`; n.style.color = '#a99fc4';
    li.append(t, b, n); ul.append(li);
  }
}
CFG.maps.forEach((m, i) => { const o = document.createElement('option'); o.value = i; o.textContent = '🗺 ' + m.name; $('map-sel').append(o); });

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

// ---------- шапки / герои / помощь ----------
function preview(hero, hat, scale = 3) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 26; c.style.width = 16 * scale + 'px'; c.style.height = 26 * scale + 'px';
  c.getContext('2d').drawImage(charSprite(hero, CFG.colors[0], hat, 'F', 0).c, 0, 0);
  return c;
}
function renderWardrobe(msg = '') {
  const M = meta(); $('wd-coins').textContent = M.coins; $('wd-msg').textContent = msg;
  const grid = $('wd-grid'); grid.innerHTML = '';
  for (const h of HAT_LIST) {
    const st = hatState(h), b = document.createElement('button');
    b.className = 'hat' + (M.hat === h.id ? ' sel' : '') + (st === 'locked' ? ' locked' : '');
    b.append(preview(M.hero, h.id));
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
$('help-back').onclick = () => show('scr-menu');
let heroAnim = null;
function renderHeroes() {
  const grid = $('hero-grid'); grid.innerHTML = ''; $('hr-tro').textContent = meta().trophies;
  const cvs = [];
  for (const k of HERO_KEYS) {
    const h = CFG.heroes[k], ok = heroUnlocked(k), b = document.createElement('button');
    b.className = 'hero' + (meta().hero === k ? ' sel' : '') + (ok ? '' : ' locked');
    const c = document.createElement('canvas'); c.width = 16; c.height = 26; cvs.push([c, k]);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = `${h.icon} ${h.name}`;
    const ds = document.createElement('div'); ds.className = 'ds'; ds.textContent = h.desc;
    const stt = document.createElement('div'); stt.className = ok ? 'stt' : 'lock'; stt.textContent = ok ? `❤${h.hp}  »${h.speed}` : `🔒 ${h.unlock} 🏆`;
    b.append(c, nm, ds, stt);
    b.onclick = () => { if (selectHero(k)) { renderHeroes(); sfx('pickup'); } };
    grid.append(b);
  }
  cancelAnimationFrame(heroAnim);
  const loop = t => {
    for (const [c, k] of cvs) { const g = c.getContext('2d'); g.clearRect(0, 0, 16, 26); const sel = meta().hero === k; g.drawImage(charSprite(k, CFG.colors[0], 'none', sel ? ['F', 'S', 'B', 'S'][Math.floor(t / 900) % 4] : 'F', sel ? Math.floor(t / 130) % 4 : 0).c, 0, 0); }
    if (!$('scr-heroes').classList.contains('hidden')) heroAnim = requestAnimationFrame(loop);
  };
  heroAnim = requestAnimationFrame(loop);
}
$('go-heroes').onclick = () => { show('scr-heroes'); renderHeroes(); };
$('heroes-back').onclick = () => show('scr-menu');

// ---------- общие ----------
const freeColor = () => CFG.colors.find(c => !world.players.some(p => p.color === c)) || CFG.colors[0];
const BOT_NAMES = ['Гром', 'Искра', 'Тень', 'Шторм', 'Клык', 'Вихрь', 'Ёж', 'Буря'];
function addBot() {
  if (world.players.length >= CFG.maxPlayers) return;
  let i = 1; while (world.players.some(p => p.id === 'bot' + i)) i++;
  const used = world.players.map(p => p.hero), free = HERO_KEYS.filter(h => !used.includes(h)), pool = free.length ? free : HERO_KEYS;
  addPlayer(world, { id: 'bot' + i, name: BOT_NAMES[(i - 1) % 8], color: freeColor(), label: 'БОТ', isBot: true, hero: pool[Math.floor(Math.random() * pool.length)] });
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
    else { const r = remote.get(p.id); if (r) { inputs[p.id] = { ...r }; r.a = r.b = r.c = r.d = false; r.ax = r.ay = r.bx = r.by = 0; } }
  }
  step(world, inputs, 1 / CFG.TICK);
  lastTick = performance.now();
  if (mode === 'host' && ++tickN % CFG.SNAP_EVERY === 0) net.broadcast({ t: 's', s: snapshot(world) });
}
function begin() { const ms = +$('map-sel').value; world.fixedMap = ms >= 0 ? ms : null; startMatch(world); resultsShown = false; resetRender(); }
function leave(msg) {
  stopTicker();
  if (net) { try { net.close(); } catch {} net = null; }
  if (wakeLock) { try { wakeLock.release(); } catch {} wakeLock = null; }
  mode = null; world = null; viewWorld = snapPrev = snapCur = null; remote.clear(); resultsShown = false; pred.init = false;
  document.body.classList.remove('is-host'); resetRender();
  $('menu-err').textContent = msg || '';
  show('scr-menu');
}
$('btn-exit').onclick = () => { if (confirm('Выйти в меню?')) leave(); };
$('lobby-leave').onclick = () => leave();
$('res-menu').onclick = () => leave();

// ---------- режим с ботами ----------
$('go-bots').onclick = () => {
  mode = 'bots'; myId = 'me'; resetBots(); document.body.classList.add('is-host');
  botLvl = +$('bots-lvl').value;
  world = createWorld();
  addPlayer(world, { id: 'me', name: nick, color: CFG.colors[0], label: LABEL, hat: meta().hat, hero: meta().hero });
  for (let i = 0; i < +$('bots-n').value; i++) addBot();
  begin(); startTicker(); show(null);
};

// ---------- хост ----------
function lobbyMsg() { return { t: 'lobby', code, players: world.players.map(p => ({ id: p.id, name: p.name, color: p.color, label: p.label, isBot: p.isBot, hero: p.hero })) }; }
function renderLobby(l) {
  $('lobby-code').textContent = l.code; $('lobby-list').innerHTML = '';
  for (const p of l.players) {
    const li = document.createElement('li'), left = document.createElement('span'), dot = document.createElement('span');
    dot.className = 'dot'; dot.style.background = p.color;
    left.append(dot, document.createTextNode(`${(CFG.heroes[p.hero] || {}).icon || ''} ${p.name}${p.id === myId ? ' (ты)' : ''}`));
    const right = document.createElement('span'); right.textContent = p.label; right.style.color = '#a99fc4';
    li.append(left, right); $('lobby-list').append(li);
  }
  $('lobby-hint').textContent = `Игроков: ${l.players.length}/${CFG.maxPlayers}. Скажи друзьям код и пароль`;
}
function lobbyChanged() { const l = lobbyMsg(); renderLobby(l); net && net.broadcast(l); }
$('go-host').onclick = () => {
  mode = 'host'; myId = 'host'; resetBots(); resetRender(); document.body.classList.add('is-host');
  botLvl = +$('bots-lvl').value; code = makeCode();
  world = createWorld(Math.max(0, +$('map-sel').value));
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
      remote.set(id, { mx: +msg.mx || 0, my: +msg.my || 0, a: r.a || !!msg.a, b: r.b || !!msg.b, c: r.c || !!msg.c, d: r.d || !!msg.d,
        ax: msg.a ? +msg.ax || 0 : r.ax || 0, ay: msg.a ? +msg.ay || 0 : r.ay || 0, bx: msg.b ? +msg.bx || 0 : r.bx || 0, by: msg.b ? +msg.by || 0 : r.by || 0 });
    },
    onLeave(id) { removePlayer(world, id); remote.delete(id); if (world.match.phase === 'lobby') lobbyChanged(); },
  });
};
$('bot-add').onclick = () => { addBot(); lobbyChanged(); };
$('bot-del').onclick = () => { const b = [...world.players].reverse().find(p => p.isBot); if (b) { removePlayer(world, b.id); lobbyChanged(); } };
$('go-start').onclick = () => {
  if (world.players.length < 2) return void ($('lobby-hint').textContent = 'Нужно минимум 2 игрока (добавь бота)');
  begin(); net.broadcast({ t: 'start' }); show(null);
};
$('go-rematch').onclick = () => { begin(); if (net) net.broadcast({ t: 'start' }); show(null); };

// ---------- клиент ----------
$('go-join').onclick = () => {
  const c = $('in-code').value.trim().toUpperCase();
  if (c.length !== 5) return void ($('menu-err').textContent = 'Код — 5 символов');
  mode = 'client'; code = c; resetRender(); pred.init = false; document.body.classList.remove('is-host');
  $('menu-err').textContent = 'Подключаемся…';
  net = joinRoom(c, { name: nick, label: LABEL, pass: PASSWORD, hat: meta().hat, hero: meta().hero }, {
    onMsg(msg) {
      if (msg.t === 'welcome') { myId = msg.id; $('menu-err').textContent = ''; sendTimer = setInterval(() => net && net.send({ t: 'in', ...myInput() }), 1000 / CFG.TICK); }
      else if (msg.t === 'lobby') { renderLobby(msg); if (!snapCur || snapCur.m.phase === 'lobby') show('scr-lobby'); }
      else if (msg.t === 'start') { resultsShown = false; pred.init = false; show(null); }
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
  const list = [...w.players].sort((a, b) => b.pts - a.pts || b.stats.dmg - a.stats.dmg);
  $('res-list').innerHTML = '';
  list.forEach((p, i) => {
    const li = document.createElement('li');
    const l = document.createElement('span'); l.textContent = `${['🥇', '🥈', '🥉'][i] || i + 1 + '.'} ${p.name}`; l.style.color = p.color;
    const r = document.createElement('span'); r.textContent = `${p.pts} 👑`; r.style.color = '#ffd23f';
    li.append(l, r); $('res-list').append(li);
  });
  const place = list.findIndex(p => p.id === myId);
  $('res-title').textContent = place === 0 ? '🏆 ПОБЕДА!' : place > 0 ? `МЕСТО ${place + 1}` : '🏆 ИТОГИ';
  if (place >= 0) {
    const me = list[place], r = reward(place, list.length, me.stats, me.pts);
    $('res-reward').textContent = `${r.tro >= 0 ? '+' : ''}${r.tro} 🏆   +${r.coins} 💰   +${r.xp} XP`;
    const ex = [];
    if (r.leagueUp) ex.push(`Новая лига: ${r.leagueUp[2]} ${r.leagueUp[1]}!`);
    if (r.levelUp) ex.push(`Уровень ${r.level}!`);
    for (const h of r.heroes) ex.push(`Открыт герой: ${h}!`);
    for (const h of r.hats) ex.push(`Новая шапка: ${h}`);
    for (const q of r.done) ex.push(`Задание «${q.text}» выполнено: +${q.coins} 💰`);
    ex.push(`Урон ${Math.round(me.stats.dmg)} · выбито ${me.stats.kos} · корон отобрано ${me.stats.slays}`);
    $('res-extra').textContent = ex.join('  ·  ');
    sfx(place === 0 ? 'win' : 'roundEnd');
  } else { $('res-reward').textContent = ''; $('res-extra').textContent = ''; }
  show('scr-results');
}

// ---------- кадр ----------
let lastFrame = performance.now();
const setP = (el, v) => el.style.setProperty('--p', v.toFixed(2));
function frame(now) {
  requestAnimationFrame(frame); // сначала планируем следующий кадр: ошибка в одном кадре не остановит игру
  try { drawFrame(now); } catch (e) { if (!frame.err) { frame.err = true; console.error(e); } }
}
function drawFrame(now) {
  if (canvas.width !== Math.round(innerWidth * view.dpr) || canvas.height !== Math.round(innerHeight * view.dpr)) resize();
  if (view.cw < 8 || view.ch < 8) return;
  const fdt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  let w = null, alpha = 1, opts = { aim: sample.aim };
  if (mode === 'client') {
    w = viewWorld; alpha = Math.min(1, (now - snapAt) / (CFG.SNAP_EVERY * 1000 / CFG.TICK));
    const me = w && w.players.find(p => p.id === myId);
    if (me) { // предсказание своего движения, чтобы управление не запаздывало
      if (!pred.init || me.dead > 0 || me.leap) { pred.x = me.x; pred.y = me.y; pred.init = true; }
      else {
        if (!(me.frozenT > 0 || me.stunT > 0 || me.dodgeT > 0) && w.match.phase !== 'end') { const [mx, my] = sample.move(); moveCircle(getMap(w.mapIdx), pred, mx * me.spd * fdt, my * me.spd * fdt); }
        const ex = me.x - pred.x, ey = me.y - pred.y, e = Math.hypot(ex, ey);
        if (e > 44) { pred.x = me.x; pred.y = me.y; } else { const k = Math.min(1, fdt * (me.dodgeT > 0 ? 16 : 5)); pred.x += ex * k; pred.y += ey * k; }
      }
      opts.pred = pred;
    }
  } else if (world) { w = world; alpha = Math.min(1, (now - lastTick) / (1000 / CFG.TICK)); }
  if (!w) {
    demoAcc += Math.min(0.1, (now - demoLast) / 1000); demoLast = now;
    const dt = 1 / CFG.TICK;
    while (demoAcc >= dt) { const inp = {}; for (const p of demo.players) inp[p.id] = botInput(demo, p, 1); step(demo, inp, dt); demoAcc -= dt; if (demo.match.phase === 'end') newDemo(); }
    w = demo; alpha = demoAcc / dt;
  } else demoLast = now;
  render(ctx, view, w, alpha, mode ? myId : null, opts);
  if (mode && w !== demo) {
    const me = w.players.find(p => p.id === myId);
    if (me) {
      const ch = w.match.chosenId === myId && !!me.power, pw = ch && CFG.powers[me.power], hero = CFG.heroes[me.hero] || CFG.heroes.brawler, Wp = me.weapon && CFG.weapons[me.weapon];
      const ab = $('btn-a'), bb = $('btn-b'), db = $('btn-d'), cb = $('btn-c');
      const aI = ch ? pw.icon : Wp ? Wp.icon : '✊', bI = ch ? '★' : hero.icon, am = !ch && Wp ? String(me.ammo) : '';
      if (ab.dataset.i !== aI) { ab.dataset.i = aI; ab.querySelector('.ico').textContent = aI; }
      if (ab.dataset.m !== am) { ab.dataset.m = am; ab.querySelector('.ammo').textContent = am; }
      if (bb.dataset.i !== bI) { bb.dataset.i = bI; bb.querySelector('.ico').textContent = bI; }
      setP(ab, 1 - Math.min(1, (me.cdA || 0) / (ch ? pw.aCd : Wp ? Wp.cd : CFG.punch.cd)));
      setP(bb, 1 - Math.min(1, (me.cdB || 0) / (ch ? pw.bCd : hero.cd))); bb.classList.toggle('cd', me.cdB > 0);
      db.classList.toggle('hidden', ch); cb.classList.toggle('hidden', !ch);
      if (!ch) { setP(db, me.charges > 0 ? 1 : 1 - Math.min(1, (me.cdD || 0) / CFG.dodge.cd)); db.classList.toggle('cd', !(me.charges > 0)); }
      else { const k = Math.min(1, (me.ult || 0) / CFG.chosen.ultMax); setP(cb, k); cb.classList.toggle('ready', k >= 1); }
    }
    if (w.match.phase === 'end' && !resultsShown) showResults(w);
  }
}
requestAnimationFrame(frame);
show('scr-login');
window.__game = { get world() { return world || viewWorld; }, get mode() { return mode; }, get demo() { return demo; } }; // для QA
