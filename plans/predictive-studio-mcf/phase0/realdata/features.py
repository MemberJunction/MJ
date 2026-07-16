"""
As-of member-period feature assembler for More Cheese Demo V2 (Track A foundation).

The data-assembly pillar, on the real schema. Unit of prediction = a membership
period. For each period we assemble features from the member's engagement history
STRICTLY BEFORE the period's decision date (leakage guard), and derive the real
renewal / time-to-lapse targets from MembershipPeriod itself.

Three column groups are kept DISTINCT on purpose so RD-ASSEMBLE can prove the
leakage screen catches the traps:
  - ASOF_FEATURES  : safe, computed as-of the decision date (engagement, tenure, dues…)
  - LEAK_TRAPS     : post-outcome MembershipPeriod columns that a naive pipeline would
                     include and that trivially reveal the label
                     (CancellationDate, CancellationReason, RenewalDate, Status, EndDate)
  - TARGETS        : renewed (binary), and (duration, event) for survival

Decision date convention: the period StartDate. Engagement is aggregated over the
member's activity with a date < StartDate — i.e. "what did we know about this member
at the moment this period began?" — and we predict whether the period is renewed.
"""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd
from load_morecheese import load_all

# Column-group manifests (also consumed by RD-ASSEMBLE's semantic-screen scoring).
LEAK_TRAPS = ["Status", "CancellationDate", "CancellationReason", "RenewalDate", "EndDate"]
# realistic-looking but SAFE columns (decoys — a good screen must NOT flag these)
DECOY_SAFE = ["MembershipTier", "DuesAmount", "AutoRenew", "Segment", "Region"]

TODAY = pd.Timestamp("2026-07-25")  # dataset max date; "now" for censoring


def _dt(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, errors="coerce")


def _count_before(df: pd.DataFrame, person_col: str, date_col: str,
                  person_id: str, cutoff: pd.Timestamp,
                  mask: pd.Series | None = None) -> int:
    sub = df[df[person_col] == person_id]
    if mask is not None:
        sub = sub[mask.reindex(sub.index, fill_value=False)]
    d = _dt(sub[date_col])
    return int((d < cutoff).sum())


def _recency_days(df: pd.DataFrame, person_col: str, date_col: str,
                  person_id: str, cutoff: pd.Timestamp) -> float:
    sub = df[df[person_col] == person_id]
    d = _dt(sub[date_col])
    d = d[d < cutoff]
    if len(d) == 0:
        return 9999.0
    return float((cutoff - d.max()).days)


