# truthsuite/refpipe/run.py — P5 reference pipeline (the professional-grade yardstick). Usage:
#   .venv/bin/python -m truthsuite.refpipe.run <scenario_id> --out <file> [--shuffle-labels]
# Scenario ids: the 15 in data/scenarios/<id>/ (rows.csv + manifest.json), plus C1 and T2-real (data/person_years.parquet)
# and C3 (data/worlds/W9-multiclass/seed-42/rows.csv, Ruling Q11).
#
# Truth isolation: install_truth_guard() adds a sys.addaudithook that refuses to open any truth*.csv file or a planted
# world's manifest.json (which carries oracle scores). The manifest of a data/scenarios scenario is read for its `kind`,
# declared `slices` and — only through truthsuite/scenarios/manifest.py rolling_origin() — its rolling-origin design; the
# `planted` block (true betas) and the trap declarations are never used. The JSON records the guard and its count of
# blocked attempts, which must be 0.
#
# Evaluation modes (Ruling Q12): the headline is DEPLOYMENT mode — the locked holdout is every row in the future period(s),
# cut at a 1 January boundary (C1 / T2-real / R2-real: decision year 2024, reproducing the Task 7 carve; the half-year
# 2025 fold is excluded). Entities seen in training may appear in it; grouping stays in inner CV and in the cluster
# bootstrap. NEW-ENTITY mode (T2p, C1, T2-real, D1c, D1r) holds out whole entities with zero shared keys, under `modes`.
#
# Gate outcome (Rulings Q13 + Q14 + Q15, gate_decision / q13_gate): model (beats the dummy and the best simple member,
# or - Q15 - beats the dummy when no simple member does) | keep-simple-baseline (ships the best-scoring member of the
# simple set {one-feature, GLM} / {naive, seasonal naive} that beats the dummy; P1 S1.3's "keep the heuristic") |
# no-signal (nothing beats the dummy). `gate.shipped` names what is delivered. noSignal = (outcome == no-signal).
#
# Flow (each step names the P1 criterion it demonstrates, collected into the JSON's `criteria`):
#   carve -> leakage audit on the training carve -> inner-CV selection by the primary proper score (1-SE rule toward the
#   simplest candidate) -> refit + calibration on out-of-fold predictions -> ONE scoring of the locked test carve with
#   bootstrap CIs, three baselines, paired differences and the promotion gate -> calibration / intervals / importance /
#   residual diagnostics / slices. When the audit flags a column, the same pipeline is re-run with every column (the
#   "naive" run) so the difference is visible.
from __future__ import annotations

import os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[_v] = "1"  # single-threaded BLAS/OpenMP before numpy loads (S5.4)

import argparse
import hashlib
import json
import math
import pathlib
import re
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

import numpy as np
import numpy.typing as npt
import pandas as pd

from truthsuite import paths

_BLOCKED: list[str] = []


GUARD = ("sys.addaudithook(open) + wrapped pyarrow readers (csv.read_csv/open_csv, parquet.read_table/ParquetFile/"
         "ParquetDataset, json.read_json, feather.read_table/read_feather, dataset.dataset) + native pyarrow handles "
         "(memory_map, OSFile, input_stream, fs.LocalFileSystem.open_input_stream/open_input_file). Scope: Python open, "
         "pandas/numpy (through open or the wrapped pyarrow readers) and the listed pyarrow entry points; filesystems "
         "reached through pyarrow.fs.FileSystem.from_uri or other C++ entry points are outside it")


def _is_truth_path(name: str) -> bool:
    """Case-insensitive: any truth*.csv/json/parquet file, or a planted world's manifest.json (it carries oracle scores)."""
    norm = name.replace("\\", "/").lower()
    base = os.path.basename(norm)
    if re.match(r"^truth.*\.(csv|json|parquet)$", base):
        return True
    return "/world/" in norm and base == "manifest.json"


def _check(p: object) -> None:
    if isinstance(p, (str, bytes, os.PathLike)):
        name = os.path.abspath(os.fsdecode(p))
        if _is_truth_path(name):
            _BLOCKED.append(name)
            raise PermissionError(f"P5 truth isolation: refusing to open {name}")


def _wrap(mod_name: str, attr: str) -> None:
    import importlib
    try:
        mod = importlib.import_module(mod_name)
    except ImportError:
        return
    orig: Callable[..., object] | None = getattr(mod, attr, None)
    if orig is None:
        return
    inner: Callable[..., object] = orig

    def guarded(*args: object, **kwargs: object) -> object:
        for v in list(args[:1]) + [kwargs.get(k) for k in ("source", "path", "path_or_paths", "input_file")]:
            if isinstance(v, (list, tuple)):
                for x in v:
                    _check(x)
            else:
                _check(v)
        return inner(*args, **kwargs)
    setattr(mod, attr, guarded)


def _guard_local_fs() -> None:
    """pyarrow.fs.LocalFileSystem is an immutable extension type: replace the module attribute with a subclass whose
    input-opening methods check the path first."""
    import importlib
    try:
        mod = importlib.import_module("pyarrow.fs")
    except ImportError:
        return
    base: type = getattr(mod, "LocalFileSystem")

    def open_input_stream(self: object, path: object, *args: object, **kwargs: object) -> object:
        _check(path)
        fn: Callable[..., object] = getattr(base, "open_input_stream")
        return fn(self, path, *args, **kwargs)

    def open_input_file(self: object, path: object, *args: object, **kwargs: object) -> object:
        _check(path)
        fn: Callable[..., object] = getattr(base, "open_input_file")
        return fn(self, path, *args, **kwargs)
    guarded = type("GuardedLocalFileSystem", (base,), {"open_input_stream": open_input_stream,
                                                       "open_input_file": open_input_file})
    setattr(mod, "LocalFileSystem", guarded)


def install_truth_guard() -> None:
    """Refuse (PermissionError) any open of truth.csv / truth_origins.csv / a world manifest carrying oracle scores,
    through Python's open (audit hook) and through pyarrow's native readers, which bypass Python's open."""
    def hook(event: str, args: tuple[object, ...]) -> None:
        if event != "open" or not args:
            return
        _check(args[0])
    sys.addaudithook(hook)
    _guard_local_fs()
    for mod_name, attr in (("pyarrow", "memory_map"), ("pyarrow", "OSFile"), ("pyarrow", "input_stream"),
                           ("pyarrow.csv", "read_csv"), ("pyarrow.csv", "open_csv"), ("pyarrow.parquet", "read_table"),
                           ("pyarrow.parquet", "ParquetFile"), ("pyarrow.parquet", "ParquetDataset"),
                           ("pyarrow.json", "read_json"), ("pyarrow.feather", "read_table"),
                           ("pyarrow.feather", "read_feather"), ("pyarrow.dataset", "dataset")):
        _wrap(mod_name, attr)


from truthsuite.refpipe import baselines as B  # noqa: E402
from truthsuite.refpipe.audit import Audit, leakage_audit  # noqa: E402
from truthsuite.refpipe.models import (ALGOS, SERIES_ALGOS, CalibratedModel, Calibrator, Predictor,  # noqa: E402
                                       SeriesModel, TabularModel, TWEEDIE_POWER)
from truthsuite.refpipe import scoring as S  # noqa: E402
from truthsuite.refpipe.splits import (date_carve, date_grouped_carve, grouped_carve, inner_cv, origin_folds,  # noqa: E402
                                       random_carve, trailing_cutoff, year_cutoff)
from truthsuite.scenarios.manifest import RollingOrigin  # noqa: E402
from truthsuite.scenarios.manifest import rolling_origin as manifest_rolling_origin  # noqa: E402

FArr = npt.NDArray[np.float64]
IntArr = npt.NDArray[np.int64]
Json = dict[str, object]
SEED = 0
N_BOOT = 1000
HOLDOUT_ENTITY_FRAC = 0.3
TEST_FRAC = 0.25
PANEL_CODES = ("C1", "T2-real")
TASK7_TEST_YEAR = 2024  # finals: FINAL_ORIGIN = 2024; 2025 is a half-year fold by construction
NEW_ENTITY_SCENARIOS = ("T2p", "C1", "T2-real", "D1c", "D1r")  # Ruling Q12: new-entity mode where relevant
REF_NUM = ["tenure_years", "prior_lapse", "events_attended_y", "courses_completed_y", "certs_held_y",
           "committee_active_y", "nondues_lines_y", "nondues_spend_y"]
REF_CAT = ["tier", "segment", "region"]
W9_FEATURES = ["TicketTier", "DaysRegisteredBefore", "PriorAttendance"]


