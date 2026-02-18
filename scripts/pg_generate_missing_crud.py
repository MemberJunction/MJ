#!/usr/bin/env python3
"""
Generate missing PostgreSQL CRUD functions from SQL Server stored procedures.
Queries SQL Server for each missing SP definition and converts to PG function syntax.
"""

import subprocess
import re
import sys
import os

# Database connection info
SQL_SERVER = "sql-claude"
SQL_USER = "sa"
SQL_PASS = "Claude2Sql99"
SQL_DB = "MJ_Workbench"
PG_HOST = "postgres-claude"
PG_USER = "mj_admin"
PG_PASS = "Claude2Pg99"
PG_DB = "MJ_Workbench_PG"

# SQL Server type to PG type mapping
TYPE_MAP = {
    'uniqueidentifier': 'UUID',
    'nvarchar(max)': 'TEXT',
    'nvarchar(MAX)': 'TEXT',
    'varchar(max)': 'TEXT',
    'varchar(MAX)': 'TEXT',
    'ntext': 'TEXT',
    'text': 'TEXT',
    'bigint': 'BIGINT',
    'int': 'INTEGER',
    'smallint': 'SMALLINT',
    'tinyint': 'SMALLINT',
    'bit': 'BOOLEAN',
    'float': 'DOUBLE PRECISION',
    'real': 'REAL',
    'decimal': 'NUMERIC',
    'numeric': 'NUMERIC',
    'money': 'NUMERIC(19,4)',
    'smallmoney': 'NUMERIC(10,4)',
    'datetime': 'TIMESTAMP',
    'datetime2': 'TIMESTAMP',
    'datetimeoffset': 'TIMESTAMPTZ',
    'smalldatetime': 'TIMESTAMP',
    'date': 'DATE',
    'time': 'TIME',
    'image': 'BYTEA',
    'varbinary': 'BYTEA',
    'binary': 'BYTEA',
    'xml': 'XML',
    'sql_variant': 'TEXT',
    'geography': 'TEXT',
    'geometry': 'TEXT',
    'hierarchyid': 'TEXT',
}

# Special procs that need manual handling (not standard CRUD pattern)
SKIP_PROCS = {
    'spCreateVirtualEntity',  # Inserts into Entity + EntityField tables
}


