/**
 * IncrementalStateMerger — merges prior DBAutoDoc state into freshly introspected
 * schemas, prunes stale PK/FK/query/cache artifacts, and computes the exact
 * bidirectional discovery scope `(S_delta x T) U (S_old x T_delta)`.
 */

import { ApplyBestPrimaryKeys } from '../discovery/ApplyPrimaryKeys.js';
import { FKCandidate, PKCandidate, RelationshipDiscoveryPhase } from '../types/discovery.js';
import {
  CachedTableNormalization,
  IncrementalDiscoveryScope,
  SchemaDiffSummary,
  TableDiff,
} from '../types/incremental.js';
import { SampleQuery } from '../types/sample-queries.js';
import {
  ColumnDefinition,
  DatabaseDocumentation,
  SampleQueriesDeliverable,
  SchemaDefinition,
  TableDefinition,
} from '../types/state.js';
import { FindNamedItem, GetCatalogForeignKeys } from './SchemaDiffer.js';

export interface IncrementalMergeOptions {
  BaseStateFile: string;
  PrimaryKeyMinConfidence?: number;
  ForeignKeyMinConfidence?: number;
}

export interface IncrementalMergeResult {
  State: DatabaseDocumentation;
  DiscoveryScope: IncrementalDiscoveryScope;
}

/** Merge `previousState` knowledge into `liveSchemas` according to `diff`. */
export function MergeIncrementalState(
  previousState: DatabaseDocumentation,
  liveSchemas: SchemaDefinition[],
  diff: SchemaDiffSummary,
  options: IncrementalMergeOptions,
): IncrementalMergeResult {
  const diffByTable = new Map<string, TableDiff>(
    diff.ModifiedTables.map((t) => [t.TableKey.toLowerCase(), t]),
  );
  const mergedSchemas = mergeSchemas(previousState.schemas ?? [], liveSchemas, diffByTable);
  const state = createMergedDocument(previousState, mergedSchemas, options.BaseStateFile);
  const scope = buildDiscoveryScope(previousState, state, diff, diffByTable);

  applySurvivingKeysToMergedSchemas(
    state,
    scope,
    (options.PrimaryKeyMinConfidence ?? 0.7) * 100,
    (options.ForeignKeyMinConfidence ?? 0.6) * 100,
  );
  preservePrunedOrganicKeyCache(previousState, state);
  preserveUnchangedSampleQueries(previousState, state, diff);

  return { State: state, DiscoveryScope: scope };
}

function createMergedDocument(
  previousState: DatabaseDocumentation,
  mergedSchemas: SchemaDefinition[],
  baseStateFile: string,
): DatabaseDocumentation {
  const now = new Date().toISOString();
  return {
    version: previousState.version || '1.0.0',
    summary: {
      ...previousState.summary,
      lastModified: now,
    },
    database: {
      ...previousState.database,
      analyzedAt: now,
    },
    seedContext: previousState.seedContext,
    incrementalFromFile: baseStateFile,
    phases: {
      descriptionGeneration: [...(previousState.phases?.descriptionGeneration ?? [])],
    },
    schemas: mergedSchemas,
    plugins: previousState.plugins ? structuredClone(previousState.plugins) : undefined,
  };
}

function mergeSchemas(
  prevSchemas: SchemaDefinition[],
  liveSchemas: SchemaDefinition[],
  diffByTable: Map<string, TableDiff>,
): SchemaDefinition[] {
  return liveSchemas.map((liveSchema) => {
    const prevSchema = FindNamedItem(prevSchemas, liveSchema.name);
    const tables = liveSchema.tables.map((liveTable) => {
      const prevTable = prevSchema ? FindNamedItem(prevSchema.tables, liveTable.name) : undefined;
      const key = `${liveSchema.name}.${liveTable.name}`.toLowerCase();
      return prevTable
        ? mergeRetainedTable(prevTable, liveTable, diffByTable.get(key))
        : cloneLiveTable(liveTable);
    });
    return {
      name: liveSchema.name,
      tables,
      description: prevSchema?.description,
      descriptionIterations: prevSchema ? [...prevSchema.descriptionIterations] : [],
      inferredPurpose: prevSchema?.inferredPurpose,
      businessDomains: prevSchema?.businessDomains ? [...prevSchema.businessDomains] : undefined,
    };
  });
}

