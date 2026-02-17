#!/usr/bin/env python3
"""
Convert MemberJunction v5.0 Baseline Migration from T-SQL to PostgreSQL.

This is the master converter script that reads the ~151K-line T-SQL baseline
and produces a PostgreSQL equivalent. It delegates to section-specific
converter modules for each pass.

Usage:
    python3 scripts/convert-baseline-v5-to-postgres.py

Output:
    migrations-postgres/v5/B202602151200__v5.0__PG_Baseline.sql
"""

import os
import re
import sys
import time

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
SOURCE = os.path.join(ROOT_DIR, 'migrations/v5/B202602151200__v5.0__Baseline.sql')
OUTPUT_DIR = os.path.join(ROOT_DIR, 'migrations-postgres/v5')
OUTPUT = os.path.join(OUTPUT_DIR, 'B202602151200__v5.0__PG_Baseline.sql')

SCHEMA = '__mj'

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def read_source():
    """Read the T-SQL baseline file."""
    with open(SOURCE, 'r', encoding='utf-8-sig') as f:
        return f.readlines()


def bracket_to_pg(s):
    """Convert [schema].[identifier] bracket notation to PG double-quote notation."""
    s = s.replace('[${flyway:defaultSchema}]', SCHEMA)
    s = s.replace('${flyway:defaultSchema}', SCHEMA)
    s = re.sub(r'\[([^\]]+)\]', r'"\1"', s)
    return s


def convert_type_name(t):
    """Convert a T-SQL data type name to its PostgreSQL equivalent."""
    tl = t.lower().strip()

    # UUID
    if tl == 'uniqueidentifier':
        return 'UUID'

    # String types
    if re.match(r'n?varchar\s*\(\s*max\s*\)', tl):
        return 'TEXT'
    m = re.match(r'n?varchar\s*\((\d+)\)', tl)
    if m:
        return f'VARCHAR({m.group(1)})'
    if tl in ('ntext', 'text'):
        return 'TEXT'
    m = re.match(r'n?char\s*\((\d+)\)', tl)
    if m:
        return f'CHAR({m.group(1)})'
    if tl in ('nchar', 'char'):
        return 'CHAR(1)'

    # Boolean
    if tl == 'bit':
        return 'BOOLEAN'

    # Integer types
    if tl in ('int', 'integer'):
        return 'INTEGER'
    if tl == 'bigint':
        return 'BIGINT'
    if tl in ('smallint', 'tinyint'):
        return 'SMALLINT'

    # Float types
    if tl == 'float' or re.match(r'float\s*\(\d+\)', tl):
        return 'DOUBLE PRECISION'
    if tl == 'real':
        return 'REAL'

    # Date/time types
    if tl in ('datetime', 'datetime2') or re.match(r'datetime2\s*\(\d+\)', tl):
        return 'TIMESTAMP'
    if tl == 'datetimeoffset' or re.match(r'datetimeoffset\s*\(\d+\)', tl):
        return 'TIMESTAMPTZ'
    if tl == 'smalldatetime':
        return 'TIMESTAMP(0)'
    if tl == 'date':
        return 'DATE'
    if tl == 'time' or re.match(r'time\s*\(\d+\)', tl):
        return 'TIME'

    # Numeric types
    m = re.match(r'(?:decimal|numeric)\s*\((\d+),\s*(\d+)\)', tl)
    if m:
        return f'NUMERIC({m.group(1)},{m.group(2)})'
    m = re.match(r'(?:decimal|numeric)\s*\((\d+)\)', tl)
    if m:
        return f'NUMERIC({m.group(1)})'
    if tl == 'money':
        return 'NUMERIC(19,4)'
    if tl == 'smallmoney':
        return 'NUMERIC(10,4)'

    # Binary types
    if re.match(r'(?:var)?binary\s*\(\s*max\s*\)', tl) or tl == 'image':
        return 'BYTEA'
    if re.match(r'(?:var)?binary\s*\((\d+)\)', tl) or tl in ('varbinary', 'binary', 'image'):
        return 'BYTEA'

    # XML
    if tl == 'xml':
        return 'XML'

    # sql_variant (no direct PG equiv)
    if tl == 'sql_variant':
        return 'TEXT'

    # Fallback
    return t.upper()


def remove_n_prefix(s):
    """Remove N' prefix from Unicode string literals, carefully avoiding word corruption."""
    # Only match N' when preceded by whitespace, comma, paren, or start of line
    s = re.sub(r"(?<![A-Za-z0-9_])N'", "'", s)
    return s


def convert_sql_functions(s):
    """Convert common T-SQL functions to PostgreSQL equivalents."""
    s = re.sub(r'\bISNULL\s*\(', 'COALESCE(', s, flags=re.I)
    s = re.sub(r'\bGETUTCDATE\s*\(\)', "NOW() AT TIME ZONE 'UTC'", s, flags=re.I)
    s = re.sub(r'\bGETDATE\s*\(\)', 'NOW()', s, flags=re.I)
    s = re.sub(r'\bSYSDATETIMEOFFSET\s*\(\)', "NOW() AT TIME ZONE 'UTC'", s, flags=re.I)
    s = re.sub(r'\bNEWSEQUENTIALID\s*\(\)', 'gen_random_uuid()', s, flags=re.I)
    s = re.sub(r'\bNEWID\s*\(\)', 'gen_random_uuid()', s, flags=re.I)
    s = re.sub(r'\bLEN\s*\(', 'LENGTH(', s, flags=re.I)
    # SQL Server system functions
    s = re.sub(r'\bSUSER_NAME\s*\(\)', 'current_user', s, flags=re.I)
    s = re.sub(r'\bSUSER_SNAME\s*\(\)', 'current_user', s, flags=re.I)
    s = re.sub(r'\bUSER_NAME\s*\(\)', 'current_user', s, flags=re.I)
    s = re.sub(r'\bSYSTEM_USER\b', 'current_user', s, flags=re.I)
    return s


def remove_collation(s):
    """Remove COLLATE clauses."""
    return re.sub(r'\s+COLLATE\s+\S+', '', s, flags=re.I)


# ============================================================================
# PASS 1: TABLES, CONSTRAINTS, INDEXES, TRIGGERS
# ============================================================================

def extract_table_section(lines):
    """Extract the table creation section (from first CREATE TABLE to first CREATE VIEW)."""
    start = None
    end = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('CREATE TABLE') and start is None:
            start = i
        # First CREATE VIEW marks end of tables section
        if start is not None and stripped.startswith('CREATE VIEW'):
            end = i
            break
    return start or 0, end or len(lines)


def parse_column_def(col_text):
    """Parse a column definition from CREATE TABLE and convert to PG.

    T-SQL format: [ColumnName] [type] (size) COLLATE ... NOT NULL CONSTRAINT [name] DEFAULT (value)
    Note: type is also in brackets like [uniqueidentifier], [nvarchar] (20)
    """
    col_text = col_text.strip().rstrip(',')

    # Skip constraint lines
    if re.match(r'(?:CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b', col_text, re.I):
        return None

    # Match: [ColumnName] [type] (optional_size) rest...
    # The type may be: [uniqueidentifier], [nvarchar] (20), [nvarchar] (max), [datetimeoffset], [int], etc.
    m = re.match(
        r'\[(\w+)\]\s+'         # column name in brackets
        r'\[(\w+)\]'            # type name in brackets
        r'(\s*\([^)]*\))?'     # optional size like (20), (max), (19,4)
        r'(.*)',                # remainder: COLLATE, NOT NULL, DEFAULT, CONSTRAINT, etc.
        col_text, re.I
    )
    if not m:
        return None

    col_name = m.group(1)
    type_name = m.group(2)
    type_size = (m.group(3) or '').strip()
    remainder = (m.group(4) or '').strip()

    # Build full type string
    col_type_raw = type_name + type_size
    pg_type = convert_type_name(col_type_raw)

    parts = [f'"{col_name}"', pg_type]

    # Remove COLLATE clause from remainder
    remainder = remove_collation(remainder)

    # Handle IDENTITY
    if re.search(r'\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)', remainder, re.I):
        parts[1] = 'INTEGER GENERATED ALWAYS AS IDENTITY'
        remainder = re.sub(r'\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)', '', remainder, flags=re.I)

    # Handle NOT NULL / NULL
    if re.search(r'\bNOT\s+NULL\b', remainder, re.I):
        parts.append('NOT NULL')
    # (nullable is default in PG, so we don't need to add NULL explicitly)

    # Handle DEFAULT - extract from CONSTRAINT [name] DEFAULT (value) pattern
    # T-SQL uses: CONSTRAINT [DF_xxx] DEFAULT (value) or just DEFAULT value
    default_m = re.search(
        r'(?:CONSTRAINT\s+\[\w+\]\s+)?DEFAULT\s+(.+?)(?:\s*$)',
        remainder, re.I
    )
    if default_m:
        default_val = default_m.group(1).strip()
        default_val = convert_default_value(default_val, pg_type)
        parts.append(f'DEFAULT {default_val}')

    return ' '.join(parts)


def convert_default_value(val, pg_type):
    """Convert a T-SQL default value to PostgreSQL."""
    val = val.strip()

    # Remove outer parens: ((0)) -> 0, (NEWSEQUENTIALID()) -> gen_random_uuid()
    while val.startswith('(') and val.endswith(')'):
        inner = val[1:-1]
        # Check balanced parens
        depth = 0
        balanced = True
        for ch in inner:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth < 0:
                    balanced = False
                    break
        if balanced and depth == 0:
            val = inner
        else:
            break

    # Boolean defaults
    if pg_type == 'BOOLEAN':
        if val in ('0', 'false', "'false'"):
            return 'false'
        if val in ('1', 'true', "'true'"):
            return 'true'

    # Function defaults - wrap complex expressions in parens for column defaults
    val = re.sub(r'\bNEWSEQUENTIALID\s*\(\)', 'gen_random_uuid()', val, flags=re.I)
    val = re.sub(r'\bNEWID\s*\(\)', 'gen_random_uuid()', val, flags=re.I)
    val = re.sub(r'\bGETUTCDATE\s*\(\)', "(NOW() AT TIME ZONE 'UTC')", val, flags=re.I)
    val = re.sub(r'\bGETDATE\s*\(\)', 'NOW()', val, flags=re.I)
    val = re.sub(r'\bSYSDATETIMEOFFSET\s*\(\)', "(NOW() AT TIME ZONE 'UTC')", val, flags=re.I)
    val = re.sub(r'\bSUSER_NAME\s*\(\)', 'current_user', val, flags=re.I)
    val = re.sub(r'\bSUSER_SNAME\s*\(\)', 'current_user', val, flags=re.I)
    val = re.sub(r'\bUSER_NAME\s*\(\)', 'current_user', val, flags=re.I)
    val = re.sub(r'\bSYSTEM_USER\b', 'current_user', val, flags=re.I)

    # N'string' -> 'string'
    val = remove_n_prefix(val)

    return val


