#!/usr/bin/env python3
"""File-level validation of the emitted catalog migration pair.

`routines.py` verifies the procedures it builds; this verifies the ASSEMBLED files — the things
that can only go wrong once the sections are put together in order. Run it after every generation.

    python3 scripts/catalog-migration/validate.py "SQL Scripts/mjc-migrations-pg" \
                                                  "SQL Scripts/mjc-migrations"

Every check here exists because of a specific way this migration can be wrong on a live database,
named in its own message. Two are worth reading before changing anything:

  * The flyway default-schema placeholder must NOT appear. Under `--schema mjc_integration_catalog`
    that built-in resolves to the migration's own HISTORY schema, not the core one, so the whole
    file would build its tables in the wrong place — and it is substituted inside comments too.
  * The base views must precede both the CRUD and the metadata. Postgres resolves
    `RETURNS SETOF <view>` when the function is created, and `R__RefreshMetadata` — which runs on
    EVERY migrate, with an exclusion list that does not cover the core schema — deletes any field
    metadata row whose column is absent from the entity's base view. Metadata inserted before its
    view survives until the next unrelated migration and is then silently removed.
"""
import io, os, re, sys

EXPECT_ENTITY_FIELDS = 86   # 52 object columns + 34 field columns
EXPECT_PERMISSIONS = 6      # 3 roles x 2 entities
EXPECT_ROUTINES = 6         # create/update/delete x 2 tables


def check_pair(directory, dialect):
    ext = '.pg.sql' if dialect == 'pg' else '.sql'
    vs = sorted(f for f in os.listdir(directory)
                if f.startswith('V') and f.endswith(ext) and 'mjccatalog' in f
                and (dialect == 'pg') == f.endswith('.pg.sql'))
    if not vs:
        return [(False, f'[{dialect}] no V migration found in {directory}')]
    v = io.open(os.path.join(directory, vs[0]), encoding='utf-8').read()
    u = io.open(os.path.join(directory, 'U' + vs[0][1:]), encoding='utf-8').read()
    T = f'[{dialect}]'
    r = []

    def ck(cond, msg, detail=''):
        r.append((bool(cond), msg + (f'  -> {detail}' if detail and not cond else '')))

    ck('flyway:defaultSchema' not in v and 'flyway:defaultSchema' not in u,
       f'{T} no flyway default-schema placeholder — it resolves to the HISTORY schema under --schema')
    lit = r'\[__mj\]\.' if dialect == 'ss' else r'__mj\."'
    ck(not re.findall(lit, v), f'{T} V targets the placeholder, never the literal core schema',
       f'{len(re.findall(lit, v))} literal reference(s)')
    ck(not re.findall(lit, u), f'{T} U targets the placeholder, never the literal core schema')
    ck('__mj_CreatedAt' in v,
       f'{T} audit COLUMN names survived — they share the literal schema first four characters')

    ck(len(re.findall(r'CREATE TABLE', v)) == 2, f'{T} 2 CREATE TABLE')
    ck(len(re.findall(r'CREATE (?:OR REPLACE )?VIEW', v)) == 2, f'{T} 2 CREATE VIEW')
    n = len(re.findall(r'CREATE (?:OR REPLACE )?(?:PROCEDURE|FUNCTION)', v))
    ck(n == EXPECT_ROUTINES, f'{T} {EXPECT_ROUTINES} CRUD routines', n)

    kw = 'CREATE FUNCTION' if dialect == 'pg' else 'CREATE PROCEDURE'
    iview = v.rindex('CREATE VIEW')
    ck(iview < v.index(kw), f'{T} views precede CRUD — Postgres resolves RETURNS SETOF at create time')
    ck(iview < v.index('"EntityField"' if dialect == 'pg' else '[EntityField]'),
       f'{T} views precede metadata — R__RefreshMetadata deletes field rows with no view column')

    nef = len(re.findall(r'INSERT INTO \S*EntityField', v))
    ck(nef == EXPECT_ENTITY_FIELDS, f'{T} {EXPECT_ENTITY_FIELDS} EntityField inserts', nef)
    ck(len(re.findall(r'INSERT INTO \S*EntityPermission', v)) == EXPECT_PERMISSIONS,
       f'{T} {EXPECT_PERMISSIONS} permission inserts')
    ck('AllowCaching' in v,
       f'{T} sets AllowCaching — CacheLocal does nothing without it and four short-circuits gate on it')

    for tok, why in (('IsSelected', 'membership separate from selection'),
                     ('Provenance', 'where the shape came from'),
                     ('ObservedMaxLength', 'raw sampled width, apart from the padded one'),
                     ('CompanyIntegrationID', 'the connection axis this exists for')):
        ck(tok in v, f'{T} carries {tok} — {why}')

    # The ONLY legitimate reference to the shared catalog is the pair of provenance foreign keys
    # recording which declared row a per-connection row was matched to. A view read, a procedure
    # call or a join would mean this still depends on the shared catalog at runtime, which is the
    # thing it exists to stop.
    dl = r'\[%s\]' if dialect == 'ss' else r'"%s"'
    hits = []
    for name in ('IntegrationObject', 'IntegrationObjectField', 'vwIntegrationObjects',
                 'vwIntegrationObjectFields', 'spCreateIntegrationObject',
                 'spUpdateIntegrationObject', 'spDeleteIntegrationObject'):
        for m in re.finditer(dl % name, v):
            line = v[:m.start()].count('\n') + 1
            hits.append((name, line, v.split('\n')[line - 1].strip()))
    fks = [h for h in hits if 'FOREIGN KEY' in h[2] and 'REFERENCES' in h[2]]
    other = [h for h in hits if h not in fks]
    ck(len(fks) == 2, f'{T} exactly 2 provenance FKs to the shared catalog', len(fks))
    ck(not other, f'{T} no other shared-catalog reference', [(n, l) for n, l, _ in other])

    ck(u.index('EntityPermission') < u.rindex('DROP TABLE'), f'{T} U removes metadata before tables')
    ck(u.index('DROP VIEW') < u.index('DROP TABLE'), f'{T} U drops views before tables')
    ck(u.count('DROP TABLE') == 2 and u.count('DROP VIEW') == 2, f'{T} U drops both tables and views')
    ck(v.count('(') == v.count(')'), f'{T} V parens balanced', f"{v.count('(')} vs {v.count(')')}")
    if dialect == 'pg':
        ck(v.count('$$') % 2 == 0, f'{T} $$ balanced', v.count('$$'))
    return r


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    results = check_pair(sys.argv[1], 'pg') + check_pair(sys.argv[2], 'ss')
    for ok, msg in results:
        print(('PASS  ' if ok else 'FAIL  ') + msg)
    bad = sum(1 for ok, _ in results if not ok)
    print(f'\n{len(results)} checks, {len(results) - bad} passed, {bad} FAILED')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
