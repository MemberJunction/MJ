"""
CRUD procedure generation for the per-connection integration catalog (MJC-264 / MJ-CAT-1).

WHY THIS LIFTS INSTEAD OF AUTHORING.
Tenant CodeGen excludes the `__mj` schema, so the migration has to carry its own CRUD procedures
for the two new tables. Hand-writing them is not merely tedious, it is wrong: MJ's generated
procedures encode a set of conventions that are invisible unless you read the generated output —
the `_Clear` companion parameter that exists for nullable columns and only for nullable columns,
the `ISNULL(@X, <the column's DDL default>)` in CREATE versus `ISNULL(@X, [X])` in UPDATE, the
`nvarchar(MAX)` that keeps its modifier while `datetimeoffset(7)` loses its, the two-branch
INSERT on SQL Server that exists only so an omitted @ID falls through to `newsequentialid()`.
Each of those is a place a hand-written procedure silently diverges from what the MJ provider
expects at runtime.

So this module extracts the six real procedures for `IntegrationObject` /
`IntegrationObjectField` out of the v5.51.0 baseline and rewrites them.

WHAT "REWRITE" MEANS HERE, PRECISELY.

  1. RENAME, on whole quoted/bracketed identifiers only. `IntegrationObject` is a strict prefix
     of `IntegrationObjectField`, so a substring rewrite corrupts the field procedures. It is also
     a prefix of the column `RelatedIntegrationObjectFieldName`, which SURVIVES unchanged on the
     new table — a substring rewrite would rename a column that was never supposed to move.
     Both traps disappear if the rename only ever matches a COMPLETE delimited identifier:
     `[IntegrationObject]` cannot match inside `[IntegrationObjectField]` because of the closing
     bracket, and `"IntegrationObject"` cannot match inside `"RelatedIntegrationObjectFieldName"`
     for the same reason. That is the entire defence, and it is structural rather than
     order-dependent.

  2. DROP the columns in `drop_real`. On `CompanyIntegrationObjectField` the source columns
     `IntegrationObjectID` and `RelatedIntegrationObjectID` become VIEW ALIASES, not real
     columns. A procedure that still tried to write them would fail on the first call. Drops are
     applied to the INSERT column list BY NAME and to the VALUES list BY THE SAME INDEX, so the
     two lists cannot drift apart.

  3. ADD a parameter, an INSERT column, an INSERT value and an UPDATE SET clause for every column
     in `extra_cols`, rendered in the style the source uses for a column of the same shape:
       nullable            -> `@X_Clear bit = 0` + `CASE WHEN @X_Clear = 1 THEN NULL ELSE ISNULL(@X, <dflt>) END`
       NOT NULL w/ default -> `@X <type> = NULL`  + `ISNULL(@X, <dflt>)`
       NOT NULL no default -> `@X <type>`         + `@X`                       (required parameter)
     Verified against the baseline: `IntegrationObject.IntegrationID` is the NOT NULL/no-default
     case and is a required parameter; `AIAgent.ExecutionMode` is the NOT NULL/with-default case
     and is `= NULL` with `ISNULL(@ExecutionMode, 'Sequential')`.

  4. Never emit `__mj_CreatedAt` / `__mj_UpdatedAt`. The source procedures do not, because those
     columns are maintained by defaults and triggers.

  5. GRANTS are read out of the baseline rather than assumed. On SQL Server the six source
     procedures are granted to `cdp_Developer` and `cdp_Integration` and NOT to `cdp_UI` — the UI
     role gets the view, not the writers. The role list and the grant verb are discovered per
     procedure so that a baseline that disagrees with that description wins.

PARAMETER AND COLUMN ORDERING.
New parameters and new columns are APPENDED. Position is not load-bearing anywhere it could bite:
INSERT names its columns explicitly, UPDATE SET is a set of assignments, and the MJ provider calls
these procedures with named parameters on both dialects. Appending also keeps the generated text
diffable against the source.

DIALECT NOTES.
  * SQL Server: procedure text plus `GO` plus its grants plus `GO`, so the three strings can be
    concatenated straight into a migration without the caller having to know that
    `CREATE PROCEDURE` must begin a batch.
  * Postgres: `$$`-quoting, `RETURNS SETOF __mj."vw..."`, `#variable_conflict use_column` and the
    `DECLARE`/`BEGIN` body are preserved verbatim. Parameters live on the `CREATE FUNCTION` line
    and are split depth-aware. The v5.51.0 Postgres baseline is a pg_dump and contains NO
    `DO $do$ ... DROP FUNCTION ... $do$;` overload-dropping preamble for these functions, so none
    is emitted; the helper that would re-emit one is kept below and is a no-op unless a future
    baseline actually carries one.
"""
import re

# Columns MJ never exposes as CRUD parameters — the database maintains them.
AUDIT_COLUMNS = ('__mj_CreatedAt', '__mj_UpdatedAt')

