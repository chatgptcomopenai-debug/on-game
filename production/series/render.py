#!/usr/bin/env python3
"""ЖЕЛЕЗНЫЙ ИЗ КАЗАНИ — серия 1. Процедурный рендер 10-минутного эпизода (1920x1080, 60fps).
Использование: python3 render.py [--fps 60] [--preview SCENE] -> out/episode1.mp4
"""
import math, random, sys, os, subprocess, wave, struct
from multiprocessing import Pool
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1920, 1080
FPS = 60
SCENE_LEN = 60.0
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_S = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
_fc = {}
def font(sz, serif=False):
    sz = max(8, int(sz / 2) * 2)
    k = (sz, serif)
    if k not in _fc: _fc[k] = ImageFont.truetype(FONT_S if serif else FONT_B, sz)
    return _fc[k]

# ---------- easing ----------
def clamp(x, a=0., b=1.): return a if x < a else b if x > b else x
def ease(x): x = clamp(x); return x * x * (3 - 2 * x)
def eout(x): x = clamp(x); return 1 - (1 - x) ** 3
def back(x): x = clamp(x); c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2
def seg(t, a, b): return clamp((t - a) / (b - a)) if b > a else float(t >= a)
def lerp(a, b, k): return a + (b - a) * k
def mix(c1, c2, k): return tuple(int(lerp(a, b, clamp(k))) for a, b in zip(c1, c2))

# ---------- camera / drawer ----------
class Cam:
    def __init__(s, x=0, y=0, z=1, roll=0): s.x, s.y, s.z, s.roll = x, y, z, roll

class D:
    def __init__(s, img, cam):
        s.img, s.cam = img, cam
        s.d = ImageDraw.Draw(img, "RGBA")
    def p(s, x, y, par=1.0):
        c = s.cam; z = 1 + (c.z - 1) * par
        return ((x - c.x * par) * z + W / 2, (y - c.y * par) * z + H / 2)
    def sc(s, par=1.0): return 1 + (s.cam.z - 1) * par
    def poly(s, pts, fill, par=1.0): s.d.polygon([s.p(x, y, par) for x, y in pts], fill=fill)
    def rect(s, x0, y0, x1, y1, fill, par=1.0):
        a, b = s.p(x0, y0, par), s.p(x1, y1, par); s.d.rectangle([a, b], fill=fill)
    def line(s, pts, fill, w, par=1.0):
        q = [s.p(x, y, par) for x, y in pts]; ww = max(1, int(abs(w * s.sc(par))))
        s.d.line(q, fill=fill, width=ww)
        r = ww / 2
        for x, y in q: s.d.ellipse([x - r, y - r, x + r, y + r], fill=fill)
    def circ(s, x, y, r, fill, par=1.0):
        X, Y = s.p(x, y, par); R = abs(r * s.sc(par)); s.d.ellipse([X - R, Y - R, X + R, Y + R], fill=fill)

# screen-space text helpers
def text_c(img, txt, cx, cy, sz, col=(255, 255, 255), serif=False, alpha=255, shadow=True, track=0):
    d = ImageDraw.Draw(img, "RGBA"); f = font(sz, serif)
    if track == 0:
        bw = d.textlength(txt, font=f)
        if shadow: d.text((cx - bw / 2 + 4, cy - sz / 2 + 5), txt, font=f, fill=(0, 0, 0, int(alpha * .7)))
        d.text((cx - bw / 2, cy - sz / 2), txt, font=f, fill=col + (alpha,))
    else:
        ws = [d.textlength(ch, font=f) + track for ch in txt]; x = cx - sum(ws) / 2
        for ch, w in zip(txt, ws):
            if shadow: d.text((x + 4, cy - sz / 2 + 5), ch, font=f, fill=(0, 0, 0, int(alpha * .7)))
            d.text((x, cy - sz / 2), ch, font=f, fill=col + (alpha,)); x += w

def kinetic(img, txt, t, a, b, cy=540, sz=110, col=(255, 255, 255), serif=False, cx=960, track=0):
    """Слово влетает с перелётом масштаба, держится, уходит размытием вверх."""
    if t < a or t > b: return
    k_in = seg(t, a, a + .45); k_out = seg(t, b - .35, b)
    s = sz * (0.4 + 0.6 * back(k_in)) * (1 + .25 * k_out)
    al = int(255 * eout(k_in) * (1 - k_out))
    text_c(img, txt, cx, cy - 60 * ease(k_out) + 30 * (1 - eout(k_in)), s, col, serif, al, track=track)

def typewriter(img, txt, t, a, cx, cy, sz, col=(230, 230, 230), cps=18, b=None):
    if t < a or (b and t > b): return
    n = int((t - a) * cps); al = 255 if not b else int(255 * (1 - seg(t, b - .4, b)))
    s = txt[:n] + ("▌" if (int(t * 3) % 2 and n < len(txt) + 6) else "")
    d = ImageDraw.Draw(img, "RGBA"); f = font(sz)
    d.text((cx - d.textlength(txt, font=f) / 2, cy), s, font=f, fill=col + (al,))

def subtitle(img, t, lines):
    for a, b, who, txt in lines:
        if a <= t <= b:
            k = eout(seg(t, a, a + .25)) * (1 - seg(t, b - .2, b)); al = int(255 * k)
            d = ImageDraw.Draw(img, "RGBA"); f = font(46); fn = font(34)
            tw = d.textlength(txt, font=f); y = 935 + 20 * (1 - k)
            d.rounded_rectangle([960 - tw / 2 - 30, y - 12, 960 + tw / 2 + 30, y + 64], 14, fill=(0, 0, 0, int(160 * k)))
            if who:
                nw = d.textlength(who, font=fn)
                d.rounded_rectangle([960 - nw / 2 - 16, y - 58, 960 + nw / 2 + 16, y - 14], 10, fill=(190, 20, 30, al))
                d.text((960 - nw / 2, y - 55), who, font=fn, fill=(255, 255, 255, al))
            d.text((960 - tw / 2, y), txt, font=f, fill=(255, 255, 255, al))

# ---------- figures ----------
POSES = {
 # torso lean(deg from vertical, + = forward), front arm (upper, fore), rear arm, front leg, rear leg  (angles: 0=forward, 90=up, -90=down)
 "guard":  dict(lean=8,  fa=(-50, 75),  ra=(-65, 85),  fl=(-70,), rl=(-115,)),
 "jab":    dict(lean=14, fa=(2, 2),     ra=(-65, 85),  fl=(-65,), rl=(-120,)),
 "cross":  dict(lean=20, fa=(-60, 80),  ra=(4, 4),     fl=(-60,), rl=(-125,)),
 "upper":  dict(lean=-6, fa=(-60, 85),  ra=(-25, 80),  fl=(-75,), rl=(-110,)),
 "hook":   dict(lean=16, fa=(10, 95),   ra=(-65, 85),  fl=(-68,), rl=(-118,)),
 "hit":    dict(lean=-30, fa=(140, 160), ra=(-150, -120), fl=(-55,), rl=(-100,)),
 "stand":  dict(lean=0,  fa=(-95, -90), ra=(-85, -80), fl=(-88,), rl=(-92,)),
 "walk1":  dict(lean=3,  fa=(-70, -60), ra=(-110, -100), fl=(-65,), rl=(-115,)),
 "walk2":  dict(lean=3,  fa=(-110, -100), ra=(-70, -60), fl=(-115,), rl=(-65,)),
 "raise":  dict(lean=0,  fa=(80, 90),   ra=(-85, -80), fl=(-80,), rl=(-100,)),
 "point":  dict(lean=4,  fa=(5, 5),     ra=(-85, -80), fl=(-85,), rl=(-95,)),
 "weave":  dict(lean=35, fa=(-30, 80),  ra=(-45, 90),  fl=(-50,), rl=(-125,)),
}
def pose_mix(a, b, k):
    A, B = POSES[a] if isinstance(a, str) else a, POSES[b] if isinstance(b, str) else b
    out = {}
    for key in A:
        if isinstance(A[key], tuple): out[key] = tuple(lerp(x, y, k) for x, y in zip(A[key], B[key]))
        else: out[key] = lerp(A[key], B[key], k)
    return out

