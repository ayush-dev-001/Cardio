"""Train and evaluate everything with one command.

    python -m cardioscope_ml.train            # full nested CV + final models (~minutes)
    python -m cardioscope_ml.train --fast     # tiny settings, writes to models/_fast (smoke test)

Steps
1. Nested CV for every model family x target (+ vessel classifier chain).
2. Metrics with bootstrap 95% CIs; select the best family per target by ROC-AUC.
3. Refit the selected family on all data with the same procedure (search -> Platt -> threshold).
4. Save models/<target>.joblib (model + calibrator + threshold + SHAP explainer),
   models/metrics.json and figures in reports/figures/.
"""

from __future__ import annotations

import argparse
import json
import platform
import time
from pathlib import Path
from typing import Any

import catboost
import numpy as np
import pandas as pd
import sklearn
import xgboost

from cardioscope_ml import evaluate as ev
from cardioscope_ml.calibration import PlattCalibrator, logit, recall_threshold
from cardioscope_ml.config import (
    FIGURES_DIR,
    MODELS_DIR,
    PROJECT_ROOT,
    assert_no_leakage,
    load_models,
    model_feature_ids,
    target_ids,
    target_spec,
    vessel_target_order,
)
from cardioscope_ml.data import load_clean
from cardioscope_ml.explain import NativeShapExplainer
from cardioscope_ml.features import output_to_feature_map
from cardioscope_ml.modeling import fit_model
from cardioscope_ml.models import baseline_families, model_families, model_spec
from cardioscope_ml.nested_cv import ensemble_cv, run_nested_cv
from cardioscope_ml.predictor import CardioModel

SHORT = {"cad": "CAD", "lad": "LAD", "lcx": "LCX", "rca": "RCA"}


def get_settings(fast: bool) -> dict[str, Any]:
    cfg = load_models()
    s = dict(cfg["validation"])
    if fast:
        s.update(cfg["fast"])
    return s


