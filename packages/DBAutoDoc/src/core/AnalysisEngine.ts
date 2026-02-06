/**
 * Main analysis orchestrator
 * Coordinates the entire documentation generation workflow
 */

import { DatabaseDocumentation, AnalysisRun, SchemaDefinition, TableDefinition, ColumnDefinition } from '../types/state.js';
import { TableNode, BackpropagationTrigger, TableAnalysisContext } from '../types/analysis.js';
import {
  TableAnalysisPromptResult,
  SchemaSanityCheckPromptResult,
  CrossSchemaSanityCheckPromptResult,
  SemanticComparisonPromptResult,
  DependencyLevelSanityCheckResult,
  SchemaLevelSanityCheckResult,
  CrossSchemaSanityCheckResult
} from '../types/prompts.js';
import { DBAutoDocConfig } from '../types/config.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { StateManager } from '../state/StateManager.js';
import { IterationTracker } from '../state/IterationTracker.js';
import { BackpropagationEngine } from './BackpropagationEngine.js';
import { ConvergenceDetector } from './ConvergenceDetector.js';
import { GuardrailsManager } from './GuardrailsManager.js';

export class AnalysisEngine {
  private backpropagationEngine: BackpropagationEngine;
  private convergenceDetector: ConvergenceDetector;
  private guardrailsManager: GuardrailsManager;
  private startTime: number = 0;
  private currentRun?: AnalysisRun;

  constructor(
    private config: DBAutoDocConfig,
    private promptEngine: PromptEngine,
    private stateManager: StateManager,
    private iterationTracker: IterationTracker
  ) {
    this.backpropagationEngine = new BackpropagationEngine(
      promptEngine,
      stateManager,
      iterationTracker,
      config.analysis.backpropagation.maxDepth
    );

    this.convergenceDetector = new ConvergenceDetector(
      config.analysis.convergence,
      stateManager,
      iterationTracker
    );

    this.guardrailsManager = new GuardrailsManager(config.analysis.guardrails);

    // Set up guardrail checking in PromptEngine
    this.promptEngine.setGuardrailCheck(() => {
      if (!this.currentRun) {
        return { canContinue: true };
      }
      const result = this.guardrailsManager.checkGuardrails(this.currentRun);
      this.guardrailsManager.recordEnforcement(this.currentRun, result);
      return result;
    });
  }

  /**
   * Initialize timing for guardrails and set current run
   */
  public startAnalysis(run: AnalysisRun): void {
    this.startTime = Date.now();
    this.currentRun = run;
    this.guardrailsManager.startPhase('analysis');
  }

  /**
   * Process a single dependency level
   */
  public async processLevel(
    state: DatabaseDocumentation,
    run: AnalysisRun,
    level: number,
    tables: TableNode[]
  ): Promise<BackpropagationTrigger[]> {
    const triggers: BackpropagationTrigger[] = [];

    for (const tableNode of tables) {
      const result = await this.analyzeTable(state, run, tableNode, level);

      // Check if guardrail was exceeded during this table's analysis
      if (result.guardrailExceeded) {
        break; // Stop processing this level
      }

      if (result.triggers) {
        triggers.push(...result.triggers);
      }
    }

    run.levelsProcessed = Math.max(run.levelsProcessed, level + 1);

    return triggers;
  }