def figure(dr, x, y, s, pose, face=1, col=(18, 18, 22), rim=(255, 60, 60), rot=0, kind="max", par=1.0, bulk=1.0):
    P = POSES[pose] if isinstance(pose, str) else pose
    def dirv(ang, L):
        a = math.radians(ang); return (math.cos(a) * L * face, -math.sin(a) * L)
    cr, sr = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def R(px, py):  # rotate around hip
        dx, dy = px - x, py - y; return (x + dx * cr - dy * sr, y + dx * sr + dy * cr)
    th = 110 * s; lean = math.radians(90 - P["lean"])
    sh = (x + math.cos(lean) * th * face, y - math.sin(lean) * th)
    hd = (x + math.cos(lean) * (th + 34 * s) * face, y - math.sin(lean) * (th + 34 * s))
    lw = 30 * s * bulk; aw = 24 * s * bulk
    legs = []
    for key, off in (("rl", -8), ("fl", 8)):
        k1 = dirv(P[key][0], 62 * s); knee = (x + off * s * face + k1[0], y + k1[1])
        foot = (knee[0] + dirv(P[key][0] - 6, 60 * s)[0] * 0.3, knee[1] + 62 * s * .95)
        foot = (knee[0] + k1[0] * .25, y + 122 * s)
        legs.append([R(x + off * s * face, y), R(*knee), R(*foot)])
    arms = []
    for key in ("ra", "fa"):
        u = dirv(P[key][0], 50 * s); el = (sh[0] + u[0], sh[1] + u[1])
        f = dirv(P[key][1], 46 * s); hand = (el[0] + f[0], el[1] + f[1])
        arms.append([R(*sh), R(*el), R(*hand)])
    rimc = rim + (200,)
    # rim offset copy (backlight)
    for L in legs + arms[:1]:
        dr.line([(px + 3 * s, py - 2 * s) for px, py in L], rimc, (lw if L in legs else aw) + 5 * s, par)
    for L in legs: dr.line(L, col, lw, par)
    dr.line(arms[0], col, aw, par)
    dr.line([R(x, y), R(*sh)], rimc, 50 * s * bulk + 6 * s, par)
    dr.line([R(x, y), R(*sh)], col, 50 * s * bulk, par)
    H0 = R(*hd)
    dr.circ(H0[0] + 3 * s, H0[1] - 2 * s, 24 * s, rimc, par); dr.circ(*H0, 23 * s, col, par)
    dr.line(arms[1], rimc, aw + 5 * s, par); dr.line(arms[1], col, aw, par)
    if kind in ("max", "mike"):  # перчатки/кулаки + красный акцент
        for A in arms: dr.circ(*A[2], 15 * s * bulk, (170, 20, 28) if kind == "mike" else col, par)
    if kind == "max":  # красный шарф
        n1 = R(sh[0] - 4 * s * face, sh[1] + 4 * s)
        dr.line([n1, (n1[0] - 40 * s * face, n1[1] + 18 * s + 6 * s * math.sin(x * .05))], (200, 24, 34), 12 * s, par)
        dr.circ(*n1, 14 * s, (200, 24, 34), par)
    if kind == "gop":  # кепка
        dr.poly([(H0[0] - 24 * s, H0[1] - 8 * s), (H0[0] + 24 * s, H0[1] - 8 * s), (H0[0] + 40 * s * face, H0[1] - 2 * s),
                 (H0[0] + 18 * s, H0[1] - 26 * s), (H0[0] - 18 * s, H0[1] - 26 * s)], (55, 55, 62), par)
    if kind == "boss":  # шапка-ушанка
        dr.poly([(H0[0] - 30 * s, H0[1] - 2 * s), (H0[0] + 30 * s, H0[1] - 2 * s), (H0[0] + 26 * s, H0[1] - 34 * s), (H0[0] - 26 * s, H0[1] - 34 * s)], (90, 60, 40), par)
    return dict(head=H0, hands=[a[2] for a in arms])

def walk_pose(t, speed=2.0): return pose_mix("walk1", "walk2", .5 + .5 * math.sin(t * speed * math.pi))

