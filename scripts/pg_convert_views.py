#!/usr/bin/env python3
"""
Pass 2: Extract and convert all CREATE VIEW statements from the T-SQL baseline to PostgreSQL.

Handles: ISNULL->COALESCE, IIF->CASE, OUTER APPLY->LATERAL,
SELECT TOP->LIMIT, string concat +->||, CONVERT/TRY_CONVERT->CAST,
LEN->LENGTH, CHARINDEX->STRPOS, N'strings'
"""

import re
import sys

SOURCE = '/workspace/MJ/migrations/v4/B202602061600__v4.0__Baseline.sql'
OUTPUT_APPEND = '/workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql'
SCHEMA = '__mj'


def read_source():
    with open(SOURCE, 'r', encoding='utf-8-sig') as f:
        return f.readlines()


def bracket_to_pg(s):
    s = s.replace('[${flyway:defaultSchema}]', SCHEMA)
    s = s.replace('${flyway:defaultSchema}', SCHEMA)
    s = re.sub(r'\[([^\]]+)\]', r'"\1"', s)
    return s


def remove_collation(s):
    return re.sub(r'\s+COLLATE\s+\S+', '', s, flags=re.I)


def convert_isnull(s):
    """ISNULL(a, b) -> COALESCE(a, b)"""
    return re.sub(r'\bISNULL\s*\(', 'COALESCE(', s, flags=re.I)


def convert_iif(s):
    """IIF(cond, true_val, false_val) -> CASE WHEN cond THEN true_val ELSE false_val END"""
    # Handle nested IIFs by iterating
    pattern = r'\bIIF\s*\('
    max_iter = 20
    for _ in range(max_iter):
        m = re.search(pattern, s, re.I)
        if not m:
            break
        start = m.start()
        # Find the matching closing paren
        open_pos = m.end() - 1  # position of (
        depth = 1
        pos = open_pos + 1
        args = []
        arg_start = pos
        while pos < len(s) and depth > 0:
            ch = s[pos]
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
            break  # Can't parse, leave as-is

    return s


def convert_top_to_limit(s):
    """Convert SELECT TOP N ... to SELECT ... LIMIT N"""
    # Handle "SELECT TOP N col1, col2..." -> "SELECT col1, col2... LIMIT N"
    # This is tricky in views since LIMIT needs to be at the end
    # We'll convert inline: SELECT TOP N -> will add a comment marker
    # Actually for subqueries and CTEs, we need to move TOP to LIMIT

    # Pattern: SELECT TOP N <columns> FROM ...
    def replace_top(m):
        n = m.group(1).strip()
        return f'SELECT /*TOP:{n}*/'

    s = re.sub(r'\bSELECT\s+TOP\s+(\d+)\b', replace_top, s, flags=re.I)
    return s


def finalize_top_to_limit(view_text):
    """Convert /*TOP:N*/ markers to LIMIT N at end of subquery/statement."""
    # Find all TOP markers and move to end
    pattern = r'/\*TOP:(\d+)\*/'
    matches = list(re.finditer(pattern, view_text))

    if not matches:
        return view_text

    # For each TOP marker, we need to find the end of its SELECT scope
    # and add LIMIT there. For simplicity, if there's a single TOP in the
    # outer SELECT, add LIMIT before the final semicolon/closing.

    for m in reversed(matches):
        n = m.group(1)
        # Remove the marker
        view_text = view_text[:m.start()] + view_text[m.end():]

        # Find the end of this SELECT's scope
        # Look for the next closing paren at depth 0, or end of statement
        pos = m.start()
        depth = 0
        # Count parentheses from the start to find depth at marker position
        for i in range(pos):
            if view_text[i] == '(':
                depth += 1
            elif view_text[i] == ')':
                depth -= 1

        # Now scan forward to find where this SELECT ends
        end_pos = len(view_text)
        scan_depth = depth
        for i in range(pos, len(view_text)):
            ch = view_text[i]
            if ch == '(':
                scan_depth += 1
            elif ch == ')':
                scan_depth -= 1
                if scan_depth < depth:
                    end_pos = i
                    break

        # Insert LIMIT before the end position
        # Check if there's already ORDER BY
        segment = view_text[pos:end_pos]
        limit_clause = f'\n    LIMIT {n}'
        view_text = view_text[:end_pos] + limit_clause + view_text[end_pos:]

    return view_text


