/**
 * Soft keys loader and validator
 * Loads soft keys from file or inline config and validates against schema
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SoftKeyConfig } from '../types/config.js';
import { SchemaDefinition } from '../types/state.js';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

export class SoftKeysLoader {
  /**
   * Load soft keys from file path or inline config
   */
  public static async load(config: string | SoftKeyConfig): Promise<SoftKeyConfig> {
    if (typeof config === 'string') {
      return await this.loadFromFile(config);
    } else {
      return config;
    }
  }

  /**
   * Load soft keys from file
   */
  private static async loadFromFile(filePath: string): Promise<SoftKeyConfig> {
    try {
      const resolvedPath = path.resolve(filePath);
      const content = await fs.readFile(resolvedPath, 'utf-8');

      // Expand environment variables in the content
      const expandedContent = this.expandEnvVars(content);

      const config = JSON.parse(expandedContent) as SoftKeyConfig;
      return config;
    } catch (error) {
      throw new Error(`Failed to load soft keys from ${filePath}: ${(error as Error).message}`);
    }
  }

  /**
   * Expand environment variables in string
   * Supports ${VAR_NAME} syntax
   */
  private static expandEnvVars(content: string): string {
    return content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const value = process.env[varName];
      if (value === undefined) {
        throw new Error(`Environment variable ${varName} is not defined`);
      }
      return value;
    });
  }

  /**
   * Validate soft keys against schema definitions
   */
  public static validate(
    softKeys: SoftKeyConfig,
    schemas: SchemaDefinition[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Build quick lookup maps
    const schemaMap = new Map<string, SchemaDefinition>();
    const tableMap = new Map<string, SchemaDefinition>();
    const columnMap = new Map<string, Set<string>>();

    for (const schema of schemas) {
      schemaMap.set(schema.name, schema);
      for (const table of schema.tables) {
        const tableKey = `${schema.name}.${table.name}`;
        tableMap.set(tableKey, schema);

        const columns = new Set(table.columns.map(c => c.name));
        columnMap.set(tableKey, columns);
      }
    }

    // Validate each soft key table
    for (const softKeyTable of softKeys.tables) {
      const tableKey = `${softKeyTable.schemaName}.${softKeyTable.tableName}`;
      const schema = schemaMap.get(softKeyTable.schemaName);
      const columns = columnMap.get(tableKey);

      // Check if schema exists
      if (!schema) {
        errors.push(
          `Schema '${softKeyTable.schemaName}' not found in database for table '${softKeyTable.tableName}'`
        );
        continue;
      }

      // Check if table exists
      if (!columns) {
        errors.push(
          `Table '${softKeyTable.tableName}' not found in schema '${softKeyTable.schemaName}'`
        );
        continue;
      }

      // Find the actual table definition
      const table = schema.tables.find(t => t.name === softKeyTable.tableName);
      if (!table) {
        errors.push(`Table '${tableKey}' not found`);
        continue;
      }

      // Validate primary keys
      if (softKeyTable.primaryKeys) {
        for (const pk of softKeyTable.primaryKeys) {
          if (!columns.has(pk.fieldName)) {
            errors.push(
              `Primary key column '${pk.fieldName}' not found in table '${tableKey}'`
            );
          } else {
            // Check if column already has PK from database
            const column = table.columns.find(c => c.name === pk.fieldName);
            if (column?.isPrimaryKey && column.pkSource === 'schema') {
              warnings.push(
                `Primary key '${pk.fieldName}' in table '${tableKey}' already exists as database constraint (will skip soft key)`
              );
            }
          }
        }
      }

      // Validate foreign keys
      if (softKeyTable.foreignKeys) {
        for (const fk of softKeyTable.foreignKeys) {
          // Check if source column exists
          if (!columns.has(fk.fieldName)) {
            errors.push(
              `Foreign key column '${fk.fieldName}' not found in table '${tableKey}'`
            );
            continue;
          }

          // Check if column already has FK from database
          const column = table.columns.find(c => c.name === fk.fieldName);
          if (column?.isForeignKey && column.fkSource === 'schema') {
            warnings.push(
              `Foreign key '${fk.fieldName}' in table '${tableKey}' already exists as database constraint (will skip soft key)`
            );
          }

          // Check if target schema exists
          const targetSchema = schemaMap.get(fk.relatedSchema);
          if (!targetSchema) {
            errors.push(
              `Target schema '${fk.relatedSchema}' not found for FK '${fk.fieldName}' in table '${tableKey}'`
            );
            continue;
          }

          // Check if target table exists
          const targetTableKey = `${fk.relatedSchema}.${fk.relatedTable}`;
          const targetColumns = columnMap.get(targetTableKey);
          if (!targetColumns) {
            errors.push(
              `Target table '${fk.relatedTable}' not found in schema '${fk.relatedSchema}' for FK '${fk.fieldName}' in table '${tableKey}'`
            );
            continue;
          }

          // Check if target column exists
          if (!targetColumns.has(fk.relatedField)) {
            errors.push(
              `Target column '${fk.relatedField}' not found in table '${targetTableKey}' for FK '${fk.fieldName}' in table '${tableKey}'`
            );
          }
        }
      }
    }

    return {
      errors,
      warnings,
      isValid: errors.length === 0
    };
  }
}
