"""
Session plumbing (A6.9.1): the SessionLibrary (components built so far — feeds
Block 5), the TrainBudget (hard cap on estimator fits — the graveyard's
unbounded-search row, enforced), and the LLM-call ledger (<=30 hard).
"""
from __future__ import annotations
import json
from pathlib import Path

RESULTS = Path(__file__).resolve().parent.parent / "results"
LLM_CAP = 30


class BudgetExceeded(RuntimeError):
    pass


class TrainBudget:
    """Counts EVERY estimator fit in the session; exceeding raises (hard fail)."""

    def __init__(self, max_fits: int):
        self.max_fits = max_fits
        self.used = 0
        self.log: list[str] = []

    def spend(self, what: str) -> None:
        self.used += 1
        self.log.append(what)
        if self.used > self.max_fits:
            raise BudgetExceeded(f"train budget exceeded: {self.used}/{self.max_fits} at '{what}'")

    def state(self) -> str:
        return f"{self.used}/{self.max_fits} fits used"


class LLMLedger:
    def __init__(self, cap: int = LLM_CAP):
        self.cap = cap
        self.calls: list[str] = []

    def spend(self, tag: str) -> None:
        self.calls.append(tag)
        if len(self.calls) > self.cap:
            raise BudgetExceeded(f"LLM ledger exceeded: {len(self.calls)}/{self.cap} at '{tag}'")


class SessionLibrary:
    """Components built this session — the standalone twin of the trained-capabilities
    library. Records feed Block 5 (REUSE) of later situations."""

    def __init__(self, run_id: str):
        self.run_id = run_id
        self.records: list[dict] = []

    def register(self, *, nominal_name: str, technical: str, emits: list[str],
                 groundings: list[str], holdout: str, narrative: str,
                 built_in: str, feature_importance: dict | None = None) -> dict:
        rec = dict(nominal_name=nominal_name, technical=technical, emits=emits,
                   groundings=groundings, holdout=holdout, narrative=narrative,
                   built_in=built_in, feature_importance=feature_importance or {})
        self.records.append(rec)
        return rec

    def for_block5(self) -> list[dict]:
        return self.records

    def save(self) -> Path:
        p = RESULTS / f"session_library_{self.run_id}.json"
        p.write_text(json.dumps(self.records, indent=2, default=str))
        return p
