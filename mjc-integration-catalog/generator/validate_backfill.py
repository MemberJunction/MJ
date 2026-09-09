#!/usr/bin/env python3
"""File-level validation of the BACKFILL migration pair (V/U 202609092100), both dialects.

`validate.py` checks the migration that CREATES the per-connection catalog. This checks the one
that FILLS it. They are separate files because they fail in different ways: the create migration
can put tables in the wrong schema or lose its metadata to R__RefreshMetadata, while the backfill
can silently write the wrong ids into the right columns.

    python3 scripts/catalog-migration/validate_backfill.py \
            tenant-migrations/mjc-integration-catalog/postgres \
            tenant-migrations/mjc-integration-catalog/sqlserver

    python3 scripts/catalog-migration/validate_backfill.py --self-test \
            tenant-migrations/mjc-integration-catalog/postgres \
            tenant-migrations/mjc-integration-catalog/sqlserver

--self-test mutates the migration text IN MEMORY, one rule at a time, and asserts that each
mutation is caught and that two deliberately harmless mutations are NOT. A checker that has only
ever seen correct input proves nothing; this is how it earns the right to be believed.

Three checks are worth reading before changing anything:

  * THE COLUMN-COUNT PAIR. The INSERT column list and the SELECT list are matched by POSITION.
    A missing or extra select item shifts every column after it, and because most of the copied
    columns are nullable text the database will happily accept the shifted row. Nothing downstream
    would report it. So both lists are extracted and compared, name by name and length by length.

  * THE RELATED-ID SENTINEL. CompanyIntegrationObjectField.RelatedCompanyIntegrationObjectID must
    be inserted as NULL and filled in by the separate resolution UPDATE. If the INSERT copied the
    source's RelatedIntegrationObjectID straight across, the column would hold an id belonging to
    a DIFFERENT table — the foreign key would not catch it on Postgres until commit and every
    dependency edge would resolve to nothing. So the select item at that position is asserted to
    be a NULL cast, and the resolution UPDATE is asserted to come after both INSERTs.

  * THE SCHEMA-LITERAL TRAP. `__mj_CreatedAt` is a COLUMN name that shares its first four
    characters with the literal core schema `__mj`. Searching for `__mj` therefore flags every
    correct file. Every check here anchors on the delimiter that can only follow a SCHEMA name:
    `__mj."` on Postgres, `[__mj].[` on SQL Server.
"""
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import model  # noqa: E402  — the declared extra columns and their names

BACKFILL_TOKEN = 'BackfillFromSharedCatalog'
CREATE_TOKEN = 'CompanyIntegrationObjects'
CREATE_VERSION = '202609091900'

TABLE_CIO = model.TABLE_CIO
TABLE_CIOF = model.TABLE_CIOF

# Columns MemberJunction owns. Never in an insert list: both have table defaults, and writing them
# by hand backdates or forward-dates rows the platform believes it stamped itself.
AUDIT = ('__mj_CreatedAt', '__mj_UpdatedAt')

# Every table the backfill is allowed to name. Each must be reached through the placeholder.
KNOWN_TABLES = (
    'CompanyIntegration', 'CompanyIntegrationObject', 'CompanyIntegrationObjectField',
    'IntegrationObject', 'IntegrationObjectField',
    'CompanyIntegrationEntityMap', 'CompanyIntegrationFieldMap',
)


# ---------------------------------------------------------------------------------------------
# Lexing. One pass, comments dropped before their apostrophes can be mistaken for string starts —
# every one of these files says "that connection's integration" somewhere in a comment.
# ---------------------------------------------------------------------------------------------
def strip_comments(sql):
    out, i, n = [], 0, len(sql)
    in_string = False
    while i < n:
        ch = sql[i]
        if in_string:
            out.append(ch)
            if ch == "'":
                if i + 1 < n and sql[i + 1] == "'":
                    out.append("'")
                    i += 2
                    continue
                in_string = False
            i += 1
        elif ch == "'":
            in_string = True
            out.append(ch)
            i += 1
        elif ch == '-' and i + 1 < n and sql[i + 1] == '-':
            while i < n and sql[i] != '\n':
                i += 1
        else:
            out.append(ch)
            i += 1
    return ''.join(out)


