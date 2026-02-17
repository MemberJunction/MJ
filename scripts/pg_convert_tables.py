#!/usr/bin/env python3
"""
Pass 1: Extract and convert all CREATE TABLE statements from the T-SQL baseline to PostgreSQL.

This includes:
- CREATE TABLE statements (converted types, defaults, constraints)
- ALTER TABLE ADD PRIMARY KEY
- ALTER TABLE ADD UNIQUE CONSTRAINT
- CREATE INDEX statements (interleaved with tables, lines 191-13328)
- CREATE TRIGGER statements (interleaved with tables)

Also processes:
- CHECK constraints (lines ~63016-63700)
- FOREIGN KEY constraints (lines ~63727-89900)

Output: PostgreSQL DDL file with tables, PKs, unique constraints, indexes, triggers, CHECKs, FKs
"""

import re
import sys

SOURCE = '/workspace/MJ/migrations/v4/B202602061600__v4.0__Baseline.sql'
OUTPUT = '/workspace/MJ/migrations-postgres/B202602061600__v4.0__Baseline.sql'
SCHEMA = '__mj'


def read_source():
    with open(SOURCE, 'r', encoding='utf-8-sig') as f:
        return f.readlines()


def bracket_to_pg(s):
    """Convert [schema].[name] references to __mj."name" """
    s = s.replace('[${flyway:defaultSchema}]', SCHEMA)
    s = s.replace('${flyway:defaultSchema}', SCHEMA)
    # Convert [identifier] to "identifier"
    s = re.sub(r'\[([^\]]+)\]', r'"\1"', s)
    return s


def convert_type(s):
    """Convert T-SQL column type declarations to PostgreSQL."""
    # Order matters - more specific patterns first
    s = re.sub(r'\[nvarchar\]\s*\(\s*max\s*\)', 'TEXT', s, flags=re.I)
    s = re.sub(r'\[nvarchar\]\s*\((\d+)\)', r'VARCHAR(\1)', s, flags=re.I)
    s = re.sub(r'\[varchar\]\s*\(\s*max\s*\)', 'TEXT', s, flags=re.I)
    s = re.sub(r'\[varchar\]\s*\((\d+)\)', r'VARCHAR(\1)', s, flags=re.I)
    s = re.sub(r'\[nchar\]\s*\((\d+)\)', r'CHAR(\1)', s, flags=re.I)
    s = re.sub(r'\[char\]\s*\((\d+)\)', r'CHAR(\1)', s, flags=re.I)
    s = re.sub(r'\[uniqueidentifier\]', 'UUID', s, flags=re.I)
    s = re.sub(r'\[datetimeoffset\](?:\s*\(\d+\))?', 'TIMESTAMPTZ', s, flags=re.I)
    s = re.sub(r'\[datetime2\]\s*\(\d+\)', 'TIMESTAMP', s, flags=re.I)
    s = re.sub(r'\[datetime2\]', 'TIMESTAMP', s, flags=re.I)
    s = re.sub(r'\[datetime\]', 'TIMESTAMP', s, flags=re.I)
    s = re.sub(r'\[smalldatetime\]', 'TIMESTAMP', s, flags=re.I)
    s = re.sub(r'\[date\]', 'DATE', s, flags=re.I)
    s = re.sub(r'\[time\]', 'TIME', s, flags=re.I)
    s = re.sub(r'\[bit\]', 'BOOLEAN', s, flags=re.I)
    s = re.sub(r'\[bigint\]', 'BIGINT', s, flags=re.I)
    s = re.sub(r'\[int\]', 'INTEGER', s, flags=re.I)
    s = re.sub(r'\[smallint\]', 'SMALLINT', s, flags=re.I)
    s = re.sub(r'\[tinyint\]', 'SMALLINT', s, flags=re.I)
    s = re.sub(r'\[float\]\s*\(\s*53\s*\)', 'DOUBLE PRECISION', s, flags=re.I)
    s = re.sub(r'\[float\]\s*\(\s*\d+\s*\)', 'DOUBLE PRECISION', s, flags=re.I)
    s = re.sub(r'\[float\]', 'DOUBLE PRECISION', s, flags=re.I)
    s = re.sub(r'\[real\]', 'REAL', s, flags=re.I)
    s = re.sub(r'\[decimal\]\s*\((\d+),\s*(\d+)\)', r'NUMERIC(\1,\2)', s, flags=re.I)
    s = re.sub(r'\[numeric\]\s*\((\d+),\s*(\d+)\)', r'NUMERIC(\1,\2)', s, flags=re.I)
    s = re.sub(r'\[money\]', 'NUMERIC(19,4)', s, flags=re.I)
    s = re.sub(r'\[smallmoney\]', 'NUMERIC(10,4)', s, flags=re.I)
    s = re.sub(r'\[varbinary\]\s*\(\s*max\s*\)', 'BYTEA', s, flags=re.I)
    s = re.sub(r'\[varbinary\]\s*\((\d+)\)', 'BYTEA', s, flags=re.I)
    s = re.sub(r'\[binary\]\s*\((\d+)\)', 'BYTEA', s, flags=re.I)
    s = re.sub(r'\[image\]', 'BYTEA', s, flags=re.I)
    s = re.sub(r'\[text\]', 'TEXT', s, flags=re.I)
    s = re.sub(r'\[ntext\]', 'TEXT', s, flags=re.I)
    s = re.sub(r'\[xml\]', 'XML', s, flags=re.I)
    s = re.sub(r'\[sql_variant\]', 'TEXT', s, flags=re.I)
    s = re.sub(r'\[sysname\]', 'VARCHAR(128)', s, flags=re.I)
    s = re.sub(r'\[hierarchyid\]', 'TEXT', s, flags=re.I)
    return s


