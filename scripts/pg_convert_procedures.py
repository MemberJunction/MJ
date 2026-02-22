#!/usr/bin/env python3
"""
Pass 3: Extract and convert all CREATE PROCEDURE statements from the T-SQL baseline to PostgreSQL.

Handles three CRUD patterns:
- spCreate* -> CREATE OR REPLACE FUNCTION with INSERT ... RETURNING, returns view row
- spUpdate* -> CREATE OR REPLACE FUNCTION with UPDATE, returns view row
- spDelete* -> CREATE OR REPLACE FUNCTION with DELETE, returns ID

Also handles 3 utility procedures that are skipped (need manual rewrite).
"""

import re
import sys

SOURCE = '/workspace/MJ/migrations/v4/B202602061600__v4.0__Baseline.sql'
OUTPUT = '/workspace/MJ/scripts/pg_procedures_output.sql'
SCHEMA = '__mj'


def read_source():
    with open(SOURCE, 'r', encoding='utf-8-sig') as f:
        return f.readlines()


def bracket_to_pg(s):
    s = s.replace('[${flyway:defaultSchema}]', SCHEMA)
    s = s.replace('${flyway:defaultSchema}', SCHEMA)
    s = re.sub(r'\[([^\]]+)\]', r'"\1"', s)
    return s


def convert_type_name(t):
    tl = t.lower().strip()
    if tl == 'uniqueidentifier':
        return 'UUID'
    m = re.match(r'nvarchar\s*\(\s*max\s*\)', tl)
    if m:
        return 'TEXT'
    m = re.match(r'nvarchar\s*\((\d+)\)', tl)
    if m:
        return f'VARCHAR({m.group(1)})'
    m = re.match(r'varchar\s*\(\s*max\s*\)', tl)
    if m:
        return 'TEXT'
    m = re.match(r'varchar\s*\((\d+)\)', tl)
    if m:
        return f'VARCHAR({m.group(1)})'
    if tl == 'bit':
        return 'BOOLEAN'
    if tl == 'int' or tl == 'integer':
        return 'INTEGER'
    if tl == 'bigint':
        return 'BIGINT'
    if tl == 'smallint' or tl == 'tinyint':
        return 'SMALLINT'
    if tl == 'float' or re.match(r'float\s*\(\d+\)', tl):
        return 'DOUBLE PRECISION'
    if tl in ('datetime', 'datetime2') or re.match(r'datetime2\s*\(\d+\)', tl):
        return 'TIMESTAMP'
    if tl == 'datetimeoffset' or re.match(r'datetimeoffset\s*\(\d+\)', tl):
        return 'TIMESTAMPTZ'
    if tl == 'date':
        return 'DATE'
    if tl == 'time':
        return 'TIME'
    if tl == 'xml':
        return 'XML'
    m = re.match(r'decimal\s*\((\d+),\s*(\d+)\)', tl)
    if m:
        return f'NUMERIC({m.group(1)},{m.group(2)})'
    m = re.match(r'numeric\s*\((\d+),\s*(\d+)\)', tl)
    if m:
        return f'NUMERIC({m.group(1)},{m.group(2)})'
    if tl == 'money':
        return 'NUMERIC(19,4)'
    if tl == 'smallmoney':
        return 'NUMERIC(10,4)'
    m = re.match(r'varbinary\s*\(\s*max\s*\)', tl)
    if m:
        return 'BYTEA'
    m = re.match(r'varbinary\s*\((\d+)\)', tl)
    if m:
        return 'BYTEA'
    if tl == 'varbinary':
        return 'BYTEA'
    m = re.match(r'nchar\s*\((\d+)\)', tl)
    if m:
        return f'CHAR({m.group(1)})'
    if tl == 'nchar':
        return 'CHAR(1)'
    m = re.match(r'char\s*\((\d+)\)', tl)
    if m:
        return f'CHAR({m.group(1)})'
    return t.upper()


def extract_procedures(lines):
    """Extract all CREATE PROCEDURE blocks from the source."""
    procedures = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        s = line.strip()

        if re.match(r'CREATE\s+PROCEDURE\s+', s, re.I):
            proc_lines = []
            begin_depth = 0
            found_begin = False

            while i < n:
                s2 = lines[i].strip()
                if s2 == 'GO':
                    i += 1
                    break
                if s2.startswith('IF @@ERROR'):
                    i += 1
                    continue
                if s2.startswith('PRINT N\''):
                    i += 1
                    continue

                proc_lines.append(lines[i].rstrip())

                upper = s2.upper()
                # Count BEGIN/END depth - handle multiple on same line
                begin_count = len(re.findall(r'\bBEGIN\b', upper))
                end_count = len(re.findall(r'\bEND\b', upper))

                if begin_count > 0:
                    found_begin = True
                begin_depth += begin_count - end_count

                # Only break at the outermost END
                if found_begin and begin_depth <= 0 and end_count > 0:
                    i += 1
                    break

                i += 1

            procedures.append('\n'.join(proc_lines))
        else:
            i += 1

    return procedures


