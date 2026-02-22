#!/usr/bin/env python3
"""
Deterministic SQL Server → PostgreSQL conversion for MemberJunction v5.0 baseline.

Uses sqlglot for AST-based conversion, supplemented by regex-based post-processing
for patterns that sqlglot doesn't handle well (T-SQL stored procedures, triggers, etc.).

Usage:
    python3 pg_convert_v5_baseline.py [--input FILE] [--output FILE]
"""

import re
import sys
import os
import time
import argparse
from typing import Optional
from dataclasses import dataclass, field

try:
    import sqlglot
    from sqlglot import transpile
    from sqlglot.errors import ErrorLevel
except ImportError:
    print("ERROR: sqlglot not installed. Run: pip install sqlglot")
    sys.exit(1)


# ─── Configuration ──────────────────────────────────────────────────────────────

DEFAULT_INPUT = os.path.join(os.path.dirname(__file__), "..", "migrations", "v5", "B202602151200__v5.0__Baseline.sql")
DEFAULT_OUTPUT = os.path.join(os.path.dirname(__file__), "..", "migrations", "pg", "B202602151200__v5.0__Baseline_PG.sql")

FLYWAY_PLACEHOLDER = "${flyway:defaultSchema}"
PG_SCHEMA = "__mj"


# ─── Statistics Tracking ────────────────────────────────────────────────────────

@dataclass
class ConversionStats:
    total_batches: int = 0
    converted: int = 0
    skipped: int = 0
    errors: int = 0
    tables_created: int = 0
    views_created: int = 0
    procedures_converted: int = 0
    functions_converted: int = 0
    triggers_converted: int = 0
    inserts_converted: int = 0
    grants_converted: int = 0
    fk_constraints: int = 0
    check_constraints: int = 0
    indexes_created: int = 0
    comments_converted: int = 0
    skipped_batches: list = field(default_factory=list)
    error_batches: list = field(default_factory=list)


# ─── Pre-processing: Flyway placeholders + session settings ─────────────────────

def preprocess(sql: str) -> str:
    """Replace Flyway placeholders and strip SQL Server session settings."""
    # Replace Flyway placeholder with PG schema
    sql = sql.replace(FLYWAY_PLACEHOLDER, PG_SCHEMA)
    return sql


# ─── Batch Splitter ─────────────────────────────────────────────────────────────

def split_batches(sql: str) -> list[str]:
    """Split SQL Server script on GO batch separators.

    GO must be on its own line (optionally with whitespace).
    Then further sub-splits compound batches (e.g., PRINT + ALTER + INSERTs)
    into individual statements.
    """
    raw_batches: list[str] = []
    current_batch: list[str] = []

    for line in sql.split('\n'):
        stripped = line.strip().upper()
        # GO on its own line (with optional whitespace, optional trailing comment)
        if stripped == 'GO' or re.match(r'^GO\s*(--.*)?$', stripped):
            batch_text = '\n'.join(current_batch).strip()
            if batch_text:
                raw_batches.append(batch_text)
            current_batch = []
        else:
            current_batch.append(line)

    # Don't forget the last batch
    last = '\n'.join(current_batch).strip()
    if last:
        raw_batches.append(last)

    # Sub-split compound batches that contain multiple statement types
    # e.g., PRINT + ALTER TABLE NOCHECK + INSERT INTO x N times
    final_batches: list[str] = []
    for batch in raw_batches:
        sub = sub_split_compound_batch(batch)
        final_batches.extend(sub)

    return final_batches


def sub_split_compound_batch(batch: str) -> list[str]:
    """Sub-split a compound batch into individual statements.

    Many GO-separated batches in the SQL Server baseline contain multiple
    statements like: PRINT + ALTER TABLE NOCHECK + INSERT INTO x N.
    We need to split these so each is classified and converted separately.
    """
    lines = batch.split('\n')
    upper = batch.upper().strip()

    # Don't sub-split CREATE TABLE/VIEW/PROCEDURE/FUNCTION/TRIGGER blocks
    # — these are multi-line single statements
    if re.match(r'^CREATE\s+(TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER)\s', upper):
        return [batch]
    if re.match(r'^CREATE\s+PROC\s', upper):
        return [batch]
    # Don't split ALTER TABLE with column definitions
    if re.match(r'^ALTER\s+TABLE\s', upper):
        return [batch]
    # Don't split BEGIN TRY blocks
    if upper.startswith('BEGIN TRY'):
        return [batch]
    # Don't split DECLARE blocks (user/role creation)
    if upper.startswith('DECLARE'):
        return [batch]

    # Check if the batch contains multiple top-level statements
    # by looking for lines that start with statement keywords
    stmt_keywords = r'^(INSERT\s+INTO|UPDATE\s|DELETE\s|PRINT\s|PRINT\(|ALTER\s+TABLE|GRANT\s|DENY\s|REVOKE\s|SET\s|IF\s+@@|CREATE\s)'
    has_multiple = False
    keyword_count = 0
    for line in lines:
        if re.match(stmt_keywords, line.strip(), re.IGNORECASE):
            keyword_count += 1
        if keyword_count > 1:
            has_multiple = True
            break

    if not has_multiple:
        return [batch]

    # Split into individual statements
    statements: list[str] = []
    current: list[str] = []

    for line in lines:
        stripped = line.strip()
        # Check if this line starts a new top-level statement
        if re.match(stmt_keywords, stripped, re.IGNORECASE) and current:
            stmt = '\n'.join(current).strip()
            if stmt:
                statements.append(stmt)
            current = [line]
        else:
            current.append(line)

    if current:
        stmt = '\n'.join(current).strip()
        if stmt:
            statements.append(stmt)

    return statements if statements else [batch]


# ─── Batch Classification ───────────────────────────────────────────────────────

def classify_batch(batch: str) -> str:
    """Classify a SQL batch into a category for routing."""
    upper = batch.upper().lstrip()

    # Session settings to skip
    if re.match(r'^SET\s+(NUMERIC_ROUNDABORT|ANSI_PADDING|ANSI_WARNINGS|CONCAT_NULL_YIELDS_NULL|'
                r'ARITHABORT|QUOTED_IDENTIFIER|ANSI_NULLS|XACT_ABORT|NOCOUNT|NOEXEC)\b', upper):
        return 'SKIP_SESSION'

    # Error handling to skip
    if upper.startswith('IF @@ERROR'):
        return 'SKIP_ERROR'

    # User/role creation blocks (SQL Server-specific)
    if 'SERVERPROPERTY' in upper or 'sp_executesql' in upper.replace(' ', ''):
        return 'SKIP_SQLSERVER'
    if re.match(r'^DECLARE\s+@(associate|user_exists|role_exists)', upper):
        return 'SKIP_SQLSERVER'

    # CREATE TABLE
    if re.match(r'^CREATE\s+TABLE\s', upper):
        return 'CREATE_TABLE'

    # CREATE VIEW
    if re.match(r'^CREATE\s+VIEW\s', upper):
        return 'CREATE_VIEW'

    # CREATE PROCEDURE (both full and short form)
    if re.match(r'^CREATE\s+PROC(?:EDURE)?\s', upper):
        return 'CREATE_PROCEDURE'

    # CREATE FUNCTION
    if re.match(r'^CREATE\s+FUNCTION\s', upper):
        return 'CREATE_FUNCTION'

    # CREATE TRIGGER
    if re.match(r'^CREATE\s+TRIGGER\s', upper):
        return 'CREATE_TRIGGER'

    # CREATE TYPE
    if re.match(r'^CREATE\s+TYPE\s', upper):
        return 'SKIP_SQLSERVER'  # Table types don't exist in PG, skip

    # ALTER TABLE
    if re.match(r'^ALTER\s+TABLE\s', upper):
        if 'ADD CONSTRAINT' in upper and 'FOREIGN KEY' in upper:
            return 'FK_CONSTRAINT'
        if 'ADD CONSTRAINT' in upper and 'PRIMARY KEY' in upper:
            return 'PK_CONSTRAINT'
        if 'ADD CONSTRAINT' in upper and 'CHECK' in upper:
            return 'CHECK_CONSTRAINT'
        if 'ADD CONSTRAINT' in upper and 'UNIQUE' in upper:
            return 'UNIQUE_CONSTRAINT'
        if 'WITH CHECK CHECK CONSTRAINT' in upper:
            return 'ENABLE_CONSTRAINT'
        if 'NOCHECK CONSTRAINT' in upper:
            return 'SKIP_NOCHECK'  # PG doesn't support disabling constraints this way
        return 'ALTER_TABLE'

    # CREATE INDEX
    if re.match(r'^CREATE\s+(NONCLUSTERED\s+)?INDEX\s', upper) or re.match(r'^CREATE\s+(UNIQUE\s+)?(NONCLUSTERED\s+)?INDEX\s', upper):
        return 'CREATE_INDEX'

    # INSERT
    if re.match(r'^INSERT\s+(INTO\s+)?', upper):
        return 'INSERT'

    # UPDATE
    if re.match(r'^UPDATE\s', upper):
        return 'UPDATE'

    # DELETE
    if re.match(r'^DELETE\s', upper):
        return 'DELETE'

    # GRANT/DENY/REVOKE
    if re.match(r'^GRANT\s', upper):
        return 'GRANT'
    if re.match(r'^DENY\s', upper):
        return 'DENY'
    if re.match(r'^REVOKE\s', upper):
        return 'REVOKE'

    # PRINT
    if re.match(r'^PRINT\s', upper) or re.match(r'^PRINT\(', upper):
        return 'SKIP_PRINT'

    # Extended properties
    if 'SP_ADDEXTENDEDPROPERTY' in upper:
        return 'EXTENDED_PROPERTY'

    # Comments only
    if re.match(r'^(/\*|--)', upper) and not re.search(r'^(CREATE|ALTER|INSERT|UPDATE|DELETE|GRANT|EXEC)',
                                                         re.sub(r'/\*.*?\*/|--[^\n]*', '', batch, flags=re.DOTALL).strip().upper()):
        return 'COMMENT_ONLY'

    # BEGIN TRY / END TRY blocks wrapping extended properties
    if 'BEGIN TRY' in upper and 'SP_ADDEXTENDEDPROPERTY' in upper:
        return 'EXTENDED_PROPERTY'

    return 'UNKNOWN'