def split_top_level(text):
    """Split on commas that are not inside parentheses or string literals."""
    parts, depth, buf, in_string, i, n = [], 0, [], False, 0, len(text)
    while i < n:
        ch = text[i]
        if in_string:
            buf.append(ch)
            if ch == "'":
                if i + 1 < n and text[i + 1] == "'":
                    buf.append("'")
                    i += 2
                    continue
                in_string = False
        elif ch == "'":
            in_string = True
            buf.append(ch)
        elif ch == '(':
            depth += 1
            buf.append(ch)
        elif ch == ')':
            depth -= 1
            buf.append(ch)
        elif ch == ',' and depth == 0:
            parts.append(''.join(buf).strip())
            buf = []
        else:
            buf.append(ch)
        i += 1
    tail = ''.join(buf).strip()
    if tail:
        parts.append(tail)
    return parts


def _match_paren(text, open_idx):
    depth, i, n, in_string = 0, open_idx, len(text), False
    while i < n:
        ch = text[i]
        if in_string:
            if ch == "'":
                in_string = False
        elif ch == "'":
            in_string = True
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def quoted(name, dialect):
    return '[%s]' % name if dialect == 'ss' else '"%s"' % name


def qualified(name, dialect):
    """The placeholder-qualified name AS THE FILE WRITES IT. The two dialects differ in where the
    brackets go — `[${mjSchema}].[T]` versus `${mjSchema}."T"` — and a check that assumes the
    Postgres shape silently matches NOTHING on SQL Server and passes vacuously."""
    return ('[${mjSchema}].[%s]' % name) if dialect == 'ss' else ('${mjSchema}."%s"' % name)


def writes_to(sql, name, dialect):
    """True if `name` is the target of an INSERT/UPDATE/DELETE, whatever schema prefix is used."""
    return re.search(r'(?i)(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[^\s;()]*%s'
                     % re.escape(quoted(name, dialect)), sql) is not None


def extract_insert(sql_nocomments, table, dialect):
    """Return (column_names, select_items) for the INSERT..SELECT into `table`, or (None, None)."""
    marker = re.search(r'INSERT\s+INTO\s+\S*%s\s*\(' % re.escape(quoted(table, dialect)),
                       sql_nocomments)
    if not marker:
        return None, None
    open_idx = marker.end() - 1
    close_idx = _match_paren(sql_nocomments, open_idx)
    if close_idx < 0:
        return None, None
    cols = [c.strip().strip('[]"') for c in
            split_top_level(sql_nocomments[open_idx + 1:close_idx])]

    sel = re.search(r'\bSELECT\b', sql_nocomments[close_idx:])
    if not sel:
        return cols, None
    sel_start = close_idx + sel.end()
    rest = sql_nocomments[sel_start:]
    depth, i, in_string, frm = 0, 0, False, None
    while i < len(rest):
        ch = rest[i]
        if in_string:
            if ch == "'":
                in_string = False
        elif ch == "'":
            in_string = True
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        elif depth == 0 and rest[i:i + 4].upper() == 'FROM' and (i == 0 or not rest[i - 1].isalnum()):
            frm = i
            break
        i += 1
    if frm is None:
        return cols, None
    return cols, split_top_level(rest[:frm])


