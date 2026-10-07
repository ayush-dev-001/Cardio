"""Build the CardioScope demo video end to end (run under Linux/WSL).

    python video/make_video.py                 # full video -> video/out/cardioscope_demo.mp4
    python video/make_video.py --only arch,3d  # render only some scenes (for checking)

Steps: fetch live numbers from the deployed API, so the narration matches the screen -> text-to-speech
per sentence (edge-tts, cached) -> drive the live app and slides in headless Chromium while recording
the screen (CDP screencast) -> place each sentence's audio at the moment it was "spoken" -> encode
an H.264 MP4, plus YouTube captions (.srt) and chapter timestamps.

Needs: ffmpeg, `pip install playwright edge-tts numpy`, `playwright install --with-deps chromium`.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

from playwright.async_api import Page, async_playwright

# defaults: the current local build (video/serve_spa.py) and local API; pass --app/--api for the live site
APP = "http://localhost:4173"
API = "http://localhost:8000"
VOICE = "en-US-AndrewNeural"
RATE = "+8%"
W, H = 1920, 1080
SR = 24000  # audio sample rate
SENTENCE_GAP = 0.28  # pause between sentences, seconds
BEAT_PAD = 0.45  # pause after each beat

HERE = Path(__file__).resolve().parent
SLIDES = HERE / "slides.html"
OUT = HERE / "out"
WORK = HERE / "work"  # shared by the WSL stages and the Windows recording stage
TTS_CACHE = WORK / "tts"

# spoken forms, so the voice spells acronyms; captions keep the written form
SPOKEN = [
    (r"\bROC-AUC\b", "R.O.C. A.U.C."),
    (r"\bAUC\b", "A.U.C."),
    (r"\bLAD\b", "L.A.D."),
    (r"\bLCX\b", "L.C.X."),
    (r"\bRCA\b", "R.C.A."),
    (r"\bCAD\b", "C.A.D."),
    (r"\bFastAPI\b", "Fast A.P.I."),
    (r"\bAPI\b", "A.P.I."),
    (r"\bSHAP\b", "Shap"),
    (r"\bXGBoost\b", "X.G. Boost"),
    (r"\bECG\b", "E.C.G."),
    (r"\bGPU\b", "G.P.U."),
    (r"\b3D\b", "3-D"),
]


def spoken(text: str) -> str:
    for pat, rep in SPOKEN:
        text = re.sub(pat, rep, text)
    return text


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])", text.strip()) if s.strip()]


# ---------------------------------------------------------------------------- live numbers


def _get(path: str):
    return json.load(urllib.request.urlopen(API + path, timeout=120))


def _post(path: str, body: dict):
    req = urllib.request.Request(
        API + path, json.dumps(body).encode(), {"Content-Type": "application/json"}
    )
    return json.load(urllib.request.urlopen(req, timeout=120))


def pct(p: float) -> str:
    v = p * 100
    if v > 99:
        return "over 99"
    if v < 1:
        return "under 1"
    return str(round(v))


FRIENDLY = {
    "typical_chest_pain": "typical angina",
    "region_rwma": "wall-motion abnormality",
    "ef_tte": "a reduced ejection fraction",
    "st_elevation": "ST elevation",
    "t_inversion": "T-wave inversion",
    "age": "age",
    "dm": "diabetes",
    "htn": "hypertension",
}


def facts() -> dict:
    """Numbers quoted in the narration, read from the same API the dashboard uses."""
    _get("/health")  # wakes the free-tier server
    samples = {s["kind"]: s for s in _get("/patients/sample")}
    f: dict = {}
    for kind, s in samples.items():
        pr = _post("/predict", {"patient": s["patient"]})
        f[kind] = {
            "cad": pct(pr["cad"]["probability"]),
            **{v["vessel_id"]: pct(v["probability"]) for v in pr["vessels"]},
        }
        f[kind]["desc"] = s["description"]
    single = samples["single_vessel"]["patient"]
    ex = _post("/explain", {"patient": single})["explanations"]
    lad = next(e for e in ex if e["target_id"] == "lad")
    ups = sorted((c for c in lad["contributions"] if c["shap"] > 0), key=lambda c: -c["shap"])[:3]
    names = [FRIENDLY.get(c["feature"], re.sub(r"\s*\(.*\)", "", c["label"]).lower()) for c in ups]
    f["lad_top"] = f"{names[0]}, {names[1]} and {names[2]}"
    # what-if: systolic BP +30 mmHg, then diabetes on
    bp_up = {**single, "bp": float(single["bp"]) + 30}
    rca = lambda p: next(
        v for v in _post("/predict", {"patient": p})["vessels"] if v["vessel_id"] == "RCA"
    )["probability"]  # noqa: E731
    f["rca_bp"], f["rca_dm"] = rca(bp_up), rca({**bp_up, "dm": 1})
    return f


# ---------------------------------------------------------------------------- recorder


@dataclass
class Clip:
    start: float  # seconds in the final video
    text: str  # caption text
    audio: Path
    dur: float


@dataclass
class Recorder:
    page: Page
    frame_dir: Path
    frames: list[tuple[float, Path]] = field(default_factory=list)
    clips: list[Clip] = field(default_factory=list)
    chapters: list[tuple[float, str]] = field(default_factory=list)
    t0: float = 0.0
    paused_total: float = 0.0
    paused_at: float | None = None
    n: int = 0

    def now(self) -> float:
        t = time.time()
        if self.paused_at is not None:
            t = self.paused_at
        return t - self.t0 - self.paused_total

    async def start(self):
        self.cdp = await self.page.context.new_cdp_session(self.page)
        self.cdp.on("Page.screencastFrame", self._on_frame)
        self.t0 = time.time()
        await self._screencast()

    async def _screencast(self):
        await self.cdp.send(
            "Page.startScreencast",
            {"format": "jpeg", "quality": 90, "maxWidth": W, "maxHeight": H, "everyNthFrame": 1},
        )

    async def restart(self):
        try:
            await self.cdp.send("Page.stopScreencast")
        except Exception:
            pass
        await self._screencast()

    def _on_frame(self, ev):
        asyncio.ensure_future(
            self.cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
        )
        if self.paused_at is not None:
            return
        ts = ev["metadata"].get("timestamp") or time.time()
        if abs(ts - time.time()) > 1.0:
            ts = time.time()
        vt = ts - self.t0 - self.paused_total
        if self.frames and vt - self.frames[-1][0] < 1 / 30:
            self.frames[-1][1].write_bytes(base64.b64decode(ev["data"]))
            return
        self.n += 1
        p = self.frame_dir / f"f{self.n:06d}.jpg"
        p.write_bytes(base64.b64decode(ev["data"]))
        self.frames.append((vt, p))

    def pause(self):
        if self.paused_at is None:
            self.paused_at = time.time()

    def resume(self):
        if self.paused_at is not None:
            self.paused_total += time.time() - self.paused_at
            self.paused_at = None


# ---------------------------------------------------------------------------- page helpers

INIT_JS = r"""
(() => {
  if (window.__demo) return; window.__demo = 1;
  const add = () => {
    const fade = document.createElement('div');
    fade.id = '__fade';
    fade.style.cssText = 'position:fixed;inset:0;background:#0d0a16;z-index:2147483646;pointer-events:none;opacity:1;transition:opacity .6s ease';
    document.documentElement.appendChild(fade);
    window.__fadeIn = () => { fade.style.opacity = '0'; };
    window.__fadeOut = () => { fade.style.opacity = '1'; };
    if (location.protocol === 'file:') return;
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px);filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))';
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5l15.5 9.2-6.7 1.5 3.9 6.9-2.8 1.6-3.9-6.9-5 4.6z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', e => { c.style.transform = `translate(${e.clientX - 4}px, ${e.clientY - 2}px)`; }, true);
    addEventListener('mousedown', e => {
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;border-radius:50%;border:3px solid rgba(196,181,253,.95);z-index:2147483646;pointer-events:none;transition:transform .45s ease,opacity .45s ease`;
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.7)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 500);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
"""

SCROLL_JS = """async ([sel, y, dur]) => {
  const el = sel ? document.querySelector(sel) : null;
  const get = () => el ? el.scrollTop : scrollY;
  const set = (v) => el ? (el.scrollTop = v) : scrollTo(0, v);
  const s = get(), t0 = performance.now();
  await new Promise(r => { const f = (now) => { const t = Math.min(1, (now - t0) / dur);
    const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; set(s + (y - s) * e); t < 1 ? requestAnimationFrame(f) : r(); };
    requestAnimationFrame(f); });
}"""


class Demo:
    def __init__(self, page: Page, rec: Recorder, tts: dict[str, tuple[Path, float]]):
        self.pg, self.rec, self.tts = page, rec, tts
        self.mouse = (W * 0.6, H * 0.55)

    # --- narration
    async def say(self, text: str, action=None, after: float = BEAT_PAD):
        start = self.rec.now()
        t = start
        for s in sentences(text):
            path, dur = self.tts[s]
            self.rec.clips.append(Clip(t, s, path, dur))
            t += dur + SENTENCE_GAP
        task = asyncio.ensure_future(action()) if action else None
        await asyncio.sleep(max(0.0, t - start - SENTENCE_GAP))
        if task:
            await task
        await asyncio.sleep(after)

    # --- mouse
    async def glide(self, x: float, y: float, dur: float = 0.8):
        x0, y0 = self.mouse
        n = max(10, int(dur * 45))
        for i in range(1, n + 1):
            t = i / n
            e = t * t * (3 - 2 * t)
            await self.pg.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
            await asyncio.sleep(dur / n * 0.75)
        self.mouse = (x, y)

    async def center(self, loc, dx: float = 0.0, dy: float = 0.0):
        b = await loc.first.bounding_box()
        return b["x"] + b["width"] / 2 + dx, b["y"] + b["height"] / 2 + dy

    async def point(self, loc, dur: float = 0.8, dx: float = 0.0, dy: float = 0.0):
        await self.glide(*(await self.center(loc, dx, dy)), dur=dur)

    async def click(self, loc, dur: float = 0.8):
        await loc.first.scroll_into_view_if_needed()
        await self.point(loc, dur)
        await asyncio.sleep(0.18)
        await self.pg.mouse.down()
        await asyncio.sleep(0.08)
        await self.pg.mouse.up()

    async def drag(self, path: list[tuple[float, float]], dur: float):
        await self.glide(*path[0], dur=0.6)
        await self.pg.mouse.down()
        for x, y in path[1:]:
            await self.glide(x, y, dur=dur / (len(path) - 1))
        await self.pg.mouse.up()

    async def scroll(self, y: float, dur: float = 1500, sel: str | None = None):
        await self.pg.evaluate(SCROLL_JS, [sel, y, dur])

    async def scroll_to_text(self, text: str, offset: int = 140, dur: float = 1600):
        y = await self.pg.evaluate(
            """([t, o]) => { const el = [...document.querySelectorAll('h1,h2,h3,p,div,span')].find(e => e.children.length === 0 && e.textContent.includes(t));
            return el ? el.getBoundingClientRect().top + scrollY - o : scrollY; }""",
            [text, offset],
        )
        await self.scroll(y, dur)

    # --- page transitions (loading time is cut from the video)
    async def goto(self, url: str, ready=None, settle: float = 1.0):
        try:
            await self.pg.evaluate("window.__fadeOut && window.__fadeOut()")
            await asyncio.sleep(0.65)
        except Exception:
            pass
        self.rec.pause()
        await self.pg.goto(url, wait_until="networkidle")
        if ready:
            await ready()
        await self.pg.evaluate("document.fonts.ready")
        await asyncio.sleep(settle)
        await self.pg.mouse.move(*self.mouse)
        await self.rec.restart()
        await asyncio.sleep(0.3)
        self.rec.resume()
        await self.pg.evaluate("window.__fadeIn()")
        await asyncio.sleep(0.6)

    async def slide(self, sid: str):
        await self.goto(f"{SLIDES.as_uri()}?s={sid}", settle=0.4)

    async def step(self, n: int):
        await self.pg.evaluate(f"window.step({n})")

    def chapter(self, title: str):
        self.rec.chapters.append((self.rec.now(), title))


# ---------------------------------------------------------------------------- the script


def script(f: dict):
    """Ordered scenes: (id, chapter title, async fn(demo)). Narration is written inline."""
    S, M = f["single_vessel"], f["multi_vessel"]
    rca_dm = (
        f"Adding diabetes moves the RCA from {pct(f['rca_bp'])} to {pct(f['rca_dm'])} percent: diabetes is one of the strongest RCA factors in our data."
        if f["rca_dm"] > f["rca_bp"] + 0.02
        else "Adding diabetes updates every probability the same way."
    )

    async def title(d: Demo):
        await d.slide("title")
        await d.say("This is CardioScope, our entry for Track A of the Multimodal AI Hackathon 2026.", lambda: d.step(2))
        await d.say(
            "It predicts coronary artery disease from routine clinical data, shows each coronary artery's risk on an interactive 3D heart, and explains why.",
            lambda: d.step(5),
        )

    async def problem(d: Demo):
        await d.slide("problem")
        await d.step(2)
        await d.say(
            "Coronary artery disease is a narrowing of the arteries that feed the heart muscle, mainly the LAD, the LCX and the RCA.",
            lambda: d.step(3),
        )
        await d.say(
            "A risk percentage alone does not show where the problem may be, or why. So we predict overall CAD and each vessel, map them onto 3D anatomy, and explain every result.",
            lambda: d.step(4),
        )
        await d.say(
            "We use the extended Z-Alizadeh Sani dataset: 303 patients with 54 clinical features, from history and examination to ECG, labs and echo.",
            lambda: d.step(5),
        )

    async def landing(d: Demo):
        await d.goto(APP + "/", settle=2.0)
        await d.say("Here is the web app.", lambda: d.glide(960, 560, 1.0))
        await d.say(
            "The landing page walks from bedside data to a vessel-level picture,",
            lambda: d.scroll_to_text("From bedside data", 120, 2400),
        )
        await d.say(
            "shows our cross-validated results,",
            lambda: d.scroll_to_text("Repeated nested cross-validation", 330, 1800),
        )
        await d.say(
            "and states plainly what the tool is not.",
            lambda: d.scroll_to_text("Clear about what it is", 160, 1800),
        )

        async def open_app():
            await d.scroll(0, 1200)
            await asyncio.sleep(0.2)
            await d.click(d.pg.get_by_role("link", name="Open the app").first)
            await d.pg.wait_for_selector('[data-vessel-label="LAD"]', timeout=90000)

        await d.say("Let's open the dashboard.", open_app, after=1.2)

    async def overview(d: Demo):
        pg = d.pg
        await d.say(
            "On the left is the patient's data, in the centre a 3D torso and heart, and on the right the predictions and their explanation.",
            lambda: _tour(d),
        )
        await d.say(
            "The clinical disclaimer is always visible: this is decision support, not a substitute for diagnostic imaging.",
            lambda: d.glide(700, 72, 1.0),
        )
        await d.say(
            f"This is a real patient from the dataset: {S['desc'].split('.')[0].lower()}, with LAD stenosis.",
            lambda: d.point(pg.get_by_text("Example #", exact=False).nth(1)),
        )
        await d.say(
            f"CAD probability is {S['cad']} percent. The LAD is at {S['LAD']} percent, the LCX and RCA at {S['LCX']} and {S['RCA']}. Colours follow the legend, from green through amber to red.",
            lambda: _point_results(d),
        )

    async def viewer(d: Demo):
        pg = d.pg
        canvas = pg.locator("canvas").first
        cx, cy = await d.center(canvas)

        async def rotate_zoom():
            await d.drag([(cx - 60, cy + 40), (cx + 260, cy + 10), (cx - 140, cy - 10), (cx + 40, cy + 30)], 3.0)
            for _ in range(5):
                await pg.mouse.wheel(0, -160)
                await asyncio.sleep(0.12)
            await asyncio.sleep(0.5)
            for _ in range(5):
                await pg.mouse.wheel(0, 160)
                await asyncio.sleep(0.12)
            await d.click(pg.get_by_role("button", name="Reset 3D view"))

        await d.say("Drag to rotate, scroll to zoom, and reset at any time.", rotate_zoom)

        async def focus_lad():
            await d.point(pg.locator('[data-vessel-label="LAD"]'), 1.0)
            await asyncio.sleep(0.6)
            await d.click(pg.locator('[data-vessel-label="LAD"]'), 0.3)

        await d.say("Clicking a vessel flies the camera to it and opens its detail card.", focus_lad)

        async def card():
            await d.point(pg.get_by_text("Selected vessel", exact=False).first, 0.8, dx=40)
            await asyncio.sleep(0.9)
            await d.point(pg.get_by_text("Main factors raising risk"), 0.8)
            await asyncio.sleep(1.4)
            await d.point(pg.get_by_text("Supplies:", exact=False), 0.8)

        await d.say(
            "It shows the probability and threshold, the factors that raised and lowered this patient's risk, and the heart muscle the artery supplies.",
            card,
        )

        async def territories():
            btn = pg.get_by_role("button", name=re.compile("supply territories"))
            await d.click(btn)
            await asyncio.sleep(1.4)
            await d.click(btn, 0.3)

        await d.say("Those supply territories are shaded on the heart, and can be toggled.", territories)
        await d.say(
            "Selecting a vessel in the results panel works too. Here is the RCA.",
            lambda: d.click(pg.get_by_role("button", name=re.compile(r"^RCA"))),
            after=1.0,
        )

        async def reset():
            await d.click(pg.get_by_role("button", name="Reset 3D view"))
            await asyncio.sleep(0.8)
            await d.glide(cx + 120, cy + 60, 1.0)

        await d.say(
            "Because we predict each vessel's status, not a lesion's position, every artery takes a single colour. We never suggest where inside a vessel a narrowing sits.",
            reset,
        )

    async def inputs(d: Demo):
        pg = d.pg
        await d.say(
            "One click loads a real example. A patient with normal coronaries: every vessel turns green.",
            lambda: d.click(pg.get_by_role("button", name="Normal coronaries")),
            after=0.6,
        )
        await d.say(
            f"Three-vessel disease: the LAD at {M['LAD']}, the LCX at {M['LCX']}, and the RCA at {M['RCA']} percent.",
            lambda: d.click(pg.get_by_role("button", name="Multi-vessel")),
            after=0.6,
        )

        async def browse():
            await d.glide(200, 640, 0.8)
            sel = await pg.evaluate(
                """() => { const a = document.querySelector('aside[aria-label="Patient data"]');
                const el = [...a.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
                if (!el) return null; el.id = el.id || '__formscroll'; return '#' + el.id; }"""
            )
            if sel:
                await d.scroll(2600, 3600, sel)
                await asyncio.sleep(0.3)
                await d.scroll(0, 1400, sel)

        await d.say(
            "Every value is editable. The form is generated from our feature config, grouped from demographics to echo, with units and help text.",
            browse,
        )

        async def search():
            await d.click(pg.locator('input[aria-label="Search measurements"]'))
            await pg.keyboard.type("chest pain", delay=80)

        await d.say("Search finds any measurement.", search)
        await d.say(
            "If we change typical angina to no,",
            lambda: d.click(pg.get_by_role("radiogroup", name="Typical chest pain (angina)").get_by_text("No", exact=True)),
            after=0.2,
        )

        async def status():
            await d.point(pg.get_by_text("Up to date", exact=False), 1.0)
            await asyncio.sleep(1.2)
            await d.click(pg.get_by_role("button", name="Clear search"))

        await d.say(
            "predictions, explanations and 3D colours update in about a second, each a real call to the model.",
            status,
        )

    async def explain(d: Demo):
        pg = d.pg

        async def to_single():
            await d.click(pg.get_by_role("button", name=re.compile(r"Single-vessel")))
            await asyncio.sleep(1.0)
            await pg.evaluate(
                """() => { const a = document.querySelector('aside[aria-label="Results"]'); const c = document.getElementById('explanation-card');
                a.id = a.id || '__results'; window.__expY = c.getBoundingClientRect().top - a.getBoundingClientRect().top + a.scrollTop - 12; }"""
            )
            await d.scroll(await pg.evaluate("window.__expY"), 1200, "#__results")
            await d.click(pg.get_by_text("Why?", exact=True).first)

        await d.say("Why did the model decide this? The 'Why?' tab shows a SHAP waterfall.", to_single)
        await d.say(
            "It starts from the average patient and adds each factor's push, largest first, ending exactly at this patient's probability.",
            lambda: _waterfall_tour(d),
        )

        async def pick_lad():
            await d.click(pg.locator("#explanation-card").get_by_role("combobox").first)
            await asyncio.sleep(0.5)
            await d.click(pg.get_by_role("option", name="LAD stenosis"), 0.6)
            await asyncio.sleep(0.6)
            await _waterfall_tour(d)

        await d.say(f"Switch to the LAD, and the biggest pushes are {f['lad_top']}.", pick_lad)

        async def physiology():
            await d.click(pg.get_by_text("Physiology", exact=True).first)
            await asyncio.sleep(0.6)
            b = await pg.locator("#explanation-card").bounding_box()
            for k in (0.42, 0.55, 0.68, 0.8):
                await d.glide(b["x"] + b["width"] * 0.35, b["y"] + b["height"] * k, 0.6)
                await asyncio.sleep(0.4)

        await d.say(
            "The Physiology tab puts every measurement next to its normal range and its contribution, so abnormal findings and real drivers stand out.",
            physiology,
        )

    async def whatif(d: Demo):
        pg = d.pg

        async def bp():
            await d.click(pg.get_by_text("What-if", exact=True).first)
            await asyncio.sleep(0.6)
            await d.click(pg.locator('[aria-label="What-if: Blood pressure (systolic)"] [role="slider"]'), 0.8)
            for _ in range(30):
                await pg.keyboard.press("ArrowRight")
                await asyncio.sleep(0.06)

        await d.say(
            "What-if turns modifiable risk factors into sliders. Raise systolic pressure, and every chart and colour follows.",
            bp,
        )
        dm = pg.get_by_role("radiogroup", name="What-if: Diabetes mellitus")
        await d.say(rca_dm, lambda: d.click(dm.get_by_text("Yes", exact=True)), after=0.6)
        await d.say(
            "One click resets to the baseline.",
            lambda: d.click(pg.get_by_role("button", name=re.compile(r"^Reset \(\d+\)$"))),
        )

    async def api(d: Demo):
        await d.goto(API + "/docs", ready=lambda: d.pg.wait_for_selector("text=/predict", timeout=60000), settle=1.0)
        pg = d.pg

        async def tour():
            for path in ("/schema", "/predict", "/explain", "/patients/sample"):
                await d.point(pg.get_by_text(path, exact=True).first, 0.8)
                await asyncio.sleep(0.7)

        await d.say(
            "Behind it is a FastAPI service: schema builds the form, predict returns the probabilities, explain the SHAP values, and sample the example patients.",
            tour,
        )

    def slide_scene(sid: str, beats: list[tuple[str, int]], first: int = 2):
        async def run(d: Demo):
            await d.slide(sid)
            await d.step(first)
            for text, n in beats:
                await d.say(text, (lambda n=n: d.step(n)))

        return run

    arch = slide_scene(
        "arch",
        [
            ("Under the hood is one config-driven pipeline. A features file defines every input: type, unit, normal range and group.", 3),
            ("Python trains and validates every model in one command. FastAPI serves them, with an input model generated from the same config.", 5),
            ("The React front end builds its form from the API, and draws the heart with React Three Fiber.", 6),
            (
                "A shared vessel registry links model targets, API and 3D meshes, so the LAD you see is always the LAD the model scored. New features, models or vessels are config changes, not a redesign.",
                8,
            ),
        ],
    )
    method = slide_scene(
        "method",
        [
            ("For prediction, our priority was honest validation. The vessel and CAD labels are never inputs, and tests enforce it.", 3),
            ("We use repeated stratified five-fold cross-validation, tune in an inner loop, and refit all preprocessing inside every fold.", 4),
            (
                "Per target we compare logistic regression, random forest, XGBoost and CatBoost. A classifier chain gave no significant gain, so vessels use independent models.",
                5,
            ),
            ("Probabilities are Platt-calibrated, and thresholds favour sensitivity, because missed disease is the costlier error.", 6),
        ],
    )
    results = slide_scene(
        "results",
        [
            ("Results, with bootstrap 95 percent confidence intervals.", 2),
            ("Overall CAD reaches a ROC-AUC of 0.93 with 89 percent recall, and the LAD 0.84.", 3),
            ("The LCX and RCA are moderate, about 0.73: routine data carries less signal about them, and we say so.", 4),
        ],
    )
    curves = slide_scene(
        "curves",
        [
            ("After calibration, a predicted seventy percent means about seventy percent of similar patients had disease.", 4),
            ("And decision curves show each model beats treating everyone or no one, across plausible referral thresholds.", 6),
        ],
    )
    baseline = slide_scene(
        "baseline",
        [
            ("Against a ten-item bedside baseline, the full data clearly helps for the LAD, through wall motion and ejection fraction.", 4),
            ("For CAD the gain is small, and for the LCX and RCA there is none. A clinician should know that.", 6),
        ],
    )
    anatomy = slide_scene(
        "anatomy",
        [
            ("The 3D heart comes from open-licence anatomy, with its coronary tree split into separate LAD, LCX and RCA meshes.", 3),
            ("Reduced from 2.7 million to about 125 thousand triangles and compressed, it renders on demand and stays smooth without a dedicated GPU.", 5),
            ("And the mapping stays honest: one colour per vessel.", 6),
        ],
    )
    engineering = slide_scene(
        "engineering",
        [
            ("One command retrains every model, metric and figure with fixed seeds, and reproduces them exactly.", 3),
            ("Tests cover the data, leakage, SHAP additivity, every API endpoint and the 3D vessel mapping. SHAP values are exact, not approximated.", 5),
            ("And from the form to the 3D scene, everything is driven by config.", 6),
        ],
    )
    closing = slide_scene(
        "closing",
        [
            (
                "The limits: 303 patients from one centre, no external validation, and per-vessel status, not lesion location. CardioScope supports decisions; it does not replace angiography.",
                2,
            ),
            ("Thank you for watching. Try it at the link on screen; the code is on GitHub.", 4),
        ],
        first=1,
    )

    return [
        ("title", "Introduction", title),
        ("problem", "The problem and the data", problem),
        ("landing", "Live app", landing),
        ("overview", "Clinical dashboard", overview),
        ("3d", "3D heart interaction", viewer),
        ("inputs", "Patient input workflow", inputs),
        ("explain", "SHAP and physiology explanations", explain),
        ("whatif", "What-if analysis", whatif),
        ("api", "Backend API", api),
        ("arch", "Architecture", arch),
        ("method", "Validation method", method),
        ("results", "Results", results),
        ("curves", "Calibration and decision curves", curves),
        ("baseline", "Bedside baseline comparison", baseline),
        ("anatomy", "3D pipeline", anatomy),
        ("engineering", "Reproducibility and tests", engineering),
        ("closing", "Limitations and links", closing),
    ]


async def _tour(d: Demo):
    await d.glide(200, 520, 1.0)
    await asyncio.sleep(1.4)
    await d.glide(930, 560, 1.0)
    await asyncio.sleep(1.6)
    await d.glide(1690, 420, 1.0)


async def _point_results(d: Demo):
    pg = d.pg
    await d.point(pg.get_by_text("Overall coronary artery disease").first, 0.9, dy=120)
    await asyncio.sleep(2.2)
    for v in ("LAD", "LCX", "RCA"):
        await d.point(pg.get_by_role("button", name=re.compile(rf"^{v}")), 0.7)
        await asyncio.sleep(1.1)


async def _waterfall_tour(d: Demo):
    wf = d.pg.get_by_role("img", name=re.compile("SHAP waterfall")).first
    b = await wf.bounding_box()
    if not b:
        return
    for k in (0.15, 0.35, 0.55):
        await d.glide(b["x"] + b["width"] * 0.6, b["y"] + b["height"] * k, 0.7)
        await asyncio.sleep(0.6)


# ---------------------------------------------------------------------------- build


async def synth(texts: list[str]) -> dict[str, tuple[Path, float]]:
    import edge_tts

    TTS_CACHE.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(6)
    out: dict[str, tuple[Path, float]] = {}

    async def one(s: str):
        key = hashlib.sha1(f"{VOICE}|{RATE}|{spoken(s)}".encode()).hexdigest()[:16]
        p = TTS_CACHE / f"{key}.mp3"
        if not p.exists():
            async with sem:
                for attempt in range(4):
                    try:
                        await edge_tts.Communicate(spoken(s), VOICE, rate=RATE).save(str(p))
                        break
                    except Exception:
                        if attempt == 3:
                            raise
                        await asyncio.sleep(2)
        dur = float(
            subprocess.check_output(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "csv=p=0",
                    str(p),
                ]
            )
        )
        out[s] = (p, dur)

    await asyncio.gather(*(one(s) for s in dict.fromkeys(texts)))
    return out


async def collect_texts(scenes) -> list[str]:
    """Run the scenes against a stub that only records the narration sentences."""
    texts: list[str] = []
    stub = _Stub(texts)
    for _, _, fn in scenes:
        await fn(stub)
    return texts


class _Any:
    """Absorbs any attribute access / call (stands in for Page and locators in the dry run)."""

    def __getattr__(self, _):
        return self

    def __call__(self, *a, **k):
        return self

    def __await__(self):
        if False:
            yield
        return {"x": 0, "y": 0, "width": 1, "height": 1}


class _Stub:
    def __init__(self, texts):
        self.texts = texts
        self.pg = _Any()

    async def say(self, text, action=None, after=0):
        self.texts.extend(sentences(text))

    async def center(self, *a, **k):
        return (0, 0)

    def __getattr__(self, _):
        async def noop(*a, **k):
            return None

        return noop


def write_audio(clips: list[Clip], total: float, path: Path):
    import numpy as np

    buf = np.zeros(int((total + 1) * SR), dtype=np.float32)
    for c in clips:
        pcm = subprocess.check_output(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(c.audio),
                "-f",
                "s16le",
                "-ac",
                "1",
                "-ar",
                str(SR),
                "-",
            ]
        )
        a = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768
        i = int(c.start * SR)
        buf[i : i + len(a)] += a[: len(buf) - i]
    peak = float(np.abs(buf).max()) or 1.0
    buf = buf / peak * 0.89
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "f32le",
            "-ac",
            "1",
            "-ar",
            str(SR),
            "-i",
            "-",
            str(path),
        ],
        input=buf.tobytes(),
        check=True,
    )


def ts(t: float, sep=",") -> str:
    h, rem = divmod(max(t, 0), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}".replace(".", sep)


def wrap(text: str, width: int = 62) -> str:
    words, lines, cur = text.split(), [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    lines.append(cur)
    if len(lines) <= 2:
        return "\n".join(lines)
    half = len(words) // 2  # long sentence: two balanced lines
    return " ".join(words[:half]) + "\n" + " ".join(words[half:])


def write_srt(clips: list[Clip], path: Path):
    rows = [
        f"{i}\n{ts(c.start)} --> {ts(c.start + c.dur)}\n{wrap(c.text)}\n"
        for i, c in enumerate(clips, 1)
    ]
    path.write_text("\n".join(rows), encoding="utf-8")


async def record(scenes, tts, frame_dir: Path) -> dict:
    """Drive the app and slides while recording; returns the timeline for the encode stage."""
    on_windows = sys.platform == "win32"
    async with async_playwright() as p:
        # Windows: installed Edge renders WebGL on the GPU (smooth 3D). Linux: software WebGL.
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
        ctx = await browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        await ctx.add_init_script(INIT_JS)
        page = await ctx.new_page()
        rec = Recorder(page, frame_dir)
        rec.pause()
        await rec.start()
        d = Demo(page, rec, tts)
        for sid, title, fn in scenes:
            print(f"  scene {sid} at {rec.now():6.1f}s", flush=True)
            d.chapter(title)
            # dashboard scenes normally follow "landing"; rendering one on its own needs a page load
            if sid in ("overview", "3d", "inputs", "explain", "whatif") and "/app" not in page.url:
                await d.goto(
                    APP + "/app?sample=single_vessel",
                    ready=lambda: page.wait_for_selector(
                        '[data-vessel-label="LAD"]', timeout=90000
                    ),
                    settle=2.5,
                )
            await fn(d)
        await d.pg.evaluate("window.__fadeOut && window.__fadeOut()")
        await asyncio.sleep(1.2)
        total = rec.now()
        await browser.close()
    print(f"recorded {len(rec.frames)} frames, {total:.1f}s")
    return {
        "total": total,
        "frames": [[t, p.name] for t, p in rec.frames],
        "clips": [[c.start, c.text, c.audio.name, c.dur] for c in rec.clips],
        "chapters": rec.chapters,
    }


def encode(timeline: dict, name: str):
    total = timeline["total"]
    frame_dir = WORK / "frames"
    frames = [(t, frame_dir / n) for t, n in timeline["frames"]]
    clips = [Clip(st, text, TTS_CACHE / a, dur) for st, text, a, dur in timeline["clips"]]
    lines = ["ffconcat version 1.0"]
    if frames[0][0] > 0:
        frames = [(0.0, frames[0][1])] + frames
    for (t, pth), nxt in zip(frames, frames[1:] + [(total, None)]):
        lines += [f"file '{pth}'", f"duration {max(nxt[0] - t, 0.001):.4f}"]
    lines.append(f"file '{frames[-1][1]}'")
    concat = WORK / "frames.ffconcat"
    concat.write_text("\n".join(lines))
    wav = WORK / "narration.wav"
    write_audio(clips, total, wav)

    OUT.mkdir(exist_ok=True)
    mp4 = OUT / f"{name}.mp4"
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-i", str(wav),
            "-vf", f"fps=30,scale={W}:{H}:flags=lanczos,format=yuv420p,fade=t=in:st=0:d=0.6",
            "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-tune", "animation",
            "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", "-movflags", "+faststart", str(mp4),
        ],
        check=True,
    )  # fmt: skip
    write_srt(clips, OUT / f"{name}.srt")
    chapters = "\n".join(f"{ts(t, '.')[3:8]} {title}" for t, title in timeline["chapters"])
    (OUT / f"{name}_chapters.txt").write_text(chapters + "\n", encoding="utf-8")
    print(f"done: {mp4} ({total / 60:.1f} min)\n{chapters}")


async def main():
    global APP, API
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "stage",
        choices=["prep", "record", "encode", "all"],
        help="prep (Linux): live numbers + speech; record (Windows for GPU, or Linux); encode (Linux); all = Linux only",
    )
    ap.add_argument("--only", help="comma-separated scene ids")
    ap.add_argument("--name", default="cardioscope_demo")
    ap.add_argument("--app", default=APP, help="frontend URL")
    ap.add_argument("--api", default=API, help="API URL (must be the one the frontend calls)")
    args = ap.parse_args()
    APP, API = args.app.rstrip("/"), args.api.rstrip("/")
    WORK.mkdir(exist_ok=True)
    plan_path, timeline_path = WORK / "plan.json", WORK / f"{args.name}_timeline.json"

    if args.stage in ("prep", "all"):
        print("fetching live numbers from the API ...")
        f = facts()
        texts = await collect_texts(script(f))
        print(f"synthesising {len(texts)} sentences ...")
        tts = await synth(texts)
        print(f"narration: {sum(d for _, d in tts.values()) / 60:.1f} min")
        plan = {"facts": f, "tts": {s: [p.name, d] for s, (p, d) in tts.items()}}
        plan_path.write_text(json.dumps(plan, indent=1), encoding="utf-8")

    if args.stage in ("record", "all"):
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        tts = {s: (TTS_CACHE / n, d) for s, (n, d) in plan["tts"].items()}
        scenes = script(plan["facts"])
        if args.only:
            keep = set(args.only.split(","))
            scenes = [s for s in scenes if s[0] in keep]
        frame_dir = WORK / "frames"
        shutil.rmtree(frame_dir, ignore_errors=True)
        frame_dir.mkdir(parents=True)
        timeline = await record(scenes, tts, frame_dir)
        timeline_path.write_text(json.dumps(timeline), encoding="utf-8")

    if args.stage in ("encode", "all"):
        encode(json.loads(timeline_path.read_text(encoding="utf-8")), args.name)


if __name__ == "__main__":
    asyncio.run(main())
