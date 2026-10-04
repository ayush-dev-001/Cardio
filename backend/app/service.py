"""Model service: loads the trained CardioModels once and turns validated inputs into
predictions, SHAP explanations, the UI schema and sample patients."""
from __future__ import annotations

import json
import platform
from pathlib import Path
from typing import Any

import pandas as pd

from cardioscope_ml.calibration import sigmoid
from cardioscope_ml.config import (assert_no_leakage, dataset_paths, feature_specs, load_features, load_vessels,
                                   target_spec, target_ids)
from cardioscope_ml.derived import apply_derivations, derived_features
from cardioscope_ml.predictor import CardioModel, load_model

from app.schemas import input_feature_specs
from app.settings import DISCLAIMER

RISK_BANDS = ((0.33, "low"), (0.66, "moderate"), (1.01, "high"))  # same bands as the 3D legend


def risk_level(p: float) -> str:
    return next(label for upper, label in RISK_BANDS if p < upper)


def _option_label(spec: dict[str, Any], value: Any) -> str:
    labels = spec.get("option_labels")
    if labels is not None:
        return str(labels.get(value, value))
    if spec["type"] == "binary":
        return {0: "No", 1: "Yes"}.get(value, str(value))
    if spec["type"] == "numeric":
        v = float(value)
        return f"{v:g}" + (f" {spec['unit']}" if spec.get("unit") else "")
    return str(value)


def range_status(spec: dict[str, Any], value: Any) -> str | None:
    rng = spec.get("normal_range")
    if spec["type"] != "numeric" or not rng:
        return None
    lo, hi = rng
    if lo is not None and value < lo:
        return "low"
    if hi is not None and value > hi:
        return "high"
    return "normal"


