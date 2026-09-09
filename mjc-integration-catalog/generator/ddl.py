"""
DDL, constraints, indexes and base views for the per-connection catalog tables.

Nothing here invents a column definition. The source table's own columns are lifted verbatim from
the v5.51.0 baseline, so a type, a collation or a default cannot drift between the declared table
and its per-connection twin. Only the columns declared in model.py are authored, and each of those
carries its own type per dialect.
"""
import re

MJ = '${mjSchema}'          # NEVER ${flyway:defaultSchema}: under --schema that resolves to the
                            # migration's own HISTORY schema, not the core schema.


def q(dialect, ident):
    return f'[{ident}]' if dialect == 'ss' else f'"{ident}"'


def obj(dialect, name):
    return f'[{MJ}].[{name}]' if dialect == 'ss' else f'{MJ}."{name}"'


def _col_type(dialect, name, typ):
    """Reproduce the source column's declaration, including the collation SQL Server uses."""
    if dialect == 'ss' and typ.upper().startswith('NVARCHAR'):
        return f'{typ} COLLATE SQL_Latin1_General_CP1_CI_AS'
    return typ


def build_table(baseline, source_table, target_table, extra_cols, drop_real, owner_fk):
    """CREATE TABLE for the target, guarded so a re-run is a no-op."""
    d = baseline.dialect
    src = [c for c in baseline.table_columns(source_table) if c[0] not in drop_real]
    lines = []

    for name, typ, nullable, default in src:
        t = _col_type(d, name, typ)
        null = 'NULL' if nullable else 'NOT NULL'
        if d == 'pg' and default:
            lines.append(f'    {q(d,name)} {t} DEFAULT {default} {null}')
        else:
            lines.append(f'    {q(d,name)} {t} {null}')

    for c in extra_cols:
        t = _col_type(d, c['name'], c['ss'] if d == 'ss' else c['pg'])
        null = 'NULL' if c['nullable'] else 'NOT NULL'
        dflt = c['default'][0 if d == 'ss' else 1] if c['default'] else None
        if d == 'pg' and dflt:
            lines.append(f'    {q(d,c["name"])} {t} DEFAULT {dflt} {null}')
        else:
            lines.append(f'    {q(d,c["name"])} {t} {null}')

    body = ',\n'.join(lines)
    if d == 'ss':
        return (
            f"IF OBJECT_ID('[{MJ}].[{target_table}]', 'U') IS NULL\n"
            f"BEGIN\n"
            f"CREATE TABLE {obj(d,target_table)} (\n{body}\n);\n"
            f"END;\nGO\n")
    return f'CREATE TABLE IF NOT EXISTS {obj(d,target_table)} (\n{body}\n);\n'


def build_defaults(baseline, source_table, target_table, extra_cols, drop_real):
    """SQL Server only: the separate DEFAULT constraints. Postgres carries them inline."""
    d = baseline.dialect
    if d != 'ss':
        return ''
    out = []
    for cons, expr, colname in baseline.alter_defaults(source_table):
        if colname in drop_real:
            continue
        name = f'DF_{target_table}_{colname}'
        out.append(
            f"IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = '{name}')\n"
            f"    ALTER TABLE {obj(d,target_table)} ADD CONSTRAINT [{name}] DEFAULT ({expr}) FOR [{colname}];\n")
    for c in extra_cols:
        if not c['default']:
            continue
        name = f'DF_{target_table}_{c["name"]}'
        out.append(
            f"IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = '{name}')\n"
            f"    ALTER TABLE {obj(d,target_table)} ADD CONSTRAINT [{name}] DEFAULT {c['default'][0]} FOR [{c['name']}];\n")
    return '\n'.join(out) + ('\nGO\n' if out else '')