def convert_defaults(s):
    """Convert T-SQL defaults to PG. Context-aware for BOOLEAN vs numeric."""
    # Remove named default constraints: CONSTRAINT [name] DEFAULT -> DEFAULT
    s = re.sub(r'CONSTRAINT\s+\[?[^\]\s]+\]?\s+DEFAULT', 'DEFAULT', s, flags=re.I)
    s = re.sub(r'CONSTRAINT\s+"[^"]+"\s+DEFAULT', 'DEFAULT', s, flags=re.I)

    # newsequentialid() / newid()
    s = re.sub(r'DEFAULT\s+\(newsequentialid\(\)\)', 'DEFAULT gen_random_uuid()', s, flags=re.I)
    s = re.sub(r'DEFAULT\s+\(newid\(\)\)', 'DEFAULT gen_random_uuid()', s, flags=re.I)

    # getutcdate() / sysdatetimeoffset()
    s = re.sub(r'DEFAULT\s+\(getutcdate\(\)\)', "DEFAULT (NOW() AT TIME ZONE 'UTC')", s, flags=re.I)
    s = re.sub(r'DEFAULT\s+\(getdate\(\)\)', 'DEFAULT NOW()', s, flags=re.I)
    s = re.sub(r'DEFAULT\s+\(sysdatetimeoffset\(\)\)', "DEFAULT (NOW() AT TIME ZONE 'UTC')", s, flags=re.I)

    # user_name() / suser_name() -> current_user
    s = re.sub(r'DEFAULT\s+\(user_name\(\)\)', 'DEFAULT current_user', s, flags=re.I)
    s = re.sub(r'DEFAULT\s+\(suser_name\(\)\)', 'DEFAULT current_user', s, flags=re.I)

    # Boolean: ((1)) -> true, ((0)) -> false ONLY if column type is BOOLEAN
    # Check if BOOLEAN appears before DEFAULT on this line
    is_bool = bool(re.search(r'\bBOOLEAN\b', s, re.I))
    if is_bool:
        s = re.sub(r'DEFAULT\s+\(\(1\)\)', 'DEFAULT true', s, flags=re.I)
        s = re.sub(r'DEFAULT\s+\(\(0\)\)', 'DEFAULT false', s, flags=re.I)
    # For non-boolean, just unwrap the parens to get numeric value
    # This is handled by the generic numeric rule below

    # Numeric: ((-1)) or ((N)) -> N
    s = re.sub(r'DEFAULT\s+\(\((-?\d+(?:\.\d+)?)\)\)', r'DEFAULT \1', s, flags=re.I)

    # String: (N'val') or ('val')
    s = re.sub(r"DEFAULT\s+\(N'([^']*)'\)", r"DEFAULT '\1'", s, flags=re.I)
    s = re.sub(r"DEFAULT\s+\('([^']*)'\)", r"DEFAULT '\1'", s, flags=re.I)

    return s


def remove_collation(s):
    return re.sub(r'\s+COLLATE\s+\S+', '', s, flags=re.I)


def remove_clustered(s):
    s = re.sub(r'\s+CLUSTERED\b', '', s, flags=re.I)
    s = re.sub(r'\s+NONCLUSTERED\b', '', s, flags=re.I)
    return s