  /**
   * Analyze a single table
   */
  private async analyzeTable(
    state: DatabaseDocumentation,
    run: AnalysisRun,
    tableNode: TableNode,
    level: number
  ): Promise<{ triggers?: BackpropagationTrigger[]; guardrailExceeded?: boolean }> {
    const table = tableNode.tableDefinition;
    if (!table) {
      return {};
    }

    try {
      // Build analysis context
      const context = this.buildTableContext(state, tableNode);

      // Execute analysis prompt
      const result = await this.promptEngine.executePrompt<TableAnalysisPromptResult>(
        'table-analysis',
        context,
        {
          responseFormat: 'JSON',
          temperature: this.config.ai.temperature
        }
      );

      // Check if guardrail was exceeded
      if (result.guardrailExceeded) {
        this.iterationTracker.completeRun(run, false, result.errorMessage || 'Guardrail exceeded');
        return { guardrailExceeded: true };
      }

      if (!result.success || !result.result) {
        this.iterationTracker.addError(
          run,
          `Failed to analyze ${tableNode.schema}.${tableNode.table}: ${result.errorMessage}`
        );

        this.iterationTracker.addLogEntryWithPrompt(
          run,
          {
            level,
            schema: tableNode.schema,
            table: tableNode.table,
            action: 'analyze',
            result: 'error',
            message: result.errorMessage
          },
          result.promptInput,
          result.promptOutput
        );

        return {};
      }

      // Track tokens
      this.iterationTracker.addTokenUsage(run, result.tokensUsed, result.cost);

      // Use semantic comparison to check if description materially changed
      const previousDescription = table.description;
      const comparisonResult = await this.compareDescriptions(
        run,
        table,
        result.result,
        tableNode.schema,
        tableNode.table
      );
      const descriptionChanged = comparisonResult.tableMateriallyChanged;

      // Update table description
      this.stateManager.updateTableDescription(
        table,
        result.result.tableDescription,
        result.result.reasoning,
        result.result.confidence,
        run.modelUsed,
        previousDescription ? 'refinement' : 'initial'
      );

      // Update column descriptions
      for (const colDesc of result.result.columnDescriptions || []) {
        const column = table.columns.find(c => c.name === colDesc.columnName);
        if (column) {
          this.stateManager.updateColumnDescription(
            column,
            colDesc.description,
            colDesc.reasoning,
            run.modelUsed
          );
        }
      }

      // Process structured FK insights from LLM and feed back to discovery phase
      if (state.phases.keyDetection && result.result.foreignKeys) {
        this.processFKInsightsFromLLM(
          state,
          tableNode.schema,
          tableNode.table,
          result.result.foreignKeys
        );
      }

      // Update inferred business domain
      if (result.result.inferredBusinessDomain) {
        // Could store this in table metadata if needed
      }

      // Log result with prompt I/O and semantic comparison details
      this.iterationTracker.addLogEntryWithPrompt(
        run,
        {
          level,
          schema: tableNode.schema,
          table: tableNode.table,
          action: 'analyze',
          result: descriptionChanged ? 'changed' : 'unchanged',
          message: `Confidence: ${result.result.confidence.toFixed(2)}`,
          tokensUsed: result.tokensUsed,
          semanticComparison: comparisonResult
        },
        result.promptInput,
        result.promptOutput
      );

      // Detect potential insights for parent tables
      const triggers = this.backpropagationEngine.detectParentInsights(
        table,
        result.result,
        tableNode.schema,
        tableNode.table
      );

      return { triggers };

    } catch (error) {
      this.iterationTracker.addError(
        run,
        `Exception analyzing ${tableNode.schema}.${tableNode.table}: ${(error as Error).message}`
      );

      this.iterationTracker.addLogEntry(run, {
        level,
        schema: tableNode.schema,
        table: tableNode.table,
        action: 'analyze',
        result: 'error',
        message: (error as Error).message
      });

      return {};
    }
  }

  /**
   * Build context for table analysis
   */
  private buildTableContext(
    state: DatabaseDocumentation,
    tableNode: TableNode
  ): TableAnalysisContext {
    const table = tableNode.tableDefinition!;

    // Get parent table descriptions (for context)
    const parentDescriptions = table.dependsOn
      .map(dep => {
        const parentTable = this.stateManager.findTable(state, dep.schema, dep.table);
        if (parentTable && parentTable.description) {
          return {
            schema: dep.schema,
            table: dep.table,
            description: parentTable.description
          };
        }
        return null;
      })
      .filter(p => p !== null);

    // Build list of all tables in the database for FK reference validation
    const allTables: Array<{ schema: string; name: string }> = [];
    for (const schema of state.schemas) {
      for (const tbl of schema.tables) {
        allTables.push({ schema: schema.name, name: tbl.name });
      }
    }

    return {
      schema: tableNode.schema,
      table: tableNode.table,
      rowCount: table.rowCount,
      columns: table.columns.map(col => ({
        name: col.name,
        dataType: col.dataType,
        isNullable: col.isNullable,
        isPrimaryKey: col.isPrimaryKey,
        isForeignKey: col.isForeignKey,
        foreignKeyReferences: col.foreignKeyReferences,
        checkConstraint: col.checkConstraint,
        defaultValue: col.defaultValue,
        possibleValues: col.possibleValues,
        statistics: col.statistics
      })),
      dependsOn: table.dependsOn,
      dependents: table.dependents,
      sampleData: [], // Could add sample rows here if needed
      parentDescriptions: parentDescriptions as any,
      userNotes: table.userNotes,
      seedContext: state.seedContext,
      allTables
    };
  }