function cloneLiveTable(liveTable: TableDefinition): TableDefinition {
  return {
    ...liveTable,
    dependsOn: [...liveTable.dependsOn],
    dependents: [...liveTable.dependents],
    indexes: liveTable.indexes ? [...liveTable.indexes] : undefined,
    columns: liveTable.columns.map((c) => ({ ...c, descriptionIterations: [...c.descriptionIterations] })),
    descriptionIterations: [...liveTable.descriptionIterations],
  };
}

function mergeRetainedTable(
  prevTable: TableDefinition,
  liveTable: TableDefinition,
  tableDiff?: TableDiff,
): TableDefinition {
  const modifiedColMap = new Map(
    (tableDiff?.ModifiedColumns ?? []).map((mc) => [mc.ColumnName.toLowerCase(), mc]),
  );
  const populated = tableDiff?.PopulatedFromEmpty === true;
  const columns = liveTable.columns.map((liveCol) => {
    const prevCol = FindNamedItem(prevTable.columns, liveCol.name);
    if (!prevCol) {
      return { ...liveCol, descriptionIterations: [] };
    }
    return mergeRetainedColumn(prevCol, liveCol, modifiedColMap.get(liveCol.name.toLowerCase()), populated);
  });

  return {
    name: liveTable.name,
    rowCount: liveTable.rowCount,
    dependencyLevel: liveTable.dependencyLevel,
    dependsOn: [...liveTable.dependsOn],
    dependents: [...liveTable.dependents],
    indexes: liveTable.indexes ?? prevTable.indexes,
    columns,
    description: prevTable.description,
    descriptionIterations: [...prevTable.descriptionIterations],
    userNotes: prevTable.userNotes,
    userDescription: prevTable.userDescription,
    userApproved: prevTable.userApproved,
  };
}

function mergeRetainedColumn(
  prevCol: ColumnDefinition,
  liveCol: ColumnDefinition,
  colDiff: TableDiff['ModifiedColumns'][number] | undefined,
  populatedFromEmpty: boolean,
): ColumnDefinition {
  const resample = populatedFromEmpty || colDiff?.RequiresResampling === true;
  const typeChanged = colDiff?.Changes.includes('dataType') === true;
  const keepDescription = prevCol.userApproved === true || !typeChanged;

  return {
    ...liveCol,
    possibleValues: resample ? undefined : prevCol.possibleValues,
    statistics: resample ? undefined : prevCol.statistics,
    description: keepDescription ? prevCol.description : undefined,
    descriptionIterations: [...prevCol.descriptionIterations],
    userDescription: prevCol.userDescription,
    userApproved: prevCol.userApproved,
    valueListVerdict: resample ? undefined : prevCol.valueListVerdict,
  };
}

function buildDiscoveryScope(
  previousState: DatabaseDocumentation,
  mergedState: DatabaseDocumentation,
  diff: SchemaDiffSummary,
  diffByTable: Map<string, TableDiff>,
): IncrementalDiscoveryScope {
  const liveTableMap = indexTablesByLowerKey(mergedState.schemas);
  const { SurvivingPKs, StalePKsRemoved, InvalidatedPKColumns } = filterSurvivingPKs(
    previousState,
    liveTableMap,
    diffByTable,
  );
  const { SurvivingFKs, StaleFKsRemoved, OrphanedSourceCols } = filterSurvivingFKs(
    previousState,
    liveTableMap,
    diffByTable,
    InvalidatedPKColumns,
  );

  detectOrphanedCatalogFKSources(previousState, liveTableMap, OrphanedSourceCols);

  return assembleScopeFromFilteredKeys(
    mergedState,
    diff,
    diffByTable,
    SurvivingPKs,
    SurvivingFKs,
    StalePKsRemoved,
    StaleFKsRemoved,
    OrphanedSourceCols,
  );
}

