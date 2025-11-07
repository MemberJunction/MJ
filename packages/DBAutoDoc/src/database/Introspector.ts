/**
 * Database schema introspection
 * Queries SQL Server system catalogs to understand structure
 */

import { DatabaseConnection } from './DatabaseConnection.js';
import { SchemaDefinition, TableDefinition, ColumnDefinition, ForeignKeyReference } from '../types/state.js';
import { SchemaFilterConfig, TableFilterConfig } from '../types/config.js';

interface TableRow {
  schema_name: string;
  table_name: string;
  row_count: number;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  check_constraint: string | null;
  default_value: string | null;
}

interface ForeignKeyRow {
  schema_name: string;
  table_name: string;
  column_name: string;
  referenced_schema: string;
  referenced_table: string;
  referenced_column: string;
}

export class Introspector {
  constructor(private connection: DatabaseConnection) {}

  /**
   * Get all schemas with their tables
   */
  public async getSchemas(
    schemaFilter: SchemaFilterConfig,
    tableFilter: TableFilterConfig
  ): Promise<SchemaDefinition[]> {
    const tablesResult = await this.getTables(schemaFilter, tableFilter);
    if (!tablesResult.success || !tablesResult.data) {
      throw new Error(`Failed to get tables: ${tablesResult.errorMessage}`);
    }

    const tables = tablesResult.data;

    // Group tables by schema
    const schemaMap = new Map<string, TableDefinition[]>();

    for (const tableRow of tables) {
      if (!schemaMap.has(tableRow.schema_name)) {
        schemaMap.set(tableRow.schema_name, []);
      }

      // Get columns for this table
      const columns = await this.getColumns(tableRow.schema_name, tableRow.table_name);

      // Get foreign keys for this table
      const fks = await this.getForeignKeys(tableRow.schema_name, tableRow.table_name);

      const table: TableDefinition = {
        name: tableRow.table_name,
        rowCount: tableRow.row_count,
        dependsOn: fks.filter(fk => fk.schema_name === tableRow.schema_name && fk.table_name === tableRow.table_name)
          .map(fk => ({
            schema: fk.referenced_schema,
            table: fk.referenced_table,
            column: fk.column_name,
            referencedColumn: fk.referenced_column
          })),
        dependents: [],
        columns,
        descriptionIterations: []
      };

      schemaMap.get(tableRow.schema_name)!.push(table);
    }

    // Populate dependents (reverse FKs)
    for (const [schemaName, tables] of schemaMap) {
      for (const table of tables) {
        for (const dep of table.dependsOn) {
          const parentSchema = schemaMap.get(dep.schema);
          if (parentSchema) {
            const parentTable = parentSchema.find(t => t.name === dep.table);
            if (parentTable) {
              if (!parentTable.dependents.some(d => d.schema === schemaName && d.table === table.name)) {
                parentTable.dependents.push({
                  schema: schemaName,
                  table: table.name,
                  column: dep.referencedColumn,
                  referencedColumn: dep.column
                });
              }
            }
          }
        }
      }
    }

    // Convert to SchemaDefinition array
    const schemas: SchemaDefinition[] = [];
    for (const [schemaName, tables] of schemaMap) {
      schemas.push({
        name: schemaName,
        tables,
        descriptionIterations: []
      });
    }

    return schemas;
  }

  /**
   * Get all tables in the database
   */
  private async getTables(
    schemaFilter: SchemaFilterConfig,
    tableFilter: TableFilterConfig
  ): Promise<{ success: boolean; data?: TableRow[]; errorMessage?: string }> {
    let whereClause = "WHERE t.is_ms_shipped = 0";

    // Schema filter
    if (schemaFilter.include && schemaFilter.include.length > 0) {
      const schemaList = schemaFilter.include.map(s => `'${s}'`).join(',');
      whereClause += ` AND s.name IN (${schemaList})`;
    }

    if (schemaFilter.exclude && schemaFilter.exclude.length > 0) {
      const schemaList = schemaFilter.exclude.map(s => `'${s}'`).join(',');
      whereClause += ` AND s.name NOT IN (${schemaList})`;
    }

    // Table filter
    if (tableFilter.exclude && tableFilter.exclude.length > 0) {
      const tableList = tableFilter.exclude.map(t => `'${t}'`).join(',');
      whereClause += ` AND t.name NOT IN (${tableList})`;
    }

    const query = `
      SELECT
        s.name as schema_name,
        t.name as table_name,
        ISNULL(p.rows, 0) as row_count
      FROM sys.tables t
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
      ${whereClause}
      ORDER BY s.name, t.name
    `;

    return await this.connection.query<TableRow>(query);
  }