# ---------- fx ----------
def impact(img, x, y, k, col=(255, 240, 200), size=180):
    if k <= 0 or k >= 1: return
    d = ImageDraw.Draw(img, "RGBA"); r = size * eout(k); al = int(255 * (1 - k))
    pts = []
    for i in range(24):
        a = i / 24 * math.tau; rr = r * (1 if i % 2 == 0 else .42)
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
    d.polygon(pts, fill=col + (al,))
    d.ellipse([x - r * 1.3, y - r * 1.3, x + r * 1.3, y + r * 1.3], outline=(255, 255, 255, al // 2), width=6)

def speedlines(img, k, col=(255, 255, 255), seed=1, n=60):
    if k <= 0: return
    d = ImageDraw.Draw(img, "RGBA"); rnd = random.Random(seed)
    for i in range(n):
        a = rnd.random() * math.tau; r0 = 420 + rnd.random() * 300
        d.line([(960 + math.cos(a) * r0, 540 + math.sin(a) * r0), (960 + math.cos(a) * 1400, 540 + math.sin(a) * 1400)],
               fill=col + (int(110 * k),), width=rnd.randint(2, 7))

def snow(dr, t, n=220, seed=7, wind=40, alpha=200):
    rnd = random.Random(seed)
    for i in range(n):
        par = .4 + rnd.random() * 1.4; sp = 60 + rnd.random() * 90
        x0, y0 = rnd.random() * 3000 - 1500, rnd.random() * 1400
        x = ((x0 + wind * t * par + 20 * math.sin(t + i)) + 1500) % 3000 - 1500
        y = ((y0 + sp * t * par) % 1400) - 700
        dr.circ(x, y, 2.2 * par, (240, 245, 255, int(alpha * min(1, par))), par)

def sky(img, top, bot):
    a = np.linspace(0, 1, H)[:, None]
    g = (np.array(top)[None, None, :] * (1 - a[..., None]) + np.array(bot)[None, None, :] * a[..., None])
    img.paste(Image.fromarray(np.repeat(g, W, axis=1).astype(np.uint8)))

_vig = None
def vignette(img):
    global _vig
    if _vig is None:
        yy, xx = np.mgrid[0:H, 0:W]; r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
        a = (np.clip((r - .55) / .9, 0, 1) ** 1.6 * 210).astype(np.uint8)
        _vig = Image.fromarray(a, "L")
    img.paste((0, 0, 0), mask=_vig)

def letterbox(img, k=1.0):
    d = ImageDraw.Draw(img); h = int(70 * k)
    if h > 0: d.rectangle([0, 0, W, h], fill=(0, 0, 0)); d.rectangle([0, H - h, W, H], fill=(0, 0, 0))

def flash(img, k, col=(255, 255, 255)):
    if k > 0: ImageDraw.Draw(img, "RGBA").rectangle([0, 0, W, H], fill=col + (int(255 * clamp(k)),))

def shake(t, hits, amp=26, dur=.35):
    sx = sy = 0
    for h in hits:
        if 0 <= t - h < dur:
            k = 1 - (t - h) / dur; sx += math.sin(t * 90) * amp * k; sy += math.cos(t * 77) * amp * k
    return sx, sy

def hitk(t, hits, dur=.3):
    for h in hits:
        if 0 <= t - h < dur: return (t - h) / dur, h
    return None, None

def panels(dr, t, layers, lit_seed=3, night=1.0):
    """Панельки в 3 плана, окна мерцают."""
    for li, (par, base_y, col, hgt) in enumerate(layers):
        rnd = random.Random(lit_seed + li)
        x = -2400
        while x < 2400:
            w = rnd.randint(260, 460); h = hgt * rnd.uniform(.8, 1.2)
            dr.rect(x, base_y - h, x + w - 20, base_y + 600, col, par)
            if night > 0:
                for wy in range(int(base_y - h + 30), int(base_y - 20), 46):
                    for wx in range(x + 24, x + w - 50, 48):
                        if rnd.random() < .33:
                            fl = .8 + .2 * math.sin(t * 2 + wx * .1)
                            dr.rect(wx, wy, wx + 22, wy + 26, (255, 205, 120, int(200 * night * fl * (0.5 + 0.5 * par))), par)
            x += w

def ground(dr, y, col, par=1.0): dr.rect(-4000, y, 4000, y + 2000, col, par)

# ---------- scenes ----------
# каждая сцена: функция(img, t) + список ударов (для SFX), реплики, музыкальное настроение
SCENES = []
def scene(mood, bpm, hits=(), whoosh=(), crowd=0.0, wind=0.0, title=""):
    def deco(fn):
        SCENES.append(dict(fn=fn, mood=mood, bpm=bpm, hits=list(hits), whoosh=list(whoosh), crowd=crowd, wind=wind, title=title)); return fn
    return deco

# 1. ВЕГАС 1988
S1H = [12, 14.2, 15, 18.5, 22, 23.1, 26.4]
@scene("epic", 100, hits=S1H, whoosh=[11.8, 13.9, 18.2, 21.8, 26.1], crowd=.9, title="Вегас")
def s1(img, t):
    sky(img, (8, 6, 20), (40, 10, 30))
    sx, sy = shake(t, S1H)
    cam = Cam(120 * math.sin(t * .23) + sx, -20 + sy, 1.0 + .35 * ease(seg(t, 6, 30)) + .6 * ease(seg(t, 50, 60)), 0)
    if 26.4 <= t < 29: cam.z += .3 * (1 - seg(t, 26.4, 29))
    dr = D(img, cam)
    rnd = random.Random(1)
    for i in range(700):  # толпа + вспышки фотокамер
        x = rnd.uniform(-2000, 2000); y = rnd.uniform(-420, 120); par = .3 + (y + 420) / 540 * .4
        c = (30 + rnd.randint(0, 30), 20, 40 + rnd.randint(0, 30))
        dr.circ(x, y + 6 * math.sin(t * 6 + i), 14, c, par)
        if rnd.random() < .02 and int(t * 8 + i) % 23 == 0: dr.circ(x, y, 22, (255, 255, 240, 230), par)
    for k in range(3):  # прожекторы
        ax = -600 + k * 600 + 200 * math.sin(t * .5 + k)
        dr.poly([(ax - 30, -700), (ax + 30, -700), (ax * .3 + 260, 300), (ax * .3 - 260, 300)], (255, 230, 180, 26), .6)
    dr.poly([(-1100, 180), (1100, 180), (1500, 700), (-1500, 700)], (60, 40, 70))  # ринг
    dr.poly([(-1100, 180), (1100, 180), (1180, 230), (-1180, 230)], (230, 230, 240))
    for ry in (-60, 10, 80): dr.line([(-1150, ry), (1150, ry)], (200, 30, 40), 8)
    for px in (-1150, 1150): dr.rect(px - 20, -120, px + 20, 220, (200, 200, 210))
    # бой
    kk, h = hitk(t, S1H, .45)
    mike_pose = "guard"; opp_pose = "guard"
    cyc = (t * 1.3) % 1
    if 6 < t < 27:
        mike_pose = pose_mix("guard", "weave", .5 + .5 * math.sin(t * 2.4))
        if kk is not None:
            idx = S1H.index(h); p = ["jab", "cross", "hook", "upper", "jab", "cross", "upper"][idx]
            mike_pose = pose_mix(p, "guard", ease(kk)); opp_pose = pose_mix("hit", "guard", ease(kk))
    ox = 230 + 14 * math.sin(t * 2)
    opp_rot = 0; opp_y = 160
    if t >= 26.4:
        k = ease(seg(t, 26.4, 28.2)); opp_rot = -95 * k; opp_pose = "hit"; ox += 160 * k; opp_y = 160 + 60 * k
    if t >= 30: mike_pose = "raise"
    mx = -150 + 40 * math.sin(t * 1.7) if t < 30 else -60
    figure(dr, ox, opp_y, 1.6, opp_pose, -1, (25, 20, 30), (90, 120, 255), opp_rot, "gop" if False else "mike")
    m = figure(dr, mx, 160, 1.7, mike_pose, 1, (14, 12, 16), (255, 70, 60), 0, "mike", bulk=1.15)
    if kk is not None and kk < .5: impact(img, *dr.p(*m["hands"][1]), kk * 2, size=150 + 40 * cam.z)
    vignette(img); letterbox(img)
    typewriter(img, "ЛАС-ВЕГАС. 1988.", t, .8, 960, 300, 64, b=6)
    typewriter(img, "Железный Майк. 37 побед. 0 поражений.", t, 2.4, 960, 390, 40, (200, 200, 200), b=6)
    kinetic(img, "НОКАУТ!", t, 26.6, 30, 520, 200, (255, 220, 60), track=8)
    kinetic(img, "ЧЕМПИОН", t, 31, 38, 300, 130, (255, 255, 255), True, track=14)
    subtitle(img, t, [(33, 38, "КОММЕНТАТОР", "Он непобедим! Его не остановит никто!")])
    if t > 40:  # разлом
        k = seg(t, 40, 52); d = ImageDraw.Draw(img, "RGBA"); rnd = random.Random(int(t * 12))
        flash(img, .55 * k, (0, 0, 10))
        x, y = 960, 0; pts = [(x, y)]
        while y < H * min(1, k * 1.6):
            x += rnd.randint(-90, 90); y += rnd.randint(30, 90); pts.append((x, y))
        if len(pts) > 1:
            d.line(pts, fill=(180, 210, 255, 255), width=int(10 + 30 * k)); d.line(pts, fill=(255, 255, 255, 255), width=int(3 + 8 * k))
        kinetic(img, "НО ЧТО-ТО ПОШЛО НЕ ТАК...", t, 42, 49, 200, 70)
        speedlines(img, seg(t, 50, 58), seed=int(t * 30))
        flash(img, ease(seg(t, 54, 59.5)))

# 2. КАЗАНЬ 1989 — пробуждение
@scene("cold", 80, hits=[46, 47.2, 48, 50.5], whoosh=[45.8, 47, 50.2], wind=.8, title="Казань")
def s2(img, t):
    k_dawn = seg(t, 0, 60)
    sky(img, mix((10, 14, 34), (60, 50, 80), k_dawn), mix((40, 50, 80), (210, 130, 110), k_dawn))
    cam = Cam(-200 + 260 * ease(seg(t, 0, 60)), -40 * math.sin(t * .2), 1.25 - .25 * ease(seg(t, 0, 18)) + .5 * ease(seg(t, 18, 26)) - .5 * ease(seg(t, 40, 46)))
    if 40 <= t <= 52: cam.x += shake(t, [46, 47.2, 48, 50.5], 12)[0]
    dr = D(img, cam)
    panels(dr, t, [(.25, 120, (24, 28, 46), 520), (.5, 160, (30, 34, 54), 430), (.8, 200, (16, 18, 30), 340)], night=1 - k_dawn * .7)
    ground(dr, 250, (215, 222, 238))
    dr.rect(-4000, 250, 4000, 262, (180, 190, 210))
    dr.rect(500, -120, 514, 250, (30, 30, 40)); dr.circ(507, -130, 26, (255, 210, 140, 220))  # фонарь
    dr.poly([(507, -120), (380, 250), (640, 250)], (255, 210, 140, 40))
    # Макс
    if t < 10: p, rot, y = "stand", 90, 230
    elif t < 18:
        k = ease(seg(t, 10, 17)); p, rot, y = pose_mix("hit", "stand", k), 90 * (1 - k), lerp(230, 130, k)
    elif t < 45: p, rot, y = pose_mix("stand", "guard", seg(t, 28, 30)), 0, 130
    else:
        p, rot, y = "guard", 0, 130
        kk, h = hitk(t, [46, 47.2, 48, 50.5], .4)
        if kk is not None: p = pose_mix(["jab", "cross", "hook", "upper"][[46, 47.2, 48, 50.5].index(h)], "guard", ease(kk))
    mx = 0 + (700 * ease(seg(t, 53, 60)))
    if t > 53: p = walk_pose(t)
    m = figure(dr, mx, y, 1.0, p, 1, (16, 16, 22), (255, 120, 90), rot, "max", bulk=1.12)
    # отражение во льду
    if 20 < t < 40:
        k = seg(t, 20, 22) * (1 - seg(t, 38, 40))
        dr.rect(-260, 262, 260, 330, (160, 190, 230, int(150 * k)))
        figure(dr, 0, 392, -0.55, "guard", 1, (40, 30, 30, int(200 * k)), (255, 60, 60), 0, "mike", bulk=1.2)
    kk, h = hitk(t, [46, 47.2, 48, 50.5], .4)
    if kk is not None:
        hx, hy = dr.p(*m["hands"][1]); impact(img, hx, hy, kk, (230, 240, 255), 90)
        d = ImageDraw.Draw(img, "RGBA"); rnd = random.Random(int(h * 10))
        for i in range(30):  # снежный выброс
            a = rnd.uniform(-1, 1); r = 200 * eout(kk) * rnd.random()
            d.ellipse([hx + math.cos(a) * r - 5, hy + math.sin(a) * r - 5, hx + math.cos(a) * r + 5, hy + math.sin(a) * r + 5], fill=(255, 255, 255, int(220 * (1 - kk))))
    snow(dr, t, 260, wind=60)
    vignette(img); letterbox(img)
    flash(img, 1 - seg(t, 0, 3))
    typewriter(img, "КАЗАНЬ. ЗИМА 1989.", t, 2.5, 960, 260, 64, b=9)
    subtitle(img, t, [(11, 15, "???", "Где я?.. Почему так холодно?"), (15.5, 19, "???", "Это не Вегас. Это... не моё лицо.")])
    kinetic(img, "ВНУТРИ — ЖЕЛЕЗНЫЙ МАЙК", t, 21, 27, 230, 72, (255, 90, 80))
    kinetic(img, "СНАРУЖИ — МАКСИМКА ТАНКОВ", t, 27, 33, 230, 72, (255, 255, 255))
    if 33 < t < 40:  # карточка характеристик
        k = eout(seg(t, 33, 34)) * (1 - seg(t, 39.4, 40)); d = ImageDraw.Draw(img, "RGBA")
        x0 = 1250 + 300 * (1 - k); d.rounded_rectangle([x0, 200, x0 + 560, 560], 18, fill=(0, 0, 0, int(190 * k)))
        rows = [("ВОЗРАСТ", "19"), ("ТЕЛО", "ПРАЙМ"), ("УДАР", "ЖЕЛЕЗНЫЙ"), ("СТРАХ", "0")]
        for i, (a, b) in enumerate(rows):
            kr = eout(seg(t, 34 + i * .5, 34.6 + i * .5)) * k
            d.text((x0 + 30, 230 + i * 80), a, font=font(36), fill=(170, 170, 180, int(255 * kr)))
            d.text((x0 + 300, 230 + i * 80), b, font=font(40), fill=(255, 80, 70, int(255 * kr)))
            d.rectangle([x0 + 30, 285 + i * 80, x0 + 30 + 500 * kr, 289 + i * 80], fill=(200, 30, 40, int(255 * kr)))
    subtitle(img, t, [(40.5, 44.5, "МАЛОЙ (за кадром)", "Танков! Ты чё в снегу валяешься? Тебя пацаны ищут!"),
                      (51, 55, "МАКСИМКА", "Пацаны, говоришь... Ну пусть ищут.")])

# 3. ДВОР — наезд
@scene("tense", 90, whoosh=[56], wind=.4, title="Двор")
def s3(img, t):
    sky(img, (40, 34, 60), (150, 100, 100))
    z = 1.0 + .4 * ease(seg(t, 40, 56)); fx = 0
    if 8 < t < 40: fx = 120 * math.sin(t * .35)
    cam = Cam(fx, -30, z + .03 * math.sin(t * .7))
    dr = D(img, cam)
    panels(dr, t, [(.3, 100, (50, 44, 70), 500), (.6, 150, (40, 36, 58), 380)], night=.3)
    ground(dr, 240, (200, 205, 220))
    for gx in range(-1800, 1800, 300):  # гаражи
        dr.rect(gx, 40, gx + 280, 240, (70, 66, 80), .85); dr.rect(gx + 20, 70, gx + 260, 240, (90, 84, 98), .85)
    dr.line([(-700, 240), (-700, -40), (-500, -40), (-500, 240)], (60, 40, 40), 10, .9)  # качели
    dr.line([(-640, -40), (-620, 160 + 0 * t), (-580, 160), (-560, -40)], (90, 90, 90), 4, .9)
    walk_in = ease(seg(t, 2, 12))
    gx0 = 1300 - 700 * walk_in
    for i in range(5):
        p = walk_pose(t + i * .3) if t < 12 else pose_mix("stand", "point", seg(t, 15, 16) if i == 0 else 0)
        figure(dr, gx0 + i * 120 - (40 if i == 0 else 0), 120 + (i % 2) * 10, .95, p, -1, (28, 28, 34), (120, 140, 255), 0, "gop")
    mp = "stand" if t < 44 else pose_mix("stand", "guard", seg(t, 44, 46))
    if t > 56: mp = "weave"
    figure(dr, -200, 120, 1.0, mp, 1, (16, 16, 22), (255, 110, 90), 0, "max", bulk=1.12)
    snow(dr, t, 120, wind=30, alpha=150)
    vignette(img); letterbox(img)
    subtitle(img, t, [(13, 17, "СИПЛЫЙ («Кирпичные»)", "Э, Танков. Ты с какого района?"),
                      (17.5, 20.5, "МАКСИМКА", "С Бруклина."),
                      (21, 25, "СИПЛЫЙ", "Чё?! Ты чё, бессмертный, что ли?"),
                      (25.5, 30, "КИРПИЧНЫЙ", "Ты нам должен. По-пацански. Понял?"),
                      (31, 35.5, "МАКСИМКА", "Я никому ничего не должен."),
                      (36, 40, "СИПЛЫЙ", "Ну тогда мы тебя сейчас научим."),
                      (44, 49, "МАКСИМКА", "Учить? Я двадцать лет в ринге учился."),
                      (49.5, 54, "МАКСИМКА", "Давай. По одному или все сразу?")])
    if t > 56:
        k = seg(t, 56, 56.2); flash(img, .6 * (1 - seg(t, 56, 56.4)))
        d = ImageDraw.Draw(img, "RGBA"); d.rectangle([0, 0, W, H], fill=(120, 0, 0, 60))
        kinetic(img, "РАУНД ПЕРВЫЙ", t, 56.2, 60.5, 540, 160, (255, 230, 60), track=10)

# 4. ДРАКА 5 на 1
S4H = [3, 6.5, 9, 12.5, 15, 17, 20.5, 24, 26, 29.5, 33, 36.8]
@scene("fight", 140, hits=S4H, whoosh=[h - .2 for h in S4H], wind=.2, crowd=.2, title="Драка")
def s4(img, t):
    sky(img, (50, 20, 30), (170, 80, 70))
    sx, sy = shake(t, S4H, 30)
    kk, h = hitk(t, S4H, .5)
    idx = S4H.index(h) if h is not None else None
    z = 1.15 + .15 * math.sin(t * .6)
    if kk is not None and kk < .3: z += .25 * (1 - kk / .3)  # punch-in
    cam = Cam(200 * math.sin(t * .4) + sx, sy, z, 0)
    dr = D(img, cam)
    panels(dr, t, [(.3, 100, (60, 30, 40), 480), (.6, 150, (45, 24, 32), 360)], night=0)
    ground(dr, 240, (210, 200, 205))
    # противники: кто уже упал
    downed = sum(1 for x in S4H if t >= x + .5) // 2 + (1 if t > 38 else 0)
    downed = min(5, downed)
    for i in range(5):
        ang = i / 5 * math.tau + t * .3; ex = 380 * math.cos(ang); face = -1 if ex > 0 else 1
        if i < downed:
            figure(dr, ex * 1.4, 225, .95, "hit", face, (40, 40, 48), (100, 100, 140), 90 * face, "gop")
        else:
            p = pose_mix("guard", "walk1", .5 + .5 * math.sin(t * 4 + i))
            if kk is not None and i == downed: p = pose_mix("hit", "guard", ease(kk)); ex += 120 * (1 - kk) * (1 if ex > 0 else -1)
            figure(dr, ex, 120 + 10 * math.sin(ang), .95, p, face, (28, 28, 34), (120, 140, 255), 0, "gop")
    tgt = None
    if downed < 5:
        ang = downed / 5 * math.tau + t * .3; tgt = 380 * math.cos(ang)
    face = 1 if (tgt or 1) > 0 else -1
    mp = pose_mix("guard", "weave", .5 + .5 * math.sin(t * 3))
    if kk is not None: mp = pose_mix(["jab", "cross", "hook", "upper"][idx % 4], "guard", ease(kk))
    if t > 38: mp = pose_mix("guard", "stand", seg(t, 38, 40)); face = 1
    m = figure(dr, 0, 120, 1.0, mp, face, (16, 16, 22), (255, 110, 90), 0, "max", bulk=1.12)
    if kk is not None and kk < .6:
        impact(img, *dr.p(*m["hands"][1]), kk / .6, size=170)
        speedlines(img, 1 - kk / .6, seed=idx)
    snow(dr, t, 80, wind=20, alpha=120)
    vignette(img); letterbox(img)
    if t < 38:  # счётчик
        d = ImageDraw.Draw(img, "RGBA"); txt = f"{min(downed, 5)}/5"
        d.text((1640, 110), txt, font=font(84), fill=(255, 220, 60))
        d.text((1560, 210), "НОКАУТОВ", font=font(34), fill=(255, 255, 255, 200))
    for i, hh in enumerate(S4H):
        kinetic(img, ["БАХ!", "ДЖЕБ!", "ХУК!", "АППЕРКОТ!"][i % 4], t, hh, hh + .9, 250, 110, (255, 240, 220), cx=480 + (i % 3) * 480)
    kinetic(img, "ЧИСТЫЙ НОКАУТ", t, 38.5, 43, 360, 140, (255, 220, 60), track=8)
    subtitle(img, t, [(44, 48.5, "СИПЛЫЙ (лёжа в снегу)", "Ты... кто такой вообще?"),
                      (49, 53, "МАКСИМКА", "Зови меня Железный."),
                      (53.5, 58, "МАКСИМКА", "И передай своим: слабых здесь больше не трогают.")])

# 5. ДИСКОТЕКА ДК — вызов
@scene("disco", 124, whoosh=[45], crowd=.5, title="Дискотека")
def s5(img, t):
    beat = (t * 124 / 60) % 1; pulse = (1 - beat) ** 3
    sky(img, (10, 6, 22), (30, 10, 40))
    cam = Cam(160 * math.sin(t * .25), 0, 1.05 + .05 * pulse + .3 * ease(seg(t, 40, 52)), 0)
    dr = D(img, cam)
    cols = [(255, 40, 120), (60, 140, 255), (255, 220, 60), (60, 255, 160)]
    for k in range(5):
        c = cols[(k + int(t * 124 / 60)) % 4]; ax = -800 + k * 400
        sw = 300 * math.sin(t * 1.2 + k)
        dr.poly([(ax, -560), (ax + 20, -560), (ax + sw + 220, 600), (ax + sw - 220, 600)], c + (40,), .5)
    dr.circ(0, -380, 70, (200, 200, 220), .4)  # диско-шар
    rnd = random.Random(5)
    for i in range(90):
        dr.circ(rnd.uniform(-60, 60), -380 + rnd.uniform(-60, 60), 6, cols[i % 4] + (int(255 * pulse),), .4)
    ground(dr, 240, (40, 26, 50))
    for i in range(16):  # танцующие
        x = -1500 + i * 200 + (60 if i % 2 else 0); y = 100 + (i % 3) * 40
        if -260 < x < 260: continue
        p = pose_mix("raise", "stand", pulse) if i % 2 else walk_pose(t * 1.6 + i)
        figure(dr, x, y + 12 * pulse, .8, p, 1 if i % 2 else -1, (24, 18, 32), cols[i % 4], 0, "gop" if i % 3 == 0 else "none")
    figure(dr, -120, 120, 1.0, "stand", 1, (16, 16, 22), (255, 110, 90), 0, "max", bulk=1.12)
    lena = figure(dr, 110, 130, .9, pose_mix("stand", "walk1", .3 * pulse), -1, (30, 20, 30), (255, 140, 200), 0, "none")
    dr.poly([(lena["head"][0] - 26, lena["head"][1]), (lena["head"][0] + 26, lena["head"][1]), (lena["head"][0] + 34, lena["head"][1] + 60), (lena["head"][0] - 34, lena["head"][1] + 60)], (60, 30, 30))
    if t > 34:
        k = ease(seg(t, 34, 38)); figure(dr, 900 - 500 * k, 125, .9, walk_pose(t) if k < 1 else "point", -1, (30, 30, 36), (120, 140, 255), 0, "gop")
    vignette(img); letterbox(img)
    kinetic(img, "ДК «ЗАРЯ». СУББОТА", t, 1, 6, 260, 70, (255, 140, 200))
    subtitle(img, t, [(8, 12, "ЛЕНА", "Про тебя весь район говорит, Танков."),
                      (12.5, 16, "МАКСИМКА", "Пусть говорят. Я за справедливость."),
                      (16.5, 21, "ЛЕНА", "Раньше ты от каждой тени бегал..."),
                      (21.5, 26, "МАКСИМКА", "Раньше. Теперь тени бегают от меня."),
                      (26.5, 31, "ЛЕНА", "Смешной. Потанцуешь со мной?"),
                      (38.5, 43, "ГОНЕЦ («Зареченские»)", "Танков! Бугор вызывает. Завтра. На озере."),
                      (43.5, 47.5, "ГОНЕЦ", "Стенка на стенку. Приводи своих."),
                      (48.5, 52.5, "МАКСИМКА", "Своих? Я сам себе стенка.")])
    if t > 45: flash(img, .3 * (1 - seg(t, 45, 46)), (255, 40, 60))
    kinetic(img, "ЗАВТРА. ОЗЕРО.", t, 54, 59.6, 520, 120, (255, 60, 60), True, track=6)

# 6. ТРЕНИРОВКИ — монтаж
S6H = [i * 60 / 128 * 2 for i in range(4, 120)]
S6H = [h for h in S6H if (h % 10) > 1.2 and h < 58]
@scene("train", 128, hits=S6H, crowd=0, title="Тренировки")
def s6(img, t):
    cut = int(t // 10); lt = t - cut * 10
    pals = [((20, 20, 30), (80, 50, 40)), ((10, 20, 40), (60, 90, 130)), ((30, 10, 10), (120, 40, 30)),
            ((15, 15, 20), (70, 70, 80)), ((40, 20, 10), (200, 120, 60)), ((10, 10, 14), (160, 30, 40))]
    sky(img, *pals[cut % 6])
    cam = Cam(-300 + 60 * lt, 40 * math.sin(lt), 1.1 + .04 * lt, 0)
    sx, sy = shake(t, S6H, 8, .15); cam.x += sx; cam.y += sy
    dr = D(img, cam)
    kk, h = hitk(t, S6H, .3)
    if cut in (0, 5):  # гараж, груша
        ground(dr, 240, (50, 46, 50))
        for i in range(-3, 4): dr.rect(i * 500, -500, i * 500 + 20, 240, (40, 38, 44), .7)
        sw = (1 - kk) * 30 if kk is not None else 0
        dr.line([(250, -500), (250 + sw * .3, -220)], (120, 120, 120), 4)
        dr.line([(250 + sw * .3, -200), (250 + sw, 80)], (120, 20, 26), 90)
        p = pose_mix(["jab", "cross", "hook"][int((h or 0) * 2) % 3], "guard", ease(kk)) if kk is not None else "guard"
        m = figure(dr, 60, 120, 1.0, p, 1, (16, 16, 22), (255, 110, 90), 0, "max", bulk=1.12)
        if kk is not None and kk < .5: impact(img, *dr.p(250, -80), kk * 2, size=90)
    elif cut == 1:  # бег по снегу
        panels(dr, t, [(.3, 100, (30, 40, 60), 480), (.7, 160, (24, 30, 46), 360)], night=.6)
        ground(dr, 240, (220, 228, 240))
        cam.x = 0; figure(dr, cam.x + 30 * math.sin(t), 120 - abs(10 * math.sin(t * 6)), 1.0, walk_pose(t, 6), 1, (16, 16, 22), (255, 110, 90), 0, "max", bulk=1.12)
        snow(dr, t, 300, wind=-260)
    elif cut == 2:  # покрышка
        ground(dr, 240, (80, 60, 50))
        k = .5 + .5 * math.sin(lt * 2.5); ang = 80 * k
        dr.line([(60, 230), (60 + 260 * math.cos(math.radians(ang)), 230 - 260 * math.sin(math.radians(ang)))], (20, 20, 20), 80)
        figure(dr, -60, 120, 1.0, pose_mix("weave", "raise", k), 1, (16, 16, 22), (255, 110, 90), 0, "max", bulk=1.12)
    elif cut == 3:  # отжимания
        ground(dr, 240, (60, 60, 66))
        k = .5 + .5 * math.sin(lt * 5)
        figure(dr, 0, 200 - 20 * k, 1.0, pose_mix("raise", "upper", k), 1, (16, 16, 22), (255, 110, 90), -80, "max", bulk=1.12)
    elif cut == 4:  # маятник
        ground(dr, 240, (120, 80, 50))
        sw = math.sin(lt * 4)
        figure(dr, sw * 60, 120, 1.0, pose_mix("guard", "weave", abs(sw)), 1, (16, 16, 22), (255, 110, 90), 0, "max", bulk=1.12)
        for i in range(3): dr.line([(-800, -100 + i * 120), (800, -100 + i * 120)], (255, 200, 120, 40), 3, .5)
    vignette(img); letterbox(img)
    labels = ["05:00 — ПОДЪЁМ", "10 КМ ПО СНЕГУ", "ПОКРЫШКА × 200", "1000 ОТЖИМАНИЙ", "МАЯТНИК. УХОД. КОНТРА.", "ДЖЕБ — ДЖЕБ — КРЮК"]
    kinetic(img, labels[cut % 6], lt, .1, 3.2, 200, 90, (255, 230, 120), track=4)
    if lt < .25: flash(img, .8 * (1 - lt / .25))
    if kk is not None: flash(img, .06 * (1 - kk), (255, 60, 60))
    if cut == 5: subtitle(img, lt, [(4, 8, "МАКСИМКА", "Тело — прайм. Голова — чемпиона. Завтра — шоу.")])

# 7. ОЗЕРО — сбор
@scene("tense", 95, whoosh=[52], crowd=.6, wind=.9, title="Озеро")
def s7(img, t):
    sky(img, (60, 70, 100), (200, 210, 225))
    cam = Cam(-500 + 1000 * ease(seg(t, 0, 20)) - 500 * ease(seg(t, 20, 30)), -60, .7 + .3 * ease(seg(t, 0, 20)) + .5 * ease(seg(t, 44, 56)), 0)
    dr = D(img, cam)
    dr.poly([(-3000, 60), (-1800, -150), (-900, -40), (0, -180), (1200, -60), (3000, -200), (3000, 80), (-3000, 80)], (90, 100, 130), .3)
    for i in range(-30, 30): dr.poly([(i * 120, 70), (i * 120 + 30, -60), (i * 120 + 60, 70)], (40, 60, 60), .5)
    ground(dr, 70, (190, 215, 235))
    for i in range(20): dr.line([(-2000 + i * 230, 120 + (i * 37) % 200), (-1900 + i * 230, 140 + (i * 53) % 200)], (240, 250, 255), 3)
    for i in range(20):  # Зареченские
        x = 600 + (i % 7) * 110 + (i // 7) * 40; y = 120 + (i // 7) * 40 - 60
        p = pose_mix("stand", "raise", (.5 + .5 * math.sin(t * 5 + i)) * seg(t, 30, 34))
        figure(dr, x, y, .85, p, -1, (30, 30, 36), (120, 140, 255), 0, "gop")
    boss = figure(dr, 520, 110, 1.25, pose_mix("stand", "point", seg(t, 12, 13)), -1, (26, 22, 26), (255, 160, 60), 0, "boss", bulk=1.3)
    for i in range(4):  # Кирпичные пришли поддержать
        k = ease(seg(t, 36, 42)); figure(dr, -900 + i * 90 + 300 * k, 100 + (i % 2) * 20, .85, walk_pose(t + i) if k < 1 else "stand", 1, (28, 28, 34), (255, 110, 90), 0, "gop")
    figure(dr, -300, 120, 1.0, "stand" if t < 50 else "guard", 1, (16, 16, 22), (255, 110, 90), 0, "max", bulk=1.12)
    snow(dr, t, 300, wind=200, alpha=210)
    vignette(img); letterbox(img)
    kinetic(img, "ОЗЕРО КАБАН. ВОСКРЕСЕНЬЕ. 12:00", t, 1, 6.5, 230, 60, (230, 240, 255))
    subtitle(img, t, [(8, 12, "БУГОР («Зареченские»)", "Один пришёл? Смелый... или глупый."),
                      (12.5, 17, "МАКСИМКА", "Я не один. Со мной двадцать лет бокса."),
                      (17.5, 22, "БУГОР", "Слово пацана: ляжешь — район наш."),
                      (22.5, 27, "МАКСИМКА", "Слово боксёра: лягу — только спать."),
                      (34, 37, "ЗАРЕЧЕНСКИЕ", "Бу-гор! Бу-гор! Бу-гор!"),
                      (42, 46, "СИПЛЫЙ", "Железный! Мы с тобой. Кирпичные своих не бросают."),
                      (46.5, 50.5, "МАКСИМКА", "Стойте сзади. Это моя работа.")])
    kinetic(img, "20 ПРОТИВ 1", t, 52, 59.6, 540, 150, (255, 60, 60), True, track=6)

# 8. 20 НА 1
S8H = [2 + i * 1.6 for i in range(12)] + [24 + i * .9 for i in range(8)]
@scene("fight", 150, hits=S8H, whoosh=[h - .15 for h in S8H], crowd=.9, wind=.3, title="Стенка")
def s8(img, t):
    sky(img, (70, 70, 100), (210, 200, 210))
    sx, sy = shake(t, S8H, 34)
    kk, h = hitk(t, S8H, .5)
    idx = S8H.index(h) if h is not None else -1
    slow = 1.0
    z = 1.15 + .1 * math.sin(t * .5)
    if 38 < t < 46: z = 1.6; sx *= .2
    if kk is not None and kk < .25: z += .2 * (1 - kk / .25)
    cam = Cam(260 * math.sin(t * .3) + sx, -20 + sy, z, 0)
    dr = D(img, cam)
    ground(dr, 70, (195, 215, 235)); dr.rect(-4000, -800, 4000, 70, (150, 165, 190), .3)
    n_down = sum(1 for x in S8H if t >= x + .3)
    rnd = random.Random(8)
    for i in range(20):
        a = rnd.random() * math.tau; r = 300 + rnd.random() * 400
        ex, ey = r * math.cos(a + t * .2), 60 + 100 * math.sin(a + t * .2)
        face = -1 if ex > 0 else 1
        if i < n_down:
            fly = clamp((t - S8H[i] - .3) / .8)
            fx = ex + face * -500 * eout(fly); fy = 225 - 260 * math.sin(math.pi * fly) if fly < 1 else 225
            figure(dr, fx, fy, .85, "hit", face, (40, 40, 48), (100, 100, 140), 90 * face * fly + 360 * fly * (i % 2), "gop")
        else:
            figure(dr, ex * .9, ey + 60, .85, pose_mix("guard", "walk1", .5 + .5 * math.sin(t * 4 + i)), face, (28, 28, 34), (120, 140, 255), 0, "gop")
    mp = pose_mix("guard", "weave", .5 + .5 * math.sin(t * 3.5))
    if kk is not None: mp = pose_mix(["jab", "cross", "hook", "upper", "jab", "hook"][idx % 6], "guard", ease(kk))
    face = 1 if idx % 2 == 0 else -1
    if t > 50: mp = pose_mix("guard", "stand", seg(t, 50, 52)); face = 1
    m = figure(dr, 0, 130, 1.0, mp, face, (16, 16, 22), (255, 110, 90), 0, "max", bulk=1.12)
    if kk is not None and kk < .6:
        impact(img, *dr.p(*m["hands"][1]), kk / .6, size=180); speedlines(img, 1 - kk / .6, seed=idx)
    snow(dr, t, 150, wind=120, alpha=170)
    if 38 < t < 46:  # слоу-мо вставка
        d = ImageDraw.Draw(img, "RGBA"); d.rectangle([0, 0, W, H], fill=(20, 40, 90, 50))
        kinetic(img, "Ш  Т  О  Р  М", t, 38.5, 45.5, 210, 110, (180, 220, 255), True)
    vignette(img); letterbox(img)
    if t < 50:
        d = ImageDraw.Draw(img, "RGBA")
        d.text((1560, 100), f"x{n_down}", font=font(110), fill=(255, 220, 60))
        d.text((1560, 230), "КОМБО", font=font(36), fill=(255, 255, 255, 200))
    kinetic(img, "20 / 20", t, 50.5, 55, 420, 200, (255, 220, 60), track=10)
    subtitle(img, t, [(55.5, 59.6, "БУГОР", "Ну всё... Теперь ты со мной разговариваешь.")])

# 9. ДУЭЛЬ
S9H_B = [10, 12, 14]          # Бугор бьёт — Макс не шелохнулся
S9H_M = [33, 34.2, 35.4, 44.5]  # ответ + финальный апперкот
@scene("boss", 110, hits=S9H_B + S9H_M, whoosh=[9.8, 11.8, 13.8, 32.8, 34, 35.2, 44.2], crowd=.7, title="Дуэль")
def s9(img, t):
    slow = 44 < t < 52
    sky(img, (40, 30, 50), (190, 120, 110))
    sx, sy = shake(t, S9H_B + S9H_M, 20)
    if t >= 44.5 and t < 47: sx, sy = shake(t, [44.5], 60, 1.5)
    orbit = t * .15
    cam = Cam(260 * math.sin(orbit) + sx, -20 + sy, 1.25 + .2 * math.sin(t * .4) + (.5 * ease(seg(t, 42, 44.4)) if t < 46 else .2), 0)
    if 25 < t < 31: cam.z = 1.0
    dr = D(img, cam)
    ground(dr, 70, (190, 210, 230)); dr.rect(-4000, -800, 4000, 70, (120, 110, 140), .3)
    rnd = random.Random(9)
    for i in range(30):  # круг зрителей
        a = i / 30 * math.tau; x = 900 * math.cos(a + orbit * .5); y = 30 + 50 * math.sin(a + orbit * .5)
        figure(dr, x, y, .65, pose_mix("stand", "raise", .5 + .5 * math.sin(t * 6 + i)), 1 if x < 0 else -1, (30, 30, 36), (120, 140, 255) if i % 2 else (255, 110, 90), 0, "gop", par=.8)
    # трещины на льду после апперкота
    if t > 44.5:
        k = eout(seg(t, 44.5, 46.5)); d = ImageDraw.Draw(img, "RGBA"); r2 = random.Random(3)
        for j in range(14):
            a = r2.uniform(0, math.pi); x, y = dr.p(260, 240); pts = [(x, y)]
            for s_ in range(6): x += math.cos(a) * 90 * k * (1 if j % 2 else -1); y += 18 * k * r2.uniform(-1, 1); pts.append((x, y))
            d.line(pts, fill=(255, 255, 255, 220), width=4)
    kb, hb = hitk(t, S9H_B, .5); km, hm = hitk(t, S9H_M, .5)
    bp = pose_mix("guard", "walk1", .3 + .3 * math.sin(t * 2)); mp = "guard"
    if kb is not None: bp = pose_mix(["cross", "hook", "cross"][S9H_B.index(hb)], "guard", ease(kb))
    if 16 < t < 30: mp = pose_mix("guard", "weave", abs(math.sin(t * 3)));  bp = pose_mix("cross", "hook", .5 + .5 * math.sin(t * 3))
    if km is not None: mp = pose_mix(["jab", "cross", "hook", "upper"][S9H_M.index(hm)], "guard", ease(km)); bp = pose_mix("hit", "guard", ease(km))
    if 42 < t < 44.5: mp = pose_mix("guard", "weave", ease(seg(t, 42, 44.3)))
    bx, by, brot = 260, 110, 0
    if t >= 44.5:
        f = clamp((t - 44.5) / 3.5); mp = "upper" if t < 47 else pose_mix("upper", "stand", seg(t, 47, 49))
        bx = 260 + 320 * f; by = 110 - 420 * math.sin(math.pi * f); brot = -200 * f; bp = "hit"
        if f >= 1: by, brot = 205, -90
    figure(dr, bx, by, 1.25, bp, -1, (26, 22, 26), (255, 160, 60), brot, "boss", bulk=1.3)
    m = figure(dr, -60, 130, 1.0, mp, 1, (16, 16, 22), (255, 110, 90), 0, "max", bulk=1.12)
    if kb is not None and kb < .5: impact(img, *dr.p(*m["head"]), kb * 2, (255, 200, 120), 110)
    if km is not None and km < .6: impact(img, *dr.p(*m["hands"][1]), km / .6, size=220 if hm == 44.5 else 160)
    if 44.4 < t < 45.2: flash(img, 1 - seg(t, 44.4, 45.2))
    snow(dr, t, 120, wind=60, alpha=150)
    vignette(img); letterbox(img, 1 + .6 * seg(t, 40, 44) * (1 - seg(t, 50, 53)))
    for hh in S9H_B: kinetic(img, "...", t, hh + .2, hh + 1.4, 300, 90, (255, 255, 255))
    subtitle(img, t, [(3, 7, "БУГОР", "Я Бугор! Меня вся Казань боится!"),
                      (15, 19, "МАКСИМКА", "Это всё? У меня в Вегасе комары сильнее кусали."),
                      (20, 24, "БУГОР", "Стой на месте, вертлявый!"),
                      (25, 30, "МАКСИМКА", "Маятник. Нырок. Нырок. И..."),
                      (36.5, 41, "СИПЛЫЙ", "Он с ним играет! Он просто играет!"),
                      (52, 56, "", "...")])
    kinetic(img, "ЖЕЛЕЗНЫЙ АППЕРКОТ", t, 45, 50, 220, 130, (255, 220, 60), True, track=6)
    if t > 55: flash(img, ease(seg(t, 56, 60)) * .9, (255, 220, 190))

# 10. РАССВЕТ — финал
@scene("end", 72, crowd=.3, wind=.3, title="Рассвет")
def s10(img, t):
    sky(img, (110, 90, 130), (255, 180, 120))
    cam = Cam(-100 + 300 * ease(seg(t, 0, 40)), -40, 1.2 - .3 * ease(seg(t, 0, 40)) + .4 * ease(seg(t, 40, 50)), 0)
    dr = D(img, cam)
    dr.circ(400, 20, 160, (255, 230, 170), .2); dr.circ(400, 20, 260, (255, 220, 160, 50), .2)
    for i in range(-30, 30): dr.poly([(i * 120, 70), (i * 120 + 30, -60), (i * 120 + 60, 70)], (70, 60, 70), .5)
    ground(dr, 70, (255, 220, 200)); dr.rect(-4000, 70, 4000, 90, (255, 240, 220, 160))
    figure(dr, 380, 200, 1.25, pose_mix("hit", "stand", seg(t, 2, 10)), -1, (40, 30, 34), (255, 160, 60), -90 * (1 - seg(t, 2, 10)), "boss", bulk=1.3)
    for i in range(10):
        figure(dr, -900 + i * 110, 110 + (i % 2) * 20, .8, pose_mix("stand", "raise", seg(t, 28, 30) * (.5 + .5 * math.sin(t * 5 + i))), 1 if i < 5 else -1, (30, 30, 36), (255, 110, 90) if i < 5 else (120, 140, 255), 0, "gop")
    walk = ease(seg(t, 36, 52))
    mx = -40 + 900 * walk
    m = figure(dr, mx, 130, 1.0, walk_pose(t) if 36 < t < 52 else "stand", 1, (16, 16, 22), (255, 140, 90), 0, "max", bulk=1.12)
    dr.rect(-4000, 260, 4000, 400, (255, 210, 190, 120))
    figure(dr, mx, 390, -1.0, walk_pose(t) if 36 < t < 52 else "stand", 1, (60, 30, 30, 110), (255, 60, 60), 0, "mike", bulk=1.2)  # в отражении — Майк
    vignette(img); letterbox(img)
    subtitle(img, t, [(10.5, 14.5, "БУГОР", "Слово пацана... ты сильнейший на районе."),
                      (15, 19.5, "МАКСИМКА", "Слово боксёра: никто больше слабых не трогает."),
                      (20, 24, "МАКСИМКА", "Ни Кирпичные. Ни Зареченские. Никто."),
                      (24.5, 28, "БУГОР", "...Договорились, Железный."),
                      (30, 34, "ЛЕНА (подбегая)", "Танков! Ты живой?!"),
                      (34.5, 38.5, "МАКСИМКА", "Живой. Впервые за долгое время — живой.")])
    if t > 50:
        k = ease(seg(t, 50, 53)); d = ImageDraw.Draw(img, "RGBA"); d.rectangle([0, 0, W, H], fill=(0, 0, 0, int(220 * k)))
        kinetic(img, "ЖЕЛЕЗНЫЙ ИЗ КАЗАНИ", t, 51, 61, 440, 100, (255, 60, 60), True, track=4)
        kinetic(img, "СЕРИЯ 1 — «С БРУКЛИНА»", t, 52.5, 61, 590, 56, (255, 255, 255))
        kinetic(img, "ПРОДОЛЖЕНИЕ СЛЕДУЕТ...", t, 54.5, 61, 700, 44, (200, 200, 200))
    flash(img, seg(t, 59.3, 60), (0, 0, 0))

# ---------- render ----------
def render_frame(fi):
    t = fi / FPS; si = min(int(t // SCENE_LEN), len(SCENES) - 1); lt = t - si * SCENE_LEN
    img = Image.new("RGB", (W, H), (0, 0, 0))
    SCENES[si]["fn"](img, lt)
    # склейка: короткий чёрный «моргающий» стык со вспышкой
    for edge in (lt, SCENE_LEN - lt):
        if edge < .12: flash(img, 1 - edge / .12, (0, 0, 0))
    return img.tobytes()

def render_chunk(args):
    a, b, path = args
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-vf", "tmix=frames=2:weights='1 1'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", path], stdin=subprocess.PIPE)
    for fi in range(a, b): p.stdin.write(render_frame(fi))
    p.stdin.close(); p.wait(); return path

# ---------- audio ----------
SR = 44100
def synth_audio(total, path):
    N = int(total * SR); out = np.zeros((N, 2), np.float32); rng = np.random.default_rng(1)
    def add(start, sig, gain=1.0, pan=0.0):
        i = int(start * SR); j = min(N, i + len(sig))
        if i >= N or j <= i: return
        s = sig[:j - i] * gain; out[i:j, 0] += s * (1 - pan) ; out[i:j, 1] += s * (1 + pan)
    def env(n, a=.005, d=.2):
        x = np.arange(n) / SR; return np.minimum(1, x / a) * np.exp(-x / d)
    def kick():
        n = int(.35 * SR); x = np.arange(n) / SR; f = 50 + 120 * np.exp(-x * 30)
        return np.sin(np.cumsum(f) * 2 * np.pi / SR) * env(n, .002, .12)
    def snare():
        n = int(.25 * SR); return (rng.standard_normal(n) * .6 + np.sin(np.arange(n) * 2 * np.pi * 190 / SR) * .4) * env(n, .001, .07)
    def hat():
        n = int(.06 * SR); s = rng.standard_normal(n); s = np.diff(s, prepend=0); return s * env(n, .001, .015)
    def tone(freq, dur, kind="saw", a=.01, d=None):
        n = int(dur * SR); x = np.arange(n) / SR; ph = (x * freq) % 1
        w = (2 * ph - 1) if kind == "saw" else np.sin(2 * np.pi * freq * x) if kind == "sin" else np.sign(np.sin(2 * np.pi * freq * x))
        e = np.minimum(1, x / a) * (np.exp(-x / d) if d else np.minimum(1, (dur - x) / .05))
        return w * e
    def lp(sig, k=.08):  # однополюсный фильтр
        y = np.zeros_like(sig); acc = 0.0
        from itertools import accumulate
        # векторизованно через scipy нет — делаем блочный EMA
        alpha = k; y = np.empty_like(sig); prev = 0.0
        for i0 in range(0, len(sig), 256):
            blk = sig[i0:i0 + 256]
            # фильтр EMA быстрым способом через lfilter-формулу
            pw = (1 - alpha) ** np.arange(1, len(blk) + 1)
            c = np.cumsum(blk * alpha / pw) * pw + prev * pw
            y[i0:i0 + len(blk)] = c; prev = c[-1]
        return y
    def punch():
        n = int(.4 * SR); x = np.arange(n) / SR
        body = np.sin(np.cumsum(60 + 200 * np.exp(-x * 40)) * 2 * np.pi / SR) * env(n, .001, .09)
        crack = rng.standard_normal(n) * env(n, .0005, .02)
        return body * 1.2 + crack * .8
    def whoosh():
        n = int(.35 * SR); s = lp(rng.standard_normal(n).astype(np.float64), .15); x = np.arange(n) / n
        return s * np.sin(np.pi * x) ** 2 * 2.5
    KEYS = {"epic": (45, [0, 3, 7, 10]), "cold": (40, [0, 3, 7]), "tense": (42, [0, 1, 7]), "fight": (45, [0, 3, 5, 7]),
            "disco": (48, [0, 4, 7, 11]), "train": (43, [0, 3, 7, 10]), "boss": (41, [0, 1, 6, 7]), "end": (45, [0, 4, 7, 9])}
    def midi(m): return 440 * 2 ** ((m - 69) / 12)
    for si, sc in enumerate(SCENES):
        t0 = si * SCENE_LEN; bpm = sc["bpm"]; beat = 60 / bpm; root, chord = KEYS[sc["mood"]]
        mood = sc["mood"]
        nb = int(SCENE_LEN / beat)
        prog = [0, -4, -2, -5] if mood not in ("disco", "end") else [0, 5, 7, 3]
        for b in range(nb):
            tb = t0 + b * beat; bar = b // 4; deg = prog[bar % 4]
            if tb + beat > t0 + SCENE_LEN: break
            intensity = {"epic": 1, "cold": .3, "tense": .6, "fight": 1, "disco": .9, "train": 1, "boss": .8, "end": .5}[mood]
            if si == 0 and b * beat > 40: intensity = .3
            if si == 8 and 44 < b * beat < 52: intensity = .1
            if mood in ("fight", "disco", "train", "epic") or (mood == "boss" and b * beat > 30):
                add(tb, kick(), .9 * intensity)
                if b % 2 == 1: add(tb, snare(), .45 * intensity)
                add(tb + beat / 2, hat(), .25 * intensity, .3); add(tb, hat(), .15 * intensity, -.3)
            elif mood in ("tense", "boss"):
                if b % 2 == 0: add(tb, kick(), .7)
                add(tb + beat / 2, hat(), .12, .2)
            elif mood == "cold" and b * beat > 44:
                add(tb, kick(), .5)
            # бас
            bn = midi(root - 12 + deg); add(tb, lp(tone(bn, beat * .95, "saw"), .06) * .9, .35)
            if mood == "disco": add(tb + beat / 2, lp(tone(bn * 2, beat * .45, "saw"), .1), .25)
            # пэд на такт
            if b % 4 == 0:
                for c in chord[:3]:
                    add(tb, lp(tone(midi(root + 12 + deg + c), beat * 4, "saw", a=.4), .02) * .6, .10, (c % 2) * .4 - .2)
            # мелодия-рифф
            if mood in ("epic", "fight", "train", "boss", "end", "disco") and b % 2 == 0 and intensity > .4:
                step = [0, 2, 1, 3, 2, 1][(b // 2) % 6]
                add(tb, tone(midi(root + 24 + deg + chord[step % len(chord)]), beat * .8, "sq", d=.25) * .5, .07, .3)
        for h in sc["hits"]: add(t0 + h, punch(), .9 if mood != "train" else .35)
        for w_ in sc["whoosh"]: add(t0 + w_, whoosh(), .35)
        if sc["crowd"] > 0:
            n = int(SCENE_LEN * SR); c = lp(rng.standard_normal(n), .04); c2 = lp(rng.standard_normal(n), .2)
            mod = .7 + .3 * np.sin(np.arange(n) / SR * .8)
            add(t0, (c * 3 + c2 * .5) * mod, .16 * sc["crowd"])
        if sc["wind"] > 0:
            n = int(SCENE_LEN * SR); wsig = lp(rng.standard_normal(n), .01); mod = .6 + .4 * np.sin(np.arange(n) / SR * .5)
            add(t0, wsig * 8 * mod, .12 * sc["wind"])
    # мастер
    out /= max(1e-6, np.percentile(np.abs(out), 99.9)) / .8
    out = np.tanh(out * 1.1) * .95
    pcm = (out * 32767).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR); wf.writeframes(pcm.tobytes())

def main():
    global FPS
    args = sys.argv[1:]
    if "--fps" in args: FPS = int(args[args.index("--fps") + 1])
    os.makedirs(OUT, exist_ok=True)
    if "--stills" in args:  # контактный лист
        for si in range(len(SCENES)):
            for k, lt in enumerate([5, 15, 25, 35, 45, 55]):
                img = Image.new("RGB", (W, H), (0, 0, 0)); SCENES[si]["fn"](img, lt)
                img.convert("RGB").resize((480, 270)).save(f"{OUT}/still_{si+1:02d}_{k}.png")
        return
    total = SCENE_LEN * len(SCENES); nf = int(total * FPS)
    workers = int(os.environ.get("WORKERS", os.cpu_count() or 4)); chunks = workers * 4
    step = nf // chunks
    jobs = [(i * step, nf if i == chunks - 1 else (i + 1) * step, f"{OUT}/chunk_{i:03d}.mp4") for i in range(chunks)]
    with Pool(workers) as pool:
        for i, pth in enumerate(pool.imap(render_chunk, jobs)): print(f"chunk {i+1}/{chunks}", flush=True)
    synth_audio(total, f"{OUT}/audio.wav")
    with open(f"{OUT}/list.txt", "w") as f:
        for _, _, pth in jobs: f.write(f"file '{os.path.basename(pth)}'\n")
    subprocess.check_call(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", f"{OUT}/list.txt", "-i", f"{OUT}/audio.wav",
                           "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", f"{OUT}/episode1.mp4"])
    for _, _, pth in jobs: os.remove(pth)
    print("done", f"{OUT}/episode1.mp4")

if __name__ == "__main__":
    main()
