# tests/test_splits.py — P5 split properties: the brief's toy-frame tests, then the same properties on every
# real scenario's actual carve (train/test row IDs disjoint, every test T later than every train T, entities whole).
from __future__ import annotations
import numpy as np, pandas as pd
import pytest
from truthsuite.refpipe.splits import date_carve, grouped_carve, rolling_origin

def frame() -> pd.DataFrame:
    return pd.DataFrame({"ID": [f"r{i}" for i in range(20)], "EntityKey": [f"E{i%5}" for i in range(20)],
                         "T": pd.to_datetime(["2020-01-01"]*5 + ["2021-01-01"]*5 + ["2022-01-01"]*5 + ["2023-01-01"]*5)})

def test_date_carve_disjoint_and_later() -> None:
    tr, te = date_carve(frame(), cutoff="2023-01-01")
    assert set(tr).isdisjoint(te)
    f = frame().set_index("ID")
    assert f["T"].loc[list(te)].min() > f["T"].loc[list(tr)].max()

def test_grouped_carve_keeps_entities_whole() -> None:
    tr, te = grouped_carve(frame(), frac=0.4, seed=0)
    f = frame().set_index("ID")
    assert set(f["EntityKey"].loc[list(tr)]).isdisjoint(set(f["EntityKey"].loc[list(te)]))

def test_rolling_origin_ties_never_straddle() -> None:
    for tr, te in rolling_origin(frame(), n_origins=2):
        f = frame().set_index("ID")
        assert set(tr).isdisjoint(te)
        assert f["T"].loc[list(te)].min() > f["T"].loc[list(tr)].max()


# ---- the same properties on the real scenario carves (P5 binding decision: "test these on real scenario data") ----
ALL = ["C2", "C4", "D1c", "D1r", "N1c", "N1r", "R1", "R2p", "R3", "T1p", "T2p", "T3", "T4", "R2-real", "T1-real",
       "C1", "T2-real", "C3"]

@pytest.mark.parametrize("sid", ALL)
def test_real_scenario_split_properties(sid: str) -> None:
    from truthsuite.refpipe.run import load_scenario, make_split
    sc = load_scenario(sid)
    split = make_split(sc, seed=0)
    f = sc.df.set_index("ID")
    assert f.index.is_unique
    assert len(split.folds) >= 1
    for tr, te in split.folds:
        assert len(tr) > 0 and len(te) > 0
        assert set(tr).isdisjoint(te), f"{sid}: train/test row IDs overlap"
        if sc.has_time:
            assert f["T"].loc[list(te)].min() > f["T"].loc[list(tr)].max(), f"{sid}: a test T is not later than every train T"
    # deployment mode (Ruling Q12): the holdout is every row in the future period(s); entities seen earlier may appear
    if sc.problem != "series" and sc.has_time:
        tr, te = split.folds[0]
        assert split.kind == "deployment"
        cut = pd.Timestamp(str(split.info["cutoff"]))
        assert cut.month == 1 and cut.day == 1, f"{sid}: deployment cutoff is not a 1 January boundary"
        te_t = pd.to_datetime(f["T"].loc[list(te)]); tr_t = pd.to_datetime(f["T"].loc[list(tr)])
        assert (te_t >= cut).all() and (tr_t < cut).all()
        if sid in ("C1", "T2-real", "R2-real"):  # the Task 7 carve: decision year 2024 only, the 2025 fold excluded
            assert set(te_t.dt.year) == {2024} and split.info["excludedAfterTestRows"] == 370
            assert len(tr) + len(te) + 370 == len(sc.df)
        else:  # every row is used: all rows at or after the cutoff are test rows
            assert len(tr) + len(te) == len(sc.df)
    if sc.problem == "series":
        ro = sc.rolling
        assert ro is not None and len(split.folds) == ro.K
        for k, (tr, te) in enumerate(split.folds, start=1):
            assert len(te) == ro.H
            assert len(tr) == ro.origin(k) + 1  # expanding window: periods 0..o_k
    expect = {"T1p": 12, "T3": 12, "T4": 12, "T1-real": 5}
    if sid in expect:
        assert len(split.folds) == expect[sid]


def test_tied_timestamps_never_straddle_date_grouped_carve() -> None:
    from truthsuite.refpipe.splits import date_grouped_carve
    tr, te = date_grouped_carve(frame(), cutoff="2022-01-01", frac=0.4, seed=0)
    f = frame().set_index("ID")
    assert set(tr).isdisjoint(te)
    assert f["T"].loc[list(te)].min() > f["T"].loc[list(tr)].max()
    assert set(f["EntityKey"].loc[list(tr)]).isdisjoint(set(f["EntityKey"].loc[list(te)]))


def test_inner_cv_grouped_and_blocked() -> None:
    from truthsuite.refpipe.splits import inner_cv
    f = frame()
    for tr_idx, va_idx in inner_cv(f, k=2, seed=0, grouped=True):
        a, b = f.iloc[tr_idx], f.iloc[va_idx]
        assert set(a["EntityKey"]).isdisjoint(set(b["EntityKey"]))
    for tr_idx, va_idx in inner_cv(f, k=2, seed=0, grouped=True, time_blocked=True):
        a, b = f.iloc[tr_idx], f.iloc[va_idx]
        assert set(a["EntityKey"]).isdisjoint(set(b["EntityKey"]))
        assert b["T"].min() > a["T"].max()
    assert np.all([len(v) > 0 for _, v in inner_cv(f, k=2, seed=0, grouped=False)])


