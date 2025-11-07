/**
 * Validates state file integrity
 */

import { DatabaseDocumentation } from '../types/state.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class StateValidator {
  /**
   * Validate state file
   */
  public validate(state: DatabaseDocumentation): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!state.version) {
      errors.push('Missing version field');
    }

    if (!state.database) {
      errors.push('Missing database field');
    } else {
      if (!state.database.name) {
        errors.push('Missing database.name');
      }
      if (!state.database.server) {
        errors.push('Missing database.server');
      }
    }

    if (!state.schemas) {
      errors.push('Missing schemas array');
    } else if (!Array.isArray(state.schemas)) {
      errors.push('schemas must be an array');
    }

    if (!state.analysisRuns) {
      errors.push('Missing analysisRuns array');
    } else if (!Array.isArray(state.analysisRuns)) {
      errors.push('analysisRuns must be an array');
    }

    // Validate schemas
    if (Array.isArray(state.schemas)) {
      for (let i = 0; i < state.schemas.length; i++) {
        const schema = state.schemas[i];

        if (!schema.name) {
          errors.push(`Schema at index ${i} missing name`);
        }

        if (!schema.tables || !Array.isArray(schema.tables)) {
          errors.push(`Schema "${schema.name}" missing or invalid tables array`);
          continue;
        }

        // Validate tables
        for (let j = 0; j < schema.tables.length; j++) {
          const table = schema.tables[j];

          if (!table.name) {
            errors.push(`Table at index ${j} in schema "${schema.name}" missing name`);
          }

          if (!table.columns || !Array.isArray(table.columns)) {
            errors.push(`Table "${table.name}" in schema "${schema.name}" missing or invalid columns array`);
          }

          if (!table.descriptionIterations || !Array.isArray(table.descriptionIterations)) {
            errors.push(`Table "${table.name}" in schema "${schema.name}" missing or invalid descriptionIterations array`);
          }

          // Validate foreign key references
          if (table.dependsOn && Array.isArray(table.dependsOn)) {
            for (const dep of table.dependsOn) {
              if (!this.tableExists(state, dep.schema, dep.table)) {
                warnings.push(
                  `Table "${schema.name}.${table.name}" references non-existent table "${dep.schema}.${dep.table}"`
                );
              }
            }
          }
        }
      }
    }

    // Validate analysis runs
    if (Array.isArray(state.analysisRuns)) {
      for (let i = 0; i < state.analysisRuns.length; i++) {
        const run = state.analysisRuns[i];

        if (!run.runId) {
          errors.push(`Analysis run at index ${i} missing runId`);
        }

        if (!run.startedAt) {
          errors.push(`Analysis run at index ${i} missing startedAt`);
        }

        if (!run.status) {
          errors.push(`Analysis run at index ${i} missing status`);
        } else if (!['in_progress', 'completed', 'failed', 'converged'].includes(run.status)) {
          errors.push(`Analysis run at index ${i} has invalid status: ${run.status}`);
        }

        if (!run.processingLog || !Array.isArray(run.processingLog)) {
          errors.push(`Analysis run at index ${i} missing or invalid processingLog array`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if a table exists in the state
   */
  private tableExists(
    state: DatabaseDocumentation,
    schemaName: string,
    tableName: string
  ): boolean {
    const schema = state.schemas.find(s => s.name === schemaName);
    if (!schema) {
      return false;
    }

    return schema.tables.some(t => t.name === tableName);
  }

  /**
   * Validate and repair if possible
   */
  public validateAndRepair(state: DatabaseDocumentation): ValidationResult {
    const result = this.validate(state);

    // Attempt simple repairs
    if (!state.analysisRuns) {
      state.analysisRuns = [];
      result.warnings.push('Repaired: Created missing analysisRuns array');
    }

    if (!state.schemas) {
      state.schemas = [];
      result.warnings.push('Repaired: Created missing schemas array');
    }

    // Initialize missing iteration arrays
    for (const schema of state.schemas) {
      if (!schema.descriptionIterations) {
        schema.descriptionIterations = [];
      }

      for (const table of schema.tables) {
        if (!table.descriptionIterations) {
          table.descriptionIterations = [];
        }

        for (const column of table.columns) {
          if (!column.descriptionIterations) {
            column.descriptionIterations = [];
          }
        }
      }
    }

    // Re-validate after repairs
    return this.validate(state);
  }
}
