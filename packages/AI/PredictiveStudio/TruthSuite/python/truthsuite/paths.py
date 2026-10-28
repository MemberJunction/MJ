"""Where the truth suite's data lives: the package root, its committed fixtures and the generated-data cache.

Generated worlds and scenarios are written by the TypeScript data catalog (`pnpm run truth:data`) under the data root,
one directory per seed, and listed in `<data root>/index.json` as `"<kind>/<id>/seed-<k>": "<seed directory>"`; a
finished directory holds a `.complete` marker. The committed real cases live in `fixtures/real/`.

Which seeds a seed set holds is defined once, by the catalog (`src/data/seeds.ts`); this reader only resolves seeds the
catalog has already generated and never re-derives a set.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

DatasetKind = Literal["world", "scenario"]

PACKAGE_ROOT: Path = Path(__file__).resolve().parents[2]
FIXTURES: Path = PACKAGE_ROOT / "fixtures"


def data_root() -> Path:
    """`$TRUTH_DATA_DIR` when set (it must be absolute: the catalog and this reader run from different directories),
    else `<package>/.data`, the catalog's default."""
    env = os.environ.get("TRUTH_DATA_DIR", "")
    if not env:
        return PACKAGE_ROOT / ".data"
    root = Path(env)
    if not root.is_absolute():
        raise ValueError(f"TRUTH_DATA_DIR must be an absolute path, got {env!r}")
    return root


def _read_index(index_path: Path) -> dict[str, str]:
    if not index_path.is_file():
        return {}
    raw: object = json.loads(index_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in raw.items()):
        raise ValueError(f"{index_path} is not an object of seed keys to seed directories")
    return {str(k): str(v) for k, v in raw.items()}


def seed_dir(kind: DatasetKind, dataset_id: str, seed: int) -> Path:
    """The generated directory of one seed. A seed that was never generated, or whose generation did not finish,
    raises KeyError: a missing seed is a failure, never a skip."""
    key = f"{kind}/{dataset_id}/seed-{seed}"
    index_path = data_root() / "index.json"
    index = _read_index(index_path)
    if key not in index:
        raise KeyError(f"{key} is not in {index_path}; generate it with `pnpm run truth:data -- --set <base|t2|n400> --only {dataset_id}`")
    directory = Path(index[key])
    if not (directory / ".complete").is_file():
        raise KeyError(f"{key}: {directory} has no .complete marker; its generation did not finish")
    return directory


def real_fixture(name: str) -> Path:
    """A committed real case under fixtures/real/ (`person_years.parquet`, `R2-real.rows.csv`, …)."""
    path = FIXTURES / "real" / name
    if not path.is_file():
        raise FileNotFoundError(f"{path} is not a committed real-case file")
    return path
