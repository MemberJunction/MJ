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

import json as _json
import os as _os
import sqlglot
from sqlglot import exp
from sqlglot.dialects.postgres import Postgres
from sqlglot.dialects.tsql import TSQL

# sqlglot's node type for a T-SQL `IF …` statement varies across versions — `exp.If` in
# older releases, `exp.IfBlock` only from 29.0.0. The committed pin (requirements.txt,
# sqlglot~=27.18.0) has NO IfBlock, so a bare `exp.IfBlock` attribute access would raise
# AttributeError on every statement reaching the plain-SQL path. Resolve whichever names
# exist ONCE at import, so the isinstance guard is version-tolerant (issue #3252 review).
_IF_NODE_TYPES = tuple(t for t in (getattr(exp, "If", None), getattr(exp, "IfBlock", None)) if t is not None)

# The Flyway schema macro is not SQL; protect it to a sentinel identifier for the
# parse, then the Generator restores it verbatim.
FLYWAY_MACRO = "${flyway:defaultSchema}"
FLYWAY_SENTINEL = "__mj_flyway_default_schema__"


class MJPostgres(Postgres):
    """PostgreSQL generation with MJ's type/function/boolean conventions baked in."""

    class Generator(Postgres.Generator):
        TRANSFORMS = {
            **Postgres.Generator.TRANSFORMS,
            # SS JSON_VALUE(col,'$.path') → JSONExtractScalar. PG's default
            # JSON_EXTRACT_PATH_TEXT needs a json arg, but MJ stores JSON in text
            # columns; cast to jsonb and use ->> (single key) / #>> (nested).
            exp.JSONExtractScalar: lambda self, e: _json_extract_scalar_sql(self, e),
        }
        TYPE_MAPPING = {
            **Postgres.Generator.TYPE_MAPPING,
            exp.DataType.Type.BIT: "BOOLEAN",
            # SS date/time types are tz-aware in MJ (oracle stores them as
            # `timestamp with time zone`); sqlglot otherwise defaults to plain TIMESTAMP.
            exp.DataType.Type.DATETIME: "TIMESTAMPTZ",
            exp.DataType.Type.DATETIME2: "TIMESTAMPTZ",
            exp.DataType.Type.SMALLDATETIME: "TIMESTAMPTZ",
            # SS currency types: PG's MONEY is locale-dependent and SMALLMONEY isn't a
            # PG type at all; match codegen's regenerated schema (DECIMAL with SS scale).
            exp.DataType.Type.MONEY: "DECIMAL(19, 4)",
            exp.DataType.Type.SMALLMONEY: "DECIMAL(10, 4)",
        }

        def identifier_sql(self, expression: exp.Identifier) -> str:
            # Restore the Flyway macro verbatim (unquoted) — AST-level, not regex.
            if expression.name == FLYWAY_SENTINEL:
                return FLYWAY_MACRO
            return super().identifier_sql(expression)

        def literal_sql(self, expression: exp.Literal) -> str:
            # The macro is protected to the sentinel by a blanket text replace before the
            # parse, so it also gets baked into the *content* of string literals — e.g. the
            # Entity.SchemaName seed value `'${flyway:defaultSchema}'`, or a schema qualifier
            # embedded in a stored RowLevelSecurityFilter predicate. `identifier_sql` only
            # restores the macro in identifier position; string-literal content never passes
            # through it, so restore the sentinel here too (substring, since it may be a
            # qualifier inside a larger predicate string). AST-level, not an output rewrite.
            if expression.is_string and expression.this and FLYWAY_SENTINEL in expression.this:
                restored = expression.this.replace(FLYWAY_SENTINEL, FLYWAY_MACRO)
                return f"{self.dialect.QUOTE_START}{self.escape_str(restored)}{self.dialect.QUOTE_END}"
            return super().literal_sql(expression)

        def datatype_sql(self, expression: exp.DataType) -> str:
            has_max = any(
                isinstance(e, exp.DataTypeParam) and isinstance(e.this, exp.Var) and e.name.upper() == "MAX"
                for e in expression.expressions
            )
            # SS NVARCHAR(MAX)/VARCHAR(MAX) → PG TEXT (PG has no MAX length sentinel).
            if has_max and expression.this in (exp.DataType.Type.VARCHAR, exp.DataType.Type.NVARCHAR, exp.DataType.Type.CHAR):
                return "TEXT"
            # SS VARBINARY/BINARY(MAX|n) → PG BYTEA (takes no length modifier).
            if expression.this in (exp.DataType.Type.VARBINARY, exp.DataType.Type.BINARY):
                return "BYTEA"
            # SS FLOAT[(n)]: n<=24 is 4-byte (REAL), n>24 or bare is 8-byte (DOUBLE
            # PRECISION). sqlglot maps bare FLOAT→REAL, narrowing to 4-byte; correct it.
            if expression.this in (exp.DataType.Type.FLOAT, exp.DataType.Type.DOUBLE):
                params = [e for e in expression.expressions if isinstance(e, exp.DataTypeParam)]
                precision = None
                if params and isinstance(params[0].this, exp.Literal) and not params[0].this.is_string:
                    precision = int(params[0].name)
                return "REAL" if (precision is not None and precision <= 24) else "DOUBLE PRECISION"
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


# SS principal/session functions → PG CURRENT_USER (emitted bare, no parens).
# (SUSER_NAME/SUSER_SNAME already parse to exp.CurrentUser in sqlglot; USER_NAME
# parses to an Anonymous func and needs the explicit rewrite. These show up in
# column DEFAULTs — left untranslated they fail the whole CREATE TABLE.)
_CURRENT_USER_FUNCS = {"USER_NAME", "SUSER_NAME", "SUSER_SNAME", "CURRENT_USER", "SESSION_USER"}


def _rewrite_functions(node: exp.Expression) -> exp.Expression:
    """Rewrite SS-specific functions to PG equivalents in the AST."""
    if isinstance(node, exp.Anonymous) and node.name:
        upper = node.name.upper()
        if upper in _CURRENT_USER_FUNCS:
            return exp.CurrentUser()
        if upper in _FUNC_REWRITES:
            return exp.func(_FUNC_REWRITES[upper])
    # Some SS funcs parse to typed nodes rather than Anonymous. SYSDATETIMEOFFSET()
    # parses to CurrentTimestampLTZ; GETDATE() to CurrentTimestamp.
    if isinstance(node, (exp.CurrentTimestamp, exp.CurrentTimestampLTZ)):
        return exp.func("NOW")
    return node


def _rewrite_string_concat(node: exp.Expression) -> exp.Expression:
    """T-SQL string concatenation with `+` → PG `||`. Only when an operand is clearly
    a string (literal, N'...', or an already-rewritten `||` chain), so numeric `a + b`
    is left alone. Post-order traversal handles chains (`'a' + b + 'c'`) innermost-first."""
    if isinstance(node, exp.Add):
        def is_strish(x: exp.Expression) -> bool:
            return isinstance(x, (exp.National, exp.DPipe)) or (isinstance(x, exp.Literal) and x.is_string)
        if is_strish(node.left) or is_strish(node.right):
            return exp.DPipe(this=node.left, expression=node.right)
    return node


def _json_extract_scalar_sql(self, expression: exp.JSONExtractScalar) -> str:
    """JSONExtractScalar (from SS JSON_VALUE) → `(col::jsonb) ->> 'key'` (single path)
    or `(col::jsonb) #>> '{a,b}'` (nested). Casting to jsonb lets it work on the text
    columns MJ stores JSON in (PG's JSON_EXTRACT_PATH_TEXT requires a real json arg)."""
    this = self.sql(expression, "this")
    path = expression.expression
    # Skip the `$` root element (empty name) — keep only the key/segment names.
    parts = [p.name for p in path.expressions if p.name] if isinstance(path, exp.JSONPath) else None
    if parts and len(parts) > 1:
        return f"(({this})::jsonb #>> '{{{','.join(parts)}}}')"
    key = parts[0] if parts else (path.name if path else "")
    return f"(({this})::jsonb ->> '{key}')"


def _rewrite_insert_booleans(node: exp.Expression) -> exp.Expression:
    """In `INSERT INTO t (…cols…) VALUES (…)`, coerce 1/0 → TRUE/FALSE for any column
    known to be BIT/BOOLEAN (file-level + MJ_EXTRA_BIT_COLS registry). SS seeds bit
    columns with 1/0; PG won't implicitly cast integer → boolean, so the INSERT aborts."""
    if not isinstance(node, exp.Insert) or not isinstance(node.this, exp.Schema):
        return node
    tbl = node.this.this
    tname = tbl.name.lower() if isinstance(tbl, exp.Table) else None
    if not tname:
        return node
    cols = [c.name.lower() for c in node.this.expressions]
    bool_pos = [i for i, c in enumerate(cols) if (tname, c) in _BIT_COLS]
    if not bool_pos:
        return node
    values = node.expression
    if not isinstance(values, exp.Values):
        return node
    for tup in values.expressions:
        if not isinstance(tup, exp.Tuple):
            continue
        for i in bool_pos:
            if i < len(tup.expressions):
                v = tup.expressions[i]
                if isinstance(v, exp.Literal) and not v.is_string and v.name in ("0", "1"):
                    tup.set("expressions", [
                        (exp.true() if v.name == "1" else exp.false()) if j == i else e
                        for j, e in enumerate(tup.expressions)
                    ])
    return node


def _is_isjson(node: exp.Expression) -> bool:
    return isinstance(node, exp.Anonymous) and (node.name or "").upper() == "ISJSON"


def _contains_isjson_call(node: exp.Expression) -> bool:
    """True if `node`'s subtree contains a genuine ISJSON(...) call. Distinguishes the CHECK
    predicate `ISJSON(x)` from a column merely NAMED `IsJsonEnabled` or the string literal
    'ISJSON' — neither parses to an exp.Anonymous, so a substring match would false-drop them
    (issue #3252 review). See _is_isjson."""
    return any(_is_isjson(n) for n in node.find_all(exp.Anonymous))


def _rewrite_isjson_eq(node: exp.Expression) -> exp.Expression:
    """SS `ISJSON(x) = 1` / `ISJSON(x) = 0` → PG `x IS JSON` / `x IS NOT JSON`.
    PG has no ISJSON function; it has the SQL:2016 `IS JSON` predicate (PG16+)."""
    if isinstance(node, exp.EQ) and _is_isjson(node.this) and isinstance(node.expression, exp.Literal):
        arg = node.this.expressions[0]
        is_json = exp.Is(this=arg.copy(), expression=exp.JSON())
        return exp.Not(this=is_json) if node.expression.name == "0" else is_json
    return node


def _rewrite_isjson_bare(node: exp.Expression) -> exp.Expression:
    """Bare `ISJSON(x)` predicate (not compared to 1/0) → `x IS JSON`."""
    if _is_isjson(node):
        return exp.Is(this=node.expressions[0].copy(), expression=exp.JSON())
    return node


def _is_outer_join(join: exp.Join) -> bool:
    """True for LEFT/RIGHT/FULL (or explicit OUTER) joins."""
    return (join.side or "").upper() in ("LEFT", "RIGHT", "FULL") or (join.kind or "").upper() == "OUTER"


# sqlglot stores the UPDATE…FROM clause under the `from_` arg key (older versions used
# `from`). Resolve the live key once so the self-aliased-UPDATE rewrite keeps working across
# sqlglot upgrades — a silent miss here leaves `UPDATE alias …` which PG rejects (`relation
# "alias" does not exist`).
_UPDATE_FROM_KEY = "from_" if "from_" in exp.Update.arg_types else "from"


def _update_alias_outer_join(stmt: exp.Update) -> bool:
    """True when the self-aliased `UPDATE alias … FROM Target AS alias JOIN …` shape uses
    a LEFT/RIGHT/FULL join. `_rewrite_update_from_alias` moves join ON conditions into
    WHERE, which is only sound for INNER joins — an outer-join anti-join (`LEFT JOIN o …
    WHERE o.ID IS NULL`) would silently become inner-join semantics and update zero rows.
    There is no safe mechanical PG rewrite, so these are reported as unhandled instead."""
    frm = stmt.args.get(_UPDATE_FROM_KEY)
    tgt = stmt.this
    if not frm or not isinstance(frm.this, exp.Table) or not isinstance(tgt, exp.Table):
        return False
    base = frm.this
    joins = base.args.get("joins") or []
    if not base.alias or tgt.name != base.alias or not joins:
        return False
    return any(_is_outer_join(j) for j in joins)


def _rewrite_update_from_alias(node: exp.Expression) -> exp.Expression:
    """SS `UPDATE alias SET alias.c = … FROM Target AS alias [JOIN Other o ON j] WHERE w`
    → PG `UPDATE Target AS alias SET c = … FROM Other o WHERE j AND w`.
    PG forbids naming the target via an alias defined in FROM and forbids the alias
    qualifier on SET targets; the target's join condition must move to WHERE.
    INNER joins only — outer joins are routed to unhandled upstream (see
    `_update_alias_outer_join`)."""
    if not isinstance(node, exp.Update):
        return node
    frm = node.args.get(_UPDATE_FROM_KEY)
    tgt = node.this
    if not frm or not isinstance(frm.this, exp.Table) or not isinstance(tgt, exp.Table):
        return node
    base = frm.this
    base_alias = base.alias
    joins = base.args.get("joins") or []
    if not base_alias or tgt.name != base_alias or not joins:
        return node  # only the self-aliased-target + join shape
    if any(_is_outer_join(j) for j in joins):
        return node  # moving an outer ON to WHERE changes semantics — handled upstream
    # target ← the real FROM base table (alias preserved), stripped of its joins
    new_target = base.copy()
    new_target.set("joins", None)
    node.set("this", new_target)
    # ALL join ON conditions → WHERE; the joined tables become the new FROM. The
    # extra joins keep only their table source (CROSS JOIN) so their predicate isn't
    # duplicated between FROM and WHERE — WHERE alone carries it (inner semantics).
    conds = [j.args["on"].copy() for j in joins if j.args.get("on")]
    first = joins[0].this.copy()
    if len(joins) > 1:
        extra = []
        for j in joins[1:]:
            jc = j.copy()
            jc.set("on", None)
            jc.set("side", None)
            jc.set("kind", "CROSS")
            extra.append(jc)
        first.set("joins", extra)
    node.set(_UPDATE_FROM_KEY, exp.From(this=first))
    existing = node.args["where"].this if node.args.get("where") else None
    clauses = conds + ([existing] if existing else [])
    if clauses:
        combined = clauses[0]
        for c in clauses[1:]:
            combined = exp.And(this=combined, expression=c)
        node.set("where", exp.Where(this=combined))
    # strip the target-alias qualifier from SET LHS (PG: SET col = …, not alias.col = …)
    for assign in node.expressions:
        lhs = assign.this if isinstance(assign, exp.EQ) else None
        if isinstance(lhs, exp.Column) and lhs.table == base_alias:
            lhs.set("table", None)
    return node


