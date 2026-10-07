"""Features that are exact functions of other inputs (verified on the dataset in Phase 1).

`features.yaml` marks them with `derived: <name>`; the API computes them from the other
inputs instead of accepting them, so a user can never submit e.g. a BMI that contradicts
the entered weight and height. Order matters: later derivations may use earlier ones.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from cardioscope_ml.config import feature_specs

Record = dict[str, Any]

DERIVATIONS: dict[str, Callable[[Record], Any]] = {
    # BMI = weight (kg) / height (m)^2
    "bmi": lambda r: r["weight"] / (r["height"] / 100.0) ** 2,
    # The dataset's "Obesity" flag is exactly BMI >= 25 (overweight threshold)
    "overweight_flag": lambda r: int(r["bmi"] >= 25.0 - 1e-9),
}


def derived_features() -> dict[str, str]:
    """feature id -> derivation name, in config order."""
    return {f["id"]: f["derived"] for f in feature_specs() if f.get("derived")}


def apply_derivations(record: Record) -> Record:
    """Return a copy of `record` with every derived feature (re)computed."""
    out = dict(record)
    for fid, name in derived_features().items():
        out[fid] = DERIVATIONS[name](out)
    return out
