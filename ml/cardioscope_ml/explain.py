"""Exact SHAP explanations computed natively per model family (no `shap` package).

* Logistic regression: exact linear SHAP (interventional, background = training mean)
  phi_j = w_j * (x_j - mean_j), base = intercept + w . mean
* XGBoost (boosted or random-forest mode): TreeSHAP built into XGBoost (`pred_contribs=True`)
* CatBoost: TreeSHAP built into CatBoost (`type="ShapValues"`)

All three are in the model's raw log-odds space, so the explanation is exactly additive:
base + sum(phi) == logit(p_raw). The Platt calibrator is linear in log-odds, so scaling
by `a` (and shifting the base by `b`) gives an exact decomposition of the calibrated
log-odds that the dashboard shows. One-hot columns are summed back to their feature.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from cardioscope_ml.calibration import PlattCalibrator


@dataclass
class Explanation:
    base_value: float  # calibrated log-odds of an "average" patient
    values: pd.DataFrame  # rows = patients, columns = feature ids (log-odds units)
    log_odds: np.ndarray  # base_value + values.sum(axis=1)


class NativeShapExplainer:
    """Explains a fitted (prep -> clf) pipeline; picklable and saved with the model."""

    def __init__(
        self,
        pipeline,
        feature_map: list[str],
        feature_ids: list[str],
        calibrator: PlattCalibrator,
        background: pd.DataFrame,
    ):
        self.pipeline = pipeline
        self.feature_map = feature_map  # transformed column -> feature id
        self.feature_ids = feature_ids  # output column order
        self.calibrator = calibrator
        clf = pipeline.named_steps["clf"]
        self.kind = type(clf).__name__
        if self.kind == "LogisticRegression":
            Zb = pipeline.named_steps["prep"].transform(background)
            self.bg_mean = Zb.mean(axis=0)

    def _raw_contribs(self, Z: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """(phi per transformed column, base per row) in raw log-odds."""
        clf = self.pipeline.named_steps["clf"]
        if self.kind == "LogisticRegression":
            w = clf.coef_.ravel()
            phi = (Z - self.bg_mean) * w
            base = np.full(len(Z), clf.intercept_[0] + w @ self.bg_mean)
        elif self.kind == "XGBClassifier":
            import xgboost as xgb

            out = clf.get_booster().predict(xgb.DMatrix(Z), pred_contribs=True)
            phi, base = out[:, :-1], out[:, -1]
        elif self.kind == "CatBoostClassifier":
            from catboost import Pool

            out = clf.get_feature_importance(Pool(Z), type="ShapValues")
            phi, base = out[:, :-1], out[:, -1]
        else:
            raise TypeError(f"No SHAP implementation for {self.kind}")
        return np.asarray(phi, dtype=float), np.asarray(base, dtype=float)

    def explain(self, X: pd.DataFrame) -> Explanation:
        Z = self.pipeline.named_steps["prep"].transform(X)
        phi, base = self._raw_contribs(Z)
        a, b = self.calibrator.a, self.calibrator.b
        cols = pd.DataFrame(phi * a, index=X.index)
        cols.columns = self.feature_map
        values = cols.T.groupby(level=0).sum().T.reindex(columns=self.feature_ids, fill_value=0.0)
        base_value = float(a * base[0] + b)  # identical for every row
        return Explanation(base_value, values, base_value + values.sum(axis=1).to_numpy())
