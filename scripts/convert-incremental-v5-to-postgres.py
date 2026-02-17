#!/usr/bin/env python3
"""
Convert incremental v5 T-SQL migration files to PostgreSQL.

Handles three migration files:
1. Entity Name Normalization & ClassName Prefix Fix
2. Add AllowMultipleSubtypes to Entity
3. Metadata Sync

Approach: Read entire file as text, use regex-based block replacements
and section-level processing rather than line-by-line state machine.
"""

import re
import os
import sys

# ──────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────
SCHEMA = '__mj'
MIGRATIONS_DIR = '/workspace/MJ/migrations/v5'
OUTPUT_DIR = '/workspace/MJ/migrations-postgres/v5'

MIGRATIONS = [
    {
        'source': 'V202602131500__v5.0.x__Entity_Name_Normalization_And_ClassName_Prefix_Fix.sql',
        'converter': 'convert_migration_1',
    },
    {
        'source': 'V202602141421__v5.0.x__Add_AllowMultipleSubtypes_to_Entity.sql',
        'converter': 'convert_migration_2',
    },
    {
        'source': 'V202602161825__v5.0.x__Metadata_Sync.sql',
        'converter': 'convert_migration_3',
    },
]

# All known boolean columns across MJ entities (for converting BIT 0/1 to false/true)
BOOLEAN_COLUMNS = {
    # EntityField boolean columns
    'AllowsNull', 'AutoIncrement', 'AllowUpdateAPI', 'IsVirtual',
    'IsNameField', 'IncludeInUserSearchAPI', 'IncludeRelatedEntityNameFieldInBaseView',
    'DefaultInView', 'IsPrimaryKey', 'IsUnique',
    # Auto* boolean columns used in WHERE clauses
    'AutoUpdateIsNameField', 'AutoUpdateDefaultInView', 'AutoUpdateIncludeInUserSearchAPI',
    'AutoUpdateCategory', 'AutoUpdateRelatedEntityNameFieldMap',
    # Entity boolean columns
    'AllowAllRowsAPI', 'AllowCreateAPI', 'AllowUpdateAPI', 'AllowDeleteAPI',
    'CustomResolverAPI', 'AllowUserSearchAPI', 'TrackRecordChanges',
    'AuditRecordAccess', 'AuditViewRuns', 'IncludeInAPI', 'AllowRecordMerge',
    'CascadeDeletes', 'UserFormGenerated', 'spCreateGenerated', 'spUpdateGenerated',
    'spDeleteGenerated', 'VirtualEntity', 'AllowMultipleSubtypes',
    # Other commonly used boolean columns
    'UsesTemplate', 'AuditQueryRuns', 'CacheEnabled',
}

# ──────────────────────────────────────────────────────────────────────
# Reusable helper functions
# ──────────────────────────────────────────────────────────────────────

def bracket_to_pg(s):
    """Convert [${flyway:defaultSchema}].[identifier] to __mj."identifier".
    Also handles unbracketed ${flyway:defaultSchema}.TableName -> __mj."TableName".
    """
    s = s.replace('[${flyway:defaultSchema}]', SCHEMA)
    s = s.replace('${flyway:defaultSchema}', SCHEMA)
    # Convert [identifier] to "identifier"
    s = re.sub(r'\[([^\]]+)\]', r'"\1"', s)
    # Handle __mj.UnquotedTableName -> __mj."UnquotedTableName"
    # But don't double-quote __mj."AlreadyQuoted"
    s = re.sub(r'__mj\.([A-Za-z_]\w*)(?=[^"\w]|$)', r'__mj."\1"', s)
    return s


def remove_n_prefix(s):
    """Remove N' prefix from Unicode string literals at value boundaries."""
    if s.startswith("N'"):
        s = s[1:]
    s = re.sub(r"(\()\s*N'", r"\1'", s)
    s = re.sub(r"(,)\s*N'", r"\1 '", s)
    s = re.sub(r"(=\s*)N'", r"\1'", s)
    # After PRINT removal, handle standalone N' at word boundary
    s = re.sub(r"\bN'", "'", s)
    return s


def strip_cast_nvarchar(s):
    """Strip CAST(... AS NVARCHAR(MAX)) wrappers and merge concatenated parts."""
    s = re.sub(r'\bCAST\(\s*N?(?=\')', '', s, flags=re.I)
    s = re.sub(r"'\s*AS\s+NVARCHAR\s*\([^)]*\)\s*\)\s*\+\s*N?'", '', s, flags=re.I)
    s = re.sub(r"'\s+AS\s+NVARCHAR\s*\([^)]*\)\s*\)", "'", s, flags=re.I)
    return s


def merge_string_concat(s):
    """Merge T-SQL string concatenation '...' + '...' into '......'."""
    s = re.sub(r"'\s*\+\s*N?'", '', s)
    return s


def split_values_careful(s):
    """Split a VALUES string by commas, respecting single-quoted strings and parens."""
    result = []
    current = []
    in_string = False
    depth = 0
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
        elif ch == '(' and not in_string:
            depth += 1
            current.append(ch)
        elif ch == ')' and not in_string:
            depth -= 1
            current.append(ch)
        elif ch == ',' and not in_string and depth == 0:
            result.append(''.join(current))
            current = []
        else:
            current.append(ch)
        i += 1
    if current:
        result.append(''.join(current))
    return result


