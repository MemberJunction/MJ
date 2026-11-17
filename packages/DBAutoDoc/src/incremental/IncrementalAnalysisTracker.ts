/**
 * IncrementalAnalysisTracker — tracks the affected table subgraph across
 * topological description & backpropagation iterations.
 *
 * Ensures incremental DBAutoDoc executes the exact same level-by-level
 * topological algorithm as a full run while skipping LLM calls on tables
 * whose schema, keys, and parent descriptions have not materially changed.
 */

import { TableNode } from '../types/analysis.js';
import { IncrementalConfig, SchemaDiffSummary } from '../types/incremental.js';
import { DatabaseDocumentation, SchemaDefinition, TableDefinition } from '../types/state.js';
import { FindNamedItem } from './SchemaDiffer.js';

export interface TableOutcomeInput {
  TableKey: string;
  CurrentLevel: number;
  HadPreviousDescription: boolean;
  MateriallyChanged: boolean;
  Confidence: number;
  NewRelationshipProposed: boolean;
  Node: TableNode;
}

export interface TrackerOptions {
  PreviousState: DatabaseDocumentation;
  CurrentState: DatabaseDocumentation;
  Diff: SchemaDiffSummary;
  Nodes: Map<string, TableNode>;
  ConfidenceThreshold: number;
  IncrementalConfig?: IncrementalConfig;
  ReanalyzeBelowConfidence?: number;
  NewOrChangedTargetTables?: ReadonlySet<string>;
}

export class IncrementalAnalysisTracker {
  private readonly currentIterationTables = new Set<string>();
  private readonly nextIterationTables = new Set<string>();
  private readonly initialDirtyTables = new Set<string>();
  private readonly analyzedTables = new Set<string>();
  private readonly skippedCleanTables = new Set<string>();
  private readonly propagatedTables = new Set<string>();
  private readonly propagationHops = new Map<string, number>();
  private readonly dirtyPKPruningTables = new Set<string>();
  private readonly dirtyFKPruningTables = new Set<string>();
  private readonly confidenceThreshold: number;
  private readonly propagateParentChanges: boolean;
  private readonly maxPropagationDepth: number;

  constructor(options: TrackerOptions) {
    this.confidenceThreshold = options.ConfidenceThreshold;
    this.propagateParentChanges = options.IncrementalConfig?.propagateParentDescriptionChanges !== false;
    this.maxPropagationDepth = options.IncrementalConfig?.maxPropagationDepth ?? 1;
    this.seedInitialDirtyTables(options);
  }

  /** Number of tables seeded into Iteration 1 before dynamic propagation. */
  public get InitialDirtyCount(): number {
    return this.initialDirtyTables.size;
  }

  /** Total unique tables analyzed by the LLM across this incremental run. */
  public get TablesAnalyzedCount(): number {
    return this.analyzedTables.size;
  }

  /** Total unique unchanged tables skipped without an LLM call. */
  public get TablesSkippedCount(): number {
    return this.skippedCleanTables.size;
  }

  /** Total unique child tables woken up due to material parent description changes. */
  public get PropagatedTablesCount(): number {
    return this.propagatedTables.size;
  }

  /** Additional tables whose PK candidates changed during LLM analysis. */
  public get AdditionalDirtyPKTables(): ReadonlySet<string> {
    return this.dirtyPKPruningTables;
  }

  /** Additional tables whose FK candidates changed during LLM analysis. */
  public get AdditionalDirtyFKTables(): ReadonlySet<string> {
    return this.dirtyFKPruningTables;
  }

  /** True if any table is scheduled for the current iteration. */
  public HasWorkInCurrentIteration(): boolean {
    return this.currentIterationTables.size > 0;
  }

  /** Check whether `tableKey` ("schema.table") should be analyzed in the current iteration. */
  public ShouldAnalyzeTable(tableKey: string, iteration: number): boolean {
    const lower = tableKey.toLowerCase();
    if (this.currentIterationTables.has(lower)) {
      this.analyzedTables.add(lower);
      return true;
    }
    if (iteration === 1 && !this.analyzedTables.has(lower)) {
      this.skippedCleanTables.add(lower);
    }
    return false;
  }

  /** Record the outcome of analyzing a single table and propagate dirty state if needed. */
  public RecordTableOutcome(outcome: TableOutcomeInput): void {
    const lower = outcome.TableKey.toLowerCase();
    if (outcome.Confidence < this.confidenceThreshold || outcome.NewRelationshipProposed) {
      this.nextIterationTables.add(lower);
    }
    if (outcome.HadPreviousDescription && outcome.MateriallyChanged && this.propagateParentChanges) {
      this.propagateToDependents(lower, outcome.CurrentLevel, outcome.Node);
    }
  }

