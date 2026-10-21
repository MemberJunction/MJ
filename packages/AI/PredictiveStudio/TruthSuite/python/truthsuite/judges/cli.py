"""CLI dispatch for TruthSuite judges (`python -m truthsuite.judges.cli <judge> ...`, JSON on stdout)."""
from __future__ import annotations

import json
import sys
from collections.abc import Sequence

from truthsuite.judges import delong, holdout_rebuild, judge, judge_multiclass, scenarios, verdicts


def main(argv: Sequence[str]) -> int:
    if not argv:
        raise SystemExit("usage: python -m truthsuite.judges.cli <holdout_rebuild|judge|judge_multiclass|delong|verdicts|scenarios> [args...]")
    name, rest = argv[0], list(argv[1:])
    if name == "holdout_rebuild":
        return holdout_rebuild.main(rest)
    if name == "judge":
        pos, kw = judge.parse_cli(rest)
        judge.main(pos[0], pos[1], pos[2], kw.get("label"), kw.get("regime"), kw.get("selected", "true").lower() == "true", kw.get("out-dir"))
        return 0
    if name == "judge_multiclass":
        pos, kw = judge.parse_cli(rest)
        judge_multiclass.main(pos[0], pos[1], pos[2], kw.get("label"), kw.get("regime"), kw.get("selected", "true").lower() == "true", kw.get("out-dir"))
        return 0
    if name == "delong":
        _, kw = judge.parse_cli(rest)
        print(json.dumps(delong.main(kw.get("results-dir")), indent=1))
        return 0
    if name == "verdicts":
        _, kw = judge.parse_cli(rest)
        print(json.dumps(verdicts.main(kw.get("results-dir"), kw.get("data-dir")), indent=1))
        return 0
    if name == "scenarios":
        return scenarios.main(rest)
    raise SystemExit(f"Unknown judge module: {name}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