def convert_grant_line(line):
    """Convert GRANT statement, splitting multi-role grants into separate statements.
    For EXECUTE grants, add FUNCTION keyword for PostgreSQL.
    For SELECT grants, add appropriate object type."""
    converted = bracket_to_pg(line.strip().rstrip(';'))
    m = re.match(r'(GRANT\s+(\w+)\s+ON\s+(\S+))\s+TO\s+(.+)', converted, re.I)
    if not m:
        return converted + ';'
    prefix = m.group(1)
    grant_type = m.group(2).upper()
    obj_ref = m.group(3)
    roles = [r.strip().strip('"') for r in m.group(4).split(',')]

    # For EXECUTE grants on stored procedures (functions in PG), add FUNCTION keyword
    if grant_type == 'EXECUTE':
        prefix = re.sub(r'GRANT\s+EXECUTE\s+ON\s+', 'GRANT EXECUTE ON FUNCTION ', prefix, flags=re.I)

    stmts = [f'{prefix} TO "{role}";' for role in roles]
    return '\n'.join(stmts)


def convert_extended_property_block(block):
    """Convert sp_addextendedproperty / sp_updateextendedproperty block to COMMENT ON."""
    joined = ' '.join(block.strip().split())

    value_match = re.search(r"@value\s*=\s*N?'((?:[^']|'')*)'", joined)
    if not value_match:
        return None

    value = value_match.group(1).replace("''", "'")

    level1_type_match = re.search(r"@level1type\s*=\s*N?'(\w+)'", joined)
    level1_name_match = re.search(r"@level1name\s*=\s*N?'(\w+)'", joined)
    level2_name_match = re.search(r"@level2name\s*=\s*N?'(\w+)'", joined)

    if not level1_type_match or not level1_name_match:
        return None

    obj_type = level1_type_match.group(1).upper()
    obj_name = level1_name_match.group(1)
    pg_value = value.replace("'", "''")

    if level2_name_match:
        col_name = level2_name_match.group(1)
        return f"COMMENT ON COLUMN {SCHEMA}.\"{obj_name}\".\"{col_name}\" IS '{pg_value}';"
    elif obj_type == 'TABLE':
        return f"COMMENT ON TABLE {SCHEMA}.\"{obj_name}\" IS '{pg_value}';"
    elif obj_type == 'VIEW':
        return f"COMMENT ON VIEW {SCHEMA}.\"{obj_name}\" IS '{pg_value}';"
    return None


def convert_boolean_values_in_sql(sql):
    """Convert boolean = 1/0 to = true/false for known boolean columns.
    Handles SET, WHERE, and AND clauses.
    """
    def replace_if_boolean(m):
        prefix = m.group(1)  # SET, AND, WHERE, or comma-prefixed
        col = m.group(2)     # column name (possibly quoted)
        val = m.group(3)     # 1 or 0
        col_clean = col.strip('" ')
        if col_clean in BOOLEAN_COLUMNS:
            bool_val = 'true' if val == '1' else 'false'
            return f'{prefix} {col} = {bool_val}'
        return m.group(0)  # Not a known boolean column, leave unchanged

    # Match "ColumnName" = 0/1 after SET, WHERE, AND, or comma
    sql = re.sub(
        r'\b(SET|WHERE|AND)\s+("?\w+"?)\s*=\s*(0|1)\b',
        replace_if_boolean,
        sql, flags=re.I
    )
    return sql


# ──────────────────────────────────────────────────────────────────────
# Migration 1 converter: Entity Name Normalization & ClassName Prefix Fix
# ──────────────────────────────────────────────────────────────────────

def convert_migration_1(lines):
    """Convert migration 1 using section-based processing."""
    text = ''.join(lines)
    out = []

    sections = split_into_sections_m1(text)

    for section in sections:
        section_type = section['type']
        content = section.get('content', '')

        if section_type == 'skip':
            if section.get('reason'):
                out.append(f"-- SKIPPED: {section['reason']}\n")
        elif section_type == 'comment':
            out.append(content)
        elif section_type == 'update_block':
            out.append(convert_simple_updates(content))
        elif section_type == 'extended_property':
            result = convert_extended_property_block(content)
            if result:
                out.append(result + '\n')
        elif section_type == 'grant':
            out.append(convert_grant_line(content) + '\n')
        elif section_type == 'index_if_not_exists':
            out.append(convert_index_block(content) + '\n')
        elif section_type == 'if_not_exists_insert':
            out.append(convert_entity_field_insert(content) + '\n')
        elif section_type == 'raw':
            out.append(content)

    return out


