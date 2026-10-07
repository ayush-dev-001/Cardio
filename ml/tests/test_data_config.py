"""Phase 1 checks: config <-> dataset consistency and the target-leakage guard."""

import json

import pytest

from cardioscope_ml import config
from cardioscope_ml.data import load_clean, load_raw

TARGET_RAW = {"LAD", "LCX", "RCA", "Cath"}


@pytest.fixture(scope="module")
def raw():
    return load_raw()


@pytest.fixture(scope="module")
def clean_df():
    return load_clean()


def test_every_raw_column_is_described_exactly_once(raw):
    described = [f["column"] for f in config.feature_specs()] + [
        t["column"] for t in config.target_specs()
    ]
    assert len(described) == len(set(described))
    assert set(described) == set(raw.columns)


def test_feature_ids_unique_and_groups_valid():
    ids = [f["id"] for f in config.feature_specs()]
    assert len(ids) == len(set(ids))
    groups = {g["id"] for g in config.load_features()["groups"]}
    assert {f["group"] for f in config.feature_specs()} <= groups


def test_no_target_in_model_features():
    feats = config.model_feature_ids()
    assert not {f.lower() for f in feats} & {
        t.lower() for t in TARGET_RAW | {"cad", "lad", "lcx", "rca"}
    }
    raw_cols = {f["column"] for f in config.feature_specs() if f["id"] in feats}
    assert not raw_cols & TARGET_RAW


@pytest.mark.parametrize("bad", ["LAD", "lcx", "RCA", "Cath", "cad"])
def test_leakage_guard_rejects_targets(bad):
    with pytest.raises(ValueError, match="leakage"):
        config.assert_no_leakage(["age", bad])


def test_clean_data_shape_and_no_missing(clean_df):
    assert len(clean_df) == config.dataset_paths().expected_rows
    assert clean_df.isna().sum().sum() == 0


def test_targets_binary(clean_df):
    for t in config.target_ids():
        assert set(clean_df[t].unique()) == {0, 1}


def test_values_within_valid_range(clean_df):
    for f in config.feature_specs():
        if "valid_range" in f:
            lo, hi = f["valid_range"]
            assert clean_df[f["id"]].between(lo, hi).all(), f["id"]


def test_vessel_targets_match_shared_vessel_config():
    vessels = {v["id"]: v["target_id"] for v in config.load_vessels()["vessels"]}
    vessel_targets = {
        t["vessel_id"]: t["id"] for t in config.target_specs() if t["kind"] == "vessel"
    }
    assert vessels == vessel_targets


def test_derived_features_reproduce_dataset(clean_df):
    from cardioscope_ml.derived import apply_derivations, derived_features

    assert set(derived_features()) == {"bmi", "obesity"}
    for rec in clean_df.to_dict("records"):
        d = apply_derivations({**rec, "bmi": None, "obesity": None})
        assert abs(d["bmi"] - rec["bmi"]) < 1e-6
        assert d["obesity"] == rec["obesity"]
