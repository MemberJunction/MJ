# probes/refpipe/splits.py — P5 reference-pipeline carves. Every carve returns row IDs (str); callers assert disjointness.
#   date_carve          train = T < cutoff, test = T >= cutoff (ties at the cutoff all go to test)          [S6.1]
#   grouped_carve       hold out whole EntityKeys                                                           [S2.6]
#   date_grouped_carve  both: test = held-out entities at T >= cutoff, train = the other entities at T < cutoff
#   rolling_origin      expanding-window folds by unique T, so tied timestamps never straddle a fold          [S-T.2]
#   origin_folds        the manifest's rolling-origin design (K, H, firstTestPeriod) over 0-indexed periods  [S-T.2]
#   inner_cv            selection folds inside the training carve: random, grouped, or grouped + time-blocked with a
#                       gap >= h between the last inner-training T and the first validation T               [S5.2, S-T.4]
#   year_cutoff         deployment holdout cutoff at a 1 January boundary (Ruling Q12)                           [S6.1]
from __future__ import annotations

from collections.abc import Iterator

import numpy as np
import numpy.typing as npt
import pandas as pd

from truthsuite.scenarios.manifest import RollingOrigin

IntArr = npt.NDArray[np.int64]


def _ids(df: pd.DataFrame, mask: "pd.Series[bool]") -> list[str]:
    return [str(x) for x in df.loc[mask, "ID"].tolist()]


def date_carve(df: pd.DataFrame, cutoff: str | pd.Timestamp) -> tuple[list[str], list[str]]:
    c = pd.Timestamp(cutoff)
    t = pd.to_datetime(df["T"])
    return _ids(df, t < c), _ids(df, t >= c)


def _holdout_entities(df: pd.DataFrame, frac: float, seed: int) -> set[str]:
    ents = sorted({str(e) for e in df["EntityKey"].tolist()})
    rng = np.random.default_rng(seed)
    n_out = max(1, int(round(frac * len(ents))))
    pick = rng.permutation(len(ents))[:n_out]
    return {ents[int(i)] for i in pick}


def grouped_carve(df: pd.DataFrame, frac: float, seed: int) -> tuple[list[str], list[str]]:
    out = _holdout_entities(df, frac, seed)
    m = df["EntityKey"].astype(str).isin(out)
    return _ids(df, ~m), _ids(df, m)


def date_grouped_carve(df: pd.DataFrame, cutoff: str | pd.Timestamp, frac: float, seed: int) -> tuple[list[str], list[str]]:
    c = pd.Timestamp(cutoff)
    t = pd.to_datetime(df["T"])
    out = df["EntityKey"].astype(str).isin(_holdout_entities(df, frac, seed))
    return _ids(df, (t < c) & ~out), _ids(df, (t >= c) & out)


def random_carve(df: pd.DataFrame, frac: float, seed: int) -> tuple[list[str], list[str]]:
    rng = np.random.default_rng(seed)
    n_out = int(round(frac * len(df)))
    te = np.zeros(len(df), dtype=bool)
    te[rng.permutation(len(df))[:n_out]] = True
    m = pd.Series(te, index=df.index)
    return _ids(df, ~m), _ids(df, m)


def trailing_cutoff(t: "pd.Series[pd.Timestamp]", max_share: float = 0.25) -> pd.Timestamp:
    """Earliest unique T whose trailing block (T >= it) holds at most max_share of rows; at least the last unique T."""
    tt = pd.to_datetime(t)
    uniq = sorted(tt.unique())
    n = len(tt)
    best = pd.Timestamp(uniq[-1])
    for u in reversed(uniq):
        if float((tt >= u).sum()) / n <= max_share:
            best = pd.Timestamp(u)
        else:
            break
    if best == pd.Timestamp(uniq[0]):
        raise ValueError("cutoff would leave no training rows")
    return best


def rolling_origin(df: pd.DataFrame, n_origins: int) -> Iterator[tuple[list[str], list[str]]]:
    """Expanding-window folds over unique T: fold j trains on T < u_j and tests on T == u_j for the last n_origins u_j."""
    t = pd.to_datetime(df["T"])
    uniq = sorted(t.unique())
    if n_origins >= len(uniq):
        raise ValueError("need more unique T values than origins")
    for u in uniq[-n_origins:]:
        yield _ids(df, t < u), _ids(df, t == u)


def origin_folds(df: pd.DataFrame, ro: RollingOrigin) -> list[tuple[list[str], list[str]]]:
    """Manifest design: periods are 0-indexed in T order; origin k trains t <= o_k and tests o_k < t <= o_k + H."""
    d = df.sort_values("T", kind="mergesort").reset_index(drop=True)
    if not pd.to_datetime(d["T"]).is_unique:
        raise ValueError("series must have one row per period")
    ids = [str(x) for x in d["ID"].tolist()]
    folds = []
    for k in range(1, ro.K + 1):
        o = ro.origin(k)
        folds.append((ids[: o + 1], ids[o + 1: o + 1 + ro.H]))
    return folds


def year_cutoff(t: "pd.Series[pd.Timestamp]", max_share: float = 0.25) -> pd.Timestamp:
    """Earliest 1 January whose trailing block (T >= it) holds at most max_share of rows; at least the last year."""
    years = sorted({int(y) for y in pd.to_datetime(t).dt.year.tolist()})
    tt = pd.to_datetime(t); n = len(tt)
    best = pd.Timestamp(year=years[-1], month=1, day=1)
    for y in reversed(years):
        c = pd.Timestamp(year=y, month=1, day=1)
        if float((tt >= c).sum()) / n <= max_share:
            best = c
        else:
            break
    if best <= tt.min():
        raise ValueError("cutoff would leave no training rows")
    return best


def inner_cv(df_train: pd.DataFrame, k: int, seed: int, grouped: bool, time_blocked: bool = False,
             gap: pd.Timedelta = pd.Timedelta(0)) -> list[tuple[IntArr, IntArr]]:
    """Positional (iloc) folds inside the training carve.

    grouped: whole EntityKeys per fold. time_blocked (requires grouped): validation = fold entities at T >= an inner
    trailing cutoff; training = the other entities with T <= (earliest validation T) - gap (S-T.4: blocked in time with a
    gap >= h, and grouped by entity).
    """
    n = len(df_train)
    rng = np.random.default_rng(seed)
    if grouped:
        ents = sorted({str(e) for e in df_train["EntityKey"].tolist()})
        perm = rng.permutation(len(ents))
        fold_of = {ents[int(j)]: i % k for i, j in enumerate(perm)}
        f = np.array([fold_of[str(e)] for e in df_train["EntityKey"].tolist()], dtype=np.int64)
    else:
        f = np.empty(n, dtype=np.int64)
        f[rng.permutation(n)] = np.arange(n) % k
    if time_blocked:
        if not grouped:
            raise ValueError("time_blocked requires grouped")
        t = pd.to_datetime(df_train["T"]).to_numpy()
        c = trailing_cutoff(pd.Series(t)).to_datetime64()
        late = t >= c
        early_ok = t <= (t[late].min() - gap.to_timedelta64())
    folds: list[tuple[IntArr, IntArr]] = []
    for i in range(k):
        if time_blocked:
            tr = np.flatnonzero((f != i) & ~late & early_ok).astype(np.int64)
            va = np.flatnonzero((f == i) & late).astype(np.int64)
        else:
            tr = np.flatnonzero(f != i).astype(np.int64)
            va = np.flatnonzero(f == i).astype(np.int64)
        folds.append((tr, va))
    return folds