# ------------------------------------------------------------------ loading -----------------------------------------
@dataclass
class Scenario:
    sid: str
    df: pd.DataFrame
    problem: str          # binary | multiclass | regression | count | tweedie | series
    structure: str        # cross-section | panel | series
    manifest_kind: str
    features: list[str]
    classes: list[str] = field(default_factory=list)
    rolling: RollingOrigin | None = None
    slices: dict[str, object] = field(default_factory=dict)
    source: Json = field(default_factory=dict)
    deploy_test_year: int | None = None      # explicit deployment test year (Task 7 carve), later years excluded
    inner_gap: pd.Timedelta = pd.Timedelta(days=365)  # gap >= h between inner-training and validation T (S-T.4)
    gap_reason: str = "one annual period (h = 1): the outcome of period p is observed before period p+1"

    @property
    def has_time(self) -> bool:
        return bool(self.df["T"].notna().all())

    @property
    def entities_repeat(self) -> bool:
        return bool(self.df["EntityKey"].duplicated().any())


def _sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_scenario(sid: str) -> Scenario:
    if sid in PANEL_CODES:
        path = paths.real_fixture("person_years.parquet")
        py = pd.read_parquet(path)
        df = pd.DataFrame({"ID": py["person_id"].astype(str) + ":" + py["period_index"].astype(str),
                           "EntityKey": py["person_id"].astype(str), "T": pd.to_datetime(py["decision_date"])})
        for c in REF_NUM + REF_CAT:
            df[c] = py[c].to_numpy()
        df["Target"] = py["renewed"].astype(int).to_numpy()
        structure = "cross-section" if sid == "C1" else "panel"
        return Scenario(sid, df, "binary", structure, "binary (person_years.renewed)", REF_NUM + REF_CAT,
                        source={"file": "data/person_years.parquet", "sha256": _sha(path), "target": "renewed",
                                "key": "(person_id, period_index)", "T": "decision_date"},
                        deploy_test_year=TASK7_TEST_YEAR, inner_gap=pd.Timedelta(days=400),
                        gap_reason="400-day label window: a row's renewal label resolves up to 400 days after its decision date")
    if sid == "C3":
        path = paths.seed_dir("world", "W9-multiclass", 42) / "rows.csv"
        w = pd.read_csv(path)
        classes = sorted(str(c) for c in w["Outcome"].unique())
        df = pd.DataFrame({"ID": w["ID"].astype(str), "EntityKey": w["PersonID"].astype(str),
                           "T": pd.to_datetime(w["EventDate"])})
        for c in W9_FEATURES:
            df[c] = w[c].to_numpy()
        df["Target"] = w["Outcome"].map({c: i for i, c in enumerate(classes)}).astype(int).to_numpy()
        return Scenario(sid, df, "multiclass", "cross-section", "multiclass (W9-multiclass seed-42)", W9_FEATURES,
                        classes=classes, source={"file": "data/worlds/W9-multiclass/seed-42/rows.csv", "sha256": _sha(path),
                                                 "target": "Outcome", "entity": "PersonID", "T": "EventDate"})
    if sid in ("R2-real", "T1-real"):
        man_path = paths.real_fixture(f"{sid}.manifest.json")
        rows_path = paths.real_fixture(f"{sid}.rows.csv")
    else:
        spec_id = "T3" if sid == "T3-lag" else sid
        spec = json.loads((paths.FIXTURES / "scenarios" / "specs" / f"{spec_id}.json").read_text())
        d = paths.seed_dir("scenario", sid, int(spec["seed"]))
        man_path = d / "manifest.json"
        rows_path = d / "rows.csv"
    man = json.loads(man_path.read_text())
    kind = str(man["kind"])
    rows = pd.read_csv(rows_path, dtype={"ID": str, "EntityKey": str})
    rows["T"] = pd.to_datetime(rows["T"])
    feats = [c for c in rows.columns if c not in ("ID", "EntityKey", "T", "Target")]
    slices_obj = man.get("slices") or {}
    slices = dict(slices_obj) if isinstance(slices_obj, dict) else {}
    src: Json = {"file": f"data/scenarios/{sid}/rows.csv", "sha256": _sha(rows_path),
                 "manifestFieldsRead": ["kind", "slices"] + (["rollingOrigin via truthsuite.scenarios.manifest.rolling_origin"]
                                                               if kind == "series" else [])}
    if kind == "series":
        return Scenario(sid, rows, "series", "series", kind, feats, rolling=manifest_rolling_origin(man), slices=slices, source=src)
    if sid == "R2-real":  # same person-period rows and decision dates as person_years (P3); target = next-365-day spend
        return Scenario(sid, rows, kind, "cross-section", kind, feats, slices=slices, source=src,
                        deploy_test_year=TASK7_TEST_YEAR, inner_gap=pd.Timedelta(days=365),
                        gap_reason="365-day target window: next-365-day spend resolves 365 days after the decision date")
    if kind == "panel":
        return Scenario(sid, rows, "regression", "panel", kind, feats, slices=slices, source=src)
    return Scenario(sid, rows, kind, "cross-section", kind, feats, slices=slices, source=src)


# ------------------------------------------------------------------ split -------------------------------------------
@dataclass
class Split:
    kind: str
    folds: list[tuple[list[str], list[str]]]
    info: Json


def _deploy_frame(sc: Scenario) -> tuple[pd.DataFrame, pd.Timestamp, int]:
    """Rows eligible for evaluation and the deployment cutoff. For an explicit test year, later years are excluded."""
    df = sc.df
    if sc.deploy_test_year is not None:
        yrs = pd.to_datetime(df["T"]).dt.year
        keep = yrs <= sc.deploy_test_year
        return df.loc[keep].reset_index(drop=True), pd.Timestamp(year=sc.deploy_test_year, month=1, day=1), int((~keep).sum())
    return df, year_cutoff(df["T"]), 0


def make_split(sc: Scenario, seed: int = SEED) -> Split:
    """Deployment mode (Ruling Q12, the headline): the locked holdout is every row in the future period(s), cut at a
    1 January boundary. Entities seen in training may appear in it; grouping stays in inner CV and the cluster bootstrap."""
    df = sc.df
    if sc.problem == "series":
        assert sc.rolling is not None
        return Split("rolling-origin", origin_folds(df, sc.rolling),
                     {"K": sc.rolling.K, "H": sc.rolling.H, "firstTestPeriod": sc.rolling.firstTestPeriod,
                      "source": "truthsuite.scenarios.manifest.rolling_origin", "evaluationMode": "deployment"})
    if sc.has_time:
        d, cut, excluded = _deploy_frame(sc)
        tr, te = date_carve(d, cut)
        info: Json = {"cutoff": str(cut.date()), "evaluationMode": "deployment", "excludedAfterTestRows": excluded,
                      "rule": ("train = decision year < %d, test = decision year %d, later rows excluded (Task 7 carve)" % (cut.year, cut.year)
                               if sc.deploy_test_year is not None else
                               "train = T < cutoff, test = every row with T >= cutoff; cutoff = earliest 1 January whose trailing block holds <= 25% of rows (at least the last year)")}
        return Split("deployment", [(tr, te)], info)
    if sc.entities_repeat:
        tr, te = grouped_carve(df, TEST_FRAC, seed)
        return Split("grouped", [(tr, te)], {"holdoutEntityFrac": TEST_FRAC, "evaluationMode": "deployment"})
    tr, te = random_carve(df, TEST_FRAC, seed)
    return Split("random", [(tr, te)], {"testFrac": TEST_FRAC, "why": "no T and every EntityKey occurs once",
                                        "evaluationMode": "deployment"})


def make_new_entity_split(sc: Scenario, seed: int = SEED) -> Split | None:
    """New-entity mode (Ruling Q12): whole entities held out, zero shared keys; the test is the held-out entities' rows
    at T >= the deployment cutoff and training is the other entities' rows before it."""
    if sc.sid not in NEW_ENTITY_SCENARIOS:
        return None
    d, cut, excluded = _deploy_frame(sc)
    tr, te = date_grouped_carve(d, cut, HOLDOUT_ENTITY_FRAC, seed)
    return Split("new-entity", [(tr, te)], {"cutoff": str(cut.date()), "holdoutEntityFrac": HOLDOUT_ENTITY_FRAC,
                                            "evaluationMode": "new-entity", "excludedAfterTestRows": excluded,
                                            "rule": "test = held-out entities (30%) at T >= cutoff; train = the other entities at T < cutoff"})


# ------------------------------------------------------------------ scores per family -------------------------------
@dataclass(frozen=True)
class Family:
    name: str
    fn: Callable[[npt.NDArray[np.generic], npt.NDArray[np.generic]], float]
    row_loss: Callable[[npt.NDArray[np.generic], FArr], FArr]


