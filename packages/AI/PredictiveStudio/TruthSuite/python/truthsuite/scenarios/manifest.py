# probes/scenarios/manifest.py — one accessor for a series scenario's rolling-origin design (P3 fix round 1).
#
# Where each scenario keeps the object (same fields K, H, firstTestPeriod in both places):
#   - P2 planted series (T1p, T3, T4; make_scenario.ts):  manifest["planted"]["rollingOrigin"]
#   - P3 real series (T1-real; build_real.py):              manifest["rollingOrigin"]  (planted is null for real data)
# Semantics (P2's): periods are 0-indexed in T order; firstTestPeriod = nPeriods - K*H; origin k (1-based) trains on
# periods t <= o_k and tests o_k < t <= o_k + H, with o_k = firstTestPeriod + (k - 1)*H - 1.
# P5/P6 read the design through rolling_origin() only.
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class RollingOrigin:
    K: int
    H: int
    firstTestPeriod: int

    def origin(self, k: int) -> int:
        """Index of the last training period of origin k (1-based)."""
        if not 1 <= k <= self.K:
            raise ValueError(f"origin {k} outside 1..{self.K}")
        return self.firstTestPeriod + (k - 1) * self.H - 1


def _parse(ro: object) -> RollingOrigin:
    if not isinstance(ro, Mapping) or sorted(ro) != ["H", "K", "firstTestPeriod"]:
        raise ValueError(f"rollingOrigin must have exactly K, H, firstTestPeriod: {ro!r}")
    vals = {k: ro[k] for k in ("K", "H", "firstTestPeriod")}
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in vals.values()):
        raise ValueError(f"rollingOrigin fields must be integers: {ro!r}")
    return RollingOrigin(K=int(vals["K"]), H=int(vals["H"]), firstTestPeriod=int(vals["firstTestPeriod"]))


def rolling_origin(manifest: Mapping[str, object]) -> RollingOrigin:
    """The scenario's rolling-origin design, from planted.rollingOrigin (P2) or top-level rollingOrigin (P3)."""
    planted = manifest.get("planted")
    in_planted = planted.get("rollingOrigin") if isinstance(planted, Mapping) else None
    top = manifest.get("rollingOrigin")
    if in_planted is not None and top is not None:
        raise ValueError("rollingOrigin present both under planted and at top level")
    ro = in_planted if in_planted is not None else top
    if ro is None:
        raise KeyError("manifest has no rollingOrigin (not a series scenario)")
    return _parse(ro)