# ---------------------------------------------------------------------------------------------
# The checks
# ---------------------------------------------------------------------------------------------
def check_pair(v, u, ddl, dialect):
    """v/u/ddl are file TEXT. Returns a list of (ok, message)."""
    T = '[%s]' % dialect
    r = []

    def ck(cond, msg, detail=''):
        r.append((bool(cond), msg + (('  -> %s' % (detail,)) if detail and not cond else '')))

    vc = strip_comments(v)
    uc = strip_comments(u)

    # -- schema addressing -------------------------------------------------------------------
    # The flyway built-in resolves to the migration's own HISTORY schema under --schema, and
    # placeholders are substituted inside comments too, so this is checked on the RAW text.
    ck('flyway:defaultSchema' not in v and 'flyway:defaultSchema' not in u,
       '%s no flyway default-schema placeholder — it resolves to the HISTORY schema under --schema' % T)
    ck('${mjSchema}' in v and '${mjSchema}' in u,
       '%s addresses the core schema through the placeholder' % T)

    # The trap: __mj_CreatedAt is a COLUMN sharing the schema literal's first four characters, so
    # anchor on the delimiter that can only follow a schema name.
    lit = r'\[__mj\]\.\[' if dialect == 'ss' else r'__mj\."'
    ck(not re.findall(lit, v), '%s V never names the literal core schema' % T,
       '%d literal reference(s)' % len(re.findall(lit, v)))
    ck(not re.findall(lit, u), '%s U never names the literal core schema' % T,
       '%d literal reference(s)' % len(re.findall(lit, u)))
    ck('__mj_CreatedAt' in v,
       '%s the audit COLUMN name survived — proof the schema check is anchored, not a substring scan' % T)

    # Every table reached from FROM/JOIN/INTO/UPDATE must be qualified with the placeholder.
    if dialect == 'ss':
        quals = re.findall(r'\b(?:FROM|JOIN|INTO|UPDATE)\s+\[([^\]]+)\]\.\[', vc, re.I)
    else:
        quals = re.findall(r'\b(?:FROM|JOIN|INTO|UPDATE)\s+([^\s(]+)\."', vc, re.I)
    bad = sorted({q for q in quals if q != '${mjSchema}'})
    ck(not bad, '%s every schema-qualified table reference uses the placeholder' % T, bad)
    ck(len(quals) >= 8, '%s the placeholder actually qualifies the table references' % T, len(quals))

    # -- the two INSERT..SELECT statements -----------------------------------------------------
    expected = {}
    for tbl in (TABLE_CIO, TABLE_CIOF):
        m = re.search(r'CREATE TABLE[^(]*%s\s*\(' % re.escape(quoted(tbl, dialect)), ddl)
        if not m:
            expected[tbl] = None
            continue
        body = ddl[m.end() - 1:_match_paren(ddl, m.end() - 1) + 1]
        pat = r'^\s+\[([A-Za-z_][A-Za-z0-9_]*)\]' if dialect == 'ss' \
            else r'^\s+"([A-Za-z_][A-Za-z0-9_]*)"'
        expected[tbl] = [c for c in re.findall(pat, body, re.M)
                         if c != 'ID' and c not in AUDIT]

    declared = {TABLE_CIO: [c['name'] for c in model.CIO_EXTRA],
                TABLE_CIOF: [c['name'] for c in model.CIOF_EXTRA]}

    inserts = {}
    for tbl in (TABLE_CIO, TABLE_CIOF):
        cols, sel = extract_insert(vc, tbl, dialect)
        inserts[tbl] = (cols, sel)
        ck(cols is not None and sel is not None,
           '%s %s has an INSERT..SELECT the parser can read' % (T, tbl))
        if cols is None or sel is None:
            continue

        # Every column declared in model.py is present EXACTLY ONCE. A duplicate is a syntax
        # error the database would catch; a missing one silently takes the column default, which
        # for IsSelected means "not selected" for the whole workspace.
        for name in declared[tbl]:
            ck(cols.count(name) == 1,
               '%s %s.%s appears exactly once in the INSERT column list' % (T, tbl, name),
               'count=%d' % cols.count(name))

        # And every real column of the table, from the DDL that created it.
        if expected[tbl] is not None:
            missing = [c for c in expected[tbl] if c not in cols]
            extra = [c for c in cols if c not in expected[tbl]]
            ck(not missing, '%s %s inserts every non-generated column' % (T, tbl), missing)
            ck(not extra, '%s %s inserts nothing the table does not have' % (T, tbl), extra)
            dupes = sorted({c for c in cols if cols.count(c) > 1})
            ck(not dupes, '%s %s has no duplicated insert column' % (T, tbl), dupes)

        # POSITIONAL alignment. A shifted list is accepted by the database and reported by nothing.
        ck(len(cols) == len(sel),
           '%s %s column list and SELECT list are the same length' % (T, tbl),
           '%d columns vs %d select items' % (len(cols), len(sel)))

        # Equal LENGTH is not enough: two shared columns swapped keeps the count and still writes
        # each value into the wrong column. Every copied column must be fed by a plain reference to
        # the SAME-NAMED source column. Only the columns declared in model.py are allowed a
        # computed or renamed source (CompanyIntegrationID <- ci.ID, FirstSeenAt <- __mj_CreatedAt,
        # and so on), and those are checked by name elsewhere.
        if len(cols) == len(sel):
            crossed = []
            for col, item in zip(cols, sel):
                if col in declared[tbl]:
                    continue
                want = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*\.%s$' % re.escape(quoted(col, dialect)))
                if not want.match(item.strip()):
                    crossed.append('%s <- %s' % (col, item.strip()[:40]))
            ck(not crossed,
               '%s %s copies every shared column from the same-named source column' % (T, tbl),
               crossed)

        # MJ owns the audit columns; both have defaults.
        for a in AUDIT:
            ck(a not in cols, '%s %s never inserts %s — MemberJunction owns it' % (T, tbl, a))
        ck('ID' not in cols,
           '%s %s never inserts ID — the table default mints it' % (T, tbl))

        # Idempotency: a NOT EXISTS guard on this table's own unique key, not ON CONFLICT/MERGE.
        guard = quoted('CompanyIntegrationID' if tbl == TABLE_CIO else 'CompanyIntegrationObjectID',
                       dialect)
        stmt = vc[vc.index('INSERT INTO'):] if 'INSERT INTO' in vc else ''
        ck('NOT EXISTS' in stmt, '%s %s is guarded by NOT EXISTS' % (T, tbl))
        ck(guard in vc, '%s %s guard is keyed on the unique key column' % (T, tbl))

    ck('ON CONFLICT' not in vc.upper(),
       '%s no ON CONFLICT — the guard must read the same in both dialects' % T)
    ck(not re.search(r'\bMERGE\s+INTO\b', vc, re.I),
       '%s no MERGE — the guard must read the same in both dialects' % T)
    ck(vc.upper().count('NOT EXISTS') == 2, '%s exactly two idempotency guards' % T,
       vc.upper().count('NOT EXISTS'))

    # -- the related-id sentinel ---------------------------------------------------------------
    cols, sel = inserts[TABLE_CIOF]
    if cols and sel and len(cols) == len(sel) and 'RelatedCompanyIntegrationObjectID' in cols:
        item = sel[cols.index('RelatedCompanyIntegrationObjectID')]
        ck(re.match(r'(?i)^CAST\s*\(\s*NULL\s+AS\b', item.strip()),
           '%s CIOF.RelatedCompanyIntegrationObjectID is inserted as NULL, then resolved' % T,
           item.strip()[:60])
        ck('RelatedIntegrationObjectID' not in item,
           '%s CIOF.RelatedCompanyIntegrationObjectID does NOT copy the shared id — that id lives '
           'in a different table and every dependency edge would resolve to nothing' % T,
           item.strip()[:60])
    else:
        ck(False, '%s CIOF related-id select item could not be located' % T)

    # -- statement ordering --------------------------------------------------------------------
    i_obj = vc.find('INSERT INTO %s (' % qualified(TABLE_CIO, dialect))
    i_fld = vc.find('INSERT INTO %s (' % qualified(TABLE_CIOF, dialect))
    # A bare search for 'UPDATE' finds UpdateAPIPath, UpdateMethod and __mj_UpdatedAt long before
    # the statement. Anchor on a statement-leading keyword instead.
    m_upd = re.search(r'(?im)^\s*UPDATE\s', vc)
    i_upd = m_upd.start() if m_upd else -1
    ck(i_obj >= 0 and i_fld >= 0 and i_upd >= 0,
       '%s all three statements are present (objects, fields, edge resolution)' % T)
    ck(0 <= i_obj < i_fld,
       '%s objects are inserted before fields — a field needs its owning object to exist' % T,
       'objects@%d fields@%d' % (i_obj, i_fld))
    ck(i_upd > i_fld >= 0,
       '%s the edge resolution runs after BOTH inserts — it reads rows both of them created' % T,
       'update@%d fields@%d' % (i_upd, i_fld))
    ck(re.search(r'(?i)\bSET\b[^;]*RelatedCompanyIntegrationObjectID', vc[i_upd:] if i_upd >= 0 else ''),
       '%s the resolution UPDATE assigns RelatedCompanyIntegrationObjectID' % T)

    # -- the rules that make the backfill correct ----------------------------------------------
    # Paused connections must be copied too, or resuming one later hits the fail-loud check.
    ck(not re.search(r'(?i)IsActive', vc),
       '%s does not filter on IsActive — a paused connection must survive the cutover' % T)
    # Catalog membership: Active or Disabled, never Deprecated.
    ck(vc.count("IN ('Active', 'Disabled')") == 2,
       '%s both status filters admit Active and Disabled' % T,
       vc.count("IN ('Active', 'Disabled')"))
    ck('Deprecated' not in vc,
       '%s never copies a Deprecated object — that is the connector saying the object is gone' % T)
    # Selection comes from the maps.
    # BOTH CTEs must read the entity map — the field CTE joins through it to reach the connection,
    # so an entity map swapped out of only one of them would still leave the token in the file.
    ck(vc.count(quoted('CompanyIntegrationEntityMap', dialect)) == 2,
       '%s both selection CTEs read the entity maps' % T,
       vc.count(quoted('CompanyIntegrationEntityMap', dialect)))
    ck(vc.count(quoted('CompanyIntegrationFieldMap', dialect)) == 1,
       '%s field selection is derived from the field maps' % T,
       vc.count(quoted('CompanyIntegrationFieldMap', dialect)))
    # Nothing outside the seven tables this backfill is allowed to touch may be named at all.
    tbl_pat = (r'\[\$\{mjSchema\}\]\.\[([A-Za-z_][A-Za-z0-9_]*)\]' if dialect == 'ss'
               else r'\$\{mjSchema\}\."([A-Za-z_][A-Za-z0-9_]*)"')
    named = sorted(set(re.findall(tbl_pat, vc)) | set(re.findall(tbl_pat, uc)))
    ck(all(t in KNOWN_TABLES for t in named),
       '%s names no table outside the seven the backfill is allowed to touch' % T,
       [t for t in named if t not in KNOWN_TABLES])
    ck(vc.count('LOWER(') >= 8,
       '%s the map match is case-insensitive on both sides' % T, vc.count('LOWER('))
    ck(vc.count('GROUP BY') == 2,
       '%s both map CTEs aggregate — an ungrouped join would multiply the inserted rows past the '
       'unique key' % T, vc.count('GROUP BY'))
    ck("'Sampled'" in vc and "'Declared'" in vc,
       '%s Provenance is mapped from MetadataSource' % T)
    # The shared catalog is read, never written.
    for tbl in ('IntegrationObject', 'IntegrationObjectField'):
        ck(not writes_to(vc, tbl, dialect),
           '%s the shared %s is read, never written' % (T, tbl))

    # -- the U ---------------------------------------------------------------------------------
    u_fld = uc.find(quoted(TABLE_CIOF, dialect))
    u_obj = uc.find(quoted(TABLE_CIO, dialect))
    ck(0 <= u_fld < u_obj,
       '%s U deletes fields before objects — CIOF holds two foreign keys into CIO' % T,
       'fields@%d objects@%d' % (u_fld, u_obj))
    ck(uc.upper().count('DELETE FROM') == 2, '%s U deletes exactly the two tables' % T,
       uc.upper().count('DELETE FROM'))
    ck('DROP TABLE' not in uc.upper(),
       '%s U does not drop the tables — U%s owns that' % (T, CREATE_VERSION))
    for tbl in ('IntegrationObject', 'IntegrationObjectField', 'CompanyIntegrationEntityMap',
                'CompanyIntegrationFieldMap', 'CompanyIntegration'):
        ck(not writes_to(uc, tbl, dialect), '%s U never touches %s' % (T, tbl))

    ck(vc.count('(') == vc.count(')'), '%s V parens balanced' % T,
       '%d vs %d' % (vc.count('('), vc.count(')')))
    return r


