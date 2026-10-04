"""Runtime settings (environment variables, with defaults for local development)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from cardioscope_ml.config import MODELS_DIR


def _origins() -> list[str]:
    raw = os.getenv("CARDIOSCOPE_CORS_ORIGINS", "http://localhost:5173,http://localhost:4173")
    return [o.strip() for o in raw.split(",") if o.strip()]


@dataclass(frozen=True)
class Settings:
    models_dir: Path = field(default_factory=lambda: Path(os.getenv("CARDIOSCOPE_MODELS_DIR", str(MODELS_DIR))))
    cors_origins: list[str] = field(default_factory=_origins)
    # optional regex for extra origins, e.g. Vercel previews: https://cardioscope(-[a-z0-9-]+)?.vercel.app
    cors_origin_regex: str | None = field(default_factory=lambda: os.getenv("CARDIOSCOPE_CORS_ORIGIN_REGEX") or None)


DISCLAIMER = (
    "For decision support and educational purposes only. Predictions are not a diagnosis and are "
    "not a substitute for formal diagnostic imaging (e.g. coronary angiography). Vessel outputs are "
    "per-vessel stenosis probabilities, not lesion locations."
)
