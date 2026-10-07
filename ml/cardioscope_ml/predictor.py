"""The saved per-target model bundle used by training, tests and the backend."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from cardioscope_ml.calibration import PlattCalibrator
from cardioscope_ml.config import MODELS_DIR, assert_no_leakage
from cardioscope_ml.explain import Explanation, NativeShapExplainer


@dataclass
class CardioModel:
    target_id: str
    family: str
    feature_ids: list[str]
    pipeline: Any
    calibrator: PlattCalibrator
    threshold: float
    best_params: dict[str, Any]
    explainer: NativeShapExplainer
    meta: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        assert_no_leakage(self.feature_ids)

    def _frame(self, X: pd.DataFrame) -> pd.DataFrame:
        missing = [f for f in self.feature_ids if f not in X]
        if missing:
            raise KeyError(f"Missing input features: {missing}")
        return X[self.feature_ids]

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Calibrated probability of the positive class (disease / stenosis)."""
        raw = self.pipeline.predict_proba(self._frame(X))[:, 1]
        return self.calibrator.transform(raw)

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return (self.predict_proba(X) >= self.threshold).astype(int)

    def explain(self, X: pd.DataFrame) -> Explanation:
        return self.explainer.explain(self._frame(X))

    def save(self, directory: Path = MODELS_DIR) -> Path:
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{self.target_id}.joblib"
        joblib.dump(self, path, compress=3)
        return path


def load_model(target_id: str, directory: Path = MODELS_DIR) -> CardioModel:
    return joblib.load(directory / f"{target_id}.joblib")
