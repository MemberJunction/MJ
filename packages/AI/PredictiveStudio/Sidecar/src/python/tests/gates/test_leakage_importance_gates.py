"""Leakage and importance gates on planted truth: C4's planted leaks are flagged by name and kept out of the shipped
model, and the audit reproduces the reference pipeline's per-shift scores; W3's row-level leak is flagged for every
candidate kind and, with the single-feature ceiling out of the way, by the implausible-gain rule against the oracle;
W8's noise columns carry at most a tenth of the held-out permutation importance."""

from __future__ import annotations

import base64
import math

import numpy as np
import pandas as pd
import pytest

from app import artifacts, audit as AU, importance as IM, snapshot as SN, trainer as TR
from app.trainer_schemas import TrainerCompleted, TrainerRequest
from tests.gates.conftest import W_BINARY_FEATURES, completed, last_cycle_ids, world, world_frame, world_truth
from tests.tools.trainer_fixture import (BINARY_LABELS as LM, BINARY_TASK as BIN, NUMERIC, FileServer, JsonObject,
                                         as_list, as_number, as_object, as_str, candidates, feature_schema_hash,
                                         protocol, refpipe, request, scenario, snapshot_files)

FOUR = ["logistic_regression", "random_forest", "xgboost", "lightgbm"]
C4_LEAKS = {"ProxyOfTarget", "NextPeriodFlag", "TicketCode"}
# The reference pipeline writes each score with 10 significant digits; the port must agree to that precision.
PARITY_TOLERANCE = 1e-10


def _shipped_columns(r: TrainerCompleted) -> set[str]:
    """The source columns of the artifact the gate ships."""
    art = next(a for a in r.artifacts if a.candidate == r.gate.shipped)
    _, env = artifacts.load_v2_envelope(base64.b64decode(art.bytesBase64))
    return {c.sourceColumn for c in env.featureColumns}


def _named_sources(r: TrainerCompleted) -> set[str]:
    """The source columns the run's leakage flags name (the time-shifted-label flag names none)."""
    return {f.sourceColumn for f in r.leakageFlags if f.kind != "time-shifted-label"}


def _audit_in_process(payload: JsonObject, matrix: bytes, manifest: bytes) -> AU.AuditResult:
    """The trainer's leakage audit run in-process on the snapshot's development rows, with the arguments the trainer
    passes it, so its per-column evidence (not on the wire) can be compared with the reference pipeline's."""
    req = TrainerRequest.model_validate(payload)
    snap = SN.parse_snapshot(matrix, manifest, feature_schema_hash(matrix))
    enc = TR.encode_label(req.task, snap.label)
    dev = np.flatnonzero(np.array(snap.roles) == "development").astype(np.int64)
    dev_periods = SN.period_ordinals(snap)[dev]
    return AU.run_audit(
        snap.frame.iloc[dev].reset_index(drop=True), snap.columns, np.asarray(enc.y)[dev],
        [snap.entity_keys[int(i)] for i in dev], dev_periods, len(set(dev_periods.tolist())) > 1, enc.family,
        req.protocol.leakageAudit.singleFeatureHeldOutAucMax, req.protocol.seed, len(enc.class_order or []))


def _parity_gap(ref_audit: JsonObject, result: AU.AuditResult) -> float:
    """Largest |port score - reference score| over every scored column and label shift of the reference's audit; a
    shift the reference could not score (null) must be unscored (NaN) in the port too."""
    port = {a.feature_column: a.score_by_shift for a in result.evidence}
    gap = 0.0
    checked: set[str] = set()
    for row in as_list(ref_audit["evidence"], "audit.evidence"):
        ev = as_object(row, "audit evidence row")
        if "scoreByShift" not in ev:
            continue   # a high-cardinality identifier: no shift scores
        col = as_str(ev["column"], "evidence column")
        checked.add(col)
        assert col in port, f"the port did not score {col}"
        for key, want in as_object(ev["scoreByShift"], f"{col} scoreByShift").items():
            got = port[col][int(key)]
            if want is None:
                assert math.isnan(got), f"{col} shift {key}: the reference left it unscored, the port scored {got}"
                continue
            gap = max(gap, abs(got - as_number(want, f"{col} shift {key}")))
    assert checked == set(port), f"scored columns differ: reference {sorted(checked)}, port {sorted(port)}"
    return gap


