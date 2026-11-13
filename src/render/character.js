// Процедурный пиксельный персонаж: части-прямоугольники с тёмным контуром.
// Анимации: дыхание, бег (махи руками/ногами), прыжок, падение, рывок, удар, моргание, сквош при приземлении.

const OUT = '#170f1f', SKIN = '#f3c89b', SKIN_D = '#d49a70', PANTS = '#3a3556', PANTS_D = '#2a2640', BOOT = '#1f1a2b';

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
function mix(a, b, k) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((A >> s) & 255) * (1 - k) + ((B >> s) & 255) * k));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
const cache = new Map();
function pal(color) {
  if (!cache.has(color)) cache.set(color, {
    c: color, cl: shade(color, 1.35), cd: shade(color, 0.7), hair: shade(mix(color, '#5a3a22', 0.65), 0.75),
    scarf: shade(color, 1.15), belt: shade(color, 0.45) });
  return cache.get(color);
}

function limb(P, x0, y0, ang, len, c1, c2, split) {
  const dx = Math.sin(ang), dy = Math.cos(ang);
  for (let i = 0; i <= len; i++) P.push([x0 + dx * i - 1, y0 + dy * i - 1, 2, 2, i < split ? c1 : c2]);
  return [x0 + dx * len, y0 + dy * len];
}

export const HATS = {
  none: () => [],
  cap: hy => [[-4, hy - 2, 8, 3, '#e53935'], [3, hy, 4, 1, '#b71c1c'], [-1, hy - 2, 2, 1, '#ff8a80']],
  band: hy => [[-4, hy + 2, 8, 1, '#e53935'], [-6, hy + 2, 2, 1, '#e53935'], [-7, hy + 3, 1, 2, '#e53935']],
  horns: hy => [[-4, hy - 1, 8, 3, '#9ea7b3'], [-4, hy + 1, 8, 1, '#6b7380'], [-6, hy - 3, 2, 3, '#f1e6c8'], [4, hy - 3, 2, 3, '#f1e6c8'], [-7, hy - 4, 1, 2, '#f1e6c8'], [6, hy - 4, 1, 2, '#f1e6c8']],
  wizard: hy => [[-5, hy, 10, 1, '#4527a0'], [-4, hy - 2, 8, 2, '#5e35b1'], [-3, hy - 4, 6, 2, '#5e35b1'], [-2, hy - 6, 4, 2, '#5e35b1'], [-1, hy - 8, 2, 2, '#5e35b1'], [-2, hy - 3, 1, 1, '#ffd54f', 1], [1, hy - 5, 1, 1, '#ffd54f', 1]],
  cat: hy => [[-4, hy - 2, 2, 2, '#3b2b2b'], [2, hy - 2, 2, 2, '#3b2b2b'], [-3, hy - 1, 1, 1, '#ff9eb5', 1], [3, hy - 1, 1, 1, '#ff9eb5', 1]],
  cowboy: hy => [[-7, hy, 14, 1, '#8d6e63'], [-3, hy - 3, 7, 3, '#a1887f'], [-3, hy - 1, 7, 1, '#4e342e']],
  top: hy => [[-6, hy, 12, 1, '#212121'], [-3, hy - 7, 7, 7, '#2b2b2b'], [-3, hy - 2, 7, 1, '#c62828']],
  halo: hy => [[-3, hy - 5, 7, 1, '#fff59d', 1, 1], [-4, hy - 4, 1, 1, '#fff59d', 1, 1], [4, hy - 4, 1, 1, '#fff59d', 1, 1]],
  pirate: hy => [[-5, hy - 1, 10, 3, '#212121'], [-1, hy, 2, 1, '#eeeeee'], [0, hy + 4, 3, 2, '#111111']],
  flower: hy => [[2, hy - 1, 3, 3, '#ff80ab'], [3, hy, 1, 1, '#ffeb3b', 1]],
  chef: hy => [[-4, hy - 1, 8, 2, '#ffffff'], [-5, hy - 5, 10, 4, '#f5f5f5'], [-3, hy - 6, 6, 1, '#f5f5f5']],
  crownGold: hy => [[-4, hy - 1, 8, 2, '#ffd23f'], [-4, hy - 3, 1, 2, '#ffd23f'], [0, hy - 4, 1, 3, '#ffd23f'], [3, hy - 3, 1, 2, '#ffd23f'], [0, hy - 1, 1, 1, '#ff3b5c', 1]],
};

