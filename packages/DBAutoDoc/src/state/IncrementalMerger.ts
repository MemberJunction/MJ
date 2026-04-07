/**
 * IncrementalMerger — handles merging new tables into an existing analysis state.
 * Used by the orchestrator when --tables is specified with --resume.
 */

import { DatabaseDocumentation, SchemaDefinition, TableDefinition } from '../types/state.js';

/**
 * Parses a table reference string into schema and table parts.
 * Supports "schema.table" and just "table" (matches any schema).
 */
function parseTableRef(ref: string): { schema: string | null; table: string } {
  const parts = ref.split('.');
  if (parts.length === 2) {
    return { schema: parts[0], table: parts[1] };
  }
  return { schema: null, table: parts[0] };
}

export class IncrementalMerger {

  /**
   * Classify the --tables list into genuinely new tables vs tables already in state.
   * @returns newTables: "schema.table" strings not in state; existingTables: "schema.table" strings already in state
   */
  classifyTables(
    state: DatabaseDocumentation,
    tableRefs: string[]
  ): { newTables: string[]; existingTables: string[] } {
    const existingSet = new Set<string>();
    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        existingSet.add(`${schema.name}.${table.name}`.toLowerCase());
      }
    }

    const newTables: string[] = [];
    const existingTables: string[] = [];

    for (const ref of tableRefs) {
      const parsed = parseTableRef(ref);

      if (parsed.schema) {
        const key = `${parsed.schema}.${parsed.table}`.toLowerCase();
        if (existingSet.has(key)) {
          existingTables.push(ref);
        } else {
          newTables.push(ref);
        }
      } else {
        // No schema specified — check if any schema has this table
        let found = false;
        for (const schema of state.schemas) {
          if (schema.tables.some(t => t.name.toLowerCase() === parsed.table.toLowerCase())) {
            existingTables.push(`${schema.name}.${parsed.table}`);
            found = true;
            break;
          }
        }
        if (!found) {
          newTables.push(ref);
        }
      }
    }

    return { newTables, existingTables };
  }

  /**
   * Auto-approve all existing tables that are NOT in the --tables list.
   * This prevents the analysis engine from re-analyzing preserved tables.
   */
  autoApproveExistingTables(state: DatabaseDocumentation, tableRefs: string[]): void {
    const targetSet = new Set(tableRefs.map(r => {
      const parsed = parseTableRef(r);
      return parsed.schema
        ? `${parsed.schema}.${parsed.table}`.toLowerCase()
        : parsed.table.toLowerCase();
    }));

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        const fullKey = `${schema.name}.${table.name}`.toLowerCase();
        const shortKey = table.name.toLowerCase();

        // If this table is NOT in the --tables list, auto-approve it
        if (!targetSet.has(fullKey) && !targetSet.has(shortKey)) {
          table.userApproved = true;
        }
      }
    }
  }

  /**
   * Mark an existing table for re-analysis by clearing its userApproved flag.
   */
  markForReanalysis(state: DatabaseDocumentation, tableRef: string): void {
    const parsed = parseTableRef(tableRef);

    for (const schema of state.schemas) {
      if (parsed.schema && schema.name.toLowerCase() !== parsed.schema.toLowerCase()) {
        continue;
      }
      for (const table of schema.tables) {
        if (table.name.toLowerCase() === parsed.table.toLowerCase()) {
          table.userApproved = false;
        }
      }
    }
  }

  /**
   * Merge freshly introspected schemas (containing only new tables) into the existing state.
   * - If a schema already exists, appends the new tables to it.
   * - If a schema is entirely new, adds it to state.
   * - Rebuilds cross-references (dependents) for existing tables that gain new dependents.
   * @returns The number of tables merged.
   */
  mergeNewTables(state: DatabaseDocumentation, newSchemas: SchemaDefinition[]): number {
    let mergedCount = 0;

    for (const newSchema of newSchemas) {
      const existingSchema = state.schemas.find(
        s => s.name.toLowerCase() === newSchema.name.toLowerCase()
      );

      if (existingSchema) {
        // Schema exists — append only tables that don't already exist
        for (const newTable of newSchema.tables) {
          const exists = existingSchema.tables.some(
            t => t.name.toLowerCase() === newTable.name.toLowerCase()
          );
          if (!exists) {
            existingSchema.tables.push(newTable);
            mergedCount++;
          }
        }
      } else {
        // Entirely new schema
        state.schemas.push(newSchema);
        mergedCount += newSchema.tables.length;
      }
    }

    // Rebuild cross-references: new tables' dependsOn → existing tables' dependents
    this.rebuildCrossReferences(state, newSchemas);

    return mergedCount;
  }

  /**
   * Rebuild dependents arrays on existing tables when new tables reference them via dependsOn.
   */
  private rebuildCrossReferences(
    state: DatabaseDocumentation,
    newSchemas: SchemaDefinition[]
  ): void {
    // Build a lookup of all tables by schema.table
    const tableLookup = new Map<string, TableDefinition>();
    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        tableLookup.set(`${schema.name}.${table.name}`.toLowerCase(), table);
      }
    }

    // For each new table's dependsOn references, add corresponding dependents on the target
    for (const newSchema of newSchemas) {
      for (const newTable of newSchema.tables) {
        for (const fkRef of newTable.dependsOn) {
          const targetKey = `${fkRef.schema}.${fkRef.table}`.toLowerCase();
          const targetTable = tableLookup.get(targetKey);

          if (targetTable) {
            // Check if this dependent reference already exists
            const alreadyExists = targetTable.dependents.some(
              d => d.schema.toLowerCase() === newSchema.name.toLowerCase() &&
                   d.table.toLowerCase() === newTable.name.toLowerCase() &&
                   d.column.toLowerCase() === fkRef.column.toLowerCase()
            );

            if (!alreadyExists) {
              targetTable.dependents.push({
                schema: newSchema.name,
                table: newTable.name,
                column: fkRef.column,
                referencedColumn: fkRef.referencedColumn
              });
            }
          }
        }
      }
    }
  }
}
