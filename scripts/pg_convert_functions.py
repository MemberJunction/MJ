#!/usr/bin/env python3
"""
Pass 2b: Extract and convert all CREATE FUNCTION statements from the T-SQL baseline to PostgreSQL.

Must be run BEFORE views since views reference these functions (via LATERAL joins).

Handles:
- Table-valued functions (TVFs) with recursive CTEs -> RETURNS TABLE functions
- Scalar functions -> RETURNS type functions
- GetProgrammaticName, ToProperCase, ToTitleCase, fnInitials, parseDomainFromEmail, parseDomain, ExtractVersionComponents
"""

import re
import sys

SOURCE = '/workspace/MJ/migrations/v4/B202602061600__v4.0__Baseline.sql'
OUTPUT = '/workspace/MJ/scripts/pg_functions_output.sql'
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
    if tl in ('datetime', 'datetime2'):
        return 'TIMESTAMP'
    if tl == 'datetimeoffset':
        return 'TIMESTAMPTZ'
    if tl == 'xml':
        return 'XML'
    if tl == 'table':
        return 'TABLE'
    return t.upper()


def extract_functions(lines):
    """Extract all CREATE FUNCTION blocks from the source."""
    functions = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        s = line.strip()

        if re.match(r'CREATE\s+FUNCTION\s+', s, re.I):
            func_lines = []
            depth = 0
            started = False
            found_return = False
            found_begin = False
            begin_depth = 0

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

                func_lines.append(lines[i].rstrip())

                upper = s2.upper()
                if upper == 'BEGIN':
                    found_begin = True
                    begin_depth += 1
                if 'BEGIN' in upper and found_begin:
                    begin_depth += upper.count('BEGIN') - 1  # Already counted

                if found_begin and 'END' in upper:
                    begin_depth -= upper.count('END')
                    if begin_depth <= 0 and upper.rstrip(';').endswith('END'):
                        i += 1
                        break

                i += 1

            functions.append('\n'.join(func_lines))
        else:
            i += 1

    return functions


def convert_tvf_function(text, func_name, params):
    """Convert a table-valued function with recursive CTE to PostgreSQL."""
    out = []

    # Convert parameter types
    pg_params = []
    for pname, ptype in params:
        pg_type = convert_type_name(ptype)
        pg_params.append(f'p_{pname} {pg_type}')
    params_str = ', '.join(pg_params)

    # Apply text conversions
    text = bracket_to_pg(text)
    text = remove_collation(text)
    text = re.sub(r"N'([^']*)'", r"'\1'", text)
    text = re.sub(r'\bISNULL\s*\(', 'COALESCE(', text, flags=re.I)
    text = re.sub(r'\bGETUTCDATE\s*\(\)', "NOW() AT TIME ZONE 'UTC'", text, flags=re.I)

    # Convert @param to p_param
    for pname, _ in params:
        text = re.sub(r'@' + pname + r'\b', f'p_{pname}', text, flags=re.I)

    # Extract the CTE body
    # Find RETURN ( ... ) block
    return_match = re.search(r'RETURN\s*\((.+)\)', text, re.I | re.DOTALL)
    if not return_match:
        # Try without the outer parens
        return_match = re.search(r'RETURN\s+(.+?)$', text, re.I | re.DOTALL)

    if return_match:
        body = return_match.group(1).strip()
        # Remove trailing ) if present
        if body.endswith(');'):
            body = body[:-2]
        elif body.endswith(')'):
            body = body[:-1]

        # Add WITH RECURSIVE for recursive CTEs
        body = re.sub(r'\bWITH\s+CTE_', 'WITH RECURSIVE CTE_', body, flags=re.I)

        # Convert SELECT TOP 1 to LIMIT 1
        body = re.sub(r'SELECT\s+TOP\s+(\d+)\b', r'SELECT', body, flags=re.I)
        # We need to add LIMIT at the end
        if 'ORDER BY' in body.upper():
            body = body.rstrip() + f'\n    LIMIT 1'
        else:
            body = body.rstrip() + f'\n    LIMIT 1'

        out.append(f'CREATE OR REPLACE FUNCTION {SCHEMA}."{func_name}"({params_str})')
        out.append(f'RETURNS TABLE("RootID" UUID) AS $$')
        out.append(f'BEGIN')
        out.append(f'    RETURN QUERY')
        out.append(f'    {body};')
        out.append(f'END;')
        out.append(f'$$ LANGUAGE plpgsql;')
    else:
        out.append(f'-- COULD NOT PARSE TVF: {func_name}')

    return out


