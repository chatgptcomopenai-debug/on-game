// Процедурный пиксельный персонаж: части-прямоугольники с тёмным контуром.
// 8 героев со своей внешностью, оружие в руке, превращения Избранного, анимации бега/прыжка/удара/моргания.

const OUT = '#170f1f', SKIN = '#f3c89b', SKIN_D = '#d49a70', BOOT = '#1f1a2b';

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
  if (!cache.has(color)) cache.set(color, { c: color, cl: shade(color, 1.35), cd: shade(color, 0.7), hair: shade(mix(color, '#5a3a22', 0.65), 0.75), belt: shade(color, 0.45) });
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

// внешность героев: цвета тела и головной убор / детали
const LOOK = {
  brawler: { hand: '#d32f2f', head: (hy, C) => [[-4, hy + 2, 8, 1, '#d32f2f'], [-6, hy + 2, 2, 1, '#d32f2f'], [-7, hy + 3, 1, 2, '#d32f2f']] },
  ninja: { torso: '#2a2440', torsoL: '#3b3458', torsoD: '#1c182c', pants: '#231e36', sleeve: '#2a2440', hand: '#2a2440', hideHair: true,
    head: (hy, C) => [[-4, hy, 8, 3, '#2a2440'], [-5, hy + 1, 2, 5, '#2a2440'], [-4, hy + 5, 8, 3, '#2a2440'], [-6, hy + 2, 2, 1, C.c], [-7, hy + 3, 1, 2, C.c]] },
  knight: { torso: '#9ea7b3', torsoL: '#d0d6de', torsoD: '#6b7380', pants: '#6b7380', sleeve: '#9ea7b3', hand: '#6b7380', hideHair: true,
    head: (hy, C) => [[-4, hy - 1, 8, 5, '#9ea7b3'], [-5, hy, 2, 6, '#9ea7b3'], [-4, hy - 1, 8, 1, '#d0d6de'], [-1, hy + 3, 5, 1, '#3b3f48'], [-1, hy - 4, 2, 3, C.c], [-3, hy - 3, 2, 1, C.c]],
    chest: (hipY, C) => [[-1, hipY - 6, 2, 4, C.c]] },
  medic: { torso: '#f2f2f2', torsoL: '#ffffff', torsoD: '#c9c9d2', sleeve: '#f2f2f2',
    head: (hy, C) => [[-4, hy - 1, 8, 3, '#ffffff'], [-1, hy - 1, 2, 3, '#e53935'], [-2, hy, 4, 1, '#e53935']],
    chest: (hipY, C) => [[0, hipY - 6, 1, 3, '#e53935'], [-1, hipY - 5, 3, 1, '#e53935'], [-3, hipY - 1, 7, 1, C.c]] },
  engineer: { torso: '#ff8c3a', torsoL: '#ffb06b', torsoD: '#c65f1a', sleeve: '#5b6b8c', pants: '#3e4a66',
    head: (hy, C) => [[-5, hy, 10, 1, '#ffcf3a'], [-4, hy - 2, 8, 2, '#ffcf3a'], [-1, hy - 3, 3, 1, '#ffe07a'], [-1, hy + 3, 5, 2, '#3a3a44'], [1, hy + 3, 1, 1, '#9fe8ff', 1], [3, hy + 3, 1, 1, '#9fe8ff', 1]],
    chest: (hipY, C) => [[-3, hipY - 4, 7, 1, '#e8f0ff'], [-3, hipY - 1, 7, 1, C.c]] },
  ghost: { skin: '#dfe6ff', skinD: '#b8c2e8', torso: '#5d5684', torsoL: '#7b73a8', torsoD: '#423c63', sleeve: '#5d5684', pants: '#423c63', hideHair: true,
    head: (hy, C) => [[-5, hy - 1, 9, 3, '#5d5684'], [-6, hy + 1, 3, 6, '#5d5684'], [3, hy - 1, 2, 2, '#5d5684'], [-6, hy + 6, 2, 3, C.c]] },
  rocket: { torso: '#7a5a3a', torsoL: '#9c7a55', torsoD: '#5a3f26', sleeve: '#7a5a3a',
    head: (hy, C) => [[-4, hy - 1, 8, 3, '#6b4a2a'], [-5, hy + 1, 2, 4, '#6b4a2a'], [-1, hy + 2, 5, 2, '#3a3a44'], [0, hy + 2, 1, 1, '#ffd36b', 1], [2, hy + 2, 1, 1, '#ffd36b', 1]],
    back: (hipY, C, air) => [[-7, hipY - 8, 3, 7, '#9ea7b3'], [-7, hipY - 8, 3, 1, C.c], ...(air ? [[-7, hipY - 1, 3, 2, '#ffd23f', 1, 1], [-6, hipY + 1, 1, 2, '#ff7a1a', 1, 1]] : [])] },
  robot: { skin: '#a9b4c2', skinD: '#7d8898', torso: '#7d8898', torsoL: '#b9c4d2', torsoD: '#5b6676', sleeve: '#7d8898', hand: '#5b6676', pants: '#5b6676', hideHair: true,
    head: (hy, C) => [[-4, hy, 8, 2, '#b9c4d2'], [0, hy - 3, 1, 3, '#5b6676'], [-1, hy - 4, 3, 2, C.c, 1, 1], [-1, hy + 3, 5, 2, '#14202c'], [0, hy + 3, 4, 1, '#5cf2ff', 1, 1]],
    chest: (hipY, C) => [[-1, hipY - 5, 3, 2, C.c, 1, 1]] },
};
export const GUNS = {
  pistol:  (x, y) => [[x - 1, y - 1, 5, 2, '#3a3a44'], [x - 1, y + 1, 2, 2, '#2a2a33']],
  smg:     (x, y) => [[x - 2, y - 1, 8, 2, '#3a3a44'], [x + 1, y + 1, 2, 3, '#2a2a33'], [x - 3, y, 1, 2, '#2a2a33']],
  shotgun: (x, y) => [[x - 3, y - 1, 5, 2, '#6b4a2a'], [x + 2, y - 1, 6, 1, '#3a3a44'], [x + 2, y, 5, 1, '#2a2a33']],
  sniper:  (x, y) => [[x - 4, y - 1, 13, 2, '#2f3d2f'], [x, y - 3, 4, 2, '#111111'], [x + 4, y - 3, 1, 1, '#ff2a6d', 1, 1]],
  grenade: (x, y) => [[x - 2, y - 2, 8, 4, '#4a5a3a'], [x + 6, y - 2, 1, 4, '#222222'], [x, y + 2, 2, 2, '#2a2a33']],
  rocket:  (x, y) => [[x - 6, y - 2, 14, 4, '#4f6b3a'], [x + 8, y - 2, 2, 4, '#ff5722'], [x - 1, y + 2, 2, 2, '#2a2a33']],
  laser:   (x, y) => [[x - 2, y - 1, 8, 2, '#cfd8dc'], [x + 6, y - 1, 1, 2, '#5cf2ff', 1, 1], [x, y + 1, 2, 2, '#90a4ae']],
};

