// Система частиц (только визуал, на каждом устройстве своя): искры, дым, обломки, угольки, снег, листья
export class Particles {
  constructor(max = 900) { this.a = []; this.max = max; }
  add(o) {
    if (this.a.length >= this.max) this.a.shift();
    o.max = o.life; o.drag ??= 0.92; o.grav ??= 0; o.size ??= 1; o.vx ??= 0; o.vy ??= 0;
    this.a.push(o);
  }
  burst(x, y, n, o = {}) {
    const { speed = 60, spread = Math.PI * 2, dir = 0, life = 0.5, cols = ['#fff'] } = o;
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread, v = speed * (0.35 + Math.random() * 0.65);
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + Math.random() * 0.5),
        c: cols[(Math.random() * cols.length) | 0], size: o.size ?? 1, grav: o.grav ?? 0, drag: o.drag, glow: o.glow,
        kind: o.kind, grow: o.grow, wob: o.wob, floor: o.floor });
    }
  }
  update(dt) {
    const k = dt * 60;
    for (const p of this.a) {
      p.life -= dt;
      const d = Math.pow(p.drag, k);
      p.vx *= d; p.vy = p.vy * d + p.grav * dt;
      if (p.wob) p.vx += Math.sin(p.life * 6 + p.y * 0.1) * p.wob * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grow) p.size += p.grow * dt;
      if (p.floor && p.y > p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; }
    }
    this.a = this.a.filter(p => p.life > 0);
  }
  draw(g, gg) {
    for (const p of this.a) {
      const k = p.life / p.max;
      const s = Math.max(1, Math.round(p.kind === 'smoke' ? p.size : p.size * (0.5 + k * 0.5)));
      g.globalAlpha = p.kind === 'smoke' ? k * 0.45 : Math.min(1, k * 1.6);
      g.fillStyle = p.c;
      if (p.len) g.fillRect(Math.round(p.x), Math.round(p.y), p.len, 1);
      else g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      if (p.glow && gg) { gg.globalAlpha = Math.min(1, k * 1.5); gg.fillStyle = p.c; gg.fillRect(Math.round(p.x - s), Math.round(p.y - s), s * 2, s * 2); }
    }
    g.globalAlpha = 1; if (gg) gg.globalAlpha = 1;
  }
}