def run_sqlcmd(query: str) -> str:
    """Execute a SQL Server query and return the raw output."""
    cmd = [
        'sqlcmd', '-S', SQL_SERVER, '-U', SQL_USER, '-P', SQL_PASS,
        '-C', '-d', SQL_DB, '-Q', query, '-y', '0'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return result.stdout


def run_psql(query: str) -> str:
    """Execute a PostgreSQL query and return the output."""
    env = os.environ.copy()
    env['PGPASSWORD'] = PG_PASS
    cmd = [
        'psql', '-h', PG_HOST, '-U', PG_USER, '-d', PG_DB,
        '-t', '-A', '-c', query
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=env)
    return result.stdout.strip()


def get_sp_definition(sp_name: str) -> str:
    """Get the full SP definition from SQL Server using OBJECT_DEFINITION."""
    output = run_sqlcmd(f"SET NOCOUNT ON; SELECT OBJECT_DEFINITION(OBJECT_ID('__mj.{sp_name}'))")
    text = output.strip()
    text = re.sub(r'\n\s*\(\d+ rows? affected\)\s*$', '', text)
    text = re.sub(r'\n-+\s*$', '', text)
    return text.strip()


def map_sql_type(sql_type: str) -> str:
    """Map a SQL Server type to PostgreSQL type."""
    sql_type_clean = sql_type.strip().lower()

    # Handle nvarchar(N)
    m = re.match(r'nvarchar\((\d+|max)\)', sql_type_clean)
    if m:
        size = m.group(1)
        if size.lower() == 'max':
            return 'TEXT'
        return f'CHARACTER VARYING({size})'

    m = re.match(r'varchar\((\d+|max)\)', sql_type_clean)
    if m:
        size = m.group(1)
        if size.lower() == 'max':
            return 'TEXT'
        return f'CHARACTER VARYING({size})'

    m = re.match(r'n?char\((\d+)\)', sql_type_clean)
    if m:
        return f'CHARACTER({m.group(1)})'

    m = re.match(r'(?:decimal|numeric)\((\d+),\s*(\d+)\)', sql_type_clean)
    if m:
        return f'NUMERIC({m.group(1)},{m.group(2)})'

    m = re.match(r'varbinary\((\d+|max)\)', sql_type_clean)
    if m:
        return 'BYTEA'

    m = re.match(r'binary\((\d+)\)', sql_type_clean)
    if m:
        return 'BYTEA'

    m = re.match(r'datetime2\((\d+)\)', sql_type_clean)
    if m:
        return 'TIMESTAMP'

    m = re.match(r'datetimeoffset\((\d+)\)', sql_type_clean)
    if m:
        return 'TIMESTAMPTZ'

    m = re.match(r'time\((\d+)\)', sql_type_clean)
    if m:
        return 'TIME'

    m = re.match(r'float\((\d+)\)', sql_type_clean)
    if m:
        return 'DOUBLE PRECISION'

    if sql_type_clean in TYPE_MAP:
        return TYPE_MAP[sql_type_clean]

    print(f"  WARNING: Unknown type '{sql_type}', using TEXT", file=sys.stderr)
    return 'TEXT'


def parse_parameters(sp_text: str) -> list[dict]:
    """Parse parameters from a CREATE PROCEDURE statement."""
    params = []
    lines = sp_text.split('\n')
    in_params = False
    param_text = ''

    for line in lines:
        stripped = line.strip()
        if stripped.upper().startswith('CREATE PROC'):
            in_params = True
            continue
        if in_params:
            # Check for AS keyword on its own line or at start of line
            if re.match(r'^AS\b', stripped, re.IGNORECASE):
                break
            if stripped == 'BEGIN':
                break
            param_text += ' ' + stripped

    # Parse individual parameters
    param_pattern = re.compile(
        r'@(\w+)\s+'
        r'([\w]+(?:\([\w,\s]+\))?)'  # type with optional size
        r'(?:\s*=\s*(\S+))?'  # optional default
    )

    for match in param_pattern.finditer(param_text):
        name = match.group(1)
        sql_type = match.group(2)
        default = match.group(3)

        pg_type = map_sql_type(sql_type)

        params.append({
            'name': name,
            'sql_type': sql_type,
            'pg_type': pg_type,
            'default': default
        })

    return params


def get_table_name_from_sp(sp_name: str) -> str:
    """Extract table name from SP name. e.g., spCreateAction -> Action"""
    for prefix in ['spCreate', 'spUpdate', 'spDelete']:
        if sp_name.startswith(prefix):
            return sp_name[len(prefix):]
    return sp_name


def get_view_from_sp_text(sp_text: str) -> str:
    """Extract the view name from the SELECT * FROM statement in the SP."""
    m = re.search(r'FROM\s+\[?__mj\]?\.\[?(vw\w+)\]?', sp_text)
    if m:
        return m.group(1)
    return None


def find_view_name_in_pg(table_name: str) -> str:
    """Find the actual view name for a table in PostgreSQL."""
    candidates = [
        f'vw{table_name}s',
        f'vw{table_name}es',
        f'vw{table_name}',
    ]
    if table_name.endswith('y'):
        candidates.insert(0, f'vw{table_name[:-1]}ies')
    if table_name.endswith('s'):
        candidates.append(f'vw{table_name}es')

    for candidate in candidates:
        result = run_psql(
            f"SELECT table_name FROM information_schema.views "
            f"WHERE table_schema = '__mj' AND table_name = '{candidate}'"
        )
        if result:
            return result
    return None


def convert_default_value(default: str, pg_type: str) -> str:
    """Convert a SQL Server default value to PostgreSQL."""
    if default is None:
        return None

    default = default.strip().rstrip(',')

    if default.upper() == 'NULL':
        return f'NULL::{pg_type}'

    if re.match(r'^-?\d+\.?\d*$', default):
        if pg_type == 'BOOLEAN':
            return 'TRUE' if default != '0' else 'FALSE'
        return default

    if default.startswith("'") and default.endswith("'"):
        return default

    return default


def ensure_defaults_after_first_default(params: list[dict]) -> list[dict]:
    """
    PostgreSQL requires that once a parameter has a default, all subsequent
    parameters must also have defaults. This function adds DEFAULT NULL to any
    parameters that follow the first defaulted parameter but lack a default.
    """
    found_default = False
    result = []
    for p in params:
        p = dict(p)  # copy
        if p['default'] is not None:
            found_default = True
        elif found_default:
            # This parameter follows a defaulted one but has no default
            p['default'] = 'NULL'
        result.append(p)
    return result


def build_param_str(params: list[dict]) -> str:
    """Build the parameter string for CREATE FUNCTION."""
    parts = []
    for p in params:
        pg_default = convert_default_value(p['default'], p['pg_type'])
        s = f'p_{p["name"]} {p["pg_type"]}'
        if pg_default:
            s += f' DEFAULT {pg_default}'
        parts.append(s)
    return ',\n    '.join(parts)


def get_isnull_default(sp_text: str, param_name: str, pg_type: str) -> str:
    """Check if the SP uses ISNULL(@param, default) and return the PG equivalent."""
    # Match ISNULL(@param, value) where value can be:
    # - a simple literal: 0, 1, 'text', NULL
    # - a function call: SYSDATETIMEOFFSET(), GETDATE(), GETUTCDATE()
    # We need to handle nested parentheses properly
    pattern = rf'ISNULL\(\s*@{re.escape(param_name)}\s*,\s*'
    m = re.search(pattern, sp_text, re.IGNORECASE)
    if not m:
        return None

    # Find the matching closing paren, handling nested parens
    start = m.end()
    depth = 1
    pos = start
    while pos < len(sp_text) and depth > 0:
        if sp_text[pos] == '(':
            depth += 1
        elif sp_text[pos] == ')':
            depth -= 1
        pos += 1

    if depth != 0:
        return None

    val = sp_text[start:pos - 1].strip()

    # Convert SQL Server functions to PG equivalents
    val_upper = val.upper()
    if val_upper == 'SYSDATETIMEOFFSET()':
        val = 'NOW()'
    elif val_upper in ('GETDATE()', 'GETUTCDATE()'):
        val = 'NOW()'
    elif val_upper == 'NEWID()':
        val = 'gen_random_uuid()'
    elif val_upper == 'NEWSEQUENTIALID()':
        val = 'gen_random_uuid()'

    if val == '0' and pg_type == 'BOOLEAN':
        return 'FALSE'
    elif val == '1' and pg_type == 'BOOLEAN':
        return 'TRUE'
    return val


def generate_create_function(sp_name: str, sp_text: str) -> str:
    """Generate a PostgreSQL CREATE function from a SQL Server CREATE SP."""
    table_name = get_table_name_from_sp(sp_name)
    params = parse_parameters(sp_text)
    params = ensure_defaults_after_first_default(params)

    view_name = get_view_from_sp_text(sp_text)
    if not view_name:
        view_name = find_view_name_in_pg(table_name)
    if not view_name:
        print(f"  WARNING: Could not find view for {sp_name}, skipping", file=sys.stderr)
        return None

    # Verify view exists in PG
    view_exists = run_psql(
        f"SELECT COUNT(*) FROM information_schema.views "
        f"WHERE table_schema = '__mj' AND table_name = '{view_name}'"
    )
    if not view_exists or view_exists == '0':
        print(f"  WARNING: View {view_name} does not exist in PG, skipping {sp_name}", file=sys.stderr)
        return None

    params_str = build_param_str(params)

    non_id_params = [p for p in params if p['name'].upper() != 'ID']
    all_params = params
    has_id = any(p['name'].upper() == 'ID' for p in params)

    # Columns for INSERT with ID
    id_insert_cols = ', '.join([f'"{p["name"]}"' for p in all_params])
    # VALUES for INSERT with ID (with COALESCE for ISNULL patterns)
    id_vals = []
    for p in all_params:
        isnull_def = get_isnull_default(sp_text, p['name'], p['pg_type'])
        if isnull_def:
            id_vals.append(f'COALESCE(p_{p["name"]}, {isnull_def})')
        else:
            id_vals.append(f'p_{p["name"]}')
    id_vals_str = ', '.join(id_vals)

    # Columns for INSERT without ID
    no_id_insert_cols = ', '.join([f'"{p["name"]}"' for p in non_id_params])
    no_id_vals = []
    for p in non_id_params:
        isnull_def = get_isnull_default(sp_text, p['name'], p['pg_type'])
        if isnull_def:
            no_id_vals.append(f'COALESCE(p_{p["name"]}, {isnull_def})')
        else:
            no_id_vals.append(f'p_{p["name"]}')
    no_id_vals_str = ', '.join(no_id_vals)

    if has_id:
        return f"""CREATE OR REPLACE FUNCTION __mj."{sp_name}"(
    {params_str}
)
RETURNS SETOF __mj."{view_name}"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."{table_name}"
            ({id_insert_cols})
        VALUES
            ({id_vals_str})
        RETURNING "ID" INTO v_id;
    ELSE
        INSERT INTO __mj."{table_name}"
            ({no_id_insert_cols})
        VALUES
            ({no_id_vals_str})
        RETURNING "ID" INTO v_id;
    END IF;
    RETURN QUERY SELECT * FROM __mj."{view_name}" WHERE "ID" = v_id;
END;
$function$;"""
    else:
        all_cols = ', '.join([f'"{p["name"]}"' for p in params])
        all_vals = []
        for p in params:
            isnull_def = get_isnull_default(sp_text, p['name'], p['pg_type'])
            if isnull_def:
                all_vals.append(f'COALESCE(p_{p["name"]}, {isnull_def})')
            else:
                all_vals.append(f'p_{p["name"]}')
        all_vals_str = ', '.join(all_vals)

        return f"""CREATE OR REPLACE FUNCTION __mj."{sp_name}"(
    {params_str}
)
RETURNS SETOF __mj."{view_name}"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO __mj."{table_name}"
        ({all_cols})
    VALUES
        ({all_vals_str})
    RETURNING "ID" INTO v_id;
    RETURN QUERY SELECT * FROM __mj."{view_name}" WHERE "ID" = v_id;
END;
$function$;"""


def generate_update_function(sp_name: str, sp_text: str) -> str:
    """Generate a PostgreSQL UPDATE function from a SQL Server UPDATE SP."""
    table_name = get_table_name_from_sp(sp_name)
    params = parse_parameters(sp_text)
    params = ensure_defaults_after_first_default(params)

    view_name = get_view_from_sp_text(sp_text)
    if not view_name:
        view_name = find_view_name_in_pg(table_name)
    if not view_name:
        print(f"  WARNING: Could not find view for {sp_name}, skipping", file=sys.stderr)
        return None

    # Verify view exists in PG
    view_exists = run_psql(
        f"SELECT COUNT(*) FROM information_schema.views "
        f"WHERE table_schema = '__mj' AND table_name = '{view_name}'"
    )
    if not view_exists or view_exists == '0':
        print(f"  WARNING: View {view_name} does not exist in PG, skipping {sp_name}", file=sys.stderr)
        return None

    params_str = build_param_str(params)

    non_id_params = [p for p in params if p['name'].upper() != 'ID']
    set_parts = [f'"{p["name"]}" = p_{p["name"]}' for p in non_id_params]
    set_str = ',\n        '.join(set_parts)

    return f"""CREATE OR REPLACE FUNCTION __mj."{sp_name}"(
    {params_str}
)
RETURNS SETOF __mj."{view_name}"
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    UPDATE __mj."{table_name}"
    SET
        {set_str}
    WHERE "ID" = p_ID;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    RETURN QUERY SELECT * FROM __mj."{view_name}" WHERE "ID" = p_ID;
END;
$function$;"""


def generate_delete_function(sp_name: str, sp_text: str) -> str:
    """Generate a PostgreSQL DELETE function from a SQL Server DELETE SP."""
    table_name = get_table_name_from_sp(sp_name)
    params = parse_parameters(sp_text)

    if not params:
        print(f"  WARNING: No parameters found for {sp_name}", file=sys.stderr)
        return None

    pk_param = params[0]
    pk_type = pk_param['pg_type']
    pk_name = pk_param['name']

    return f"""CREATE OR REPLACE FUNCTION __mj."{sp_name}"(
    p_{pk_name} {pk_type}
)
RETURNS TABLE("{pk_name}" {pk_type})
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rowcount INTEGER;
BEGIN
    DELETE FROM __mj."{table_name}"
    WHERE "{pk_name}" = p_{pk_name};

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
        RETURN QUERY SELECT NULL::{pk_type} AS "{pk_name}";
    ELSE
        RETURN QUERY SELECT p_{pk_name} AS "{pk_name}";
    END IF;
END;
$function$;"""


def main():
    with open('/tmp/missing_standard_crud.txt', 'r') as f:
        missing = [line.strip() for line in f if line.strip()]

    print(f"Processing {len(missing)} missing CRUD functions...")

    all_sql = []
    errors = []
    skipped = []

    for sp_name in missing:
        if sp_name in SKIP_PROCS:
            skipped.append(sp_name)
            print(f"  Skipping (special): {sp_name}")
            continue

        print(f"  Converting: {sp_name}")

        try:
            sp_text = get_sp_definition(sp_name)
            if not sp_text or len(sp_text) < 20:
                errors.append(f"{sp_name}: Could not get SP definition")
                continue

            if sp_name.startswith('spCreate'):
                pg_sql = generate_create_function(sp_name, sp_text)
            elif sp_name.startswith('spUpdate'):
                pg_sql = generate_update_function(sp_name, sp_text)
            elif sp_name.startswith('spDelete'):
                pg_sql = generate_delete_function(sp_name, sp_text)
            else:
                errors.append(f"{sp_name}: Unknown SP type")
                continue

            if pg_sql:
                all_sql.append(f"-- {sp_name}")
                all_sql.append(pg_sql)
                all_sql.append("")
            else:
                errors.append(f"{sp_name}: Generation returned None (likely missing view)")
        except Exception as e:
            errors.append(f"{sp_name}: {str(e)}")
            import traceback
            traceback.print_exc()

    output_file = '/tmp/pg_missing_crud.sql'
    with open(output_file, 'w') as f:
        f.write("-- Auto-generated PostgreSQL CRUD functions for missing SQL Server SPs\n")
        f.write(f"-- Total functions: {len([s for s in all_sql if s.startswith('-- sp')])}\n\n")
        f.write('\n'.join(all_sql))

    generated = len([s for s in all_sql if s.startswith('-- sp')])
    print(f"\nGenerated SQL written to {output_file}")
    print(f"Functions generated: {generated}")
    print(f"Skipped (special): {len(skipped)}")

    if errors:
        print(f"\nErrors ({len(errors)}):")
        for e in errors:
            print(f"  {e}")

    return 0 if not errors else 1


if __name__ == '__main__':
    sys.exit(main())
