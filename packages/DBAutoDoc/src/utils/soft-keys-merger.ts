/**
 * Soft keys merger.
 * Merges user-provided soft PK/FK definitions into DatabaseDocumentation state.
 * Sets column flags, updates table dependency arrays, and optionally injects
 * table descriptions as ground truth.
 */

import { DatabaseDocumentation, ForeignKeyReference } from '../types/state.js';
import { SoftPKFKTableConfig, SoftFKFieldConfig } from './soft-keys-loader.js';

export interface SoftKeysMergeResult {
  pkAdded: number;
  fkAdded: number;
  tablesAffected: number;
  tableDescriptionsAdded: number;
  warnings: string[];
}

export class SoftKeysMerger {

  /**
   * Merge soft keys into schema state.
   *
   * Skipping rules:
   *   - Skip PK merge if column already has isPrimaryKey=true with pkSource undefined or 'schema'
   *   - Skip FK merge if column already has isForeignKey=true with fkSource undefined or 'schema'
   *   - Skip FK merge if column already has matching foreignKeyReferences (dedup)
   *
   * Idempotent: merging the same file twice on resume produces no duplicates.
   */
  public static merge(
    state: DatabaseDocumentation,
    softKeys: SoftPKFKTableConfig[]
  ): SoftKeysMergeResult {
    const warnings: string[] = [];
    let pkAdded = 0;
    let fkAdded = 0;
    let tableDescriptionsAdded = 0;
    const affectedTables = new Set<string>();

    const tableMap = this.buildTableMap(state);

    for (const config of softKeys) {
      const tableKey = `${config.SchemaName}.${config.TableName}`.toLowerCase();
      const tableInfo = tableMap.get(tableKey);

      if (!tableInfo) {
        warnings.push(`Table '${config.SchemaName}.${config.TableName}' not found in state — skipping`);
        continue;
      }

      const { table, schemaName } = tableInfo;
      let tableModified = false;

      // Merge primary keys
      const pkResult = this.mergePrimaryKeys(config, table, schemaName, warnings);
      pkAdded += pkResult;
      if (pkResult > 0) tableModified = true;

      // Merge foreign keys
      const fkResult = this.mergeForeignKeys(config, table, schemaName, tableMap, warnings);
      fkAdded += fkResult;
      if (fkResult > 0) tableModified = true;

      // Inject table description as ground truth
      if (config.Description && !table.description && !table.userDescription) {
        this.injectTableDescription(table, config.Description);
        tableDescriptionsAdded++;
        tableModified = true;
      }

      if (tableModified) {
        affectedTables.add(tableKey);
      }
    }

    return {
      pkAdded,
      fkAdded,
      tablesAffected: affectedTables.size,
      tableDescriptionsAdded,
      warnings,
    };
  }

  // ---------------------------------------------------------------------------
  // Private: PK merging
  // ---------------------------------------------------------------------------

  private static mergePrimaryKeys(
    config: SoftPKFKTableConfig,
    table: { columns: import('../types/state.js').ColumnDefinition[] },
    schemaName: string,
    warnings: string[]
  ): number {
    let added = 0;
    const tableKey = `${schemaName}.${config.TableName}`;

    for (const pk of config.PrimaryKey) {
      const column = table.columns.find(
        c => c.name.toLowerCase() === pk.FieldName.toLowerCase()
      );

      if (!column) {
        warnings.push(`PK column '${pk.FieldName}' not found in table '${tableKey}' — skipping`);
        continue;
      }

      // Skip if already a schema-defined PK (undefined pkSource = legacy = schema)
      if (column.isPrimaryKey && (column.pkSource === undefined || column.pkSource === 'schema')) {
        continue;
      }

      // Skip if already marked as manual (idempotent)
      if (column.isPrimaryKey && column.pkSource === 'manual') {
        continue;
      }

      column.isPrimaryKey = true;
      column.pkSource = 'manual';
      if (pk.Description && !column.description) {
        column.description = pk.Description;
      }
      added++;
    }

    return added;
  }

  // ---------------------------------------------------------------------------
  // Private: FK merging
  // ---------------------------------------------------------------------------

