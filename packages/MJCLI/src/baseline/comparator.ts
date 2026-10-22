/**
 * Schema and data comparator.
 *
 * Produces a DiffReport from two SchemaSnapshots. Operates dialect-agnostically
 * because the snapshot shape is normalized; tagging is preserved on each side
 * but equality is decided structurally.
 *
 * Row-by-row comparison (when row data is supplied) walks each table's rows
 * in their canonical order and reports value-level diffs.
 */

import { DeepValueEqual, IsoUtcSeconds, qname, StableSortBy } from './util';
import type {
  BaselineCompareOptions,
  ColumnValueDiff,
  DatabasePrincipalDef,
  DiffReport,
  ExtendedPropertyDef,
  ObjectDiff,
  ObjectKind,
  PermissionDef,
  RoleMembershipDef,
  SchemaSnapshot,
  TableDataDump,
  TableDef,
  TableRowDiff,
  RowDiff,
  UserDefinedTypeDef,
} from './types';

export interface CompareInput {
  Left: { snapshot: SchemaSnapshot; data: readonly TableDataDump[]; label: string };
  Right: { snapshot: SchemaSnapshot; data: readonly TableDataDump[]; label: string };
  Options: BaselineCompareOptions;
}

export function CompareSnapshots(input: CompareInput): DiffReport {
  const { Left: left, Right: right, Options: options } = input;
  const ignored = options.IgnorePattern;
  const matchesIgnore = (q: string) => {
    if (!ignored) return false;
    if (ignored.test(q)) return true;
    // Also test against the bare object name (post-dot) so that bare patterns
    // like /^flyway_schema_history$/ match keys we lowercase + schema-qualify
    // internally (e.g. "dbo.flyway_schema_history"). Schema-qualified patterns
    // continue to work via the first test() above.
    const bare = q.includes('.') ? q.slice(q.lastIndexOf('.') + 1) : q;
    return ignored.test(bare);
  };

  const objectDiffs: ObjectDiff[] = [];
  let objectsWithDiffs = 0;
  const counted = (diffs: ObjectDiff[]) => {
    if (diffs.length === 0) return;
    objectsWithDiffs += diffs.length;
    objectDiffs.push(...diffs);
  };

  // Schemas
  counted(diffNamedSet('schema', left.snapshot.Schemas, right.snapshot.Schemas, (s) => s.name, matchesIgnore));

  // Tables
  const leftTables = new Map(left.snapshot.Tables.map((t) => [qname(t.Schema, t.Name), t]));
  const rightTables = new Map(right.snapshot.Tables.map((t) => [qname(t.Schema, t.Name), t]));
  const allTableKeys = new Set([...leftTables.keys(), ...rightTables.keys()]);

  for (const key of [...allTableKeys].sort()) {
    if (matchesIgnore(key)) continue;
    const leftT = leftTables.get(key);
    const rightT = rightTables.get(key);
    if (!leftT && rightT) {
      objectDiffs.push({ Kind: 'table', DiffKind: 'missing-on-left', QualifiedName: key });
      objectsWithDiffs++;
      continue;
    }
    if (leftT && !rightT) {
      objectDiffs.push({ Kind: 'table', DiffKind: 'missing-on-right', QualifiedName: key });
      objectsWithDiffs++;
      continue;
    }
    if (leftT && rightT) {
      counted(diffTable(leftT, rightT));
    }
  }

  // Views, procedures, functions, triggers, sequences
  counted(
    diffNamedSet(
      'view',
      left.snapshot.Views,
      right.snapshot.Views,
      (v) => `${v.schema}.${v.name}`,
      matchesIgnore,
      (l, r) =>
        normalizeBody(l.definition) === normalizeBody(r.definition)
          ? null
          : `view body differs`,
    ),
  );
  counted(
    diffNamedSet(
      'procedure',
      left.snapshot.Procedures,
      right.snapshot.Procedures,
      (p) => `${p.schema}.${p.name}`,
      matchesIgnore,
      (l, r) =>
        normalizeBody(l.definition) === normalizeBody(r.definition)
          ? null
          : `procedure body differs`,
    ),
  );
  counted(
    diffNamedSet(
      'function',
      left.snapshot.Functions,
      right.snapshot.Functions,
      (p) => `${p.schema}.${p.name}`,
      matchesIgnore,
      (l, r) =>
        normalizeBody(l.definition) === normalizeBody(r.definition)
          ? null
          : `function body differs`,
    ),
  );
  counted(
    diffNamedSet(
      'trigger',
      left.snapshot.Triggers,
      right.snapshot.Triggers,
      (t) => `${t.schema}.${t.name}`,
      matchesIgnore,
      (l, r) =>
        normalizeBody(l.definition) === normalizeBody(r.definition)
          ? null
          : `trigger body differs`,
    ),
  );
  counted(
    diffNamedSet(
      'sequence',
      left.snapshot.Sequences,
      right.snapshot.Sequences,
      (s) => `${s.schema}.${s.name}`,
      matchesIgnore,
      (l, r) => {
        const fields: string[] = [];
        if (l.startValue !== r.startValue) fields.push(`startValue: ${l.startValue} vs ${r.startValue}`);
        if (l.increment !== r.increment) fields.push(`increment: ${l.increment} vs ${r.increment}`);
        if (l.cycle !== r.cycle) fields.push(`cycle: ${l.cycle} vs ${r.cycle}`);
        return fields.length === 0 ? null : fields.join('; ');
      },
    ),
  );

  // User-defined types (table types)
  counted(diffUserDefinedTypes(left.snapshot.UserDefinedTypes, right.snapshot.UserDefinedTypes, matchesIgnore));

  // Extended properties (sp_addextendedproperty entries — MS_Description etc.)
  counted(diffExtendedProperties(left.snapshot.ExtendedProperties, right.snapshot.ExtendedProperties));

  // Database principals (users + custom roles)
  counted(diffPrincipals(left.snapshot.Principals, right.snapshot.Principals));

  // Role memberships
  counted(diffRoleMemberships(left.snapshot.RoleMemberships, right.snapshot.RoleMemberships));

  // Permissions (GRANT/DENY entries)
  counted(diffPermissions(left.snapshot.Permissions, right.snapshot.Permissions));

  // Row data
  const tableRowDiffs: TableRowDiff[] = [];
  let totalRowDiffs = 0;
  if (options.RowCompareMode !== 'none') {
    const leftDumps = new Map(left.data.map((d) => [qname(d.Schema, d.Table), d]));
    const rightDumps = new Map(right.data.map((d) => [qname(d.Schema, d.Table), d]));
    for (const key of [...new Set([...leftDumps.keys(), ...rightDumps.keys()])].sort()) {
      if (matchesIgnore(key)) continue;
      const leftD = leftDumps.get(key);
      const rightD = rightDumps.get(key);
      if (!leftD || !rightD) continue;     // missing tables already reported as objectDiff
      const td = diffTableRows(leftD, rightD, options);
      if (td.DiffCount > 0 || leftD.RowCount !== rightD.RowCount) {
        tableRowDiffs.push(td);
        totalRowDiffs += td.DiffCount;
      }
    }
  }

  const summary = {
    schemasChecked: left.snapshot.Schemas.length,
    tablesChecked: allTableKeys.size,
    viewsChecked: Math.max(left.snapshot.Views.length, right.snapshot.Views.length),
    proceduresChecked: Math.max(left.snapshot.Procedures.length, right.snapshot.Procedures.length),
    functionsChecked: Math.max(left.snapshot.Functions.length, right.snapshot.Functions.length),
    triggersChecked: Math.max(left.snapshot.Triggers.length, right.snapshot.Triggers.length),
    sequencesChecked: Math.max(left.snapshot.Sequences.length, right.snapshot.Sequences.length),
    userDefinedTypesChecked: Math.max(
      left.snapshot.UserDefinedTypes.length,
      right.snapshot.UserDefinedTypes.length,
    ),
    extendedPropertiesChecked: Math.max(
      left.snapshot.ExtendedProperties.length,
      right.snapshot.ExtendedProperties.length,
    ),
    principalsChecked: Math.max(
      left.snapshot.Principals.length,
      right.snapshot.Principals.length,
    ),
    roleMembershipsChecked: Math.max(
      left.snapshot.RoleMemberships.length,
      right.snapshot.RoleMemberships.length,
    ),
    permissionsChecked: Math.max(
      left.snapshot.Permissions.length,
      right.snapshot.Permissions.length,
    ),
    objectsWithDiffs,
    tablesWithRowDiffs: tableRowDiffs.length,
    totalRowDiffs,
  };

  return {
    generatedAt: IsoUtcSeconds(new Date()),
    leftLabel: left.label,
    rightLabel: right.label,
    rowCompareMode: options.RowCompareMode,
    isClean: objectsWithDiffs === 0 && tableRowDiffs.length === 0,
    objectDiffs: StableSortBy(objectDiffs, (d) => `${d.Kind}:${d.QualifiedName}`),
    tableRowDiffs,
    summary,
  };
}