  /**
   * Compare descriptions using LLM to determine material changes
   */
  private async compareDescriptions(
    run: AnalysisRun,
    table: TableDefinition,
    newResult: TableAnalysisPromptResult,
    schemaName: string,
    tableName: string
  ): Promise<SemanticComparisonPromptResult> {
    // Get previous iteration
    const previousIteration = table.descriptionIterations.length > 0
      ? table.descriptionIterations[table.descriptionIterations.length - 1]
      : null;

    // If no previous iteration, it's initial generation - don't waste tokens on comparison
    // Return minimal result with no column changes (they'll all be logged as "initial" anyway)
    if (!previousIteration) {
      return {
        tableMateriallyChanged: true,
        tableChangeReasoning: 'Initial generation (skipped semantic comparison)',
        columnChanges: [] // Don't log individual column changes for initial generation
      };
    }

    // Build previous column descriptions map
    const previousColumns = table.columns.map(col => ({
      columnName: col.name,
      description: col.description || ''
    }));

    // Build current column descriptions
    const currentColumns = newResult.columnDescriptions.map(col => ({
      columnName: col.columnName,
      description: col.description
    }));

    // Call semantic comparison prompt
    const result = await this.promptEngine.executePrompt<SemanticComparisonPromptResult>(
      'semantic-comparison',
      {
        schemaName,
        tableName,
        previousIteration: table.descriptionIterations.length,
        currentIteration: table.descriptionIterations.length + 1,
        previousTableDescription: previousIteration.description,
        previousColumns,
        currentTableDescription: newResult.tableDescription,
        currentColumns
      },
      {
        responseFormat: 'JSON'
      }
    );

    if (!result.success || !result.result) {
      // If comparison fails, assume changed to be safe
      return {
        tableMateriallyChanged: true,
        tableChangeReasoning: 'Comparison failed - assuming changed for safety',
        columnChanges: newResult.columnDescriptions.map(col => ({
          columnName: col.columnName,
          materiallyChanged: true,
          changeReasoning: 'Comparison failed'
        }))
      };
    }

    // Track tokens for comparison
    this.iterationTracker.addTokenUsage(run, result.tokensUsed, result.cost);

    return result.result;
  }

  /**
   * Perform dependency-level sanity check
   * Checks consistency across tables at the same dependency level
   */
  public async performDependencyLevelSanityCheck(
    state: DatabaseDocumentation,
    run: AnalysisRun,
    level: number,
    tables: TableNode[]
  ): Promise<boolean> {
    try {
      const context = {
        dependencyLevel: level,
        tables: tables.map(t => {
          const tableDef = t.tableDefinition;
          return {
            schema: t.schema,
            table: t.table,
            description: tableDef?.description || 'No description yet',
            columns: tableDef?.columns.map(c => ({
              name: c.name,
              description: c.description || 'No description yet'
            })) || [],
            dependsOn: tableDef?.dependsOn || [],
            dependents: tableDef?.dependents || []
          };
        })
      };

      const result = await this.promptEngine.executePrompt<DependencyLevelSanityCheckResult>(
        'dependency-level-sanity-check',
        context,
        {
          responseFormat: 'JSON'
        }
      );

      if (result.success && result.result) {
        // Track this sanity check
        const sanityCheckRecord = {
          timestamp: new Date().toISOString(),
          checkType: 'dependency_level' as const,
          scope: `level ${level}`,
          hasMaterialIssues: result.result.hasMaterialIssues,
          issuesFound: result.result.tableIssues.length,
          tablesAffected: result.result.tableIssues.map(i => i.tableName),
          result: result.result.hasMaterialIssues ? 'issues_corrected' as const : 'no_issues' as const,
          tokensUsed: result.tokensUsed,
          promptInput: result.promptInput,
          promptOutput: result.promptOutput
        };

        run.sanityChecks.push(sanityCheckRecord);
        run.sanityCheckCount++;

        // Track tokens
        this.iterationTracker.addTokenUsage(run, result.tokensUsed, result.cost);

        // Log issues
        if (result.result.hasMaterialIssues) {
          for (const issue of result.result.tableIssues) {
            this.iterationTracker.addWarning(
              run,
              `[Level ${level}] ${issue.severity.toUpperCase()}: ${issue.tableName} - ${issue.description}`
            );
          }
        }

        return result.result.hasMaterialIssues;
      }

      return false;
    } catch (error) {
      this.iterationTracker.addError(
        run,
        `Dependency-level sanity check failed for level ${level}: ${(error as Error).message}`
      );
      return false;
    }
  }