def build_constraints(dialect, target_table, unique_cols, extra_cols):
    """Primary key, the per-connection uniqueness rule, foreign keys and checks."""
    d, out = dialect, []
    pk = f'PK_{target_table}'
    uq = f'UQ_{target_table}_Name'

    if d == 'ss':
        out.append(
            f"IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = '{pk}')\n"
            f"    ALTER TABLE {obj(d,target_table)} ADD CONSTRAINT [{pk}] PRIMARY KEY CLUSTERED ([ID]);\n")
        cols = ', '.join(f'[{c}]' for c in unique_cols)
        out.append(
            f"IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = '{uq}')\n"
            f"    ALTER TABLE {obj(d,target_table)} ADD CONSTRAINT [{uq}] UNIQUE NONCLUSTERED ({cols});\n")
    else:
        out.append(
            f"ALTER TABLE {obj(d,target_table)} DROP CONSTRAINT IF EXISTS \"{pk}\";\n"
            f"ALTER TABLE {obj(d,target_table)} ADD CONSTRAINT \"{pk}\" PRIMARY KEY (\"ID\");\n")
        cols = ', '.join(f'"{c}"' for c in unique_cols)
        out.append(
            f"ALTER TABLE {obj(d,target_table)} DROP CONSTRAINT IF EXISTS \"{uq}\";\n"
            f"ALTER TABLE {obj(d,target_table)} ADD CONSTRAINT \"{uq}\" UNIQUE ({cols});\n")

    for c in extra_cols:
        if c['fk']:
            ftable, fcol = c['fk']
            name = f'FK_{target_table}_{c["name"]}'
            # No ON DELETE CASCADE anywhere. Removal of a connection's catalog is an explicit,
            # ordered step inside the delete-connection transaction; a database cascade would
            # reorder it and take the maps and watermarks with it.
            if d == 'ss':
                out.append(
                    f"IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = '{name}')\n"
                    f"    ALTER TABLE {obj(d,target_table)} ADD CONSTRAINT [{name}] "
                    f"FOREIGN KEY ([{c['name']}]) REFERENCES {obj(d,ftable)} ([{fcol}]);\n")
            else:
                out.append(
                    f"ALTER TABLE {obj(d,target_table)} DROP CONSTRAINT IF EXISTS \"{name}\";\n"
                    f"ALTER TABLE {obj(d,target_table)} ADD CONSTRAINT \"{name}\" "
                    f"FOREIGN KEY (\"{c['name']}\") REFERENCES {obj(d,ftable)} (\"{fcol}\");\n")
        if c['check']:
            name = f'CK_{target_table}_{c["name"]}'
            expr = c['check']
            if d == 'ss':
                ss_expr = re.sub(r'\b(\w+) IN \(', lambda m: f'[{m.group(1)}] IN (', expr)
                out.append(
                    f"IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = '{name}')\n"
                    f"    ALTER TABLE {obj(d,target_table)} ADD CONSTRAINT [{name}] CHECK ({ss_expr});\n")
            else:
                pg_expr = re.sub(r'\b(\w+) IN \(', lambda m: f'"{m.group(1)}" IN (', expr)
                out.append(
                    f"ALTER TABLE {obj(d,target_table)} DROP CONSTRAINT IF EXISTS \"{name}\";\n"
                    f"ALTER TABLE {obj(d,target_table)} ADD CONSTRAINT \"{name}\" CHECK ({pg_expr});\n")

    joined = '\n'.join(out)
    return joined + ('\nGO\n' if d == 'ss' else '')


def build_indexes(dialect, target_table, index_specs):
    d, out = dialect, []
    for name, cols in index_specs:
        if d == 'ss':
            c = ', '.join(f'[{x}]' for x in cols)
            out.append(
                f"IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = '{name}' "
                f"AND object_id = OBJECT_ID('[{MJ}].[{target_table}]'))\n"
                f"    CREATE INDEX [{name}] ON {obj(d,target_table)} ({c});\n")
        else:
            c = ', '.join(f'"{x}"' for x in cols)
            out.append(f'CREATE INDEX IF NOT EXISTS "{name}" ON {obj(d,target_table)} ({c});\n')
    joined = '\n'.join(out)
    return joined + ('\nGO\n' if d == 'ss' and out else '')


def build_view(dialect, target_table, view_name, real_cols, alias_map, related_name_col=None,
               related_table=None):
    """
    The base view. Its alias columns are what make this change invisible to the connector
    repository: connectors read `IntegrationObjectID`, `RelatedIntegrationObjectID` and the
    `RelatedIntegrationObject` name, and the view hands them the PER-CONNECTION values under
    those exact names. Registered as virtual, so Save() and the CRUD procedures never touch them.
    """
    d = dialect
    sel = [f'    t.{q(d,c)}' for c in real_cols]
    for alias, src in alias_map.items():
        sel.append(f'    t.{q(d,src)} AS {q(d,alias)}')
    if related_name_col:
        alias, join_col = related_name_col
        sel.append(f'    r.{q(d,"Name")} AS {q(d,alias)}')
    body = ',\n'.join(sel)

    frm = f'FROM {obj(d,target_table)} AS t'
    if related_name_col:
        _, join_col = related_name_col
        # The related-name join targets the OBJECT table, not this one. A field's
        # RelatedCompanyIntegrationObjectID points at an OBJECT; joining the field table to itself
        # would resolve every dependency edge to the wrong row and would still return a name, so
        # nothing downstream would notice.
        rt = related_table or target_table
        frm += f'\nLEFT OUTER JOIN {obj(d,rt)} AS r\n    ON t.{q(d,join_col)} = r.{q(d,"ID")}'

    if d == 'ss':
        return (f"IF OBJECT_ID('[{MJ}].[{view_name}]', 'V') IS NOT NULL\n"
                f"    DROP VIEW {obj(d,view_name)};\nGO\n"
                f"CREATE VIEW {obj(d,view_name)}\nAS\nSELECT\n{body}\n{frm};\nGO\n"
                f"GRANT SELECT ON {obj(d,view_name)} TO [cdp_UI], [cdp_Developer], [cdp_Integration];\nGO\n")
    return (f"DROP VIEW IF EXISTS {obj(d,view_name)} CASCADE;\n"
            f"CREATE VIEW {obj(d,view_name)}\nAS\nSELECT\n{body}\n{frm};\n"
            f"GRANT SELECT ON {obj(d,view_name)} TO cdp_UI, cdp_Developer, cdp_Integration;\n")
