"""Extract the reference pipeline's C1 test keys (split.testIds of the truth suite's refpipe C1 result, '<PersonID>:<period index>')
into c1_reference_test_keys.csv (person_id,period_index). usage: python -I extract_c1_test_keys.py <C1.json> <out.csv>"""
from __future__ import annotations

import json
import sys


def main(src: str, out: str) -> None:
    with open(src, encoding="utf-8") as fh:
        ids: list[str] = json.load(fh)["split"]["testIds"]
    if len(ids) != 1205:   # a real check: `python -O` strips asserts
        raise SystemExit(f"expected 1205 C1 test ids, got {len(ids)}")
    rows = sorted((i.rsplit(":", 1)[0].upper(), int(i.rsplit(":", 1)[1])) for i in ids)
    with open(out, "w", newline="") as fh:
        fh.write("person_id,period_index\n")
        for person, period in rows:
            fh.write(f"{person},{period}\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
