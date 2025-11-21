/**
 * Sample Query Generator
 * Generates reference SQL queries for AI agents using LLM-powered analysis
 */

import { v4 as uuidv4 } from 'uuid';
import { LogError, LogStatus } from '@memberjunction/core';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import * as fs from 'fs/promises';
import {
  SampleQuery,
  SampleQueryGenerationResult,
  SampleQueryGenerationSummary,
  SampleQueryGenerationConfig,
  QueryGenerationContext,
  TableContext,
  ColumnContext,
  ForeignKeyContext,
  QueryType,
  QueryPattern,
  QueryComplexity,
  QueryPlan,
  QuerySQL
} from '../types/sample-queries.js';
import { SchemaDefinition, TableDefinition } from '../types/state.js';

interface QueryGenerationPromptResponse {
  queries: Array<{
    id?: string;
    name: string;
    description: string;
    businessPurpose: string;
    queryType: QueryType;
    queryPattern: QueryPattern;
    complexity: QueryComplexity;
    primaryEntities: Array<{ schema: string; table: string; alias?: string }>;
    relatedEntities: Array<{ schema: string; table: string; alias?: string }>;
    sqlQuery: string;
    parameters: Array<{
      name: string;
      dataType: string;
      description: string;
      required: boolean;
      defaultValue?: string;
      exampleValues: string[];
    }>;
    sampleResultColumns: Array<{
      name: string;
      dataType: string;
      description: string;
      isMeasure: boolean;
      isDimension: boolean;
    }>;
    filteringRules: string[];
    aggregationRules: string[];
    joinRules: string[];
    relatedQueries?: string[];
    alignmentNotes?: string;
    confidence: number;
    reasoning?: string;
  }>;
  multiQueryPatterns?: Array<{
    name: string;
    description: string;
    queryIds: string[];
    alignmentRules: string[];
  }>;
}

interface QueryFixResponse extends QuerySQL {
  fixExplanation?: string;
}

interface QueryFixContext {
  schema: SchemaDefinition;
  focusTable: TableDefinition;
  queryPlan: QueryPlan;
  currentSQL: string;
  errorMessage: string;
  attemptNumber: number;
  maxAttempts: number;
  previousAttempts: Array<{ sql: string; error: string }>;
}

export class SampleQueryGenerator {
  private totalTokensUsed: number = 0;
  private totalCost: number = 0;
  private startTime: number = 0;

  constructor(
    private config: SampleQueryGenerationConfig,
    private promptEngine: PromptEngine,
    private driver: BaseAutoDocDriver,
    private model: string,
    private effortLevel?: number,
    private maxTokens: number = 16000,  // Default from typical AI config
    private outputFilePath?: string,  // Optional path for incremental query writes
    private summaryFilePath?: string  // Optional path for incremental summary writes
  ) {}

  public async generateQueries(
    schemas: SchemaDefinition[]
  ): Promise<SampleQueryGenerationResult> {
    this.startTime = Date.now();
    this.totalTokensUsed = 0;
    this.totalCost = 0;

    const allQueries: SampleQuery[] = [];
    const summary: SampleQueryGenerationSummary = {
      totalQueriesGenerated: 0,
      queriesValidated: 0,
      queriesFailed: 0,
      totalExecutionTime: 0,
      tokensUsed: 0,
      estimatedCost: 0,
      averageConfidence: 0,
      queriesByType: {} as Record<QueryType, number>,
      queriesByPattern: {} as Record<QueryPattern, number>,
      queriesByComplexity: {} as Record<QueryComplexity, number>
    };

    try {
      for (const schema of schemas) {
        LogStatus(`[SampleQueryGenerator] Generating queries for schema: ${schema.name}`);

        const schemaQueries = await this.generateQueriesForSchema(schema, allQueries);
        allQueries.push(...schemaQueries);
      }

      summary.totalQueriesGenerated = allQueries.length;
      summary.queriesValidated = allQueries.filter(q => q.validated).length;
      summary.queriesFailed = allQueries.filter(q => !q.validated).length;
      summary.totalExecutionTime = Date.now() - this.startTime;
      summary.tokensUsed = this.totalTokensUsed;
      summary.estimatedCost = this.totalCost;
      summary.averageConfidence =
        allQueries.reduce((sum, q) => sum + q.confidence, 0) / allQueries.length;

      this.aggregateQueryMetrics(allQueries, summary);

      return {
        success: true,
        queries: allQueries,
        summary
      };
    } catch (error) {
      LogError(`[SampleQueryGenerator] Failed to generate queries: ${(error as Error).message}`);
      return {
        success: false,
        queries: allQueries,
        summary,
        errorMessage: (error as Error).message
      };
    }
  }

