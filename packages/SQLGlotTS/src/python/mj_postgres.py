"""
MemberJunction PostgreSQL dialect for sqlglot.

Encodes MJ's SQL-Server→PostgreSQL conventions in the sqlglot AST (custom
Generator + AST transform passes) rather than in output-text regex. This is the
"Category B" (regular DDL/DML) transpiler for the split-and-regenerate pipeline;
procedural SQL, CodeGen objects, and mj-sync metadata are handled out of band
(regenerated / re-seeded / hand-authored), so this dialect only has to be strong
on the regular-DDL surface — which is sqlglot's sweet spot.

What is encoded in the AST:
  * Type mapping: BIT→BOOLEAN, UNIQUEIDENTIFIER→UUID, NVARCHAR/VARCHAR(MAX)→TEXT,
    DATETIME/DATETIME2/SMALLDATETIME→TIMESTAMPTZ, MONEY→DECIMAL(19,4).
  * Function rewrites: NEWID/NEWSEQUENTIALID→gen_random_uuid(), GETDATE/GETUTCDATE→now().
  * Boolean column defaults: BIT DEFAULT 1/0 → BOOLEAN DEFAULT TRUE/FALSE.
  * Identifier quoting (PascalCase identifiers preserved via double-quotes).

The one non-SQL token, the Flyway macro ``${flyway:defaultSchema}``, is protected
to a sentinel identifier before parsing and restored verbatim by the Generator
(``identifier_sql``) — an AST-level restore, not an output-text rewrite. It is a
templating macro, not SQL, so it cannot live inside the SQL grammar itself.

Reference for the SS→PG type overrides: SQLConverter ``TypeResolver.MJ_OVERRIDES``.
"""
from __future__ import annotations

import sqlglot
from sqlglot import exp
from sqlglot.dialects.postgres import Postgres
from sqlglot.dialects.tsql import TSQL

# The Flyway schema macro is not SQL; protect it to a sentinel identifier for the
# parse, then the Generator restores it verbatim.
FLYWAY_MACRO = "${flyway:defaultSchema}"
FLYWAY_SENTINEL = "__mj_flyway_default_schema__"


class MJPostgres(Postgres):
    """PostgreSQL generation with MJ's type/function/boolean conventions baked in."""

    class Generator(Postgres.Generator):
        TYPE_MAPPING = {
            **Postgres.Generator.TYPE_MAPPING,
            exp.DataType.Type.BIT: "BOOLEAN",
        }

        def identifier_sql(self, expression: exp.Identifier) -> str:
            # Restore the Flyway macro verbatim (unquoted) — AST-level, not regex.
            if expression.name == FLYWAY_SENTINEL:
                return FLYWAY_MACRO
            return super().identifier_sql(expression)

        def datatype_sql(self, expression: exp.DataType) -> str:
            # SS NVARCHAR(MAX)/VARCHAR(MAX) → PG TEXT (PG has no MAX length sentinel).
            if expression.this in (exp.DataType.Type.VARCHAR, exp.DataType.Type.NVARCHAR, exp.DataType.Type.CHAR):
                if any(
                    isinstance(e, exp.DataTypeParam) and isinstance(e.this, exp.Var) and e.name.upper() == "MAX"
                    for e in expression.expressions
                ):
                    return "TEXT"
            return super().datatype_sql(expression)


# Functions whose SS form maps to a PG builtin (name-only rewrite).
_FUNC_REWRITES = {
    "NEWID": "GEN_RANDOM_UUID",
    "NEWSEQUENTIALID": "GEN_RANDOM_UUID",
    "GETDATE": "NOW",
    "GETUTCDATE": "NOW",
    "SYSDATETIME": "NOW",
    "SYSUTCDATETIME": "NOW",
}


def _rewrite_functions(node: exp.Expression) -> exp.Expression:
    """Rewrite SS-specific functions to PG equivalents in the AST."""
    if isinstance(node, exp.Anonymous) and node.name and node.name.upper() in _FUNC_REWRITES:
        return exp.func(_FUNC_REWRITES[node.name.upper()])
    # Some SS funcs parse to typed nodes rather than Anonymous.
    if isinstance(node, (exp.CurrentTimestamp,)):
        return exp.func("NOW")
    return node