def split_into_sections_m1(text):
    """Split migration 1 into processable sections."""
    sections = []
    lines = text.split('\n')
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        # Skip empty lines and standalone GO
        if not stripped or stripped.upper() in ('GO', 'GO;'):
            i += 1
            continue

        # Skip SET NOCOUNT ON and @@ERROR/NOEXEC
        if 'SET NOCOUNT ON' in stripped.upper() or ('@@ERROR' in stripped and 'NOEXEC' in stripped):
            i += 1
            continue

        # PRINT -> comment
        if stripped.startswith('PRINT N') or stripped.startswith("PRINT '"):
            m = re.match(r"PRINT\s+N?'(.+)'", stripped)
            if m:
                sections.append({'type': 'raw', 'content': f'-- {m.group(1)}\n'})
            i += 1
            continue

        # Comments (-- or /* ... */)
        if stripped.startswith('--'):
            # Skip flyway:timestamp
            if '${flyway:timestamp}' in stripped:
                i += 1
                continue
            sections.append({'type': 'raw', 'content': line + ('\n' if not line.endswith('\n') else '')})
            i += 1
            continue

        if stripped.startswith('/*'):
            # Collect multi-line comment
            comment_lines = [line]
            while i + 1 < n and '*/' not in lines[i].strip():
                i += 1
                comment_lines.append(lines[i])
            sections.append({'type': 'raw', 'content': '\n'.join(comment_lines) + '\n'})
            i += 1
            continue

        # ─── vwEntityFieldsWithCheckConstraints (SKIP) ───
        if 'vwEntityFieldsWithCheckConstraints' in stripped:
            sections.append({'type': 'skip', 'reason': 'vwEntityFieldsWithCheckConstraints references SQL Server sys. catalog tables'})
            # Skip until next step marker
            i += 1
            while i < n and not lines[i].strip().startswith('-- =====') and not lines[i].strip().startswith('-- Step') and not lines[i].strip().startswith('-- STEP'):
                i += 1
            continue

        # ─── StripToAlphanumeric function (SKIP) ───
        if 'StripToAlphanumeric' in stripped and ('CREATE FUNCTION' in stripped.upper() or 'IF OBJECT_ID' in stripped):
            sections.append({'type': 'skip', 'reason': 'StripToAlphanumeric already created in baseline'})
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.startswith('GRANT') and 'StripToAlphanumeric' in s:
                    i += 1
                    break
                if s.startswith('-- =====') or s.startswith('-- STEP'):
                    break
                i += 1
            continue

        # ─── Conflict check IF EXISTS...RAISERROR (SKIP) ───
        if stripped.startswith('IF EXISTS') and i + 10 < n and 'RAISERROR' in ''.join(lines[i:i+15]):
            sections.append({'type': 'skip', 'reason': 'Conflict check uses SQL Server-specific RAISERROR/NOEXEC pattern'})
            i += 1
            while i < n and not lines[i].strip().startswith('-- ====='):
                i += 1
            continue

        # ─── DECLARE blocks (for counting - skip) ───
        if stripped.startswith('DECLARE @'):
            i += 1
            continue

        # ─── SELECT @var (for counting - skip) ───
        if stripped.startswith('SELECT @'):
            i += 1
            continue

        # ─── vwEntities CREATE VIEW (SKIP - already in baseline) ───
        if 'IF OBJECT_ID' in stripped and 'vwEntities' in stripped:
            sections.append({'type': 'skip', 'reason': 'vwEntities already created in baseline with prefix/ClassName support'})
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.startswith('-- =====') or s.startswith('-- STEP'):
                    break
                i += 1
            continue

        if stripped.startswith('CREATE VIEW') and 'vwEntities' in stripped:
            sections.append({'type': 'skip', 'reason': 'vwEntities already created in baseline with prefix/ClassName support'})
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.startswith('-- =====') or s.startswith('-- STEP'):
                    break
                i += 1
            continue

        # ─── sp_refreshview (SKIP) ───
        if 'sp_refreshview' in stripped.lower() or ('IF OBJECT_ID' in stripped and "'V'" in stripped):
            i += 1
            continue

        # ─── Extended properties ───
        if stripped.startswith('EXEC sp_addextendedproperty') or stripped.startswith('EXEC sp_updateextendedproperty'):
            block_lines = [stripped]
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.upper() in ('GO', 'GO;') or not s or s.startswith('--') or s.startswith('EXEC ') or s.startswith('IF ') or s.startswith('/*') or s.startswith('UPDATE'):
                    break
                block_lines.append(s)
                i += 1
            sections.append({'type': 'extended_property', 'content': ' '.join(block_lines)})
            continue

        # ─── EXEC metadata refresh calls (SKIP) ───
        if stripped.startswith('EXEC ') and any(kw in stripped for kw in [
            'spRecompileAll', 'spUpdateExistingEntities', 'spUpdateSchemaInfo',
            'spDeleteUnneeded', 'spUpdateExistingEntityFields', 'spSetDefaultColumnWidth',
            'spRecompileAllProcedures'
        ]):
            sections.append({'type': 'skip', 'reason': f'{stripped.split("(")[0]} (SQL Server-specific metadata refresh)'})
            i += 1
            continue

        # ─── CodeGen procedures (IF OBJECT_ID ... 'P' or 'TR') ───
        if 'IF OBJECT_ID' in stripped and ("'P'" in stripped or "'TR'" in stripped):
            proc_name_m = re.search(r'\.\[?(\w+)\]?', stripped)
            proc_name = proc_name_m.group(1) if proc_name_m else 'unknown'
            sections.append({'type': 'skip', 'reason': f'{proc_name} already exists in baseline'})
            # Skip until we find a section boundary: next /* ... */ comment or GRANT followed by blank
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.startswith('/* sp') or s.startswith('/* Set ') or s.startswith('/* Base View') or s.startswith('/* Index') or s.startswith('/* SQL text') or s.startswith('-- PART') or s.startswith('-- CODE GEN'):
                    break
                if s.startswith('GRANT EXECUTE'):
                    sections.append({'type': 'grant', 'content': s})
                    i += 1
                    # Check for duplicate GRANT after blank
                    while i < n and (not lines[i].strip() or lines[i].strip().upper() in ('GO', 'GO;')):
                        i += 1
                    break
                i += 1
            continue

        if stripped.startswith('CREATE PROCEDURE') or stripped.startswith('CREATE TRIGGER'):
            # Skip until next section
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.startswith('/* ') or s.startswith('-- PART') or s.startswith('-- CODE GEN'):
                    break
                if s.startswith('GRANT EXECUTE'):
                    sections.append({'type': 'grant', 'content': s})
                    i += 1
                    while i < n and (not lines[i].strip() or lines[i].strip().upper() in ('GO', 'GO;')):
                        i += 1
                    break
                i += 1
            continue

        # ─── GRANT statements ───
        if stripped.startswith('GRANT '):
            sections.append({'type': 'grant', 'content': stripped})
            i += 1
            continue

        # ─── IF NOT EXISTS (sys.indexes) -> CREATE INDEX IF NOT EXISTS ───
        if stripped.startswith('IF NOT EXISTS') and 'sys.indexes' in stripped:
            block_lines = [stripped]
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.upper() in ('GO', 'GO;') or not s:
                    break
                block_lines.append(s)
                if 'CREATE INDEX' in s.upper():
                    i += 1
                    break
                i += 1
            sections.append({'type': 'index_if_not_exists', 'content': ' '.join(block_lines)})
            continue

        # ─── IF NOT EXISTS entity field INSERT ───
        if stripped.startswith('IF NOT EXISTS') and 'EntityField' in stripped:
            block_lines = [lines[i]]
            i += 1
            while i < n:
                block_lines.append(lines[i])
                if lines[i].strip() == 'END':
                    i += 1
                    break
                i += 1
            sections.append({'type': 'if_not_exists_insert', 'content': ''.join(block_lines)})
            continue

        # ─── UPDATE statements ───
        if stripped.startswith('UPDATE'):
            block_lines = [lines[i]]
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.upper() in ('GO', 'GO;') or not s:
                    break
                if s.startswith('UPDATE') or s.startswith('/*') or s.startswith('--') or s.startswith('GRANT') or s.startswith('IF ') or s.startswith('EXEC') or s.startswith('INSERT') or s.startswith('ALTER'):
                    break
                block_lines.append(lines[i])
                i += 1
            sections.append({'type': 'update_block', 'content': '\n'.join(block_lines)})
            continue

        # ─── Anything else: skip unknown lines ───
        i += 1

    return sections


