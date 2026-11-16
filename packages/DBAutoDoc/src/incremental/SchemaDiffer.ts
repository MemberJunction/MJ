/**
 * SchemaDiffer — computes exact structural deltas between a prior DBAutoDoc state
 * and a freshly introspected database catalog.
 *
 * Critically distinguishes catalog-declared PK/FK constraints from AI-discovered
 * soft keys stamped onto `previousState.schemas`, so unchanged soft-key tables
 * are never falsely classified as DDL-modified.
 */

import { AutoDocIndex } from '../types/driver.js';
import {
  ColumnDiff,
  ColumnDiffKind,
  IncrementalConfig,
  SchemaDiffSummary,
  TableDiff,
} from '../types/incremental.js';
import {
  ColumnDefinition,
  DatabaseDocumentation,
  ForeignKeyReference,
  SchemaDefinition,
  TableDefinition,
} from '../types/state.js';

/** Find an item by `name` using exact match first, falling back to case-insensitive match. */
export function FindNamedItem<T extends { name: string }>(items: T[], targetName: string): T | undefined {
  const exact = items.find((i) => i.name === targetName);
  if (exact) return exact;
  const lower = targetName.toLowerCase();
  return items.find((i) => i.name.toLowerCase() === lower);
}

/** True when `column` was declared as a primary key in the database catalog during the prior run. */
export function WasCatalogPrimaryKey(
  previousState: DatabaseDocumentation,
  schemaName: string,
  tableName: string,
  column: ColumnDefinition,
): boolean {
  if (column.isCatalogPrimaryKey !== undefined) {
    return column.isCatalogPrimaryKey;
  }
  if ('primaryKeySource' in column && (column as { primaryKeySource?: string }).primaryKeySource === 'discovery') {
    return false;
  }
  if (!column.isPrimaryKey) {
    return false;
  }
  return !isDiscoveredPKColumn(previousState, schemaName, tableName, column.name);
}

/** True when `dep` came from a catalog foreign-key constraint rather than AI discovery. */
export function IsCatalogForeignKeyRef(
  previousState: DatabaseDocumentation,
  schemaName: string,
  tableName: string,
  dep: ForeignKeyReference,
): boolean {
  if (dep.constraintName !== undefined && dep.constraintName.length > 0) {
    return true;
  }
  const discovered = previousState.phases?.keyDetection?.discovered?.foreignKeys ?? [];
  const matchesDiscovered = discovered.some(
    (fk) =>
      fk.schemaName.toLowerCase() === schemaName.toLowerCase() &&
      fk.sourceTable.toLowerCase() === tableName.toLowerCase() &&
      fk.sourceColumn.toLowerCase() === dep.column.toLowerCase() &&
      fk.targetSchema.toLowerCase() === dep.schema.toLowerCase() &&
      fk.targetTable.toLowerCase() === dep.table.toLowerCase() &&
      fk.targetColumn.toLowerCase() === dep.referencedColumn.toLowerCase(),
  );
  return !matchesDiscovered;
}

/** Extract only the catalog-declared outgoing foreign keys of `table` from `previousState`. */
export function GetCatalogForeignKeys(
  previousState: DatabaseDocumentation,
  schemaName: string,
  table: TableDefinition,
): ForeignKeyReference[] {
  return table.dependsOn.filter((dep) => IsCatalogForeignKeyRef(previousState, schemaName, table.name, dep));
}

/** Compute the full structural diff between `previousState` and freshly introspected `liveSchemas`. */
export function DiffSchemas(
  previousState: DatabaseDocumentation,
  liveSchemas: SchemaDefinition[],
  options: IncrementalConfig = {},
): SchemaDiffSummary {
  const prevSchemas = previousState.schemas ?? [];
  const addedSchemas = liveSchemas
    .filter((ls) => !FindNamedItem(prevSchemas, ls.name))
    .map((ls) => ls.name);
  const removedSchemas = prevSchemas
    .filter((ps) => !FindNamedItem(liveSchemas, ps.name))
    .map((ps) => ps.name);

  const acc = createDiffAccumulator(addedSchemas, removedSchemas);
  for (const prevSchema of prevSchemas) {
    collectRemovedTablesForSchema(prevSchema, liveSchemas, acc);
  }
  for (const liveSchema of liveSchemas) {
    collectLiveSchemaDiffs(previousState, prevSchemas, liveSchema, options, acc);
  }

  acc.HasChanges =
    acc.AddedSchemas.length > 0 ||
    acc.RemovedSchemas.length > 0 ||
    acc.AddedTables.length > 0 ||
    acc.RemovedTables.length > 0 ||
    acc.ModifiedTables.length > 0;
  return acc;
}