def _rl_logloss(y: npt.NDArray[np.generic], p: FArr) -> FArr:
    if p.ndim == 1:
        q = np.clip(p, 1e-15, 1 - 1e-15); yy = np.asarray(y, dtype=np.float64)
        return np.asarray(-(yy * np.log(q) + (1 - yy) * np.log(1 - q)), dtype=np.float64)
    q = np.clip(p, 1e-15, 1 - 1e-15); q = q / q.sum(axis=1, keepdims=True); yi = np.asarray(y, dtype=np.int64)
    return np.asarray(-np.log(q[np.arange(len(yi)), yi]), dtype=np.float64)


def _rl_se(y: npt.NDArray[np.generic], p: FArr) -> FArr:
    return np.asarray((np.asarray(y, dtype=np.float64) - p) ** 2, dtype=np.float64)


def _rl_pois(y: npt.NDArray[np.generic], mu: FArr) -> FArr:
    yy = np.asarray(y, dtype=np.float64); m = np.maximum(mu, 1e-15)
    with np.errstate(divide="ignore", invalid="ignore"):
        ylog = np.where(yy > 0, yy * np.log(yy / m), 0.0)
    return np.asarray(2 * (ylog - (yy - m)), dtype=np.float64)


def _rl_tw(y: npt.NDArray[np.generic], mu: FArr) -> FArr:
    yy = np.asarray(y, dtype=np.float64); m = np.maximum(mu, 1e-15); p = TWEEDIE_POWER
    return np.asarray(2 * (np.power(yy, 2 - p) / ((1 - p) * (2 - p)) - yy * np.power(m, 1 - p) / (1 - p)
                           + np.power(m, 2 - p) / (2 - p)), dtype=np.float64)


def family(problem: str) -> Family:
    if problem == "binary":
        return Family("logLoss", S.log_loss_score, _rl_logloss)
    if problem == "multiclass":
        return Family("multiclassLogLoss", S.log_loss_score, _rl_logloss)
    if problem == "regression":
        return Family("rmse", S.rmse, _rl_se)
    if problem == "count":
        return Family("poissonDeviance", S.poisson_deviance, _rl_pois)
    if problem == "tweedie":
        return Family("tweedieDeviance(power=1.5)", S.tweedie_deviance, _rl_tw)
    raise ValueError(problem)


def task_type_check(sc: Scenario) -> Json:
    y = sc.df["Target"]
    vals = np.asarray(y, dtype=np.float64)
    nlev = int(y.nunique()); nonneg = bool((vals >= 0).all()); integer = bool(np.all(np.floor(vals) == vals))
    ok = {"binary": nlev == 2, "multiclass": nlev > 2, "count": nonneg and integer,
          "tweedie": nonneg and bool((vals == 0).any()), "regression": nlev > 2, "series": nlev > 2}[sc.problem]
    return {"declared": sc.problem, "levels": nlev, "nonNegative": nonneg, "integer": integer,
            "zeroShare": float((vals == 0).mean()), "consistent": bool(ok)}


def _ci(lo_hi: tuple[float, float]) -> list[float]:
    return [lo_hi[0], lo_hi[1]]


def _groups(d: pd.DataFrame) -> list[object] | None:
    return list(d["EntityKey"].astype(str)) if bool(d["EntityKey"].duplicated().any()) else None


# ------------------------------------------------------------------ Q13 gate ----------------------------------------
GATE_OUTCOMES = ("model", "keep-simple-baseline", "no-signal")
GATE_BRANCHES = ("a:beats-best-simple", "a:Q15-only-model-beats-dummy", "b:keep-simple-baseline", "c:no-signal")
Q15_NOTE = "no simple baseline carries demonstrable signal"


def gate_decision(model_beats_dummy: bool, model_beats_best: bool, member_beats_dummy: dict[str, bool],
                  scores: dict[str, float], delivered_member: str | None) -> tuple[str, str, str | None]:
    """Rulings Q13 + Q14 + Q15 as a pure decision on the paired lower-bound tests. Returns (outcome, branch, shipped
    member or None). Every input maps to exactly one branch:
      a:beats-best-simple            - the selected model (not itself a simple member) beats the dummy and the best
                                       simple member (Q13 (a): it beats the strongest baseline, dummy included);
      a:Q15-only-model-beats-dummy   - the selected model beats the dummy and no simple member does (Q15);
      b:keep-simple-baseline         - not (a), and a simple member beats the dummy; ship the best-scoring such (Q14);
      c:no-signal                    - neither the model nor any simple member beats the dummy."""
    eligible = [k for k in sorted(member_beats_dummy) if member_beats_dummy[k]]
    if delivered_member is None and model_beats_dummy and model_beats_best:
        return "model", GATE_BRANCHES[0], None
    if model_beats_dummy and not eligible:
        return "model", GATE_BRANCHES[1], None
    if eligible:
        return "keep-simple-baseline", GATE_BRANCHES[2], min(eligible, key=lambda k: (scores[k], k))
    return "no-signal", GATE_BRANCHES[3], None


def q13_gate(y: npt.NDArray[np.generic], fn: Callable[[npt.NDArray[np.generic], npt.NDArray[np.generic]], float],
             model: FArr, dummy: FArr, simple: Sequence[tuple[str, FArr]], names: dict[str, str],
             delivered_member: str | None, seed: int, groups: list[object] | None, model_name: str) -> Json:
    """Rulings Q13 + Q14 + Q15 (decision in gate_decision). The simple set is {one-feature, GLM} for tabular data and
    {naive, seasonal naive} for series. "Beats" = the lower bound of the paired 95% bootstrap CI of (other - candidate)
    loss on the same test rows is > 0. `shipped` names what is delivered: the selected model (`model_name`) under (a),
    the best-scoring simple member beating the dummy under (b), and None under (c); `shippedRole` says which."""
    def pb(base: FArr, cand: FArr) -> Json:
        v, lo, hi = S.paired_bootstrap(y, base, cand, fn, n=N_BOOT, seed=seed, groups=groups)
        return {"value": v, "ci": [lo, hi], "beats": lo > 0}
    scores = {nm: fn(y, p) for nm, p in simple}
    best = min(sorted(scores), key=lambda k: scores[k])
    c: dict[str, Json] = {"modelVsDummy": pb(dummy, model)}
    for nm, p in simple:
        c[f"{nm}VsDummy"] = pb(dummy, p)
        c[f"modelVs:{nm}"] = pb(p, model)
    def beats(k: str) -> bool:
        return bool(c[k]["beats"])
    member_beats = {nm: beats(f"{nm}VsDummy") for nm, _ in simple}
    outcome, branch, member = gate_decision(beats("modelVsDummy"), beats(f"modelVs:{best}"), member_beats, scores,
                                            delivered_member)
    shipped: str | None = model_name if outcome == "model" else member
    role: str | None = {"model": "model", "keep-simple-baseline": "simpleBaseline"}.get(outcome)
    return {"outcome": outcome, "branch": branch, "ruling": "Q13 + Q14 + Q15", "roles": names,
            "simpleSet": [nm for nm, _ in simple], "simpleScores": scores, "bestSimple": best,
            "deliveredSimpleMember": delivered_member, "comparisons": c,
            "beatTheDummy": (["model"] if beats("modelVsDummy") else []) + [k for k in sorted(member_beats) if member_beats[k]],
            "shipped": shipped, "shippedRole": role, "note": Q15_NOTE if branch == GATE_BRANCHES[1] else None}


# ------------------------------------------------------------------ tabular pipeline --------------------------------
@dataclass
class Extras:
    """Per-run arrays kept out of the JSON: the delivered test predictions (tabular) or scaled errors (series)."""
    pred: FArr
    y_test: npt.NDArray[np.generic]
    groups: list[object] | None
    primary_name: str


def _split_types(d: pd.DataFrame, feats: list[str]) -> tuple[list[str], list[str]]:
    num = [c for c in feats if pd.api.types.is_numeric_dtype(d[c])]
    return num, [c for c in feats if c not in num]