def convert_tables(lines, start, end):
    """Convert all CREATE TABLE blocks, PKs, indexes, and triggers."""
    output = []
    output.append('-- ============================================================================')
    output.append('-- TABLES, PRIMARY KEYS, INDEXES, TRIGGERS')
    output.append('-- ============================================================================')
    output.append('')

    i = start
    tables_created = 0
    indexes_created = 0
    triggers_created = 0
    check_constraints = []  # Track check constraints for later

    while i < end:
        line = lines[i].strip()

        # Skip noise
        if line in ('GO', 'GO;', '') or line.startswith('IF @@ERROR') or \
           line.startswith('SET NOEXEC') or line.startswith('PRINT'):
            i += 1
            continue

        # CREATE TABLE
        if line.startswith('CREATE TABLE'):
            table_lines, new_i = extract_create_table(lines, i)
            converted = convert_create_table(table_lines)
            if converted:
                output.append(converted)
                output.append('')
                tables_created += 1
            i = new_i
            continue

        # ALTER TABLE ADD CONSTRAINT (PK, UNIQUE, CHECK)
        if re.match(r'ALTER\s+TABLE.*ADD\s+CONSTRAINT', line, re.I):
            converted = convert_alter_constraint(line)
            if converted:
                output.append(converted)
                # Track CHECK constraints for seed data
                if 'CHECK' in line.upper() and 'PRIMARY KEY' not in line.upper():
                    check_constraints.append(converted)
            i += 1
            continue

        # CREATE INDEX
        if re.match(r'CREATE\s+(?:NONCLUSTERED\s+|UNIQUE\s+)?INDEX', line, re.I):
            converted = convert_index(line)
            if converted:
                output.append(converted)
                indexes_created += 1
            i += 1
            continue

        # CREATE TRIGGER
        if re.match(r'CREATE\s+TRIGGER', line, re.I):
            trigger_lines, new_i = extract_trigger(lines, i)
            fn_text, trg_text = convert_trigger(trigger_lines)
            if fn_text:
                output.append(fn_text)
                output.append(trg_text)
                output.append('')
                triggers_created += 1
            i = new_i
            continue

        i += 1

    print(f"  Tables: {tables_created}")
    print(f"  Indexes: {indexes_created}")
    print(f"  Triggers: {triggers_created}")
    return output, check_constraints


def extract_create_table(lines, start_i):
    """Extract a CREATE TABLE block from start to GO.

    The T-SQL format is:
    CREATE TABLE [schema].[Table]
    (
    [col1] [type] ...,
    [col2] [type] ...
    )
    GO
    """
    result = []
    i = start_i
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped == 'GO':
            i += 1
            break
        if stripped.startswith('IF @@ERROR'):
            i += 1
            continue
        if stripped.startswith('PRINT N'):
            i += 1
            continue
        result.append(lines[i].rstrip())
        i += 1
    return result, i


def convert_create_table(table_lines):
    """Convert a CREATE TABLE block to PostgreSQL.

    Input is the raw lines from CREATE TABLE to GO (exclusive).
    Format:
    CREATE TABLE [schema].[Table]
    (
    [col1] [type] ...,
    [col2] [type] ...
    )
    """
    text = '\n'.join(table_lines)

    # Get table name
    m = re.search(r'CREATE\s+TABLE\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?', text, re.I)
    if not m:
        return None
    table_name = m.group(1)

    # Find columns between first ( and last )
    # The ( is on a line by itself after CREATE TABLE line
    paren_start = text.find('(')
    if paren_start < 0:
        return None

    # Find the matching closing ) -- walk through respecting nested parens and strings
    depth = 0
    paren_end = len(text) - 1
    in_string = False
    for ci in range(paren_start, len(text)):
        ch = text[ci]
        if ch == "'" and not in_string:
            in_string = True
        elif ch == "'" and in_string:
            if ci + 1 < len(text) and text[ci + 1] == "'":
                continue  # escaped quote
            in_string = False
        elif not in_string:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    paren_end = ci
                    break

    col_text = text[paren_start + 1:paren_end]

    # Parse columns line by line (more reliable than comma splitting due to nested parens in defaults)
    pg_cols = []
    for raw_line in col_text.split('\n'):
        line = raw_line.strip()
        if not line:
            continue
        # Skip lines that don't start with [ (those are not column defs)
        if not line.startswith('['):
            continue
        converted = parse_column_def(line)
        if converted:
            pg_cols.append(f'    {converted}')

    if not pg_cols:
        return None

    result = f'CREATE TABLE {SCHEMA}."{table_name}" (\n'
    result += ',\n'.join(pg_cols)
    result += '\n);'

    return result


def split_column_defs(col_text):
    """Split column definitions by commas, respecting nested parens."""
    defs = []
    current = []
    depth = 0
    for ch in col_text:
        if ch == '(':
            depth += 1
            current.append(ch)
        elif ch == ')':
            depth -= 1
            current.append(ch)
        elif ch == ',' and depth == 0:
            defs.append(''.join(current))
            current = []
        elif ch == '\n':
            current.append(' ')
        else:
            current.append(ch)
    if current:
        defs.append(''.join(current))
    return defs


def convert_alter_constraint(line):
    """Convert ALTER TABLE ADD CONSTRAINT for PK, UNIQUE, CHECK."""
    line = bracket_to_pg(line)
    line = convert_sql_functions(line)
    line = remove_n_prefix(line)
    line = line.rstrip(';').rstrip()

    # Remove CLUSTERED/NONCLUSTERED keywords
    line = re.sub(r'\s+CLUSTERED\b', '', line, flags=re.I)
    line = re.sub(r'\bNONCLUSTERED\s+', '', line, flags=re.I)

    # Convert WITH (PAD_INDEX = ...) options
    line = re.sub(r'\s+WITH\s*\([^)]+\)', '', line, flags=re.I)

    # Convert ON [PRIMARY] -> remove
    line = re.sub(r'\s+ON\s+"PRIMARY"', '', line, flags=re.I)

    # Convert isjson([col])=(1) -> "col" IS NOT NULL (PG 16+ supports col::jsonb cast check)
    # Use a simpler approach: isjson(x)=(1) -> (x)::jsonb IS NOT NULL
    line = re.sub(
        r'isjson\s*\(\s*"(\w+)"\s*\)\s*=\s*\(1\)',
        r'("\1")::jsonb IS NOT NULL',
        line, flags=re.I
    )

    # Handle CHECK constraints with BIT column comparisons
    # =(0) -> = false, =(1) -> = true for boolean contexts
    # Keep numeric comparisons like >=(0) as-is (these are real numeric checks)
    line = re.sub(r'(?<![><!])=\s*\(0\)', '= false', line)
    line = re.sub(r'(?<![><!])=\s*\(1\)', '= true', line)
    line = re.sub(r'>=\s*\(0\)', '>= 0', line)
    line = re.sub(r'<=\s*\(1\)', '<= 1', line)

    line += ';'
    return line


def convert_index(line, bool_cols_by_table=None):
    """Convert CREATE INDEX to PostgreSQL."""
    line = bracket_to_pg(line)
    line = line.rstrip(';').rstrip()

    # Remove NONCLUSTERED keyword
    line = re.sub(r'\bNONCLUSTERED\s+', '', line, flags=re.I)
    line = re.sub(r'\s+CLUSTERED\b', '', line, flags=re.I)

    # Remove WITH (PAD_INDEX = ...) options
    line = re.sub(r'\s+WITH\s*\([^)]+\)', '', line, flags=re.I)

    # Remove ON [PRIMARY]
    line = re.sub(r'\s+ON\s+"PRIMARY"', '', line, flags=re.I)

    # Convert WHERE clause N' prefixes
    line = remove_n_prefix(line)

    # Convert boolean comparisons in WHERE clauses: =(1) -> = true, =(0) -> = false
    # This handles filtered indexes on BIT/BOOLEAN columns
    line = re.sub(r'=\s*\(1\)', '= true', line)
    line = re.sub(r'=\s*\(0\)', '= false', line)

    # Add IF NOT EXISTS
    line = re.sub(r'CREATE\s+(UNIQUE\s+)?INDEX\s+', r'CREATE \1INDEX IF NOT EXISTS ', line, flags=re.I)

    line += ';'
    return line


def extract_trigger(lines, start_i):
    """Extract a CREATE TRIGGER block."""
    result = []
    i = start_i
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped == 'GO':
            i += 1
            break
        if stripped.startswith('IF @@ERROR'):
            i += 1
            continue
        result.append(lines[i].rstrip())
        i += 1
    return result, i


def convert_trigger(trigger_lines):
    """Convert a T-SQL trigger to PostgreSQL trigger function + trigger."""
    text = '\n'.join(trigger_lines)

    # Extract trigger name and table name
    m = re.search(
        r'CREATE\s+TRIGGER\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?\s+'
        r'ON\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?',
        text, re.I
    )
    if not m:
        return None, None

    trigger_name = m.group(1)
    table_name = m.group(2)
    fn_name = f'fn_{trigger_name}'

    # Most MJ triggers are simple __mj_UpdatedAt triggers
    # Pattern: AFTER UPDATE -> SET __mj_UpdatedAt = GETUTCDATE()
    is_update_trigger = 'AFTER UPDATE' in text.upper()

    if trigger_name == 'tr_APIScope_UpdateFullPath':
        return convert_apiscope_trigger()

    if is_update_trigger:
        fn_text = f"""CREATE OR REPLACE FUNCTION {SCHEMA}."{fn_name}"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;"""

        trg_text = f"""CREATE TRIGGER "{trigger_name}"
    BEFORE UPDATE ON {SCHEMA}."{table_name}"
    FOR EACH ROW
    EXECUTE FUNCTION {SCHEMA}."{fn_name}"();"""
    else:
        # For other trigger types, create a stub
        fn_text = f"""-- TODO: Manual conversion needed for trigger {trigger_name} on {table_name}
CREATE OR REPLACE FUNCTION {SCHEMA}."{fn_name}"()
RETURNS TRIGGER AS $$
BEGIN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;"""

        trg_text = f"""CREATE TRIGGER "{trigger_name}"
    BEFORE INSERT ON {SCHEMA}."{table_name}"
    FOR EACH ROW
    EXECUTE FUNCTION {SCHEMA}."{fn_name}"();"""

    return fn_text, trg_text


def convert_apiscope_trigger():
    """Convert the tr_APIScope_UpdateFullPath trigger to PostgreSQL."""
    fn_text = f"""CREATE OR REPLACE FUNCTION {SCHEMA}."fn_tr_APIScope_UpdateFullPath"()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate all FullPath values using recursive CTE
    WITH RECURSIVE "ScopePaths" AS (
        SELECT
            "ID",
            "Name",
            "ParentID",
            CAST("Name" AS VARCHAR(500)) AS "ComputedPath"
        FROM {SCHEMA}."APIScope"
        WHERE "ParentID" IS NULL

        UNION ALL

        SELECT
            s."ID",
            s."Name",
            s."ParentID",
            CAST(sp."ComputedPath" || ':' || s."Name" AS VARCHAR(500)) AS "ComputedPath"
        FROM {SCHEMA}."APIScope" s
        INNER JOIN "ScopePaths" sp ON s."ParentID" = sp."ID"
    )
    UPDATE {SCHEMA}."APIScope" s
    SET "FullPath" = sp."ComputedPath"
    FROM "ScopePaths" sp
    WHERE s."ID" = sp."ID"
      AND (s."FullPath" != sp."ComputedPath" OR s."FullPath" IS NULL);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;"""

    trg_text = f"""CREATE TRIGGER "tr_APIScope_UpdateFullPath"
    AFTER INSERT OR UPDATE OF "Name", "ParentID" ON {SCHEMA}."APIScope"
    FOR EACH ROW
    EXECUTE FUNCTION {SCHEMA}."fn_tr_APIScope_UpdateFullPath"();"""

    return fn_text, trg_text


