"""Where the truth suite's data lives. TRUTH_DATA_DIR/index.json is written by `pnpm run truth:data` (src/data/cli.ts)."""
from __future__ import annotations

import json
import os
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[2]          # …/TruthSuite
FIXTURES = PACKAGE_ROOT / "fixtures"


def data_root() -> Path:
    return Path(os.environ.get("TRUTH_DATA_DIR") or str(PACKAGE_ROOT / ".data"))  # an empty value counts as unset


def seed_dir(kind: str, dataset_id: str, seed: int) -> Path:
    """The cache directory of one generated seed ('world' | 'scenario'), via the index the TS data CLI maintains."""
    index_file = data_root() / "index.json"
    if not index_file.exists():
        raise FileNotFoundError(f"{index_file} missing: run `pnpm run truth:data -- --set base` first")
    index: dict[str, str] = json.loads(index_file.read_text())
    key = f"{kind}/{dataset_id}/seed-{seed}"
    if key not in index:
        raise KeyError(f"{key} not generated: run `pnpm run truth:data` for it")
    return Path(index[key])


def real_fixture(name: str) -> Path:
    return FIXTURES / "real" / name