// возвращает {P, E}: P — все части, E — светящиеся (для свечения)
export function buildParts(p, t, power, o = {}) {
  const P = [], E = [];
  const C = pal(p.color);
  const giant = power === 'giant';
  const skin = giant ? '#b9a3d9' : SKIN, skinD = giant ? '#9478bd' : SKIN_D;
  const run = p.onGround && Math.abs(p.vx) > 12;
  const ph = (p.animT || 0) * 13;
  const sw = run ? Math.sin(ph) * 0.95 : 0;
  const air = !p.onGround, up = air && p.vy < -40, dash = (p.dashT || 0) > 0;
  const attack = (p.attackT || 0) > 0.05;
  const breath = !run && !air && Math.sin(t * 2.6 + (p.seed || 0)) > 0.55 ? 1 : 0;
  const bob = run ? (Math.abs(Math.cos(ph)) > 0.7 ? -1 : 0) : breath;
  const hipY = -7 + bob;

  let la1, la2, ll = 5, aa1, aa2;
  if (dash) { la1 = 1.2; la2 = -1.0; aa1 = -1.4; aa2 = -1.7; }
  else if (up) { la1 = 0.9; la2 = -0.25; ll = 4; aa1 = 2.5; aa2 = -2.4; }
  else if (air) { la1 = 0.35; la2 = -0.5; aa1 = 1.9; aa2 = -2.0; }
  else if (run) { la1 = sw; la2 = -sw; aa1 = -sw * 0.9; aa2 = sw * 0.9; }
  else { la1 = 0.06; la2 = -0.06; aa1 = 0.12 + breath * 0.05; aa2 = -0.12; }
  if (attack) aa1 = power === 'giant' ? 1.9 : 1.57;
  if ((p.frozenT || 0) > 0) { la1 = 0.05; la2 = -0.05; aa1 = 0.2; aa2 = -0.2; }

  // задняя рука и нога
  limb(P, -2, hipY - 6, aa2, 5, C.cd, skinD, 3);
  const [bx, by] = limb(P, -1, hipY, la2, ll, PANTS_D, PANTS_D, 99);
  P.push([bx - 1, by, 3, 2, BOOT]);
  // торс
  P.push([-3, hipY - 7, 7, 7, C.c], [-3, hipY - 7, 1, 6, C.cl], [3, hipY - 6, 1, 6, C.cd], [-3, hipY - 1, 7, 1, C.belt], [0, hipY - 1, 1, 1, '#d8b04a']);
  if (giant) P.push([-3, hipY - 5, 2, 1, skinD], [1, hipY - 3, 2, 1, skinD]);
  // передняя нога
  const [fx, fy] = limb(P, 1, hipY, la1, ll, PANTS, PANTS, 99);
  P.push([fx - 1, fy, 3, 2, BOOT], [fx + 1, fy, 1, 1, '#3a3050']);
  // голова
  const hy = hipY - 15;
  P.push([-4, hy, 8, 8, skin], [-4, hy + 7, 8, 1, skinD], [3, hy + 5, 1, 1, '#f29a8a']);
  const blink = ((t + (p.seed || 0)) % 3.3) < 0.12;
  let eyeC = '#1b1424', eyeGlow = false;
  if (power === 'fire') { eyeC = '#ffeb3b'; eyeGlow = true; }
  else if (power === 'ice') { eyeC = '#bff4ff'; eyeGlow = true; }
  else if (power === 'bolt') { eyeC = '#ffffff'; eyeGlow = true; }
  else if (power === 'giant') { eyeC = '#ff3b5c'; eyeGlow = true; }
  const eyes = blink ? [[0, hy + 4, 1, 1, eyeC], [2, hy + 4, 1, 1, eyeC]] : [[0, hy + 3, 1, 2, eyeC], [2, hy + 3, 1, 2, eyeC]];
  P.push(...eyes); if (eyeGlow) E.push(...eyes);
  if (attack || (p.hitT || 0) > 0) P.push([1, hy + 6, 2, 1, '#7a2a2a']);
  // волосы / огонь / шипы
  if (power === 'fire') {
    const cols = ['#ff5722', '#ff9800', '#ffeb3b'];
    for (let i = -4; i <= 3; i++) {
      const h = 2 + Math.round((Math.sin(t * 17 + i * 1.9) + 1) * 1.6) + (i >= -2 && i <= 1 ? 2 : 0);
      for (let k = 0; k < h; k++) { const part = [i, hy + 1 - k, 1, 1, cols[Math.min(2, Math.floor(k / h * 3))], 1]; P.push(part); E.push(part); }
    }
  } else if (power === 'bolt') {
    const Y = '#ffe83a';
    P.push([-4, hy, 8, 2, Y], [-5, hy - 2, 2, 3, Y], [-2, hy - 3, 2, 3, Y], [1, hy - 2, 2, 2, Y], [3, hy - 1, 2, 2, Y], [-4, hy + 2, 2, 2, Y]);
    E.push([-2, hy - 3, 2, 1, '#fff9c4']);
  } else {
    P.push([-4, hy, 8, 3, C.hair], [-5, hy + 1, 2, 4, C.hair], [2, hy + 2, 2, 1, C.hair], [-3, hy - 1, 5, 1, C.hair]);
  }
  if (power === 'ice') {
    const I = '#c8f6ff', parts = [[-3, hy - 3, 1, 3, I, 0, 1], [0, hy - 4, 1, 4, I, 0, 1], [3, hy - 3, 1, 3, I, 0, 1], [-4, hipY - 8, 2, 2, '#8ee8ff'], [3, hipY - 8, 2, 2, '#8ee8ff']];
    P.push(...parts); E.push(parts[0], parts[1], parts[2]);
  }
  if (power === 'giant') P.push([-6, hy - 1, 2, 3, '#e0d0ff'], [4, hy - 1, 2, 3, '#e0d0ff'], [-6, hy - 2, 1, 1, '#e0d0ff'], [5, hy - 2, 1, 1, '#e0d0ff']);
  // шапка (у Избранного с огнём/молнией скрыта)
  if (!power || power === 'giant' || power === 'ice') {
    const hat = (HATS[p.hat] || HATS.none)(hy);
    for (const h of hat) { P.push(h); if (h[6]) E.push(h); }
  }
  // передняя рука
  const [hx, hy2] = limb(P, 2, hipY - 6, aa1, 5, C.c, skin, 3);
  P.push([hx - 1, hy2 - 1, 2, 2, skin]);
  if (attack && power) { const g = [hx - 1, hy2 - 2, 3, 3, '#ffffff', 1]; P.push(g); E.push(g); }
  // корона Избранного парит над головой
  if (power) {
    const cy = hy - 7 + Math.round(Math.sin(t * 4) * 1);
    const crown = HATS.crownGold(cy).map(q => [q[0], q[1], q[2], q[3], q[4], q[5]]);
    for (const q of crown) { P.push(q); E.push(q); }
  }
  return { P, E, hipY, hy };
}

