"""Assemble a self-contained Hugging Face Space (Docker SDK) for the CardioScope API.

    python deploy/build_hf_space.py [--out deploy/hf-space] [--frontend-url https://cardioscope.vercel.app]

The output folder holds only what the API needs at runtime (code, configs, shared vessel IDs,
trained models, cleaned data). Upload its contents to a new Docker Space, or push it with git.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

COPY = [
    "requirements-api.txt",
    "ml/cardioscope_ml",
    "ml/configs",
    "backend/app",
    "shared",
    "data/processed",
]
MODEL_FILES = ["cad.joblib", "lad.joblib", "lcx.joblib", "rca.joblib", "metrics.json"]

SPACE_README = """---
title: CardioScope API
emoji: 🫀
colorFrom: red
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
short_description: CAD and LAD/LCX/RCA stenosis prediction with SHAP
---

# CardioScope API

FastAPI backend of CardioScope (Multimodal AI Hackathon 2026, Track A). Interactive docs: `/docs`.
Endpoints: `GET /health`, `GET /schema`, `POST /predict`, `POST /explain`, `GET /patients/sample`.

**For decision support and educational purposes only. Not a substitute for formal diagnostic imaging.**

Configuration (Space settings → Variables):
- `CARDIOSCOPE_CORS_ORIGINS`: comma-separated frontend URLs, e.g. `{frontend}`
- `CARDIOSCOPE_CORS_ORIGIN_REGEX` (optional): e.g. `https://cardioscope(-[a-z0-9-]+)?\\.vercel\\.app` for Vercel previews
"""


def ignore(_dir: str, names: list[str]) -> set[str]:
    return {n for n in names if n in {"__pycache__", ".pytest_cache"} or n.endswith(".pyc")}


def build(out: Path, frontend_url: str) -> Path:
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for rel in COPY:
        src, dst = ROOT / rel, out / rel
        if src.is_dir():
            shutil.copytree(src, dst, ignore=ignore)
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
    (out / "models").mkdir()
    for name in MODEL_FILES:
        src = ROOT / "models" / name
        if not src.exists():
            raise SystemExit(f"Missing {src}. Train first: python -m cardioscope_ml.train")
        shutil.copy2(src, out / "models" / name)
    shutil.copy2(ROOT / "deploy" / "Dockerfile", out / "Dockerfile")
    (out / "README.md").write_text(SPACE_README.format(frontend=frontend_url), encoding="utf-8")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"Space folder ready: {out}  ({size / 1e6:.1f} MB, {sum(1 for f in out.rglob('*') if f.is_file())} files)")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=ROOT / "deploy" / "hf-space")
    ap.add_argument("--frontend-url", default="https://<your-app>.vercel.app")
    args = ap.parse_args()
    build(args.out, args.frontend_url)
