"""Load the raw Z-Alizadeh Sani extension file and produce the cleaned dataset.

Cleaning here is *deterministic and row-wise only*: renaming columns to config ids
and mapping text codes (Y/N, Male/Fmale, Stenotic/Normal, ...) to numbers using the
fixed encodings in features.yaml / targets.yaml. Nothing is learned from the data,
so this step cannot leak information across CV folds. Anything fitted (scaling,
imputation, one-hot encoding, feature selection) happens inside CV in Phase 2.

Run:  python -m cardioscope_ml.data
"""

from __future__ import annotations

import pandas as pd

from cardioscope_ml.config import dataset_paths, feature_specs, target_specs


def load_raw() -> pd.DataFrame:
    """Read the raw Excel sheet unchanged (the raw file itself is never modified)."""
    p = dataset_paths()
    df = pd.read_excel(p.raw, sheet_name=p.sheet)
    df.columns = [str(c).strip() for c in df.columns]
    for c in df.select_dtypes(include=["object", "string"]).columns:
        df[c] = df[c].str.strip()
    return df


def _map_strict(series: pd.Series, mapping: dict, name: str) -> pd.Series:
    unknown = set(series.dropna().unique()) - set(mapping)
    if unknown:
        raise ValueError(f"{name}: unexpected raw values {sorted(map(str, unknown))}")
    return series.map(mapping).astype("int64")


def clean(raw: pd.DataFrame) -> pd.DataFrame:
    """Return a dataframe with one column per feature/target id, numerically encoded.

    Categorical features (e.g. BBB) stay as strings; they are one-hot encoded inside
    the CV folds later.
    """
    missing = [s["column"] for s in feature_specs() + target_specs() if s["column"] not in raw]
    if missing:
        raise KeyError(f"Columns from config not found in raw data: {missing}")

    out = pd.DataFrame(index=raw.index)
    for f in feature_specs():
        col = raw[f["column"]]
        if f["type"] in ("binary", "ordinal"):
            out[f["id"]] = _map_strict(col, f["encoding"], f["id"])
        elif f["type"] == "categorical":
            unknown = set(col.unique()) - set(f["categories"])
            if unknown:
                raise ValueError(f"{f['id']}: unexpected categories {sorted(unknown)}")
            out[f["id"]] = col.astype(str)
        else:
            out[f["id"]] = pd.to_numeric(col, errors="raise").astype(float)

    for t in target_specs():
        out[t["id"]] = _map_strict(raw[t["column"]], {t["positive"]: 1, t["negative"]: 0}, t["id"])

    out.insert(0, "patient_id", range(len(out)))  # 0-based row index in the raw sheet
    return out


def load_clean() -> pd.DataFrame:
    return clean(load_raw())


def main() -> None:
    p = dataset_paths()
    df = load_clean()
    if len(df) != p.expected_rows:
        raise ValueError(f"Expected {p.expected_rows} rows, got {len(df)}")
    p.processed.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(p.processed, index=False)
    print(f"Wrote {p.processed} with shape {df.shape}")


if __name__ == "__main__":
    main()
