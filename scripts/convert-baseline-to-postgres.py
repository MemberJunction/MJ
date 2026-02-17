#!/usr/bin/env python3
"""
Convert MemberJunction T-SQL baseline migration to PostgreSQL.

Reads: /workspace/MJ/migrations/v4/B202602061600__v4.0__Baseline.sql
Writes: /workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql

Processes the file in sections:
  1. Preamble (users, roles, schema setup)
  2. Tables + PKs + indexes + unique constraints + triggers (interleaved)
  3. Views
  4. Stored procedures → PG functions
  5. CHECK constraints
  6. Foreign keys
  7. Extended properties → COMMENT ON
  8. GRANTs/permissions
  9. Seed data (INSERT statements)
"""
import re
import sys
import os

INPUT_FILE  = '/workspace/MJ/migrations/v4/B202602061600__v4.0__Baseline.sql'
OUTPUT_FILE = '/workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql'

SCHEMA = '__mj'

# ──────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────

def strip_collate(s: str) -> str:
    """Remove COLLATE clauses."""
    return re.sub(r'\s+COLLATE\s+\w+', '', s, flags=re.IGNORECASE)

def strip_brackets(s: str) -> str:
    """Convert [name] to "name" for PG quoting."""
    return re.sub(r'\[([^\]]+)\]', r'"\1"', s)

def replace_schema_placeholder(s: str) -> str:
    """Replace ${flyway:defaultSchema} with __mj."""
    return s.replace('${flyway:defaultSchema}', SCHEMA)

def convert_type(type_str: str) -> str:
    """Convert a T-SQL data type to PostgreSQL equivalent."""
    t = type_str.strip()
    tl = t.lower()

    # uniqueidentifier
    if tl == 'uniqueidentifier':
        return 'UUID'
    # nvarchar(max) or nvarchar (max)
    if re.match(r'nvarchar\s*\(\s*max\s*\)', tl):
        return 'TEXT'
    # nvarchar(n)
    m = re.match(r'nvarchar\s*\(\s*(\d+)\s*\)', tl)
    if m:
        return f'VARCHAR({m.group(1)})'
    # varchar(max)
    if re.match(r'varchar\s*\(\s*max\s*\)', tl):
        return 'TEXT'
    # varchar(n)
    m = re.match(r'varchar\s*\(\s*(\d+)\s*\)', tl)
    if m:
        return f'VARCHAR({m.group(1)})'
    # bit
    if tl == 'bit':
        return 'BOOLEAN'
    # datetimeoffset
    if tl == 'datetimeoffset':
        return 'TIMESTAMPTZ'
    # datetime2, datetime
    if tl in ('datetime2', 'datetime'):
        return 'TIMESTAMP'
    # date
    if tl == 'date':
        return 'DATE'
    # time
    if tl == 'time':
        return 'TIME'
    # float(53) or float
    if re.match(r'float(\s*\(\s*53\s*\))?', tl):
        return 'DOUBLE PRECISION'
    # real
    if tl == 'real':
        return 'REAL'
    # decimal(p,s) / numeric(p,s)
    m = re.match(r'(?:decimal|numeric)\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)', tl)
    if m:
        return f'NUMERIC({m.group(1)},{m.group(2)})'
    # money
    if tl == 'money':
        return 'NUMERIC(19,4)'
    # bigint
    if tl == 'bigint':
        return 'BIGINT'
    # int / integer
    if tl in ('int', 'integer'):
        return 'INTEGER'
    # smallint
    if tl == 'smallint':
        return 'SMALLINT'
    # tinyint
    if tl == 'tinyint':
        return 'SMALLINT'
    # varbinary (bare, max, or n) / image
    if tl == 'varbinary':
        return 'BYTEA'
    if re.match(r'varbinary\s*\(\s*max\s*\)', tl) or tl == 'image':
        return 'BYTEA'
    # varbinary(n)
    m = re.match(r'varbinary\s*\(\s*(\d+)\s*\)', tl)
    if m:
        return 'BYTEA'
    # xml
    if tl == 'xml':
        return 'XML'
    # ntext / text
    if tl in ('ntext', 'text'):
        return 'TEXT'
    # char(n) / nchar(n)
    m = re.match(r'n?char\s*\(\s*(\d+)\s*\)', tl)
    if m:
        return f'CHAR({m.group(1)})'

    return t.upper()

def convert_default(default_str: str, col_type_pg: str) -> str:
    """Convert a T-SQL default value expression to PostgreSQL."""
    d = default_str.strip()
    # Remove outer parens if wrapped
    while d.startswith('(') and d.endswith(')'):
        inner = d[1:-1]
        # Check balanced parens
        depth = 0
        balanced = True
        for c in inner:
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth < 0:
                    balanced = False
                    break
        if balanced and depth == 0:
            d = inner
        else:
            break

    dl = d.lower().strip()

    # newsequentialid() / newid()
    if dl in ('newsequentialid()', 'newid()'):
        return 'gen_random_uuid()'

    # getutcdate() / getdate()
    if dl in ('getutcdate()', 'getdate()'):
        return "(NOW() AT TIME ZONE 'UTC')"

    # sysdatetimeoffset()
    if dl == 'sysdatetimeoffset()':
        return 'NOW()'

    # user_name() / suser_name()
    if dl == 'user_name()':
        return 'current_user'
    if dl == 'suser_name()':
        return 'session_user'

    # Boolean defaults for BOOLEAN columns
    if col_type_pg == 'BOOLEAN':
        if dl in ('1', "'1'"):
            return 'true'
        if dl in ('0', "'0'"):
            return 'false'

    # Numeric 0/1 that aren't boolean
    if dl.isdigit():
        return dl

    # Negative numbers
    if re.match(r'^-?\d+(\.\d+)?$', dl):
        return dl

    # String literal
    if dl.startswith("'") and dl.endswith("'"):
        return d  # keep as-is with original casing

    # N'string' -> 'string'
    if dl.startswith("n'") and dl.endswith("'"):
        return d[1:]  # remove the N prefix

    return d

def convert_check_constraint(check_expr: str) -> str:
    """Convert a T-SQL CHECK constraint expression to PostgreSQL."""
    expr = check_expr
    # Remove outer parens from individual column refs: ([Col]) -> ("Col")
    expr = strip_brackets(expr)
    # Replace =(0) and =(1) for BIT columns with boolean equivalents
    # But NOT >=(0) or <=(1) which are numeric comparisons
    # Use negative lookbehind to avoid matching >= and <=
    expr = re.sub(r'(?<![><])=\s*\(0\)', '= false', expr)
    expr = re.sub(r'(?<![><])=\s*\(1\)', '= true', expr)
    # Numeric comparisons: >=(0) -> >= 0, <=(1) -> <= 1, etc.
    expr = re.sub(r'>=\s*\((\d+)\)', r'>= \1', expr)
    expr = re.sub(r'<=\s*\((\d+)\)', r'<= \1', expr)
    # ISJSON() -> __mj.is_json()
    expr = re.sub(r'\bisjson\s*\(', '__mj.is_json(', expr, flags=re.IGNORECASE)
    # len() -> length()
    expr = re.sub(r'\blen\s*\(', 'length(', expr, flags=re.IGNORECASE)
    # Make string equality checks case-insensitive (SQL Server default collation is CI)
    # Convert patterns like "Col"='Value1' OR "Col"='Value2' to use LOWER()
    expr = _make_string_checks_case_insensitive(expr)
    return expr


def _make_string_checks_case_insensitive(expr: str) -> str:
    """Wrap string equality CHECK constraint comparisons with LOWER() for
    case-insensitive matching to match SQL Server's default CI collation."""
    # Match "ColName"='Value' patterns and wrap both sides with LOWER()
    def replace_eq(m):
        col = m.group(1)
        val = m.group(2).lower()
        return f'LOWER("{col}")=\'{val}\''
    return re.sub(r'"(\w+)"=\'([^\']+)\'', replace_eq, expr)

# ──────────────────────────────────────────────────────────
# Main line-by-line parser
# ──────────────────────────────────────────────────────────

def read_source():
    with open(INPUT_FILE, 'r', encoding='utf-8-sig') as f:
        return f.readlines()

# ──────────────────────────────────────────────────────────
# Section: Parse CREATE TABLE blocks
# ──────────────────────────────────────────────────────────

def parse_create_table(lines, start_idx):
    """
    Parse a CREATE TABLE block starting at start_idx.
    Returns (table_name, columns, end_idx) where columns is a list of
    (col_name, col_type_tsql, nullable, default_expr, constraint_name).
    """
    # Extract table name from CREATE TABLE line
    line = lines[start_idx]
    m = re.search(r'CREATE\s+TABLE\s+\[?\$\{flyway:defaultSchema\}\]?\.\[?(\w+)\]?', line, re.IGNORECASE)
    if not m:
        # Try already-replaced schema
        m = re.search(r'CREATE\s+TABLE\s+\[?__mj\]?\.\[?(\w+)\]?', line, re.IGNORECASE)
    if not m:
        return None, None, start_idx + 1

    table_name = m.group(1)

    # Find the opening paren
    idx = start_idx
    while idx < len(lines) and '(' not in lines[idx]:
        idx += 1
    idx += 1  # skip the ( line or the line with (

    columns = []
    while idx < len(lines):
        l = lines[idx].strip()
        # End of column list
        if l.startswith(')'):
            idx += 1
            break

        # Skip empty lines
        if not l:
            idx += 1
            continue

        # Parse column definition
        # Pattern: [ColumnName] [type] (size) COLLATE ... NOT NULL/NULL CONSTRAINT [name] DEFAULT (value)
        col_match = re.match(
            r'\[(\w+)\]\s+'           # column name
            r'\[([^\]]+)\]'           # base type
            r'(?:\s*\(([^)]*)\))?'    # optional (size) or (p,s)
            r'(.*)',                   # rest of definition
            l
        )
        if col_match:
            col_name = col_match.group(1)
            base_type = col_match.group(2)
            size_part = col_match.group(3)
            rest = col_match.group(4)

            # Reconstruct full type
            if size_part is not None:
                full_type = f'{base_type}({size_part})'
            else:
                full_type = base_type

            # Determine nullability
            nullable = True
            if 'NOT NULL' in rest.upper():
                nullable = False
            elif 'NULL' in rest.upper():
                nullable = True

            # Extract default
            default_expr = None
            constraint_name = None
            # Pattern: CONSTRAINT [name] DEFAULT (expr)
            def_match = re.search(
                r'CONSTRAINT\s+\[([^\]]+)\]\s+DEFAULT\s+(.*?)(?:,\s*$|$)',
                rest, re.IGNORECASE
            )
            if def_match:
                constraint_name = def_match.group(1)
                default_expr = def_match.group(2).strip().rstrip(',')
            else:
                # Pattern: DEFAULT (expr) without constraint name
                def_match2 = re.search(r'DEFAULT\s+(.*?)(?:,\s*$|$)', rest, re.IGNORECASE)
                if def_match2:
                    default_expr = def_match2.group(1).strip().rstrip(',')

            columns.append((col_name, full_type, nullable, default_expr, constraint_name))

        idx += 1

    return table_name, columns, idx


def emit_create_table(table_name, columns):
    """Generate PostgreSQL CREATE TABLE statement."""
    out = []
    out.append(f'CREATE TABLE {SCHEMA}."{table_name}" (')

    col_lines = []
    for col_name, col_type_tsql, nullable, default_expr, _constraint_name in columns:
        pg_type = convert_type(col_type_tsql)
        parts = [f'    "{col_name}" {pg_type}']

        if not nullable:
            parts.append('NOT NULL')

        if default_expr is not None:
            pg_default = convert_default(default_expr, pg_type)
            parts.append(f'DEFAULT {pg_default}')

        col_lines.append(' '.join(parts))

    out.append(',\n'.join(col_lines))
    out.append(');')
    return '\n'.join(out)


def emit_trigger(table_name):
    """Generate PostgreSQL trigger function + trigger for __mj_UpdatedAt."""
    func_name = f'fn_trg_update_{table_name.lower()}'
    trigger_name = f'trg_update_{table_name}'
    return f"""
CREATE OR REPLACE FUNCTION {SCHEMA}.{func_name}()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "{trigger_name}" ON {SCHEMA}."{table_name}";
CREATE TRIGGER "{trigger_name}"
    BEFORE UPDATE ON {SCHEMA}."{table_name}"
    FOR EACH ROW
    EXECUTE FUNCTION {SCHEMA}.{func_name}();
"""


