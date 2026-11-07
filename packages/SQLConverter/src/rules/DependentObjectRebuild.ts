/**
 * PL/pgSQL DO block that applies a change PostgreSQL refuses while other objects depend on the
 * target, and puts those objects back afterwards.
 *
 * Two callers:
 * - ViewRule (target kind `view`): `CREATE OR REPLACE VIEW` fails with 42P16
 *   (`invalid_table_definition`) when the column list changes, so the view is dropped with
 *   CASCADE and recreated.
 * - AlterTableRule (target kind `table`): `ALTER COLUMN … TYPE` fails with 0A000
 *   (`feature_not_supported`, "cannot alter type of a column used by a view or rule") when a view
 *   reads the column, which every entity column's base view does. The views reading the column are
 *   dropped with CASCADE, the ALTER runs, and they are recreated with the new type.
 *
 * Both try the change first and only rebuild inside the exception handler, so a change with no
 * dependents runs as a single statement.
 *
 * What the handler captures before the drop (CASCADE removes all of it):
 * - every view and materialized view depending on the target, transitively, with its grants
 *   (`aclexplode(relacl)`);
 * - every function or procedure whose return type is the row type of a dropped view, or which has
 *   a `pg_depend` row on one (CodeGen's `spCreate…`/`spUpdate…` `RETURNS SETOF vw…`), via
 *   `pg_get_functiondef`, with its grants (`aclexplode(proacl)`);
 * - for a view target, the target's own grants (the new view starts with none).
 *
 * Restore order: views shallowest first, then functions, then grants. Each CREATE and each GRANT
 * runs in its own `BEGIN … EXCEPTION` block: a PL/pgSQL exception block rolls back everything in
 * it, so a failed GRANT must not take the view it follows with it. Anything that fails to restore
 * raises a WARNING naming the object, instead of disappearing silently.
 *
 * The capture SQL follows CodeGen's view-regeneration wrapper
 * (`PostgreSQLCodeGenProvider.generateViewRegenerationSQL`): role names come from
 * `pg_get_userbyid` (readable on managed PostgreSQL services, unlike `pg_authid`) and grantee 0 is
 * `PUBLIC`.
 */

/** The object the change applies to. */
export interface DependentRebuildTarget {
  /** Schema name as stored in the catalog (no quotes). */
  Schema: string;
  /** Object name as stored in the catalog (no quotes). */
  Name: string;
  /**
   * `view`: the target itself is dropped and recreated by the change SQL.
   * `table`: the table stays; only the views reading {@link Columns} are dropped and recreated.
   */
  Kind: 'view' | 'table';
  /**
   * Table targets only: the columns the change alters (catalog names, no quotes). Only views that
   * read one of them are dropped. Omitted or empty means every view depending on the table.
   */
  Columns?: string[];
}

/** SQLSTATE condition name PostgreSQL raises for each target kind when dependents block the change. */
const BLOCKING_CONDITION: Record<DependentRebuildTarget['Kind'], string> = {
  view: 'invalid_table_definition',
  table: 'feature_not_supported',
};

/**
 * Builds the DO block. `changeSQL` is one complete statement without a trailing semicolon (for a
 * view, its `CREATE OR REPLACE VIEW …`; for a table, its `ALTER TABLE …`).
 */
export function BuildDependentRebuildBlock(target: DependentRebuildTarget, changeSQL: string): string {
  const columns = target.Kind === 'table' ? target.Columns ?? [] : [];
  return [
    'DO $do$',
    'DECLARE',
    `  v_target_schema CONSTANT TEXT := ${SqlLiteral(target.Schema)};`,
    `  v_target_name CONSTANT TEXT := ${SqlLiteral(target.Name)};`,
    `  v_columns CONSTANT TEXT[] := ${SqlTextArray(columns)};`,
    `  vsql CONSTANT TEXT := ${DollarQuote(changeSQL, 'vsql')};`,
    '  v_target_oid OID;',
    '  v_target_grants TEXT;',
    '  v_dep RECORD;',
    '  v_views JSONB := \'[]\'::JSONB;',
    '  v_funcs JSONB := \'[]\'::JSONB;',
    '  v_view_oids OID[] := ARRAY[]::OID[];',
    '  v_item JSONB;',
    'BEGIN',
    '  EXECUTE vsql;',
    `EXCEPTION WHEN ${BLOCKING_CONDITION[target.Kind]} THEN`,
    ...BuildTargetLookup(target.Kind),
    ...BuildViewCapture(target.Kind),
    ...BuildFunctionCapture(target.Kind),
    ...BuildDrop(target.Kind),
    '  EXECUTE vsql;',
    ...BuildRestore(target.Kind),
    'END;',
    '$do$;',
  ].join('\n');
}