export function drawCharacter(g, gg, p, x, y, t, o = {}) {
  const s = p.scale || 1;
  const { P, E } = buildParts(p, t, o.power, o);
  const dir = p.facing < 0 ? -1 : 1, kx = s * (o.sx || 1), ky = s * (o.sy || 1);
  const X = (lx, w) => dir > 0 ? x + lx * kx : x - (lx + w) * kx;
  const R = (v) => Math.round(v);
  if (!o.noOutline) {
    g.fillStyle = o.outline || OUT;
    for (const q of P) if (!q[5]) g.fillRect(R(X(q[0] - 1, q[2] + 2)), R(y + (q[1] - 1) * ky), Math.ceil((q[2] + 2) * kx), Math.ceil((q[3] + 2) * ky));
  }
  for (const q of P) {
    g.fillStyle = o.flash ? o.flash : q[4];
    g.fillRect(R(X(q[0], q[2])), R(y + q[1] * ky), Math.max(1, Math.ceil(q[2] * kx)), Math.max(1, Math.ceil(q[3] * ky)));
  }
  if (gg) for (const q of E) { gg.fillStyle = q[4]; gg.fillRect(R(X(q[0] - 0.5, q[2] + 1)), R(y + (q[1] - 0.5) * ky), Math.ceil((q[2] + 1) * kx), Math.ceil((q[3] + 1) * ky)); }
}