function filterSurvivingPKs(
  previousState: DatabaseDocumentation,
  liveTableMap: Map<string, { Schema: SchemaDefinition; Table: TableDefinition }>,
  diffByTable: Map<string, TableDiff>,
): { SurvivingPKs: PKCandidate[]; StalePKsRemoved: number; InvalidatedPKColumns: Set<string> } {
  const priorPKs = previousState.phases?.keyDetection?.discovered?.primaryKeys ?? [];
  const surviving: PKCandidate[] = [];
  const invalidatedCols = new Set<string>();
  let removed = 0;

  for (const pk of priorPKs) {
    const tKey = `${pk.schemaName}.${pk.tableName}`.toLowerCase();
    const entry = liveTableMap.get(tKey);
    const tDiff = diffByTable.get(tKey);
    if (isPKCandidateStillValid(pk, entry?.Table, tDiff)) {
      surviving.push({
        ...pk,
        schemaName: entry!.Schema.name,
        tableName: entry!.Table.name,
      });
    } else {
      removed++;
      for (const col of pk.columnNames) {
        invalidatedCols.add(`${tKey}.${col.toLowerCase()}`);
      }
    }
  }
  return { SurvivingPKs: surviving, StalePKsRemoved: removed, InvalidatedPKColumns: invalidatedCols };
}

function isPKCandidateStillValid(
  pk: PKCandidate,
  liveTable: TableDefinition | undefined,
  tableDiff: TableDiff | undefined,
): boolean {
  if (!liveTable || tableDiff?.PopulatedFromEmpty) return false;
  if (liveTable.columns.some((c) => c.isPrimaryKey)) return false;

  for (const colName of pk.columnNames) {
    const liveCol = FindNamedItem(liveTable.columns, colName);
    if (!liveCol) return false;
    const mod = tableDiff?.ModifiedColumns.find((m) => m.ColumnName.toLowerCase() === colName.toLowerCase());
    if (mod && (mod.Changes.includes('dataType') || mod.Changes.includes('nullability'))) {
      return false;
    }
  }
  if (pk.evidence.backingIndex && tableDiff?.IndexesChanged) {
    const hasIndex = (liveTable.indexes ?? []).some(
      (ix) => ix.IsUnique && ix.IndexName.toLowerCase() === pk.evidence.backingIndex!.toLowerCase(),
    );
    if (!hasIndex) return false;
  }
  return true;
}

function filterSurvivingFKs(
  previousState: DatabaseDocumentation,
  liveTableMap: Map<string, { Schema: SchemaDefinition; Table: TableDefinition }>,
  diffByTable: Map<string, TableDiff>,
  invalidatedPKCols: Set<string>,
): { SurvivingFKs: FKCandidate[]; StaleFKsRemoved: number; OrphanedSourceCols: Map<string, Set<string>> } {
  const priorFKs = previousState.phases?.keyDetection?.discovered?.foreignKeys ?? [];
  const surviving: FKCandidate[] = [];
  const orphaned = new Map<string, Set<string>>();
  let removed = 0;

  for (const fk of priorFKs) {
    const srcKey = `${fk.schemaName}.${fk.sourceTable}`.toLowerCase();
    const tgtKey = `${fk.targetSchema}.${fk.targetTable}`.toLowerCase();
    const srcEntry = liveTableMap.get(srcKey);
    const tgtEntry = liveTableMap.get(tgtKey);
    const srcValid = isFKSourceValid(fk, srcEntry?.Table, diffByTable.get(srcKey));
    const tgtValid = isFKTargetValid(fk, tgtEntry?.Table, diffByTable.get(tgtKey), invalidatedPKCols);

    if (srcValid && tgtValid) {
      surviving.push({
        ...fk,
        schemaName: srcEntry!.Schema.name,
        sourceTable: srcEntry!.Table.name,
        targetSchema: tgtEntry!.Schema.name,
        targetTable: tgtEntry!.Table.name,
      });
    } else {
      removed++;
      if (srcValid && !tgtValid && fk.status !== 'rejected' && srcEntry) {
        addColumnToTableMap(orphaned, `${srcEntry.Schema.name}.${srcEntry.Table.name}`, fk.sourceColumn);
      }
    }
  }
  return { SurvivingFKs: surviving, StaleFKsRemoved: removed, OrphanedSourceCols: orphaned };
}