/** @deprecated Use {@link CompareSnapshots}. */
export function compareSnapshots(input: CompareInput): DiffReport {
  return CompareSnapshots(input);
}

function diffNamedSet<T>(
  kind: ObjectKind,
  leftItems: readonly T[],
  rightItems: readonly T[],
  qname: (item: T) => string,
  ignore: (q: string) => boolean,
  bodyDiff?: (left: T, right: T) => string | null,
): ObjectDiff[] {
  const leftMap = new Map(leftItems.map((i) => [qname(i).toLowerCase(), i]));
  const rightMap = new Map(rightItems.map((i) => [qname(i).toLowerCase(), i]));
  const allKeys = new Set([...leftMap.keys(), ...rightMap.keys()]);
  const out: ObjectDiff[] = [];
  for (const key of allKeys) {
    if (ignore(key)) continue;
    const l = leftMap.get(key);
    const r = rightMap.get(key);
    if (!l && r) out.push({ Kind: kind, DiffKind: 'missing-on-left', QualifiedName: key });
    else if (l && !r) out.push({ Kind: kind, DiffKind: 'missing-on-right', QualifiedName: key });
    else if (l && r && bodyDiff) {
      const detail = bodyDiff(l, r);
      if (detail) out.push({ Kind: kind, DiffKind: 'changed', QualifiedName: key, Details: detail });
    }
  }
  return out;
}