# ============================================================================
# PASS 2: FOREIGN KEYS
# ============================================================================

def extract_foreign_keys(lines):
    """Extract all ALTER TABLE ADD CONSTRAINT FOREIGN KEY lines."""
    fks = []
    for line in lines:
        stripped = line.strip()
        if re.match(r'ALTER\s+TABLE.*ADD\s+CONSTRAINT.*FOREIGN\s+KEY', stripped, re.I):
            fks.append(stripped)
    return fks


def extract_check_constraints_post_views(lines):
    """Extract CHECK constraints that appear after the views/procedures section."""
    checks = []
    for line in lines:
        stripped = line.strip()
        if (re.match(r'ALTER\s+TABLE.*ADD\s+CONSTRAINT.*CHECK\s*\(', stripped, re.I)
                and 'FOREIGN KEY' not in stripped.upper()
                and 'PRIMARY KEY' not in stripped.upper()):
            checks.append(stripped)
    return checks


def convert_foreign_keys(lines):
    """Convert all foreign key constraints to PostgreSQL.

    Also converts CHECK constraints that appear in the post-views section.
    Returns (output, check_constraints) where check_constraints are the PG-converted
    CHECK constraint lines for use in seed data loading.
    """
    output = []
    output.append('-- ============================================================================')
    output.append('-- FOREIGN KEY CONSTRAINTS')
    output.append('-- ============================================================================')
    output.append('')

    fks = extract_foreign_keys(lines)
    for fk in fks:
        converted = bracket_to_pg(fk)
        # Remove WITH CHECK
        converted = re.sub(r'\s+WITH\s+CHECK\b', '', converted, flags=re.I)
        # Remove ON [PRIMARY]
        converted = re.sub(r'\s+ON\s+"PRIMARY"', '', converted, flags=re.I)
        if not converted.endswith(';'):
            converted += ';'
        output.append(converted)

    # Also emit CHECK constraints from the post-views section
    checks = extract_check_constraints_post_views(lines)
    if checks:
        output.append('')
        output.append('-- CHECK CONSTRAINTS')
        check_output = []
        for chk in checks:
            converted = convert_alter_constraint(chk)
            if converted:
                output.append(converted)
                check_output.append(converted)

        print(f"  Foreign keys: {len(fks)}")
        print(f"  CHECK constraints: {len(checks)}")
        return output, check_output

    print(f"  Foreign keys: {len(fks)}")
    return output, []


# ============================================================================
# PASS 3: VIEWS
# ============================================================================

# Views that reference SQL Server system catalog - need PG-specific rewrite
# These views use sys.* tables (check_constraints, objects, schemas, columns, etc.)
# and will need manual conversion to use pg_catalog/information_schema equivalents
SYS_CATALOG_VIEWS = {
    'vwSQLTablesAndEntities', 'vwSQLColumnsAndEntityFields',
    'vwTableUniqueKeys', 'vwTablePrimaryKeys', 'vwForeignKeys',
    'vwSQLSchemas', 'vwEntityFieldsWithCheckConstraints',
    'vwEntitiesWithMissingBaseTables', 'vwFlywayVersionHistoryParsed',
}

def detect_sys_catalog_usage(view_text):
    """Check if a view references SQL Server system catalog tables."""
    return bool(re.search(r'\bsys\.\w+', view_text, re.I))


def extract_views(lines):
    """Extract all CREATE VIEW blocks."""
    views = []
    i = 0
    n = len(lines)

    while i < n:
        stripped = lines[i].strip()
        if re.match(r'CREATE\s+VIEW\s+', stripped, re.I):
            view_lines = []
            while i < n:
                s2 = lines[i].strip()
                if s2 == 'GO':
                    i += 1
                    break
                if s2.startswith('IF @@ERROR'):
                    i += 1
                    continue
                view_lines.append(lines[i].rstrip())
                i += 1
            views.append('\n'.join(view_lines))
        else:
            i += 1

    return views


def convert_iif(s):
    """Convert IIF(cond, true_val, false_val) -> CASE WHEN cond THEN true_val ELSE false_val END."""
    pattern = r'\bIIF\s*\('
    max_iter = 30
    for _ in range(max_iter):
        m = re.search(pattern, s, re.I)
        if not m:
            break
        start = m.start()
        open_pos = m.end() - 1
        depth = 1
        pos = open_pos + 1
        args = []
        arg_start = pos
        in_string = False
        while pos < len(s) and depth > 0:
            ch = s[pos]
            if ch == "'" and not in_string:
                in_string = True
            elif ch == "'" and in_string:
                if pos + 1 < len(s) and s[pos + 1] == "'":
                    pos += 1  # skip escaped quote
                else:
                    in_string = False
            elif not in_string:
                if ch == '(':
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0:
                        args.append(s[arg_start:pos].strip())
                        break
                elif ch == ',' and depth == 1:
                    args.append(s[arg_start:pos].strip())
                    arg_start = pos + 1
            pos += 1
        if len(args) == 3:
            cond, true_val, false_val = args
            replacement = f'CASE WHEN {cond} THEN {true_val} ELSE {false_val} END'
            s = s[:start] + replacement + s[pos + 1:]
        else:
            break
    return s


def convert_convert_func(s):
    """Convert CONVERT(type, expr) -> CAST(expr AS type)."""
    pattern = r'\bCONVERT\s*\('
    max_iter = 30
    for _ in range(max_iter):
        m = re.search(pattern, s, re.I)
        if not m:
            break
        start = m.start()
        open_pos = m.end() - 1
        depth = 1
        pos = open_pos + 1
        args = []
        arg_start = pos
        in_string = False
        while pos < len(s) and depth > 0:
            ch = s[pos]
            if ch == "'" and not in_string:
                in_string = True
            elif ch == "'" and in_string:
                if pos + 1 < len(s) and s[pos + 1] == "'":
                    pos += 1
                else:
                    in_string = False
            elif not in_string:
                if ch == '(':
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0:
                        args.append(s[arg_start:pos].strip())
                        break
                elif ch == ',' and depth == 1:
                    args.append(s[arg_start:pos].strip())
                    arg_start = pos + 1
            pos += 1
        if len(args) >= 2:
            type_str = convert_type_name(args[0].strip())
            expr = args[1].strip()
            replacement = f'CAST({expr} AS {type_str})'
            s = s[:start] + replacement + s[pos + 1:]
        else:
            break
    return s


def convert_try_convert_func(s):
    """Convert TRY_CONVERT(type, expr) -> CAST(expr AS type)."""
    pattern = r'\bTRY_CONVERT\s*\('
    max_iter = 30
    for _ in range(max_iter):
        m = re.search(pattern, s, re.I)
        if not m:
            break
        start = m.start()
        open_pos = m.end() - 1
        depth = 1
        pos = open_pos + 1
        args = []
        arg_start = pos
        in_string = False
        while pos < len(s) and depth > 0:
            ch = s[pos]
            if ch == "'" and not in_string:
                in_string = True
            elif ch == "'" and in_string:
                if pos + 1 < len(s) and s[pos + 1] == "'":
                    pos += 1
                else:
                    in_string = False
            elif not in_string:
                if ch == '(':
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0:
                        args.append(s[arg_start:pos].strip())
                        break
                elif ch == ',' and depth == 1:
                    args.append(s[arg_start:pos].strip())
                    arg_start = pos + 1
            pos += 1
        if len(args) >= 2:
            type_str = convert_type_name(args[0].strip())
            expr = args[1].strip()
            replacement = f'CAST({expr} AS {type_str})'
            s = s[:start] + replacement + s[pos + 1:]
        else:
            break
    return s


def convert_charindex(s):
    """Convert CHARINDEX(sub, str) -> STRPOS(str, sub) (args reversed)."""
    pattern = r'\bCHARINDEX\s*\('
    max_iter = 30
    for _ in range(max_iter):
        m = re.search(pattern, s, re.I)
        if not m:
            break
        start = m.start()
        open_pos = m.end() - 1
        depth = 1
        pos = open_pos + 1
        args = []
        arg_start = pos
        in_string = False
        while pos < len(s) and depth > 0:
            ch = s[pos]
            if ch == "'" and not in_string:
                in_string = True
            elif ch == "'" and in_string:
                if pos + 1 < len(s) and s[pos + 1] == "'":
                    pos += 1
                else:
                    in_string = False
            elif not in_string:
                if ch == '(':
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0:
                        args.append(s[arg_start:pos].strip())
                        break
                elif ch == ',' and depth == 1:
                    args.append(s[arg_start:pos].strip())
                    arg_start = pos + 1
            pos += 1
        if len(args) >= 2:
            substring_expr = args[0].strip()
            string_expr = args[1].strip()
            replacement = f'STRPOS({string_expr}, {substring_expr})'
            s = s[:start] + replacement + s[pos + 1:]
        else:
            break
    return s


def convert_stuff(s):
    """Convert STUFF(str, start, length, replacement) to PG equivalent."""
    pattern = r'\bSTUFF\s*\('
    max_iter = 20
    for _ in range(max_iter):
        m = re.search(pattern, s, re.I)
        if not m:
            break
        start = m.start()
        open_pos = m.end() - 1
        depth = 1
        pos = open_pos + 1
        args = []
        arg_start = pos
        in_string = False
        while pos < len(s) and depth > 0:
            ch = s[pos]
            if ch == "'" and not in_string:
                in_string = True
            elif ch == "'" and in_string:
                if pos + 1 < len(s) and s[pos + 1] == "'":
                    pos += 1
                else:
                    in_string = False
            elif not in_string:
                if ch == '(':
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0:
                        args.append(s[arg_start:pos].strip())
                        break
                elif ch == ',' and depth == 1:
                    args.append(s[arg_start:pos].strip())
                    arg_start = pos + 1
            pos += 1
        if len(args) == 4:
            string_expr = args[0].strip()
            start_pos = args[1].strip()
            length = args[2].strip()
            replace_str = args[3].strip()
            replacement = (
                f'SUBSTRING({string_expr}, 1, {start_pos}-1) || '
                f'{replace_str} || '
                f'SUBSTRING({string_expr}, {start_pos}+{length})'
            )
            s = s[:start] + replacement + s[pos + 1:]
        else:
            break
    return s


def convert_top_to_limit(s):
    """Convert SELECT TOP N to SELECT with LIMIT marker."""
    def replace_top(m):
        n = m.group(1).strip()
        return f'SELECT /*TOP:{n}*/'
    s = re.sub(r'\bSELECT\s+TOP\s+(\d+)\b', replace_top, s, flags=re.I)
    return s


def finalize_top_to_limit(view_text):
    """Convert /*TOP:N*/ markers to LIMIT N."""
    pattern = r'/\*TOP:(\d+)\*/'
    matches = list(re.finditer(pattern, view_text))
    if not matches:
        return view_text

    for m in reversed(matches):
        n = m.group(1)
        view_text = view_text[:m.start()] + view_text[m.end():]
        pos = m.start()
        depth = 0
        for ci in range(pos):
            if view_text[ci] == '(':
                depth += 1
            elif view_text[ci] == ')':
                depth -= 1

        end_pos = len(view_text)
        scan_depth = depth
        for ci in range(pos, len(view_text)):
            ch = view_text[ci]
            if ch == '(':
                scan_depth += 1
            elif ch == ')':
                scan_depth -= 1
                if scan_depth < depth:
                    end_pos = ci
                    break

        limit_clause = f'\n    LIMIT {n}'
        view_text = view_text[:end_pos] + limit_clause + view_text[end_pos:]

    return view_text