# Cross-statement BIT-column registry, keyed (table_lower, column_lower). Built once
# per transpile pass by `_collect_bit_columns` because a `CHECK (BitCol = 1)` often lives
# in a separate `ALTER TABLE … ADD CONSTRAINT` whose target column was declared BIT in an
# earlier CREATE TABLE / ALTER ADD COLUMN batch (so single-statement context isn't enough).
_BIT_COLS: set[tuple[str, str]] = set()


def _table_name_of(stmt: exp.Expression) -> str | None:
    """Lower-cased name of the table a CREATE/ALTER/UPDATE/DELETE statement targets, if any.

    DML (UPDATE/DELETE) is included so the boolean-int rewriter can resolve a statement's
    target table against the BIT-column registry and coerce `bitcol = 1/0` → `TRUE/FALSE`
    in SET assignments and WHERE predicates — not just in CREATE/ALTER CHECK constraints.
    For UPDATE/DELETE the target lives in `stmt.this`; if that is an aliased subtree we fall
    back to the first Table node."""
    if isinstance(stmt, exp.Create):
        t = stmt.this.find(exp.Table) if stmt.this else None
    elif isinstance(stmt, (exp.Alter, exp.Update, exp.Delete)):
        t = stmt.this if isinstance(stmt.this, exp.Table) else stmt.find(exp.Table)
    else:
        t = None
    return t.name.lower() if isinstance(t, exp.Table) and t.name else None


def _collect_bit_columns(sql: str) -> set[tuple[str, str]]:
    """One pass over the whole file collecting (table, column) for every BIT column
    declared in a CREATE TABLE or ALTER ADD COLUMN — used to resolve boolean CHECKs
    that sit in separate ALTER statements."""
    out: set[tuple[str, str]] = set()
    protected = sql.replace(FLYWAY_MACRO, FLYWAY_SENTINEL)
    # Parse per GO batch via the resilient splitter — a single unparseable statement
    # (common in baselines) must only drop itself, not wipe the registry for every
    # other table declared in the same batch.
    for batch in _GO_SPLIT.split(protected):
        if not batch.strip():
            continue
        for st, _raw in _parse_resilient(batch):
            if st is None:
                continue
            tbl = _table_name_of(st)
            if not tbl:
                continue
            for cd in st.find_all(exp.ColumnDef):
                if cd.kind is not None and cd.kind.this in (exp.DataType.Type.BIT, exp.DataType.Type.BOOLEAN):
                    out.add((tbl, cd.name.lower()))
    return out


def _boolean_columns_for(stmt: exp.Expression) -> set[str]:
    """Lower-cased names of columns in scope for `stmt` that are BIT/BOOLEAN: those declared
    in the statement itself, plus the `_BIT_COLS` registry entries (file-level declarations +
    cross-file baselines) for the statement's target table. Shared by the coercion pass and
    the residual self-check so both reason about the same type set."""
    cols = {
        cd.name.lower()
        for cd in stmt.find_all(exp.ColumnDef)
        if cd.kind is not None and cd.kind.this in (exp.DataType.Type.BIT, exp.DataType.Type.BOOLEAN)
    }
    tbl = _table_name_of(stmt)
    if tbl:
        cols |= {col for (t, col) in _BIT_COLS if t == tbl}
    return cols


def _unwrap_paren(x: exp.Expression) -> exp.Expression:
    while isinstance(x, exp.Paren):  # SS wraps the literal in parens: `IsActive = (1)`
        x = x.this
    return x


def _bool_literal(node: exp.Expression):
    """The paren-unwrapped node as exp.true()/false() if it is a `0`/`1` integer literal,
    else None. Used to decide whether a comparand should be coerced to a PG boolean."""
    node = _unwrap_paren(node)
    if isinstance(node, exp.Literal) and not node.is_string and node.name in ("0", "1"):
        return exp.true() if node.name == "1" else exp.false()
    return None


def _is_bool_col(node: exp.Expression, bool_cols: set[str]) -> bool:
    node = _unwrap_paren(node)
    return isinstance(node, exp.Column) and node.name.lower() in bool_cols


def _rewrite_boolean_int_comparisons(stmt: exp.Expression) -> exp.Expression:
    """Coerce `<bitcol> <op> 0/1` → `<bitcol> <op> TRUE/FALSE` for any column known to be
    BIT/BOOLEAN, in ANY syntactic context — CHECK, WHERE, SET assignment, JOIN ON — and across
    `=`, `<>`/`!=`, and `IN (…)`. After BIT→BOOLEAN, a `boolean = integer` comparison/assignment
    is a PG type error that aborts the statement; this is the single type-driven pass that
    prevents it everywhere rather than per-construct. Type-aware via `_boolean_columns_for`, so
    genuine integer columns (`Priority = 1`) are never touched."""
    bool_cols = _boolean_columns_for(stmt)
    if not bool_cols:
        return stmt

    def fix(node: exp.Expression) -> exp.Expression:
        # Equality / inequality, either operand order: `col = 1`, `0 <> col`, `col != 1`.
        if isinstance(node, (exp.EQ, exp.NEQ)):
            left, right = node.this, node.expression
            if _is_bool_col(left, bool_cols):
                lit = _bool_literal(right)
                if lit is not None:
                    return node.__class__(this=left, expression=lit)
            elif _is_bool_col(right, bool_cols):
                lit = _bool_literal(left)
                if lit is not None:
                    return node.__class__(this=lit, expression=right)
            return node
        # Set membership: `col IN (0, 1)` → `col IN (FALSE, TRUE)` (coerce only the 0/1 elems).
        if isinstance(node, exp.In) and _is_bool_col(node.this, bool_cols):
            exprs = node.args.get("expressions")
            if exprs:
                node.set("expressions", [(_bool_literal(e) or e) for e in exprs])
            return node
        return node

    return stmt.transform(fix)


def _residual_boolean_int(stmt: exp.Expression) -> list[str]:
    """Self-check: after coercion + the full rewrite pipeline, find any surviving
    `<bitcol> <op> 0/1` comparison/membership the coercion pass did not eliminate (e.g. an
    operator/shape it doesn't model — CASE switch, BETWEEN). These are exactly the
    `boolean = integer` errors that abort a PG migration, so they are surfaced as conversion
    gaps rather than emitted silently — making the converter's gap count behavioral, not just
    syntactic. Returns SQL snippets of each offending node."""
    bool_cols = _boolean_columns_for(stmt)
    if not bool_cols:
        return []
    hits: list[str] = []
    for node in stmt.walk():
        # Comparisons + membership the coercion pass targets (defence-in-depth — should be
        # empty after coercion, but proves it).
        if isinstance(node, (exp.EQ, exp.NEQ)):
            if (_is_bool_col(node.this, bool_cols) and _bool_literal(node.expression) is not None) or (
                _is_bool_col(node.expression, bool_cols) and _bool_literal(node.this) is not None
            ):
                hits.append(node.sql(dialect=MJPostgres))
        elif isinstance(node, exp.In) and _is_bool_col(node.this, bool_cols):
            if any(_bool_literal(e) is not None for e in (node.args.get("expressions") or [])):
                hits.append(node.sql(dialect=MJPostgres))
        # Shapes the coercion pass intentionally does NOT model — surface them so they are
        # hand-resolved instead of silently emitted as `boolean = integer`:
        #   CASE switch: `CASE bitcol WHEN 1 THEN …`  (implicit equality, no EQ node)
        elif isinstance(node, exp.Case) and node.this is not None and _is_bool_col(node.this, bool_cols):
            if any(_bool_literal(w.this) is not None for w in node.args.get("ifs", [])):
                hits.append(node.sql(dialect=MJPostgres))
        #   BETWEEN: `bitcol BETWEEN 0 AND 1`
        elif isinstance(node, exp.Between) and _is_bool_col(node.this, bool_cols):
            if _bool_literal(node.args.get("low")) is not None or _bool_literal(node.args.get("high")) is not None:
                hits.append(node.sql(dialect=MJPostgres))
    return hits


def _strip_national(node: exp.Expression) -> exp.Expression:
    """N'...' (exp.National) → plain string literal; PG has no N-prefixed literals."""
    if isinstance(node, exp.National):
        return exp.Literal.string(node.name)
    return node


def _strip_nulls_ordering(node: exp.Expression) -> exp.Expression:
    """sqlglot adds NULLS FIRST to ordered PK/index columns; drop it to match PG defaults."""
    if isinstance(node, exp.Ordered) and node.args.get("nulls_first") is not None:
        node.set("nulls_first", None)
    return node


def _strip_collate(node: exp.Expression) -> exp.Expression:
    """Drop SS collations on COLUMN DEFINITIONS (`CREATE TABLE c … COLLATE x`) — PG doesn't have
    them and a column's storage collation carries no comparison semantics that must be preserved.

    EXPRESSION collations (`c COLLATE Latin1_General_BIN2 <> 'y'`) are deliberately NOT handled
    here: they change comparison semantics (a `_BIN2`/`_CS_` qualifier forces case-sensitive
    matching that the surrounding default-collation `=` does not), so naively dropping them silently
    breaks the statement. Those are reported as unhandled upstream so the migration falls back to a
    hand-authored PG form."""
    if isinstance(node, exp.ColumnDef):
        kept = [
            c for c in node.args.get("constraints", [])
            if not (isinstance(c, exp.ColumnConstraint) and isinstance(c.kind, exp.CollateColumnConstraint))
        ]
        node.set("constraints", kept)
    return node


def _drop_isjson_checks(node: exp.Expression) -> exp.Expression:
    """Drop CHECK constraints using ISJSON() — PG has no ISJSON (validity enforced elsewhere).

    Detection is by the ISJSON *function call* (exp.Anonymous via _contains_isjson_call), never a
    substring of rendered SQL — so a CHECK on a column NAMED `IsJsonEnabled` or comparing to the
    literal 'ISJSON' is preserved (issue #3252 review). Filtering is per INDIVIDUAL constraint: an
    `ADD CONSTRAINT pk PRIMARY KEY (...), CONSTRAINT ck CHECK (ISJSON(...))` drops only the ISJSON
    check and KEEPS the sibling PK/FK — previously the whole AddConstraint (hence the sibling) was
    silently lost. Column-level checks are filtered on the ColumnDef; a table-level named CHECK
    that is entirely ISJSON is removed outright (return None); an ALTER left with no actions is
    dropped downstream by the empty-ALTER guard. Runs BEFORE _rewrite_isjson_eq/_bare, so a
    CHECK-context ISJSON is still an exp.Anonymous when this pass inspects it.
    """
    if isinstance(node, exp.ColumnDef):
        kept = [
            c for c in node.args.get("constraints", [])
            if not (
                isinstance(c, exp.ColumnConstraint)
                and isinstance(c.kind, exp.CheckColumnConstraint)
                and _contains_isjson_call(c.kind)
            )
        ]
        node.set("constraints", kept)
        return node
    if isinstance(node, exp.AddConstraint):
        exprs = node.args.get("expressions") or []
        kept = [e for e in exprs if not _contains_isjson_call(e)]
        if not kept:
            return None  # every action was an ISJSON check → drop the whole ADD (ALTER-ACTIONLESS)
        node.set("expressions", kept)
        return node
    if isinstance(node, exp.Constraint) and _contains_isjson_call(node):
        return None
    return node


def _fold_clustered_constraints(node: exp.Expression) -> exp.Expression:
    """`PRIMARY KEY {CLUSTERED|NONCLUSTERED} (cols)` / `UNIQUE {CLUSTERED|NONCLUSTERED} (cols)`
    → PG `PRIMARY KEY (cols)` / `UNIQUE (cols)`.

    SQL Server's CLUSTERED/NONCLUSTERED qualifier parses into a sibling
    Clustered/NonClusteredColumnConstraint that holds the columns; PG has no such qualifier, so
    fold the columns into the PK/UNIQUE and drop the qualifier. BOTH qualifiers must be handled
    for BOTH constraint kinds: sqlglot folds PK+CLUSTERED and UNIQUE+NONCLUSTERED on its own, but
    leaks the cross pairs — PK+NONCLUSTERED emits the invalid `PRIMARY KEY, NONCLUSTERED (cols)`
    (spurious comma) and UNIQUE+CLUSTERED keeps the CLUSTERED keyword. Treat the two qualifier
    node types identically so all four combinations fold.
    """
    _QUALIFIER = (exp.ClusteredColumnConstraint, exp.NonClusteredColumnConstraint)

    def cols_of(qualifier):
        return [o.this if isinstance(o, exp.Ordered) else o for o in (qualifier.this or [])]

    # PK {CLUSTERED|NONCLUSTERED}: PrimaryKeyColumnConstraint + a qualifier node are siblings.
    if isinstance(node, exp.Constraint):
        exprs = node.args.get("expressions") or []
        qualifier = next((e for e in exprs if isinstance(e, _QUALIFIER)), None)
        if qualifier is not None and any(isinstance(e, exp.PrimaryKeyColumnConstraint) for e in exprs):
            node.set("expressions", [exp.PrimaryKey(expressions=cols_of(qualifier))])
        return node

    # UNIQUE {CLUSTERED|NONCLUSTERED}: UniqueColumnConstraint wraps the qualifier holding the cols.
    if isinstance(node, exp.UniqueColumnConstraint) and isinstance(node.this, _QUALIFIER):
        node.set("this", exp.Schema(expressions=cols_of(node.this)))
    return node