function diffTable(left: TableDef, right: TableDef): ObjectDiff[] {
  const out: ObjectDiff[] = [];
  const tableQ = `${left.Schema}.${left.Name}`;

  // Columns
  const lCols = new Map(left.Columns.map((c) => [c.name.toLowerCase(), c]));
  const rCols = new Map(right.Columns.map((c) => [c.name.toLowerCase(), c]));
  for (const name of new Set([...lCols.keys(), ...rCols.keys()])) {
    const l = lCols.get(name);
    const r = rCols.get(name);
    const q = `${tableQ}.${name}`;
    if (!l && r) out.push({ Kind: 'column', DiffKind: 'missing-on-left', QualifiedName: q });
    else if (l && !r) out.push({ Kind: 'column', DiffKind: 'missing-on-right', QualifiedName: q });
    else if (l && r) {
      const fields: string[] = [];
      if (l.dataType.toLowerCase() !== r.dataType.toLowerCase())
        fields.push(`dataType: ${l.dataType} vs ${r.dataType}`);
      if (l.isNullable !== r.isNullable) fields.push(`nullable: ${l.isNullable} vs ${r.isNullable}`);
      if (l.isIdentity !== r.isIdentity) fields.push(`identity: ${l.isIdentity} vs ${r.isIdentity}`);
      if (l.isComputed !== r.isComputed) fields.push(`computed: ${l.isComputed} vs ${r.isComputed}`);
      if (l.ordinal !== r.ordinal) fields.push(`ordinal: ${l.ordinal} vs ${r.ordinal}`);
      if ((l.collation || '') !== (r.collation || ''))
        fields.push(`collation: ${l.collation} vs ${r.collation}`);
      if ((l.computedExpression || '').trim() !== (r.computedExpression || '').trim())
        fields.push(`computedExpression differs`);
      if (!!l.isComputedPersisted !== !!r.isComputedPersisted)
        fields.push(`computedPersisted: ${l.isComputedPersisted} vs ${r.isComputedPersisted}`);
      if (normalizeDefault(l.defaultExpression) !== normalizeDefault(r.defaultExpression))
        fields.push(`default: ${l.defaultExpression} vs ${r.defaultExpression}`);
      if (fields.length) out.push({ Kind: 'column', DiffKind: 'changed', QualifiedName: q, Details: fields.join('; ') });
    }
  }

  // Primary key
  if (!!left.PrimaryKey !== !!right.PrimaryKey) {
    out.push({
      Kind: 'primaryKey',
      DiffKind: left.PrimaryKey ? 'missing-on-right' : 'missing-on-left',
      QualifiedName: tableQ,
    });
  } else if (left.PrimaryKey && right.PrimaryKey) {
    const reasons: string[] = [];
    if (left.PrimaryKey.Columns.join(',') !== right.PrimaryKey.Columns.join(','))
      reasons.push(`pk columns: ${left.PrimaryKey.Columns} vs ${right.PrimaryKey.Columns}`);
    if (left.PrimaryKey.Clustered !== right.PrimaryKey.Clustered)
      reasons.push(`pk clustered: ${left.PrimaryKey.Clustered} vs ${right.PrimaryKey.Clustered}`);
    if (left.PrimaryKey.Name !== right.PrimaryKey.Name)
      reasons.push(`pk name: ${left.PrimaryKey.Name} vs ${right.PrimaryKey.Name}`);
    if (reasons.length) {
      out.push({
        Kind: 'primaryKey',
        DiffKind: 'changed',
        QualifiedName: tableQ,
        Details: reasons.join('; '),
      });
    }
  }

  // Unique constraints (previously uncompared — silent gap)
  out.push(...diffNamedSet(
    'uniqueConstraint',
    left.UniqueConstraints,
    right.UniqueConstraints,
    (u) => `${tableQ}.${u.name}`,
    () => false,
    (l, r) => {
      if (l.columns.join(',') !== r.columns.join(',')) return 'unique constraint columns differ';
      if (l.clustered !== r.clustered) return `unique constraint clustered: ${l.clustered} vs ${r.clustered}`;
      return null;
    },
  ));

  // Indexes
  out.push(...diffNamedSet(
    'index',
    left.Indexes,
    right.Indexes,
    (i) => `${tableQ}.${i.name}`,
    () => false,
    (l, r) => {
      if (l.columns.join(',') !== r.columns.join(',')) return `index columns differ: ${l.columns} vs ${r.columns}`;
      if (l.includes.join(',') !== r.includes.join(',')) return `index includes differ`;
      if (l.isUnique !== r.isUnique) return `index uniqueness differs`;
      if (l.isClustered !== r.isClustered) return `index clustered: ${l.isClustered} vs ${r.isClustered}`;
      if ((l.filter || '').trim() !== (r.filter || '').trim()) return `index filter differs`;
      return null;
    },
  ));

  // FKs
  out.push(...diffNamedSet(
    'foreignKey',
    left.ForeignKeys,
    right.ForeignKeys,
    (f) => `${tableQ}.${f.name}`,
    () => false,
    (l, r) => {
      if (l.columns.join(',') !== r.columns.join(',')) return 'fk columns differ';
      if (l.referencedSchema !== r.referencedSchema || l.referencedTable !== r.referencedTable)
        return 'fk reference target differs';
      if (l.referencedColumns.join(',') !== r.referencedColumns.join(',')) return 'fk referenced columns differ';
      if (l.onDelete !== r.onDelete) return `fk on-delete differs (${l.onDelete} vs ${r.onDelete})`;
      if (l.onUpdate !== r.onUpdate) return `fk on-update differs (${l.onUpdate} vs ${r.onUpdate})`;
      return null;
    },
  ));

  // Checks
  out.push(...diffNamedSet(
    'check',
    left.Checks,
    right.Checks,
    (c) => `${tableQ}.${c.name}`,
    () => false,
    (l, r) =>
      normalizeBody(l.expression) === normalizeBody(r.expression) ? null : 'check expression differs',
  ));

  return out;
}

