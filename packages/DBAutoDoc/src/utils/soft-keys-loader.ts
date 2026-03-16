/**
 * Soft keys loader and validator.
 * Loads an additionalSchemaInfo.json file (MemberJunction CodeGen PascalCase format)
 * and validates references against actual database schema state.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SchemaDefinition } from '../types/state.js';

// ---------------------------------------------------------------------------
// Interfaces — duplicated locally from CodeGenLib so DBAutoDoc stays standalone
// ---------------------------------------------------------------------------

/** Matches CodeGen's SoftPKFieldConfig */
export interface SoftPKFieldConfig {
  FieldName: string;
  Description?: string;
}

/** Matches CodeGen's SoftFKFieldConfig */
export interface SoftFKFieldConfig {
  FieldName: string;
  SchemaName?: string;
  RelatedTable: string;
  RelatedField: string;
  Description?: string;
}

/** Matches CodeGen's SoftPKFKTableConfig */
export interface SoftPKFKTableConfig {
  SchemaName: string;
  TableName: string;
  Description?: string;
  PrimaryKey: SoftPKFieldConfig[];
  ForeignKeys: SoftFKFieldConfig[];
}

export interface SoftKeysLoadResult {
  tables: SoftPKFKTableConfig[];
  warnings: string[];
}

// Keys that are metadata / non-table sections in the additionalSchemaInfo format
const RESERVED_KEYS = new Set([
  '$schema', 'description', 'version',
  'VirtualEntities', 'ISARelationships', 'Entities', 'Tables', 'Schemas',
]);