def convert_scalar_function(text, func_name, params, return_type):
    """Convert a scalar function to PostgreSQL."""
    out = []

    text = bracket_to_pg(text)
    text = remove_collation(text)
    text = re.sub(r"N'([^']*)'", r"'\1'", text)

    # Convert parameter types
    pg_params = []
    for pname, ptype in params:
        pg_type = convert_type_name(ptype)
        pg_params.append(f'p_{pname} {pg_type}')
    params_str = ', '.join(pg_params)

    pg_return_type = convert_type_name(return_type)

    # Convert @param to p_param
    for pname, _ in params:
        text = re.sub(r'@' + pname + r'\b', f'p_{pname}', text, flags=re.I)

    # Specific known scalar functions with proper implementations
    if func_name == 'GetProgrammaticName':
        return convert_get_programmatic_name(params_str)
    elif func_name == 'ToProperCase':
        return convert_to_proper_case(params_str)
    elif func_name == 'ToTitleCase':
        return convert_to_title_case(params_str)
    elif func_name == 'fnInitials':
        return convert_fn_initials(params_str)
    elif func_name == 'parseDomainFromEmail':
        return convert_parse_domain_from_email(params_str)
    elif func_name == 'parseDomain':
        return convert_parse_domain(params_str)
    elif func_name == 'ExtractVersionComponents':
        return convert_extract_version_components(params_str)

    # For unknown scalar functions, create stub
    if pg_return_type == 'VOID' or pg_return_type == 'TABLE':
        pg_return_type = 'TEXT'

    out.append(f'-- Scalar function: {func_name}')
    out.append(f'-- TODO: Manual review may be needed for complex logic')
    out.append(f'CREATE OR REPLACE FUNCTION {SCHEMA}."{func_name}"({params_str})')
    out.append(f'RETURNS {pg_return_type} AS $$')
    out.append(f'BEGIN')
    out.append(f'    RETURN NULL;')
    out.append(f'END;')
    out.append(f'$$ LANGUAGE plpgsql;')

    return out


def convert_get_programmatic_name(params_str):
    """Convert GetProgrammaticName - removes non-alphanumeric chars."""
    return [
        f'CREATE OR REPLACE FUNCTION {SCHEMA}."GetProgrammaticName"({params_str})',
        'RETURNS TEXT AS $$',
        'BEGIN',
        "    RETURN regexp_replace(p_input, '[^a-zA-Z0-9]', '', 'g');",
        'END;',
        '$$ LANGUAGE plpgsql IMMUTABLE;',
    ]


def convert_to_proper_case(params_str):
    """Convert ToProperCase - capitalize first letter of each word."""
    return [
        f'CREATE OR REPLACE FUNCTION {SCHEMA}."ToProperCase"({params_str})',
        'RETURNS VARCHAR(255) AS $$',
        'BEGIN',
        '    RETURN INITCAP(p_string);',
        'END;',
        '$$ LANGUAGE plpgsql IMMUTABLE;',
    ]


def convert_to_title_case(params_str):
    """Convert ToTitleCase."""
    return [
        f'CREATE OR REPLACE FUNCTION {SCHEMA}."ToTitleCase"({params_str})',
        'RETURNS VARCHAR(4000) AS $$',
        'BEGIN',
        '    RETURN INITCAP(p_InputString);',
        'END;',
        '$$ LANGUAGE plpgsql IMMUTABLE;',
    ]


def convert_fn_initials(params_str):
    """Convert fnInitials - get initials from text."""
    return [
        f'CREATE OR REPLACE FUNCTION {SCHEMA}."fnInitials"({params_str})',
        'RETURNS TEXT AS $$',
        'DECLARE',
        '    v_result TEXT := \'\';',
        '    v_word TEXT;',
        'BEGIN',
        "    FOR v_word IN SELECT regexp_split_to_table(TRIM(p_text), '\\s+') LOOP",
        '        IF LENGTH(v_word) > 0 THEN',
        "            v_result := v_result || UPPER(SUBSTRING(v_word, 1, 1)) || '. ';",
        '        END IF;',
        '    END LOOP;',
        '    RETURN RTRIM(v_result);',
        'END;',
        '$$ LANGUAGE plpgsql IMMUTABLE;',
    ]


def convert_parse_domain_from_email(params_str):
    """Convert parseDomainFromEmail."""
    return [
        f'CREATE OR REPLACE FUNCTION {SCHEMA}."parseDomainFromEmail"({params_str})',
        'RETURNS TEXT AS $$',
        'DECLARE',
        '    v_at_pos INTEGER;',
        '    v_domain TEXT;',
        'BEGIN',
        "    v_at_pos := STRPOS(p_Email, '@');",
        '    IF v_at_pos = 0 THEN RETURN NULL; END IF;',
        '    v_domain := SUBSTRING(p_Email, v_at_pos + 1);',
        f'    RETURN {SCHEMA}."parseDomain"(v_domain);',
        'END;',
        '$$ LANGUAGE plpgsql IMMUTABLE;',
    ]


def convert_parse_domain(params_str):
    """Convert parseDomain - extract root domain from URL."""
    return [
        f'CREATE OR REPLACE FUNCTION {SCHEMA}."parseDomain"({params_str})',
        'RETURNS TEXT AS $$',
        'DECLARE',
        '    v_url TEXT;',
        '    v_parts TEXT[];',
        'BEGIN',
        '    v_url := p_url;',
        "    -- Remove protocol",
        "    v_url := regexp_replace(v_url, '^https?://', '', 'i');",
        "    -- Remove path",
        "    v_url := SPLIT_PART(v_url, '/', 1);",
        "    -- Get last two parts (domain.tld)",
        "    v_parts := string_to_array(v_url, '.');",
        '    IF array_length(v_parts, 1) >= 2 THEN',
        "        RETURN v_parts[array_length(v_parts, 1) - 1] || '.' || v_parts[array_length(v_parts, 1)];",
        '    ELSE',
        '        RETURN v_url;',
        '    END IF;',
        'END;',
        '$$ LANGUAGE plpgsql IMMUTABLE;',
    ]