def convert_string_concat(s):
    """Convert T-SQL + string concatenation to || in SQL context.

    Strategy: Apply specific patterns first, then use a general catch-all
    for any remaining + that appears between string-context operands
    (closing parens, string literals, quoted identifiers, etc.)
    """
    # N'...' + -> '...' ||
    s = re.sub(r"N'([^']*)'(\s*)\+", r"'\1'\2||", s)
    s = re.sub(r"\+(\s*)N'([^']*)'", r"||\1'\2'", s)
    # '...' + expr
    s = re.sub(r"'([^']*)'\s*\+\s*", r"'\1' || ", s)
    s = re.sub(r"\s*\+\s*'([^']*)'", r" || '\1'", s)
    # CAST result + something
    s = re.sub(r'(AS\s+(?:VARCHAR\(\d+\)|TEXT)\s*\))\s*\+', r'\1 ||', s, flags=re.I)
    # "col" + expr
    s = re.sub(r'("[\w]+")\s*\+\s*', r'\1 || ', s)
    s = re.sub(r'\s*\+\s*("[\w]+")', r' || \1', s)
    # alias.Column + expr
    s = re.sub(r'(\w+\.\w+)\s*\+\s*', r'\1 || ', s)
    # General catch-all: closing paren or quote followed by +
    # Covers COALESCE(...) + REPLACE(...), func(...) + expr, etc.
    # The + is NOT preceded by a digit context so arithmetic like col + 1 won't match
    # (since those don't end with ) before +)
    # We also need to handle multiline: ') +\nREPLACE(' across lines
    s = re.sub(r"'\s*\)\s*\+", "') ||", s)  # '..') + -> '..') ||
    s = re.sub(r'\)\s*\+\s*(?=[A-Za-z_"\'])', ') || ', s)  # ) + word/quote/func
    return s


def apply_lateral_on_true(text):
    """Add ON true after LEFT JOIN LATERAL subqueries."""
    lines = text.split('\n')
    i = 0
    in_lateral = False
    lateral_depth = 0

    while i < len(lines):
        line = lines[i]
        if 'LEFT JOIN LATERAL' in line.upper() or 'CROSS JOIN LATERAL' in line.upper():
            in_lateral = True
            lateral_depth = 0

        if in_lateral:
            lateral_depth += line.count('(') - line.count(')')
            if lateral_depth <= 0 and ')' in line:
                stripped = line.strip()
                alias_match = re.search(r'\)\s+(?:AS\s+)?("?\w+"?)\s*$', stripped, re.I)
                if alias_match and 'ON true' not in stripped and 'ON TRUE' not in stripped:
                    lines[i] = line.rstrip() + ' ON true'
                in_lateral = False
        i += 1

    return '\n'.join(lines)


def quote_schema_view_refs(text):
    """Quote unquoted view and function references, add schema prefix."""
    text = re.sub(r'\b__mj\.(vw\w+)\b(?!")', r'__mj."\1"', text)
    text = re.sub(r'(?<![."_\w])\b(vw[A-Z]\w+)\b(?!")', r'__mj."\1"', text)
    text = re.sub(r'\b__mj\.([A-Z]\w+)\s*\(', r'__mj."\1"(', text)
    return text


SQL_KEYWORDS = {
    'AS', 'ON', 'IN', 'IS', 'OR', 'AND', 'NOT', 'NULL',
    'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER',
    'OUTER', 'FULL', 'CROSS', 'LATERAL', 'TRUE', 'FALSE',
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'SET',
    'TABLE', 'VIEW', 'INDEX', 'FUNCTION', 'TRIGGER',
    'UNION', 'ALL', 'DISTINCT', 'GROUP', 'ORDER', 'BY',
    'HAVING', 'LIMIT', 'OFFSET', 'BETWEEN', 'LIKE',
    'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'ASC', 'DESC', 'WITH', 'RECURSIVE', 'PARTITION',
    'OVER', 'RANK', 'ROW', 'ROWS', 'RANGE',
    'CASCADE', 'RESTRICT', 'ONLY', 'REPLACE',
    'BOOLEAN', 'INTEGER', 'TEXT', 'VARCHAR', 'UUID',
    'TIMESTAMP', 'TIMESTAMPTZ', 'COALESCE', 'CAST',
    'LENGTH', 'STRPOS', 'SUBSTRING', 'COUNT', 'SUM',
    'MAX', 'MIN', 'AVG', 'UPPER', 'LOWER', 'INITCAP',
    'TRIM', 'LTRIM', 'RTRIM', 'NOW', 'RETURNS', 'BEGIN',
    'DECLARE', 'RETURN', 'LANGUAGE', 'CREATE', 'DROP',
    'ALTER', 'IF', 'ELSIF', 'LOOP', 'FOR', 'WHILE',
    'PRIMARY', 'FOREIGN', 'KEY', 'REFERENCES',
    'CONSTRAINT', 'CHECK', 'DEFAULT', 'UNIQUE',
    'SCHEMA', 'GRANT', 'REVOKE', 'EXECUTE',
    'NUMERIC', 'DOUBLE', 'PRECISION', 'REAL',
    'SMALLINT', 'BIGINT', 'CHAR', 'DATE', 'TIME',
    'INTERVAL', 'ARRAY', 'RECORD', 'INTO', 'VALUES',
    'EACH', 'NEW', 'OLD', 'AFTER', 'BEFORE',
    'INSTEAD', 'OF', 'RAISE', 'EXCEPTION', 'NOTICE',
    'NO', 'ACTION', 'STRING_AGG', 'CONCAT', 'FILTER',
    'WITHIN',
}


def quote_unquoted_identifiers(text):
    """Quote PascalCase identifiers that aren't already quoted."""
    def quote_match(m):
        prefix = m.group(1)
        ident = m.group(2)
        if ident.upper() in SQL_KEYWORDS:
            return m.group(0)
        return f'{prefix}"{ident}"'

    text = re.sub(r'((?:"\w+"|\w+)\.)([A-Z]\w+)\b(?!")', quote_match, text)

    def quote_standalone(m):
        ident = m.group(1)
        if ident.upper() in SQL_KEYWORDS:
            return m.group(0)
        if ident.startswith('vw') or ident.startswith('fn') or ident.startswith('sp'):
            return m.group(0)
        if ident == ident.upper():
            return m.group(0)
        if len(ident) <= 1:
            return m.group(0)
        return f'"{ident}"'

    text = re.sub(r'(?<![."_\w])([A-Z][a-z]\w+)\b(?!")', quote_standalone, text)

    return text


def convert_cast_types(text):
    """Convert T-SQL types inside CAST(... AS type) expressions to PostgreSQL."""
    def replace_cast_type(m):
        prefix = m.group(1)
        type_str = m.group(2)
        pg_type = convert_type_name(type_str)
        return f'{prefix}{pg_type})'
    # Match CAST(... AS <type>) - capture just the type portion
    text = re.sub(
        r'(CAST\s*\([^)]*?\bAS\s+)((?:N?VARCHAR|NCHAR|CHAR)\s*\([^)]*\)|(?:NVARCHAR|NCHAR|NTEXT|DATETIME2?|DATETIMEOFFSET|UNIQUEIDENTIFIER|BIT|BIGINT|SMALLINT|TINYINT|FLOAT|REAL|MONEY|SMALLMONEY|IMAGE|SQL_VARIANT)(?:\s*\([^)]*\))?)\s*\)',
        replace_cast_type, text, flags=re.I
    )
    return text


def convert_view_text(text):
    """Apply all view-level conversions."""
    text = bracket_to_pg(text)
    text = remove_collation(text)
    text = remove_n_prefix(text)
    text = convert_sql_functions(text)
    text = convert_iif(text)
    text = convert_convert_func(text)
    text = convert_try_convert_func(text)
    text = convert_cast_types(text)
    text = convert_top_to_limit(text)
    text = convert_charindex(text)
    text = convert_stuff(text)
    text = re.sub(r'\bOUTER\s+APPLY\b', 'LEFT JOIN LATERAL', text, flags=re.I)
    text = re.sub(r'\bCROSS\s+APPLY\b', 'CROSS JOIN LATERAL', text, flags=re.I)
    text = convert_string_concat(text)

    # CREATE VIEW -> CREATE OR REPLACE VIEW
    text = re.sub(r'CREATE\s+VIEW\b', 'CREATE OR REPLACE VIEW', text, flags=re.I)

    # Finalize TOP -> LIMIT
    text = finalize_top_to_limit(text)

    # Add ON true for LATERAL joins
    text = apply_lateral_on_true(text)

    # Quote references
    text = quote_schema_view_refs(text)
    text = quote_unquoted_identifiers(text)

    # Boolean comparisons
    text = re.sub(r'(?<=["\s)])=\s*1\b', '= true', text)
    text = re.sub(r'(?<=["\s)])=\s*0\b', '= false', text)

    return text


def build_view_dependency_graph(views):
    """Build a dependency graph for view ordering (topological sort)."""
    view_names = {}
    for i, v in enumerate(views):
        m = re.search(
            r'CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+'
            r'\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?',
            v, re.I
        )
        if m:
            view_names[m.group(1)] = i

    deps = {name: set() for name in view_names}
    for name, idx in view_names.items():
        text = views[idx]
        for other_name in view_names:
            if other_name != name and re.search(r'\b' + re.escape(other_name) + r'\b', text):
                deps[name].add(other_name)

    # Topological sort
    sorted_names = []
    visited = set()
    visiting = set()

    def visit(name):
        if name in visited:
            return
        if name in visiting:
            # Circular dep - just add it
            sorted_names.append(name)
            visited.add(name)
            return
        visiting.add(name)
        for dep in deps.get(name, set()):
            visit(dep)
        visiting.discard(name)
        visited.add(name)
        sorted_names.append(name)

    for name in view_names:
        visit(name)

    return [view_names[n] for n in sorted_names if n in view_names]


def convert_views(lines):
    """Convert all views to PostgreSQL.

    Returns:
        tuple: (output_lines, created_view_names, skipped_view_names)
    """
    output = []
    output.append('')
    output.append('-- ============================================================================')
    output.append('-- VIEWS')
    output.append('-- ============================================================================')
    output.append('')

    views = extract_views(lines)
    print(f"  Found {len(views)} views")

    # Get sorted order
    sorted_indices = build_view_dependency_graph(views)
    if len(sorted_indices) != len(views):
        # Fall back to original order if topo sort missed some
        all_indices = set(range(len(views)))
        remaining = all_indices - set(sorted_indices)
        sorted_indices = sorted_indices + sorted(remaining)

    converted = 0
    skipped = 0
    errors = 0
    created_names = set()
    skipped_names = set()

    for idx in sorted_indices:
        view_text = views[idx]
        # Extract view name - handle [schema].[ViewName] pattern
        name_m = re.search(
            r'CREATE\s+VIEW\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?',
            view_text, re.I
        )
        view_name = name_m.group(1) if name_m else ''

        if view_name in SYS_CATALOG_VIEWS or detect_sys_catalog_usage(view_text):
            output.append(f'-- SKIPPED: {view_name} - references SQL Server sys catalog tables')
            output.append(f'-- Needs manual rewrite for PostgreSQL pg_catalog/information_schema')
            output.append('')
            skipped += 1
            skipped_names.add(view_name)
            continue

        try:
            result = convert_view_text(view_text)
            output.append(result)
            output.append(';')
            output.append('')
            converted += 1
            created_names.add(view_name)
        except Exception as e:
            output.append(f'-- ERROR converting view {view_name}: {e}')
            output.append('')
            errors += 1
            skipped_names.add(view_name)

    print(f"  Converted: {converted}, Skipped: {skipped}, Errors: {errors}")
    return output, created_names, skipped_names


