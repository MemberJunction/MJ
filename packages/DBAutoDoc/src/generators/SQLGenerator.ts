/**
 * Generates SQL scripts that write object descriptions back to the database.
 *
 * Dialect-aware:
 *  - SQL Server: `sp_addextendedproperty` / `sp_dropextendedproperty` against the
 *    `MS_Description` extended property, batched with `GO`.
 *  - PostgreSQL: ANSI `COMMENT ON SCHEMA/TABLE/COLUMN ... IS '...'` (idempotent —
 *    a COMMENT ON replaces any existing comment, so no drop-if-exists is needed,
 *    and no `GO` batch separator).
 *
 * MySQL/Oracle write-back is not yet implemented; those fall back to the SQL
 * Server form (unchanged from the original behavior).
 */

import { DatabaseDocumentation } from '../types/state.js';

export type SQLGeneratorProvider = 'sqlserver' | 'postgresql';

export interface SQLGeneratorOptions {
  approvedOnly?: boolean;
  confidenceThreshold?: number;
  /** Target database platform. Defaults to 'sqlserver' for backward compatibility. */
  provider?: SQLGeneratorProvider;
}

export class SQLGenerator {
  /**
   * Generate SQL script
   */
  public generate(
    state: DatabaseDocumentation,
    options: SQLGeneratorOptions = {}
  ): string {
    const isPg = options.provider === 'postgresql';
    const lines: string[] = [];

    // Header
    lines.push('-- Database Documentation Script');
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push(`-- Database: ${state.database.name}`);
    lines.push(`-- Server: ${state.database.server}`);
    lines.push('');
    lines.push(
      isPg
        ? '-- This script applies object descriptions via PostgreSQL COMMENT ON statements'
        : '-- This script adds MS_Description extended properties to database objects'
    );
    lines.push('');

    // Generate statements for each schema
    for (const schema of state.schemas) {
      lines.push('');
      lines.push(`-- Schema: ${schema.name}`);
      lines.push('');

      // Schema description
      if (schema.description) {
        lines.push(this.generateSchemaDescription(schema.name, schema.description, isPg));
        this.pushSeparator(lines, isPg);
        lines.push('');
      }

      // Table descriptions
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

        // Table description
        if (table.description) {
          lines.push(`-- Table: ${schema.name}.${table.name}`);
          lines.push(this.generateTableDescription(schema.name, table.name, table.description, isPg));
          this.pushSeparator(lines, isPg);
          lines.push('');
        }

        // Column descriptions
        for (const column of table.columns) {
          if (column.description) {
            lines.push(
              this.generateColumnDescription(
                schema.name,
                table.name,
                column.name,
                column.description,
                isPg
              )
            );
            this.pushSeparator(lines, isPg);
          }
        }

        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Pushes the statement separator. SQL Server batches with `GO`; PostgreSQL
   * statements are already `;`-terminated and need no batch separator.
   */
  private pushSeparator(lines: string[], isPg: boolean): void {
    if (!isPg) {
      lines.push('GO');
    }
  }

  /**
   * Generate schema description statement
   */
  private generateSchemaDescription(schemaName: string, description: string, isPg: boolean): string {
    const escapedDescription = this.escapeString(description);

    if (isPg) {
      return `COMMENT ON SCHEMA ${this.quotePgIdentifier(schemaName)} IS '${escapedDescription}';`;
    }

    return `
IF EXISTS (
    SELECT 1 FROM sys.extended_properties
    WHERE major_id = SCHEMA_ID('${schemaName}')
    AND name = 'MS_Description'
    AND minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'${schemaName}';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'${escapedDescription}',
    @level0type = N'SCHEMA',
    @level0name = N'${schemaName}';
`.trim();
  }

  /**
   * Generate table description statement
   */
  private generateTableDescription(
    schemaName: string,
    tableName: string,
    description: string,
    isPg: boolean
  ): string {
    const escapedDescription = this.escapeString(description);

    if (isPg) {
      return `COMMENT ON TABLE ${this.quotePgIdentifier(schemaName)}.${this.quotePgIdentifier(tableName)} IS '${escapedDescription}';`;
    }

    return `
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = '${schemaName}'
    AND t.name = '${tableName}'
    AND ep.name = 'MS_Description'
    AND ep.minor_id = 0
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'${schemaName}',
        @level1type = N'TABLE',
        @level1name = N'${tableName}';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'${escapedDescription}',
    @level0type = N'SCHEMA',
    @level0name = N'${schemaName}',
    @level1type = N'TABLE',
    @level1name = N'${tableName}';
`.trim();
  }

  /**
   * Generate column description statement
   */
  private generateColumnDescription(
    schemaName: string,
    tableName: string,
    columnName: string,
    description: string,
    isPg: boolean
  ): string {
    const escapedDescription = this.escapeString(description);

    if (isPg) {
      return `COMMENT ON COLUMN ${this.quotePgIdentifier(schemaName)}.${this.quotePgIdentifier(tableName)}.${this.quotePgIdentifier(columnName)} IS '${escapedDescription}';`;
    }

    return `
IF EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    INNER JOIN sys.tables t ON ep.major_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    WHERE s.name = '${schemaName}'
    AND t.name = '${tableName}'
    AND c.name = '${columnName}'
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA',
        @level0name = N'${schemaName}',
        @level1type = N'TABLE',
        @level1name = N'${tableName}',
        @level2type = N'COLUMN',
        @level2name = N'${columnName}';
END

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'${escapedDescription}',
    @level0type = N'SCHEMA',
    @level0name = N'${schemaName}',
    @level1type = N'TABLE',
    @level1name = N'${tableName}',
    @level2type = N'COLUMN',
    @level2name = N'${columnName}';
`.trim();
  }

  /**
   * Quote a PostgreSQL identifier, escaping embedded double quotes.
   */
  private quotePgIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  /**
   * Escape string for a SQL string literal.
   */
  private escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }
}
