"""
RD-COMPOSE — composition on real data (V2's real-association gate): does adding
component-extracted structure (engagement cluster-id + activity-cadence HMM state)
lift a calibrated GBT beyond raw as-of features?

Arms (locked-holdout referee, seeds 201-205):
  gbt_asof   : GBT on the honest as-of features (the base)
  gbt_core   : GBT on ASOF_CORE (DatedFeatureSpec-expressible subset) — the A6.7
               integration-reconciliation twin
  composite  : CalibratedClassifierCV(GBT) on as-of + cluster-id(one-hot) + HMM-state
               — components fit on DEV ONLY, applied frozen to holdout (frozen cascade)

Also exposes run_for_session(...) so the S1 verdict executes through this module.
"""
from __future__ import annotations
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.cluster import KMeans
from sklearn.metrics import average_precision_score, silhouette_score
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from harness import referee as R
from features import build_period_frame, ASOF_NUM, ASOF_CAT, encode
from asof_core import ASOF_CORE_NUM, ASOF_CORE_CAT
from situations import ENGAGE_COLS

SEEDS = [201, 202, 203, 204, 205]
N_QUARTERS = 8


def _gbt():
    return XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.08,
                         subsample=0.9, eval_metric="logloss", n_jobs=4, random_state=0)


# ---------- component extractors (fit on dev only; frozen for holdout) ----------

class ClusterComponent:
    """KMeans over standardized engagement features; k by silhouette (2..6)."""

    def fit(self, Xdev_eng: pd.DataFrame, budget=None) -> "ClusterComponent":
        self.scaler = StandardScaler().fit(Xdev_eng)
        Xs = self.scaler.transform(Xdev_eng)
        best_k, best_s = 2, -1.0
        for k in range(2, 7):
            km = KMeans(n_clusters=k, n_init=5, random_state=0).fit(Xs)
            s = silhouette_score(Xs, km.labels_)
            if s > best_s:
                best_k, best_s = k, s
        if budget: budget.spend(f"kmeans(k={best_k})")
        self.k, self.silhouette = best_k, round(float(best_s), 3)
        self.km = KMeans(n_clusters=best_k, n_init=10, random_state=0).fit(Xs)
        return self

    def transform(self, X_eng: pd.DataFrame) -> pd.DataFrame:
        labels = self.km.predict(self.scaler.transform(X_eng))
        return pd.get_dummies(pd.Series(labels, name="cluster"), prefix="cluster") \
                 .reindex(columns=[f"cluster_{i}" for i in range(self.k)], fill_value=0)


class CadenceHMMComponent:
    """Gaussian HMM over per-member quarterly event-activity counts before period start.
    Emits the most-likely state at the period start as one-hot features."""

    def __init__(self, n_states: int = 3):
        self.n_states = n_states

    @staticmethod
    def sequences(frame: pd.DataFrame, er: pd.DataFrame) -> np.ndarray:
        """(n_rows, N_QUARTERS) quarterly registration counts ending at period start."""
        reg = er.copy()
        reg["_d"] = pd.to_datetime(reg["RegisteredOn"], errors="coerce")
        by_person = dict(tuple(reg.dropna(subset=["_d"]).groupby("PersonID")))
        out = np.zeros((len(frame), N_QUARTERS))
        starts = pd.to_datetime(frame["_start"]) if "_start" in frame else None
        for i, (_, row) in enumerate(frame.iterrows()):
            pid = row["PersonID"]
            cutoff = row["_cutoff"]
            sub = by_person.get(pid)
            if sub is None:
                continue
            d = sub["_d"]
            for q in range(N_QUARTERS):
                hi = cutoff - pd.Timedelta(days=91 * q)
                lo = hi - pd.Timedelta(days=91)
                out[i, N_QUARTERS - 1 - q] = ((d >= lo) & (d < hi)).sum()
        return out

    def fit(self, seq_dev: np.ndarray, budget=None) -> "CadenceHMMComponent":
        from hmmlearn.hmm import GaussianHMM
        X = seq_dev.reshape(-1, 1).astype(float)
        lengths = [seq_dev.shape[1]] * seq_dev.shape[0]
        self.hmm = GaussianHMM(n_components=self.n_states, covariance_type="diag",
                               n_iter=50, random_state=0)
        self.hmm.fit(X, lengths)
        if budget: budget.spend(f"hmm({self.n_states} states)")
        return self

    def transform(self, seq: np.ndarray) -> pd.DataFrame:
        states = np.zeros(len(seq), dtype=int)
        for i in range(len(seq)):
            _, sts = self.hmm.decode(seq[i].reshape(-1, 1).astype(float))
            states[i] = sts[-1]  # the state the member is IN at the period start
        return pd.get_dummies(pd.Series(states, name="hmm"), prefix="hmm_state") \
                 .reindex(columns=[f"hmm_state_{i}" for i in range(self.n_states)], fill_value=0)


# ---------- the experiment ----------

def _prep(df_out=None):
    out = df_out or build_period_frame()
    df = out["df"]
    lab = df.dropna(subset=["renewed"]).reset_index(drop=True)
    # cutoff column for HMM sequences
    mp = out["tables"]["MembershipPeriod"][["ID", "StartDate"]].rename(
        columns={"ID": "PeriodID"})
    lab = lab.merge(mp, on="PeriodID", how="left")
    lab["_cutoff"] = pd.to_datetime(lab["StartDate"], errors="coerce")
    return out, lab


