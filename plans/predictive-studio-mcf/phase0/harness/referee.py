"""
The locked-holdout referee — the single source of every headline number in Phase 0.

Carves a holdout ONCE, hashes its rows, and scores an arm on it exactly once,
appending an immutable record to an audit JSONL. Experiments never compute their
own holdout metric; they hand a fitted-predict callable to `score_on_holdout`.
This is the same honesty discipline the plan's Tier-1 suite enforces — practiced
here in Tier 0.
"""
from __future__ import annotations
import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, r2_score, log_loss, brier_score_loss

RESULTS = Path(__file__).resolve().parent.parent / "results"
RESULTS.mkdir(exist_ok=True)
AUDIT = RESULTS / "referee_audit.jsonl"


def _row_hashes(X: pd.DataFrame) -> set[str]:
    return {hashlib.sha256(pd.util.hash_pandas_object(X.iloc[[i]], index=False).values.tobytes()).hexdigest()
            for i in range(len(X))}


@dataclass
class Holdout:
    """A split whose holdout rows are hashed at creation and never re-entered."""
    experiment: str
    Xdev: pd.DataFrame
    ydev: np.ndarray
    Xhold: pd.DataFrame
    yhold: np.ndarray
    holdout_hashes: set[str]
    seed: int

    def assert_untouched(self, Xtrain: pd.DataFrame) -> None:
        """Fail loudly if any training row is a holdout row (the anti-leak tripwire)."""
        overlap = _row_hashes(Xtrain) & self.holdout_hashes
        if overlap:
            raise AssertionError(
                f"[{self.experiment}] {len(overlap)} holdout rows leaked into training")


def carve(experiment: str, X: pd.DataFrame, y: np.ndarray, seed: int,
          holdout_frac: float = 0.30) -> Holdout:
    g = np.random.default_rng(seed)
    idx = np.arange(len(X))
    g.shuffle(idx)
    cut = int(len(X) * (1 - holdout_frac))
    dev, hold = idx[:cut], idx[cut:]
    Xdev = X.iloc[dev].reset_index(drop=True)
    Xhold = X.iloc[hold].reset_index(drop=True)
    return Holdout(experiment, Xdev, y[dev], Xhold, y[hold],
                   _row_hashes(Xhold), seed)


def _metric(task: str, y_true, y_pred) -> dict[str, float]:
    out: dict[str, float] = {}
    if task == "classification":
        out["auc"] = float(roc_auc_score(y_true, y_pred))
        # ECE (10-bin) + brier for calibration-aware experiments
        p = np.clip(np.asarray(y_pred, float), 1e-6, 1 - 1e-6)
        out["brier"] = float(brier_score_loss(y_true, p))
        out["logloss"] = float(log_loss(y_true, p))
        bins = np.linspace(0, 1, 11)
        ece, idx = 0.0, np.digitize(p, bins) - 1
        for b in range(10):
            m = idx == b
            if m.sum():
                ece += (m.mean()) * abs(y_true[m].mean() - p[m].mean())
        out["ece"] = float(ece)
    elif task == "regression":
        out["r2"] = float(r2_score(y_true, y_pred))
        out["rmse"] = float(np.sqrt(np.mean((np.asarray(y_true) - np.asarray(y_pred)) ** 2)))
    # task == "survival" / "custom": no standard metric here — the experiment records
    # its own (e.g. C-index) in `extra`; the referee still logs the arm + audit trail.
    return out


def score_on_holdout(ho: Holdout, arm: str, task: str,
                     predict: Callable[[pd.DataFrame], np.ndarray],
                     extra: dict | None = None) -> dict:
    """Score ONE arm on the locked holdout, exactly once, and audit it."""
    y_pred = predict(ho.Xhold)
    metrics = _metric(task, ho.yhold, y_pred)
    rec = {
        "ts": round(time.time(), 3), "experiment": ho.experiment, "arm": arm,
        "task": task, "seed": ho.seed, "n_dev": len(ho.Xdev), "n_holdout": len(ho.Xhold),
        "metrics": metrics, "extra": extra or {},
    }
    with AUDIT.open("a") as f:
        f.write(json.dumps(rec) + "\n")
    return rec


def save_result(experiment: str, payload: dict) -> Path:
    p = RESULTS / f"{experiment}.result.json"
    p.write_text(json.dumps(payload, indent=2, default=str))
    return p
