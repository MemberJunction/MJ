# tests/test_run.py — P5 end-to-end: brief tests, then no-signal, determinism, leakage audit and truth isolation.
from __future__ import annotations
import json, subprocess, pathlib, sys
from truthsuite import paths

ROOT = pathlib.Path(__file__).resolve().parents[1]
PY = sys.executable

def run(sid: str, *extra: str) -> dict[str, object]:
    out = ROOT / f".scratch/refpipe-test-{sid}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([PY, "-m", "truthsuite.refpipe.run", sid, "--out", str(out), *extra], check=True, cwd=ROOT)
    r: dict[str, object] = json.loads(out.read_text())
    return r

def test_no_truth_leak_shuffled_labels() -> None:
    r = run("C2", "--shuffle-labels")
    assert r["noSignal"] is True

def test_n1c_is_no_signal() -> None:
    assert run("N1c")["noSignal"] is True

def test_r1_beats_baseline() -> None:
    assert run("R1")["beatsBaseline"] is True


# ---- additions ----
def test_n1r_is_no_signal() -> None:
    assert run("N1r")["noSignal"] is True


def test_output_is_byte_deterministic() -> None:
    outs = [ROOT / ".scratch/refpipe-det-a.json", ROOT / ".scratch/refpipe-det-b.json"]
    for o in outs:
        o.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([PY, "-m", "truthsuite.refpipe.run", "T2p", "--out", str(o)], check=True, cwd=ROOT)
    assert outs[0].read_bytes() == outs[1].read_bytes()


def _flags(r: dict[str, object]) -> set[str]:
    audit = r["audit"]
    assert isinstance(audit, dict)
    return {str(f["column"]) for f in audit["flags"]}


def test_leakage_audit_c4_flags_all_three_traps() -> None:
    r = run("C4")
    assert _flags(r) == {"ProxyOfTarget", "NextPeriodFlag", "TicketCode"}
    audit = r["audit"]; assert isinstance(audit, dict)
    assert "PrevEscalated" in audit["kept"]
    naive = r["naive"]; assert isinstance(naive, dict)
    assert {"ProxyOfTarget", "NextPeriodFlag", "TicketCode"} <= set(naive["features"])


def test_leakage_audit_t3_flags_same_period_and_keeps_lag() -> None:
    r = run("T3")
    assert _flags(r) == {"SamePeriodTarget"}
    audit = r["audit"]; assert isinstance(audit, dict)
    assert "LagTarget" in audit["kept"]


def test_truth_guard_blocks_truth_files() -> None:
    c2_truth = str(paths.seed_dir("scenario", "C2", 2201) / "truth.csv")
    t1p_truth = str(paths.seed_dir("scenario", "T1p", 2206) / "truth_origins.csv")
    code = (f"import sys; from truthsuite.refpipe.run import install_truth_guard; install_truth_guard()\n"
            f"try:\n    open({c2_truth!r})\nexcept PermissionError:\n    sys.exit(7)\nsys.exit(0)")
    rc = subprocess.run([PY, "-c", code], cwd=ROOT).returncode
    assert rc == 7
    code2 = code.replace(repr(c2_truth), repr(t1p_truth))
    assert subprocess.run([PY, "-c", code2], cwd=ROOT).returncode == 7


def test_json_records_truth_isolation_and_criteria() -> None:
    r = run("N1c")
    ta = r["truthAccess"]; assert isinstance(ta, dict)
    assert ta["blockedAttempts"] == 0 and "sys.addaudithook(open)" in str(ta["guard"]) and "pyarrow" in str(ta["guard"])
    for key in ("scenario", "problem", "split", "primaryScore", "baselines", "beatsBaseline", "calibration", "residual",
                "importance", "selected", "noSignal", "criteria"):
        assert key in r


def test_truth_guard_is_case_insensitive_and_covers_pyarrow() -> None:
    tmp = ROOT / ".scratch/refpipe-guard"; tmp.mkdir(parents=True, exist_ok=True)
    (tmp / "Truth.CSV").write_text("a\n1\n")
    c2_truth = str(paths.seed_dir("scenario", "C2", 2201) / "truth.csv")
    code = (f"import sys; from truthsuite.refpipe.run import install_truth_guard; install_truth_guard()\n"
            f"import pyarrow.csv as pc\n"
            f"hits = 0\n"
            f"for fn in (lambda: open('.scratch/refpipe-guard/Truth.CSV'), lambda: pc.read_csv({c2_truth!r}),\n"
            f"           lambda: pc.read_csv('.scratch/refpipe-guard/Truth.CSV')):\n"
            f"    try:\n        fn()\n    except PermissionError:\n        hits += 1\n"
            f"sys.exit(10 + hits)")
    assert subprocess.run([PY, "-c", code], cwd=ROOT).returncode == 13


def test_modes_reported_and_labelled() -> None:
    r = run("C1")
    assert r["evaluationMode"] == "deployment"
    split = r["split"]; assert isinstance(split, dict)
    assert split["kind"] == "deployment" and split["nTest"] == 1205
    modes = r["modes"]; assert isinstance(modes, dict)
    ne = modes["newEntity"]; assert isinstance(ne, dict)
    assert ne["evaluationMode"] == "new-entity" and ne["sharedEntityKeys"] == 0
    cal = r["calibration"]; assert isinstance(cal, dict)
    assert cal["appliedTo"] == "full-carve refit"
    # the GLM baseline is a comparator unless the delivered predictor is literally that GLM
    bl = r["baselines"]; assert isinstance(bl, list)
    g = [b for b in bl if isinstance(b, dict) and b["name"] == "glm"][0]
    assert g["comparator"] is (not (r["selected"] == "glm" and cal["applied"] is False))
    dec = cal["decision"]; assert isinstance(dec, dict)
    assert dec["basis"] == "time-ordered validation slice predicted by a refit trained on all rows before it"