function diffTableRows(
  left: TableDataDump,
  right: TableDataDump,
  options: BaselineCompareOptions,
): TableRowDiff {
  const sample: RowDiff[] = [];
  let diffCount = 0;
  const limit = options.RowDiffSampleLimit;
  const cap = (rd: RowDiff) => {
    diffCount++;
    if (sample.length < limit) sample.push(rd);
  };

  if (options.RowCompareMode === 'counts') {
    if (left.RowCount !== right.RowCount) cap({ DiffKind: 'changed', Key: '*', ColumnDiffs: [] });
    return {
      Schema: left.Schema,
      Table: left.Table,
      LeftRowCount: left.RowCount,
      RightRowCount: right.RowCount,
      SampleDiffs: sample,
      Truncated: false,
      DiffCount: diffCount,
    };
  }

  // Both rows[] are pre-ordered (PK then col order). Walk in lock-step using
  // a stringified row key to align even when the two sides have inserts/deletes.
  const leftKeys = left.Rows.map((r) => keyForRow(r, left.Columns));
  const rightKeys = right.Rows.map((r) => keyForRow(r, right.Columns));
  const leftIndex = new Map(leftKeys.map((k, i) => [k, i]));
  const rightIndex = new Map(rightKeys.map((k, i) => [k, i]));

  for (let i = 0; i < leftKeys.length; i++) {
    const k = leftKeys[i];
    const ri = rightIndex.get(k);
    if (ri === undefined) {
      cap({ DiffKind: 'missing-on-right', Key: k });
      continue;
    }
    if (options.RowCompareMode === 'full') {
      const lRow = left.Rows[i];
      const rRow = right.Rows[ri];
      const colDiffs: ColumnValueDiff[] = [];
      for (let c = 0; c < left.Columns.length; c++) {
        const colName = left.Columns[c];
        const rIdx = right.Columns.indexOf(colName);
        if (rIdx === -1) continue;
        if (!DeepValueEqual(lRow[c], rRow[rIdx])) {
          colDiffs.push({ Column: colName, LeftValue: lRow[c], RightValue: rRow[rIdx] });
        }
      }
      if (colDiffs.length > 0) cap({ DiffKind: 'changed', Key: k, ColumnDiffs: colDiffs });
    }
  }
  for (let i = 0; i < rightKeys.length; i++) {
    const k = rightKeys[i];
    if (!leftIndex.has(k)) cap({ DiffKind: 'missing-on-left', Key: k });
  }

  return {
    Schema: left.Schema,
    Table: left.Table,
    LeftRowCount: left.RowCount,
    RightRowCount: right.RowCount,
    SampleDiffs: sample,
    Truncated: diffCount > sample.length,
    DiffCount: diffCount,
  };
}

