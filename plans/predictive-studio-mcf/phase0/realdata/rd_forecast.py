"""
RD-FORECAST — S4's execution arm (A6.8): monthly dues revenue, seasonal-naive floor
vs ETS, TIME-ORDERED trailing-12-month holdout (random split refused in code — the
T5 invariant on real data). MASE vs the naive floor.
"""
from __future__ import annotations
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))

import numpy as np
import pandas as pd

from harness import referee as R
from features import build_period_frame
from situations import build_dues_series

HORIZON = 12


def run(df_out=None, budget=None, quiet=False) -> dict:
    out = df_out or build_period_frame()
    s = build_dues_series(out["tables"]["MembershipPeriod"]).astype(float)
    # drop the partial current month; require a full trailing year
    s = s.iloc[:-1]
    n = len(s)
    assert n > 36, "need 3+ years of months"
    train, test = s.iloc[: n - HORIZON], s.iloc[n - HORIZON:]
    # TIME-ORDERED split enforced structurally: test is strictly the trailing window.
    # Any attempt to shuffle here is a bug by construction (no RNG in this module).

    # seasonal-naive floor: repeat the same month last year
    naive_pred = train.iloc[-12:].values[: len(test)]

    # ETS (additive trend + seasonal)
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    ets = ExponentialSmoothing(train.values, trend="add", seasonal="add",
                               seasonal_periods=12).fit()
    if budget: budget.spend("ets")
    ets_pred = ets.forecast(HORIZON)[: len(test)]

    def mase(pred):
        mae = np.mean(np.abs(test.values - pred))
        scale = np.mean(np.abs(train.values[12:] - train.values[:-12]))  # seasonal-naive in-sample MAE
        return float(mae / max(scale, 1e-9))

    m_naive, m_ets = mase(naive_pred), mase(ets_pred)
    verdict = "PASS" if m_ets < m_naive else "FLOOR-WINS"
    if not quiet:
        print("\n=== RD-FORECAST — monthly dues, time-ordered trailing holdout ===")
        print(f"months: {s.index[0]} .. {s.index[-1]} (n={n}); holdout = last {HORIZON}")
        print(f"MASE seasonal-naive = {m_naive:.3f} (the floor)")
        print(f"MASE ETS            = {m_ets:.3f}")
        print(f"→ {verdict} (ETS must beat the naive floor; time-ordered split enforced structurally)")
    R.save_result("rd_forecast", {
        "hypothesis": "ETS beats the seasonal-naive floor on real dues revenue, "
                      "time-ordered validation enforced",
        "n_months": n, "horizon": HORIZON,
        "mase_naive": m_naive, "mase_ets": m_ets, "verdict": verdict,
        "actual_last12": [round(v, 0) for v in test.values],
        "ets_pred": [round(float(v), 0) for v in ets_pred],
        "pass_bar": "MASE(ets) < MASE(seasonal-naive)",
    })
    return {"mase_naive": m_naive, "mase_ets": m_ets, "verdict": verdict}


if __name__ == "__main__":
    run()