/** Finds the target's OID (and, for a view, its grants). A missing target re-raises the error. */
function BuildTargetLookup(kind: DependentRebuildTarget['Kind']): string[] {
  const relkinds = kind === 'view' ? `('v', 'm')` : `('r', 'p')`;
  const lines = [
    '  SELECT c.oid INTO v_target_oid',
    '  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid',
    `  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind IN ${relkinds};`,
    '  IF v_target_oid IS NULL THEN',
    '    RAISE;',
    '  END IF;',
  ];
  if (kind === 'view') {
    lines.push(
      '  SELECT ' + RelationGrantsExpression('c', 'n') + ' INTO v_target_grants',
      '  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid',
      '  WHERE c.oid = v_target_oid;',
    );
  }
  return lines;
}

/**
 * Captures every dependent view, transitively, shallowest first. For a table target the
 * first level is limited to views reading one of the altered columns (when columns are given).
 */
function BuildViewCapture(kind: DependentRebuildTarget['Kind']): string[] {
  const columnFilter =
    kind === 'table'
      ? [
          '          AND (cardinality(v_columns) = 0 OR d.refobjsubid IN (',
          '            SELECT a.attnum FROM pg_attribute a',
          '            WHERE a.attrelid = v_target_oid AND a.attname = ANY (v_columns)))',
        ]
      : [];
  return [
    '  FOR v_dep IN',
    '    WITH RECURSIVE deps(oid, depth) AS (',
    '        SELECT DISTINCT c.oid, 1',
    '        FROM pg_depend d',
    '        JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = \'pg_rewrite\'::regclass',
    '        JOIN pg_class c ON c.oid = r.ev_class AND c.relkind IN (\'v\', \'m\')',
    '        WHERE d.refobjid = v_target_oid AND c.oid <> v_target_oid',
    ...columnFilter,
    '      UNION',
    '        SELECT c.oid, p.depth + 1',
    '        FROM deps p',
    '        JOIN pg_depend d ON d.refobjid = p.oid',
    '        JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = \'pg_rewrite\'::regclass',
    '        JOIN pg_class c ON c.oid = r.ev_class AND c.relkind IN (\'v\', \'m\')',
    '        WHERE c.oid <> p.oid AND p.depth < 50',
    '    )',
    // depth is the LONGEST path from the target, so replaying in depth order recreates a view
    // after every view it reads.
    '    SELECT c.oid, n.nspname AS schema_name, c.relname AS rel_name, c.relkind, x.max_depth,',
    '           pg_catalog.pg_get_viewdef(c.oid, true) AS viewdef,',
    '           ' + RelationGrantsExpression('c', 'n') + ' AS grants_sql',
    '    FROM (SELECT deps.oid, MAX(deps.depth) AS max_depth FROM deps GROUP BY deps.oid) x',
    '    JOIN pg_class c ON c.oid = x.oid',
    '    JOIN pg_namespace n ON n.oid = c.relnamespace',
    '    ORDER BY x.max_depth ASC, c.relname',
    '  LOOP',
    '    v_view_oids := v_view_oids || v_dep.oid;',
    '    v_views := v_views || jsonb_build_array(jsonb_build_object(',
    '      \'schema\', v_dep.schema_name, \'name\', v_dep.rel_name, \'kind\', v_dep.relkind::TEXT,',
    '      \'depth\', v_dep.max_depth, \'def\', v_dep.viewdef, \'grants\', v_dep.grants_sql));',
    '  END LOOP;',
  ];
}

/**
 * Captures functions and procedures that CASCADE drops with the views: those whose return type is
 * a dropped view's row type, or that have a `pg_depend` row on one. For a view target the target
 * itself is dropped too, so its functions are included.
 */
