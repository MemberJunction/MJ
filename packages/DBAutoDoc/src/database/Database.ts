/**
 * Database connection and introspection classes
 * Primary interface for all database operations
 */

import { MJGlobal } from '@memberjunction/global';
import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { AutoDocConnectionConfig } from '../types/driver.js';
import { SchemaDefinition, TableDefinition, ColumnDefinition, ForeignKeyReference } from '../types/state.js';
import { SchemaFilterConfig, TableFilterConfig, AnalysisConfig } from '../types/config.js';
import '../drivers/SQLServerDriver.js'; // Import to ensure registration
import '../drivers/MySQLDriver.js'; // Import to ensure registration
import '../drivers/PostgreSQLDriver.js'; // Import to ensure registration

/**
 * Create a database driver instance
 */
export function createDriver(config: AutoDocConnectionConfig): BaseAutoDocDriver {
  const providerKey = config.provider === 'sqlserver' || !config.provider ? 'SQLServer' :
                      config.provider === 'mysql' ? 'MySQL' :
                      config.provider === 'postgresql' ? 'PostgreSQL' :
                      config.provider === 'oracle' ? 'Oracle' : 'SQLServer';

  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAutoDocDriver>(
    BaseAutoDocDriver,
    providerKey,
    config
  );

  if (!driver) {
    throw new Error(`Database provider '${providerKey}' is not registered`);
  }

  return driver;
}

/**
 * Database connection class
 * Provides connection management and query execution
 */
export class DatabaseConnection {
  private driver: BaseAutoDocDriver;

  constructor(dbConfig: AutoDocConnectionConfig) {
    this.driver = createDriver(dbConfig);
  }

  public async connect(): Promise<void> {
    await this.driver.connect();
  }

  public async test(): Promise<{ success: boolean; message: string }> {
    return await this.driver.test();
  }

  public async query<T = any>(
    queryText: string,
    maxRetries: number = 3
  ): Promise<{ success: boolean; data?: T[]; errorMessage?: string }> {
    return await this.driver.executeQuery<T>(queryText, maxRetries);
  }

  public async close(): Promise<void> {
    await this.driver.close();
  }

  // Expose the underlying driver for advanced usage
  public getDriver(): BaseAutoDocDriver {
    return this.driver;
  }
}

/**
 * Database introspector
 * Retrieves schema and table information from the database
 */
export class Introspector {
  constructor(private driver: BaseAutoDocDriver) {}

  public async getSchemas(
    schemaFilter: SchemaFilterConfig,
    tableFilter: TableFilterConfig
  ): Promise<SchemaDefinition[]> {
    const autoDocSchemas = await this.driver.getSchemas(schemaFilter, tableFilter);

    // Convert AutoDocSchema[] to SchemaDefinition[]
    const schemas: SchemaDefinition[] = [];
    for (const autoDocSchema of autoDocSchemas) {
      const tables: TableDefinition[] = [];

      for (const autoDocTable of autoDocSchema.tables) {
        // Convert foreign keys to dependsOn/dependents format
        const dependsOn: ForeignKeyReference[] = autoDocTable.foreignKeys.map(fk => ({
          schema: fk.referencedSchema,
          table: fk.referencedTable,
          column: fk.columnName,
          referencedColumn: fk.referencedColumn
        }));

        // Convert columns
        const columns: ColumnDefinition[] = autoDocTable.columns.map(col => ({
          name: col.name,
          dataType: col.dataType,
          isNullable: col.isNullable,
          isPrimaryKey: col.isPrimaryKey,
          isForeignKey: col.isForeignKey,
          checkConstraint: col.checkConstraint,
          defaultValue: col.defaultValue,
          descriptionIterations: [],
          // Track hard vs soft keys
          // Schema introspection sets 'schema' source for SQL-defined keys
          pkSource: col.isPrimaryKey ? 'schema' : undefined,
          fkSource: col.isForeignKey ? 'schema' : undefined
        }));

        tables.push({
          name: autoDocTable.tableName,
          rowCount: autoDocTable.rowCount,
          dependsOn,
          dependents: [], // Will be populated later
          columns,
          descriptionIterations: []
        });
      }

      schemas.push({
        name: autoDocSchema.name,
        tables,
        descriptionIterations: []
      });
    }

    // Populate dependents (reverse FKs)
    for (const schema of schemas) {
      for (const table of schema.tables) {
        for (const dep of table.dependsOn) {
          const parentSchema = schemas.find(s => s.name === dep.schema);
          if (parentSchema) {
            const parentTable = parentSchema.tables.find(t => t.name === dep.table);
            if (parentTable) {
              if (!parentTable.dependents.some(d => d.schema === schema.name && d.table === table.name)) {
                parentTable.dependents.push({
                  schema: schema.name,
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

    return schemas;
  }

  public async getExistingDescriptions(
    schemaName: string,
    tableName: string
  ): Promise<Map<string, string>> {
    const descriptions = await this.driver.getExistingDescriptions(schemaName, tableName);
    const map = new Map<string, string>();

    for (const desc of descriptions) {
      const key = desc.target === 'table' ? '__TABLE__' : desc.targetName;
      map.set(key, desc.description);
    }

    return map;
  }
}

/**
 * Data sampler
 * Analyzes table data and gathers column statistics
 */
export class DataSampler {
  constructor(
    private driver: BaseAutoDocDriver,
    private config: AnalysisConfig
  ) {}

  public async analyzeTable(
    schemaName: string,
    tableName: string,
    columns: ColumnDefinition[]
  ): Promise<void> {
    let columnErrors = 0;

    for (const column of columns) {
      try {
        const stats = await this.driver.getColumnStatistics(
          schemaName,
          tableName,
          column.name,
          column.dataType,
          this.config.cardinalityThreshold,
          this.config.sampleSize
        );

        // Convert AutoDocColumnStatistics to ColumnStatistics
        column.statistics = {
          totalRows: stats.totalRows,
          distinctCount: stats.distinctCount,
          uniquenessRatio: stats.uniquenessRatio,
          nullCount: stats.nullCount,
          nullPercentage: stats.nullPercentage,
          sampleValues: stats.sampleValues,
          min: stats.min,
          max: stats.max,
          avg: stats.avg,
          stdDev: stats.stdDev,
          avgLength: stats.avgLength,
          maxLength: stats.maxLength,
          minLength: stats.minLength
        };

        // Set possible values if low cardinality
        if (stats.valueDistribution && stats.valueDistribution.length > 0) {
          column.possibleValues = stats.valueDistribution.map(v => v.value);
        }
      } catch (error) {
        columnErrors++;
        console.error(
          `  Failed to get statistics for ${schemaName}.${tableName}.${column.name}: ${(error as Error).message}`
        );
        // Leave column without statistics - table analysis will continue
        // AI can still generate descriptions based on column name and type
      }
    }

    if (columnErrors > 0) {
      console.warn(
        `  Warning: ${columnErrors} column(s) in ${schemaName}.${tableName} failed statistics gathering`
      );
    }
  }
}
