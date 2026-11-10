/**
 * Decides what each probe measures. Only measures an enabled check needs are requested, so a
 * switched-off check costs nothing, and a table with nothing to measure gets no statement at all.
 */

import type { ColumnDefinition, DatabaseDocumentation, TableDefinition } from '../types/state.js';
import type { ColumnMeasure, RelationshipProbeOrigin, RelationshipProbeSpec, TableQualityProbeColumn, TableQualityProbeSpec } from '../types/data-quality.js';
import type { ResolvedDataQualityConfig } from './DataQualityConfig.js';
import { IsFutureLookingName, IsQuantityName, TypeMismatch, type RuleContext } from './DataQualityRules.js';
import { BaseTypeName } from './QualityProbeSQL.js';
import type { QualityDialect } from './QualityProbeSQL.js';
import { FindTable, OrphanProbeOrigin, RelationshipKey, TableRelationships, type Relationship } from './Relationships.js';

/** Text longer than this is not checked for numbers or dates stored as text. */
const MAX_LENGTH_FOR_STORED_AS_TEXT = 255;
/** Text longer than this is not compared for spelling variants (SQL Server compares as NVARCHAR(4000)). */
const MAX_LENGTH_FOR_VARIANTS = 4000;
/** Types that cannot be compared for equality, so they are left out of the duplicate-row check. */
const NOT_COMPARABLE = new Set(['xml', 'image', 'text', 'ntext', 'geography', 'geometry', 'hierarchyid', 'sql_variant', 'json']);

/** The measures one column needs, given the enabled checks. */
export function ColumnMeasures(dialect: QualityDialect, config: ResolvedDataQualityConfig, column: ColumnDefinition): ColumnMeasure[] {
  const { Checks, Thresholds } = config;
  const s = column.statistics;
  if (s && s.totalRows > 0 && s.nullCount >= s.totalRows) return []; // always NULL: nothing to measure
  const family = dialect.TypeFamily(column.dataType);
  const measures: ColumnMeasure[] = [];
  // SQL Server reports (max) columns with no length; other engines use no length for unbounded text too.
  const unbounded = column.maxLength === undefined;
  const sqlServerMax = unbounded && dialect.Provider === 'sqlserver';

  if (family === 'text' || family === 'fixedText') {
    if (Checks.BlankString) measures.push('Blank');
    if (Checks.UntrimmedString && family === 'text') measures.push('Untrimmed');
    const distinct = s?.distinctCount;
    const lengthOk = !sqlServerMax && (unbounded || (column.maxLength ?? 0) <= MAX_LENGTH_FOR_VARIANTS);
    if (Checks.CaseWhitespaceVariants && lengthOk && distinct !== undefined && distinct > 1 && distinct <= Thresholds.variantsMaxDistinct) {
      measures.push('Variants');
    }
    const shortText = !sqlServerMax && (unbounded || (column.maxLength ?? 0) <= MAX_LENGTH_FOR_STORED_AS_TEXT);
    if (shortText && (Checks.NumericStoredAsText || Checks.DateStoredAsText)) {
      measures.push('NumericLike');
      if (Checks.DateStoredAsText) measures.push('DateLike');
    }
    if (
      Checks.LengthAtCapacity &&
      family === 'text' &&
      column.maxLength !== undefined &&
      column.maxLength >= Thresholds.lengthAtCapacityMinDeclared &&
      (s?.maxLength === undefined || s.maxLength >= column.maxLength)
    ) {
      measures.push('AtCapacity');
    }
  } else if (family === 'date') {
    if (Checks.SentinelDate) measures.push('SentinelDate');
    if (Checks.FutureDate && !IsFutureLookingName(column.name)) measures.push('FutureDate');
  } else if (family === 'numeric') {
    if (Checks.NegativeValue && IsQuantityName(column.name)) measures.push('Negative');
  }

  if (measures.length > 0) measures.unshift('NonNull');
  return measures;
}