  /**
   * Get all columns for a table
   */
  private async getColumns(schemaName: string, tableName: string): Promise<ColumnDefinition[]> {
    const query = `
      SELECT
        c.name as column_name,
        t.name as data_type,
        c.is_nullable,
        CAST(CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS BIT) as is_primary_key,
        CAST(CASE WHEN fk.parent_column_id IS NOT NULL THEN 1 ELSE 0 END AS BIT) as is_foreign_key,
        cc.definition as check_constraint,
        dc.definition as default_value
      FROM sys.columns c
      INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
      INNER JOIN sys.tables tbl ON c.object_id = tbl.object_id
      INNER JOIN sys.schemas s ON tbl.schema_id = s.schema_id
      LEFT JOIN (
        SELECT ic.object_id, ic.column_id
        FROM sys.index_columns ic
        INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        WHERE i.is_primary_key = 1
      ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
      LEFT JOIN sys.foreign_key_columns fk ON c.object_id = fk.parent_object_id AND c.column_id = fk.parent_column_id
      LEFT JOIN sys.check_constraints cc ON c.object_id = cc.parent_object_id
        AND cc.parent_column_id = c.column_id
      LEFT JOIN sys.default_constraints dc ON c.object_id = dc.parent_object_id
        AND c.column_id = dc.parent_column_id
      WHERE s.name = '${schemaName}' AND tbl.name = '${tableName}'
      ORDER BY c.column_id
    `;

    const result = await this.connection.query<ColumnRow>(query);
    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(row => ({
      name: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable,
      isPrimaryKey: row.is_primary_key,
      isForeignKey: row.is_foreign_key,
      checkConstraint: row.check_constraint || undefined,
      defaultValue: row.default_value || undefined,
      descriptionIterations: []
    }));
  }

  /**
   * Get all foreign key relationships for a table
   */
  private async getForeignKeys(schemaName: string, tableName: string): Promise<ForeignKeyRow[]> {
    const query = `
      SELECT
        s.name as schema_name,
        t.name as table_name,
        c.name as column_name,
        rs.name as referenced_schema,
        rt.name as referenced_table,
        rc.name as referenced_column
      FROM sys.foreign_key_columns fk
      INNER JOIN sys.tables t ON fk.parent_object_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      INNER JOIN sys.columns c ON fk.parent_object_id = c.object_id AND fk.parent_column_id = c.column_id
      INNER JOIN sys.tables rt ON fk.referenced_object_id = rt.object_id
      INNER JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
      INNER JOIN sys.columns rc ON fk.referenced_object_id = rc.object_id AND fk.referenced_column_id = rc.column_id
      WHERE s.name = '${schemaName}' AND t.name = '${tableName}'
    `;

    const result = await this.connection.query<ForeignKeyRow>(query);
    return result.data || [];
  }

  /**
   * Get existing extended properties (MS_Description)
   */
  public async getExistingDescriptions(
    schemaName: string,
    tableName: string
  ): Promise<Map<string, string>> {
    const query = `
      SELECT
        ISNULL(c.name, '') as column_name,
        CAST(ep.value AS NVARCHAR(MAX)) as description
      FROM sys.extended_properties ep
      INNER JOIN sys.tables t ON ep.major_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      LEFT JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
      WHERE ep.name = 'MS_Description'
        AND s.name = '${schemaName}'
        AND t.name = '${tableName}'
    `;

    const result = await this.connection.query<{ column_name: string; description: string }>(query);
    const descriptions = new Map<string, string>();

    if (result.success && result.data) {
      for (const row of result.data) {
        const key = row.column_name || '__TABLE__';
        descriptions.set(key, row.description);
      }
    }

    return descriptions;
  }
}
