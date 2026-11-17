"""Build the C1 corpus fixture from the pinned MoreCheese generated corpus.

usage: python -I build_c1_corpus.py <more-cheese>/generated <person_years.parquet> <out-dir>

Writes one CSV per table plus SHA256SUMS. IDs are UUIDv5 under a fixed namespace, so a rebuild is byte-identical.
Every count asserted here is the reference's (ps-review evidence/07-reference-model.md:93, logs/P3/build.txt:11).
"""
from __future__ import annotations

import csv
import glob
import hashlib
import json
import os
import re
import sys
import uuid
from typing import Any

import pandas as pd

NS = uuid.UUID("5b3c9d0e-6f6a-4f51-9d0c-1c1f0c3a7e21")
PERIOD_RE = re.compile(r"-P(\d+)$")
Record = dict[str, Any]


def load(g: str, d: str) -> list[Record]:
    out: list[Record] = []
    for f in sorted(glob.glob(os.path.join(g, d, ".*.json"))):
        if not f.endswith(".mj-sync.json"):
            with open(f) as fh:
                out.extend(json.load(fh))
    return out


def day(s: str | None) -> str:
    return s[:10] if s else ""


def uid(*parts: str) -> str:
    return str(uuid.uuid5(NS, "|".join(parts))).upper()


def write(out: str, name: str, header: list[str], rows: list[list[str]]) -> None:
    for r in rows:
        for v in r:
            if any(c in v for c in ',"\n\r'):
                raise ValueError(f"{name}: value {v!r} needs quoting; the fixture format forbids it")
    with open(os.path.join(out, name), "w", newline="") as fh:
        w = csv.writer(fh, quoting=csv.QUOTE_NONE, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)


class CorpusCountMismatch(ValueError):
    """A built table's row count differs from the reference's (the fixture would not reproduce the gates)."""


def require_count(name: str, rows: list[list[str]], expected: int) -> None:
    if len(rows) != expected:
        raise CorpusCountMismatch(f"{name}: {len(rows)} rows, the reference has {expected}")


def build_orders(g: str) -> tuple[list[list[str]], list[list[str]], list[list[str]]]:
    """Order headers, final-valid dues periods (one per person and period) and confirmed non-dues lines."""
    sku = {p["primaryKey"]["ID"]: p["fields"]["SKU"] for p in load(g, "products")}
    orders = load(g, "orders")
    reversed_on = {o["fields"]["ReversesOrderHeaderID"]: day(o["fields"]["OrderDate"])
                   for o in orders if o["fields"].get("ReversesOrderHeaderID")}
    order_rows: list[list[str]] = []
    dues_rows: list[list[str]] = []
    nondues_rows: list[list[str]] = []
    seen_periods: set[tuple[str, int]] = set()
    for o in orders:
        f = o["fields"]
        oid = o["primaryKey"]["ID"]
        pid = f["BillToPersonID"]
        od = day(f["OrderDate"])
        order_rows.append([oid.upper(), pid.upper(), od, f["Status"], f["OrderType"], (f.get("ReversesOrderHeaderID") or "").upper(), reversed_on.get(oid, "")])
        is_sale_confirmed = f["Status"] == "Confirmed" and f["OrderType"] == "Sale" and not f.get("ReversesOrderHeaderID")
        final_valid = is_sale_confirmed and oid not in reversed_on
        for i, line in enumerate((o.get("collections") or {}).get("Lines", [])):
            s = sku.get(line["fields"]["ProductID"], "")
            if s.startswith("PROD-MEM"):
                m = PERIOD_RE.search(f["OrderNumber"] or "")
                if final_valid and m:
                    k = int(m.group(1))
                    if (pid, k) in seen_periods:
                        raise CorpusCountMismatch(f"duplicate period {k} for {pid}")
                    seen_periods.add((pid, k))
                    dues_rows.append([uid("dues", oid, str(i)), pid.upper(), str(k), od, s, oid.upper()])
            elif is_sale_confirmed:
                amount = float(line["fields"].get("LineTotalNet") or 0)
                nondues_rows.append([uid("line", oid, str(i)), pid.upper(), oid.upper(), od, f"{amount:.2f}", reversed_on.get(oid, "")])
    require_count("dues_periods", dues_rows, 6673)
    return order_rows, dues_rows, nondues_rows


