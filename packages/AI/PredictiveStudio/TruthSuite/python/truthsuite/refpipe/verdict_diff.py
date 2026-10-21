# truthsuite/refpipe/verdict_diff.py — P5 fix round 1: verdict changes between a committed revision's JSON and the current
# results/<id>.json. Usage:
#   .venv/bin/python -m truthsuite.refpipe.verdict_diff 8113c2f <id> [<id> ...]
from __future__ import annotations

import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _load_old(rev: str, sid: str) -> dict[str, object]:
    txt = subprocess.run(["git", "show", f"{rev}:results/P5/{sid}.json"], cwd=ROOT, check=True,
                         capture_output=True, text=True).stdout
    r: dict[str, object] = json.loads(txt)
    return r


def _load_new(sid: str) -> dict[str, object]:
    r: dict[str, object] = json.loads((ROOT / f"results/P5/{sid}.json").read_text())
    return r


def _fmt(v: object) -> str:
    return "null" if v is None else f"{float(str(v)):.4f}"


LEGACY = {"publish-selected": "model", "keep-glm-baseline": "keep-simple-baseline"}


def _outcome(r: dict[str, object]) -> str:
    """Gate outcome under the current labels; runs before fix round 1 had only beatsBaseline/noSignal."""
    raw = r.get("gateOutcome")
    if raw is None:
        return "model" if r["beatsBaseline"] else "no-signal"
    return LEGACY.get(str(raw), str(raw))


def _shipped(r: dict[str, object]) -> str | None:
    """What the gate ships: `gate.shipped` (Q14 recorded only a simple baseline there; Q15 also names the model under
    (a)); e3be43f recorded the kept baseline as `gate.keptBaseline`."""
    g = r.get("gate")
    if not isinstance(g, dict):
        return None
    v = g.get("shipped", g.get("keptBaseline"))
    return None if v is None else str(v)


def _describe(r: dict[str, object]) -> str:
    ps = r["primaryScore"]; assert isinstance(ps, dict)
    split = r["split"]; assert isinstance(split, dict)
    bls = r["baselines"]; assert isinstance(bls, list)
    parts = []
    for b in bls:
        if isinstance(b, dict):
            bm = b["baselineMinusModel"]; assert isinstance(bm, dict)
            ci = bm["ci"]; assert isinstance(ci, list)
            parts.append(f"{b['name']}{'' if b['comparator'] else '(excl)'} {_fmt(bm['value'])} [{_fmt(ci[0])}, {_fmt(ci[1])}]")
    ci0 = ps["ci"]; assert isinstance(ci0, list)
    outcome = _outcome(r)
    return (f"split={split['kind']} nTrain={split['nTrain']} nTest={split['nTest']} selected={r['selected']} "
            f"{ps['name']}={_fmt(ps['value'])} [{_fmt(ci0[0])}, {_fmt(ci0[1])}] beatsBaseline={r['beatsBaseline']} "
            f"outcome={outcome} shipped={_shipped(r)} noSignal={r['noSignal']} | (baseline-model): " + "; ".join(parts))


def main(argv: list[str]) -> int:
    rev = argv[0]
    for sid in argv[1:]:
        old = _load_old(rev, sid); new = _load_new(sid)
        changed = (_outcome(old), old["noSignal"], _shipped(old)) != (_outcome(new), new["noSignal"], _shipped(new))
        print(f"== {sid}: {'OUTCOME CHANGED' if changed else 'outcome unchanged'}"
              f" (outcome {_outcome(old)} -> {_outcome(new)}, shipped {_shipped(old)} -> {_shipped(new)},"
              f" noSignal {old['noSignal']} -> {new['noSignal']},"
              f" beatsBaseline {old['beatsBaseline']} -> {new['beatsBaseline']})")
        print(f"   before {rev}: {_describe(old)}")
        print(f"   after:        {_describe(new)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