def parse_procedure(text):
    """Parse a CREATE PROCEDURE to extract name, params, and body."""
    # Get procedure name
    name_m = re.search(
        r'CREATE\s+PROCEDURE\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?',
        text, re.I
    )
    proc_name = name_m.group(1) if name_m else 'unknown'

    # Get parameters - find text between procedure name and AS
    params = []
    # Find the AS keyword that starts the body
    as_match = re.search(r'\n\s*AS\s*\n', text, re.I)
    if not as_match:
        as_match = re.search(r'\bAS\s*\n\s*BEGIN\b', text, re.I)

    if as_match:
        # Parameter text is between procedure name line and AS
        header = text[:as_match.start()]
        # Parse parameters: @Name type [= default]
        for m in re.finditer(
            r'@(\w+)\s+(\w+(?:\s*\([^)]*\))?)\s*(?:=\s*([^,\n]+))?',
            header
        ):
            pname = m.group(1)
            ptype = m.group(2)
            pdefault = m.group(3).strip() if m.group(3) else None
            params.append((pname, ptype, pdefault))

    # Extract body - find the outer BEGIN and match to its closing END
    # using depth tracking rather than greedy regex
    begin_match = re.search(r'\bBEGIN\b', text, re.I)
    if begin_match:
        pos = begin_match.end()
        depth = 1
        # Walk through text tracking BEGIN/END depth
        remaining = text[pos:]
        body_end = len(remaining)
        scan_pos = 0
        while scan_pos < len(remaining):
            # Check for BEGIN or END keywords at word boundaries
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


def detect_proc_type(proc_name, body):
    """Detect if this is a spCreate, spUpdate, or spDelete procedure."""
    if proc_name.startswith('spCreate'):
        return 'create'
    if proc_name.startswith('spUpdate'):
        return 'update'
    if proc_name.startswith('spDelete'):
        return 'delete'
    return 'utility'


def find_table_name(body, proc_name, proc_type):
    """Extract the target table name from the procedure body."""
    schema_pat = r'\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?'

    if proc_type == 'create':
        m = re.search(r'INSERT\s+INTO\s+' + schema_pat, body, re.I)
    elif proc_type == 'update':
        m = re.search(r'UPDATE\s+' + schema_pat, body, re.I)
    elif proc_type == 'delete':
        # Find ALL DELETE FROM matches and take the LAST one
        # (cascade deletes have multiple DELETEs; the main one is last)
        matches = list(re.finditer(r'DELETE\s+FROM\s+' + schema_pat, body, re.I))
        m = matches[-1] if matches else None
    else:
        m = None

    if m:
        return m.group(1)

    # Fallback: infer table name from procedure name
    if proc_type == 'create' and proc_name.startswith('spCreate'):
        return proc_name[8:]  # Remove 'spCreate' prefix
    if proc_type == 'update' and proc_name.startswith('spUpdate'):
        return proc_name[8:]  # Remove 'spUpdate' prefix
    if proc_type == 'delete' and proc_name.startswith('spDelete'):
        return proc_name[8:]  # Remove 'spDelete' prefix

    return None


def find_view_name(body):
    """Extract the view name used for returning results."""
    m = re.search(
        r'FROM\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(vw\w+)\]?',
        body, re.I
    )
    return m.group(1) if m else None


def find_insert_columns(body):
    """Extract the column names from the INSERT INTO statement."""
    # Find INSERT INTO ... (col1, col2, ...) - with ID
    m_with_id = re.search(
        r'IF\s+@ID\s+IS\s+NOT\s+NULL.*?INSERT\s+INTO\s+\S+\s*\(([^)]+)\)',
        body, re.I | re.DOTALL
    )
    # Find INSERT INTO ... (col1, col2, ...) - without ID
    m_without_id = re.search(
        r'ELSE.*?INSERT\s+INTO\s+\S+\s*\(([^)]+)\)',
        body, re.I | re.DOTALL
    )

    cols_with_id = []
    cols_without_id = []

    if m_with_id:
        cols_with_id = [c.strip().strip('[]"') for c in m_with_id.group(1).split(',')]
    if m_without_id:
        cols_without_id = [c.strip().strip('[]"') for c in m_without_id.group(1).split(',')]

    return cols_with_id, cols_without_id


