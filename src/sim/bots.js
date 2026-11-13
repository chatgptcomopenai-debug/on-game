// ИИ ботов: охотники держат дистанцию и стреляют, Избранный преследует и бьёт силой
import { CFG } from '../config.js';
import { byId, isChosen } from './world.js';

const G = CFG.platforms[0];
const mem = new Map();

export function botInput(w, p) {
  const st = mem.get(p.id) || { wander: 0, react: 0, dir: 1 };
  mem.set(p.id, st);
  const inp = { mx: 0, my: 0, jump: false, jumpHeld: true, a: false, b: false };
  if (p.dead > 0) return inp;
  const ch = isChosen(w, p);
  let target = null;
  if (ch) {
    let bd = 1e9;
    for (const q of w.players) if (q !== p && q.dead <= 0) {
      const d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y) * 1.5; if (d < bd) { bd = d; target = q; }
    }
  } else target = byId(w, w.match.chosenId);
  if (!target || target.dead > 0) {
    st.wander -= 1 / CFG.TICK;
    if (st.wander <= 0) { st.wander = 1 + Math.random() * 2; st.dir = Math.random() < 0.5 ? -1 : 1; }
    inp.mx = st.dir * 0.5;
  } else {
    const dx = target.x - p.x, dy = target.y - p.y, adx = Math.abs(dx);
    let want;
    if (ch) want = target.x;
    else want = target.x - Math.sign(dx || 1) * (70 + (p.id.length % 3) * 15); // держим дистанцию
    const d = want - p.x;
    inp.mx = Math.abs(d) > 8 ? Math.sign(d) : (Math.abs(dx) > 2 ? Math.sign(dx) * 0.12 : 0);
    if (!ch && Math.abs(d) <= 30) inp.mx = Math.sign(dx) * 0.12; // повернуться лицом к цели
    if (!ch && dx * p.facing > 0 && adx < 210 && Math.abs(dy) < 70) inp.a = true;
    // платформы
    if (dy < -20 && p.onGround && Math.random() < 0.08) inp.jump = true;
    if (dy > 20 && p.onGround && p.y < G.y && Math.random() < 0.05) { inp.my = 1; inp.jump = true; }
    if (Math.random() < 0.01 && p.onGround) inp.jump = true;
    const facingT = dx * p.facing > 0;
    st.react -= 1 / CFG.TICK;
    if (st.react <= 0) {
      st.react = 0.15 + Math.random() * 0.25;
      if (!ch) {
        const danger = w.teles.some(t => t.owner === target.id) && adx < 80;
        if ((danger || (adx < 35 && Math.random() < 0.3)) && p.cdB <= 0) inp.b = true;
      } else {
        const pw = p.power, range = pw === 'bolt' ? 90 : pw === 'giant' ? 48 : 190;
        if (adx < range && Math.abs(dy) < 50 && (facingT || pw === 'bolt')) inp.a = true;
        if (p.cdB <= 0 && adx < (pw === 'ice' ? 120 : 70) && Math.random() < 0.5) inp.b = true;
        if (pw === 'bolt' && p.cdB <= 0 && adx > 90 && adx < 120 && facingT) inp.b = true;
      }
    }
  }
  // не падать с острова
  if (p.x < G.x + 14 && inp.mx < 0) inp.mx = 1;
  if (p.x > G.x + G.w - 14 && inp.mx > 0) inp.mx = -1;
  if (p.y > G.y + 2 && p.vy > 0 && Math.random() < 0.5) inp.jump = true;
  return inp;
}
export function resetBots() { mem.clear(); }
