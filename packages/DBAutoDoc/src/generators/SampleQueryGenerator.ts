/**
 * Sample Query Generator
 * Generates reference SQL queries for AI agents using LLM-powered analysis
 */

import { v4 as uuidv4 } from 'uuid';
import { LogError, LogStatus } from '@memberjunction/core';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
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
import { SchemaDefinition, TableDefinition, DatabaseDocumentation } from '../types/state.js';
import { StateManager } from '../state/StateManager.js';

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

interface QueryRefinementResponse {
  decision: 'KEEP' | 'REFINE';
  analysis: string;
  issues: string[];
  refinedQuery?: QuerySQL;
  refinementExplanation?: string;
}

interface QueryRefinementContext {
  schema: SchemaDefinition;
  focusTable: TableDefinition;
  queryPlan: QueryPlan;
  currentSQL: string;
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
  sampleRows: Record<string, unknown>[];
  totalRows: number;
  refinementNumber: number;
  maxRefinements: number;
  previousRefinements: Array<{ sql: string; feedback: string }>;
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
    private stateManager: StateManager,  // StateManager for incremental writes
    private effortLevel?: number,
    private maxTokens: number = 16000  // Default from typical AI config
  ) {}

  public async generateQueries(
    schemas: SchemaDefinition[]
  ): Promise<SampleQueryGenerationResult> {
    this.startTime = Date.now();
    this.totalTokensUsed = 0;
    this.totalCost = 0;

    const state = await this.stateManager.load();
    if (!state) {
      throw new Error('Failed to load state from StateManager');
    }

    const startedAt = new Date().toISOString();

    // Initialize deliverable and phase tracking
    if (!state.sampleQueries) {
      state.sampleQueries = {
        generatedAt: startedAt,
        status: 'partial',
        queries: [],
        summary: {
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
        },
        modelUsed: this.model
      };
    } else {
      // Reset for a new run
      state.sampleQueries.generatedAt = startedAt;
      state.sampleQueries.status = 'partial';
      state.sampleQueries.queries = [];
      state.sampleQueries.modelUsed = this.model;
    }

    // Track phase metadata
    state.phases.queryGeneration = {
      startedAt,
      status: 'running',
      queriesGenerated: 0,
      tokensUsed: 0,
      estimatedCost: 0
    };

    try {
      for (const schema of schemas) {
        LogStatus(`[SampleQueryGenerator] Generating queries for schema: ${schema.name}`);

        const schemaQueries = await this.generateQueriesForSchema(schema, state.sampleQueries.queries);
        state.sampleQueries.queries.push(...schemaQueries);
      }

      // Update deliverable summary
      const allQueries = state.sampleQueries.queries;
      const summary: SampleQueryGenerationSummary = {
        totalQueriesGenerated: allQueries.length,
        queriesValidated: allQueries.filter(q => q.validated).length,
        queriesFailed: allQueries.filter(q => !q.validated).length,
        totalExecutionTime: Date.now() - this.startTime,
        tokensUsed: this.totalTokensUsed,
        estimatedCost: this.totalCost,
        averageConfidence: allQueries.length > 0
          ? allQueries.reduce((sum, q) => sum + q.confidence, 0) / allQueries.length
          : 0,
        queriesByType: {} as Record<QueryType, number>,
        queriesByPattern: {} as Record<QueryPattern, number>,
        queriesByComplexity: {} as Record<QueryComplexity, number>
      };

      this.aggregateQueryMetrics(allQueries, summary);

      // Mark deliverable as completed
      state.sampleQueries.summary = summary;
      state.sampleQueries.status = 'completed';

      // Mark phase as completed
      state.phases.queryGeneration.status = 'completed';
      state.phases.queryGeneration.completedAt = new Date().toISOString();
      state.phases.queryGeneration.queriesGenerated = allQueries.length;
      state.phases.queryGeneration.tokensUsed = this.totalTokensUsed;
      state.phases.queryGeneration.estimatedCost = this.totalCost;

      // Save final state
      await this.stateManager.save(state);

      return {
        success: true,
        queries: allQueries,
        summary
      };
    } catch (error) {
      LogError(`[SampleQueryGenerator] Failed to generate queries: ${(error as Error).message}`);

      // Mark deliverable and phase as failed
      const errorState = await this.stateManager.load();
      if (errorState) {
        if (errorState.sampleQueries) {
          errorState.sampleQueries.status = 'failed';
        }
        if (errorState.phases.queryGeneration) {
          errorState.phases.queryGeneration.status = 'failed';
          errorState.phases.queryGeneration.errorMessage = (error as Error).message;
          errorState.phases.queryGeneration.completedAt = new Date().toISOString();
        }
        await this.stateManager.save(errorState);
      }

      const queries = errorState?.sampleQueries?.queries || [];
      const summary = errorState?.sampleQueries?.summary || {
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

      return {
        success: false,
        queries,
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

        // Write incrementally after each table
        if (tableQueries.length > 0) {
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

        // Process the query through validation, fixing, and refinement
        if (this.config.maxExecutionTime > 0) {
          await this.processQueryGeneration(completeQuery, schema, focusTable, plan);
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
   * Main query processing loop: validate → fix → refine → repeat
   * Uses a do-while pattern where refinement loops back to validation
   */
  private async processQueryGeneration(
    query: SampleQuery,
    schema: SchemaDefinition,
    focusTable: TableDefinition,
    queryPlan: QueryPlan
  ): Promise<void> {
    const enableRefinement = this.config.enableQueryRefinement === true;
    const maxRefinements = this.config.maxRefinementAttempts ?? 1;

    // Initialize tracking
    query.fixAttempts = 0;
    query.fixHistory = [];
    query.refinementAttempts = 0;
    query.refinementHistory = [];
    query.wasRefined = false;

    let refinementsUsed = 0;
    let bestSuccessfulQuery: SampleQuery | null = null;
    const previousRefinements: Array<{ sql: string; feedback: string }> = [];

    // Main loop: validate/fix → refine → repeat
    do {
      // Step 1: Validate with fix attempts
      const validationSuccess = await this.validateWithFixAttempts(query, schema, focusTable, queryPlan);

      if (!validationSuccess) {
        // If we have a previous successful version, restore it
        if (bestSuccessfulQuery) {
          LogError(`[SampleQueryGenerator] Refined query failed validation, restoring previous version: ${query.name}`);
          this.restoreQueryState(query, bestSuccessfulQuery);
          return;
        }
        // No successful version exists - query generation failed entirely
        LogError(`[SampleQueryGenerator] Query generation failed for: ${query.name}`);
        return;
      }

      // Save this successful version
      bestSuccessfulQuery = this.copyQueryState(query);

      // Step 2: Check if we should attempt refinement
      if (!enableRefinement || refinementsUsed >= maxRefinements) {
        // No more refinements - we're done
        return;
      }

      // Step 3: Attempt refinement
      if (!query.sampleResultRows || query.sampleResultRows.length === 0) {
        LogStatus(`[SampleQueryGenerator] Skipping refinement for ${query.name} - no sample results`);
        return;
      }

      LogStatus(`[SampleQueryGenerator] Analyzing results for refinement: ${query.name} (attempt ${refinementsUsed + 1}/${maxRefinements})`);

      try {
        const refinementResult = await this.analyzeAndRefineQuery({
          schema,
          focusTable,
          queryPlan,
          currentSQL: query.sqlQuery,
          parameters: query.parameters,
          sampleResultColumns: query.sampleResultColumns,
          sampleRows: query.sampleResultRows,
          totalRows: query.sampleResultRows.length,
          refinementNumber: refinementsUsed + 1,
          maxRefinements,
          previousRefinements
        });

        refinementsUsed++;
        query.refinementAttempts = refinementsUsed;

        if (refinementResult.decision === 'KEEP') {
          LogStatus(`[SampleQueryGenerator] ✓ Query results look good, keeping: ${query.name}`);
          LogStatus(`[SampleQueryGenerator] Analysis: ${refinementResult.analysis}`);
          return;
        }

        // Decision is REFINE
        if (!refinementResult.refinedQuery) {
          LogError(`[SampleQueryGenerator] Refinement requested but no refined query provided for: ${query.name}`);
          return;
        }

        // Record the previous version
        previousRefinements.push({
          sql: query.sqlQuery,
          feedback: refinementResult.analysis
        });
        query.refinementHistory = [...previousRefinements];

        // Update query with refined SQL
        this.applyRefinedSQL(query, refinementResult.refinedQuery);
        query.wasRefined = true;

        LogStatus(`[SampleQueryGenerator] Refinement: ${refinementResult.refinementExplanation}`);

        // Loop back to validation with the refined query

      } catch (error) {
        LogError(`[SampleQueryGenerator] Refinement attempt ${refinementsUsed + 1} failed for ${query.name}: ${(error as Error).message}`);
        return;
      }

    } while (refinementsUsed < maxRefinements);
  }

  /**
   * Validate a query and attempt to fix it if validation fails
   * Returns true if validation ultimately succeeds, false otherwise
   */
  private async validateWithFixAttempts(
    query: SampleQuery,
    schema: SchemaDefinition,
    focusTable: TableDefinition,
    queryPlan: QueryPlan
  ): Promise<boolean> {
    const enableFix = this.config.enableQueryFix !== false;
    const maxAttempts = this.config.maxFixAttempts ?? 3;

    // Initial validation
    const validationResult = await this.executeValidation(query);

    if (validationResult.success) {
      return true;
    }

    // If fix is disabled, fail immediately
    if (!enableFix || maxAttempts <= 0) {
      query.validated = false;
      query.validationError = validationResult.errorMessage;
      LogError(`[SampleQueryGenerator] Query validation failed: ${query.name} - ${query.validationError}`);
      return false;
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
        this.applyRefinedSQL(query, fixedSQL);

        // Validate the fixed query
        const fixValidation = await this.executeValidation(query);

        if (fixValidation.success) {
          LogStatus(`[SampleQueryGenerator] ✓ Query fixed successfully on attempt ${attempt}: ${query.name}`);
          return true;
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
    return false;
  }

  /**
   * Apply refined/fixed SQL to a query object
   */
  private applyRefinedSQL(query: SampleQuery, refinedSQL: QuerySQL): void {
    query.sqlQuery = refinedSQL.sqlQuery;
    query.parameters = refinedSQL.parameters;
    query.sampleResultColumns = refinedSQL.sampleResultColumns;
    query.filteringRules = refinedSQL.filteringRules;
    query.aggregationRules = refinedSQL.aggregationRules;
    query.joinRules = refinedSQL.joinRules;
    if (refinedSQL.alignmentNotes) {
      query.alignmentNotes = refinedSQL.alignmentNotes;
    }
  }

  /**
   * Copy query state for backup purposes
   */
  private copyQueryState(query: SampleQuery): SampleQuery {
    return {
      ...query,
      parameters: [...query.parameters],
      sampleResultColumns: [...query.sampleResultColumns],
      sampleResultRows: [...query.sampleResultRows],
      filteringRules: [...query.filteringRules],
      aggregationRules: [...query.aggregationRules],
      joinRules: [...query.joinRules]
    };
  }

  /**
   * Restore query state from a backup
   */
  private restoreQueryState(query: SampleQuery, backup: SampleQuery): void {
    query.sqlQuery = backup.sqlQuery;
    query.parameters = backup.parameters;
    query.sampleResultColumns = backup.sampleResultColumns;
    query.sampleResultRows = backup.sampleResultRows;
    query.filteringRules = backup.filteringRules;
    query.aggregationRules = backup.aggregationRules;
    query.joinRules = backup.joinRules;
    query.alignmentNotes = backup.alignmentNotes;
    query.validated = backup.validated;
    query.executionTime = backup.executionTime;
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

  /**
   * Use LLM to analyze query results and suggest refinements
   */
  private async analyzeAndRefineQuery(context: QueryRefinementContext): Promise<QueryRefinementResponse> {
    const relatedTables = this.getRelatedTables(context.schema, context.focusTable);
    const focusTableContext = this.convertToTableContext(context.focusTable);
    const relatedTablesContext = relatedTables.map(t => this.convertToTableContext(t));

    // Get column names from sample results
    const resultColumnNames = context.sampleRows.length > 0
      ? Object.keys(context.sampleRows[0])
      : context.sampleResultColumns.map(c => c.name);

    const promptContext = {
      schemaName: context.schema.name,
      databaseType: this.getDatabaseType(),
      focusTable: context.focusTable.name,
      tableInfo: focusTableContext,
      relatedTables: relatedTablesContext,
      queryPlan: context.queryPlan,
      currentSQL: context.currentSQL,
      parameters: context.parameters,
      sampleResultColumns: context.sampleResultColumns,
      sampleRows: context.sampleRows,
      totalRows: context.totalRows,
      resultColumnNames,
      refinementNumber: context.refinementNumber,
      maxRefinements: context.maxRefinements,
      previousRefinements: context.previousRefinements
    };

    const result = await this.promptEngine.executePrompt<QueryRefinementResponse>(
      'query-refinement',
      promptContext,
      {
        responseFormat: 'JSON',
        maxTokens: this.maxTokens
      }
    );

    this.totalTokensUsed += result.tokensUsed;
    this.totalCost += result.cost || 0;

    if (!result.success || !result.result) {
      throw new Error(`Query refinement failed: ${result.errorMessage || 'Unknown error'}`);
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
   * Write queries and summary to state incrementally after each table completes
   * This allows users to cancel the run and still see completed queries and progress
   */
  private async writeIncrementalOutput(queries: SampleQuery[]): Promise<void> {
    try {
      const state = await this.stateManager.load();

      if (!state || !state.sampleQueries) {
        return; // Should not happen, but safeguard
      }

      // Update deliverable queries
      state.sampleQueries.queries = queries;

      // Calculate and update summary
      const summary = this.calculateSummary(queries);
      state.sampleQueries.summary = summary;

      // Update phase tracking
      if (state.phases.queryGeneration) {
        state.phases.queryGeneration.queriesGenerated = queries.length;
        state.phases.queryGeneration.tokensUsed = this.totalTokensUsed;
        state.phases.queryGeneration.estimatedCost = this.totalCost;
      }

      // Save state
      await this.stateManager.save(state);

      LogStatus(`[SampleQueryGenerator] Updated state: ${summary.totalQueriesGenerated} queries, ${summary.queriesValidated} validated`);
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
