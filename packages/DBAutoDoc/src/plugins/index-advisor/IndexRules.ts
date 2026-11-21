/**
 * Deterministic index rules. Pure functions over the state file and the existing indexes,
 * so they can be tested without a database.
 */

import type { DatabaseDocumentation, TableDefinition, ColumnDefinition } from '../../types/state.js';
import type { AutoDocIndex } from '../../types/driver.js';
import type { IndexAdvisorOptions, IndexProposal, IndexProposalEvidence, RedundantIndex } from './IndexAdvisorTypes.js';

/** Column types that make poor btree index keys. */
const POOR_KEY_TYPES = /^(text|ntext|image|xml|json|jsonb|bytea|blob|longblob|mediumblob|longtext|mediumtext|tsvector|geometry|geography|hierarchyid|sql_variant)$|\(max\)$/i;

/** A key that motivates an index: one foreign-key column or one discovered primary key. */
interface KeyCandidate {
  SchemaName: string;
  TableName: string;
  Columns: string[];
  Source: 'FKCoverage' | 'SoftPrimaryKey';
  Evidence: Omit<IndexProposalEvidence, 'RowCount' | 'LeadingColumnDistinctCount'>;
}

const lower = (s: string) => s.toLowerCase();
const tableKey = (schema: string, table: string) => `${lower(schema)}.${lower(table)}`;

/** Proposes indexes for uncovered foreign keys and discovered primary keys. */
export function ProposeIndexes(
  state: DatabaseDocumentation,
  existing: AutoDocIndex[],
  options: IndexAdvisorOptions
): IndexProposal[] {
  const indexesByTable = groupByTable(existing);
  const seen = new Set<string>();
  const proposals: IndexProposal[] = [];
  for (const candidate of [...collectForeignKeys(state, options), ...collectSoftPrimaryKeys(state, options)]) {
    const proposal = evaluateCandidate(state, candidate, indexesByTable, options);
    const id = `${tableKey(candidate.SchemaName, candidate.TableName)}(${candidate.Columns.map(lower).join(',')})`;
    if (proposal && !seen.has(id)) {
      seen.add(id);
      proposals.push(proposal);
    }
  }
  return proposals.sort((a, b) => b.Priority - a.Priority);
}

/** Flags existing indexes whose key columns are a prefix of (or equal to) another index's. */
export function FindRedundantIndexes(existing: AutoDocIndex[]): RedundantIndex[] {
  const redundant: RedundantIndex[] = [];
  for (const indexes of groupByTable(existing).values()) {
    for (const candidate of indexes.filter(isDroppableShape)) {
      const coveredBy = indexes.find((other) => other !== candidate && coversAsPrefix(other, candidate));
      if (coveredBy) {
        redundant.push({
          SchemaName: candidate.SchemaName,
          TableName: candidate.TableName,
          IndexName: candidate.IndexName,
          CoveredBy: coveredBy.IndexName,
          Reason: `Its key columns (${candidate.Columns.join(', ')}) are a leading prefix of ${coveredBy.IndexName} (${coveredBy.Columns.join(', ')}).`
        });
      }
    }
  }
  return redundant;
}

/** True when an index on `table` already starts with exactly these columns. */
export function IsCovered(columns: string[], tableIndexes: AutoDocIndex[]): boolean {
  return tableIndexes.some((ix) => !ix.FilterDefinition && startsWith(ix.Columns, columns));
}

function evaluateCandidate(
  state: DatabaseDocumentation,
  candidate: KeyCandidate,
  indexesByTable: Map<string, AutoDocIndex[]>,
  options: IndexAdvisorOptions
): IndexProposal | null {
  const table = FindTable(state, candidate.SchemaName, candidate.TableName);
  if (!table || table.rowCount < options.MinRowCount) {
    return null;
  }
  if (IsCovered(candidate.Columns, indexesByTable.get(tableKey(candidate.SchemaName, candidate.TableName)) ?? [])) {
    return null;
  }
  const leading = table.columns.find((c) => lower(c.name) === lower(candidate.Columns[0]));
  if (!leading || IsPoorKeyColumn(leading)) {
    return null;
  }
  return {
    SchemaName: candidate.SchemaName,
    TableName: table.name,
    Columns: candidate.Columns,
    IncludeColumns: [],
    Source: candidate.Source,
    Reason: describe(candidate),
    Priority: IndexPriority(table.rowCount),
    Evidence: { ...candidate.Evidence, RowCount: table.rowCount, LeadingColumnDistinctCount: leading.statistics?.distinctCount }
  };
}

