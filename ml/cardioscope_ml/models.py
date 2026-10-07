"""Build model pipelines and search spaces from ml/configs/models.yaml."""

from __future__ import annotations

from typing import Any

from catboost import CatBoostClassifier
from scipy.stats import loguniform, randint, uniform
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier

from cardioscope_ml.config import load_models
from cardioscope_ml.features import build_preprocessor

ESTIMATORS = {
    "logistic_regression": LogisticRegression,
    "xgboost": XGBClassifier,
    "catboost": CatBoostClassifier,
}
SEED_PARAM = {"catboost": "random_seed"}  # every other class uses `random_state`


def model_spec(family: str) -> dict[str, Any]:
    return load_models()["models"][family]


def model_families() -> list[str]:
    return list(load_models()["models"])


def make_estimator(family: str, seed: int):
    spec = model_spec(family)
    cls = spec["class"]
    params = dict(spec.get("params") or {})
    params[SEED_PARAM.get(cls, "random_state")] = seed
    return ESTIMATORS[cls](**params)


def build_pipeline(family: str, seed: int, extra_numeric: tuple[str, ...] = ()) -> Pipeline:
    spec = model_spec(family)
    return Pipeline(
        [
            (
                "prep",
                build_preprocessor(scale=spec.get("scale", False), extra_numeric=extra_numeric),
            ),
            ("clf", make_estimator(family, seed)),
        ]
    )


def _distribution(v: Any):
    if isinstance(v, list):
        return v
    if isinstance(v, dict):
        lo, hi = v["low"], v["high"]
        if v["dist"] == "loguniform":
            return loguniform(lo, hi)
        if v["dist"] == "uniform":
            return uniform(lo, hi - lo)
        if v["dist"] == "randint":
            return randint(lo, hi + 1)
        raise ValueError(f"Unknown distribution {v['dist']!r}")
    return [v]


def param_distributions(family: str) -> dict[str, Any]:
    """Search space with keys prefixed for the pipeline's `clf` step."""
    return {f"clf__{k}": _distribution(v) for k, v in model_spec(family)["search"].items()}
