"""Trainer failure stages and the run clock.

A TrainerFailure carries the contract's stage; the route turns it into `{status: 'failed', stage, message,
computeSeconds}` and never returns partial metrics. `RunClock` measures the run's elapsed seconds (wall clock, the
figure reported as `computeSeconds`) and enforces the request timeout and the protocol's compute budget against that
one clock, with a hard stop at every check point.
"""

from __future__ import annotations

import time
from typing import Literal

# The contract's TrainerFailureStage (Core `trainer-contract.ts`).
FailedStage = Literal["load-snapshot", "inner-cv", "holdout", "baselines", "timeout", "budget-exceeded"]


class TrainerFailure(Exception):
    """A run that stopped at `stage`; the message is for people, the stage is what callers branch on."""

    def __init__(self, stage: FailedStage, message: str) -> None:
        super().__init__(message)
        self.stage: FailedStage = stage
        self.message = message


SnapshotProblem = Literal["expired-url", "download-failed", "hash-mismatch", "malformed", "non-numeric", "infinite"]


class SnapshotLoadFailure(TrainerFailure):
    """Stage `load-snapshot` with a structured reason (and the column, for a cell problem), so callers and tests branch
    on `.problem`/`.column`, never on the message text."""

    def __init__(self, problem: SnapshotProblem, message: str, column: str | None = None) -> None:
        super().__init__("load-snapshot", message)
        self.problem: SnapshotProblem = problem
        self.column = column


class RequestRefused(ValueError):
    """A request the sidecar must not run at all (HTTP 400): e.g. a primary score of another family."""


class RunClock:
    """The run's one clock: elapsed wall-clock seconds since construction, checked against the request timeout and
    the protocol's compute budget."""

    def __init__(self, timeout_seconds: float, max_compute_seconds: float) -> None:
        self._start = time.perf_counter()
        self.timeout_seconds = timeout_seconds
        self.max_compute_seconds = max_compute_seconds

    def compute_seconds(self) -> float:
        """Elapsed wall-clock seconds, as the legacy route's `duration_sec` and the run's `computeSeconds` report."""
        return time.perf_counter() - self._start

    def check(self, where: str) -> None:
        """Raise `TrainerFailure('timeout')` past the request timeout, else `TrainerFailure('budget-exceeded')` past
        the compute budget; `where` names the step for the message."""
        elapsed = self.compute_seconds()
        if elapsed > self.timeout_seconds:
            raise TrainerFailure("timeout", f"timeout of {self.timeout_seconds}s exceeded during {where}")
        if elapsed > self.max_compute_seconds:
            raise TrainerFailure("budget-exceeded", f"compute budget of {self.max_compute_seconds}s exceeded during {where}")