function collectForeignKeys(state: DatabaseDocumentation, options: IndexAdvisorOptions): KeyCandidate[] {
  const declared = state.schemas.flatMap((schema) =>
    schema.tables.flatMap((table) =>
      table.dependsOn.map((fk): KeyCandidate => ({
        SchemaName: schema.name,
        TableName: table.name,
        Columns: [fk.column],
        Source: 'FKCoverage',
        Evidence: { References: `${fk.schema}.${fk.table}.${fk.referencedColumn}`, KeyOrigin: 'declared' }
      }))
    )
  );
  if (!options.IncludeDiscoveredFKs) {
    return declared;
  }
  const discovered = (state.phases.keyDetection?.discovered.foreignKeys ?? [])
    .filter((fk) => fk.status === 'confirmed' && fk.confidence >= options.KeyMinConfidence)
    .map((fk): KeyCandidate => ({
      SchemaName: fk.schemaName,
      TableName: fk.sourceTable,
      Columns: [fk.sourceColumn],
      Source: 'FKCoverage',
      Evidence: { References: `${fk.targetSchema}.${fk.targetTable}.${fk.targetColumn}`, KeyConfidence: fk.confidence, KeyOrigin: 'discovered' }
    }));
  return [...declared, ...discovered];
}

/**
 * Confirmed discovered primary keys. A table whose key is declared in the database already has
 * the key's index, so {@link IsCovered} drops those; only truly undeclared keys get proposals.
 */
function collectSoftPrimaryKeys(state: DatabaseDocumentation, options: IndexAdvisorOptions): KeyCandidate[] {
  return (state.phases.keyDetection?.discovered.primaryKeys ?? [])
    .filter((pk) => pk.status === 'confirmed' && pk.confidence >= options.KeyMinConfidence)
    .map((pk): KeyCandidate => ({
      SchemaName: pk.schemaName,
      TableName: pk.tableName,
      Columns: pk.columnNames,
      Source: 'SoftPrimaryKey',
      Evidence: { KeyConfidence: pk.confidence, KeyOrigin: 'discovered' }
    }));
}

function describe(candidate: KeyCandidate): string {
  if (candidate.Source === 'SoftPrimaryKey') {
    return `Discovered primary key (${candidate.Columns.join(', ')}) has no index; lookups by key scan the table.`;
  }
  const origin = candidate.Evidence.KeyOrigin === 'declared' ? 'Foreign key' : 'Discovered foreign key';
  return `${origin} ${candidate.Columns.join(', ')} → ${candidate.Evidence.References} has no index; joins and parent deletes scan the table.`;
}

/** Larger tables benefit most: 1k rows → ~30, 100k → ~50, 10M → ~70, capped at 100. */
export function IndexPriority(rowCount: number): number {
  return Math.max(1, Math.min(100, Math.round(10 * Math.log10(Math.max(rowCount, 1)))));
}

/** True for columns that make poor leading index keys (large/unstructured types, ≤2 distinct values). */
export function IsPoorKeyColumn(column: ColumnDefinition): boolean {
  const distinct = column.statistics?.distinctCount;
  return POOR_KEY_TYPES.test(column.dataType.trim()) || (distinct !== undefined && distinct <= 2);
}

function isDroppableShape(ix: AutoDocIndex): boolean {
  return !ix.IsPrimaryKey && !ix.IsUnique && !ix.FilterDefinition && !ix.HasExpressions && ix.Columns.length > 0;
}

function coversAsPrefix(other: AutoDocIndex, candidate: AutoDocIndex): boolean {
  if (other.FilterDefinition || other.HasExpressions || !sameMethod(other, candidate)) {
    return false;
  }
  const strictlyLonger = other.Columns.length > candidate.Columns.length;
  const identical = other.Columns.length === candidate.Columns.length && other.IndexName < candidate.IndexName;
  return (strictlyLonger || identical) && startsWith(other.Columns, candidate.Columns);
}

function sameMethod(a: AutoDocIndex, b: AutoDocIndex): boolean {
  const norm = (m: string) => (/^(nonclustered|clustered|btree)$/i.test(m) ? 'btree' : lower(m));
  return norm(a.Method) === norm(b.Method);
}

function startsWith(indexColumns: string[], columns: string[]): boolean {
  return columns.length > 0 && columns.length <= indexColumns.length && columns.every((c, i) => lower(c) === lower(indexColumns[i]));
}

function groupByTable(indexes: AutoDocIndex[]): Map<string, AutoDocIndex[]> {
  const map = new Map<string, AutoDocIndex[]>();
  for (const ix of indexes) {
    const key = tableKey(ix.SchemaName, ix.TableName);
    map.set(key, [...(map.get(key) ?? []), ix]);
  }
  return map;
}

export function FindTable(state: DatabaseDocumentation, schemaName: string, tableName: string): TableDefinition | undefined {
  return state.schemas
    .find((s) => lower(s.name) === lower(schemaName))
    ?.tables.find((t) => lower(t.name) === lower(tableName));
}