  /**
   * Perform schema-level sanity check
   * Holistic review after entire schema is analyzed
   */
  public async performSchemaLevelSanityCheck(
    state: DatabaseDocumentation,
    run: AnalysisRun,
    schema: SchemaDefinition
  ): Promise<boolean> {
    try {
      const context = {
        schemaName: schema.name,
        tables: schema.tables.map(t => ({
          name: t.name,
          description: t.description || 'No description yet',
          rowCount: t.rowCount,
          dependencyLevel: t.dependencyLevel,
          columns: t.columns.map(c => ({
            name: c.name,
            dataType: c.dataType,
            description: c.description || 'No description yet'
          })),
          dependsOn: t.dependsOn,
          dependents: t.dependents
        }))
      };

      const result = await this.promptEngine.executePrompt<SchemaLevelSanityCheckResult>(
        'schema-level-sanity-check',
        context,
        {
          responseFormat: 'JSON'
        }
      );

      if (result.success && result.result) {
        // Update schema description if provided
        if (result.result.schemaLevelIssues.some(i => i.suggestedSchemaDescription)) {
          const suggested = result.result.schemaLevelIssues.find(i => i.suggestedSchemaDescription);
          if (suggested?.suggestedSchemaDescription) {
            this.stateManager.updateSchemaDescription(
              schema,
              suggested.suggestedSchemaDescription,
              'Generated from schema-level sanity check',
              run.modelUsed
            );
          }
        }

        // Track this sanity check
        const sanityCheckRecord = {
          timestamp: new Date().toISOString(),
          checkType: 'schema_level' as const,
          scope: `${schema.name} schema`,
          hasMaterialIssues: result.result.hasMaterialIssues,
          issuesFound: result.result.schemaLevelIssues.length + result.result.tableIssues.length,
          tablesAffected: [
            ...result.result.tableIssues.map(i => i.tableName),
            ...result.result.schemaLevelIssues.flatMap(i => i.affectedTables)
          ],
          result: result.result.hasMaterialIssues ? 'issues_corrected' as const : 'no_issues' as const,
          tokensUsed: result.tokensUsed,
          promptInput: result.promptInput,
          promptOutput: result.promptOutput
        };

        run.sanityChecks.push(sanityCheckRecord);
        run.sanityCheckCount++;

        // Track tokens
        this.iterationTracker.addTokenUsage(run, result.tokensUsed, result.cost);

        // Log issues
        if (result.result.hasMaterialIssues) {
          for (const issue of result.result.schemaLevelIssues) {
            this.iterationTracker.addWarning(
              run,
              `[Schema ${schema.name}] ${issue.severity.toUpperCase()}: ${issue.issueType} - ${issue.description}`
            );
          }
          for (const issue of result.result.tableIssues) {
            this.iterationTracker.addWarning(
              run,
              `[Schema ${schema.name}] ${issue.severity.toUpperCase()}: ${issue.tableName} - ${issue.description}`
            );
          }
        }

        return result.result.hasMaterialIssues;
      }

      return false;
    } catch (error) {
      this.iterationTracker.addError(
        run,
        `Schema-level sanity check failed for ${schema.name}: ${(error as Error).message}`
      );
      return false;
    }
  }