def find_update_columns(body, params):
    """Extract the SET column = @param pairs from an UPDATE statement."""
    # Find SET clause
    m = re.search(r'\bSET\b(.*?)\bWHERE\b', body, re.I | re.DOTALL)
    if not m:
        return []

    set_text = m.group(1)
    pairs = []
    for pm in re.finditer(r'\[?(\w+)\]?\s*=\s*@(\w+)', set_text):
        pairs.append((pm.group(1), pm.group(2)))
    return pairs


def convert_default(default_val, pg_type):
    """Convert a T-SQL default value to PostgreSQL."""
    if default_val is None:
        return None
    d = default_val.strip().rstrip(',')
    if d.upper() == 'NULL':
        return 'NULL'
    if d == '0' and pg_type == 'BOOLEAN':
        return 'false'
    if d == '1' and pg_type == 'BOOLEAN':
        return 'true'
    # String default
    if d.startswith("N'"):
        return d[1:]  # Remove N prefix
    if d.startswith("'"):
        return d
    return d


def build_params_string(params):
    """Build PostgreSQL function parameter string.

    PostgreSQL requires that parameters with defaults come AFTER parameters
    without defaults. We reorder to satisfy this constraint.
    """
    pg_params_required = []
    pg_params_optional = []

    for pname, ptype, pdefault in params:
        pg_type = convert_type_name(ptype)
        if pdefault is not None:
            pg_default = convert_default(pdefault, pg_type)
            pg_params_optional.append(f'IN p_{pname} {pg_type} DEFAULT {pg_default}')
        else:
            pg_params_required.append(f'IN p_{pname} {pg_type}')

    return ', '.join(pg_params_required + pg_params_optional)


def convert_create_proc(proc_name, params, body, table_name, view_name):
    """Convert a spCreate procedure to PostgreSQL function."""
    out = []
    params_str = build_params_string(params)
    has_id_param = any(p[0] == 'ID' for p in params)

    cols_with_id, cols_without_id = find_insert_columns(body)

    # If we couldn't parse columns, fall back to params
    if not cols_with_id and not cols_without_id:
        all_cols = [p[0] for p in params]
        cols_with_id = all_cols
        cols_without_id = [c for c in all_cols if c != 'ID']

    # Build column and value strings
    def col_str(cols):
        return ', '.join(f'"{c}"' for c in cols)

    def val_str(cols):
        return ', '.join(f'p_{c}' for c in cols)

    return_type = f'SETOF {SCHEMA}."{view_name}"' if view_name else 'TABLE("ID" UUID)'
    if not view_name:
        return_type = 'TABLE("ID" UUID)'

    out.append(f'CREATE OR REPLACE FUNCTION {SCHEMA}."{proc_name}"({params_str})')
    out.append(f'RETURNS {return_type} AS $$')
    out.append('DECLARE')
    out.append('    v_id UUID;')
    out.append('BEGIN')

    if has_id_param:
        out.append('    IF p_ID IS NOT NULL THEN')
        if cols_with_id:
            out.append(f'        INSERT INTO {SCHEMA}."{table_name}"')
            out.append(f'            ({col_str(cols_with_id)})')
            out.append(f'        VALUES')
            out.append(f'            ({val_str(cols_with_id)})')
        else:
            out.append(f'        INSERT INTO {SCHEMA}."{table_name}" DEFAULT VALUES')
        out.append('        RETURNING "ID" INTO v_id;')
        out.append('    ELSE')
        if cols_without_id:
            out.append(f'        INSERT INTO {SCHEMA}."{table_name}"')
            out.append(f'            ({col_str(cols_without_id)})')
            out.append(f'        VALUES')
            out.append(f'            ({val_str(cols_without_id)})')
        else:
            out.append(f'        INSERT INTO {SCHEMA}."{table_name}" DEFAULT VALUES')
        out.append('        RETURNING "ID" INTO v_id;')
        out.append('    END IF;')
    else:
        if cols_without_id:
            out.append(f'    INSERT INTO {SCHEMA}."{table_name}"')
            out.append(f'        ({col_str(cols_without_id)})')
            out.append(f'    VALUES')
            out.append(f'        ({val_str(cols_without_id)})')
        else:
            out.append(f'    INSERT INTO {SCHEMA}."{table_name}" DEFAULT VALUES')
        out.append('    RETURNING "ID" INTO v_id;')

    if view_name:
        out.append(f'    RETURN QUERY SELECT * FROM {SCHEMA}."{view_name}" WHERE "ID" = v_id;')
    else:
        out.append('    RETURN QUERY SELECT v_id AS "ID";')

    out.append('END;')
    out.append('$$ LANGUAGE plpgsql;')
    return out


