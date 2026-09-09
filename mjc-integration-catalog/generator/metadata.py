"""
Entity, EntityField, ApplicationEntity and EntityPermission rows for the new tables.

WHY DIRECT INSERTS AND NOT spCreateEntity / spCreateEntityField (register MJ-CAT-7).
Both of those are CodeGen-GENERATED CRUD procedures, and CodeGen omits every column whose
EntityField marks it not-updatable-through-the-API — which is every schema-derived column. So
`spCreateEntity` has NO @BaseTable parameter and that column is NOT NULL with no default;
`spCreateEntityField` has NO @EntityID, @Name or @Type. Every call fails on a NOT NULL violation,
unconditionally, on v5.51.0 AND on the latest branch. Direct INSERT is what CodeGen itself emits
and what every precedent migration in the MJ repository does.

WHY THE FIELD ROWS ARE LIFTED, NOT WRITTEN (register MJ-CAT-8, MJ-CAT-9).
On Postgres nothing reconciles this metadata at migrate time — the repeatable refresh heals only
AllowsNull, and the reconcilers have no migrate-time caller. And the metadata records SQL Server
type names and BYTE lengths on every dialect, so hand-authoring against the Postgres catalog
produces values that are wrong and that nothing will correct. So every field row for a column we
copied is the SOURCE row with its ids rewritten: the type, length, precision, scale, nullability,
default, category, form section and description all arrive already correct, per dialect.

WHY THE VIEW MUST EXIST IN THE SAME FILE.
`R__RefreshMetadata` runs on EVERY migrate and calls `spDeleteUnneededEntityFields`, which removes
any field row absent from the entity's base VIEW. Its exclusion list is only `sys,staging` — the
core schema IS processed. Field rows inserted without their view are deleted by the next unrelated
migration, silently.
"""
import uuid


def _lit(dialect, s):
    """A string literal in the dialect's own style, with quotes escaped."""
    if s is None:
        return 'NULL'
    e = s.replace("'", "''")
    return f"N'{e}'" if dialect == 'ss' else f"'{e}'"


def _bool(dialect, v):
    if dialect == 'ss':
        return '1' if v else '0'
    return 'true' if v else 'false'


def _now(dialect):
    return 'GETUTCDATE()' if dialect == 'ss' else "(now() AT TIME ZONE 'UTC')"


def stable_uuid(namespace, name):
    """
    Deterministic ids, so re-running the generator produces the SAME migration and the tenant
    lineage and the upstream PR agree forever. A random id per run would make the two lineages
    disagree on which row is which, which is unrecoverable once both have shipped.
    """
    return str(uuid.uuid5(uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
                          f'mjc-catalog::{namespace}::{name}')).upper()


def build_entity_row(dialect, entity_id, entity_name, base_table, base_view, description):
    d = dialect
    cols = ['ID', 'Name', 'Description', 'BaseTable', 'BaseView', 'SchemaName', 'IncludeInAPI',
            'AllowUserSearchAPI', 'AllowCaching', 'TrackRecordChanges', 'AuditRecordAccess',
            'AuditViewRuns', 'AllowAllRowsAPI', 'AllowCreateAPI', 'AllowUpdateAPI',
            'AllowDeleteAPI', 'UserViewMaxRows', '__mj_CreatedAt', '__mj_UpdatedAt']
    vals = [
        _lit(d, entity_id), _lit(d, entity_name), _lit(d, description),
        _lit(d, base_table), _lit(d, base_view), _lit(d, '__mj'),
        _bool(d, True),      # IncludeInAPI
        _bool(d, False),     # AllowUserSearchAPI
        _bool(d, True),      # AllowCaching — REQUIRED. The engine loads these datasets with
                             # CacheLocal:true, and that option does NOTHING unless this is set:
                             # four independent short-circuits gate on it, each testing === true,
                             # and the database default is 0.
        _bool(d, False),     # TrackRecordChanges — a discovery rewrites these rows in bulk; change
                             # tracking would multiply every refresh into a second write per row.
        _bool(d, False), _bool(d, False),
        _bool(d, False),     # AllowAllRowsAPI
        _bool(d, True), _bool(d, True), _bool(d, True),
        '1000',
        _now(d), _now(d),
    ]
    qn = (lambda c: f'[{c}]') if d == 'ss' else (lambda c: f'"{c}"')
    tbl = '[${mjSchema}].[Entity]' if d == 'ss' else '${mjSchema}."Entity"'
    guard_open = (f"IF NOT EXISTS (SELECT 1 FROM {tbl} WHERE [ID] = {_lit(d, entity_id)})\nBEGIN\n"
                  if d == 'ss' else '')
    guard_close = 'END;\nGO\n' if d == 'ss' else ''
    conflict = '' if d == 'ss' else '\nON CONFLICT ("ID") DO NOTHING'
    return (f'{guard_open}INSERT INTO {tbl}\n    ({", ".join(qn(c) for c in cols)})\nVALUES\n'
            f'    ({", ".join(vals)}){conflict};\n{guard_close}')