# ============================================================================
# PASS 4: FUNCTIONS (TVF and Scalar)
# ============================================================================

def extract_functions(lines):
    """Extract all CREATE FUNCTION blocks."""
    functions = []
    i = 0
    n = len(lines)

    while i < n:
        stripped = lines[i].strip()
        if re.match(r'CREATE\s+FUNCTION\s+', stripped, re.I):
            fn_lines = []
            begin_depth = 0
            found_begin = False
            found_return = False

            while i < n:
                s2 = lines[i].strip()
                if s2 == 'GO':
                    i += 1
                    break
                if s2.startswith('IF @@ERROR'):
                    i += 1
                    continue
                fn_lines.append(lines[i].rstrip())

                upper = s2.upper()
                begin_count = len(re.findall(r'\bBEGIN\b', upper))
                end_count = len(re.findall(r'\bEND\b', upper))

                if begin_count > 0:
                    found_begin = True
                begin_depth += begin_count - end_count

                if found_begin and begin_depth <= 0 and end_count > 0:
                    i += 1
                    break

                # For inline TVFs without BEGIN/END
                if 'RETURN' in upper and not found_begin:
                    found_return = True

                i += 1

            functions.append('\n'.join(fn_lines))
        else:
            i += 1

    return functions


def convert_function(fn_text):
    """Convert a T-SQL function to PostgreSQL."""
    # Get function name
    name_m = re.search(
        r'CREATE\s+FUNCTION\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?',
        fn_text, re.I
    )
    fn_name = name_m.group(1) if name_m else 'unknown'

    # Check if it's a recursive CTE function (fnXxx_GetRootID pattern)
    # Handles fnXxxParentID_GetRootID, fnXxxParentRunID_GetRootID, etc.
    is_recursive_root = re.search(r'fn\w+_GetRootID', fn_name, re.I)

    # Check if it's a scalar function (RETURNS type without TABLE)
    returns_m = re.search(r'RETURNS\s+([\w\s()]+?)(?:\s+AS\s*$|\s+WITH\b|\s*$)', fn_text, re.MULTILINE | re.I)
    is_tvf = bool(re.search(r'RETURNS\s+@', fn_text, re.I)) or '@outputTable' in fn_text

    if is_recursive_root:
        return convert_recursive_root_function(fn_text, fn_name)

    if is_tvf:
        return convert_tvf_function(fn_text, fn_name)

    # Scalar function
    return convert_scalar_function(fn_text, fn_name)


def convert_recursive_root_function(fn_text, fn_name):
    """Convert fnXxx_GetRootID recursive functions.

    These functions follow a common pattern:
    1. Take RecordID and ParentXxxID as params
    2. Walk up a hierarchy using a recursive CTE
    3. Return the root ID
    """
    # Extract parameters - ONLY from the parameter declaration block
    # (between first '(' and matching ')' after function name, before RETURNS)
    param_section_m = re.search(r'CREATE\s+FUNCTION\s+\S+\s*\((.*?)\)\s*RETURNS', fn_text, re.I | re.S)
    param_section = param_section_m.group(1) if param_section_m else ''
    params = []
    for m in re.finditer(r'@(\w+)\s+(\w+(?:\s*\([^)]*\))?)', param_section):
        params.append((m.group(1), convert_type_name(m.group(2))))

    # Extract the table name from the CTE body
    table_m = re.search(r'FROM\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?', fn_text, re.I)
    table_name = table_m.group(1) if table_m else 'Unknown'

    # Extract the parent column name from the CTE body
    # Look for the pattern: c.[ID] = p.[ParentXxxID] in the recursive join
    parent_col_m = re.search(r'c\.\[?ID\]?\s*=\s*p\.\[?(\w+)\]?', fn_text, re.I)
    if not parent_col_m:
        # Alternative: look for WHERE [ParentXxxID] IS NULL
        parent_col_m = re.search(r'\[(\w*Parent\w*)\]\s+IS\s+NULL', fn_text, re.I)
    parent_col = parent_col_m.group(1) if parent_col_m else 'ParentID'

    # Find the second parameter name (the parent param, e.g., ParentID, ParentRunID)
    parent_param = params[1][0] if len(params) > 1 else 'ParentID'

    params_str = ', '.join(f'p_{p[0]} {p[1]}' for p in params)

    return f"""CREATE OR REPLACE FUNCTION {SCHEMA}."{fn_name}"({params_str})
RETURNS TABLE("RootID" UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "{parent_col}",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            {SCHEMA}."{table_name}"
        WHERE
            "ID" = COALESCE(p_{parent_param}, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."{parent_col}",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            {SCHEMA}."{table_name}" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."{parent_col}"
        WHERE
            p."Depth" < 100
    )
    SELECT
        "RootParentID" AS "RootID"
    FROM
        CTE_RootParent
    WHERE
        "{parent_col}" IS NULL
    ORDER BY
        "RootParentID"
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;"""


def convert_tvf_function(fn_text, fn_name):
    """Convert table-valued functions.

    ExtractVersionComponents is only used by vwFlywayVersionHistoryParsed
    which is skipped (sys catalog). Other TVFs get a TODO stub.
    """
    if fn_name == 'ExtractVersionComponents':
        return f'-- SKIPPED: {fn_name} - only used by vwFlywayVersionHistoryParsed (sys catalog view)'
    return f'-- TODO: Manual TVF conversion needed for {fn_name}'


def convert_scalar_function(fn_text, fn_name):
    """Convert scalar functions to PostgreSQL."""
    # Well-known scalar functions with manual conversions
    known_scalars = {
        'GetProgrammaticName': convert_get_programmatic_name,
        'StripToAlphanumeric': convert_strip_to_alphanumeric,
        'ToProperCase': convert_to_proper_case,
        'ToTitleCase': convert_to_proper_case,
        'fnInitials': convert_fn_initials,
        'parseDomainFromEmail': convert_parse_domain_from_email,
        'parseDomain': convert_parse_domain,
    }

    if fn_name in known_scalars:
        return known_scalars[fn_name]()

    # Generic conversion attempt
    return f'-- TODO: Manual scalar function conversion needed for {fn_name}'


def convert_strip_to_alphanumeric():
    """Convert StripToAlphanumeric function."""
    return f"""CREATE OR REPLACE FUNCTION {SCHEMA}."StripToAlphanumeric"(p_input TEXT)
RETURNS TEXT AS $$
DECLARE
    v_result TEXT := '';
    v_char TEXT;
    v_i INTEGER := 1;
    v_len INTEGER;
BEGIN
    IF p_input IS NULL OR LENGTH(TRIM(p_input)) = 0 THEN
        RETURN '';
    END IF;

    v_len := LENGTH(p_input);

    WHILE v_i <= v_len LOOP
        v_char := SUBSTRING(p_input, v_i, 1);
        IF v_char ~ '[A-Za-z0-9]' THEN
            v_result := v_result || v_char;
        END IF;
        v_i := v_i + 1;
    END LOOP;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;"""


def convert_get_programmatic_name():
    """Convert GetProgrammaticName function."""
    return f"""CREATE OR REPLACE FUNCTION {SCHEMA}."GetProgrammaticName"(p_input TEXT)
RETURNS TEXT AS $$
DECLARE
    v_result TEXT := '';
    v_char TEXT;
    v_i INTEGER := 1;
    v_len INTEGER;
BEGIN
    IF p_input IS NULL OR LENGTH(TRIM(p_input)) = 0 THEN
        RETURN '';
    END IF;

    v_len := LENGTH(p_input);

    WHILE v_i <= v_len LOOP
        v_char := SUBSTRING(p_input, v_i, 1);
        IF v_char ~ '[A-Za-z0-9_]' THEN
            v_result := v_result || v_char;
        END IF;
        v_i := v_i + 1;
    END LOOP;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;"""


def convert_to_proper_case():
    """Convert ToProperCase/ToTitleCase function."""
    return f"""CREATE OR REPLACE FUNCTION {SCHEMA}."ToProperCase"(p_input TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN INITCAP(p_input);
END;
$$ LANGUAGE plpgsql IMMUTABLE;"""


def convert_fn_initials():
    """Convert fnInitials function."""
    return f"""CREATE OR REPLACE FUNCTION {SCHEMA}."fnInitials"(p_input TEXT)
RETURNS TEXT AS $$
DECLARE
    v_result TEXT := '';
    v_words TEXT[];
    v_word TEXT;
BEGIN
    IF p_input IS NULL THEN RETURN NULL; END IF;
    v_words := string_to_array(TRIM(p_input), ' ');
    FOREACH v_word IN ARRAY v_words LOOP
        IF LENGTH(v_word) > 0 THEN
            v_result := v_result || UPPER(SUBSTRING(v_word, 1, 1));
        END IF;
    END LOOP;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;"""


def convert_parse_domain_from_email():
    """Convert parseDomainFromEmail function."""
    return f"""CREATE OR REPLACE FUNCTION {SCHEMA}."parseDomainFromEmail"(p_email TEXT)
RETURNS TEXT AS $$
BEGIN
    IF p_email IS NULL THEN RETURN NULL; END IF;
    IF STRPOS(p_email, '@') = 0 THEN RETURN NULL; END IF;
    RETURN {SCHEMA}."parseDomain"(SUBSTRING(p_email FROM STRPOS(p_email, '@') + 1));
END;
$$ LANGUAGE plpgsql IMMUTABLE;"""


def convert_parse_domain():
    """Convert parseDomain function."""
    return f"""CREATE OR REPLACE FUNCTION {SCHEMA}."parseDomain"(p_url TEXT)
RETURNS TEXT AS $$
DECLARE
    v_domain TEXT;
    v_parts TEXT[];
BEGIN
    IF p_url IS NULL THEN RETURN NULL; END IF;
    v_domain := LOWER(TRIM(p_url));
    v_domain := REGEXP_REPLACE(v_domain, '^https?://', '');
    v_domain := REGEXP_REPLACE(v_domain, '/.*$', '');
    v_domain := REGEXP_REPLACE(v_domain, ':.*$', '');
    v_parts := string_to_array(v_domain, '.');
    IF array_length(v_parts, 1) >= 2 THEN
        RETURN v_parts[array_length(v_parts, 1) - 1] || '.' || v_parts[array_length(v_parts, 1)];
    END IF;
    RETURN v_domain;
END;
$$ LANGUAGE plpgsql IMMUTABLE;"""