def convert_simple_updates(content):
    """Convert UPDATE statements: bracket notation, N-prefix, quote identifiers.
    Also converts boolean comparisons (= 1/0 -> = true/false)."""
    # Normalize newlines to spaces (since we join multi-line statements)
    result = ' '.join(content.strip().split())
    result = bracket_to_pg(remove_n_prefix(result))
    # Also quote standalone column names after SET and WHERE that aren't quoted
    result = quote_column_names_in_update(result)
    # Convert T-SQL string concat (+ operator) to PG concat (|| operator)
    result = convert_string_concat_in_update(result)
    # Convert T-SQL functions
    result = convert_tsql_functions_in_update(result)
    # Convert boolean comparisons in WHERE clauses
    result = convert_boolean_values_in_sql(result)
    if not result.endswith(';'):
        result += ';'
    return result + '\n'


def convert_string_concat_in_update(sql):
    """Convert T-SQL string concatenation (+) to PostgreSQL (||)."""
    # Only convert + between string values, not arithmetic
    # Pattern: 'string' + expr or expr + 'string'
    sql = re.sub(r"'\s*\+\s*", "' || ", sql)
    sql = re.sub(r"\s*\+\s*'", " || '", sql)
    return sql


def convert_tsql_functions_in_update(sql):
    """Convert T-SQL functions used in UPDATE SET to PG equivalents."""
    # SUBSTRING(x, start, len) -> SUBSTRING(x FROM start FOR len)
    # Actually, PostgreSQL supports SUBSTRING(x, start, len) too, so leave it
    # LEN(x) -> LENGTH(x)
    sql = re.sub(r'\bLEN\(', 'LENGTH(', sql, flags=re.I)
    # REPLACE is the same in both
    return sql


def quote_column_names_in_update(sql):
    """Ensure column names in UPDATE SET/WHERE clauses are properly quoted.
    Uses a string-aware approach to avoid modifying content inside string literals."""
    # SQL keywords that should NOT be quoted
    sql_keywords = {
        'SET', 'WHERE', 'AND', 'OR', 'NOT', 'LIKE', 'IN', 'IS', 'NULL',
        'UPDATE', 'FROM', 'JOIN', 'ON', 'AS', 'CASE', 'WHEN', 'THEN',
        'ELSE', 'END', 'BETWEEN', 'EXISTS', 'SELECT', 'INSERT', 'INTO',
        'VALUES', 'DELETE', 'TRUE', 'FALSE', 'SUBSTRING', 'LENGTH',
        'REPLACE', 'COALESCE', 'CAST', 'TRIM', 'UPPER', 'LOWER',
    }

    # Split SQL into string-literal and non-string parts to avoid quoting inside strings
    parts = split_sql_preserving_strings(sql)

    result_parts = []
    for part_type, part_content in parts:
        if part_type == 'string':
            # Leave string literals unchanged
            result_parts.append(part_content)
        else:
            # Apply quoting rules to non-string parts
            s = part_content

            # Quote LHS of SET assignments
            s = re.sub(r'\bSET\s+(\w+)\s*(=)', lambda m: f'SET "{m.group(1)}" {m.group(2)}', s)
            s = re.sub(r',\s*(\w+)\s*=', lambda m: f', "{m.group(1)}" =', s)

            # Quote column after WHERE/AND
            s = re.sub(r'\bWHERE\s+(\w+)\s*(=|<|>|LIKE|IN|IS|NOT)', lambda m: f'WHERE "{m.group(1)}" {m.group(2)}', s, flags=re.I)
            s = re.sub(r'\bAND\s+(\w+)\s*(=|<|>|LIKE|IN|IS|NOT)', lambda m: f'AND "{m.group(1)}" {m.group(2)}', s, flags=re.I)

            # Quote bare PascalCase identifiers (column references on RHS, inside functions, etc.)
            def quote_pascal_case(m):
                word = m.group(1)
                if word.upper() in sql_keywords or word.startswith('"'):
                    return m.group(0)
                return f'"{word}"'

            s = re.sub(
                r'(?<![."A-Za-z_])([A-Z][a-zA-Z_]\w*)(?!["\w(])',
                quote_pascal_case,
                s
            )

            result_parts.append(s)

    return ''.join(result_parts)