# Matches the core schema in either form: the literal the baseline carries, or the placeholder the
# emitted migration carries after _retarget_schema. Matchers that run over BOTH need this; matchers
# that only ever see baseline text may keep the literal.
SCHEMA_RE = r'(?:__mj|\$\{mjSchema\})'

# SQL Server type names that keep their modifier in a procedure parameter. Everything else drops
# it. Verified in the baseline: `NVARCHAR(20)` -> `nvarchar(20)`, `NVARCHAR(MAX)` -> `nvarchar(MAX)`,
# but `DATETIMEOFFSET(7)` -> `datetimeoffset`.
_SS_KEEPS_MODIFIER = ('nvarchar', 'varchar', 'nchar', 'char', 'varbinary', 'binary',
                      'decimal', 'numeric')


# ---------------------------------------------------------------------------
# text utilities
# ---------------------------------------------------------------------------
def _split_top_level(s):
    """Split on commas that are not inside parentheses or a string literal."""
    out, cur, depth, instr, i = [], [], 0, False, 0
    while i < len(s):
        c = s[i]
        if instr:
            cur.append(c)
            if c == "'":
                if i + 1 < len(s) and s[i + 1] == "'":
                    cur.append("'")
                    i += 2
                    continue
                instr = False
            i += 1
            continue
        if c == "'":
            instr = True
            cur.append(c)
            i += 1
            continue
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
        if c == ',' and depth == 0:
            out.append(''.join(cur).strip())
            cur = []
            i += 1
            continue
        cur.append(c)
        i += 1
    tail = ''.join(cur).strip()
    if tail:
        out.append(tail)
    return out


def _match_paren(s, open_idx):
    """Index of the `)` matching the `(` at `open_idx`, string-aware."""
    depth, instr, i = 0, False, open_idx
    while i < len(s):
        c = s[i]
        if instr:
            if c == "'":
                if i + 1 < len(s) and s[i + 1] == "'":
                    i += 2
                    continue
                instr = False
            i += 1
            continue
        if c == "'":
            instr = True
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError('unbalanced parentheses')


def _indent(line):
    return line[:len(line) - len(line.lstrip())]


def _recomma(entries):
    """Re-apply the trailing commas across a rebuilt list of one-per-line entries."""
    stripped = [e.rstrip().rstrip(',') for e in entries]
    return [e + (',' if i < len(stripped) - 1 else '') for i, e in enumerate(stripped)]


def _strip_wrapping_parens(s):
    """`((0))` -> `0`, `('Declared')` -> `'Declared'`; only strips a paren that wraps the whole."""
    s = s.strip()
    while len(s) >= 2 and s[0] == '(' and s[-1] == ')':
        try:
            if _match_paren(s, 0) != len(s) - 1:
                break
        except ValueError:
            break
        s = s[1:-1].strip()
    return s


# ---------------------------------------------------------------------------
# type and default rendering
# ---------------------------------------------------------------------------
def _ss_param_type(decl):
    """`NVARCHAR(MAX)` -> `nvarchar(MAX)`; `DATETIMEOFFSET(7)` -> `datetimeoffset`."""
    decl = decl.strip()
    base = decl.split('(')[0].strip().lower()
    if base in _SS_KEEPS_MODIFIER and '(' in decl:
        arg = decl[decl.index('(') + 1:decl.rindex(')')].strip()
        return '%s(%s)' % (base, 'MAX' if arg.upper() == 'MAX' else arg)
    return base


def _pg_param_type(decl):
    """Postgres parameters carry no length modifier: `character varying(20)` -> `character varying`."""
    return decl.split('(')[0].strip()


def _ss_default_literal(default):
    return _strip_wrapping_parens(default) if default else None


def _pg_default_literal(default):
    if not default:
        return None
    s = re.sub(r'::[A-Za-z][A-Za-z ]*(\(\s*\d+\s*(,\s*\d+\s*)?\))?\s*$', '', default.strip()).strip()
    return s.upper() if s.lower() in ('true', 'false') else s


def _col_default(col, dialect):
    """`default` in the model is `(ss_default, pg_default)` or None."""
    d = col.get('default')
    if not d:
        return None
    ss_d, pg_d = d
    return _ss_default_literal(ss_d) if dialect == 'ss' else _pg_default_literal(pg_d)


def _col_type(col, dialect):
    return _ss_param_type(col['ss']) if dialect == 'ss' else _pg_param_type(col['pg'])