def convert_functions(lines):
    """Convert all functions to PostgreSQL.

    Returns:
        tuple: (output_lines, created_function_names)
    """
    output = []
    output.append('')
    output.append('-- ============================================================================')
    output.append('-- FUNCTIONS (TVF and Scalar)')
    output.append('-- ============================================================================')
    output.append('')

    functions = extract_functions(lines)
    print(f"  Found {len(functions)} functions")

    converted = 0
    skipped = 0
    created_names = set()

    for fn_text in functions:
        name_m = re.search(r'CREATE\s+FUNCTION\s+\S+\.?\[?(\w+)\]?', fn_text, re.I)
        fname = name_m.group(1) if name_m else 'unknown'
        try:
            result = convert_function(fn_text)
            if result.startswith('-- TODO') or result.startswith('-- SKIP'):
                output.append(result)
                output.append('')
                skipped += 1
            else:
                output.append(result)
                output.append('')
                converted += 1
                created_names.add(fname)
        except Exception as e:
            output.append(f'-- ERROR converting function {fname}: {e}')
            output.append('')
            skipped += 1

    print(f"  Converted: {converted}, Skipped: {skipped}")
    return output, created_names


# ============================================================================
# PASS 5: PROCEDURES -> FUNCTIONS
# ============================================================================

def extract_procedures(lines):
    """Extract all CREATE PROCEDURE blocks."""
    procedures = []
    i = 0
    n = len(lines)

    while i < n:
        stripped = lines[i].strip()
        if re.match(r'CREATE\s+PROCEDURE\s+', stripped, re.I):
            proc_lines = []
            begin_depth = 0
            found_begin = False

            while i < n:
                s2 = lines[i].strip()
                if s2 == 'GO':
                    i += 1
                    break
                if s2.startswith('IF @@ERROR') or s2.startswith("PRINT N'"):
                    i += 1
                    continue
                proc_lines.append(lines[i].rstrip())

                upper = s2.upper()
                begin_count = len(re.findall(r'\bBEGIN\b', upper))
                end_count = len(re.findall(r'\bEND\b', upper))

                if begin_count > 0:
                    found_begin = True
                begin_depth += begin_count - end_count

                if found_begin and begin_depth <= 0 and end_count > 0:
                    i += 1
                    break
                i += 1

            procedures.append('\n'.join(proc_lines))
        else:
            i += 1

    return procedures


# Procedures to skip (utility procs or procs referencing non-existent objects)
SKIP_PROCS = {
    'CAREFUL_MoveDatesToNewSpecialFields_Then_Drop_Old_CreatedAt_And_UpdatedAt_Columns',
    'spRecompileAllProceduresInDependencyOrder',
    'spRecompileAllViews',
    'spUpdateSchemaInfoFromDatabase',
    'spUpdateExistingEntitiesFromSchema',
    'spCreateUserViewRunWithDetail',
    'spCreateEntityBehaviorType',
    'spUpdateEntityBehaviorType',
    'spDeleteEntityBehaviorType',
    'spCreateEntityBehavior',
    'spUpdateEntityBehavior',
    'spDeleteEntityBehavior',
}


def parse_procedure(text):
    """Parse a CREATE PROCEDURE to extract name, params, body."""
    name_m = re.search(
        r'CREATE\s+PROCEDURE\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?',
        text, re.I
    )
    proc_name = name_m.group(1) if name_m else 'unknown'

    params = []
    as_match = re.search(r'\n\s*AS\s*\n', text, re.I)
    if not as_match:
        as_match = re.search(r'\bAS\s*\n\s*BEGIN\b', text, re.I)

    if as_match:
        header = text[:as_match.start()]
        for m in re.finditer(
            r'@(\w+)\s+(\w+(?:\s*\([^)]*\))?)\s*(?:=\s*([^,\n]+))?',
            header
        ):
            pname = m.group(1)
            ptype = m.group(2)
            pdefault = m.group(3).strip() if m.group(3) else None
            params.append((pname, ptype, pdefault))

    begin_match = re.search(r'\bBEGIN\b', text, re.I)
    if begin_match:
        pos = begin_match.end()
        remaining = text[pos:]
        depth = 1
        scan_pos = 0
        body_end = len(remaining)
        while scan_pos < len(remaining):
            begin_m = re.match(r'\bBEGIN\b', remaining[scan_pos:], re.I)
            end_m = re.match(r'\bEND\b', remaining[scan_pos:], re.I)
            if begin_m:
                depth += 1
                scan_pos += begin_m.end()
            elif end_m:
                depth -= 1
                if depth <= 0:
                    body_end = scan_pos
                    break
                scan_pos += end_m.end()
            else:
                scan_pos += 1
        body = remaining[:body_end].strip()
    else:
        body = ''

    return proc_name, params, body


def find_table_from_proc(body, proc_name, proc_type):
    """Find the target table name from procedure body."""
    schema_pat = r'\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?'

    if proc_type == 'create':
        m = re.search(r'INSERT\s+INTO\s+' + schema_pat, body, re.I)
    elif proc_type == 'update':
        m = re.search(r'UPDATE\s+' + schema_pat, body, re.I)
    elif proc_type == 'delete':
        matches = list(re.finditer(r'DELETE\s+FROM\s+' + schema_pat, body, re.I))
        m = matches[-1] if matches else None
    else:
        m = None

    if m:
        return m.group(1)

    prefix_len = {'create': 8, 'update': 8, 'delete': 8}
    prefix = 'sp' + proc_type.capitalize()
    if proc_name.startswith(prefix):
        return proc_name[len(prefix):]
    return None


def find_view_from_proc(body):
    """Find the view name used for returning results."""
    m = re.search(
        r'FROM\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(vw\w+)\]?',
        body, re.I
    )
    return m.group(1) if m else None


def find_insert_columns(body):
    """Extract column names from INSERT INTO statements."""
    m_with_id = re.search(
        r'IF\s+@ID\s+IS\s+NOT\s+NULL.*?INSERT\s+INTO\s+\S+\s*\(([^)]+)\)',
        body, re.I | re.DOTALL
    )
    m_without_id = re.search(
        r'ELSE.*?INSERT\s+INTO\s+\S+\s*\(([^)]+)\)',
        body, re.I | re.DOTALL
    )

    cols_with = [c.strip().strip('[]"') for c in m_with_id.group(1).split(',')] if m_with_id else []
    cols_without = [c.strip().strip('[]"') for c in m_without_id.group(1).split(',')] if m_without_id else []

    return cols_with, cols_without


def find_update_columns(body):
    """Extract SET column = @param pairs from UPDATE statement."""
    m = re.search(r'\bSET\b(.*?)\bWHERE\b', body, re.I | re.DOTALL)
    if not m:
        return []
    set_text = m.group(1)
    return [(pm.group(1), pm.group(2)) for pm in re.finditer(r'\[?(\w+)\]?\s*=\s*@(\w+)', set_text)]


def convert_default_param(default_val, pg_type):
    """Convert a procedure parameter default value."""
    if default_val is None:
        return None
    d = default_val.strip().rstrip(',')
    if d.upper() == 'NULL':
        return 'NULL'
    if d == '0' and pg_type == 'BOOLEAN':
        return 'false'
    if d == '1' and pg_type == 'BOOLEAN':
        return 'true'
    if d.startswith("N'"):
        return d[1:]
    return d


def build_pg_params(params):
    """Build PostgreSQL function parameter string with defaults last."""
    required = []
    optional = []
    for pname, ptype, pdefault in params:
        pg_type = convert_type_name(ptype)
        if pdefault is not None:
            pg_default = convert_default_param(pdefault, pg_type)
            optional.append(f'IN p_{pname} {pg_type} DEFAULT {pg_default}')
        else:
            required.append(f'IN p_{pname} {pg_type}')
    return ', '.join(required + optional)


def convert_create_proc(proc_name, params, body, table_name, view_name):
    """Convert spCreate procedure to PG function."""
    params_str = build_pg_params(params)
    has_id = any(p[0] == 'ID' for p in params)
    cols_with, cols_without = find_insert_columns(body)

    if not cols_with and not cols_without:
        all_cols = [p[0] for p in params]
        cols_with = all_cols
        cols_without = [c for c in all_cols if c != 'ID']

    def col_str(cols):
        return ', '.join(f'"{c}"' for c in cols)
    def val_str(cols):
        return ', '.join(f'p_{c}' for c in cols)

    return_type = f'SETOF {SCHEMA}."{view_name}"' if view_name else 'TABLE("ID" UUID)'

    out = []
    out.append(f'CREATE OR REPLACE FUNCTION {SCHEMA}."{proc_name}"({params_str})')
    out.append(f'RETURNS {return_type} AS $$')
    out.append('DECLARE')
    out.append('    v_id UUID;')
    out.append('BEGIN')

    if has_id:
        out.append('    IF p_ID IS NOT NULL THEN')
        out.append(f'        INSERT INTO {SCHEMA}."{table_name}"')
        out.append(f'            ({col_str(cols_with)})')
        out.append(f'        VALUES')
        out.append(f'            ({val_str(cols_with)})')
        out.append('        RETURNING "ID" INTO v_id;')
        out.append('    ELSE')
        if cols_without:
            out.append(f'        INSERT INTO {SCHEMA}."{table_name}"')
            out.append(f'            ({col_str(cols_without)})')
            out.append(f'        VALUES')
            out.append(f'            ({val_str(cols_without)})')
            out.append('        RETURNING "ID" INTO v_id;')
        else:
            out.append(f'        INSERT INTO {SCHEMA}."{table_name}" DEFAULT VALUES')
            out.append('        RETURNING "ID" INTO v_id;')
        out.append('    END IF;')
    else:
        if cols_without:
            out.append(f'    INSERT INTO {SCHEMA}."{table_name}"')
            out.append(f'        ({col_str(cols_without)})')
            out.append(f'    VALUES')
            out.append(f'        ({val_str(cols_without)})')
            out.append('    RETURNING "ID" INTO v_id;')
        else:
            out.append(f'    INSERT INTO {SCHEMA}."{table_name}" DEFAULT VALUES')
            out.append('    RETURNING "ID" INTO v_id;')

    if view_name:
        out.append(f'    RETURN QUERY SELECT * FROM {SCHEMA}."{view_name}" WHERE "ID" = v_id;')
    else:
        out.append('    RETURN QUERY SELECT v_id AS "ID";')

    out.append('END;')
    out.append('$$ LANGUAGE plpgsql;')
    return '\n'.join(out)


def convert_update_proc(proc_name, params, body, table_name, view_name):
    """Convert spUpdate procedure to PG function."""
    params_str = build_pg_params(params)
    update_pairs = find_update_columns(body)

    if not update_pairs:
        update_pairs = [(p[0], p[0]) for p in params if p[0] != 'ID']

    set_clauses = [f'"{col}" = p_{param}' for col, param in update_pairs]
    set_str = ',\n        '.join(set_clauses)
    return_type = f'SETOF {SCHEMA}."{view_name}"' if view_name else 'TABLE("ID" UUID)'

    out = []
    out.append(f'CREATE OR REPLACE FUNCTION {SCHEMA}."{proc_name}"({params_str})')
    out.append(f'RETURNS {return_type} AS $$')
    out.append('DECLARE')
    out.append('    v_rowcount INTEGER;')
    out.append('BEGIN')
    out.append(f'    UPDATE {SCHEMA}."{table_name}"')
    out.append(f'    SET')
    out.append(f'        {set_str}')
    out.append('    WHERE "ID" = p_ID;')
    out.append('')
    out.append('    GET DIAGNOSTICS v_rowcount = ROW_COUNT;')
    if view_name:
        out.append(f'    RETURN QUERY SELECT * FROM {SCHEMA}."{view_name}" WHERE "ID" = p_ID;')
    else:
        out.append('    RETURN QUERY SELECT p_ID AS "ID";')
    out.append('END;')
    out.append('$$ LANGUAGE plpgsql;')
    return '\n'.join(out)