def _split_multi_add_constraint(node: exp.Expression) -> exp.Expression:
    """`ALTER TABLE t ADD CONSTRAINT a ..., CONSTRAINT b ...` → one `ADD` per constraint.

    T-SQL lets a single `ADD` govern a comma-separated constraint list; PG requires `ADD`
    before EACH action in a multi-action ALTER. sqlglot parses the list into ONE
    AddConstraint holding N Constraint children and emits one `ADD` + comma list — PG rejects
    the trailing bare `CONSTRAINT` with `syntax error at or near "CONSTRAINT"`, a SILENT
    invalid emission (no unhandled). Split into one AddConstraint per constraint so the
    generator repeats `ADD`. (sqlglot already repeats `ADD` for multiple ADD COLUMN actions;
    only the constraint list leaks. Real occurrences: v5.49 Compaction two CHECKs on
    AIAgentType, v5.24 KnowledgeHub CHECK + FK on Tag.)
    """
    if not isinstance(node, exp.Alter):
        return node
    actions = node.args.get("actions") or []
    new_actions = []
    changed = False
    for action in actions:
        exprs = action.args.get("expressions") if isinstance(action, exp.AddConstraint) else None
        if exprs and len(exprs) > 1:
            new_actions.extend(exp.AddConstraint(expressions=[e.copy()]) for e in exprs)
            changed = True
        else:
            new_actions.append(action)
    if changed:
        node.set("actions", new_actions)
    return node


def _sanitize_nested_comments(node: exp.Expression) -> exp.Expression:
    """Neutralize `/*` and `*/` inside a node's attached comment text.

    sqlglot relocates T-SQL `--` line comments into inline `/* ... */` block comments on AST
    nodes. PostgreSQL block comments NEST, so a comment body containing `/*` (e.g. `image/*`)
    opens a nested comment and one containing `*/` closes early — either yields
    `unterminated /* comment` and aborts the whole file. sqlglot 30.x sanitizes this at emit,
    but the committed pin (27.18) emits comment text VERBATIM — a version-skew invalid
    emission. Insert a space to break the sequence (identical to sqlglot 30's own behavior, so
    the emitted SQL matches across versions). Comment text only — never touches SQL.
    """
    if node.comments:
        node.comments = [c.replace("/*", "/ *").replace("*/", "* /") for c in node.comments]
    return node


def _column_fk_to_reference(node: exp.Expression) -> exp.Expression:
    """Column-level `CONSTRAINT fk FOREIGN KEY REFERENCES t(c)` → bare `REFERENCES t(c)`.

    T-SQL allows the `FOREIGN KEY` keyword on an inline (column) FK constraint; PG does
    not — a column constraint is just `REFERENCES`. sqlglot parses this into a
    ColumnConstraint whose kind is ForeignKey(reference=Reference(...)) and the Postgres
    generator keeps the `FOREIGN KEY` token, producing `syntax error at or near "FOREIGN"`
    that aborts the whole `ALTER TABLE ... ADD` (losing every column in the statement).
    Replace the ForeignKey kind with its inner Reference so PG sees a valid column FK.
    """
    if isinstance(node, exp.ColumnConstraint) and isinstance(node.kind, exp.ForeignKey):
        ref = node.kind.args.get("reference")
        if ref is not None:
            node.set("kind", ref)
    return node


def _fix_misparsed_table_constraint(node: exp.Expression) -> exp.Expression:
    """A table-level `CONSTRAINT name CHECK(...)` listed inside a T-SQL multi-item
    `ALTER TABLE ADD col1, col2, CONSTRAINT ... CHECK(...)` is mis-parsed by sqlglot
    as a column named "CONSTRAINT" with a user-defined type (the constraint name),
    e.g. `ADD COLUMN "CONSTRAINT" CK_x CHECK(...)` → PG `type "ck_x" does not exist`,
    aborting the whole ADD. Rebuild it as a proper `ADD CONSTRAINT name <kind>`.
    """
    if (isinstance(node, exp.ColumnDef)
            and isinstance(node.this, exp.Identifier)
            and node.this.name.upper() == "CONSTRAINT"
            and node.kind is not None
            and node.kind.this == exp.DataType.Type.USERDEFINED):
        cname = node.kind.args.get("kind")
        name_ident = exp.to_identifier(cname.name if isinstance(cname, exp.Expression) else str(cname))
        kinds = [c.kind for c in node.constraints if isinstance(c, exp.ColumnConstraint) and c.kind is not None]
        if kinds:
            return exp.AddConstraint(expressions=[exp.Constraint(this=name_ident, expressions=kinds)])
    return node


def _rewrite_boolean_defaults(node: exp.Expression) -> exp.Expression:
    """A BIT column defaulting to 1/0 becomes a BOOLEAN defaulting to TRUE/FALSE.

    SQL Server wraps defaults in parens (`DEFAULT ((1))`), so unwrap before checking.
    """
    if isinstance(node, exp.ColumnDef) and node.kind and node.kind.this == exp.DataType.Type.BIT:
        for constraint in node.constraints:
            ck = constraint.kind
            if not isinstance(ck, exp.DefaultColumnConstraint):
                continue
            val = ck.this
            while isinstance(val, exp.Paren):
                val = val.this
            if isinstance(val, exp.Literal) and not val.is_string and val.name in ("0", "1"):
                ck.set("this", exp.true() if val.name == "1" else exp.false())
    return node


def _strip_default_constraint_names(node: exp.Expression) -> exp.Expression:
    """T-SQL permits a NAME on a column default (`CONSTRAINT [DF_x] DEFAULT (75)`); PG does
    NOT — it errors at `CONSTRAINT`. Strip the name from a DEFAULT column-constraint, leaving
    a bare unnamed `DEFAULT (75)` (issue #3252 RC3, the inline-column form; the standalone
    `ADD CONSTRAINT ... DEFAULT ... FOR col` form is handled by _transpile_default_constraint).
    Named CHECK/FK/UNIQUE column constraints are valid PG and are left untouched."""
    if isinstance(node, exp.ColumnConstraint) and isinstance(node.kind, exp.DefaultColumnConstraint) \
            and node.args.get("this") is not None:
        node.set("this", None)
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

# CodeGen object naming convention (mirrors MigrationStatementSplitter.CODEGEN_NAME):
# views, the CRUD/recompile sprocs, fn* functions, trg* triggers — all regenerated by
# `mj codegen`, so their extended-property comments must be skipped (object is dropped).
_CODEGEN_OBJECT_NAME = _re.compile(r"^(spCreate|spUpdate|spDelete|spRecompile|vw|fn|trgUpdate|trgCreate|trgDelete|trg)", _re.IGNORECASE)

# EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'...', ... ;
# The terminating `;` must be the one OUTSIDE the quoted args — description @values
# routinely contain semicolons ("applies to all apps; when set, …"). A naive `.*?;`
# cuts at the first in-string semicolon, corrupting this and every later envelope
# boundary. Match args as a run of (whole single-quoted string | non-quote/non-`;` char).
# The terminator itself is optional when the EXEC is the last statement of its chunk
# (end-of-input, a GO separator, or the END of a surrounding BEGIN block) — T-SQL does
# not require it, and a missing `;` must not skip the comment. Args are lazy so the
# match stops at the first such boundary rather than swallowing following statements.
_SP_EXTPROP = _re.compile(
    r"EXEC(?:UTE)?\s+sp_addextendedproperty\b(?P<args>(?:'(?:[^']|'')*'|[^';])*?)"
    r"(?:;|(?=\s*(?:\Z|GO\b|END\b)))",
    _re.IGNORECASE | _re.DOTALL,
)
# IF [NOT] EXISTS (<select>) BEGIN <body> END  — the idempotency wrapper.
# Recognized by a scanner, not a regex: the body must terminate at the END that matches
# the block's BEGIN, counting BEGIN/CASE nesting and skipping strings/comments/bracketed
# identifiers — a regex stopping at any `\bEND\b` truncates on `CASE … END` (or the word
# END inside a literal) and the leftover tail corrupts neighboring statements.
_IF_EXISTS_HEAD = _re.compile(r"\bIF\s+(?P<neg>NOT\s+)?EXISTS\s*\(", _re.IGNORECASE)
_WORD = _re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def _scan_atom(s: str, i: int) -> int:
    """If s[i] opens a string / comment / bracketed or quoted identifier, return the index
    just past it; otherwise return i unchanged (plain code character)."""
    c = s[i]
    if c == "'":
        i += 1
        n = len(s)
        while i < n:
            if s[i] == "'":
                if i + 1 < n and s[i + 1] == "'":  # escaped '' inside string
                    i += 2
                    continue
                return i + 1
            i += 1
        return n
    if c == "-" and s.startswith("--", i):
        j = s.find("\n", i)
        return len(s) if j < 0 else j + 1
    if c == "/" and s.startswith("/*", i):
        j = s.find("*/", i)
        return len(s) if j < 0 else j + 2
    if c == "[":
        j = s.find("]", i)
        return len(s) if j < 0 else j + 1
    if c == '"':
        j = s.find('"', i + 1)
        return len(s) if j < 0 else j + 1
    return i


def _match_paren(s: str, i: int) -> int:
    """s[i] == '(' → index just past the matching ')' (atom-aware), or -1 if unbalanced."""
    depth = 0
    n = len(s)
    while i < n:
        j = _scan_atom(s, i)
        if j != i:
            i = j
            continue
        if s[i] == "(":
            depth += 1
        elif s[i] == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return -1


def _peek_word(s: str, i: int) -> str:
    """Next word token at/after i (skipping whitespace/comments), uppercased; '' if none."""
    n = len(s)
    while i < n:
        j = _scan_atom(s, i)
        if j != i:
            i = j
            continue
        if s[i].isspace():
            i += 1
            continue
        m = _WORD.match(s, i)
        return m.group(0).upper() if m else ""
    return ""


def _match_block_end(s: str, i: int) -> tuple[int, int]:
    """From just after a block's BEGIN keyword, return (body_end, block_end): the start of
    the matching END token and the index just past it (plus an optional trailing `;`).
    BEGIN…END and CASE…END nest; BEGIN TRAN[SACTION] pairs with COMMIT, not END, so it
    does not count. Returns (-1, -1) when the block never terminates."""
    depth = 1
    n = len(s)
    while i < n:
        j = _scan_atom(s, i)
        if j != i:
            i = j
            continue
        m = _WORD.match(s, i)
        if not m:
            i += 1
            continue
        word = m.group(0).upper()
        if word == "BEGIN" and _peek_word(s, m.end()) not in ("TRAN", "TRANSACTION"):
            depth += 1
        elif word == "CASE":
            depth += 1
        elif word == "END":
            depth -= 1
            if depth == 0:
                end = m.end()
                t = _re.compile(r"\s*;").match(s, end)
                return i, (t.end() if t else end)
        i = m.end()
    return -1, -1


class _IfExistsMatch:
    """Minimal re.Match-alike for _find_if_exists_begin results — start/end/group are
    the only members the batch walk and _transpile_if_exists_begin use."""
    __slots__ = ("_text", "_start", "_end", "_groups")

    def __init__(self, text: str, start: int, end: int, neg: str | None, cond: str, body: str):
        self._text, self._start, self._end = text, start, end
        self._groups = {"neg": neg, "cond": cond, "body": body}

    def start(self) -> int:
        return self._start

    def end(self) -> int:
        return self._end

    def group(self, key: str | int = 0) -> str | None:
        return self._text[self._start:self._end] if key == 0 else self._groups[key]


def _scan_block_less_body(text: str, i: int) -> tuple[int, bool]:
    """From i (start of a block-less IF's single governed statement), scan atom-aware to the
    statement's terminating top-level ';'. Returns (end, is_if_else):
      - end: index just past ';' (or at a top-level ELSE, or len(text) if it runs to the end).
      - is_if_else: True when a top-level ELSE (outside any CASE…END) is reached before ';'
        — i.e. this is an IF … ELSE, which we don't model and must NOT capture.
    CASE…END nesting is tracked so a CASE-expression ELSE does not falsely trip the bail."""
    n = len(text)
    case_depth = 0
    while i < n:
        j = _scan_atom(text, i)
        if j != i:
            i = j
            continue
        w = _WORD.match(text, i)
        if w:
            kw = w.group(0).upper()
            if kw == "CASE":
                case_depth += 1
            elif kw == "END" and case_depth > 0:
                case_depth -= 1
            elif kw == "ELSE" and case_depth == 0:
                return i, True
            i = w.end()
            continue
        if text[i] == ";":
            return i + 1, False
        i += 1
    return n, False


def _next_keyword(text: str, i: int) -> str:
    """The next SQL word at/after i, skipping whitespace and comments, uppercased ('' if none)."""
    n = len(text)
    while i < n:
        if text[i].isspace():
            i += 1
            continue
        j = _scan_atom(text, i)
        if j != i and text[i] in ("-", "/"):  # comments
            i = j
            continue
        break
    m = _WORD.match(text, i)
    return m.group(0).upper() if m else ""