def split_sql_preserving_strings(sql):
    """Split SQL into alternating (type, content) tuples of 'code' and 'string' parts.
    String literals are delimited by single quotes, with '' as escape."""
    parts = []
    current = []
    i = 0
    in_string = False

    while i < len(sql):
        ch = sql[i]
        if ch == "'" and not in_string:
            # End current code part, start string
            if current:
                parts.append(('code', ''.join(current)))
                current = []
            in_string = True
            current.append(ch)
        elif ch == "'" and in_string:
            current.append(ch)
            if i + 1 < len(sql) and sql[i + 1] == "'":
                # Escaped quote
                current.append(sql[i + 1])
                i += 1
            else:
                # End of string
                in_string = False
                parts.append(('string', ''.join(current)))
                current = []
        else:
            current.append(ch)
        i += 1

    if current:
        parts.append(('code' if not in_string else 'string', ''.join(current)))

    return parts


def convert_index_block(content):
    """Convert IF NOT EXISTS ... CREATE INDEX to CREATE INDEX IF NOT EXISTS."""
    m = re.search(r'CREATE\s+INDEX\s+(\S+)\s+ON\s+([^\(]+)\(([^)]+)\)', content, re.I)
    if not m:
        return f'-- Could not parse index: {content[:100]}'
    idx_name = m.group(1).strip().strip('[]"')
    table_ref = bracket_to_pg(m.group(2).strip())
    columns = bracket_to_pg(m.group(3).strip())
    return f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON {table_ref}({columns});'


def convert_entity_field_insert(content):
    """Convert IF NOT EXISTS ... INSERT INTO EntityField to PG INSERT ... WHERE NOT EXISTS."""
    # Extract WHERE clause from the IF NOT EXISTS
    where_match = re.search(
        r"WHERE\s+(ID\s*=\s*'[^']+'\s+OR\s*\n?\s*\(EntityID\s*=\s*'[^']+'\s+AND\s+Name\s*=\s*'[^']+'\))",
        content, re.I | re.DOTALL
    )

    # Extract column names
    col_match = re.search(r'INSERT\s+INTO\s+\S+\s*\(([^)]+)\)', content, re.I | re.DOTALL)
    if not col_match:
        return '-- Could not parse IF NOT EXISTS INSERT block'

    col_text = col_match.group(1)
    col_names = [c.strip().strip('[]') for c in col_text.split(',')]
    pg_columns = ', '.join(f'"{c.strip()}"' for c in col_names)

    # Extract values
    val_match = re.search(r'VALUES\s*\((.+?)\)\s*\n\s*END', content, re.I | re.DOTALL)
    if not val_match:
        return '-- Could not parse VALUES in IF NOT EXISTS INSERT block'

    values_str = val_match.group(1).strip()
    values_str = remove_n_prefix(values_str)

    # Convert BIT values for boolean columns
    values_parts = split_values_careful(values_str)
    for idx, col in enumerate(col_names):
        col_clean = col.strip()
        if col_clean in BOOLEAN_COLUMNS and idx < len(values_parts):
            val = values_parts[idx].strip()
            if val == '0':
                values_parts[idx] = ' FALSE'
            elif val == '1':
                values_parts[idx] = ' TRUE'

    # Strip inline comments from values
    cleaned_parts = []
    for part in values_parts:
        # Remove -- comments at end of value
        part = re.sub(r'\s*--[^\n]*$', '', part.rstrip())
        cleaned_parts.append(part)

    pg_values = ','.join(cleaned_parts)

    # Build WHERE NOT EXISTS
    if where_match:
        where_clause = where_match.group(1).strip()
        where_clause = remove_n_prefix(where_clause)
        where_clause = re.sub(r'\bID\b', '"ID"', where_clause)
        where_clause = re.sub(r'\bEntityID\b', '"EntityID"', where_clause)
        where_clause = re.sub(r'\bName\b', '"Name"', where_clause)
        where_clause = re.sub(r'\s+', ' ', where_clause)
    else:
        # Fallback: use the ID from first value
        first_val = cleaned_parts[0].strip().strip("'")
        where_clause = f"\"ID\" = '{first_val}'"

    return (f'INSERT INTO {SCHEMA}."EntityField" ({pg_columns})\n'
            f'SELECT {pg_values}\n'
            f'WHERE NOT EXISTS (\n'
            f'    SELECT 1 FROM {SCHEMA}."EntityField" WHERE {where_clause}\n'
            f');')


# ──────────────────────────────────────────────────────────────────────
# Migration 2 converter: Add AllowMultipleSubtypes to Entity
# ──────────────────────────────────────────────────────────────────────

def convert_migration_2(lines):
    """Convert migration 2 using section-based processing."""
    text = ''.join(lines)
    out = []

    sections = split_into_sections_m2(text)

    for section in sections:
        section_type = section['type']
        content = section.get('content', '')

        if section_type == 'skip':
            if section.get('reason'):
                out.append(f"-- SKIPPED: {section['reason']}\n")
        elif section_type == 'raw':
            out.append(content)
        elif section_type == 'alter_table':
            out.append(convert_alter_add_column(content) + '\n')
        elif section_type == 'extended_property':
            result = convert_extended_property_block(content)
            if result:
                out.append(result + '\n')
        elif section_type == 'if_not_exists_insert':
            out.append(convert_entity_field_insert(content) + '\n')
        elif section_type == 'index_if_not_exists':
            out.append(convert_index_block(content) + '\n')
        elif section_type == 'grant':
            out.append(convert_grant_line(content) + '\n')
        elif section_type == 'update_block':
            out.append(convert_simple_updates(content))

    return out


