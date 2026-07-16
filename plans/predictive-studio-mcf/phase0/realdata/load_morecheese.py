"""
Load the More Cheese Demo V2 bulk SQL (BlueCypress/morecheesev2, dev branch,
SQL Scripts/morecheese-bulk/*.sql) into pandas DataFrames.

These are T-SQL `INSERT ... SELECT ... FROM (VALUES (...),(...)) AS v (cols)`
scripts. We parse the column list from the trailing `AS v (...)` clause and the
data tuples from the VALUES block, respecting N'...' unicode strings with ''
escaping and NULL. No DB required — this is Phase-0 throwaway-grade, on purpose.

The point: a REAL association schema (member / membership-period / events /
courses / orders / payments) with plausible-but-synthetic records — the
"realistic association dataset" the Phase-0 gate names, to re-check the
composition bets (V2/V3) off the planted generators.
"""
from __future__ import annotations
import re
from pathlib import Path
import pandas as pd

RAW = Path(__file__).resolve().parent / "raw"

FILES = {
    "Organization": "01-Organization.sql",
    "Person": "02-Person.sql",
    "MembershipPeriod": "03-MembershipPeriod.sql",
    "Event": "04-Event.sql",
    "EventRegistration": "05-EventRegistration.sql",
    "Course": "06-Course.sql",
    "CourseEnrollment": "07-CourseEnrollment.sql",
    "Product": "08-Product.sql",
    "Order": "09-Order.sql",
    "OrderLine": "10-OrderLine.sql",
    "Payment": "11-Payment.sql",
}


def _parse_tuple(body: str) -> list:
    """Parse a single VALUES tuple body (contents between the outer parens),
    respecting N'...' strings with '' escapes, NULL, ints and floats."""
    out, i, n = [], 0, len(body)
    while i < n:
        # skip whitespace/commas
        while i < n and body[i] in " ,\t\r\n":
            i += 1
        if i >= n:
            break
        # N'...' or '...'
        if body[i] == "N" and i + 1 < n and body[i + 1] == "'":
            i += 2
            start = i
            buf = []
            while i < n:
                if body[i] == "'":
                    if i + 1 < n and body[i + 1] == "'":  # escaped quote
                        buf.append("'")
                        i += 2
                        continue
                    break
                buf.append(body[i])
                i += 1
            out.append("".join(buf))
            i += 1  # closing quote
        elif body[i] == "'":
            i += 1
            buf = []
            while i < n:
                if body[i] == "'":
                    if i + 1 < n and body[i + 1] == "'":
                        buf.append("'")
                        i += 2
                        continue
                    break
                buf.append(body[i])
                i += 1
            out.append("".join(buf))
            i += 1
        else:
            start = i
            while i < n and body[i] not in ",)":
                i += 1
            tok = body[start:i].strip()
            if tok.upper() == "NULL":
                out.append(None)
            else:
                try:
                    out.append(int(tok))
                except ValueError:
                    try:
                        out.append(float(tok))
                    except ValueError:
                        out.append(tok)
    return out


def _split_top_tuples(values_block: str) -> list[str]:
    """Split a VALUES block into top-level parenthesised tuples, ignoring
    parens inside strings."""
    tuples, depth, i, n, start = [], 0, 0, len(values_block), None
    in_str = False
    while i < n:
        c = values_block[i]
        if in_str:
            if c == "'":
                if i + 1 < n and values_block[i + 1] == "'":
                    i += 2
                    continue
                in_str = False
            i += 1
            continue
        if c == "'":
            in_str = True
            i += 1
            continue
        if c == "(":
            if depth == 0:
                start = i + 1
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0 and start is not None:
                tuples.append(values_block[start:i])
                start = None
        i += 1
    return tuples


def load_table(name: str) -> pd.DataFrame:
    text = (RAW / FILES[name]).read_text(encoding="utf-8")
    # column names from the trailing "AS v ([Col], [Col], ...)"
    m = re.search(r"\)\s*AS\s+v\s*\(([^)]*)\)", text, re.IGNORECASE)
    cols = [c.strip().strip("[]") for c in m.group(1).split(",")]
    # ALL VALUES batches (T-SQL splits large inserts into multiple
    # `FROM (VALUES ...) AS v` blocks — capture every one, not just the first).
    blocks = re.findall(r"FROM\s*\(VALUES(.*?)\)\s*AS\s+v", text, re.IGNORECASE | re.DOTALL)
    rows = []
    for block in blocks:
        for t in _split_top_tuples(block):
            rows.append(_parse_tuple(t))
    rows = [r for r in rows if len(r) == len(cols)]
    df = pd.DataFrame(rows, columns=cols)
    return df


def load_all() -> dict[str, pd.DataFrame]:
    tables = {}
    for name in FILES:
        df = load_table(name)
        tables[name] = df
    return tables


if __name__ == "__main__":
    tables = load_all()
    for name, df in tables.items():
        print(f"{name:20s} {len(df):6d} rows  cols={list(df.columns)}")
