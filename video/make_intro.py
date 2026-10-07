"""Cinematic ~32 s product teaser (Instagram/Reels style) for CardioScope.

    python video/make_intro.py record --format vertical     # Windows (Edge, GPU)  -> work/intro_vertical.json
    python video/make_intro.py encode --format vertical     # Linux (ffmpeg, numpy) -> out/cardioscope_intro_vertical.mp4

Formats: vertical (1080x1920, Reels/Shorts) and wide (1920x1080, YouTube / start of the demo video).
The app must be served locally (see make_video.py). Edits fall on a 75 bpm heartbeat grid, and the
soundtrack (heartbeats, drone, risers, hits) is synthesised from the same cue times, so picture
and sound stay in sync without any licensed music.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import subprocess
import sys
from pathlib import Path

import make_video as mv
from playwright.async_api import async_playwright

FORMATS = {"vertical": (1080, 1920), "wide": (1920, 1080)}
BEAT = 0.8  # 75 bpm
T_REVEAL = 10.2  # product reveal; every later cut sits on the beat grid
T_END_CARD = 25.4
T_TOTAL = 32.0

CINE_JS = r"""
(() => {
  if (window.cine) return;
  const css = `
  #cine{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#f4f1fa}
  #cine>div{position:absolute;inset:0}
  #cbg{background:radial-gradient(120vmax 90vmax at 50% 40%,#160f26 0%,#06040b 60%);opacity:1;transition:opacity .35s ease}
  #cvig{background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.6) 100%)}
  #cgrain{opacity:.07;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");animation:grain .5s steps(4) infinite}
  @keyframes grain{0%{transform:translate(0,0)}25%{transform:translate(-3%,2%)}50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-1%)}100%{transform:translate(0,0)}}
  #cflash{background:#fff;opacity:0}
  #cstage{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 7vmin}
  .w{display:inline-block;opacity:0;filter:blur(14px);transform:translateY(.35em);animation:win .8s cubic-bezier(.2,.8,.2,1) forwards}
  @keyframes win{to{opacity:1;filter:blur(0);transform:none}}
  .serif{font-family:"Instrument Serif",serif;font-weight:400;font-size:8.6vmin;line-height:1.08;letter-spacing:-.01em;max-width:88vmin}
  .serif em{color:#c4b5fd}
  .small{font-size:3.2vmin;letter-spacing:.32em;text-transform:uppercase;color:rgba(244,241,250,.62);font-weight:600;margin-bottom:3vmin}
  .num{font-weight:800;font-size:30vmin;line-height:1;letter-spacing:-.04em;background:linear-gradient(180deg,#fff 30%,#a78bfa);-webkit-background-clip:text;color:transparent;filter:drop-shadow(0 0 4vmin rgba(139,92,246,.45))}
  .slam{font-weight:800;font-size:15vmin;letter-spacing:.06em;text-transform:uppercase;animation:slam .9s cubic-bezier(.2,.9,.1,1) forwards;text-shadow:0 0 5vmin rgba(139,92,246,.7),.6vmin 0 0 rgba(239,68,68,.55),-.6vmin 0 0 rgba(56,189,248,.55)}
  @keyframes slam{0%{opacity:0;transform:scale(1.6);letter-spacing:.4em;filter:blur(10px)}18%{opacity:1;filter:blur(0)}70%{opacity:1;transform:scale(1);letter-spacing:.06em}100%{opacity:0;transform:scale(.96);letter-spacing:.04em}}
  .glitch{animation:gl 1.1s steps(2) infinite}
  @keyframes gl{0%,100%{text-shadow:none;transform:none}10%{text-shadow:.8vmin 0 rgba(239,68,68,.8),-.8vmin 0 rgba(56,189,248,.8);transform:translateX(.5vmin)}12%{text-shadow:none;transform:none}55%{text-shadow:-.6vmin 0 rgba(239,68,68,.8),.6vmin 0 rgba(56,189,248,.8);transform:translateX(-.4vmin)}57%{text-shadow:none;transform:none}}
  .brand{font-family:"Instrument Serif",serif;font-size:17vmin;line-height:1;letter-spacing:-.02em;text-shadow:0 0 6vmin rgba(0,0,0,.6)}
  .logo{width:13vmin;height:13vmin;margin-bottom:3vmin;filter:drop-shadow(0 0 4vmin rgba(139,92,246,.8))}
  #ccap{display:flex;align-items:flex-end;justify-content:center;padding-bottom:14vh}
  #ccap .c{font-size:3.6vmin;font-weight:600;letter-spacing:.02em;padding:1.6vmin 3.2vmin;border-radius:999px;background:rgba(10,7,18,.62);backdrop-filter:blur(12px);border:1px solid rgba(196,181,253,.28);opacity:0;transform:translateY(2vmin);animation:cap .5s .1s ease forwards;max-width:88vw;text-align:center}
  @keyframes cap{to{opacity:1;transform:none}}
  #cdis{display:flex;align-items:flex-end;justify-content:center;padding-bottom:4.2vh;font-size:2.1vmin;color:rgba(244,241,250,.55);opacity:0;transition:opacity .4s}
  .fadeout{transition:opacity .45s ease;opacity:0!important}
  .tag{font-size:3.3vmin;color:rgba(244,241,250,.75);margin-top:3.4vmin;max-width:80vmin;line-height:1.35}
  .meta{font-size:2.4vmin;letter-spacing:.24em;text-transform:uppercase;color:#c4b5fd;margin-top:5vmin;font-weight:600}
  svg.ecg{position:absolute;left:0;top:50%;width:100%;height:30vmin;transform:translateY(-50%);overflow:visible}
  `;
  const LOGO = '<svg class="logo" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7.5-4.6-9.6-9.4C.9 8 3 4 6.9 4c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3C21 4 23.1 8 21.6 11.6 19.5 16.4 12 21 12 21z" fill="#fff"/><path d="M4 12h4l2-3 3 6 2-3h5" stroke="#8b5cf6" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let root, stage, cap, dis, bg, flashEl, card = null, saved = [];
  const init = () => {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;600;800&display=swap';
    document.head.appendChild(l);
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'cine';
    root.innerHTML = '<div id="cbg"></div><div id="cvig"></div><div id="cstage"></div><div id="ccap"></div><div id="cdis">For decision support and education only · not a substitute for diagnostic imaging</div><div id="cgrain"></div><div id="cflash"></div>';
    document.body.appendChild(root);
    stage = root.querySelector('#cstage'); cap = root.querySelector('#ccap'); dis = root.querySelector('#cdis');
    bg = root.querySelector('#cbg'); flashEl = root.querySelector('#cflash');
  };
  const words = (text, cls, delay = 70) => {
    let i = 0;
    return `<div class="${cls}">` + text.split(/(\s+|<br>)/).map(t => {
      if (t === '<br>') return '<br>';
      if (/^\s+$/.test(t)) return ' ';
      if (!t) return '';
      return `<span class="w" style="animation-delay:${(i++) * delay}ms">${t}</span>`;
    }).join('') + '</div>';
  };
  window.cine = {
    bg: (on) => { bg.style.opacity = typeof on === 'number' ? String(on) : on ? '1' : '0'; },
    clear: () => { const old = [...stage.children]; old.forEach(c => c.classList.add('fadeout')); setTimeout(() => old.forEach(c => c.remove()), 460); },
    cut: () => { stage.innerHTML = ''; },
    line: (text, cls = 'serif', delay = 70) => { stage.insertAdjacentHTML('beforeend', words(text, cls, delay)); },
    glitch: (text) => { stage.insertAdjacentHTML('beforeend', `<div class="serif glitch">${words(text, '', 60)}</div>`); },
    count: (to, ms) => {
      stage.insertAdjacentHTML('beforeend', '<div class="num">0%</div>');
      const el = stage.lastElementChild, t0 = performance.now();
      const f = (now) => { const t = Math.min(1, (now - t0) / ms); el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3))) + '%'; if (t < 1) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    },
    slam: (w) => { stage.innerHTML = `<div class="slam">${w}</div>`; },
    brand: () => { stage.innerHTML = '<div class="small w" style="animation-delay:0ms">Introducing</div>' + LOGO.replace('class="logo"', 'class="logo w" style="animation-delay:120ms"') + words('CardioScope', 'brand', 0); },
    endcard: () => {
      stage.innerHTML = LOGO.replace('class="logo"', 'class="logo w"') + words('CardioScope', 'brand', 0)
        + words('See coronary risk in 3D <em>and</em> understand why.', 'serif tag', 80).replace('serif tag', 'tag')
        + `<div class="meta w" style="animation-delay:900ms">Multimodal AI Hackathon 2026 · Track A</div>`;
    },
    cap: (t) => { cap.innerHTML = t ? `<div class="c">${t}</div>` : ''; },
    dis: (on) => { dis.style.opacity = on ? '1' : '0'; },
    flash: (a = .85) => { flashEl.animate([{ opacity: a }, { opacity: 0 }], { duration: 320, easing: 'ease-out' }); },
    fadeAll: () => { root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, fill: 'forwards' }); },
    ecg: (ms, beats) => {
      // trace drawn left to right in `ms`; a QRS spike at each beat time (ms from the start)
      const W = 1000, pts = [];
      for (let x = 0; x <= W; x += 2) {
        let y = 0;
        for (const b of beats) {
          const bx = b / ms * W, d = x - bx;
          y += -6 * Math.exp(-((d + 26) ** 2) / 60) + 10 * Math.exp(-((d + 7) ** 2) / 6) - 70 * Math.exp(-(d ** 2) / 8) + 22 * Math.exp(-((d - 8) ** 2) / 8) - 14 * Math.exp(-((d - 40) ** 2) / 120);
        }
        pts.push(`${x},${y.toFixed(1)}`);
      }
      stage.insertAdjacentHTML('beforeend', `<svg class="ecg" viewBox="0 -100 1000 200" preserveAspectRatio="none"><defs><linearGradient id="eg"><stop offset="0" stop-color="#8b5cf6" stop-opacity="0"/><stop offset=".25" stop-color="#a78bfa"/><stop offset="1" stop-color="#f43f5e"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><polyline id="ecgl" points="${pts.join(' ')}" fill="none" stroke="url(#eg)" stroke-width="3" vector-effect="non-scaling-stroke" filter="url(#glow)"/></svg>`);
      const pl = stage.querySelector('#ecgl'), len = pl.getTotalLength();
      pl.style.strokeDasharray = len; pl.style.strokeDashoffset = len;
      pl.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: ms, fill: 'forwards' });
    },
    cinema: (on) => {
      const app = document.getElementById('root');
      app.style.transform = 'none';
      if (on) {
        if (card) return;
        let el = document.querySelector('canvas');
        while (el && !(el.matches('section.card-surface'))) el = el.parentElement;
        card = el;
        saved = [];
        for (let a = card; a && a !== document.body; a = a.parentElement) {
          saved.push([a, a.getAttribute('style')]);
          if (a !== card) Object.assign(a.style, { transform: 'none', filter: 'none', backdropFilter: 'none', willChange: 'auto', contain: 'none' });
        }
        Object.assign(card.style, { position: 'fixed', inset: '0', zIndex: '2147482000', borderRadius: '0', border: 'none', margin: '0',
          background: 'radial-gradient(120vmax 90vmax at 50% 42%, #1a1030 0%, #07050c 62%)', backdropFilter: 'none', maxWidth: 'none', width: '100vw', height: '100vh' });
        const ov = card.querySelector(':scope > div.pointer-events-none'); if (ov) ov.style.visibility = 'hidden';
      } else if (card) {
        // the full-screen canvas keeps its pixel size inline; shrink it so the grid can lay out again
        // (the viewer's resize observer then sets the real size)
        const cv = card.querySelector('canvas');
        if (cv) { cv.style.width = '1px'; cv.style.height = '1px'; if (cv.parentElement) { cv.parentElement.style.width = '1px'; cv.parentElement.style.height = '1px'; } }
        for (const [a, s] of saved) s == null ? a.removeAttribute('style') : a.setAttribute('style', s);
        if (cv && cv.parentElement) { cv.parentElement.style.width = '100%'; cv.parentElement.style.height = '100%'; }
        const ov = card.querySelector(':scope > div.pointer-events-none'); if (ov) ov.style.visibility = '';
        card = null;
      }
    },
    spot: (title, fill = .9, push = 1.06) => {
      // frame the dashboard card containing `title`, with a slow push-in (Ken Burns)
      const app = document.getElementById('root');
      app.style.transition = 'none'; app.style.transform = 'none';
      const t = [...app.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === title)
        || document.getElementById(title);
      const el = t.closest('section.card-surface') || t;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
      const s = Math.min(fill * vw / r.width, fill * vh / r.height, 2.6);
      const tf = (k) => `translate(${vw / 2 - k * (r.left + r.width / 2)}px, ${vh / 2 - k * (r.top + r.height / 2)}px) scale(${k})`;
      app.style.transformOrigin = '0 0'; app.style.transform = tf(s);
      app.getBoundingClientRect();
      app.style.transition = 'transform 2.4s cubic-bezier(.2,.6,.3,1)'; app.style.transform = tf(s * push);
    },
    unspot: () => { const app = document.getElementById('root'); app.style.transition = 'none'; app.style.transform = 'none'; },
    clickText: (scopeId, text) => {
      const scope = scopeId ? document.getElementById(scopeId) : document;
      const b = [...scope.querySelectorAll('button')].find(e => e.textContent.trim().startsWith(text));
      b && b.click();
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
"""


# ------------------------------------------------------------------------------------- picture

# cue list shared by picture and sound: (time, kind) for the sound design
SOUND = (
    [(0.4, "beat"), (1.2, "beat"), (2.6, "swell"), (5.4, "hit_small"), (5.6, "count"), (7.8, "glitch"), (8.6, "glitch"),
     (9.4, "riser_to_reveal"), (T_REVEAL, "hit_big")]
    + [(T_REVEAL + i * BEAT, "beat") for i in range(1, 19)]
    + [(12.6, "hit"), (15.0, "hit"), (17.4, "hit"), (19.8, "whoosh"), (20.6, "whoosh"), (21.4, "whoosh"), (23.0, "whoosh"),
       (23.8, "whoosh"), (24.6, "riser_to_end"), (T_END_CARD, "hit_big")]
)  # fmt: skip


async def record(fmt: str, app_url: str) -> dict:
    w, h = FORMATS[fmt]
    mv.W, mv.H = w, h
    frame_dir = mv.WORK / f"intro_frames_{fmt}"
    shutil.rmtree(frame_dir, ignore_errors=True)
    frame_dir.mkdir(parents=True)
    on_windows = sys.platform == "win32"
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            channel="msedge" if on_windows else None,
            args=["--hide-scrollbars"]
            + (
                []
                if on_windows
                else [
                    "--use-angle=swiftshader",
                    "--enable-unsafe-swiftshader",
                    "--ignore-gpu-blocklist",
                ]
            ),
        )
        ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
        await ctx.add_init_script(CINE_JS)
        pg = await ctx.new_page()
        await pg.goto(app_url + "/app?sample=normal", wait_until="networkidle")
        await pg.wait_for_selector('[data-vessel-label="LAD"]', timeout=90000)
        await pg.evaluate("document.fonts.ready")
        await pg.evaluate("cine.cinema(true)")  # heart full-screen behind the black title cards
        await asyncio.sleep(2.5)

        rec = mv.Recorder(pg, frame_dir)
        rec.pause()
        await rec.start()
        await asyncio.sleep(0.5)
        rec.resume()
        js = pg.evaluate

        async def at(t: float):
            if rec.now() > t + 0.06:
                print(f"  late: cue {t:.1f}s ran at {rec.now():.2f}s", flush=True)
            while rec.now() < t:
                await asyncio.sleep(0.004)

        canvas = await pg.locator("canvas").first.bounding_box()
        cx, cy = canvas["x"] + canvas["width"] / 2, canvas["y"] + canvas["height"] / 2

        async def orbit(dx: float, dur: float, dy: float = 0.0):
            # slow camera orbit: a long, gentle drag (no cursor is drawn)
            await pg.mouse.move(cx - dx / 2, cy - dy / 2)
            await pg.mouse.down()
            t0 = rec.now()
            while (k := (rec.now() - t0) / dur) < 1:
                e = k * k * (3 - 2 * k)
                await pg.mouse.move(cx - dx / 2 + dx * e, cy - dy / 2 + dy * e)
                await asyncio.sleep(0.012)
            await pg.mouse.up()

        # --- the hook (black cards)
        await at(0.0)
        await js("cine.ecg(2200, [400, 1200])")
        await at(2.3)
        await js("cine.clear()")
        await at(2.7)
        await js(
            "cine.line('Cardiovascular disease is the<br>leading cause of death <em>worldwide.</em>')"
        )
        await at(5.0)
        await js("cine.clear()")
        await at(5.4)
        await js(
            "cine.flash(.25); cine.line('A risk score gives you a number.', 'small', 40); cine.count(87, 1100)"
        )
        await at(7.4)
        await js("cine.clear()")
        await at(7.8)
        await js('cine.glitch("It doesn\'t show which artery.")')
        await at(8.6)
        await js("cine.line('<em>Or why.</em>')")
        await at(9.3)
        await js("cine.clear()")

        # --- reveal
        await at(T_REVEAL)
        await js("cine.flash(); cine.bg(.55); cine.brand(); cine.dis(true)")
        orbit_task = asyncio.ensure_future(orbit(260, 2.2))
        await at(11.9)
        await js("cine.clear(); cine.bg(false)")
        await orbit_task

        # --- three verbs
        await at(12.6)
        await js("cine.flash(.5); cine.slam('Predict'); cine.cap('')")
        await pg.get_by_role("button", name="Multi-vessel").evaluate("b => b.click()")
        orbit_task = asyncio.ensure_future(orbit(-220, 2.0, 20))
        await at(13.3)
        await js("cine.cap('Overall CAD + stenosis risk for LAD · LCX · RCA')")
        await orbit_task
        await at(15.0)
        await js("cine.flash(.5); cine.slam('Visualize'); cine.cap('')")
        await pg.locator('[data-vessel-label="LAD"]').evaluate("b => b.click()")
        await at(15.7)
        await js("cine.cap('Each artery coloured by its predicted probability')")
        await at(17.4)
        await js(
            "cine.flash(.6); cine.cinema(false); cine.spot('explanation-card', .92); cine.slam('Explain'); cine.cap('')"
        )
        await at(18.1)
        await js("cine.cap('Exact SHAP attribution, factor by factor')")

        # --- montage on the beat
        await at(19.8)
        await js(
            "cine.flash(.3); cine.spot('Stenosis probability per vessel', .9); cine.cap('Per-vessel probability vs. a sensitivity-tuned threshold')"
        )
        await at(20.6)
        await js(
            "cine.flash(.3); cine.spot('Overall coronary artery disease', .9); cine.cap('Calibrated · nested cross-validation · AUC 0.93 for CAD')"
        )
        await at(21.4)
        await js(
            "cine.flash(.3); cine.clickText('explanation-card', 'What-if'); cine.spot('explanation-card', .92, 1.03); cine.cap('What-if: move a risk factor, watch it respond')"
        )

        async def raise_bp():
            bp = '[aria-label="What-if: Blood pressure (systolic)"] [role="slider"]'
            await pg.wait_for_selector(bp)
            await pg.locator(bp).evaluate("t => t.focus({preventScroll: true})")
            while True:
                await pg.keyboard.press("ArrowRight")
                await asyncio.sleep(0.02)

        try:  # a hard time budget, so a slow UI can never push later cuts off the beat
            await asyncio.wait_for(raise_bp(), timeout=max(0.1, 22.8 - rec.now()))
        except asyncio.TimeoutError:
            pass
        await at(23.0)
        await js(
            "cine.flash(.3); cine.clickText('explanation-card', 'Physiology'); cine.spot('explanation-card', .92); cine.cap('Every measurement against its normal range')"
        )
        await at(23.8)
        # dip to black while the heart goes back to full screen (the canvas needs ~0.8 s to resize)
        await js(
            "cine.flash(.4); cine.bg(true); cine.unspot(); cine.cinema(true); cine.cap('Runs in any browser. No dedicated GPU needed.')"
        )
        await pg.keyboard.press("Escape")
        await at(24.6)
        await js("cine.bg(false)")
        orbit_task = asyncio.ensure_future(orbit(180, max(0.3, 25.3 - rec.now())))

        # --- end card (cut the orbit off on the beat rather than waiting for it)
        await at(T_END_CARD)
        orbit_task.cancel()
        await js("cine.flash(); cine.cap(''); cine.bg(true); cine.endcard(); cine.dis(true)")
        await pg.mouse.up()
        await at(T_TOTAL - 0.8)
        await js("cine.fadeAll()")
        await at(T_TOTAL)
        total = rec.now()
        await browser.close()
    print(f"recorded {len(rec.frames)} frames, {total:.1f}s")
    return {"total": total, "frames": [[t, p.name] for t, p in rec.frames]}


# ------------------------------------------------------------------------------------- sound


def soundtrack(path: Path, total: float):
    import numpy as np

    sr = 48000
    n = int((total + 3) * sr)
    out = np.zeros((n, 2))
    send = np.zeros((n, 2))  # reverb send
    t_all = np.arange(n) / sr
    rng = np.random.default_rng(7)

    def place(sig, t0, gain=1.0, pan=0.0, rev=0.0):
        sig = np.asarray(sig)
        if sig.ndim == 1:
            sig = np.stack([sig * (1 - max(pan, 0)), sig * (1 + min(pan, 0))], axis=1)
        i = int(t0 * sr)
        j = min(n, i + len(sig))
        out[i:j] += sig[: j - i] * gain
        send[i:j] += sig[: j - i] * gain * rev

    def lowpass(x, fc):
        """One-pole low-pass; fc may vary per sample."""
        fc = np.broadcast_to(np.asarray(fc, float), x.shape)
        a = np.exp(-2 * np.pi * fc / sr)
        y = np.empty_like(x)
        acc = 0.0
        for k in range(len(x)):
            acc = (1 - a[k]) * x[k] + a[k] * acc
            y[k] = acc
        return y

    def thump(f0, f1, dur, tau):
        t = np.arange(int(dur * sr)) / sr
        f = f1 + (f0 - f1) * np.exp(-t / 0.035)
        ph = 2 * np.pi * np.cumsum(f) / sr
        env = (1 - np.exp(-t / 0.004)) * np.exp(-t / tau)
        return np.sin(ph) * env

    def heartbeat(t0, g=1.0):
        place(thump(95, 42, 0.35, 0.07), t0, 0.95 * g, rev=0.15)
        place(thump(110, 52, 0.3, 0.055), t0 + 0.27, 0.62 * g, rev=0.15)

    def noise(dur):
        return rng.standard_normal(int(dur * sr))

    def hit(t0, g=1.0, big=False):
        dur = 3.2 if big else 1.6
        sub = thump(70, 32, dur, 1.1 if big else 0.5)
        nz = (
            lowpass(noise(dur), 900)
            * np.exp(-np.arange(int(dur * sr)) / sr / (0.35 if big else 0.18))
            * 3
        )
        place(sub, t0, 0.9 * g, rev=0.25)
        place(nz, t0, 0.5 * g, rev=0.9)
        if big:  # a bright transient on top
            place(
                lowpass(noise(0.08), 6000) * np.linspace(1, 0, int(0.08 * sr)),
                t0,
                0.35 * g,
                rev=1.0,
            )

    def riser(t0, t1, g=1.0):
        dur = t1 - t0
        k = np.linspace(0, 1, int(dur * sr))
        nz = lowpass(noise(dur), 150 + 7000 * k**2) * 2.2
        tone = np.sin(2 * np.pi * np.cumsum(180 + 520 * k**2) / sr) * 0.25
        env = k**2.2
        place((nz + tone) * env, t0, 0.55 * g, rev=0.6)

    def whoosh(t0, g=1.0):
        dur = 0.45
        k = np.linspace(0, 1, int(dur * sr))
        sig = lowpass(noise(dur), 400 + 5000 * np.sin(np.pi * k)) * np.sin(np.pi * k) ** 2 * 2
        place(sig, t0 - 0.2, 0.32 * g, pan=float(rng.uniform(-0.5, 0.5)), rev=0.4)

    def glitch(t0):
        dur = 0.32
        t = np.arange(int(dur * sr)) / sr
        sq = np.sign(np.sin(2 * np.pi * 220 * t)) * (rng.random(len(t)) > 0.35)
        gate = np.floor(t * 40) % 3 != 0
        place(lowpass(sq * gate, 2500) * np.exp(-t / 0.15), t0, 0.16, rev=0.2)

    def count_ticks(t0, dur=1.1, k=11):
        for i in range(k):
            tt = t0 + dur * (1 - (1 - i / k) ** 0.5)
            t = np.arange(int(0.025 * sr)) / sr
            place(np.sin(2 * np.pi * 2600 * t) * np.exp(-t / 0.006), tt, 0.12, pan=0.2 * (-1) ** i)

    # drone pad: A minor colour, opening to A major for the end card
    def pad_layer(freqs, a, b, gain, bright=0.0):
        i, j = int(a * sr), min(n, int(b * sr))
        t = t_all[i:j]
        sig = np.zeros((j - i, 2))
        for f in freqs:
            for ch, det in ((0, -0.18), (1, 0.21)):
                ph = rng.uniform(0, 2 * np.pi)
                sig[:, ch] += np.sin(2 * np.pi * (f + det) * t + ph) + bright * 0.35 * np.sin(
                    4 * np.pi * (f + det) * t + ph
                )
        L = j - i
        env = np.minimum(1, np.arange(L) / (1.2 * sr)) * np.minimum(
            1, (L - np.arange(L)) / (0.6 * sr)
        )
        out[i:j] += sig * env[:, None] * gain / len(freqs)
        send[i:j] += sig * env[:, None] * gain / len(freqs) * 0.5

    minor = [55, 82.41, 110, 130.81, 164.81]
    pad_layer(minor, 2.4, 9.5, 0.22)
    pad_layer(minor + [220], T_REVEAL, T_END_CARD + 0.1, 0.30, bright=0.6)
    pad_layer(
        [55, 82.41, 110, 138.59, 164.81, 220, 277.18], T_END_CARD, total + 2.5, 0.34, bright=0.8
    )

    for t0, kind in SOUND:
        if kind == "beat":
            heartbeat(t0, 1.0 if t0 < T_REVEAL else 0.8)
        elif kind == "hit":
            hit(t0, 0.8)
        elif kind == "hit_small":
            hit(t0, 0.45)
        elif kind == "hit_big":
            hit(t0, 1.0, big=True)
        elif kind == "riser_to_reveal":
            riser(t0, T_REVEAL)
        elif kind == "riser_to_end":
            riser(t0, T_END_CARD)
        elif kind == "whoosh":
            whoosh(t0)
        elif kind == "glitch":
            glitch(t0)
        elif kind == "count":
            count_ticks(t0)
        elif kind == "swell":
            pass  # the pad's own fade-in

    # reverb: decaying stereo noise impulse response, applied by FFT convolution
    ir_len = int(2.6 * sr)
    ir_t = np.arange(ir_len) / sr
    ir = rng.standard_normal((ir_len, 2)) * np.exp(-ir_t / 0.55)[:, None]
    ir[:, 0] = lowpass(ir[:, 0], 5000)
    ir[:, 1] = lowpass(ir[:, 1], 5000)
    m = 1 << int(np.ceil(np.log2(n + ir_len)))
    wet = np.stack(
        [
            np.fft.irfft(np.fft.rfft(send[:, c], m) * np.fft.rfft(ir[:, c], m), m)[:n]
            for c in range(2)
        ],
        axis=1,
    )
    mix = out + wet / np.abs(wet).max() * np.abs(out).max() * 0.35

    end = int(total * sr)
    mix = mix[:end]
    fade = int(0.8 * sr)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 1.5
    mix = np.tanh(mix / np.abs(mix).max() * 1.6) / np.tanh(1.6) * 0.89  # gentle glue, -1 dBFS peak
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "f32le",
            "-ac",
            "2",
            "-ar",
            str(sr),
            "-i",
            "-",
            str(path),
        ],
        input=mix.astype(np.float32).tobytes(),
        check=True,
    )


def drop_glitch_frames(frames: list[tuple[float, Path]]) -> list[tuple[float, Path]]:
    """Remove single blank compositor frames (flat grey, captured while the canvas resizes).

    A glitch is near-uniform and much brighter than both neighbours; the intentional white
    flashes fade over several frames, so they are kept.
    """
    from PIL import Image, ImageStat

    stats = []
    for _, p in frames:
        st = ImageStat.Stat(Image.open(p).convert("L").resize((16, 16)))
        stats.append((st.mean[0], st.stddev[0]))
    keep = []
    for i, f in enumerate(frames):
        m, sd = stats[i]
        prev_m = stats[i - 1][0] if i else m
        next_m = stats[i + 1][0] if i + 1 < len(stats) else m
        if sd < 8 and m - prev_m > 40 and m - next_m > 40:
            print(f"  dropped glitch frame at {f[0]:.2f}s")
            continue
        keep.append(f)
    return keep


def encode(fmt: str, timeline: dict):
    w, h = FORMATS[fmt]
    total = timeline["total"]
    frame_dir = mv.WORK / f"intro_frames_{fmt}"
    frames = drop_glitch_frames([(t, frame_dir / name) for t, name in timeline["frames"]])
    if frames[0][0] > 0:
        frames = [(0.0, frames[0][1])] + frames
    lines = ["ffconcat version 1.0"]
    for (t, pth), nxt in zip(frames, frames[1:] + [(total, None)]):
        lines += [f"file '{pth}'", f"duration {max(nxt[0] - t, 0.001):.4f}"]
    lines.append(f"file '{frames[-1][1]}'")
    concat = mv.WORK / f"intro_{fmt}.ffconcat"
    concat.write_text("\n".join(lines))
    wav = mv.WORK / "intro_music.wav"
    soundtrack(wav, total)
    mv.OUT.mkdir(exist_ok=True)
    mp4 = mv.OUT / f"cardioscope_intro_{fmt}.mp4"
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-i", str(wav),
            "-vf", f"fps=30,scale={w}:{h}:flags=lanczos,format=yuv420p",
            "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high",
            "-c:a", "aac", "-b:a", "256k", "-t", f"{total:.3f}", "-movflags", "+faststart", str(mp4),
        ],
        check=True,
    )  # fmt: skip
    print(f"done: {mp4} ({total:.1f}s)")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("stage", choices=["record", "encode"])
    ap.add_argument("--format", choices=list(FORMATS), default="vertical")
    ap.add_argument("--app", default=mv.APP)
    args = ap.parse_args()
    mv.WORK.mkdir(exist_ok=True)
    tl = mv.WORK / f"intro_{args.format}.json"
    if args.stage == "record":
        tl.write_text(json.dumps(await record(args.format, args.app.rstrip("/"))))
    else:
        encode(args.format, json.loads(tl.read_text()))


if __name__ == "__main__":
    asyncio.run(main())
