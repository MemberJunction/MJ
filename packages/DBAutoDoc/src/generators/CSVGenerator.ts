/**
 * Generates CSV exports for tables and columns
 */

import { DatabaseDocumentation } from '../types/state.js';

export interface CSVGeneratorOptions {
  approvedOnly?: boolean;
  confidenceThreshold?: number;
}

export interface CSVExport {
  tables: string;
  columns: string;
}

export class CSVGenerator {
  /**
   * Generate CSV exports (returns both tables and columns CSV)
   */
  public generate(
    state: DatabaseDocumentation,
    options: CSVGeneratorOptions = {}
  ): CSVExport {
    return {
      tables: this.generateTablesCsv(state, options),
      columns: this.generateColumnsCsv(state, options)
    };
  }

  /**
   * Generate tables CSV
   */
  private generateTablesCsv(
    state: DatabaseDocumentation,
    options: CSVGeneratorOptions
  ): string {
    const lines: string[] = [];

    // Header row
    lines.push(this.csvLine([
      'Schema',
      'Table',
      'Description',
      'Row Count',
      'Dependency Level',
      'Confidence %',
      'User Approved',
      'Business Domains',
      'Inferred Purpose'
    ]));

    // Data rows
    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        // Check filters
        if (options.approvedOnly && !table.userApproved) {
          continue;
        }

        if (options.confidenceThreshold && table.descriptionIterations.length > 0) {
          const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
          if ((latest.confidence || 0) < options.confidenceThreshold) {
            continue;
          }
        }

        // Get confidence
        let confidence = '';
        if (table.descriptionIterations.length > 0) {
          const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
          if (latest.confidence) {
            confidence = (latest.confidence * 100).toFixed(0);
          }
        }

        lines.push(this.csvLine([
          schema.name,
          table.name,
          table.description || '',
          table.rowCount.toString(),
          table.dependencyLevel !== undefined ? table.dependencyLevel.toString() : '',
          confidence,
          table.userApproved ? 'Yes' : 'No',
          (table as any).businessDomains ? (table as any).businessDomains.join('; ') : '',
          (table as any).inferredPurpose || ''
        ]));
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate columns CSV
   */
  private generateColumnsCsv(
    state: DatabaseDocumentation,
    options: CSVGeneratorOptions
  ): string {
    const lines: string[] = [];

    // Header row
    lines.push(this.csvLine([
      'Schema',
      'Table',
      'Column',
      'Data Type',
      'Is Nullable',
      'Is Primary Key',
      'Is Foreign Key',
      'Foreign Key References',
      'Description',
      'Confidence %',
      'Check Constraint',
      'Default Value'
    ]));

    // Data rows
    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        // Check table-level filters
        if (options.approvedOnly && !table.userApproved) {
          continue;
        }

        if (options.confidenceThreshold && table.descriptionIterations.length > 0) {
          const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
          if ((latest.confidence || 0) < options.confidenceThreshold) {
            continue;
          }
        }

        for (const column of table.columns) {
          // Get confidence
          let confidence = '';
          if (column.descriptionIterations && column.descriptionIterations.length > 0) {
            const latest = column.descriptionIterations[column.descriptionIterations.length - 1];
            if (latest.confidence) {
              confidence = (latest.confidence * 100).toFixed(0);
            }
          }

          // Get foreign key reference
          let fkReference = '';
          if (column.foreignKeyReferences) {
            fkReference = `${column.foreignKeyReferences.schema}.${column.foreignKeyReferences.table}.${column.foreignKeyReferences.column}`;
          }

          lines.push(this.csvLine([
            schema.name,
            table.name,
            column.name,
            column.dataType,
            column.isNullable ? 'Yes' : 'No',
            column.isPrimaryKey ? 'Yes' : 'No',
            column.isForeignKey ? 'Yes' : 'No',
            fkReference,
            column.description || '',
            confidence,
            column.checkConstraint || '',
            column.defaultValue || ''
          ]));
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Escape and format a CSV line
   */
  private csvLine(values: string[]): string {
    return values.map(value => this.escapeCsvField(value)).join(',');
  }

  /**
   * Escape a CSV field value
   */
  private escapeCsvField(value: string): string {
    // If field contains comma, newline, or quotes, wrap in quotes and escape quotes
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
