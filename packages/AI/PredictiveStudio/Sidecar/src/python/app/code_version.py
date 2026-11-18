"""CodeVersion for every trainer run: the library versions, sidecar version, PS git commit, thread count and seed.

Library versions come from the installed distributions (importlib.metadata), never from constants, so the record
cannot drift from what actually ran. The PS git SHA is read from `PS_GIT_SHA` (the variable the Engine's
`AssemblyCodeVersion` reads; the TypeScript `MLSidecar` passes it through from its own environment at spawn); the
sidecar version is the Sidecar package's package.json version.
"""

from __future__ import annotations

import json
import os
import platform
from importlib import metadata
from pathlib import Path
from typing import Dict

from .trainer_schemas import CodeVersion

# Reported name -> installed distribution name. Includes every library the lineage requires.
LIBRARIES: Dict[str, str] = {
    "numpy": "numpy", "pandas": "pandas", "scikit-learn": "scikit-learn", "scipy": "scipy", "xgboost": "xgboost",
    "lightgbm": "lightgbm", "joblib": "joblib", "threadpoolctl": "threadpoolctl", "pydantic": "pydantic",
}
# Resolved from this module's location (app/ -> python/ -> src/ -> Sidecar/), never from the working directory.
PACKAGE_JSON = Path(__file__).resolve().parents[3] / "package.json"


def library_versions() -> Dict[str, str]:
    out = {"python": platform.python_version()}
    for key, dist in LIBRARIES.items():
        out[key] = metadata.version(dist)
    return out


def sidecar_version() -> str:
    try:
        return str(json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))["version"])
    except (OSError, KeyError, json.JSONDecodeError):
        return "unknown"


def code_version(threads: int, seed: int) -> CodeVersion:
    # `or`: an empty PS_GIT_SHA is unrecorded too, the same rule as the Engine's AssemblyCodeVersion.
    return CodeVersion(psGitSha=os.environ.get("PS_GIT_SHA") or "unrecorded", sidecarVersion=sidecar_version(),
                       libraryVersions=library_versions(), threads=threads, seed=seed)