def _select(problem: str, fam: Family, dtr: pd.DataFrame, y: npt.NDArray[np.generic], num: list[str], cat: list[str],
            folds: list[tuple[IntArr, IntArr]], n_classes: int, seed: int
            ) -> tuple[str, list[Json], IntArr, dict[str, FArr], dict[str, list[Predictor]]]:
    oof_idx = np.concatenate([va for _, va in folds])
    oof: dict[str, FArr] = {}; fold_models: dict[str, list[Predictor]] = {}
    for algo in ALGOS:
        parts = []; fms: list[Predictor] = []
        for tr, va in folds:
            m = TabularModel(problem, algo, num, cat, n_classes, seed).fit(dtr.iloc[tr], y[tr])
            parts.append(m.predict(dtr.iloc[va])); fms.append(m)
        oof[algo] = np.concatenate(parts, axis=0); fold_models[algo] = fms
    yo = y[oof_idx]
    score = {a: fam.fn(yo, oof[a]) for a in ALGOS}
    best = min(ALGOS, key=lambda a: (score[a], ALGOS.index(a)))
    lb = fam.row_loss(yo, oof[best])
    cands: list[Json] = []; chosen = None
    for a in ALGOS:
        d = fam.row_loss(yo, oof[a]) - lb
        se = float(np.std(d, ddof=1) / math.sqrt(len(d)))
        within = float(d.mean()) <= se
        cands.append({"name": a, "innerCvScore": score[a], "meanRowLossMinusBest": float(d.mean()), "seOfDiff": se,
                      "within1SE": within})
        if chosen is None and within:
            chosen = a
    assert chosen is not None
    return chosen, cands, oof_idx, oof, fold_models


def _intervals(problem: str, r_oof: FArr, pred: FArr, y: FArr) -> Json:
    out: list[Json] = []
    n = len(r_oof)
    for c in (0.8, 0.9):
        if problem == "regression":
            q = float(np.quantile(np.abs(r_oof), min(1.0, math.ceil((n + 1) * c) / n)))
            lo, hi = pred - q, pred + q; how = "split-conformal on |out-of-fold residual|"
        else:
            lo = np.maximum(0.0, pred + float(np.quantile(r_oof, (1 - c) / 2)))
            hi = pred + float(np.quantile(r_oof, (1 + c) / 2)); how = "out-of-fold signed-residual quantiles, lower bound clipped at 0"
        cov = float(np.mean((y >= lo) & (y <= hi))); se = math.sqrt(c * (1 - c) / len(y)); a = 1 - c
        wink = float(np.mean((hi - lo) + (2 / a) * (lo - y) * (y < lo) + (2 / a) * (y - hi) * (y > hi)))
        out.append({"level": c, "method": how, "coverage": cov, "nominal": c, "binomialSE": se,
                    "within3SE": abs(cov - c) <= 3 * se, "meanWidth": float(np.mean(hi - lo)), "intervalScore": wink})
    return {"levels": out, "fitOn": "out-of-fold residuals of the selected candidate (inner CV, training carve only)"}


def _calib_block(problem: str, y: npt.NDArray[np.generic], p: FArr, p_raw: FArr, classes: list[str],
                 groups: list[object] | None) -> Json:
    def one(yk: FArr, pk: FArr, raw: FArr) -> Json:
        c = S.calibration(yk, pk)
        slo = S.bootstrap_ci(yk, pk, lambda a, b: S.calibration(a, b)["slope"], n=200, seed=SEED, groups=groups)
        cil = S.bootstrap_ci(yk, pk, lambda a, b: S.calibration(a, b)["citl"], n=200, seed=SEED, groups=groups)
        return {**c, "slopeCi": _ci(slo), "citlCi": _ci(cil), "raw": S.calibration(yk, raw),
                "reliability": S.reliability(yk, pk)}
    yy = np.asarray(y)
    if problem == "binary":
        return one(yy.astype(np.float64), p, p_raw)
    per = []
    for k, name in enumerate(classes):
        per.append({"class": name, **one((yy == k).astype(np.float64), p[:, k], p_raw[:, k])})
    return {"multiclassMap": "one-vs-rest, renormalised", "perClass": per}


def _residual_panel(resid: FArr, d: pd.DataFrame) -> Json:
    periods = int(d.groupby("EntityKey").size().max())
    L = max(1, min(3, periods - 1))
    order = pd.to_datetime(d["T"]).to_numpy().astype("datetime64[ns]").astype(np.int64)
    rhos, ns = S.panel_acf(resid, list(d["EntityKey"]), order, L)
    x = pd.DataFrame({"e": resid - resid.mean(), "g": d["EntityKey"].astype(str).to_numpy(), "o": order}).sort_values(["g", "o"], kind="mergesort")
    prev = x.groupby("g", sort=False)["e"].shift(1)
    pm = prev.notna()
    # pooled within-entity Durbin-Watson normalised per pair: sum (e_t - e_{t-1})^2 / sum (e_t^2 + e_{t-1}^2)/2, which is
    # about 2(1 - rho) for any number of periods per entity (the plain ratio is biased low when entities have few rows)
    dw = float(((x.loc[pm, "e"] - prev[pm]) ** 2).sum() / (((x.loc[pm, "e"] ** 2) + (prev[pm] ** 2)).sum() / 2))
    q = float(sum(n * r * r for n, r in zip(ns, rhos)))
    p = S.chi2_sf(q, L)
    a1 = rhos[0]
    return {"acf1": a1, "acfByLag": rhos, "pairsByLag": ns, "durbinWatson": dw,
            "ljungBox": {"statistic": q, "pValue": p, "lags": L, "method": "pooled within-entity Box-Pierce (panel)"},
            "effectiveN": S.effective_n(len(resid), a1), "n": len(resid), "significantAutocorrelation": p < 0.05,
            "on": "in-sample training residuals of the final model (y - prediction), within entity in T order"}