function BuildFunctionCapture(kind: DependentRebuildTarget['Kind']): string[] {
  const dropped = kind === 'view' ? 'v_view_oids || v_target_oid' : 'v_view_oids';
  return [
    '  FOR v_dep IN',
    '    SELECT DISTINCT pn.nspname AS schema_name, pp.proname AS fn_name, pp.oid,',
    '           pg_catalog.pg_get_functiondef(pp.oid) AS fndef,',
    '           ' + RoutineGrantsExpression('pp', 'pn') + ' AS grants_sql',
    '    FROM pg_proc pp',
    '    JOIN pg_namespace pn ON pn.oid = pp.pronamespace',
    '    WHERE pp.prokind IN (\'f\', \'p\')',
    '      AND EXISTS (',
    '        SELECT 1 FROM pg_class c',
    `        WHERE c.oid = ANY (${dropped})`,
    '          AND (pp.prorettype = c.reltype',
    '               OR EXISTS (SELECT 1 FROM pg_depend d',
    '                          WHERE d.classid = \'pg_proc\'::regclass',
    '                            AND d.objid = pp.oid AND d.refobjid = c.oid)))',
    '  LOOP',
    '    v_funcs := v_funcs || jsonb_build_array(jsonb_build_object(',
    '      \'schema\', v_dep.schema_name, \'name\', v_dep.fn_name, \'def\', v_dep.fndef,',
    '      \'grants\', v_dep.grants_sql));',
    '  END LOOP;',
  ];
}

/** Drops the target view, or the views reading the table, with CASCADE. */
function BuildDrop(kind: DependentRebuildTarget['Kind']): string[] {
  if (kind === 'view') {
    return ['  EXECUTE format(\'DROP VIEW IF EXISTS %I.%I CASCADE\', v_target_schema, v_target_name);'];
  }
  // Dropping the first-level views with CASCADE removes the deeper ones too; IF EXISTS covers a
  // view CASCADE already removed.
  return [
    '  FOR v_item IN SELECT value FROM jsonb_array_elements(v_views) LOOP',
    '    IF (v_item->>\'depth\')::INT = 1 THEN',
    '      EXECUTE format(\'DROP %s IF EXISTS %I.%I CASCADE\',',
    '        CASE WHEN v_item->>\'kind\' = \'m\' THEN \'MATERIALIZED VIEW\' ELSE \'VIEW\' END,',
    '        v_item->>\'schema\', v_item->>\'name\');',
    '    END IF;',
    '  END LOOP;',
  ];
}

/** Recreates views, then functions, then grants; each in its own exception block. */
function BuildRestore(kind: DependentRebuildTarget['Kind']): string[] {
  const lines = [
    '  FOR v_item IN SELECT value FROM jsonb_array_elements(v_views) LOOP',
    '    BEGIN',
    '      EXECUTE format(\'CREATE %s %I.%I AS %s\',',
    '        CASE WHEN v_item->>\'kind\' = \'m\' THEN \'MATERIALIZED VIEW\' ELSE \'VIEW\' END,',
    '        v_item->>\'schema\', v_item->>\'name\', v_item->>\'def\');',
    '    EXCEPTION WHEN others THEN',
    '      RAISE WARNING \'Could not restore dependent view %.%: %\',',
    '        v_item->>\'schema\', v_item->>\'name\', SQLERRM;',
    '    END;',
    '  END LOOP;',
    '  FOR v_item IN SELECT value FROM jsonb_array_elements(v_funcs) LOOP',
    '    BEGIN',
    '      EXECUTE v_item->>\'def\';',
    '    EXCEPTION WHEN others THEN',
    '      RAISE WARNING \'Could not restore dependent function %.%: %\',',
    '        v_item->>\'schema\', v_item->>\'name\', SQLERRM;',
    '    END;',
    '  END LOOP;',
    '  FOR v_item IN SELECT value FROM jsonb_array_elements(v_views || v_funcs) LOOP',
    '    IF v_item->>\'grants\' IS NOT NULL THEN',
    '      BEGIN',
    '        EXECUTE v_item->>\'grants\';',
    '      EXCEPTION WHEN others THEN',
    '        RAISE WARNING \'Could not restore grants on %.%: %\',',
    '          v_item->>\'schema\', v_item->>\'name\', SQLERRM;',
    '      END;',
    '    END IF;',
    '  END LOOP;',
  ];
  if (kind === 'view') {
    lines.push(
      '  IF v_target_grants IS NOT NULL THEN',
      '    BEGIN',
      '      EXECUTE v_target_grants;',
      '    EXCEPTION WHEN others THEN',
      '      RAISE WARNING \'Could not restore grants on %.%: %\', v_target_schema, v_target_name, SQLERRM;',
      '    END;',
      '  END IF;',
    );
  }
  return lines;
}