def _next_keyword_pos(text: str, i: int) -> int:
    """Index of the next SQL word at/after i, skipping whitespace and comments (n if none)."""
    n = len(text)
    while i < n:
        if text[i].isspace():
            i += 1
            continue
        j = _scan_atom(text, i)
        if j != i and text[i] in ("-", "/"):
            i = j
            continue
        break
    return i


def _has_code_word(text: str, word: str) -> bool:
    """True when `word` appears as a standalone SQL keyword OUTSIDE strings / comments /
    bracketed identifiers (atom-aware scan)."""
    target = word.upper()
    i, n = 0, len(text)
    while i < n:
        j = _scan_atom(text, i)
        if j != i:
            i = j
            continue
        m = _WORD.match(text, i)
        if m:
            if m.group(0).upper() == target:
                return True
            i = m.end()
            continue
        i += 1
    return False


# ── Routine envelope (issue #3252 heavy smoke — the routine-body containment fix) ──────
# A hand-written CREATE PROCEDURE/FUNCTION/TRIGGER must be absorbed WHOLE, from raw text,
# BEFORE any parsing: sqlglot (both the pinned 27.x and 30.x, in different ways) fragments
# routine bodies at inner `;` boundaries, letting body statements ESCAPE the routine gap —
# a body UPDATE then emits as top-level migration SQL (executing against the whole table at
# apply time), a dangling `END` emits as `END;` (which PostgreSQL parses as COMMIT — ending
# Flyway's migration transaction mid-flight), and cursor fragments emit as invalid PG.
# The envelope reports the whole routine as ONE gap and resumes after its balanced END.
_ROUTINE_HEAD = _re.compile(r"CREATE\s+(?:OR\s+ALTER\s+)?(?P<kind>PROC(?:EDURE)?|FUNCTION|TRIGGER)\b", _re.IGNORECASE)


class _RoutineMatch:
    """Minimal match-alike for a routine envelope (start/end/kind/snippet)."""
    __slots__ = ("_start", "_end", "kind", "snippet")

    def __init__(self, start: int, end: int, kind: str, snippet: str):
        self._start, self._end, self.kind, self.snippet = start, end, kind, snippet

    def start(self) -> int:
        return self._start

    def end(self) -> int:
        return self._end


def _find_routine_envelope(text: str, pos: int = 0) -> _RoutineMatch | None:
    """Find the next hand-routine header at a CODE position (never inside a string literal —
    baseline metadata seeds embed 'CREATE PROCEDURE' in prompt-template strings) and span it
    to its balanced `AS BEGIN … END` end. A body with no `AS BEGIN` (block-less T-SQL proc
    body) absorbs the rest of the chunk — per T-SQL semantics the body IS the rest of the
    batch. Returns None when no routine head exists at/after pos."""
    i, n = pos, len(text)
    while i < n:
        j = _scan_atom(text, i)
        if j != i:
            i = j
            continue
        if text[i] not in ("C", "c"):
            i += 1
            continue
        m = _ROUTINE_HEAD.match(text, i)
        if not m:
            i += 1
            continue
        end = _routine_body_end(text, m.end())
        kind = m.group("kind").upper()
        kind = "PROCEDURE" if kind == "PROC" else kind
        snippet = " ".join(text[m.start():m.start() + 120].split())[:80]
        return _RoutineMatch(m.start(), end, kind, snippet)
    return None


def _routine_body_end(text: str, head_end: int) -> int:
    """From just after a routine header, find the index past the body's balanced END.
    Looks for the first `AS` whose next keyword is `BEGIN` (skipping `@p AS INT` param
    forms, whose next word is a type, not BEGIN); no such `AS BEGIN` → the body is
    block-less and runs to the end of the chunk (T-SQL batch semantics)."""
    i, n = head_end, len(text)
    while i < n:
        j = _scan_atom(text, i)
        if j != i:
            i = j
            continue
        w = _WORD.match(text, i)
        if not w:
            i += 1
            continue
        if w.group(0).upper() == "AS" and _next_keyword(text, w.end()) == "BEGIN":
            k = _next_keyword_pos(text, w.end())          # start of BEGIN
            bw = _WORD.match(text, k)                     # the BEGIN word
            _, block_end = _match_block_end(text, bw.end())
            return block_end if block_end >= 0 else n     # unterminated → absorb rest
        i = w.end()
    return n


def _atom_masked_spans(text: str) -> list[tuple[int, int]]:
    """(start, end) spans of `text` occupied by a string literal, comment, or quoted/bracketed
    identifier — everything `_scan_atom` skips as a non-code atom. A regex head that STARTS
    inside one of these is not real SQL (e.g. the phrase `IF EXISTS (SELECT ...)` mentioned in a
    seeded template/prompt body or an example-SQL literal) and must never be mistaken for a
    statement head — doing so shattered the surrounding INSERT and fabricated a live DO-block
    (issue #3252 RC1/RC2 regression). Spans are returned sorted and non-overlapping."""
    spans: list[tuple[int, int]] = []
    i, n = 0, len(text)
    while i < n:
        j = _scan_atom(text, i)
        if j != i:
            spans.append((i, j))
            i = j
        else:
            i += 1
    return spans


def _pos_in_spans(pos: int, spans: list[tuple[int, int]]) -> bool:
    """True if pos falls within any (sorted, non-overlapping) masked span from _atom_masked_spans."""
    for s, e in spans:
        if s > pos:
            return False
        if pos < e:
            return True
    return False


def _find_if_exists_begin(text: str, pos: int = 0) -> _IfExistsMatch | None:
    """Find the next `IF [NOT] EXISTS (<select>) BEGIN <body> END` block — OR the block-less
    `IF [NOT] EXISTS (<select>) <single-statement>;` form (issue #3252 RC1) — at/after pos.
    Heads inside a string literal or comment are skipped (see _atom_masked_spans)."""
    masked = _atom_masked_spans(text)
    for head in _IF_EXISTS_HEAD.finditer(text, pos):
        if _pos_in_spans(head.start(), masked):
            continue  # the phrase lives inside a string literal / comment — not a statement
        cond_close = _match_paren(text, head.end() - 1)
        if cond_close < 0:
            continue
        cond = text[head.end():cond_close - 1]
        if not _re.match(r"\s*SELECT\b", _strip_leading_sql_comments(cond), _re.IGNORECASE):
            continue
        # Skip whitespace/comments after the condition to the first real token.
        i, n = cond_close, len(text)
        while i < n:
            if text[i].isspace():
                i += 1
                continue
            j = _scan_atom(text, i)
            if j != i and text[i] in ("-", "/"):  # comments only; anything else breaks the shape
                i = j
                continue
            break
        m = _WORD.match(text, i)
        if m and m.group(0).upper() == "BEGIN":
            body_end, block_end = _match_block_end(text, m.end())
            if body_end < 0:
                continue
            return _IfExistsMatch(text, head.start(), block_end, head.group("neg"), cond, text[m.end():body_end])
        # Block-less form: capture the single governed statement (to its terminating ';').
        # IF/ELSE is not modeled — bail so it falls to the plain path, where the 1b If/IfBlock
        # guard reports it and never silently drops it. Detect ELSE both mid-statement (the
        # governed statement has no trailing ';' before ELSE) and after a terminating ';'.
        if not m or m.group(0).upper() in ("ELSE", "END"):
            continue
        stmt_end, is_if_else = _scan_block_less_body(text, i)
        if is_if_else or _next_keyword(text, stmt_end) == "ELSE":
            continue
        return _IfExistsMatch(text, head.start(), stmt_end, head.group("neg"), cond, text[i:stmt_end])
    return None


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


def _extprop_positional(args: str) -> dict | None:
    """Parse positional sp_addextendedproperty args: name, value, l0type, l0name, l1type, l1name[, l2type, l2name]."""
    vals = [_unquote_tsql_string(m.group(1)) for m in _re.finditer(r"(N?'(?:[^']|'')*')", args)]
    if len(vals) < 6:
        return None
    d = {"name": vals[0], "value": vals[1], "level0name": vals[3], "level1name": vals[5]}
    if len(vals) >= 8:
        d["level2type"], d["level2name"] = vals[6], vals[7]
    return d


def _transpile_sp_addextendedproperty(args: str) -> str | None:
    """EXEC sp_addextendedproperty(MS_Description) → COMMENT ON COLUMN/TABLE. Handles named and positional forms."""
    # Named form (@name=N'…'); fall back to positional (N'MS_Description', N'…', …).
    if _extprop_arg(args, "name") is not None:
        get = lambda k: _extprop_arg(args, k)  # noqa: E731
    else:
        p = _extprop_positional(args)
        if p is None:
            return None
        get = lambda k: p.get(k)  # noqa: E731

    if (get("name") or "").upper() != "MS_DESCRIPTION":
        return None
    value = get("value")
    schema = get("level0name") or FLYWAY_MACRO
    table = get("level1name")
    col = get("level2name")
    col_type = (get("level2type") or ("COLUMN" if col else "")).upper()
    if value is None or not table:
        return None
    # Comments on CodeGen objects (views vw*, sprocs spCreate/spUpdate/spDelete/spRecompile,
    # functions fn*, triggers trg*) are regenerated by `mj codegen` — and the object doesn't
    # exist at apply time (it's dropped), so a COMMENT ON would fail "relation does not exist".
    # Skip them; CodeGen re-emits the object and its description.
    if _CODEGEN_OBJECT_NAME.match(table):
        return ""
    if col and col_type == "COLUMN":
        return f'COMMENT ON COLUMN {schema}."{table}"."{col}" IS {_pg_string(value)};'
    return f'COMMENT ON TABLE {schema}."{table}" IS {_pg_string(value)};'


# T-SQL emits column defaults as standalone constraint statements that sqlglot
# CANNOT parse (it falls back to an opaque exp.Command and the default is lost):
#     ALTER TABLE [t] ADD CONSTRAINT [DF_…] DEFAULT (<expr>) FOR [col];
# These carry ~all of MJ's column defaults (969 newsequentialid() ID defaults alone),
# so dropping them leaves the PG schema without them and breaks seed INSERTs that omit
# a defaulted column (e.g. ApplicationEntity rows relying on the ID default). Recognize
# the fixed shape on raw text and emit the PG form: `ALTER TABLE t ALTER COLUMN "col"
# SET DEFAULT <expr>` — the same "structural envelope" approach used for
# sp_addextendedproperty / IF EXISTS BEGIN. The trailing `;` is optional because
# sqlglot's Command node text drops it.
_DEFAULT_CONSTRAINT = _re.compile(
    r"^\s*ALTER\s+TABLE\s+(?P<tbl>.+?)\s+ADD\s+CONSTRAINT\s+(?:\[[^\]]+\]|\"[^\"]+\"|\S+)\s+"
    r"DEFAULT\s+(?P<expr>.+?)\s+FOR\s+(?P<col>\[[^\]]+\]|\"[^\"]+\"|\w+)\s*;?\s*$",
    _re.IGNORECASE | _re.DOTALL,
)
# Identifier tokens inside a table reference: bracketed, double-quoted, the Flyway
# sentinel/macro, or a bare PascalCase name.
_IDENT_TOKEN = _re.compile(
    r'\[[^\]]+\]|"[^"]+"|' + _re.escape(FLYWAY_SENTINEL) + r'|' + _re.escape(FLYWAY_MACRO) + r'|[A-Za-z_]\w*'
)


def _ident_token_to_pg(tok: str) -> str:
    """One identifier token → PG form. `[x]`/`"x"`/`x` → `"x"`; Flyway sentinel/macro → macro verbatim."""
    name = tok.strip()
    if name.startswith("[") and name.endswith("]"):
        name = name[1:-1]
    elif name.startswith('"') and name.endswith('"'):
        name = name[1:-1]
    if name in (FLYWAY_SENTINEL, FLYWAY_MACRO):
        return FLYWAY_MACRO
    return f'"{name}"'


def _emit_table_ref(tbl_raw: str) -> str:
    """`[__mj].[X]` → `"__mj"."X"`; `${flyway:defaultSchema}.[X]` → `${flyway:defaultSchema}."X"`."""
    toks = _IDENT_TOKEN.findall(tbl_raw)
    return ".".join(_ident_token_to_pg(t) for t in toks) if toks else tbl_raw.strip()


def _balanced_parens(s: str) -> bool:
    """True if every paren in s closes before the end (i.e. the whole string is one group)."""
    depth = 0
    for i, c in enumerate(s):
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0 and i != len(s) - 1:
                return False
    return depth == 0


def _convert_default_expr(expr_raw: str, table: str, col: str) -> str:
    """Convert a T-SQL DEFAULT expression to PG. Unwraps SS's `((…))` wrapping, maps
    BIT 1/0 → TRUE/FALSE (via the file-level bit registry), and routes the rest through
    the AST (newsequentialid()→gen_random_uuid(), getutcdate()→now(), N'…'→'…')."""
    e = expr_raw.strip().rstrip(";").strip()
    while len(e) >= 2 and e[0] == "(" and e[-1] == ")" and _balanced_parens(e):
        e = e[1:-1].strip()
    if table and (table.lower(), col.lower()) in _BIT_COLS and e in ("0", "1"):
        return "TRUE" if e == "1" else "FALSE"
    try:
        node = sqlglot.parse_one(e.replace(FLYWAY_MACRO, FLYWAY_SENTINEL), read="tsql")
        node = node.transform(_strip_national).transform(_rewrite_functions)
        return node.sql(dialect=MJPostgres, identify=True)
    except Exception:  # noqa: BLE001 — fall back to the raw expr (still valid for simple literals)
        return e