def run_tabular(sc: Scenario, split: Split, feats: list[str], seed: int, deep: bool = True) -> tuple[Json, Extras]:
    fam = family(sc.problem)
    f = sc.df.set_index("ID", drop=False)
    tr_ids, te_ids = split.folds[0]
    dtr = f.loc[pd.Index(tr_ids)].reset_index(drop=True); dte = f.loc[pd.Index(te_ids)].reset_index(drop=True)
    num, cat = _split_types(sc.df, feats)
    K = len(sc.classes) if sc.problem == "multiclass" else 2
    ytr = dtr["Target"].to_numpy(); yte = dte["Target"].to_numpy()
    if sc.problem == "multiclass":
        ytr = ytr.astype(np.int64); yte = yte.astype(np.int64)
    blocked = sc.has_time and sc.entities_repeat
    folds = inner_cv(dtr, k=5, seed=seed, grouped=sc.entities_repeat, time_blocked=blocked, gap=sc.inner_gap)
    chosen, cands, oof_idx, oof, fold_models = _select(sc.problem, fam, dtr, ytr, num, cat, folds, K, seed)
    base_model = TabularModel(sc.problem, chosen, num, cat, K, seed).fit(dtr, ytr)
    model: Predictor = base_model
    cal_info: Json | None = None
    applied = False
    if sc.problem in ("binary", "multiclass"):
        # The calibration map is a pipeline step chosen on training data only (S6.3, S5.2). With a time order the decision
        # rows must be exchangeable with deployment: the latest slice of the training carve (T >= the inner trailing cutoff)
        # is predicted by a refit trained on ALL training rows before that slice, the same relation as the full-carve
        # refit to the test period. Without a time order the out-of-fold predictions are exchangeable and are used.
        if blocked:
            tt = pd.to_datetime(dtr["T"])
            c_slice = trailing_cutoff(tt)
            early = np.flatnonzero((tt < c_slice).to_numpy()); late = np.flatnonzero((tt >= c_slice).to_numpy())
            refit = TabularModel(sc.problem, chosen, num, cat, K, seed).fit(dtr.iloc[early], ytr[early])
            yo = ytr[late]; po = refit.predict(dtr.iloc[late]); sub = dtr.iloc[late].reset_index(drop=True)
            basis = "time-ordered validation slice predicted by a refit trained on all rows before it"
            slice_info: Json = {"sliceFrom": str(c_slice.date()), "sliceRows": int(len(late)), "refitRows": int(len(early))}
        else:
            yo = ytr[oof_idx]; po = oof[chosen]; sub = dtr.iloc[oof_idx].reset_index(drop=True)
            basis = "out-of-fold predictions (no time order: rows are exchangeable)"
            slice_info = {"oofRows": int(len(oof_idx))}
        pc = np.empty_like(po)
        for a_i, b_i in inner_cv(sub, k=2, seed=seed, grouped=sc.entities_repeat):
            pc[b_i] = Calibrator.fit(yo[a_i], po[a_i], n_cal_rows=len(a_i)).apply(po[b_i])
        raw_l = fam.fn(yo, po); cal_l = fam.fn(yo, pc)
        cal = Calibrator.fit(yo, po, n_cal_rows=len(yo))
        applied = cal_l < raw_l
        if applied:
            model = CalibratedModel(base_model, cal)
        cal_info = {"method": cal.method, "applied": bool(applied), "nCalibrationRows": int(len(yo)),
                    "nTrainRows": int(len(dtr)), "appliedTo": "full-carve refit",
                    "rule": "Platt below 2,000 calibration rows, isotonic at or above; the map is fit on the decision rows' predictions and applied to the full-carve refit only if a 2-fold cross-fit of it lowers the decision rows' log loss; otherwise the refit is delivered uncalibrated",
                    "decision": {"basis": basis, **slice_info, "rawScore": raw_l, "crossFittedCalibratedScore": cal_l,
                                 "applyIf": "calibrated < raw on the decision rows"}}
    pred = model.predict(dte); pred_raw = base_model.predict(dte)
    g = _groups(dte)
    prim = fam.fn(yte, pred); prim_ci = S.bootstrap_ci(yte, pred, fam.fn, n=N_BOOT, seed=seed, groups=g)

    base = B.base_rate(sc.problem, ytr, K)
    one_col, one_m, one_scores = B.one_feature(sc.problem, dtr, ytr, num, cat, folds, fam.row_loss, K, seed)
    glm_m = B.glm(sc.problem, num, cat, K, seed).fit(dtr, ytr)
    bl: list[tuple[str, Predictor, Json]] = [
        ("baseRate" if sc.problem != "regression" else "mean", base, {}),
        ("oneFeature", one_m, {"column": one_col, "innerCvLossByColumn": one_scores}),
        ("glm", glm_m, {"spec": {"binary": "L2 logistic C=1", "multiclass": "multinomial L2 logistic C=1",
                                 "regression": "ridge alpha=1", "count": "PoissonRegressor alpha=1e-4",
                                 "tweedie": "TweedieRegressor power=1.5 log link alpha=1e-4"}[sc.problem],
                        "sameSpecAsSelected": chosen == "glm", "identicalToDelivered": chosen == "glm" and not applied})]
    baselines: list[Json] = []; comparators: list[str] = []; comp_vals: list[tuple[float, str, float]] = []
    bpred: dict[str, FArr] = {}
    for name, m, extra in bl:
        pb = m.predict(dte); bpred[name] = pb
        v = fam.fn(yte, pb); ci = S.bootstrap_ci(yte, pb, fam.fn, n=N_BOOT, seed=seed, groups=g)
        dd, dlo, dhi = S.paired_bootstrap(yte, pb, pred, fam.fn, n=N_BOOT, seed=seed, groups=g)
        is_comp = not (name == "glm" and chosen == "glm" and not applied)  # excluded only when literally the delivered predictor
        if is_comp:
            comparators.append(name); comp_vals.append((v, name, dlo))
        baselines.append({"name": name, "value": v, "ci": _ci(ci), "baselineMinusModel": {"value": dd, "ci": [dlo, dhi]},
                          "comparator": is_comp, **extra})
    strongest = min(comp_vals)[1]
    beats = all(lo_ > 0 for _, _, lo_ in comp_vals)
    dummy_name = "baseRate" if sc.problem != "regression" else "mean"
    gate = q13_gate(yte, fam.fn, pred, bpred[dummy_name], [("oneFeature", bpred["oneFeature"]), ("glm", bpred["glm"])],
                    {"dummy": dummy_name}, "glm" if chosen == "glm" and not applied else None, seed, g,
                    chosen + (f"+{cal_info['method']}" if applied and cal_info is not None else ""))
    outcome = str(gate["outcome"])

    out: Json = {"features": feats, "selected": chosen, "candidates": cands,
                 "selectionRule": "pooled out-of-fold primary score on inner CV; then the simplest candidate (glm < lgbm < xgb) whose mean row-loss excess over the best is within 1 SE of the paired differences",
                 "innerCv": {"k": 5, "grouped": sc.entities_repeat, "timeBlocked": blocked,
                             "gapDays": int(sc.inner_gap.days) if blocked else None,
                             "gapReason": sc.gap_reason if blocked else None, "oofRows": int(len(oof_idx))},
                 "primaryScore": {"name": fam.name, "value": prim, "ci": _ci(prim_ci), "nTest": int(len(dte)),
                                  "bootstrap": {"n": N_BOOT, "clusteredBy": "EntityKey" if g else None}},
                 "baselines": baselines, "comparators": comparators, "strongestBaseline": strongest,
                 "beatsBaseline": bool(beats), "gateOutcome": outcome, "gate": gate,
                 "noSignal": outcome == "no-signal"}
    extras = Extras(pred, yte, g, fam.name)
    if not deep:
        return out, extras
    sec: Json = {}
    if sc.problem == "binary":
        sec = {"brier": {"value": S.brier(yte, pred), "ci": _ci(S.bootstrap_ci(yte, pred, S.brier, n=N_BOOT, seed=seed, groups=g))},
               "auc": {"value": S.auc(yte, pred), "ci": _ci(S.bootstrap_ci(yte, pred, S.auc, n=N_BOOT, seed=seed, groups=g))},
               "classBalance": {"trainRate": float(np.mean(ytr)), "testRate": float(np.mean(yte))}}
    elif sc.problem == "multiclass":
        sec = {"brier": {"value": S.brier(yte, pred), "ci": _ci(S.bootstrap_ci(yte, pred, S.brier, n=N_BOOT, seed=seed, groups=g))},
               "aucByClass": dict(zip(sc.classes, S.auc_by_class(yte, pred))),
               "classPriorTrain": dict(zip(sc.classes, [float(v) for v in np.bincount(ytr, minlength=K) / len(ytr)])),
               "classRateTest": dict(zip(sc.classes, [float(v) for v in np.bincount(yte, minlength=K) / len(yte)]))}
    else:
        sec = {"mae": {"value": S.mae(yte, pred), "ci": _ci(S.bootstrap_ci(yte, pred, S.mae, n=N_BOOT, seed=seed, groups=g))},
               "r2": {"value": S.r2(yte, pred), "ci": _ci(S.bootstrap_ci(yte, pred, S.r2, n=N_BOOT, seed=seed, groups=g))}}
        if sc.problem != "regression":
            sec["rmse"] = {"value": S.rmse(yte, pred), "ci": _ci(S.bootstrap_ci(yte, pred, S.rmse, n=N_BOOT, seed=seed, groups=g))}
    out["secondary"] = sec
    out["calibration"] = ({**(cal_info or {}), **_calib_block(sc.problem, yte, pred, pred_raw, sc.classes, g)}
                          if sc.problem in ("binary", "multiclass") else None)
    if sc.problem in ("regression", "count", "tweedie"):
        r_oof = np.asarray(ytr[oof_idx], dtype=np.float64) - oof[chosen]
        out["intervals"] = _intervals(sc.problem, r_oof, pred, np.asarray(yte, dtype=np.float64))
    else:
        out["intervals"] = None
    out["importance"] = S.permutation_importance_by_column(model.predict, dte, yte, fam.fn, {c: [c] for c in feats},
                                                           n_repeats=5, seed=seed, n_boot=200, groups=g)
    out["residual"] = (_residual_panel(np.asarray(ytr, dtype=np.float64) - (model.predict(dtr) if sc.problem != "multiclass" else np.zeros(len(dtr))), dtr)
                       if sc.structure == "panel" else None)
    sl: list[Json] = []
    ex = sc.slices.get("extrapolation")
    if isinstance(ex, dict):
        cols = [str(c) for c in ex["features"]]; thr = float(ex["absThreshold"])
        outside = np.asarray((dte[cols].abs() > thr).any(axis=1).to_numpy(), dtype=bool)
        for nm, mm in (("extrapolation", outside), ("interior", ~outside)):
            ys = yte[mm]; ps = pred[mm]; pg = glm_m.predict(dte.loc[mm].reset_index(drop=True))
            sl.append({"slice": nm, "rule": ex["rule"], "n": int(mm.sum()), "model": fam.fn(ys, ps),
                       "ci": _ci(S.bootstrap_ci(ys, ps, fam.fn, n=N_BOOT, seed=seed)), "glm": fam.fn(ys, pg)})
    if sc.has_time:
        yrs = pd.to_datetime(dte["T"]).dt.year.to_numpy()
        if len(set(yrs.tolist())) > 1:
            for yv in sorted(set(yrs.tolist())):
                mm = yrs == yv
                sl.append({"slice": f"T year {yv}", "n": int(mm.sum()), "model": fam.fn(yte[mm], pred[mm]),
                           "ci": _ci(S.bootstrap_ci(yte[mm], pred[mm], fam.fn, n=N_BOOT, seed=seed))})
    out["slices"] = sl
    if sc.structure == "panel":
        out["splitContrast"] = _random_row_contrast(dtr, ytr, sc.problem, chosen, num, cat, K, seed, fam, oof_idx, oof[chosen])
    out["nTrain"] = int(len(dtr))
    return out, extras