function createDiffAccumulator(addedSchemas: string[], removedSchemas: string[]): SchemaDiffSummary {
  return {
    AddedSchemas: addedSchemas,
    RemovedSchemas: removedSchemas,
    AddedTables: [],
    RemovedTables: [],
    ModifiedTables: [],
    UnchangedTables: [],
    TotalColumnsToSample: 0,
    HasChanges: false,
  };
}

function collectRemovedTablesForSchema(
  prevSchema: SchemaDefinition,
  liveSchemas: SchemaDefinition[],
  acc: SchemaDiffSummary,
): void {
  const liveSchema = FindNamedItem(liveSchemas, prevSchema.name);
  for (const prevTable of prevSchema.tables) {
    if (!liveSchema || !FindNamedItem(liveSchema.tables, prevTable.name)) {
      acc.RemovedTables.push(`${prevSchema.name}.${prevTable.name}`);
    }
  }
}

function collectLiveSchemaDiffs(
  previousState: DatabaseDocumentation,
  prevSchemas: SchemaDefinition[],
  liveSchema: SchemaDefinition,
  options: IncrementalConfig,
  acc: SchemaDiffSummary,
): void {
  const prevSchema = FindNamedItem(prevSchemas, liveSchema.name);
  for (const liveTable of liveSchema.tables) {
    const tableKey = `${liveSchema.name}.${liveTable.name}`;
    const prevTable = prevSchema ? FindNamedItem(prevSchema.tables, liveTable.name) : undefined;
    if (!prevTable) {
      acc.AddedTables.push(tableKey);
      acc.TotalColumnsToSample += liveTable.columns.length;
      continue;
    }
    const tableDiff = diffRetainedTable(previousState, prevSchema!.name, prevTable, liveSchema.name, liveTable, options);
    if (isTableModified(tableDiff)) {
      acc.ModifiedTables.push(tableDiff);
      acc.TotalColumnsToSample += countColumnsToSample(liveTable, tableDiff);
    } else {
      acc.UnchangedTables.push(tableKey);
    }
  }
}

function diffRetainedTable(
  previousState: DatabaseDocumentation,
  prevSchemaName: string,
  prevTable: TableDefinition,
  liveSchemaName: string,
  liveTable: TableDefinition,
  options: IncrementalConfig,
): TableDiff {
  const prevCatalogFKs = GetCatalogForeignKeys(previousState, prevSchemaName, prevTable);
  const liveCatalogFKs = liveTable.dependsOn;
  const addedColumns: string[] = [];
  const modifiedColumns: ColumnDiff[] = [];

  for (const liveCol of liveTable.columns) {
    const prevCol = FindNamedItem(prevTable.columns, liveCol.name);
    if (!prevCol) {
      addedColumns.push(liveCol.name);
      continue;
    }
    const colDiff = diffColumn(previousState, prevSchemaName, prevTable.name, prevCol, prevCatalogFKs, liveCol, liveCatalogFKs);
    if (colDiff) modifiedColumns.push(colDiff);
  }

  const removedColumns = prevTable.columns
    .filter((pc) => !FindNamedItem(liveTable.columns, pc.name))
    .map((pc) => pc.name);

  const reanalyzePopulated = options.reanalyzePopulatedTables !== false;
  return {
    SchemaName: liveSchemaName,
    TableName: liveTable.name,
    TableKey: `${liveSchemaName}.${liveTable.name}`,
    AddedColumns: addedColumns,
    RemovedColumns: removedColumns,
    ModifiedColumns: modifiedColumns,
    DeclaredPKChanged: didCatalogPKChange(previousState, prevSchemaName, prevTable, liveTable),
    DeclaredFKsChanged: didCatalogFKsChange(prevCatalogFKs, liveCatalogFKs),
    IndexesChanged: didIndexesChange(prevTable.indexes, liveTable.indexes),
    PopulatedFromEmpty: reanalyzePopulated && prevTable.rowCount === 0 && liveTable.rowCount > 0,
  };
}