function isFKSourceValid(
  fk: FKCandidate,
  liveSource: TableDefinition | undefined,
  srcDiff: TableDiff | undefined,
): boolean {
  if (!liveSource || srcDiff?.PopulatedFromEmpty) return false;
  const col = FindNamedItem(liveSource.columns, fk.sourceColumn);
  if (!col) return false;
  const mod = srcDiff?.ModifiedColumns.find((m) => m.ColumnName.toLowerCase() === fk.sourceColumn.toLowerCase());
  if (!mod) return true;
  return !mod.Changes.some((c) => c === 'dataType' || c === 'declaredPK' || c === 'declaredFK');
}

function isFKTargetValid(
  fk: FKCandidate,
  liveTarget: TableDefinition | undefined,
  tgtDiff: TableDiff | undefined,
  invalidatedPKCols: Set<string>,
): boolean {
  if (!liveTarget || tgtDiff?.PopulatedFromEmpty) return false;
  const col = FindNamedItem(liveTarget.columns, fk.targetColumn);
  if (!col) return false;
  const tgtColKey = `${fk.targetSchema}.${fk.targetTable}.${fk.targetColumn}`.toLowerCase();
  if (invalidatedPKCols.has(tgtColKey)) return false;
  const mod = tgtDiff?.ModifiedColumns.find((m) => m.ColumnName.toLowerCase() === fk.targetColumn.toLowerCase());
  if (!mod) return true;
  return !mod.Changes.some((c) => c === 'dataType' || c === 'nullability' || c === 'declaredPK');
}

function detectOrphanedCatalogFKSources(
  previousState: DatabaseDocumentation,
  liveTableMap: Map<string, { Schema: SchemaDefinition; Table: TableDefinition }>,
  orphaned: Map<string, Set<string>>,
): void {
  for (const prevSchema of previousState.schemas ?? []) {
    for (const prevTable of prevSchema.tables) {
      const tKey = `${prevSchema.name}.${prevTable.name}`.toLowerCase();
      const liveEntry = liveTableMap.get(tKey);
      if (!liveEntry) continue;
      for (const catFK of GetCatalogForeignKeys(previousState, prevSchema.name, prevTable)) {
        const stillDeclared = liveEntry.Table.dependsOn.some(
          (d) => d.column.toLowerCase() === catFK.column.toLowerCase(),
        );
        const colStillExists = FindNamedItem(liveEntry.Table.columns, catFK.column) !== undefined;
        if (!stillDeclared && colStillExists) {
          addColumnToTableMap(orphaned, `${liveEntry.Schema.name}.${liveEntry.Table.name}`, catFK.column);
        }
      }
    }
  }
}