def test_series_selection_reports_phi_and_ljung_box_veto() -> None:
    r = run("T1p")
    cands = r["candidates"]; assert isinstance(cands, list)
    assert all("ljungBoxP" in c and "vetoed" in c for c in cands if isinstance(c, dict))
    assert any(isinstance(c, dict) and c["name"] == "ar1_const" for c in cands)
    res = r["residual"]; assert isinstance(res, dict)
    phi = res["arCoefficients"]; assert isinstance(phi, dict) and phi
    for v in phi.values():
        assert isinstance(v, dict) and v["se"] is not None and v["se"] > 0
    iv = r["intervals"]; assert isinstance(iv, dict)
    assert "Gaussian" in str(iv["method"]) or "simulat" in str(iv["method"])


def test_t3_wording_matches_selected_model() -> None:
    r = run("T3")
    uses = r["selectedUsesArTerm"]
    crit = r["criteria"]; assert isinstance(crit, list)
    st1 = [c for c in crit if isinstance(c, dict) and c["id"] == "S-T.1"][0]
    assert ("recursive AR(1)" in str(st1["what"])) is bool(uses)


GATE = ("model", "keep-simple-baseline", "no-signal")


def _gate(r: dict[str, object]) -> dict[str, object]:
    g = r["gate"]; assert isinstance(g, dict)
    assert g["outcome"] in GATE and r["gateOutcome"] == g["outcome"]
    assert r["noSignal"] is (g["outcome"] == "no-signal")
    cmp_ = g["comparisons"]; assert isinstance(cmp_, dict)
    simple = g["simpleSet"]; assert isinstance(simple, list) and len(simple) == 2
    for k in ["modelVsDummy"] + [f"{m}VsDummy" for m in simple] + [f"modelVs:{m}" for m in simple]:
        v = cmp_[k]; assert isinstance(v, dict) and isinstance(v["ci"], list) and len(v["ci"]) == 2
    assert "strictConditionMet" not in g
    assert "shippedBeatsDummy" not in g
    if g["outcome"] == "model":
        assert g["shippedRole"] == "model" and str(g["shipped"]).split("+")[0] == r["selected"]
    elif g["outcome"] == "keep-simple-baseline":
        assert g["shippedRole"] == "simpleBaseline" and g["shipped"] in simple
    else:
        assert g["shipped"] is None and g["shippedRole"] is None
    return g


def test_q13_gate_signal_beyond_dummy_is_not_no_signal() -> None:
    r = run("R2-real")
    g = _gate(r)
    assert g["outcome"] == "keep-simple-baseline" and g["shipped"] == "glm" and r["noSignal"] is False


def test_q13_gate_no_signal_controls() -> None:
    for sid, extra in (("N1c", ()), ("N1r", ()), ("C2", ("--shuffle-labels",)), ("N1c", ("--shuffle-labels",))):
        r = run(sid, *extra)
        g = _gate(r)
        assert g["outcome"] == "no-signal", (sid, extra)


def test_q13_delivered_simple_baseline_is_keep_simple() -> None:
    r = run("R1")  # GLM selected, uncalibrated: the delivered model is the simple baseline itself
    g = _gate(r)
    assert r["selected"] == "glm" and g["outcome"] == "keep-simple-baseline" and g["shipped"] == "glm"


def test_q15_only_model_beats_dummy_ships_model() -> None:
    """T4 and T1-real: the model's lower bound vs the dummy is > 0 and neither naive nor seasonal naive has one > 0."""
    for sid in ("T4", "T1-real"):
        r = run(sid)
        g = _gate(r)
        c = g["comparisons"]; assert isinstance(c, dict)
        assert c["modelVsDummy"]["ci"][0] > 0 and c["naiveVsDummy"]["ci"][0] <= 0 and c["seasonalNaiveVsDummy"]["ci"][0] <= 0, sid
        assert g["outcome"] == "model" and g["branch"] == "a:Q15-only-model-beats-dummy", sid
        assert g["shipped"] == r["selected"] and g["note"] == "no simple baseline carries demonstrable signal", sid
        assert r["noSignal"] is False


def test_truth_guard_blocks_native_pyarrow_handles() -> None:
    c2_truth = str(paths.seed_dir("scenario", "C2", 2201) / "truth.csv")
    code = (f"import sys; from truthsuite.refpipe.run import install_truth_guard; install_truth_guard()\n"
            f"import pyarrow as pa, pyarrow.fs as pfs\n"
            f"p = {c2_truth!r}; hits = 0\n"
            f"for fn in (lambda: pa.memory_map(p), lambda: pa.OSFile(p), lambda: pa.input_stream(p),\n"
            f"           lambda: pfs.LocalFileSystem().open_input_stream(p), lambda: pfs.LocalFileSystem().open_input_file(p)):\n"
            f"    try:\n        fn()\n    except PermissionError:\n        hits += 1\n"
            f"sys.exit(20 + hits)")
    assert subprocess.run([PY, "-c", code], cwd=ROOT).returncode == 25