class BaselineConverter:
    def __init__(self):
        self.lines = read_source()
        self.output = []
        self.tables_created = []
        self.views_created = []
        self.functions_created = []
        self.triggers_created = []
        self.indexes_created = []
        self.fks_created = []
        self.checks_created = []
        self.grants_created = []
        self.comments_created = []
        self.inserts_written = 0
        # Map of table_name → set of boolean column names (for INSERT 0/1 → TRUE/FALSE)
        self.boolean_columns = {}

    def emit(self, text):
        self.output.append(text)

    def emit_line(self, text=''):
        self.output.append(text + '\n')

    def write_output(self):
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            f.write(''.join(self.output))

    # ──────────────────────────────────────────────────────
    # Pass 1: Preamble + Tables + PKs + Indexes + Triggers
    # ──────────────────────────────────────────────────────

    def convert_preamble(self):
        """Generate PostgreSQL preamble (schema, roles, extensions)."""
        self.emit_line('-- MemberJunction v4.0.x PostgreSQL Baseline Migration')
        self.emit_line('-- Auto-converted from T-SQL baseline')
        self.emit_line()
        self.emit_line('-- Ensure pgcrypto extension for gen_random_uuid()')
        self.emit_line('CREATE EXTENSION IF NOT EXISTS pgcrypto;')
        self.emit_line()
        self.emit_line('-- Create schema if not exists')
        self.emit_line(f'CREATE SCHEMA IF NOT EXISTS {SCHEMA};')
        self.emit_line()
        self.emit_line('-- Set search path')
        self.emit_line(f'SET search_path TO {SCHEMA}, public;')
        self.emit_line()

        # Create roles (DO NOT error if they already exist)
        roles = ['cdp_BI', 'cdp_CodeGen', 'cdp_Developer', 'cdp_Integration', 'cdp_UI']
        for role in roles:
            self.emit_line(f"DO $$ BEGIN CREATE ROLE {role}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
        self.emit_line()

        # Create users
        users = [
            ('mj_codegen', 'MJ_CodeGen_Pass'),
            ('mj_codegen_dev', 'MJ_CodeGen_Dev_Pass'),
            ('mj_connect', 'MJ_Connect_Pass'),
            ('mj_connect_dev', 'MJ_Connect_Dev_Pass'),
        ]
        for user, _pw in users:
            self.emit_line(f"DO $$ BEGIN CREATE ROLE {user} LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
        self.emit_line()

        # Role memberships
        self.emit_line('-- Role memberships')
        self.emit_line('GRANT cdp_Developer TO mj_connect;')
        self.emit_line('GRANT cdp_Developer TO mj_connect_dev;')
        self.emit_line('GRANT cdp_Integration TO mj_connect;')
        self.emit_line('GRANT cdp_Integration TO mj_connect_dev;')
        self.emit_line('GRANT cdp_UI TO mj_connect;')
        self.emit_line('GRANT cdp_UI TO mj_connect_dev;')
        self.emit_line()
        # Schema usage
        self.emit_line(f'GRANT USAGE ON SCHEMA {SCHEMA} TO cdp_Developer, cdp_Integration, cdp_UI, cdp_CodeGen, cdp_BI;')
        self.emit_line()

        # Helper function: is_json (replaces T-SQL ISJSON)
        self.emit_line('-- Helper: is_json() replaces T-SQL ISJSON()')
        self.emit_line(f'CREATE OR REPLACE FUNCTION {SCHEMA}.is_json(p_text TEXT)')
        self.emit_line('RETURNS BOOLEAN AS $$')
        self.emit_line('BEGIN')
        self.emit_line('    IF p_text IS NULL THEN RETURN TRUE; END IF;')
        self.emit_line('    BEGIN')
        self.emit_line('        PERFORM p_text::jsonb;')
        self.emit_line('        RETURN TRUE;')
        self.emit_line('    EXCEPTION WHEN OTHERS THEN')
        self.emit_line('        RETURN FALSE;')
        self.emit_line('    END;')
        self.emit_line('END;')
        self.emit_line("$$ LANGUAGE plpgsql IMMUTABLE;")
        self.emit_line()

    def convert_tables_section(self):
        """
        Parse lines 184-13328: tables, PKs, indexes, unique constraints, triggers.
        These are interleaved per table in the source file.
        """
        idx = 183  # 0-based, line 184
        end_idx = 13328  # End of tables section

        while idx < end_idx and idx < len(self.lines):
            line = self.lines[idx].strip()
            raw_line = self.lines[idx]

            # Skip GO, error handling, PRINT, empty lines
            if self._is_skip_line(line):
                idx += 1
                continue

            # CREATE TYPE
            if re.match(r'CREATE\s+TYPE', line, re.IGNORECASE):
                idx = self._convert_type(idx)
                continue

            # CREATE TABLE
            if re.match(r'.*CREATE\s+TABLE', line, re.IGNORECASE):
                table_name, columns, next_idx = parse_create_table(self.lines, idx)
                if table_name and columns:
                    self.emit_line(emit_create_table(table_name, columns))
                    self.emit_line()
                    self.tables_created.append(table_name)
                    # Track boolean columns for INSERT 0/1 → TRUE/FALSE conversion
                    bool_cols = set()
                    for col_name, col_type, *_ in columns:
                        if col_type.lower() == 'bit':
                            bool_cols.add(col_name)
                    if bool_cols:
                        self.boolean_columns[table_name] = bool_cols
                idx = next_idx
                continue

            # ALTER TABLE ... ADD CONSTRAINT ... PRIMARY KEY
            pk_match = re.search(
                r'ALTER\s+TABLE\s+.*?\.\[?(\w+)\]?\s+ADD\s+CONSTRAINT\s+\[?([^\]]+)\]?\s+PRIMARY\s+KEY\s+(?:CLUSTERED\s+)?\(\s*\[?([^\]]+)\]?\s*\)',
                line, re.IGNORECASE
            )
            if pk_match:
                tbl = pk_match.group(1)
                pk_name = pk_match.group(2)
                pk_col = pk_match.group(3)
                self.emit_line(f'ALTER TABLE {SCHEMA}."{tbl}" ADD CONSTRAINT "{pk_name}" PRIMARY KEY ("{pk_col}");')
                self.emit_line()
                idx += 1
                continue

            # ALTER TABLE ... ADD CONSTRAINT ... UNIQUE
            uq_match = re.search(
                r'ALTER\s+TABLE\s+.*?\.\[?(\w+)\]?\s+ADD\s+CONSTRAINT\s+\[?([^\]]+)\]?\s+UNIQUE\s+(?:NONCLUSTERED\s+)?\(([^)]+)\)',
                line, re.IGNORECASE
            )
            if uq_match:
                tbl = uq_match.group(1)
                uq_name = uq_match.group(2)
                cols_raw = uq_match.group(3)
                cols = ', '.join(f'"{c.strip().strip("[]")}"' for c in cols_raw.split(','))
                self.emit_line(f'ALTER TABLE {SCHEMA}."{tbl}" ADD CONSTRAINT "{uq_name}" UNIQUE ({cols});')
                self.emit_line()
                idx += 1
                continue

            # CREATE INDEX (NONCLUSTERED or CLUSTERED)
            idx_match = re.search(
                r'CREATE\s+(?:NONCLUSTERED\s+|CLUSTERED\s+)?INDEX\s+\[?([^\]\s]+)\]?\s+ON\s+.*?\.\[?(\w+)\]?\s*\(([^)]+)\)',
                line, re.IGNORECASE
            )
            if idx_match:
                idx_name = idx_match.group(1)
                tbl = idx_match.group(2)
                cols_raw = idx_match.group(3)
                col_parts = []
                for c in cols_raw.split(','):
                    c = c.strip()
                    # Handle [ColumnName] DESC or [ColumnName] ASC
                    sort_dir = ''
                    cm = re.match(r'\[?(\w+)\]?\s+(DESC|ASC)', c, re.IGNORECASE)
                    if cm:
                        col_name = cm.group(1)
                        sort_dir = f' {cm.group(2).upper()}'
                    else:
                        col_name = c.strip('[]')
                    col_parts.append(f'"{col_name}"{sort_dir}')
                cols = ', '.join(col_parts)

                # Check for INCLUDE clause (PG doesn't use same syntax but supports it in PG 11+)
                include_match = re.search(r'INCLUDE\s*\(([^)]+)\)', line, re.IGNORECASE)
                include_clause = ''
                if include_match:
                    inc_cols = ', '.join(f'"{c.strip().strip("[]")}"' for c in include_match.group(1).split(','))
                    include_clause = f' INCLUDE ({inc_cols})'

                # Check for WHERE clause (filtered index)
                where_match = re.search(r'WHERE\s*\((.+?)\)\s*$', line, re.IGNORECASE)
                where_clause = ''
                if where_match:
                    w = where_match.group(1)
                    w = strip_brackets(w)
                    # Convert BIT comparisons to BOOLEAN
                    w = re.sub(r'=\s*\(1\)', '= true', w)
                    w = re.sub(r'=\s*\(0\)', '= false', w)
                    where_clause = f' WHERE ({w})'

                self.emit_line(f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON {SCHEMA}."{tbl}" ({cols}){include_clause}{where_clause};')
                self.indexes_created.append(idx_name)
                idx += 1
                continue

            # CREATE TRIGGER
            if re.match(r'CREATE\s+TRIGGER', line, re.IGNORECASE):
                idx, trigger_tbl = self._skip_trigger_and_emit_pg(idx)
                continue

            idx += 1

    def _is_skip_line(self, line):
        """Check if line should be skipped (GO, SET, IF @@ERROR, PRINT, empty)."""
        if not line:
            return True
        if line == 'GO':
            return True
        if line.startswith('IF @@ERROR'):
            return True
        if line.startswith('SET '):
            return True
        if line.startswith('PRINT '):
            return True
        return False

    def _convert_type(self, idx):
        """Convert CREATE TYPE ... AS TABLE to a placeholder comment."""
        # IDListTableType is a table type - no direct PG equivalent
        # We'll skip it and handle it differently in stored procs
        while idx < len(self.lines):
            line = self.lines[idx].strip()
            if line == 'GO' or (line.startswith('IF @@ERROR') and idx > 0):
                idx += 1
                break
            idx += 1
        self.emit_line('-- Note: T-SQL table types are handled as PG arrays or temp tables in functions')
        self.emit_line()
        return idx

    def _skip_trigger_and_emit_pg(self, idx):
        """Skip the T-SQL trigger definition and emit PG equivalent."""
        # Extract table name from CREATE TRIGGER line
        line = self.lines[idx].strip()
        # Find the ON clause
        tbl_name = None
        while idx < len(self.lines):
            l = self.lines[idx].strip()
            on_match = re.search(r'ON\s+.*?\.\[?(\w+)\]?', l, re.IGNORECASE)
            if on_match:
                tbl_name = on_match.group(1)
                break
            if l == 'GO':
                break
            idx += 1

        # Skip to end of trigger (next GO after END;)
        while idx < len(self.lines):
            l = self.lines[idx].strip()
            if l == 'GO':
                idx += 1
                break
            idx += 1

        if tbl_name:
            self.emit(emit_trigger(tbl_name))
            self.emit_line()
            self.triggers_created.append(tbl_name)

        return idx, tbl_name

    # ──────────────────────────────────────────────────────
    # Pass 2: Views
    # ──────────────────────────────────────────────────────

    def convert_views_and_procs(self):
        """
        Parse lines 13329-63015: views and stored procedures (interleaved).

        Two-pass approach: collect all views and functions first, then emit
        all views (topologically sorted), then all functions/procs.
        This ensures view dependencies are resolved before stored procedures
        reference them.
        """
        idx = 13328  # 0-based
        end_idx = 63016  # Before CHECK constraints

        collected_views = []      # (name, converted_sql)
        collected_functions = []  # (name, converted_sql)
        collected_procs = []      # list of converted SQL strings

        while idx < end_idx and idx < len(self.lines):
            line = self.lines[idx].strip()

            if self._is_skip_line(line):
                idx += 1
                continue

            # CREATE VIEW
            if re.match(r'CREATE\s+VIEW', line, re.IGNORECASE):
                view_lines = []
                while idx < len(self.lines):
                    l = self.lines[idx]
                    if l.strip() == 'GO':
                        idx += 1
                        break
                    view_lines.append(l)
                    idx += 1

                view_sql = ''.join(view_lines)
                pg_sql = self._convert_view_sql(view_sql)

                # Extract view name
                vm = re.search(r'CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+.*?\."?(\w+)"?', pg_sql, re.IGNORECASE)
                if vm:
                    name = vm.group(1)
                    # Check if view references SQL Server system catalogs
                    if re.search(r'\bsys\.\w+', pg_sql, re.IGNORECASE):
                        pg_sql = self._convert_sys_catalog_view(name, pg_sql)
                    self.views_created.append(name)
                    collected_views.append((name, pg_sql))
                continue

            # CREATE PROCEDURE
            if re.match(r'CREATE\s+PROCEDURE', line, re.IGNORECASE):
                proc_lines = []
                while idx < len(self.lines):
                    l = self.lines[idx]
                    if l.strip() == 'GO':
                        idx += 1
                        break
                    proc_lines.append(l)
                    idx += 1

                proc_sql = ''.join(proc_lines)
                pg_func = self._convert_proc_to_func(proc_sql)
                if pg_func:
                    collected_procs.append(pg_func)
                continue

            # CREATE FUNCTION (utility functions in this range)
            if re.match(r'CREATE\s+FUNCTION', line, re.IGNORECASE):
                func_lines = []
                while idx < len(self.lines):
                    l = self.lines[idx]
                    if l.strip() == 'GO':
                        idx += 1
                        break
                    func_lines.append(l)
                    idx += 1

                func_sql = ''.join(func_lines)
                pg_func = self._convert_function_sql(func_sql)
                if pg_func:
                    collected_functions.append(pg_func)
                continue

            idx += 1

        # Topologically sort views by dependency
        sorted_views = self._topo_sort_views(collected_views)

        # Emit: all utility functions first, then all views, then all procs
        self.emit_line('-- ==========================================')
        self.emit_line('-- Utility Functions')
        self.emit_line('-- ==========================================')
        for func_sql in collected_functions:
            self.emit(func_sql)
            self.emit_line()

        self.emit_line('-- ==========================================')
        self.emit_line('-- Views')
        self.emit_line('-- ==========================================')
        for name, view_sql in sorted_views:
            self.emit(view_sql)
            self.emit_line(';')
            self.emit_line()

        self.emit_line('-- ==========================================')
        self.emit_line('-- Stored Procedures (as PG Functions)')
        self.emit_line('-- ==========================================')
        for proc_sql in collected_procs:
            self.emit(proc_sql)
            self.emit_line()

    def _topo_sort_views(self, views):
        """Topologically sort views by dependency.

        Simple approach: for each view, find which other views it references.
        Then emit views in order of fewest dependencies first.
        """
        view_names = {name.lower() for name, _ in views}
        view_map = {name.lower(): (name, sql) for name, sql in views}

        # Build dependency graph
        deps = {}
        for name, sql in views:
            nl = name.lower()
            deps[nl] = set()
            # Find references to other views in this view's SQL
            for other_name in view_names:
                if other_name != nl:
                    # Check if the view SQL references the other view
                    if re.search(rf'["\s\.]{re.escape(view_map[other_name][0])}["\s]', sql):
                        deps[nl].add(other_name)

        # Kahn's algorithm for topological sort
        in_degree = {n: 0 for n in deps}
        for n in deps:
            for dep in deps[n]:
                if dep in in_degree:
                    in_degree[dep] = in_degree.get(dep, 0)

        # Actually compute in-degrees
        in_degree = {n: 0 for n in deps}
        for n in deps:
            for dep in deps[n]:
                pass  # dep needs to come before n

        # Reverse: who depends on whom
        in_degree = {n: len(deps[n]) for n in deps}
        reverse_deps = {n: set() for n in deps}
        for n in deps:
            for dep in deps[n]:
                if dep in reverse_deps:
                    reverse_deps[dep].add(n)

        queue = [n for n in in_degree if in_degree[n] == 0]
        result = []
        while queue:
            queue.sort()  # stable order
            node = queue.pop(0)
            result.append(view_map[node])
            for dependent in reverse_deps.get(node, set()):
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        # Add any remaining (circular deps) at the end in original order
        remaining = set(deps.keys()) - {name.lower() for name, _ in result}
        for name, sql in views:
            if name.lower() in remaining:
                result.append((name, sql))

        return result

    def _convert_view(self, idx):
        """Convert a CREATE VIEW statement."""
        # Collect the entire view body until GO
        view_lines = []
        while idx < len(self.lines):
            l = self.lines[idx]
            if l.strip() == 'GO':
                idx += 1
                break
            view_lines.append(l)
            idx += 1

        view_sql = ''.join(view_lines)
        view_sql = self._convert_view_sql(view_sql)

        # Extract view name for tracking
        vm = re.search(r'CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+.*?\."?(\w+)"?', view_sql, re.IGNORECASE)
        if vm:
            self.views_created.append(vm.group(1))

        self.emit(view_sql)
        self.emit_line(';')
        self.emit_line()
        return idx

    def _convert_view_sql(self, sql):
        """Apply all T-SQL → PG conversions to a view body."""
        s = sql
        # Replace schema placeholder
        s = replace_schema_placeholder(s)
        # Strip brackets → double quotes
        s = strip_brackets(s)
        # Remove COLLATE
        s = strip_collate(s)
        # CREATE VIEW → CREATE OR REPLACE VIEW
        s = re.sub(r'CREATE\s+VIEW', 'CREATE OR REPLACE VIEW', s, count=1, flags=re.IGNORECASE)
        # ISNULL() → COALESCE()
        s = re.sub(r'\bISNULL\s*\(', 'COALESCE(', s, flags=re.IGNORECASE)
        # IIF(cond, t, f) → CASE WHEN cond THEN t ELSE f END
        # This is tricky with nested IIF - handle iteratively
        s = self._convert_iif(s)
        # OUTER APPLY → LEFT JOIN LATERAL ... ON true
        s = self._convert_outer_apply(s)
        # CROSS APPLY → CROSS JOIN LATERAL
        s = self._convert_cross_apply(s)
        # SELECT TOP N → will need LIMIT at end
        s = self._convert_top_to_limit(s)
        # CAST(x AS NVARCHAR(n)) → CAST(x AS VARCHAR(n))
        s = re.sub(r'CAST\s*\((.+?)\s+AS\s+NVARCHAR\s*\((\d+)\)\)', r'CAST(\1 AS VARCHAR(\2))', s, flags=re.IGNORECASE)
        s = re.sub(r'CAST\s*\((.+?)\s+AS\s+NVARCHAR\s*\(MAX\)\)', r'CAST(\1 AS TEXT)', s, flags=re.IGNORECASE)
        # CONVERT(type, expr[, style]) → CAST(expr AS type)  (balanced-paren approach)
        s = self._convert_convert_functions(s)
        # GETUTCDATE() / GETDATE() / SYSDATETIMEOFFSET()
        s = re.sub(r'\bGETUTCDATE\s*\(\)', "NOW() AT TIME ZONE 'UTC'", s, flags=re.IGNORECASE)
        s = re.sub(r'\bGETDATE\s*\(\)', "NOW()", s, flags=re.IGNORECASE)
        s = re.sub(r'\bSYSDATETIMEOFFSET\s*\(\)', "NOW()", s, flags=re.IGNORECASE)
        # USER_NAME() / SUSER_NAME()
        s = re.sub(r'\bUSER_NAME\s*\(\)', 'current_user', s, flags=re.IGNORECASE)
        s = re.sub(r'\bSUSER_NAME\s*\(\)', 'session_user', s, flags=re.IGNORECASE)
        # LEN() → LENGTH()
        s = re.sub(r'\bLEN\s*\(', 'LENGTH(', s, flags=re.IGNORECASE)
        # CHARINDEX(needle, haystack) → POSITION(needle IN haystack)
        # Simple cases only
        s = re.sub(r'\bCHARINDEX\s*\(\s*([^,]+)\s*,\s*([^)]+)\)', r'POSITION(\1 IN \2)', s, flags=re.IGNORECASE)
        # STRING_AGG with WITHIN GROUP → STRING_AGG (PG has same function but different ORDER syntax)
        # T-SQL: STRING_AGG(col, ',') WITHIN GROUP (ORDER BY col)
        # PG:    STRING_AGG(col, ',' ORDER BY col)
        s = re.sub(
            r'STRING_AGG\s*\(([^)]+)\)\s*WITHIN\s+GROUP\s*\(\s*ORDER\s+BY\s+([^)]+)\)',
            r'STRING_AGG(\1 ORDER BY \2)',
            s, flags=re.IGNORECASE
        )
        # Boolean comparisons: =1 → = true, =0 → = false (only in WHERE/AND/OR context)
        # Handles both "Column"=1, alias."Column"=1, and bare Column=1 patterns
        # Identifier must start with a letter (avoids matching 1=1)
        s = re.sub(r'(\w+\.)?(\"[A-Za-z]\w+\"|[A-Za-z]\w+)\s*=\s*1\s*$', r'\1\2 = true', s, flags=re.MULTILINE)
        s = re.sub(r'(\w+\.)?(\"[A-Za-z]\w+\"|[A-Za-z]\w+)\s*=\s*0\s*$', r'\1\2 = false', s, flags=re.MULTILINE)
        s = re.sub(r'(\w+\.)?(\"[A-Za-z]\w+\"|[A-Za-z]\w+)\s*=\s*1(\s+AND\b)', r'\1\2 = true\3', s, flags=re.IGNORECASE)
        s = re.sub(r'(\w+\.)?(\"[A-Za-z]\w+\"|[A-Za-z]\w+)\s*=\s*0(\s+AND\b)', r'\1\2 = false\3', s, flags=re.IGNORECASE)
        s = re.sub(r'(\w+\.)?(\"[A-Za-z]\w+\"|[A-Za-z]\w+)\s*=\s*1(\s+OR\b)', r'\1\2 = true\3', s, flags=re.IGNORECASE)
        s = re.sub(r'(\w+\.)?(\"[A-Za-z]\w+\"|[A-Za-z]\w+)\s*=\s*0(\s+OR\b)', r'\1\2 = false\3', s, flags=re.IGNORECASE)
        # N'str' → 'str'
        s = re.sub(r"(?<![A-Za-z])N'([^']*)'", r"'\1'", s)

        # + for string concatenation → || (PostgreSQL syntax)
        # Replace + between string expressions with ||
        s = self._convert_string_concat(s)

        # Qualify unqualified view/proc references with schema prefix
        # e.g., vwEntities → __mj."vwEntities", spCreateUser → __mj."spCreateUser"
        s = re.sub(
            r'(?<![.\w"])(\bvw[A-Z]\w*)\b(?!")',
            lambda m: f'{SCHEMA}."{m.group(1)}"',
            s
        )

        # Quote PascalCase identifiers that aren't already quoted
        # MUST run before _quote_bare_aliases so alias lookbehind can match quoted columns
        s = self._quote_pascalcase_identifiers(s)

        # Quote standalone PascalCase column references in view SQL
        # Handles: AutoRunInterval, StartedAt, etc. (columns without alias prefix)
        # Safe in views (no @variables). Must run after _quote_pascalcase_identifiers.
        s = self._quote_standalone_pascalcase_in_views(s)

        # Quote bare PascalCase aliases (e.g., "Name" Integration → "Name" "Integration")
        s = self._quote_bare_aliases(s)

        # Quote unquoted identifiers after schema prefix (e.g., __mj.vwEntities → __mj."vwEntities")
        s = self._quote_schema_qualified_identifiers(s)

        # If view references information_schema, lowercase column refs from SQL Server
        # SQL Server uses uppercase: TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, etc.
        # PostgreSQL uses lowercase for information_schema columns
        if 'information_schema' in s.lower():
            for col in ['TABLE_SCHEMA', 'TABLE_NAME', 'TABLE_TYPE', 'TABLE_CATALOG',
                       'COLUMN_NAME', 'DATA_TYPE', 'CHARACTER_MAXIMUM_LENGTH',
                       'NUMERIC_PRECISION', 'NUMERIC_SCALE', 'ORDINAL_POSITION',
                       'IS_NULLABLE', 'COLUMN_DEFAULT', 'IS_IDENTITY',
                       'CONSTRAINT_NAME', 'CONSTRAINT_TYPE', 'CONSTRAINT_SCHEMA',
                       'CONSTRAINT_CATALOG', 'CHECK_CLAUSE']:
                s = re.sub(f'"?{col}"?', col.lower(), s, flags=re.IGNORECASE)

        return s

    def _convert_sys_catalog_view(self, view_name, original_sql):
        """Convert views that reference SQL Server sys.* catalogs to PostgreSQL equivalents."""
        pg_views = {
            'vwSQLColumnsAndEntityFields': f'''CREATE OR REPLACE VIEW {SCHEMA}."vwSQLColumnsAndEntityFields"
AS
SELECT
    t.table_schema AS "SchemaName",
    t.table_name AS "TableName",
    c.column_name AS "ColumnName",
    c.data_type AS "Type",
    CASE WHEN c.character_maximum_length IS NOT NULL THEN c.character_maximum_length ELSE NULL END AS "Length",
    c.numeric_precision AS "Precision",
    c.numeric_scale AS "Scale",
    c.ordinal_position AS "Column_ID",
    CASE WHEN c.is_nullable = 'YES' THEN true ELSE false END AS "AllowsNull",
    c.column_default AS "DefaultValue",
    CASE WHEN c.is_identity = 'YES' THEN true ELSE false END AS "AutoIncrement",
    ef."ID" AS "EntityFieldID",
    ef."Name" AS "EntityFieldName",
    e."ID" AS "EntityID",
    e."Name" AS "EntityName"
FROM
    information_schema.columns c
INNER JOIN
    information_schema.tables t ON c.table_schema = t.table_schema AND c.table_name = t.table_name
LEFT OUTER JOIN
    {SCHEMA}."EntityField" ef ON ef."Name" = c.column_name
LEFT OUTER JOIN
    {SCHEMA}."Entity" e ON ef."EntityID" = e."ID" AND e."SchemaName" = c.table_schema AND e."BaseTable" = c.table_name
WHERE t.table_type = 'BASE TABLE'
;
''',
            'vwSQLTablesAndEntities': f'''CREATE OR REPLACE VIEW {SCHEMA}."vwSQLTablesAndEntities"
AS
SELECT
    t.table_schema AS "SchemaName",
    t.table_name AS "TableName",
    e."ID" AS "EntityID",
    e."Name" AS "EntityName",
    e."Description" AS "EntityDescription",
    e."SchemaName" AS "EntitySchemaName",
    e."BaseTable" AS "EntityBaseTable",
    e."BaseView" AS "EntityBaseView"
FROM
    information_schema.tables t
LEFT OUTER JOIN
    {SCHEMA}."Entity" e ON e."SchemaName" = t.table_schema AND e."BaseTable" = t.table_name
WHERE t.table_type = 'BASE TABLE'
;
''',
            'vwSQLSchemas': f'''CREATE OR REPLACE VIEW {SCHEMA}."vwSQLSchemas"
AS
SELECT
    schema_name AS "SchemaName"
FROM
    information_schema.schemata
WHERE
    schema_name NOT IN ('pg_catalog', 'pg_toast', 'information_schema')
;
''',
            'vwForeignKeys': f'''CREATE OR REPLACE VIEW {SCHEMA}."vwForeignKeys"
AS
SELECT
    tc.constraint_name AS "ConstraintName",
    tc.table_schema AS "SchemaName",
    tc.table_name AS "TableName",
    kcu.column_name AS "ColumnName",
    ccu.table_schema AS "ReferencedSchemaName",
    ccu.table_name AS "ReferencedTableName",
    ccu.column_name AS "ReferencedColumnName"
FROM
    information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
;
''',
            'vwTablePrimaryKeys': f'''CREATE OR REPLACE VIEW {SCHEMA}."vwTablePrimaryKeys"
AS
SELECT
    tc.table_schema AS "SchemaName",
    tc.table_name AS "TableName",
    kcu.column_name AS "ColumnName",
    tc.constraint_name AS "PKName"
FROM
    information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
;
''',
            'vwTableUniqueKeys': f'''CREATE OR REPLACE VIEW {SCHEMA}."vwTableUniqueKeys"
AS
SELECT
    tc.table_schema AS "SchemaName",
    tc.table_name AS "TableName",
    kcu.column_name AS "ColumnName",
    tc.constraint_name AS "UKName"
FROM
    information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE'
;
''',
            'vwEntityFieldsWithCheckConstraints': f'''CREATE OR REPLACE VIEW {SCHEMA}."vwEntityFieldsWithCheckConstraints"
AS
SELECT
    e."ID" AS "EntityID",
    e."Name" AS "EntityName",
    ef."ID" AS "EntityFieldID",
    ef."Name" AS "FieldName",
    cc.constraint_name AS "CheckConstraintName",
    cc.check_clause AS "CheckConstraintDefinition"
FROM
    {SCHEMA}."Entity" e
INNER JOIN
    {SCHEMA}."EntityField" ef ON ef."EntityID" = e."ID"
LEFT OUTER JOIN
    information_schema.constraint_column_usage ccu ON ccu.table_schema = e."SchemaName" AND ccu.table_name = e."BaseTable" AND ccu.column_name = ef."Name"
LEFT OUTER JOIN
    information_schema.check_constraints cc ON cc.constraint_name = ccu.constraint_name AND cc.constraint_schema = ccu.table_schema
;
''',
        }

        if view_name in pg_views:
            return pg_views[view_name]

        # For unrecognized sys views, create a stub
        return f'''-- TODO: Convert {view_name} from SQL Server sys.* catalogs to PostgreSQL
-- Original view references SQL Server system catalogs
CREATE OR REPLACE VIEW {SCHEMA}."{view_name}" AS SELECT 1 AS stub WHERE FALSE;
'''

    def _convert_string_concat(self, sql):
        """Convert T-SQL string concatenation (+) to PostgreSQL (||)."""
        # Replace + that's used for string concatenation
        # This is between string expressions (quotes, identifiers, function calls)
        # We need to be careful not to replace + in arithmetic
        # Strategy: replace + between expressions involving quotes or text identifiers
        result = []
        i = 0
        in_string = False
        while i < len(sql):
            if sql[i] == "'" and not in_string:
                in_string = True
                result.append(sql[i])
                i += 1
                continue
            if sql[i] == "'" and in_string:
                if i + 1 < len(sql) and sql[i+1] == "'":
                    result.append("''")
                    i += 2
                    continue
                in_string = False
                result.append(sql[i])
                i += 1
                continue
            if in_string:
                result.append(sql[i])
                i += 1
                continue
            if sql[i] == '+':
                # Check context - is this likely string concatenation?
                # Look backward for string/identifier context
                before = ''.join(result).rstrip()
                # Check if what precedes is a string literal end, closing paren, or identifier
                if before and (before.endswith("'") or before.endswith('"') or before.endswith(')') or re.search(r'[a-zA-Z_]\s*$', before)):
                    result.append('||')
                else:
                    result.append('+')
                i += 1
                continue
            result.append(sql[i])
            i += 1
        return ''.join(result)

    def _quote_bare_aliases(self, sql):
        """Quote bare PascalCase column aliases to preserve case in PG.

        Handles patterns like:
            "i"."Name" Integration  →  "i"."Name" "Integration"
            "c"."Name" Company      →  "c"."Name" "Company"
        """
        # Pattern: quoted_column SPACE bare_PascalCase_alias (followed by comma, newline, or FROM)
        # Must not match: AS "Alias", __mj.TableName, already-quoted names
        def quote_alias(match):
            name = match.group(1)
            after = match.group(2)
            # Only quote if has uppercase and is not a keyword
            pg_kw = {'select', 'from', 'where', 'and', 'or', 'as', 'on', 'join',
                     'inner', 'left', 'right', 'outer', 'cross', 'full', 'group',
                     'by', 'order', 'having', 'with', 'union', 'all', 'distinct',
                     'true', 'false', 'null', 'not', 'in', 'is', 'between', 'like',
                     'case', 'when', 'then', 'else', 'end', 'exists', 'limit',
                     'offset', 'asc', 'desc', 'lateral', 'over', 'partition'}
            if name.lower() in pg_kw:
                return match.group(0)
            if name != name.lower():
                return f'"{name}"{after}'
            return match.group(0)

        # Match: after a closing quote or paren, a bare PascalCase word that is an alias
        kw_set = {
            'as', 'from', 'where', 'and', 'or', 'on', 'join', 'inner', 'left',
            'right', 'outer', 'cross', 'full', 'group', 'by', 'order', 'having',
            'not', 'null', 'in', 'is', 'select', 'into', 'lateral', 'over',
            'partition', 'window', 'union', 'all', 'distinct', 'with', 'limit',
            'then', 'else', 'end', 'when', 'case', 'between', 'like', 'exists',
            'true', 'false', 'asc', 'desc', 'returns', 'setof'
        }
        result = re.sub(
            r'(?<=["\)])\s+([A-Z][a-zA-Z0-9_]+)(\s*[,\n]|\s+AS\b|\s+FROM\b|\s*$)',
            lambda m: f' "{m.group(1)}"{m.group(2)}' if m.group(1).lower() not in kw_set
                and m.group(1) != m.group(1).lower() else m.group(0),
            sql, flags=re.MULTILINE
        )

        # Quote PascalCase aliases after AS keyword, but ONLY in SELECT contexts
        # (after function calls or computed expressions, not after FROM/JOIN table aliases)
        # Pattern: ) AS PascalName, → ) AS "PascalName",
        def quote_as_alias(match):
            name = match.group(1)
            after = match.group(2)
            if name.lower() in kw_set:
                return match.group(0)
            if name == name.lower():
                return match.group(0)
            return f'AS "{name}"{after}'

        result = re.sub(
            r'(?<=\))\s+AS\s+([A-Z][a-zA-Z0-9_]+)(\s*[,\n])',
            lambda m: f' AS "{m.group(1)}"{m.group(2)}' if m.group(1).lower() not in kw_set
                and m.group(1) != m.group(1).lower() else m.group(0),
            result, flags=re.MULTILINE
        )

        return result

    def _quote_pascalcase_identifiers(self, sql):
        """Quote PascalCase identifiers to preserve case in PostgreSQL."""
        # PG keywords that should NOT be quoted
        pg_keywords = {
            'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null',
            'as', 'on', 'inner', 'left', 'right', 'outer', 'join', 'cross',
            'full', 'group', 'by', 'order', 'having', 'limit', 'offset',
            'union', 'all', 'distinct', 'case', 'when', 'then', 'else', 'end',
            'insert', 'into', 'values', 'update', 'set', 'delete', 'create',
            'table', 'view', 'index', 'alter', 'drop', 'add', 'column',
            'constraint', 'primary', 'key', 'foreign', 'references', 'unique',
            'check', 'default', 'not', 'null', 'true', 'false', 'with',
            'recursive', 'exists', 'between', 'like', 'ilike', 'asc', 'desc',
            'count', 'sum', 'avg', 'min', 'max', 'coalesce', 'cast',
            'varchar', 'integer', 'boolean', 'text', 'uuid', 'timestamp',
            'timestamptz', 'numeric', 'date', 'time', 'interval',
            'begin', 'commit', 'rollback', 'declare', 'cursor', 'fetch',
            'return', 'returns', 'function', 'procedure', 'trigger',
            'before', 'after', 'each', 'row', 'execute', 'language',
            'plpgsql', 'replace', 'schema', 'grant', 'revoke', 'to',
            'cascade', 'restrict', 'if', 'then', 'elsif', 'loop', 'while',
            'for', 'raise', 'exception', 'notice', 'perform', 'new', 'old',
            'lateral', 'over', 'partition', 'window', 'filter', 'within',
            'string_agg', 'array_agg', 'json_agg', 'jsonb_agg',
            'length', 'position', 'upper', 'lower', 'trim', 'substring',
            'now', 'current_user', 'session_user', 'current_timestamp',
            'using', 'only', 'returning', 'conflict', 'nothing', 'do',
            'type', 'enum', 'sequence', 'serial', 'generated', 'always',
            'identity', 'temp', 'temporary', 'unlogged', 'materialized',
            'instead', 'rule', 'notify', 'listen', 'vacuum', 'analyze',
            'explain', 'verbose', 'format', 'row_number', 'rank',
            'dense_rank', 'lag', 'lead', 'first_value', 'last_value',
            'rows', 'range', 'unbounded', 'preceding', 'following', 'current',
            'no', 'action', 'initially', 'deferred', 'immediate',
            'inherits', 'of', 'collate', 'collation', 'extension',
            'btree', 'hash', 'gist', 'gin', 'brin', 'spgist',
            'include', 'tablespace', 'storage', 'plain', 'external',
            'main', 'extended',
            'zone',
        }

        # Pattern 1: alias.ColumnName where ColumnName has uppercase letters and isn't quoted
        # Match: word.PascalCase (where PascalCase has at least one uppercase)
        # In dotted context (alias.Column), the name after the dot is ALWAYS a column,
        # never a SQL keyword, so we do NOT skip keywords here.
        def quote_dotted(match):
            prefix = match.group(1)  # alias
            dot = match.group(2)     # .
            name = match.group(3)    # PascalCase
            if name.startswith('"'):
                return match.group(0)
            # Only quote if name has uppercase characters
            if name != name.lower():
                return f'{prefix}{dot}"{name}"'
            return match.group(0)

        # Match alias.UnquotedName patterns (NOT already schema-qualified with __mj.)
        s = re.sub(
            r'("?\w+"?)(\.)((?!__mj\b)[A-Z]\w*)\b',
            quote_dotted, sql
        )

        return s

    def _quote_standalone_pascalcase_in_views(self, sql):
        """Quote standalone PascalCase column references in view SQL.

        Handles cases like: AutoRunInterval, StartedAt (columns without alias prefix).
        Only safe for view SQL (not proc bodies which have @variables).
        """
        pg_keywords = {
            'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null',
            'as', 'on', 'inner', 'left', 'right', 'outer', 'join', 'cross',
            'full', 'group', 'by', 'order', 'having', 'limit', 'offset',
            'union', 'all', 'distinct', 'case', 'when', 'then', 'else', 'end',
            'insert', 'into', 'values', 'update', 'set', 'delete', 'create',
            'table', 'view', 'index', 'alter', 'drop', 'add', 'column',
            'constraint', 'primary', 'key', 'foreign', 'references', 'unique',
            'check', 'default', 'true', 'false', 'with', 'recursive',
            'exists', 'between', 'like', 'ilike', 'asc', 'desc',
            'count', 'sum', 'avg', 'min', 'max', 'coalesce', 'cast',
            'varchar', 'integer', 'boolean', 'text', 'uuid', 'timestamp',
            'timestamptz', 'numeric', 'date', 'time', 'interval',
            'lateral', 'over', 'partition', 'window', 'filter', 'within',
            'length', 'position', 'upper', 'lower', 'trim', 'substring',
            'replace', 'schema', 'grant', 'revoke', 'to', 'type',
            'returns', 'setof', 'zone',
        }

        def quote_standalone(match):
            name = match.group(1)
            if name.lower() in pg_keywords:
                return match.group(0)
            if name.startswith('"'):
                return match.group(0)
            # Only quote if has internal uppercase (true PascalCase/camelCase)
            if name != name.lower() and any(c.isupper() for c in name[1:]):
                return f'"{name}"'
            return match.group(0)

        # Match standalone PascalCase words NOT preceded by dot, quote, or schema
        # Negative lookahead prevents matching function-call names before (
        return re.sub(
            r'(?<![.\w"])(\b[A-Z][a-zA-Z]+[A-Z][a-zA-Z]*\b)(?![.\w"(])',
            quote_standalone, sql
        )

    def _quote_schema_qualified_identifiers(self, sql):
        """Quote unquoted identifiers after schema prefix.

        Converts patterns like __mj.vwEntities to __mj."vwEntities"
        and "__mj".vwEntities to "__mj"."vwEntities".
        Also lowercases INFORMATION_SCHEMA references.
        """
        def quote_after_schema(match):
            schema = match.group(1)
            name = match.group(2)
            # Don't quote if already lowercase (would be fine unquoted)
            if name == name.lower():
                return match.group(0)
            return f'{schema}"{name}"'

        # Handle both __mj. and "__mj". patterns
        s = re.sub(
            r'("?__mj"?\.)([A-Za-z]\w*)\b(?!")',
            quote_after_schema, sql
        )

        # Lowercase INFORMATION_SCHEMA references
        s = re.sub(r'\bINFORMATION_SCHEMA\b', 'information_schema', s, flags=re.IGNORECASE)
        # Lowercase common PG system schema references that get PascalCase quoted
        s = re.sub(r'information_schema\."([^"]+)"', lambda m: f'information_schema.{m.group(1).lower()}', s)

        return s

    def _convert_convert_functions(self, sql):
        """Convert T-SQL CONVERT(type, expr[, style]) to PG CAST(expr AS type).

        Uses balanced parenthesis matching to handle nested expressions correctly.
        """
        pattern = re.compile(r'\bCONVERT\s*\(', re.IGNORECASE)
        result = sql
        # Process in reverse order to maintain positions
        for m in reversed(list(pattern.finditer(result))):
            start = m.start()
            paren_start = m.end() - 1  # position of (
            # Find matching closing paren
            depth = 1
            pos = paren_start + 1
            while pos < len(result) and depth > 0:
                if result[pos] == '(':
                    depth += 1
                elif result[pos] == ')':
                    depth -= 1
                pos += 1
            if depth != 0:
                continue
            inner = result[paren_start+1:pos-1]
            # Parse: type, expr [, style]
            type_match = re.match(
                r'\s*(NVARCHAR\s*\(\s*(?:MAX|\d+)\s*\)|VARCHAR\s*\(\s*(?:MAX|\d+)\s*\)|INT|INTEGER|FLOAT|DATETIME|DATE)\s*,\s*',
                inner, re.IGNORECASE
            )
            if not type_match:
                continue
            tsql_type = type_match.group(1).strip()
            rest = inner[type_match.end():]
            # Check for style parameter (,number at the end)
            style_match = re.match(r'(.+?)\s*,\s*\d+\s*$', rest, re.DOTALL)
            expr = style_match.group(1) if style_match else rest
            # Convert type to PG
            pg_type = re.sub(r'NVARCHAR\s*\(\s*MAX\s*\)', 'TEXT', tsql_type, flags=re.IGNORECASE)
            pg_type = re.sub(r'NVARCHAR\s*\(\s*(\d+)\s*\)', r'VARCHAR(\1)', pg_type, flags=re.IGNORECASE)
            result = result[:start] + f'CAST({expr} AS {pg_type})' + result[pos:]
        return result

    def _convert_iif(self, sql):
        """Convert IIF(cond, true_val, false_val) to CASE WHEN cond THEN true_val ELSE false_val END."""
        # Iteratively replace innermost IIF first
        max_iterations = 50
        for _ in range(max_iterations):
            m = re.search(r'\bIIF\s*\(', sql, re.IGNORECASE)
            if not m:
                break
            start = m.start()
            # Find matching closing paren
            paren_start = m.end() - 1  # position of (
            depth = 0
            pos = paren_start
            while pos < len(sql):
                if sql[pos] == '(':
                    depth += 1
                elif sql[pos] == ')':
                    depth -= 1
                    if depth == 0:
                        break
                pos += 1

            if depth != 0:
                break  # Unbalanced parens

            inner = sql[paren_start+1:pos]
            # Split on top-level commas (not inside parens)
            parts = self._split_top_level(inner, ',')
            if len(parts) == 3:
                cond = parts[0].strip()
                true_val = parts[1].strip()
                false_val = parts[2].strip()
                replacement = f'CASE WHEN {cond} THEN {true_val} ELSE {false_val} END'
                sql = sql[:start] + replacement + sql[pos+1:]
            else:
                break  # Can't parse

        return sql

    def _split_top_level(self, s, delimiter):
        """Split string on delimiter, respecting nested parens and quotes."""
        parts = []
        current = []
        depth = 0
        in_quote = False
        i = 0
        while i < len(s):
            c = s[i]
            if c == "'" and not in_quote:
                in_quote = True
                current.append(c)
            elif c == "'" and in_quote:
                # Check for escaped quote ''
                if i + 1 < len(s) and s[i+1] == "'":
                    current.append("''")
                    i += 1
                else:
                    in_quote = False
                    current.append(c)
            elif not in_quote:
                if c == '(':
                    depth += 1
                    current.append(c)
                elif c == ')':
                    depth -= 1
                    current.append(c)
                elif c == delimiter and depth == 0:
                    parts.append(''.join(current))
                    current = []
                else:
                    current.append(c)
            else:
                current.append(c)
            i += 1
        if current:
            parts.append(''.join(current))
        return parts

    def _convert_outer_apply(self, sql):
        """Convert OUTER APPLY to LEFT JOIN LATERAL ... ON true."""
        result = sql

        # First handle OUTER APPLY fn_name(args) AS alias (function call form)
        # These are table-valued functions (e.g., _GetRootID) that return TABLE.
        # Convert to: LEFT JOIN LATERAL fn_name(args) AS alias ON true
        while True:
            m = re.search(
                r'\bOUTER\s+APPLY\s+("?[^"\s(]+"?(?:\."?[^"\s(]+"?)?)\s*\(',
                result, re.IGNORECASE | re.DOTALL
            )
            if not m:
                break
            start = m.start()
            fn_ref = m.group(1)
            # Find the closing paren of the function call
            paren_start = m.end() - 1
            depth = 0
            pos = paren_start
            while pos < len(result):
                if result[pos] == '(':
                    depth += 1
                elif result[pos] == ')':
                    depth -= 1
                    if depth == 0:
                        break
                pos += 1
            if depth != 0:
                break
            fn_call = result[m.start() + m.group(0).index(fn_ref):pos+1]
            # Find the alias after the function call
            after = result[pos+1:]
            alias_match = re.match(r'\s+AS\s+(\w+)', after, re.IGNORECASE)
            if alias_match:
                alias_end = pos + 1 + alias_match.end()
                alias_text = alias_match.group(1)
            else:
                alias_match = re.match(r'\s+("?\w+"?)', after)
                if alias_match:
                    alias_end = pos + 1 + alias_match.end()
                    alias_text = alias_match.group(1)
                else:
                    break
            result = (result[:start] +
                     f'LEFT JOIN LATERAL {fn_call} AS {alias_text} ON true' +
                     result[alias_end:])

        # Then handle OUTER APPLY (subquery) AS alias
        while True:
            m = re.search(r'\bOUTER\s+APPLY\s*\(', result, re.IGNORECASE)
            if not m:
                break
            start = m.start()
            paren_start = m.end() - 1
            # Find matching closing paren
            depth = 0
            pos = paren_start
            while pos < len(result):
                if result[pos] == '(':
                    depth += 1
                elif result[pos] == ')':
                    depth -= 1
                    if depth == 0:
                        break
                pos += 1
            if depth != 0:
                break
            # Find the alias after )
            after_paren = result[pos+1:]
            alias_match = re.match(r'\s+AS\s+(\w+)', after_paren, re.IGNORECASE)
            if alias_match:
                alias_end = pos + 1 + alias_match.end()
                result = (result[:start] + 'LEFT JOIN LATERAL (' +
                         result[paren_start+1:pos] + ')' +
                         alias_match.group(0) + ' ON true' +
                         result[alias_end:])
            else:
                # No alias found, just replace OUTER APPLY with LEFT JOIN LATERAL
                alias_match2 = re.match(r'\s+("?\w+"?)', after_paren)
                if alias_match2:
                    alias_end = pos + 1 + alias_match2.end()
                    result = (result[:start] + 'LEFT JOIN LATERAL (' +
                             result[paren_start+1:pos] + ')' +
                             alias_match2.group(0) + ' ON true' +
                             result[alias_end:])
                else:
                    result = (result[:start] + 'LEFT JOIN LATERAL (' +
                             result[paren_start+1:pos] + ') ON true' +
                             result[pos+1:])
        return result

    def _convert_cross_apply(self, sql):
        """Convert CROSS APPLY to CROSS JOIN LATERAL."""
        sql = re.sub(
            r'\bCROSS\s+APPLY\s*\(',
            'CROSS JOIN LATERAL (',
            sql, flags=re.IGNORECASE
        )
        return sql

    def _convert_top_to_limit(self, sql):
        """Convert SELECT TOP N to SELECT ... LIMIT N."""
        # Pattern: SELECT TOP (N) or SELECT TOP N
        def replace_top(match):
            full = match.group(0)
            n = match.group(1) or match.group(2)
            # Replace TOP N with nothing, we'll add LIMIT later
            return full.replace(match.group(0), f'SELECT /*TOP_{n}*/ ')

        sql = re.sub(r'\bSELECT\s+TOP\s*\(\s*(\d+)\s*\)', r'SELECT /*TOP_\1*/', sql, flags=re.IGNORECASE)
        sql = re.sub(r'\bSELECT\s+TOP\s+(\d+)\b', r'SELECT /*TOP_\1*/', sql, flags=re.IGNORECASE)

        # Now find /*TOP_N*/ markers and add LIMIT N at end of the statement
        def add_limit(match):
            n = match.group(1)
            return f'LIMIT {n}'

        # Replace markers: for now, leave them and add LIMIT at statement end
        # This is complex for nested subqueries - handle top-level only
        top_match = re.search(r'/\*TOP_(\d+)\*/', sql)
        if top_match:
            n = top_match.group(1)
            sql = sql.replace(f'/*TOP_{n}*/', '')
            # Add LIMIT before the final semicolon or at end
            sql = sql.rstrip()
            if sql.endswith(';'):
                sql = sql[:-1] + f'\nLIMIT {n};'
            else:
                sql += f'\nLIMIT {n}'

        return sql

    # ──────────────────────────────────────────────────────
    # Pass 3: Stored Procedures → Functions
    # ──────────────────────────────────────────────────────

    def _convert_procedure(self, idx):
        """Convert a CREATE PROCEDURE to a CREATE FUNCTION."""
        # Collect entire procedure body until GO
        proc_lines = []
        while idx < len(self.lines):
            l = self.lines[idx]
            if l.strip() == 'GO':
                idx += 1
                break
            proc_lines.append(l)
            idx += 1

        proc_sql = ''.join(proc_lines)
        pg_func = self._convert_proc_to_func(proc_sql)

        if pg_func:
            self.emit(pg_func)
            self.emit_line()

        return idx

    def _extract_body_with_nesting(self, sql):
        """Extract the outermost BEGIN...END body, respecting nested BEGIN/END blocks.
        Tracks CASE...END separately so CASE expressions don't prematurely close BEGIN blocks."""
        # Find the AS keyword followed by BEGIN (the proc body start)
        as_match = re.search(r'\bAS\b\s*\n\s*\bBEGIN\b', sql, re.IGNORECASE)
        if not as_match:
            return None
        # Start from after the first BEGIN
        begin_pos = as_match.end()
        depth = 1       # BEGIN...END depth
        case_depth = 0  # CASE...END depth (nested CASE expressions)
        pos = begin_pos
        while pos < len(sql) and depth > 0:
            # Skip string literals
            if sql[pos] == "'":
                pos += 1
                while pos < len(sql):
                    if sql[pos] == "'" and pos + 1 < len(sql) and sql[pos+1] == "'":
                        pos += 2  # escaped quote
                        continue
                    if sql[pos] == "'":
                        pos += 1
                        break
                    pos += 1
                continue
            # Skip -- comments
            if sql[pos:pos+2] == '--':
                while pos < len(sql) and sql[pos] != '\n':
                    pos += 1
                continue
            # Check for CASE keyword (word boundary) - track CASE depth
            if sql[pos:pos+4].upper() == 'CASE' and (pos == 0 or not sql[pos-1].isalnum()) and (pos+4 >= len(sql) or not sql[pos+4].isalnum()):
                case_depth += 1
                pos += 4
                continue
            # Check for BEGIN keyword (word boundary)
            if sql[pos:pos+5].upper() == 'BEGIN' and (pos == 0 or not sql[pos-1].isalnum()) and (pos+5 >= len(sql) or not sql[pos+5].isalnum()):
                depth += 1
                pos += 5
                continue
            # Check for END keyword (word boundary)
            if sql[pos:pos+3].upper() == 'END' and (pos == 0 or not sql[pos-1].isalnum()) and (pos+3 >= len(sql) or not sql[pos+3].isalnum()):
                if case_depth > 0:
                    # This END closes a CASE expression, not a BEGIN block
                    case_depth -= 1
                else:
                    depth -= 1
                    if depth == 0:
                        return sql[begin_pos:pos].strip()
                pos += 3
                continue
            pos += 1
        return None

    def _convert_proc_to_func(self, proc_sql):
        """Convert a T-SQL stored procedure to a PG function."""
        s = proc_sql
        s = replace_schema_placeholder(s)
        s = strip_collate(s)

        # Extract procedure name
        name_match = re.search(r'CREATE\s+PROCEDURE\s+.*?\."?\[?(\w+)\]?"?', s, re.IGNORECASE)
        if not name_match:
            return None
        proc_name = name_match.group(1)

        # Extract parameters
        params = self._extract_proc_params(s)

        # Extract body using proper nesting
        body = self._extract_body_with_nesting(s)
        if not body:
            return None

        # Determine procedure type (create, update, delete, or utility)
        proc_type = self._classify_proc(proc_name, body)

        # Convert the body
        pg_body = self._convert_proc_body(body, proc_name, proc_type, params)

        # Build PG function
        pg_params = self._format_pg_params(params)

        # Determine return type
        return_type = self._determine_return_type(proc_name, proc_type, body)

        fn_name = proc_name  # Keep same name for now

        # Skip procs that reference non-existent tables/views in this baseline
        # Don't even emit stubs since the referenced views don't exist
        missing_refs = ['EntityBehaviorType', 'EntityBehavior']
        if any(ref in proc_name for ref in missing_refs):
            self.functions_created.append(proc_name)
            return f'-- SKIPPED: {proc_name} references non-existent EntityBehavior tables (generated by CodeGen)\n'

        # Check if the converted body has unconverted T-SQL patterns
        # If so, emit a stub function instead of broken PG code
        has_unconverted = (
            re.search(r'\bEXEC\b\s+"?__mj', pg_body, re.IGNORECASE) or
            re.search(r'\bSET\s+v_\w+\s*=\s', pg_body, re.IGNORECASE) or
            re.search(r'-- cursor loop\s*\n\s*BEGIN\b', pg_body, re.IGNORECASE) or
            re.search(r'\bDECLARE\s+@', pg_body, re.IGNORECASE) or
            re.search(r'sys\.\w+', pg_body, re.IGNORECASE) or
            re.search(r'\bsp_executesql\b', pg_body, re.IGNORECASE) or
            re.search(r'\bCONVERT\s*\(', pg_body, re.IGNORECASE) or
            re.search(r'\bSTRING_SPLIT\s*\(', pg_body, re.IGNORECASE) or
            re.search(r'\bINSERT\s+INTO\s+v_\w+', pg_body, re.IGNORECASE)
        )
        if has_unconverted:
            return self._emit_stub_function(proc_name, params, proc_type, body)

        # Determine DECLARE variables
        declare_vars = ['v_result RECORD;']
        if proc_type == 'delete' or 'v_rowcount' in pg_body:
            declare_vars.insert(0, 'v_rowcount INTEGER;')
        if proc_type == 'create' or 'v_inserted_id' in pg_body:
            declare_vars.insert(0, 'v_inserted_id UUID;')

        # Extract local variable declarations from original body
        local_vars = self._extract_local_var_declarations(body, params)
        declared_names = {dv.split()[0].lower() for dv in declare_vars}
        for var_decl in local_vars:
            var_lower = var_decl.split()[0].lower()
            if var_lower not in declared_names:
                declare_vars.append(var_decl)
                declared_names.add(var_lower)

        # Also detect any v_VarName references in the converted body that need declaration
        for m in re.finditer(r'\bv_(\w+)\b', pg_body):
            var_name = m.group(1)
            full_name = f'v_{var_name}'.lower()
            # Skip already-declared vars (case-insensitive)
            if full_name in declared_names:
                continue
            # Skip known vars
            if var_name.lower() in ('result', 'rowcount', 'inserted_id', 'fetch_status', 'rec'):
                continue
            # Add as generic declaration
            decl = f'v_{var_name} TEXT;'
            declare_vars.append(decl)
            declared_names.add(full_name)

        declare_block = '\n'.join(f'    {v}' for v in declare_vars)

        result = f"""CREATE OR REPLACE FUNCTION {SCHEMA}."{fn_name}"({pg_params})
RETURNS {return_type} AS $$
DECLARE
{declare_block}
BEGIN
{pg_body}
END;
$$ LANGUAGE plpgsql;
"""
        self.functions_created.append(fn_name)
        return result

    def _extract_proc_params(self, proc_sql):
        """Extract parameters from procedure definition."""
        params = []
        # Find params between proc name and AS keyword
        # Pattern: @ParamName type [= default] [OUTPUT]
        header_match = re.search(r'CREATE\s+PROCEDURE\s+.*?\n(.*?)\nAS\b', proc_sql, re.DOTALL | re.IGNORECASE)
        if not header_match:
            return params

        header = header_match.group(1)
        # Match @param type patterns
        for m in re.finditer(
            r"@(\w+)\s+(\w+(?:\s*\([^)]*\))?)\s*(?:=\s*('(?:[^']|'')*'|[^,\n]+))?\s*(?:(OUTPUT|OUT)\b)?",
            header, re.IGNORECASE
        ):
            param_name = m.group(1)
            param_type = m.group(2)
            default = m.group(3)
            is_output = m.group(4) is not None
            params.append((param_name, param_type, default, is_output))

        return params

    def _extract_local_var_declarations(self, body, params):
        """Extract DECLARE @Var TYPE statements from the original body and return PG DECLARE entries.

        Looks for DECLARE @VarName TYPE patterns in the body (before conversion)
        and returns them as PG-style declarations: v_VarName pg_type;
        Skips variables that match parameter names.
        """
        declarations = []
        param_names = {p[0].lower() for p in params}

        # Match DECLARE @VarName TYPE [= default]
        for m in re.finditer(
            r'DECLARE\s+@(\w+)\s+(\w+(?:\s*\([^)]*\))?)',
            body, re.IGNORECASE
        ):
            var_name = m.group(1)
            var_type = m.group(2)
            # Skip if it's a TABLE variable
            if var_type.upper() == 'TABLE':
                continue
            # Skip if it's a CURSOR
            if var_type.upper() == 'CURSOR':
                continue
            # Skip if matches a parameter name
            if var_name.lower() in param_names:
                continue
            # Skip InsertedRow (handled separately)
            if var_name.lower() == 'insertedrow':
                continue
            pg_type = convert_type(var_type)
            decl = f'v_{var_name} {pg_type};'
            if decl not in declarations:
                declarations.append(decl)

        return declarations

    def _format_pg_params(self, params):
        """Format parameters for PG function signature.
        PG requires that all params after the first one with a DEFAULT
        must also have defaults. We solve this by giving DEFAULT NULL
        to all params that don't have an explicit default, once we encounter
        one that does.
        """
        # Check if any param has a default
        has_default = any(d is not None for _, _, d, _ in params)

        pg_params = []
        seen_default = False
        for name, tsql_type, default, is_output in params:
            pg_type = convert_type(tsql_type)
            direction = 'INOUT' if is_output else 'IN'
            p = f'{direction} p_{name} {pg_type}'
            if default is not None:
                seen_default = True
                d = default.strip()
                if d.upper() == 'NULL':
                    p += ' DEFAULT NULL'
                else:
                    pg_def = convert_default(d, pg_type)
                    p += f' DEFAULT {pg_def}'
            elif seen_default:
                # PG requires defaults after first default param
                p += ' DEFAULT NULL'
            pg_params.append(p)
        return ', '.join(pg_params)

    def _emit_stub_function(self, proc_name, params, proc_type, original_body):
        """Emit a stub function for complex T-SQL procedures that can't be auto-converted.

        The stub creates a valid PG function that raises an exception when called,
        indicating it needs manual implementation.
        """
        pg_params = self._format_pg_params(params)
        return_type = self._determine_return_type(proc_name, proc_type, original_body)

        # For functions returning TABLE or SETOF, we need a valid return
        if 'TABLE' in return_type:
            body = f"""    -- STUB: This procedure requires manual PostgreSQL conversion.
    -- Original T-SQL uses cursors, EXEC calls, or other patterns not auto-convertible.
    RAISE EXCEPTION 'Function {proc_name} is a stub - requires manual PostgreSQL implementation';"""
        elif 'SETOF' in return_type:
            body = f"""    -- STUB: This procedure requires manual PostgreSQL conversion.
    -- Original T-SQL uses cursors, EXEC calls, or other patterns not auto-convertible.
    RAISE EXCEPTION 'Function {proc_name} is a stub - requires manual PostgreSQL implementation';"""
        else:
            body = f"""    -- STUB: This procedure requires manual PostgreSQL conversion.
    RAISE EXCEPTION 'Function {proc_name} is a stub - requires manual PostgreSQL implementation';"""

        result = f"""CREATE OR REPLACE FUNCTION {SCHEMA}."{proc_name}"({pg_params})
RETURNS {return_type} AS $$
BEGIN
{body}
END;
$$ LANGUAGE plpgsql;
"""
        self.functions_created.append(proc_name)
        return result

    def _classify_proc(self, name, body):
        """Classify procedure as create/update/delete/utility."""
        nl = name.lower()
        if nl.startswith('spcreate'):
            return 'create'
        if nl.startswith('spupdate'):
            return 'update'
        if nl.startswith('spdelete'):
            return 'delete'
        return 'utility'

    def _determine_return_type(self, proc_name, proc_type, body):
        """Determine the appropriate return type for the PG function."""
        if proc_type == 'delete':
            return 'TABLE("ID" UUID)'

        # For create/update, find the view they SELECT from
        view_match = re.search(r'SELECT\s+\*\s+FROM\s+.*?\.\[?(\w+)\]?', body, re.IGNORECASE)
        if view_match:
            view_name = view_match.group(1)
            return f'SETOF {SCHEMA}."{view_name}"'

        if proc_type in ('create', 'update'):
            return 'SETOF RECORD'

        return 'void'

    def _convert_proc_body(self, body, proc_name, proc_type, params):
        """Convert T-SQL procedure body to PG function body."""
        s = body
        # Remove SET NOCOUNT ON
        s = re.sub(r'\bSET\s+NOCOUNT\s+ON\s*;?', '', s, flags=re.IGNORECASE)
        # Replace schema placeholder
        s = replace_schema_placeholder(s)
        # Strip brackets
        s = strip_brackets(s)
        # Remove COLLATE
        s = strip_collate(s)
        # Remove OUTPUT INSERTED pattern early (before @variable conversion)
        s = re.sub(r'OUTPUT\s+INSERTED\.\[?"?(\w+)"?\]?\s+INTO\s+@\w+', '', s, flags=re.IGNORECASE)

        # Remove @InsertedRow table variable declaration early
        s = re.sub(r'DECLARE\s+@InsertedRow\s+TABLE\s*\([^)]+\)\s*;?', '', s, flags=re.IGNORECASE)

        # Replace (SELECT "ID" FROM @InsertedRow) with v_inserted_id early
        s = re.sub(r'\(SELECT\s+\[?"?ID"?\]?\s+FROM\s+@InsertedRow\s*\)', 'v_inserted_id', s, flags=re.IGNORECASE)

        # Remove remaining @InsertedRow refs
        s = re.sub(r'@InsertedRow', 'v_inserted_id', s, flags=re.IGNORECASE)

        # @Param → p_Param
        for pname, _, _, _ in params:
            s = re.sub(r'@' + pname + r'\b', f'p_{pname}', s, flags=re.IGNORECASE)

        # GETUTCDATE()/GETDATE()/SYSDATETIMEOFFSET()
        s = re.sub(r'\bGETUTCDATE\s*\(\)', "NOW() AT TIME ZONE 'UTC'", s, flags=re.IGNORECASE)
        s = re.sub(r'\bGETDATE\s*\(\)', "NOW()", s, flags=re.IGNORECASE)
        s = re.sub(r'\bSYSDATETIMEOFFSET\s*\(\)', "NOW()", s, flags=re.IGNORECASE)
        # USER_NAME() / SUSER_NAME()
        s = re.sub(r'\bUSER_NAME\s*\(\)', 'current_user', s, flags=re.IGNORECASE)
        s = re.sub(r'\bSUSER_NAME\s*\(\)', 'session_user', s, flags=re.IGNORECASE)
        # SCOPE_IDENTITY() → needs special handling with RETURNING
        s = re.sub(r'\bSCOPE_IDENTITY\s*\(\)', 'lastval()', s, flags=re.IGNORECASE)
        # @@ROWCOUNT → diagnostics
        s = re.sub(r'@@ROWCOUNT', 'v_rowcount', s, flags=re.IGNORECASE)
        # @@ERROR → (handled by exception)
        s = re.sub(r'@@ERROR', '0', s, flags=re.IGNORECASE)
        # ISNULL → COALESCE
        s = re.sub(r'\bISNULL\s*\(', 'COALESCE(', s, flags=re.IGNORECASE)
        # IIF
        s = self._convert_iif(s)
        # NEWSEQUENTIALID() / NEWID()
        s = re.sub(r'\bNEWSEQUENTIALID\s*\(\)', 'gen_random_uuid()', s, flags=re.IGNORECASE)
        s = re.sub(r'\bNEWID\s*\(\)', 'gen_random_uuid()', s, flags=re.IGNORECASE)
        # RAISERROR → RAISE EXCEPTION
        s = re.sub(r'\bRAISERROR\s*\(', 'RAISE EXCEPTION ', s, flags=re.IGNORECASE)
        # N'string' → 'string'
        s = re.sub(r"(?<![A-Za-z])N'([^']*)'", r"'\1'", s)
        # NVARCHAR → VARCHAR
        s = re.sub(r'\bNVARCHAR\s*\(\s*MAX\s*\)', 'TEXT', s, flags=re.IGNORECASE)
        s = re.sub(r'\bNVARCHAR\s*\(\s*(\d+)\s*\)', r'VARCHAR(\1)', s, flags=re.IGNORECASE)
        # uniqueidentifier → UUID
        s = re.sub(r'\buniquidentifier\b', 'UUID', s, flags=re.IGNORECASE)
        s = re.sub(r'\buniqueidentifier\b', 'UUID', s, flags=re.IGNORECASE)
        # bit → BOOLEAN
        s = re.sub(r'\bbit\b', 'BOOLEAN', s, flags=re.IGNORECASE)
        # varbinary → BYTEA
        s = re.sub(r'\bvarbinary\s*\(\s*(?:MAX|\d+)\s*\)', 'BYTEA', s, flags=re.IGNORECASE)
        s = re.sub(r'\bvarbinary\b', 'BYTEA', s, flags=re.IGNORECASE)

        # String concatenation + → ||
        s = self._convert_string_concat(s)

        # Quote PascalCase identifiers
        s = self._quote_pascalcase_identifiers(s)
        s = self._quote_schema_qualified_identifiers(s)

        # Convert remaining @variable references (local vars, not params)
        # Must run AFTER @@ROWCOUNT and @@ERROR conversion to avoid mangling them
        s = self._convert_local_variables(s)

        # Handle proc-type-specific conversions
        if proc_type == 'delete':
            s = self._convert_delete_body(s, params)
        elif proc_type in ('create', 'update'):
            s = self._convert_create_update_body(s, proc_type, params)
        else:
            # Utility procs - just do basic IF conversion
            s = self._convert_if_blocks(s)
            # Try to convert SELECT * FROM to RETURN QUERY
            s = re.sub(
                r'SELECT\s+\*\s+FROM\s',
                'RETURN QUERY SELECT * FROM ',
                s, flags=re.IGNORECASE
            )

        # Add semicolons after DELETE, UPDATE, INSERT statements if missing
        s = self._add_missing_semicolons(s)

        # Ensure the last non-blank line ends with a semicolon
        # (the body is wrapped in BEGIN...END; externally, so the last statement must terminate)
        lines_tmp = s.rstrip().split('\n')
        for idx in range(len(lines_tmp) - 1, -1, -1):
            stripped_line = lines_tmp[idx].strip()
            if stripped_line and not stripped_line.startswith('--'):
                if not stripped_line.endswith(';'):
                    lines_tmp[idx] = lines_tmp[idx] + ';'
                break
        s = '\n'.join(lines_tmp)

        # Clean up
        s = s.strip()
        # Indent
        lines = s.split('\n')
        indented = '\n'.join('    ' + l for l in lines)
        return indented

    def _add_missing_semicolons(self, s):
        """Add missing semicolons after SQL statements where needed.

        Targets specific patterns where T-SQL doesn't require ; but PG does:
        1. DELETE/UPDATE WHERE ... = p_ID (before GET DIAGNOSTICS or IF)
        2. INSERT ... VALUES (...) closing paren (before ELSE or END IF)
        """
        lines = s.split('\n')
        result = []
        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()

            if stripped and not stripped.endswith(';') and not stripped.endswith(','):
                # Look ahead for next non-blank, non-comment line
                next_nonblank = ''
                for j in range(i+1, len(lines)):
                    ns = lines[j].strip()
                    if ns and not ns.startswith('--'):
                        next_nonblank = ns.upper()
                        break

                # Pattern 1: WHERE ... = p_ID before GET or IF
                if (next_nonblank.startswith('GET ') or next_nonblank.startswith('IF ')):
                    if re.search(r'=\s*p_\w+\s*$', stripped):
                        result.append(line + ';')
                        i += 1
                        continue

                # Pattern 2: closing paren ) before ELSE or END IF
                if (next_nonblank.startswith('ELSE') or next_nonblank.startswith('END IF')):
                    if stripped.endswith(')'):
                        result.append(line + ';')
                        i += 1
                        continue

                # Pattern 3: RETURN QUERY or any statement ending with an identifier/value
                # before END; (function end)
                if next_nonblank == 'END;' or next_nonblank.startswith('END;'):
                    if ('RETURN QUERY' in stripped.upper() or
                        re.search(r'=\s*p_\w+\s*$', stripped) or
                        re.search(r'=\s*v_\w+\s*$', stripped) or
                        stripped.endswith(')')):
                        result.append(line + ';')
                        i += 1
                        continue

            result.append(line)
            i += 1
        return '\n'.join(result)

    def _convert_local_variables(self, s):
        """Convert remaining T-SQL @variable patterns to PG v_variable.

        Only runs if there are remaining @ references after param conversion.
        This avoids breaking already-clean procs.
        """
        # Check if there are any remaining @ references
        if not re.search(r'@\w+', s):
            return s  # Nothing to do - all @params already converted

        # DECLARE @Var TYPE = expr -> v_Var := expr;
        s = re.sub(
            r'DECLARE\s+@(\w+)\s+\w+(?:\s*\([^)]*\))?\s*=\s*(.+)',
            lambda m: 'v_' + m.group(1) + ' := ' + m.group(2).rstrip(';') + ';',
            s, flags=re.IGNORECASE
        )

        # DECLARE @Var TYPE (no assignment) -> remove (handled in DECLARE block)
        s = re.sub(
            r'DECLARE\s+@(\w+)\s+\w+(?:\s*\([^)]*\))?\s*;?\s*$',
            '',
            s, flags=re.IGNORECASE | re.MULTILINE
        )

        # DECLARE @table TABLE (...) -> remove
        s = re.sub(
            r'DECLARE\s+@\w+\s+TABLE\s*\([^)]+\)\s*;?',
            '',
            s, flags=re.IGNORECASE | re.DOTALL
        )

        # Convert SET @Var = value → v_Var := value;
        s = re.sub(
            r'\bSET\s+@(\w+)\s*=\s*([^;\n]+)',
            lambda m: f'v_{m.group(1)} := {m.group(2).strip()};',
            s, flags=re.IGNORECASE
        )

        # Convert cursor patterns
        s = self._convert_cursors(s)

        # Convert EXEC proc calls
        s = self._convert_exec_calls(s)

        # Convert INSERT INTO @TableVar
        s = re.sub(r'INSERT\s+INTO\s+@(\w+)', r'INSERT INTO v_\1', s, flags=re.IGNORECASE)

        # Convert FROM @TableVar
        s = re.sub(r'\bFROM\s+@(\w+)', r'FROM v_\1', s, flags=re.IGNORECASE)

        # Convert @@FETCH_STATUS
        s = re.sub(r'@@FETCH_STATUS', 'v_fetch_status', s, flags=re.IGNORECASE)

        # Convert remaining @VarName -> v_VarName
        s = re.sub(r'@(\w+)', r'v_\1', s)

        return s

    def _convert_cursors(self, s):
        """Convert T-SQL cursor patterns to PG FOR record IN ... LOOP patterns.

        T-SQL pattern:
            DECLARE cursor_name CURSOR FOR SELECT ...
            OPEN cursor_name
            FETCH NEXT FROM cursor_name INTO @var1, @var2, ...
            WHILE @@FETCH_STATUS = 0
            BEGIN
                -- body using @var1, @var2
                FETCH NEXT FROM cursor_name INTO @var1, @var2, ...
            END
            CLOSE cursor_name
            DEALLOCATE cursor_name

        PG equivalent:
            FOR v_rec IN SELECT ... LOOP
                -- body using v_rec.col1, v_rec.col2
            END LOOP;
        """
        # For now, just remove the cursor ceremony and let @var → v_var handle the rest
        # The cursor-based procs will need the variables declared in the DECLARE block

        # Remove DECLARE cursor FOR SELECT (keep the SELECT for reference)
        s = re.sub(r'DECLARE\s+\w+_cursor\s+CURSOR\s+FOR\s*\n?', '', s, flags=re.IGNORECASE)
        s = re.sub(r'DECLARE\s+\w+\s+CURSOR\s+FOR\s*\n?', '', s, flags=re.IGNORECASE)

        # Remove OPEN cursor_name
        s = re.sub(r'OPEN\s+\w+_cursor\s*;?\s*$', '', s, flags=re.IGNORECASE | re.MULTILINE)
        s = re.sub(r'OPEN\s+\w+\s*;?\s*$', '', s, flags=re.IGNORECASE | re.MULTILINE)

        # Remove CLOSE cursor_name
        s = re.sub(r'CLOSE\s+\w+_cursor\s*;?\s*$', '', s, flags=re.IGNORECASE | re.MULTILINE)
        s = re.sub(r'CLOSE\s+\w+\s*;?\s*$', '', s, flags=re.IGNORECASE | re.MULTILINE)

        # Remove DEALLOCATE cursor_name
        s = re.sub(r'DEALLOCATE\s+\w+_cursor\s*;?\s*$', '', s, flags=re.IGNORECASE | re.MULTILINE)
        s = re.sub(r'DEALLOCATE\s+\w+\s*;?\s*$', '', s, flags=re.IGNORECASE | re.MULTILINE)

        # Convert FETCH NEXT FROM cursor INTO @var1, @var2 → remove (handled by FOR loop)
        s = re.sub(r'FETCH\s+NEXT\s+FROM\s+\w+\s+INTO\s+[^\n]+', '', s, flags=re.IGNORECASE)

        # Convert WHILE @@FETCH_STATUS = 0 → LOOP (simplified)
        s = re.sub(r'WHILE\s+@@FETCH_STATUS\s*=\s*0\s*$', '-- cursor loop', s, flags=re.IGNORECASE | re.MULTILINE)

        return s

    def _convert_exec_calls(self, s):
        """Convert T-SQL EXEC proc @param = @val calls to PG PERFORM proc(p_param := val).

        T-SQL: EXEC [schema].[spUpdate] @param1 = @var1, @param2 = @var2
        PG:    PERFORM schema."spUpdate"(p_param1 := v_var1, p_param2 := v_var2);
        """
        def convert_exec(match):
            full = match.group(0)
            # Extract proc name (handle both quoted and bracketed formats)
            proc_match = re.search(r'EXEC(?:UTE)?\s+(?:"?__mj"?\s*\.\s*)?(?:\[?"?)(\w+)(?:"?\]?)', full, re.IGNORECASE)
            if not proc_match:
                return full
            proc_name = proc_match.group(1)

            # Extract named parameters: @param = value or v_param = value
            # After quoting, params might be @param or v_param
            param_pairs = re.findall(
                r'(?:@|v_|p_)(\w+)\s*=\s*(@\w+|p_\w+|v_\w+|NULL|\'[^\']*\'|\d+)',
                full, re.IGNORECASE
            )
            if param_pairs:
                pg_params = ', '.join(f'p_{name} := {val}' for name, val in param_pairs)
                return f'PERFORM "__mj"."{proc_name}"({pg_params});'

            # Positional params
            after_name = full[proc_match.end():].strip()
            if after_name:
                return f'PERFORM "__mj"."{proc_name}"({after_name});'
            return f'PERFORM "__mj"."{proc_name}"();'

        # Match EXEC [schema].[proc] @params (multi-line)
        # Handle both bracketed and quoted identifier formats
        s = re.sub(
            r'EXEC(?:UTE)?\s+(?:"?__mj"?\s*\.\s*)?(?:\[?"?)(\w+)(?:"?\]?)\s+[^\n]*(?:\n\s+[@v][^\n]*)*',
            convert_exec,
            s, flags=re.IGNORECASE
        )

        # Also handle sp_executesql
        s = re.sub(r'EXEC\s+sp_executesql\s+(@\w+|v_\w+)', r'EXECUTE \1;', s, flags=re.IGNORECASE)

        # BEGIN TRY...END TRY → BEGIN (PG exception handling)
        s = re.sub(r'BEGIN\s+TRY\b', 'BEGIN', s, flags=re.IGNORECASE)
        s = re.sub(r'END\s+TRY\b', 'END;', s, flags=re.IGNORECASE)
        s = re.sub(r'BEGIN\s+CATCH\b', 'EXCEPTION WHEN OTHERS THEN', s, flags=re.IGNORECASE)
        s = re.sub(r'END\s+CATCH\b', '', s, flags=re.IGNORECASE)

        # ERROR_MESSAGE() → SQLERRM
        s = re.sub(r'\bERROR_MESSAGE\s*\(\)', 'SQLERRM', s, flags=re.IGNORECASE)
        s = re.sub(r'\bERROR_SEVERITY\s*\(\)', '0', s, flags=re.IGNORECASE)
        s = re.sub(r'\bERROR_STATE\s*\(\)', '0', s, flags=re.IGNORECASE)

        # PRINT → RAISE NOTICE
        s = re.sub(r'\bPRINT\s+', 'RAISE NOTICE ', s, flags=re.IGNORECASE)

        return s

    def _convert_delete_body(self, body, params):
        """Convert the delete procedure body to PG."""
        s = body

        # Pattern: DELETE FROM ... WHERE ... = p_ID
        #          -- comment
        #          IF v_rowcount = 0
        #              SELECT NULL AS "ID"
        #          ELSE
        #              SELECT p_ID AS "ID"

        # Replace the IF v_rowcount block with PG equivalent
        s = re.sub(
            r'(--[^\n]*\n\s*)?IF\s+v_rowcount\s*=\s*0\s*\n\s*SELECT\s+NULL\s+AS\s+"ID"[^\n]*\n\s*ELSE\s*\n\s*SELECT\s+[^\n]*AS\s+"ID"[^\n]*',
            'GET DIAGNOSTICS v_rowcount = ROW_COUNT;\n    IF v_rowcount = 0 THEN\n        RETURN QUERY SELECT NULL::UUID AS "ID";\n    ELSE\n        RETURN QUERY SELECT p_ID AS "ID";\n    END IF;',
            s, flags=re.IGNORECASE
        )

        # Simpler pattern: DELETE ... WHERE "ID" = p_ID
        #                   SELECT p_ID AS "ID" -- comment
        # (no IF/ELSE block, just bare SELECT after DELETE)
        s = re.sub(
            r'(DELETE\s+FROM[^;]+?"ID"\s*=\s*p_ID)\s*\n\s*(--[^\n]*\n\s*)?SELECT\s+p_ID\s+AS\s+"ID"[^\n]*',
            r'\1;\n    GET DIAGNOSTICS v_rowcount = ROW_COUNT;\n    RETURN QUERY SELECT p_ID AS "ID";',
            s, flags=re.IGNORECASE
        )

        return s

    def _convert_create_update_body(self, body, proc_type, params):
        """Convert create/update procedure body to PG.

        For CREATE procs: generates IF/ELSE with INSERT (with/without ID), then RETURN QUERY from view.
        For UPDATE procs: generates UPDATE SET, GET DIAGNOSTICS, IF/ELSE with RETURN QUERY from view.
        """
        s = body

        # Extract the view name used in the final SELECT
        view_match = re.search(r'SELECT\s+(?:TOP\s+\d+\s+)?\*\s+FROM\s+.*?\.?"?(\w+)"?\s+WHERE', s, re.IGNORECASE)
        view_name = view_match.group(1) if view_match else None

        if proc_type == 'update':
            return self._generate_update_body(s, params, view_name)
        elif proc_type == 'create':
            return self._generate_create_body(s, params, view_name)
        return s

    def _generate_update_body(self, body, params, view_name):
        """Generate PG body for an UPDATE stored procedure.

        Pattern:
            UPDATE table SET col1 = p_col1, ... WHERE "ID" = p_ID;
            GET DIAGNOSTICS v_rowcount = ROW_COUNT;
            IF v_rowcount > 0 THEN
                RETURN QUERY SELECT * FROM view WHERE "ID" = p_ID;
            END IF;
        """
        # Extract the UPDATE ... SET ... WHERE block from the body
        # Find UPDATE table SET ... WHERE "ID" = p_ID
        update_match = re.search(
            r'(UPDATE\s+.*?SET\s+.*?)(?=\s*--\s*Check|\s*IF\s+)',
            body, re.DOTALL | re.IGNORECASE
        )

        if update_match:
            update_stmt = update_match.group(1).rstrip()
            # Ensure it ends with a semicolon
            if not update_stmt.endswith(';'):
                update_stmt += ';'

            result = update_stmt + '\n'
            result += '    GET DIAGNOSTICS v_rowcount = ROW_COUNT;\n'
            if view_name:
                result += '    IF v_rowcount > 0 THEN\n'
                result += f'        RETURN QUERY SELECT * FROM "__mj"."{view_name}" WHERE "ID" = p_ID;\n'
                result += '    END IF;\n'
            return result

        # Fallback: return the body with basic IF conversion
        s = body
        s = self._convert_if_blocks(s)
        s = re.sub(r'SELECT\s+\*\s+FROM\s', 'RETURN QUERY SELECT * FROM ', s, flags=re.IGNORECASE)
        return s

    def _generate_create_body(self, body, params, view_name):
        """Generate PG body for a CREATE stored procedure.

        Pattern (with IF/ELSE for optional ID):
            IF p_ID IS NOT NULL THEN
                INSERT INTO table (ID, col1, ...) VALUES (p_ID, p_col1, ...);
            ELSE
                INSERT INTO table (col1, ...) VALUES (p_col1, ...);
            END IF;
            RETURN QUERY SELECT * FROM view WHERE "ID" = p_ID;
        """
        s = body

        # Remove OUTPUT INSERTED pattern
        s = re.sub(r'OUTPUT\s+INSERTED\.\[?"?(\w+)"?\]?\s+INTO\s+@\w+', '', s, flags=re.IGNORECASE)

        # Remove @InsertedRow table variable declaration
        s = re.sub(r'DECLARE\s+@InsertedRow\s+TABLE\s*\([^)]+\)\s*;?', '', s, flags=re.IGNORECASE)

        # Replace (SELECT "ID" FROM @InsertedRow) with v_inserted_id variable
        s = re.sub(
            r'\(SELECT\s+"ID"\s+FROM\s+@InsertedRow\s*\)',
            'v_inserted_id',
            s, flags=re.IGNORECASE
        )
        # Also handle (SELECT "ID" ) which is what we get after FROM @InsertedRow is removed
        s = re.sub(
            r'\(SELECT\s+"ID"\s*\)',
            'v_inserted_id',
            s, flags=re.IGNORECASE
        )
        # Remove any remaining @InsertedRow references
        s = re.sub(r'@InsertedRow', 'v_inserted_id', s, flags=re.IGNORECASE)

        # Add RETURNING "ID" INTO v_inserted_id to INSERT statements
        # Pattern: VALUES (...) at the end of an INSERT
        # We add RETURNING after the VALUES block
        s = self._add_returning_to_inserts(s)

        # Convert the IF/ELSE/BEGIN/END blocks
        s = self._convert_if_blocks(s)

        # Convert SELECT * FROM view to RETURN QUERY
        s = re.sub(
            r'SELECT\s*\n\s*\*\s*\n\s*FROM\s',
            'RETURN QUERY SELECT * FROM ',
            s, flags=re.IGNORECASE
        )
        s = re.sub(
            r'SELECT\s+\*\s+FROM\s',
            'RETURN QUERY SELECT * FROM ',
            s, flags=re.IGNORECASE
        )

        return s

    def _add_returning_to_inserts(self, body):
        """Add RETURNING "ID" INTO v_inserted_id to INSERT ... VALUES blocks.

        Finds INSERT ... VALUES (...) patterns and appends RETURNING clause.
        """
        # Find the last closing paren of each VALUES block before ELSE or END IF
        result = []
        lines = body.split('\n')
        i = 0
        in_values = False
        paren_depth = 0

        while i < len(lines):
            line = lines[i]
            stripped = line.strip()

            # Track if we're inside a VALUES block
            # Use word boundary check to avoid matching column names like "Values"
            if re.search(r'\bVALUES\b', stripped, re.IGNORECASE) and not re.search(r'"VALUES"', stripped, re.IGNORECASE):
                in_values = True
                paren_depth = 0

            if in_values:
                paren_depth += stripped.count('(') - stripped.count(')')
                if paren_depth <= 0 and stripped.endswith(')'):
                    # End of VALUES block - add RETURNING with semicolon
                    result.append(line)
                    result.append('            RETURNING "ID" INTO v_inserted_id;')
                    in_values = False
                    i += 1
                    continue

            result.append(line)
            i += 1

        return '\n'.join(result)

    def _convert_if_blocks(self, s):
        """Convert T-SQL IF/ELSE/BEGIN/END blocks to PG IF/THEN/END IF."""
        lines = s.split('\n')
        result = []
        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()

            # IF condition (single line, no BEGIN)
            if re.match(r'IF\s+', stripped, re.IGNORECASE) and 'BEGIN' not in stripped.upper():
                indent = line[:len(line) - len(line.lstrip())]
                condition = stripped
                # Check if next line is BEGIN
                next_stripped = ''
                if i + 1 < len(lines):
                    next_stripped = lines[i+1].strip()

                if next_stripped.upper() == 'BEGIN':
                    # IF condition BEGIN ... END
                    result.append(f'{indent}{condition} THEN')
                    i += 2  # skip the IF and BEGIN lines
                    # Collect until END
                    while i < len(lines):
                        s2 = lines[i].strip()
                        if s2.upper() == 'END':
                            # Check if next is ELSE
                            if i + 1 < len(lines) and lines[i+1].strip().upper() == 'ELSE':
                                result.append(f'{indent}ELSE')
                                i += 2
                                # Check for ELSE BEGIN
                                if i < len(lines) and lines[i].strip().upper() == 'BEGIN':
                                    i += 1
                                    # Collect until END
                                    while i < len(lines):
                                        s3 = lines[i].strip()
                                        if s3.upper() == 'END':
                                            i += 1
                                            break
                                        result.append(lines[i])
                                        i += 1
                                else:
                                    # Single-line ELSE body
                                    if i < len(lines):
                                        result.append(lines[i])
                                        i += 1
                            result.append(f'{indent}END IF;')
                            break
                        result.append(lines[i])
                        i += 1
                    continue
                else:
                    # IF condition (single-line body)
                    result.append(f'{indent}{condition} THEN')
                    if i + 1 < len(lines):
                        # Next line is the body
                        result.append(lines[i+1])
                        i += 2
                        # Check for ELSE
                        if i < len(lines) and lines[i].strip().upper() == 'ELSE':
                            result.append(f'{indent}ELSE')
                            i += 1
                            if i < len(lines):
                                result.append(lines[i])
                                i += 1
                        result.append(f'{indent}END IF;')
                        continue
                    else:
                        result.append(f'{indent}END IF;')
                        i += 1
                        continue

            result.append(line)
            i += 1

        return '\n'.join(result)

    # ──────────────────────────────────────────────────────
    # T-SQL Functions → PG Functions
    # ──────────────────────────────────────────────────────

    def _convert_tsql_function(self, idx):
        """Convert a T-SQL function to PG."""
        func_lines = []
        while idx < len(self.lines):
            l = self.lines[idx]
            if l.strip() == 'GO':
                idx += 1
                break
            func_lines.append(l)
            idx += 1

        func_sql = ''.join(func_lines)
        pg_func = self._convert_function_sql(func_sql)
        if pg_func:
            self.emit(pg_func)
            self.emit_line()

        return idx

    def _convert_function_sql(self, sql):
        """Convert a T-SQL function to PG function."""
        s = sql
        s = replace_schema_placeholder(s)
        s = strip_brackets(s)
        s = strip_collate(s)

        # Extract function name
        name_match = re.search(r'CREATE\s+FUNCTION\s+.*?\."?(\w+)"?', s, re.IGNORECASE)
        if not name_match:
            return f'-- Could not parse function\n-- {s[:200]}...\n'

        fn_name = name_match.group(1)
        self.functions_created.append(fn_name)

        # Special handling for known functions
        if fn_name == 'GetProgrammaticName':
            return self._emit_get_programmatic_name()
        if fn_name == 'ExtractVersionComponents':
            return self._emit_extract_version_components()

        # For recursive hierarchy functions (fn*_GetRootID pattern), convert properly
        if '_GetRootID' in fn_name:
            return self._convert_get_root_id_function(fn_name, s)

        # Generic function: try basic conversion
        return self._generic_convert_function(fn_name, s)

    def _emit_get_programmatic_name(self):
        """Emit the PostgreSQL version of GetProgrammaticName function."""
        return f'''CREATE OR REPLACE FUNCTION {SCHEMA}."GetProgrammaticName"(p_input TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Replace non-alphanumeric/underscore characters with underscore
    RETURN regexp_replace(p_input, '[^a-zA-Z0-9_]', '_', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
'''

    def _emit_extract_version_components(self):
        """Emit the PostgreSQL version of ExtractVersionComponents function."""
        return f'''CREATE OR REPLACE FUNCTION {SCHEMA}."ExtractVersionComponents"()
RETURNS TABLE("Major" INTEGER, "Minor" INTEGER, "Patch" INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT 0 AS "Major", 0 AS "Minor", 0 AS "Patch"
    WHERE FALSE; -- Stub: implement if needed
END;
$$ LANGUAGE plpgsql;
'''

    def _convert_get_root_id_function(self, fn_name, sql):
        """Convert fn*_GetRootID recursive functions to PG.

        These are inline table-valued functions using recursive CTEs
        to walk parent-child hierarchies. Each returns TABLE(RootID UUID).
        Function name pattern: fn{Table}{ParentColumn}_GetRootID
        """
        # Extract the table name and parent column from the function body
        # Look for the table in FROM [schema].[TableName]
        table_match = re.search(
            r'FROM\s+\[?\$\{flyway:defaultSchema\}\]?\.\[?(\w+)\]?',
            sql, re.IGNORECASE
        )
        table_name = table_match.group(1) if table_match else None

        # Extract the parent column - it's the column in the recursive CTE
        # Look for [ColumnName] in the CTE that links to parent
        parent_col_match = re.search(
            r'c\.\[?(\w+)\]?\s*,\s*\n\s*c\.\[?\1\]?\s+AS\s+\[?RootParentID\]?',
            sql, re.IGNORECASE | re.DOTALL
        )
        if not parent_col_match:
            # Try alternate pattern: the column name used in INNER JOIN ... ON c.[ID] = p.[ColumnName]
            parent_col_match = re.search(
                r'INNER\s+JOIN.*?ON\s+c\.\[?ID\]?\s*=\s*p\.\[?(\w+)\]?',
                sql, re.IGNORECASE | re.DOTALL
            )
        parent_col = parent_col_match.group(1) if parent_col_match else 'ParentID'

        if not table_name:
            # Fallback: try to extract from function name
            # fn{Table}{Column}_GetRootID
            name_part = fn_name.replace('_GetRootID', '')
            if name_part.startswith('fn'):
                name_part = name_part[2:]
            # The column name is usually at the end (ParentID, etc.)
            table_name = name_part  # Best guess

        return f'''CREATE OR REPLACE FUNCTION {SCHEMA}."{fn_name}"(p_RecordID UUID, p_ParentID UUID)
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE "CTE_RootParent" AS (
        SELECT
            "ID",
            "{parent_col}",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            {SCHEMA}."{table_name}"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."{parent_col}",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            {SCHEMA}."{table_name}" c
        INNER JOIN
            "CTE_RootParent" p ON c."ID" = p."{parent_col}"
        WHERE
            p."Depth" < 100
    )
    SELECT
        "RootParentID" AS "RootID"
    FROM
        "CTE_RootParent"
    WHERE
        "{parent_col}" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
'''

    def _generic_convert_function(self, fn_name, sql):
        """Generic T-SQL function conversion (best-effort)."""
        s = sql
        s = re.sub(r'\bGETUTCDATE\s*\(\)', "NOW() AT TIME ZONE 'UTC'", s, flags=re.IGNORECASE)
        s = re.sub(r'\bGETDATE\s*\(\)', "NOW()", s, flags=re.IGNORECASE)
        s = re.sub(r'\bSYSDATETIMEOFFSET\s*\(\)', "NOW()", s, flags=re.IGNORECASE)
        s = re.sub(r'\bISNULL\s*\(', 'COALESCE(', s, flags=re.IGNORECASE)
        s = re.sub(r"(?<![A-Za-z])N'([^']*)'", r"'\1'", s)
        s = re.sub(r'\bNVARCHAR\s*\(\s*MAX\s*\)', 'TEXT', s, flags=re.IGNORECASE)
        s = re.sub(r'\bNVARCHAR\s*\(\s*(\d+)\s*\)', r'VARCHAR(\1)', s, flags=re.IGNORECASE)
        s = re.sub(r'\buniqueidentifier\b', 'UUID', s, flags=re.IGNORECASE)

        return f'-- TODO: Manually review converted function {fn_name}\n-- Original T-SQL function needs careful manual conversion\n/*\n{s}\n*/\n'

    # ──────────────────────────────────────────────────────
    # Pass 4: CHECK Constraints (lines 63016-63700)
    # ──────────────────────────────────────────────────────

    def convert_check_constraints(self):
        """Convert CHECK constraint ALTER TABLE statements."""
        idx = 63015  # 0-based
        end_idx = 63727  # Before FK section

        self.emit_line()
        self.emit_line('-- =============================================')
        self.emit_line('-- CHECK CONSTRAINTS')
        self.emit_line('-- =============================================')
        self.emit_line()

        while idx < end_idx and idx < len(self.lines):
            line = self.lines[idx].strip()

            if self._is_skip_line(line):
                idx += 1
                continue

            # ALTER TABLE ... ADD CONSTRAINT ... CHECK
            check_match = re.search(
                r'ALTER\s+TABLE\s+.*?\.\[?(\w+)\]?\s+ADD\s+CONSTRAINT\s+\[?([^\]]+)\]?\s+CHECK\s*\((.+)\)',
                line, re.IGNORECASE
            )
            if check_match:
                tbl = check_match.group(1)
                ck_name = check_match.group(2)
                ck_expr = check_match.group(3)
                pg_expr = convert_check_constraint(ck_expr)
                self.emit_line(f'ALTER TABLE {SCHEMA}."{tbl}" ADD CONSTRAINT "{ck_name}" CHECK ({pg_expr});')
                self.checks_created.append(ck_name)
                idx += 1
                continue

            idx += 1

    # ──────────────────────────────────────────────────────
    # Pass 5: Foreign Keys (lines 63727-64708)
    # ──────────────────────────────────────────────────────

    def convert_foreign_keys(self):
        """Convert FK ALTER TABLE statements."""
        idx = 63726  # 0-based
        end_idx = 64709

        self.emit_line()
        self.emit_line('-- =============================================')
        self.emit_line('-- FOREIGN KEY CONSTRAINTS')
        self.emit_line('-- =============================================')
        self.emit_line()

        while idx < end_idx and idx < len(self.lines):
            line = self.lines[idx].strip()

            if self._is_skip_line(line):
                idx += 1
                continue

            # ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY
            fk_match = re.search(
                r'ALTER\s+TABLE\s+.*?\.\[?(\w+)\]?\s+ADD\s+CONSTRAINT\s+\[?([^\]]+)\]?\s+FOREIGN\s+KEY\s*\(\[?([^\]]+)\]?\)\s+REFERENCES\s+.*?\.\[?(\w+)\]?\s*\(\[?([^\]]+)\]?\)(.*)',
                line, re.IGNORECASE
            )
            if fk_match:
                child_tbl = fk_match.group(1)
                fk_name = fk_match.group(2)
                fk_col = fk_match.group(3)
                parent_tbl = fk_match.group(4)
                parent_col = fk_match.group(5)
                rest = fk_match.group(6).strip()

                # Check for ON DELETE clause
                on_delete = ''
                del_match = re.search(r'ON\s+DELETE\s+(CASCADE|SET\s+NULL|NO\s+ACTION|SET\s+DEFAULT)', rest, re.IGNORECASE)
                if del_match:
                    on_delete = f' ON DELETE {del_match.group(1).upper()}'

                on_update = ''
                upd_match = re.search(r'ON\s+UPDATE\s+(CASCADE|SET\s+NULL|NO\s+ACTION|SET\s+DEFAULT)', rest, re.IGNORECASE)
                if upd_match:
                    on_update = f' ON UPDATE {upd_match.group(1).upper()}'

                self.emit_line(f'ALTER TABLE {SCHEMA}."{child_tbl}" ADD CONSTRAINT "{fk_name}" FOREIGN KEY ("{fk_col}") REFERENCES {SCHEMA}."{parent_tbl}" ("{parent_col}"){on_delete}{on_update};')
                self.fks_created.append(fk_name)
                idx += 1
                continue

            idx += 1

    # ──────────────────────────────────────────────────────
    # Pass 6: Extended Properties → COMMENT ON
    # ──────────────────────────────────────────────────────

    def convert_extended_properties(self):
        """Convert sp_addextendedproperty to COMMENT ON statements."""
        idx = 64709  # 0-based
        end_idx = 89902  # Before GRANT section

        self.emit_line()
        self.emit_line('-- =============================================')
        self.emit_line('-- COLUMN AND TABLE COMMENTS')
        self.emit_line('-- =============================================')
        self.emit_line()

        while idx < end_idx and idx < len(self.lines):
            line = self.lines[idx].strip()

            # Look for sp_addextendedproperty calls
            if 'sp_addextendedproperty' in line:
                # Extract description, table, column
                prop_match = re.search(
                    r"sp_addextendedproperty\s+N'MS_Description'\s*,\s*N'((?:[^']|'')+)'\s*,\s*'SCHEMA'\s*,\s*N'__mj'\s*,\s*'TABLE'\s*,\s*N'(\w+)'\s*,\s*'COLUMN'\s*,\s*N'(\w+)'",
                    line, re.IGNORECASE
                )
                if prop_match:
                    desc = prop_match.group(1).replace("''", "'")
                    table = prop_match.group(2)
                    column = prop_match.group(3)
                    # Escape single quotes in description
                    desc_escaped = desc.replace("'", "''")
                    self.emit_line(f"COMMENT ON COLUMN {SCHEMA}.\"{table}\".\"{column}\" IS '{desc_escaped}';")
                    self.comments_created.append(f'{table}.{column}')
                else:
                    # Table-level description
                    tbl_match = re.search(
                        r"sp_addextendedproperty\s+N'MS_Description'\s*,\s*N'((?:[^']|'')+)'\s*,\s*'SCHEMA'\s*,\s*N'__mj'\s*,\s*'TABLE'\s*,\s*N'(\w+)'",
                        line, re.IGNORECASE
                    )
                    if tbl_match:
                        desc = tbl_match.group(1).replace("''", "'")
                        table = tbl_match.group(2)
                        desc_escaped = desc.replace("'", "''")
                        self.emit_line(f"COMMENT ON TABLE {SCHEMA}.\"{table}\" IS '{desc_escaped}';")
                        self.comments_created.append(table)

            idx += 1

    # ──────────────────────────────────────────────────────
    # Pass 7: GRANTs (lines 89903-96522)
    # ──────────────────────────────────────────────────────

    def convert_grants(self):
        """Convert GRANT statements."""
        idx = 89902  # 0-based
        end_idx = 96523

        self.emit_line()
        self.emit_line('-- =============================================')
        self.emit_line('-- PERMISSIONS / GRANTS')
        self.emit_line('-- =============================================')
        self.emit_line()

        while idx < end_idx and idx < len(self.lines):
            line = self.lines[idx].strip()

            if self._is_skip_line(line):
                idx += 1
                continue

            # GRANT EXECUTE ON ... TO [role]
            grant_match = re.search(
                r'GRANT\s+(EXECUTE|SELECT|INSERT|UPDATE|DELETE)\s+ON\s+.*?\.\[?(\w+)\]?\s+TO\s+\[?(\w+)\]?',
                line, re.IGNORECASE
            )
            if grant_match:
                permission = grant_match.group(1).upper()
                obj_name = grant_match.group(2)
                role = grant_match.group(3)

                # In PG, EXECUTE is on FUNCTION, SELECT is on TABLE/VIEW
                if permission == 'EXECUTE':
                    # We need to know the function signature - for now use a generic pattern
                    # We'll emit as comments since exact signatures are complex
                    self.emit_line(f'-- GRANT EXECUTE ON FUNCTION {SCHEMA}."{obj_name}" TO {role};')
                elif permission == 'SELECT':
                    self.emit_line(f'GRANT SELECT ON {SCHEMA}."{obj_name}" TO {role};')
                else:
                    self.emit_line(f'GRANT {permission} ON {SCHEMA}."{obj_name}" TO {role};')

                self.grants_created.append(f'{permission} {obj_name} → {role}')
                idx += 1
                continue

            idx += 1

    # ──────────────────────────────────────────────────────
    # Pass 8: Seed Data (lines 96533-138708)
    # ──────────────────────────────────────────────────────

    def convert_seed_data(self):
        """Convert INSERT statements and constraint disable/enable blocks."""
        idx = 96532  # 0-based
        end_idx = len(self.lines)

        self.emit_line()
        self.emit_line('-- =============================================')
        self.emit_line('-- SEED / REFERENCE DATA')
        self.emit_line('-- =============================================')
        self.emit_line()

        # We need to track which tables have constraints disabled
        # to emit ALTER TABLE ... DISABLE TRIGGER ALL (PG equivalent)
        disabled_tables = set()

        while idx < end_idx:
            line = self.lines[idx].strip()
            raw_line = self.lines[idx]

            if not line or line == 'GO':
                idx += 1
                continue

            if line.startswith('IF @@ERROR'):
                idx += 1
                continue

            if line.startswith('SET '):
                idx += 1
                continue

            if line.startswith('PRINT'):
                idx += 1
                continue

            # NOCHECK CONSTRAINT → ALTER TABLE DISABLE TRIGGER ALL
            nocheck_match = re.search(
                r'ALTER\s+TABLE\s+.*?\.\[?(\w+)\]?\s+NOCHECK\s+CONSTRAINT\s+\[?([^\]]+)\]?',
                line, re.IGNORECASE
            )
            if nocheck_match:
                tbl = nocheck_match.group(1)
                if tbl not in disabled_tables:
                    self.emit_line(f'ALTER TABLE {SCHEMA}."{tbl}" DISABLE TRIGGER ALL;')
                    disabled_tables.add(tbl)
                idx += 1
                continue

            # CHECK CONSTRAINT (re-enable) → ALTER TABLE ENABLE TRIGGER ALL
            check_match = re.search(
                r'ALTER\s+TABLE\s+.*?\.\[?(\w+)\]?\s+(?:WITH\s+CHECK\s+)?CHECK\s+CONSTRAINT\s+\[?([^\]]+)\]?',
                line, re.IGNORECASE
            )
            if check_match:
                tbl = check_match.group(1)
                if tbl in disabled_tables:
                    self.emit_line(f'ALTER TABLE {SCHEMA}."{tbl}" ENABLE TRIGGER ALL;')
                    disabled_tables.discard(tbl)
                idx += 1
                continue

            # INSERT statement
            if re.match(r'INSERT\s+(?:INTO\s+)?', line, re.IGNORECASE):
                idx = self._convert_insert(idx)
                continue

            # SET IDENTITY_INSERT → skip (PG doesn't need this)
            if re.match(r'SET\s+IDENTITY_INSERT', line, re.IGNORECASE):
                idx += 1
                continue

            # UPDATE statements in data section
            if re.match(r'UPDATE\s+', line, re.IGNORECASE):
                idx = self._convert_update_stmt(idx)
                continue

            # MERGE statements
            if re.match(r'MERGE\s+', line, re.IGNORECASE):
                idx = self._skip_to_go(idx)
                continue

            # DELETE statements in data section
            if re.match(r'DELETE\s+', line, re.IGNORECASE):
                idx = self._convert_delete_stmt(idx)
                continue

            idx += 1

    def _convert_insert(self, idx):
        """Convert an INSERT statement (may be multi-line)."""
        # Collect lines until next statement or GO.
        # Track whether we're inside a SQL string literal (odd number of
        # unescaped quotes) to avoid breaking on SQL keywords that appear
        # in embedded text content (e.g. JavaScript 'delete' keyword).
        insert_lines = []
        in_string = False  # True when inside a SQL string literal
        while idx < len(self.lines):
            l = self.lines[idx].rstrip()
            stripped = l.strip()

            if stripped == 'GO' and not in_string:
                idx += 1
                break

            if not in_string and stripped.startswith('IF @@ERROR'):
                idx += 1
                continue

            if not in_string and stripped.startswith('PRINT'):
                idx += 1
                continue

            # Check if this is a new statement (not continuation)
            # ONLY when we're NOT inside a SQL string literal
            if not in_string and insert_lines and (
                re.match(r'INSERT\s+', stripped, re.IGNORECASE) or
                re.match(r'ALTER\s+TABLE', stripped, re.IGNORECASE) or
                re.match(r'UPDATE\s+', stripped, re.IGNORECASE) or
                re.match(r'DELETE\s+', stripped, re.IGNORECASE) or
                re.match(r'SET\s+', stripped, re.IGNORECASE)
            ):
                break

            insert_lines.append(l)
            idx += 1

            # Update string tracking: count unescaped quotes on this line.
            # Escaped quotes ('') count as 2, keeping parity correct.
            quote_count = l.count("'") - l.count("''") * 2
            if quote_count % 2 != 0:
                in_string = not in_string

        if insert_lines:
            insert_sql = '\n'.join(insert_lines)
            pg_insert = self._convert_insert_sql(insert_sql)
            self.emit(pg_insert)
            self.emit_line()
            self.inserts_written += 1

        return idx

    def _convert_boolean_values(self, sql):
        """Convert 0/1 → FALSE/TRUE for BOOLEAN columns in INSERT VALUES.

        Uses self.boolean_columns (populated during table parsing) to know
        which columns are boolean. Parses the column list and VALUES clause
        to replace integer literals at boolean column positions.
        """
        # Extract table name from INSERT INTO "__mj"."TableName" or __mj."TableName"
        m = re.search(r'INSERT\s+INTO\s+"?__mj"?\."(\w+)"\s*\(', sql, re.IGNORECASE)
        if not m:
            return sql
        table_name = m.group(1)
        bool_cols = self.boolean_columns.get(table_name)
        if not bool_cols:
            return sql

        # Extract the column list — text between first ( and matching )
        col_start = sql.index('(', m.start())
        col_end = self._find_matching_paren(sql, col_start)
        if col_end < 0:
            return sql
        col_text = sql[col_start + 1:col_end]
        columns = [c.strip().strip('"') for c in col_text.split(',')]

        # Determine which column indices are boolean
        bool_indices = set()
        for i, col in enumerate(columns):
            if col in bool_cols:
                bool_indices.add(i)
        if not bool_indices:
            return sql

        # Find VALUES clause
        values_match = re.search(r'\bVALUES\s*\(', sql[col_end:], re.IGNORECASE)
        if not values_match:
            return sql
        values_start = col_end + values_match.end() - 1  # position of '('

        # Parse the values list respecting strings and nested parens
        values_end = self._find_matching_paren(sql, values_start)
        if values_end < 0:
            return sql
        values_text = sql[values_start + 1:values_end]

        # Split values by commas, respecting strings and nested parens
        value_parts = self._split_values(values_text)

        if len(value_parts) != len(columns):
            return sql  # column/value count mismatch, skip

        # Replace 0/1 at boolean positions
        changed = False
        for i in bool_indices:
            v = value_parts[i].strip()
            if v == '0':
                value_parts[i] = value_parts[i].replace('0', 'FALSE', 1)
                changed = True
            elif v == '1':
                value_parts[i] = value_parts[i].replace('1', 'TRUE', 1)
                changed = True
        if not changed:
            return sql

        new_values = ','.join(value_parts)
        return sql[:values_start + 1] + new_values + sql[values_end:]

    def _find_matching_paren(self, s, start):
        """Find the matching closing paren for the opening paren at s[start].
        Respects SQL string literals (single quotes with '' escaping).
        """
        depth = 0
        in_str = False
        i = start
        while i < len(s):
            c = s[i]
            if in_str:
                if c == "'" and i + 1 < len(s) and s[i + 1] == "'":
                    i += 2  # skip escaped quote
                    continue
                if c == "'":
                    in_str = False
            else:
                if c == "'":
                    in_str = True
                elif c == '(':
                    depth += 1
                elif c == ')':
                    depth -= 1
                    if depth == 0:
                        return i
            i += 1
        return -1

    def _split_values(self, text):
        """Split a VALUES clause by top-level commas, respecting strings and parens."""
        parts = []
        current = []
        depth = 0
        in_str = False
        i = 0
        while i < len(text):
            c = text[i]
            if in_str:
                current.append(c)
                if c == "'" and i + 1 < len(text) and text[i + 1] == "'":
                    current.append(text[i + 1])
                    i += 2
                    continue
                if c == "'":
                    in_str = False
            else:
                if c == "'":
                    in_str = True
                    current.append(c)
                elif c == '(':
                    depth += 1
                    current.append(c)
                elif c == ')':
                    depth -= 1
                    current.append(c)
                elif c == ',' and depth == 0:
                    parts.append(''.join(current))
                    current = []
                else:
                    current.append(c)
            i += 1
        if current:
            parts.append(''.join(current))
        return parts

    def _convert_insert_sql(self, sql):
        """Convert a T-SQL INSERT statement to PG."""
        s = sql
        s = replace_schema_placeholder(s)
        s = strip_brackets(s)
        s = strip_collate(s)
        # T-SQL string concatenation uses + which PG doesn't support for strings.
        # This pattern appears in embedded JS template literals where ${...} is
        # split as $'+'{...} to avoid Flyway placeholder interpretation.
        # Replace T-SQL string concatenation '+' with PG '||' operator.
        s = s.replace("'+'", "'||'")
        # T-SQL NVARCHAR(MAX) concatenation: '...' AS NVARCHAR(MAX)) +\nN'...'  →  merge strings
        s = re.sub(r"'\s*AS\s+NVARCHAR\s*\(\s*MAX\s*\)\s*\)\s*\+\s*\nN'", '', s, flags=re.IGNORECASE)
        # Remove CAST(N' wrapper: CAST(N'...' becomes just '...'
        s = re.sub(r'CAST\s*\(\s*N\'', "'", s, flags=re.IGNORECASE)
        # N'string' → 'string' (T-SQL NVARCHAR prefix)
        # Only match N' when NOT preceded by a letter (avoid stripping N from JSON', etc.)
        s = re.sub(r"(?<![A-Za-z])N'", "'", s)
        # CAST with NVARCHAR → VARCHAR
        s = re.sub(r'\bNVARCHAR\s*\(\s*MAX\s*\)', 'TEXT', s, flags=re.IGNORECASE)
        s = re.sub(r'\bNVARCHAR\s*\(\s*(\d+)\s*\)', r'VARCHAR(\1)', s, flags=re.IGNORECASE)
        # Boolean: for BIT columns, convert 0/1 → FALSE/TRUE using schema knowledge
        s = self._convert_boolean_values(s)
        # Strip trailing spaces from string values.
        # SQL Server ignores trailing spaces in comparisons but PG does not.
        # Pattern: spaces before closing quote (not followed by another quote)
        s = re.sub(r" +'(?!')", "'", s)

        # Add semicolon if missing
        s = s.rstrip()
        if not s.endswith(';'):
            s += ';'

        return s + '\n'

    def _convert_update_stmt(self, idx):
        """Convert UPDATE statement."""
        lines = []
        while idx < len(self.lines):
            l = self.lines[idx].rstrip()
            stripped = l.strip()
            if stripped == 'GO':
                idx += 1
                break
            if stripped.startswith('IF @@ERROR'):
                idx += 1
                continue
            if stripped.startswith('PRINT'):
                idx += 1
                continue
            lines.append(l)
            idx += 1

        if lines:
            sql = '\n'.join(lines)
            sql = replace_schema_placeholder(sql)
            sql = strip_brackets(sql)
            sql = strip_collate(sql)
            sql = re.sub(r"(?<![A-Za-z])N'", "'", sql)
            if not sql.rstrip().endswith(';'):
                sql += ';'
            self.emit(sql)
            self.emit_line()

        return idx

    def _convert_delete_stmt(self, idx):
        """Convert DELETE statement in data section."""
        lines = []
        while idx < len(self.lines):
            l = self.lines[idx].rstrip()
            stripped = l.strip()
            if stripped == 'GO':
                idx += 1
                break
            if stripped.startswith('IF @@ERROR'):
                idx += 1
                continue
            if stripped.startswith('PRINT'):
                idx += 1
                continue
            # Break on new statement boundary
            if lines and (
                re.match(r'INSERT\s+', stripped, re.IGNORECASE) or
                re.match(r'ALTER\s+TABLE', stripped, re.IGNORECASE) or
                re.match(r'UPDATE\s+', stripped, re.IGNORECASE) or
                re.match(r'DELETE\s+', stripped, re.IGNORECASE) or
                re.match(r'SET\s+', stripped, re.IGNORECASE)
            ):
                break
            lines.append(l)
            idx += 1

        if lines:
            sql = '\n'.join(lines)
            sql = replace_schema_placeholder(sql)
            sql = strip_brackets(sql)
            sql = strip_collate(sql)
            sql = re.sub(r"(?<![A-Za-z])N'", "'", sql)
            if not sql.rstrip().endswith(';'):
                sql += ';'
            self.emit(sql)
            self.emit_line()

        return idx

    def _skip_to_go(self, idx):
        """Skip lines until GO."""
        while idx < len(self.lines):
            if self.lines[idx].strip() == 'GO':
                idx += 1
                break
            idx += 1
        return idx

    # ──────────────────────────────────────────────────────
    # Main conversion driver
    # ──────────────────────────────────────────────────────

    def convert_all(self):
        """Run all conversion passes."""
        print("Pass 0: Preamble...")
        self.convert_preamble()

        print("Pass 1: Tables, PKs, Indexes, Triggers...")
        self.convert_tables_section()
        print(f"  → {len(self.tables_created)} tables, {len(self.triggers_created)} triggers, {len(self.indexes_created)} indexes")

        print("Pass 2-3: Views and Stored Procedures...")
        self.convert_views_and_procs()
        print(f"  → {len(self.views_created)} views, {len(self.functions_created)} functions")

        print("Pass 4: CHECK constraints...")
        self.convert_check_constraints()
        print(f"  → {len(self.checks_created)} checks")

        print("Pass 5: Foreign keys...")
        self.convert_foreign_keys()
        print(f"  → {len(self.fks_created)} FKs")

        print("Pass 6: Extended properties → COMMENT ON...")
        self.convert_extended_properties()
        print(f"  → {len(self.comments_created)} comments")

        print("Pass 7: GRANTs...")
        self.convert_grants()
        print(f"  → {len(self.grants_created)} grants")

        print("Pass 8: Seed data...")
        self.convert_seed_data()
        print(f"  → {self.inserts_written} insert blocks")

        print("\nWriting output file...")
        self.write_output()
        print(f"Output: {OUTPUT_FILE}")

        # Summary
        print("\n=== CONVERSION SUMMARY ===")
        print(f"Tables:    {len(self.tables_created)}")
        print(f"Views:     {len(self.views_created)}")
        print(f"Functions: {len(self.functions_created)}")
        print(f"Triggers:  {len(self.triggers_created)}")
        print(f"Indexes:   {len(self.indexes_created)}")
        print(f"FKs:       {len(self.fks_created)}")
        print(f"CHECKs:    {len(self.checks_created)}")
        print(f"Comments:  {len(self.comments_created)}")
        print(f"Grants:    {len(self.grants_created)}")
        print(f"Inserts:   {self.inserts_written}")


if __name__ == '__main__':
    converter = BaselineConverter()
    converter.convert_all()