function assembleScopeFromFilteredKeys(
  mergedState: DatabaseDocumentation,
  diff: SchemaDiffSummary,
  diffByTable: Map<string, TableDiff>,
  survivingPKs: PKCandidate[],
  survivingFKs: FKCandidate[],
  stalePKsRemoved: number,
  staleFKsRemoved: number,
  orphanedCols: Map<string, Set<string>>,
): IncrementalDiscoveryScope {
  const pkTables = computePKTablesToAnalyze(mergedState, diff, diffByTable, survivingPKs);
  const fullScanTables = new Set<string>(diff.AddedTables);
  const fullSourceCols = new Map<string, Set<string>>();
  for (const [tKey, cols] of orphanedCols.entries()) {
    fullSourceCols.set(tKey, new Set(cols));
  }

  const targetTables = new Set<string>(diff.AddedTables);
  const dirtyFKPruning = new Set<string>(diff.AddedTables);
  for (const [tKey] of orphanedCols.entries()) dirtyFKPruning.add(tKey);

  for (const tDiff of diff.ModifiedTables) {
    populateModifiedTableScope(tDiff, fullScanTables, fullSourceCols, targetTables, dirtyFKPruning);
  }

  return {
    PKTablesToAnalyze: pkTables,
    FullFKSourceColumnsByTable: fullSourceCols,
    FullFKScanTables: fullScanTables,
    NewOrChangedTargetTables: targetTables,
    SurvivingPKs: survivingPKs,
    SurvivingFKs: survivingFKs,
    StalePKsRemoved: stalePKsRemoved,
    StaleFKsRemoved: staleFKsRemoved,
    DirtyPKPruningTables: new Set(pkTables),
    DirtyFKPruningTables: dirtyFKPruning,
  };
}

function populateModifiedTableScope(
  tDiff: TableDiff,
  fullScanTables: Set<string>,
  fullSourceCols: Map<string, Set<string>>,
  targetTables: Set<string>,
  dirtyFKPruning: Set<string>,
): void {
  if (tDiff.PopulatedFromEmpty) {
    fullScanTables.add(tDiff.TableKey);
    targetTables.add(tDiff.TableKey);
    dirtyFKPruning.add(tDiff.TableKey);
    return;
  }
  const changedSourceCols = [
    ...tDiff.AddedColumns,
    ...tDiff.ModifiedColumns.filter((m) => m.Changes.some((c) => c !== 'defaultValue')).map((m) => m.ColumnName),
  ];
  for (const col of changedSourceCols) {
    addColumnToTableMap(fullSourceCols, tDiff.TableKey, col);
  }
  if (changedSourceCols.length > 0 || tDiff.RemovedColumns.length > 0 || tDiff.DeclaredFKsChanged) {
    dirtyFKPruning.add(tDiff.TableKey);
  }
  if (
    tDiff.AddedColumns.length > 0 ||
    tDiff.ModifiedColumns.length > 0 ||
    tDiff.DeclaredPKChanged ||
    tDiff.IndexesChanged
  ) {
    targetTables.add(tDiff.TableKey);
  }
}

function computePKTablesToAnalyze(
  mergedState: DatabaseDocumentation,
  diff: SchemaDiffSummary,
  diffByTable: Map<string, TableDiff>,
  survivingPKs: PKCandidate[],
): Set<string> {
  const addedLower = new Set(diff.AddedTables.map((t) => t.toLowerCase()));
  const pkTables = new Set<string>();

  for (const schema of mergedState.schemas) {
    for (const table of schema.tables) {
      if (table.columns.some((c) => c.isPrimaryKey)) continue;
      const tableKey = `${schema.name}.${table.name}`;
      const lowerKey = tableKey.toLowerCase();
      if (addedLower.has(lowerKey)) {
        pkTables.add(tableKey);
        continue;
      }
      const tDiff = diffByTable.get(lowerKey);
      if (shouldReevaluateModifiedTablePK(schema.name, table, tDiff, survivingPKs)) {
        pkTables.add(tableKey);
      }
    }
  }
  return pkTables;
}