def convert_delete_proc(proc_name, params, body, table_name):
    """Convert spDelete procedure to PG function."""
    params_str = build_pg_params(params)

    out = []
    out.append(f'CREATE OR REPLACE FUNCTION {SCHEMA}."{proc_name}"({params_str})')
    out.append('RETURNS TABLE("ID" UUID) AS $$')
    out.append('DECLARE')
    out.append('    v_rowcount INTEGER;')
    out.append('BEGIN')
    out.append(f'    DELETE FROM {SCHEMA}."{table_name}"')
    out.append('    WHERE "ID" = p_ID;')
    out.append('')
    out.append('    GET DIAGNOSTICS v_rowcount = ROW_COUNT;')
    out.append('    IF v_rowcount = 0 THEN')
    out.append('        RETURN QUERY SELECT NULL::UUID AS "ID";')
    out.append('    ELSE')
    out.append('        RETURN QUERY SELECT p_ID AS "ID";')
    out.append('    END IF;')
    out.append('END;')
    out.append('$$ LANGUAGE plpgsql;')
    return '\n'.join(out)


def convert_procedures(lines, created_views=None, skipped_views=None):
    """Convert all stored procedures to PostgreSQL functions.

    Args:
        lines: All source file lines.
        created_views: Set of view names that were successfully created.
        skipped_views: Set of view names that were skipped.

    Returns:
        tuple: (output_lines, created_proc_names)
    """
    output = []
    output.append('')
    output.append('-- ============================================================================')
    output.append('-- STORED PROCEDURES (converted to PostgreSQL functions)')
    output.append('-- ============================================================================')
    output.append('')

    procedures = extract_procedures(lines)
    print(f"  Found {len(procedures)} procedures")

    counts = {'create': 0, 'update': 0, 'delete': 0, 'skipped': 0, 'error': 0}
    created_names = set()

    for proc_text in procedures:
        try:
            proc_name, params, body = parse_procedure(proc_text)

            if proc_name in SKIP_PROCS:
                output.append(f'-- SKIPPED: {proc_name} (utility proc, needs manual PG rewrite)')
                output.append('')
                counts['skipped'] += 1
                continue

            if proc_name.startswith('spCreate'):
                proc_type = 'create'
            elif proc_name.startswith('spUpdate'):
                proc_type = 'update'
            elif proc_name.startswith('spDelete'):
                proc_type = 'delete'
            else:
                output.append(f'-- SKIPPED: {proc_name} (utility proc, needs manual PG rewrite)')
                output.append('')
                counts['skipped'] += 1
                continue

            table_name = find_table_from_proc(body, proc_name, proc_type)
            if not table_name:
                output.append(f'-- ERROR: Could not find table name in {proc_name}')
                output.append('')
                counts['error'] += 1
                continue

            view_name = find_view_from_proc(body) if proc_type != 'delete' else None

            # If the view referenced by this proc was skipped, set view_name to None
            # so the proc returns a simple TABLE("ID" UUID) instead of SETOF missing_view
            if view_name and skipped_views and view_name in skipped_views:
                view_name = None

            if proc_type == 'create':
                result = convert_create_proc(proc_name, params, body, table_name, view_name)
            elif proc_type == 'update':
                result = convert_update_proc(proc_name, params, body, table_name, view_name)
            else:
                result = convert_delete_proc(proc_name, params, body, table_name)

            output.append(result)
            output.append('')
            counts[proc_type] += 1
            created_names.add(proc_name)

        except Exception as e:
            name_m = re.search(r'CREATE\s+PROCEDURE\s+\S+\.(\w+)', proc_text, re.I)
            fname = name_m.group(1) if name_m else 'unknown'
            output.append(f'-- ERROR converting procedure {fname}: {e}')
            output.append('')
            counts['error'] += 1

    print(f"  Create: {counts['create']}, Update: {counts['update']}, "
          f"Delete: {counts['delete']}, Skipped: {counts['skipped']}, Errors: {counts['error']}")
    return output, created_names


# ============================================================================
# PASS 6: GRANTS
# ============================================================================

def extract_grants(lines):
    """Extract all GRANT statements."""
    grants = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('GRANT '):
            grants.append(stripped)
    return grants


def convert_grants(lines, created_functions=None, created_views=None, skipped_views=None):
    """Convert GRANT statements to PostgreSQL.

    Args:
        lines: All source file lines.
        created_functions: Set of function/procedure names that were successfully created.
        created_views: Set of view names that were successfully created.
        skipped_views: Set of view names that were skipped (sys catalog, etc.).
    """
    output = []
    output.append('')
    output.append('-- ============================================================================')
    output.append('-- GRANTS')
    output.append('-- ============================================================================')
    output.append('')

    grants = extract_grants(lines)
    converted = 0
    skipped = 0

    # Create PG roles first
    roles = set()
    for g in grants:
        m = re.search(r'TO\s+\[(\w+)\]', g)
        if m:
            roles.add(m.group(1))

    # Skip reserved PostgreSQL role names
    pg_reserved_roles = {'public', 'pg_database_owner', 'pg_read_all_data',
                         'pg_write_all_data', 'pg_monitor', 'pg_signal_backend'}
    for role in sorted(roles):
        if role.lower() in pg_reserved_roles:
            output.append(f'-- SKIPPED: role "{role}" is a reserved PostgreSQL role')
            continue
        output.append(f'DO $$ BEGIN CREATE ROLE "{role}"; EXCEPTION WHEN duplicate_object THEN NULL; END $$;')

    output.append('')

    for grant in grants:
        converted_grant = bracket_to_pg(grant)

        # Check if this is an EXECUTE grant
        is_exec_grant = bool(re.search(r'GRANT\s+EXEC', grant, re.I))

        if is_exec_grant:
            # Extract the function/proc name from the grant
            fn_m = re.search(r'ON\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?', grant, re.I)
            fn_name = fn_m.group(1) if fn_m else ''

            # Skip grants for functions that weren't created
            if created_functions is not None and fn_name and fn_name not in created_functions:
                skipped += 1
                continue

            # Convert EXEC/EXECUTE ON to EXECUTE ON FUNCTION
            converted_grant = re.sub(
                r'GRANT\s+EXEC(?:UTE)?\s+ON\s+',
                'GRANT EXECUTE ON FUNCTION ',
                converted_grant, flags=re.I
            )
        else:
            # Check if this is a SELECT grant on a view that was skipped
            view_m = re.search(r'ON\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(vw\w+)\]?', grant, re.I)
            if view_m and skipped_views and view_m.group(1) in skipped_views:
                skipped += 1
                continue

        if not converted_grant.endswith(';'):
            converted_grant += ';'

        output.append(converted_grant)
        converted += 1

    print(f"  Grants: {converted}, Skipped: {skipped}")
    return output


# ============================================================================
# PASS 7: SEED DATA
# ============================================================================

def build_boolean_column_map(output_so_far):
    """Build a map of table -> set of boolean column names from CREATE TABLE statements."""
    text = '\n'.join(output_so_far)
    bool_map = {}
    current_table = None

    for line in text.split('\n'):
        tm = re.match(r'\s*CREATE\s+TABLE\s+__mj\."(\w+)"', line, re.I)
        if tm:
            current_table = tm.group(1)
            bool_map[current_table] = set()
            continue

        if current_table:
            cm = re.match(r'\s*"(\w+)"\s+BOOLEAN\b', line, re.I)
            if cm:
                bool_map[current_table].add(cm.group(1))
            stripped = line.strip()
            if stripped == ');' or stripped == ')':
                current_table = None

    return bool_map


def find_seed_section(lines):
    """Find the line range for the seed data section."""
    nocheck_start = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if (stripped.startswith('ALTER TABLE') and 'NOCHECK CONSTRAINT' in stripped
                and 'WITH CHECK' not in stripped and not line.startswith('    ')):
            nocheck_start = i
            break

    if nocheck_start is None:
        for i, line in enumerate(lines):
            if "PRINT(N'Add rows to" in line:
                nocheck_start = i
                break

    check_end = len(lines) - 1
    for i in range(len(lines) - 1, -1, -1):
        if 'WITH CHECK CHECK CONSTRAINT' in lines[i]:
            check_end = i
            break

    return nocheck_start or 0, check_end


def extract_inserts(lines, start, end):
    """Extract INSERT statements from the seed section."""
    inserts = []
    insert_starts = []
    for i in range(start, end + 1):
        stripped = lines[i].strip()
        if (stripped.startswith('INSERT INTO [${flyway:defaultSchema}]')
                and not lines[i].startswith('    ')
                and not lines[i].startswith('\t')):
            insert_starts.append(i)

    for idx, line_num in enumerate(insert_starts):
        boundary = insert_starts[idx + 1] if idx + 1 < len(insert_starts) else end + 1
        parts = []
        for j in range(line_num, boundary):
            line_stripped = lines[j].strip()
            if not line_stripped:
                continue
            if line_stripped in ('GO', 'GO;'):
                continue
            if line_stripped.startswith('IF @@ERROR'):
                continue
            if line_stripped.startswith('PRINT(') or line_stripped.startswith('PRINT N'):
                continue
            if j > line_num and line_stripped.startswith('INSERT INTO'):
                break
            parts.append(lines[j].rstrip())
        inserts.append('\n'.join(parts))

    return inserts


def split_values(s):
    """Split a VALUES string by commas, respecting single-quoted strings."""
    result = []
    current = []
    in_string = False
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "'" and not in_string:
            in_string = True
            current.append(ch)
        elif ch == "'" and in_string:
            if i + 1 < len(s) and s[i + 1] == "'":
                current.append("''")
                i += 1
            else:
                in_string = False
                current.append(ch)
        elif ch == ',' and not in_string:
            result.append(''.join(current))
            current = []
        else:
            current.append(ch)
        i += 1
    if current:
        result.append(''.join(current))
    return result


def convert_bit_to_boolean(values_str, col_names, bool_columns):
    """Convert BIT 0/1 values to FALSE/TRUE for boolean columns."""
    if not bool_columns:
        return values_str

    bool_indices = {i for i, name in enumerate(col_names) if name in bool_columns}
    if not bool_indices:
        return values_str

    values = split_values(values_str)
    for idx in bool_indices:
        if idx < len(values):
            val = values[idx].strip()
            if val == '0':
                values[idx] = 'FALSE'
            elif val == '1':
                values[idx] = 'TRUE'
    return ', '.join(values)


def extract_columns_and_values(insert_text):
    """Extract table name, columns, values from INSERT."""
    m = re.match(
        r"INSERT\s+INTO\s+\[\$\{flyway:defaultSchema\}\]\.\[(\w+)\]\s*"
        r"\(([^)]+)\)\s*VALUES\s*\(",
        insert_text, re.I | re.DOTALL
    )
    if not m:
        return None, None, None

    table_name = m.group(1)
    col_names = [c.strip().strip('[]') for c in m.group(2).split(',')]

    vals_start = m.end()
    vals_text = insert_text[vals_start:]
    depth = 1
    in_string = False
    i = 0
    end_pos = len(vals_text)
    while i < len(vals_text):
        ch = vals_text[i]
        if ch == "'" and not in_string:
            in_string = True
        elif ch == "'" and in_string:
            if i + 1 < len(vals_text) and vals_text[i + 1] == "'":
                i += 1
            else:
                in_string = False
        elif not in_string:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    end_pos = i
                    break
        i += 1

    return table_name, col_names, vals_text[:end_pos]