def convert_convert(s):
    """CONVERT(type, expr) -> CAST(expr AS type)"""
    # CONVERT(nvarchar(max), expr) -> CAST(expr AS TEXT)
    # Pattern: CONVERT(type, expr) - type can have parens like nvarchar(max)
    pattern = r'\bCONVERT\s*\('
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

        while pos < len(s) and depth > 0:
            ch = s[pos]
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
            # Could have optional style parameter (3rd arg) - ignore it
            replacement = f'CAST({expr} AS {type_str})'
            s = s[:start] + replacement + s[pos + 1:]
        else:
            break

    return s


def convert_try_convert(s):
    """TRY_CONVERT(type, expr) -> CAST with NULL fallback"""
    pattern = r'\bTRY_CONVERT\s*\('
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

        while pos < len(s) and depth > 0:
            ch = s[pos]
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
            # TRY_CONVERT returns NULL on failure
            # In PG, use a CASE or custom function
            replacement = f'CAST({expr} AS {type_str})'
            s = s[:start] + replacement + s[pos + 1:]
        else:
            break

    return s


def convert_type_name(t):
    """Convert T-SQL type name to PG equivalent."""
    tl = t.lower().strip()
    if tl == 'uniqueidentifier':
        return 'UUID'
    if re.match(r'nvarchar\s*\(\s*max\s*\)', tl):
        return 'TEXT'
    if re.match(r'nvarchar\s*\((\d+)\)', tl):
        m = re.match(r'nvarchar\s*\((\d+)\)', tl)
        return f'VARCHAR({m.group(1)})'
    if re.match(r'varchar\s*\(\s*max\s*\)', tl):
        return 'TEXT'
    if re.match(r'varchar\s*\((\d+)\)', tl):
        m = re.match(r'varchar\s*\((\d+)\)', tl)
        return f'VARCHAR({m.group(1)})'
    if tl == 'bit':
        return 'BOOLEAN'
    if tl == 'int':
        return 'INTEGER'
    if tl == 'bigint':
        return 'BIGINT'
    if tl == 'float' or re.match(r'float\s*\(\d+\)', tl):
        return 'DOUBLE PRECISION'
    if tl == 'datetime' or tl == 'datetime2':
        return 'TIMESTAMP'
    if tl == 'datetimeoffset':
        return 'TIMESTAMPTZ'
    if tl == 'xml':
        return 'XML'
    return t.upper()


def convert_string_concat(s):
    """Convert + string concatenation to || in SQL context.
    This is tricky because + is also arithmetic. We use heuristics:
    - If both sides involve string literals or known string columns, use ||
    - Actually, just convert all + in non-numeric contexts
    For safety, we'll convert + to || when:
    - One side is a string literal ('...')
    - One side is a CAST to varchar/text
    - Both sides are quoted identifiers or alias.column patterns (string context)
    """
    # Simple approach: replace + with || when adjacent to string expressions
    # Pattern: 'string' + expr or expr + 'string' or CAST(...) + ...
    # This is complex, so let's just do it for obvious cases

    # Replace N'...' + with '...' ||
    s = re.sub(r"N'([^']*)'(\s*)\+", r"'\1'\2||", s)
    s = re.sub(r"\+(\s*)N'([^']*)'", r"||\1'\2'", s)

    # Replace '...' + expr
    s = re.sub(r"'([^']*)'\s*\+\s*", r"'\1' || ", s)
    # Replace expr + '...'
    s = re.sub(r"\s*\+\s*'([^']*)'", r" || '\1'", s)

    # Replace CAST/function result + something (likely string concat)
    # Pattern: AS VARCHAR(...)) + or AS TEXT) +
    s = re.sub(r'(AS\s+(?:VARCHAR\(\d+\)|TEXT)\s*\))\s*\+', r'\1 ||', s, flags=re.I)

    # Replace "column" + expr or expr + "column" patterns (string context)
    # "col" + COALESCE(...), "col" + "col", "col" + alias."col"
    s = re.sub(r'("[\w]+")\s*\+\s*', r'\1 || ', s)
    s = re.sub(r'\s*\+\s*("[\w]+")', r' || \1', s)

    # Replace COALESCE(...) + expr (string context)
    s = re.sub(r'(COALESCE\s*\([^)]*\))\s*\+\s*', r'\1 || ', s, flags=re.I)

    # Replace alias.Column + expr (unquoted column before +)
    # Pattern: word.Word + -> word.Word ||
    s = re.sub(r'(\w+\.\w+)\s*\+\s*', r'\1 || ', s)

    return s