def build_period_frame(min_history_days: int = 0) -> dict:
    """Return {'df': member-period feature frame, 'tables': raw tables}.

    The frame has one row per membership period with ASOF_FEATURES + LEAK_TRAPS +
    targets. Periods still Active are marked censored for survival and excluded from
    the binary renewal target (their outcome isn't yet known).
    """
    t = load_all()
    person = t["Person"].set_index("ID")
    mp = t["MembershipPeriod"].copy()
    er = t["EventRegistration"]
    ce = t["CourseEnrollment"]
    orders = t["Order"]
    pay = t["Payment"]

    # precompute date columns
    mp["_start"] = _dt(mp["StartDate"])
    mp["_end"] = _dt(mp["EndDate"])
    mp["_cancel"] = _dt(mp["CancellationDate"])
    er_att = er["Attended"] == 1

    # order Payment by person via Order join (Payment has OrderID, Order has PersonID)
    order_person = orders.set_index("ID")["PersonID"].to_dict()
    pay = pay.copy()
    pay["PersonID"] = pay["OrderID"].map(order_person)

    rows = []
    for _, p in mp.iterrows():
        pid = p["PersonID"]
        cutoff = p["_start"]
        if pd.isna(cutoff):
            continue
        per = person.loc[pid] if pid in person.index else None
        join = _dt(pd.Series([per["JoinDate"]])).iloc[0] if per is not None else pd.NaT
        tenure_days = float((cutoff - join).days) if pd.notna(join) else 0.0

        # ---- ASOF engagement features (strictly before the period start) ----
        events_before = _count_before(er, "PersonID", "RegisteredOn", pid, cutoff)
        events_attended = _count_before(er, "PersonID", "RegisteredOn", pid, cutoff, er_att)
        event_recency = _recency_days(er, "PersonID", "RegisteredOn", pid, cutoff)
        courses_before = _count_before(ce, "PersonID", "EnrolledOn", pid, cutoff)
        courses_completed = _count_before(
            ce, "PersonID", "EnrolledOn", pid, cutoff, ce["Status"] == "Completed")
        orders_before = _count_before(orders, "PersonID", "OrderDate", pid, cutoff)
        order_recency = _recency_days(orders, "PersonID", "OrderDate", pid, cutoff)
        payments_before = _count_before(pay, "PersonID", "PaymentDate", pid, cutoff)
        # prior membership periods for this member that started before this one
        prior = mp[(mp["PersonID"] == pid) & (mp["_start"] < cutoff)]
        prior_periods = int(len(prior))
        prior_lapses = int((prior["Status"] == "Lapsed").sum())

        attend_rate = events_attended / events_before if events_before else 0.0
        complete_rate = courses_completed / courses_before if courses_before else 0.0

        # ---- targets ----
        status = p["Status"]
        renewed = 1 if status == "Renewed" else (0 if status == "Lapsed" else np.nan)
        # survival: duration = (end-or-cancel or today) - start; event=1 if lapsed
        if status == "Lapsed" and pd.notna(p["_cancel"]):
            dur_end = p["_cancel"]
            event = 1
        elif pd.notna(p["_end"]):
            dur_end = min(p["_end"], TODAY)
            event = 0  # renewed/active/pending → censored for "lapse" event
        else:
            dur_end = TODAY
            event = 0
        duration = max(float((dur_end - cutoff).days), 1.0)

        rows.append({
            "PeriodID": p["ID"], "PersonID": pid,
            # asof features (safe)
            "tenure_days": tenure_days, "prior_periods": prior_periods,
            "prior_lapses": prior_lapses,
            "events_before": events_before, "events_attended": events_attended,
            "attend_rate": round(attend_rate, 4), "event_recency_days": event_recency,
            "courses_before": courses_before, "courses_completed": courses_completed,
            "complete_rate": round(complete_rate, 4),
            "orders_before": orders_before, "order_recency_days": order_recency,
            "payments_before": payments_before,
            "dues_amount": float(p["DuesAmount"]) if pd.notna(p["DuesAmount"]) else 0.0,
            "auto_renew": int(p["AutoRenew"]) if pd.notna(p["AutoRenew"]) else 0,
            "tier": p["MembershipTier"], "segment": per["Segment"] if per is not None else "Unknown",
            "region": per["Region"] if per is not None else "Unknown",
            "start_year": int(cutoff.year),
            # LEAK TRAPS (post-outcome — never used by the honest model)
            "Status": status, "CancellationReason": p["CancellationReason"],
            "cancel_days_after_start": float((p["_cancel"] - cutoff).days) if pd.notna(p["_cancel"]) else np.nan,
            "renewal_year": int(_dt(pd.Series([p["RenewalDate"]])).iloc[0].year) if pd.notna(_dt(pd.Series([p["RenewalDate"]])).iloc[0]) else np.nan,
            # targets
            "renewed": renewed, "duration": duration, "event": event,
        })

    df = pd.DataFrame(rows)
    return {"df": df, "tables": t}


# feature-group accessors ------------------------------------------------------
ASOF_NUM = ["tenure_days", "prior_periods", "prior_lapses", "events_before",
            "events_attended", "attend_rate", "event_recency_days", "courses_before",
            "courses_completed", "complete_rate", "orders_before", "order_recency_days",
            "payments_before", "dues_amount", "auto_renew", "start_year"]
ASOF_CAT = ["tier", "segment", "region"]
LEAK_NUM = ["cancel_days_after_start", "renewal_year"]
LEAK_CAT = ["Status", "CancellationReason"]


def encode(df: pd.DataFrame, cols_num, cols_cat) -> pd.DataFrame:
    """Simple numeric + one-hot encoding for the GBT arms."""
    X = df[cols_num].fillna(-1).copy()
    for c in cols_cat:
        d = pd.get_dummies(df[c].fillna("NA").astype(str), prefix=c)
        X = pd.concat([X, d], axis=1)
    return X


if __name__ == "__main__":
    out = build_period_frame()
    df = out["df"]
    print(f"member-period frame: {len(df)} rows, {df.shape[1]} cols")
    print(f"renewal target: renewed={int((df.renewed==1).sum())} "
          f"lapsed={int((df.renewed==0).sum())} censored/NA={int(df.renewed.isna().sum())}")
    print(f"survival: events(lapse)={int(df.event.sum())} censored={int((df.event==0).sum())}")
    print("\nASOF feature describe (engagement signal):")
    print(df[["tenure_days", "events_attended", "attend_rate", "event_recency_days",
              "prior_lapses", "orders_before"]].describe().round(1).to_string())
    print("\nrenewed rate by attend_rate quартile (does engagement relate to renewal?):"
          .replace("quартile", "quartile"))
    d2 = df.dropna(subset=["renewed"]).copy()
    d2["ar_q"] = pd.qcut(d2["attend_rate"].rank(method="first"), 4, labels=[1, 2, 3, 4])
    print(d2.groupby("ar_q", observed=True)["renewed"].mean().round(3).to_string())
