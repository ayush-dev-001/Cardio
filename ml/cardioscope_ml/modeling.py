"""Fit one tuned + calibrated + thresholded model. Used both inside every outer CV fold
and for the final model, so the evaluated procedure is exactly the deployed procedure."""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, cross_val_predict

from cardioscope_ml.calibration import PlattCalibrator, recall_threshold
from cardioscope_ml.models import build_pipeline, param_distributions


@dataclass
class FittedModel:
    pipeline: Any  # best (prep -> clf) pipeline refit on all given data
    calibrator: PlattCalibrator  # fitted on out-of-fold raw probabilities
    threshold: float  # on calibrated probabilities, from out-of-fold predictions
    best_params: dict[str, Any]
    oof_raw: np.ndarray  # out-of-fold raw probabilities on the given data
    oof_cal: np.ndarray

    def predict_raw(self, X: pd.DataFrame) -> np.ndarray:
        return self.pipeline.predict_proba(X)[:, 1]


def fit_model(
    family: str,
    X: pd.DataFrame,
    y: pd.Series,
    settings: dict[str, Any],
    seed: int,
    min_recall: float,
    extra_numeric: tuple[str, ...] = (),
) -> FittedModel:
    """Inner random search -> refit best -> OOF predictions -> Platt + threshold.

    Every step only sees (X, y), i.e. the outer-training data when called inside CV.
    """
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # e.g. saga ConvergenceWarning for tiny C values
        search = RandomizedSearchCV(
            build_pipeline(family, seed, extra_numeric),
            param_distributions(family),
            n_iter=settings["n_iter"],
            scoring=settings["scoring"],
            cv=StratifiedKFold(settings["inner_folds"], shuffle=True, random_state=seed),
            random_state=seed,
            n_jobs=1,
            refit=True,
            error_score="raise",
        )
        search.fit(X, y)
        best = search.best_estimator_
        oof_raw = cross_val_predict(
            clone(best),
            X,
            y,
            method="predict_proba",
            cv=StratifiedKFold(settings["oof_folds"], shuffle=True, random_state=seed + 1),
        )[:, 1]
    calibrator = PlattCalibrator().fit(oof_raw, y)
    oof_cal = calibrator.transform(oof_raw)
    return FittedModel(
        pipeline=best,
        calibrator=calibrator,
        threshold=recall_threshold(oof_cal, y, min_recall),
        best_params={k.removeprefix("clf__"): _plain(v) for k, v in search.best_params_.items()},
        oof_raw=oof_raw,
        oof_cal=oof_cal,
    )


def _plain(v: Any) -> Any:
    return v.item() if isinstance(v, np.generic) else v