  private async generateQueriesForSchema(
    schema: SchemaDefinition,
    existingQueries: SampleQuery[]
  ): Promise<SampleQuery[]> {
    const queries: SampleQuery[] = [];

    const importantTables = this.selectImportantTables(schema);

    for (const focusTable of importantTables) {
      // Check token budget (0 = unlimited)
      if (this.config.tokenBudget > 0 && this.totalTokensUsed >= this.config.tokenBudget) {
        LogStatus(`[SampleQueryGenerator] Token budget reached, stopping query generation`);
        break;
      }

      try {
        const tableQueries = await this.generateQueriesForTable(
          schema,
          focusTable,
          existingQueries.concat(queries)
        );
        queries.push(...tableQueries);

        // Write incrementally after each table if output path is provided
        if ((this.outputFilePath || this.summaryFilePath) && tableQueries.length > 0) {
          await this.writeIncrementalOutput(existingQueries.concat(queries));
        }
      } catch (error) {
        LogError(
          `[SampleQueryGenerator] Failed to generate queries for ${focusTable.name}: ${(error as Error).message}`
        );
      }
    }

    return queries;
  }

  private selectImportantTables(schema: SchemaDefinition): TableDefinition[] {
    const tablesWithData = schema.tables
      .filter(t => t.rowCount > 0)
      .sort((a, b) => {
        const scoreA = this.calculateTableImportance(a);
        const scoreB = this.calculateTableImportance(b);
        return scoreB - scoreA;
      });

    // Determine how many tables to select
    const maxTables = this.config.maxTables ?? 10;  // Default to 10 if not specified

    // If maxTables is 0, return all tables with data
    if (maxTables === 0) {
      return tablesWithData;
    }

    // Otherwise, return the top N tables
    return tablesWithData.slice(0, Math.min(maxTables, tablesWithData.length));
  }

  private calculateTableImportance(table: TableDefinition): number {
    let score = 0;

    score += Math.log10(table.rowCount + 1) * 10;
    score += table.dependsOn.length * 5;
    score += table.dependents.length * 5;

    if (table.description) score += 20;

    const hasDateColumn = table.columns.some(c =>
      c.dataType.toLowerCase().includes('date') ||
      c.dataType.toLowerCase().includes('time')
    );
    if (hasDateColumn) score += 15;

    return score;
  }

  /**
   * Generate queries using two-prompt approach:
   * 1. Plan what queries to create (lightweight)
   * 2. Generate SQL for each query individually (detailed)
   */
  private async generateQueriesForTable(
    schema: SchemaDefinition,
    focusTable: TableDefinition,
    existingQueries: SampleQuery[]
  ): Promise<SampleQuery[]> {
    LogStatus(`[SampleQueryGenerator] === Generating queries for ${focusTable.name} ===`);

    // PHASE 1: Plan queries (what to create)
    const queryPlans = await this.planQueries(schema, focusTable, existingQueries);

    if (queryPlans.length === 0) {
      LogStatus(`[SampleQueryGenerator] No query plans generated for ${focusTable.name}`);
      return [];
    }

    LogStatus(`[SampleQueryGenerator] Generated ${queryPlans.length} query plans for ${focusTable.name}`);

    // PHASE 2: Generate SQL for each query
    const queries: SampleQuery[] = [];
    for (let i = 0; i < queryPlans.length; i++) {
      const plan = queryPlans[i];
      LogStatus(`[SampleQueryGenerator] Generating SQL for query ${i + 1}/${queryPlans.length}: ${plan.name}`);

      try {
        const querySQL = await this.generateQuerySQL(schema, focusTable, plan, queryPlans);

        // Combine plan + SQL into complete SampleQuery
        const completeQuery: SampleQuery = {
          ...plan,
          ...querySQL,
          schema: schema.name,
          sampleResultRows: [],
          validated: false,
          generatedAt: new Date().toISOString(),
          modelUsed: this.model
        };

        // Validate the query if enabled (with fix attempts)
        if (this.config.maxExecutionTime > 0) {
          await this.validateAndFixQuery(completeQuery, schema, focusTable, plan);
        }

        queries.push(completeQuery);
        LogStatus(`[SampleQueryGenerator] ✓ Query ${i + 1} complete: ${plan.name}`);
      } catch (error) {
        LogError(`[SampleQueryGenerator] Failed to generate SQL for query: ${plan.name}`, null, (error as Error).message);
        // Continue with other queries even if one fails
      }
    }

    LogStatus(`[SampleQueryGenerator] === Completed ${queries.length}/${queryPlans.length} queries for ${focusTable.name} ===`);
    return queries;
  }