def convert_extract_version_components(params_str):
    """Convert ExtractVersionComponents - multi-statement TVF."""
    return [
        f'CREATE OR REPLACE FUNCTION {SCHEMA}."ExtractVersionComponents"({params_str})',
        'RETURNS TABLE("Version" VARCHAR(100), "Major" VARCHAR(10), "Minor" VARCHAR(10), "Patch" VARCHAR(10), "VersionDescription" VARCHAR(500)) AS $$',
        'DECLARE',
        '    v_cleaned TEXT;',
        '    v_version TEXT;',
        '    v_parts TEXT[];',
        '    v_desc TEXT;',
        'BEGIN',
        "    v_cleaned := TRIM(p_Description);",
        "    IF v_cleaned LIKE 'v%' THEN v_cleaned := SUBSTRING(v_cleaned, 2); END IF;",
        "    -- Extract version number (digits and dots at the start)",
        "    v_version := (regexp_match(v_cleaned, '^([0-9x.]+)'))[1];",
        '    IF v_version IS NULL THEN RETURN; END IF;',
        "    v_desc := TRIM(SUBSTRING(v_cleaned, LENGTH(v_version) + 1));",
        "    v_parts := string_to_array(v_version, '.');",
        '    RETURN QUERY SELECT',
        '        v_version::VARCHAR(100),',
        '        COALESCE(v_parts[1], \'\')::VARCHAR(10),',
        '        COALESCE(v_parts[2], \'\')::VARCHAR(10),',
        '        COALESCE(v_parts[3], \'\')::VARCHAR(10),',
        '        v_desc::VARCHAR(500);',
        'END;',
        '$$ LANGUAGE plpgsql IMMUTABLE;',
    ]


def parse_function(text):
    """Parse a CREATE FUNCTION to extract name, params, return type, and type (TVF vs scalar)."""
    # Get function name
    name_m = re.search(r'CREATE\s+FUNCTION\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?', text, re.I)
    func_name = name_m.group(1) if name_m else 'unknown'

    # Get parameters - extract text between function name ( and ) RETURNS
    params = []
    # Find opening paren after function name, then balance parens to find the param section
    fname_end = re.search(r'CREATE\s+FUNCTION\s+\S+\s*\(', text, re.I)
    if fname_end:
        open_pos = fname_end.end() - 1  # position of (
        depth = 1
        pos = open_pos + 1
        while pos < len(text) and depth > 0:
            if text[pos] == '(':
                depth += 1
            elif text[pos] == ')':
                depth -= 1
            pos += 1
        param_text = text[open_pos + 1:pos - 1]

        for m in re.finditer(r'@(\w+)\s+(\w+(?:\s*\([^)]*\))?)', param_text):
            params.append((m.group(1), m.group(2)))

    # Get return type
    returns_m = re.search(r'RETURNS\s+(\w+(?:\s*\([^)]*\))?)', text, re.I)
    return_type = returns_m.group(1) if returns_m else 'VOID'

    # Determine type
    is_tvf = return_type.upper() == 'TABLE'
    is_inline_tvf = 'RETURN\n(' in text or 'RETURN\r\n(' in text or 'RETURN (' in text or re.search(r'RETURN\s*\(', text, re.I)

    return func_name, params, return_type, is_tvf


def convert_function(text):
    """Convert a single T-SQL function to PostgreSQL."""
    func_name, params, return_type, is_tvf = parse_function(text)

    if is_tvf:
        return convert_tvf_function(text, func_name, params)
    else:
        return convert_scalar_function(text, func_name, params, return_type)


def process():
    lines = read_source()
    print(f"Read {len(lines)} lines from source")

    functions = extract_functions(lines)
    print(f"Found {len(functions)} functions")

    out = []
    out.append('')
    out.append('-- ================================================================')
    out.append('-- FUNCTIONS (TVFs and Scalar)')
    out.append('-- ================================================================')
    out.append('')

    converted_count = 0
    for func_text in functions:
        try:
            converted = convert_function(func_text)
            out.extend(converted)
            out.append('')
            converted_count += 1
        except Exception as e:
            func_name_m = re.search(r'CREATE\s+FUNCTION\s+\S+\.(\w+)', func_text, re.I)
            fname = func_name_m.group(1) if func_name_m else 'unknown'
            out.append(f'-- ERROR converting function {fname}: {e}')
            out.append('')

    print(f"Converted {converted_count} functions")

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
        f.write('\n')

    print(f"Written to {OUTPUT}")


if __name__ == '__main__':
    process()