# ---------------------------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------------------------
def load(directory, dialect):
    ext = '.pg.sql' if dialect == 'pg' else '.sql'
    names = os.listdir(directory)

    def pick(prefix, token):
        hits = sorted(f for f in names
                      if f.startswith(prefix) and f.endswith(ext) and token in f
                      and (dialect == 'pg') == f.endswith('.pg.sql'))
        return hits[-1] if hits else None

    vname = pick('V', BACKFILL_TOKEN)
    if not vname:
        return None, None, None, None
    uname = 'U' + vname[1:]
    ddlname = pick('V', CREATE_TOKEN)
    read = lambda f: io.open(os.path.join(directory, f), encoding='utf-8').read()
    if not os.path.exists(os.path.join(directory, uname)) or not ddlname:
        return vname, None, None, None
    return vname, read(vname), read(uname), read(ddlname)


def version_of(fname):
    m = re.match(r'^[VU](\d{12})__', fname)
    return m.group(1) if m else None


# ---------------------------------------------------------------------------------------------
# Mutation self-test. Each entry breaks exactly one rule; the last two break nothing and must
# still pass, so the checker is shown to distinguish a real fault from a lookalike.
# ---------------------------------------------------------------------------------------------
def mutations(dialect):
    q = lambda n: quoted(n, dialect)          # noqa: E731 — a bare column/table identifier
    Q = lambda n: qualified(n, dialect)       # noqa: E731 — placeholder-qualified, as the file writes it
    lit_obj = ('[__mj].[IntegrationObject]' if dialect == 'ss' else '__mj."IntegrationObject"')
    lit_cio = ('[__mj].[CompanyIntegrationObject]' if dialect == 'ss'
               else '__mj."CompanyIntegrationObject"')
    null_uuid = 'CAST(NULL AS UNIQUEIDENTIFIER)' if dialect == 'ss' else 'CAST(NULL AS uuid)'
    true_lit = '1' if dialect == 'ss' else 'true'

    def drop_extra_column(v, u):
        return v.replace('%s, %s,' % (q('IsSelected'), q('SelectedAt')),
                         '%s,' % q('SelectedAt'), 1), u

    def drop_select_item(v, u):
        return v.replace('io.%s, ' % q('SyncStrategy'), '', 1), u

    def swap_select_items(v, u):
        a, b = 'io.%s' % q('DisplayName'), 'io.%s' % q('Description')
        return v.replace('%s, %s' % (a, b), '%s, %s' % (b, a), 1), u

    def duplicate_column(v, u):
        return v.replace('%s, %s,' % (q('FirstSeenAt'), q('LastSeenAt')),
                         '%s, %s, %s,' % (q('FirstSeenAt'), q('FirstSeenAt'), q('LastSeenAt')), 1), u

    def insert_audit_column(v, u):
        return v.replace('%s,\n    %s' % (q('LastSeenAt'), q('LastSampledAt')),
                         '%s, %s,\n    %s' % (q('LastSeenAt'), q('__mj_UpdatedAt'),
                                              q('LastSampledAt')), 1), u

    def flyway_placeholder(v, u):
        return v.replace('${mjSchema}', '${flyway:defaultSchema}'), u

    def literal_schema(v, u):
        return v.replace(Q('IntegrationObject'), lit_obj, 1), u

    def literal_schema_in_undo(v, u):
        return v, u.replace(Q('CompanyIntegrationObject'), lit_cio, 1)

    def fields_before_objects(v, u):
        i = v.index('-- 2. Fields')
        i = v.rindex('-- ====', 0, i)
        return v[i:] + v[:i], u

    def update_before_inserts(v, u):
        i = v.index('-- 3. Dependency edges')
        i = v.rindex('-- ====', 0, i)
        return v[i:] + v[:i], u

    def undo_objects_before_fields(v, u):
        a = 'DELETE FROM %s;' % Q('CompanyIntegrationObjectField')
        b = 'DELETE FROM %s;' % Q('CompanyIntegrationObject')
        return v, u.replace(a, '@@A@@').replace(b, a).replace('@@A@@', b)

    def copy_shared_related_id(v, u):
        return v.replace(null_uuid, 'iof.%s' % q('RelatedIntegrationObjectID'), 1), u

    def drop_idempotency_guard(v, u):
        return v.replace('NOT EXISTS (', 'EXISTS (', 1), u

    def filter_active_connections(v, u):
        return v.replace("WHERE io.%s IN ('Active', 'Disabled')" % q('Status'),
                         "WHERE ci.%s = %s AND io.%s IN ('Active', 'Disabled')"
                         % (q('IsActive'), true_lit, q('Status')), 1), u

    def copy_deprecated_objects(v, u):
        return v.replace("IN ('Active', 'Disabled')",
                         "IN ('Active', 'Disabled', 'Deprecated')", 1), u

    def selection_from_status(v, u):
        return v.replace('%s em' % Q('CompanyIntegrationEntityMap'),
                         '%s em' % Q('CompanyIntegrationRecordMap'), 1), u

    def ungrouped_map_cte(v, u):
        # Target the STATEMENT. The comment above it also says "GROUP BY", and mutating prose
        # proves nothing — the first version of this mutation did exactly that and was correctly
        # ignored, which is how the no-op trap earned its place.
        return v.replace('\n    GROUP BY em.', '\n    ORDER BY em.', 1), u

    def write_the_shared_catalog(v, u):
        return v + '\nDELETE FROM %s;\n' % Q('IntegrationObject'), u

    def undo_drops_tables(v, u):
        return v, u + '\nDROP TABLE %s;\n' % Q('CompanyIntegrationObject')

    def undo_touches_shared(v, u):
        return v, u + '\nDELETE FROM %s;\n' % Q('IntegrationObjectField')

    # --- controls: these must NOT be flagged -------------------------------------------------
    def harmless_audit_column_name(v, u):
        # The trap. A new mention of the COLUMN __mj_CreatedAt must not read as the literal schema.
        return v.replace('-- 1. Objects', '-- __mj_CreatedAt __mj_UpdatedAt\n-- 1. Objects', 1), u

    def harmless_comment_apostrophes(v, u):
        return v.replace('-- 1. Objects',
                         "-- the connection's own catalog; don't touch the shared one\n"
                         '-- 1. Objects', 1), u

    return [
        ('drop a declared column from the INSERT list', drop_extra_column, True),
        ('drop one SELECT item so the lists misalign', drop_select_item, True),
        ('swap two shared SELECT items (same length, wrong columns)', swap_select_items, True),
        ('duplicate a column in the INSERT list', duplicate_column, True),
        ('insert __mj_UpdatedAt', insert_audit_column, True),
        ('use the flyway default-schema placeholder', flyway_placeholder, True),
        ('name the literal __mj schema in the V', literal_schema, True),
        ('name the literal __mj schema in the U', literal_schema_in_undo, True),
        ('insert fields before objects', fields_before_objects, True),
        ('resolve the edges before the inserts', update_before_inserts, True),
        ('undo deletes objects before fields', undo_objects_before_fields, True),
        ('copy the SHARED related object id verbatim', copy_shared_related_id, True),
        ('drop an idempotency guard', drop_idempotency_guard, True),
        ('skip paused connections', filter_active_connections, True),
        ('copy Deprecated objects', copy_deprecated_objects, True),
        ('derive selection from something other than the entity maps', selection_from_status, True),
        ('drop the GROUP BY from a map CTE', ungrouped_map_cte, True),
        ('write to the shared catalog', write_the_shared_catalog, True),
        ('undo drops the tables', undo_drops_tables, True),
        ('undo deletes the shared catalog', undo_touches_shared, True),
        ('CONTROL: mention the audit COLUMN names in a comment', harmless_audit_column_name, False),
        ('CONTROL: add a comment full of apostrophes', harmless_comment_apostrophes, False),
    ]