def strip_cast_nvarchar(s):
    """Strip CAST(... AS NVARCHAR(MAX)) wrappers."""
    s = re.sub(r'\bCAST\(\s*N?(?=\')', '', s, flags=re.I)
    s = re.sub(r"'\s*AS\s+NVARCHAR\s*\([^)]*\)\s*\)\s*\+\s*N?'", '', s, flags=re.I)
    s = re.sub(r"'\s+AS\s+NVARCHAR\s*\([^)]*\)\s*\)", "'", s, flags=re.I)
    return s


def merge_string_concat(s):
    """Merge T-SQL string concatenation into single strings."""
    s = re.sub(r"'\s*\+\s*N?'", '', s)
    return s


def trim_padded_strings(values_str):
    """Trim trailing whitespace from NCHAR-padded string values."""
    return re.sub(r"(\S)\s+'(?=\s*[,)])", r"\1'", values_str)


def convert_insert(insert_text, bool_map):
    """Convert a single INSERT statement to PostgreSQL."""
    table_name, col_names, values_str = extract_columns_and_values(insert_text)
    if table_name is None:
        return None

    pg_columns = [f'"{c}"' for c in col_names]
    bool_cols = bool_map.get(table_name, set())

    # Apply N-prefix removal carefully
    values_str = re.sub(r"(?<=[(,])\s*N'", " '", values_str)
    if values_str.startswith("N'"):
        values_str = values_str[1:]

    values_str = strip_cast_nvarchar(values_str)
    values_str = merge_string_concat(values_str)
    values_str = trim_padded_strings(values_str)
    values_str = convert_bit_to_boolean(values_str, col_names, bool_cols)

    cols_str = ', '.join(pg_columns)
    return f'INSERT INTO {SCHEMA}."{table_name}" ({cols_str}) VALUES ({values_str});'


def convert_seed_data(lines, output_so_far, check_constraints):
    """Convert all seed data INSERT statements."""
    output = []
    output.append('')
    output.append('-- ============================================================================')
    output.append('-- SEED DATA')
    output.append('-- ============================================================================')
    output.append('')

    bool_map = build_boolean_column_map(output_so_far)
    total_bool_cols = sum(len(v) for v in bool_map.values())
    print(f"  Boolean columns: {total_bool_cols} across {len(bool_map)} tables")

    seed_start, seed_end = find_seed_section(lines)
    print(f"  Seed section: lines {seed_start + 1} to {seed_end + 1}")

    inserts = extract_inserts(lines, seed_start, seed_end)
    print(f"  Found {len(inserts)} INSERT statements")

    # Disable FK triggers
    output.append("SET session_replication_role = 'replica';")
    output.append('')

    # Extract check constraints from output so far
    pg_check_constraints = []
    for line in output_so_far:
        if 'ADD CONSTRAINT' in line and 'CHECK' in line and 'PRIMARY KEY' not in line and 'FOREIGN KEY' not in line:
            # Extract table name and constraint name
            m = re.match(r'ALTER\s+TABLE\s+__mj\."(\w+)"\s+ADD\s+CONSTRAINT\s+"(\w+)"\s+CHECK\s*\((.+)\)\s*;', line, re.I)
            if m:
                pg_check_constraints.append((m.group(1), m.group(2), m.group(3)))

    # Temporarily drop CHECK constraints
    if pg_check_constraints:
        output.append('-- Temporarily drop CHECK constraints for seed data loading')
        for table_name, constraint_name, _ in pg_check_constraints:
            output.append(f'ALTER TABLE {SCHEMA}."{table_name}" DROP CONSTRAINT IF EXISTS "{constraint_name}";')
        output.append('')

    # Convert inserts
    converted_count = 0
    failed = 0
    current_table = None

    for insert_text in inserts:
        result = convert_insert(insert_text, bool_map)
        if result:
            tm = re.match(r'INSERT INTO __mj\."(\w+)"', result)
            if tm:
                tbl = tm.group(1)
                if tbl != current_table:
                    if current_table:
                        output.append('')
                    output.append(f'-- {tbl}')
                    current_table = tbl
            output.append(result)
            converted_count += 1
        else:
            failed += 1

    output.append('')

    # Re-add CHECK constraints
    if pg_check_constraints:
        output.append('-- Re-add CHECK constraints (NOT VALID to skip existing row validation)')
        for table_name, constraint_name, check_expr in pg_check_constraints:
            output.append(f'ALTER TABLE {SCHEMA}."{table_name}" ADD CONSTRAINT "{constraint_name}" CHECK ({check_expr}) NOT VALID;')
        output.append('')

    # Re-enable FK triggers
    output.append("SET session_replication_role = 'origin';")
    output.append('')

    print(f"  Converted: {converted_count}, Failed: {failed}")
    return output


# ============================================================================
# PASS 8: EXTENDED PROPERTIES -> COMMENTS
# ============================================================================

def convert_extended_properties(lines):
    """Convert sp_addextendedproperty calls to COMMENT ON statements.

    T-SQL format (positional args):
    EXEC sp_addextendedproperty N'MS_Description', N'description text',
         'SCHEMA', N'__mj', 'TABLE', N'TableName', 'COLUMN', N'ColName'

    Or for table-level:
    EXEC sp_addextendedproperty N'MS_Description', N'description text',
         'SCHEMA', N'__mj', 'TABLE', N'TableName', NULL, NULL
    """
    output = []
    output.append('')
    output.append('-- ============================================================================')
    output.append('-- COMMENTS (from sp_addextendedproperty)')
    output.append('-- ============================================================================')
    output.append('')

    count = 0
    for line in lines:
        stripped = line.strip()
        if 'sp_addextendedproperty' not in stripped:
            continue

        # Extract positional args:
        # arg1: N'MS_Description'
        # arg2: N'description text' (the value)
        # arg3: 'SCHEMA'
        # arg4: N'__mj'
        # arg5: 'TABLE'
        # arg6: N'TableName'
        # arg7: 'COLUMN' or NULL
        # arg8: N'ColumnName' or NULL
        m = re.search(
            r"sp_addextendedproperty\s+N?'MS_Description'\s*,\s*N?'((?:[^']|'')*?)'\s*,"
            r"\s*'SCHEMA'\s*,\s*N?'\w+'\s*,"
            r"\s*'TABLE'\s*,\s*N?'(\w+)'\s*,"
            r"\s*(?:'COLUMN'|NULL)\s*,\s*(?:N?'(\w+)'|NULL)",
            stripped, re.I
        )
        if m:
            desc = m.group(1).replace("''", "'")
            # Escape single quotes for PG
            desc = desc.replace("'", "''")
            table = m.group(2)
            col = m.group(3)

            if col:
                output.append(f"COMMENT ON COLUMN {SCHEMA}.\"{table}\".\"{col}\" IS '{desc}';")
            else:
                output.append(f"COMMENT ON TABLE {SCHEMA}.\"{table}\" IS '{desc}';")
            count += 1

    print(f"  Comments: {count}")
    return output


# ============================================================================
# PG ROLES SETUP
# ============================================================================

def generate_pg_roles():
    """Generate PostgreSQL role creation statements."""
    roles = [
        'cdp_BI', 'cdp_CodeGen', 'cdp_Developer', 'cdp_Integration', 'cdp_UI',
        'cdp_MJAPI', 'cdp_Admin'
    ]
    output = []
    output.append('-- ============================================================================')
    output.append('-- SCHEMA AND ROLES')
    output.append('-- ============================================================================')
    output.append('')
    output.append(f'CREATE SCHEMA IF NOT EXISTS {SCHEMA};')
    output.append('')

    for role in roles:
        output.append(f'DO $$ BEGIN CREATE ROLE "{role}"; EXCEPTION WHEN duplicate_object THEN NULL; END $$;')

    output.append('')
    output.append(f'GRANT USAGE ON SCHEMA {SCHEMA} TO PUBLIC;')
    output.append('')
    return output


# ============================================================================
# MAIN
# ============================================================================

def main():
    start_time = time.time()
    print('=' * 70)
    print('MemberJunction v5.0 Baseline: T-SQL -> PostgreSQL Converter')
    print('=' * 70)
    print()

    print(f'Reading source: {SOURCE}')
    lines = read_source()
    print(f'  {len(lines)} lines read')
    print()

    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    all_output = []

    # Header
    all_output.append('/*')
    all_output.append('  MemberJunction v5.0.x PostgreSQL Baseline Migration')
    all_output.append('  Auto-converted from T-SQL baseline by convert-baseline-v5-to-postgres.py')
    all_output.append('  Source: migrations/v5/B202602151200__v5.0__Baseline.sql')
    all_output.append('*/')
    all_output.append('')

    # Pass 0: Roles and schema
    print('Pass 0: Schema and roles...')
    all_output.extend(generate_pg_roles())

    # Pass 1: Tables
    print('Pass 1: Tables, constraints, indexes, triggers...')
    table_start, table_end = extract_table_section(lines)
    tables_output, check_constraints = convert_tables(lines, table_start, table_end)
    all_output.extend(tables_output)

    # Pass 2: Foreign keys and CHECK constraints
    print('Pass 2: Foreign keys and CHECK constraints...')
    fk_output, post_check_constraints = convert_foreign_keys(lines)
    all_output.extend(fk_output)
    # Merge check constraints from tables section and post-views section
    all_check_constraints = check_constraints + post_check_constraints

    # Pass 3: Functions (before views since views may reference them)
    print('Pass 3: Functions...')
    fn_output, created_functions = convert_functions(lines)
    all_output.extend(fn_output)

    # Pass 4: Views
    print('Pass 4: Views...')
    view_output, created_views, skipped_views = convert_views(lines)
    all_output.extend(view_output)

    # Pass 5: Procedures
    print('Pass 5: Stored procedures...')
    proc_output, created_procs = convert_procedures(lines, created_views, skipped_views)
    all_output.extend(proc_output)

    # Merge all created callable names for GRANT filtering
    all_created_callables = created_functions | created_procs

    # Pass 6: Grants
    print('Pass 6: Grants...')
    grant_output = convert_grants(lines, all_created_callables, created_views, skipped_views)
    all_output.extend(grant_output)

    # Pass 7: Seed data
    print('Pass 7: Seed data...')
    seed_output = convert_seed_data(lines, all_output, all_check_constraints)
    all_output.extend(seed_output)

    # Pass 8: Extended properties -> Comments
    print('Pass 8: Extended properties -> comments...')
    comment_output = convert_extended_properties(lines)
    all_output.extend(comment_output)

    # Write output
    print()
    print(f'Writing output to: {OUTPUT}')
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(all_output))
        f.write('\n')

    elapsed = time.time() - start_time
    total_lines = len(all_output)
    print(f'  {total_lines} lines written')
    print(f'  Completed in {elapsed:.1f} seconds')
    print()
    print('Done!')


if __name__ == '__main__':
    main()
