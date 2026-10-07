"""Tests for every API endpoint: happy paths, input validation, leakage protection and
consistency between /predict, /explain and the saved models."""

import math

import pytest
from fastapi.testclient import TestClient

from app.main import app
from cardioscope_ml.config import load_vessels, target_ids

TARGET_NAMES = {"lad", "lcx", "rca", "cath", "cad"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def schema(client):
    return client.get("/schema").json()


@pytest.fixture(scope="module")
def samples(client):
    return client.get("/patients/sample").json()


@pytest.fixture()
def patient(schema):
    """A complete valid patient built from the schema defaults."""
    return {f["id"]: f["default"] for f in schema["features"] if f["input"]}


def logit(p):
    p = min(max(p, 1e-6), 1 - 1e-6)
    return math.log(p / (1 - p))


# ------------------------------------------------------------------------------- /health
def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["models_loaded"] == sorted(target_ids())


# ------------------------------------------------------------------------------- /schema
def test_schema_lists_features_groups_targets_vessels(schema):
    groups = {g["id"] for g in schema["groups"]}
    assert all(f["group"] in groups for f in schema["features"])
    assert [t["id"] for t in schema["targets"]] == target_ids()
    assert [v["id"] for v in schema["vessels"]] == [v["id"] for v in load_vessels()["vessels"]]
    assert "not a substitute" in schema["disclaimer"]


def test_schema_never_offers_targets_as_inputs(schema):
    assert not {f["id"].lower() for f in schema["features"]} & TARGET_NAMES


def test_schema_marks_derived_features(schema):
    by_id = {f["id"]: f for f in schema["features"]}
    assert by_id["bmi"]["derived"] and not by_id["bmi"]["input"]
    assert by_id["obesity"]["derived"]
    assert by_id["age"]["input"] and by_id["age"]["valid_range"] == [18, 110]
    assert {o["label"] for o in by_id["sex"]["options"]} == {"Female", "Male"}
    assert [o["value"] for o in by_id["bbb"]["options"]] == ["N", "LBBB", "RBBB"]


def test_schema_what_if_features_have_observed_ranges(schema):
    what_if = [f for f in schema["features"] if f["what_if"]]
    assert {"bp", "ldl", "current_smoker"} <= {f["id"] for f in what_if}
    for f in what_if:
        assert f["input"], f["id"]  # sliders only for directly editable inputs
        if f["type"] == "numeric":
            lo, hi = f["observed_range"]
            assert f["valid_range"][0] <= lo < hi <= f["valid_range"][1]


def test_schema_defaults_are_valid_inputs(client, patient):
    assert client.post("/predict", json={"patient": patient}).status_code == 200


# ------------------------------------------------------------------------------ /predict
def test_predict_returns_probabilities_for_cad_and_each_vessel(client, patient):
    r = client.post("/predict", json={"patient": patient})
    assert r.status_code == 200
    body = r.json()
    assert 0 <= body["cad"]["probability"] <= 1
    assert [v["vessel_id"] for v in body["vessels"]] == ["LAD", "LCX", "RCA"]
    for v in body["vessels"]:
        assert 0 <= v["probability"] <= 1
        assert v["predicted_positive"] == (v["probability"] >= v["threshold"])
        assert v["risk_level"] in {"low", "moderate", "high"}
    assert "not a substitute" in body["disclaimer"]


def test_predict_computes_derived_bmi(client, patient):
    body = client.post(
        "/predict", json={"patient": {**patient, "weight": 81, "height": 180}}
    ).json()
    assert body["derived_inputs"]["bmi"] == pytest.approx(25.0, abs=1e-6)
    assert body["derived_inputs"]["obesity"] == 1


def test_predict_is_deterministic(client, patient):
    a = client.post("/predict", json={"patient": patient}).json()
    b = client.post("/predict", json={"patient": patient}).json()
    assert a == b


def test_predict_responds_to_input_changes(client, patient):
    low = client.post(
        "/predict", json={"patient": {**patient, "typical_chest_pain": 0, "age": 35}}
    ).json()
    high = client.post(
        "/predict", json={"patient": {**patient, "typical_chest_pain": 1, "age": 75}}
    ).json()
    assert high["cad"]["probability"] > low["cad"]["probability"]


@pytest.mark.parametrize(
    "field,value",
    [
        ("age", 150),  # outside plausible range
        ("ef_tte", -5),
        ("sex", 2),  # not an allowed code
        ("bbb", "XBBB"),  # unknown category
        ("dm", "maybe"),
    ],
)
def test_predict_rejects_invalid_values(client, patient, field, value):
    r = client.post("/predict", json={"patient": {**patient, field: value}})
    assert r.status_code == 422


def test_predict_rejects_missing_field(client, patient):
    patient.pop("age")
    assert client.post("/predict", json={"patient": patient}).status_code == 422


@pytest.mark.parametrize(
    "leak", ["LAD", "lad", "LCX", "RCA", "Cath", "cad", "bmi", "unknown_feature"]
)
def test_predict_rejects_targets_derived_and_unknown_fields(client, patient, leak):
    r = client.post("/predict", json={"patient": {**patient, leak: 1}})
    assert r.status_code == 422
    assert "Extra inputs are not permitted" in r.text


# ------------------------------------------------------------------------------ /explain
def test_explain_all_targets_adds_up_to_predicted_probability(client, patient):
    pred = client.post("/predict", json={"patient": patient}).json()
    probs = {pred["cad"]["target_id"]: pred["cad"]["probability"]} | {
        v["target_id"]: v["probability"] for v in pred["vessels"]
    }
    r = client.post("/explain", json={"patient": patient})
    assert r.status_code == 200
    exps = r.json()["explanations"]
    assert [e["target_id"] for e in exps] == target_ids()
    for e in exps:
        total = (
            e["base_value"] + sum(c["shap"] for c in e["contributions"]) + e["other_contribution"]
        )
        assert total == pytest.approx(e["log_odds"], abs=1e-6)
        assert e["log_odds"] == pytest.approx(logit(probs[e["target_id"]]), abs=1e-3)
        assert e["probability"] == pytest.approx(probs[e["target_id"]], abs=1e-4)


def test_explain_top_k_and_target_filter(client, patient):
    r = client.post("/explain", json={"patient": patient, "targets": ["lad"], "top_k": 5})
    e = r.json()["explanations"]
    assert len(e) == 1 and e[0]["target_id"] == "lad" and e[0]["vessel_id"] == "LAD"
    shaps = [abs(c["shap"]) for c in e[0]["contributions"]]
    assert len(shaps) == 5 and shaps == sorted(shaps, reverse=True)


def test_explain_reports_value_and_normal_range_status(client, patient):
    r = client.post(
        "/explain", json={"patient": {**patient, "fbs": 250, "hdl": 30}, "targets": ["cad"]}
    )
    contrib = {c["feature"]: c for c in r.json()["explanations"][0]["contributions"]}
    assert contrib["fbs"]["status"] == "high" and contrib["fbs"]["value"] == 250
    assert contrib["hdl"]["status"] == "low"
    assert contrib["sex"]["status"] is None and contrib["sex"]["display_value"] in {
        "Male",
        "Female",
    }


def test_explain_rejects_unknown_target(client, patient):
    assert client.post("/explain", json={"patient": patient, "targets": ["lm"]}).status_code == 422


# ---------------------------------------------------------------------- /patients/sample
def test_samples_cover_three_kinds_with_true_labels(samples):
    assert [s["kind"] for s in samples] == ["normal", "single_vessel", "multi_vessel"]
    normal, single, multi = samples
    assert normal["true_labels"] == {"cad": 0, "lad": 0, "lcx": 0, "rca": 0}
    assert sum(single["true_labels"][t] for t in ("lad", "lcx", "rca")) == 1
    assert sum(multi["true_labels"][t] for t in ("lad", "lcx", "rca")) == 3
    for s in samples:
        assert "in-sample" in s["source"]
        assert not {k.lower() for k in s["patient"]} & TARGET_NAMES


def test_samples_round_trip_through_predict(client, samples):
    risk = {}
    for s in samples:
        r = client.post("/predict", json={"patient": s["patient"]})
        assert r.status_code == 200
        risk[s["kind"]] = r.json()["cad"]["probability"]
    assert risk["normal"] < risk["single_vessel"] <= risk["multi_vessel"] + 1e-9


def test_samples_filter_by_kind(client):
    r = client.get("/patients/sample", params={"kind": "multi_vessel"})
    assert r.status_code == 200 and len(r.json()) == 1
    assert client.get("/patients/sample", params={"kind": "nope"}).status_code == 404


# ----------------------------------------------------------------------------------- CORS
def test_cors_allows_local_frontend(client):
    r = client.options(
        "/predict",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_origin_regex_from_env(monkeypatch):
    import re

    from app.settings import Settings

    pattern = r"https://cardioscope(-[a-z0-9-]+)?\.vercel\.app"
    monkeypatch.setenv("CARDIOSCOPE_CORS_ORIGIN_REGEX", pattern)
    s = Settings()
    assert s.cors_origin_regex == pattern
    assert re.fullmatch(s.cors_origin_regex, "https://cardioscope.vercel.app")
    assert re.fullmatch(s.cors_origin_regex, "https://cardioscope-git-main-ayush.vercel.app")
    assert not re.fullmatch(s.cors_origin_regex, "https://evil-cardioscope.vercel.app.attacker.com")