# ---------------------------------------------------------------------------
# rendering one extra column into each of the four places it has to appear
# ---------------------------------------------------------------------------
def _extra_params(col, dialect, required_allowed):
    """Parameter declarations for one extra column, `_Clear` companion first when nullable.

    `required_allowed` is False for UPDATE, where every parameter except @ID is optional.
    """
    name, typ = col['name'], _col_type(col, dialect)
    if dialect == 'ss':
        out = []
        if col['nullable']:
            out.append('@%s_Clear bit = 0' % name)
            out.append('@%s %s = NULL' % (name, typ))
        elif col.get('default') or not required_allowed:
            out.append('@%s %s = NULL' % (name, typ))
        else:
            out.append('@%s %s' % (name, typ))
        return out
    low = name.lower()
    out = []
    if col['nullable']:
        out.append('p_%s_clear boolean DEFAULT false' % low)
    out.append('p_%s %s DEFAULT NULL::%s' % (low, typ, typ))
    return out


def _extra_insert_value(col, dialect):
    name = col['name']
    dflt = _col_default(col, dialect)
    if dialect == 'ss':
        if col['nullable']:
            return 'CASE WHEN @%s_Clear = 1 THEN NULL ELSE ISNULL(@%s, %s) END' % (
                name, name, dflt or 'NULL')
        return 'ISNULL(@%s, %s)' % (name, dflt) if dflt else '@%s' % name
    low = name.lower()
    if col['nullable']:
        return 'CASE WHEN p_%s_clear = true THEN NULL ELSE COALESCE(p_%s, %s) END' % (
            low, low, dflt or 'NULL')
    return 'COALESCE(p_%s, %s)' % (low, dflt) if dflt else 'p_%s' % low


def _extra_set_clause(col, dialect):
    """UPDATE keeps the existing value when the parameter is omitted — never the DDL default."""
    name = col['name']
    if dialect == 'ss':
        if col['nullable']:
            return '[%s] = CASE WHEN @%s_Clear = 1 THEN NULL ELSE ISNULL(@%s, [%s]) END' % (
                name, name, name, name)
        return '[%s] = ISNULL(@%s, [%s])' % (name, name, name)
    low = name.lower()
    if col['nullable']:
        return '"%s" = CASE WHEN p_%s_clear = true THEN NULL ELSE COALESCE(p_%s, "%s") END' % (
            name, low, low, name)
    return '"%s" = COALESCE(p_%s, "%s")' % (name, low, name)


def _extra_column_ref(col, dialect):
    return '[%s]' % col['name'] if dialect == 'ss' else '"%s"' % col['name']


# ---------------------------------------------------------------------------
# identifier rename
# ---------------------------------------------------------------------------
def view_names(text, source_table, target_table):
    """Derive the base-view names from the source text rather than guessing a pluralisation.

    The source procedure names its own view, so the suffix (`s`, `es`, ...) is read off the
    baseline and reapplied to the target table.
    """
    m = re.search(r'\bvw' + re.escape(source_table) + r'([A-Za-z]*)', text)
    suffix = m.group(1) if m else 's'
    return 'vw' + source_table + suffix, 'vw' + target_table + suffix


def _rename_map(source_table, target_table, source_view, target_view):
    pairs = [(source_table, target_table), (source_view, target_view)]
    for verb in ('spCreate', 'spUpdate', 'spDelete'):
        pairs.append((verb + source_table, verb + target_table))
    return pairs


def _apply_rename(text, dialect, pairs):
    """Rewrite COMPLETE delimited identifiers only.

    Matching `[Name]` / `"Name"` with both delimiters is what makes this immune to the
    `IntegrationObject` / `IntegrationObjectField` prefix trap and to renaming the column
    `RelatedIntegrationObjectFieldName`.
    """
    for src, tgt in pairs:
        if dialect == 'ss':
            text = text.replace('[%s]' % src, '[%s]' % tgt)
        else:
            text = text.replace('"%s"' % src, '"%s"' % tgt)
    return text


# ---------------------------------------------------------------------------
# block surgery
# ---------------------------------------------------------------------------
def _entry_name(entry, dialect):
    m = re.search(r'\[([A-Za-z0-9_]+)\]', entry) if dialect == 'ss' \
        else re.search(r'"([A-Za-z0-9_]+)"', entry)
    return m.group(1) if m else None


def _paren_blocks(lines):
    """(start, end) for every `(` ... `)` that occupies whole lines of its own.

    In these procedures those are exactly the INSERT column lists and the VALUES lists; every
    other parenthesis in the source sits inline on its own line.
    """
    out, i = [], 0
    while i < len(lines):
        if lines[i].strip() == '(':
            j = i + 1
            while j < len(lines) and lines[j].strip() != ')':
                j += 1
            if j < len(lines):
                out.append((i, j))
                i = j
        i += 1
    return out


def _block_kind(lines, start):
    """Classify a paren block by the nearest preceding non-blank line."""
    k = start - 1
    while k >= 0 and not lines[k].strip():
        k -= 1
    prev = lines[k].strip() if k >= 0 else ''
    if prev.upper().startswith('VALUES'):
        return 'values'
    if 'INSERT INTO' in prev.upper():
        return 'columns'
    return None


