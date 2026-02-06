/**
 * Soft keys merger
 * Merges user-provided soft keys into schema definitions
 */

import { SoftKeyConfig } from '../types/config.js';
import { SchemaDefinition, ForeignKeyReference } from '../types/state.js';

export interface MergeResult {
  schemas: SchemaDefinition[];
  warnings: string[];
  stats: {
    pkAdded: number;
    fkAdded: number;
    tablesAffected: number;
  };
}

export function mergeSoftKeys(
  schemas: SchemaDefinition[],
  softKeys: SoftKeyConfig,
  onProgress?: (message: string) => void
): MergeResult {
  const warnings: string[] = [];
  let pkAdded = 0;
  let fkAdded = 0;
  const affectedTables = new Set<string>();

  // Build quick lookup map for tables
  const tableMap = new Map<string, { schema: SchemaDefinition; tableIndex: number }>();
  for (const schema of schemas) {
    for (let i = 0; i < schema.tables.length; i++) {
      const table = schema.tables[i];
      const tableKey = `${schema.name}.${table.name}`;
      tableMap.set(tableKey, { schema, tableIndex: i });
    }
  }

  // Process each soft key table
  for (const softKeyTable of softKeys.tables) {
    const tableKey = `${softKeyTable.schemaName}.${softKeyTable.tableName}`;
    const tableInfo = tableMap.get(tableKey);

    if (!tableInfo) {
      warnings.push(`Table '${tableKey}' not found in schema - skipping`);
      continue;
    }

    const table = tableInfo.schema.tables[tableInfo.tableIndex];
    let tableModified = false;

    // Process primary keys
    if (softKeyTable.primaryKeys) {
      for (const softPK of softKeyTable.primaryKeys) {
        const column = table.columns.find(c => c.name === softPK.fieldName);

        if (!column) {
          warnings.push(`Column '${softPK.fieldName}' not found in table '${tableKey}' - skipping PK`);
          continue;
        }

        // Check for conflicts with existing database constraints
        if (column.isPrimaryKey && column.pkSource === 'schema') {
          warnings.push(
            `Column '${softPK.fieldName}' in table '${tableKey}' already has database PK constraint - skipping soft key`
          );
          continue;
        }

        // Check if already marked as PK from soft key
        if (column.isPrimaryKey && column.pkSource === 'manual') {
          warnings.push(
            `Column '${softPK.fieldName}' in table '${tableKey}' already marked as manual PK - skipping duplicate`
          );
          continue;
        }

        // Apply soft key PK
        column.isPrimaryKey = true;
        column.pkSource = 'manual';
        if (softPK.description) {
          column.description = column.description || softPK.description;
        }

        onProgress?.(`Added manual PK: ${tableKey}.${softPK.fieldName}`);
        pkAdded++;
        tableModified = true;
      }
    }

    // Process foreign keys
    if (softKeyTable.foreignKeys) {
      for (const softFK of softKeyTable.foreignKeys) {
        const column = table.columns.find(c => c.name === softFK.fieldName);

        if (!column) {
          warnings.push(`Column '${softFK.fieldName}' not found in table '${tableKey}' - skipping FK`);
          continue;
        }

        // Check for conflicts with existing database constraints
        if (column.isForeignKey && column.fkSource === 'schema') {
          warnings.push(
            `Column '${softFK.fieldName}' in table '${tableKey}' already has database FK constraint - skipping soft key`
          );
          continue;
        }

        // Check if already marked as FK from soft key with same target
        if (column.isForeignKey && column.fkSource === 'manual' && column.foreignKeyReferences) {
          const existing = column.foreignKeyReferences;
          if (
            existing.schema === softFK.relatedSchema &&
            existing.table === softFK.relatedTable &&
            existing.referencedColumn === softFK.relatedField
          ) {
            warnings.push(
              `Column '${softFK.fieldName}' in table '${tableKey}' already has same manual FK - skipping duplicate`
            );
            continue;
          }
        }

        // Apply soft key FK
        column.isForeignKey = true;
        column.fkSource = 'manual';
        column.foreignKeyReferences = {
          schema: softFK.relatedSchema,
          table: softFK.relatedTable,
          column: softFK.fieldName,
          referencedColumn: softFK.relatedField
        };

        if (softFK.description) {
          column.description = column.description || softFK.description;
        }

        // Update table.dependsOn for topological sorting
        const dependsOnRef: ForeignKeyReference = {
          schema: softFK.relatedSchema,
          table: softFK.relatedTable,
          column: softFK.fieldName,
          referencedColumn: softFK.relatedField
        };

        // Check if dependency already exists
        const dependencyExists = table.dependsOn.some(
          dep =>
            dep.schema === dependsOnRef.schema &&
            dep.table === dependsOnRef.table &&
            dep.column === dependsOnRef.column &&
            dep.referencedColumn === dependsOnRef.referencedColumn
        );

        if (!dependencyExists) {
          table.dependsOn.push(dependsOnRef);
        }

        // Update target table's dependents array
        const targetTableKey = `${softFK.relatedSchema}.${softFK.relatedTable}`;
        const targetTableInfo = tableMap.get(targetTableKey);
        if (targetTableInfo) {
          const targetTable = targetTableInfo.schema.tables[targetTableInfo.tableIndex];
          const dependentRef: ForeignKeyReference = {
            schema: softKeyTable.schemaName,
            table: softKeyTable.tableName,
            column: softFK.relatedField,
            referencedColumn: softFK.fieldName
          };

          const dependentExists = targetTable.dependents.some(
            dep =>
              dep.schema === dependentRef.schema &&
              dep.table === dependentRef.table &&
              dep.column === dependentRef.column &&
              dep.referencedColumn === dependentRef.referencedColumn
          );

          if (!dependentExists) {
            targetTable.dependents.push(dependentRef);
          }
        }

        onProgress?.(`Added manual FK: ${tableKey}.${softFK.fieldName} → ${targetTableKey}.${softFK.relatedField}`);
        fkAdded++;
        tableModified = true;
      }
    }

    if (tableModified) {
      affectedTables.add(tableKey);
    }
  }

  return {
    schemas,
    warnings,
    stats: {
      pkAdded,
      fkAdded,
      tablesAffected: affectedTables.size
    }
  };
}