function shouldReevaluateModifiedTablePK(
  schemaName: string,
  table: TableDefinition,
  tDiff: TableDiff | undefined,
  survivingPKs: PKCandidate[],
): boolean {
  const tablePKs = survivingPKs.filter(
    (p) =>
      p.status !== 'rejected' &&
      p.schemaName.toLowerCase() === schemaName.toLowerCase() &&
      p.tableName.toLowerCase() === table.name.toLowerCase(),
  );
  if (!tDiff) {
    return false;
  }
  if (tablePKs.length === 0 || tDiff.PopulatedFromEmpty) {
    return true;
  }
  const hasConfirmed = tablePKs.some((p) => p.status === 'confirmed');
  if (hasConfirmed) {
    return false;
  }
  const addedNotNull = tDiff.AddedColumns.some((colName) => {
    const col = FindNamedItem(table.columns, colName);
    return col !== undefined && !col.isNullable;
  });
  return tDiff.IndexesChanged || addedNotNull;
}

function applySurvivingKeysToMergedSchemas(
  state: DatabaseDocumentation,
  scope: IncrementalDiscoveryScope,
  pkMinConfidence: number,
  fkMinConfidence: number,
): void {
  const priorPhase = createSeededDiscoveryPhase(scope);
  if (!priorPhase) return;

  ApplyBestPrimaryKeys(state, scope.SurvivingPKs, pkMinConfidence);
  for (const fk of scope.SurvivingFKs) {
    if (fk.status === 'rejected' || fk.confidence < fkMinConfidence) continue;
    applySingleSurvivingFK(state, fk);
  }
  state.phases.keyDetection = priorPhase;
}

function createSeededDiscoveryPhase(scope: IncrementalDiscoveryScope): RelationshipDiscoveryPhase | undefined {
  if (scope.SurvivingPKs.length === 0 && scope.SurvivingFKs.length === 0) {
    return undefined;
  }
  const now = new Date().toISOString();
  return {
    triggered: true,
    triggerReason: 'manual',
    triggerDetails: { tablesWithoutPK: 0, expectedFKs: 0, actualFKs: 0, fkDeficitPercentage: 0 },
    startedAt: now,
    completedAt: now,
    tokenBudget: { allocated: 0, used: 0, remaining: 0 },
    iterations: [],
    discovered: {
      primaryKeys: [...scope.SurvivingPKs],
      foreignKeys: [...scope.SurvivingFKs],
    },
    schemaEnhancements: { pkeysAdded: 0, fkeysAdded: 0, overallConfidence: 0 },
    feedbackFromAnalysis: [],
    summary: {
      totalTablesAnalyzed: 0,
      tablesWithDiscoveredPKs: 0,
      relationshipsDiscovered: scope.SurvivingFKs.filter((f) => f.status !== 'rejected').length,
      averageConfidence: 0,
      highConfidenceCount: 0,
      mediumConfidenceCount: 0,
      lowConfidenceCount: 0,
      rejectedCount: scope.SurvivingFKs.filter((f) => f.status === 'rejected').length,
    },
  };
}

function applySingleSurvivingFK(state: DatabaseDocumentation, fk: FKCandidate): void {
  const srcSchema = FindNamedItem(state.schemas, fk.schemaName);
  const srcTable = srcSchema ? FindNamedItem(srcSchema.tables, fk.sourceTable) : undefined;
  const tgtSchema = FindNamedItem(state.schemas, fk.targetSchema);
  const tgtTable = tgtSchema ? FindNamedItem(tgtSchema.tables, fk.targetTable) : undefined;
  if (!srcSchema || !srcTable || !tgtSchema || !tgtTable) return;

  const srcCol = FindNamedItem(srcTable.columns, fk.sourceColumn);
  const tgtCol = FindNamedItem(tgtTable.columns, fk.targetColumn);
  if (!srcCol || !tgtCol) return;

  srcCol.isForeignKey = true;
  srcCol.foreignKeyReferences = {
    schema: tgtSchema.name,
    table: tgtTable.name,
    column: tgtCol.name,
    referencedColumn: tgtCol.name,
  };
  linkTableDependency(srcSchema.name, srcTable, tgtSchema.name, tgtTable, srcCol.name, tgtCol.name);
}