# ---- missing periods (final fix wave, Review Focus 4): a year with no rows, and a monthly series missing one month ----
def gapped_frame() -> pd.DataFrame:
    years = ["2019-01-01", "2020-01-01", "2022-01-01", "2023-01-01", "2024-01-01"]  # no 2021 rows; 5 tied rows per year
    return pd.DataFrame({"ID": [f"g{i}" for i in range(25)], "EntityKey": [f"E{i%5}" for i in range(25)],
                         "T": pd.to_datetime([y for y in years for _ in range(5)])})

def test_date_carve_across_a_missing_year() -> None:
    f = gapped_frame().set_index("ID")
    for cutoff in ("2021-01-01", "2022-01-01"):  # a cutoff inside the gap, and the first period after it
        tr, te = date_carve(gapped_frame(), cutoff=cutoff)
        assert set(tr).isdisjoint(te) and len(tr) == 10 and len(te) == 15
        assert f["T"].loc[list(te)].min() > f["T"].loc[list(tr)].max()

def test_rolling_origin_across_a_missing_year() -> None:
    f = gapped_frame().set_index("ID")
    folds = list(rolling_origin(gapped_frame(), n_origins=3))
    assert len(folds) == 3
    for tr, te in folds:
        assert set(tr).isdisjoint(te) and len(te) == 5
        assert f["T"].loc[list(te)].min() > f["T"].loc[list(tr)].max()
    assert pd.Timestamp("2021-01-01") not in set(f["T"])  # the gap is not filled

def test_inner_cv_time_blocked_across_a_missing_year() -> None:
    from truthsuite.refpipe.splits import inner_cv
    f = gapped_frame()
    for tr_idx, va_idx in inner_cv(f, k=2, seed=0, grouped=True, time_blocked=True):
        a, b = f.iloc[tr_idx], f.iloc[va_idx]
        assert len(a) > 0 and len(b) > 0
        assert set(tr_idx).isdisjoint(set(va_idx))
        assert set(a["EntityKey"]).isdisjoint(set(b["EntityKey"]))
        assert b["T"].min() > a["T"].max()

def test_origin_folds_on_a_monthly_series_missing_one_month() -> None:
    from truthsuite.refpipe.splits import origin_folds
    from truthsuite.scenarios.manifest import RollingOrigin
    months = [m for m in pd.date_range("2020-01-01", "2022-12-01", freq="MS") if m != pd.Timestamp("2021-06-01")]
    s = pd.DataFrame({"ID": [f"m{i}" for i in range(len(months))], "EntityKey": "S", "T": months})
    assert len(s) == 35
    f = s.set_index("ID")
    folds = origin_folds(s, RollingOrigin(K=3, H=6, firstTestPeriod=17))
    for tr, te in folds:
        assert set(tr).isdisjoint(te) and len(te) == 6
        assert f["T"].loc[list(te)].min() > f["T"].loc[list(tr)].max()
    # the origin whose window spans the missing month still trains only before its test months
    tr1, te1 = folds[0]
    assert pd.Timestamp("2021-05-01") in set(f["T"].loc[tr1]) and f["T"].loc[te1].min() == pd.Timestamp("2021-07-01")


NEW_ENTITY = ["T2p", "C1", "T2-real", "D1c", "D1r"]

@pytest.mark.parametrize("sid", NEW_ENTITY)
def test_new_entity_mode_shares_no_entity(sid: str) -> None:
    from truthsuite.refpipe.run import load_scenario, make_new_entity_split
    sc = load_scenario(sid)
    split = make_new_entity_split(sc, seed=0)
    assert split is not None and split.kind == "new-entity"
    f = sc.df.set_index("ID")
    tr, te = split.folds[0]
    assert set(tr).isdisjoint(te)
    assert set(f["EntityKey"].loc[list(tr)]).isdisjoint(set(f["EntityKey"].loc[list(te)]))
    assert f["T"].loc[list(te)].min() > f["T"].loc[list(tr)].max()


@pytest.mark.parametrize("sid", ["C1", "T2-real", "R2-real"])
def test_deployment_carve_reproduces_task7(sid: str) -> None:
    """Task 7 carve: train decision year < 2024, test = decision year 2024 (1,205 rows),
    the half-year 2025 fold excluded (370 rows)."""
    from truthsuite.refpipe.run import load_scenario, make_split
    sc = load_scenario(sid)
    split = make_split(sc, seed=0)
    f = sc.df.set_index("ID")
    tr, te = split.folds[0]
    assert len(te) == 1205 and len(tr) == 598 + 421 + 556 + 736 + 987
    assert set(pd.to_datetime(f["T"].loc[list(te)]).dt.year) == {2024}
    assert pd.to_datetime(f["T"].loc[list(tr)]).dt.year.max() == 2023
    assert split.info["excludedAfterTestRows"] == 370


@pytest.mark.parametrize("sid", ["D1c", "D1r", "C4", "T2p"])
def test_deployment_cut_at_year_boundary(sid: str) -> None:
    from truthsuite.refpipe.run import load_scenario, make_split
    sc = load_scenario(sid)
    split = make_split(sc, seed=0)
    f = sc.df.set_index("ID")
    tr, te = split.folds[0]
    assert len(tr) + len(te) == len(sc.df)  # every row is used: all future-period rows are test
    assert str(split.info["cutoff"]).endswith("-01-01")


def test_inner_cv_time_blocked_gap() -> None:
    from truthsuite.refpipe.splits import inner_cv
    f = frame()
    gap = pd.Timedelta(days=400)
    for tr_idx, va_idx in inner_cv(f, k=2, seed=0, grouped=True, time_blocked=True, gap=gap):
        a, b = f.iloc[tr_idx], f.iloc[va_idx]
        assert len(a) > 0
        assert b["T"].min() - a["T"].max() >= gap