def convert_identity(s):
    """Convert IDENTITY(1,1) to GENERATED ALWAYS AS IDENTITY."""
    return re.sub(r'\s+IDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)', ' GENERATED ALWAYS AS IDENTITY', s, flags=re.I)


def convert_table_line(line):
    """Convert a single line within a CREATE TABLE block."""
    line = convert_type(line)
    line = remove_collation(line)
    line = convert_defaults(line)
    line = convert_identity(line)
    line = bracket_to_pg(line)
    return line


def convert_check_expr(s):
    """Convert a CHECK constraint expression from T-SQL to PG."""
    s = bracket_to_pg(s)
    # BIT comparisons in CHECK: "col"=(0) -> "col"= false, "col"=(1) -> "col"= true
    # Use lookbehind to NOT match >=(0) or <=(0) or !=(0)
    # Only match = preceded by " (end of quoted identifier) or ) or space
    s = re.sub(r'(?<=["\s)])=\s*\(0\)', '= false', s)
    s = re.sub(r'(?<=["\s)])=\s*\(1\)', '= true', s)
    # Also handle <>(0) and <>(1)
    s = re.sub(r'<>\s*\(0\)', '<> false', s)
    s = re.sub(r'<>\s*\(1\)', '<> true', s)
    # Convert SQL Server functions
    s = re.sub(r'\blen\s*\(', 'LENGTH(', s, flags=re.I)
    s = re.sub(r'\bISNULL\s*\(', 'COALESCE(', s, flags=re.I)
    # ISJSON(col) -> (col)::jsonb IS NOT NULL (valid JSON check via cast)
    # Replace isjson(expr)= true with a PG-compatible JSON validation
    s = re.sub(r'isjson\(([^)]+)\)\s*=\s*true', r'__mj.is_valid_json(\1)', s, flags=re.I)
    s = re.sub(r'isjson\(([^)]+)\)\s*=\s*\(1\)', r'__mj.is_valid_json(\1)', s, flags=re.I)
    # Remove N prefix from strings
    s = re.sub(r"N'", "'", s)
    return s


def is_boilerplate(line):
    s = line.strip()
    if s == 'GO':
        return True
    if s.startswith('IF @@ERROR'):
        return True
    if s.startswith('PRINT N\''):
        return True
    if s.startswith('SET '):
        return True
    if s == '':
        return True
    return False