  /**
   * PHASE 1: Plan what queries to create (lightweight, all at once)
   */
  private async planQueries(
    schema: SchemaDefinition,
    focusTable: TableDefinition,
    existingQueries: SampleQuery[]
  ): Promise<QueryPlan[]> {
    const relatedTables = this.getRelatedTables(schema, focusTable);
    const allTablesContext = [
      this.convertToTableContext(focusTable),
      ...relatedTables.map(t => this.convertToTableContext(t))
    ];

    const promptContext = {
      schemaName: schema.name,
      databaseType: this.getDatabaseType(),
      tables: allTablesContext,
      focusTable: focusTable.name,
      queriesPerTable: this.config.queriesPerTable,
      seedContext: this.getSeedContextDescription(schema),
      existingQueries: existingQueries.map(q => ({
        name: q.name,
        queryType: q.queryType,
        queryPattern: q.queryPattern
      }))
    };

    LogStatus(`[SampleQueryGenerator] Phase 1: Planning queries for ${focusTable.name}`);

    // Use configured maxTokens for planning phase
    // Planning is lightweight, so we can use a smaller portion if needed
    const planningMaxTokens = Math.min(this.maxTokens, 8000);

    const result = await this.promptEngine.executePrompt<{ queries: QueryPlan[] }>(
      'query-planning',
      promptContext,
      {
        responseFormat: 'JSON',
        maxTokens: planningMaxTokens
      }
    );

    this.totalTokensUsed += result.tokensUsed;
    this.totalCost += result.cost || 0;

    if (!result.success || !result.result) {
      throw new Error(`Query planning failed: ${result.errorMessage || 'Unknown error'}`);
    }

    return result.result.queries || [];
  }

  /**
   * PHASE 2: Generate SQL for a single query (detailed)
   */
  private async generateQuerySQL(
    schema: SchemaDefinition,
    focusTable: TableDefinition,
    queryPlan: QueryPlan,
    allPlans: QueryPlan[]
  ): Promise<QuerySQL> {
    const relatedTables = this.getRelatedTables(schema, focusTable);
    const focusTableContext = this.convertToTableContext(focusTable);
    const relatedTablesContext = relatedTables.map(t => this.convertToTableContext(t));

    // Find related query plans for alignment context
    const relatedQueryPlans = allPlans.filter(p =>
      queryPlan.relatedQueryIds.includes(p.id) || p.relatedQueryIds.includes(queryPlan.id)
    );

    const promptContext = {
      schemaName: schema.name,
      databaseType: this.getDatabaseType(),
      focusTable: focusTable.name,
      tableInfo: focusTableContext,
      relatedTables: relatedTablesContext,
      queryPlan,
      relatedQueryPlans
    };

    // Use configured maxTokens for SQL generation phase
    // This is the detailed phase where we need full output capacity
    const result = await this.promptEngine.executePrompt<QuerySQL>(
      'single-query-generation',
      promptContext,
      {
        responseFormat: 'JSON',
        maxTokens: this.maxTokens
      }
    );

    this.totalTokensUsed += result.tokensUsed;
    this.totalCost += result.cost || 0;

    if (!result.success || !result.result) {
      throw new Error(`SQL generation failed: ${result.errorMessage || 'Unknown error'}`);
    }

    return result.result;
  }

  private buildQueryGenerationContext(
    schema: SchemaDefinition,
    focusTable: TableDefinition
  ): QueryGenerationContext {
    const relatedTables = this.getRelatedTables(schema, focusTable);

    return {
      schema: schema.name,
      tables: [focusTable, ...relatedTables].map(t => this.convertToTableContext(t)),
      existingQueries: []
    };
  }

  private getRelatedTables(schema: SchemaDefinition, focusTable: TableDefinition): TableDefinition[] {
    const relatedTableNames = new Set<string>();

    focusTable.dependsOn.forEach(fk => {
      if (fk.schema === schema.name) {
        relatedTableNames.add(fk.table);
      }
    });

    focusTable.dependents.forEach(fk => {
      if (fk.schema === schema.name) {
        relatedTableNames.add(fk.table);
      }
    });

    return schema.tables.filter(t => relatedTableNames.has(t.name));
  }