def split_into_sections_m2(text):
    """Split migration 2 into processable sections."""
    sections = []
    lines = text.split('\n')
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped or stripped.upper() in ('GO', 'GO;'):
            i += 1
            continue

        if 'SET NOCOUNT ON' in stripped.upper() or ('@@ERROR' in stripped and 'NOEXEC' in stripped):
            i += 1
            continue

        if stripped.startswith('PRINT N') or stripped.startswith("PRINT '"):
            m = re.match(r"PRINT\s+N?'(.+)'", stripped)
            if m:
                sections.append({'type': 'raw', 'content': f'-- {m.group(1)}\n'})
            i += 1
            continue

        if stripped.startswith('--'):
            sections.append({'type': 'raw', 'content': line + ('\n' if not line.endswith('\n') else '')})
            i += 1
            continue

        if stripped.startswith('/*'):
            comment_lines = [line]
            while '*/' not in lines[i].strip() and i + 1 < n:
                i += 1
                comment_lines.append(lines[i])
            sections.append({'type': 'raw', 'content': '\n'.join(comment_lines) + '\n'})
            i += 1
            continue

        # ALTER TABLE - may be multi-line (ADD on next line)
        if stripped.startswith('ALTER TABLE'):
            block_lines = [stripped]
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.upper() in ('GO', 'GO;') or not s:
                    break
                if s.startswith('--') or s.startswith('EXEC') or s.startswith('/*'):
                    break
                block_lines.append(s)
                i += 1
            sections.append({'type': 'alter_table', 'content': ' '.join(block_lines)})
            continue

        # Extended properties
        if stripped.startswith('EXEC sp_addextendedproperty') or stripped.startswith('EXEC sp_updateextendedproperty'):
            block_lines = [stripped]
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.upper() in ('GO', 'GO;') or not s or s.startswith('--') or s.startswith('EXEC ') or s.startswith('IF ') or s.startswith('/*') or s.startswith('UPDATE') or s.startswith('ALTER'):
                    break
                block_lines.append(s)
                i += 1
            sections.append({'type': 'extended_property', 'content': ' '.join(block_lines)})
            continue

        # IF NOT EXISTS entity field INSERT
        if stripped.startswith('IF NOT EXISTS'):
            # Determine if it's an index or entity field insert
            if 'sys.indexes' in stripped:
                block_lines = [stripped]
                i += 1
                while i < n:
                    s = lines[i].strip()
                    if s.upper() in ('GO', 'GO;') or not s:
                        break
                    block_lines.append(s)
                    if 'CREATE INDEX' in s.upper():
                        i += 1
                        break
                    i += 1
                sections.append({'type': 'index_if_not_exists', 'content': ' '.join(block_lines)})
                continue
            else:
                # Entity field insert - collect until END
                block_lines = [lines[i]]
                i += 1
                while i < n:
                    block_lines.append(lines[i])
                    if lines[i].strip() == 'END':
                        i += 1
                        break
                    i += 1
                sections.append({'type': 'if_not_exists_insert', 'content': ''.join(block_lines)})
                continue

        # CodeGen procedures (IF OBJECT_ID ... 'P' or 'TR')
        if 'IF OBJECT_ID' in stripped and ("'P'" in stripped or "'TR'" in stripped):
            proc_name_m = re.search(r'\.\[?(\w+)\]?', stripped)
            proc_name = proc_name_m.group(1) if proc_name_m else 'unknown'
            sections.append({'type': 'skip', 'reason': f'{proc_name} already exists in baseline'})
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.startswith('/* sp') or s.startswith('/* Set ') or s.startswith('/* Base View') or s.startswith('/* Index') or s.startswith('/* SQL text'):
                    break
                if s.startswith('GRANT EXECUTE'):
                    sections.append({'type': 'grant', 'content': s})
                    i += 1
                    while i < n and (not lines[i].strip() or lines[i].strip().upper() in ('GO', 'GO;')):
                        i += 1
                    break
                i += 1
            continue

        if stripped.startswith('CREATE PROCEDURE') or stripped.startswith('CREATE TRIGGER'):
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.startswith('/* ') or s.startswith('-- PART'):
                    break
                if s.startswith('GRANT EXECUTE'):
                    sections.append({'type': 'grant', 'content': s})
                    i += 1
                    while i < n and (not lines[i].strip() or lines[i].strip().upper() in ('GO', 'GO;')):
                        i += 1
                    break
                i += 1
            continue

        # GRANT
        if stripped.startswith('GRANT '):
            sections.append({'type': 'grant', 'content': stripped})
            i += 1
            continue

        # UPDATE
        if stripped.startswith('UPDATE'):
            block_lines = [lines[i]]
            i += 1
            while i < n:
                s = lines[i].strip()
                if s.upper() in ('GO', 'GO;') or not s:
                    break
                if s.startswith('UPDATE') or s.startswith('/*') or s.startswith('--') or s.startswith('GRANT') or s.startswith('IF ') or s.startswith('EXEC'):
                    break
                block_lines.append(lines[i])
                i += 1
            sections.append({'type': 'update_block', 'content': '\n'.join(block_lines)})
            continue

        i += 1

    return sections


