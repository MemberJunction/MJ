"""The leakage audit on development rows (single-feature score against the label shifted by -1/0/+1 periods within an
entity, the high-cardinality identifier check) and the implausible-gain rule against a planted reference score, at
unit level and through POST /trainer."""

from __future__ import annotations

import base64
import math
import warnings

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import artifacts, audit as AU, encoding as E
from app.algorithms import TabularFamily
from app.main import app
from app.trainer_schemas import (
    DropColumnFlag, HighCardinalityIdFlag, SingleFeatureAucFlag, TimeShiftedLabelFlag, TrainerCompleted, TrainerFailed,
)
from tests.tools.trainer_fixture import NUMERIC, FileServer, JsonObject, JsonValue, candidates, protocol, request, \
    snapshot_files
from tests.tools.trainer_scaffold import FEATS, TASK, binary_frame, server  # noqa: F401 - `server` is a pytest fixture

client = TestClient(app)
LABELS = {0: "no", 1: "yes"}


def _num(name: str, source: str | None = None) -> E.ColumnSpec:
    return E.ColumnSpec(name, source or name, E.NumericEncoding("numeric"))


def _panel(n_ent: int = 400, periods: int = 5, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for e in range(n_ent):
        x = rng.normal(size=periods)
        y = (rng.random(periods) < 1 / (1 + np.exp(-(0.8 * x - 0.3)))).astype(int)
        for t in range(periods):
            rows.append({"entity": f"e{e}", "t": t, "x": x[t], "y": y[t]})
    df = pd.DataFrame(rows)
    g = df.groupby("entity")["y"]
    df["proxy"] = df["y"].astype(float)                    # same-period outcome
    df["future"] = g.shift(-1).fillna(0)                   # next period's outcome
    df["lag"] = g.shift(1).fillna(0)                       # previous period's outcome: legitimate
    df["ticket"] = [f"TK-{i}" for i in range(len(df))]     # unique per row
    return df


def _run(frame: pd.DataFrame, cols: list[E.ColumnSpec], y: np.ndarray, entity: list[str], t: np.ndarray,
         has_time: bool, family: TabularFamily = "binary", n_classes: int = 2) -> AU.AuditResult:
    return AU.run_audit(frame, cols, y, entity, t.astype(np.int64), has_time, family, 0.9, 0, n_classes)


def test_audit_flags_proxy_future_and_id_but_keeps_lag() -> None:
    df = _panel()
    cols = [_num(c) for c in ("x", "proxy", "future", "lag")]
    cols.append(E.ColumnSpec("ticket", "ticket", E.IdentifierEncoding("exclude")))
    res = _run(df[["x", "proxy", "future", "lag", "ticket"]], cols, df["y"].to_numpy(), df["entity"].tolist(),
               df["t"].to_numpy(), True)
    assert sorted(res.excluded_sources) == ["future", "proxy", "ticket"]
    assert res.past_outcome_sources == ["lag"]
    assert any(isinstance(f, TimeShiftedLabelFlag) for f in res.flags)
    assert {f.sourceColumn for f in res.flags if isinstance(f, SingleFeatureAucFlag)} == {"future", "proxy"}
    assert [f.sourceColumn for f in res.flags if isinstance(f, HighCardinalityIdFlag)] == ["ticket"]
    by_col = {a.feature_column: a for a in res.evidence}
    assert by_col["proxy"].best_shift == 0 and by_col["future"].best_shift == 1 and by_col["lag"].best_shift == -1
    assert set(by_col["x"].score_by_shift) == {-1, 0, 1} and not by_col["x"].flagged


def test_a_label_copy_tied_on_every_shift_is_a_same_period_proxy() -> None:
    """A label that never changes within an entity scores the same on every shift for a copy of it; the tie resolves
    to the same period (then the next, then the previous), so the copy is flagged, never kept as a past outcome."""
    rng = np.random.default_rng(12)
    stable = (rng.random(300) < 0.4).astype(int)
    entity = [f"e{e}" for e in range(300) for _ in range(4)]
    t = np.array([k for _ in range(300) for k in range(4)])
    y = np.repeat(stable, 4)
    res = _run(pd.DataFrame({"stable": y.astype(float)}), [_num("stable")], y, entity, t, True)
    audit = res.evidence[0]
    assert audit.score_by_shift == {-1: 1.0, 0: 1.0, 1: 1.0}
    assert audit.best_shift == 0 and audit.flagged
    assert res.excluded_sources == ["stable"] and res.past_outcome_sources == []


def test_a_source_is_flagged_when_any_of_its_feature_columns_is() -> None:
    """A source with two derived feature columns, only the second leaky: the source is flagged, evidence per column."""
    rng = np.random.default_rng(1)
    n = 3000
    y = (rng.random(n) < 0.4).astype(int)
    frame = pd.DataFrame({"Start__year": rng.normal(size=n), "Start__days_since_decision": y + 0.01 * rng.normal(size=n),
                          "x": rng.normal(size=n)})
    cols = [_num("Start__year", "Start"), _num("Start__days_since_decision", "Start"), _num("x")]
    res = _run(frame, cols, y, [str(i) for i in range(n)], np.zeros(n), False)
    assert res.excluded_sources == ["Start"]
    flagged = {a.feature_column: a.flagged for a in res.evidence if a.source_column == "Start"}
    assert flagged == {"Start__year": False, "Start__days_since_decision": True}


def test_feature_columns_named_like_internal_keys_are_audited_as_themselves() -> None:
    """Features named `label` and `entity` are plain features: neither replaces the label or the entity key."""
    df = _panel(n_ent=200)
    rng = np.random.default_rng(5)
    frame = pd.DataFrame({"label": rng.normal(size=len(df)), "entity": df["proxy"].to_numpy(), "y": rng.normal(size=len(df))})
    cols = [_num("label"), _num("entity"), _num("y")]
    res = _run(frame, cols, df["y"].to_numpy(), df["entity"].tolist(), df["t"].to_numpy(), True)
    assert res.excluded_sources == ["entity"]
    by_col = {a.feature_column: a for a in res.evidence}
    assert by_col["label"].score_by_shift[0] < 0.6 and by_col["y"].score_by_shift[0] < 0.6


def test_shifts_without_buildable_folds_score_nan_and_never_flag() -> None:
    """Two entities cannot fill five grouped folds: every shift scores NaN, so even a copy of the label is not flagged
    by the single-feature rule, and nothing raises."""
    df = _panel(n_ent=2, periods=60)
    res = _run(df[["proxy"]], [_num("proxy")], df["y"].to_numpy(), df["entity"].tolist(), df["t"].to_numpy(), True)
    assert res.excluded_sources == [] and res.flags == []
    assert all(math.isnan(v) for v in res.evidence[0].score_by_shift.values())


def test_a_column_is_judged_on_the_shifts_that_score() -> None:
    """Ten entities repeat once, so the +-1 shifts have 10 rows (too few to score) while shift 0 has 410: a label copy
    is flagged on shift 0 alone."""
    rng = np.random.default_rng(2)
    entity = [f"e{i}" for i in range(400)] + [f"e{i}" for i in range(10)]
    t = np.array([0] * 400 + [1] * 10)
    y = (rng.random(410) < 0.5).astype(int)
    frame = pd.DataFrame({"proxy": y.astype(float)})
    res = _run(frame, [_num("proxy")], y, entity, t, True)
    shifts = res.evidence[0].score_by_shift
    assert math.isnan(shifts[-1]) and math.isnan(shifts[1]) and shifts[0] > 0.9
    assert res.excluded_sources == ["proxy"]


def test_categorical_identifier_and_legitimate_categorical() -> None:
    """A categorical whose distinct ratio exceeds one half is an identifier; a low-cardinality one is scored."""
    rng = np.random.default_rng(3)
    n = 2000
    plan = rng.integers(0, 25, n)
    y = (rng.random(n) < 0.3 + 0.02 * (plan % 5)).astype(int)
    frame = pd.DataFrame({"plan": [f"P{p}" for p in plan], "member": [f"M{i}" for i in range(n)]})
    cols = [E.ColumnSpec("plan", "plan", E.CategoricalEncoding(30, "onehot")),
            E.ColumnSpec("member", "member", E.CategoricalEncoding(30, "onehot"))]
    res = _run(frame, cols, y, [str(i) for i in range(n)], np.zeros(n), False)
    assert res.excluded_sources == ["member"]
    ratio = next(f.distinctRatio for f in res.flags if isinstance(f, HighCardinalityIdFlag))
    assert ratio == 1.0
    assert [a.feature_column for a in res.evidence] == ["plan"] and res.evidence[0].metric == "auc"


@pytest.mark.parametrize("family", ["continuous", "multiclass"])
def test_other_families_flag_a_label_copy(family: TabularFamily) -> None:
    rng = np.random.default_rng(4)
    n = 1500
    y = rng.integers(0, 3, n) if family == "multiclass" else rng.normal(size=n)
    frame = pd.DataFrame({"copy": y.astype(float), "x": rng.normal(size=n)})
    res = _run(frame, [_num("copy"), _num("x")], y, [str(i) for i in range(n)], np.zeros(n), False, family, 3)
    assert res.excluded_sources == ["copy"]
    assert {a.metric for a in res.evidence} == {"r2" if family == "continuous" else "auc"}


def test_beats_reference() -> None:
    rng = np.random.default_rng(6)
    n = 2000
    truth = 1 / (1 + np.exp(-rng.normal(size=n)))
    y = (rng.random(n) < truth).astype(np.float64)
    leaky, p = AU.beats_reference(y, y + 0.01 * rng.normal(size=n), truth)
    assert leaky and p < 1e-6
    assert AU.beats_reference(y, truth + 0.001 * rng.normal(size=n), truth)[0] is False
    assert AU.beats_reference(y, truth, truth)[0] is False                    # zero variance: undefined, never a leak
    assert AU.beats_reference(np.ones(n), truth, truth) == (False, 1.0)       # one class: no AUC to compare


@pytest.mark.parametrize("positives", [1, 1999])
def test_beats_reference_with_one_row_of_a_class_is_undefined_and_quiet(positives: int) -> None:
    """One row of either class leaves the paired test without a variance: never a leak, and no numpy warning."""
    rng = np.random.default_rng(13)
    y = np.zeros(2000)
    y[:positives] = 1.0
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        assert AU.beats_reference(y, y + 0.01 * rng.normal(size=2000), rng.random(2000)) == (False, 1.0)


# ------------------------------------------------------------------------------------------------ POST /trainer ------

LOGISTIC_ONLY: list[tuple[str, str, JsonObject]] = [("glm_candidate", "logistic_regression", {})]


def _holdout_2024(df: pd.DataFrame) -> list[str]:
    return [str(i) for i, t in zip(df["ID"], df["T"]) if str(t).startswith("2024")]


def _post(server: FileServer, df: pd.DataFrame, feats: dict[str, JsonObject], reference: bool = False,
          ceiling: float = 0.9, drivers: list[tuple[str, str, JsonObject]] = LOGISTIC_ONLY) -> JsonObject:
    m, n = snapshot_files(df, feats, _holdout_2024(df), label_map=LABELS, reference_col="Truth" if reference else None)
    audit: JsonObject = {"singleFeatureHeldOutAucMax": ceiling, "timeShiftedLabelTest": True, "dropColumnTest": True,
                         "importanceAggregation": "per-source-column", "highCardinalityIdCheck": True}
    req = request(server, m, n, TASK, protocol("binary", leakageAudit=audit), candidates("binary", drivers))
    resp = client.post("/trainer", json=req)
    assert resp.status_code == 200, resp.text
    body: JsonValue = resp.json()
    assert isinstance(body, dict)
    return body


def _with_truth(df: pd.DataFrame) -> pd.DataFrame:
    """The frame's planted probability (binary_frame's logit; a missing x1 counts as 0) as the reference score."""
    x1 = df["x1"].fillna(0.0).to_numpy()
    logit = -0.5 + 1.2 * x1 - 0.8 * df["x2"].to_numpy() + 0.6 * (df["city"] == "SF").to_numpy()
    return df.assign(Truth=1 / (1 + np.exp(-logit)))


def test_trainer_excludes_audited_sources_before_selection(server: FileServer) -> None:
    df = binary_frame().assign(echo=lambda d: d["Target"].astype(float))
    r = TrainerCompleted.model_validate(_post(server, df, {**FEATS, "echo": NUMERIC}))
    assert [f.sourceColumn for f in r.leakageFlags if isinstance(f, SingleFeatureAucFlag)] == ["echo"]
    assert {i.sourceColumn for i in r.importance} == {"x1", "x2", "city"}
    # Every shippable predictor, the simple baselines included, was fitted without the flagged source.
    assert {a.candidate for a in r.artifacts} == {"glm_candidate", "oneFeature", "glm"}
    for a in r.artifacts:
        _, envelope = artifacts.load_v2_envelope(base64.b64decode(a.bytesBase64))
        assert "echo" not in {c.sourceColumn for c in envelope.featureColumns}, a.candidate


def test_an_audit_that_excludes_every_source_fails_inner_cv_naming_them(server: FileServer) -> None:
    df = binary_frame().assign(echo=lambda d: d["Target"].astype(float))
    r = TrainerFailed.model_validate(_post(server, df, {"echo": NUMERIC}))
    assert r.stage == "inner-cv" and "excluded every feature source column" in r.message and "echo" in r.message


def test_reference_rule_drops_the_column_that_explains_an_implausible_gain(server: FileServer) -> None:
    """With the single-feature ceiling at 1.0 the label copy passes the audit; the model then beats the planted
    probability by an implausible margin, and dropping `echo` (only it) makes it plausible again."""
    df = _with_truth(binary_frame()).assign(echo=lambda d: d["Target"].astype(float))
    r = TrainerCompleted.model_validate(_post(server, df, {**FEATS, "echo": NUMERIC}, reference=True, ceiling=1.0))
    assert [f.sourceColumn for f in r.leakageFlags if isinstance(f, DropColumnFlag)] == ["echo"]
    assert all(f.scoreDrop > 0 for f in r.leakageFlags if isinstance(f, DropColumnFlag))
    assert {i.sourceColumn for i in r.importance} == {"x1", "x2", "city"}


def test_reference_rule_without_a_single_explaining_column_fails_inner_cv(server: FileServer) -> None:
    """Two copies of the label: dropping either one leaves the other, so no single column explains the gain."""
    df = _with_truth(binary_frame()).assign(echo=lambda d: d["Target"].astype(float),
                                            echo2=lambda d: d["Target"].astype(float))
    body = _post(server, df, {**FEATS, "echo": NUMERIC, "echo2": NUMERIC}, reference=True, ceiling=1.0)
    r = TrainerFailed.model_validate(body)
    assert r.stage == "inner-cv" and "reference" in r.message


def test_reference_rule_fails_when_another_candidate_still_beats_the_reference(server: FileServer) -> None:
    """The label is an interaction (u > 0 XOR v > 0) that a linear model cannot use and a boosted tree can. With the
    copy `echo` present the trials run on the logistic candidate (the most implausible, request order breaking a tie),
    and dropping `echo` alone makes it plausible; after reselecting without `echo` the tree still beats the reference.
    Had the tree been chosen, no single column would explain its gain and the run would fail at the earlier check,
    whose message this test rejects."""
    rng = np.random.default_rng(21)
    n = 1200
    u, v = rng.normal(size=n), rng.normal(size=n)
    target = (((u > 0) != (v > 0)) ^ (rng.random(n) < 0.05)).astype(int)
    df = binary_frame(n).assign(u=u, v=v, Target=target, echo=target.astype(float), Truth=0.5 + 0.01 * rng.normal(size=n))
    drivers: list[tuple[str, str, JsonObject]] = [
        ("glm_candidate", "logistic_regression", {}),
        ("lgbm", "lightgbm", {"n_estimators": 100, "learning_rate": 0.1, "num_leaves": 7, "min_child_samples": 20}),
    ]
    body = _post(server, df, {"u": NUMERIC, "v": NUMERIC, "echo": NUMERIC}, reference=True, ceiling=1.0,
                 drivers=drivers)
    r = TrainerFailed.model_validate(body)
    assert r.stage == "inner-cv"
    assert "'lgbm' still beats the reference score" in r.message and "['echo']" in r.message


def test_reference_rule_keeps_a_plausible_model(server: FileServer) -> None:
    df = _with_truth(binary_frame())
    r = TrainerCompleted.model_validate(_post(server, df, FEATS, reference=True, ceiling=1.0))
    assert r.leakageFlags == []