function keyForRow(row: readonly unknown[], _columns: readonly string[]): string {
  // Use full-row JSON as the key since rows come pre-ordered. Buffer/Date are
  // serialized via toJSON for stability.
  return JSON.stringify(row, (_k, v) => {
    if (v instanceof Date) return `__date:${v.toISOString()}`;
    if (Buffer.isBuffer(v)) return `__buf:${v.toString('hex')}`;
    if (v instanceof Uint8Array) return `__buf:${Buffer.from(v).toString('hex')}`;
    return v;
  });
}

/** Normalize whitespace in object body text for tolerant body diffs. */
function normalizeBody(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\s*([(),;])\s*/g, '$1').trim().toLowerCase();
}

/**
 * Normalize a DEFAULT expression for equality. `sys.default_constraints.definition`
 * always returns the value parenthesized — but how many layers of parens varies
 * by SQL Server version and origin (CREATE TABLE inline vs ALTER TABLE ADD CONSTRAINT).
 * Strip outer matched parens iteratively, lowercase, drop whitespace.
 */
function normalizeDefault(value: string | undefined): string {
  if (!value) return '';
  let v = value.trim();
  while (v.startsWith('(') && v.endsWith(')')) {
    // Only peel a layer if the OUTER pair is matched (i.e. the open paren at
    // index 0 closes at the last char). Naive .slice would corrupt expressions
    // like `(a)+(b)`.
    let depth = 0;
    let matched = true;
    for (let i = 0; i < v.length; i++) {
      if (v[i] === '(') depth++;
      else if (v[i] === ')') depth--;
      if (depth === 0 && i < v.length - 1) { matched = false; break; }
    }
    if (!matched) break;
    v = v.slice(1, -1).trim();
  }
  return v.replace(/\s+/g, ' ').toLowerCase();
}