def convert_alter_add_column(block):
    """Convert ALTER TABLE ... ADD column BIT ... to PostgreSQL."""
    m = re.match(
        r'ALTER\s+TABLE\s+(\S+)\s+ADD\s+(\w+)\s+BIT\s+(NOT\s+NULL\s+)?(?:CONSTRAINT\s+\w+\s+)?DEFAULT\s+(\d)',
        block, re.I
    )
    if m:
        table = bracket_to_pg(m.group(1))
        col_name = m.group(2)
        not_null = 'NOT NULL ' if m.group(3) else ''
        default_val = 'false' if m.group(4) == '0' else 'true'
        return f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS "{col_name}" BOOLEAN {not_null}DEFAULT {default_val};'

    converted = bracket_to_pg(block)
    converted = re.sub(r'\bBIT\b', 'BOOLEAN', converted, flags=re.I)
    converted = re.sub(r'\bDEFAULT\s+0\b', 'DEFAULT false', converted, flags=re.I)
    converted = re.sub(r'\bDEFAULT\s+1\b', 'DEFAULT true', converted, flags=re.I)
    converted = re.sub(r'\bADD\s+', 'ADD COLUMN IF NOT EXISTS ', converted, count=1, flags=re.I)
    if not converted.endswith(';'):
        converted += ';'
    return converted


# ──────────────────────────────────────────────────────────────────────
# Migration 3 converter: Metadata Sync
# ──────────────────────────────────────────────────────────────────────

def convert_migration_3(lines):
    """Convert migration 3: DECLARE/SET/EXEC blocks to PG function calls."""
    text = ''.join(lines)
    out = []

    sections = split_into_sections_m3(text)

    for section in sections:
        section_type = section['type']
        content = section.get('content', '')

        if section_type == 'raw':
            out.append(content)
        elif section_type == 'sp_call':
            out.append(content + '\n')

    return out


def split_into_sections_m3(text):
    """Split migration 3 into DECLARE/SET/EXEC blocks and comments.
    Uses a more robust approach: find each DECLARE block start,
    then collect everything until the next DECLARE or end-of-file.
    """
    sections = []
    lines = text.split('\n')
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            sections.append({'type': 'raw', 'content': '\n'})
            i += 1
            continue

        if stripped.startswith('--'):
            # Check if next non-empty line is DECLARE - if so, this is a block header comment
            j = i + 1
            while j < n and not lines[j].strip():
                j += 1
            if j < n and lines[j].strip().startswith('DECLARE '):
                # This comment belongs to the next DECLARE block, save it
                comment = line.rstrip() + '\n'
                i += 1
                # Now fall through to let the DECLARE handler pick it up
                # Actually, parse the block now
                while i < n and not lines[i].strip():
                    i += 1
                if i < n and lines[i].strip().startswith('DECLARE '):
                    result = parse_declare_set_exec_block_v2(lines, i, comment)
                    if result:
                        sections.append({'type': 'sp_call', 'content': result['sql']})
                        i = result['next_line']
                        continue
            # Regular comment line
            sections.append({'type': 'raw', 'content': line + ('\n' if not line.endswith('\n') else '')})
            i += 1
            continue

        if stripped.startswith('DECLARE '):
            result = parse_declare_set_exec_block_v2(lines, i, '')
            if result:
                sections.append({'type': 'sp_call', 'content': result['sql']})
                i = result['next_line']
                continue
            # If parsing failed, skip this line
            i += 1
            continue

        i += 1

    return sections


def parse_declare_set_exec_block_v2(lines, start, comment_prefix):
    """Parse a DECLARE/SET/EXEC block and convert to PG function call.

    This version handles multi-line SET values properly by tracking
    string literal balance (matching opening/closing single quotes).
    """
    i = start
    n = len(lines)

    # 1. Parse DECLARE to get variable names and types
    # Collect all DECLARE lines (may span multiple lines with continuation)
    declare_text = ''
    while i < n:
        stripped = lines[i].strip()
        if stripped.startswith('DECLARE '):
            declare_text += stripped[8:]  # skip "DECLARE "
            i += 1
        elif stripped.startswith('@'):
            # Continuation of DECLARE
            declare_text += ' ' + stripped
            i += 1
        elif stripped.startswith('SET'):
            break
        elif not stripped:
            i += 1
            continue
        else:
            break

    # Parse variables from accumulated text
    variables = {}
    var_order = []
    for m in re.finditer(r'@(\w+)\s+([^,@]+?)(?:,|$)', declare_text):
        var_name = m.group(1)
        var_type = m.group(2).strip()
        variables[var_name] = {'type': var_type, 'value': None}
        var_order.append(var_name)

    if not variables:
        return None

    # 2. Parse SET statements - handling multi-line values with proper string tracking
    while i < n:
        stripped = lines[i].strip()

        if not stripped:
            i += 1
            continue

        if stripped.startswith('SET'):
            # Handle SET on same line as assignment or on separate line
            m = re.match(r'SET\s+@(\w+)\s*=\s*(.*)', stripped)
            if not m and stripped.strip() == 'SET':
                # SET is on its own line, look at next non-empty line for @var = value
                i += 1
                while i < n and not lines[i].strip():
                    i += 1
                if i < n:
                    next_stripped = lines[i].strip()
                    m = re.match(r'@(\w+)\s*=\s*(.*)', next_stripped)
            if m:
                var_name = m.group(1)
                value_start = m.group(2).strip()

                # Accumulate the full value, handling multi-line strings
                full_value = value_start
                i += 1

                # Check if value is complete (balanced quotes, no trailing +)
                while i < n and not is_value_complete(full_value):
                    next_line = lines[i].rstrip()
                    if not next_line.strip():
                        # Empty line - could be separator or part of value
                        # Check if we're inside an open string
                        if count_unescaped_quotes(full_value) % 2 == 1:
                            full_value += '\n'
                            i += 1
                            continue
                        else:
                            break
                    full_value += '\n' + next_line
                    i += 1

                if var_name in variables:
                    variables[var_name]['value'] = full_value.rstrip(';').strip()
                continue
            else:
                # Neither pattern matched, skip this line to avoid infinite loop
                i += 1
                continue
        elif stripped.startswith('EXEC '):
            break
        elif stripped.startswith('--'):
            i += 1
            continue
        else:
            break

    # 3. Parse EXEC statement
    if i >= n or not lines[i].strip().startswith('EXEC '):
        return None

    exec_line = lines[i].strip()
    i += 1
    # Collect continuation lines
    while i < n:
        stripped = lines[i].strip()
        if stripped.startswith('--') or stripped.startswith('DECLARE') or not stripped:
            break
        exec_line += ' ' + stripped
        i += 1
        if exec_line.rstrip().endswith(';'):
            break

    # Parse EXEC [schema].spName @param1 = @var1, ...;
    exec_match = re.match(r'EXEC\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.?\[?(\w+)\]?\s+(.*)', exec_line, re.I)
    if not exec_match:
        return None

    sp_name = exec_match.group(1)
    params_str = exec_match.group(2).rstrip(';').strip()

    # Parse parameter assignments
    param_assignments = []
    for param_match in re.finditer(r'@(\w+)\s*=\s*@(\w+)', params_str):
        param_name = param_match.group(1)
        var_name = param_match.group(2)
        param_assignments.append((param_name, var_name))

    # 4. Build PG function call
    pg_params = []
    for param_name, var_name in param_assignments:
        pg_param_name = f'p_{param_name.lower()}'

        if var_name in variables and variables[var_name]['value'] is not None:
            value = variables[var_name]['value']
            pg_value = convert_value_to_pg(value, variables[var_name]['type'])
        else:
            pg_value = 'NULL'

        pg_params.append(f'    {pg_param_name} := {pg_value}')

    params_sql = ',\n'.join(pg_params)

    sql = f'{comment_prefix}SELECT * FROM {SCHEMA}."{sp_name}"(\n{params_sql}\n);'

    return {'sql': sql, 'next_line': i}