// возвращает {P, E}: P — все части, E — светящиеся (для свечения)
export function buildParts(p, t, power, o = {}) {
  const P = [], E = [];
  const C = pal(p.color);
  const L = LOOK[p.hero] || LOOK.brawler;
  const giant = power === 'giant';
  const skin = giant ? '#b9a3d9' : L.skin || SKIN, skinD = giant ? '#9478bd' : L.skinD || SKIN_D;
  const torso = L.torso || C.c, torsoL = L.torsoL || C.cl, torsoD = L.torsoD || C.cd;
  const pants = L.pants || '#3a3556', pantsD = shade(pants, 0.75), sleeve = L.sleeve || C.c, hand = L.hand || skin;
  const run = p.onGround && Math.abs(p.vx) > 12;
  const ph = (p.animT || 0) * 13;
  const sw = run ? Math.sin(ph) * 0.95 : 0;
  const air = !p.onGround, up = air && p.vy < -40, dash = (p.dashT || 0) > 0;
  const attack = (p.attackT || 0) > 0.05;
  const breath = !run && !air && Math.sin(t * 2.6 + (p.seed || 0)) > 0.55 ? 1 : 0;
  const bob = run ? (Math.abs(Math.cos(ph)) > 0.7 ? -1 : 0) : breath;
  const hipY = -7 + bob;
  const armed = !power && p.weapon;

  let la1, la2, ll = 5, aa1, aa2;
  if (dash) { la1 = 1.2; la2 = -1.0; aa1 = -1.4; aa2 = -1.7; }
  else if (up) { la1 = 0.9; la2 = -0.25; ll = 4; aa1 = 2.5; aa2 = -2.4; }
  else if (air) { la1 = 0.35; la2 = -0.5; aa1 = 1.9; aa2 = -2.0; }
  else if (run) { la1 = sw; la2 = -sw; aa1 = -sw * 0.9; aa2 = sw * 0.9; }
  else { la1 = 0.06; la2 = -0.06; aa1 = 0.12 + breath * 0.05; aa2 = -0.12; }
  if (armed) aa1 = attack || o.aiming ? Math.atan2(Math.abs(p.aimX || 1), p.aimY || 0) : 1.25;
  else if (attack) aa1 = giant ? 1.9 : 1.57;
  if ((p.frozenT || 0) > 0 || (p.stunT || 0) > 0) { la1 = 0.05; la2 = -0.05; aa1 = 0.2; aa2 = -0.2; }

  if (L.back) for (const q of L.back(hipY, C, air)) { P.push(q); if (q[6]) E.push(q); }
  // задняя рука и нога
  limb(P, -2, hipY - 6, aa2, 5, shade(sleeve, 0.75), shade(hand, 0.85), 3);
  const [bx, by] = limb(P, -1, hipY, la2, ll, pantsD, pantsD, 99);
  P.push([bx - 1, by, 3, 2, BOOT]);
  // торс
  P.push([-3, hipY - 7, 7, 7, torso], [-3, hipY - 7, 1, 6, torsoL], [3, hipY - 6, 1, 6, torsoD], [-3, hipY - 1, 7, 1, L.torso ? shade(L.torso, 0.6) : C.belt], [0, hipY - 1, 1, 1, '#d8b04a']);
  if (L.chest) for (const q of L.chest(hipY, C)) { P.push(q); if (q[6]) E.push(q); }
  if (giant) P.push([-3, hipY - 5, 2, 1, skinD], [1, hipY - 3, 2, 1, skinD]);
  // передняя нога
  const [fx, fy] = limb(P, 1, hipY, la1, ll, pants, pants, 99);
  P.push([fx - 1, fy, 3, 2, BOOT], [fx + 1, fy, 1, 1, '#3a3050']);
  // голова
  const hy = hipY - 15;
  P.push([-4, hy, 8, 8, skin], [-4, hy + 7, 8, 1, skinD]);
  if (!L.hideHair || power) P.push([3, hy + 5, 1, 1, '#f29a8a']);
  const blink = ((t + (p.seed || 0)) % 3.3) < 0.12;
  let eyeC = p.hero === 'robot' ? '#5cf2ff' : '#1b1424', eyeGlow = p.hero === 'robot';
  if (power === 'fire') { eyeC = '#ffeb3b'; eyeGlow = true; }
  else if (power === 'ice') { eyeC = '#bff4ff'; eyeGlow = true; }
  else if (power === 'bolt') { eyeC = '#ffffff'; eyeGlow = true; }
  else if (power === 'giant') { eyeC = '#ff3b5c'; eyeGlow = true; }
  else if (power) { eyeC = CFG_POW[power] || '#ffffff'; eyeGlow = true; }
  const eyes = blink ? [[0, hy + 4, 1, 1, eyeC], [2, hy + 4, 1, 1, eyeC]] : [[0, hy + 3, 1, 2, eyeC], [2, hy + 3, 1, 2, eyeC]];
  if (p.hero !== 'robot' || power) { P.push(...eyes); if (eyeGlow) E.push(...eyes); }
  if ((attack || (p.hitT || 0) > 0) && !['ninja', 'robot'].includes(p.hero)) P.push([1, hy + 6, 2, 1, '#7a2a2a']);
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
  } else if (power === 'shadow') {
    P.push([-5, hy - 1, 9, 3, '#1a0f2a'], [-6, hy + 1, 3, 7, '#1a0f2a'], [-7, hy + 6, 2, 4, '#1a0f2a']);
  } else if (power === 'poison') {
    P.push([-4, hy, 8, 3, '#3f8f2a'], [-5, hy + 1, 2, 4, '#3f8f2a'], [-3, hy - 2, 2, 2, '#7dff4a'], [1, hy - 3, 2, 3, '#7dff4a']);
    E.push([1, hy - 3, 1, 1, '#b8ff8a']);
  } else if (power === 'gravity') {
    P.push([-4, hy, 8, 3, '#22306b'], [-5, hy + 1, 2, 4, '#22306b']);
    for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1, q = [Math.round(Math.cos(a) * 7) - 1, hy - 3 + Math.round(Math.sin(a) * 2), 2, 2, '#9fc0ff', 1, 1]; P.push(q); E.push(q); }
  } else if (power === 'wind') {
    P.push([-4, hy, 8, 2, '#e8fff6'], [-7, hy + 1, 4, 1, '#e8fff6'], [-8, hy + 3, 4, 1, '#c9f5e6'], [-6, hy + 2, 2, 2, '#e8fff6']);
  } else if (!L.hideHair) {
    P.push([-4, hy, 8, 3, C.hair], [-5, hy + 1, 2, 4, C.hair], [2, hy + 2, 2, 1, C.hair], [-3, hy - 1, 5, 1, C.hair]);
  }
  if (power === 'ice') {
    const I = '#c8f6ff', parts = [[-3, hy - 3, 1, 3, I, 0, 1], [0, hy - 4, 1, 4, I, 0, 1], [3, hy - 3, 1, 3, I, 0, 1], [-4, hipY - 8, 2, 2, '#8ee8ff'], [3, hipY - 8, 2, 2, '#8ee8ff']];
    P.push(...parts); E.push(parts[0], parts[1], parts[2]);
  }
  if (power === 'giant') P.push([-6, hy - 1, 2, 3, '#e0d0ff'], [4, hy - 1, 2, 3, '#e0d0ff'], [-6, hy - 2, 1, 1, '#e0d0ff'], [5, hy - 2, 1, 1, '#e0d0ff']);
  // головной убор: шапка игрока или убор героя
  const noHead = power && power !== 'giant' && power !== 'ice';
  if (!noHead) {
    const hatParts = p.hat && p.hat !== 'none' ? (HATS[p.hat] || HATS.none)(hy) : L.head ? L.head(hy, C) : [];
    for (const h of hatParts) { P.push(h); if (h[6]) E.push(h); }
  }
  // передняя рука + оружие
  const [hx, hy2] = limb(P, 2, hipY - 6, aa1, 5, sleeve, hand, 3);
  P.push([hx - 1, hy2 - 1, 2, 2, hand]);
  if (armed && GUNS[p.weapon]) for (const q of GUNS[p.weapon](hx + 1, hy2)) { P.push(q); if (q[6]) E.push(q); }
  if (attack && power) { const g = [hx - 1, hy2 - 2, 3, 3, '#ffffff', 1]; P.push(g); E.push(g); }
  if (power) {
    const cy = hy - 7 + Math.round(Math.sin(t * 4) * 1);
    for (const q of HATS.crownGold(cy)) { P.push(q); E.push(q); }
  }
  return { P, E, hipY, hy };
}
const CFG_POW = { poison: '#b8ff8a', shadow: '#d6b3ff', gravity: '#9fc0ff', wind: '#e8fff6' };