def convert_outer_apply(s):
    """Convert OUTER APPLY to LEFT JOIN LATERAL ... ON true"""
    s = re.sub(r'\bOUTER\s+APPLY\b', 'LEFT JOIN LATERAL', s, flags=re.I)
    return s


def convert_cross_apply(s):
    """Convert CROSS APPLY to CROSS JOIN LATERAL"""
    s = re.sub(r'\bCROSS\s+APPLY\b', 'CROSS JOIN LATERAL', s, flags=re.I)
    return s


def convert_len(s):
    return re.sub(r'\bLEN\s*\(', 'LENGTH(', s, flags=re.I)


def convert_charindex(s):
    """CHARINDEX(sub, str) -> STRPOS(str, sub) (args reversed)"""
    pattern = r'\bCHARINDEX\s*\('
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

        while pos < len(s) and depth > 0:
            ch = s[pos]
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
            substring = args[0].strip()
            string = args[1].strip()
            replacement = f'STRPOS({string}, {substring})'
            s = s[:start] + replacement + s[pos + 1:]
        else:
            break

    return s


def convert_stuff(s):
    """STUFF(str, start, length, replace) ->
    SUBSTRING(str, 1, start-1) || replace || SUBSTRING(str, start+length)"""
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

        while pos < len(s) and depth > 0:
            ch = s[pos]
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


def convert_n_strings(s):
    """Remove N prefix from string literals."""
    return re.sub(r"N'", "'", s)


def convert_getutcdate(s):
    s = re.sub(r'\bGETUTCDATE\s*\(\)', "NOW() AT TIME ZONE 'UTC'", s, flags=re.I)
    s = re.sub(r'\bGETDATE\s*\(\)', 'NOW()', s, flags=re.I)
    s = re.sub(r'\bSYSDATETIMEOFFSET\s*\(\)', "NOW() AT TIME ZONE 'UTC'", s, flags=re.I)
    return s


def convert_newid(s):
    s = re.sub(r'\bNEWSEQUENTIALID\s*\(\)', 'gen_random_uuid()', s, flags=re.I)
    s = re.sub(r'\bNEWID\s*\(\)', 'gen_random_uuid()', s, flags=re.I)
    return s


def apply_view_on_true(text):
    """Add ON true after LATERAL subqueries/function calls.
    Handles both:
    - LEFT JOIN LATERAL (...) AS alias -> LEFT JOIN LATERAL (...) AS alias ON true
    - LEFT JOIN LATERAL (...) alias   -> LEFT JOIN LATERAL (...) alias ON true
    - LEFT JOIN LATERAL fn(...) AS alias -> ...ON true
    """
    lines = text.split('\n')
    i = 0
    in_lateral = False
    lateral_depth = 0

    while i < len(lines):
        line = lines[i]

        if 'LEFT JOIN LATERAL' in line.upper():
            in_lateral = True
            lateral_depth = 0

        if in_lateral:
            lateral_depth += line.count('(') - line.count(')')

            # When depth returns to 0 or below, the subquery/function is closed
            if lateral_depth <= 0 and ')' in line:
                stripped = line.strip()
                # Check for alias pattern: ) alias or ) AS alias
                alias_match = re.search(r'\)\s+(?:AS\s+)?("?\w+"?)\s*$', stripped, re.I)
                if alias_match and 'ON true' not in stripped:
                    lines[i] = line.rstrip() + ' ON true'
                in_lateral = False

        i += 1

    return '\n'.join(lines)


def quote_schema_view_refs(text):
    """Quote unquoted view and function references, add schema prefix to bare view names.

    Handles:
    - __mj.vwFoo -> __mj."vwFoo"   (schema prefix present but name unquoted)
    - vwFoo      -> __mj."vwFoo"    (bare view name without schema)
    - __mj.FunctionName(...) -> __mj."FunctionName"(...)  (function calls)
    """
    # First: __mj.vwFoo (not already quoted) -> __mj."vwFoo"
    text = re.sub(r'\b__mj\.(vw\w+)\b(?!")', r'__mj."\1"', text)

    # Second: bare vwFoo references (not preceded by . or ") -> __mj."vwFoo"
    # These appear in FROM/JOIN clauses as table references
    text = re.sub(r'(?<![."_\w])\b(vw[A-Z]\w+)\b(?!")', r'__mj."\1"', text)

    # Third: __mj.FunctionName( (not already quoted) -> __mj."FunctionName"(
    # Match PascalCase function names after __mj. that are followed by (
    text = re.sub(r'\b__mj\.([A-Z]\w+)\s*\(', r'__mj."\1"(', text)

    return text


