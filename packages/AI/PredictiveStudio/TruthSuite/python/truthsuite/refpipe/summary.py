# truthsuite/refpipe/summary.py — P5 summary table from a results directory. Usage:
#   .venv/bin/python -m truthsuite.refpipe.summary <results_dir> <id> [<id> ...]
from __future__ import annotations

import json
import pathlib
import sys


def _f(v: object, nd: int = 4) -> str:
    return "null" if v is None else f"{float(str(v)):.{nd}f}"


def _ci(v: object) -> str:
    if not isinstance(v, list):
        return "[null]"
    return f"[{_f(v[0])}, {_f(v[1])}]"


def _strict(r: dict[str, object]) -> str:
    g = r.get("gate")
    if not isinstance(g, dict) or g.get("shipped") is None:
        return ""
    return f" (shipped={g['shipped']}" + (f"; {g['note']}" if g.get("note") else "") + ")"


def row(r: dict[str, object]) -> str:
    ps = r["primaryScore"]; assert isinstance(ps, dict)
    bls = r["baselines"]; assert isinstance(bls, list)
    strongest = str(r["strongestBaseline"])
    sb = next(b for b in bls if isinstance(b, dict) and b["name"] == strongest)
    bm = sb["baselineMinusModel"]; assert isinstance(bm, dict)
    audit = r["audit"]; assert isinstance(audit, dict)
    flags = audit["flags"]; assert isinstance(flags, list)
    split = r["split"]; assert isinstance(split, dict)
    cal = r.get("calibration"); iv = r.get("intervals"); cc = "-"
    if isinstance(cal, dict):
        if "perClass" in cal:
            pcs = cal["perClass"]; assert isinstance(pcs, list)
            cc = "applied=" + str(cal["applied"]) + " " + str(cal["method"]) + " " + ";".join(
                f"{p['class']}:slope={_f(p['slope'], 3)},citl={_f(p['citl'], 3)}" for p in pcs if isinstance(p, dict))
        else:
            cc = f"applied={cal['applied']} {cal['method']} slope={_f(cal['slope'], 3)} int={_f(cal['intercept'], 3)} citl={_f(cal['citl'], 3)}"
    elif isinstance(iv, dict):
        lv = iv["levels"]; assert isinstance(lv, list)
        cc = " ".join(f"cov{int(float(str(x['level'])) * 100)}={_f(x['coverage'], 3)}({'ok' if x['within3SE'] else 'OUT'})"
                      for x in lv if isinstance(x, dict))
    res = r.get("residual"); rr = "-"
    if isinstance(res, dict):
        lb = res["ljungBox"]; assert isinstance(lb, dict)
        rr = f"acf1={_f(res['acf1'], 3)} DW={_f(res['durbinWatson'], 3)} LBp={_f(lb['pValue'], 4)} effN={_f(res['effectiveN'], 1)}"
    naive = r.get("naive"); nv = "-"
    if isinstance(naive, dict):
        nps = naive["primaryScore"]; assert isinstance(nps, dict)
        d = naive["professionalMinusNaive"]; assert isinstance(d, dict)
        nv = f"naive {_f(nps['value'])} (prof-naive {_f(d['value'])} {_ci(d['ci'])})"
    return " | ".join([
        str(r["scenario"]) + (" (--shuffle-labels)" if r.get("shuffleLabels") else ""), f"{r['problem']}/{r['structure']}", str(split["kind"]),
        f"nTrain={split['nTrain']} nTest={split['nTest']}", str(r["selected"]),
        f"{ps['name']}={_f(ps['value'])} {_ci(ps['ci'])}",
        f"strongest={strongest} {_f(sb['value'])} diff={_f(bm['value'])} {_ci(bm['ci'])}",
        f"beatsBaseline={r['beatsBaseline']}", f"outcome={r['gateOutcome']}{_strict(r)}", f"noSignal={r['noSignal']}", cc, rr,
        "flags=" + (",".join(str(x["column"]) for x in flags if isinstance(x, dict)) or "none"), nv,
        "truthBlocked=" + str(r["truthAccess"]["blockedAttempts"] if isinstance(r["truthAccess"], dict) else "?"),
    ])


def mode_row(r: dict[str, object]) -> str | None:
    modes = r.get("modes")
    if not isinstance(modes, dict) or "newEntity" not in modes:
        return None
    m = modes["newEntity"]; assert isinstance(m, dict)
    ps = m["primaryScore"]; assert isinstance(ps, dict)
    bls = m["baselines"]; assert isinstance(bls, list)
    diffs = []
    for b in bls:
        if isinstance(b, dict):
            bm = b["baselineMinusModel"]; assert isinstance(bm, dict)
            diffs.append(f"{b['name']}{'' if b['comparator'] else '(excl)'} {_f(bm['value'])} {_ci(bm['ci'])}")
    return " | ".join([f"{r['scenario']} [new-entity mode]", f"nTrain={m['nTrain']} nTest={m['nTest']} sharedKeys={m['sharedEntityKeys']}",
                       str(m["selected"]), f"{ps['name']}={_f(ps['value'])} {_ci(ps['ci'])}", "; ".join(diffs),
                       f"beatsBaseline={m['beatsBaseline']}", f"outcome={m['gateOutcome']}{_strict(m)}", f"noSignal={m['noSignal']}"])


def main(argv: list[str]) -> int:
    d = pathlib.Path(argv[0])
    print("scenario | problem/structure | split | sizes | selected | primary [95% CI] | strongest baseline, (baseline-model) [95% CI] | beatsBaseline | outcome | noSignal | calibration or interval coverage | residual | audit flags | naive run | truth")
    for sid in argv[1:]:
        r = json.loads((d / f"{sid}.json").read_text())
        assert isinstance(r, dict)
        print(row(r))
    extra = []
    for sid in argv[1:]:
        r = json.loads((d / f"{sid}.json").read_text()); assert isinstance(r, dict)
        mr = mode_row(r)
        if mr is not None:
            extra.append(mr)
    if extra:
        print("new-entity mode (Ruling Q12) | sizes | selected | primary [95% CI] | (baseline - model) [95% CI] per baseline | beatsBaseline | outcome | noSignal")
        for line in extra:
            print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