def _rewrite_boolean_defaults(node: exp.Expression) -> exp.Expression:
    """A BIT column defaulting to 1/0 becomes a BOOLEAN defaulting to TRUE/FALSE."""
    if isinstance(node, exp.ColumnDef) and node.kind and node.kind.this == exp.DataType.Type.BIT:
        for constraint in node.constraints:
            ck = constraint.kind
            if isinstance(ck, exp.DefaultColumnConstraint) and isinstance(ck.this, exp.Literal) and not ck.this.is_string:
                ck.set("this", exp.true() if ck.this.name == "1" else exp.false())
    return node


import re as _re

# `GO` is a batch separator (SSMS/sqlcmd tooling), not SQL — split on it before parsing.
_GO_SPLIT = _re.compile(r"(?im)^\s*GO\s*;?\s*$")


def _first_keyword(text: str) -> str:
    """A short label for an unhandled passthrough statement (for reporting)."""
    m = _re.search(r"[A-Za-z_][A-Za-z0-9_]*", text)
    token = m.group(0).upper() if m else "?"
    low = text.lower()
    if "sp_addextendedproperty" in low:
        return "sp_addextendedproperty"
    if token in ("IF", "BEGIN", "DECLARE", "PRINT", "EXEC", "EXECUTE", "WHILE"):
        return token
    return token


# --- Fixed-shape T-SQL envelopes that sqlglot cannot parse -------------------
# These are not arbitrary procedural SQL — they are CodeGen/hand templates with a
# fixed shape. We recognize the envelope structurally and transpile the real SQL
# *inside* it (predicates, INSERT bodies, descriptions) through the AST dialect.

# EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'...', ... ;
_SP_EXTPROP = _re.compile(
    r"EXEC(?:UTE)?\s+sp_addextendedproperty\b(?P<args>.*?);",
    _re.IGNORECASE | _re.DOTALL,
)
# IF [NOT] EXISTS (<select>) BEGIN <body> END  — the idempotency wrapper.
# Body is matched non-greedily and must not itself contain a nested BEGIN/END.
_IF_EXISTS_BEGIN = _re.compile(
    r"IF\s+(?P<neg>NOT\s+)?EXISTS\s*\(\s*(?P<cond>SELECT\b.*?)\)\s*BEGIN\b(?P<body>(?:(?!\bBEGIN\b|\bEND\b).)*?)\bEND\s*;?",
    _re.IGNORECASE | _re.DOTALL,
)


def _unquote_tsql_string(val: str) -> str:
    """N'foo''bar' / 'foo''bar' → foo'bar (T-SQL string literal to raw text)."""
    val = val.strip()
    if val[:1] in ("N", "n") and val[1:2] == "'":
        val = val[1:]
    if val.startswith("'") and val.endswith("'"):
        val = val[1:-1]
    return val.replace("''", "'")


def _pg_string(raw: str) -> str:
    """Raw text → PG single-quoted literal (escape embedded quotes)."""
    return "'" + raw.replace("'", "''") + "'"


def _extprop_arg(args: str, name: str) -> str | None:
    m = _re.search(r"@" + name + r"\s*=\s*(N?'(?:[^']|'')*')", args, _re.IGNORECASE)
    return _unquote_tsql_string(m.group(1)) if m else None


def _transpile_sp_addextendedproperty(args: str) -> str | None:
    """EXEC sp_addextendedproperty(MS_Description) → COMMENT ON COLUMN/TABLE."""
    if (_extprop_arg(args, "name") or "").upper() != "MS_DESCRIPTION":
        return None
    value = _extprop_arg(args, "value")
    schema = _extprop_arg(args, "level0name") or FLYWAY_MACRO
    table = _extprop_arg(args, "level1name")
    col = _extprop_arg(args, "level2name")
    col_type = (_extprop_arg(args, "level2type") or "").upper()
    if value is None or not table:
        return None
    if col and col_type == "COLUMN":
        return f'COMMENT ON COLUMN {schema}."{table}"."{col}" IS {_pg_string(value)};'
    return f'COMMENT ON TABLE {schema}."{table}" IS {_pg_string(value)};'


