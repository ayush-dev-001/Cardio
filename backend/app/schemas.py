"""Request/response models. The patient input model is generated from features.yaml, so adding
a feature to the config adds it to the API (with its type, allowed values and plausible range)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, create_model

from cardioscope_ml.config import feature_specs, target_ids


def input_feature_specs() -> list[dict[str, Any]]:
    """Features the client must send: used by a model and not derived from other inputs."""
    return [f for f in feature_specs() if f.get("use_in_model", True) and not f.get("derived")]


def _field(spec: dict[str, Any]) -> tuple[Any, Any]:
    desc = spec["description"] + (f" Unit: {spec['unit']}." if spec.get("unit") else "")
    kind = spec["type"]
    if kind == "numeric":
        lo, hi = spec["valid_range"]
        return float, Field(ge=lo, le=hi, title=spec["label"], description=desc)
    if kind in ("binary", "ordinal"):
        values = tuple(sorted(set(spec["encoding"].values())))
        return Literal[values], Field(title=spec["label"], description=desc)  # type: ignore[valid-type]
    if kind == "categorical":
        return Literal[tuple(spec["categories"])], Field(title=spec["label"], description=desc)  # type: ignore[valid-type]
    raise ValueError(f"Unsupported feature type {kind!r} for {spec['id']}")


PatientInput: type[BaseModel] = create_model(
    "PatientInput",
    __config__=ConfigDict(extra="forbid"),  # unknown fields (incl. LAD/LCX/RCA/Cath) are rejected
    **{f["id"]: _field(f) for f in input_feature_specs()},
)


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient: PatientInput  # type: ignore[valid-type]


TargetId = Literal[tuple(target_ids())]  # type: ignore[valid-type]


class ExplainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patient: PatientInput  # type: ignore[valid-type]
    targets: list[TargetId] | None = Field(
        default=None, description="Targets to explain (default: all)."
    )
    top_k: int | None = Field(
        default=None,
        ge=1,
        le=100,
        description="Keep the k largest contributions; the rest are summed.",
    )


# ----------------------------------------------------------------------------- responses
class TargetPrediction(BaseModel):
    target_id: str
    label: str
    probability: float = Field(description="Calibrated probability of disease / stenosis (0-1).")
    threshold: float = Field(description="Recall-oriented decision threshold for this target.")
    predicted_positive: bool
    risk_level: Literal["low", "moderate", "high"]
    model: str


class VesselPrediction(TargetPrediction):
    vessel_id: str = Field(description="ID from shared/vessels.json (used by the 3D view).")


class PredictResponse(BaseModel):
    cad: TargetPrediction
    vessels: list[VesselPrediction]
    derived_inputs: dict[str, float] = Field(description="Inputs computed by the server, e.g. BMI.")
    disclaimer: str


class Contribution(BaseModel):
    feature: str
    label: str
    group: str
    unit: str | None
    value: float | str | None = Field(description="The patient's value for this feature.")
    display_value: str
    shap: float = Field(
        description="Contribution in calibrated log-odds (>0 pushes towards disease)."
    )
    normal_range: list[float | None] | None
    status: Literal["low", "normal", "high"] | None = Field(
        description="Value vs normal range (numeric features)."
    )


class TargetExplanation(BaseModel):
    target_id: str
    label: str
    vessel_id: str | None
    model: str
    probability: float
    base_value: float = Field(description="Log-odds of an average patient (SHAP expected value).")
    base_probability: float
    log_odds: float = Field(
        description="base_value + sum of all contributions = logit(probability)."
    )
    contributions: list[Contribution]
    other_contribution: float = Field(
        description="Sum of contributions not listed (when top_k is used)."
    )


class ExplainResponse(BaseModel):
    explanations: list[TargetExplanation]
    units: str = (
        "SHAP values are in calibrated log-odds; they add up exactly to each target's probability."
    )
    disclaimer: str


class SamplePatient(BaseModel):
    kind: Literal["normal", "single_vessel", "multi_vessel"]
    title: str
    description: str
    patient_id: int
    patient: dict[str, Any]
    true_labels: dict[str, int]
    source: str


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    models_loaded: list[str]
    n_input_features: int
    versions: dict[str, str]