def build_people(g: str, dues_rows: list[list[str]]) -> list[list[str]]:
    """One row per dues payer, with the profile's join date, segment and region."""
    profiles = {r["fields"]["PersonID"].upper(): r["fields"] for r in load(g, "member-profiles")}
    return [[p, day((profiles.get(p) or {}).get("JoinDate")), (profiles.get(p) or {}).get("Segment") or "",
             (profiles.get(p) or {}).get("Region") or ""] for p in sorted({r[1] for r in dues_rows})]


def build_activity(g: str) -> dict[str, list[list[str]]]:
    """The dated child tables the windowed aggregates read: attendances, completions, certifications, committees."""
    events = {e["primaryKey"]["ID"]: day(e["fields"]["EventDate"]) for e in load(g, "events")}
    return {
        "event_attendances": [[uid("att", r["primaryKey"]["ID"] if "ID" in r["primaryKey"] else r["fields"]["RegKey"]), r["fields"]["PersonID"].upper(), events[r["fields"]["EventID"]]]
                              for r in load(g, "event-registrations") if r["fields"].get("Attended") and events.get(r["fields"]["EventID"])],
        "course_completions": [[uid("course", r["fields"]["EnrollKey"]), r["fields"]["PersonID"].upper(), day(r["fields"]["CompletedOn"])]
                               for r in load(g, "enrollments") if r["fields"]["Status"] == "Completed" and r["fields"].get("CompletedOn")],
        "certifications": [[uid("cert", r["fields"]["MemberCertKey"]), r["fields"]["PersonID"].upper(), day(r["fields"].get("AwardedOn")), day(r["fields"].get("ExpiresOn"))]
                           for r in load(g, "member-certifications")],
        "committee_memberships": [[uid("cm", r["fields"]["PersonID"], str(i), r["fields"].get("StartDate") or ""), r["fields"]["PersonID"].upper(), day(r["fields"].get("StartDate")), day(r["fields"].get("EndDate"))]
                                  for i, r in enumerate(load(g, "committee-memberships"))],
    }


def build_keys(parquet: str) -> list[list[str]]:
    """The reference's 4,873 resolved person-year keys."""
    keys = pd.read_parquet(parquet, columns=["person_id", "period_index"])
    rows = [[str(p).upper(), str(int(k))] for p, k in zip(keys.person_id, keys.period_index)]
    require_count("person_years_keys", rows, 4873)
    return rows


def write_sums(out: str) -> None:
    with open(os.path.join(out, "SHA256SUMS"), "w") as fh:
        for name in sorted(n for n in os.listdir(out) if n.endswith(".csv")):
            with open(os.path.join(out, name), "rb") as b:
                fh.write(f"{hashlib.sha256(b.read()).hexdigest()}  {name}\n")


def main(g: str, parquet: str, out: str) -> None:
    os.makedirs(out, exist_ok=True)
    order_rows, dues_rows, nondues_rows = build_orders(g)
    people_rows = build_people(g, dues_rows)
    activity = build_activity(g)
    key_rows = build_keys(parquet)
    write(out, "people.csv", ["PersonID", "JoinDate", "Segment", "Region"], people_rows)
    write(out, "order_headers.csv", ["OrderID", "PersonID", "OrderDate", "Status", "OrderType", "ReversesOrderID", "ReversedOn"], order_rows)
    write(out, "dues_periods.csv", ["DuesPeriodID", "PersonID", "PeriodIndex", "OrderDate", "TierSKU", "OrderID"], dues_rows)
    write(out, "nondues_lines.csv", ["LineID", "PersonID", "OrderID", "OrderDate", "LineTotalNet", "ReversedOn"], nondues_rows)
    write(out, "event_attendances.csv", ["AttendanceID", "PersonID", "EventDate"], activity["event_attendances"])
    write(out, "course_completions.csv", ["CompletionID", "PersonID", "CompletedOn"], activity["course_completions"])
    write(out, "certifications.csv", ["CertificationID", "PersonID", "AwardedOn", "ExpiresOn"], activity["certifications"])
    write(out, "committee_memberships.csv", ["CommitteeMembershipID", "PersonID", "StartDate", "EndDate"], activity["committee_memberships"])
    write(out, "person_years_keys.csv", ["person_id", "period_index"], key_rows)
    write_sums(out)
    print(f"dues_periods={len(dues_rows)} people={len(people_rows)} orders={len(order_rows)} nondues_lines={len(nondues_rows)} "
          + " ".join(f"{k}={len(v)}" for k, v in activity.items()) + f" keys={len(key_rows)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