/**
 * SQL expression (inside a query over pg_class `rel` / pg_namespace `ns`) that renders the
 * relation's grants as `GRANT …;` statements, or NULL when it has none.
 */
function RelationGrantsExpression(rel: string, ns: string): string {
  return (
    '(SELECT string_agg(' +
    `'GRANT ' || g.privilege_type || ' ON ' || quote_ident(${ns}.nspname) || '.' || quote_ident(${rel}.relname) || ` +
    `' TO ' || ${GranteeExpression('g')} || CASE WHEN g.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END || ';', E'\\n') ` +
    `FROM aclexplode(${rel}.relacl) g)`
  );
}

/**
 * SQL expression (inside a query over pg_proc `proc` / pg_namespace `ns`) that renders the
 * routine's grants. A routine with an explicit ACL starts with `REVOKE ALL … FROM PUBLIC`, because
 * a recreated function gets PostgreSQL's default PUBLIC EXECUTE back; NULL when the ACL is the
 * default.
 */
function RoutineGrantsExpression(proc: string, ns: string): string {
  const signature =
    `quote_ident(${ns}.nspname) || '.' || quote_ident(${proc}.proname) || ` +
    `'(' || pg_catalog.pg_get_function_identity_arguments(${proc}.oid) || ')'`;
  return (
    `CASE WHEN ${proc}.proacl IS NULL THEN NULL ELSE ` +
    `'REVOKE ALL ON ROUTINE ' || ${signature} || ' FROM PUBLIC;' || COALESCE(E'\\n' || (SELECT string_agg(` +
    `'GRANT ' || g.privilege_type || ' ON ROUTINE ' || ${signature} || ` +
    `' TO ' || ${GranteeExpression('g')} || CASE WHEN g.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END || ';', E'\\n') ` +
    `FROM aclexplode(${proc}.proacl) g), '') END`
  );
}

/** Grantee 0 is PUBLIC; anything else is a role name from pg_get_userbyid, quoted once. */
function GranteeExpression(acl: string): string {
  return `(CASE WHEN ${acl}.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_catalog.pg_get_userbyid(${acl}.grantee)) END)`;
}

/**
 * Splits a converted object reference (`__mj."vwAIModelVendors"`, `"__mj"."X"`, `schema.View`)
 * into the catalog names of its schema and object. A quoted part keeps its case; an unquoted part
 * is folded to lowercase, as PostgreSQL stores it. A reference with no schema falls back to `__mj`.
 */
export function ParseSchemaQualifiedName(fullName: string): { Schema: string; Name: string } {
  const cleaned = fullName.trim();
  const m = cleaned.match(/^(?:"([^"]+)"|(\w+))\.(?:"([^"]+)"|(\w+))$/);
  if (!m) {
    return { Schema: '__mj', Name: cleaned.replace(/"/g, '') };
  }
  return { Schema: m[1] ?? m[2].toLowerCase(), Name: m[3] ?? m[4].toLowerCase() };
}

/** Escapes a string as a PostgreSQL literal (single-quoted, embedded quotes doubled). */
export function SqlLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Renders a TEXT[] literal from plain strings. */
function SqlTextArray(values: string[]): string {
  if (values.length === 0) return 'ARRAY[]::TEXT[]';
  return `ARRAY[${values.map(SqlLiteral).join(', ')}]::TEXT[]`;
}

/**
 * Dollar-quotes `body` with a tag that does not occur in it (`$vsql$`, then `$vsql1$`, …), so a
 * change statement containing `$vsql$` cannot end the literal early.
 */
function DollarQuote(body: string, baseTag: string): string {
  let tag = `$${baseTag}$`;
  for (let i = 1; body.includes(tag); i++) {
    tag = `$${baseTag}${i}$`;
  }
  return `${tag}${body}${tag}`;
}
