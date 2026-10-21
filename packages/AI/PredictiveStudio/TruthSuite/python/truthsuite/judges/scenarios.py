"""scenarios.py -- Task P6: judge PS's scenario runs against the planted truth and the P5 reference pipeline.

Usage:
  python -m truthsuite.judges.scenarios [--runs-dir DIR] [--p5-dir DIR] [--data-dir DIR]
Writes judge.json (structured numbers) alongside.

Per scenario and regime (Ruling Q16):
  default / asShipped  judged on PS's OWN locked holdout (the trailing PK slice PS carved, reconstructed by the runner
                       and checked against lineage.lockedHoldoutRowCount): PS's reported metric, the same metric
                       recomputed on the full holdout from PS's own scores, the proper score, the oracle on the same
                       rows; plus the overlap of PS's training rows with P5's locked test IDs.
  matched              PS trained on exactly P5's train rows, judged on P5's locked test IDs:
                       PS, oracle (Ruling Q10 column) and reference (P5 per-row predictions, ref_predictions.py) on
                       identical rows, with paired 95% bootstrap intervals (cluster bootstrap by EntityKey when
                       entities repeat, by origin for series), as P5 does.
Series matched: one PS model per rolling origin (trained on that origin's window), scored on that origin's H test
months; scaled by the origin's in-window seasonal-naive MAE (P5's mase_scale).
Verdicts cite P1 criterion IDs.
"""
from __future__ import annotations

import json
import math
import os
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import numpy.typing as npt
import pandas as pd

from truthsuite.paths import FIXTURES, PACKAGE_ROOT, data_root, real_fixture, seed_dir
from truthsuite.refpipe import baselines as B
from truthsuite.refpipe import run as R
from truthsuite.refpipe import scoring as S

P6 = Path(os.environ.get("TRUTH_RESULTS_DIR") or str(PACKAGE_ROOT / "results")) / "scenarios"
P5 = Path(os.environ.get("TRUTH_RESULTS_DIR") or str(PACKAGE_ROOT / "results")) / "refpipe"
DATA = data_root() / "scenarios"
N_BOOT = 1000
SEED = 0
FArr = npt.NDArray[np.float64]
Json = dict[str, object]
ScoreFn = Callable[[npt.NDArray[np.generic], npt.NDArray[np.generic]], float]
SIMPLE_ALGOS = ("logistic_regression", "ridge")


@dataclass(frozen=True)
class Scn:
    sid: str            # PS config id (run dir)
    p5: str             # P5 scenario id
    problem: str        # binary | regression | count | tweedie | multiclass | series
    oracle: str | None  # Q10 truth column for the PS model's information set (None = real data)
    oracle_alt: tuple[str, ...] = ()
    note: str = ""


SCENARIOS: list[Scn] = [
    Scn("C2", "C2", "binary", "TrueValue"),
    Scn("C4", "C4", "binary", "TrueValue", note="traps ProxyOfTarget, NextPeriodFlag, TicketCode present as features"),
    Scn("D1c", "D1c", "binary", "TrueValue"),
    Scn("D1r", "D1r", "regression", "TrueValue"),
    Scn("N1c", "N1c", "binary", "TrueValue"),
    Scn("N1r", "N1r", "regression", "TrueValue"),
    Scn("R1", "R1", "regression", "TrueValue"),
    Scn("R2p", "R2p", "tweedie", "TrueValue"),
    Scn("R3", "R3", "count", "TrueValue"),
    Scn("T2p", "T2p", "regression", "PopulationMean", ("OneStepMean", "TrueValue"),
        note="PS has no entity or lag information: its information set is the new-entity one (PopulationMean)"),
    Scn("R2-real", "R2-real", "tweedie", None),
    Scn("R2p-tweedie", "R2p", "tweedie", "TrueValue",
        note="fix round 1 (I-2): lightgbm objective=tweedie / xgboost reg:tweedie (power 1.5) via pipeline Hyperparameters"),
    Scn("R3-poisson", "R3", "count", "TrueValue",
        note="fix round 1 (I-2): lightgbm objective=poisson / xgboost count:poisson via pipeline Hyperparameters"),
    Scn("R2-real-tweedie", "R2-real", "tweedie", None,
        note="fix round 1 (I-2): lightgbm objective=tweedie / xgboost reg:tweedie (power 1.5) via pipeline Hyperparameters"),
    Scn("C1", "C1", "binary", None),
    Scn("C3", "C3", "multiclass", "TrueP"),
    Scn("T1p", "T1p", "series", "OriginMean", ("TrueValue",)),
    Scn("T4", "T4", "series", "OriginMean", ("TrueValue",)),
    Scn("T3", "T3", "series", "OneStepMean", ("OriginMean",),
        note="features MonthIndex, Month, LagTarget and the SamePeriodTarget trap: a one-step information set"),
    Scn("T3-lag", "T3", "series", "OneStepMean", ("OriginMean",),
        note="features MonthIndex, Month, LagTarget: a one-step information set"),
    Scn("T1-real", "T1-real", "series", None),
]


# ------------------------------------------------------------------ io ----------------------------------------------
def jload(p: Path) -> Json:
    v: object = json.loads(p.read_text())
    if not isinstance(v, dict):
        raise TypeError(f"{p} is not a JSON object")
    return {str(k): x for k, x in v.items()}


def jdict(v: object, where: str) -> Json:
    if not isinstance(v, dict):
        raise TypeError(f"{where} is not an object")
    return {str(k): x for k, x in v.items()}


def jlist(v: object, where: str) -> list[object]:
    if not isinstance(v, list):
        raise TypeError(f"{where} is not a list")
    return list(v)


def jstrs(v: object, where: str) -> list[str]:
    xs = jlist(v, where)
    if not all(isinstance(x, str) for x in xs):
        raise TypeError(f"{where} is not a list of strings")
    return [str(x) for x in xs]