  /**
   * Perform cross-schema sanity check
   * Validates consistency across all schemas
   */
  public async performCrossSchemaSanityCheck(
    state: DatabaseDocumentation,
    run: AnalysisRun
  ): Promise<boolean> {
    if (state.schemas.length <= 1) {
      return false; // No need for cross-schema check
    }

    try {
      const context = {
        schemas: state.schemas.map(s => ({
          schemaName: s.name,
          description: s.description || 'No description yet',
          tableCount: s.tables.length,
          tables: s.tables.map(t => ({
            name: t.name,
            description: t.description || 'No description yet',
            rowCount: t.rowCount
          }))
        }))
      };

      const result = await this.promptEngine.executePrompt<CrossSchemaSanityCheckResult>(
        'cross-schema-sanity-check',
        context,
        {
          responseFormat: 'JSON'
        }
      );

      if (result.success && result.result) {
        // Track this sanity check
        const sanityCheckRecord = {
          timestamp: new Date().toISOString(),
          checkType: 'cross_schema' as const,
          scope: 'all schemas',
          hasMaterialIssues: result.result.hasMaterialIssues,
          issuesFound: result.result.crossSchemaIssues.length + result.result.schemaIssues.length,
          tablesAffected: result.result.crossSchemaIssues.flatMap(i =>
            i.affectedTables.map(t => `${t.schema}.${t.table}`)
          ),
          result: result.result.hasMaterialIssues ? 'issues_corrected' as const : 'no_issues' as const,
          tokensUsed: result.tokensUsed,
          promptInput: result.promptInput,
          promptOutput: result.promptOutput
        };

        run.sanityChecks.push(sanityCheckRecord);
        run.sanityCheckCount++;

        // Track tokens
        this.iterationTracker.addTokenUsage(run, result.tokensUsed, result.cost);

        // Log issues
        if (result.result.hasMaterialIssues) {
          for (const issue of result.result.crossSchemaIssues) {
            this.iterationTracker.addWarning(
              run,
              `[Cross-Schema] ${issue.severity.toUpperCase()}: ${issue.issueType} - ${issue.description}`
            );
          }
          for (const issue of result.result.schemaIssues) {
            this.iterationTracker.addWarning(
              run,
              `[Schema ${issue.schemaName}] ${issue.issueType} - ${issue.description}`
            );
          }
        }

        return result.result.hasMaterialIssues;
      }

      return false;
    } catch (error) {
      this.iterationTracker.addError(
        run,
        `Cross-schema sanity check failed: ${(error as Error).message}`
      );
      return false;
    }
  }

  /**
   * Check convergence
   */
  public checkConvergence(state: DatabaseDocumentation, run: AnalysisRun): boolean {
    const result = this.convergenceDetector.hasConverged(state, run);

    if (result.converged) {
      this.iterationTracker.completeRun(run, true, result.reason);
      return true;
    }

    return false;
  }

  /**
   * Execute backpropagation
   */
  public async executeBackpropagation(
    state: DatabaseDocumentation,
    run: AnalysisRun,
    triggers: BackpropagationTrigger[]
  ): Promise<void> {
    if (!this.config.analysis.backpropagation.enabled) {
      return;
    }

    if (triggers.length === 0) {
      return;
    }

    await this.backpropagationEngine.execute(state, run, triggers);
  }


  /**
   * Extract FK insights from column descriptions and create feedback to discovery phase
   *
   * **DEPRECATED**: This method previously used brittle regex heuristics to parse natural language
   * descriptions. Per architectural decision, we should use LLM for language understanding, not regex.
   *
   * **TODO**: Replace with structured LLM output approach:
   * 1. Update table-analysis prompt to include a "foreignKeys" array in JSON response:
   *    {
   *      "tableDescription": "...",
   *      "columnDescriptions": [...],
   *      "foreignKeys": [
   *        { "column": "prd_id", "referencesTable": "inv.prd", "referencesColumn": "prd_id" }
   *      ]
   *    }
   * 2. Process the structured foreignKeys array directly instead of parsing descriptions
   * 3. Use deterministic code only for statistics calculation, LLM for reasoning
   *
   * For now, this method is disabled to prevent brittle regex-based FK detection.
   */
  private extractAndFeedbackFKInsights(
    state: DatabaseDocumentation,
    schemaName: string,
    tableName: string,
    columnDescriptions: import('../types/prompts.js').ColumnDescriptionPromptResult[]
  ): void {
    // Method disabled - awaiting structured LLM output implementation
    console.log(`[AnalysisEngine] extractAndFeedbackFKInsights disabled - awaiting structured FK output from LLM`);
    return;
  }

