/**
 * LLM Discovery Validator
 * Uses LLM reasoning to validate and refine PK/FK candidates discovered through statistical analysis
 * Processes one table at a time with rich statistical context
 */

import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { ColumnStatsCache } from './ColumnStatsCache.js';
import { SchemaDefinition } from '../types/state.js';
import {
  PKCandidate,
  FKCandidate,
  CachedColumnStats,
  LLMDiscoveryContext,
  LLMValidationResult
} from '../types/discovery.js';
import { RelationshipDiscoveryConfig, AIConfig } from '../types/config.js';

export class LLMDiscoveryValidator {
  private llm: BaseLLM;

  constructor(
    private driver: BaseAutoDocDriver,
    private config: RelationshipDiscoveryConfig,
    private aiConfig: AIConfig,
    private statsCache: ColumnStatsCache,
    private schemas: SchemaDefinition[]
  ) {
    // Create LLM instance using MJ ClassFactory
    const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
      BaseLLM,
      aiConfig.provider,
      aiConfig.apiKey
    );

    if (!llm) {
      throw new Error(
        `Failed to create LLM instance for provider: ${aiConfig.provider}. Check that the provider name matches a registered BaseLLM subclass.`
      );
    }

    this.llm = llm;
  }

  /**
   * Validate PK/FK candidates for a single table using LLM reasoning
   */
  public async validateTableRelationships(
    schemaName: string,
    tableName: string,
    pkCandidates: PKCandidate[],
    fkCandidates: FKCandidate[]
  ): Promise<LLMValidationResult> {
    // Build rich context for LLM
    const context = this.buildTableContext(schemaName, tableName, pkCandidates, fkCandidates);

    // Create prompt for LLM
    const prompt = this.buildValidationPrompt(context);

    // Call LLM
    const params: ChatParams = {
      model: this.aiConfig.model,
      messages: [
        {
          role: 'system',
          content: 'You are a database schema expert specializing in relationship discovery and validation.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: this.aiConfig.temperature ?? 0.1,
      maxOutputTokens: this.aiConfig.maxTokens,
      responseFormat: 'JSON'
    };

    const chatResult: ChatResult = await this.llm.ChatCompletion(params);

    if (!chatResult.success) {
      return {
        validated: false,
        reasoning: `LLM call failed: ${chatResult.errorMessage}`,
        confidenceAdjustment: 0,
        recommendations: [],
        tokensUsed: 0
      };
    }

    // Parse LLM response
    const content = chatResult.data.choices[0].message.content;
    const usage = chatResult.data.usage;

    try {
      const result = JSON.parse(content) as {
        validated: boolean;
        reasoning: string;
        confidenceAdjustments?: Array<{
          type: 'pk' | 'fk';
          table: string;
          column: string;
          adjustment: number;
          reason: string;
        }>;
        recommendations?: Array<{
          type: 'confirm' | 'reject' | 'modify' | 'add_new';
          target: 'pk' | 'fk';
          schemaName?: string;
          tableName?: string;
          columnName?: string;
          details: string;
        }>;
      };

      return {
        validated: result.validated,
        reasoning: result.reasoning,
        confidenceAdjustment: 0, // Overall adjustment
        recommendations: result.recommendations || [],
        tokensUsed: usage?.totalTokens || 0
      };
    } catch (parseError) {
      return {
        validated: false,
        reasoning: `Failed to parse LLM response: ${(parseError as Error).message}\n\nRaw content:\n${content}`,
        confidenceAdjustment: 0,
        recommendations: [],
        tokensUsed: usage?.totalTokens || 0
      };
    }
  }

  /**
   * Build rich context for a table including stats from cache
   */
  private buildTableContext(
    schemaName: string,
    tableName: string,
    pkCandidates: PKCandidate[],
    fkCandidates: FKCandidate[]
  ): LLMDiscoveryContext {
    // Get table stats from cache
    const tableStats = this.statsCache.getTableStats(schemaName, tableName);
    if (!tableStats) {
      throw new Error(`No cached stats found for table ${schemaName}.${tableName}`);
    }

    // Build target table context with column stats
    const targetTable = {
      schema: schemaName,
      table: tableName,
      rowCount: tableStats.totalRows,
      columns: Array.from(tableStats.columns.values()).map(col => ({
        name: col.columnName,
        type: col.dataType,
        uniqueness: col.uniqueness,
        nullPercentage: col.nullPercentage,
        distinctCount: col.distinctCount,
        dataPattern: col.dataPattern,
        sampleValues: col.sampleValues.slice(0, 10) // Limit sample size for prompt
      }))
    };

    // Find related tables (tables with columns that have similar names)
    const relatedTables = this.findRelatedTables(schemaName, tableName);

    // Build PK candidates context
    const pkContext = pkCandidates.map(pk => ({
      columnNames: pk.columnNames,
      confidence: pk.confidence,
      reasoning: this.buildPKReasoning(pk)
    }));

    // Build FK candidates context
    const fkContext = fkCandidates
      .filter(fk => fk.sourceTable === tableName) // Only FKs from this table
      .map(fk => ({
        sourceColumn: fk.sourceColumn,
        targetTable: `${fk.targetSchema}.${fk.targetTable}`,
        targetColumn: fk.targetColumn,
        confidence: fk.confidence,
        reasoning: this.buildFKReasoning(fk)
      }));

    return {
      targetTable,
      relatedTables,
      pkCandidates: pkContext,
      fkCandidates: fkContext
    };
  }

  /**
   * Find tables that might be related based on column name patterns
   */
  private findRelatedTables(
    schemaName: string,
    tableName: string
  ): Array<{
    schema: string;
    table: string;
    rowCount: number;
    potentialRelationships: Array<{
      columnName: string;
      similarity: number;
      reason: string;
    }>;
  }> {
    const related: Array<{
      schema: string;
      table: string;
      rowCount: number;
      potentialRelationships: Array<{
        columnName: string;
        similarity: number;
        reason: string;
      }>;
    }> = [];

    // Get all columns in target table
    const targetTableStats = this.statsCache.getTableStats(schemaName, tableName);
    if (!targetTableStats) return related;

    const targetColumns = Array.from(targetTableStats.columns.values());

    // Look for columns with similar names in other tables
    for (const otherTableStats of this.statsCache.getAllTables()) {
      // Skip the target table itself
      if (
        otherTableStats.schemaName === schemaName &&
        otherTableStats.tableName === tableName
      ) {
        continue;
      }

      const potentialRelationships: Array<{
        columnName: string;
        similarity: number;
        reason: string;
      }> = [];

      for (const targetCol of targetColumns) {
        for (const otherCol of otherTableStats.columns.values()) {
          const similarity = this.calculateColumnSimilarity(
            targetCol,
            otherCol
          );

          if (similarity > 0.6) {
            potentialRelationships.push({
              columnName: `${targetCol.columnName} ↔ ${otherCol.columnName}`,
              similarity,
              reason: this.explainSimilarity(targetCol, otherCol, similarity)
            });
          }
        }
      }

      if (potentialRelationships.length > 0) {
        related.push({
          schema: otherTableStats.schemaName,
          table: otherTableStats.tableName,
          rowCount: otherTableStats.totalRows,
          potentialRelationships: potentialRelationships.sort(
            (a, b) => b.similarity - a.similarity
          ).slice(0, 5) // Top 5 relationships
        });
      }
    }

    // Return top 10 most related tables
    return related
      .sort((a, b) => {
        const aMaxSim = Math.max(...a.potentialRelationships.map(r => r.similarity));
        const bMaxSim = Math.max(...b.potentialRelationships.map(r => r.similarity));
        return bMaxSim - aMaxSim;
      })
      .slice(0, 10);
  }

  /**
   * Calculate similarity between two columns
   */
  private calculateColumnSimilarity(
    col1: CachedColumnStats,
    col2: CachedColumnStats
  ): number {
    let score = 0;

    // Name similarity (50% weight)
    const nameSim = this.calculateNameSimilarity(col1.columnName, col2.columnName);
    score += nameSim * 0.5;

    // Data type match (30% weight)
    if (this.areDataTypesCompatible(col1.dataType, col2.dataType)) {
      score += 0.3;
    }

    // Cardinality relationship (20% weight)
    // If one column has much higher uniqueness, they might be PK-FK pair
    const uniquenessDiff = Math.abs(col1.uniqueness - col2.uniqueness);
    if (uniquenessDiff > 0.3) {
      score += 0.2;
    }

    return score;
  }

  /**
   * Calculate name similarity using Levenshtein distance
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
    return 1 - distance / maxLength;
  }

  /**
   * Calculate Levenshtein distance
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
   * Check if data types are compatible
   */
  private areDataTypesCompatible(type1: string, type2: string): boolean {
    const normalize = (type: string) =>
      type
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/\s+/g, '');

    const t1 = normalize(type1);
    const t2 = normalize(type2);

    if (t1 === t2) return true;

    // INT variants
    const intTypes = ['int', 'integer', 'bigint', 'smallint', 'tinyint'];
    if (intTypes.some(t => t1.includes(t)) && intTypes.some(t => t2.includes(t))) {
      return true;
    }

    // String variants
    const stringTypes = ['varchar', 'char', 'nvarchar', 'nchar', 'text'];
    if (
      stringTypes.some(t => t1.includes(t)) &&
      stringTypes.some(t => t2.includes(t))
    ) {
      return true;
    }

    // GUID variants
    if (
      (t1.includes('uniqueidentifier') || t1.includes('uuid') || t1.includes('guid')) &&
      (t2.includes('uniqueidentifier') || t2.includes('uuid') || t2.includes('guid'))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Explain why two columns are similar
   */
  private explainSimilarity(
    col1: CachedColumnStats,
    col2: CachedColumnStats,
    similarity: number
  ): string {
    const reasons: string[] = [];

    if (col1.columnName.toLowerCase() === col2.columnName.toLowerCase()) {
      reasons.push('exact name match');
    } else if (
      col1.columnName.toLowerCase().includes(col2.columnName.toLowerCase()) ||
      col2.columnName.toLowerCase().includes(col1.columnName.toLowerCase())
    ) {
      reasons.push('name similarity');
    }

    if (this.areDataTypesCompatible(col1.dataType, col2.dataType)) {
      reasons.push('compatible types');
    }

    if (Math.abs(col1.uniqueness - col2.uniqueness) > 0.3) {
      reasons.push('PK-FK cardinality pattern');
    }

    return reasons.join(', ');
  }

  /**
   * Build reasoning string for PK candidate
   */
  private buildPKReasoning(pk: PKCandidate): string {
    const reasons: string[] = [];

    if (pk.evidence.uniqueness >= 0.99) {
      reasons.push('highly unique');
    }

    if (pk.evidence.nullCount === 0) {
      reasons.push('no nulls');
    }

    if (pk.evidence.namingScore > 0.7) {
      reasons.push('matches PK naming pattern');
    }

    if (pk.evidence.dataPattern !== 'unknown') {
      reasons.push(`${pk.evidence.dataPattern} pattern`);
    }

    return reasons.join(', ');
  }

  /**
   * Build reasoning string for FK candidate
   */
  private buildFKReasoning(fk: FKCandidate): string {
    const reasons: string[] = [];

    if (fk.evidence.valueOverlap >= 0.9) {
      reasons.push(`${(fk.evidence.valueOverlap * 100).toFixed(0)}% value overlap`);
    }

    if (fk.evidence.namingMatch > 0.7) {
      reasons.push('strong name similarity');
    }

    if (fk.evidence.dataTypeMatch) {
      reasons.push('matching data types');
    }

    if (fk.evidence.orphanCount === 0) {
      reasons.push('no orphans');
    }

    return reasons.join(', ');
  }

  /**
   * Build LLM validation prompt
   */
  private buildValidationPrompt(context: LLMDiscoveryContext): string {
    return `
You are a database schema expert analyzing potential primary keys and foreign keys.

## Target Table: ${context.targetTable.schema}.${context.targetTable.table}
Row Count: ${context.targetTable.rowCount}

### Columns and Statistics:
${context.targetTable.columns
  .map(
    col => `
- **${col.name}** (${col.type})
  - Uniqueness: ${(col.uniqueness * 100).toFixed(1)}%
  - Null %: ${(col.nullPercentage * 100).toFixed(1)}%
  - Distinct Values: ${col.distinctCount}
  - Pattern: ${col.dataPattern}
  - Sample: ${col.sampleValues.slice(0, 5).join(', ')}
`
  )
  .join('\n')}

${
  context.relatedTables && context.relatedTables.length > 0
    ? `
### Related Tables (by column name similarity):
${context.relatedTables
  .map(
    table => `
- **${table.schema}.${table.table}** (${table.rowCount} rows)
  ${table.potentialRelationships.map(rel => `  - ${rel.columnName}: ${rel.reason}`).join('\n  ')}
`
  )
  .join('\n')}
`
    : ''
}

### Statistical Analysis Found:

**Primary Key Candidates:**
${
  context.pkCandidates.length > 0
    ? context.pkCandidates
        .map(
          pk => `
- ${pk.columnNames.join(', ')} (${pk.confidence}% confidence)
  Reasoning: ${pk.reasoning}
`
        )
        .join('\n')
    : 'None'
}

**Foreign Key Candidates:**
${
  context.fkCandidates.length > 0
    ? context.fkCandidates
        .map(
          fk => `
- ${fk.sourceColumn} → ${fk.targetTable}.${fk.targetColumn} (${fk.confidence}% confidence)
  Reasoning: ${fk.reasoning}
`
        )
        .join('\n')
    : 'None'
}

## Your Task:
Analyze the statistical findings and provide validation:

1. **Validate Primary Keys**: Are the PK candidates correct? Should any be removed or added?
2. **Validate Foreign Keys**: Are the FK candidates correct? Look for:
   - Columns marked as PKs that should actually be FKs
   - Missing FK relationships based on column names and data patterns
3. **Cross-table Context**: Use the related tables information to identify relationships

**Output Format:**
{
  "validated": true/false,
  "reasoning": "Your detailed analysis",
  "confidenceAdjustments": [
    { "type": "pk|fk", "table": "...", "column": "...", "adjustment": -20 to +20, "reason": "..." }
  ],
  "recommendations": [
    { "type": "confirm|reject|modify|add_new", "target": "pk|fk", "details": "..." }
  ]
}
`.trim();
  }
}