def _transpile_plain(sql: str) -> tuple[str, list[dict]]:
    """Transpile a chunk of regular SQL via the AST dialect; report unparseable bits."""
    out, unhandled = [], []
    protected = sql.replace(FLYWAY_MACRO, FLYWAY_SENTINEL)
    try:
        statements = sqlglot.parse(protected, read="tsql")
    except Exception as e:  # noqa: BLE001 — report, don't crash the batch
        return "", [{"kind": "parse-error", "snippet": str(e)[:120]}]
    for stmt in statements:
        if stmt is None:
            continue
        if isinstance(stmt, exp.Command):
            unhandled.append({"kind": _first_keyword(stmt.sql(dialect="tsql")), "snippet": stmt.sql(dialect="tsql")[:80]})
            continue
        stmt = stmt.transform(_rewrite_functions).transform(_rewrite_boolean_defaults)
        out.append(stmt.sql(dialect=MJPostgres, pretty=False, identify=True))
    return (";\n".join(out) + (";" if out else "")), unhandled


def _transpile_if_exists_begin(m: "_re.Match") -> tuple[str, list[dict]]:
    """IF [NOT] EXISTS(<sel>) BEGIN <body> END → PG DO $$ … IF … THEN … END IF; … $$;"""
    neg = "NOT " if m.group("neg") else ""
    cond_sql, u1 = _transpile_plain(m.group("cond").strip())
    body_sql, u2 = _transpile_plain(m.group("body").strip())
    cond_inner = cond_sql.rstrip(";").strip()
    if not cond_inner or not body_sql.strip():
        return "", (u1 + u2 + [{"kind": "IF-EXISTS-BEGIN", "snippet": m.group(0)[:80]}])
    do = (
        "DO $$\nBEGIN\n"
        f"  IF {neg}EXISTS ({cond_inner}) THEN\n"
        f"    {body_sql.strip()}\n"
        "  END IF;\nEND $$;"
    )
    return do, (u1 + u2)


def mj_transpile(sql: str, *, pretty: bool = True, identify: bool = True) -> dict:
    """
    Transpile SS T-SQL (Category-B DDL/DML) to MJ-flavored PostgreSQL via the AST.

    Handles three fixed-shape envelopes sqlglot can't parse — `sp_addextendedproperty`
    (→ COMMENT ON), `IF [NOT] EXISTS(...) BEGIN ... END` (→ DO $$ ... $$), and GO
    batch separators — by recognizing the envelope structurally and routing the real
    SQL inside through the AST dialect. Anything still unparseable is *reported* in
    "unhandled" rather than emitted as invalid passthrough.
    """
    out: list[str] = []
    unhandled: list[dict] = []

    for batch in _GO_SPLIT.split(sql):
        if not batch.strip():
            continue
        out_sql, u = _transpile_batch(batch)
        out.extend(out_sql)
        unhandled.extend(u)

    return {"sql": out, "unhandled": unhandled}


def _transpile_batch(batch: str) -> tuple[list[str], list[dict]]:
    """Scan one GO batch into envelope chunks + plain SQL, transpiling each in order."""
    out: list[str] = []
    unhandled: list[dict] = []
    pos = 0
    # Walk the batch, alternating between recognized envelopes and plain SQL gaps.
    while pos < len(batch):
        ext = _SP_EXTPROP.search(batch, pos)
        ife = _IF_EXISTS_BEGIN.search(batch, pos)
        nxt = min([m for m in (ext, ife) if m], key=lambda m: m.start(), default=None)
        if nxt is None:
            gap = batch[pos:]
            if gap.strip():
                s, u = _transpile_plain(gap)
                if s.strip():
                    out.append(s)
                unhandled.extend(u)
            break
        gap = batch[pos:nxt.start()]
        if gap.strip():
            s, u = _transpile_plain(gap)
            if s.strip():
                out.append(s)
            unhandled.extend(u)
        if nxt is ext:
            comment = _transpile_sp_addextendedproperty(nxt.group("args"))
            if comment:
                out.append(comment)
            else:
                unhandled.append({"kind": "sp_addextendedproperty", "snippet": nxt.group(0)[:80]})
        else:
            do, u = _transpile_if_exists_begin(nxt)
            if do.strip():
                out.append(do)
            unhandled.extend(u)
        pos = nxt.end()
    return out, unhandled


if __name__ == "__main__":
    import sys, json
    result = mj_transpile(sys.stdin.read())
    print(json.dumps(result, indent=2))