def _strip_leading_sql_comments(s: str) -> str:
    """Drop leading `--` / `/* */` comments. sqlglot attaches a preceding comment to the
    statement node, so a Command's text can be `/* note */ ALTER …` — which defeats a
    `^ALTER` anchor. The comment is non-essential metadata; drop it for matching/emit."""
    s = s.strip()
    while True:
        if s.startswith("--"):
            nl = s.find("\n")
            s = ("" if nl < 0 else s[nl + 1:]).lstrip()
        elif s.startswith("/*"):
            end = s.find("*/")
            s = ("" if end < 0 else s[end + 2:]).lstrip()
        else:
            return s


def _transpile_default_constraint(txt: str) -> str | None:
    """`ALTER TABLE t ADD CONSTRAINT df DEFAULT (expr) FOR [col]` → PG `ALTER COLUMN SET DEFAULT`.
    Returns None if txt isn't a standalone default constraint."""
    m = _DEFAULT_CONSTRAINT.match(txt.strip())
    if not m:
        return None
    col = m.group("col").strip().strip('[]"')
    toks = _IDENT_TOKEN.findall(m.group("tbl"))
    tname = (toks[-1].strip('[]"') if toks else "")
    expr = _convert_default_expr(m.group("expr"), tname, col)
    return f'ALTER TABLE {_emit_table_ref(m.group("tbl"))} ALTER COLUMN "{col}" SET DEFAULT {expr}'


# T-SQL `ALTER TABLE t ALTER COLUMN c <type> [NOT NULL|NULL]` — also unparseable by
# sqlglot (→ opaque Command). PG splits this into a TYPE change and a separate
# nullability action: `ALTER COLUMN c TYPE <pgtype>, ALTER COLUMN c SET/DROP NOT NULL`.
# Dropped silently today, so a post-baseline column type/nullability change would
# no-op; emit the PG form (reusing the dialect's type mapping).
_ALTER_COLUMN = _re.compile(
    r"^\s*ALTER\s+TABLE\s+(?P<tbl>.+?)\s+ALTER\s+COLUMN\s+(?P<col>\[[^\]]+\]|\"[^\"]+\"|\w+)\s+(?P<rest>.+?)\s*;?\s*$",
    _re.IGNORECASE | _re.DOTALL,
)


def _transpile_alter_column(txt: str) -> str | None:
    """`ALTER TABLE t ALTER COLUMN c <type> [NOT NULL|NULL]` → PG TYPE change + nullability.
    Returns None if txt isn't an ALTER COLUMN (or its type can't be parsed)."""
    m = _ALTER_COLUMN.match(txt.strip())
    if not m:
        return None
    rest = m.group("rest").strip()
    try:
        node = sqlglot.parse_one(f"CREATE TABLE t (c {rest})", read="tsql")
        cd = node.find(exp.ColumnDef)
        if cd is None or cd.kind is None:
            return None
        pgtype = cd.kind.sql(dialect=MJPostgres, identify=True)
    except Exception:  # noqa: BLE001
        return None
    col = m.group("col").strip().strip('[]"')
    tbl_ref = _emit_table_ref(m.group("tbl"))
    # T-SQL: omitting the NULL/NOT NULL spec on ALTER COLUMN makes the column NULLable.
    if _re.search(r"\bNOT\s+NULL\b", rest, _re.IGNORECASE):
        nullability = f'ALTER COLUMN "{col}" SET NOT NULL'
    else:
        nullability = f'ALTER COLUMN "{col}" DROP NOT NULL'
    # Emit the TYPE change for every type — atomic ones included (an INT→BIGINT widening
    # must not vanish) — plus the nullability action. PG rejects an `ALTER … TYPE` (even a
    # no-op restate, which SS produces on every ALTER COLUMN) while a view depends on the
    # column, so drop dependent CodeGen views first (regenerated by `mj codegen`).
    actions = [f'ALTER COLUMN "{col}" TYPE {pgtype}', nullability]
    bare_tbl = m.group("tbl").strip().split(".")[-1].strip().strip('[]"')
    return _drop_dependent_views_block(bare_tbl, col) + "\n" + f'ALTER TABLE {tbl_ref} ' + ", ".join(actions)


def _drop_dependent_views_block(table: str, col: str) -> str:
    """DO block that drops every view depending on <table>.<col> (CodeGen regenerates them).
    Deterministic and a no-op when nothing depends on the column."""
    tbl = table.replace("'", "''")
    cn = col.replace("'", "''")
    return (
        "DO $$\nDECLARE r RECORD;\nBEGIN\n"
        "  FOR r IN\n"
        "    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw\n"
        "    FROM pg_depend d\n"
        "    JOIN pg_rewrite rw ON rw.oid = d.objid\n"
        "    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'\n"
        "    JOIN pg_namespace ns ON ns.oid = dv.relnamespace\n"
        "    JOIN pg_class tc ON tc.oid = d.refobjid\n"
        "    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid\n"
        f"    WHERE tc.relname = '{tbl}' AND a.attname = '{cn}'\n"
        "  LOOP\n"
        "    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);\n"
        "  END LOOP;\nEND $$;"
    )


# EXEC sp_dropextendedproperty @name=N'MS_Description', … @level1name=…, @level2name=… ;
# Same envelope shape as sp_addextendedproperty but with NO @value (it removes a comment).
# Map to `COMMENT ON … IS NULL`; dropped today, so 7 stale column comments survive.
# Terminator semantics match _SP_EXTPROP (optional at chunk boundaries).
_SP_DROPEXTPROP = _re.compile(
    r"EXEC(?:UTE)?\s+sp_dropextendedproperty\b(?P<args>(?:'(?:[^']|'')*'|[^';])*?)"
    r"(?:;|(?=\s*(?:\Z|GO\b|END\b)))",
    _re.IGNORECASE | _re.DOTALL,
)


def _dropextprop_positional(args: str) -> dict | None:
    """Positional sp_dropextendedproperty args: name, l0type, l0name, l1type, l1name[, l2type, l2name] (no value)."""
    vals = [_unquote_tsql_string(m.group(1)) for m in _re.finditer(r"(N?'(?:[^']|'')*')", args)]
    if len(vals) < 5:
        return None
    d = {"name": vals[0], "level0name": vals[2], "level1name": vals[4]}
    if len(vals) >= 7:
        d["level2type"], d["level2name"] = vals[5], vals[6]
    return d


def _transpile_sp_dropextendedproperty(args: str) -> str | None:
    """EXEC sp_dropextendedproperty(MS_Description) → COMMENT ON COLUMN/TABLE … IS NULL."""
    if _extprop_arg(args, "name") is not None:
        get = lambda k: _extprop_arg(args, k)  # noqa: E731
    else:
        p = _dropextprop_positional(args)
        if p is None:
            return None
        get = lambda k: p.get(k)  # noqa: E731
    if (get("name") or "").upper() != "MS_DESCRIPTION":
        return None
    schema = get("level0name") or FLYWAY_MACRO
    table = get("level1name")
    col = get("level2name")
    col_type = (get("level2type") or ("COLUMN" if col else "")).upper()
    if not table:
        return None
    if _CODEGEN_OBJECT_NAME.match(table):  # CodeGen object — regenerated, skip
        return ""
    if col and col_type == "COLUMN":
        return f'COMMENT ON COLUMN {schema}."{table}"."{col}" IS NULL;'
    return f'COMMENT ON TABLE {schema}."{table}" IS NULL;'


def _split_top_level_statements(sql: str) -> list[str]:
    """Split SQL on top-level `;`, ignoring semicolons inside strings, `--`/`/* */` comments,
    `[bracketed]`/`"quoted"` identifiers, and BEGIN…END / CASE…END blocks (BEGIN TRAN pairs
    with COMMIT, not END, so it does not open a block). Used to (a) recover good statements
    when a whole-gap parse fails on one poison statement (a poison must not drop its neighbors)
    and (b) measure the true top-level statement count so a MERGED whole-parse — sqlglot 30.x
    absorbing the statement that FOLLOWS a block-less IF into the IF node (issue #3252 heavy
    smoke) — can be detected and re-split. Block-awareness keeps a legitimate multi-statement
    BEGIN…END intact instead of shattering it at its interior `;`."""
    out: list[str] = []
    buf: list[str] = []
    i, n, depth = 0, len(sql), 0
    while i < n:
        j = _scan_atom(sql, i)
        if j != i:  # string / comment / [bracketed] / "quoted" — copy verbatim
            buf.append(sql[i:j]); i = j; continue
        w = _WORD.match(sql, i)
        if w:
            kw = w.group(0).upper()
            if kw == "BEGIN" and _peek_word(sql, w.end()) not in ("TRAN", "TRANSACTION"):
                depth += 1
            elif kw == "CASE":
                depth += 1
            elif kw == "END" and depth > 0:
                depth -= 1
            buf.append(w.group(0)); i = w.end(); continue
        c = sql[i]
        if c == ";" and depth == 0:
            buf.append(";"); out.append("".join(buf)); buf = []; i += 1; continue
        buf.append(c); i += 1
    tail = "".join(buf)
    if tail.strip():
        out.append(tail)
    return out


def _has_sql_content(piece: str) -> bool:
    """True if `piece` holds any non-whitespace, non-comment SQL. Used to count REAL statements
    (a trailing comment-only or blank split fragment must not inflate the count and falsely
    trip the merged-whole-parse fallback)."""
    i, n = 0, len(piece)
    while i < n:
        c = piece[i]
        if c.isspace():
            i += 1; continue
        if c == "-" and piece.startswith("--", i):
            j = piece.find("\n", i); i = n if j < 0 else j + 1; continue
        if c == "/" and piece.startswith("/*", i):
            j = piece.find("*/", i); i = n if j < 0 else j + 2; continue
        return True
    return False


def _parse_resilient(protected: str) -> list[tuple[exp.Expression | None, str]]:
    """Parse a SQL chunk into (statement, raw_text) pairs. Fast path: one `sqlglot.parse`.
    Fall back to per-statement parsing in TWO cases, so no statement is lost:
      1. The whole-parse raised — a single unparseable statement must only drop itself, not
         the valid DDL around it (returns (None, raw) for the failures).
      2. The whole-parse SILENTLY MERGED statements — sqlglot 30.x absorbs the statement that
         follows a block-less `IF <cond> <stmt>` into the IF node, so an unconditional rider
         (e.g. an `ALTER … ADD CONSTRAINT` after an `IF @c … EXEC(…)` guard) neither emits nor
         is reported. Detected by comparing the whole-parse statement count against the
         block-aware top-level split: fewer statements than real `;`-delimited units means a
         merge happened. (27.x splits these correctly, so this is a no-op there.)
    Per-piece re-parsing restores the true statement boundaries in both cases."""
    pieces = [p for p in _split_top_level_statements(protected) if _has_sql_content(p)]
    try:
        fast = [s for s in sqlglot.parse(protected, read="tsql") if s is not None]
        if len(fast) >= len(pieces):  # no merge — trust the (faster) whole-parse
            return [(s, "") for s in fast]
    except Exception:  # noqa: BLE001
        pass
    results: list[tuple[exp.Expression | None, str]] = []
    for piece in pieces:
        try:
            for s in sqlglot.parse(piece, read="tsql"):
                if s is not None:
                    results.append((s, piece))
        except Exception:  # noqa: BLE001
            results.append((None, piece))
    return results


# T-SQL `ALTER TABLE t WITH [NO]CHECK ADD CONSTRAINT …` — the enforcement toggle has no PG
# form. Stripped pre-parse (see _transpile_plain) so `WITH CHECK` (which otherwise emits the
# invalid `… WITH CHECK ADD …`) and `WITH NOCHECK` (an opaque Command → unhandled) both become
# a plain, validating `ADD CONSTRAINT …`. The `(?=ADD\b)` lookahead keeps it from touching a
# view's `WITH CHECK OPTION` (there the next token is OPTION, not ADD).
_WITH_CHECK_ADD = _re.compile(r"\bWITH\s+(?:NOCHECK|CHECK)\s+(?=ADD\b)", _re.IGNORECASE)


def _has_computed_column(stmt: exp.Expression) -> bool:
    """True if `stmt` declares a computed/generated column (T-SQL `col AS (expr) [PERSISTED]`).
    Such columns cannot be transpiled mechanically: sqlglot emits `GENERATED ALWAYS AS (...)
    STORED` WITHOUT the PG-required column type (invalid), and a non-persisted T-SQL computed
    column has no STORED equivalent at all. Callers report the statement rather than emit it."""
    for cd in stmt.find_all(exp.ColumnDef):
        for c in cd.args.get("constraints") or []:
            if isinstance(c.args.get("kind"), exp.ComputedColumnConstraint):
                return True
    return False


