// Все игровые числа — здесь (design/implementation-plan.md §6)
export const CFG = {
  W: 320, H: 180,          // внутреннее пиксельное разрешение, камера неподвижна
  TICK: 30,                // фиксированный тик симуляции, Гц
  gravity: 1100,
  moveSpeed: 95, accel: 1000, friction: 1100,
  jumpVel: 330, coyote: 0.1, jumpBuffer: 0.12,
  dashSpeed: 260, dashTime: 0.15, dashCd: 1.0,
  fallY: 230, respawnDelay: 1.0,
  colors: ['#ff4d4d', '#4da6ff', '#5ce65c', '#ffd23f', '#c86bff', '#ff8c3a'],
  // остров: solid = основная земля, остальные — проходимые снизу платформы
  platforms: [
    { x: 46, y: 132, w: 228, h: 10, solid: true },
    { x: 74, y: 98, w: 50, h: 4 },
    { x: 196, y: 98, w: 50, h: 4 },
    { x: 135, y: 66, w: 50, h: 4 },
  ],
  spawns: [[100, 132], [220, 132], [160, 66], [130, 132], [190, 132], [100, 98]],
};
