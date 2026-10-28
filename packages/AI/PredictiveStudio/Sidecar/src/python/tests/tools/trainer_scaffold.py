"""Shared unit-test scaffolding for the trainer tests: a synthetic binary frame, its feature encodings, the binary task
and a `server` pytest fixture over `FileServer`. Import `server` into a test module to use the fixture."""

from __future__ import annotations

from collections.abc import Iterator

import numpy as np
import pandas as pd
import pytest

from tests.tools.trainer_fixture import NUMERIC, FileServer, JsonObject


def binary_frame(n: int = 1200, seed: int = 3, noise: bool = False) -> pd.DataFrame:
    """A binary-outcome frame with two numeric features (x1 10% missing), one categorical feature and a decision year
    in 2021–2024; `noise=True` makes the label independent of the features."""
    rng = np.random.default_rng(seed)
    x1 = rng.normal(size=n)
    x2 = rng.normal(size=n)
    city = rng.choice(["NYC", "LA", "SF", "CHI"], size=n)
    logit = -0.5 + (0.0 if noise else 1.2 * x1 - 0.8 * x2 + 0.6 * (city == "SF"))
    y = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(int)
    x1[rng.random(n) < 0.1] = np.nan
    years = rng.choice([2021, 2022, 2023, 2024], size=n)
    return pd.DataFrame({"ID": [f"r{i}" for i in range(n)], "EntityKey": [f"e{i // 3}" for i in range(n)],
                         "T": [f"{y_}-06-01" for y_ in years], "x1": x1, "x2": x2, "city": city, "Target": y})


FEATS: dict[str, JsonObject] = {"x1": NUMERIC, "x2": NUMERIC,
                                "city": {"kind": "categorical", "cardinalityCap": 10, "method": "onehot"}}

TASK: JsonObject = {"kind": "binary", "classOrder": ["no", "yes"], "adverseIndex": 1}


@pytest.fixture()
def server() -> Iterator[FileServer]:
    s = FileServer()
    yield s
    s.close()