def _transform_insert_blocks(lines, dialect, drop_real, extra_cols):
    """Drop and append in the INSERT column lists and their matching VALUES lists.

    Columns are dropped by NAME; values are dropped by the INDEX the name had in the column list
    immediately above, which is the only way the two lists provably stay aligned.
    """
    blocks = _paren_blocks(lines)
    edits, drop_idx = [], None
    for (start, end) in blocks:
        kind = _block_kind(lines, start)
        if kind is None:
            continue
        entries = lines[start + 1:end]
        if kind == 'columns':
            names = [_entry_name(e, dialect) for e in entries]
            drop_idx = {i for i, n in enumerate(names) if n in drop_real}
            kept = [e for i, e in enumerate(entries) if i not in drop_idx]
            pad = _indent(kept[-1]) if kept else '    '
            kept += [pad + _extra_column_ref(c, dialect) for c in extra_cols]
        else:
            if drop_idx is None:
                raise ValueError('VALUES block with no preceding column list')
            kept = [e for i, e in enumerate(entries) if i not in drop_idx]
            pad = _indent(kept[-1]) if kept else '    '
            kept += [pad + _extra_insert_value(c, dialect) for c in extra_cols]
        edits.append((start + 1, end, _recomma(kept)))
    for (a, b, new) in reversed(edits):
        lines[a:b] = new
    return lines


def _transform_set_block(lines, dialect, drop_real, extra_cols):
    """Drop and append in the UPDATE ... SET list, delimited by the bare `SET` and `WHERE` lines."""
    try:
        s = next(i for i, l in enumerate(lines) if l.strip() == 'SET')
        w = next(i for i in range(s + 1, len(lines)) if lines[i].strip() == 'WHERE')
    except StopIteration:
        raise ValueError('could not locate the UPDATE SET block')
    entries = lines[s + 1:w]
    kept = [e for e in entries if _entry_name(e, dialect) not in drop_real]
    pad = _indent(kept[-1]) if kept else '        '
    kept += [pad + _extra_set_clause(c, dialect) for c in extra_cols]
    lines[s + 1:w] = _recomma(kept)
    return lines


# ---------------------------------------------------------------------------
# parameter-list surgery
# ---------------------------------------------------------------------------
def _ss_params(text):
    """(header, param_lines, body) — the parameters are the lines between the name and `AS`."""
    lines = text.split('\n')
    a = next(i for i, l in enumerate(lines) if l.strip() == 'AS')
    return lines[0], lines[1:a], lines[a:]


def _ss_param_name(line):
    m = re.match(r'\s*@([A-Za-z0-9_]+)\b', line)
    return m.group(1) if m else None


def _transform_ss_params(text, drop_real, extra_cols, required_allowed):
    header, params, body = _ss_params(text)
    drop = set(drop_real) | {c + '_Clear' for c in drop_real}
    kept = [p for p in params if _ss_param_name(p) not in drop]
    pad = _indent(kept[-1]) if kept else '    '
    for c in extra_cols:
        kept += [pad + p for p in _extra_params(c, 'ss', required_allowed)]
    return '\n'.join([header] + _recomma(kept) + body)


def _pg_signature_span(text):
    """(open_idx, close_idx) of the CREATE FUNCTION parameter list."""
    m = re.search(r'CREATE (?:OR REPLACE )?FUNCTION ' + SCHEMA_RE + r'\."[A-Za-z0-9_]+"', text)
    if not m:
        raise ValueError('not a Postgres CREATE FUNCTION')
    o = text.index('(', m.end() - 1)
    return o, _match_paren(text, o)


def _pg_param_name(decl):
    m = re.match(r'\s*(p_[a-z0-9_]+)\b', decl)
    return m.group(1) if m else None


def _transform_pg_params(text, drop_real, extra_cols):
    o, c = _pg_signature_span(text)
    params = _split_top_level(text[o + 1:c])
    drop = {d.lower() for d in drop_real}
    drop |= {'p_' + d for d in drop} | {'p_' + d + '_clear' for d in drop}
    kept = [p for p in params if _pg_param_name(p) not in drop]
    for col in extra_cols:
        kept += _extra_params(col, 'pg', True)
    return text[:o + 1] + ', '.join(kept) + text[c:]


# ---------------------------------------------------------------------------
# grants
# ---------------------------------------------------------------------------
def source_grants(baseline, routine_name):
    """The grant statements the baseline actually issues for one routine, in file order.

    Returns [(verb, role)] — the verb is taken from the baseline so a change upstream shows up
    here instead of being papered over by an assumption.
    """
    if baseline.dialect == 'ss':
        pat = re.compile(r'GRANT (\w+) ON \[__mj\]\.\[' + re.escape(routine_name) + r'\] TO \[([^\]]+)\];')
        return [(m.group(1), m.group(2)) for m in pat.finditer(baseline.s)]
    pat = re.compile(r'GRANT (\w+) ON FUNCTION __mj\."' + re.escape(routine_name) + r'"\(')
    out = []
    for m in pat.finditer(baseline.s):
        o = m.end() - 1
        close = _match_paren(baseline.s, o)
        tail = baseline.s[close:close + 200]
        r = re.match(r'\)\s*TO\s*"([^"]+)";', tail)
        if r:
            out.append((m.group(1), r.group(1)))
    return out


