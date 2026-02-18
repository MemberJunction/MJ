#!/usr/bin/env python3
"""
Pass 5: Extract and convert seed data INSERT statements and constraint management
from the T-SQL baseline to PostgreSQL.

Converts:
- NOCHECK CONSTRAINT section -> SET session_replication_role = 'replica'
- INSERT INTO [schema].[Table] (...) VALUES (...) -> PostgreSQL syntax
- CHECK CONSTRAINT section -> SET session_replication_role = 'DEFAULT'
- N'string' -> 'string'
- BIT 0/1 -> FALSE/TRUE in boolean column positions

Only processes lines in the seed data section (after GRANT statements, starting
from the NOCHECK CONSTRAINT section through the CHECK CONSTRAINT section).
"""

import re
import sys

SOURCE = '/workspace/MJ/migrations/v4/B202602061600__v4.0__Baseline.sql'
OUTPUT = '/workspace/MJ/scripts/pg_seeddata_output.sql'
PG_BASELINE = '/workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql'
SCHEMA = '__mj'


def read_source_lines():
    with open(SOURCE, 'r', encoding='utf-8-sig') as f:
        return f.readlines()


def read_pg_baseline():
    try:
        with open(PG_BASELINE, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return ''


def build_boolean_column_map(pg_text):
    """Build a map of table -> set of boolean column names from CREATE TABLE statements."""
    bool_map = {}
    current_table = None

    for line in pg_text.split('\n'):
        # Match CREATE TABLE __mj."TableName" - the ( may be on the same or next line
        tm = re.match(r'\s*CREATE\s+TABLE\s+__mj\."(\w+)"', line, re.I)
        if tm:
            current_table = tm.group(1)
            bool_map[current_table] = set()
            continue

        if current_table:
            # Match column definition with BOOLEAN type
            cm = re.match(r'\s*"(\w+)"\s+BOOLEAN\b', line, re.I)
            if cm:
                bool_map[current_table].add(cm.group(1))

            # End of CREATE TABLE - look for ); or ) followed by ;
            stripped = line.strip()
            if stripped == ');' or stripped == ')':
                current_table = None

    return bool_map


def extract_check_constraints(pg_text):
    """Extract all CHECK constraint definitions from the PG baseline.

    Returns list of (table_name, constraint_name, full_statement) tuples.
    """
    constraints = []
    for line in pg_text.split('\n'):
        m = re.match(
            r'\s*ALTER\s+TABLE\s+__mj\."(\w+)"\s+'
            r'ADD\s+CONSTRAINT\s+"(\w+)"\s+'
            r'CHECK\s*\((.+)\)\s*;',
            line.strip(), re.I
        )
        if m:
            table_name = m.group(1)
            constraint_name = m.group(2)
            check_expr = m.group(3)
            constraints.append((table_name, constraint_name, check_expr))
    return constraints


def find_seed_section(lines):
    """Find the line range for the seed data section (NOCHECK through CHECK)."""
    # Find first NOCHECK CONSTRAINT line (not inside a procedure)
    nocheck_start = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Looking for ALTER TABLE ... NOCHECK CONSTRAINT at the start of a line (not indented = not in proc)
        if (stripped.startswith('ALTER TABLE') and 'NOCHECK CONSTRAINT' in stripped
                and 'WITH CHECK' not in stripped and not line.startswith('    ')):
            nocheck_start = i
            break

    if nocheck_start is None:
        # Fallback: find first PRINT('Add rows to' which marks seed data start
        for i, line in enumerate(lines):
            if "PRINT(N'Add rows to" in line:
                nocheck_start = i
                break

    # Find last WITH CHECK CHECK CONSTRAINT line
    check_end = len(lines) - 1
    for i in range(len(lines) - 1, -1, -1):
        stripped = lines[i].strip()
        if 'WITH CHECK CHECK CONSTRAINT' in stripped:
            check_end = i
            break

    return nocheck_start or 0, check_end


def extract_inserts(lines, start, end):
    """Extract INSERT statements from the seed section, joining multi-line ones.

    Uses a boundary-based approach: each INSERT runs from its start line until
    the line before the next INSERT, PRINT, GO, IF, ALTER, or end of section.
    """
    inserts = []
    # First pass: find all INSERT start line indices
    insert_starts = []
    for i in range(start, end + 1):
        stripped = lines[i].strip()
        if (stripped.startswith('INSERT INTO [${flyway:defaultSchema}]')
                and not lines[i].startswith('    ')
                and not lines[i].startswith('\t')):
            insert_starts.append(i)

    # Second pass: for each INSERT, collect lines until the next boundary
    for idx, line_num in enumerate(insert_starts):
        # Determine end boundary
        if idx + 1 < len(insert_starts):
            boundary = insert_starts[idx + 1]
        else:
            boundary = end + 1

        # Collect all lines from this INSERT to the boundary, skipping
        # GO, IF, PRINT lines that appear between INSERTs
        parts = []
        for j in range(line_num, boundary):
            line_stripped = lines[j].strip()
            if not line_stripped:
                continue
            if line_stripped in ('GO', 'GO;'):
                continue
            if line_stripped.startswith('IF @@ERROR'):
                continue
            if line_stripped.startswith('PRINT('):
                continue
            if line_stripped.startswith('PRINT N'):
                continue
            if j > line_num and line_stripped.startswith('INSERT INTO'):
                break
            parts.append(lines[j].rstrip('\n').rstrip('\r'))

        full_insert = '\n'.join(parts)
        inserts.append(full_insert)

    return inserts


def bracket_to_pg(s):
    """Convert bracket notation to PostgreSQL quoting."""
    s = s.replace('[${flyway:defaultSchema}]', SCHEMA)
    s = s.replace('${flyway:defaultSchema}', SCHEMA)
    s = re.sub(r'\[([^\]]+)\]', r'"\1"', s)
    return s


def remove_nprefix(s):
    """Remove N' prefix from Unicode string literals at value boundaries only.

    Only matches N' when preceded by a comma+space, open paren, or start of string.
    Does NOT replace N' that appears inside a string value.
    """
    # N' at start of string
    if s.startswith("N'"):
        s = s[1:]
    # N' after (, or ,<space>
    s = re.sub(r"(\()\s*N'", r"\1'", s)
    s = re.sub(r"(,)\s*N'", r"\1 '", s)
    return s


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

    bool_indices = set()
    for i, name in enumerate(col_names):
        if name in bool_columns:
            bool_indices.add(i)

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
    """Extract table name, column list, and values from an INSERT statement."""
    # Match: INSERT INTO [schema].[Table] ([cols]) VALUES (vals)
    # The values may span multiple lines
    m = re.match(
        r"INSERT\s+INTO\s+\[\$\{flyway:defaultSchema\}\]\.\[(\w+)\]\s*"
        r"\(([^)]+)\)\s*VALUES\s*\(",
        insert_text, re.I | re.DOTALL
    )
    if not m:
        return None, None, None

    table_name = m.group(1)
    columns_str = m.group(2)
    col_names = [c.strip().strip('[]') for c in columns_str.split(',')]

    # Extract the VALUES content - everything between VALUES( and the final )
    vals_start = m.end()  # position right after VALUES(
    vals_text = insert_text[vals_start:]
    # Walk forward to find the closing ), respecting single-quoted strings
    depth = 1
    end_pos = 0
    in_string = False
    i = 0
    while i < len(vals_text):
        ch = vals_text[i]
        if ch == "'" and not in_string:
            in_string = True
        elif ch == "'" and in_string:
            if i + 1 < len(vals_text) and vals_text[i + 1] == "'":
                i += 1  # skip escaped quote
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
    values_str = vals_text[:end_pos]

    return table_name, col_names, values_str


def strip_cast_nvarchar(s):
    """Strip CAST(... AS NVARCHAR(MAX)) wrappers and merge concatenated parts.

    T-SQL uses CAST(N'...' AS NVARCHAR(MAX)) for long strings, sometimes
    concatenated: CAST(N'...' AS NVARCHAR(MAX)) + N'...more text...'
    We need to:
    1. Remove the CAST( prefix before a string literal
    2. Merge '...' AS NVARCHAR(MAX)) + N'...' into '......'
    3. Handle standalone ' AS NVARCHAR(MAX)) without concatenation
    """
    # Remove CAST( before a string literal (handles both N' and ')
    s = re.sub(r'\bCAST\(\s*N?(?=\')', '', s, flags=re.I)
    # Merge: ' AS NVARCHAR(MAX)) + N'  ->  (nothing, merging the strings)
    s = re.sub(r"'\s*AS\s+NVARCHAR\s*\([^)]*\)\s*\)\s*\+\s*N?'", '', s, flags=re.I)
    # Handle standalone AS NVARCHAR(MAX)) without + concatenation
    s = re.sub(r"'\s+AS\s+NVARCHAR\s*\([^)]*\)\s*\)", "'", s, flags=re.I)
    return s


def merge_string_concat(s):
    """Merge T-SQL string concatenation 'text1' + 'text2' into 'text1text2'.

    In T-SQL, long string values are sometimes broken with + concatenation.
    PostgreSQL uses || for concatenation, but it's cleaner to just merge them.
    Handles both regular quotes and N-prefixed quotes:
    '...' + '...' -> '......'
    '...' + N'...' -> '......'
    """
    s = re.sub(r"'\s*\+\s*N?'", '', s)
    return s


def trim_padded_strings(values_str):
    """Trim trailing whitespace from NCHAR-padded string values.

    SQL Server NCHAR columns pad with spaces. In PG, VARCHAR comparison is exact,
    so padded values like 'Complete       ' fail CHECK constraints expecting 'Complete'.
    """
    # Replace pattern: 'text<spaces>' with 'text' (spaces inside single-quoted value before closing quote)
    return re.sub(r"(\S)\s+'(?=\s*[,)])", r"\1'", values_str)


def convert_insert(insert_text, bool_map):
    """Convert a single INSERT statement to PostgreSQL."""
    table_name, col_names, values_str = extract_columns_and_values(insert_text)

    if table_name is None:
        return None

    pg_columns = [f'"{c}"' for c in col_names]
    bool_cols = bool_map.get(table_name, set())

    values_str = remove_nprefix(values_str)
    values_str = strip_cast_nvarchar(values_str)
    values_str = merge_string_concat(values_str)
    values_str = trim_padded_strings(values_str)
    # Note: bracket_to_pg is NOT called on values_str because all brackets
    # in VALUES content are data (JSON arrays, JS bracket notation) inside
    # string literals, not SQL identifiers. Converting them would corrupt data.
    values_str = convert_bit_to_boolean(values_str, col_names, bool_cols)

    cols_str = ', '.join(pg_columns)
    return f'INSERT INTO {SCHEMA}."{table_name}" ({cols_str}) VALUES ({values_str});'


def main():
    print('  Reading source and PG baseline...')
    lines = read_source_lines()
    pg_text = read_pg_baseline()

    print('  Building boolean column map...')
    bool_map = build_boolean_column_map(pg_text)
    total_bool_cols = sum(len(v) for v in bool_map.values())
    print(f'    Found {total_bool_cols} boolean columns across {len(bool_map)} tables')

    print('  Extracting CHECK constraints...')
    check_constraints = extract_check_constraints(pg_text)
    print(f'    Found {len(check_constraints)} CHECK constraints')

    print('  Finding seed data section...')
    seed_start, seed_end = find_seed_section(lines)
    print(f'    Seed section: lines {seed_start + 1} to {seed_end + 1}')

    print('  Extracting INSERT statements...')
    inserts = extract_inserts(lines, seed_start, seed_end)
    print(f'    Found {len(inserts)} INSERT statements')

    # Convert INSERTs
    converted_inserts = []
    failed = 0
    for insert_text in inserts:
        result = convert_insert(insert_text, bool_map)
        if result:
            converted_inserts.append(result)
        else:
            preview = insert_text[:120].replace('\n', ' ')
            print(f'    WARNING: Could not parse INSERT: {preview}...')
            failed += 1

    # Write output
    with open(OUTPUT, 'w') as f:
        f.write('\n-- ============================================\n')
        f.write('-- SEED DATA\n')
        f.write('-- ============================================\n\n')

        # Disable FK triggers for bulk data loading
        f.write('-- Disable FK triggers for bulk data loading\n')
        f.write("SET session_replication_role = 'replica';\n\n")

        # Drop CHECK constraints (T-SQL uses NOCHECK, PG needs DROP)
        if check_constraints:
            f.write('-- Temporarily drop CHECK constraints for seed data loading\n')
            for table_name, constraint_name, _ in check_constraints:
                f.write(f'ALTER TABLE {SCHEMA}."{table_name}" DROP CONSTRAINT IF EXISTS "{constraint_name}";\n')
            f.write('\n')

        current_table = None
        for ins in converted_inserts:
            tm = re.match(r'INSERT INTO __mj\."(\w+)"', ins)
            if tm:
                tbl = tm.group(1)
                if tbl != current_table:
                    if current_table:
                        f.write('\n')
                    f.write(f'-- {tbl}\n')
                    current_table = tbl
            f.write(ins + '\n')

        f.write('\n')

        # Re-add CHECK constraints as NOT VALID (skips validation of existing rows)
        if check_constraints:
            f.write('-- Re-add CHECK constraints (NOT VALID to skip existing row validation)\n')
            for table_name, constraint_name, check_expr in check_constraints:
                f.write(f'ALTER TABLE {SCHEMA}."{table_name}" ADD CONSTRAINT "{constraint_name}" CHECK ({check_expr}) NOT VALID;\n')
            f.write('\n')

        # Re-enable FK triggers
        f.write('-- Re-enable FK triggers\n')
        f.write("SET session_replication_role = 'origin';\n\n")

    print(f'  Converted: {len(converted_inserts)} INSERT statements')
    if failed:
        print(f'  Failed:    {failed}')


if __name__ == '__main__':
    main()