export function drawCharacter(g, gg, p, x, y, t, o = {}) {
  const s = p.scale || 1;
  const { P, E } = buildParts(p, t, o.power, o);
  const dir = p.facing < 0 ? -1 : 1, kx = s * (o.sx || 1), ky = s * (o.sy || 1);
  const X = (lx, w) => dir > 0 ? x + lx * kx : x - (lx + w) * kx;
  const R = Math.round;
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

// отдельный рисунок оружия (для бонусов на земле)
export function drawGun(g, gg, kind, x, y, dir = 1) {
  const parts = (GUNS[kind] || GUNS.pistol)(0, 0), R = Math.round;
  const X = (lx, w) => dir > 0 ? x + lx : x - lx - w;
  g.fillStyle = OUT; for (const q of parts) if (!q[5]) g.fillRect(R(X(q[0] - 1, q[2] + 2)), R(y + q[1] - 1), q[2] + 2, q[3] + 2);
  for (const q of parts) { g.fillStyle = q[4]; g.fillRect(R(X(q[0], q[2])), R(y + q[1]), q[2], q[3]); if (gg && q[6]) { gg.fillStyle = q[4]; gg.fillRect(R(X(q[0] - 1, q[2] + 2)), R(y + q[1] - 1), q[2] + 2, q[3] + 2); } }
}