class ModelService:
    def __init__(self, models_dir: Path):
        self.models_dir = models_dir
        self.specs = {f["id"]: f for f in feature_specs()}
        self.models: dict[str, CardioModel] = {t: load_model(t, models_dir) for t in target_ids()}
        for m in self.models.values():
            assert_no_leakage(m.feature_ids)
        self.feature_ids = self.models[target_ids()[0]].feature_ids
        self.vessels = load_vessels()["vessels"]
        self.vessel_of_target = {v["target_id"]: v["id"] for v in self.vessels}
        metrics_path = models_dir / "metrics.json"
        self.metrics = json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.exists() else {}
        self.data = pd.read_csv(dataset_paths().processed)
        self.defaults = self._defaults()
        self.samples = self._pick_samples()

    # ----------------------------------------------------------------------- inputs
    def _frame(self, patient: dict[str, Any]) -> pd.DataFrame:
        rec = apply_derivations(patient)
        return pd.DataFrame([rec])[self.feature_ids]

    def derived_values(self, patient: dict[str, Any]) -> dict[str, float]:
        rec = apply_derivations(patient)
        return {fid: float(rec[fid]) for fid in derived_features()}

    def _defaults(self) -> dict[str, Any]:
        """Typical training-set value per input: median (numeric) or most common value."""
        out: dict[str, Any] = {}
        for spec in input_feature_specs():
            col = self.data[spec["id"]]
            if spec["type"] == "numeric":
                v = float(col.median())
                out[spec["id"]] = int(v) if v.is_integer() else round(v, 2)
            else:
                v = col.mode().iloc[0]
                out[spec["id"]] = v.item() if hasattr(v, "item") else v
        return out

    # ----------------------------------------------------------------------- predict
    def _target_prediction(self, t: str, p: float) -> dict[str, Any]:
        m = self.models[t]
        out = {
            "target_id": t,
            "label": target_spec(t)["label"],
            "probability": float(p),
            "threshold": float(m.threshold),
            "predicted_positive": bool(p >= m.threshold),
            "risk_level": risk_level(p),
            "model": m.family,
        }
        if t in self.vessel_of_target:
            out["vessel_id"] = self.vessel_of_target[t]
        return out

    def predict(self, patient: dict[str, Any]) -> dict[str, Any]:
        X = self._frame(patient)
        probs = {t: float(self.models[t].predict_proba(X)[0]) for t in target_ids()}
        overall = [t for t in target_ids() if t not in self.vessel_of_target]
        return {
            "cad": self._target_prediction(overall[0], probs[overall[0]]),
            "vessels": [self._target_prediction(v["target_id"], probs[v["target_id"]]) for v in self.vessels],
            "derived_inputs": self.derived_values(patient),
            "disclaimer": DISCLAIMER,
        }

    # ----------------------------------------------------------------------- explain
    def explain(self, patient: dict[str, Any], targets: list[str] | None, top_k: int | None) -> dict[str, Any]:
        X = self._frame(patient)
        rec = X.iloc[0].to_dict()
        explanations = []
        for t in targets or target_ids():
            m = self.models[t]
            e = m.explain(X)
            shap = e.values.iloc[0]
            order = shap.abs().sort_values(ascending=False).index
            keep = list(order if top_k is None else order[:top_k])
            contributions = []
            for fid in keep:
                spec, value = self.specs[fid], rec[fid]
                value = value.item() if hasattr(value, "item") else value
                contributions.append({
                    "feature": fid, "label": spec["label"], "group": spec["group"], "unit": spec.get("unit"),
                    "value": value, "display_value": _option_label(spec, value), "shap": float(shap[fid]),
                    "normal_range": spec.get("normal_range"), "status": range_status(spec, value),
                })
            log_odds = float(e.log_odds[0])
            explanations.append({
                "target_id": t,
                "label": target_spec(t)["label"],
                "vessel_id": self.vessel_of_target.get(t),
                "model": m.family,
                "probability": float(sigmoid(log_odds)),
                "base_value": e.base_value,
                "base_probability": float(sigmoid(e.base_value)),
                "log_odds": log_odds,
                "contributions": contributions,
                "other_contribution": float(shap.drop(keep).sum()),
            })
        return {"explanations": explanations, "disclaimer": DISCLAIMER}

    # ----------------------------------------------------------------------- schema
    def schema(self) -> dict[str, Any]:
        features = []
        for spec in feature_specs():
            if not spec.get("use_in_model", True):
                continue
            item = {k: spec.get(k) for k in ("id", "label", "group", "type", "unit", "description",
                                              "normal_range", "valid_range", "note")}
            item["derived"] = bool(spec.get("derived"))
            item["what_if"] = bool(spec.get("what_if"))
            if spec["type"] == "numeric":
                col = self.data[spec["id"]]
                item["observed_range"] = [float(col.min()), float(col.max())]  # training-data min/max
            item["input"] = not item["derived"]
            item["default"] = self.defaults.get(spec["id"])
            if spec["type"] in ("binary", "ordinal"):
                values = sorted(set(spec["encoding"].values()))
                item["options"] = [{"value": v, "label": _option_label(spec, v)} for v in values]
            elif spec["type"] == "categorical":
                item["options"] = [{"value": v, "label": _option_label(spec, v)} for v in spec["categories"]]
            features.append(item)

        targets = []
        for t in target_ids():
            m, tm = self.models[t], self.metrics.get("targets", {}).get(t, {})
            targets.append({
                "id": t, "label": target_spec(t)["label"], "kind": target_spec(t)["kind"],
                "vessel_id": self.vessel_of_target.get(t), "model": m.family, "threshold": m.threshold,
                "min_recall": target_spec(t).get("min_recall"),
                "cv_roc_auc": tm.get("cv", {}).get(m.family, {}).get("roc_auc"),
            })
        return {
            "groups": load_features()["groups"],
            "features": features,
            "targets": targets,
            "vessels": self.vessels,
            "risk_bands": [{"upper": u, "label": l} for u, l in RISK_BANDS],
            "disclaimer": DISCLAIMER,
        }

    # ----------------------------------------------------------------------- samples
    def _pick_samples(self) -> list[dict[str, Any]]:
        """Most clear-cut real patient per category: the one whose (in-sample) predictions agree
        best with its true labels. Deterministic."""
        df = self.data
        vessel_targets = [v["target_id"] for v in self.vessels]
        n_vessels = df[vessel_targets].sum(axis=1)
        X = df[self.feature_ids]
        probs = pd.DataFrame({t: self.models[t].predict_proba(X) for t in target_ids()}, index=df.index)
        agreement = sum((probs[t] * df[t] + (1 - probs[t]) * (1 - df[t])) for t in target_ids()) / len(target_ids())

        kinds = [
            ("normal", "Normal coronaries", (df["cad"] == 0) & (n_vessels == 0)),
            ("single_vessel", "Single-vessel disease", (df["cad"] == 1) & (n_vessels == 1)),
            ("multi_vessel", "Multi-vessel disease", (df["cad"] == 1) & (n_vessels == 3)),
        ]
        inputs = [s["id"] for s in input_feature_specs()]
        out = []
        for kind, title, mask in kinds:
            idx = agreement[mask].idxmax()
            row = df.loc[idx]
            diseased = [v["id"] for v in self.vessels if row[v["target_id"]] == 1]
            desc = "No significant stenosis on angiography." if not diseased else \
                f"Angiographic stenosis in {', '.join(diseased)}."
            patient = {k: (row[k].item() if hasattr(row[k], "item") else row[k]) for k in inputs}
            out.append({
                "kind": kind,
                "title": title + (f" ({diseased[0]})" if len(diseased) == 1 else ""),
                "description": f"{int(row['age'])}-year-old {'man' if row['sex'] == 1 else 'woman'}. {desc}",
                "patient_id": int(row["patient_id"]),
                "patient": patient,
                "true_labels": {t: int(row[t]) for t in target_ids()},
                "source": (f"Z-Alizadeh Sani dataset, row {int(row['patient_id'])}. This patient was part of the "
                           "training data, so predictions for it are in-sample (optimistic)."),
            })
        return out

    # ----------------------------------------------------------------------- health
    def health(self) -> dict[str, Any]:
        import fastapi, sklearn, xgboost  # noqa: E401
        return {
            "status": "ok" if len(self.models) == len(target_ids()) else "degraded",
            "models_loaded": sorted(self.models),
            "n_input_features": len(input_feature_specs()),
            "versions": {"python": platform.python_version(), "fastapi": fastapi.__version__,
                         "scikit-learn": sklearn.__version__, "xgboost": xgboost.__version__},
        }