function linkTableDependency(
  srcSchemaName: string,
  srcTable: TableDefinition,
  tgtSchemaName: string,
  tgtTable: TableDefinition,
  srcColName: string,
  tgtColName: string,
): void {
  if (srcSchemaName === tgtSchemaName && srcTable.name === tgtTable.name) return;
  const hasOut = srcTable.dependsOn.some(
    (d) => d.schema === tgtSchemaName && d.table === tgtTable.name && d.column === srcColName,
  );
  if (!hasOut) {
    srcTable.dependsOn.push({
      schema: tgtSchemaName,
      table: tgtTable.name,
      column: srcColName,
      referencedColumn: tgtColName,
    });
  }
  const hasIn = tgtTable.dependents.some(
    (d) => d.schema === srcSchemaName && d.table === srcTable.name && d.column === srcColName,
  );
  if (!hasIn) {
    tgtTable.dependents.push({
      schema: srcSchemaName,
      table: srcTable.name,
      column: srcColName,
      referencedColumn: tgtColName,
    });
  }
}

function preservePrunedOrganicKeyCache(
  previousState: DatabaseDocumentation,
  mergedState: DatabaseDocumentation,
): void {
  const priorCache = previousState.phases?.organicKeyDetection?.CachedNormalizations;
  if (!priorCache) return;

  const liveMap = indexTablesByLowerKey(mergedState.schemas);
  const retained: Record<string, CachedTableNormalization> = {};
  for (const [key, value] of Object.entries(priorCache)) {
    const live = liveTableMapLookup(liveMap, key);
    if (live) {
      retained[`${live.Schema.name}.${live.Table.name}`] = value;
    }
  }
  if (Object.keys(retained).length > 0 && previousState.phases.organicKeyDetection) {
    mergedState.phases.organicKeyDetection = {
      ...previousState.phases.organicKeyDetection,
      CachedNormalizations: retained,
    };
  }
}

function preserveUnchangedSampleQueries(
  previousState: DatabaseDocumentation,
  mergedState: DatabaseDocumentation,
  diff: SchemaDiffSummary,
): void {
  if (!previousState.sampleQueries?.queries?.length) return;
  const unchangedLower = new Set(diff.UnchangedTables.map((t) => t.toLowerCase()));
  const kept: SampleQuery[] = previousState.sampleQueries.queries.filter((q) =>
    areQueryEntitiesUnchanged(q, unchangedLower),
  );
  if (kept.length === 0) return;

  const deliverable: SampleQueriesDeliverable = {
    ...previousState.sampleQueries,
    queries: kept,
    summary: {
      ...previousState.sampleQueries.summary,
      totalQueriesGenerated: kept.length,
    },
  };
  mergedState.sampleQueries = deliverable;
}

function areQueryEntitiesUnchanged(query: SampleQuery, unchangedLower: Set<string>): boolean {
  const entities = [...(query.primaryEntities ?? []), ...(query.relatedEntities ?? [])];
  if (entities.length === 0) return false;
  return entities.every((e) => unchangedLower.has(`${e.schema}.${e.table}`.toLowerCase()));
}

function indexTablesByLowerKey(
  schemas: SchemaDefinition[],
): Map<string, { Schema: SchemaDefinition; Table: TableDefinition }> {
  const map = new Map<string, { Schema: SchemaDefinition; Table: TableDefinition }>();
  for (const schema of schemas) {
    for (const table of schema.tables) {
      map.set(`${schema.name}.${table.name}`.toLowerCase(), { Schema: schema, Table: table });
    }
  }
  return map;
}

function liveTableMapLookup(
  map: Map<string, { Schema: SchemaDefinition; Table: TableDefinition }>,
  key: string,
): { Schema: SchemaDefinition; Table: TableDefinition } | undefined {
  return map.get(key.toLowerCase());
}

function addColumnToTableMap(map: Map<string, Set<string>>, tableKey: string, columnName: string): void {
  let set = map.get(tableKey);
  if (!set) {
    set = new Set<string>();
    map.set(tableKey, set);
  }
  set.add(columnName.toLowerCase());
}