def quote_unquoted_identifiers(text):
    """Quote PascalCase identifiers that aren't already quoted.

    In T-SQL, identifiers are case-insensitive so they're often unquoted.
    In PG, unquoted identifiers are lowercased, which breaks references to
    PascalCase column names created with quotes.

    This function quotes identifiers in alias.Column patterns like:
    - alias.CompanyID -> alias."CompanyID"
    - alias.Name -> alias."Name"

    And also standalone PascalCase columns in SELECT/WHERE/ON/ORDER BY like:
    - StartedAt -> "StartedAt"
    - AutoRunInterval -> "AutoRunInterval"
    """
    sql_keywords = {'AS', 'ON', 'IN', 'IS', 'OR', 'AND', 'NOT', 'NULL',
                   'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER',
                   'OUTER', 'FULL', 'CROSS', 'LATERAL', 'true', 'false',
                   'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'SET',
                   'TABLE', 'VIEW', 'INDEX', 'FUNCTION', 'TRIGGER',
                   'UNION', 'ALL', 'DISTINCT', 'GROUP', 'ORDER', 'BY',
                   'HAVING', 'LIMIT', 'OFFSET', 'BETWEEN', 'LIKE',
                   'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
                   'ASC', 'DESC', 'WITH', 'RECURSIVE', 'PARTITION',
                   'OVER', 'RANK', 'ROW', 'ROWS', 'RANGE',
                   'CASCADE', 'RESTRICT', 'ONLY', 'REPLACE', 'THEN',
                   'TRUE', 'FALSE', 'BOOLEAN', 'INTEGER', 'TEXT',
                   'VARCHAR', 'UUID', 'TIMESTAMP', 'TIMESTAMPTZ',
                   'COALESCE', 'CAST', 'LENGTH', 'STRPOS', 'SUBSTRING',
                   'COUNT', 'SUM', 'MAX', 'MIN', 'AVG', 'UPPER', 'LOWER',
                   'INITCAP', 'TRIM', 'LTRIM', 'RTRIM', 'NOW',
                   'RETURNS', 'BEGIN', 'DECLARE', 'RETURN', 'LANGUAGE',
                   'CREATE', 'DROP', 'ALTER', 'IF', 'ELSE', 'ELSIF',
                   'LOOP', 'FOR', 'WHILE', 'WHEN', 'THEN',
                   'PRIMARY', 'FOREIGN', 'KEY', 'REFERENCES',
                   'CONSTRAINT', 'CHECK', 'DEFAULT', 'UNIQUE',
                   'SCHEMA', 'GRANT', 'REVOKE', 'EXECUTE',
                   'NUMERIC', 'DOUBLE', 'PRECISION', 'REAL',
                   'SMALLINT', 'BIGINT', 'CHAR', 'DATE', 'TIME',
                   'INTERVAL', 'ARRAY', 'RECORD'}

    # Match alias.ColumnName where ColumnName starts with uppercase
    # Handles both "alias".Column and alias.Column patterns
    def quote_match(m):
        prefix = m.group(1)  # alias. (with optional quotes)
        ident = m.group(2)   # column name
        if ident.upper() in sql_keywords:
            return m.group(0)
        return f'{prefix}"{ident}"'

    # Match "alias".Column or alias.Column where Column starts with uppercase
    text = re.sub(r'((?:"\w+"|\w+)\.)([A-Z]\w+)\b(?!")', quote_match, text)

    # Handle standalone identifiers that start with uppercase
    # These are column names/aliases that PG will lowercase if unquoted
    def quote_standalone(m):
        ident = m.group(1)
        if ident.upper() in sql_keywords:
            return m.group(0)
        # Don't quote view names (already handled by quote_schema_view_refs)
        if ident.startswith('vw'):
            return m.group(0)
        # Don't quote function names
        if ident.startswith('fn') or ident.startswith('sp'):
            return m.group(0)
        # Don't quote if all uppercase (likely a type or keyword we missed)
        if ident == ident.upper():
            return m.group(0)
        # Don't quote table aliases (single lowercase letter or very short)
        if len(ident) <= 1:
            return m.group(0)
        return f'"{ident}"'

    # Match standalone identifiers starting with uppercase, not preceded by dot/quote/schema
    # and not already quoted. Must be at least 3 chars to avoid quoting aliases like AS
    text = re.sub(r'(?<![."_\w])([A-Z][a-z]\w+)\b(?!")', quote_standalone, text)

    return text