def process():
    lines = read_source()
    out = []

    # --- Header ---
    out.append('-- ================================================================')
    out.append('-- MemberJunction v4.0.x PostgreSQL Baseline Migration')
    out.append('-- Converted from T-SQL baseline: B202602061600__v4.0__Baseline.sql')
    out.append('-- ================================================================')
    out.append('')
    out.append('-- Ensure schema exists')
    out.append('CREATE SCHEMA IF NOT EXISTS __mj;')
    out.append('')

    # --- Roles and Users ---
    out.append('-- ================================================================')
    out.append('-- ROLES AND USERS')
    out.append('-- ================================================================')
    for role in ['cdp_BI', 'cdp_CodeGen', 'cdp_Developer', 'cdp_Integration', 'cdp_UI']:
        out.append(f"DO $$ BEGIN CREATE ROLE {role}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;")
    out.append('')
    for user in ['MJ_CodeGen', 'MJ_CodeGen_Dev', 'MJ_Connect', 'MJ_Connect_Dev']:
        out.append(f'DO $$ BEGIN CREATE ROLE "{user}" LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;')
    out.append('')
    memberships = [
        ('cdp_Developer', '"MJ_Connect"'), ('cdp_Developer', '"MJ_Connect_Dev"'),
        ('cdp_Integration', '"MJ_Connect"'), ('cdp_Integration', '"MJ_Connect_Dev"'),
        ('cdp_UI', '"MJ_Connect"'), ('cdp_UI', '"MJ_Connect_Dev"'),
    ]
    for role, member in memberships:
        out.append(f'GRANT {role} TO {member};')
    out.append(f'GRANT ALL ON SCHEMA __mj TO "MJ_CodeGen";')
    out.append(f'GRANT ALL ON SCHEMA __mj TO "MJ_CodeGen_Dev";')
    for role in ['cdp_Developer', 'cdp_Integration', 'cdp_UI', 'cdp_BI', 'cdp_CodeGen']:
        out.append(f'GRANT USAGE ON SCHEMA __mj TO {role};')
    out.append('')

    # Helper functions
    out.append('-- ================================================================')
    out.append('-- HELPER FUNCTIONS')
    out.append('-- ================================================================')
    out.append('CREATE OR REPLACE FUNCTION __mj.is_valid_json(p_text TEXT)')
    out.append('RETURNS BOOLEAN AS $$')
    out.append('BEGIN')
    out.append('    PERFORM p_text::jsonb;')
    out.append('    RETURN TRUE;')
    out.append('EXCEPTION WHEN OTHERS THEN')
    out.append('    RETURN FALSE;')
    out.append('END;')
    out.append('$$ LANGUAGE plpgsql IMMUTABLE;')
    out.append('')

    # ========================================================
    # PASS 1: Tables + PK + Unique + Indexes (lines 184 - ~13328)
    # Plus Triggers interleaved
    # ========================================================
    out.append('-- ================================================================')
    out.append('-- TABLES, PRIMARY KEYS, UNIQUE CONSTRAINTS, INDEXES, TRIGGERS')
    out.append('-- ================================================================')
    out.append('')

    i = 183  # 0-indexed, line 184 is the CREATE TYPE
    n = len(lines)
    table_count = 0
    trigger_count = 0
    index_count = 0
    pk_count = 0
    unique_count = 0

    # Keep going until we hit the first CREATE VIEW (around line 13329)
    while i < n:
        line = lines[i]
        s = line.strip()

        # Stop when we hit first CREATE VIEW
        if re.match(r'CREATE\s+VIEW\s+', s, re.I):
            break

        # Skip boilerplate
        if is_boilerplate(line):
            i += 1
            continue

        # === CREATE TYPE ===
        if re.match(r'CREATE\s+TYPE\s+', s, re.I):
            out.append('-- T-SQL table type (IDListTableType) - use TEXT[] in PG')
            # Skip until after closing paren
            while i < n and lines[i].strip() != 'GO':
                i += 1
            i += 1
            continue

        # === CREATE TABLE ===
        if re.match(r'CREATE\s+TABLE\s+', s, re.I):
            table_lines = []
            # Read until closing paren
            depth = 0
            started = False
            while i < n:
                ln = lines[i]
                st = ln.strip()
                if st == 'GO' and started and depth <= 0:
                    i += 1
                    break
                if st == 'GO' or st.startswith('IF @@ERROR'):
                    i += 1
                    continue

                depth += ln.count('(') - ln.count(')')
                if '(' in ln:
                    started = True

                table_lines.append(ln)
                i += 1

                if started and depth <= 0:
                    break

            # Convert table lines
            converted = []
            for tl in table_lines:
                converted.append(convert_table_line(tl))

            out.extend(converted)
            out.append(';')
            out.append('')
            table_count += 1
            continue

        # === ALTER TABLE ... PRIMARY KEY ===
        if re.match(r'ALTER\s+TABLE.*PRIMARY\s+KEY', s, re.I):
            cvt = bracket_to_pg(s)
            cvt = remove_clustered(cvt)
            out.append(cvt + ';')
            pk_count += 1
            i += 1
            continue

        # === ALTER TABLE ... UNIQUE ===
        if re.match(r'ALTER\s+TABLE.*UNIQUE\b', s, re.I):
            cvt = bracket_to_pg(s)
            cvt = remove_clustered(cvt)
            out.append(cvt + ';')
            unique_count += 1
            i += 1
            continue

        # === CREATE INDEX ===
        if re.match(r'CREATE\s+(NONCLUSTERED\s+|UNIQUE\s+NONCLUSTERED\s+)?INDEX\s+', s, re.I):
            full_idx = s
            # Check if the line continues (e.g., WHERE clause on next line)
            # Some indexes have INCLUDE and WHERE on the same or next line
            i += 1
            while i < n:
                nx = lines[i].strip()
                if nx == 'GO' or nx.startswith('IF @@ERROR') or nx.startswith('PRINT') or nx == '':
                    break
                if re.match(r'(CREATE|ALTER|INSERT|UPDATE|DELETE|GRANT)\s+', nx, re.I):
                    break
                full_idx += ' ' + nx
                i += 1

            cvt = bracket_to_pg(full_idx)
            cvt = remove_clustered(cvt)
            # Convert CREATE INDEX to CREATE INDEX IF NOT EXISTS
            cvt = re.sub(r'CREATE\s+INDEX\b', 'CREATE INDEX IF NOT EXISTS', cvt, flags=re.I)
            cvt = re.sub(r'CREATE\s+UNIQUE\s+INDEX\b', 'CREATE UNIQUE INDEX IF NOT EXISTS', cvt, flags=re.I)

            # Handle filtered indexes: WHERE clause with PG syntax
            # INCLUDE clause is supported in PG 11+

            out.append(cvt + ';')
            index_count += 1
            continue

        # === CREATE TRIGGER ===
        if re.match(r'CREATE\s+TRIGGER\s+', s, re.I):
            # Read trigger block
            trig_lines = []
            found_end = False
            while i < n:
                ln = lines[i]
                st = ln.strip()
                if st == 'GO':
                    if found_end:
                        i += 1
                        break
                    i += 1
                    continue
                if st.startswith('IF @@ERROR'):
                    i += 1
                    continue
                trig_lines.append(ln)
                if st.upper().rstrip(';') == 'END' or st.upper().startswith('END;'):
                    found_end = True
                    i += 1
                    break
                i += 1

            # Extract table name
            table_name = None
            for tl in trig_lines:
                m = re.search(r'ON\s+\[?\$?\{?flyway:defaultSchema\}?\]?\.\[?(\w+)\]?', tl, re.I)
                if m:
                    table_name = m.group(1)
                    break

            if table_name:
                fn = f'fn_trg_update_{table_name.lower()}'
                trg = f'trg_update_{table_name}'

                out.append(f'CREATE OR REPLACE FUNCTION {SCHEMA}.{fn}()')
                out.append('RETURNS TRIGGER AS $$')
                out.append('BEGIN')
                out.append(f"    NEW.\"__mj_UpdatedAt\" = NOW() AT TIME ZONE 'UTC';")
                out.append('    RETURN NEW;')
                out.append('END;')
                out.append('$$ LANGUAGE plpgsql;')
                out.append(f'DROP TRIGGER IF EXISTS "{trg}" ON {SCHEMA}."{table_name}";')
                out.append(f'CREATE TRIGGER "{trg}"')
                out.append(f'    BEFORE UPDATE ON {SCHEMA}."{table_name}"')
                out.append(f'    FOR EACH ROW')
                out.append(f'    EXECUTE FUNCTION {SCHEMA}.{fn}();')
                out.append('')
                trigger_count += 1
            continue

        # Skip anything else
        i += 1

    print(f"Pass 1 (tables section): {table_count} tables, {pk_count} PKs, {unique_count} UNIQUEs, {index_count} indexes, {trigger_count} triggers")

    # ========================================================
    # PASS 1b: CHECK constraints (lines ~63016-63700)
    # ========================================================
    out.append('')
    out.append('-- ================================================================')
    out.append('-- CHECK CONSTRAINTS')
    out.append('-- ================================================================')
    out.append('')

    check_count = 0
    # Scan the entire file for ALTER TABLE ... CHECK (
    for i in range(len(lines)):
        s = lines[i].strip()
        if re.match(r'ALTER\s+TABLE.*ADD\s+CONSTRAINT.*CHECK\s*\(', s, re.I):
            cvt = convert_check_expr(s)
            out.append(cvt + ';')
            check_count += 1

    print(f"Pass 1b: {check_count} CHECK constraints")

    # ========================================================
    # PASS 1c: FOREIGN KEY constraints (lines ~63727-89900)
    # ========================================================
    out.append('')
    out.append('-- ================================================================')
    out.append('-- FOREIGN KEY CONSTRAINTS')
    out.append('-- ================================================================')
    out.append('')

    fk_count = 0
    for i in range(len(lines)):
        s = lines[i].strip()
        if re.match(r'ALTER\s+TABLE.*ADD\s+CONSTRAINT.*FOREIGN\s+KEY', s, re.I):
            cvt = bracket_to_pg(s)
            out.append(cvt + ';')
            fk_count += 1

    print(f"Pass 1c: {fk_count} FOREIGN KEY constraints")

    # Post-processing: fix boolean comparisons in WHERE/CHECK expressions
    # Only convert "col"=(0)/(1) to boolean - must be preceded by " (end of quoted name)
    # This avoids converting >=(0), <=(0), !=(0) etc.
    for idx in range(len(out)):
        out[idx] = re.sub(r'"=\s*\(1\)', '"= true', out[idx])
        out[idx] = re.sub(r'"=\s*\(0\)', '"= false', out[idx])
        out[idx] = re.sub(r'<>\s*\(1\)', '<> true', out[idx])
        out[idx] = re.sub(r'<>\s*\(0\)', '<> false', out[idx])

    # Write output
    import os
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
        f.write('\n')

    print(f"\nTotal output: {len(out)} lines -> {OUTPUT}")


if __name__ == '__main__':
    process()