def build_field_rows(dialect, ef_cols, source_rows, new_entity_id, keep_names,
                     rename_map, extra_cols, virtual_names):
    """
    Rewrite the source entity's field rows for the new entity.

    keep_names   — source column names to carry over
    rename_map   — {source_name: new_name} for a column that changed name
    extra_cols   — model.py entries for columns the source does not have
    virtual_names— names that must be marked IsVirtual, because the base view synthesises them
    """
    d = dialect
    ix = {c: i for i, c in enumerate(ef_cols)}
    qn = (lambda c: f'[{c}]') if d == 'ss' else (lambda c: f'"{c}"')
    tbl = '[${mjSchema}].[EntityField]' if d == 'ss' else '${mjSchema}."EntityField"'
    out, seq = [], 0

    def emit(values, name):
        nonlocal seq
        seq += 1
        v = list(values)
        fid = stable_uuid(new_entity_id, name)
        v[ix['ID']] = _lit(d, fid)
        v[ix['EntityID']] = _lit(d, new_entity_id)
        v[ix['Sequence']] = str(seq)
        v[ix['Name']] = _lit(d, name)
        if name in virtual_names:
            v[ix['IsVirtual']] = _bool(d, True)
            v[ix['AllowUpdateAPI']] = _bool(d, False)
        # A copied row must never keep a pointer into the source entity's own relationships.
        v[ix['RelatedEntityID']] = 'NULL'
        v[ix['RelatedEntityFieldName']] = 'NULL'
        v[ix['RelatedEntityNameFieldMap']] = 'NULL'
        v[ix['IncludeRelatedEntityNameFieldInBaseView']] = _bool(d, False)
        cond = (f"IF NOT EXISTS (SELECT 1 FROM {tbl} WHERE [ID] = {_lit(d, fid)})\n"
                if d == 'ss' else '')
        tail = '' if d == 'ss' else '\nON CONFLICT ("ID") DO NOTHING'
        out.append(f'{cond}INSERT INTO {tbl}\n    ({", ".join(qn(c) for c in ef_cols)})\nVALUES\n'
                   f'    ({", ".join(v)}){tail};\n')

    by_name = {}
    for r in source_rows:
        by_name[r[ix['Name']].strip().lstrip('N').strip("'")] = r

    for nm in keep_names:
        if nm in by_name:
            emit(by_name[nm], rename_map.get(nm, nm))

    template = by_name.get('ID')
    for c in extra_cols:
        v = list(template)
        v[ix['Type']] = _lit(d, c['ef_type'])
        v[ix['Length']] = str(c['ef_len'])
        v[ix['Precision']] = str(c['ef_prec'])
        v[ix['Scale']] = str(c['ef_scale'])
        v[ix['AllowsNull']] = _bool(d, c['nullable'])
        v[ix['DefaultValue']] = 'NULL'
        v[ix['IsPrimaryKey']] = _bool(d, False)
        v[ix['IsUnique']] = _bool(d, False)
        v[ix['DisplayName']] = _lit(d, c['name'])
        v[ix['Description']] = _lit(d, ' '.join(c['why'].split()))
        v[ix['AutoUpdateDescription']] = _bool(d, False)   # ours, not the catalog's
        v[ix['IsVirtual']] = _bool(d, False)
        v[ix['AllowUpdateAPI']] = _bool(d, True)
        emit(v, c['name'])
    return '\n'.join(out) + ('\nGO\n' if d == 'ss' else '')


def build_permissions(dialect, entity_id, roles):
    d = dialect
    qn = (lambda c: f'[{c}]') if d == 'ss' else (lambda c: f'"{c}"')
    tbl = '[${mjSchema}].[EntityPermission]' if d == 'ss' else '${mjSchema}."EntityPermission"'
    cols = ['ID', 'EntityID', 'RoleID', 'CanRead', 'CanCreate', 'CanUpdate', 'CanDelete',
            '__mj_CreatedAt', '__mj_UpdatedAt']
    out = []
    for role_name, role_id, r, c_, u, x in roles:
        pid = stable_uuid(entity_id, 'perm::' + role_name)
        vals = [_lit(d, pid), _lit(d, entity_id), _lit(d, role_id),
                _bool(d, r), _bool(d, c_), _bool(d, u), _bool(d, x), _now(d), _now(d)]
        cond = (f"IF NOT EXISTS (SELECT 1 FROM {tbl} WHERE [ID] = {_lit(d, pid)})\n"
                if d == 'ss' else '')
        tail = '' if d == 'ss' else '\nON CONFLICT ("ID") DO NOTHING'
        out.append(f'-- {role_name}\n{cond}INSERT INTO {tbl}\n'
                   f'    ({", ".join(qn(x2) for x2 in cols)})\nVALUES\n    ({", ".join(vals)}){tail};\n')
    return '\n'.join(out) + ('\nGO\n' if d == 'ss' else '')
