/**
 * Discovery Trigger Analyzer
 * Implements heuristics to determine when relationship discovery should run
 * based on missing primary keys and foreign key deficit
 */

import { SchemaDefinition } from '../types/state.js';
import { DiscoveryTriggerAnalysis } from '../types/discovery.js';

export class DiscoveryTriggerAnalyzer {
  /**
   * Analyze whether relationship discovery should be triggered
   */
  public static analyzeSchemas(schemas: SchemaDefinition[]): DiscoveryTriggerAnalysis {
    const stats = this.calculateSchemaStatistics(schemas);
    const expectedMinFKs = this.calculateExpectedFKs(stats.totalTables);
    const fkDeficit = expectedMinFKs - stats.totalFKs;
    const fkDeficitPercentage = expectedMinFKs > 0
      ? (fkDeficit / expectedMinFKs) * 100
      : 0;

    // Trigger conditions
    const hasMissingPKs = stats.tablesWithoutPK > 0;
    const hasInsufficientFKs = stats.totalFKs < expectedMinFKs * 0.4; // Less than 40% of expected

    const shouldRun = hasMissingPKs || hasInsufficientFKs;

    // Build reason string
    const reason = this.buildReasonString(
      hasMissingPKs,
      hasInsufficientFKs,
      stats,
      expectedMinFKs
    );

    return {
      shouldRun,
      reason,
      details: {
        totalTables: stats.totalTables,
        tablesWithPK: stats.tablesWithPK,
        tablesWithoutPK: stats.tablesWithoutPK,
        totalFKs: stats.totalFKs,
        expectedMinFKs,
        fkDeficit,
        fkDeficitPercentage
      }
    };
  }

  /**
   * Calculate schema statistics for trigger analysis
   */
  private static calculateSchemaStatistics(schemas: SchemaDefinition[]): {
    totalTables: number;
    tablesWithPK: number;
    tablesWithoutPK: number;
    totalFKs: number;
  } {
    let totalTables = 0;
    let tablesWithPK = 0;
    let totalFKs = 0;

    for (const schema of schemas) {
      for (const table of schema.tables) {
        totalTables++;

        // Check if table has primary key
        const hasPK = table.columns.some(col => col.isPrimaryKey);
        if (hasPK) {
          tablesWithPK++;
        }

        // Count foreign keys
        totalFKs += table.dependsOn.length;
      }
    }

    return {
      totalTables,
      tablesWithPK,
      tablesWithoutPK: totalTables - tablesWithPK,
      totalFKs
    };
  }

  /**
   * Calculate expected minimum foreign keys based on table count
   * Formula:
   * - <= 10 tables: 1 FK per table
   * - 11-50 tables: 2 FKs per table
   * - 51-100 tables: 3 FKs per table
   * - > 100 tables: 4 FKs per table
   */
  private static calculateExpectedFKs(tableCount: number): number {
    if (tableCount <= 10) {
      return tableCount * 1;
    } else if (tableCount <= 50) {
      return tableCount * 2;
    } else if (tableCount <= 100) {
      return tableCount * 3;
    } else {
      return tableCount * 4;
    }
  }

  /**
   * Build human-readable reason string
   */
  private static buildReasonString(
    hasMissingPKs: boolean,
    hasInsufficientFKs: boolean,
    stats: { totalTables: number; tablesWithoutPK: number; totalFKs: number },
    expectedMinFKs: number
  ): string {
    if (!hasMissingPKs && !hasInsufficientFKs) {
      return 'Schema has sufficient metadata - discovery not needed';
    }

    const reasons: string[] = [];

    if (hasMissingPKs) {
      const percentage = ((stats.tablesWithoutPK / stats.totalTables) * 100).toFixed(1);
      reasons.push(
        `${stats.tablesWithoutPK} table(s) (${percentage}%) missing primary keys`
      );
    }

    if (hasInsufficientFKs) {
      const percentage = ((stats.totalFKs / expectedMinFKs) * 100).toFixed(1);
      const deficit = expectedMinFKs - stats.totalFKs;
      reasons.push(
        `Only ${stats.totalFKs} of ${expectedMinFKs} expected FKs found (${percentage}%), deficit: ${deficit}`
      );
    }

    return reasons.join('; ');
  }

  /**
   * Get detailed explanation of the trigger formula
   */
  public static getFormulaExplanation(): string {
    return `
Discovery Trigger Formula:
-------------------------

1. PRIMARY KEY CHECK:
   - Trigger if ANY table is missing a primary key
   - All tables should have a primary key for proper normalization

2. FOREIGN KEY CHECK:
   - Calculate expected minimum FKs based on table count:
     * <= 10 tables: 1 FK per table (minimum)
     * 11-50 tables: 2 FKs per table
     * 51-100 tables: 3 FKs per table
     * > 100 tables: 4 FKs per table

   - Trigger if actual FKs < 40% of expected
   - Example: 50 tables expect 100 FKs minimum
     * If < 40 FKs found, trigger discovery
     * If >= 40 FKs found, skip discovery

3. RATIONALE:
   - Missing PKs indicate incomplete schema metadata
   - FK deficit suggests undocumented relationships
   - Discovery helps LLM understand data model better
   - Better understanding → better descriptions
    `.trim();
  }

  /**
   * Analyze a specific schema in isolation
   */
  public static analyzeSchema(schema: SchemaDefinition): DiscoveryTriggerAnalysis {
    return this.analyzeSchemas([schema]);
  }

  /**
   * Get tables without primary keys
   */
  public static getTablesWithoutPK(schemas: SchemaDefinition[]): Array<{
    schema: string;
    table: string;
  }> {
    const tables: Array<{ schema: string; table: string }> = [];

    for (const schema of schemas) {
      for (const table of schema.tables) {
        const hasPK = table.columns.some(col => col.isPrimaryKey);
        if (!hasPK) {
          tables.push({
            schema: schema.name,
            table: table.name
          });
        }
      }
    }

    return tables;
  }

  /**
   * Get FK statistics by schema
   */
  public static getFKStatisticsBySchema(schemas: SchemaDefinition[]): Array<{
    schema: string;
    tableCount: number;
    totalFKs: number;
    expectedFKs: number;
    deficit: number;
    deficitPercentage: number;
  }> {
    return schemas.map(schema => {
      const tableCount = schema.tables.length;
      const totalFKs = schema.tables.reduce((sum, t) => sum + t.dependsOn.length, 0);
      const expectedFKs = this.calculateExpectedFKs(tableCount);
      const deficit = expectedFKs - totalFKs;
      const deficitPercentage = expectedFKs > 0
        ? (deficit / expectedFKs) * 100
        : 0;

      return {
        schema: schema.name,
        tableCount,
        totalFKs,
        expectedFKs,
        deficit,
        deficitPercentage
      };
    });
  }
}
