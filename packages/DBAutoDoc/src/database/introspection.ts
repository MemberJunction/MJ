import { DatabaseConnection } from './connection';

export interface TableInfo {
  schema: string;
  table: string;
  rowCount: number;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
  isNullable: boolean;
  defaultValue?: string;
  isIdentity: boolean;
  isComputed: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
}

export interface ForeignKeyInfo {
  name: string;
  column: string;
  referencedSchema: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface ExtendedPropertyInfo {
  objectType: 'TABLE' | 'COLUMN';
  objectName: string;
  value: string;
}

/**
 * Database introspection - pure SQL Server, no MJ dependencies
 */
export class DatabaseIntrospector {
  constructor(private connection: DatabaseConnection) {}

  /**
   * Get all tables in database
   */
  async getTables(schemas?: string[], excludeSchemas?: string[]): Promise<TableInfo[]> {
    let where = "WHERE t.type = 'U'";

    if (schemas && schemas.length > 0) {
      const schemaList = schemas.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
      where += ` AND s.name IN (${schemaList})`;
    }

    if (excludeSchemas && excludeSchemas.length > 0) {
      const excludeList = excludeSchemas.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
      where += ` AND s.name NOT IN (${excludeList})`;
    }

    where += ` AND s.name NOT IN ('sys', 'INFORMATION_SCHEMA')`;

    const query = `
      SELECT
        s.name AS [schema],
        t.name AS [table],
        SUM(p.rows) AS rowCount
      FROM sys.tables t
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
      ${where}
      GROUP BY s.name, t.name
      ORDER BY s.name, t.name
    `;

    return await this.connection.query<TableInfo>(query);
  }

  /**
   * Get columns for a table
   */
  async getColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    const query = `
      SELECT
        c.name,
        t.name AS dataType,
        c.max_length AS maxLength,
        c.precision,
        c.scale,
        c.is_nullable AS isNullable,
        OBJECT_DEFINITION(c.default_object_id) AS defaultValue,
        c.is_identity AS isIdentity,
        c.is_computed AS isComputed,
        CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS isPrimaryKey,
        CASE WHEN fk.parent_column_id IS NOT NULL THEN 1 ELSE 0 END AS isForeignKey
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
      WHERE s.name = @schema AND tbl.name = @table
      ORDER BY c.column_id
    `;

    return await this.connection.query<ColumnInfo>(query, { schema, table });
  }

  /**
   * Get foreign keys for a table
   */
  async getForeignKeys(schema: string, table: string): Promise<ForeignKeyInfo[]> {
    const query = `
      SELECT
        fk.name,
        c1.name AS [column],
        s2.name AS referencedSchema,
        t2.name AS referencedTable,
        c2.name AS referencedColumn
      FROM sys.foreign_keys fk
      INNER JOIN sys.tables t1 ON fk.parent_object_id = t1.object_id
      INNER JOIN sys.schemas s1 ON t1.schema_id = s1.schema_id
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.columns c1 ON fkc.parent_object_id = c1.object_id AND fkc.parent_column_id = c1.column_id
      INNER JOIN sys.columns c2 ON fkc.referenced_object_id = c2.object_id AND fkc.referenced_column_id = c2.column_id
      INNER JOIN sys.tables t2 ON fkc.referenced_object_id = t2.object_id
      INNER JOIN sys.schemas s2 ON t2.schema_id = s2.schema_id
      WHERE s1.name = @schema AND t1.name = @table
      ORDER BY fk.name
    `;

    return await this.connection.query<ForeignKeyInfo>(query, { schema, table });
  }

  /**
   * Get extended properties (existing descriptions)
   */
  async getExtendedProperties(schema: string, table: string): Promise<ExtendedPropertyInfo[]> {
    const query = `
      SELECT
        CASE WHEN ep.minor_id = 0 THEN 'TABLE' ELSE 'COLUMN' END AS objectType,
        COALESCE(c.name, t.name) AS objectName,
        CAST(ep.value AS NVARCHAR(MAX)) AS value
      FROM sys.extended_properties ep
      INNER JOIN sys.tables t ON ep.major_id = t.object_id
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      LEFT JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
      WHERE s.name = @schema
        AND t.name = @table
        AND ep.name = 'MS_Description'
    `;

    return await this.connection.query<ExtendedPropertyInfo>(query, { schema, table });
  }

  /**
   * Sample data from table
   */
  async sampleData(schema: string, table: string, limit: number = 10): Promise<Record<string, any>[]> {
    const query = `SELECT TOP ${limit} * FROM [${schema}].[${table}]`;
    return await this.connection.query(query);
  }
}
