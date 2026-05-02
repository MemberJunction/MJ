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

import { deepValueEqual, isoUtcSeconds, qname, stableSortBy } from './util';
import type {
  BaselineCompareOptions,
  ColumnValueDiff,
  DiffReport,
  ObjectDiff,
  ObjectKind,
  SchemaSnapshot,
  TableDataDump,
  TableDef,
  TableRowDiff,
  RowDiff,
} from './types';

export interface CompareInput {
  left: { snapshot: SchemaSnapshot; data: readonly TableDataDump[]; label: string };
  right: { snapshot: SchemaSnapshot; data: readonly TableDataDump[]; label: string };
  options: BaselineCompareOptions;
}

export function compareSnapshots(input: CompareInput): DiffReport {
  const { left, right, options } = input;
  const ignored = options.ignorePattern;
  const matchesIgnore = (q: string) => (ignored ? ignored.test(q) : false);

  const objectDiffs: ObjectDiff[] = [];
  let objectsWithDiffs = 0;
  const counted = (diffs: ObjectDiff[]) => {
    if (diffs.length === 0) return;
    objectsWithDiffs += diffs.length;
    objectDiffs.push(...diffs);
  };

  // Schemas
  counted(diffNamedSet('schema', left.snapshot.schemas, right.snapshot.schemas, (s) => s.name, matchesIgnore));

  // Tables
  const leftTables = new Map(left.snapshot.tables.map((t) => [qname(t.schema, t.name), t]));
  const rightTables = new Map(right.snapshot.tables.map((t) => [qname(t.schema, t.name), t]));
  const allTableKeys = new Set([...leftTables.keys(), ...rightTables.keys()]);

  for (const key of [...allTableKeys].sort()) {
    if (matchesIgnore(key)) continue;
    const leftT = leftTables.get(key);
    const rightT = rightTables.get(key);
    if (!leftT && rightT) {
      objectDiffs.push({ kind: 'table', diffKind: 'missing-on-left', qualifiedName: key });
      objectsWithDiffs++;
      continue;
    }
    if (leftT && !rightT) {
      objectDiffs.push({ kind: 'table', diffKind: 'missing-on-right', qualifiedName: key });
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
      left.snapshot.views,
      right.snapshot.views,
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
      left.snapshot.procedures,
      right.snapshot.procedures,
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
      left.snapshot.functions,
      right.snapshot.functions,
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
      left.snapshot.triggers,
      right.snapshot.triggers,
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
      left.snapshot.sequences,
      right.snapshot.sequences,
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

  // Row data
  const tableRowDiffs: TableRowDiff[] = [];
  let totalRowDiffs = 0;
  if (options.rowCompareMode !== 'none') {
    const leftDumps = new Map(left.data.map((d) => [qname(d.schema, d.table), d]));
    const rightDumps = new Map(right.data.map((d) => [qname(d.schema, d.table), d]));
    for (const key of [...new Set([...leftDumps.keys(), ...rightDumps.keys()])].sort()) {
      if (matchesIgnore(key)) continue;
      const leftD = leftDumps.get(key);
      const rightD = rightDumps.get(key);
      if (!leftD || !rightD) continue;     // missing tables already reported as objectDiff
      const td = diffTableRows(leftD, rightD, options);
      if (td.diffCount > 0 || leftD.rowCount !== rightD.rowCount) {
        tableRowDiffs.push(td);
        totalRowDiffs += td.diffCount;
      }
    }
  }

  const summary = {
    schemasChecked: left.snapshot.schemas.length,
    tablesChecked: allTableKeys.size,
    viewsChecked: Math.max(left.snapshot.views.length, right.snapshot.views.length),
    proceduresChecked: Math.max(left.snapshot.procedures.length, right.snapshot.procedures.length),
    functionsChecked: Math.max(left.snapshot.functions.length, right.snapshot.functions.length),
    triggersChecked: Math.max(left.snapshot.triggers.length, right.snapshot.triggers.length),
    sequencesChecked: Math.max(left.snapshot.sequences.length, right.snapshot.sequences.length),
    objectsWithDiffs,
    tablesWithRowDiffs: tableRowDiffs.length,
    totalRowDiffs,
  };

  return {
    generatedAt: isoUtcSeconds(new Date()),
    leftLabel: left.label,
    rightLabel: right.label,
    rowCompareMode: options.rowCompareMode,
    isClean: objectsWithDiffs === 0 && tableRowDiffs.length === 0,
    objectDiffs: stableSortBy(objectDiffs, (d) => `${d.kind}:${d.qualifiedName}`),
    tableRowDiffs,
    summary,
  };
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
    if (!l && r) out.push({ kind, diffKind: 'missing-on-left', qualifiedName: key });
    else if (l && !r) out.push({ kind, diffKind: 'missing-on-right', qualifiedName: key });
    else if (l && r && bodyDiff) {
      const detail = bodyDiff(l, r);
      if (detail) out.push({ kind, diffKind: 'changed', qualifiedName: key, details: detail });
    }
  }
  return out;
}

function diffTable(left: TableDef, right: TableDef): ObjectDiff[] {
  const out: ObjectDiff[] = [];
  const tableQ = `${left.schema}.${left.name}`;

  // Columns
  const lCols = new Map(left.columns.map((c) => [c.name.toLowerCase(), c]));
  const rCols = new Map(right.columns.map((c) => [c.name.toLowerCase(), c]));
  for (const name of new Set([...lCols.keys(), ...rCols.keys()])) {
    const l = lCols.get(name);
    const r = rCols.get(name);
    const q = `${tableQ}.${name}`;
    if (!l && r) out.push({ kind: 'column', diffKind: 'missing-on-left', qualifiedName: q });
    else if (l && !r) out.push({ kind: 'column', diffKind: 'missing-on-right', qualifiedName: q });
    else if (l && r) {
      const fields: string[] = [];
      if (l.dataType.toLowerCase() !== r.dataType.toLowerCase())
        fields.push(`dataType: ${l.dataType} vs ${r.dataType}`);
      if (l.isNullable !== r.isNullable) fields.push(`nullable: ${l.isNullable} vs ${r.isNullable}`);
      if (l.isIdentity !== r.isIdentity) fields.push(`identity: ${l.isIdentity} vs ${r.isIdentity}`);
      if (l.isComputed !== r.isComputed) fields.push(`computed: ${l.isComputed} vs ${r.isComputed}`);
      if ((l.defaultExpression || '').toLowerCase() !== (r.defaultExpression || '').toLowerCase())
        fields.push(`default: ${l.defaultExpression} vs ${r.defaultExpression}`);
      if (fields.length) out.push({ kind: 'column', diffKind: 'changed', qualifiedName: q, details: fields.join('; ') });
    }
  }

  // Primary key
  if (!!left.primaryKey !== !!right.primaryKey) {
    out.push({
      kind: 'primaryKey',
      diffKind: left.primaryKey ? 'missing-on-right' : 'missing-on-left',
      qualifiedName: tableQ,
    });
  } else if (left.primaryKey && right.primaryKey) {
    if (left.primaryKey.columns.join(',') !== right.primaryKey.columns.join(',')) {
      out.push({
        kind: 'primaryKey',
        diffKind: 'changed',
        qualifiedName: tableQ,
        details: `pk columns: ${left.primaryKey.columns} vs ${right.primaryKey.columns}`,
      });
    }
  }

  // Indexes
  out.push(...diffNamedSet(
    'index',
    left.indexes,
    right.indexes,
    (i) => `${tableQ}.${i.name}`,
    () => false,
    (l, r) => {
      if (l.columns.join(',') !== r.columns.join(',')) return `index columns differ: ${l.columns} vs ${r.columns}`;
      if (l.includes.join(',') !== r.includes.join(',')) return `index includes differ`;
      if (l.isUnique !== r.isUnique) return `index uniqueness differs`;
      return null;
    },
  ));

  // FKs
  out.push(...diffNamedSet(
    'foreignKey',
    left.foreignKeys,
    right.foreignKeys,
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
    left.checks,
    right.checks,
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
  const limit = options.rowDiffSampleLimit;
  const cap = (rd: RowDiff) => {
    diffCount++;
    if (sample.length < limit) sample.push(rd);
  };

  if (options.rowCompareMode === 'counts') {
    if (left.rowCount !== right.rowCount) cap({ diffKind: 'changed', key: '*', columnDiffs: [] });
    return {
      schema: left.schema,
      table: left.table,
      leftRowCount: left.rowCount,
      rightRowCount: right.rowCount,
      sampleDiffs: sample,
      truncated: false,
      diffCount,
    };
  }

  // Both rows[] are pre-ordered (PK then col order). Walk in lock-step using
  // a stringified row key to align even when the two sides have inserts/deletes.
  const leftKeys = left.rows.map((r) => keyForRow(r, left.columns));
  const rightKeys = right.rows.map((r) => keyForRow(r, right.columns));
  const leftIndex = new Map(leftKeys.map((k, i) => [k, i]));
  const rightIndex = new Map(rightKeys.map((k, i) => [k, i]));

  for (let i = 0; i < leftKeys.length; i++) {
    const k = leftKeys[i];
    const ri = rightIndex.get(k);
    if (ri === undefined) {
      cap({ diffKind: 'missing-on-right', key: k });
      continue;
    }
    if (options.rowCompareMode === 'full') {
      const lRow = left.rows[i];
      const rRow = right.rows[ri];
      const colDiffs: ColumnValueDiff[] = [];
      for (let c = 0; c < left.columns.length; c++) {
        const colName = left.columns[c];
        const rIdx = right.columns.indexOf(colName);
        if (rIdx === -1) continue;
        if (!deepValueEqual(lRow[c], rRow[rIdx])) {
          colDiffs.push({ column: colName, leftValue: lRow[c], rightValue: rRow[rIdx] });
        }
      }
      if (colDiffs.length > 0) cap({ diffKind: 'changed', key: k, columnDiffs: colDiffs });
    }
  }
  for (let i = 0; i < rightKeys.length; i++) {
    const k = rightKeys[i];
    if (!leftIndex.has(k)) cap({ diffKind: 'missing-on-left', key: k });
  }

  return {
    schema: left.schema,
    table: left.table,
    leftRowCount: left.rowCount,
    rightRowCount: right.rowCount,
    sampleDiffs: sample,
    truncated: diffCount > sample.length,
    diffCount,
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