  /**
   * Process structured FK insights from LLM and create feedback to discovery phase
   *
   * Uses the foreignKeys array from table-analysis prompt response instead of brittle regex parsing.
   * Per architectural decision: use LLM for language understanding, deterministic code for processing.
   */
  private processFKInsightsFromLLM(
    state: DatabaseDocumentation,
    schemaName: string,
    tableName: string,
    foreignKeys: import('../types/prompts.js').ForeignKeyPromptResult[]
  ): void {
    const discoveryPhase = state.phases.keyDetection;
    if (!discoveryPhase || !foreignKeys || foreignKeys.length === 0) return;

    console.log(`[AnalysisEngine] Processing ${foreignKeys.length} structured FK insights from LLM for ${schemaName}.${tableName}`);

    for (const fk of foreignKeys) {
      const { columnName, referencesSchema, referencesTable, referencesColumn, confidence } = fk;

      // Normalize table reference in case LLM returned "schema.table" format
      let targetSchema = referencesSchema;
      let targetTable = referencesTable;
      if (referencesTable.includes('.')) {
        const parts = referencesTable.split('.');
        targetSchema = parts[0];
        targetTable = parts[1];
        console.log(`[AnalysisEngine] Normalized LLM table ref: "${referencesTable}" -> schema="${targetSchema}", table="${targetTable}"`);
      }

      // Post-LLM FK Validation**
      // Reject FKs from hard PKs (SQL-defined) unless inheritance pattern
      const sourceColumn = this.findColumnInState(state, schemaName, tableName, columnName);
      if (sourceColumn?.isPrimaryKey && sourceColumn.pkSource === 'schema') {
        // Hard PK from SQL schema - only allow if inheritance pattern
        const table = state.schemas
          .find(s => s.name === schemaName)
          ?.tables.find(t => t.name === tableName);
        if (!table || !this.detectInheritancePattern(table, sourceColumn)) {
          console.warn(
            `[AnalysisEngine] Rejecting FK from hard PK: ${schemaName}.${tableName}.${columnName} ` +
            `→ ${targetSchema}.${targetTable}.${referencesColumn}`
          );
          continue; // Skip this FK
        }
      }

      // Validate confidence vs value overlap for discovered FKs
      const existingFKForValidation = discoveryPhase.discovered.foreignKeys.find(fk =>
        fk.schemaName === schemaName &&
        fk.sourceTable === tableName &&
        fk.sourceColumn === columnName
      );
      if (existingFKForValidation && confidence > 0.9 && existingFKForValidation.evidence.valueOverlap < 0.1) {
        console.warn(
          `[AnalysisEngine] Suspicious FK: high LLM confidence (${confidence}) but low overlap ` +
          `(${existingFKForValidation.evidence.valueOverlap}) for ${schemaName}.${tableName}.${columnName}`
        );
        // Downgrade confidence to max 0.6
        fk.confidence = Math.min(confidence, 0.6);
      }

      // Create feedback for this FK
      const feedback: import('../types/discovery.js').AnalysisToDiscoveryFeedback = {
        type: 'new_relationship',
        evidence: `LLM-identified FK: ${columnName} -> ${targetSchema}.${targetTable}.${referencesColumn} (confidence: ${confidence})`,
        tableName,
        columnName,
        affectedCandidates: [],
        recommendation: 'add_new',
        newRelationship: {
          targetTable: `${targetSchema}.${targetTable}`,
          targetColumn: referencesColumn
        }
      };

      // Check if this column was incorrectly marked as a PK - reject it unless it's a surrogate key
      const falsePK = discoveryPhase.discovered.primaryKeys.find(pk =>
        pk.schemaName === schemaName &&
        pk.tableName === tableName &&
        pk.columnNames.includes(columnName)
      );

      if (falsePK) {
        const columnLower = columnName.toLowerCase();
        const tableLower = tableName.toLowerCase();
        const isSurrogateKey =
          columnLower === `${tableLower}_id` ||
          columnLower === tableLower + 'id' ||
          columnLower === 'id';

        if (!isSurrogateKey) {
          falsePK.status = 'rejected';
          feedback.affectedCandidates.push(`PK:${schemaName}.${tableName}.${columnName}`);
          const column = this.findColumnInState(state, schemaName, tableName, columnName);
          if (column) column.isPrimaryKey = false;
          console.log(`[AnalysisEngine] FK from LLM: ${schemaName}.${tableName}.${columnName} -> ${targetSchema}.${targetTable}, rejecting as PK`);
        }
      }

      // Check if we already have this FK - boost confidence
      // Normalize table references to prevent duplicates
      const normalizedTarget = this.normalizeTableRef(targetSchema, targetTable);
      const existingFK = discoveryPhase.discovered.foreignKeys.find(fk => {
        const existingTarget = this.normalizeTableRef(fk.targetSchema, fk.targetTable);
        return fk.schemaName === schemaName &&
               fk.sourceTable === tableName &&
               fk.sourceColumn === columnName &&
               existingTarget === normalizedTarget; // Compare normalized refs
      });

      if (existingFK && existingFK.status === 'candidate') {
        existingFK.validatedByLLM = true;
        existingFK.status = 'confirmed';
        existingFK.confidence = Math.min(existingFK.confidence + 20, 100);
        feedback.type = 'confidence_change';
        feedback.newConfidence = existingFK.confidence;
        feedback.affectedCandidates.push(`FK:${schemaName}.${tableName}.${columnName}`);

        const column = this.findColumnInState(state, schemaName, tableName, columnName);
        if (column) {
          column.isForeignKey = true;
          column.foreignKeyReferences = {
            schema: targetSchema,
            table: targetTable,
            column: referencesColumn,
            referencedColumn: referencesColumn
          };
          // Set fkSource tracking for LLM-confirmed FKs
          column.fkSource = 'discovered';
          column.fkDiscoveryConfidence = existingFK.confidence;
        }

        // Update table-level dependsOn and dependents arrays for ERD generation
        this.updateTableDependencies(state, schemaName, tableName, targetSchema, targetTable, columnName, referencesColumn);

        console.log(`[AnalysisEngine] Confirmed FK: ${schemaName}.${tableName}.${columnName} -> ${targetSchema}.${targetTable}.${referencesColumn}, confidence: ${existingFK.confidence}`);
      } else {
        // Create new FK from LLM insight
        const newFK: import('../types/discovery.js').FKCandidate = {
          schemaName,
          sourceTable: tableName,
          sourceColumn: columnName,
          targetSchema: targetSchema,
          targetTable: targetTable,
          targetColumn: referencesColumn,
          confidence: Math.round(confidence * 100),
          evidence: {
            namingMatch: 0.9,
            valueOverlap: 0,
            cardinalityRatio: 0,
            dataTypeMatch: true,
            nullPercentage: 0,
            sampleSize: 0,
            orphanCount: 0,
            warnings: ['Created from structured LLM output']
          },
          discoveredInIteration: 1,
          validatedByLLM: true,
          status: 'confirmed'
        };

        discoveryPhase.discovered.foreignKeys.push(newFK);
        feedback.newConfidence = newFK.confidence;
        feedback.affectedCandidates.push(`FK:${schemaName}.${tableName}.${columnName}`);

        const column = this.findColumnInState(state, schemaName, tableName, columnName);
        if (column) {
          column.isForeignKey = true;
          column.foreignKeyReferences = {
            schema: targetSchema,
            table: targetTable,
            column: referencesColumn,
            referencedColumn: referencesColumn
          };
          // Set fkSource tracking for LLM-created FKs
          column.fkSource = 'discovered';
          column.fkDiscoveryConfidence = newFK.confidence;
        }

        // Update table-level dependsOn and dependents arrays for ERD generation
        this.updateTableDependencies(state, schemaName, tableName, targetSchema, targetTable, columnName, referencesColumn);

        console.log(`[AnalysisEngine] Created FK from LLM: ${schemaName}.${tableName}.${columnName} -> ${targetSchema}.${targetTable}.${referencesColumn}`);
      }

      discoveryPhase.feedbackFromAnalysis.push(feedback);
    }
  }