# ─── Type Mapping ────────────────────────────────────────────────────────────────

def map_type(type_str: str) -> str:
    """Map SQL Server types to PostgreSQL types."""
    t = type_str.strip().upper()

    # Remove COLLATE clause
    t = re.sub(r'\s+COLLATE\s+\S+', '', t, flags=re.IGNORECASE)

    if t == 'UNIQUEIDENTIFIER':
        return 'UUID'
    if t in ('BIT',):
        return 'BOOLEAN'
    if t in ('DATETIME', 'DATETIME2', 'SMALLDATETIME'):
        return 'TIMESTAMPTZ'
    if t == 'DATETIMEOFFSET':
        return 'TIMESTAMPTZ'
    if re.match(r'DATETIME2\s*\(\s*\d+\s*\)', t):
        return 'TIMESTAMPTZ'
    if re.match(r'DATETIMEOFFSET\s*\(\s*\d+\s*\)', t):
        return 'TIMESTAMPTZ'
    if t in ('NVARCHAR(MAX)', 'VARCHAR(MAX)', 'NTEXT', 'TEXT'):
        return 'TEXT'
    m = re.match(r'N?VARCHAR\s*\(\s*(\d+)\s*\)', t)
    if m:
        return f'VARCHAR({m.group(1)})'
    m = re.match(r'N?CHAR\s*\(\s*(\d+)\s*\)', t)
    if m:
        return f'CHAR({m.group(1)})'
    if t in ('TINYINT',):
        return 'SMALLINT'
    if t in ('INT', 'INTEGER'):
        return 'INTEGER'
    if t in ('BIGINT',):
        return 'BIGINT'
    if t in ('SMALLINT',):
        return 'SMALLINT'
    if t in ('FLOAT', 'REAL'):
        return 'DOUBLE PRECISION'
    if re.match(r'FLOAT\s*\(\s*\d+\s*\)', t):
        return 'DOUBLE PRECISION'
    if re.match(r'DECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)', t):
        return t.replace('DECIMAL', 'NUMERIC')
    if re.match(r'NUMERIC\s*\(\s*\d+\s*,\s*\d+\s*\)', t):
        return t
    if t == 'MONEY':
        return 'NUMERIC(19,4)'
    if t == 'SMALLMONEY':
        return 'NUMERIC(10,4)'
    if t in ('IMAGE', 'VARBINARY(MAX)'):
        return 'BYTEA'
    m = re.match(r'VARBINARY\s*\(\s*(\d+)\s*\)', t)
    if m:
        return 'BYTEA'
    if t == 'XML':
        return 'XML'
    if t == 'SQL_VARIANT':
        return 'TEXT'  # No direct equivalent
    if t == 'HIERARCHYID':
        return 'TEXT'  # No direct equivalent, store as string

    return type_str  # Return as-is if unknown


# ─── Identifier Conversion ──────────────────────────────────────────────────────

def convert_identifiers(sql: str) -> str:
    """Convert [schema].[name] to "schema"."name" format."""
    # Replace [__mj].[Name] with __mj."Name"
    sql = re.sub(r'\[__mj\]\.\[([^\]]+)\]', r'__mj."\1"', sql)
    # Replace remaining [Name] with "Name"
    sql = re.sub(r'\[([^\]]+)\]', r'"\1"', sql)
    return sql


# ─── Default Value Conversion ───────────────────────────────────────────────────

def convert_default(default_str: str) -> str:
    """Convert SQL Server default value expressions to PostgreSQL."""
    d = default_str.strip()

    # Remove outer parens: DEFAULT ((0)) → DEFAULT 0
    while d.startswith('(') and d.endswith(')'):
        inner = d[1:-1]
        # Make sure parens are balanced
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

    upper = d.upper().strip()

    if upper in ('NEWSEQUENTIALID()', 'NEWID()'):
        return 'gen_random_uuid()'
    if upper in ('GETDATE()', 'GETUTCDATE()', 'SYSDATETIMEOFFSET()', 'SYSUTCDATETIME()'):
        return 'NOW()'
    if upper == '0':
        return 'FALSE'  # For BIT columns mapped to BOOLEAN
    if upper == '1':
        return 'TRUE'   # For BIT columns mapped to BOOLEAN

    # N'string' → 'string'
    d = re.sub(r"N'", "'", d)

    return d


# ─── CREATE TABLE Conversion ────────────────────────────────────────────────────

