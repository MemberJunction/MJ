"""test_judge_scenarios.py -- Task P6 fix round 1 (M-9): scenarios.py on small synthetic run directories.

Checks, against values computed by hand in this file:
  - tabular: the dummy score, PS's score on P5's test rows, PS - reference and PS - oracle (paired point values),
    the own-holdout score and the training/test overlap count;
  - series: MASE with the origin's in-window seasonal-naive scale, R2 against the origin's training mean, and the
    paired PS - naive / PS - seasonal-naive point values;
  - C1 key mapping: PersonYear uuid -> "UPPER(person_id):period_index" round-trips through load_run / keymap_c1.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import numpy.typing as npt
import pandas as pd
import pytest

from truthsuite.judges import scenarios as J


def model_entry(algo: str, hm: dict[str, float]) -> dict[str, object]:
    return {"algorithm": algo, "holdoutMetrics": hm, "trust": {"grade": "Fair", "canAct": True},
            "leakageFlagged": False, "wouldAutoPublish": True, "agentRankScore": hm.get("r2", 0.0),
            "topImportance": {"topRaw": "x", "topRawShare": 1.0, "topAgg": "x", "topAggShare": 1.0}, "runNotes": ""}


def write_run(d: Path, ids: list[str], preds: dict[str, list[float]], target: list[float], train: list[str],
              hold: list[str], hm: dict[str, float], extra: dict[str, list[object]] | None = None) -> None:
    d.mkdir(parents=True, exist_ok=True)
    frame: dict[str, list[object]] = {"ID": list(ids), "target": list(target)}
    for k, v in (extra or {}).items():
        frame[k] = v
    for a, p in preds.items():
        frame[f"p_{a}"] = list(p)
        frame[f"class_{a}"] = [""] * len(p)
    pd.DataFrame(frame).to_csv(d / "predictions.csv", index=False)
    winner = next(iter(preds))
    (d / "model.json").write_text(json.dumps({"models": [model_entry(a, hm) for a in preds], "winner": winner,
                                               "psTrainIds": train, "psHoldoutIds": hold}))


def test_tabular(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    rng = np.random.default_rng(1)
    n = 20
    ids = [f"00000000-0000-0000-0000-{i:012d}" for i in range(n)]
    x = rng.normal(size=n)
    truth = 5 + 2 * x
    y = truth + rng.normal(size=n)
    data = tmp_path / "data"
    (data / "X").mkdir(parents=True)
    pd.DataFrame({"ID": ids, "EntityKey": [f"E{i}" for i in range(n)], "T": [""] * n, "x": x, "Target": y}).to_csv(
        data / "X" / "rows.csv", index=False)
    pd.DataFrame({"ID": ids, "TrueValue": truth}).to_csv(data / "X" / "truth.csv", index=False)
    train, test = ids[:14], ids[14:]
    ps = truth + 0.5  # a biased PS model
    p6 = tmp_path / "p6"
    write_run(p6 / "X" / "matched", ids, {"ridge": list(ps)}, list(y), train[:11], train[11:], {"r2": 0.1})
    ref = pd.DataFrame({"ID": test, "ref_pred": list(truth[14:] + 0.25)})
    p5j: dict[str, object] = {"split": {"kind": "random", "trainIds": train, "testIds": test}, "selected": "glm",
                              "primaryScore": {"value": 0.0}, "gate": {"outcome": "keep-simple-baseline", "shipped": "glm", "note": None}}
    monkeypatch.setattr(J, "DATA", data)
    monkeypatch.setattr(J, "P6", p6)
    sc = J.Scn("X", "X", "regression", "TrueValue")
    fr = J.load_frame(sc)
    out: list[str] = []
    res = J.judge_tabular(sc, fr, p5j, ref, out)

    def rmse(a: npt.NDArray[np.float64], b: npt.NDArray[np.float64]) -> float:
        return math.sqrt(float(np.mean((a - b) ** 2)))
    yt, pt, ot, rt = y[14:], ps[14:], truth[14:], truth[14:] + 0.25
    assert res["dummy"]["value"] == pytest.approx(rmse(yt, np.full(6, y[:14].mean())), abs=1e-12)
    t = res["regimes"]["matched"]["algorithms"]["ridge"]["p5Test"]
    assert t["rmse"] == pytest.approx(rmse(yt, pt), abs=1e-12)
    assert t["psMinusRef"]["value"] == pytest.approx(rmse(yt, pt) - rmse(yt, rt), abs=1e-12)
    assert t["psMinusOracle"]["value"] == pytest.approx(rmse(yt, pt) - rmse(yt, ot), abs=1e-12)
    own = res["regimes"]["matched"]["algorithms"]["ridge"]["ownHoldout"]
    assert own["rmse"] == pytest.approx(rmse(y[11:14], ps[11:14]), abs=1e-12)
    assert res["regimes"]["matched"]["trainOverlapP5Test"] == 0


def test_series(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    n, o, h = 30, 23, 6
    ids = [f"10000000-0000-0000-0000-{i:012d}" for i in range(n)]
    t = np.arange(n)
    mu = 100 + 0.5 * t + 5 * np.sin(2 * np.pi * (t % 12) / 12)
    y = mu + np.random.default_rng(2).normal(size=n)
    data = tmp_path / "data"
    (data / "S").mkdir(parents=True)
    months = pd.date_range("2005-01-01", periods=n, freq="MS").strftime("%Y-%m-%d")
    pd.DataFrame({"ID": ids, "EntityKey": ["series"] * n, "T": months, "Target": y}).to_csv(data / "S" / "rows.csv", index=False)
    pd.DataFrame({"ID": ids, "TrueValue": mu, "OneStepMean": mu}).to_csv(data / "S" / "truth.csv", index=False)
    te = ids[o + 1: o + 1 + h]
    pd.DataFrame({"ID": te, "origin": [1] * h, "h": list(range(1, h + 1)), "OriginMean": mu[o + 1: o + 1 + h]}).to_csv(
        data / "S" / "truth_origins.csv", index=False)
    pred = mu + 1.0
    p6 = tmp_path / "p6"
    write_run(p6 / "S" / "matched" / "o1", ids, {"ridge": list(pred)}, list(y), ids[:20], ids[20:24], {"r2": 0.9})
    scale = float(np.mean(np.abs(y[12:24] - y[:12])))
    ref_err = np.abs(y[24:30] - mu[24:30]) / scale
    ref = pd.DataFrame({"ID": te, "origin": [1] * h, "ref_scaled_abs_err": ref_err})
    p5j: dict[str, object] = {"split": {"H": h, "folds": [{"k": 1, "trainIds": ids[: o + 1], "testIds": te}]},
                              "selected": "trend_season_ar1", "gate": {"outcome": "model", "shipped": "x", "note": None}}
    monkeypatch.setattr(J, "DATA", data)
    monkeypatch.setattr(J, "P6", p6)
    sc = J.Scn("S", "S", "series", "OriginMean")
    fr = J.load_frame(sc)
    out: list[str] = []
    res = J.judge_series(sc, fr, p5j, ref, out)
    a = res["regimes"]["matched"]["algorithms"]["ridge"]
    yt, pt = y[24:30], pred[24:30]
    mase = float(np.mean(np.abs(yt - pt))) / scale
    assert a["mase"] == pytest.approx(mase, abs=1e-12)
    tm = float(np.mean(y[:24]))
    assert a["r2VsOriginTrainMean"] == pytest.approx(1 - np.sum((yt - pt) ** 2) / np.sum((yt - tm) ** 2), abs=1e-12)
    naive = float(np.mean(np.abs(yt - y[23]))) / scale
    snaive = float(np.mean(np.abs(yt - y[12:18]))) / scale
    assert a["psMinus_naive"]["value"] == pytest.approx(mase - naive, abs=1e-12)
    assert a["psMinus_seasonalNaive"]["value"] == pytest.approx(mase - snaive, abs=1e-12)
    assert res["baselines"]["naive"] == pytest.approx(naive, abs=1e-12)


def test_c1_keymap(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    uu = ["e724433e-f36b-1410-8052-00f30fd03709", "ea24433e-f36b-1410-8052-00f30fd03709"]
    persons = ["2980eab2-2260-5c34-9828-158b1ee2c44d", "408eec38-cc4d-510a-8348-deb3ee45a98c"]
    p6 = tmp_path / "p6"
    write_run(p6 / "C1" / "matched", uu, {"logistic_regression": [0.9, 0.8]}, [1, 0], [uu[0]], [uu[1]], {"auc": 0.6},
              extra={"person_id": list[object](persons), "period_index": [6, 11]})
    monkeypatch.setattr(J, "P6", p6)
    sc = J.Scn("C1", "C1", "binary", None)
    run = J.load_run(sc, "matched", None)
    assert run is not None
    assert list(run.preds.index) == ["2980EAB2-2260-5C34-9828-158B1EE2C44D:6", "408EEC38-CC4D-510A-8348-DEB3EE45A98C:11"]
    km = J.keymap_c1(run)
    assert km[uu[1]] == "408EEC38-CC4D-510A-8348-DEB3EE45A98C:11"
    assert J.run_ids(sc, run, "psHoldoutIds") == ["408EEC38-CC4D-510A-8348-DEB3EE45A98C:11"]