export class SoftKeysLoader {

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Load and parse an additionalSchemaInfo.json file.
   * Supports environment variable expansion (${VAR_NAME} syntax)
   * and both JSON formats:
   *   1. Flat Tables array: { "Tables": [{ "SchemaName": ..., "TableName": ..., ... }] }
   *   2. Schema-as-key:    { "dbo": [{ "TableName": ..., ... }], "hr": [...] }
   */
  public static async loadFromFile(filePath: string): Promise<SoftKeysLoadResult> {
    const resolvedPath = path.resolve(filePath);
    let content: string;

    try {
      content = await fs.readFile(resolvedPath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read soft keys file at ${resolvedPath}: ${(error as Error).message}`);
    }

    const expandedContent = this.expandEnvVars(content);
    const parsed = JSON.parse(expandedContent) as Record<string, unknown>;

    const warnings: string[] = [];
    const tables = this.extractTables(parsed, warnings);

    return { tables, warnings };
  }

  /**
   * Validate loaded soft key tables against actual database schema state.
   * Returns an array of warning strings (non-fatal).
   */
  public static validate(
    tables: SoftPKFKTableConfig[],
    schemas: SchemaDefinition[]
  ): string[] {
    const warnings: string[] = [];
    const schemaTableMap = this.buildSchemaTableMap(schemas);

    for (const tableConfig of tables) {
      const tableKey = `${tableConfig.SchemaName}.${tableConfig.TableName}`;
      const columnSet = schemaTableMap.get(tableKey.toLowerCase());

      if (!columnSet) {
        warnings.push(`Table '${tableKey}' not found in database schema — soft keys for this table will be skipped`);
        continue;
      }

      this.validatePrimaryKeys(tableConfig, tableKey, columnSet, warnings);
      this.validateForeignKeys(tableConfig, tableKey, columnSet, schemaTableMap, warnings);
    }

    return warnings;
  }

  // ---------------------------------------------------------------------------
  // Private: file parsing
  // ---------------------------------------------------------------------------

  /**
   * Extract tables from parsed config object, handling both formats.
   * Mirrors CodeGen's extractTablesFromConfig() logic.
   */
  private static extractTables(
    config: Record<string, unknown>,
    warnings: string[]
  ): SoftPKFKTableConfig[] {
    // Format 1: Flat "Tables" array
    if (Array.isArray(config.Tables)) {
      return this.extractFromFlatArray(config.Tables as Record<string, unknown>[], warnings);
    }

    // Format 2: Schema-as-key (top-level keys are schema names)
    return this.extractFromSchemaKeys(config, warnings);
  }

  private static extractFromFlatArray(
    tables: Record<string, unknown>[],
    warnings: string[]
  ): SoftPKFKTableConfig[] {
    const result: SoftPKFKTableConfig[] = [];

    for (const entry of tables) {
      const tableName = entry.TableName as string | undefined;
      if (!tableName) {
        warnings.push('Skipping entry in Tables array with no TableName');
        continue;
      }

      result.push({
        SchemaName: (entry.SchemaName as string) || 'dbo',
        TableName: tableName,
        Description: entry.Description as string | undefined,
        PrimaryKey: (entry.PrimaryKey as SoftPKFieldConfig[]) || [],
        ForeignKeys: (entry.ForeignKeys as SoftFKFieldConfig[]) || [],
      });
    }

    return result;
  }

  private static extractFromSchemaKeys(
    config: Record<string, unknown>,
    warnings: string[]
  ): SoftPKFKTableConfig[] {
    const result: SoftPKFKTableConfig[] = [];

    for (const [key, value] of Object.entries(config)) {
      if (RESERVED_KEYS.has(key) || !Array.isArray(value)) {
        continue;
      }

      const schemaName = key;
      for (const entry of value as Record<string, unknown>[]) {
        const tableName = entry.TableName as string | undefined;
        if (!tableName) {
          warnings.push(`Skipping entry in schema '${schemaName}' with no TableName`);
          continue;
        }

        result.push({
          SchemaName: schemaName,
          TableName: tableName,
          Description: entry.Description as string | undefined,
          PrimaryKey: (entry.PrimaryKey as SoftPKFieldConfig[]) || [],
          ForeignKeys: (entry.ForeignKeys as SoftFKFieldConfig[]) || [],
        });
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private: validation helpers
  // ---------------------------------------------------------------------------

  /** Build a lowercase lookup map: "schema.table" -> Set<columnName (lowercase)> */
  private static buildSchemaTableMap(
    schemas: SchemaDefinition[]
  ): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();

    for (const schema of schemas) {
      for (const table of schema.tables) {
        const key = `${schema.name}.${table.name}`.toLowerCase();
        const columns = new Set(table.columns.map(c => c.name.toLowerCase()));
        map.set(key, columns);
      }
    }

    return map;
  }

  private static validatePrimaryKeys(
    tableConfig: SoftPKFKTableConfig,
    tableKey: string,
    columnSet: Set<string>,
    warnings: string[]
  ): void {
    for (const pk of tableConfig.PrimaryKey) {
      if (!columnSet.has(pk.FieldName.toLowerCase())) {
        warnings.push(
          `PK column '${pk.FieldName}' not found in table '${tableKey}'`
        );
      }
    }
  }

  private static validateForeignKeys(
    tableConfig: SoftPKFKTableConfig,
    tableKey: string,
    columnSet: Set<string>,
    schemaTableMap: Map<string, Set<string>>,
    warnings: string[]
  ): void {
    for (const fk of tableConfig.ForeignKeys) {
      if (!columnSet.has(fk.FieldName.toLowerCase())) {
        warnings.push(
          `FK source column '${fk.FieldName}' not found in table '${tableKey}'`
        );
        continue;
      }

      const targetSchema = fk.SchemaName || tableConfig.SchemaName;
      const targetTableKey = `${targetSchema}.${fk.RelatedTable}`.toLowerCase();
      const targetColumns = schemaTableMap.get(targetTableKey);

      if (!targetColumns) {
        warnings.push(
          `FK target table '${targetSchema}.${fk.RelatedTable}' not found for FK '${fk.FieldName}' in table '${tableKey}'`
        );
        continue;
      }

      if (!targetColumns.has(fk.RelatedField.toLowerCase())) {
        warnings.push(
          `FK target column '${fk.RelatedField}' not found in table '${targetSchema}.${fk.RelatedTable}' for FK '${fk.FieldName}' in table '${tableKey}'`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: utility
  // ---------------------------------------------------------------------------

  /** Expand ${VAR_NAME} environment variables in string content */
  private static expandEnvVars(content: string): string {
    return content.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
      const value = process.env[varName];
      if (value === undefined) {
        throw new Error(`Environment variable ${varName} is not defined`);
      }
      return value;
    });
  }
}