def _pg_grant_signature(fn_text):
    """`p_id uuid DEFAULT NULL::uuid, ...` -> `p_id uuid, ...` for the GRANT's arg list."""
    o, c = _pg_signature_span(fn_text)
    out = []
    for p in _split_top_level(fn_text[o + 1:c]):
        out.append(re.sub(r'\s+DEFAULT\s+.*$', '', p.strip(), flags=re.S))
    return ', '.join(out)


def _render_grants(baseline, source_routine, target_routine, generated):
    grants = source_grants(baseline, source_routine)
    if not grants:
        return ''
    if baseline.dialect == 'ss':
        body = '\n'.join('GRANT %s ON [__mj].[%s] TO [%s];' % (v, target_routine, r)
                         for v, r in grants)
        return '\nGO\n\n' + body + '\nGO\n'
    sig = _pg_grant_signature(generated)
    body = '\n'.join('GRANT %s ON FUNCTION __mj."%s"(%s) TO "%s";' % (v, target_routine, sig, r)
                     for v, r in grants)
    return '\n\n' + body + '\n'


def _overload_preamble(baseline, source_routine):
    """Re-emit a `DO $do$ ... DROP FUNCTION ... $do$;` preamble only if the baseline has one.

    The v5.51.0 Postgres baseline is a pg_dump and carries none for these functions, so this
    returns '' today. It exists so a baseline that does carry one is not silently stripped.
    """
    if baseline.dialect != 'pg':
        return ''
    m = re.search(r'DO \$do\$(?:(?!\$do\$).)*DROP FUNCTION[^$]*?__mj\."' +
                  re.escape(source_routine) + r'"(?:(?!\$do\$).)*\$do\$;',
                  baseline.s, re.S)
    return m.group(0) if m else ''


# ---------------------------------------------------------------------------
# public API
# ---------------------------------------------------------------------------
def _retarget_schema(text, dialect):
    """Rewrite the core schema from the literal the baseline carries to the tenant placeholder.

    The baseline is generated output and names `__mj` literally. Every tenant declares
    `schemaPlaceholders: [{schema: '__mj', placeholder: 'mjSchema'}]`, so the placeholder resolves
    to the same thing here — but the rest of this migration uses the placeholder, and a file that
    is half literal and half placeholder is a file that half-applies to the wrong schema the first
    time a workspace declares a different core schema. On Postgres that is not even a subtle
    failure: `RETURNS SETOF __mj."vwCompanyIntegrationObjects"` would name a view the migration
    created somewhere else, and CREATE FUNCTION would fail outright.

    The placeholder cannot be the flyway default-schema built-in, which under `--schema` resolves
    to the migration's own HISTORY schema rather than the core one.

    THE TRAP: `__mj_CreatedAt` and `__mj_UpdatedAt` are COLUMN names that begin with the same four
    characters. A substring replace would rename them and every write would fail on a column that
    does not exist. Both patterns below are anchored on the delimiter that can only follow a schema
    name — `[__mj].[` and `__mj."` — and a column name always carries `__mj_` INSIDE its delimiter,
    so neither pattern can reach one. Verified against the emitted files: those are the only two
    forms of schema reference either dialect produces.
    """
    if dialect == 'ss':
        return text.replace('[__mj].[', '[${mjSchema}].[')
    return text.replace('__mj."', '${mjSchema}."')


def build_crud(baseline, source_table, target_table, extra_cols, drop_real):
    """Return {'create': sql, 'update': sql, 'delete': sql} for `target_table`.

    `extra_cols` are model.py column dicts appended to the table; `drop_real` are source column
    names that become view aliases on the target and therefore must not be written.
    """
    dialect = baseline.dialect
    extra_cols = [c for c in extra_cols if c['name'] not in AUDIT_COLUMNS]
    drop_real = set(drop_real)

    out = {}
    for op in ('create', 'update', 'delete'):
        source_routine = 'sp%s%s' % (op.capitalize(), source_table)
        target_routine = 'sp%s%s' % (op.capitalize(), target_table)
        text = baseline.routine(source_routine)
        if not text:
            raise ValueError('%s not found in the %s baseline' % (source_routine, dialect))

        src_view, tgt_view = view_names(text, source_table, target_table)
        text = _apply_rename(text, dialect,
                             _rename_map(source_table, target_table, src_view, tgt_view))

        if op != 'delete':
            if dialect == 'ss':
                text = _transform_ss_params(text, drop_real, extra_cols,
                                            required_allowed=(op == 'create'))
            else:
                text = _transform_pg_params(text, drop_real, extra_cols)
            lines = text.split('\n')
            if op == 'create':
                lines = _transform_insert_blocks(lines, dialect, drop_real, extra_cols)
            else:
                lines = _transform_set_block(lines, dialect, drop_real, extra_cols)
            text = '\n'.join(lines)

        pre = _overload_preamble(baseline, source_routine)
        if pre:
            pre = _apply_rename(pre, dialect,
                                _rename_map(source_table, target_table, src_view, tgt_view)) + '\n\n'
        out[op] = _retarget_schema(
            pre + text + _render_grants(baseline, source_routine, target_routine, text), dialect)
    return out