def _transpile_plain(sql: str, pretty: bool = False) -> tuple[str, list[dict], list[dict]]:
    """Transpile a chunk of regular SQL via the AST dialect; report unparseable bits.

    Returns (sql, unhandled, dropped). `dropped` records every INTENTIONAL drop (batch-control
    noise, swallowed routine `END`, statement-level RAISERROR, actionless ALTER, …) so that
    accounting reconciles: parsed == emitted + unhandled + dropped (issue #3252 1d). The
    reconciliation is SOFT — a mismatch appends an ACCOUNTING-LEAK gap to `unhandled`, it
    never raises (a raise would crash the transpiler and, via the CLI catch, lose all
    artifacts — the exact RC3 pathology this fix eliminates)."""
    out, unhandled, dropped = [], [], []
    parsed = 0
    protected = sql.replace(FLYWAY_MACRO, FLYWAY_SENTINEL)
    # Strip the SQL Server `WITH [NO]CHECK` enforcement toggle before `ADD CONSTRAINT` — it has
    # no PG equivalent and otherwise leaks as invalid `… WITH CHECK ADD …` (see _WITH_CHECK_ADD).
    # ATOM-AWARE: rewrite the toggle ONLY at a real code position. The identical phrase occurring
    # inside a string literal (e.g. a seeded `N'… WITH CHECK ADD …'`) or a comment is data/prose,
    # not the toggle — stripping it there silently corrupts emitted content (issue #3252: never
    # silently alter output). Matches whose head sits in a masked atom are left verbatim.
    _wca_spans = _atom_masked_spans(protected)
    protected = _WITH_CHECK_ADD.sub(
        lambda m: m.group(0) if _pos_in_spans(m.start(), _wca_spans) else "",
        protected,
    )
    # Set after reporting a CREATE PROCEDURE/FUNCTION/TRIGGER: the routine's closing
    # `END` often parses as its own dangling statement — it belongs to the routine we
    # just reported, not to a new gap.
    swallow_routine_end = False
    for stmt, raw in _parse_resilient(protected):
        parsed += 1
        if swallow_routine_end:
            swallow_routine_end = False
            tail = (raw or (stmt.sql(dialect="tsql") if stmt is not None else "")).strip().rstrip(";").strip()
            if tail.upper() == "END":
                dropped.append({"kind": "ROUTINE-END", "snippet": tail[:80]})
                continue
        if stmt is None:
            unhandled.append({"kind": "parse-error", "snippet": raw.strip()[:80]})
            continue
        # A T-SQL `IF …` statement that the IF-EXISTS envelope did NOT capture (e.g. a
        # block-less IF/ELSE — issue #3252 RC1) reaches here as exp.If/exp.IfBlock. sqlglot's
        # PG generator emits an EMPTY string for these, which is a SILENT DROP (the six bare
        # `;` of the original bug). Report it as a gap; never let it emit nothing.
        if isinstance(stmt, _IF_NODE_TYPES):
            txt = stmt.sql(dialect="tsql")
            unhandled.append({"kind": "IF-BLOCK", "snippet": txt[:80]})
            continue
        # Standalone seed of schema-derived metadata → drop; CodeGen regenerates it.
        # (The _METADATA_TABLES matcher is intentionally disabled today; instrumented for
        # accounting completeness should it ever be re-enabled.)
        if isinstance(stmt, exp.Insert) and _METADATA_TABLES.search(stmt.sql(dialect="tsql")):
            dropped.append({"kind": "METADATA-INSERT", "snippet": stmt.sql(dialect="tsql")[:80]})
            continue
        # Hand-written routines MUST be detected BEFORE the Declare/Parameter branch below:
        # a routine body is full of `@params`, and version-dependently the whole routine can
        # carry exp.Parameter nodes (the pinned 27.x models proc params that way; 30.x does
        # not). If the Parameter branch caught it first, the routine would be reported WITHOUT
        # `swallow_routine_end`, leaving the resilient split's dangling `END` as a spurious
        # second gap (27.x) or a bogus emitted `END;` (30.x). Two forms:
        #  (a) well-parsed exp.Create PROCEDURE/FUNCTION/TRIGGER — the dedicated branch just
        #      below (hoisted above the Parameter branch for exactly this reason);
        #  (b) a routine header sqlglot mis-parsed as an opaque Command (e.g. some
        #      `CREATE TRIGGER … ON …` forms) — the text-based fallback here.
        if not isinstance(stmt, exp.Create):
            head_txt = _strip_leading_sql_comments(stmt.sql(dialect="tsql"))
            if _re.match(r"^\s*CREATE\s+(?:OR\s+ALTER\s+)?(?:PROC(?:EDURE)?|FUNCTION|TRIGGER)\b", head_txt, _re.IGNORECASE):
                unhandled.append({"kind": _first_keyword(head_txt), "snippet": head_txt[:80]})
                swallow_routine_end = True
                continue
        # Hand-written routines: a T-SQL PROCEDURE/FUNCTION/TRIGGER body cannot be
        # transpiled mechanically (parameter syntax, control flow, and the body itself
        # are all T-SQL) — naive emission produces invalid PG like `$x INT AS BEGIN …`.
        # The classifier flags these files needs-hand-authoring; here we report the
        # routine so it lands in the gap comments instead of half-translated output.
        if isinstance(stmt, exp.Create) and (stmt.args.get("kind") or "").upper() in (
            "PROCEDURE",
            "FUNCTION",
            "TRIGGER",
        ):
            txt = stmt.sql(dialect="tsql")
            name = stmt.find(exp.Table)
            unhandled.append({
                "kind": f"CREATE-{(stmt.args.get('kind') or '').upper()}",
                "snippet": (name.sql(dialect="tsql") + " — " if name else "") + txt[:80],
            })
            swallow_routine_end = True
            continue
        # T-SQL procedural glue with no standalone PG equivalent — DECLARE @v / SET @v /
        # SELECT @v = ... / IF @v ... EXEC('...'). In Category-B (regular DDL/DML) these
        # only appear as leaked imperative logic (e.g. dynamic auto-named-constraint
        # drops); real proc/function bodies are classified hand-procedural upstream and
        # never reach here. Emitting them produces invalid `$v` SQL — report, don't emit.
        # Detect by the presence of a T-SQL `@v` (which parses to exp.Parameter) rather than
        # by statement type: sqlglot's node type for these varies across versions (e.g. `IF …`
        # is exp.If in some, exp.IfBlock in others), and an enumerated list silently leaks the
        # ones it misses. The protected Flyway macro is an Identifier, not a Parameter, so this
        # never false-positives on `${flyway:defaultSchema}`.
        # An expression COLLATE (`c COLLATE Latin1_General_BIN2 <> 'y'`) encodes case-sensitivity
        # that PG can't express by mechanically dropping the qualifier without changing semantics
        # (see `_strip_collate`); report so the migration falls back to a hand-authored PG form.
        if isinstance(stmt, exp.Declare) or stmt.find(exp.Parameter) is not None or stmt.find(exp.Collate) is not None:
            txt = stmt.sql(dialect="tsql")
            unhandled.append({"kind": _first_keyword(txt), "snippet": txt[:80]})
            continue
        # Self-aliased UPDATE…FROM with an outer join: no semantics-preserving PG
        # rewrite exists (see `_update_alias_outer_join`) — report, don't emit.
        if isinstance(stmt, exp.Update) and _update_alias_outer_join(stmt):
            txt = stmt.sql(dialect="tsql")
            unhandled.append({"kind": "UPDATE-OUTER-JOIN", "snippet": txt[:80]})
            continue
        # T-SQL `DELETE TOP (n) FROM t` misparses on BOTH versions into a spurious multi-table
        # DELETE (`DELETE "TOP" AS _t0(n) FROM t`) — invalid PG with no mechanical rewrite (PG
        # would need a ctid/CTE form). The signature is a DELETE carrying a `tables` list (PG puts
        # the target in `this`, not `tables`) whose entry is the swallowed `TOP` keyword.
        if isinstance(stmt, exp.Delete) and any(
                isinstance(t, exp.Table) and (t.name or "").upper() == "TOP"
                for t in (stmt.args.get("tables") or [])):
            unhandled.append({"kind": "DELETE-TOP", "snippet": stmt.sql(dialect="tsql")[:80]})
            continue
        # Computed/generated columns (`col AS (expr) [PERSISTED]`) can't be transpiled — report
        # (would emit a type-less `GENERATED ALWAYS AS (...) STORED`; see _has_computed_column).
        # Only CREATE/ALTER declare columns — gate on type so the subtree walk skips the huge
        # metadata INSERTs in baseline dumps (thousands of VALUES rows) it could never match.
        if isinstance(stmt, (exp.Create, exp.Alter)) and _has_computed_column(stmt):
            unhandled.append({"kind": "COMPUTED-COLUMN", "snippet": stmt.sql(dialect="tsql")[:80]})
            continue
        if isinstance(stmt, exp.Command):
            # sqlglot may glom a preceding comment onto the Command (`/* note */ ALTER …`),
            # which defeats the `^ALTER` anchors below; match against the bare statement.
            txt = _strip_leading_sql_comments(stmt.sql(dialect="tsql"))
            # T-SQL standalone column-default constraint — sqlglot can't parse it, so it
            # lands here as a Command. Emit the PG `ALTER COLUMN … SET DEFAULT` form.
            dc = _transpile_default_constraint(txt)
            if dc is not None:
                out.append(dc)
                continue
            # T-SQL `ALTER TABLE … ALTER COLUMN c <type> [NOT] NULL` — also a Command.
            ac = _transpile_alter_column(txt)
            if ac is not None:
                out.append(ac)
                continue
            # SQL Server batch-control noise — not needed on PG, drop silently.
            if _re.match(r"^\s*(BEGIN\s+TRY|END\s+TRY|BEGIN\s+CATCH|END\s+CATCH|SET\s+NOEXEC|GO)\b", txt, _re.IGNORECASE):
                dropped.append({"kind": "BATCH-CONTROL", "snippet": txt[:80]})
                continue
            unhandled.append({"kind": _first_keyword(txt), "snippet": txt[:80]})
            continue
        # T-SQL `SET IDENTITY_INSERT t ON/OFF` — no PG equivalent (PG uses OVERRIDING SYSTEM
        # VALUE per-INSERT). `…ON` lands as an unhandled Command; `…OFF` parses to exp.Set and
        # would emit invalid `SET "IDENTITY_INSERT" = t AS "OFF"`. Report (must precede the
        # SET-NOISE drop below so it lands as a gap, not a silent drop).
        if isinstance(stmt, exp.Set) and _re.search(
                r"\bIDENTITY_INSERT\b", stmt.sql(dialect="tsql"), _re.IGNORECASE):
            unhandled.append({"kind": "SET-IDENTITY-INSERT", "snippet": stmt.sql(dialect="tsql")[:80]})
            continue
        # SS session/batch-control SETs have no PG equivalent and error as unrecognized
        # config params — drop them (NOEXEC, NOCOUNT, XACT_ABORT, QUOTED_IDENTIFIER, ANSI_*).
        if isinstance(stmt, exp.Set) and _re.search(
            r"\b(NOEXEC|NOCOUNT|XACT_ABORT|QUOTED_IDENTIFIER|ANSI_NULLS|ANSI_PADDING|ANSI_WARNINGS|"
            r"ARITHABORT|CONCAT_NULL_YIELDS_NULL|NUMERIC_ROUNDABORT)\b",
            stmt.sql(dialect="tsql"), _re.IGNORECASE):
            dropped.append({"kind": "SET-NOISE", "snippet": stmt.sql(dialect="tsql")[:80]})
            continue
        # RAISERROR(...) at statement level is invalid PG outside a function — drop it
        # (inside an IF…BEGIN guard it is handled as RAISE EXCEPTION by the DO-block path).
        if isinstance(stmt, exp.Anonymous) and (stmt.name or "").upper() == "RAISERROR":
            dropped.append({"kind": "RAISERROR", "snippet": stmt.sql(dialect="tsql")[:80]})
            continue
        # `ALTER TABLE t ALTER COLUMN c <type>` with NO nullability spec parses cleanly
        # (unlike the `… NULL`/`… NOT NULL` forms, which land as opaque Commands). Route
        # it through the same structured emission as those, so it gets the dependent-view
        # drop and T-SQL's implied nullability reset (omitting the spec → NULLable).
        if isinstance(stmt, exp.Alter):
            acts = stmt.args.get("actions") or []
            if len(acts) == 1 and isinstance(acts[0], exp.AlterColumn) and acts[0].args.get("dtype"):
                ac = _transpile_alter_column(stmt.sql(dialect="tsql"))
                if ac is not None:
                    out.append(ac)
                    continue
        # DROP kind normalization / gating (issue #3252 heavy smoke):
        #  • `DROP PROC` — sqlglot keeps the T-SQL abbreviation, which is invalid PG. Spell it
        #    out to PROCEDURE. (The ONE real invalid-PG emission in the v5 ledger — V202605091143.)
        #  • `DROP TRIGGER` — PG requires an `ON <table>` clause; sqlglot (30.x) emits it WITHOUT
        #    one (invalid). 27.x parses it as an opaque Command (already unhandled). Report so
        #    both versions converge on a gap rather than emit the ON-less form.
        if isinstance(stmt, exp.Drop):
            dk = (stmt.args.get("kind") or "").upper()
            if dk == "PROC":
                stmt.set("kind", "PROCEDURE")
            elif dk == "TRIGGER":
                unhandled.append({"kind": "DROP-TRIGGER", "snippet": stmt.sql(dialect="tsql")[:80]})
                continue
        if isinstance(stmt, exp.Create) and (stmt.args.get("kind") or "").upper() in (
                "NONCLUSTERED INDEX", "CLUSTERED INDEX"):
            stmt.set("kind", "INDEX")  # PG has no CLUSTERED/NONCLUSTERED qualifier
        stmt = _rewrite_boolean_int_comparisons(stmt)
        # copy=False mutates the parsed tree IN PLACE across all passes. Each pass otherwise
        # deep-copies the whole statement AST (sqlglot's transform default), so a 15-pass chain
        # was 15 full tree deep-copies per statement — the dominant cost on 50 MB baselines
        # (deepcopy alone was ~40% of total runtime; see the perf note in _next_match). The
        # parsed `stmt` is used once here and discarded, so in-place mutation is safe, and the
        # pass ordering is unchanged: each pass still sees the prior pass's edits.
        stmt = (
            stmt.transform(_rewrite_update_from_alias, copy=False)  # restructures UPDATE before other rewrites
            .transform(_rewrite_insert_booleans, copy=False)  # seed-INSERT 1/0 → TRUE/FALSE for bit cols
            .transform(_fix_misparsed_table_constraint, copy=False)
            .transform(_rewrite_functions, copy=False)
            .transform(_rewrite_boolean_defaults, copy=False)
            .transform(_strip_default_constraint_names, copy=False)  # PG has no named column defaults
            .transform(_rewrite_string_concat, copy=False)
            .transform(_strip_national, copy=False)
            .transform(_strip_collate, copy=False)
            .transform(_drop_isjson_checks, copy=False)  # drop ISJSON CHECK constraints BEFORE…
            .transform(_rewrite_isjson_eq, copy=False)   # …rewriting surviving ISJSON predicates (WHERE)
            .transform(_rewrite_isjson_bare, copy=False)
            .transform(_fold_clustered_constraints, copy=False)
            .transform(_strip_nulls_ordering, copy=False)
            .transform(_column_fk_to_reference, copy=False)
            .transform(_split_multi_add_constraint, copy=False)  # PG needs ADD per constraint; run last
            .transform(_sanitize_nested_comments, copy=False)  # break /* */ in comments (pin version-skew)
        )
        # An ALTER TABLE whose only action was dropped (e.g. an ISJSON ADD CONSTRAINT)
        # is left actionless — emitting bare `ALTER TABLE x` is a PG syntax error. Skip.
        # NOTE: do NOT render the actionless ALTER to T-SQL for the snippet — sqlglot's
        # tsql alter_sql does actions[0] and raises IndexError on an empty action list.
        # Use the (safe) table name instead.
        if isinstance(stmt, exp.Alter) and not stmt.args.get("actions"):
            tbl = stmt.find(exp.Table)
            dropped.append({
                "kind": "ALTER-ACTIONLESS",
                "snippet": (tbl.sql(dialect="tsql") if tbl is not None else "ALTER TABLE")[:80],
            })
            continue
        # Behavioral self-check: any `boolean = integer` comparison the coercion pass didn't
        # eliminate would abort on PG. Surface it as a gap (not silent output) so the gap
        # count reflects type-correctness, not just parseability.
        residual = _residual_boolean_int(stmt)
        if residual:
            unhandled.append({"kind": "BOOL-INT-RESIDUAL", "snippet": "; ".join(residual)[:120]})
            continue
        # EMPTY-EMISSION postcondition (issue #3252 1b): sqlglot's generator treats an
        # unsupported node as a WARNING and returns "" — which would append a bare `;` and
        # vanish the source statement silently. Any non-empty source statement that renders
        # to empty/whitespace is REPORTED as a gap, never emitted. This closes the whole
        # class of "generator warned and returned nothing", not just the IfBlock instance.
        rendered = stmt.sql(dialect=MJPostgres, pretty=pretty, identify=True)
        if not rendered.strip().strip(";").strip():
            txt = stmt.sql(dialect="tsql")
            unhandled.append({"kind": "EMPTY-EMISSION", "snippet": txt[:80]})
            continue
        out.append(rendered)
    # SOFT reconciliation (issue #3252 1d): every parsed statement must land in exactly one
    # bucket. A mismatch means a drop site was missed — surface it as a gap so it is loud and
    # gets artifacts, but NEVER raise (a raise would abort the whole conversion run with zero
    # artifacts). `emitted` is counted at source-statement granularity (len(out)), NOT by
    # re-splitting the emitted body — a single statement can expand to a multi-`;` DO block.
    accounted = len(out) + len(unhandled) + len(dropped)
    if parsed != accounted:
        unhandled.append({
            "kind": "ACCOUNTING-LEAK",
            "snippet": f"parsed={parsed} but emitted={len(out)}+unhandled={len(unhandled)}+dropped={len(dropped)}={accounted}",
        })
    return (";\n".join(out) + (";" if out else "")), unhandled, dropped