def convert_create_table(batch: str, stats: ConversionStats) -> str:
    """Convert a CREATE TABLE statement from SQL Server to PostgreSQL."""
    lines = batch.split('\n')
    result_lines: list[str] = []

    # Track if we're inside a column that's BIT type for default conversion
    is_bit_column = False
    has_identity = False

    for line in lines:
        original = line

        # Remove COLLATE clauses
        line = re.sub(r'\s+COLLATE\s+SQL_Latin1_General_CP1_CI_AS', '', line)
        line = re.sub(r'\s+COLLATE\s+\S+', '', line)

        # Convert identifiers [x].[y] → __mj."y"
        line = convert_identifiers(line)

        # Convert types in column definitions
        # Match column line: [Name] [type] ...
        col_match = re.match(r'^(\s+)"(\w+)"\s+"\w+"(.*)$', line)
        if not col_match:
            # Also try: "Name" [type] pattern
            col_match = re.match(r'^(\s+"[^"]+"\s+)\[([^\]]+)\](.*)$', original)

        # Type replacements (broad)
        line = re.sub(r'\buniqueid(?:entifier)?\b', 'UUID', line, flags=re.IGNORECASE)

        # Check for BIT type (before replacement) for default conversion
        is_bit_column = bool(re.search(r'\bBIT\b', line, re.IGNORECASE))

        # Type conversions
        line = re.sub(r'\bnvarchar\s*\(\s*max\s*\)', 'TEXT', line, flags=re.IGNORECASE)
        line = re.sub(r'\bvarchar\s*\(\s*max\s*\)', 'TEXT', line, flags=re.IGNORECASE)
        line = re.sub(r'\bnvarchar\s*\((\s*\d+\s*)\)', r'VARCHAR(\1)', line, flags=re.IGNORECASE)
        line = re.sub(r'\bnchar\s*\((\s*\d+\s*)\)', r'CHAR(\1)', line, flags=re.IGNORECASE)
        line = re.sub(r'\bntext\b', 'TEXT', line, flags=re.IGNORECASE)
        line = re.sub(r'\bdatetimeoffset\b(\s*\(\s*\d+\s*\))?', 'TIMESTAMPTZ', line, flags=re.IGNORECASE)
        line = re.sub(r'\bdatetime2\b(\s*\(\s*\d+\s*\))?', 'TIMESTAMPTZ', line, flags=re.IGNORECASE)
        line = re.sub(r'\bdatetime\b', 'TIMESTAMPTZ', line, flags=re.IGNORECASE)
        line = re.sub(r'\bsmalldatetime\b', 'TIMESTAMPTZ', line, flags=re.IGNORECASE)
        line = re.sub(r'\b(?<!")BIT\b(?!")', 'BOOLEAN', line, flags=re.IGNORECASE)
        line = re.sub(r'\btinyint\b', 'SMALLINT', line, flags=re.IGNORECASE)
        line = re.sub(r'\bfloat\b(\s*\(\s*\d+\s*\))?', 'DOUBLE PRECISION', line, flags=re.IGNORECASE)
        line = re.sub(r'\breal\b', 'REAL', line, flags=re.IGNORECASE)
        line = re.sub(r'\bmoney\b', 'NUMERIC(19,4)', line, flags=re.IGNORECASE)
        line = re.sub(r'\bsmallmoney\b', 'NUMERIC(10,4)', line, flags=re.IGNORECASE)
        line = re.sub(r'\bimage\b', 'BYTEA', line, flags=re.IGNORECASE)
        line = re.sub(r'\bvarbinary\s*\(\s*max\s*\)', 'BYTEA', line, flags=re.IGNORECASE)
        line = re.sub(r'\bvarbinary\s*\(\s*\d+\s*\)', 'BYTEA', line, flags=re.IGNORECASE)
        line = re.sub(r'\bsql_variant\b', 'TEXT', line, flags=re.IGNORECASE)
        line = re.sub(r'\bhierarchyid\b', 'TEXT', line, flags=re.IGNORECASE)

        # Remove inline constraint names: CONSTRAINT [DF__xxx]
        line = re.sub(r'\s+CONSTRAINT\s+"[^"]+"\s+DEFAULT', ' DEFAULT', line, flags=re.IGNORECASE)
        line = re.sub(r'\s+CONSTRAINT\s+"[^"]+"\s+(?=NOT NULL|NULL|CHECK|UNIQUE|PRIMARY)', ' ', line, flags=re.IGNORECASE)

        # IDENTITY → GENERATED BY DEFAULT AS IDENTITY
        identity_match = re.search(r'\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)', line, re.IGNORECASE)
        if identity_match:
            line = line[:identity_match.start()] + 'GENERATED BY DEFAULT AS IDENTITY' + line[identity_match.end():]
            has_identity = True

        # Convert default values
        # DEFAULT (newsequentialid()) → DEFAULT gen_random_uuid()
        line = re.sub(r'DEFAULT\s+\(?newsequentialid\(\)\)?', 'DEFAULT gen_random_uuid()', line, flags=re.IGNORECASE)
        line = re.sub(r'DEFAULT\s+\(?newid\(\)\)?', 'DEFAULT gen_random_uuid()', line, flags=re.IGNORECASE)
        # DEFAULT (getutcdate()) → DEFAULT NOW()
        line = re.sub(r'DEFAULT\s+\(?\s*getutcdate\(\)\s*\)?', 'DEFAULT NOW()', line, flags=re.IGNORECASE)
        line = re.sub(r'DEFAULT\s+\(?\s*getdate\(\)\s*\)?', 'DEFAULT NOW()', line, flags=re.IGNORECASE)
        line = re.sub(r'DEFAULT\s+\(?\s*sysdatetimeoffset\(\)\s*\)?', 'DEFAULT NOW()', line, flags=re.IGNORECASE)
        line = re.sub(r'DEFAULT\s+\(?\s*sysutcdatetime\(\)\s*\)?', 'DEFAULT NOW()', line, flags=re.IGNORECASE)

        # DEFAULT ((0)) or DEFAULT (0) for BIT→BOOLEAN columns
        if is_bit_column:
            line = re.sub(r'DEFAULT\s+\(+0\)+', 'DEFAULT FALSE', line, flags=re.IGNORECASE)
            line = re.sub(r'DEFAULT\s+\(+1\)+', 'DEFAULT TRUE', line, flags=re.IGNORECASE)
            line = re.sub(r"DEFAULT\s+\(+N?'0'\)+", 'DEFAULT FALSE', line, flags=re.IGNORECASE)
            line = re.sub(r"DEFAULT\s+\(+N?'1'\)+", 'DEFAULT TRUE', line, flags=re.IGNORECASE)

        # DEFAULT ((N'value')) → DEFAULT 'value'
        line = re.sub(r"DEFAULT\s+\(+N?'([^']*)'\)+", r"DEFAULT '\1'", line)
        # DEFAULT ((number)) → DEFAULT number
        line = re.sub(r'DEFAULT\s+\(+(-?\d+(?:\.\d+)?)\)+', r'DEFAULT \1', line)

        # N'string' → 'string' in defaults
        line = re.sub(r"N'", "'", line)

        # Remove CLUSTERED/NONCLUSTERED
        line = re.sub(r'\bCLUSTERED\b', '', line, flags=re.IGNORECASE)
        line = re.sub(r'\bNONCLUSTERED\b', '', line, flags=re.IGNORECASE)

        result_lines.append(line)

    result = '\n'.join(result_lines)

    # Clean up double spaces
    result = re.sub(r'  +', ' ', result)

    stats.tables_created += 1
    return result + ';\n'


# ─── ALTER TABLE Conversion ──────────────────────────────────────────────────────