def train_final(
    family: str,
    target: str,
    X: pd.DataFrame,
    y: pd.Series,
    settings: dict,
    seed: int,
    use_platt: bool,
    cv_info: dict,
) -> CardioModel:
    min_recall = target_spec(target)["min_recall"]
    fm = fit_model(family, X, y, settings, seed, min_recall)
    if use_platt:
        calibrator, threshold = fm.calibrator, fm.threshold
    else:
        calibrator = PlattCalibrator.identity()
        threshold = recall_threshold(fm.oof_raw, y, min_recall)
    prep = fm.pipeline.named_steps["prep"]
    feature_map = output_to_feature_map(list(prep.get_feature_names_out()))
    explainer = NativeShapExplainer(
        fm.pipeline, feature_map, list(X.columns), calibrator, background=X
    )
    model = CardioModel(
        target_id=target,
        family=family,
        feature_ids=list(X.columns),
        pipeline=fm.pipeline,
        calibrator=calibrator,
        threshold=threshold,
        best_params=fm.best_params,
        explainer=explainer,
        meta={
            "min_recall": min_recall,
            "calibration": "platt" if use_platt else "none",
            "platt_a": calibrator.a,
            "platt_b": calibrator.b,
            **cv_info,
        },
    )
    # Exactness check: SHAP base + contributions must reproduce the calibrated log-odds.
    expl = model.explain(X)
    err = np.abs(expl.log_odds - logit(model.predict_proba(X))).max()
    if err > 1e-3:
        raise AssertionError(f"SHAP additivity failed for {target}: max error {err:.2e}")
    return model


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--fast", action="store_true", help="tiny CV settings for a quick smoke test")
    ap.add_argument("--models", nargs="+", default=None, help="subset of model families")
    ap.add_argument("--no-chain", action="store_true", help="skip the classifier-chain comparison")
    ap.add_argument("--out-dir", type=Path, default=None)
    ap.add_argument("--fig-dir", type=Path, default=None)
    ap.add_argument("--n-jobs", type=int, default=-1)
    args = ap.parse_args(argv)

    t0 = time.time()
    cfg = load_models()
    seed = int(cfg["seed"])
    settings = get_settings(args.fast)
    out_dir = args.out_dir or (MODELS_DIR / "_fast" if args.fast else MODELS_DIR)
    fig_dir = args.fig_dir or (FIGURES_DIR / "_fast" if args.fast else FIGURES_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    fig_dir.mkdir(parents=True, exist_ok=True)
    families = args.models or model_families()
    fam_labels = {f: model_spec(f)["label"] for f in families}

    df = load_clean()
    feats = model_feature_ids()
    X = df[feats]
    assert_no_leakage(list(X.columns))
    targets = target_ids()
    Y = {t: df[t].to_numpy() for t in targets}
    print(f"Data {X.shape}; targets {targets}; families {families}; settings {settings}")

    # 1. nested CV ---------------------------------------------------------------------------
    results = run_nested_cv(
        X, df[targets], families, settings, seed, chain=not args.no_chain, n_jobs=args.n_jobs
    )
    print(f"Nested CV done in {time.time() - t0:.0f}s; computing bootstrap CIs ...")

    # 2. metrics + selection -----------------------------------------------------------------
    summary = {
        t: {f: ev.summarize(Y[t], results[f][t], settings["bootstrap"], seed) for f in families}
        for t in targets
    }
    selected = {t: max(families, key=lambda f: summary[t][f]["roc_auc"]["mean"]) for t in targets}
    chain = None
    if not args.no_chain:
        chain = {
            f: {
                t: {
                    "auc_difference": ev.paired_auc_difference(
                        Y[t], results[f][t], results[f][f"{t}_chain"], settings["bootstrap"], seed
                    ),
                    "chain_metrics": ev.summarize(
                        Y[t], results[f][f"{t}_chain"], settings["bootstrap"], seed
                    ),
                }
                for t in vessel_target_order()[1:]
            }
            for f in families
        }

    # 2b. references on the same outer splits: clinical baseline(s) and the pre-specified ensemble
    baselines = baseline_families()
    base_results = (
        run_nested_cv(X, df[targets], baselines, settings, seed, chain=False, n_jobs=args.n_jobs)
        if baselines
        else {}
    )
    members = (cfg.get("ensemble") or {}).get("members", [])
    ens = (
        ensemble_cv(results, members, df[targets], settings, seed)
        if members and set(members) <= set(families)
        else None
    )
    comparisons, dca_report, dca_curves, dca_labels = {}, {}, {}, {}
    subgroup_report: dict[str, dict] = {}
    dc = cfg["decision_curve"]
    dca_thr = np.round(np.arange(dc["low"], dc["high"] + 1e-9, dc["step"]), 4)
    for t in targets:
        sel = results[selected[t]][t]
        comp = {}
        if ens:
            comp["ensemble"] = {
                "label": cfg["ensemble"]["label"],
                "members": members,
                "metrics": ev.summarize(Y[t], ens[t], settings["bootstrap"], seed),
                "auc_difference_vs_selected": ev.paired_auc_difference(
                    Y[t], sel, ens[t], settings["bootstrap"], seed
                ),
            }
        for b in baselines:
            comp[b] = {
                "label": model_spec(b)["label"],
                "features": model_spec(b)["features"],
                "metrics": ev.summarize(Y[t], base_results[b][t], settings["bootstrap"], seed),
                "auc_gain_of_selected": ev.paired_auc_difference(
                    Y[t], base_results[b][t], sel, settings["bootstrap"], seed
                ),
            }
        comparisons[t] = comp
        subgroup_report[t] = {
            g["id"]: {
                "label": g["label"],
                **ev.subgroup_summary(
                    Y[t], sel, ev.subgroup_mask(df, g), settings["bootstrap"], seed
                ),
            }
            for g in cfg.get("subgroups") or []
        }
        dca_models = {"selected": sel}
        if ens:
            dca_models["ensemble"] = ens[t]
        if baselines:
            dca_models["baseline"] = base_results[baselines[0]][t]
        curves = ev.decision_curve(Y[t], dca_models, dca_thr)
        dca_curves[t] = curves
        dca_labels[t] = {
            "selected": f"{fam_labels[selected[t]]} (selected)",
            "ensemble": "Ensemble",
            "baseline": "Clinical baseline",
            "treat_all": "Treat all",
            "treat_none": "Treat none",
        }
        useful = dca_thr[curves["selected"] > np.maximum(curves["treat_all"], 0) + 1e-9]
        dca_report[t] = {
            "net_benefit": {
                f"{pt:g}": {
                    k: round(float(np.interp(pt, dca_thr, v)), 4) for k, v in curves.items()
                }
                for pt in dc["report_at"]
            },
            "selected_beats_treat_all_and_none": (
                [round(float(useful.min()), 2), round(float(useful.max()), 2)]
                if len(useful)
                else None
            ),
        }

    # 3. final models ------------------------------------------------------------------------
    strategy = cfg["vessels"]["final_strategy"]
    if strategy != "independent":
        raise NotImplementedError(
            "Only final_strategy: independent is deployed; see docs/phase2_model_results.md"
        )
    final_info, global_importance = {}, {}
    for t in targets:
        f = selected[t]
        s = summary[t][f]
        use_platt = s["brier"]["mean"] <= s["brier_raw"]["mean"]
        cv_thr = [float(x) for x in results[f][t].thresholds]
        model = train_final(
            f,
            t,
            X,
            df[t],
            settings,
            seed,
            use_platt,
            {"cv_roc_auc": s["roc_auc"], "cv_threshold_mean": float(np.mean(cv_thr))},
        )
        path = model.save(out_dir)
        expl = model.explain(X)
        imp = expl.values.abs().mean().sort_values(ascending=False)
        global_importance[t] = {k: round(float(v), 4) for k, v in imp.items()}
        ev.plot_shap_summary(
            expl.values, X, f"{SHORT[t]} ({fam_labels[f]})", fig_dir / f"phase2_shap_{t}.png"
        )
        final_info[t] = {
            "family": f,
            "model_file": str(path.relative_to(PROJECT_ROOT))
            if path.is_relative_to(PROJECT_ROOT)
            else str(path),
            "calibration": model.meta["calibration"],
            "platt": {"a": round(model.calibrator.a, 4), "b": round(model.calibrator.b, 4)},
            "threshold": round(model.threshold, 4),
            "min_recall": target_spec(t)["min_recall"],
            "cv_threshold_mean": round(float(np.mean(cv_thr)), 4),
            "cv_threshold_range": [round(min(cv_thr), 4), round(max(cv_thr), 4)],
            "best_params": model.best_params,
        }
        print(
            f"  saved {t}: {f}, AUC {s['roc_auc']['mean']:.3f}, threshold {model.threshold:.3f}, {model.meta['calibration']}"
        )

    # 4. report ------------------------------------------------------------------------------
    extra = ([("ensemble", "Ensemble")] if ens else []) + [
        (b, "Clinical baseline") for b in baselines
    ]
    ev.plot_model_comparison(
        {t: {**summary[t], **{k: comparisons[t][k]["metrics"] for k, _ in extra}} for t in targets},
        families + [k for k, _ in extra],
        {**fam_labels, **dict(extra)},
        SHORT,
        fig_dir / "phase2_model_comparison.png",
    )
    ev.plot_decision_curves(
        dca_curves, dca_thr, dca_labels, SHORT, fig_dir / "phase2_decision_curves.png"
    )
    ev.plot_roc_curves(
        Y,
        results,
        summary,
        families,
        fam_labels,
        SHORT,
        selected,
        fig_dir / "phase2_roc_curves.png",
    )
    ev.plot_confusion_matrices(
        Y,
        results,
        selected,
        SHORT,
        {t: final_info[t]["cv_threshold_mean"] for t in targets},
        fig_dir / "phase2_confusion_matrices.png",
    )
    ev.plot_calibration(Y, results, selected, summary, SHORT, fig_dir / "phase2_calibration.png")
    if chain:
        ev.plot_chain_comparison(
            {f: {t: chain[f][t] for t in chain[f]} for f in families},
            families,
            fam_labels,
            fig_dir / "phase2_chain_vs_independent.png",
        )

    metrics = {
        "generated_by": "python -m cardioscope_ml.train" + (" --fast" if args.fast else ""),
        "seed": seed,
        "validation": settings,
        "n_patients": int(len(df)),
        "features": feats,
        "selection_metric": "roc_auc (mean of pooled out-of-fold AUC over CV repeats)",
        "threshold_rule": "highest threshold with out-of-fold recall >= min_recall (per target)",
        "targets": {
            t: {
                "selected_model": selected[t],
                "final": final_info[t],
                "cv": summary[t],
                "comparisons": comparisons[t],
                "decision_curve": dca_report[t],
                "subgroups": subgroup_report[t],
            }
            for t in targets
        },
        "vessel_strategy": {
            "final": strategy,
            "chain_order": cfg["vessels"]["chain_order"],
            "comparison": chain,
        },
        "shap_global_importance": global_importance,
        "versions": {
            "python": platform.python_version(),
            "scikit-learn": sklearn.__version__,
            "xgboost": xgboost.__version__,
            "catboost": catboost.__version__,
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
        "runtime_seconds": round(time.time() - t0),
    }
    with open(out_dir / "metrics.json", "w", encoding="utf-8") as fh:
        json.dump(metrics, fh, indent=2)

    print("\nResults (nested CV, mean [95% CI]) — selected model per target")
    for t in targets:
        s = summary[t][selected[t]]
        print(
            f"  {SHORT[t]:4s} {selected[t]:14s} "
            + "  ".join(
                f"{m} {s[m]['mean']:.3f} [{s[m]['ci_low']:.3f}-{s[m]['ci_high']:.3f}]"
                for m in ["roc_auc", "recall", "precision", "f1", "accuracy"]
            )
        )
    print(f"Done in {time.time() - t0:.0f}s -> {out_dir / 'metrics.json'}")
    return metrics


if __name__ == "__main__":
    main()
