"""Probability calibration (Platt scaling) and recall-oriented decision thresholds."""

from __future__ import annotations

import math

import numpy as np
from scipy.special import expit

EPS = 1e-6


def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(np.asarray(p, dtype=float), EPS, 1 - EPS)
    return np.log(p / (1 - p))


def sigmoid(z: np.ndarray) -> np.ndarray:
    return expit(np.asarray(z, dtype=float))


class PlattCalibrator:
    """Calibrated log-odds = a * logit(p_raw) + b, fitted on out-of-fold predictions.

    Working in log-odds keeps SHAP explanations exact: if the model's SHAP values add up
    to logit(p_raw), multiplying them by `a` (and shifting the base by `b`) adds up to the
    calibrated log-odds. `identity()` gives an uncalibrated pass-through (a=1, b=0).
    """

    def __init__(self, a: float = 1.0, b: float = 0.0):
        self.a, self.b = a, b

    @classmethod
    def identity(cls) -> "PlattCalibrator":
        return cls()

    def fit(self, p_raw: np.ndarray, y: np.ndarray, iters: int = 100) -> "PlattCalibrator":
        # Newton-Raphson on the 2-parameter logistic log-likelihood with Platt's target
        # smoothing (avoids overconfident fits on small samples). No sklearn dependency.
        z = logit(p_raw)
        y = np.asarray(y, dtype=float)
        n_pos, n_neg = y.sum(), len(y) - y.sum()
        t = np.where(y == 1, (n_pos + 1) / (n_pos + 2), 1 / (n_neg + 2))
        a, b = 1.0, 0.0
        for _ in range(iters):
            q = sigmoid(a * z + b)
            w = q * (1 - q) + 1e-12
            g = np.array([np.sum((q - t) * z), np.sum(q - t)])
            H = np.array([[np.sum(w * z * z), np.sum(w * z)], [np.sum(w * z), np.sum(w)]])
            step = np.linalg.solve(H + 1e-9 * np.eye(2), g)
            a, b = a - step[0], b - step[1]
            if np.abs(step).max() < 1e-10:
                break
        self.a, self.b = float(a), float(b)
        return self

    def log_odds(self, p_raw: np.ndarray) -> np.ndarray:
        return self.a * logit(p_raw) + self.b

    def transform(self, p_raw: np.ndarray) -> np.ndarray:
        return sigmoid(self.log_odds(p_raw))

    @property
    def is_identity(self) -> bool:
        return self.a == 1.0 and self.b == 0.0


def recall_threshold(p: np.ndarray, y: np.ndarray, min_recall: float) -> float:
    """Highest threshold t such that recall of (p >= t) is at least `min_recall`.

    Among all thresholds meeting the recall target this one flags the fewest patients,
    i.e. it maximises precision/specificity subject to the recall constraint.
    """
    pos = np.sort(np.asarray(p)[np.asarray(y) == 1])[::-1]
    if len(pos) == 0:
        return 0.5
    k = max(1, math.ceil(min_recall * len(pos) - 1e-9))
    return float(pos[k - 1])