def _random_row_contrast(dtr: pd.DataFrame, ytr: npt.NDArray[np.generic], problem: str, algo: str, num: list[str],
                         cat: list[str], K: int, seed: int, fam: Family, oof_idx: IntArr, oof_blocked: FArr) -> Json:
    """Inner-CV optimism on the SAME rows: the selected candidate's out-of-fold score on the time-blocked, entity-grouped
    validation rows, versus the score random-row 5-fold CV over the training carve gives those same rows."""
    rand = np.empty(len(dtr)); rand_mc: FArr | None = None
    if problem == "multiclass":
        rand_mc = np.empty((len(dtr), K))
    for tr, va in inner_cv(dtr, k=5, seed=seed, grouped=False):
        m = TabularModel(problem, algo, num, cat, K, seed).fit(dtr.iloc[tr], ytr[tr])
        pv = m.predict(dtr.iloc[va])
        if rand_mc is not None:
            rand_mc[va] = pv
        else:
            rand[va] = pv
    pr = rand_mc if rand_mc is not None else rand
    yo = ytr[oof_idx]
    blocked = fam.fn(yo, oof_blocked); random_ = fam.fn(yo, pr[oof_idx])
    return {"rows": "the time-blocked inner-CV validation rows of the training carve", "nRows": int(len(oof_idx)),
            "blockedGroupedInnerCvScore": blocked, "randomRowKFoldScore": random_, "blockedMinusRandom": blocked - random_,
            "note": "same rows, two fold schemes: > 0 (loss) is the optimism random-row K-fold would report for serially correlated entity-period data (S-T.4)"}


# ------------------------------------------------------------------ series pipeline ---------------------------------
def _series_arrays(d: pd.DataFrame, exog_cols: list[str]) -> tuple[FArr, IntArr, IntArr, FArr | None]:
    y = d["Target"].astype(float).to_numpy()
    t = np.arange(len(d), dtype=np.int64)
    month = (pd.to_datetime(d["T"]).dt.month.to_numpy() - 1).astype(np.int64)
    ex = d[exog_cols].astype(float).to_numpy() if exog_cols else None
    return y, t, month, ex


def _fit_forecast(algo: str, y: FArr, t: IntArr, month: IntArr, ex: FArr | None, o: int, h: int
                  ) -> tuple[SeriesModel, FArr]:
    tr = slice(0, o + 1); te = slice(o + 1, o + 1 + h)
    m = SeriesModel(algo).fit(y[tr], t[tr], month[tr], None if ex is None else ex[tr])
    return m, m.forecast(t[te], month[te], None if ex is None else ex[te])