  private static mergeForeignKeys(
    config: SoftPKFKTableConfig,
    table: import('../types/state.js').TableDefinition,
    schemaName: string,
    tableMap: Map<string, { table: import('../types/state.js').TableDefinition; schemaName: string }>,
    warnings: string[]
  ): number {
    let added = 0;
    const tableKey = `${schemaName}.${config.TableName}`;

    for (const fk of config.ForeignKeys) {
      const column = table.columns.find(
        c => c.name.toLowerCase() === fk.FieldName.toLowerCase()
      );

      if (!column) {
        warnings.push(`FK column '${fk.FieldName}' not found in table '${tableKey}' — skipping`);
        continue;
      }

      const targetSchema = fk.SchemaName || schemaName;

      // Skip if already a schema-defined FK (undefined fkSource = legacy = schema)
      if (column.isForeignKey && (column.fkSource === undefined || column.fkSource === 'schema')) {
        continue;
      }

      // Skip if already manual with same target (idempotent)
      if (column.isForeignKey && column.fkSource === 'manual' && column.foreignKeyReferences) {
        const ref = column.foreignKeyReferences;
        if (
          ref.schema.toLowerCase() === targetSchema.toLowerCase() &&
          ref.table.toLowerCase() === fk.RelatedTable.toLowerCase() &&
          ref.referencedColumn.toLowerCase() === fk.RelatedField.toLowerCase()
        ) {
          continue;
        }
      }

      // Apply the FK
      column.isForeignKey = true;
      column.fkSource = 'manual';
      column.foreignKeyReferences = {
        schema: targetSchema,
        table: fk.RelatedTable,
        column: fk.FieldName,
        referencedColumn: fk.RelatedField,
      };

      if (fk.Description && !column.description) {
        column.description = fk.Description;
      }

      // Update dependsOn
      this.addDependsOn(table, targetSchema, fk);

      // Update target table's dependents
      this.addDependent(tableMap, targetSchema, fk, schemaName, config.TableName);

      added++;
    }

    return added;
  }

  /** Add to table.dependsOn if not already present */
  private static addDependsOn(
    table: import('../types/state.js').TableDefinition,
    targetSchema: string,
    fk: SoftFKFieldConfig
  ): void {
    const exists = table.dependsOn.some(
      dep =>
        dep.schema.toLowerCase() === targetSchema.toLowerCase() &&
        dep.table.toLowerCase() === fk.RelatedTable.toLowerCase() &&
        dep.column.toLowerCase() === fk.FieldName.toLowerCase() &&
        dep.referencedColumn.toLowerCase() === fk.RelatedField.toLowerCase()
    );

    if (!exists) {
      table.dependsOn.push({
        schema: targetSchema,
        table: fk.RelatedTable,
        column: fk.FieldName,
        referencedColumn: fk.RelatedField,
      });
    }
  }

  /** Add to target table's dependents array */
  private static addDependent(
    tableMap: Map<string, { table: import('../types/state.js').TableDefinition; schemaName: string }>,
    targetSchema: string,
    fk: SoftFKFieldConfig,
    sourceSchemaName: string,
    sourceTableName: string
  ): void {
    const targetKey = `${targetSchema}.${fk.RelatedTable}`.toLowerCase();
    const targetInfo = tableMap.get(targetKey);
    if (!targetInfo) return;

    const dependentRef: ForeignKeyReference = {
      schema: sourceSchemaName,
      table: sourceTableName,
      column: fk.RelatedField,
      referencedColumn: fk.FieldName,
    };

    const exists = targetInfo.table.dependents.some(
      dep =>
        dep.schema.toLowerCase() === dependentRef.schema.toLowerCase() &&
        dep.table.toLowerCase() === dependentRef.table.toLowerCase() &&
        dep.column.toLowerCase() === dependentRef.column.toLowerCase() &&
        dep.referencedColumn.toLowerCase() === dependentRef.referencedColumn.toLowerCase()
    );

    if (!exists) {
      targetInfo.table.dependents.push(dependentRef);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: table description injection
  // ---------------------------------------------------------------------------

  private static injectTableDescription(
    table: import('../types/state.js').TableDefinition,
    description: string
  ): void {
    table.description = description;
    table.userDescription = description;
    table.userApproved = true;
    table.descriptionIterations.push({
      description,
      reasoning: 'From additionalSchemaInfo soft keys file',
      generatedAt: new Date().toISOString(),
      modelUsed: 'ground_truth',
      confidence: 1.0,
      triggeredBy: 'ground_truth',
      isGroundTruth: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Private: utility
  // ---------------------------------------------------------------------------

  /** Build a case-insensitive lookup map: "schema.table" -> { table, schemaName } */
  private static buildTableMap(
    state: DatabaseDocumentation
  ): Map<string, { table: import('../types/state.js').TableDefinition; schemaName: string }> {
    const map = new Map<string, { table: import('../types/state.js').TableDefinition; schemaName: string }>();

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        const key = `${schema.name}.${table.name}`.toLowerCase();
        map.set(key, { table, schemaName: schema.name });
      }
    }

    return map;
  }
}
