"""Orthogonal dials that compose over any generator output (seeded, deterministic)."""
from __future__ import annotations
import numpy as np
import pandas as pd
from .generators import GenResult, _rng, _sigmoid


def with_leakage(gr: GenResult, seed: int, name: str, strength: float = 1.0,
                 dampen_corr: float = 1.0) -> GenResult:
    """Inject a proxy column derived from the label. `dampen_corr` < 1 makes the
    leak statistically quieter (harder for a correlation screen) while its NAME
    stays semantically suspicious — the V1 'name-only' leak case."""
    g = _rng(seed)
    y = gr.y
    proxy = y * strength + g.normal(0, 1.0 / max(dampen_corr, 1e-3), size=len(y))
    X = gr.X.copy()
    X[name] = proxy
    leaks = list(gr.truth.get("leak_cols", [])) + [name]
    truth = {**gr.truth, "leak_cols": leaks}
    return GenResult(X, y, truth, {**gr.meta, "leak_injected": name})


def with_decoy(gr: GenResult, seed: int, name: str) -> GenResult:
    """A suspicious-LOOKING but harmless column (independent of the label).
    Used to measure a screen's false-positive rate."""
    g = _rng(seed)
    X = gr.X.copy()
    X[name] = g.normal(size=len(gr.y))  # zero correlation with y by construction
    decoys = list(gr.truth.get("decoy_cols", [])) + [name]
    return GenResult(X, gr.y, {**gr.truth, "decoy_cols": decoys},
                     {**gr.meta, "decoy_injected": name})


def with_missing(gr: GenResult, seed: int, cols: list[str], rate: float = 0.2,
                 mechanism: str = "MCAR") -> GenResult:
    g = _rng(seed)
    X = gr.X.copy()
    n = len(X)
    for c in cols:
        if mechanism == "MCAR":
            mask = g.uniform(size=n) < rate
        elif mechanism == "MAR":  # missingness depends on another observed col
            other = X.columns[0]
            mask = g.uniform(size=n) < _sigmoid((X[other] - X[other].mean()) * 2) * rate * 2
        else:  # MNAR: missingness depends on the value itself
            mask = g.uniform(size=n) < _sigmoid((X[c] - X[c].mean()) * 2) * rate * 2
        X.loc[mask, c] = np.nan
    return GenResult(X, gr.y, {**gr.truth, "missing_mechanism": mechanism},
                     {**gr.meta, "missing_cols": cols})
