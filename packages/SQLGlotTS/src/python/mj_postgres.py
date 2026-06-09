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
            # SS date/time types are tz-aware in MJ (oracle stores them as
            # `timestamp with time zone`); sqlglot otherwise defaults to plain TIMESTAMP.
            exp.DataType.Type.DATETIME: "TIMESTAMPTZ",
            exp.DataType.Type.DATETIME2: "TIMESTAMPTZ",
            exp.DataType.Type.SMALLDATETIME: "TIMESTAMPTZ",
        }

        def identifier_sql(self, expression: exp.Identifier) -> str:
            # Restore the Flyway macro verbatim (unquoted) — AST-level, not regex.
            if expression.name == FLYWAY_SENTINEL:
                return FLYWAY_MACRO
            return super().identifier_sql(expression)

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


# Cross-statement BIT-column registry, keyed (table_lower, column_lower). Built once
# per transpile pass by `_collect_bit_columns` because a `CHECK (BitCol = 1)` often lives
# in a separate `ALTER TABLE … ADD CONSTRAINT` whose target column was declared BIT in an
# earlier CREATE TABLE / ALTER ADD COLUMN batch (so single-statement context isn't enough).
_BIT_COLS: set[tuple[str, str]] = set()


def _table_name_of(stmt: exp.Expression) -> str | None:
    """Lower-cased name of the table a CREATE/ALTER statement targets, if any."""
    if isinstance(stmt, exp.Create):
        t = stmt.this.find(exp.Table) if stmt.this else None
    elif isinstance(stmt, exp.Alter):
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
    # Parse per GO batch and tolerate failures — a single unparseable batch (common in
    # baselines) must not wipe out the whole registry.
    for batch in _GO_SPLIT.split(protected):
        if not batch.strip():
            continue
        try:
            stmts = sqlglot.parse(batch, read="tsql")
        except Exception:  # noqa: BLE001
            continue
        for st in stmts:
            if st is None:
                continue
            tbl = _table_name_of(st)
            if not tbl:
                continue
            for cd in st.find_all(exp.ColumnDef):
                if cd.kind is not None and cd.kind.this in (exp.DataType.Type.BIT, exp.DataType.Type.BOOLEAN):
                    out.add((tbl, cd.name.lower()))
    return out


def _rewrite_boolean_int_checks(stmt: exp.Expression) -> exp.Expression:
    """`CHECK (BitCol = 1/0)` → `CHECK (BitCol = TRUE/FALSE)`. After BIT→BOOLEAN, a
    `boolean = integer` comparison is a PG type error that aborts the CREATE/ALTER.
    Type-aware: rewrites equality only against a column known to be BIT/BOOLEAN — either
    declared in this same statement or, via the file-level `_BIT_COLS` registry, on the
    table this statement targets — so genuine integer checks (`Priority = 1`) are untouched."""
    bool_cols = {
        cd.name.lower()
        for cd in stmt.find_all(exp.ColumnDef)
        if cd.kind is not None and cd.kind.this in (exp.DataType.Type.BIT, exp.DataType.Type.BOOLEAN)
    }
    tbl = _table_name_of(stmt)
    if tbl:
        bool_cols |= {col for (t, col) in _BIT_COLS if t == tbl}
    if not bool_cols:
        return stmt

    def unwrap(x: exp.Expression) -> exp.Expression:
        while isinstance(x, exp.Paren):  # SS wraps the literal in parens: `IsActive = (1)`
            x = x.this
        return x

    def fix(node: exp.Expression) -> exp.Expression:
        if isinstance(node, exp.EQ):
            left, right = unwrap(node.this), unwrap(node.expression)
            col, lit = (left, right) if isinstance(left, exp.Column) else (right, left)
            if (isinstance(col, exp.Column) and col.name.lower() in bool_cols
                    and isinstance(lit, exp.Literal) and not lit.is_string and lit.name in ("0", "1")):
                return exp.EQ(this=col, expression=exp.true() if lit.name == "1" else exp.false())
        return node

    return stmt.transform(fix)


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
    """Drop SS collations (SQL_Latin1_…/_CI_/_CS_/_BIN) — PG doesn't have them."""
    if isinstance(node, exp.ColumnDef):
        kept = [
            c for c in node.args.get("constraints", [])
            if not (isinstance(c, exp.ColumnConstraint) and isinstance(c.kind, exp.CollateColumnConstraint))
        ]
        node.set("constraints", kept)
    return node


