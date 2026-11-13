// Управление: плавающий джойстик слева; кнопки справа.
// Кнопки ✊ и ★ можно тянуть пальцем — появляется прицел (линия/кружок), при отпускании — выстрел туда.
// Короткое нажатие — автонаводка; удержание ✊ без оттягивания — автоогонь. ПК: клавиатура (+ мышь в main.js).
export function createInput() {
  const st = { mx: 0, my: 0, jumpHeld: false, jumpPressed: false, bP: false, aP: false, cP: false, aHeld: false,
    ax: 0, ay: 0, bx: 0, by: 0 };
  const aim = { active: false, btn: null, dx: 0, dy: 0 };
  const base = document.getElementById('joy-base'), knob = document.getElementById('joy-knob');
  const zone = document.getElementById('joy-zone');
  let jid = null, cx = 0, cy = 0; const R = 45;
  zone.addEventListener('pointerdown', e => {
    jid = e.pointerId; cx = e.clientX; cy = e.clientY; zone.setPointerCapture(jid);
    base.style.display = 'block'; base.style.left = cx + 'px'; base.style.top = cy + 'px';
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== jid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    st.mx = Math.abs(dx) > R * 0.2 ? dx / R : 0; st.my = Math.abs(dy) > R * 0.2 ? dy / R : 0;
  });
  const end = e => { if (e.pointerId !== jid) return; jid = null; st.mx = st.my = 0; base.style.display = 'none'; knob.style.transform = ''; };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  const bind = (id, down, up) => {
    const b = document.getElementById(id);
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); down(e); });
    const u = () => { b.classList.remove('on'); up && up(); };
    b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('pointerleave', u);
  };
  bind('btn-jump', () => { st.jumpHeld = true; st.jumpPressed = true; }, () => { st.jumpHeld = false; });
  bind('btn-c', () => { st.cP = true; });

  // кнопки с прицеливанием
  const AIM_R = 70, DEAD = 14;
  function aimButton(id, btn) {
    const el = document.getElementById(id);
    let pid = null, sx = 0, sy = 0, t0 = 0, holdTimer = null;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); el.classList.add('on');
      pid = e.pointerId; sx = e.clientX; sy = e.clientY; t0 = performance.now();
      try { el.setPointerCapture(pid); } catch {}
      aim.btn = btn; aim.active = false; aim.dx = aim.dy = 0;
      if (btn === 'a') holdTimer = setTimeout(() => { if (pid !== null && !aim.active) st.aHeld = true; }, 230);
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - sx, dy = e.clientY - sy, d = Math.hypot(dx, dy);
      if (d > DEAD) { aim.active = true; aim.btn = btn; st.aHeld = false; const k = Math.min(1, d / AIM_R) / d; aim.dx = dx * k; aim.dy = dy * k; }
      else if (aim.active) { aim.dx = aim.dy = 0; aim.active = false; }
    });
    const release = e => {
      if (e.pointerId !== pid) return;
      el.classList.remove('on'); clearTimeout(holdTimer);
      const wasHeld = st.aHeld; st.aHeld = false;
      if (aim.active) {
        if (btn === 'a') { st.aP = true; st.ax = aim.dx || 1e-3; st.ay = aim.dy; } else { st.bP = true; st.bx = aim.dx || 1e-3; st.by = aim.dy; }
      } else if (!(wasHeld && btn === 'a')) {
        if (btn === 'a') { st.aP = true; st.ax = st.ay = 0; } else { st.bP = true; st.bx = st.by = 0; }
      }
      aim.active = false; aim.btn = null; pid = null;
    };
    el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);
  }
  aimButton('btn-a', 'a');
  aimButton('btn-b', 'b');

  const keys = new Set();
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.repeat) return; keys.add(e.code);
    if (['Space', 'KeyW', 'ArrowUp'].includes(e.code)) { st.jumpHeld = true; st.jumpPressed = true; }
    if (e.code === 'KeyJ') { st.aP = true; st.ax = st.ay = 0; }
    if (e.code === 'KeyL' || e.code === 'KeyI') st.cP = true;
    if (e.code === 'KeyK' || e.code === 'ShiftLeft') { st.bP = true; st.bx = st.by = 0; }
  });
  addEventListener('keyup', e => {
    keys.delete(e.code);
    if (['Space', 'KeyW', 'ArrowUp'].includes(e.code)) st.jumpHeld = false;
  });

  // снимок ввода на один тик (нажатия сбрасываются после чтения)
  function sample() {
    let mx = st.mx, my = st.my;
    if (keys.size) {
      mx = (keys.has('KeyD') || keys.has('ArrowRight')) - (keys.has('KeyA') || keys.has('ArrowLeft')) || mx;
      my = (keys.has('KeyS') || keys.has('ArrowDown')) ? 1 : my;
    }
    const a = st.aP || st.aHeld || keys.has('KeyJ');
    const out = { mx, my, jumpHeld: st.jumpHeld, jump: st.jumpPressed, a, b: st.bP, c: st.cP,
      ax: st.aP ? st.ax : 0, ay: st.aP ? st.ay : 0, bx: st.bP ? st.bx : 0, by: st.bP ? st.by : 0 };
    st.jumpPressed = st.bP = st.aP = st.cP = false;
    return out;
  }
  // мышь (ПК): main.js подаёт сюда вектор прицела
  sample.fire = (btn, dx, dy) => { if (btn === 'a') { st.aP = true; st.ax = dx; st.ay = dy; } else { st.bP = true; st.bx = dx; st.by = dy; } };
  sample.aim = aim;
  return sample;
}