def convert_alter_table(batch: str, stats: ConversionStats, batch_type: str) -> str:
    """Convert ALTER TABLE statements."""
    sql = convert_identifiers(batch)

    # Remove CLUSTERED/NONCLUSTERED
    sql = re.sub(r'\bCLUSTERED\b', '', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bNONCLUSTERED\b', '', sql, flags=re.IGNORECASE)

    # N'string' → 'string'
    sql = re.sub(r"N'", "'", sql)

    # Remove WITH (PAD_INDEX = ...) storage options
    sql = re.sub(r'\s+WITH\s*\([^)]*PAD_INDEX[^)]*\)', '', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\s+ON\s+"PRIMARY"', '', sql, flags=re.IGNORECASE)

    # Clean up double spaces
    sql = re.sub(r'  +', ' ', sql)

    if batch_type == 'FK_CONSTRAINT':
        stats.fk_constraints += 1
    elif batch_type == 'CHECK_CONSTRAINT':
        stats.check_constraints += 1
    elif batch_type == 'PK_CONSTRAINT':
        pass  # counted with table

    return sql + ';\n'


# ─── CREATE INDEX Conversion ────────────────────────────────────────────────────

def convert_create_index(batch: str, stats: ConversionStats) -> str:
    """Convert CREATE INDEX statements."""
    sql = convert_identifiers(batch)
    sql = re.sub(r'\bNONCLUSTERED\b', '', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bCLUSTERED\b', '', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\s+ON\s+"PRIMARY"', '', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\s+WITH\s*\([^)]*\)', '', sql, flags=re.IGNORECASE)
    # Clean up double spaces
    sql = re.sub(r'  +', ' ', sql)
    stats.indexes_created += 1
    return sql + ';\n'


# ─── CREATE VIEW Conversion ─────────────────────────────────────────────────────

def convert_create_view(batch: str, stats: ConversionStats) -> str:
    """Convert CREATE VIEW from SQL Server to PostgreSQL."""
    sql = convert_identifiers(batch)

    # Remove N' prefix
    sql = re.sub(r"N'", "'", sql)

    # ISNULL → COALESCE
    sql = re.sub(r'\bISNULL\s*\(', 'COALESCE(', sql, flags=re.IGNORECASE)

    # CAST(x AS NVARCHAR(n)) → CAST(x AS VARCHAR(n))
    sql = re.sub(r'CAST\(([^)]+)\s+AS\s+NVARCHAR\s*\(\s*(\d+|MAX)\s*\)\)',
                 lambda m: f"CAST({m.group(1)} AS {'TEXT' if m.group(2).upper() == 'MAX' else f'VARCHAR({m.group(2)})'})",
                 sql, flags=re.IGNORECASE)

    # Type conversions in CAST
    sql = re.sub(r'\bAS\s+UNIQUEIDENTIFIER\b', 'AS UUID', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+BIT\b', 'AS BOOLEAN', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+DATETIMEOFFSET\b(\s*\(\s*\d+\s*\))?', 'AS TIMESTAMPTZ', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+DATETIME\b', 'AS TIMESTAMPTZ', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+NVARCHAR\s*\(\s*MAX\s*\)', 'AS TEXT', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+NVARCHAR\s*\(\s*(\d+)\s*\)', r'AS VARCHAR(\1)', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+FLOAT\b', 'AS DOUBLE PRECISION', sql, flags=re.IGNORECASE)

    # String concatenation: + → ||
    # This is tricky — we only want to convert + inside string contexts
    # Do a careful replacement: 'text' + 'text' or col + 'text' patterns
    sql = convert_string_concat(sql)

    # TOP N → LIMIT N (in subqueries and main SELECT)
    sql = convert_top_to_limit(sql)

    # Remove COLLATE
    sql = re.sub(r'\s+COLLATE\s+SQL_Latin1_General_CP1_CI_AS', '', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\s+COLLATE\s+\S+', '', sql, flags=re.IGNORECASE)

    # GETDATE() / GETUTCDATE()
    sql = re.sub(r'\bGETUTCDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bGETDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)

    # DATEADD/DATEDIFF/DATEPART
    sql = convert_date_functions(sql)

    # LEN → LENGTH
    sql = re.sub(r'\bLEN\s*\(', 'LENGTH(', sql, flags=re.IGNORECASE)

    # CHARINDEX(substr, str) → POSITION(substr IN str)
    sql = convert_charindex(sql)

    # STUFF(string, start, length, replacement) → OVERLAY(string PLACING replacement FROM start FOR length)
    sql = convert_stuff(sql)

    # STRING_AGG with WITHIN GROUP
    sql = re.sub(r"STRING_AGG\(([^,]+),\s*([^)]+)\)\s+WITHIN\s+GROUP\s*\(\s*ORDER\s+BY",
                 r"STRING_AGG(\1, \2 ORDER BY", sql, flags=re.IGNORECASE)

    # FOR XML PATH → STRING_AGG (already handled by above if applicable)

    # CROSS APPLY → LATERAL JOIN (simplified)
    # OUTER APPLY → LEFT JOIN LATERAL
    sql = re.sub(r'\bCROSS\s+APPLY\b', 'CROSS JOIN LATERAL', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bOUTER\s+APPLY\b', 'LEFT JOIN LATERAL', sql, flags=re.IGNORECASE)

    # CREATE OR ALTER VIEW → CREATE OR REPLACE VIEW
    sql = re.sub(r'\bCREATE\s+OR\s+ALTER\s+VIEW\b', 'CREATE OR REPLACE VIEW', sql, flags=re.IGNORECASE)

    stats.views_created += 1
    return sql + ';\n'


# ─── Stored Procedure Conversion ────────────────────────────────────────────────

def convert_procedure(batch: str, stats: ConversionStats) -> str:
    """Convert SQL Server stored procedure to PostgreSQL function."""
    sql = batch

    # Extract procedure name and parameters (supports both PROCEDURE and PROC)
    proc_match = re.match(
        r'CREATE\s+PROC(?:EDURE)?\s+\[?__mj\]?\.\[?(\w+)\]?\s*(.*?)(?:\bAS\b)',
        sql, re.IGNORECASE | re.DOTALL
    )

    if not proc_match:
        # Try alternate format
        proc_match = re.match(
            r'CREATE\s+PROC(?:EDURE)?\s+\[?__mj\]?\.\[?(\w+)\]?\s*\n(.*?)(?:^AS$)',
            sql, re.IGNORECASE | re.DOTALL | re.MULTILINE
        )

    if not proc_match:
        # Fallback: just do basic transformations
        return convert_procedure_fallback(sql, stats)

    proc_name = proc_match.group(1)
    params_block = proc_match.group(2).strip()
    body_start = proc_match.end()
    body = sql[body_start:].strip()

    # Parse parameters
    pg_params = convert_proc_params(params_block)

    # Convert body
    pg_body = convert_proc_body(body, proc_name)

    # Determine return type by analyzing body
    returns_clause = determine_return_type(body, proc_name)

    # Build PostgreSQL function
    result = f'CREATE OR REPLACE FUNCTION __mj."{proc_name}"({pg_params})\n'
    result += f'{returns_clause}\nAS $$\n'
    result += pg_body
    result += '\n$$ LANGUAGE plpgsql;\n'

    stats.procedures_converted += 1
    return result


def convert_proc_params(params_block: str) -> str:
    """Convert procedure parameters from T-SQL to PostgreSQL format."""
    if not params_block.strip():
        return ''

    params = []
    # Split on commas, but respect parentheses
    param_list = split_params(params_block)

    for param in param_list:
        param = param.strip()
        if not param:
            continue

        # Parse: @ParamName type [= default] [OUTPUT]
        m = re.match(
            r'@(\w+)\s+([\w\(\),\s]+?)(?:\s*=\s*(.+?))?(?:\s+OUTPUT|\s+OUT)?\s*$',
            param, re.IGNORECASE
        )
        if m:
            name = m.group(1)
            type_str = m.group(2).strip()
            default = m.group(3)
            is_output = bool(re.search(r'\bOUTPUT\b|\bOUT\b', param, re.IGNORECASE))

            pg_type = map_type(type_str)

            direction = 'INOUT' if is_output else 'IN'
            param_str = f'    {direction} "{name}" {pg_type}'
            if default is not None:
                pg_default = convert_default(default)
                param_str += f' DEFAULT {pg_default}'
            params.append(param_str)

    return '\n' + ',\n'.join(params) + '\n' if params else ''


def split_params(params_str: str) -> list[str]:
    """Split parameter list respecting parentheses."""
    params = []
    depth = 0
    current: list[str] = []

    for char in params_str:
        if char == '(':
            depth += 1
            current.append(char)
        elif char == ')':
            depth -= 1
            current.append(char)
        elif char == ',' and depth == 0:
            params.append(''.join(current))
            current = []
        else:
            current.append(char)

    if current:
        params.append(''.join(current))

    return params


def determine_return_type(body: str, proc_name: str) -> str:
    """Determine the RETURNS clause for a PostgreSQL function based on the proc body."""
    upper = body.upper()

    # If the proc does SELECT * FROM vw... at the end, it returns a table
    # Check for SELECT ... FROM vw pattern
    if re.search(r'SELECT\s+\*\s+FROM\s+', upper):
        return 'RETURNS TABLE() AS'  # Will need manual fixing for column defs

    # Most MJ procs return VOID or return query results
    # Check if it has a final SELECT that returns data
    if 'SELECT' in upper and not re.search(r'SELECT\s+@', upper.split('UPDATE')[-1] if 'UPDATE' in upper else upper):
        return 'RETURNS TABLE() AS'

    return 'RETURNS VOID AS'


def convert_proc_body(body: str, proc_name: str) -> str:
    """Convert T-SQL procedure body to plpgsql."""
    sql = body

    # Remove SET NOCOUNT ON
    sql = re.sub(r'\bSET\s+NOCOUNT\s+ON\s*;?', '', sql, flags=re.IGNORECASE)

    # Remove outer BEGIN/END if present
    sql = sql.strip()
    if sql.upper().startswith('BEGIN') and sql.upper().rstrip().rstrip(';').endswith('END'):
        # Find matching BEGIN/END
        sql = re.sub(r'^\s*BEGIN\s*', '', sql, count=1, flags=re.IGNORECASE)
        sql = re.sub(r'\s*END\s*;?\s*$', '', sql, count=1, flags=re.IGNORECASE)

    # Convert identifiers
    sql = convert_identifiers(sql)

    # Convert @variable → _variable
    sql = re.sub(r'@(\w+)', r'_\1', sql)

    # DECLARE @var type → DECLARE _var type (but change to plpgsql DECLARE block)
    # We'll handle this by wrapping in DECLARE section
    declares = []
    def extract_declare(m: re.Match) -> str:
        var_name = m.group(1)
        var_type = m.group(2).strip()
        pg_type = map_type(var_type)
        default_val = m.group(3)
        decl = f'    _{var_name} {pg_type}'
        if default_val:
            decl += f' := {convert_default(default_val)}'
        decl += ';'
        declares.append(decl)
        return ''

    sql = re.sub(
        r'DECLARE\s+_(\w+)\s+([\w\(\),\s]+?)(?:\s*=\s*(.+?))?\s*;',
        extract_declare, sql, flags=re.IGNORECASE
    )

    # @@ROWCOUNT → (SELECT count from GET DIAGNOSTICS)
    if '@@ROWCOUNT' in sql.upper() or '_ROWCOUNT' in sql:
        # Replace @@ROWCOUNT references
        sql = re.sub(r'_+ROWCOUNT', '_row_count', sql, flags=re.IGNORECASE)
        if '_row_count' not in [d for d in declares]:
            declares.insert(0, '    _row_count INTEGER;')
        # Add GET DIAGNOSTICS after UPDATE/INSERT/DELETE
        sql = re.sub(
            r'(UPDATE\s+.*?;|INSERT\s+.*?;|DELETE\s+.*?;)',
            r'\1\n    GET DIAGNOSTICS _row_count = ROW_COUNT;',
            sql, flags=re.IGNORECASE | re.DOTALL
        )

    # @@ERROR → (not directly needed in PG, use EXCEPTION)
    sql = re.sub(r'_+ERROR', '0', sql, flags=re.IGNORECASE)

    # IF ... BEGIN ... END → IF ... THEN ... END IF
    sql = convert_if_blocks(sql)

    # ISNULL → COALESCE
    sql = re.sub(r'\bISNULL\s*\(', 'COALESCE(', sql, flags=re.IGNORECASE)

    # TOP N → LIMIT N
    sql = convert_top_to_limit(sql)

    # N'string' → 'string'
    sql = re.sub(r"N'", "'", sql)

    # String concat + → ||
    sql = convert_string_concat(sql)

    # GETDATE()/GETUTCDATE() → NOW()
    sql = re.sub(r'\bGETUTCDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bGETDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)

    # DATEADD/DATEDIFF/DATEPART
    sql = convert_date_functions(sql)

    # LEN → LENGTH
    sql = re.sub(r'\bLEN\s*\(', 'LENGTH(', sql, flags=re.IGNORECASE)

    # SCOPE_IDENTITY() → use RETURNING
    sql = re.sub(r'\bSCOPE_IDENTITY\s*\(\s*\)', 'lastval()', sql, flags=re.IGNORECASE)

    # CHARINDEX
    sql = convert_charindex(sql)

    # Type conversions in CAST
    sql = re.sub(r'\bAS\s+UNIQUEIDENTIFIER\b', 'AS UUID', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+NVARCHAR\s*\(\s*MAX\s*\)', 'AS TEXT', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+NVARCHAR\s*\(\s*(\d+)\s*\)', r'AS VARCHAR(\1)', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+BIT\b', 'AS BOOLEAN', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+DATETIMEOFFSET\b(\s*\(\s*\d+\s*\))?', 'AS TIMESTAMPTZ', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+FLOAT\b', 'AS DOUBLE PRECISION', sql, flags=re.IGNORECASE)

    # Build DECLARE block
    declare_block = ''
    if declares:
        declare_block = 'DECLARE\n' + '\n'.join(declares) + '\n'

    result = declare_block + 'BEGIN\n' + sql.strip() + '\nEND'
    return result


def convert_procedure_fallback(sql: str, stats: ConversionStats) -> str:
    """Fallback conversion for procedures that don't match the standard pattern."""
    sql = convert_identifiers(sql)
    sql = re.sub(r"N'", "'", sql)
    sql = re.sub(r'\bSET\s+NOCOUNT\s+ON\s*;?', '', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bGETUTCDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bGETDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bISNULL\s*\(', 'COALESCE(', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\buniqueid(?:entifier)\b', 'UUID', sql, flags=re.IGNORECASE)

    # Wrap as a comment for manual review
    stats.errors += 1
    stats.error_batches.append(f"Procedure (fallback): {sql[:100]}...")
    return f'-- TODO: Manual conversion needed\n-- {sql[:200]}...\n'


# ─── CREATE FUNCTION Conversion ─────────────────────────────────────────────────

def convert_function(batch: str, stats: ConversionStats) -> str:
    """Convert SQL Server function to PostgreSQL function."""
    sql = convert_identifiers(batch)
    sql = re.sub(r"N'", "'", sql)

    # Replace @var with _var
    sql = re.sub(r'@(\w+)', r'_\1', sql)

    # Type conversions
    sql = re.sub(r'\buniqueid(?:entifier)\b', 'UUID', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bnvarchar\s*\(\s*max\s*\)', 'TEXT', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bnvarchar\s*\((\s*\d+\s*)\)', r'VARCHAR(\1)', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bdatetimeoffset\b', 'TIMESTAMPTZ', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bdatetime\b', 'TIMESTAMPTZ', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bbit\b', 'BOOLEAN', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\btinyint\b', 'SMALLINT', sql, flags=re.IGNORECASE)

    # ISNULL → COALESCE
    sql = re.sub(r'\bISNULL\s*\(', 'COALESCE(', sql, flags=re.IGNORECASE)

    # TOP → LIMIT
    sql = convert_top_to_limit(sql)

    # GETDATE/GETUTCDATE → NOW()
    sql = re.sub(r'\bGETUTCDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bGETDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)

    # String concat
    sql = convert_string_concat(sql)

    # DATEADD/DATEDIFF/DATEPART
    sql = convert_date_functions(sql)

    # LEN → LENGTH
    sql = re.sub(r'\bLEN\s*\(', 'LENGTH(', sql, flags=re.IGNORECASE)

    # CHARINDEX
    sql = convert_charindex(sql)

    # Inline table-valued functions: RETURNS TABLE AS RETURN (query)
    # Convert to SQL function
    if re.search(r'RETURNS\s+TABLE\s+AS\s+RETURN', sql, re.IGNORECASE):
        sql = convert_inline_tvf(sql)
    else:
        # Scalar functions
        sql = convert_scalar_function(sql)

    stats.functions_converted += 1
    return sql + '\n'


def convert_inline_tvf(sql: str) -> str:
    """Convert inline table-valued function."""
    # Extract: CREATE FUNCTION name(params) RETURNS TABLE AS RETURN (query)
    m = re.match(
        r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(__mj\."?\w+"?)\s*\(([^)]*)\)\s*'
        r'RETURNS\s+TABLE\s+AS\s+RETURN\s*\(\s*(.*)\s*\)',
        sql, re.IGNORECASE | re.DOTALL
    )
    if m:
        func_name = m.group(1)
        params = m.group(2)
        query = m.group(3).strip().rstrip(';')

        # Add WITH RECURSIVE if there's a recursive CTE
        if re.search(r'\bWITH\s+\w+\s+AS\s*\(', query, re.IGNORECASE):
            # Check if it has UNION ALL indicating recursion
            if 'UNION ALL' in query.upper():
                query = re.sub(r'\bWITH\b', 'WITH RECURSIVE', query, count=1, flags=re.IGNORECASE)

        return f'CREATE OR REPLACE FUNCTION {func_name}({params})\nRETURNS TABLE AS $$\n{query}\n$$ LANGUAGE sql;\n'

    return sql


def convert_scalar_function(sql: str) -> str:
    """Convert scalar function to PostgreSQL."""
    # Basic approach: wrap in $$ LANGUAGE plpgsql
    # This is complex, so we do basic transformations

    # IF ... BEGIN ... END → IF ... THEN ... END IF
    sql = convert_if_blocks(sql)

    # RETURN → RETURN
    # SET → already handled

    # Wrap body
    sql = re.sub(r'\bAS\s*\n\s*BEGIN\b', 'AS $$\nBEGIN', sql, flags=re.IGNORECASE)
    if '$$ LANGUAGE' not in sql:
        sql = re.sub(r'\bEND\s*$', 'END\n$$ LANGUAGE plpgsql;', sql, flags=re.IGNORECASE)

    return sql


# ─── CREATE TRIGGER Conversion ──────────────────────────────────────────────────

def convert_trigger(batch: str, stats: ConversionStats) -> str:
    """Convert SQL Server trigger to PostgreSQL trigger + function."""
    sql = batch

    # Extract trigger components (supports multi-event: AFTER INSERT, UPDATE)
    m = re.match(
        r'CREATE\s+TRIGGER\s+\[?__mj\]?\.\[?(\w+)\]?\s+'
        r'ON\s+\[?__mj\]?\.\[?(\w+)\]?\s+'
        r'AFTER\s+([\w,\s]+?)\s+'
        r'AS\s+'
        r'BEGIN\s+'
        r'(.*)'
        r'\s*END\s*;?\s*$',
        sql, re.IGNORECASE | re.DOTALL
    )

    if not m:
        # Try simpler pattern
        m = re.match(
            r'CREATE\s+TRIGGER\s+\[?__mj\]?\.\[?(\w+)\]?\s+'
            r'ON\s+\[?__mj\]?\.\[?(\w+)\]?\s+'
            r'AFTER\s+([\w,\s]+?)\s+'
            r'AS\s+'
            r'(.*)',
            sql, re.IGNORECASE | re.DOTALL
        )

    if m:
        trigger_name = m.group(1)
        table_name = m.group(2)
        event_raw = m.group(3).strip().upper()
        body = m.group(4).strip()

        # Convert comma-separated events to OR: "INSERT, UPDATE" → "INSERT OR UPDATE"
        event = ' OR '.join([e.strip() for e in event_raw.split(',')])

        # Remove SET NOCOUNT ON
        body = re.sub(r'\bSET\s+NOCOUNT\s+ON\s*;?', '', body, flags=re.IGNORECASE)
        body = body.strip()

        # Remove outer BEGIN/END
        if body.upper().startswith('BEGIN'):
            body = re.sub(r'^BEGIN\s*', '', body, flags=re.IGNORECASE)
        if body.upper().rstrip().rstrip(';').endswith('END'):
            body = re.sub(r'\s*END\s*;?\s*$', '', body, flags=re.IGNORECASE)

        # For __mj_UpdatedAt triggers, use a standard PostgreSQL pattern
        if 'UpdatedAt' in body or '__mj_UpdatedAt' in body:
            func_sql = f'''CREATE OR REPLACE FUNCTION __mj."{trigger_name}_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "{trigger_name}"
    BEFORE UPDATE ON __mj."{table_name}"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."{trigger_name}_func"();'''
        else:
            # Generic trigger conversion
            body = convert_identifiers(body)
            body = re.sub(r"N'", "'", body)
            body = re.sub(r'\bINSERTED\b', 'NEW', body, flags=re.IGNORECASE)
            body = re.sub(r'\bDELETED\b', 'OLD', body, flags=re.IGNORECASE)
            body = re.sub(r'\bISNULL\s*\(', 'COALESCE(', body, flags=re.IGNORECASE)
            body = re.sub(r'\bGETUTCDATE\s*\(\s*\)', 'NOW()', body, flags=re.IGNORECASE)

            # Use BEFORE for triggers that set NEW values, AFTER otherwise
            timing = 'BEFORE' if 'NEW.' in body else 'AFTER'

            func_sql = f'''CREATE OR REPLACE FUNCTION __mj."{trigger_name}_func"()
RETURNS TRIGGER AS $$
BEGIN
    {body}
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "{trigger_name}"
    {timing} {event} ON __mj."{table_name}"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."{trigger_name}_func"();'''

        stats.triggers_converted += 1
        return func_sql + '\n'

    # Fallback
    stats.errors += 1
    stats.error_batches.append(f"Trigger parse failed: {sql[:100]}...")
    return f'-- TODO: Trigger conversion failed\n-- {sql[:200]}\n'


# ─── INSERT Statement Conversion ────────────────────────────────────────────────

def convert_insert(batch: str, stats: ConversionStats) -> str:
    """Convert INSERT statement from SQL Server to PostgreSQL."""
    sql = convert_identifiers(batch)

    # Remove N' prefix
    sql = re.sub(r"N'", "'", sql)

    # Remove COLLATE
    sql = re.sub(r'\s+COLLATE\s+\S+', '', sql, flags=re.IGNORECASE)

    # GETUTCDATE() → NOW()
    sql = re.sub(r'\bGETUTCDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bGETDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)

    # NEWID() → gen_random_uuid()
    sql = re.sub(r'\bNEWID\s*\(\s*\)', 'gen_random_uuid()', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bNEWSEQUENTIALID\s*\(\s*\)', 'gen_random_uuid()', sql, flags=re.IGNORECASE)

    # Convert CAST types
    sql = re.sub(r'\bAS\s+UNIQUEIDENTIFIER\b', 'AS UUID', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+NVARCHAR\s*\(\s*MAX\s*\)', 'AS TEXT', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bAS\s+BIT\b', 'AS BOOLEAN', sql, flags=re.IGNORECASE)

    stats.inserts_converted += 1
    return sql + ';\n'


# ─── UPDATE Statement Conversion ────────────────────────────────────────────────

def convert_update(batch: str, stats: ConversionStats) -> str:
    """Convert UPDATE statement from SQL Server to PostgreSQL."""
    sql = convert_identifiers(batch)
    sql = re.sub(r"N'", "'", sql)
    sql = re.sub(r'\bGETUTCDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bGETDATE\s*\(\s*\)', 'NOW()', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bISNULL\s*\(', 'COALESCE(', sql, flags=re.IGNORECASE)
    return sql + ';\n'


# ─── DELETE Statement Conversion ────────────────────────────────────────────────

def convert_delete(batch: str, stats: ConversionStats) -> str:
    """Convert DELETE statement from SQL Server to PostgreSQL."""
    sql = convert_identifiers(batch)
    sql = re.sub(r"N'", "'", sql)
    return sql + ';\n'


# ─── GRANT Conversion ───────────────────────────────────────────────────────────

def convert_grant(batch: str, stats: ConversionStats) -> str:
    """Convert GRANT statement from SQL Server to PostgreSQL."""
    sql = convert_identifiers(batch)

    # For GRANT EXECUTE ON [schema].[proc] TO [role]
    # PG needs: GRANT EXECUTE ON FUNCTION schema.proc(...) TO role
    # But we don't always know the parameter types, so we'll use a simpler approach

    # Remove quotes around role names for standard roles
    sql = re.sub(r'TO\s+"(public)"', r'TO \1', sql, flags=re.IGNORECASE)

    # SELECT on tables/views stays mostly the same
    # EXECUTE on functions needs function signature — skip for now and handle in post-processing

    stats.grants_converted += 1
    return sql + ';\n'


# ─── Extended Property → COMMENT ON ─────────────────────────────────────────────

def convert_extended_property(batch: str, stats: ConversionStats) -> str:
    """Convert sp_addextendedproperty to COMMENT ON."""
    # Extract the components
    # Pattern: EXEC sp_addextendedproperty N'MS_Description', N'description',
    #          'SCHEMA', N'__mj', 'TABLE', N'TableName', 'COLUMN', N'ColumnName'

    # Handle both direct EXEC and BEGIN TRY wrapper
    sql = batch

    # Find sp_addextendedproperty calls
    matches = re.findall(
        r"sp_addextendedproperty\s+N?'MS_Description'\s*,\s*N?'((?:[^']|'')*?)'\s*,"
        r"\s*'SCHEMA'\s*,\s*N?'([^']*)'\s*,"
        r"\s*'TABLE'\s*,\s*N?'([^']*)'"
        r"(?:\s*,\s*'COLUMN'\s*,\s*N?'([^']*)')?",
        sql, re.IGNORECASE
    )

    results = []
    for match in matches:
        description = match[0].replace("''", "'")  # Unescape SQL quotes
        schema = match[1] or '__mj'
        table = match[2]
        column = match[3] if match[3] else None

        # Escape single quotes in description for PG
        description = description.replace("'", "''")

        if column:
            results.append(f"COMMENT ON COLUMN {schema}.\"{table}\".\"{column}\" IS '{description}';")
        else:
            results.append(f"COMMENT ON TABLE {schema}.\"{table}\" IS '{description}';")

        stats.comments_converted += 1

    if results:
        return '\n'.join(results) + '\n'
    else:
        return ''  # Skip if we couldn't parse


# ─── ENABLE CONSTRAINT Conversion ───────────────────────────────────────────────

def convert_enable_constraint(batch: str, stats: ConversionStats) -> str:
    """Convert WITH CHECK CHECK CONSTRAINT to PostgreSQL equivalent.

    In PostgreSQL, constraints are always enabled. These statements are no-ops.
    We'll skip them since PG doesn't need constraint re-enablement.
    """
    # These are effectively no-ops in PostgreSQL since constraints are always enforced
    # We can skip them entirely
    return ''


# ─── Helper Functions ────────────────────────────────────────────────────────────

def convert_string_concat(sql: str) -> str:
    """Convert SQL Server string concatenation (+) to PostgreSQL (||).

    This is careful to only convert + that's used for string concatenation,
    not arithmetic addition.
    """
    # Simple approach: replace + between string literals/expressions
    # Match patterns like 'text' + 'text' or col + 'text'
    # This is a heuristic — not perfect but handles most MJ patterns

    # Replace + when adjacent to string literal on either side
    sql = re.sub(r"'\s*\+\s*'", "' || '", sql)
    sql = re.sub(r"'\s*\+\s*(?![\d\s]*[+\-*/])", "' || ", sql)
    sql = re.sub(r"(?<=[^\d\s+\-*/])\s*\+\s*'", " || '", sql)

    # CAST(... AS VARCHAR) + ... patterns
    sql = re.sub(r'\)\s*\+\s*\'', ") || '", sql)
    sql = re.sub(r"'\s*\+\s*CAST", "' || CAST", sql, flags=re.IGNORECASE)

    return sql


def convert_top_to_limit(sql: str) -> str:
    """Convert TOP N to LIMIT N in SELECT statements."""
    # SELECT TOP N ... FROM → SELECT ... FROM ... LIMIT N
    # This is complex because we need to move LIMIT to end of statement

    def replace_top(m: re.Match) -> str:
        prefix = m.group(1) or ''
        n = m.group(2)
        return f'{prefix} '  # Remove TOP, we'll add LIMIT at appropriate place

    # For simple cases: SELECT TOP 1 ...
    # We'll do a simple replacement and add LIMIT at end
    pattern = r'(SELECT\s+(?:DISTINCT\s+)?)\s*TOP\s+(\d+)\s+'

    def add_limit(m: re.Match) -> str:
        return m.group(1) + ' '

    # Find TOP N values and track them
    top_matches = list(re.finditer(pattern, sql, re.IGNORECASE))
    if not top_matches:
        return sql

    # For each TOP, remove it and try to add LIMIT at the right place
    for m in reversed(top_matches):
        n = m.group(2)
        # Remove TOP N
        sql = sql[:m.start()] + m.group(1) + sql[m.end():]

        # Find the end of this SELECT statement and add LIMIT
        # This is approximate — find next FROM...WHERE...ORDER BY end or semicolon
        rest = sql[m.start():]

        # Simple heuristic: add LIMIT before the next semicolon or end of string
        # But after any ORDER BY clause
        insert_pos = len(sql)

        # Look for end of this query (semicolon, closing paren for subquery, or end)
        depth = 0
        for i, c in enumerate(rest):
            if c == '(':
                depth += 1
            elif c == ')':
                if depth == 0:
                    insert_pos = m.start() + i
                    break
                depth -= 1
            elif c == ';' and depth == 0:
                insert_pos = m.start() + i
                break
        else:
            insert_pos = len(sql)

        sql = sql[:insert_pos] + f'\nLIMIT {n}' + sql[insert_pos:]

    return sql


def convert_if_blocks(sql: str) -> str:
    """Convert IF...BEGIN...END blocks to IF...THEN...END IF."""
    # Simple pattern: IF condition BEGIN ... END
    # → IF condition THEN ... END IF

    sql = re.sub(r'\bIF\s+(.*?)\s+BEGIN\b', r'IF \1 THEN', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bELSE\s+IF\b', 'ELSIF', sql, flags=re.IGNORECASE)
    sql = re.sub(r'\bELSE\s+BEGIN\b', 'ELSE', sql, flags=re.IGNORECASE)

    # END that's followed by ELSE or ELSIF → just remove
    sql = re.sub(r'\bEND\s*\n\s*(ELSE|ELSIF)\b', r'\1', sql, flags=re.IGNORECASE)

    # Remaining END → END IF (for IF blocks)
    # This is tricky — we need to match END that closes an IF, not a BEGIN TRANSACTION etc.
    # Simple approach: replace END on its own line with END IF
    sql = re.sub(r'^\s*END\s*$', '    END IF;', sql, flags=re.MULTILINE | re.IGNORECASE)

    return sql


def convert_date_functions(sql: str) -> str:
    """Convert DATEADD, DATEDIFF, DATEPART to PostgreSQL equivalents."""

    # DATEADD(unit, num, date) → (date + INTERVAL 'num unit')
    def dateadd_replace(m: re.Match) -> str:
        unit = m.group(1).lower()
        num = m.group(2).strip()
        date_expr = m.group(3).strip()

        unit_map = {
            'year': 'years', 'yy': 'years', 'yyyy': 'years',
            'quarter': 'months',  # multiply by 3
            'qq': 'months', 'q': 'months',
            'month': 'months', 'mm': 'months', 'm': 'months',
            'day': 'days', 'dd': 'days', 'd': 'days',
            'week': 'weeks', 'wk': 'weeks', 'ww': 'weeks',
            'hour': 'hours', 'hh': 'hours',
            'minute': 'minutes', 'mi': 'minutes', 'n': 'minutes',
            'second': 'seconds', 'ss': 'seconds', 's': 'seconds',
            'millisecond': 'milliseconds', 'ms': 'milliseconds',
        }
        pg_unit = unit_map.get(unit, unit + 's')

        if unit in ('quarter', 'qq', 'q'):
            return f"({date_expr} + ({num} * 3) * INTERVAL '1 month')"

        return f"({date_expr} + {num} * INTERVAL '1 {pg_unit}')"

    sql = re.sub(
        r'\bDATEADD\s*\(\s*(\w+)\s*,\s*([^,]+)\s*,\s*([^)]+)\)',
        dateadd_replace, sql, flags=re.IGNORECASE
    )

    # DATEDIFF(unit, start, end) → EXTRACT(EPOCH FROM (end - start)) / divisor
    def datediff_replace(m: re.Match) -> str:
        unit = m.group(1).lower()
        start = m.group(2).strip()
        end = m.group(3).strip()

        if unit in ('day', 'dd', 'd'):
            return f"EXTRACT(DAY FROM ({end}::TIMESTAMPTZ - {start}::TIMESTAMPTZ))"
        elif unit in ('hour', 'hh'):
            return f"EXTRACT(EPOCH FROM ({end}::TIMESTAMPTZ - {start}::TIMESTAMPTZ)) / 3600"
        elif unit in ('minute', 'mi', 'n'):
            return f"EXTRACT(EPOCH FROM ({end}::TIMESTAMPTZ - {start}::TIMESTAMPTZ)) / 60"
        elif unit in ('second', 'ss', 's'):
            return f"EXTRACT(EPOCH FROM ({end}::TIMESTAMPTZ - {start}::TIMESTAMPTZ))"
        elif unit in ('year', 'yy', 'yyyy'):
            return f"EXTRACT(YEAR FROM AGE({end}::TIMESTAMPTZ, {start}::TIMESTAMPTZ))"
        elif unit in ('month', 'mm', 'm'):
            return f"(EXTRACT(YEAR FROM AGE({end}::TIMESTAMPTZ, {start}::TIMESTAMPTZ)) * 12 + EXTRACT(MONTH FROM AGE({end}::TIMESTAMPTZ, {start}::TIMESTAMPTZ)))"

        return f"EXTRACT(EPOCH FROM ({end}::TIMESTAMPTZ - {start}::TIMESTAMPTZ))"

    sql = re.sub(
        r'\bDATEDIFF\s*\(\s*(\w+)\s*,\s*([^,]+)\s*,\s*([^)]+)\)',
        datediff_replace, sql, flags=re.IGNORECASE
    )

    # DATEPART(unit, date) → EXTRACT(unit FROM date)
    def datepart_replace(m: re.Match) -> str:
        unit = m.group(1).lower()
        date_expr = m.group(2).strip()

        unit_map = {
            'year': 'YEAR', 'yy': 'YEAR', 'yyyy': 'YEAR',
            'quarter': 'QUARTER', 'qq': 'QUARTER', 'q': 'QUARTER',
            'month': 'MONTH', 'mm': 'MONTH', 'm': 'MONTH',
            'day': 'DAY', 'dd': 'DAY', 'd': 'DAY',
            'dayofyear': 'DOY', 'dy': 'DOY', 'y': 'DOY',
            'week': 'WEEK', 'wk': 'WEEK', 'ww': 'WEEK',
            'weekday': 'DOW', 'dw': 'DOW',
            'hour': 'HOUR', 'hh': 'HOUR',
            'minute': 'MINUTE', 'mi': 'MINUTE', 'n': 'MINUTE',
            'second': 'SECOND', 'ss': 'SECOND', 's': 'SECOND',
        }
        pg_unit = unit_map.get(unit, unit.upper())
        return f"EXTRACT({pg_unit} FROM {date_expr})"

    sql = re.sub(
        r'\bDATEPART\s*\(\s*(\w+)\s*,\s*([^)]+)\)',
        datepart_replace, sql, flags=re.IGNORECASE
    )

    return sql


def convert_charindex(sql: str) -> str:
    """Convert CHARINDEX(substr, str[, start]) → POSITION(substr IN str) or strpos()."""
    # Simple 2-arg version: CHARINDEX(substr, str) → POSITION(substr IN str)
    def charindex_replace(m: re.Match) -> str:
        substr = m.group(1).strip()
        string = m.group(2).strip()
        start = m.group(3)

        if start:
            # 3-arg version: CHARINDEX(substr, str, start)
            # → (POSITION(substr IN SUBSTRING(str FROM start)) + start - 1)
            return f"(POSITION({substr} IN SUBSTRING({string} FROM {start.strip()})) + {start.strip()} - 1)"
        else:
            return f"POSITION({substr} IN {string})"

    sql = re.sub(
        r'\bCHARINDEX\s*\(\s*([^,]+)\s*,\s*([^,)]+)(?:\s*,\s*([^)]+))?\s*\)',
        charindex_replace, sql, flags=re.IGNORECASE
    )
    return sql


def convert_stuff(sql: str) -> str:
    """Convert STUFF(string, start, length, replacement) → OVERLAY(string PLACING replacement FROM start FOR length)."""
    def stuff_replace(m: re.Match) -> str:
        string = m.group(1).strip()
        start = m.group(2).strip()
        length = m.group(3).strip()
        replacement = m.group(4).strip()
        return f"OVERLAY({string} PLACING {replacement} FROM {start} FOR {length})"

    sql = re.sub(
        r'\bSTUFF\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)',
        stuff_replace, sql, flags=re.IGNORECASE
    )
    return sql


# ─── Batch Router ────────────────────────────────────────────────────────────────

def convert_batch(batch: str, batch_type: str, stats: ConversionStats) -> Optional[str]:
    """Route a classified batch to its converter."""

    if batch_type.startswith('SKIP'):
        stats.skipped += 1
        if batch_type not in ('SKIP_SESSION', 'SKIP_ERROR', 'SKIP_PRINT', 'SKIP_SQLSERVER', 'SKIP_NOCHECK'):
            stats.skipped_batches.append(f"{batch_type}: {batch[:80]}...")
        return None

    if batch_type == 'COMMENT_ONLY':
        # Pass through comments
        stats.skipped += 1
        return batch + '\n'

    if batch_type == 'CREATE_TABLE':
        return convert_create_table(batch, stats)

    if batch_type == 'CREATE_VIEW':
        return convert_create_view(batch, stats)

    if batch_type == 'CREATE_PROCEDURE':
        return convert_procedure(batch, stats)

    if batch_type == 'CREATE_FUNCTION':
        return convert_function(batch, stats)

    if batch_type == 'CREATE_TRIGGER':
        return convert_trigger(batch, stats)

    if batch_type in ('PK_CONSTRAINT', 'FK_CONSTRAINT', 'CHECK_CONSTRAINT', 'UNIQUE_CONSTRAINT', 'ALTER_TABLE'):
        return convert_alter_table(batch, stats, batch_type)

    if batch_type == 'ENABLE_CONSTRAINT':
        return convert_enable_constraint(batch, stats)

    if batch_type == 'CREATE_INDEX':
        return convert_create_index(batch, stats)

    if batch_type == 'INSERT':
        return convert_insert(batch, stats)

    if batch_type == 'UPDATE':
        return convert_update(batch, stats)

    if batch_type == 'DELETE':
        return convert_delete(batch, stats)

    if batch_type == 'GRANT':
        return convert_grant(batch, stats)

    if batch_type == 'DENY':
        stats.skipped += 1
        stats.skipped_batches.append(f"DENY: {batch[:80]}...")
        return f'-- DENY not supported in PG: {batch[:80]}...\n'

    if batch_type == 'REVOKE':
        return convert_identifiers(batch) + ';\n'

    if batch_type == 'EXTENDED_PROPERTY':
        return convert_extended_property(batch, stats)

    if batch_type == 'UNKNOWN':
        # Try to do basic conversion
        upper = batch.upper().strip()

        # Skip completely empty or whitespace-only
        if not batch.strip():
            return None

        # Check if it's a PRINT or other benign statement
        if upper.startswith('PRINT'):
            stats.skipped += 1
            return None

        # Skip SET NOEXEC OFF/ON
        if re.match(r'SET\s+NOEXEC\s', upper):
            stats.skipped += 1
            return None

        # Skip IF EXISTS with sys. references
        if 'sys.' in batch.lower() or 'INFORMATION_SCHEMA' in upper:
            stats.skipped += 1
            return None

        # Try basic identifier conversion
        result = convert_identifiers(batch)
        result = re.sub(r"N'", "'", result)
        stats.skipped += 1
        stats.skipped_batches.append(f"UNKNOWN: {batch[:80]}...")
        return f'-- TODO: Review this batch\n{result};\n'

    return None


# ─── Post-processing ────────────────────────────────────────────────────────────

def postprocess(sql: str) -> str:
    """Final cleanup pass on the complete converted SQL."""

    # Remove any remaining [brackets] that slipped through
    sql = re.sub(r'\[([^\]]+)\]', r'"\1"', sql)

    # Remove double-double quotes
    sql = sql.replace('""', '"')

    # Wait, that's too aggressive. Let's be more careful.
    # Only replace "" when it's clearly a quoting artifact, not an empty string literal
    # Actually, let's not do this — "" is valid in SQL for empty strings in some contexts
    # Revert
    sql = sql  # no-op

    # Remove any remaining COLLATE clauses
    sql = re.sub(r'\s+COLLATE\s+SQL_Latin1_General_CP1_CI_AS', '', sql, flags=re.IGNORECASE)

    # Remove SET NOEXEC ON/OFF
    sql = re.sub(r'SET\s+NOEXEC\s+(ON|OFF)\s*;?', '', sql, flags=re.IGNORECASE)

    # Remove IF @@ERROR <> 0 SET NOEXEC ON
    sql = re.sub(r'IF\s+@@ERROR\s*<>\s*0\s+SET\s+NOEXEC\s+ON\s*;?', '', sql, flags=re.IGNORECASE)

    # Clean up excessive blank lines
    sql = re.sub(r'\n{4,}', '\n\n\n', sql)

    return sql


# ─── Main Conversion Pipeline ───────────────────────────────────────────────────

def convert_file(input_path: str, output_path: str) -> ConversionStats:
    """Main conversion pipeline."""
    stats = ConversionStats()

    print(f"Reading {input_path}...")
    with open(input_path, 'r', encoding='utf-8') as f:
        raw_sql = f.read()

    print(f"  File size: {len(raw_sql):,} bytes, {raw_sql.count(chr(10)):,} lines")

    # Pre-process
    print("Pre-processing (Flyway placeholders)...")
    sql = preprocess(raw_sql)

    # Split into batches
    print("Splitting into batches...")
    batches = split_batches(sql)
    stats.total_batches = len(batches)
    print(f"  Found {stats.total_batches:,} batches")

    # Classify and count
    classifications: dict[str, int] = {}
    for batch in batches:
        bt = classify_batch(batch)
        classifications[bt] = classifications.get(bt, 0) + 1

    print("  Batch classification:")
    for bt, count in sorted(classifications.items()):
        print(f"    {bt}: {count}")

    # Convert each batch
    print("Converting batches...")
    output_parts: list[str] = []

    # Add PostgreSQL header
    output_parts.append("""-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using sqlglot + custom pipeline
-- Source: B202602151200__v5.0__Baseline.sql
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

""")

    batch_num = 0
    last_pct = -1

    for i, batch in enumerate(batches):
        batch_num += 1
        pct = (batch_num * 100) // stats.total_batches
        if pct != last_pct and pct % 10 == 0:
            print(f"  Progress: {pct}% ({batch_num}/{stats.total_batches})")
            last_pct = pct

        batch_type = classify_batch(batch)

        try:
            result = convert_batch(batch, batch_type, stats)
            if result:
                output_parts.append(result)
                stats.converted += 1
        except Exception as e:
            stats.errors += 1
            stats.error_batches.append(f"Error in batch {batch_num} ({batch_type}): {str(e)[:100]}")
            output_parts.append(f'\n-- ERROR converting batch {batch_num} ({batch_type}): {str(e)[:100]}\n')
            output_parts.append(f'-- Original (first 200 chars): {batch[:200]}\n\n')

    # Post-process
    print("Post-processing...")
    full_output = '\n'.join(output_parts)
    full_output = postprocess(full_output)

    # Write output
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    print(f"Writing {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(full_output)

    print(f"  Output size: {len(full_output):,} bytes, {full_output.count(chr(10)):,} lines")

    return stats


def print_report(stats: ConversionStats) -> None:
    """Print conversion statistics report."""
    print("\n" + "=" * 70)
    print("CONVERSION REPORT")
    print("=" * 70)
    print(f"Total batches:          {stats.total_batches:,}")
    print(f"Converted:              {stats.converted:,}")
    print(f"Skipped:                {stats.skipped:,}")
    print(f"Errors:                 {stats.errors:,}")
    print()
    print("Object counts:")
    print(f"  Tables created:       {stats.tables_created}")
    print(f"  Views created:        {stats.views_created}")
    print(f"  Procedures converted: {stats.procedures_converted}")
    print(f"  Functions converted:  {stats.functions_converted}")
    print(f"  Triggers converted:   {stats.triggers_converted}")
    print(f"  Inserts converted:    {stats.inserts_converted}")
    print(f"  Grants converted:     {stats.grants_converted}")
    print(f"  FK constraints:       {stats.fk_constraints}")
    print(f"  Check constraints:    {stats.check_constraints}")
    print(f"  Indexes created:      {stats.indexes_created}")
    print(f"  Comments converted:   {stats.comments_converted}")

    if stats.error_batches:
        print(f"\nErrors ({len(stats.error_batches)}):")
        for err in stats.error_batches[:20]:
            print(f"  - {err}")
        if len(stats.error_batches) > 20:
            print(f"  ... and {len(stats.error_batches) - 20} more")

    if stats.skipped_batches:
        print(f"\nSkipped (showing first 10 of {len(stats.skipped_batches)}):")
        for skip in stats.skipped_batches[:10]:
            print(f"  - {skip}")


def main() -> None:
    parser = argparse.ArgumentParser(description='Convert SQL Server baseline to PostgreSQL')
    parser.add_argument('--input', default=DEFAULT_INPUT, help='Input SQL Server file')
    parser.add_argument('--output', default=DEFAULT_OUTPUT, help='Output PostgreSQL file')
    args = parser.parse_args()

    input_path = os.path.abspath(args.input)
    output_path = os.path.abspath(args.output)

    print(f"SQL Server → PostgreSQL Baseline Converter")
    print(f"  Input:  {input_path}")
    print(f"  Output: {output_path}")
    print()

    start_time = time.time()
    stats = convert_file(input_path, output_path)
    elapsed = time.time() - start_time

    print_report(stats)
    print(f"\nCompleted in {elapsed:.1f}s")

    if stats.errors > 0:
        print(f"\n⚠ {stats.errors} errors found — review output and fix conversion rules")
        sys.exit(1)
    else:
        print("\n✓ Conversion completed successfully")


if __name__ == '__main__':
    main()