@pytest.mark.gate("C4 -> S2.4")
def test_C4_S2_4_planted_leaks_flagged_by_name_and_absent(server: FileServer) -> None:
    """ProxyOfTarget (same period), NextPeriodFlag (next period) and TicketCode (an identifier) are flagged and kept
    out of what ships, the lag PrevEscalated is kept, and the flags and per-shift scores match the reference
    pipeline's audit on the same development rows."""
    ref = refpipe("C4")
    ref_audit = as_object(ref["audit"], "C4 audit")
    test_ids = [as_str(i, "testIds[]") for i in as_list(as_object(ref["split"], "C4 split")["testIds"], "testIds")]
    df = scenario("C4")
    feats: dict[str, JsonObject] = {c: NUMERIC for c in ["SeverityZ", "Tier", "AfterHours", "NoiseZ", "PrevEscalated",
                                                          "ProxyOfTarget", "NextPeriodFlag"]}
    feats["TicketCode"] = {"kind": "categorical", "cardinalityCap": 50, "method": "onehot"}
    m, n = snapshot_files(df, feats, test_ids, label_map=LM)
    payload = request(server, m, n, BIN, protocol("binary"), candidates("binary"), tag="c4")
    r = completed(payload)
    named = _named_sources(r)
    assert C4_LEAKS <= named, f"flagged {sorted(named)}"
    assert any(f.kind == "time-shifted-label" for f in r.leakageFlags), f"flags: {r.leakageFlags}"
    assert "PrevEscalated" not in named  # a past-period outcome (lag) is legitimate
    if r.gate.shipped is not None:
        assert not (C4_LEAKS & _shipped_columns(r))
    ref_flagged = {as_str(as_object(f, "flag")["column"], "flag column") for f in as_list(ref_audit["flags"], "flags")}
    assert named == ref_flagged, f"sidecar flags {sorted(named)}, reference pipeline flags {sorted(ref_flagged)}"
    port = _audit_in_process(payload, m, n)
    assert set(port.excluded_sources) == ref_flagged
    gap = _parity_gap(ref_audit, port)
    assert gap <= PARITY_TOLERANCE, f"max |port - reference| per-shift score = {gap:.3e}"


def _w3(seed: int = 42) -> pd.DataFrame:
    df = world_frame(world("W3-leak-row", seed))
    t = world_truth("W3-leak-row", seed).set_index("MembershipYearID")
    df["TrueP"] = t.loc[df["ID"], "TrueP"].to_numpy()
    return df


W3_FEATS: dict[str, JsonObject] = {**W_BINARY_FEATURES,
                                   "Status": {"kind": "categorical", "cardinalityCap": 10, "method": "onehot"}}


@pytest.mark.gate("W3 -> S2.4")
@pytest.mark.parametrize("driver", FOUR)
def test_W3_S2_4_every_candidate_flagged(server: FileServer, driver: str) -> None:
    """Status (the row's own outcome) is flagged and absent from what ships, whichever candidate kind is fitted. The
    audit itself runs before any candidate is fitted, so its flags do not depend on the candidate; the four runs show
    that no candidate kind reaches the leaked column."""
    df = _w3()
    m, n = snapshot_files(df, W3_FEATS, last_cycle_ids(df), label_map=LM)
    r = completed(request(server, m, n, BIN, protocol("binary"), candidates("binary", [(driver, driver, {})]),
                          tag=f"w3-{driver}"))
    assert any(f.kind == "single-feature-auc" and f.sourceColumn == "Status" for f in r.leakageFlags), \
        f"flags: {r.leakageFlags}"
    if r.gate.shipped is not None:
        assert "Status" not in _shipped_columns(r)


@pytest.mark.gate("W3 -> S2.4")
def test_W3_S2_4_above_oracle_is_a_leak(server: FileServer) -> None:
    """With the single-feature ceiling out of the way, a candidate above the oracle on the same rows (paired DeLong,
    one-sided p < 0.001) is treated as a leak: the drop-column test names Status and the model is refit without it."""
    df = _w3()
    # The fixture writes the planted TrueP as __ps_reference_score; product snapshots never carry one.
    m, n = snapshot_files(df, W3_FEATS, last_cycle_ids(df), label_map=LM, reference_col="TrueP")
    proto = protocol("binary", leakageAudit={"singleFeatureHeldOutAucMax": 1.0, "timeShiftedLabelTest": True,
                                             "dropColumnTest": True, "importanceAggregation": "per-source-column",
                                             "highCardinalityIdCheck": True})
    r = completed(request(server, m, n, BIN, proto, candidates("binary", [("lr", "logistic_regression", {})]),
                          tag="w3-ref"))
    assert any(f.kind == "drop-column" and f.sourceColumn == "Status" for f in r.leakageFlags), \
        f"flags: {r.leakageFlags}"
    if r.gate.shipped is not None:
        assert "Status" not in _shipped_columns(r)


@pytest.mark.gate("W8 -> S9.4")
def test_W8_S9_4_noise_carries_at_most_ten_percent(server: FileServer) -> None:
    """The five noise columns, Region, PostalCode and the identifier MemberNumber carry at most 10% of the positive
    held-out permutation importance, and MemberNumber is flagged as a high-cardinality identifier."""
    df = world_frame(world("W8-highcard", 42))
    feats: dict[str, JsonObject] = {**W_BINARY_FEATURES,
                                    "PostalCode": {"kind": "categorical", "cardinalityCap": 50, "method": "onehot"},
                                    "MemberNumber": {"kind": "identifier", "policy": "exclude"}}
    m, n = snapshot_files(df, feats, last_cycle_ids(df), label_map=LM)
    r = completed(request(server, m, n, BIN, protocol("binary"), candidates("binary", [("lgbm", "lightgbm", {})]),
                          tag="w8"))
    imps = [IM.ColumnImportance(i.sourceColumn, i.permutationImportance.value, i.permutationImportance.interval.lower,
                                i.permutationImportance.interval.upper) for i in r.importance]
    noise = ["Noise1", "Noise2", "Noise3", "Noise4", "Noise5", "Region", "PostalCode", "MemberNumber"]
    share = IM.noise_share(imps, noise)
    assert share <= 0.10, f"noise columns carry {share:.4f} of the held-out permutation importance"
    assert any(f.kind == "high-cardinality-id" and f.sourceColumn == "MemberNumber" for f in r.leakageFlags), \
        f"flags: {r.leakageFlags}"