/** Diff user-defined types (table types). Comparison is structural: same columns, same PK, same memory-optimization. */
function diffUserDefinedTypes(
  left: readonly UserDefinedTypeDef[],
  right: readonly UserDefinedTypeDef[],
  ignore: (q: string) => boolean,
): ObjectDiff[] {
  return diffNamedSet(
    'userDefinedType',
    left,
    right,
    (t) => `${t.Schema}.${t.Name}`,
    ignore,
    (l, r) => {
      const reasons: string[] = [];
      if (l.Kind !== r.Kind) reasons.push(`kind: ${l.Kind} vs ${r.Kind}`);
      if (l.IsMemoryOptimized !== r.IsMemoryOptimized) reasons.push('memory-optimized differs');
      // Column-by-column structural diff. Order matters (TVPs have a fixed
      // column ordinal that affects INSERT compatibility).
      if (l.Columns.length !== r.Columns.length) {
        reasons.push(`column count: ${l.Columns.length} vs ${r.Columns.length}`);
      } else {
        for (let i = 0; i < l.Columns.length; i++) {
          const lc = l.Columns[i];
          const rc = r.Columns[i];
          if (lc.name !== rc.name) reasons.push(`col[${i}] name: ${lc.name} vs ${rc.name}`);
          if (lc.dataType.toLowerCase() !== rc.dataType.toLowerCase())
            reasons.push(`col[${i}] dataType: ${lc.dataType} vs ${rc.dataType}`);
          if (lc.isNullable !== rc.isNullable)
            reasons.push(`col[${i}] nullable: ${lc.isNullable} vs ${rc.isNullable}`);
        }
      }
      const lPkCols = l.PrimaryKey?.Columns.join(',') ?? '';
      const rPkCols = r.PrimaryKey?.Columns.join(',') ?? '';
      if (lPkCols !== rPkCols) reasons.push(`pk columns: ${lPkCols} vs ${rPkCols}`);
      return reasons.length === 0 ? null : reasons.join('; ');
    },
  );
}

/**
 * Diff extended properties. These are pure key/value entries on schema/object/column
 * targets — we compare by their canonical target key and assert value equality.
 */
function diffExtendedProperties(
  left: readonly ExtendedPropertyDef[],
  right: readonly ExtendedPropertyDef[],
): ObjectDiff[] {
  const key = (p: ExtendedPropertyDef) =>
    [
      p.SchemaName,
      p.Level1Type ?? '',
      p.Level1Name ?? '',
      p.Level2Type ?? '',
      p.Level2Name ?? '',
      p.Name,
    ]
      .join('::')
      .toLowerCase();
  const leftMap = new Map(left.map((p) => [key(p), p]));
  const rightMap = new Map(right.map((p) => [key(p), p]));
  const allKeys = new Set([...leftMap.keys(), ...rightMap.keys()]);
  const out: ObjectDiff[] = [];
  for (const k of allKeys) {
    const l = leftMap.get(k);
    const r = rightMap.get(k);
    if (!l && r) out.push({ Kind: 'extendedProperty', DiffKind: 'missing-on-left', QualifiedName: k });
    else if (l && !r) out.push({ Kind: 'extendedProperty', DiffKind: 'missing-on-right', QualifiedName: k });
    else if (l && r && l.Value !== r.Value) {
      out.push({
        Kind: 'extendedProperty',
        DiffKind: 'changed',
        QualifiedName: k,
        Details: `value differs`,
        LeftValue: l.Value,
        RightValue: r.Value,
      });
    }
  }
  return out;
}