def is_value_complete(value):
    """Check if a T-SQL value is complete (balanced quotes, no trailing + for concat)."""
    stripped = value.rstrip()

    # If ends with a string concatenation operator, not complete
    if stripped.endswith('+'):
        return False

    # If ends with CAST( but no closing ), not complete
    open_parens = stripped.count('(')
    close_parens = stripped.count(')')
    if open_parens > close_parens:
        return False

    # Count unescaped quotes - if odd, we're inside a string
    if count_unescaped_quotes(stripped) % 2 == 1:
        return False

    return True


def count_unescaped_quotes(s):
    """Count single quotes in s, not counting escaped pairs ('')."""
    count = 0
    i = 0
    while i < len(s):
        if s[i] == "'":
            if i + 1 < len(s) and s[i + 1] == "'":
                i += 2  # skip escaped pair
                continue
            count += 1
        i += 1
    return count


def convert_value_to_pg(value, tsql_type):
    """Convert a T-SQL value to PostgreSQL equivalent."""
    value = value.strip().rstrip(';')

    if value.upper() == 'NULL':
        return 'NULL'

    tsql_type_upper = tsql_type.upper().strip()

    # BIT -> boolean
    if 'BIT' in tsql_type_upper:
        if value == '0':
            return 'false'
        elif value == '1':
            return 'true'

    # Bare integer
    if re.match(r'^-?\d+$', value):
        return value

    # DECIMAL
    if re.match(r'^-?\d+\.\d+$', value):
        return value

    # UUID
    if re.match(r"^'[0-9A-Fa-f-]{36}'$", value):
        return value

    # Handle CAST/concatenation (especially the embedding vector)
    if 'CAST(' in value.upper() or 'AS NVARCHAR' in value.upper():
        value = strip_cast_nvarchar(value)
        value = merge_string_concat(value)

    # Remove N prefix from string literals
    value = remove_n_prefix(value)

    return value


# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────

def add_header(source_name):
    return (
        f'-- =============================================================================\n'
        f'-- Auto-converted from T-SQL to PostgreSQL\n'
        f'-- Source: {source_name}\n'
        f'-- Schema: {SCHEMA}\n'
        f'-- =============================================================================\n\n'
    )


def read_file(path):
    with open(path, 'r', encoding='utf-8-sig') as f:
        return f.readlines()


def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)


def main():
    converters = {
        'convert_migration_1': convert_migration_1,
        'convert_migration_2': convert_migration_2,
        'convert_migration_3': convert_migration_3,
    }

    for migration in MIGRATIONS:
        source_path = os.path.join(MIGRATIONS_DIR, migration['source'])
        output_path = os.path.join(OUTPUT_DIR, migration['source'])
        converter_fn = converters[migration['converter']]

        print(f'\n{"=" * 70}')
        print(f'Converting: {migration["source"]}')
        print(f'{"=" * 70}')

        lines = read_file(source_path)
        print(f'  Source: {len(lines)} lines')

        header = add_header(migration['source'])
        converted_lines = converter_fn(lines)

        content = header + ''.join(converted_lines)
        # Clean up excessive blank lines
        content = re.sub(r'\n{4,}', '\n\n\n', content)

        write_file(output_path, content)
        output_line_count = content.count('\n')
        print(f'  Output: {output_line_count} lines -> {output_path}')

    print(f'\nDone. All 3 migrations converted.')


if __name__ == '__main__':
    main()