def convert_view_text(text):
    """Apply all conversions to a view definition."""
    text = bracket_to_pg(text)
    text = remove_collation(text)
    text = convert_n_strings(text)
    text = convert_isnull(text)
    text = convert_iif(text)
    text = convert_convert(text)
    text = convert_try_convert(text)
    text = convert_top_to_limit(text)
    text = convert_len(text)
    text = convert_charindex(text)
    text = convert_stuff(text)
    text = convert_outer_apply(text)
    text = convert_cross_apply(text)
    text = convert_string_concat(text)
    text = convert_getutcdate(text)
    text = convert_newid(text)

    # Convert CREATE VIEW to CREATE OR REPLACE VIEW
    text = re.sub(r'CREATE\s+VIEW\b', 'CREATE OR REPLACE VIEW', text, flags=re.I)

    # Finalize TOP -> LIMIT
    text = finalize_top_to_limit(text)

    # Add ON true for LATERAL joins
    text = apply_view_on_true(text)

    # Quote schema-prefixed and bare view references
    text = quote_schema_view_refs(text)

    # Quote unquoted PascalCase identifiers (after alias.)
    text = quote_unquoted_identifiers(text)

    # Fix boolean literals in comparisons
    text = re.sub(r'(?<=["\s)])=\s*1\b', '= true', text)
    text = re.sub(r'(?<=["\s)])=\s*0\b', '= false', text)

    return text


def extract_views(lines):
    """Extract all CREATE VIEW blocks from the source."""
    views = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        s = line.strip()

        # Look for CREATE VIEW
        if re.match(r'CREATE\s+VIEW\s+', s, re.I):
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


def process():
    lines = read_source()
    print(f"Read {len(lines)} lines from source")

    views = extract_views(lines)
    print(f"Found {len(views)} views")

    out = []
    out.append('')
    out.append('-- ================================================================')
    out.append('-- VIEWS')
    out.append('-- ================================================================')
    out.append('')

    # Views that reference SQL Server system catalog tables - need manual rewrite
    SYS_CATALOG_VIEWS = {
        'vwSQLTablesAndEntities', 'vwSQLColumnsAndEntityFields',
        'vwTableUniqueKeys', 'vwTablePrimaryKeys', 'vwForeignKeys',
        'vwSQLSchemas', 'vwEntityFieldsWithCheckConstraints',
        'vwEntitiesWithMissingBaseTables'
    }

    converted_count = 0
    skipped_count = 0
    for view_text in views:
        # Check if this view references sys catalog
        name_m = re.search(r'CREATE\s+VIEW\s+\S+\.\[?(\w+)\]?', view_text, re.I)
        view_name = name_m.group(1) if name_m else ''

        if view_name in SYS_CATALOG_VIEWS:
            out.append(f'-- SKIPPED: {view_name} - references SQL Server sys catalog tables')
            out.append(f'-- This view needs manual rewrite for PostgreSQL information_schema/pg_catalog')
            out.append('')
            skipped_count += 1
            continue

        try:
            converted = convert_view_text(view_text)
            out.append(converted)
            out.append(';')
            out.append('')
            converted_count += 1
        except Exception as e:
            out.append(f'-- ERROR converting view: {e}')
            out.append(f'-- Original text follows:')
            for line in view_text.split('\n')[:3]:
                out.append(f'-- {line}')
            out.append('')

    print(f"Converted {converted_count} views")

    # Append to existing output file
    with open(OUTPUT_APPEND, 'a', encoding='utf-8') as f:
        f.write('\n'.join(out))
        f.write('\n')

    print(f"Appended to {OUTPUT_APPEND}")


if __name__ == '__main__':
    process()
