/**
 * Foreign Key Detection
 * Analyzes columns to find potential foreign key relationships based on
 * naming patterns, value overlap, and cardinality analysis
 */

import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { SchemaDefinition, TableDefinition, ColumnDefinition } from '../types/state.js';
import { FKCandidate, FKEvidence, PKCandidate } from '../types/discovery.js';
import { RelationshipDiscoveryConfig } from '../types/config.js';

export class FKDetector {
  constructor(
    private driver: BaseAutoDocDriver,
    private config: RelationshipDiscoveryConfig
  ) {}

  /**
   * Detect foreign key candidates for a table
   */
  public async detectFKCandidates(
    schemas: SchemaDefinition[],
    sourceSchema: string,
    sourceTable: TableDefinition,
    discoveredPKs: PKCandidate[],
    iteration: number
  ): Promise<FKCandidate[]> {
    const candidates: FKCandidate[] = [];

    console.log(`[FKDetector] Analyzing table ${sourceSchema}.${sourceTable.name} with ${sourceTable.columns.length} columns`);
    console.log(`[FKDetector] Available PKs: ${discoveredPKs.length}`);

    // For each column in source table
    for (const sourceColumn of sourceTable.columns) {
      // Skip if column is a discovered PK
      const isPK = discoveredPKs.some(pk =>
        pk.schemaName === sourceSchema &&
        pk.tableName === sourceTable.name &&
        pk.columnNames.includes(sourceColumn.name)
      );

      if (isPK) {
        console.log(`[FKDetector]   Skip ${sourceColumn.name} - is a PK`);
        continue;
      }

      // Skip schema-defined PKs unless 1:1 inheritance pattern
      // This catches hard PKs (from SQL schema) that aren't in discoveredPKs array
      if (sourceColumn.isPrimaryKey) {
        const isInheritance = this.detectInheritancePattern(sourceTable, sourceColumn);
        if (!isInheritance) {
          console.log(`[FKDetector]   Skip ${sourceColumn.name} - is a hard PK (not inheritance)`);
          continue;
        } else {
          console.log(`[FKDetector]   Analyzing ${sourceColumn.name} - PK with inheritance pattern`);
        }
      }

      // Find potential target tables/columns
      const potentialTargets = this.findPotentialTargets(
        schemas,
        sourceSchema,
        sourceTable.name,
        sourceColumn,
        discoveredPKs
      );

      console.log(`[FKDetector]   Column ${sourceColumn.name}: Found ${potentialTargets.length} potential targets`);
      if (potentialTargets.length > 0) {
        console.log(`[FKDetector]     Targets: ${potentialTargets.map(t => `${t.schemaName}.${t.tableName}.${t.columnName}`).join(', ')}`);
      }

      // Analyze each potential target
      for (const target of potentialTargets) {
        const candidate = await this.analyzeFKCandidate(
          sourceSchema,
          sourceTable.name,
          sourceColumn,
          target.schemaName,
          target.tableName,
          target.columnName,
          target.isPK,
          iteration
        );

        if (candidate) {
          console.log(`[FKDetector]     Candidate confidence: ${candidate.confidence} (min: ${this.config.confidence.foreignKeyMinimum * 100})`);
        }

        if (candidate && candidate.confidence >= this.config.confidence.foreignKeyMinimum * 100) {
          candidates.push(candidate);
          console.log(`[FKDetector]     ✓ Added FK candidate: ${sourceColumn.name} -> ${target.tableName}.${target.columnName}`);
        }
      }
    }

    console.log(`[FKDetector] Table ${sourceSchema}.${sourceTable.name}: Found ${candidates.length} FK candidates`);

    // Sort by confidence descending
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Detect if a PK column is part of a 1:1 inheritance pattern
   *
   * Inheritance pattern characteristics:
   * - PK column name suggests parent table (e.g., PersonID → Person)
   * - Would create 1:1 relationship (child extends parent)
   * - Rare case (~1% of tables), so we're conservative
   *
   * Returns true if inheritance pattern detected, false otherwise
   */
  private detectInheritancePattern(table: TableDefinition, pkColumn: ColumnDefinition): boolean {
    // Must be single-column PK (composite PKs are never inheritance)
    const pkColumns = table.columns.filter(c => c.isPrimaryKey);
    if (pkColumns.length !== 1) {
      return false;
    }

    const columnName = pkColumn.name.toLowerCase();
    const tableName = table.name.toLowerCase();

    // Heuristic: Column name contains a different table name + "id"
    // Examples:
    // - Employee table with PersonID column (PersonID → Person)
    // - Student table with PersonID column (PersonID → Person)
    // - Manager table with EmployeeID column (EmployeeID → Employee)

    // Extract potential parent table name from column
    // Match patterns: PersonID, Person_ID, person_id, etc.
    const idSuffixMatch = columnName.match(/^(.+?)_?id$/);
    if (!idSuffixMatch) {
      return false; // Column doesn't end with "id"
    }

    const potentialParentName = idSuffixMatch[1].replace(/_/g, ''); // Remove underscores

    // If the potential parent name is the same as the table name, NOT inheritance
    // (e.g., Person table with PersonID is just a normal PK)
    if (potentialParentName === tableName.replace(/_/g, '')) {
      return false;
    }

    // If we get here: PK column name suggests a DIFFERENT table
    // This is likely inheritance (e.g., Employee.PersonID → Person.PersonID)
    return true;
  }

  /**
   * Find potential FK target tables/columns based on naming
   */
  private findPotentialTargets(
    schemas: SchemaDefinition[],
    sourceSchema: string,
    sourceTable: string,
    sourceColumn: ColumnDefinition,
    discoveredPKs: PKCandidate[]
  ): Array<{ schemaName: string; tableName: string; columnName: string; isPK: boolean }> {
    const targets: Array<{ schemaName: string; tableName: string; columnName: string; isPK: boolean }> = [];

    // Pattern 1: CustomerID -> Customer.ID (exact match on table name)
    const tableNamePattern = this.extractTableNameFromColumn(sourceColumn.name);
    if (tableNamePattern) {
      for (const schema of schemas) {
        const matchingTable = schema.tables.find(t =>
          t.name.toLowerCase() === tableNamePattern.toLowerCase()
        );

        if (matchingTable && matchingTable.name !== sourceTable) {
          // Look for ID column
          const idColumn = matchingTable.columns.find(c =>
            c.name.toLowerCase() === 'id' ||
            c.name.toLowerCase() === `${matchingTable.name.toLowerCase()}id`
          );

          if (idColumn) {
            const isPK = discoveredPKs.some(pk =>
              pk.schemaName === schema.name &&
              pk.tableName === matchingTable.name &&
              pk.columnNames.includes(idColumn.name)
            );

            targets.push({
              schemaName: schema.name,
              tableName: matchingTable.name,
              columnName: idColumn.name,
              isPK
            });
          }
        }
      }
    }

    // Pattern 2: Check all discovered PKs with similar names
    for (const pk of discoveredPKs) {
      const pkSchema = schemas.find(s => s.name === pk.schemaName);
      if (!pkSchema) continue;

      const pkTable = pkSchema.tables.find(t => t.name === pk.tableName);
      if (!pkTable || pkTable.name === sourceTable) continue;

      for (const pkColumnName of pk.columnNames) {
        const similarity = this.calculateNameSimilarity(sourceColumn.name, pkColumnName);
        if (similarity > 0.6) {
          targets.push({
            schemaName: pk.schemaName,
            tableName: pk.tableName,
            columnName: pkColumnName,
            isPK: true
          });
        }
      }
    }

    // Pattern 3: Same column name in different tables (might be FK)
    for (const schema of schemas) {
      for (const table of schema.tables) {
        if (table.name === sourceTable) continue;

        const matchingColumn = table.columns.find(c =>
          c.name.toLowerCase() === sourceColumn.name.toLowerCase() &&
          c.dataType === sourceColumn.dataType
        );

        if (matchingColumn) {
          const isPK = discoveredPKs.some(pk =>
            pk.schemaName === schema.name &&
            pk.tableName === table.name &&
            pk.columnNames.includes(matchingColumn.name)
          );

          // Only add if it's a PK in target table (more likely to be FK)
          if (isPK) {
            targets.push({
              schemaName: schema.name,
              tableName: table.name,
              columnName: matchingColumn.name,
              isPK: true
            });
          }
        }
      }
    }

    return targets;
  }

  /**
   * Extract table name from column name (e.g., "CustomerID" -> "Customer")
   */
  private extractTableNameFromColumn(columnName: string): string | null {
    // Remove common suffixes
    const suffixes = ['ID', 'Id', 'id', 'KEY', 'Key', 'key', 'FK', 'Fk', 'fk'];

    for (const suffix of suffixes) {
      if (columnName.endsWith(suffix)) {
        const tableName = columnName.slice(0, -suffix.length);
        if (tableName.length > 0) {
          return tableName;
        }
      }
    }

    return null;
  }

  /**
   * Calculate name similarity (0-1)
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    const lower1 = name1.toLowerCase();
    const lower2 = name2.toLowerCase();

    // Exact match
    if (lower1 === lower2) return 1.0;

    // One contains the other
    if (lower1.includes(lower2) || lower2.includes(lower1)) {
      return 0.8;
    }

    // Levenshtein distance
    const distance = this.levenshteinDistance(lower1, lower2);
    const maxLength = Math.max(lower1.length, lower2.length);
    return 1 - (distance / maxLength);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Analyze a specific FK candidate
   */
  private async analyzeFKCandidate(
    sourceSchema: string,
    sourceTable: string,
    sourceColumn: ColumnDefinition,
    targetSchema: string,
    targetTable: string,
    targetColumn: string,
    targetIsPK: boolean,
    iteration: number
  ): Promise<FKCandidate | null> {
    // Get target column info
    const targetColumnDef = await this.driver.getColumnInfo(targetSchema, targetTable, targetColumn);

    // Check data type match
    const dataTypeMatch = this.isDataTypeCompatible(sourceColumn.dataType, targetColumnDef.type);
    if (!dataTypeMatch) {
      return null; // Data types must match
    }

    // Calculate naming match
    const namingMatch = this.calculateNameSimilarity(sourceColumn.name, targetColumn);

    // Check value overlap
    const overlapResult = await this.driver.testValueOverlap(
      `${sourceSchema}.${sourceTable}`,
      sourceColumn.name,
      `${targetSchema}.${targetTable}`,
      targetColumn,
      this.config.sampling.valueOverlapSampleSize
    );

    // Get column statistics for cardinality analysis
    const sourceStats = await this.driver.getColumnStatisticsForDiscovery(
      sourceSchema,
      sourceTable,
      sourceColumn.name,
      sourceColumn.dataType,
      this.config.sampling.maxRowsPerTable
    );
    const targetStats = await this.driver.getColumnStatisticsForDiscovery(
      targetSchema,
      targetTable,
      targetColumn,
      targetColumnDef.type,
      this.config.sampling.maxRowsPerTable
    );

    // Calculate cardinality ratio (should be many:one for FK)
    const cardinalityRatio = targetStats.distinctCount > 0
      ? sourceStats.distinctCount / targetStats.distinctCount
      : 0;

    // Calculate null percentage
    const nullPercentage = sourceStats.totalRows > 0
      ? sourceStats.nullCount / sourceStats.totalRows
      : 0;

    // Calculate orphan count
    const orphanCount = Math.floor(sourceStats.totalRows * (1 - overlapResult));

    // Build evidence
    const evidence: FKEvidence = {
      namingMatch,
      valueOverlap: overlapResult,
      cardinalityRatio,
      dataTypeMatch: true,
      nullPercentage,
      sampleSize: this.config.sampling.valueOverlapSampleSize,
      orphanCount,
      warnings: []
    };

    // Add warnings
    if (overlapResult < 0.8) {
      evidence.warnings.push(`Only ${(overlapResult * 100).toFixed(1)}% of values exist in target`);
    }
    if (orphanCount > 0) {
      evidence.warnings.push(`${orphanCount} orphaned values found`);
    }
    if (nullPercentage > 0.5) {
      evidence.warnings.push(`${(nullPercentage * 100).toFixed(1)}% null values (optional FK)`);
    }
    if (cardinalityRatio < 0.5) {
      evidence.warnings.push('Cardinality suggests one:many instead of many:one');
    }

    // Calculate confidence
    const confidence = this.calculateFKConfidence(evidence, targetIsPK);

    // Don't return if confidence too low
    if (confidence < 40) {
      return null;
    }

    return {
      schemaName: sourceSchema,
      sourceTable,
      sourceColumn: sourceColumn.name,
      targetSchema,
      targetTable,
      targetColumn,
      confidence,
      evidence,
      discoveredInIteration: iteration,
      validatedByLLM: false,
      status: 'candidate'
    };
  }

  /**
   * Check if data types are compatible for FK relationship
   */
  private isDataTypeCompatible(sourceType: string, targetType: string): boolean {
    const normalize = (type: string) => type.toLowerCase()
      .replace(/\([^)]*\)/g, '') // Remove size specifiers
      .replace(/\s+/g, '');

    const source = normalize(sourceType);
    const target = normalize(targetType);

    // Exact match
    if (source === target) return true;

    // INT variants
    const intTypes = ['int', 'integer', 'bigint', 'smallint', 'tinyint'];
    if (intTypes.some(t => source.includes(t)) && intTypes.some(t => target.includes(t))) {
      return true;
    }

    // String variants
    const stringTypes = ['varchar', 'char', 'nvarchar', 'nchar', 'text'];
    if (stringTypes.some(t => source.includes(t)) && stringTypes.some(t => target.includes(t))) {
      return true;
    }

    // GUID variants
    if ((source.includes('uniqueidentifier') || source.includes('uuid') || source.includes('guid')) &&
        (target.includes('uniqueidentifier') || target.includes('uuid') || target.includes('guid'))) {
      return true;
    }

    return false;
  }

  /**
   * Calculate FK confidence score (0-100)
   */
  private calculateFKConfidence(evidence: FKEvidence, targetIsPK: boolean): number {
    let score = 0;

    // Value overlap is critical (40% weight)
    score += evidence.valueOverlap * 40;

    // Naming match (20% weight)
    score += evidence.namingMatch * 20;

    // Cardinality check (15% weight)
    // We want many:one ratio (ratio > 1 is good)
    const cardinalityScore = Math.min(evidence.cardinalityRatio, 2) / 2; // Cap at 2:1
    score += cardinalityScore * 15;

    // Target is PK bonus (15% weight)
    if (targetIsPK) {
      score += 15;
    }

    // Null handling (10% weight)
    // Some nulls are OK (optional FK), but too many is suspicious
    const nullScore = evidence.nullPercentage < 0.3 ? 10 :
                     evidence.nullPercentage < 0.7 ? 5 : 0;
    score += nullScore;

    // Penalties
    if (evidence.orphanCount > evidence.sampleSize * 0.2) {
      score *= 0.7; // 30% penalty for many orphans
    }

    if (!evidence.dataTypeMatch) {
      score *= 0.5; // 50% penalty for type mismatch
    }

    return Math.round(Math.min(score, 100));
  }
}