  private convertToTableContext(table: TableDefinition): TableContext {
    return {
      name: table.name,
      description: table.description,
      rowCount: table.rowCount,
      columns: table.columns.map(c => this.convertToColumnContext(c)),
      primaryKeys: table.columns.filter(c => c.isPrimaryKey).map(c => c.name),
      foreignKeys: table.columns
        .filter(c => c.isForeignKey && c.foreignKeyReferences)
        .map(c => ({
          column: c.name,
          referencesSchema: c.foreignKeyReferences!.schema,
          referencesTable: c.foreignKeyReferences!.table,
          referencesColumn: c.foreignKeyReferences!.column
        })),
      dependents: table.dependents.map(d => d.table)
    };
  }

  private convertToColumnContext(column: {
    name: string;
    dataType: string;
    description?: string;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    isNullable: boolean;
    possibleValues?: unknown[];
    statistics?: {
      distinctCount?: number;
      min?: unknown;
      max?: unknown;
      avg?: number;
    };
    foreignKeyReferences?: { schema: string; table: string; column: string; referencedColumn: string };
  }): ColumnContext {
    return {
      name: column.name,
      dataType: column.dataType,
      description: column.description,
      isPrimaryKey: column.isPrimaryKey,
      isForeignKey: column.isForeignKey,
      isNullable: column.isNullable,
      possibleValues: column.possibleValues,
      statistics: column.statistics
    };
  }

  private getDatabaseType(): string {
    return 'SQL Server';
  }

  private getSeedContextDescription(schema: SchemaDefinition): string | undefined {
    if (schema.inferredPurpose) {
      return schema.inferredPurpose;
    }
    if (schema.description) {
      return schema.description;
    }
    return undefined;
  }

