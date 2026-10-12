"""Phase 2 checks: leakage, fold-safe preprocessing, calibration/threshold logic,
and the saved models (prediction + exact SHAP additivity)."""

import json

import numpy as np
import pytest
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline

from cardioscope_ml import config
from cardioscope_ml.calibration import PlattCalibrator, logit, recall_threshold
from cardioscope_ml.data import load_clean
from cardioscope_ml.features import get_xy
from cardioscope_ml.models import build_pipeline, model_families
from cardioscope_ml.nested_cv import chain_feature, outer_splits
from cardioscope_ml.predictor import load_model

TARGET_NAMES = {"lad", "lcx", "rca", "cath", "cad"}
SAVED = [t for t in config.target_ids() if (config.MODELS_DIR / f"{t}.joblib").exists()]


@pytest.fixture(scope="module")
def df():
    return load_clean()


# ------------------------------------------------------------------- target leakage
@pytest.mark.parametrize("target", config.target_ids())
def test_training_matrix_has_no_target_columns(df, target):
    X, y = get_xy(df, target)
    assert not {c.lower() for c in X.columns} & TARGET_NAMES
    assert len(X) == len(y)


def test_chain_inputs_are_predictions_not_labels():
    for t in config.vessel_target_order():
        name = chain_feature(t)
        assert name.startswith("pred_") and name.lower() not in TARGET_NAMES


@pytest.mark.parametrize("target", SAVED)
def test_saved_model_inputs_exclude_targets(target):
    m = load_model(target)
    assert not {f.lower() for f in m.feature_ids} & TARGET_NAMES
    assert m.feature_ids == config.model_feature_ids()


# ------------------------------------------------------- preprocessing inside the folds
@pytest.mark.parametrize("family", model_families())
def test_preprocessing_is_first_pipeline_step(family):
    pipe = build_pipeline(family, seed=0)
    assert isinstance(pipe, Pipeline)
    name, step = pipe.steps[0]
    assert name == "prep" and isinstance(step, ColumnTransformer)


def test_outer_splits_cover_every_patient_once_per_repeat(df):
    s = config.load_models()["validation"]
    splits = outer_splits(df, s, seed=0)
    assert len(splits) == s["outer_folds"] * s["outer_repeats"]
    for r in range(s["outer_repeats"]):
        tests = np.concatenate(
            [te for _, te in splits[r * s["outer_folds"] : (r + 1) * s["outer_folds"]]]
        )
        assert sorted(tests) == list(range(len(df)))
    for tr, te in splits:
        assert not set(tr) & set(te)


# --------------------------------------------------------- calibration and thresholds
def test_recall_threshold_meets_target():
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 500)
    p = np.clip(0.3 * y + rng.random(500) * 0.7, 0, 1)
    for target in (0.7, 0.8, 0.9, 1.0):
        thr = recall_threshold(p, y, target)
        assert ((p >= thr) & (y == 1)).sum() / y.sum() >= target
        # a slightly higher threshold would break the recall target
        if target < 1.0:
            assert ((p >= thr + 1e-9) & (y == 1)).sum() / y.sum() < target


def test_platt_calibrator_is_monotone_and_improves_overconfident_scores():
    rng = np.random.default_rng(1)
    y = rng.integers(0, 2, 2000)
    true_p = np.where(y == 1, 0.65, 0.35)
    raw = 1 / (1 + np.exp(-4 * logit(true_p + rng.normal(0, 0.05, 2000))))  # overconfident
    cal = PlattCalibrator().fit(raw, y)
    grid = np.linspace(0.01, 0.99, 50)
    assert np.all(np.diff(cal.transform(grid)) > 0)
    assert np.mean((cal.transform(raw) - y) ** 2) < np.mean((raw - y) ** 2)


@pytest.mark.parametrize("spread", [6, 8, 10])
def test_platt_fit_converges_on_widely_spread_scores(spread):
    # plain Newton diverged here (a ~ 1e10); the line search must keep the fit finite and sane
    rng = np.random.default_rng(0)
    z = rng.normal(0, spread, 200)
    y = (rng.random(200) < 1 / (1 + np.exp(-z / spread * 2))).astype(int)
    cal = PlattCalibrator().fit(1 / (1 + np.exp(-z)), y)
    assert 0 < cal.a < 1 and abs(cal.b) < 1


# ------------------------------------------------------- baseline and ensemble comparators
def test_baseline_uses_only_its_configured_features(df):
    from cardioscope_ml.models import baseline_families, model_spec

    for b in baseline_families():
        feats = model_spec(b)["features"]
        config.assert_no_leakage(feats)
        X, y = get_xy(df, "cad")
        pipe = build_pipeline(b, seed=0).fit(X, y)
        used = set(pipe.named_steps["prep"].get_feature_names_out())
        assert used and all(any(u == f or u.startswith(f + "_") for f in feats) for u in used)


def test_baselines_are_never_candidates():
    from cardioscope_ml.models import baseline_families

    assert not set(baseline_families()) & set(model_families())


# ------------------------------------------------------------------- saved models
@pytest.mark.parametrize("target", SAVED)
def test_saved_model_predicts_probabilities(df, target):
    m = load_model(target)
    p = m.predict_proba(df.head(20))
    assert p.shape == (20,) and np.all((p >= 0) & (p <= 1))
    assert set(np.unique(m.predict(df.head(20)))) <= {0, 1}
    assert 0 < m.threshold < 1


@pytest.mark.parametrize("target", SAVED)
def test_saved_shap_is_exactly_additive(df, target):
    m = load_model(target)
    X = df.sample(25, random_state=0)
    e = m.explain(X)
    assert list(e.values.columns) == m.feature_ids
    np.testing.assert_allclose(
        e.base_value + e.values.sum(axis=1), logit(m.predict_proba(X)), atol=1e-3
    )


def test_metrics_json_complete():
    path = config.MODELS_DIR / "metrics.json"
    if not path.exists():
        pytest.skip("models not trained yet")
    m = json.loads(path.read_text(encoding="utf-8"))
    for t in config.target_ids():
        cv = m["targets"][t]["cv"]
        for fam in model_families():
            for metric in ["accuracy", "precision", "recall", "f1", "roc_auc", "brier"]:
                s = cv[fam][metric]
                assert s["ci_low"] <= s["mean"] <= s["ci_high"], (t, fam, metric)


def test_subgroup_masks_partition_the_cohort(df):
    from cardioscope_ml.evaluate import subgroup_mask

    groups = {g["id"]: subgroup_mask(df, g) for g in config.load_models()["subgroups"]}
    for a, b in [("women", "men"), ("age_lt60", "age_ge60"), ("diabetic", "non_diabetic")]:
        assert not (groups[a] & groups[b]).any()
        assert (groups[a] | groups[b]).all()
