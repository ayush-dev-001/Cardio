"""Nested cross-validation for every (model family x target), plus the vessel classifier chain.

Outer loop: repeated stratified K-fold (performance estimate). The same outer splits are
used for all targets and families so comparisons are paired; they are stratified on the
joint LAD/LCX/RCA pattern, which also balances overall CAD.
Inner loop: everything in `modeling.fit_model` (search, OOF calibration, threshold) runs on
the outer-training part only.

Classifier chain (vessels): link k receives the *predicted* probabilities of the earlier
vessels as extra inputs. On training data these are out-of-fold predictions, never the true
labels, so no target label is ever a model input.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.model_selection import RepeatedStratifiedKFold

from cardioscope_ml.config import target_ids, target_spec, vessel_target_order
from cardioscope_ml.modeling import fit_model


def chain_feature(target: str) -> str:
    return f"pred_{target}"


@dataclass
class CVResult:
    """Out-of-fold outputs for one (family, variant), stacked over repeats: shape (R, n)."""

    p_raw: np.ndarray
    p_cal: np.ndarray
    pred: np.ndarray
    thresholds: list[float] = field(default_factory=list)
    best_params: list[dict[str, Any]] = field(default_factory=list)


def outer_splits(df: pd.DataFrame, settings: dict[str, Any], seed: int):
    vessels = vessel_target_order()
    strata = sum(df[t].to_numpy() * 2**i for i, t in enumerate(vessels))
    cv = RepeatedStratifiedKFold(
        n_splits=settings["outer_folds"], n_repeats=settings["outer_repeats"], random_state=seed
    )
    return list(cv.split(np.zeros(len(df)), strata))


def _fold_task(family, X, Y, tr, te, settings, seed, chain) -> dict[str, tuple]:
    """Fit all targets (and chain links) on one outer fold for one family."""
    Xtr, Xte = X.iloc[tr], X.iloc[te]
    out, fitted = {}, {}
    for t in target_ids():
        m = fit_model(family, Xtr, Y[t].iloc[tr], settings, seed, target_spec(t)["min_recall"])
        raw = m.predict_raw(Xte)
        cal = m.calibrator.transform(raw)
        out[t] = (raw, cal, m.threshold, m.best_params)
        fitted[t] = (m, cal)

    if chain:
        order = vessel_target_order()
        aug_tr, aug_te = Xtr.copy(), Xte.copy()
        first = order[0]  # link 1 == independent model
        aug_tr[chain_feature(first)] = fitted[first][0].oof_cal
        aug_te[chain_feature(first)] = fitted[first][1]
        out[f"{first}_chain"] = out[first]
        extra: tuple[str, ...] = (chain_feature(first),)
        for t in order[1:]:
            m = fit_model(
                family,
                aug_tr,
                Y[t].iloc[tr],
                settings,
                seed,
                target_spec(t)["min_recall"],
                extra_numeric=extra,
            )
            raw = m.predict_raw(aug_te)
            cal = m.calibrator.transform(raw)
            out[f"{t}_chain"] = (raw, cal, m.threshold, m.best_params)
            aug_tr[chain_feature(t)] = m.oof_cal
            aug_te[chain_feature(t)] = cal
            extra = extra + (chain_feature(t),)
    return out


def run_nested_cv(
    X: pd.DataFrame,
    Y: pd.DataFrame,
    families: list[str],
    settings: dict[str, Any],
    seed: int,
    chain: bool = True,
    n_jobs: int = -1,
) -> dict[str, dict[str, CVResult]]:
    """Returns results[family][variant] where variant is a target id or '<vessel>_chain'."""
    splits = outer_splits(Y, settings, seed)
    k, R, n = settings["outer_folds"], settings["outer_repeats"], len(X)
    tasks = [(f, i) for f in families for i in range(len(splits))]
    outputs = Parallel(n_jobs=n_jobs, verbose=5)(
        delayed(_fold_task)(f, X, Y, *splits[i], settings, seed + i, chain) for f, i in tasks
    )

    results: dict[str, dict[str, CVResult]] = {f: {} for f in families}
    for (family, i), out in zip(tasks, outputs):
        r, te = i // k, splits[i][1]
        for variant, (raw, cal, thr, params) in out.items():
            res = results[family].get(variant)
            if res is None:
                res = results[family][variant] = CVResult(
                    np.full((R, n), np.nan), np.full((R, n), np.nan), np.full((R, n), -1)
                )
            res.p_raw[r, te], res.p_cal[r, te] = raw, cal
            res.pred[r, te] = (cal >= thr).astype(int)
            res.thresholds.append(thr)
            res.best_params.append(params)
    return results