_RAISERROR = _re.compile(r"RAISERROR\s*\(\s*(N?'(?:[^']|'')*'|@?\w+)", _re.IGNORECASE)


def _is_raiserror_only(stmt: str) -> bool:
    """True if `stmt` is a lone RAISERROR(...) call with no REAL statement glued after it. T-SQL
    makes the terminating `;` optional, so a sibling routinely follows with no separator
    (`RAISERROR(...) \n UPDATE ...`); _split_top_level_statements breaks on `;` only, so it hands
    that whole run in as ONE piece. Scan past the RAISERROR call's matched `)` (atom-aware, so a
    `(` inside the message string doesn't fool it) and treat only a trailing RETURN / PRINT /
    comment / blank as non-sibling — a RETURN is moot after the RAISE aborts. Anything else riding
    after the call (UPDATE / INSERT / a second RAISERROR) makes this NOT raiserror-only (#3252)."""
    if not _RAISERROR.match(stmt):
        return False
    open_paren = stmt.find("(")
    if open_paren < 0:
        return False
    close = _match_paren(stmt, open_paren)
    if close < 0:
        return False
    for piece in _split_top_level_statements(stmt[close:]):
        rest = _strip_leading_sql_comments(piece).strip(" \t\r\n;")
        if not rest or _re.match(r"(PRINT|RETURN)\b", rest, _re.IGNORECASE):
            continue
        return False
    return True


def _raiserror_has_siblings(body: str) -> bool:
    """True if `body` contains a meaningful statement OTHER than RAISERROR (PRINT / comments /
    empties don't count). The RAISERROR→RAISE-EXCEPTION guard fast path is only safe when
    RAISERROR stands alone; a paired real statement would be silently dropped (issue #3252).
    _is_raiserror_only handles the semicolon-less sibling shape that a bare `;`-split misses."""
    for s in _split_top_level_statements(body):
        stmt = _strip_leading_sql_comments(s).strip(" \t\r\n;")
        if not stmt or _re.match(r"PRINT\b", stmt, _re.IGNORECASE) or _is_raiserror_only(stmt):
            continue
        return True
    return False

# Inline entity-metadata INSERTs (Entity / EntityField / ApplicationEntity / …) in a
# FEATURE migration are KEPT and transpiled — NOT dropped. Empirically, `mj codegen` on
# PostgreSQL regenerates SQL *objects* (views, CRUD functions, triggers — already dropped
# by the splitter's CodeGen-block extraction) but does NOT introspect the schema to (re)create
# Entity/EntityField *metadata rows* the way SQL-Server CodeGen does (the schema-management
# sprocs that drive that — spUpdateExistingEntitiesFromSchema, … — are SQL-Server-only).
# So a new entity's registration rows have NO other source: dropping them leaves the entity
# absent from metadata, and CodeGen then generates no view/sproc for it (a parity gap of
# exactly the new-entity views/sprocs). Pure-metadata `*_Metadata_Sync` migrations are still
# fully re-seeded via `mj sync push` — the SPLITTER routes those to reseed (empty kept-TSQL),
# so they never reach here. This matcher is therefore intentionally disabled (matches nothing).
_METADATA_TABLES = _re.compile(r"(?!x)x")


def _transpile_extprop_segment(text: str, pretty: bool = False) -> tuple[str, list[dict], list[dict]]:
    """Transpile a text segment that may interleave sp_add/dropextendedproperty envelopes
    with plain SQL — used for IF…BEGIN bodies, where a guarded INSERT can sit next to an
    extprop EXEC (the top-level batch walker handles the same mix outside blocks).
    Returns (sql, unhandled, dropped) — `dropped` accumulated from the plain-SQL gaps."""
    out: list[str] = []
    unhandled: list[dict] = []
    dropped: list[dict] = []
    pos = 0
    while pos < len(text):
        ext = _SP_EXTPROP.search(text, pos)
        dxp = _SP_DROPEXTPROP.search(text, pos)
        nxt = min([x for x in (ext, dxp) if x], key=lambda x: x.start(), default=None)
        gap = text[pos:] if nxt is None else text[pos:nxt.start()]
        if gap.strip():
            s, u, d = _transpile_plain(gap, pretty)
            if s.strip():
                out.append(s)
            unhandled.extend(u)
            dropped.extend(d)
        if nxt is None:
            break
        if nxt is ext:
            comment = _transpile_sp_addextendedproperty(nxt.group("args"))
            if comment:
                out.append(comment)
            elif comment is None:
                unhandled.append({"kind": "sp_addextendedproperty", "snippet": nxt.group(0)[:80]})
        else:
            comment = _transpile_sp_dropextendedproperty(nxt.group("args"))
            if comment:
                out.append(comment)
            elif comment is None:
                unhandled.append({"kind": "sp_dropextendedproperty", "snippet": nxt.group(0)[:80]})
        pos = nxt.end()
    return "\n".join(out), unhandled, dropped


# SS catalog references in a guard condition (sys.* views / OBJECT_ID()) — meaningless
# on PG; the common shapes are translated to PG catalog equivalents, the rest reported.
_SYS_CATALOG_REF = _re.compile(r"\bsys\s*\.\s*\w+|\bOBJECT_ID\s*\(", _re.IGNORECASE)
_SYS_TABLE = _re.compile(r"\bsys\s*\.\s*(\w+)", _re.IGNORECASE)
_OBJECT_ID_ARG = _re.compile(
    r"\bOBJECT_ID\s*\(\s*N?'(?P<obj>[^']+)'\s*(?:,\s*N?'(?P<type>[^']*)'\s*)?\)", _re.IGNORECASE
)
_NAME_EQ = _re.compile(r"\bname\s*=\s*N?'(?P<name>[^']+)'", _re.IGNORECASE)
# Predicate shapes the translator understands; anything left over in the WHERE clause
# beyond these (plus AND/whitespace/parens) makes the guard untranslatable.
_KNOWN_SYS_PREDS = (
    _re.compile(r"\b\w+(?:\s*\.\s*\w+)?\s*=\s*OBJECT_ID\s*\([^)]*\)", _re.IGNORECASE),
    _re.compile(r"\b(?:\w+\s*\.\s*)?name\s*=\s*N?'[^']*'", _re.IGNORECASE),
    _re.compile(r"\btype\s*(?:=\s*N?'U'|IN\s*\(\s*N?'U'\s*\))", _re.IGNORECASE),
    _re.compile(r"\bschema_id\s*=\s*SCHEMA_ID\s*\([^)]*\)", _re.IGNORECASE),
)


def _qualified_obj(obj: str) -> tuple[str, str]:
    """Split an OBJECT_ID('sch.Tbl') argument into raw (schema, table) names; a missing
    schema qualifier defaults to the Flyway macro (MJ's default schema)."""
    toks = _IDENT_TOKEN.findall(obj)
    names = [t[1:-1] if t[:1] in ("[", '"') else t for t in toks]
    table = names[-1] if names else obj
    schema = names[-2] if len(names) >= 2 else FLYWAY_MACRO
    return schema, table


def _sys_guard_residue_ok(cond: str) -> bool:
    """True when the guard's WHERE clause consists only of recognized predicates joined
    by AND — i.e. nothing semantically load-bearing would be dropped in translation."""
    parts = _re.split(r"\bWHERE\b", cond, maxsplit=1, flags=_re.IGNORECASE)
    if len(parts) != 2 or _re.search(r"\bJOIN\b", cond, _re.IGNORECASE):
        return False
    residue = parts[1]
    for p in _KNOWN_SYS_PREDS:
        residue = p.sub(" ", residue)
    return not _re.search(r"[=<>']|\b(?:OR|IN|LIKE|EXISTS|NOT|SELECT)\b", residue, _re.IGNORECASE)


def _translate_sys_guard(cond: str, neg: bool) -> str | None:
    """Translate the common SQL-Server catalog guard conditions to a full PG predicate
    (the text between `IF` and `THEN`). Handled shapes:
      * sys.columns + OBJECT_ID(tbl) + name='col' → EXISTS (information_schema.columns …)
      * sys.tables / sys.objects table existence  → to_regclass(…) IS [NOT] NULL
      * sys.indexes + OBJECT_ID(tbl) + name='idx' → EXISTS (pg_indexes …)
    Returns None when the shape isn't confidently recognized — the caller then routes the
    whole IF block to unhandled rather than emitting sys.* references PG rejects."""
    sys_tables = {t.lower() for t in _SYS_TABLE.findall(cond)}
    obj = _OBJECT_ID_ARG.search(cond)
    name = _NAME_EQ.search(cond)
    exists = "NOT EXISTS" if neg else "EXISTS"
    if not _sys_guard_residue_ok(cond):
        return None
    if sys_tables == {"columns"} and obj and name:
        sch, tbl = _qualified_obj(obj.group("obj"))
        return (
            f"{exists} (SELECT 1 FROM information_schema.columns WHERE table_schema = '{sch}' "
            f"AND table_name = '{tbl}' AND column_name = '{name.group('name')}')"
        )
    if sys_tables == {"indexes"} and obj and name:
        sch, tbl = _qualified_obj(obj.group("obj"))
        return (
            f"{exists} (SELECT 1 FROM pg_indexes WHERE schemaname = '{sch}' "
            f"AND tablename = '{tbl}' AND indexname = '{name.group('name')}')"
        )
    if sys_tables == {"objects"} and obj:
        # Only a user-table check ('U' — in OBJECT_ID's 2nd arg or a type predicate) maps
        # to to_regclass; procs/views/triggers are CodeGen objects handled out of band.
        type_arg = (obj.group("type") or "").strip().upper()
        if type_arg != "U" and not _re.search(r"\btype\s*(?:=\s*N?'U'|IN\s*\(\s*N?'U'\s*\))", cond, _re.IGNORECASE):
            return None
        sch, tbl = _qualified_obj(obj.group("obj"))
        return f"to_regclass('{sch}.\"{tbl}\"') IS {'NULL' if neg else 'NOT NULL'}"
    if sys_tables == {"tables"} and (obj or name):
        if obj:
            sch, tbl = _qualified_obj(obj.group("obj"))
        else:
            tbl = name.group("name")
            ms = _re.search(r"\bSCHEMA_ID\s*\(\s*N?'([^']+)'\s*\)", cond, _re.IGNORECASE)
            sch = ms.group(1) if ms else FLYWAY_MACRO
        return f"to_regclass('{sch}.\"{tbl}\"') IS {'NULL' if neg else 'NOT NULL'}"
    return None