def self_test(loaded):
    print('\n--- mutation self-test -------------------------------------------------------------')
    failures = 0
    for dialect, (vname, v, u, ddl) in loaded.items():
        for label, mutate, should_fail in mutations(dialect):
            try:
                mv, mu = mutate(v, u)
            except ValueError as exc:
                print('ERROR [%s] %s — mutation could not be applied (%s)' % (dialect, label, exc))
                failures += 1
                continue
            if mv == v and mu == u:
                print('ERROR [%s] %s — mutation was a no-op, it proves nothing' % (dialect, label))
                failures += 1
                continue
            caught = [m for ok, m in check_pair(mv, mu, ddl, dialect) if not ok]
            if should_fail and not caught:
                print('MISSED [%s] %s' % (dialect, label))
                failures += 1
            elif not should_fail and caught:
                print('FALSE POSITIVE [%s] %s -> %s' % (dialect, label, caught[0]))
                failures += 1
            else:
                verdict = 'caught by %d check(s)' % len(caught) if should_fail else 'correctly ignored'
                print('OK     [%s] %-58s %s' % (dialect, label, verdict))
    return failures


def main(argv):
    args = [a for a in argv[1:] if not a.startswith('--')]
    want_self_test = '--self-test' in argv
    if len(args) < 2:
        print(__doc__)
        return 2

    loaded, results = {}, []
    for directory, dialect in ((args[0], 'pg'), (args[1], 'ss')):
        vname, v, u, ddl = load(directory, dialect)
        if v is None:
            results.append((False, '[%s] backfill V/U pair or its DDL migration not found in %s'
                            % (dialect, directory)))
            continue
        loaded[dialect] = (vname, v, u, ddl)
        uv, vv = version_of('U' + vname[1:]), version_of(vname)
        results.append((vv is not None and vv == uv,
                        '[%s] V and U carry the identical version number' % dialect))
        results.append((vv is not None and vv > CREATE_VERSION,
                        '[%s] the backfill version is later than the migration that creates the '
                        'tables (%s)' % (dialect, CREATE_VERSION)))
        results += check_pair(v, u, ddl, dialect)

    for ok, msg in results:
        print(('PASS  ' if ok else 'FAIL  ') + msg)
    bad = sum(1 for ok, _ in results if not ok)
    print('\n%d checks, %d passed, %d FAILED' % (len(results), len(results) - bad, bad))

    if want_self_test:
        if not loaded:
            print('\nself-test skipped: nothing loaded')
            return 1
        missed = self_test(loaded)
        print('%d mutation(s) unhandled' % missed)
        bad += missed
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