  /**
   * Find a column in the state schemas
   */
  /**
   * Normalize table reference to schema.table format 
   * Ensures consistent comparison regardless of whether schema is included
   *
   * Examples:
   * - normalizeTableRef('common', 'Organization') -> 'common.Organization'
   * - normalizeTableRef('dbo', 'User') -> 'dbo.User'
   */
  private normalizeTableRef(schema: string, table: string): string {
    return `${schema}.${table}`;
  }

  /**
   * Detect if a PK column is part of a 1:1 inheritance pattern (Bug #1 fix)
   * Same logic as FKDetector.detectInheritancePattern()
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
    const idSuffixMatch = columnName.match(/^(.+?)_?id$/);
    if (!idSuffixMatch) {
      return false;
    }

    const potentialParentName = idSuffixMatch[1].replace(/_/g, '');

    // If the potential parent name is the same as the table name, NOT inheritance
    if (potentialParentName === tableName.replace(/_/g, '')) {
      return false;
    }

    // If we get here: PK column name suggests a DIFFERENT table (likely inheritance)
    return true;
  }

  private findColumnInState(
    state: DatabaseDocumentation,
    schemaName: string,
    tableName: string,
    columnName: string
  ): ColumnDefinition | null {
    const schema = state.schemas.find(s => s.name === schemaName);
    if (!schema) return null;

    const table = schema.tables.find(t => t.name === tableName);
    if (!table) return null;

    return table.columns.find(c => c.name === columnName) || null;
  }

  /**
   * Update table-level dependsOn and dependents arrays when creating FK relationships
   * This is required for ERD diagram generation
   */
  private updateTableDependencies(
    state: DatabaseDocumentation,
    sourceSchemaName: string,
    sourceTableName: string,
    targetSchemaName: string,
    targetTableName: string,
    sourceColumnName: string,
    targetColumnName: string
  ): void {
    // Find source table and add to its dependsOn array
    const sourceSchema = state.schemas.find(s => s.name === sourceSchemaName);
    if (sourceSchema) {
      const sourceTable = sourceSchema.tables.find(t => t.name === sourceTableName);
      if (sourceTable) {
        // Check if this dependency already exists
        const existingDep = sourceTable.dependsOn.find(
          dep => dep.schema === targetSchemaName &&
                 dep.table === targetTableName &&
                 dep.column === sourceColumnName
        );

        if (!existingDep) {
          sourceTable.dependsOn.push({
            schema: targetSchemaName,
            table: targetTableName,
            column: sourceColumnName,
            referencedColumn: targetColumnName
          });
          console.log(`[AnalysisEngine] Updated dependsOn for ${sourceSchemaName}.${sourceTableName} -> ${targetSchemaName}.${targetTableName}`);
        }
      }
    }

    // Find target table and add to its dependents array
    const targetSchema = state.schemas.find(s => s.name === targetSchemaName);
    if (targetSchema) {
      const targetTable = targetSchema.tables.find(t => t.name === targetTableName);
      if (targetTable) {
        // Check if this dependent already exists
        const existingDep = targetTable.dependents.find(
          dep => dep.schema === sourceSchemaName &&
                 dep.table === sourceTableName &&
                 dep.column === sourceColumnName
        );

        if (!existingDep) {
          targetTable.dependents.push({
            schema: sourceSchemaName,
            table: sourceTableName,
            column: sourceColumnName,
            referencedColumn: targetColumnName
          });
          console.log(`[AnalysisEngine] Updated dependents for ${targetSchemaName}.${targetTableName} <- ${sourceSchemaName}.${sourceTableName}`);
        }
      }
    }
  }

