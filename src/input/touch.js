// Управление (вид сверху): слева плавающий джойстик движения; справа — стик атаки, перекат, навык, ульта.
// Стик атаки: короткое нажатие — выстрел с автонаводкой; удержание — автоогонь; потянуть — прицел и огонь в эту сторону.
// Навык (★): нажать — применить с автонаводкой; потянуть — показать линию/кружок и применить при отпускании.
export function createInput() {
  const st = { mx: 0, my: 0, aP: false, aHeld: false, bP: false, cP: false, dP: false, ax: 0, ay: 0, bx: 0, by: 0 };
  const aim = { active: false, btn: null, dx: 0, dy: 0 };
  const base = document.getElementById('joy-base'), knob = document.getElementById('joy-knob'), zone = document.getElementById('joy-zone');
  let jid = null, cx = 0, cy = 0; const R = 46;
  zone.addEventListener('pointerdown', e => {
    jid = e.pointerId; cx = e.clientX; cy = e.clientY; try { zone.setPointerCapture(jid); } catch {}
    base.style.display = 'block'; base.style.left = cx + 'px'; base.style.top = cy + 'px';
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== jid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const dead = d < R * 0.18; st.mx = dead ? 0 : dx / R; st.my = dead ? 0 : dy / R;
  });
  const end = e => { if (e.pointerId !== jid) return; jid = null; st.mx = st.my = 0; base.style.display = 'none'; knob.style.transform = ''; };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  const tap = (id, fn) => { const b = document.getElementById(id); b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); fn(); }); const u = () => b.classList.remove('on'); b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('pointerleave', u); };
  tap('btn-c', () => { st.cP = true; });
  tap('btn-d', () => { st.dP = true; });

  const AIM_R = 64, DEAD = 13;
  function aimButton(id, btn) {
    const el = document.getElementById(id), nub = el.querySelector('.nub');
    let pid = null, sx = 0, sy = 0, holdTimer = null, dragged = false;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); el.classList.add('on');
      pid = e.pointerId; sx = e.clientX; sy = e.clientY; dragged = false;
      try { el.setPointerCapture(pid); } catch {}
      aim.btn = btn; aim.active = false; aim.dx = aim.dy = 0;
      if (btn === 'a') holdTimer = setTimeout(() => { if (pid !== null && !aim.active) st.aHeld = true; }, 220);
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - sx, dy = e.clientY - sy, d = Math.hypot(dx, dy);
      if (d > DEAD) { dragged = true; aim.active = true; aim.btn = btn; const k = Math.min(1, d / AIM_R) / d; aim.dx = dx * k; aim.dy = dy * k; if (nub) nub.style.transform = `translate(${dx * Math.min(1, 26 / d)}px,${dy * Math.min(1, 26 / d)}px)`; }
      else if (aim.active) { aim.active = false; if (nub) nub.style.transform = ''; }
    });
    const release = e => {
      if (e.pointerId !== pid) return;
      el.classList.remove('on'); clearTimeout(holdTimer); if (nub) nub.style.transform = '';
      const wasHeld = st.aHeld; st.aHeld = false;
      if (aim.active) { if (btn === 'a') { st.aP = true; st.ax = aim.dx || 1e-3; st.ay = aim.dy; } else { st.bP = true; st.bx = aim.dx || 1e-3; st.by = aim.dy; } }
      else if (!dragged && !(wasHeld && btn === 'a')) { if (btn === 'a') { st.aP = true; st.ax = st.ay = 0; } else { st.bP = true; st.bx = st.by = 0; } }
      aim.active = false; aim.btn = null; pid = null;
    };
    el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);
  }
  aimButton('btn-a', 'a');
  aimButton('btn-b', 'b');

  const keys = new Set();
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.repeat) return; keys.add(e.code);
    if (e.code === 'Space') { st.dP = true; e.preventDefault(); }
    if (e.code === 'KeyJ') { st.aP = true; st.ax = st.ay = 0; }
    if (e.code === 'KeyK') { st.bP = true; st.bx = st.by = 0; }
    if (e.code === 'KeyL' || e.code === 'KeyQ') st.cP = true;
  });
  addEventListener('keyup', e => keys.delete(e.code));
  const kb = () => [(keys.has('KeyD') || keys.has('ArrowRight')) - (keys.has('KeyA') || keys.has('ArrowLeft')), (keys.has('KeyS') || keys.has('ArrowDown')) - (keys.has('KeyW') || keys.has('ArrowUp'))];

  function move() { const [kx, ky] = kb(); let mx = kx || st.mx, my = ky || st.my; const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; } return [mx, my]; }
  // снимок ввода на один тик (нажатия сбрасываются после чтения)
  function sample() {
    const [mx, my] = move();
    const dragA = aim.active && aim.btn === 'a';
    const a = st.aP || st.aHeld || dragA || keys.has('KeyJ');
    const out = { mx, my, a, b: st.bP, c: st.cP, d: st.dP,
      ax: dragA ? aim.dx || 1e-3 : st.aP ? st.ax : 0, ay: dragA ? aim.dy : st.aP ? st.ay : 0, bx: st.bP ? st.bx : 0, by: st.bP ? st.by : 0 };
    st.aP = st.bP = st.cP = st.dP = false;
    return out;
  }
  sample.fire = (btn, dx, dy) => { if (btn === 'a') { st.aP = true; st.ax = dx; st.ay = dy; } else { st.bP = true; st.bx = dx; st.by = dy; } };
  sample.aim = aim; sample.move = move;
  return sample;
}