def _transpile_if_exists_begin(m: _IfExistsMatch) -> tuple[str, list[dict], list[dict]]:
    """IF [NOT] EXISTS(<sel>) BEGIN <body> END → PG DO $$ … IF … THEN … END IF; … $$;
    Returns (sql, unhandled, dropped) — see _transpile_plain for the accounting contract."""
    raw_body = m.group("body").strip()
    # Idempotent seed of schema-derived metadata → drop; CodeGen regenerates it.
    if _METADATA_TABLES.search(raw_body):
        return "", [], [{"kind": "IF-GUARD-METADATA", "snippet": m.group(0)[:80]}]
    # Extended-property comment dance: a guard whose body consists EXCLUSIVELY of
    # sp_add/dropextendedproperty EXECs (plus PRINT/comment noise) is SQL-Server-only —
    # PG `COMMENT ON … IS …` overwrites unconditionally and `mj codegen` re-syncs every
    # MS_Description from EntityField.Description, so the drop-then-re-add dance is a
    # no-op on PG. Drop the whole guard. A body that ALSO carries real statements (e.g.
    # a guarded INSERT before the EXEC) is NOT dropped — it flows through the normal
    # path below, where the extprop-aware segment walker handles the mix.
    if _SP_EXTPROP.search(raw_body) or _SP_DROPEXTPROP.search(raw_body):
        rest = _SP_DROPEXTPROP.sub("", _SP_EXTPROP.sub("", raw_body))
        leftover = [
            s for s in _split_top_level_statements(rest)
            if _strip_leading_sql_comments(s).strip(" \t\r\n;")
            and not _re.match(r"\s*PRINT\b", _strip_leading_sql_comments(s), _re.IGNORECASE)
        ]
        if not leftover:
            return "", [], [{"kind": "IF-GUARD-EXTPROP", "snippet": m.group(0)[:80]}]
    neg = "NOT " if m.group("neg") else ""
    cond_raw = m.group("cond").strip()
    u1: list[dict] = []
    d1: list[dict] = []
    # SS catalog guards (sys.* / OBJECT_ID()) fail at apply on PG — translate the common
    # shapes; anything unrecognized is reported whole, never emitted as sys.* SQL.
    if _SYS_CATALOG_REF.search(cond_raw):
        cond_full = _translate_sys_guard(cond_raw, bool(m.group("neg")))
        if cond_full is None:
            return "", [{"kind": "IF-EXISTS-BEGIN", "snippet": m.group(0)[:80]}], []
    else:
        cond_sql, u1, d1 = _transpile_plain(cond_raw)
        cond_inner = cond_sql.rstrip(";").strip()
        cond_full = f"{neg}EXISTS ({cond_inner})" if cond_inner else None
    # Guard blocks (IF EXISTS(...) BEGIN RAISERROR('conflict') END) → RAISE EXCEPTION — but ONLY
    # when RAISERROR is the sole governed statement. A body pairing it with real statements (e.g.
    # RAISERROR(...) then INSERT ...) cannot collapse to one RAISE (which aborts) without silently
    # dropping the siblings; report the whole guard unhandled so it is hand-authored (#3252 review).
    rr = _RAISERROR.search(raw_body)
    if rr and _raiserror_has_siblings(raw_body):
        return "", (u1 + [{"kind": "IF-EXISTS-BEGIN", "snippet": m.group(0)[:80]}]), d1
    if rr:
        msg = rr.group(1)
        msg = _pg_string(_unquote_tsql_string(msg)) if msg.lstrip("Nn").startswith("'") else "'migration guard failed'"
        body_sql, u2, d2 = f"RAISE EXCEPTION {msg};", [], []
    else:
        body_sql, u2, d2 = _transpile_extprop_segment(raw_body)
    if not cond_full or not body_sql.strip():
        return "", (u1 + u2 + [{"kind": "IF-EXISTS-BEGIN", "snippet": m.group(0)[:80]}]), (d1 + d2)
    do = (
        "DO $$\nBEGIN\n"
        f"  IF {cond_full} THEN\n"
        f"    {body_sql.strip()}\n"
        "  END IF;\nEND $$;"
    )
    return do, (u1 + u2), (d1 + d2)


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

    # File-level pass: register every BIT column so boolean comparisons in separate
    # statements can be resolved (see `_rewrite_boolean_int_comparisons`). Augment with
    # boolean columns of tables declared OUTSIDE this file (the baseline / earlier
    # migrations), supplied as JSON [["table","col"],…] in MJ_EXTRA_BIT_COLS — needed to
    # coerce 1/0 → TRUE/FALSE in seed INSERTs that target core tables (e.g. User.IsActive).
    global _BIT_COLS
    _BIT_COLS = _collect_bit_columns(sql)
    # Registry transport: prefer a file path (MJ_EXTRA_BIT_COLS_FILE) so a large
    # registry never has to ride an env var (which caps at ~128 KB and fails the
    # spawn with E2BIG). Fall back to the inline MJ_EXTRA_BIT_COLS env for callers
    # (and tests) that still set it directly.
    extra = None
    extra_file = _os.environ.get("MJ_EXTRA_BIT_COLS_FILE")
    if extra_file:
        try:
            with open(extra_file, "r", encoding="utf-8") as _f:
                extra = _f.read()
        except Exception:  # noqa: BLE001
            extra = None
    if extra is None:
        extra = _os.environ.get("MJ_EXTRA_BIT_COLS")
    if extra:
        try:
            _BIT_COLS |= {(t.lower(), c.lower()) for t, c in _json.loads(extra)}
        except Exception:  # noqa: BLE001
            pass

    dropped: list[dict] = []
    for batch in _GO_SPLIT.split(sql):
        if not batch.strip():
            continue
        out_sql, u, d = _transpile_batch(batch, pretty)
        out.extend(out_sql)
        unhandled.extend(u)
        dropped.extend(d)

    # Final safety net: the macro is protected to FLYWAY_SENTINEL by a blanket text
    # replace before parsing, and restored at the AST level in identifier_sql (identifier
    # position) and literal_sql (string-literal content). Anything sqlglot carries as
    # opaque text — chiefly trailing `/* … */` comments attached to a statement — never
    # passes through either hook, so a sentinel can survive there. Restoring it in the
    # emitted SQL guarantees no `__mj_flyway_default_schema__` ever leaks into output
    # (it is harmless in a comment, but would be a real "schema does not exist" error if
    # it ever appeared in an unhandled executable position). Text-level, post-AST.
    out = [s.replace(FLYWAY_SENTINEL, FLYWAY_MACRO) for s in out]
    # Same restoration for the gap report — snippets are shown to humans/LLMs and must
    # read as the original macro, not the internal sentinel.
    unhandled = [
        {**u, "snippet": u["snippet"].replace(FLYWAY_SENTINEL, FLYWAY_MACRO)}
        for u in unhandled
    ]
    dropped = [
        {**d, "snippet": d["snippet"].replace(FLYWAY_SENTINEL, FLYWAY_MACRO)}
        for d in dropped
    ]

    # `dropped` lists every INTENTIONALLY-discarded statement (batch-control noise, swallowed
    # routine `END`, metadata-guard drops, …) so the TS/CLI reconciliation layer (issue #3252
    # Phase 3) can account for what the dialect discarded. Backward-compatible: existing
    # consumers read only `sql`/`unhandled`.
    return {"sql": out, "unhandled": unhandled, "dropped": dropped}


# Baseline extended-property EXECs come wrapped in per-statement error handling:
#   BEGIN TRY <EXEC sp_addextendedproperty …> END TRY
#   BEGIN CATCH DECLARE @msg…; SELECT @msg=ERROR_MESSAGE()…; RAISERROR(…); SET NOEXEC ON END CATCH
# The TRY/CATCH delimiters are dropped as batch noise downstream, but the CATCH-body
# DECLARE/SELECT would surface as bogus "unhandled" procedural leaks. Strip a CATCH
# block only when its body is purely that plumbing — anything substantive stays put
# and is transpiled/reported by the batch walk.
_CATCH_BLOCK = _re.compile(r"BEGIN\s+CATCH\b(?P<body>.*?)\bEND\s+CATCH\b\s*;?", _re.IGNORECASE | _re.DOTALL)
_CATCH_NOISE_STMT = _re.compile(r"^\s*(DECLARE\b|SELECT\s+@|RAISERROR\s*\(|PRINT\b|SET\s+NOEXEC\b|THROW\b)", _re.IGNORECASE)


def _strip_catch_noise(batch: str) -> str:
    """Remove BEGIN CATCH…END CATCH wrappers whose body is purely error-reporting
    plumbing (DECLARE / SELECT @x=ERROR_*() / RAISERROR / PRINT / SET NOEXEC / THROW)."""
    def repl(m: "_re.Match") -> str:
        stmts = [s for s in _split_top_level_statements(m.group("body")) if _strip_leading_sql_comments(s).strip(" \t\r\n;")]
        return "" if all(_CATCH_NOISE_STMT.match(_strip_leading_sql_comments(s)) for s in stmts) else m.group(0)
    return _CATCH_BLOCK.sub(repl, batch)


_UNSET = object()  # "finder not yet run", distinct from a finder returning None (no match)


def _next_match(cache: dict, key: str, finder, batch: str, pos: int):
    """Memoized "next match at/after pos" for the batch walker. A cached match with
    start() >= pos is reused; a cached None is STICKY (a finder that found nothing from a
    lower pos finds nothing from a higher one); a finder is re-run only after pos advances
    PAST its last hit. Without this, the walker re-scans the whole batch with every finder on
    every iteration — O(statements × batch length), which on 50 MB baselines with thousands of
    sp_addextendedproperty envelopes turns the Python-level `_find_routine_envelope` scan into
    an O(N²) hang. With it, each finder runs O(number of its matches)."""
    cached = cache.get(key, _UNSET)
    if cached is _UNSET or (cached is not None and cached.start() < pos):
        cache[key] = finder(batch, pos)
    return cache[key]


def _transpile_batch(batch: str, pretty: bool = False) -> tuple[list[str], list[dict], list[dict]]:
    """Scan one GO batch into envelope chunks + plain SQL, transpiling each in order.
    Returns (sql_list, unhandled, dropped) — see _transpile_plain for the accounting contract."""
    out: list[str] = []
    unhandled: list[dict] = []
    dropped: list[dict] = []

    # Extended-property batches: drop the SS error-handling plumbing around the EXECs
    # (see _strip_catch_noise), then let the walk below handle EVERYTHING in the batch —
    # a CREATE INDEX / INSERT sharing the batch must transpile, never silently vanish.
    if _SP_EXTPROP.search(batch) or _SP_DROPEXTPROP.search(batch):
        batch = _strip_catch_noise(batch)

    pos = 0
    cache: dict = {}  # memoizes each finder's next hit so the walk stays O(N) (see _next_match)
    # Walk the batch, alternating between recognized envelopes and plain SQL gaps.
    while pos < len(batch):
        ext = _next_match(cache, "ext", _SP_EXTPROP.search, batch, pos)
        dxp = _next_match(cache, "dxp", _SP_DROPEXTPROP.search, batch, pos)
        ife = _next_match(cache, "ife", _find_if_exists_begin, batch, pos)
        rtn = _next_match(cache, "rtn", _find_routine_envelope, batch, pos)
        nxt = min([m for m in (ext, dxp, ife, rtn) if m], key=lambda m: m.start(), default=None)
        if nxt is None:
            gap = batch[pos:]
            if gap.strip():
                s, u, d = _transpile_plain(gap, pretty)
                if s.strip():
                    out.append(s)
                unhandled.extend(u)
                dropped.extend(d)
            break
        gap = batch[pos:nxt.start()]
        if gap.strip():
            s, u, d = _transpile_plain(gap, pretty)
            if s.strip():
                out.append(s)
            unhandled.extend(u)
            dropped.extend(d)
        if nxt is ext:
            comment = _transpile_sp_addextendedproperty(nxt.group("args"))
            if comment:
                out.append(comment)
            elif comment is None:  # "" is an intentional CodeGen-object skip, not a failure
                unhandled.append({"kind": "sp_addextendedproperty", "snippet": nxt.group(0)[:80]})
        elif nxt is dxp:
            comment = _transpile_sp_dropextendedproperty(nxt.group("args"))
            if comment:
                out.append(comment)
            elif comment is None:
                unhandled.append({"kind": "sp_dropextendedproperty", "snippet": nxt.group(0)[:80]})
        elif nxt is rtn:
            # A hand-written CREATE PROCEDURE/FUNCTION/TRIGGER can't be auto-transpiled to PG
            # (different procedural language + delimiter syntax). Report the routine WHOLE as
            # ONE gap and emit NOTHING for it — this is the containment that stops body
            # statements from escaping as top-level migration SQL (issue #3252 bugs #3/#4:
            # a body UPDATE running table-wide at apply time, a dangling END emitting as a
            # transaction-ending COMMIT, cursor fragments emitting as invalid PG). MJ's own
            # CodeGen routines are regenerated by the bake path, never routed through here.
            unhandled.append({"kind": f"CREATE-{rtn.kind}", "snippet": rtn.snippet})
        else:
            do, u, d = _transpile_if_exists_begin(nxt)
            if do.strip():
                out.append(do)
            unhandled.extend(u)
            dropped.extend(d)
        pos = nxt.end()
    return out, unhandled, dropped


if __name__ == "__main__":
    import sys, json
    if "--collect-bitcols" in sys.argv:
        # Emit [["table","col"],…] for every BIT/BOOLEAN column in the piped SQL — lets the
        # convert driver build a cross-file registry (baseline tables) for INSERT coercion.
        print(json.dumps(sorted(list(_collect_bit_columns(sys.stdin.read())))))
    else:
        result = mj_transpile(sys.stdin.read())
        print(json.dumps(result, indent=2))
