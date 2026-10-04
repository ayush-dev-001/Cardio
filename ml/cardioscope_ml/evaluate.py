"""Metrics with bootstrap 95% CIs, and the evaluation figures."""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.stats import rankdata
from sklearn.metrics import roc_curve

from cardioscope_ml.nested_cv import CVResult

METRICS = ["roc_auc", "accuracy", "precision", "recall", "specificity", "f1", "brier", "brier_raw"]
COLORS = {"logreg": "#4C72B0", "random_forest": "#55A868", "xgboost": "#C44E52", "catboost": "#8172B2"}


def roc_auc(y: np.ndarray, p: np.ndarray) -> float:
    """ROC-AUC via the Mann-Whitney rank statistic (ties handled; fast for bootstrapping)."""
    pos = y == 1
    n_pos, n_neg = pos.sum(), len(y) - pos.sum()
    return float((rankdata(p)[pos].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def brier(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean((p - y) ** 2))


def _confusion(y, pred):
    tp = np.sum((pred == 1) & (y == 1)); fp = np.sum((pred == 1) & (y == 0))
    fn = np.sum((pred == 0) & (y == 1)); tn = np.sum((pred == 0) & (y == 0))
    return tp, fp, fn, tn


def _div(a, b):
    return float(a / b) if b else 0.0


def point_metrics(y: np.ndarray, p_cal: np.ndarray, p_raw: np.ndarray, pred: np.ndarray) -> dict:
    tp, fp, fn, tn = _confusion(y, pred)
    prec, rec = _div(tp, tp + fp), _div(tp, tp + fn)
    return {
        "roc_auc": roc_auc(y, p_cal),
        "accuracy": _div(tp + tn, len(y)),
        "precision": prec,
        "recall": rec,
        "specificity": _div(tn, tn + fp),
        "f1": _div(2 * prec * rec, prec + rec),
        "brier": brier(y, p_cal),
        "brier_raw": brier(y, p_raw),
    }


def _repeat_mean(y, res: CVResult, idx=None) -> dict:
    """Metric of the pooled out-of-fold predictions, averaged over CV repeats."""
    rows = []
    for r in range(res.p_cal.shape[0]):
        sl = slice(None) if idx is None else idx
        rows.append(point_metrics(y[sl], res.p_cal[r, sl], res.p_raw[r, sl], res.pred[r, sl]))
    return {m: float(np.mean([row[m] for row in rows])) for m in METRICS}


def summarize(y: np.ndarray, res: CVResult, n_boot: int, seed: int) -> dict:
    """Point estimate + percentile bootstrap 95% CI (resampling patients) for every metric."""
    point = _repeat_mean(y, res)
    rng = np.random.default_rng(seed)
    boots = {m: [] for m in METRICS}
    for _ in range(n_boot):
        idx = rng.integers(0, len(y), len(y))
        if y[idx].min() == y[idx].max():
            continue
        for m, v in _repeat_mean(y, res, idx).items():
            boots[m].append(v)
    return {m: {"mean": round(point[m], 4),
                "ci_low": round(float(np.percentile(boots[m], 2.5)), 4),
                "ci_high": round(float(np.percentile(boots[m], 97.5)), 4)} for m in METRICS}


def paired_auc_difference(y: np.ndarray, a: CVResult, b: CVResult, n_boot: int, seed: int) -> dict:
    """AUC(b) - AUC(a) on the same patients, with a paired bootstrap 95% CI."""
    def diff(idx):
        return np.mean([roc_auc(y[idx], b.p_cal[r, idx]) - roc_auc(y[idx], a.p_cal[r, idx])
                        for r in range(a.p_cal.shape[0])])
    rng = np.random.default_rng(seed)
    point = diff(np.arange(len(y)))
    boots = []
    for _ in range(n_boot):
        idx = rng.integers(0, len(y), len(y))
        if y[idx].min() != y[idx].max():
            boots.append(diff(idx))
    return {"mean": round(float(point), 4), "ci_low": round(float(np.percentile(boots, 2.5)), 4),
            "ci_high": round(float(np.percentile(boots, 97.5)), 4)}


# ----------------------------------------------------------------------------- figures
def _labels(target_labels: dict, t: str) -> str:
    return target_labels.get(t, t.upper())


def plot_model_comparison(summary: dict, families: list[str], family_labels: dict,
                          target_labels: dict, path: Path) -> None:
    targets = list(summary)
    fig, ax = plt.subplots(figsize=(9, 4.2))
    w = 0.8 / len(families)
    for j, f in enumerate(families):
        m = [summary[t][f]["roc_auc"] for t in targets]
        x = np.arange(len(targets)) + (j - (len(families) - 1) / 2) * w
        ax.bar(x, [v["mean"] for v in m], w, color=COLORS.get(f), label=family_labels[f],
               yerr=[[v["mean"] - v["ci_low"] for v in m], [v["ci_high"] - v["mean"] for v in m]],
               capsize=3, error_kw={"lw": 1})
    ax.axhline(0.5, color="grey", ls=":", lw=1)
    ax.set_xticks(np.arange(len(targets)), [_labels(target_labels, t) for t in targets])
    ax.set_ylim(0.4, 1.0); ax.set_ylabel("ROC-AUC (nested CV, 95% CI)")
    ax.set_title("Model comparison per target")
    ax.legend(ncol=4, fontsize=8, loc="upper right")
    fig.tight_layout(); fig.savefig(path, dpi=130); plt.close(fig)


def plot_roc_curves(Y: dict, results: dict, summary: dict, families: list[str], family_labels: dict,
                    target_labels: dict, selected: dict, path: Path) -> None:
    targets = list(summary)
    fig, axes = plt.subplots(1, len(targets), figsize=(4.2 * len(targets), 4.2))
    for ax, t in zip(np.atleast_1d(axes), targets):
        for f in families:
            res = results[f][t]
            fprs = np.linspace(0, 1, 101)
            tprs = [np.interp(fprs, *roc_curve(Y[t], res.p_cal[r])[:2]) for r in range(res.p_cal.shape[0])]
            auc = summary[t][f]["roc_auc"]["mean"]
            ax.plot(fprs, np.mean(tprs, axis=0), color=COLORS.get(f), lw=2.4 if f == selected[t] else 1.2,
                    label=f"{family_labels[f]} ({auc:.3f})" + (" ★" if f == selected[t] else ""))
        ax.plot([0, 1], [0, 1], ":", color="grey")
        ax.set_title(_labels(target_labels, t)); ax.set_xlabel("False positive rate")
        ax.legend(fontsize=7, loc="lower right"); ax.set_aspect("equal")
    np.atleast_1d(axes)[0].set_ylabel("True positive rate")
    fig.suptitle("ROC curves, out-of-fold (mean over CV repeats; ★ = selected model)")
    fig.tight_layout(); fig.savefig(path, dpi=130); plt.close(fig)


def plot_confusion_matrices(Y: dict, results: dict, selected: dict, target_labels: dict,
                            thresholds: dict, path: Path) -> None:
    targets = list(selected)
    fig, axes = plt.subplots(1, len(targets), figsize=(3.6 * len(targets), 3.6))
    for ax, t in zip(np.atleast_1d(axes), targets):
        res = results[selected[t]][t]
        cms = [_confusion(Y[t], res.pred[r]) for r in range(res.pred.shape[0])]
        tp, fp, fn, tn = np.mean(cms, axis=0)
        cm = np.array([[tn, fp], [fn, tp]])
        ax.imshow(cm, cmap="Blues")
        for (i, j), v in np.ndenumerate(cm):
            ax.text(j, i, f"{v:.0f}", ha="center", va="center",
                    color="white" if v > cm.max() / 2 else "black", fontsize=13)
        ax.set_xticks([0, 1], ["Pred. normal", "Pred. disease"]); ax.set_yticks([0, 1], ["Normal", "Disease"])
        ax.set_title(f"{_labels(target_labels, t)}\n{selected[t]}, thr≈{thresholds[t]:.2f}", fontsize=9)
    fig.suptitle("Confusion matrices at recall-tuned thresholds (out-of-fold, averaged over repeats)", fontsize=10)
    fig.tight_layout(); fig.savefig(path, dpi=130); plt.close(fig)


def plot_calibration(Y: dict, results: dict, selected: dict, summary: dict, target_labels: dict,
                     path: Path, bins: int = 8) -> None:
    targets = list(selected)
    fig, axes = plt.subplots(1, len(targets), figsize=(4 * len(targets), 4))
    for ax, t in zip(np.atleast_1d(axes), targets):
        res, s = results[selected[t]][t], summary[t][selected[t]]
        for P, name, c, b in [(res.p_raw, "raw", "#999999", s["brier_raw"]), (res.p_cal, "Platt", "#C44E52", s["brier"])]:
            p, yy = P.ravel(), np.tile(Y[t], P.shape[0])
            edges = np.quantile(p, np.linspace(0, 1, bins + 1)); edges[-1] += 1e-9
            k = np.clip(np.digitize(p, edges) - 1, 0, bins - 1)
            mp = [p[k == i].mean() for i in range(bins) if np.any(k == i)]
            my = [yy[k == i].mean() for i in range(bins) if np.any(k == i)]
            ax.plot(mp, my, "o-", color=c, label=f"{name} (Brier {b['mean']:.3f})")
        ax.plot([0, 1], [0, 1], ":", color="grey")
        ax.set_title(f"{_labels(target_labels, t)} — {selected[t]}", fontsize=10)
        ax.set_xlabel("Predicted probability"); ax.legend(fontsize=8, loc="upper left"); ax.set_aspect("equal")
    np.atleast_1d(axes)[0].set_ylabel("Observed frequency")
    fig.suptitle("Calibration curves (out-of-fold, quantile bins)")
    fig.tight_layout(); fig.savefig(path, dpi=130); plt.close(fig)


def plot_chain_comparison(chain: dict, families: list[str], family_labels: dict, path: Path) -> None:
    vessels = list(next(iter(chain.values())))
    fig, ax = plt.subplots(figsize=(8, 3.8))
    w = 0.8 / len(families)
    for j, f in enumerate(families):
        d = [chain[f][v]["auc_difference"] for v in vessels]
        x = np.arange(len(vessels)) + (j - (len(families) - 1) / 2) * w
        ax.bar(x, [v["mean"] for v in d], w, color=COLORS.get(f), label=family_labels[f],
               yerr=[[v["mean"] - v["ci_low"] for v in d], [v["ci_high"] - v["mean"] for v in d]], capsize=3)
    ax.axhline(0, color="black", lw=0.8)
    ax.set_xticks(np.arange(len(vessels)), [v.upper() for v in vessels])
    ax.set_ylabel("AUC(chain) − AUC(independent)")
    ax.set_title("Classifier chain vs independent models (paired bootstrap 95% CI)")
    ax.legend(fontsize=8, ncol=4); fig.tight_layout(); fig.savefig(path, dpi=130); plt.close(fig)


def plot_shap_summary(values, X, target_label: str, path: Path, top: int = 12) -> None:
    """Beeswarm-style plot: each dot is a patient; colour = feature value (low→high)."""
    order = values.abs().mean().sort_values(ascending=False).index[:top][::-1]
    fig, ax = plt.subplots(figsize=(7, 0.42 * top + 1.2))
    rng = np.random.default_rng(0)
    for i, f in enumerate(order):
        x = X[f].astype(float) if X[f].dtype != object else (X[f] != X[f].mode()[0]).astype(float)
        span = x.max() - x.min()
        c = (x - x.min()) / span if span else np.full(len(x), 0.5)
        ax.scatter(values[f], i + rng.uniform(-0.28, 0.28, len(x)), c=c, cmap="coolwarm", s=9, alpha=.8)
    ax.axvline(0, color="grey", lw=.8)
    ax.set_yticks(range(len(order)), order)
    ax.set_xlabel("SHAP value (calibrated log-odds; > 0 pushes towards disease)")
    ax.set_title(f"{target_label}: top {top} features (blue = low value, red = high)", fontsize=10)
    fig.tight_layout(); fig.savefig(path, dpi=130); plt.close(fig)