  private parseQueryGenerationResponse(text: string): QueryGenerationPromptResponse {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      LogError(`[SampleQueryGenerator] Failed to parse query generation response: ${(error as Error).message}`);
      return { queries: [] };
    }
  }

  private async processGeneratedQueries(
    response: QueryGenerationPromptResponse,
    schemaName: string,
    focusTable: string,
    modelUsed: string,
    tokensUsed: number
  ): Promise<SampleQuery[]> {
    const queries: SampleQuery[] = [];

    for (const rawQuery of response.queries) {
      const query: SampleQuery = {
        id: rawQuery.id || uuidv4(),
        name: rawQuery.name,
        description: rawQuery.description,
        businessPurpose: rawQuery.businessPurpose,
        schema: schemaName,
        primaryEntities: rawQuery.primaryEntities,
        relatedEntities: rawQuery.relatedEntities,
        queryType: rawQuery.queryType,
        queryPattern: rawQuery.queryPattern,
        complexity: rawQuery.complexity,
        sqlQuery: rawQuery.sqlQuery,
        parameters: rawQuery.parameters,
        sampleResultColumns: rawQuery.sampleResultColumns,
        sampleResultRows: [],
        filteringRules: rawQuery.filteringRules || [],
        aggregationRules: rawQuery.aggregationRules || [],
        joinRules: rawQuery.joinRules || [],
        relatedQueries: rawQuery.relatedQueries,
        alignmentNotes: rawQuery.alignmentNotes,
        validated: false,
        generatedAt: new Date().toISOString(),
        confidence: rawQuery.confidence,
        modelUsed: modelUsed,
        reasoning: rawQuery.reasoning
      };

      if (this.config.maxExecutionTime > 0) {
        await this.validateQuery(query);
      }

      queries.push(query);
    }

    return queries;
  }

  /**
   * Validate a query and attempt to fix it if validation fails
   */
  private async validateAndFixQuery(
    query: SampleQuery,
    schema: SchemaDefinition,
    focusTable: TableDefinition,
    queryPlan: QueryPlan
  ): Promise<void> {
    const enableFix = this.config.enableQueryFix !== false; // Default to true
    const maxAttempts = this.config.maxFixAttempts ?? 3;

    // Initialize fix tracking
    query.fixAttempts = 0;
    query.fixHistory = [];

    // Initial validation
    const validationResult = await this.executeValidation(query);

    if (validationResult.success) {
      return; // Query is valid, no fix needed
    }

    // If fix is disabled or error occurred, just record the failure
    if (!enableFix || maxAttempts <= 0) {
      query.validated = false;
      query.validationError = validationResult.errorMessage;
      LogError(`[SampleQueryGenerator] Query validation failed: ${query.name} - ${query.validationError}`);
      return;
    }

    // Attempt to fix the query
    let currentSQL = query.sqlQuery;
    let currentError = validationResult.errorMessage;
    const previousAttempts: Array<{ sql: string; error: string }> = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      LogStatus(`[SampleQueryGenerator] Attempting to fix query: ${query.name} (attempt ${attempt}/${maxAttempts})`);

      // Record the failed attempt
      previousAttempts.push({ sql: currentSQL, error: currentError });
      query.fixHistory = [...previousAttempts];
      query.fixAttempts = attempt;

      try {
        // Get fixed SQL from LLM
        const fixedSQL = await this.fixQuery({
          schema,
          focusTable,
          queryPlan,
          currentSQL,
          errorMessage: currentError,
          attemptNumber: attempt,
          maxAttempts,
          previousAttempts
        });

        // Update query with fixed SQL
        query.sqlQuery = fixedSQL.sqlQuery;
        query.parameters = fixedSQL.parameters;
        query.sampleResultColumns = fixedSQL.sampleResultColumns;
        query.filteringRules = fixedSQL.filteringRules;
        query.aggregationRules = fixedSQL.aggregationRules;
        query.joinRules = fixedSQL.joinRules;
        if (fixedSQL.alignmentNotes) {
          query.alignmentNotes = fixedSQL.alignmentNotes;
        }

        // Validate the fixed query
        const fixValidation = await this.executeValidation(query);

        if (fixValidation.success) {
          LogStatus(`[SampleQueryGenerator] ✓ Query fixed successfully on attempt ${attempt}: ${query.name}`);
          return;
        }

        // Update for next attempt
        currentSQL = query.sqlQuery;
        currentError = fixValidation.errorMessage;

      } catch (error) {
        LogError(`[SampleQueryGenerator] Fix attempt ${attempt} failed for ${query.name}: ${(error as Error).message}`);
        currentError = (error as Error).message;
      }
    }

    // All fix attempts failed
    query.validated = false;
    query.validationError = currentError;
    LogError(`[SampleQueryGenerator] Query could not be fixed after ${maxAttempts} attempts: ${query.name}`);
  }

  /**
   * Execute validation on a query and return result
   */
  private async executeValidation(query: SampleQuery): Promise<{ success: boolean; errorMessage: string }> {
    try {
      const validationQuery = this.prepareValidationQuery(query.sqlQuery);

      const startTime = Date.now();
      const result = await this.driver.executeQuery(validationQuery);
      const executionTime = Date.now() - startTime;

      if (result.success && result.data) {
        query.validated = true;
        query.executionTime = executionTime;
        query.sampleResultRows = result.data.slice(0, 5);

        LogStatus(
          `[SampleQueryGenerator] Query validated: ${query.name} (${executionTime}ms, ${result.data.length} rows)`
        );
        return { success: true, errorMessage: '' };
      } else {
        const errorMessage = result.errorMessage || 'Query returned no results';
        return { success: false, errorMessage };
      }
    } catch (error) {
      return { success: false, errorMessage: (error as Error).message };
    }
  }

  /**
   * Use LLM to fix a failed query
   */
  private async fixQuery(context: QueryFixContext): Promise<QuerySQL> {
    const relatedTables = this.getRelatedTables(context.schema, context.focusTable);
    const focusTableContext = this.convertToTableContext(context.focusTable);
    const relatedTablesContext = relatedTables.map(t => this.convertToTableContext(t));

    const promptContext = {
      schemaName: context.schema.name,
      databaseType: this.getDatabaseType(),
      focusTable: context.focusTable.name,
      tableInfo: focusTableContext,
      relatedTables: relatedTablesContext,
      queryPlan: context.queryPlan,
      currentSQL: context.currentSQL,
      errorMessage: context.errorMessage,
      attemptNumber: context.attemptNumber,
      maxAttempts: context.maxAttempts,
      previousAttempts: context.previousAttempts
    };

    const result = await this.promptEngine.executePrompt<QueryFixResponse>(
      'query-fix',
      promptContext,
      {
        responseFormat: 'JSON',
        maxTokens: this.maxTokens
      }
    );

    this.totalTokensUsed += result.tokensUsed;
    this.totalCost += result.cost || 0;

    if (!result.success || !result.result) {
      throw new Error(`Query fix failed: ${result.errorMessage || 'Unknown error'}`);
    }

    if (result.result.fixExplanation) {
      LogStatus(`[SampleQueryGenerator] Fix explanation: ${result.result.fixExplanation}`);
    }

    return result.result;
  }

  private async validateQuery(query: SampleQuery): Promise<void> {
    const validationResult = await this.executeValidation(query);
    if (!validationResult.success) {
      query.validated = false;
      query.validationError = validationResult.errorMessage;
      LogError(`[SampleQueryGenerator] Query validation failed: ${query.name} - ${query.validationError}`);
    }
  }

  private prepareValidationQuery(sqlQuery: string): string {
    let validationQuery = sqlQuery;

    const parameterPattern = /@(\w+)/g;
    const matches = [...sqlQuery.matchAll(parameterPattern)];

    for (const match of matches) {
      const paramName = match[1];
      const sampleValue = this.getSampleParameterValue(paramName);
      validationQuery = validationQuery.replace(match[0], sampleValue);
    }

    if (!validationQuery.toLowerCase().includes('top ') &&
        !validationQuery.toLowerCase().includes('limit ')) {
      const selectMatch = validationQuery.match(/SELECT\s+/i);
      if (selectMatch) {
        const insertPosition = selectMatch.index! + selectMatch[0].length;
        validationQuery =
          validationQuery.slice(0, insertPosition) +
          'TOP 10 ' +
          validationQuery.slice(insertPosition);
      }
    }

    return validationQuery;
  }

  private getSampleParameterValue(paramName: string): string {
    const nameLower = paramName.toLowerCase();

    if (nameLower.includes('date') || nameLower.includes('start') || nameLower.includes('end')) {
      if (nameLower.includes('start')) {
        return "'2024-01-01'";
      } else if (nameLower.includes('end')) {
        return "'2024-12-31'";
      }
      return "'2024-06-01'";
    }

    if (nameLower.includes('status')) {
      return "'Active'";
    }

    if (nameLower.includes('id')) {
      return "1";
    }

    if (nameLower.includes('name')) {
      return "'Sample'";
    }

    return "'TestValue'";
  }

  private aggregateQueryMetrics(
    queries: SampleQuery[],
    summary: SampleQueryGenerationSummary
  ): void {
    for (const query of queries) {
      summary.queriesByType[query.queryType] =
        (summary.queriesByType[query.queryType] || 0) + 1;

      summary.queriesByPattern[query.queryPattern] =
        (summary.queriesByPattern[query.queryPattern] || 0) + 1;

      summary.queriesByComplexity[query.complexity] =
        (summary.queriesByComplexity[query.complexity] || 0) + 1;
    }
  }

  /**
   * Write queries and summary to files incrementally after each table completes
   * This allows users to cancel the run and still see completed queries and progress
   */
  private async writeIncrementalOutput(queries: SampleQuery[]): Promise<void> {
    try {
      // Write queries if path is provided
      if (this.outputFilePath) {
        await fs.writeFile(
          this.outputFilePath,
          JSON.stringify(queries, null, 2),
          'utf-8'
        );
        LogStatus(`[SampleQueryGenerator] Wrote ${queries.length} queries to ${this.outputFilePath}`);
      }

      // Calculate and write summary if path is provided
      if (this.summaryFilePath) {
        const summary = this.calculateSummary(queries);
        await fs.writeFile(
          this.summaryFilePath,
          JSON.stringify(summary, null, 2),
          'utf-8'
        );
        LogStatus(`[SampleQueryGenerator] Updated summary: ${summary.totalQueriesGenerated} queries, ${summary.queriesValidated} validated`);
      }
    } catch (error) {
      LogError(`[SampleQueryGenerator] Failed to write incremental output: ${(error as Error).message}`);
    }
  }

  /**
   * Calculate summary statistics from current set of queries
   */
  private calculateSummary(queries: SampleQuery[]): SampleQueryGenerationSummary {
    const summary: SampleQueryGenerationSummary = {
      totalQueriesGenerated: queries.length,
      queriesValidated: queries.filter(q => q.validated).length,
      queriesFailed: queries.filter(q => !q.validated).length,
      totalExecutionTime: Date.now() - this.startTime,
      tokensUsed: this.totalTokensUsed,
      estimatedCost: this.totalCost,
      averageConfidence: queries.length > 0
        ? queries.reduce((sum, q) => sum + q.confidence, 0) / queries.length
        : 0,
      queriesByType: {} as Record<QueryType, number>,
      queriesByPattern: {} as Record<QueryPattern, number>,
      queriesByComplexity: {} as Record<QueryComplexity, number>
    };

    this.aggregateQueryMetrics(queries, summary);
    return summary;
  }
}