def convert_update_proc(proc_name, params, body, table_name, view_name):
    """Convert a spUpdate procedure to PostgreSQL function."""
    out = []
    params_str = build_params_string(params)

    update_pairs = find_update_columns(body, params)

    # If we couldn't parse SET clause, fall back to params (excluding ID)
    if not update_pairs:
        update_pairs = [(p[0], p[0]) for p in params if p[0] != 'ID']

    set_clauses = [f'"{col}" = p_{param}' for col, param in update_pairs]
    set_str = ',\n        '.join(set_clauses)

    return_type = f'SETOF {SCHEMA}."{view_name}"' if view_name else 'TABLE("ID" UUID)'

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
    return out


def convert_delete_proc(proc_name, params, body, table_name):
    """Convert a spDelete procedure to PostgreSQL function."""
    out = []
    params_str = build_params_string(params)

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
    return out


# Procedures to skip (utility procs needing manual rewrite, or reference non-existent objects)
SKIP_PROCS = {
    'CAREFUL_MoveDatesToNewSpecialFields_Then_Drop_Old_CreatedAt_And_UpdatedAt_Columns',
    'spRecompileAllProceduresInDependencyOrder',
    'spRecompileAllViews',
    'spUpdateSchemaInfoFromDatabase',
    'spUpdateExistingEntitiesFromSchema',
    'spCreateUserViewRunWithDetail',
    # EntityBehavior tables/views don't exist in baseline (generated by CodeGen)
    'spCreateEntityBehaviorType',
    'spUpdateEntityBehaviorType',
    'spDeleteEntityBehaviorType',
    'spCreateEntityBehavior',
    'spUpdateEntityBehavior',
    'spDeleteEntityBehavior',
}


def convert_procedure(text):
    """Convert a single T-SQL procedure to PostgreSQL function."""
    proc_name, params, body = parse_procedure(text)

    if proc_name in SKIP_PROCS:
        return [f'-- SKIPPED utility procedure: {proc_name} (needs manual rewrite for PostgreSQL)'], proc_name, 'skipped'

    proc_type = detect_proc_type(proc_name, body)

    if proc_type == 'utility':
        return [f'-- SKIPPED utility procedure: {proc_name} (needs manual rewrite for PostgreSQL)'], proc_name, 'skipped'

    table_name = find_table_name(body, proc_name, proc_type)
    if not table_name:
        return [f'-- ERROR: Could not find table name in {proc_name}'], proc_name, 'error'

    view_name = find_view_name(body) if proc_type != 'delete' else None

    if proc_type == 'create':
        result = convert_create_proc(proc_name, params, body, table_name, view_name)
    elif proc_type == 'update':
        result = convert_update_proc(proc_name, params, body, table_name, view_name)
    elif proc_type == 'delete':
        result = convert_delete_proc(proc_name, params, body, table_name)
    else:
        result = [f'-- TODO: Manual conversion needed for {proc_name}']

    return result, proc_name, proc_type


def process():
    lines = read_source()
    print(f"Read {len(lines)} lines from source")

    procedures = extract_procedures(lines)
    print(f"Found {len(procedures)} procedures")

    out = []
    out.append('')
    out.append('-- ================================================================')
    out.append('-- STORED PROCEDURES (converted to PostgreSQL functions)')
    out.append('-- ================================================================')
    out.append('')

    counts = {'create': 0, 'update': 0, 'delete': 0, 'skipped': 0, 'error': 0}

    for proc_text in procedures:
        try:
            converted, proc_name, proc_type = convert_procedure(proc_text)
            out.extend(converted)
            out.append('')
            counts[proc_type] = counts.get(proc_type, 0) + 1
        except Exception as e:
            name_m = re.search(r'CREATE\s+PROCEDURE\s+\S+\.(\w+)', proc_text, re.I)
            fname = name_m.group(1) if name_m else 'unknown'
            out.append(f'-- ERROR converting procedure {fname}: {e}')
            out.append('')
            counts['error'] += 1

    print(f"Converted: {counts['create']} create, {counts['update']} update, "
          f"{counts['delete']} delete, {counts['skipped']} skipped, {counts['error']} errors")

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
        f.write('\n')

    print(f"Written to {OUTPUT}")


if __name__ == '__main__':
    process()
