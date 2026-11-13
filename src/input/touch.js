// Управление: плавающий джойстик слева, кнопки справа; клавиатура для ПК
export function createInput() {
  const st = { mx: 0, my: 0, jumpHeld: false, jumpPressed: false, bP: false, aP: false };
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
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); down(); });
    const u = () => { b.classList.remove('on'); up && up(); };
    b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('pointerleave', u);
  };
  bind('btn-jump', () => { st.jumpHeld = true; st.jumpPressed = true; }, () => { st.jumpHeld = false; });
  bind('btn-a', () => { st.aP = true; });
  bind('btn-b', () => { st.bP = true; });

  const keys = new Set();
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.repeat) return; keys.add(e.code);
    if (['Space', 'KeyW', 'ArrowUp'].includes(e.code)) { st.jumpHeld = true; st.jumpPressed = true; }
    if (e.code === 'KeyJ') st.aP = true;
    if (e.code === 'KeyK' || e.code === 'ShiftLeft') st.bP = true;
  });
  addEventListener('keyup', e => {
    keys.delete(e.code);
    if (['Space', 'KeyW', 'ArrowUp'].includes(e.code)) st.jumpHeld = false;
  });

  // снимок ввода на один тик (нажатия сбрасываются после чтения)
  return function sample() {
    let mx = st.mx, my = st.my;
    if (keys.size) {
      mx = (keys.has('KeyD') || keys.has('ArrowRight')) - (keys.has('KeyA') || keys.has('ArrowLeft')) || mx;
      my = (keys.has('KeyS') || keys.has('ArrowDown')) ? 1 : my;
    }
    const out = { mx, my, jumpHeld: st.jumpHeld, jump: st.jumpPressed, b: st.bP, a: st.aP };
    st.jumpPressed = st.bP = st.aP = false;
    return out;
  };
}