function diffColumn(
  previousState: DatabaseDocumentation,
  prevSchemaName: string,
  prevTableName: string,
  prevCol: ColumnDefinition,
  prevCatalogFKs: ForeignKeyReference[],
  liveCol: ColumnDefinition,
  liveCatalogFKs: ForeignKeyReference[],
): ColumnDiff | null {
  const changes: ColumnDiffKind[] = [];
  if (normalizeDataType(prevCol.dataType) !== normalizeDataType(liveCol.dataType)) {
    changes.push('dataType');
  }
  if ((prevCol.maxLength ?? null) !== (liveCol.maxLength ?? null)) {
    changes.push('maxLength');
  }
  if (prevCol.isNullable !== liveCol.isNullable) {
    changes.push('nullability');
  }
  if (WasCatalogPrimaryKey(previousState, prevSchemaName, prevTableName, prevCol) !== liveCol.isPrimaryKey) {
    changes.push('declaredPK');
  }
  if (formatColumnFKTargets(prevCatalogFKs, prevCol.name) !== formatColumnFKTargets(liveCatalogFKs, liveCol.name)) {
    changes.push('declaredFK');
  }
  if ((prevCol.checkConstraint ?? '') !== (liveCol.checkConstraint ?? '')) {
    changes.push('checkConstraint');
  }
  if ((prevCol.defaultValue ?? '') !== (liveCol.defaultValue ?? '')) {
    changes.push('defaultValue');
  }
  if (changes.length === 0) return null;

  const requiresResampling = changes.some(
    (c) => c === 'dataType' || c === 'maxLength' || c === 'nullability' || c === 'checkConstraint',
  );
  return { ColumnName: liveCol.name, Changes: changes, RequiresResampling: requiresResampling };
}

function isTableModified(diff: TableDiff): boolean {
  return (
    diff.AddedColumns.length > 0 ||
    diff.RemovedColumns.length > 0 ||
    diff.ModifiedColumns.length > 0 ||
    diff.DeclaredPKChanged ||
    diff.DeclaredFKsChanged ||
    diff.IndexesChanged ||
    diff.PopulatedFromEmpty
  );
}

function countColumnsToSample(liveTable: TableDefinition, diff: TableDiff): number {
  if (diff.PopulatedFromEmpty) {
    return liveTable.columns.length;
  }
  const resampledModified = diff.ModifiedColumns.filter((c) => c.RequiresResampling).length;
  return diff.AddedColumns.length + resampledModified;
}

function isDiscoveredPKColumn(
  previousState: DatabaseDocumentation,
  schemaName: string,
  tableName: string,
  columnName: string,
): boolean {
  const candidates = previousState.phases?.keyDetection?.discovered?.primaryKeys ?? [];
  return candidates.some(
    (pk) =>
      pk.status !== 'rejected' &&
      pk.schemaName.toLowerCase() === schemaName.toLowerCase() &&
      pk.tableName.toLowerCase() === tableName.toLowerCase() &&
      pk.columnNames.some((c) => c.toLowerCase() === columnName.toLowerCase()),
  );
}

function didCatalogPKChange(
  previousState: DatabaseDocumentation,
  prevSchemaName: string,
  prevTable: TableDefinition,
  liveTable: TableDefinition,
): boolean {
  const prevPKs = prevTable.columns
    .filter((c) => WasCatalogPrimaryKey(previousState, prevSchemaName, prevTable.name, c))
    .map((c) => c.name.toLowerCase())
    .sort()
    .join(',');
  const livePKs = liveTable.columns
    .filter((c) => c.isPrimaryKey)
    .map((c) => c.name.toLowerCase())
    .sort()
    .join(',');
  return prevPKs !== livePKs;
}

function didCatalogFKsChange(prevFKs: ForeignKeyReference[], liveFKs: ForeignKeyReference[]): boolean {
  const sig = (fks: ForeignKeyReference[]) =>
    fks
      .map((f) => `${f.column.toLowerCase()}->${f.schema.toLowerCase()}.${f.table.toLowerCase()}.${f.referencedColumn.toLowerCase()}`)
      .sort()
      .join('|');
  return sig(prevFKs) !== sig(liveFKs);
}

function formatColumnFKTargets(fks: ForeignKeyReference[], columnName: string): string {
  const lower = columnName.toLowerCase();
  return fks
    .filter((f) => f.column.toLowerCase() === lower)
    .map((f) => `${f.schema.toLowerCase()}.${f.table.toLowerCase()}.${f.referencedColumn.toLowerCase()}`)
    .sort()
    .join('|');
}

function didIndexesChange(prevIndexes?: AutoDocIndex[], liveIndexes?: AutoDocIndex[]): boolean {
  if (prevIndexes === undefined || liveIndexes === undefined) {
    return false;
  }
  const formatIndex = (ix: AutoDocIndex) =>
    `${ix.IndexName.toLowerCase()}:${ix.IsPrimaryKey ? 1 : 0}:${ix.IsUnique ? 1 : 0}:${ix.Columns.map((c) => c.toLowerCase()).join(',')}:${ix.FilterDefinition ?? ''}`;
  const prevSig = prevIndexes.map(formatIndex).sort().join('|');
  const liveSig = liveIndexes.map(formatIndex).sort().join('|');
  return prevSig !== liveSig;
}

function normalizeDataType(dataType: string): string {
  return dataType.trim().toLowerCase().replace(/\s+/g, ' ');
}
