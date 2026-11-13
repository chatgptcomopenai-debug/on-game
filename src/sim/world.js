// Симуляция: без DOM, детерминированный step (план §4)
import { CFG } from '../config.js';

export function createPlayer(id, color, label, spawn, isBot = false) {
  return { id, color, label, isBot, spawn, x: spawn[0], y: spawn[1], px: spawn[0], py: spawn[1],
    vx: 0, vy: 0, onGround: true, facing: 1, coyoteT: 0, bufT: 0, dashT: 0, dashCd: 0,
    attackT: 0, dead: 0, animT: 0, dropT: 0 };
}

export function createWorld() { return { players: [], time: 0 }; }

function approach(v, t, d) { return v < t ? Math.min(v + d, t) : Math.max(v - d, t); }

export function step(world, inputs, dt) {
  world.time += dt;
  for (const p of world.players) {
    p.px = p.x; p.py = p.y;
    const inp = inputs[p.id] || {};
    if (p.dead > 0) {
      p.dead -= dt;
      if (p.dead <= 0) { p.x = p.px = p.spawn[0]; p.y = p.py = p.spawn[1] - 40; p.vx = p.vy = 0; }
      continue;
    }
    const mx = inp.mx || 0;
    if (mx) p.facing = Math.sign(mx);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.attackT = Math.max(0, p.attackT - dt);
    if (inp.attack && p.attackT === 0) p.attackT = 0.25;
    if (inp.dash && p.dashCd === 0) { p.dashT = CFG.dashTime; p.dashCd = CFG.dashCd; }
    if (p.dashT > 0) {
      p.dashT -= dt; p.vx = p.facing * CFG.dashSpeed; p.vy = 0;
    } else {
      const target = mx * CFG.moveSpeed;
      p.vx = approach(p.vx, target, (mx ? CFG.accel : CFG.friction) * dt);
      p.vy += CFG.gravity * dt;
    }
    // прыжок: буфер ввода + coyote time
    p.coyoteT = p.onGround ? CFG.coyote : Math.max(0, p.coyoteT - dt);
    p.bufT = inp.jump ? CFG.jumpBuffer : Math.max(0, p.bufT - dt);
    if ((inp.my || 0) > 0.6 && inp.jump) { p.dropT = 0.2; p.bufT = 0; } // вниз+прыжок = спрыгнуть
    if (p.bufT > 0 && p.coyoteT > 0) { p.vy = -CFG.jumpVel; p.bufT = 0; p.coyoteT = 0; }
    if (!inp.jumpHeld && p.vy < -120) p.vy = -120; // короткий прыжок
    p.dropT = Math.max(0, p.dropT - dt);

    const oldY = p.y;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.onGround = false;
    if (p.vy >= 0) {
      for (const pl of CFG.platforms) {
        if (!pl.solid && p.dropT > 0) continue;
        if (p.x > pl.x - 3 && p.x < pl.x + pl.w + 3 && oldY <= pl.y + 0.01 && p.y >= pl.y) {
          p.y = pl.y; p.vy = 0; p.onGround = true; break;
        }
      }
    }
    p.animT += dt;
    if (p.y > CFG.fallY) { p.dead = CFG.respawnDelay; }
  }
}