def _resid_diag(e: FArr) -> Json:
    n = len(e); lags = max(1, min(24, n // 5)); q, p = S.ljung_box(e, lags); a1 = S.acf1(e)
    return {"acf1": a1, "durbinWatson": S.durbin_watson(e), "ljungBox": {"statistic": q, "pValue": p, "lags": lags},
            "effectiveN": S.effective_n(n, a1), "n": n, "significantAutocorrelation": p < 0.05}


AR_ALGOS = ("ar1_const", "trend_season_ar1")


def _fit_window(algo: str, y: FArr, t: IntArr, month: IntArr, ex: FArr | None, last: int) -> SeriesModel:
    sl = slice(0, last + 1)
    return SeriesModel(algo).fit(y[sl], t[sl], month[sl], None if ex is None else ex[sl])


def run_series(sc: Scenario, split: Split, feats: list[str], lag_cols: list[str], seed: int) -> tuple[Json, Extras]:
    assert sc.rolling is not None
    ro = sc.rolling; H = ro.H
    d = sc.df.sort_values("T", kind="mergesort").reset_index(drop=True)
    exog = [c for c in feats if c not in lag_cols]
    y, t, month, ex = _series_arrays(d, exog)
    algos = [a for a in SERIES_ALGOS if not (a == "holt_winters_add" and exog)]
    # Selection inside the pre-test window only (periods < firstTestPeriod):
    #   1. veto a candidate whose in-sample residuals on the whole pre-test window fail Ljung-Box (p < 0.05; S-T.6);
    #   2. rank the survivors by pooled MASE over up to 3 inner rolling origins;
    #   3. 1-SE rule toward the simplest, with a Newey-West (HAC, H-1 lags) SE of the paired scaled-error differences,
    #      because h-step errors inside an origin are autocorrelated.
    n_pre = ro.firstTestPeriod; min_train = 13
    n_inner = max(1, min(3, (n_pre - min_train) // H))
    inner_o = [n_pre - 1 - (n_inner - j) * H for j in range(n_inner)]
    cands: list[Json] = []; errs: dict[str, FArr] = {}; lbp: dict[str, float] = {}
    for a in algos:
        parts = []; ok = True; why = ""
        for o in inner_o:
            try:
                _, fc = _fit_forecast(a, y, t, month, ex, o, H)
            except ValueError as exc:
                ok = False; why = str(exc); break
            parts.append(np.abs(y[o + 1: o + 1 + H] - fc) / S.mase_scale(y[: o + 1]))
        if not ok:
            cands.append({"name": a, "innerMase": None, "unavailable": why, "ljungBoxP": None, "vetoed": True})
            continue
        errs[a] = np.concatenate(parts)
        pre_fit = _fit_window(a, y, t, month, ex, n_pre - 1)
        e_pre = pre_fit.resid
        lbp[a] = S.ljung_box(e_pre, max(1, min(24, len(e_pre) // 5)))[1]
        cands.append({"name": a, "innerMase": float(errs[a].mean()), "ljungBoxP": lbp[a], "vetoed": lbp[a] < 0.05})
    eligible = [a for a in errs if lbp[a] >= 0.05]
    all_vetoed = not eligible
    if all_vetoed:
        eligible = list(errs)
    best = min(eligible, key=lambda a: (float(errs[a].mean()), SERIES_ALGOS.index(a)))
    chosen = None
    for c in cands:
        a = str(c["name"])
        if a not in eligible:
            continue
        dd = errs[a] - errs[best]; se = S.hac_se(dd, lags=H - 1)
        c["meanMinusBest"] = float(dd.mean()); c["hacSeOfDiff"] = se; c["within1SE"] = bool(dd.mean() <= se)
        if chosen is None and dd.mean() <= se:
            chosen = a
    assert chosen is not None
    # outer origins
    names = ["mean", "naive", "seasonalNaive"]
    sc_err: dict[str, list[FArr]] = {k: [] for k in ["model"] + names}
    raw: dict[str, list[FArr]] = {k: [] for k in ["model"] + names}
    origins: list[Json] = []; models: list[tuple[SeriesModel, int]] = []; ys: list[FArr] = []
    bands: dict[float, tuple[list[FArr], list[FArr]]] = {0.8: ([], []), 0.9: ([], [])}
    for k in range(1, ro.K + 1):
        o = ro.origin(k); ytr = y[: o + 1]; yv = y[o + 1: o + 1 + H]; scale = S.mase_scale(ytr)
        m, fc = _fit_forecast(chosen, y, t, month, ex, o, H)
        te = slice(o + 1, o + 1 + H)
        for lev in bands:
            lo_b, hi_b = m.interval(t[te], month[te], None if ex is None else ex[te], lev, seed=seed)
            bands[lev][0].append(lo_b); bands[lev][1].append(hi_b)
        models.append((m, o)); ys.append(yv)
        fcs = {"model": fc, "mean": B.series_mean(ytr, H), "naive": B.naive_last(ytr, H), "seasonalNaive": B.seasonal_naive(ytr, H)}
        for nm, fv in fcs.items():
            sc_err[nm].append(np.abs(yv - fv) / scale); raw[nm].append(yv - fv)
        origins.append({"k": k, "lastTrainPeriod": o, "trainN": o + 1, "scale": scale,
                        "inWindowResidualSd": math.sqrt(m.sigma2), "outerErrorSd": float(np.std(yv - fc, ddof=1)),
                        "maseModel": float(np.mean(np.abs(yv - fc)) / scale),
                        "maseSeasonalNaive": float(np.mean(np.abs(yv - fcs["seasonalNaive"])) / scale)})
    grp: list[object] = [str(k) for k in range(1, ro.K + 1) for _ in range(H)]
    zero = np.zeros(ro.K * H)
    E = {k: np.concatenate(v) for k, v in sc_err.items()}
    prim = float(E["model"].mean()); prim_ci = S.bootstrap_ci(zero, E["model"], S.mae, n=N_BOOT, seed=seed, groups=grp)
    baselines: list[Json] = []; comp_vals: list[tuple[float, str, float]] = []
    for nm in names:
        d_val, b_lo, b_hi = S.paired_bootstrap(zero, E[nm], E["model"], S.mae, n=N_BOOT, seed=seed, groups=grp)
        baselines.append({"name": nm, "value": float(E[nm].mean()),
                          "ci": _ci(S.bootstrap_ci(zero, E[nm], S.mae, n=N_BOOT, seed=seed, groups=grp)),
                          "baselineMinusModel": {"value": d_val, "ci": [b_lo, b_hi]}, "comparator": True})
        comp_vals.append((float(E[nm].mean()), nm, b_lo))
    strongest = min(comp_vals)[1]
    beats = all(lo_ > 0 for _, _, lo_ in comp_vals)
    # Q13/Q14/Q15 roles for series: dummy = training-window mean (the unconditional forecast, like a base rate); simple set =
    # {naive, seasonal naive}. Scaled errors against y = 0, so mae = MASE.
    sgate = q13_gate(zero, S.mae, E["model"], E["mean"], [("naive", E["naive"]), ("seasonalNaive", E["seasonalNaive"])],
                     {"dummy": "mean"}, None, seed, grp, chosen)
    Rm = np.concatenate(raw["model"]); ytest = np.concatenate(ys); ptest = ytest - Rm
    ivs: list[Json] = []
    for lev, (los, his) in bands.items():
        lo_a = np.concatenate(los); hi_a = np.concatenate(his)
        cov = float(np.mean((ytest >= lo_a) & (ytest <= hi_a))); se_l = math.sqrt(lev * (1 - lev) / len(ytest)); al = 1 - lev
        wink = float(np.mean((hi_a - lo_a) + (2 / al) * (lo_a - ytest) * (ytest < lo_a) + (2 / al) * (ytest - hi_a) * (ytest > hi_a)))
        ivs.append({"level": lev, "coverage": cov, "binomialSE": se_l, "within3SE": abs(cov - lev) <= 3 * se_l,
                    "meanWidth": float(np.mean(hi_a - lo_a)), "intervalScore": wink, "n": int(len(ytest))})
    sd_in = float(np.mean([float(str(o_["inWindowResidualSd"])) for o_ in origins]))
    sd_out = float(np.std(Rm, ddof=1))
    # residual diagnostics and AR coefficients at the final origin, for every available candidate (S-T.6, S-T.1)
    o_last = ro.origin(ro.K); res_c: dict[str, Json] = {}; ar_coef: dict[str, Json] = {}
    for a in errs:
        mm = _fit_window(a, y, t, month, ex, o_last)
        res_c[a] = _resid_diag(mm.resid)
        if a in AR_ALGOS and mm.phi is not None:
            ar_coef[a] = {"phi": mm.phi, "se": mm.phi_se, "window": f"periods 0..{o_last}"}
    uses_ar = chosen in AR_ALGOS
    residual = {**res_c[chosen], "model": chosen, "on": f"in-sample residuals at the final origin (periods 0..{o_last})",
                "byCandidate": res_c, "arCoefficients": ar_coef,
                "phiHatSelected": ar_coef.get(chosen) if uses_ar else None}
    # permutation importance of exogenous columns, permuted within each origin's test window
    imp: list[Json] = []
    if ex is not None:
        rng = np.random.default_rng(seed)
        for j, col in enumerate(exog):
            drops = []
            for _ in range(5):
                pe = []
                for (m, o), yv in zip(models, ys):
                    exp = ex[o + 1: o + 1 + H].copy(); exp[:, j] = exp[rng.permutation(H), j]
                    fc = m.forecast(t[o + 1: o + 1 + H], month[o + 1: o + 1 + H], exp)
                    pe.append(np.abs(yv - fc) / S.mase_scale(y[: o + 1]))
                drops.append(float(np.concatenate(pe).mean()) - prim)
            imp.append({"column": col, "drop": float(np.mean(drops)), "ci": [float(np.min(drops)), float(np.max(drops))],
                        "ciKind": "min-max over 5 permutations"})
    dm = S.diebold_mariano(E["model"], E["seasonalNaive"], h=H)
    if lag_cols:
        lag_use = (f"{', '.join(lag_cols)} kept as a past-period outcome; the selected model {chosen} realises it as its recursive AR(1) term"
                   if uses_ar else f"{', '.join(lag_cols)} kept as a past-period outcome; the selected model {chosen} has no AR term and does not use it")
    else:
        lag_use = "no lag-outcome column in the data"
    return {"features": feats, "exogenous": exog, "lagOutcomeColumns": lag_cols, "lagColumnUse": lag_use,
            "selectedUsesArTerm": uses_ar, "selected": chosen, "candidates": cands, "allCandidatesVetoed": all_vetoed,
            "selectionRule": "veto candidates whose pre-test-window residuals fail Ljung-Box (p < 0.05) unless all fail; pooled MASE over inner rolling origins inside the pre-test window; then the simplest candidate within 1 Newey-West SE (H-1 lags) of the best",
            "innerOrigins": inner_o,
            "primaryScore": {"name": "mase", "value": prim, "ci": _ci(prim_ci), "nTest": int(len(E["model"])),
                             "bootstrap": {"n": N_BOOT, "clusteredBy": "origin (block bootstrap of whole H-step windows)"},
                             "scale": "seasonal-naive (m=12) in-sample MAE of each origin's training window only"},
            "baselines": baselines, "comparators": names, "strongestBaseline": strongest, "beatsBaseline": bool(beats),
            "gateOutcome": sgate["outcome"], "gate": sgate, "noSignal": sgate["outcome"] == "no-signal",
            "secondary": {"rmse": S.rmse(ytest, ptest), "mae": S.mae(ytest, ptest),
                          "dieboldMarianoVsSeasonalNaive": {**dm, "loss": "scaled absolute error", "h": H}},
            "origins": origins, "calibration": None,
            "intervals": {"levels": ivs, "method": "per origin, from the origin's own in-window fit: Gaussian with the model's h-step variance (OLS sigma^2; AR(1) sigma^2*sum phi^(2j); ARIMA(1,0,0) statsmodels conf_int) or Holt-Winters simulate() quantiles",
                          "meanInWindowResidualSd": sd_in, "outerForecastErrorSd": sd_out,
                          "outerOverInWindowSd": sd_out / sd_in if sd_in > 0 else None},
            "residual": residual, "importance": imp, "slices": [], "nTrain": int(ro.firstTestPeriod)}, \
        Extras(E["model"], zero, grp, "mase")


# ------------------------------------------------------------------ driver ------------------------------------------
def _criteria(sc: Scenario, split: Split, res: Json, primary_name: str, audit_flags: int, new_entity: bool) -> list[Json]:
    c: list[Json] = []
    def add(i: str, what: str) -> None:
        c.append({"id": i, "what": what})
    add("S1.4", "declared task type checked against the target's observed values (taskTypeCheck)")
    add("S2.5", "train/test row IDs disjoint (asserted); class balance reported for binary")
    if split.kind == "deployment":
        add("S6.1", f"deployment holdout = every row with T >= {split.info.get('cutoff')} (1 January boundary); IDs stored; every test T > every train T (asserted)")
    if sc.entities_repeat and sc.problem != "series":
        add("S2.6", "entity-grouped inner CV (zero shared keys between inner train and validation)"
            + ("; new-entity mode holds out whole entities with zero shared keys (asserted)" if new_entity else "")
            + (" (grouped holdout)" if split.kind == "grouped" else ""))
    if split.kind == "rolling-origin":
        add("S-T.2", f"rolling-origin backtest, K={sc.rolling.K if sc.rolling else ''} origins at horizon H={sc.rolling.H if sc.rolling else ''}, each origin trains only on periods up to it")
        add("S-T.3", "naive and seasonal-naive per origin; MASE scaled from each origin's training window; Diebold-Mariano vs seasonal naive")
        add("S-T.6", "residual ACF, Ljung-Box, Durbin-Watson, effective n per candidate at the final origin")
    else:
        add("S4.1" if sc.problem in ("binary", "multiclass") else "S4.3", f"primary proper score {primary_name}; secondary metrics reported but never used for selection or gating")
        add("S4.5", "three baselines fit automatically with intervals: dummy, one-feature (inner CV), strong GLM")
        add("S3.4", "all preprocessing (imputer, scaler, encoder) fit inside each training fold (sklearn Pipeline)")
        add("S9.4", "held-out permutation importance aggregated per source column, with CI")
    add("S4.2", "promotion gate: lower 95% bound of the paired (baseline - model) loss > 0 for every comparator; the GLM baseline is excluded only when it is literally the delivered predictor")
    add("S5.2", "selection by inner CV on the training carve only; the locked test is scored once for the one finalist")
    add("S5.3", "candidates ranked with the SE of paired differences (Newey-West for series); differences inside 1 SE are not wins (simplest kept)")
    add("S5.4", "every estimator seeded and single-threaded; byte-identical JSON on re-run (test_run.py)")
    add("S6.2", "95% bootstrap CI on every reported score and paired difference")
    add("S6.5", f"noSignal={res['noSignal']} is an allowed, recorded outcome")
    if sc.problem in ("binary", "multiclass"):
        add("S6.3", "calibration map (Platt < 2,000 calibration rows, else isotonic) fit on out-of-fold predictions and applied to the full-carve refit when it lowers out-of-fold log loss; holdout slope, intercept, CITL and reliability table" + (" per class" if sc.problem == "multiclass" else ""))
    if sc.problem in ("regression", "count", "tweedie") or sc.problem == "series":
        add("S6.6", "80% and 90% prediction intervals with holdout empirical coverage checked within 3 binomial SEs")
    if sc.structure == "panel":
        add("S-T.4", f"inner folds grouped by entity and blocked in time with a gap of {sc.inner_gap.days} days (>= h); random-row K-fold optimism measured on the same validation rows (splitContrast)")
        add("S-T.5", "metric CIs from an entity-cluster bootstrap when test entities repeat")
        add("S-T.6", "pooled within-entity residual autocorrelation with a Box-Pierce test")
    if res.get("slices"):
        add("S6.4", "declared / out-of-time slices each with their own metric and interval")
    add("S2.4", f"data-driven leakage audit on the training carve: {audit_flags} column(s) flagged")
    if sc.problem == "series":
        uses = bool(res.get("selectedUsesArTerm"))
        lag = res.get("lagOutcomeColumns")
        if lag:
            add("S-T.1", "same-period outcome refused by the audit; lagged outcome kept" + (" and realised as a recursive AR(1) term by the selected model" if uses else "; the selected model has no AR term") + "; phi-hat with SE reported per AR candidate")
        else:
            add("S-T.1", "lag-1 of the series expressible (AR candidates); phi-hat with SE reported per AR candidate")
    return c


def _clean(o: object) -> object:
    if isinstance(o, dict):
        return {str(k): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (bool, np.bool_)):
        return bool(o)
    if isinstance(o, (int, np.integer)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        v = float(o)
        return None if math.isnan(v) or math.isinf(v) else float(f"{v:.10g}")
    return o


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("scenario"); ap.add_argument("--out", required=True); ap.add_argument("--shuffle-labels", action="store_true")
    a = ap.parse_args(argv)
    install_truth_guard()
    sc = load_scenario(a.scenario)
    split = make_split(sc, SEED)
    ne_split = make_new_entity_split(sc, SEED)

    def train_frame(sp: Split) -> pd.DataFrame:
        if sc.problem == "series":
            assert sc.rolling is not None
            return sc.df.sort_values("T", kind="mergesort").reset_index(drop=True).iloc[: sc.rolling.firstTestPeriod].copy()
        return sc.df.set_index("ID", drop=False).loc[pd.Index(sp.folds[0][0])].reset_index(drop=True)

    def run_audit() -> Audit:
        return leakage_audit(train_frame(split), sc.features, sc.problem, sc.problem == "series", sc.has_time,
                             sc.entities_repeat, SEED)

    shuffle_info: Json | None = None
    if a.shuffle_labels:
        # past-outcome (lag) columns come from the audit on the unshuffled data, not from column names; after the permutation
        # each is recomputed as the within-entity previous Target so it stays a lag of the permuted label
        pre = run_audit()
        rng = np.random.default_rng(12345)
        sc.df["Target"] = sc.df["Target"].to_numpy()[rng.permutation(len(sc.df))]
        for col in pre.past_outcomes:
            o = sc.df.sort_values(["EntityKey", "T", "ID"], kind="mergesort").index
            sc.df.loc[o, col] = sc.df.loc[o].groupby("EntityKey", sort=False)["Target"].shift(1).to_numpy()
        shuffle_info = {"seed": 12345, "lagColumnsRecomputed": pre.past_outcomes}
    f = sc.df.set_index("ID")
    assert f.index.is_unique
    for sp in [split] + ([ne_split] if ne_split is not None else []):
        for tr, te in sp.folds:
            assert set(tr).isdisjoint(te)
            if sc.has_time:
                assert f["T"].loc[te].min() > f["T"].loc[tr].max()
            if sp.kind in ("new-entity", "grouped"):
                assert set(f["EntityKey"].loc[tr]).isdisjoint(set(f["EntityKey"].loc[te]))
    audit = run_audit()
    kept = audit.kept; lag_cols = audit.past_outcomes
    if sc.problem == "series":
        res, ext = run_series(sc, split, kept, lag_cols, SEED)
    else:
        res, ext = run_tabular(sc, split, kept, SEED)
    naive: Json | None = None
    if audit.flags:
        nres, next_ = (run_series(sc, split, sc.features, lag_cols, SEED) if sc.problem == "series"
                       else run_tabular(sc, split, sc.features, SEED, deep=False))
        naive = {"features": sc.features, "selected": nres["selected"], "primaryScore": nres["primaryScore"],
                 "baselines": nres["baselines"], "beatsBaseline": nres["beatsBaseline"], "noSignal": nres["noSignal"],
                 "importance": nres.get("importance"),
                 "note": "same pipeline with every column and no audit exclusion"}
        fn = S.mae if sc.problem == "series" else family(sc.problem).fn
        # series: pred holds scaled absolute errors against y_test = 0, so mae() of it is the MASE
        dd, lo, hi = S.paired_bootstrap(ext.y_test, ext.pred, next_.pred, fn, n=N_BOOT, seed=SEED, groups=ext.groups)
        naive["professionalMinusNaive"] = {"value": dd, "ci": [lo, hi], "score": ext.primary_name,
                                           "meaning": "> 0: the naive run's test score looks better because it uses the flagged columns"}
    modes: Json = {}
    if ne_split is not None:
        ne_res, _ = run_tabular(sc, ne_split, kept, SEED, deep=False)
        ntr, nte = ne_split.folds[0]
        modes["newEntity"] = {"evaluationMode": "new-entity", **ne_split.info, "nTrain": len(ntr), "nTest": len(nte),
                              "sharedEntityKeys": len(set(f["EntityKey"].loc[ntr]) & set(f["EntityKey"].loc[nte])),
                              "trainIds": ntr, "testIds": nte,
                              **{k: ne_res[k] for k in ("selected", "primaryScore", "baselines", "comparators",
                                                        "strongestBaseline", "beatsBaseline", "gateOutcome",
                                                        "gate", "noSignal", "innerCv")}}
    tr0, te0 = split.folds[0]
    split_json: Json = {"kind": split.kind, **split.info, "seed": SEED,
                        "trainIds": tr0 if split.kind != "rolling-origin" else split.folds[0][0],
                        "testIds": te0 if split.kind != "rolling-origin" else [i for _, te in split.folds for i in te],
                        "nTrain": len(tr0), "nTest": len(te0) if split.kind != "rolling-origin" else sum(len(te) for _, te in split.folds)}
    if split.kind == "rolling-origin":
        split_json["folds"] = [{"k": k + 1, "trainIds": tr, "testIds": te} for k, (tr, te) in enumerate(split.folds)]
        split_json["trainIdsMeaning"] = "origin 1's training window; each fold lists its own"
    if sc.has_time:
        split_json["trainTMax"] = str(pd.Timestamp(f["T"].loc[tr0].max()).date())
        split_json["testTMin"] = str(pd.Timestamp(f["T"].loc[te0].min()).date())
    import lightgbm, sklearn, statsmodels, xgboost
    out: Json = {"scenario": sc.sid, "problem": sc.problem, "structure": sc.structure, "manifestKind": sc.manifest_kind,
                 "evaluationMode": "deployment", "shuffleLabels": bool(a.shuffle_labels), "shuffle": shuffle_info, "source": sc.source, "taskTypeCheck": task_type_check(sc),
                 "split": split_json, "audit": audit.json, **res, "naive": naive, "modes": modes,
                 "env": {"python": sys.version.split()[0], "numpy": np.__version__, "pandas": pd.__version__,
                         "sklearn": sklearn.__version__, "xgboost": xgboost.__version__, "lightgbm": lightgbm.__version__,
                         "statsmodels": statsmodels.__version__, "threads": 1, "seed": SEED}}
    out["criteria"] = _criteria(sc, split, res, ext.primary_name, len(audit.flags), ne_split is not None)
    out["truthAccess"] = {"guard": GUARD, "blockedAttempts": len(_BLOCKED)}
    assert not _BLOCKED, f"truth access attempted: {_BLOCKED}"
    p = pathlib.Path(a.out); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(_clean(out), indent=1) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
