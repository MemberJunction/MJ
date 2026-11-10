import { describe, it, expect } from 'vitest';
import { BuildDependentRebuildBlock, ParseSchemaQualifiedName } from '../rules/DependentObjectRebuild.js';

describe('BuildDependentRebuildBlock', () => {
  it('view target: tries the change, rebuilds on 42P16, restores views, functions, grants in order', () => {
    const sql = BuildDependentRebuildBlock({ Schema: '__mj', Name: 'vwFoo', Kind: 'view' }, 'CREATE OR REPLACE VIEW __mj."vwFoo" AS SELECT 1');
    expect(sql.startsWith('DO $do$')).toBe(true);
    expect(sql.trimEnd().endsWith('$do$;')).toBe(true);
    expect(sql).toContain('EXCEPTION WHEN invalid_table_definition THEN');
    expect(sql).toContain(`c.relkind IN ('v', 'm');`);
    expect(sql).toContain('INTO v_target_grants');
    const order = [
      'EXECUTE vsql;',
      'WITH RECURSIVE deps',
      'pg_get_functiondef',
      'DROP VIEW IF EXISTS %I.%I CASCADE',
      'Could not restore dependent view',
      'Could not restore dependent function',
      'Could not restore grants on %.%',
      'EXECUTE v_target_grants',
    ].map((s) => sql.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('table target: rebuilds on feature_not_supported, drops only first-level views of the altered columns', () => {
    const sql = BuildDependentRebuildBlock(
      { Schema: '__mj', Name: 'Foo', Kind: 'table', Columns: ['Name'] },
      'ALTER TABLE __mj."Foo" ALTER COLUMN "Name" TYPE VARCHAR(1000)'
    );
    expect(sql).toContain('EXCEPTION WHEN feature_not_supported THEN');
    expect(sql).toContain(`v_columns CONSTANT TEXT[] := ARRAY['Name']::TEXT[];`);
    expect(sql).toContain('a.attname = ANY (v_columns)');
    expect(sql).toContain(`c.relkind IN ('r', 'p');`);
    expect(sql).toContain(`IF (v_item->>'depth')::INT = 1 THEN`);
    expect(sql).not.toContain('v_view_oids || v_target_oid');
    expect(sql).not.toContain('EXECUTE v_target_grants');
  });

  it('runs every restore CREATE and GRANT in its own exception block and warns on failure', () => {
    const sql = BuildDependentRebuildBlock({ Schema: '__mj', Name: 'vwFoo', Kind: 'view' }, 'SELECT 1');
    expect(sql.match(/EXCEPTION WHEN others THEN/g)?.length).toBe(4);
    expect(sql.match(/RAISE WARNING/g)?.length).toBe(4);
  });

  it('renders PUBLIC for grantee 0, quotes role names once, and revokes PUBLIC on routines with an ACL', () => {
    const sql = BuildDependentRebuildBlock({ Schema: '__mj', Name: 'vwFoo', Kind: 'view' }, 'SELECT 1');
    expect(sql).toContain(`CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_catalog.pg_get_userbyid(g.grantee)) END`);
    expect(sql).toContain(`'REVOKE ALL ON ROUTINE '`);
    expect(sql).toContain('pg_get_function_identity_arguments(pp.oid)');
  });

  it('escapes literals and picks a dollar-quote tag absent from the body', () => {
    const sql = BuildDependentRebuildBlock({ Schema: "o'brien", Name: 'v', Kind: 'view' }, 'SELECT $vsql$x$vsql$');
    expect(sql).toContain(`v_target_schema CONSTANT TEXT := 'o''brien';`);
    expect(sql).toContain('vsql CONSTANT TEXT := $vsql1$SELECT $vsql$x$vsql$$vsql1$;');
  });
});

describe('ParseSchemaQualifiedName', () => {
  it('keeps quoted parts and folds unquoted parts to lowercase', () => {
    expect(ParseSchemaQualifiedName('__mj."vwFoo"')).toEqual({ Schema: '__mj', Name: 'vwFoo' });
    expect(ParseSchemaQualifiedName('"__mj_App"."Foo"')).toEqual({ Schema: '__mj_App', Name: 'Foo' });
    expect(ParseSchemaQualifiedName('__mj_App.Foo')).toEqual({ Schema: '__mj_app', Name: 'foo' });
  });

  it('falls back to __mj without a schema', () => {
    expect(ParseSchemaQualifiedName('"Foo"')).toEqual({ Schema: '__mj', Name: 'Foo' });
  });
});