/** True when the table has neither a primary key nor a unique index. */
export function HasNoKey(table: TableDefinition): boolean {
  if (table.columns.some((c) => c.isPrimaryKey)) return false;
  return !(table.indexes ?? []).some((ix) => (ix.IsPrimaryKey || ix.IsUnique) && !ix.FilterDefinition);
}

/** The probe for one table, or undefined when there is nothing to measure. */
export function PlanTableProbe(context: RuleContext, schemaName: string, table: TableDefinition): TableQualityProbeSpec | undefined {
  const columns: TableQualityProbeColumn[] = [];
  for (const column of table.columns) {
    const measures = ColumnMeasures(context.Dialect, context.Config, column);
    if (measures.length === 0) continue;
    columns.push({ Name: column.name, DataType: column.dataType, DeclaredLength: column.maxLength, Measures: measures });
  }
  const countDuplicates = context.Config.Checks.ExactDuplicateRows && HasNoKey(table);
  const comparable = countDuplicates
    ? table.columns.filter((c) => !NOT_COMPARABLE.has(BaseTypeName(c.dataType)) && context.Dialect.TypeFamily(c.dataType) !== 'largeText').map((c) => c.name)
    : [];
  // Without statistics the probe is also how the exact row count is learned.
  const hasStatistics = table.columns.some((c) => c.statistics !== undefined);
  if (columns.length === 0 && !countDuplicates && hasStatistics) return undefined;
  return {
    Schema: schemaName,
    Table: table.name,
    Columns: columns,
    CountDuplicateRows: countDuplicates && comparable.length > 0,
    DuplicateRowColumns: comparable,
    FutureToleranceDays: context.Config.Thresholds.futureDateToleranceDays,
  };
}

/** True when some columns could not take part in the duplicate-row comparison. */
export function DuplicateCountIsApproximate(table: TableDefinition, spec: TableQualityProbeSpec): boolean {
  return (spec.DuplicateRowColumns?.length ?? 0) < table.columns.length;
}

/** A relationship that needs an orphan probe. */
export interface PlannedRelationshipProbe {
  Key: string;
  Relationship: Relationship;
  Origin: RelationshipProbeOrigin;
  Spec: RelationshipProbeSpec;
}

/**
 * Every relationship of the database that needs an orphan probe: discovered keys, and declared
 * constraints the database does not guarantee. Keys in `skip` are left out.
 */
export function PlanRelationshipProbes(context: RuleContext, skip: (key: string) => boolean): PlannedRelationshipProbe[] {
  const { Checks } = context.Config;
  if (!Checks.OrphanedForeignKey && !Checks.UnreferencedParentRows) return [];
  const state: DatabaseDocumentation = context.State;
  const out: PlannedRelationshipProbe[] = [];
  for (const schema of state.schemas) {
    for (const table of schema.tables) {
      for (const r of TableRelationships(schema.name, table)) {
        const origin = OrphanProbeOrigin(r);
        if (!origin) continue;
        const key = RelationshipKey(r);
        if (skip(key)) continue;
        const parent = FindTable(state.schemas, r.Parent.Schema, r.Parent.Table);
        if (!parent || r.Child.Columns.length !== r.Parent.Columns.length) continue;
        const columnsExist =
          r.Child.Columns.every((c) => table.columns.some((col) => col.name.toLowerCase() === c.toLowerCase())) &&
          r.Parent.Columns.every((c) => parent.columns.some((col) => col.name.toLowerCase() === c.toLowerCase()));
        if (!columnsExist) continue;
        out.push({
          Key: key,
          Relationship: r,
          Origin: origin,
          Spec: {
            Child: { ...r.Child, Columns: [...r.Child.Columns] },
            Parent: { ...r.Parent, Columns: [...r.Parent.Columns] },
            CompareAsText: TypeMismatch(context, r) !== undefined,
            CountUnreferencedParents: Checks.UnreferencedParentRows,
          },
        });
      }
    }
  }
  return out;
}