def run_arms(lab: pd.DataFrame, er: pd.DataFrame, seeds=SEEDS, budget=None) -> dict:
    y = lab["renewed"].astype(int).to_numpy()
    Xasof = encode(lab, ASOF_NUM, ASOF_CAT)
    Xcore = encode(lab, ASOF_CORE_NUM, ASOF_CORE_CAT)
    seq_all = CadenceHMMComponent.sequences(lab, er)

    rows, comps = [], {}
    for seed in seeds:
        g = np.random.default_rng(seed)
        idx = np.arange(len(lab)); g.shuffle(idx)
        cut = int(len(lab) * 0.7); dev, hold = idx[:cut], idx[cut:]

        ho = R.carve("rd_compose", Xasof, y, seed)
        # base
        m_base = _gbt().fit(ho.Xdev, ho.ydev)
        if budget: budget.spend("gbt_asof")
        r_base = R.score_on_holdout(ho, "gbt_asof", "classification",
                                    lambda X: m_base.predict_proba(X)[:, 1])
        # core twin (same partition, narrower columns)
        ho_c = R.Holdout("rd_compose", Xcore.iloc[dev].reset_index(drop=True), y[dev],
                         Xcore.iloc[hold].reset_index(drop=True), y[hold], set(), seed)
        m_core = _gbt().fit(ho_c.Xdev, ho_c.ydev)
        if budget: budget.spend("gbt_core")
        r_core = R.score_on_holdout(ho_c, "gbt_core", "classification",
                                    lambda X: m_core.predict_proba(X)[:, 1])
        # composite: components fit on DEV rows only, frozen for holdout
        eng_dev = lab.iloc[dev][ENGAGE_COLS].fillna(-1).reset_index(drop=True)
        eng_hold = lab.iloc[hold][ENGAGE_COLS].fillna(-1).reset_index(drop=True)
        cl = ClusterComponent().fit(eng_dev, budget)
        hm = CadenceHMMComponent().fit(seq_all[dev], budget)
        Xc_dev = pd.concat([Xasof.iloc[dev].reset_index(drop=True),
                            cl.transform(eng_dev), hm.transform(seq_all[dev])], axis=1)
        Xc_hold = pd.concat([Xasof.iloc[hold].reset_index(drop=True),
                             cl.transform(eng_hold), hm.transform(seq_all[hold])], axis=1)
        m_comp = CalibratedClassifierCV(_gbt(), method="isotonic", cv=3).fit(Xc_dev, y[dev])
        if budget: budget.spend("composite_calibrated_gbt")
        ho_comp = R.Holdout("rd_compose", Xc_dev, y[dev], Xc_hold, y[hold], set(), seed)
        r_comp = R.score_on_holdout(ho_comp, "composite_cluster_hmm_calibrated",
                                    "classification",
                                    lambda X: m_comp.predict_proba(X)[:, 1])
        pr_base = average_precision_score(1 - y[hold], 1 - m_base.predict_proba(ho.Xhold)[:, 1])
        pr_comp = average_precision_score(1 - y[hold], 1 - m_comp.predict_proba(Xc_hold)[:, 1])
        rows.append({"seed": seed, "k": cl.k, "silhouette": cl.silhouette,
                     "auc_base": round(r_base["metrics"]["auc"], 3),
                     "auc_core": round(r_core["metrics"]["auc"], 3),
                     "auc_composite": round(r_comp["metrics"]["auc"], 3),
                     "lift": round(r_comp["metrics"]["auc"] - r_base["metrics"]["auc"], 3),
                     "prauc_lapse_base": round(float(pr_base), 3),
                     "prauc_lapse_composite": round(float(pr_comp), 3),
                     "ece_composite": round(r_comp["metrics"]["ece"], 3)})
        if seed == seeds[0]:
            comps = {"cluster": cl, "hmm": hm, "model": m_comp,
                     "base_model": m_base,
                     "base_importance": dict(zip(Xasof.columns,
                                                 [float(v) for v in m_base.feature_importances_]))}
    return {"rows": rows, "components": comps}


def run(df_out=None, budget=None, quiet=False) -> dict:
    out, lab = _prep(df_out)
    res = run_arms(lab, out["tables"]["EventRegistration"], budget=budget)
    df_r = pd.DataFrame(res["rows"])
    lift = df_r["lift"].mean()
    verdict = "PASS" if lift >= 0.01 else ("HONEST-NO-LIFT" if lift > -0.02 else "RED")
    if not quiet:
        print("\n=== RD-COMPOSE — composition on real association data ===")
        print(df_r.to_string(index=False))
        print(f"\nmean composite lift over base = {lift:+.3f} AUC (bar >= +0.01; "
              f"honest no-lift routes to the demand-gate)")
        print(f"→ {verdict}")
    R.save_result("rd_compose", {
        "hypothesis": "cluster-id + HMM-state components lift a calibrated GBT on real data",
        "seeds": SEEDS, "per_seed": res["rows"], "mean_lift": float(lift),
        "verdict": verdict,
        "pass_bar": "lift>=+0.01 PASS; -0.02..0.01 HONEST-NO-LIFT (demand-gate); worse RED",
    })
    return {"table": df_r, "verdict": verdict, "components": res["components"], "lift": lift}


if __name__ == "__main__":
    run()