def _drop_isjson_checks(node: exp.Expression) -> exp.Expression:
    """Drop CHECK constraints using ISJSON() — PG has no ISJSON (validity enforced elsewhere).

    Handles both column-level (a constraint on a ColumnDef) and table-level
    (`CONSTRAINT ck CHECK (ISJSON(...))` in a CREATE, or `ADD CONSTRAINT ... CHECK
    (ISJSON(...))` in an ALTER). Table-level forms are removed outright (return None);
    an ALTER left with no actions is dropped downstream by the empty-ALTER guard.
    """
    if isinstance(node, exp.ColumnDef):
        kept = [
            c for c in node.args.get("constraints", [])
            if not (
                isinstance(c, exp.ColumnConstraint)
                and isinstance(c.kind, exp.CheckColumnConstraint)
                and "ISJSON" in c.kind.sql(dialect="tsql").upper()
            )
        ]
        node.set("constraints", kept)
        return node
    if isinstance(node, (exp.Constraint, exp.AddConstraint)) and "ISJSON" in node.sql(dialect="tsql").upper():
        return None
    return node


def _fold_clustered_constraints(node: exp.Expression) -> exp.Expression:
    """`PRIMARY KEY CLUSTERED (cols)` / `UNIQUE NONCLUSTERED (cols)` → PG `PRIMARY KEY (cols)` / `UNIQUE (cols)`.

    SQL Server's CLUSTERED/NONCLUSTERED qualifier parses into a sibling
    Clustered/NonClusteredColumnConstraint that holds the columns; PG has no such
    qualifier, so fold the columns into the PK/UNIQUE and drop the qualifier.
    """
    def cols_of(clustered):
        return [o.this if isinstance(o, exp.Ordered) else o for o in (clustered.this or [])]

    # PK CLUSTERED: PrimaryKeyColumnConstraint + ClusteredColumnConstraint are siblings.
    if isinstance(node, exp.Constraint):
        exprs = node.args.get("expressions") or []
        clustered = next((e for e in exprs if isinstance(e, exp.ClusteredColumnConstraint)), None)
        if clustered is not None and any(isinstance(e, exp.PrimaryKeyColumnConstraint) for e in exprs):
            node.set("expressions", [exp.PrimaryKey(expressions=cols_of(clustered))])
        return node

    # UNIQUE NONCLUSTERED: UniqueColumnConstraint wraps a NonClusteredColumnConstraint holding the cols.
    if isinstance(node, exp.UniqueColumnConstraint) and isinstance(node.this, exp.NonClusteredColumnConstraint):
        node.set("this", exp.Schema(expressions=cols_of(node.this)))
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
_SP_EXTPROP = _re.compile(
    r"EXEC(?:UTE)?\s+sp_addextendedproperty\b(?P<args>(?:'(?:[^']|'')*'|[^';])*);",
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
    actions = [f'ALTER COLUMN "{col}" TYPE {pgtype}']
    if _re.search(r"\bNOT\s+NULL\b", rest, _re.IGNORECASE):
        actions.append(f'ALTER COLUMN "{col}" SET NOT NULL')
    elif _re.search(r"\bNULL\b", rest, _re.IGNORECASE):
        actions.append(f'ALTER COLUMN "{col}" DROP NOT NULL')
    return f'ALTER TABLE {_emit_table_ref(m.group("tbl"))} ' + ", ".join(actions)


# EXEC sp_dropextendedproperty @name=N'MS_Description', … @level1name=…, @level2name=… ;
# Same envelope shape as sp_addextendedproperty but with NO @value (it removes a comment).
# Map to `COMMENT ON … IS NULL`; dropped today, so 7 stale column comments survive.
_SP_DROPEXTPROP = _re.compile(
    r"EXEC(?:UTE)?\s+sp_dropextendedproperty\b(?P<args>(?:'(?:[^']|'')*'|[^';])*);",
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
    """Split SQL on top-level `;`, ignoring semicolons inside single-quoted strings and
    `--` / `/* */` comments. Used to recover good statements when a whole-gap parse fails
    on one bad statement (a poison statement must not drop its neighbors)."""
    out: list[str] = []
    buf: list[str] = []
    i, n, in_str = 0, len(sql), False
    while i < n:
        c = sql[i]
        if in_str:
            buf.append(c)
            if c == "'":
                if i + 1 < n and sql[i + 1] == "'":  # escaped '' inside string
                    buf.append("'"); i += 2; continue
                in_str = False
            i += 1; continue
        if c == "'":
            in_str = True; buf.append(c); i += 1; continue
        if c == "-" and i + 1 < n and sql[i + 1] == "-":  # line comment
            j = sql.find("\n", i); j = n if j < 0 else j
            buf.append(sql[i:j]); i = j; continue
        if c == "/" and i + 1 < n and sql[i + 1] == "*":  # block comment
            j = sql.find("*/", i); j = n if j < 0 else j + 2
            buf.append(sql[i:j]); i = j; continue
        if c == ";":
            buf.append(";"); out.append("".join(buf)); buf = []; i += 1; continue
        buf.append(c); i += 1
    tail = "".join(buf)
    if tail.strip():
        out.append(tail)
    return out


def _parse_resilient(protected: str) -> list[tuple[exp.Expression | None, str]]:
    """Parse a SQL chunk into (statement, raw_text) pairs. Fast path: one `sqlglot.parse`.
    On failure, fall back to per-statement parsing so a single unparseable statement only
    drops itself, not the valid DDL around it (returns (None, raw) for the failures)."""
    try:
        return [(s, "") for s in sqlglot.parse(protected, read="tsql") if s is not None]
    except Exception:  # noqa: BLE001
        pass
    results: list[tuple[exp.Expression | None, str]] = []
    for piece in _split_top_level_statements(protected):
        if not piece.strip():
            continue
        try:
            for s in sqlglot.parse(piece, read="tsql"):
                if s is not None:
                    results.append((s, piece))
        except Exception:  # noqa: BLE001
            results.append((None, piece))
    return results


def _transpile_plain(sql: str) -> tuple[str, list[dict]]:
    """Transpile a chunk of regular SQL via the AST dialect; report unparseable bits."""
    out, unhandled = [], []
    protected = sql.replace(FLYWAY_MACRO, FLYWAY_SENTINEL)
    for stmt, raw in _parse_resilient(protected):
        if stmt is None:
            unhandled.append({"kind": "parse-error", "snippet": raw.strip()[:80]})
            continue
        # Standalone seed of schema-derived metadata → drop; CodeGen regenerates it.
        if isinstance(stmt, exp.Insert) and _METADATA_TABLES.search(stmt.sql(dialect="tsql")):
            continue
        # T-SQL procedural glue with no standalone PG equivalent — DECLARE @v / SET @v /
        # SELECT @v = ... / IF @v ... EXEC('...'). In Category-B (regular DDL/DML) these
        # only appear as leaked imperative logic (e.g. dynamic auto-named-constraint
        # drops); real proc/function bodies are classified hand-procedural upstream and
        # never reach here. Emitting them produces invalid `$v` SQL — report, don't emit.
        # (`@v` parses to exp.Parameter; the protected Flyway macro is an Identifier, so
        # it never false-positives here.)
        if isinstance(stmt, exp.Declare) or (
            isinstance(stmt, (exp.Set, exp.If, exp.Select, exp.Update))
            and stmt.find(exp.Parameter) is not None
        ):
            txt = stmt.sql(dialect="tsql")
            unhandled.append({"kind": _first_keyword(txt), "snippet": txt[:80]})
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
                continue
            unhandled.append({"kind": _first_keyword(txt), "snippet": txt[:80]})
            continue
        # SS session/batch-control SETs have no PG equivalent and error as unrecognized
        # config params — drop them (NOEXEC, NOCOUNT, XACT_ABORT, QUOTED_IDENTIFIER, ANSI_*).
        if isinstance(stmt, exp.Set) and _re.search(
            r"\b(NOEXEC|NOCOUNT|XACT_ABORT|QUOTED_IDENTIFIER|ANSI_NULLS|ANSI_PADDING|ANSI_WARNINGS|"
            r"ARITHABORT|CONCAT_NULL_YIELDS_NULL|NUMERIC_ROUNDABORT)\b",
            stmt.sql(dialect="tsql"), _re.IGNORECASE):
            continue
        # RAISERROR(...) at statement level is invalid PG outside a function — drop it
        # (inside an IF…BEGIN guard it is handled as RAISE EXCEPTION by the DO-block path).
        if isinstance(stmt, exp.Anonymous) and (stmt.name or "").upper() == "RAISERROR":
            continue
        if isinstance(stmt, exp.Create) and (stmt.args.get("kind") or "").upper() == "NONCLUSTERED INDEX":
            stmt.set("kind", "INDEX")  # PG has no NONCLUSTERED qualifier
        stmt = _rewrite_boolean_int_checks(stmt)
        stmt = (
            stmt.transform(_fix_misparsed_table_constraint)
            .transform(_rewrite_functions)
            .transform(_rewrite_boolean_defaults)
            .transform(_rewrite_string_concat)
            .transform(_strip_national)
            .transform(_strip_collate)
            .transform(_drop_isjson_checks)
            .transform(_fold_clustered_constraints)
            .transform(_strip_nulls_ordering)
            .transform(_column_fk_to_reference)
        )
        # An ALTER TABLE whose only action was dropped (e.g. an ISJSON ADD CONSTRAINT)
        # is left actionless — emitting bare `ALTER TABLE x` is a PG syntax error. Skip.
        if isinstance(stmt, exp.Alter) and not stmt.args.get("actions"):
            continue
        out.append(stmt.sql(dialect=MJPostgres, pretty=False, identify=True))
    return (";\n".join(out) + (";" if out else "")), unhandled


_RAISERROR = _re.compile(r"RAISERROR\s*\(\s*(N?'(?:[^']|'')*'|@?\w+)", _re.IGNORECASE)

# Schema-derived metadata tables: CodeGen regenerates these rows from schema
# introspection, so the idempotent INSERTs that seed them are Category-M (drop +
# regenerate), not DDL to transpile. (Curated metadata — AIModel, Action, etc. —
# is reseeded by `mj sync push`; only the introspection-derived tables are listed.)
# Delimiter-agnostic: matches `[EntityField]`, "EntityField", schema.EntityField, etc.
# Longer names first so EntityFieldValue isn't shadowed by EntityField/Entity.
_METADATA_TABLES = _re.compile(
    r"INSERT\s+INTO\b.{0,80}?\b(EntityFieldValue|EntityRelationship|EntityPermission|EntitySetting|EntityField|Entity)\b",
    _re.IGNORECASE | _re.DOTALL,
)


def _transpile_if_exists_begin(m: "_re.Match") -> tuple[str, list[dict]]:
    """IF [NOT] EXISTS(<sel>) BEGIN <body> END → PG DO $$ … IF … THEN … END IF; … $$;"""
    raw_body = m.group("body").strip()
    # Idempotent seed of schema-derived metadata → drop; CodeGen regenerates it.
    if _METADATA_TABLES.search(raw_body):
        return "", []
    neg = "NOT " if m.group("neg") else ""
    cond_sql, u1 = _transpile_plain(m.group("cond").strip())
    # Guard blocks (IF EXISTS(...) BEGIN RAISERROR('conflict') END) → RAISE EXCEPTION.
    rr = _RAISERROR.search(raw_body)
    if rr:
        msg = rr.group(1)
        msg = _pg_string(_unquote_tsql_string(msg)) if msg.lstrip("Nn").startswith("'") else "'migration guard failed'"
        body_sql, u2 = f"RAISE EXCEPTION {msg};", []
    else:
        body_sql, u2 = _transpile_plain(raw_body)
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

    # File-level pass: register every BIT column so boolean CHECKs in separate ALTER
    # statements can be resolved (see `_rewrite_boolean_int_checks`).
    global _BIT_COLS
    _BIT_COLS = _collect_bit_columns(sql)

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

    # Pure comment block: sp_addextendedproperty wrapped in BEGIN TRY…END CATCH error
    # handling (DECLARE @msg / SELECT @x=ERROR_*() / RAISERROR / SET NOEXEC). Emit only
    # the COMMENT ON; the entire error-handling wrapper is SS noise — drop it.
    if _SP_EXTPROP.search(batch) and not _re.search(r"\bCREATE\s+TABLE|\bALTER\s+TABLE\b", batch, _re.IGNORECASE):
        for m in _SP_EXTPROP.finditer(batch):
            comment = _transpile_sp_addextendedproperty(m.group("args"))
            if comment:
                out.append(comment)
            elif comment is None:
                unhandled.append({"kind": "sp_addextendedproperty", "snippet": m.group(0)[:80]})
        return out, unhandled

    pos = 0
    # Walk the batch, alternating between recognized envelopes and plain SQL gaps.
    while pos < len(batch):
        ext = _SP_EXTPROP.search(batch, pos)
        dxp = _SP_DROPEXTPROP.search(batch, pos)
        ife = _IF_EXISTS_BEGIN.search(batch, pos)
        nxt = min([m for m in (ext, dxp, ife) if m], key=lambda m: m.start(), default=None)
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
        elif nxt is dxp:
            comment = _transpile_sp_dropextendedproperty(nxt.group("args"))
            if comment:
                out.append(comment)
            elif comment is None:
                unhandled.append({"kind": "sp_dropextendedproperty", "snippet": nxt.group(0)[:80]})
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
