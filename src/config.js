// Все игровые числа — здесь (design/implementation-plan.md §6, адаптировано под вид сбоку)
export const PASSWORD = '12345687';

export const CFG = {
  W: 480, H: 270,            // внутреннее пиксельное разрешение, камера неподвижна
  TICK: 30, SNAP_EVERY: 2,   // тик симуляции 30 Гц, снапшоты 15 Гц
  gravity: 1100, accel: 1000, friction: 1100,
  jumpVel: 340, coyote: 0.1, jumpBuffer: 0.12,
  dashSpeed: 260, dashTime: 0.15, dashCd: 1.2, dashInv: 0.2,
  fallY: 300, hunterRespawn: 3, spawnInv: 1,
  hunter: { scale: 1.4, hp: 100, speed: 95, shotSpeed: 230, shotDmg: 8, shotCd: 0.35, shotRange: 200, aimRange: 230 },
  chosen: { hpPer: 190, speed: 88, regen: 0.01, regenDelay: 4, swapInv: 1.5, scale: 2 },
  powers: {
    fire:  { name: 'Пламя',  color: '#ff7a1a', hpMul: 1,   speedMul: 1,
             aDmg: 30, aSpeed: 150, aCd: 0.6, bR: 55, bDmg: 40, bTele: 0.4, bCd: 7 },
    bolt:  { name: 'Молния', color: '#ffe83a', hpMul: 0.8, speedMul: 1.25,
             aDmg: 18, aRange: 95, aJump: 75, aJumps: 2, aCd: 0.8, bDist: 105, bR: 38, bDmg: 25, bCd: 5 },
    ice:   { name: 'Лёд',    color: '#8ee8ff', hpMul: 1,   speedMul: 1,
             aDmg: 15, aSpeed: 200, aCd: 0.5, slow: 0.4, slowT: 1.5, wallT: 4, wallH: 44, bCd: 8 },
    giant: { name: 'Гигант', color: '#ff4dff', hpMul: 1.5, speedMul: 0.82, scale: 2.8,
             aDmg: 35, aTele: 0.3, aW: 46, aH: 34, aKb: 190, aCd: 1, bR: 62, bDmg: 45, bCd: 6, bJump: 380 },
  },
  bigLobbyCdMul: 0.85,       // при 5+ игроках КД способности B Избранного −15 %
  score: { kill: 100, per10dmg: 5, perSec: 2, maxPerLife: 60, hunterKill: 20, survive: 50 },
  comeback: 1.15,
  rounds: 5, roundTime: 90, countdown: 3, roundEndTime: 3.5,
  colors: ['#ff4d4d', '#4da6ff', '#5ce65c', '#ffd23f', '#c86bff', '#ff8c3a'],
  maxPlayers: 6,
  // остров (≈2,5× больше): solid = земля, остальные — проходимые снизу платформы
  platforms: [
    { x: 30, y: 190, w: 420, h: 10, solid: true },
    { x: 66, y: 152, w: 72, h: 4 },
    { x: 342, y: 152, w: 72, h: 4 },
    { x: 204, y: 122, w: 72, h: 4 },
    { x: 104, y: 92, w: 62, h: 4 },
    { x: 314, y: 92, w: 62, h: 4 },
    { x: 209, y: 62, w: 62, h: 4 },
  ],
  spawns: [[60, 190], [420, 190], [150, 190], [330, 190], [102, 152], [378, 152], [240, 122], [240, 190]],
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};