  /** Record that LLM table analysis added or confirmed a PK candidate on `tableKey`. */
  public RecordLLMPKChange(tableKey: string): void {
    this.dirtyPKPruningTables.add(tableKey);
  }

  /** Record that LLM table analysis added or confirmed an FK candidate on `tableKey`. */
  public RecordLLMFKChange(tableKey: string): void {
    this.dirtyFKPruningTables.add(tableKey);
  }

  /** Record parent tables whose descriptions were revised by `BackpropagationEngine`. */
  public RecordBackpropagationRevisions(
    revisedTableKeys: string[],
    nodes: Map<string, TableNode>,
  ): void {
    for (const key of revisedTableKeys) {
      const lower = key.toLowerCase();
      this.analyzedTables.add(lower);
      const node = findNodeCaseInsensitive(nodes, lower);
      if (!node || !this.propagateParentChanges) continue;
      for (const child of node.dependents) {
        const childLower = child.fullName.toLowerCase();
        if (this.initialDirtyTables.has(childLower)) {
          this.nextIterationTables.add(childLower);
        }
      }
    }
  }

  /** Advance from iteration `k` to `k + 1`. Returns true if more tables require analysis. */
  public AdvanceToNextIteration(): boolean {
    this.currentIterationTables.clear();
    for (const key of this.nextIterationTables) {
      this.currentIterationTables.add(key);
    }
    this.nextIterationTables.clear();
    return this.currentIterationTables.size > 0;
  }

  private propagateToDependents(parentLowerKey: string, parentLevel: number, node: TableNode): void {
    const currentHop = this.propagationHops.get(parentLowerKey) ?? 0;
    if (currentHop >= this.maxPropagationDepth) return;

    for (const child of node.dependents) {
      if (child.tableDefinition?.userApproved) continue;
      const childLower = child.fullName.toLowerCase();
      const nextHop = currentHop + 1;
      const prevHop = this.propagationHops.get(childLower);
      if (prevHop !== undefined && prevHop <= nextHop) continue;

      this.propagationHops.set(childLower, nextHop);
      if (!this.initialDirtyTables.has(childLower)) {
        this.propagatedTables.add(childLower);
      }
      this.skippedCleanTables.delete(childLower);

      if (child.level > parentLevel) {
        this.currentIterationTables.add(childLower);
      } else {
        this.nextIterationTables.add(childLower);
      }
    }
  }

  private seedInitialDirtyTables(options: TrackerOptions): void {
    for (const added of options.Diff.AddedTables) {
      this.markInitialDirty(added);
    }
    for (const modified of options.Diff.ModifiedTables) {
      this.markInitialDirty(modified.TableKey);
    }
    const newTargetPKs = collectNewTargetSinglePKs(options.CurrentState, options.NewOrChangedTargetTables);
    for (const schema of options.CurrentState.schemas) {
      const prevSchema = FindNamedItem(options.PreviousState.schemas ?? [], schema.name);
      for (const table of schema.tables) {
        this.checkRetainedTableDirty(options, schema, table, prevSchema, newTargetPKs);
      }
    }
  }

  private checkRetainedTableDirty(
    options: TrackerOptions,
    schema: SchemaDefinition,
    table: TableDefinition,
    prevSchema: SchemaDefinition | undefined,
    newTargetPKs: NewTargetPKInfo[],
  ): void {
    if (table.userApproved) return;
    const key = `${schema.name}.${table.name}`;
    if (this.initialDirtyTables.has(key.toLowerCase())) return;

    if (table.descriptionIterations.length === 0) {
      this.markInitialDirty(key);
      return;
    }
    if (options.ReanalyzeBelowConfidence !== undefined) {
      const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
      if ((latest?.confidence ?? 0) < options.ReanalyzeBelowConfidence) {
        this.markInitialDirty(key);
        return;
      }
    }
    const prevTable = prevSchema ? FindNamedItem(prevSchema.tables, table.name) : undefined;
    if (prevTable && didTableRelationshipsChange(options.PreviousState, options.CurrentState, schema.name, prevTable, table)) {
      this.markInitialDirty(key);
      return;
    }
    if (newTargetPKs.length > 0 && hasGate8PKAsFKMatch(key, table, newTargetPKs)) {
      this.markInitialDirty(key);
    }
  }

  private markInitialDirty(tableKey: string): void {
    const lower = tableKey.toLowerCase();
    this.initialDirtyTables.add(lower);
    this.currentIterationTables.add(lower);
    this.propagationHops.set(lower, 0);
  }
}