def jnum(v: object, where: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise TypeError(f"{where} is not a number")
    return float(v)


def fmt(x: object, nd: int = 4) -> str:
    if x is None:
        return "-"
    if isinstance(x, bool):
        return str(x)
    if isinstance(x, (int, np.integer)):
        return str(int(x))
    if isinstance(x, (float, np.floating)):
        xf = float(x)
        return "nan" if math.isnan(xf) else f"{xf:.{nd}f}"
    return str(x)


def ci_s(ci: Sequence[object]) -> str:
    return f"[{fmt(jnum(ci[0], 'ci'))}, {fmt(jnum(ci[1], 'ci'))}]"


# ------------------------------------------------------------------ data --------------------------------------------
@dataclass
class Frame:
    """Observed rows keyed by the P5 ID convention (lower-case uuid; C1: UPPER(person_id):period_index)."""
    rows: pd.DataFrame                       # index = key; columns Target, EntityKey, T (+ truth columns)
    classes: list[str] = field(default_factory=list)


def _scenario_dir(p5_id: str) -> Path:
    d = DATA / p5_id
    if d.exists():
        return d
    spec_id = "T3" if p5_id == "T3-lag" else p5_id
    spec: dict[str, object] = json.loads((FIXTURES / "scenarios" / "specs" / f"{spec_id}.json").read_text())
    seed_val = spec["seed"]
    if not isinstance(seed_val, int):
        raise TypeError(f"Invalid seed in {spec_id}.json")
    return seed_dir("scenario", p5_id, seed_val)


def load_frame(sc: Scn) -> Frame:
    if sc.p5 == "C1":
        py = pd.read_parquet(real_fixture("person_years.parquet"))
        key = py["person_id"].astype(str).str.upper() + ":" + py["period_index"].astype(str)
        df = pd.DataFrame({"Target": py["renewed"].astype(int).to_numpy(), "EntityKey": py["person_id"].astype(str).to_numpy(),
                           "T": pd.to_datetime(py["decision_date"]).to_numpy()}, index=key.to_numpy())
        return Frame(df)
    if sc.p5 == "C3":
        w_dir = (DATA / "W9-multiclass") if (DATA / "W9-multiclass").exists() else seed_dir("world", "W9-multiclass", 42)
        w = pd.read_csv(w_dir / "rows.csv", dtype={"ID": str})
        t = pd.read_csv(w_dir / "truth.csv", dtype={"EventRegistrationID": str})
        classes = sorted(str(c) for c in w["Outcome"].unique())
        df = pd.DataFrame({"Target": w["Outcome"].map({c: i for i, c in enumerate(classes)}).astype(int).to_numpy(),
                           "Outcome": w["Outcome"].astype(str).to_numpy(), "EntityKey": w["PersonID"].astype(str).to_numpy(),
                           "T": pd.to_datetime(w["EventDate"]).to_numpy()}, index=w["ID"].str.lower().to_numpy())
        tt = t.set_index(t["EventRegistrationID"].str.lower())
        for c in classes:
            df[f"TrueP_{c}"] = tt[f"TrueP_{c}"].loc[df.index].to_numpy()
        return Frame(df, classes)
    if sc.p5 in ("R2-real", "T1-real") and not (DATA / sc.p5).exists():
        rows = pd.read_csv(real_fixture(f"{sc.p5}.rows.csv"), dtype={"ID": str, "EntityKey": str})
        df = rows.set_index(rows["ID"].str.lower())
        df["T"] = pd.to_datetime(df["T"])
        return Frame(df)
    d = _scenario_dir(sc.p5)
    rows = pd.read_csv(d / "rows.csv", dtype={"ID": str, "EntityKey": str})
    df = rows.set_index(rows["ID"].str.lower())
    df["T"] = pd.to_datetime(df["T"])
    tp = d / "truth.csv"
    if tp.exists():
        tr = pd.read_csv(tp, dtype={"ID": str})
        tr = tr.set_index(tr["ID"].str.lower())
        for c in ("TrueValue", "PopulationMean", "OneStepMean"):
            if c in tr.columns:
                df[c] = pd.to_numeric(tr[c].loc[df.index]).to_numpy()
    return Frame(df)


def origin_means(sc: Scn) -> pd.DataFrame | None:
    if sc.p5 in ("R2-real", "T1-real") and not (DATA / sc.p5).exists():
        return None
    p = _scenario_dir(sc.p5) / "truth_origins.csv"
    if not p.exists():
        return None
    t = pd.read_csv(p, dtype={"ID": str})
    t["ID"] = t["ID"].str.lower()
    return t


# ------------------------------------------------------------------ PS runs -----------------------------------------
@dataclass
class Run:
    regime: str
    origin: int | None
    model: Json
    preds: pd.DataFrame      # index = P5 key
    algos: list[str]


def load_run(sc: Scn, regime: str, origin: int | None) -> Run | None:
    d = P6 / sc.sid / regime / (f"o{origin}" if origin is not None else "")
    if not (d / "model.json").exists():
        return None
    m = jload(d / "model.json")
    p = pd.read_csv(d / "predictions.csv", dtype={"ID": str, "person_id": str})
    if sc.p5 == "C1":
        key = p["person_id"].astype(str).str.upper() + ":" + p["period_index"].astype(int).astype(str)
    else:
        key = p["ID"].str.lower()
    p = p.set_index(pd.Index(key.to_numpy()))
    algos = [str(jdict(x, "model")["algorithm"]) for x in jlist(m["models"], "models")]
    return Run(regime, origin, m, p, algos)


def keymap_c1(run: Run) -> dict[str, str]:
    """PersonYear uuid -> P5 key, from the run's predictions (person_id, period_index)."""
    p = run.preds
    return dict(zip(p["ID"].str.lower(), p.index))


def run_ids(sc: Scn, run: Run, which: str) -> list[str]:
    ids = [i.lower() for i in jstrs(run.model[which], which)]
    if sc.p5 == "C1":
        km = keymap_c1(run)
        missing = [i for i in ids if i not in km]
        if sc.sid == "C1" and run.regime != "matched" and missing:
            raise RuntimeError(f"C1 {run.regime}: {len(missing)} {which} not in predictions")
        # matched regime reads P6Tr_C1, whose IDs are the PersonYear IDs (copied), so the same map applies
        return [km[i] for i in ids if i in km]
    return ids


def model_of(run: Run, algo: str) -> Json:
    for x in jlist(run.model["models"], "models"):
        mx = jdict(x, "model")
        if mx["algorithm"] == algo:
            return mx
    raise KeyError(algo)


# ------------------------------------------------------------------ scoring -----------------------------------------
def prim_fn(problem: str) -> tuple[str, ScoreFn]:
    fam = R.family("regression" if problem == "series" else problem)
    return fam.name, fam.fn


def groups_of(fr: Frame, ids: Sequence[str]) -> list[object] | None:
    ek = fr.rows["EntityKey"].loc[list(ids)].astype(str)
    return list(ek) if bool(ek.duplicated().any()) else None


def boot(y: npt.NDArray[np.generic], p: npt.NDArray[np.generic], fn: ScoreFn, g: list[object] | None) -> list[float]:
    lo, hi = S.bootstrap_ci(y, p, fn, n=N_BOOT, seed=SEED, groups=g)
    return [lo, hi]


def paired(y: npt.NDArray[np.generic], a: npt.NDArray[np.generic], b: npt.NDArray[np.generic], fn: ScoreFn,
           g: list[object] | None) -> Json:
    """fn(a) - fn(b) with a paired bootstrap CI; > 0 means b scores better (loss)."""
    v, lo, hi = S.paired_bootstrap(y, a, b, fn, n=N_BOOT, seed=SEED, groups=g)
    return {"value": v, "ci": [lo, hi]}


def ps_pred(run: Run, algo: str, ids: Sequence[str]) -> FArr:
    return np.asarray(pd.to_numeric(run.preds[f"p_{algo}"].loc[list(ids)]).to_numpy(), dtype=np.float64)


def calib(y: FArr, p: FArr) -> Json:
    c = S.calibration(y, p)
    citl = c["citl"]
    # a model emitting probabilities of exactly 0 or 1 (random_forest) makes the offset GLM diverge: reported as null
    return {"slope": c["slope"], "citl": citl if abs(citl) < 1e3 else float("nan"), "citlDiverged": abs(citl) >= 1e3,
            "exactZeroOrOne": int(np.sum((p <= 0) | (p >= 1))),
            "meanPredicted": c["meanPredicted"], "meanObserved": c["meanObserved"]}


# ------------------------------------------------------------------ verdict helpers ---------------------------------
def verdict(cid: str, ok: bool | None, why: str) -> Json:
    return {"criterion": cid, "verdict": "PASS" if ok else ("FAIL" if ok is False else "NOT TESTED"), "evidence": why}


def p5_gate(p5j: Json) -> tuple[str, str | None, str | None]:
    g = jdict(p5j["gate"], "gate")
    shipped = g.get("shipped")
    note = g.get("note")
    return str(g["outcome"]), (str(shipped) if shipped is not None else None), (str(note) if note is not None else None)


def ps_decision(run: Run) -> Json:
    w = str(run.model["winner"])
    m = model_of(run, w)
    t = jdict(m["trust"], "trust")
    return {"winner": w, "trust": t["grade"], "canAct": t["canAct"], "leakageFlagged": m["leakageFlagged"],
            "wouldAutoPublish": m["wouldAutoPublish"], "agentRankScore": m["agentRankScore"],
            "reported": jdict(m["holdoutMetrics"], "holdoutMetrics")}


def decision_vs_p5(dec: Json, outcome: str, shipped: str | None) -> str:
    pub = bool(dec["wouldAutoPublish"])
    w = str(dec["winner"])
    if outcome == "no-signal":
        return "DISAGREE: PS auto-publishes a model where P5 finds no signal" if pub else "AGREE: PS holds the model (P5: no-signal)"
    if outcome == "keep-simple-baseline":
        if not pub:
            return f"DISAGREE: PS holds every model although P5 finds signal (P5 ships {shipped})"
        if w in SIMPLE_ALGOS:
            return f"AGREE: PS publishes its simple model {w} (P5 ships {shipped})"
        return f"DISAGREE: PS publishes the complex {w} where P5 keeps the simple {shipped}"
    if not pub:
        return f"DISAGREE: PS holds every model although P5 ships the model {shipped}"
    return f"AGREE on publishing: PS publishes {w} (P5 ships the model {shipped})"


# ------------------------------------------------------------------ tabular judging ---------------------------------
def truth_pred(fr: Frame, sc: Scn, ids: Sequence[str], col: str) -> FArr:
    return np.asarray(fr.rows[col].loc[list(ids)].to_numpy(), dtype=np.float64)


def judge_tabular(sc: Scn, fr: Frame, p5j: Json, ref: pd.DataFrame, out: list[str]) -> Json:
    pname, fn = prim_fn(sc.problem)
    split = jdict(p5j["split"], "split")
    test = [i if sc.p5 == "C1" else i.lower() for i in jstrs(split["testIds"], "testIds")]
    test_set = set(test)
    y_test = np.asarray(fr.rows["Target"].loc[test].to_numpy())
    g_test = groups_of(fr, test)
    ref_ix = ref.set_index(pd.Index((ref["ID"] if sc.p5 == "C1" else ref["ID"].str.lower()).to_numpy()))
    ref_p = np.asarray(ref_ix["ref_pred"].loc[test].to_numpy(), dtype=np.float64)
    ref_score = fn(y_test, ref_p)
    res: Json = {"primary": pname, "nTest": len(test), "reference": {"value": ref_score, "ci": boot(y_test, ref_p, fn, g_test)}}
    out.append(f"  P5 locked test rows: {len(test)} ({split['kind']}); primary score {pname}; bootstrap {'cluster by EntityKey' if g_test else 'rows'} n={N_BOOT}")
    out.append(f"  reference (P5 delivered {p5j['selected']}) on the test rows: {pname}={fmt(ref_score)} {ci_s(jlist(jdict(res['reference'], 'r')['ci'], 'ci'))} (P5 JSON {fmt(jnum(jdict(p5j['primaryScore'], 'ps')['value'], 'v'))})")
    if sc.oracle:
        o = truth_pred(fr, sc, test, sc.oracle)
        res["oracle"] = {"column": sc.oracle, "value": fn(y_test, o), "ci": boot(y_test, o, fn, g_test)}
        out.append(f"  oracle ({sc.oracle}) on the test rows: {pname}={fmt(fn(y_test, o))} {ci_s(jlist(jdict(res['oracle'], 'o')['ci'], 'ci'))}; reference - oracle = {fmt(ref_score - fn(y_test, o))}")
        for alt in sc.oracle_alt:
            oa = truth_pred(fr, sc, test, alt)
            out.append(f"  oracle alt ({alt}) on the test rows: {pname}={fmt(fn(y_test, oa))}")
            res[f"oracle_{alt}"] = fn(y_test, oa)
    outcome, shipped, note = p5_gate(p5j)
    res["p5"] = {"outcome": outcome, "shipped": shipped, "note": note}
    out.append(f"  P5 gate: outcome={outcome} shipped={shipped}{' note=' + note if note else ''}")
    train_p5 = [i if sc.p5 == "C1" else i.lower() for i in jstrs(split["trainIds"], "trainIds")]
    dummy_v = float(np.mean(np.asarray(fr.rows["Target"].loc[train_p5].to_numpy(), dtype=np.float64)))
    dummy_p = np.full(len(test), dummy_v)
    res["dummy"] = {"value": fn(y_test, dummy_p), "constant": dummy_v}
    out.append(f"  dummy (P5 train-row {'base rate' if sc.problem == 'binary' else 'mean'} {fmt(dummy_v)}) on the test rows: {pname}={fmt(fn(y_test, dummy_p))}; reference beats it by {fmt(fn(y_test, dummy_p) - ref_score)}")
    regs: Json = {}
    for regime in ("default", "asShipped", "matched"):
        run = load_run(sc, regime, None)
        if run is None:
            out.append(f"  [{regime}] no run")
            continue
        rj: Json = {}
        tr_ids = run_ids(sc, run, "psTrainIds")
        ho_ids = run_ids(sc, run, "psHoldoutIds")
        ov_tr = len(set(tr_ids) & test_set)
        ov_ho = len(set(ho_ids) & test_set)
        dec = ps_decision(run)
        rj["decision"] = dec
        rj["decisionVsP5"] = decision_vs_p5(dec, outcome, shipped)
        rj["psTrainRows"] = len(tr_ids)
        rj["psHoldoutRows"] = len(ho_ids)
        rj["trainOverlapP5Test"] = ov_tr
        out.append(f"  [{regime}] PS trained on {len(tr_ids)} rows, locked holdout {len(ho_ids)} rows; PS training rows that are P5 test rows: {ov_tr} ({fmt(ov_tr / max(1, len(tr_ids)), 3)}); PS holdout rows that are P5 test rows: {ov_ho}")
        if "T" in fr.rows.columns and fr.rows["T"].notna().all() and ho_ids and tr_ids:
            tmax = fr.rows["T"].loc[tr_ids].max()
            early = int((fr.rows["T"].loc[ho_ids] <= tmax).sum())
            ents_tr = set(fr.rows["EntityKey"].loc[tr_ids].astype(str))
            shared = int(fr.rows["EntityKey"].loc[ho_ids].astype(str).isin(ents_tr).sum())
            rj["holdoutNotAfterTrain"] = early
            rj["holdoutRowsWithEntityInTrain"] = shared
            out.append(f"    PS holdout rows dated on/before the latest PS training row: {early}/{len(ho_ids)}; holdout rows whose entity also has PS training rows: {shared}/{len(ho_ids)}")
        out.append(f"    PS decision: winner={dec['winner']} (agent rank key {fmt(dec['agentRankScore'])}) trust={dec['trust']} canAct={dec['canAct']} leakageFlagged={dec['leakageFlagged']} wouldAutoPublish={dec['wouldAutoPublish']} -> {rj['decisionVsP5']}")
        algs: Json = {}
        for a in run.algos:
            m = model_of(run, a)
            hm = jdict(m["holdoutMetrics"], "hm")
            aj: Json = {"reported": hm, "trust": jdict(m["trust"], "t")["grade"], "leakageFlagged": m["leakageFlagged"],
                        "topImportance": m["topImportance"], "runNotes": m["runNotes"]}
            # own holdout
            yh = np.asarray(fr.rows["Target"].loc[ho_ids].to_numpy())
            ph = ps_pred(run, a, ho_ids)
            rep_key = "auc" if sc.problem == "binary" else "r2"
            rec = S.auc(yh, ph) if sc.problem == "binary" else S.r2(yh, ph)
            gh = groups_of(fr, ho_ids)
            own: Json = {"n": len(ho_ids), "reportedKey": rep_key, "reported": hm.get(rep_key), "recomputed": rec,
                         pname: fn(yh, ph), "ci": boot(yh, ph, fn, gh)}
            if sc.problem == "binary":
                own["positives"] = int(np.sum(np.asarray(yh, dtype=np.float64) == 1))
            if sc.oracle:
                oh = truth_pred(fr, sc, ho_ids, sc.oracle)
                own["oracle"] = fn(yh, oh)
                own["gapVsOracle"] = fn(yh, ph) - fn(yh, oh)
            aj["ownHoldout"] = own
            # P5 test rows
            pt = ps_pred(run, a, test)
            tj: Json = {pname: fn(y_test, pt), "ci": boot(y_test, pt, fn, g_test),
                        "psMinusRef": paired(y_test, pt, ref_p, fn, g_test),
                        "dummyMinusPs": paired(y_test, dummy_p, pt, fn, g_test)}
            if sc.oracle:
                o = truth_pred(fr, sc, test, sc.oracle)
                tj["psMinusOracle"] = paired(y_test, pt, o, fn, g_test)
            if sc.problem == "binary":
                tj["auc"] = S.auc(y_test, pt)
                tj["brier"] = S.brier(y_test, pt)
                tj["calibration"] = calib(np.asarray(y_test, dtype=np.float64), pt)
            else:
                tj["r2"] = S.r2(y_test, pt)
                tj["rmse"] = S.rmse(y_test, pt)
                tj["refRmse"] = S.rmse(y_test, ref_p)
                if sc.problem in ("count", "tweedie"):
                    pos_m = pt > 0
                    tj["positiveSubset"] = {"n": int(pos_m.sum()), "ps": fn(y_test[pos_m], pt[pos_m]), "ref": fn(y_test[pos_m], ref_p[pos_m])}
                tj["nonPositivePredictions"] = int((pt <= 0).sum())
                tj["meanResidual"] = float(np.mean(np.asarray(y_test, dtype=np.float64) - pt))
            aj["p5Test"] = tj
            algs[a] = aj
            orc = (f" oracle {fmt(own.get('oracle'))} gap {fmt(own.get('gapVsOracle'))}" if sc.oracle else "") + (f" positives={own['positives']}" if "positives" in own else "")
            out.append(f"    {a:<20} own holdout n={len(ho_ids)}: reported {rep_key}={fmt(hm.get(rep_key))} recomputed={fmt(rec)} | {pname}={fmt(own[pname])} {ci_s(jlist(own['ci'], 'ci'))}{orc} | trust={aj['trust']} leak={m['leakageFlagged']}")
            extra = (f" AUC={fmt(tj['auc'])} Brier={fmt(tj['brier'])} slope={fmt(jdict(tj['calibration'], 'c')['slope'], 3)} CITL={fmt(jdict(tj['calibration'], 'c')['citl'], 3)}"
                     if sc.problem == "binary" else f" R2={fmt(tj['r2'])} RMSE={fmt(tj['rmse'])} (ref {fmt(tj['refRmse'])}) predictions<=0: {tj['nonPositivePredictions']}"
                     + (f"; on the {jdict(tj['positiveSubset'], 'p')['n']} rows PS predicts > 0: PS {fmt(jdict(tj['positiveSubset'], 'p')['ps'])} vs ref {fmt(jdict(tj['positiveSubset'], 'p')['ref'])}" if "positiveSubset" in tj else ""))
            pmo = jdict(tj["psMinusOracle"], "pmo") if sc.oracle else None
            out.append(f"    {'':<20} on P5 test rows: {pname}={fmt(tj[pname])} {ci_s(jlist(tj['ci'], 'ci'))}; PS - ref {fmt(jdict(tj['psMinusRef'], 'pmr')['value'])} {ci_s(jlist(jdict(tj['psMinusRef'], 'pmr')['ci'], 'ci'))}"
                       + (f"; PS - oracle {fmt(pmo['value'])} {ci_s(jlist(pmo['ci'], 'ci'))}" if pmo else "")
                       + f"; dummy - PS {fmt(jdict(tj['dummyMinusPs'], 'd')['value'])} {ci_s(jlist(jdict(tj['dummyMinusPs'], 'd')['ci'], 'ci'))}" + extra)
        rj["algorithms"] = algs
        regs[regime] = rj
    res["regimes"] = regs
    res["verdicts"] = tabular_verdicts(sc, res, fr)
    return res


def tabular_verdicts(sc: Scn, res: Json, fr: Frame) -> list[Json]:
    v: list[Json] = []
    regs = jdict(res["regimes"], "regimes")
    m = jdict(regs.get("matched", {}), "m")
    p5 = jdict(res["p5"], "p5")
    pname = str(res["primary"])
    if sc.problem == "binary":
        # S4.1: PS's tournament key is holdout AUC (pipeline-builder.ts:80-119). World check: does the AUC winner match
        # the log-loss winner on the matched test rows?
        if m:
            algs = jdict(m["algorithms"], "a")
            ll = {a: jnum(jdict(jdict(x, "x")["p5Test"], "t")[pname], "ll") for a, x in algs.items()}
            best_ll = min(ll, key=lambda k: ll[k])
            w = str(jdict(m["decision"], "d")["winner"])
            v.append(verdict("S4.1", False, f"PS ranks by holdout AUC (pipeline-builder.ts:80-119, :231-233), never by log loss; matched: PS winner {w} has test logLoss {fmt(ll[w])}, best logLoss is {best_ll} {fmt(ll[best_ll])}"))
    if sc.problem in ("count", "tweedie"):
        v.append(verdict("S1.4", False, "PS can declare only classification|regression (Core/src/sidecar-contract.ts:27); the count/zero-inflated family is not declarable"))
        v.append(verdict("S4.3", False, f"PS ranks by R2 then 1/(1+RMSE) (pipeline-builder.ts:107-111), not by {pname}"))
    elif sc.problem == "regression":
        v.append(verdict("S4.3", True, "continuous mean target: PS ranks by holdout R2, which orders candidates exactly as RMSE on the same rows (pipeline-builder.ts:107-109)"))
    decs = {r: jdict(jdict(x, "r")["decision"], "d") for r, x in regs.items()}
    agree = {r: str(jdict(x, "r")["decisionVsP5"]) for r, x in regs.items()}
    pubs = [r for r, d in decs.items() if d["wouldAutoPublish"]]
    v.append(verdict("S4.2", False, f"PS publishes on the trust grade alone with no comparator or margin (pipeline-builder.ts:464-484; trust.ts:215); would auto-publish in {pubs or 'no regime'}; P5 outcome {p5['outcome']}; " + "; ".join(f"{r}: {a}" for r, a in agree.items())))
    v.append(verdict("S4.5", False, "PS stores no dummy, one-feature or GLM baseline beside any model (TrainResponse, Core/src/sidecar-contract.ts:167-186, carries artifact, preprocessing, metrics, feature_importance, row count, duration and holdout_metrics only)"))
    v.append(verdict("S6.2", False, "PS's HoldoutMetrics carry no interval (model.json holdoutMetrics); F-REF-3"))
    if "T" in fr.rows.columns and fr.rows["T"].notna().all():
        a = jdict(regs.get("asShipped", {}), "a")
        if a:
            v.append(verdict("S6.1", False, f"PS's locked holdout is the trailing primary-key slice (training-engine.ts:257-269): asShipped holdout rows dated on/before the latest training row {a.get('holdoutNotAfterTrain')}/{a.get('psHoldoutRows')} (F-REF-1)"))
    if sc.problem == "binary" and m:
        algs = jdict(m["algorithms"], "a")
        sl = {k: jdict(jdict(jdict(x, "x")["p5Test"], "t")["calibration"], "c")["slope"] for k, x in algs.items()}
        v.append(verdict("S6.3", False, "PS measures no calibration and fits no calibrator (F-SC-8); measured slopes on the matched test rows: " + ", ".join(f"{k} {fmt(s, 3)}" for k, s in sl.items())))
    if sc.problem in ("regression", "count", "tweedie"):
        v.append(verdict("S6.6", False, "PS returns no prediction interval (ScoreRecordSet returns one score per row)"))
    if sc.p5 in ("N1c", "N1r"):
        v.append(verdict("S6.5", None, f"one seed per regime here; PS would auto-publish in: {pubs or 'none'} (no 200-seed run exists; W2 live 0/20, which the register's F-SEL-2 note says does not demonstrate F-SEL-2)"))
    if sc.p5 == "C4":
        runs = {r: jdict(x, "r") for r, x in regs.items()}
        flagged = {r: [a for a, x in jdict(y["algorithms"], "a").items() if jdict(x, "x")["leakageFlagged"]] for r, y in runs.items()}
        wm = jdict(runs["matched"], "m")
        w = str(jdict(wm["decision"], "d")["winner"])
        wa = jdict(jdict(wm["algorithms"], "a")[w], "w")
        pmo = jdict(jdict(wa["p5Test"], "t")["psMinusOracle"], "p")
        ti = jdict(wa["topImportance"], "ti")
        v.append(verdict("S2.4", False, "PS's only leakage check is single-feature importance dominance (training-engine.ts:306-307); it never names the traps as leaks; flagged algorithms per regime: " + "; ".join(f"{r}: {f or 'none'}" for r, f in flagged.items())
                         + f"; the matched winner {w} (published, unflagged) beats the planted truth on P5's test rows by {fmt(-jnum(pmo['value'], 'v'))} logLoss {ci_s([-jnum(jlist(pmo['ci'], 'c')[1], 'c'), -jnum(jlist(pmo['ci'], 'c')[0], 'c')])}, top source column {ti['topAgg']} share {fmt(ti['topAggShare'], 3)}"))
    if sc.p5 in ("T2p", "C1", "D1c", "D1r", "C4"):
        a = jdict(regs.get("asShipped", {}), "a")
        if a:
            v.append(verdict("S2.6", False, f"code check: ValidationStrategy has no group key and no grouped inner CV or new-entity split (pipeline-spec.ts:77-89); (context, permitted for a deployment holdout under Ruling Q12: asShipped holdout rows whose entity has PS training rows {a.get('holdoutRowsWithEntityInTrain')}/{a.get('psHoldoutRows')})"))
    if sc.p5 == "T2p":
        v.append(verdict("S-T.4", False, "no time-blocked or entity-grouped validation option (pipeline-spec.ts:77-89)"))
    return v


# ------------------------------------------------------------------ multiclass (C3 planted) ---------------------------
def judge_multiclass(sc: Scn, fr: Frame, p5j: Json, ref: pd.DataFrame, out: list[str]) -> Json:
    classes = fr.classes
    split = jdict(p5j["split"], "split")
    test = [i.lower() for i in jstrs(split["testIds"], "testIds")]
    y = np.asarray(fr.rows["Target"].loc[test].to_numpy(), dtype=np.int64)
    rf = ref.set_index(ref["ID"].str.lower())
    refP = np.column_stack([rf[f"ref_p_{c}"].loc[test].to_numpy(dtype=np.float64) for c in classes])
    oP = np.column_stack([fr.rows[f"TrueP_{c}"].loc[test].to_numpy(dtype=np.float64) for c in classes])
    g = groups_of(fr, test)

    def acc(yy: npt.NDArray[np.generic], lab: npt.NDArray[np.generic]) -> float:
        return float(np.mean(np.asarray(yy) == np.asarray(lab)))
    res: Json = {"primary": "multiclassLogLoss", "nTest": len(test), "classes": classes,
                 "reference": {"logLoss": S.log_loss_score(y, refP), "accuracy": acc(y, refP.argmax(1))},
                 "oracle": {"logLoss": S.log_loss_score(y, oP), "accuracy": acc(y, oP.argmax(1)),
                            "argmaxCounts": {c: int((oP.argmax(1) == i).sum()) for i, c in enumerate(classes)}}}
    outcome, shipped, note = p5_gate(p5j)
    res["p5"] = {"outcome": outcome, "shipped": shipped, "note": note}
    out.append(f"  P5 test rows {len(test)}; reference multiclass logLoss={fmt(jdict(res['reference'], 'r')['logLoss'])} accuracy={fmt(jdict(res['reference'], 'r')['accuracy'])}; oracle (TrueP_*) logLoss={fmt(jdict(res['oracle'], 'o')['logLoss'])} accuracy={fmt(jdict(res['oracle'], 'o')['accuracy'])} argmax counts {jdict(res['oracle'], 'o')['argmaxCounts']}")
    out.append(f"  P5 gate: outcome={outcome} shipped={shipped}")
    regs: Json = {}
    for regime in ("default", "asShipped", "matched"):
        run = load_run(sc, regime, None)
        if run is None:
            continue
        rj: Json = {"decision": ps_decision(run)}
        rj["decisionVsP5"] = decision_vs_p5(jdict(rj["decision"], "d"), outcome, shipped)
        tr_ids = run_ids(sc, run, "psTrainIds"); ho_ids = run_ids(sc, run, "psHoldoutIds")
        rj["trainOverlapP5Test"] = len(set(tr_ids) & set(test))
        rj["psHoldoutRows"] = len(ho_ids)
        d = jdict(rj["decision"], "d")
        out.append(f"  [{regime}] PS train {len(tr_ids)} rows, holdout {len(ho_ids)}; PS training rows in P5 test: {rj['trainOverlapP5Test']}; winner={d['winner']} trust={d['trust']} wouldAutoPublish={d['wouldAutoPublish']} -> {rj['decisionVsP5']}")
        algs: Json = {}
        for a in run.algos:
            m = model_of(run, a)
            cls = run.preds[f"class_{a}"].loc[test].astype(str).to_numpy()
            sc_ = ps_pred(run, a, test)
            lab = np.array([classes.index(c) if c in classes else -1 for c in cls])
            ptrue = oP[np.arange(len(test)), np.clip(lab, 0, len(classes) - 1)]
            clsh = run.preds[f"class_{a}"].loc[ho_ids].astype(str).to_numpy()
            yh = fr.rows["Outcome"].loc[ho_ids].astype(str).to_numpy()
            aj: Json = {"reported": jdict(m["holdoutMetrics"], "hm"), "trust": jdict(m["trust"], "t")["grade"],
                        "ownHoldoutAccuracyRecomputed": float(np.mean(clsh == yh)),
                        "p5TestAccuracy": acc(y, lab), "predictedCounts": {c: int((cls == c).sum()) for c in classes},
                        "meanScore": float(sc_.mean()), "meanTrueProbOfPredicted": float(ptrue.mean()),
                        "hitRate": float(np.mean(lab == y)), "minScore": float(sc_.min()),
                        "multiclassLogLoss": None,
                        "note": "PS returns only P(predicted class) (F-L4-6): multiclass log loss is not computable"}
            algs[a] = aj
            out.append(f"    {a:<20} reported {json.dumps(aj['reported'])} own-holdout accuracy recomputed {fmt(aj['ownHoldoutAccuracyRecomputed'])}; P5 test accuracy {fmt(aj['p5TestAccuracy'])} (oracle {fmt(jdict(res['oracle'], 'o')['accuracy'])}); predicted {aj['predictedCounts']}; top-label mean score {fmt(aj['meanScore'])} vs mean TrueP(predicted) {fmt(aj['meanTrueProbOfPredicted'])} vs hit rate {fmt(aj['hitRate'])}; min score {fmt(aj['minScore'])}")
        rj["algorithms"] = algs
        regs[regime] = rj
    res["regimes"] = regs
    res["verdicts"] = [
        verdict("S4.1", False, "PS's multiclass primary is holdout accuracy/AUC (pipeline-builder.ts:113-116); multiclass log loss is neither computed nor computable from what PS returns (F-L4-6)"),
        verdict("S9.5", False, "the score is P(predicted class), so no row carries P(NoShow) or P(Cancelled) for the named class (F-L4-6, F-SC-6)"),
        verdict("S6.2", False, "no interval on any PS metric"),
    ]
    _ = g
    return res


# ------------------------------------------------------------------ series ------------------------------------------
def judge_series(sc: Scn, fr: Frame, p5j: Json, ref: pd.DataFrame, out: list[str]) -> Json:
    split = jdict(p5j["split"], "split")
    folds = [jdict(f, "fold") for f in jlist(split["folds"], "folds")]
    d = fr.rows.sort_values("T", kind="mergesort")
    order = list(d.index)
    y_all = d["Target"].to_numpy(dtype=np.float64)
    pos = {k: i for i, k in enumerate(order)}
    om = origin_means(sc)
    rf = ref.set_index(ref["ID"].str.lower())
    res: Json = {"primary": "mase", "origins": len(folds)}
    outcome, shipped, note = p5_gate(p5j)
    res["p5"] = {"outcome": outcome, "shipped": shipped, "note": note}
    ref_mase = float(rf["ref_scaled_abs_err"].mean())
    res["reference"] = {"mase": ref_mase}
    out.append(f"  P5: {len(folds)} rolling origins x H={split['H']}; reference {p5j['selected']} MASE={fmt(ref_mase)}; gate outcome={outcome} shipped={shipped}{' (' + note + ')' if note else ''}")
    # per-origin rows, scales, truth
    test_ids: list[str] = []; origin_of: list[int] = []; scale_of: list[float] = []; o_idx: list[int] = []
    train_mean: list[float] = []
    base_fc: dict[str, list[float]] = {"mean": [], "naive": [], "seasonalNaive": []}
    for f in folds:
        k = int(jnum(f["k"], "k")); tr = [i.lower() for i in jstrs(f["trainIds"], "tr")]; te = [i.lower() for i in jstrs(f["testIds"], "te")]
        o = max(pos[i] for i in tr)
        if o != len(tr) - 1:
            raise RuntimeError(f"{sc.sid} origin {k}: train window is not the first {len(tr)} months")
        scale = S.mase_scale(y_all[: o + 1])
        test_ids += te; origin_of += [k] * len(te); scale_of += [scale] * len(te); o_idx += [o] * len(te)
        ytr = y_all[: o + 1]
        train_mean += [float(np.mean(ytr))] * len(te)
        # P5's baselines (probes/refpipe/baselines.py), per origin from its training window only
        base_fc["mean"] += list(B.series_mean(ytr, len(te))); base_fc["naive"] += list(B.naive_last(ytr, len(te)))
        base_fc["seasonalNaive"] += list(B.seasonal_naive(ytr, len(te)))
    y_te = fr.rows["Target"].loc[test_ids].to_numpy(dtype=np.float64)
    sc_arr = np.asarray(scale_of)
    grp: list[object] = [str(k) for k in origin_of]
    zero = np.zeros(len(test_ids))
    ref_err = rf["ref_scaled_abs_err"].loc[test_ids].to_numpy(dtype=np.float64)
    tmean = np.asarray(train_mean)
    base_err = {nm: np.abs(y_te - np.asarray(v)) / sc_arr for nm, v in base_fc.items()}
    res["baselines"] = {nm: float(e.mean()) for nm, e in base_err.items()}
    out.append("  P5 baselines recomputed per origin (training window only): " + ", ".join(f"{nm} MASE={fmt(float(e.mean()))}" for nm, e in base_err.items()))
    orc: dict[str, FArr] = {}
    if om is not None:
        om_map = {(str(i), int(k)): float(v) for i, k, v in zip(om["ID"], om["origin"], om["OriginMean"])}
        orc["OriginMean"] = np.array([om_map[(i, k)] for i, k in zip(test_ids, origin_of)])
    for c in ("TrueValue", "OneStepMean"):
        if c in fr.rows.columns:
            orc[c] = fr.rows[c].loc[test_ids].to_numpy(dtype=np.float64)
    orc_err = {c: np.abs(y_te - v) / sc_arr for c, v in orc.items()}
    for c, e in orc_err.items():
        out.append(f"  oracle {c}: MASE={fmt(float(e.mean()))}")
    if sc.oracle and sc.oracle in orc_err:
        res["oracle"] = {"column": sc.oracle, "mase": float(orc_err[sc.oracle].mean()),
                         "ci": list(S.bootstrap_ci(zero, orc_err[sc.oracle], S.mae, n=N_BOOT, seed=SEED, groups=grp))}
        res["refMinusOracle"] = ref_mase - float(orc_err[sc.oracle].mean())
    regs: Json = {}
    # matched: one run per origin
    mruns = {int(jnum(f["k"], "k")): load_run(sc, "matched", int(jnum(f["k"], "k"))) for f in folds}
    if all(r is not None for r in mruns.values()):
        r1 = mruns[1]
        assert r1 is not None
        algs: Json = {}
        winners: dict[int, str] = {}; pubs: dict[int, bool] = {}; trusts: dict[int, str] = {}
        for k, r in mruns.items():
            assert r is not None
            dk = ps_decision(r); winners[k] = str(dk["winner"]); pubs[k] = bool(dk["wouldAutoPublish"]); trusts[k] = str(dk["trust"])
            n_tr = len(jstrs(r.model["psTrainIds"], "t")) + len(jstrs(r.model["psHoldoutIds"], "h"))
            if n_tr != len(jstrs(jdict(folds[k - 1], "f")["trainIds"], "tr")):
                raise RuntimeError(f"{sc.sid} origin {k}: PS read {n_tr} rows, the window has {len(jstrs(jdict(folds[k - 1], 'f')['trainIds'], 'tr'))}")
        for a in r1.algos:
            pred = np.empty(len(test_ids))
            for j, (i, k) in enumerate(zip(test_ids, origin_of)):
                rk = mruns[k]
                assert rk is not None
                pred[j] = float(np.asarray(rk.preds[f"p_{a}"].loc[[i]].to_numpy(), dtype=np.float64)[0])
            err = np.abs(y_te - pred) / sc_arr
            aj: Json = {"mase": float(err.mean()), "ci": list(S.bootstrap_ci(zero, err, S.mae, n=N_BOOT, seed=SEED, groups=grp)),
                        "rmse": S.rmse(y_te, pred),
                        # R2 against each origin's TRAINING-window mean, the constant a forecaster actually has (fix round 1,
                        # I-1); pooled over horizons h = 1..H and origins. The pooled test-mean R2 is kept, labelled, for contrast.
                        "r2VsOriginTrainMean": float(1 - np.sum((y_te - pred) ** 2) / np.sum((y_te - tmean) ** 2)),
                        "r2VsPooledTestMean": S.r2(y_te, pred)}
            for nm, be in base_err.items():
                dv, lo, hi = S.paired_bootstrap(zero, err, be, S.mae, n=N_BOOT, seed=SEED, groups=grp)
                aj[f"psMinus_{nm}"] = {"value": dv, "ci": [lo, hi]}
            dv, lo, hi = S.paired_bootstrap(zero, err, ref_err, S.mae, n=N_BOOT, seed=SEED, groups=grp)
            aj["psMinusRef"] = {"value": dv, "ci": [lo, hi]}
            if sc.oracle and sc.oracle in orc_err:
                dv, lo, hi = S.paired_bootstrap(zero, err, orc_err[sc.oracle], S.mae, n=N_BOOT, seed=SEED, groups=grp)
                aj["psMinusOracle"] = {"value": dv, "ci": [lo, hi]}
            # residual autocorrelation of PS's h-step errors within each origin window (lag 1 pooled)
            resid = y_te - pred
            aj["testResidual"] = R._resid_diag(resid)
            dm = S.diebold_mariano(err, ref_err, h=int(jnum(split["H"], "H")))
            aj["dieboldMarianoVsRef"] = dm
            algs[a] = aj
            pmo = jdict(aj["psMinusOracle"], "p") if "psMinusOracle" in aj else None
            out.append(f"  [matched] {a:<14} MASE={fmt(aj['mase'])} {ci_s(jlist(aj['ci'], 'ci'))} RMSE={fmt(aj['rmse'])} R2 vs origin-train-mean={fmt(aj['r2VsOriginTrainMean'])} (vs pooled test mean {fmt(aj['r2VsPooledTestMean'])}); PS - naive {fmt(jdict(aj['psMinus_naive'], 'p')['value'])} {ci_s(jlist(jdict(aj['psMinus_naive'], 'p')['ci'], 'ci'))}; PS - seasonalNaive {fmt(jdict(aj['psMinus_seasonalNaive'], 'p')['value'])} {ci_s(jlist(jdict(aj['psMinus_seasonalNaive'], 'p')['ci'], 'ci'))}; PS - mean {fmt(jdict(aj['psMinus_mean'], 'p')['value'])} {ci_s(jlist(jdict(aj['psMinus_mean'], 'p')['ci'], 'ci'))}; PS - ref {fmt(jdict(aj['psMinusRef'], 'p')['value'])} {ci_s(jlist(jdict(aj['psMinusRef'], 'p')['ci'], 'ci'))}"
                       + (f"; PS - oracle {fmt(pmo['value'])} {ci_s(jlist(pmo['ci'], 'ci'))}" if pmo else "")
                       + f"; DM vs ref stat={fmt(dm['statistic'], 3)} p={fmt(dm['pValue'], 4)}")
        pub_n = sum(1 for x in pubs.values() if x)
        wc: dict[str, int] = {}
        for w in winners.values():
            wc[w] = wc.get(w, 0) + 1
        tc: dict[str, int] = {}
        for t in trusts.values():
            tc[t] = tc.get(t, 0) + 1
        mdec: Json = {"winnersByOrigin": winners, "winnerCounts": wc, "trustCounts": tc, "autoPublishOrigins": pub_n}
        out.append(f"  [matched] PS decision per origin: winners {wc}; trust {tc}; would auto-publish at {pub_n}/{len(folds)} origins")
        regs["matched"] = {"algorithms": algs, "decision": mdec}
    # default / asShipped: whole series, PS's own holdout
    for regime in ("default", "asShipped"):
        run = load_run(sc, regime, None)
        if run is None:
            continue
        ho = run_ids(sc, run, "psHoldoutIds"); tr = run_ids(sc, run, "psTrainIds")
        tmax = fr.rows["T"].loc[tr].max()
        early = int((fr.rows["T"].loc[ho] <= tmax).sum())
        dec = ps_decision(run)
        rj: Json = {"decision": dec, "decisionVsP5": decision_vs_p5(dec, outcome, shipped), "psHoldoutRows": len(ho),
                    "holdoutNotAfterTrain": early, "trainOverlapP5Test": len(set(tr) & set(test_ids))}
        out.append(f"  [{regime}] PS read {len(tr) + len(ho)} months; holdout {len(ho)} months, {early} of them dated on/before the latest training month (interpolation, not forecasting); PS training months that are P5 test months: {rj['trainOverlapP5Test']}")
        out.append(f"    PS decision: winner={dec['winner']} trust={dec['trust']} canAct={dec['canAct']} wouldAutoPublish={dec['wouldAutoPublish']} -> {rj['decisionVsP5']}")
        algs2: Json = {}
        for a in run.algos:
            m = model_of(run, a)
            hm = jdict(m["holdoutMetrics"], "hm")
            yh = fr.rows["Target"].loc[ho].to_numpy(dtype=np.float64); ph = ps_pred(run, a, ho)
            all_ids = order
            e_all = y_all - ps_pred(run, a, all_ids)
            diag = R._resid_diag(e_all)
            aj2: Json = {"reported": hm, "trust": jdict(m["trust"], "t")["grade"], "recomputedR2": S.r2(yh, ph),
                         "holdoutRmse": S.rmse(yh, ph), "residualAllMonths": diag}
            if sc.oracle:
                # Ruling Q10 (fix round 1, I-3): a default/asShipped series model is fit on months on both sides of each
                # holdout month, so its information set includes neighbouring y: the one-step truth (OneStepMean) is
                # the oracle, a lower bound for an interpolating model. TrueValue (marginal) only where no OneStepMean.
                tcol = "OneStepMean" if "OneStepMean" in fr.rows.columns else "TrueValue"
                if tcol in fr.rows.columns:
                    aj2["oracleHoldoutRmse"] = S.rmse(yh, fr.rows[tcol].loc[ho].to_numpy(dtype=np.float64))
                    aj2["oracleColumn"] = tcol
            algs2[a] = aj2
            lb = jdict(diag["ljungBox"], "lb")
            out.append(f"    {a:<14} reported r2={fmt(hm.get('r2'))} recomputed={fmt(aj2['recomputedR2'])} holdout RMSE={fmt(aj2['holdoutRmse'])}"
                       + (f" (oracle {aj2.get('oracleColumn')} RMSE {fmt(aj2.get('oracleHoldoutRmse'))})" if 'oracleHoldoutRmse' in aj2 else "")
                       + f" trust={aj2['trust']} | residuals over all {len(all_ids)} months: acf1={fmt(diag['acf1'], 3)} DW={fmt(diag['durbinWatson'], 3)} Ljung-Box p={fmt(lb['pValue'], 4)} (lags {lb['lags']})")
        rj["algorithms"] = algs2
        regs[regime] = rj
    res["regimes"] = regs
    a_s = jdict(regs.get("asShipped", {}), "a")
    v: list[Json] = [
        verdict("S-T.1", False, "no lag, rolling-window, time-index or horizon step exists: FeatureStepKind (Core/src/feature-steps.ts:16-25), AsOfStrategy (Core/src/pipeline-spec.ts:40-51), ProblemType classification|regression (Core/src/sidecar-contract.ts:27)"),
        verdict("S-T.2", False, f"PS has no backtest; its holdout is the trailing primary-key slice, here {a_s.get('holdoutNotAfterTrain')}/{a_s.get('psHoldoutRows')} holdout months dated on/before the latest training month (asShipped)"),
        verdict("S-T.3", False, "PS computes no naive or seasonal-naive baseline and no MASE"),
    ]
    if a_s:
        worst = {a: jdict(jdict(jdict(x, "x")["residualAllMonths"], "r")["ljungBox"], "lb")["pValue"] for a, x in jdict(a_s["algorithms"], "a").items()}
        v.append(verdict("S-T.6", False, "PS reports no residual diagnostic; measured Ljung-Box p on PS residuals (asShipped, all months): " + ", ".join(f"{a} {fmt(p, 4)}" for a, p in worst.items())))
    if sc.sid == "T3":
        mm = jdict(regs.get("matched", {}), "m")
        if mm:
            ra = jdict(jdict(mm["algorithms"], "a")["ridge"], "r")
            pmo = jdict(ra["psMinusOracle"], "p")
            md = jdict(mm["decision"], "d")
            v.append(verdict("S2.4", False, f"the SamePeriodTarget trap is not flagged: matched winners {md['winnerCounts']}, auto-published at {md['autoPublishOrigins']} origins; ridge beats the one-step oracle by {fmt(-jnum(pmo['value'], 'v'))} MASE {ci_s([-jnum(jlist(pmo['ci'], 'c')[1], 'c'), -jnum(jlist(pmo['ci'], 'c')[0], 'c')])}"))
    v.append(verdict("S1.4", False, "no forecast task type (Core/src/sidecar-contract.ts:27)"))
    v.append(verdict("S6.6", False, "no forecast interval"))
    res["verdicts"] = v
    return res


# ------------------------------------------------------------------ real multiclass (Course Completion) ------------
def judge_shipped(out: list[str]) -> Json | None:
    d = P6 / "C3-real"
    if not (d / "model.json").exists():
        return None
    m = jload(d / "model.json")
    p = pd.read_csv(d / "predictions.csv", dtype={"ID": str})
    p = p.set_index(pd.Index(p["ID"].str.lower().to_numpy()))
    ho = [i.lower() for i in jstrs(m["fullRegimeHoldoutIds"], "h")]
    y = p["target"].loc[ho].astype(str).to_numpy()
    classes, counts = np.unique(p["target"].astype(str).to_numpy(), return_counts=True)
    maj = str(classes[counts.argmax()])
    res: Json = {"rows": len(p), "classCounts": {str(c): int(n) for c, n in zip(classes, counts)}, "majority": maj,
                 "holdoutRows": len(ho), "majorityHoldoutAccuracy": float(np.mean(y == maj))}
    out.append(f"  rows {len(p)} class counts {res['classCounts']}; full-rows PS holdout {len(ho)} rows; always-'{maj}' accuracy on it {fmt(res['majorityHoldoutAccuracy'])}")
    labs: Json = {}
    lab_names = jstrs(m["labels"], "labels")
    for lab, x in zip(lab_names, jlist(m["models"], "models")):
        mx = jdict(x, "m")
        labs[lab] = {"holdoutMetrics": mx["holdoutMetrics"], "trust": jdict(mx["trust"], "t")["grade"],
                     "wouldAutoPublish": mx["wouldAutoPublish"], "leakageFlagged": mx["leakageFlagged"],
                     "trainingRowCount": mx["trainingRowCount"]}
        out.append(f"  [{lab}] TrainingRowCount={mx['trainingRowCount']} holdoutMetrics={json.dumps(mx['holdoutMetrics'])} trust={jdict(mx['trust'], 't')['grade']} wouldAutoPublish={mx['wouldAutoPublish']}")
    # Ruling Q16: each regime on its OWN holdout (fix round 1, M-6). The as-shipped model read the engine's default-capped
    # 1,000 rows and held out their trailing 15%; that read is reconstructed by probe-scenario-runner --section engine-read.
    er = jload(d / "asshipped-read" / "engine-read.json")
    own = {"asshipped": [i.lower() for i in jstrs(er["holdoutIds"], "h")], "full": ho}
    for lab in ("asshipped", "full"):
        col = f"p_{lab}"
        if col in p.columns:
            hol = own[lab]
            yl = p["target"].loc[hol].astype(str).to_numpy()
            cl = p[f"class_{lab}"].loc[hol].astype(str).to_numpy()
            nd = int(p[col].round(6).nunique())
            lv = labs[lab]
            assert isinstance(lv, dict)
            labs_j = lv
            labs_j["holdoutAccuracyRecomputed"] = float(np.mean(cl == yl))
            labs_j["ownHoldoutRows"] = len(hol)
            labs_j["majorityOwnHoldoutAccuracy"] = float(np.mean(yl == maj))
            labs_j["distinctScores"] = nd
            labs_j["predictedClassCounts"] = {str(c): int(n) for c, n in zip(*np.unique(p[f"class_{lab}"].astype(str), return_counts=True))}
            out.append(f"  [{lab}] own holdout {len(hol)} rows: accuracy recomputed {fmt(labs_j['holdoutAccuracyRecomputed'])} vs always-'{maj}' {fmt(labs_j['majorityOwnHoldoutAccuracy'])}; distinct scores over all rows {nd}; predicted classes {labs_j['predictedClassCounts']}")
    res["models"] = labs
    return res


# ------------------------------------------------------------------ main --------------------------------------------
def main(only: Sequence[str]) -> int:
    print("$ python -m truthsuite.judges.scenarios" + ("" if not only else " " + " ".join(only)))
    print(f"# bootstrap n={N_BOOT} seed={SEED}; scores from truthsuite/refpipe/scoring.py (the P5 definitions)")
    allres: Json = {}
    for sc in SCENARIOS:
        if only and sc.sid not in only:
            continue
        out: list[str] = []
        p5j = jload(P5 / f"{sc.p5}.json")
        ref = pd.read_csv(P6 / "ref" / f"{sc.p5}.csv", dtype={"ID": str})
        fr = load_frame(sc)
        print(f"\n=== {sc.sid} ({sc.problem}; P5 scenario {sc.p5}; oracle {sc.oracle or 'none (real data: observed target)'}){' — ' + sc.note if sc.note else ''}")
        if sc.problem == "series":
            res = judge_series(sc, fr, p5j, ref, out)
        elif sc.problem == "multiclass":
            res = judge_multiclass(sc, fr, p5j, ref, out)
        else:
            res = judge_tabular(sc, fr, p5j, ref, out)
        for ln in out:
            print(ln)
        print("  verdicts:")
        for vj in jlist(res["verdicts"], "v"):
            vv = jdict(vj, "v")
            print(f"    {vv['criterion']:<6} {vv['verdict']:<10} {vv['evidence']}")
        allres[sc.sid] = res
    out2: list[str] = []
    sh = judge_shipped(out2) if (not only or "C3-real" in only) else None
    if sh is not None:
        print("\n=== C3-real (MoreCheese: Course Completion Risk, shipped pipeline retrained; real data, observed target)")
        for ln in out2:
            print(ln)
        allres["C3-real"] = sh

    def clean(o: object) -> object:
        if isinstance(o, dict):
            return {str(k): clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, (np.floating, float)):
            f = float(o)
            return None if math.isnan(f) else f
        if isinstance(o, np.integer):
            return int(o)
        if isinstance(o, np.bool_):
            return bool(o)
        return o
    if not only:
        (P6 / "judge.json").write_text(json.dumps(clean(allres), indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
