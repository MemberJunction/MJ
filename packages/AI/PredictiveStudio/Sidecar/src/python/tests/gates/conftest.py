"""Planted-truth gate tests of the trainer. A test that is a gate's measurement carries
`@pytest.mark.gate("<dataset> -> <criterion>")` (the gate's `MJ: Tests` row Name; the gate's check in
integration-test-suite/src/checks/ runs its node id through PsGatePytest.Run); a test that only adds coverage to a gate
measured elsewhere carries `@pytest.mark.covers("<row Name>")`. They read the truth suite's data cache through
truthsuite.paths (tests/tools/trainer_fixture.py; never skipped: a seed missing from the cache fails). 400-seed gates
also carry `seeds400`; they belong to the statistical suite."""

from __future__ import annotations

from collections.abc import Iterator

import pandas as pd
import pytest

from tests.tools.trainer_fixture import NUMERIC, FileServer, JsonObject, world_dir


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "gate(name): planted-truth gate, named as its MJ: Tests row Name")
    config.addinivalue_line("markers", "seeds400: 400-seed statistical gate (suite Training (statistical))")
    config.addinivalue_line("markers", "covers(name): additional coverage for a gate registered with another test")


@pytest.fixture(scope="module")
def server() -> Iterator[FileServer]:
    """One local file server per gate module, serving every snapshot the module's tests publish."""
    s = FileServer()
    yield s
    s.close()


def world(name: str, seed: int) -> pd.DataFrame:
    """One generated world seed's rows (person-cycles), IDs and person keys read as strings."""
    return pd.read_csv(world_dir(name, seed) / "rows.csv", dtype={"ID": str, "PersonID": str})


def world_truth(name: str, seed: int) -> pd.DataFrame:
    """One generated world seed's planted truth (the true probability per row)."""
    return pd.read_csv(world_dir(name, seed) / "truth.csv")


_ONEHOT: JsonObject = {"kind": "categorical", "cardinalityCap": 10, "method": "onehot"}

# The feature encodings of a binary renewal world: its numeric, categorical and boolean member columns plus five noise
# columns, as the product's assembler declares them.
W_BINARY_FEATURES: dict[str, JsonObject] = {
    "Year": NUMERIC,
    "Plan": _ONEHOT,
    "EventsAttended": NUMERIC,
    "IncomeK": NUMERIC,
    "AutoRenew": {"kind": "boolean"},
    "Region": _ONEHOT,
    **{f"Noise{i}": NUMERIC for i in range(1, 6)},
}


def world_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Binary world rows -> trainer frame (EntityKey = person, T = cycle start, Target = renewed as 0/1)."""
    out = df.rename(columns={"PersonID": "EntityKey", "StartDate": "T"}).copy()
    out["Target"] = out["Renewed"].astype(int)
    return out


def last_cycle_ids(df: pd.DataFrame) -> list[str]:
    """The row IDs of the world's last cycle year: the locked holdout."""
    return [str(i) for i in df.loc[df["Year"] == df["Year"].max(), "ID"]]
