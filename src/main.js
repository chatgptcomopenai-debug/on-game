// Шаг 1 MVP: каркас, неподвижная камера, остров, движение, метки игроков, бот-мишень
import { CFG } from './config.js';
import { createWorld, createPlayer, step } from './sim/world.js';
import { render } from './render/renderer.js';
import { createInput } from './input/touch.js';

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'ПК';
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { s: 1, ox: 0, oy: 0, cw: 0, ch: 0 };
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  view.cw = canvas.width = Math.round(innerWidth * dpr);
  view.ch = canvas.height = Math.round(innerHeight * dpr);
  view.s = Math.min(view.cw / CFG.W, view.ch / CFG.H);
  view.ox = Math.round((view.cw - CFG.W * view.s) / 2);
  view.oy = Math.round((view.ch - CFG.H * view.s) / 2);
}
addEventListener('resize', resize); resize();

const world = createWorld();
const me = createPlayer('me', CFG.colors[0], deviceLabel(), CFG.spawns[0]);
const bot = createPlayer('bot', CFG.colors[1], 'БОТ', CFG.spawns[1], true);
world.players.push(me, bot);
const sample = createInput();

let botDir = 1;
function botInput(t) {
  // патруль по острову, разворот у краёв
  if (bot.x > 250) botDir = -1; else if (bot.x < 70) botDir = 1;
  return { mx: botDir * 0.6, jump: Math.floor(t * 10) % 25 === 0, jumpHeld: true };
}

const dt = 1 / CFG.TICK;
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.25, (now - last) / 1000); last = now;
  while (acc >= dt) {
    step(world, { me: sample(), bot: botInput(world.time) }, dt);
    acc -= dt;
  }
  render(ctx, view, world, acc / dt, 'me');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__world = world; // для отладки/QA