function didTableRelationshipsChange(
  previousState: DatabaseDocumentation,
  currentState: DatabaseDocumentation,
  schemaName: string,
  prevTable: TableDefinition,
  currTable: TableDefinition,
): boolean {
  if (pkSignature(prevTable) !== pkSignature(currTable)) return true;
  if (dependsOnSignature(prevTable) !== dependsOnSignature(currTable)) return true;
  if (fkCandidatesSignature(previousState, schemaName, prevTable.name) !== fkCandidatesSignature(currentState, schemaName, currTable.name)) {
    return true;
  }
  const hadDependents = prevTable.dependents.length > 0;
  const hasDependents = currTable.dependents.length > 0;
  return hadDependents !== hasDependents;
}

function pkSignature(table: TableDefinition): string {
  return table.columns
    .filter((c) => c.isPrimaryKey)
    .map((c) => c.name.toLowerCase())
    .sort()
    .join(',');
}

function dependsOnSignature(table: TableDefinition): string {
  return table.dependsOn
    .map((d) => `${d.column.toLowerCase()}->${d.schema.toLowerCase()}.${d.table.toLowerCase()}.${d.referencedColumn.toLowerCase()}`)
    .sort()
    .join('|');
}

function fkCandidatesSignature(state: DatabaseDocumentation, schemaName: string, tableName: string): string {
  const fks = state.phases?.keyDetection?.discovered?.foreignKeys ?? [];
  return fks
    .filter(
      (f) =>
        f.status !== 'rejected' &&
        f.schemaName.toLowerCase() === schemaName.toLowerCase() &&
        f.sourceTable.toLowerCase() === tableName.toLowerCase(),
    )
    .map((f) => `${f.sourceColumn.toLowerCase()}->${f.targetSchema.toLowerCase()}.${f.targetTable.toLowerCase()}.${f.targetColumn.toLowerCase()}`)
    .sort()
    .join('|');
}

function findNodeCaseInsensitive(nodes: Map<string, TableNode>, lowerKey: string): TableNode | undefined {
  for (const [k, node] of nodes.entries()) {
    if (k.toLowerCase() === lowerKey) return node;
  }
  return undefined;
}

interface NewTargetPKInfo {
  TableKeyLower: string;
  TableNameLower: string;
  ColumnNameLower: string;
  DistinctCount?: number;
}

/**
 * Collect single-column PKs on tables in `newOrChangedTargets`.
 * `FKDetector` intentionally skips PK source columns (GATE 8) and delegates
 * PK-as-FK identifying/junction relationships to LLM table analysis.
 */
function collectNewTargetSinglePKs(
  state: DatabaseDocumentation,
  newOrChangedTargets?: ReadonlySet<string>,
): NewTargetPKInfo[] {
  if (!newOrChangedTargets || newOrChangedTargets.size === 0) return [];
  const lowerSet = new Set(Array.from(newOrChangedTargets, (t) => t.toLowerCase()));
  const results: NewTargetPKInfo[] = [];

  for (const schema of state.schemas) {
    for (const table of schema.tables) {
      const keyLower = `${schema.name}.${table.name}`.toLowerCase();
      if (!lowerSet.has(keyLower)) continue;
      const pkCols = table.columns.filter((c) => c.isPrimaryKey);
      if (pkCols.length === 1) {
        results.push({
          TableKeyLower: keyLower,
          TableNameLower: table.name.toLowerCase(),
          ColumnNameLower: pkCols[0].name.toLowerCase(),
          DistinctCount: pkCols[0].statistics?.distinctCount,
        });
      }
    }
  }
  return results;
}

function hasGate8PKAsFKMatch(tableKey: string, table: TableDefinition, newTargetPKs: NewTargetPKInfo[]): boolean {
  const keyLower = tableKey.toLowerCase();
  for (const col of table.columns) {
    if (!col.isPrimaryKey || col.isForeignKey) continue;
    const colLower = col.name.toLowerCase();
    const srcDistinct = col.statistics?.distinctCount;

    for (const tgt of newTargetPKs) {
      if (tgt.TableKeyLower === keyLower) continue;
      const nameMatches =
        colLower === tgt.ColumnNameLower ||
        colLower === `${tgt.TableNameLower}${tgt.ColumnNameLower}` ||
        colLower === `${tgt.TableNameLower}id`;
      if (!nameMatches) continue;
      if (srcDistinct !== undefined && tgt.DistinctCount !== undefined && srcDistinct > tgt.DistinctCount * 1.05) {
        continue;
      }
      return true;
    }
  }
  return false;
}