def build_drop_crud(dialect, target_table):
    """DROP statements for the undo migration, in reverse of creation order (delete, update, create).

    Postgres drops by bare name, which requires PG 10+ and a non-overloaded name; both hold — the
    migration is the only thing that ever creates these functions, and it creates exactly one
    overload of each.
    """
    ops = ['Delete', 'Update', 'Create']
    if dialect == 'ss':
        body = '\n'.join('DROP PROCEDURE IF EXISTS [__mj].[sp%s%s];\nGO' % (op, target_table)
                          for op in ops) + '\n'
    else:
        body = '\n'.join('DROP FUNCTION IF EXISTS __mj."sp%s%s";' % (op, target_table)
                          for op in ops) + '\n'
    return _retarget_schema(body, dialect)


# ---------------------------------------------------------------------------
# self-verification
# ---------------------------------------------------------------------------
def _strip_comments_and_strings(sql):
    out, i, n = [], 0, len(sql)
    while i < n:
        c = sql[i]
        if c == '-' and sql[i:i + 2] == '--':
            i = sql.find('\n', i)
            if i == -1:
                break
            continue
        if c == '/' and sql[i:i + 2] == '/*':
            j = sql.find('*/', i)
            i = n if j == -1 else j + 2
            continue
        if c == "'":
            i += 1
            while i < n:
                if sql[i] == "'":
                    if sql[i:i + 2] == "''":
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            continue
        out.append(c)
        i += 1
    return ''.join(out)


def _paren_balance(sql):
    t = _strip_comments_and_strings(sql)
    depth = 0
    for c in t:
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth < 0:
                return -1
    return depth


def _count_params(sql, dialect):
    if dialect == 'ss':
        _, params, _ = _ss_params(sql.split('\nGO\n')[0])
        return len([p for p in params if _ss_param_name(p)])
    o, c = _pg_signature_span(sql)
    return len(_split_top_level(sql[o + 1:c]))


