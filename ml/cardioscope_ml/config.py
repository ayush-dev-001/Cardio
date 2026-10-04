"""Load the YAML/JSON configs that define features, targets and vessels."""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = PROJECT_ROOT / "ml" / "configs"
VESSELS_PATH = PROJECT_ROOT / "shared" / "vessels.json"

RANDOM_SEED = 42


def _read_yaml(name: str) -> dict[str, Any]:
    with open(CONFIG_DIR / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


@lru_cache
def load_features() -> dict[str, Any]:
    return _read_yaml("features.yaml")


@lru_cache
def load_targets() -> dict[str, Any]:
    return _read_yaml("targets.yaml")


@lru_cache
def load_vessels() -> dict[str, Any]:
    with open(VESSELS_PATH, encoding="utf-8") as f:
        return json.load(f)


@dataclass(frozen=True)
class DatasetPaths:
    raw: Path
    sheet: str
    processed: Path
    expected_rows: int


def dataset_paths() -> DatasetPaths:
    d = load_targets()["dataset"]
    return DatasetPaths(
        raw=PROJECT_ROOT / d["raw_path"],
        sheet=d["sheet"],
        processed=PROJECT_ROOT / d["processed_path"],
        expected_rows=int(d["expected_rows"]),
    )


def feature_specs() -> list[dict[str, Any]]:
    return load_features()["features"]


def target_specs() -> list[dict[str, Any]]:
    return load_targets()["targets"]


def model_feature_ids() -> list[str]:
    """Cleaned feature ids that models are allowed to use (leakage-checked)."""
    ids = [f["id"] for f in feature_specs() if f.get("use_in_model", True)]
    assert_no_leakage(ids)
    return ids


def target_ids() -> list[str]:
    return [t["id"] for t in target_specs()]


def forbidden_input_names() -> set[str]:
    """Every name (raw column or cleaned id, any case) a target may appear under."""
    names: set[str] = set()
    for t in target_specs():
        names.update({t["id"].lower(), t["column"].lower()})
    return names


def assert_no_leakage(feature_names: list[str]) -> None:
    """Raise if any target (LAD, LCX, RCA, Cath / cad) is among the model inputs."""
    leaked = sorted(n for n in feature_names if str(n).lower() in forbidden_input_names())
    if leaked:
        raise ValueError(f"Target leakage: target columns used as features: {leaked}")