  /**
   * Resolve target table from LLM hint (e.g., "product", "warehouse", "supplier")
   * Returns the best matching table and its likely PK column
   */
  private resolveTargetTable(
    state: DatabaseDocumentation,
    tableHint: string,
    currentSchema: string
  ): { schema: string; table: string; column: string } | null {
    const hint = tableHint.toLowerCase().trim();

    // Search all schemas for matching table names
    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        const tableLower = table.name.toLowerCase();

        // Direct match
        if (tableLower === hint || tableLower === hint + 's' || tableLower + 's' === hint) {
          // Find PK column (prefer columns ending in _id or named id)
          const pkColumn = table.columns.find(c => c.isPrimaryKey);
          if (pkColumn) {
            return {
              schema: schema.name,
              table: table.name,
              column: pkColumn.name
            };
          }

          // Fallback: look for column ending in _id or just 'id'
          const idColumn = table.columns.find(c =>
            c.name.toLowerCase() === 'id' ||
            c.name.toLowerCase() ===  `${tableLower}_id` ||
            c.name.toLowerCase().endsWith('_id')
          );

          if (idColumn) {
            return {
              schema: schema.name,
              table: table.name,
              column: idColumn.name
            };
          }

          // Fallback: first column
          if (table.columns.length > 0) {
            return {
              schema: schema.name,
              table: table.name,
              column: table.columns[0].name
            };
          }
        }

        // Partial match (e.g., "product" matches "prd", "products")
        if (tableLower.includes(hint) || hint.includes(tableLower)) {
          const pkColumn = table.columns.find(c => c.isPrimaryKey);
          if (pkColumn) {
            return {
              schema: schema.name,
              table: table.name,
              column: pkColumn.name
            };
          }
        }
      }
    }

    return null;
  }
}