if __name__ == '__main__':
    import os
    import sys

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from baseline import Baseline
    import model

    SCRATCH = os.environ.get(
        'MJ_BASELINE_DIR',
        '/private/tmp/claude-501/-Users-madhav-Projects-platform/'
        '439508c4-ba78-4d78-918a-a497fc998308/scratchpad')

    # Legitimate survivors of a bare `IntegrationObject` token: columns that deliberately keep
    # their source name, and the FK columns that deliberately point AT the declared catalog.
    ALLOWED_BARE = ['RelatedIntegrationObjectFieldName',
                    'IntegrationObjectFieldID',
                    'IntegrationObjectID']

    CASES = [
        ('IntegrationObject', model.TABLE_CIO, model.CIO_EXTRA, [], model.VIEW_CIO),
        ('IntegrationObjectField', model.TABLE_CIOF, model.CIOF_EXTRA,
         model.CIOF_DROP_REAL, model.VIEW_CIOF),
    ]

    results = []

    def check(label, ok, detail=''):
        results.append(ok)
        print('%-6s %s%s' % ('PASS' if ok else 'FAIL', label, ('  -- ' + detail) if detail else ''))

    for dialect, fname in (('ss', 'mj-base-ss.sql'), ('pg', 'mj-base-pg.sql')):
        path = os.path.join(SCRATCH, fname)
        if not os.path.exists(path):
            print('FAIL   baseline missing: %s' % path)
            results.append(False)
            continue
        b = Baseline(open(path, encoding='utf-8', errors='replace').read(), dialect)

        for (src, tgt, extras, drops, expect_view) in CASES:
            tag = '[%s %s]' % (dialect, tgt)
            crud = build_crud(b, src, tgt, extras, drops)

            print()
            print('--- %s ---' % tag)
            for op in ('create', 'update', 'delete'):
                print('    %-6s %4d lines' % (op, len(crud[op].splitlines())))

            # 1. non-empty and naming the target
            check('%s non-empty and names the target table' % tag,
                  all(crud[op].strip() and tgt in crud[op] for op in crud))

            # 1b. the derived view name agrees with the model
            sv, tv = view_names(b.routine('spCreate' + src), src, tgt)
            check('%s derived base view == model (%s)' % (tag, tv), tv == expect_view,
                  'derived %s, model %s' % (tv, expect_view))

            # 2. THE PREFIX TRAP. No surviving reference to the SOURCE object in any form.
            src_view, _ = view_names(b.routine('spCreate' + src), src, tgt)
            forbidden = []
            for name in [src, src_view] + ['sp%s%s' % (v, src) for v in ('Create', 'Update', 'Delete')]:
                forbidden += (['[%s]' % name] if dialect == 'ss' else ['"%s"' % name])
            hits = {op: [f for f in forbidden if f in crud[op]] for op in crud}
            check('%s no surviving source object reference' % tag,
                  not any(hits.values()), repr({k: v for k, v in hits.items() if v}))

            # 2b. Every bare `IntegrationObject` not preceded by `Company` must be an allowlisted
            #     column name — this is what the corruption would look like if step 2 had used a
            #     substring rewrite instead of a delimited-identifier rewrite.
            allow = {a.lower() for a in ALLOWED_BARE}
            bad = {}
            for op in crud:
                sql, stray = crud[op], []
                for m in re.finditer(r'(?<!Company)IntegrationObject', sql):
                    a, e = m.start(), m.end()
                    while a > 0 and (sql[a - 1].isalnum() or sql[a - 1] == '_'):
                        a -= 1
                    while e < len(sql) and (sql[e].isalnum() or sql[e] == '_'):
                        e += 1
                    ident = sql[a:e]
                    norm = re.sub(r'_clear$', '', re.sub(r'^p_', '', ident, flags=re.I), flags=re.I)
                    if norm.lower() not in allow:
                        stray.append(ident)
                if stray:
                    bad[op] = sorted(set(stray))
            check('%s stray bare source-name tokens are all allowlisted columns' % tag,
                  not bad, repr(bad))

            # 2c. the column that must NOT have been renamed
            if src.endswith('Field'):
                kept_ok = ('RelatedIntegrationObjectFieldName' in crud['create'] and
                           'RelatedCompanyIntegrationObjectFieldName' not in crud['create'])
                check('%s RelatedIntegrationObjectFieldName survives unrenamed' % tag, kept_ok)

            # 2d. THE GENERAL FORM of 2c: every source column that is not dropped keeps its EXACT
            #     name. A substring rewrite renames columns, not just objects, and only this
            #     catches it for columns nobody thought to name in a test.
            src_cols = [c[0] for c in b.table_columns(src)]
            survivors = [c for c in src_cols if c not in drops and c not in AUDIT_COLUMNS]
            for op in ('create', 'update'):
                delim = '[%s]' if dialect == 'ss' else '"%s"'
                lost = [c for c in survivors if (delim % c) not in crud[op]]
                check('%s %s keeps all %d surviving source columns verbatim'
                      % (tag, op, len(survivors)), not lost, repr(lost))

            # 3. every extra column present in the create procedure
            missing = [c['name'] for c in extras if c['name'] not in crud['create']]
            check('%s all %d extra columns in create' % (tag, len(extras)), not missing, repr(missing))
            missing_u = [c['name'] for c in extras if c['name'] not in crud['update']]
            check('%s all extra columns in update' % tag, not missing_u, repr(missing_u))

            # 4. no dropped column anywhere
            def _mentions(sql, col):
                delim = ('[%s]' % col) if dialect == 'ss' else ('"%s"' % col)
                param = ('@%s' % col) if dialect == 'ss' else ('p_%s' % col.lower())
                return delim in sql or re.search(re.escape(param) + r'(?![A-Za-z0-9_])', sql)
            still = sorted({'%s/%s' % (op, c) for op in crud for c in drops if _mentions(crud[op], c)})
            check('%s no drop_real column in any routine' % tag, not still, repr(still))

            # 5. parameter arithmetic
            src_txt = b.routine('spCreate' + src)
            n_src = _count_params(src_txt, dialect)
            n_drop = 0
            if dialect == 'ss':
                _, sp, _ = _ss_params(src_txt)
                dset = set(drops) | {d + '_Clear' for d in drops}
                n_drop = len([p for p in sp if _ss_param_name(p) in dset])
            else:
                o, c = _pg_signature_span(src_txt)
                dset = {'p_' + d.lower() for d in drops} | {'p_' + d.lower() + '_clear' for d in drops}
                n_drop = len([p for p in _split_top_level(src_txt[o + 1:c])
                              if _pg_param_name(p) in dset])
            n_extra = sum(len(_extra_params(c, dialect, True)) for c in extras)
            n_gen = _count_params(crud['create'], dialect)
            check('%s create params %d = %d source - %d dropped + %d extra'
                  % (tag, n_gen, n_src, n_drop, n_extra),
                  n_gen == n_src - n_drop + n_extra,
                  'generated %d, expected %d' % (n_gen, n_src - n_drop + n_extra))

            # 5b. every INSERT column list and its VALUES list have the same number of entries.
            #     This is what catches a drop or an append applied to one list and not the other.
            lns = crud['create'].split('\n')
            blks = [(s, e, _block_kind(lns, s)) for (s, e) in _paren_blocks(lns)]
            blks = [x for x in blks if x[2]]
            pairs_ok, sizes = bool(blks) and len(blks) % 2 == 0, []
            for i in range(0, len(blks) - 1, 2):
                (cs, ce, ck), (vs, ve, vk) = blks[i], blks[i + 1]
                n_cols, n_vals = ce - cs - 1, ve - vs - 1
                sizes.append((n_cols, n_vals))
                if ck != 'columns' or vk != 'values' or n_cols != n_vals:
                    pairs_ok = False
            check('%s INSERT column/value lists aligned %s' % (tag, sizes), pairs_ok)

            # 6. parentheses and $$ balance
            for op in crud:
                bal = _paren_balance(crud[op])
                check('%s %s parentheses balance' % (tag, op), bal == 0, 'depth %d' % bal)
                if dialect == 'pg':
                    n = crud[op].count('$$')
                    check('%s %s $$ markers balance (%d)' % (tag, op, n), n % 2 == 0 and n >= 2)

            # 7. grants: present, same roles as the source, retargeted
            for op in crud:
                sname = 'sp%s%s' % (op.capitalize(), src)
                tname = 'sp%s%s' % (op.capitalize(), tgt)
                sg = source_grants(b, sname)
                roles = [r for _, r in sg]
                if dialect == 'ss':
                    got = re.findall(r'GRANT (\w+) ON \[' + SCHEMA_RE + r'\]\.\[' + tname + r'\] TO \[([^\]]+)\];',
                                     crud[op])
                    # the procedure body is everything before the first batch separator, and every
                    # grant must sit after it
                    head, sep, tail = crud[op].partition('\nGO\n')
                    after = bool(sep) and 'CREATE PROCEDURE' in head and 'GRANT' not in head \
                        and tail.strip().startswith('GRANT')
                    check('%s %s grant follows the procedure, roles %s' % (tag, op, roles),
                          bool(got) and [r for _, r in got] == roles and
                          [v for v, _ in got] == [v for v, _ in sg] and after,
                          'source %r generated %r' % (sg, got))
                    check('%s %s grant excludes the UI role' % (tag, op),
                          not any('UI' in r for r in roles), repr(roles))
                else:
                    got = re.findall(r'GRANT (\w+) ON FUNCTION ' + SCHEMA_RE + r'\."' + tname + r'"\(.*?\) TO "([^"]+)";',
                                     crud[op], re.S)
                    check('%s %s grant present, roles %s' % (tag, op, roles),
                          bool(got) and [r for _, r in got] == roles and
                          [v for v, _ in got] == [v for v, _ in sg],
                          'source %r generated %r' % (sg, got))

        # undo
        for (_, tgt, _, _, _) in CASES:
            d = build_drop_crud(dialect, tgt)
            order = re.findall(r'sp(Create|Update|Delete)' + tgt, d)
            check('[%s %s] drop order is reverse (%s)' % (dialect, tgt, ','.join(order)),
                  order == ['Delete', 'Update', 'Create'])

        # The core schema must be the PLACEHOLDER everywhere, never the literal the baseline
        # carries. A file that is half literal and half placeholder half-applies to the wrong
        # schema the moment a workspace declares a different core schema, and on Postgres
        # `RETURNS SETOF <literal>."vw..."` fails at CREATE FUNCTION against a view this migration
        # created under the placeholder. The two audit COLUMNS start with the same four characters
        # and must survive untouched, so both halves are asserted.
        schema_ref = (r'\[__mj\]\.') if dialect == 'ss' else (r'__mj\."')
        for (src, tgt, extras, drops, _) in CASES:
            blob = ''.join(build_crud(b, src, tgt, extras, drops).values())
            blob += build_drop_crud(dialect, tgt)
            leaked = re.findall(schema_ref, blob)
            check('[%s %s] no literal core schema survives' % (dialect, tgt),
                  not leaked, '%d occurrence(s)' % len(leaked))
            # The audit columns share the literal's first four characters. If the retarget were a
            # naive substring replace it would rename them, so assert they are present in the
            # output exactly when the source procedure mentions them.
            src_text = b.routine('spCreate' + src) or ''
            check('[%s %s] audit column names survive the retarget' % (dialect, tgt),
                  ('__mj_CreatedAt' in blob) == ('__mj_CreatedAt' in src_text))

    print()
    print('=' * 72)
    print('%d checks, %d passed, %d FAILED' % (len(results), sum(results), len(results) - sum(results)))
    sys.exit(0 if all(results) else 1)
