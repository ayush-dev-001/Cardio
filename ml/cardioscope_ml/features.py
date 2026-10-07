"""Feature matrix construction and the (fold-safe) preprocessing transformer.

The preprocessor is always the first step of a model Pipeline, so imputation,
scaling and one-hot encoding are re-fitted on the training part of every CV fold.
"""

from __future__ import annotations

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from cardioscope_ml.config import assert_no_leakage, feature_specs, model_feature_ids


def feature_types() -> dict[str, str]:
    return {f["id"]: f["type"] for f in feature_specs() if f.get("use_in_model", True)}


def get_xy(df: pd.DataFrame, target: str) -> tuple[pd.DataFrame, pd.Series]:
    """Model inputs (config features only) and the binary label for `target`."""
    feats = model_feature_ids()
    X = df[feats].copy()
    assert_no_leakage(list(X.columns))
    return X, df[target].astype(int)


def build_preprocessor(
    scale: bool, extra_numeric: tuple[str, ...] = (), features: list[str] | None = None
) -> ColumnTransformer:
    """Impute (+ optionally scale) numeric-like columns; impute + one-hot categoricals.

    `extra_numeric` holds additional inputs such as classifier-chain predictions.
    `features` restricts the inputs to a subset (e.g. a baseline model); other columns are dropped.
    """
    types = feature_types()
    if features is not None:
        assert_no_leakage(list(features))
        unknown = set(features) - set(types)
        if unknown:
            raise KeyError(f"Unknown features in model config: {sorted(unknown)}")
        types = {f: t for f, t in types.items() if f in features}
    numeric = [f for f, t in types.items() if t != "categorical"] + list(extra_numeric)
    categorical = [f for f, t in types.items() if t == "categorical"]

    num_steps = [("impute", SimpleImputer(strategy="median"))]
    if scale:
        num_steps.append(("scale", StandardScaler()))
    cat_steps = [
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ]
    return ColumnTransformer(
        [("num", Pipeline(num_steps), numeric), ("cat", Pipeline(cat_steps), categorical)],
        verbose_feature_names_out=False,
    )


def output_to_feature_map(out_names: list[str], extra: tuple[str, ...] = ()) -> list[str]:
    """Map each transformed column (e.g. 'bbb_LBBB') back to its source feature id."""
    types = feature_types()
    known = set(types) | set(extra)
    categorical = [f for f, t in types.items() if t == "categorical"]
    mapped = []
    for name in out_names:
        if name in known:
            mapped.append(name)
            continue
        src = next((c for c in categorical if name.startswith(c + "_")), None)
        if src is None:
            raise KeyError(f"Cannot map transformed column {name!r} to a feature")
        mapped.append(src)
    return mapped