/** Diff database principals (users + custom roles). Matched by name; kind/owner/defaultSchema compared. */
function diffPrincipals(
  left: readonly DatabasePrincipalDef[],
  right: readonly DatabasePrincipalDef[],
): ObjectDiff[] {
  return diffNamedSet(
    'principal',
    left,
    right,
    (p) => p.Name,
    () => false,
    (l, r) => {
      const reasons: string[] = [];
      if (l.Kind !== r.Kind) reasons.push(`kind: ${l.Kind} vs ${r.Kind}`);
      // Owner mismatch is informational only — emitted CREATE ROLE matches the
      // source's AUTHORIZATION clause. Skip if either side is missing the owner
      // (older snapshots / future formats may omit it).
      if (l.Owner && r.Owner && l.Owner.toLowerCase() !== r.Owner.toLowerCase()) {
        reasons.push(`owner: ${l.Owner} vs ${r.Owner}`);
      }
      if ((l.DefaultSchema || '').toLowerCase() !== (r.DefaultSchema || '').toLowerCase()) {
        reasons.push(`defaultSchema: ${l.DefaultSchema} vs ${r.DefaultSchema}`);
      }
      return reasons.length === 0 ? null : reasons.join('; ');
    },
  );
}

/** Diff role memberships. Pair is (role, member); presence is the entire equality. */
function diffRoleMemberships(
  left: readonly RoleMembershipDef[],
  right: readonly RoleMembershipDef[],
): ObjectDiff[] {
  const key = (m: RoleMembershipDef) => `${m.role}|${m.member}`.toLowerCase();
  const leftMap = new Map(left.map((m) => [key(m), m]));
  const rightMap = new Map(right.map((m) => [key(m), m]));
  const allKeys = new Set([...leftMap.keys(), ...rightMap.keys()]);
  const out: ObjectDiff[] = [];
  for (const k of allKeys) {
    const inL = leftMap.has(k);
    const inR = rightMap.has(k);
    if (inL && !inR) out.push({ Kind: 'roleMembership', DiffKind: 'missing-on-right', QualifiedName: k });
    else if (!inL && inR) out.push({ Kind: 'roleMembership', DiffKind: 'missing-on-left', QualifiedName: k });
  }
  return out;
}

/**
 * Diff permission grants. Equality key is the full tuple:
 * (grantee, targetClass, schema, object/type, column, permission). State
 * (GRANT vs DENY vs WITH-GRANT-OPTION) is part of the value comparison so
 * a state change shows up as a `changed` diff rather than a remove+add pair.
 */
function diffPermissions(
  left: readonly PermissionDef[],
  right: readonly PermissionDef[],
): ObjectDiff[] {
  const key = (p: PermissionDef) =>
    [
      p.grantee,
      p.targetClass,
      p.targetSchema ?? '',
      p.targetObject ?? p.targetType ?? '',
      p.targetColumn ?? '',
      p.permission,
    ]
      .join('|')
      .toLowerCase();
  const leftMap = new Map(left.map((p) => [key(p), p]));
  const rightMap = new Map(right.map((p) => [key(p), p]));
  const allKeys = new Set([...leftMap.keys(), ...rightMap.keys()]);
  const out: ObjectDiff[] = [];
  for (const k of allKeys) {
    const l = leftMap.get(k);
    const r = rightMap.get(k);
    if (l && !r) out.push({ Kind: 'permission', DiffKind: 'missing-on-right', QualifiedName: k });
    else if (!l && r) out.push({ Kind: 'permission', DiffKind: 'missing-on-left', QualifiedName: k });
    else if (l && r && l.state !== r.state) {
      out.push({
        Kind: 'permission',
        DiffKind: 'changed',
        QualifiedName: k,
        Details: `state: ${l.state} vs ${r.state}`,
      });
    }
  }
  return out;
}
