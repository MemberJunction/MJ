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

export class AnalysisEngine {
  private backpropagationEngine: BackpropagationEngine;
  private convergenceDetector: ConvergenceDetector;
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

    // Set up guardrail checking in PromptEngine
    this.promptEngine.setGuardrailCheck(() => {
      if (!this.currentRun) {
        return { canContinue: true };
      }
      return this.checkGuardrails(this.currentRun);
    });
  }

  /**
   * Initialize timing for guardrails and set current run
   */
  public startAnalysis(run: AnalysisRun): void {
    this.startTime = Date.now();
    this.currentRun = run;
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

      // Extract FK insights from column descriptions and feed back to discovery phase
      if (state.phases.keyDetection) {
        this.extractAndFeedbackFKInsights(
          state,
          tableNode.schema,
          tableNode.table,
          result.result.columnDescriptions || []
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
      seedContext: state.seedContext
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
   * Check if guardrails are exceeded
   */
  private checkGuardrails(run: AnalysisRun): {
    canContinue: boolean;
    warning?: string;
    reason?: string;
  } {
    const guardrails = this.config.analysis.guardrails;

    // If no guardrails configured, always continue
    if (!guardrails) {
      return { canContinue: true };
    }

    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const totalTokens = run.totalTokensUsed || 0;
    const totalCost = run.estimatedCost || 0;

    // Get warn thresholds (default to 80%)
    const warnThresholds = guardrails.warnThresholds || {};
    const tokenWarnPercent = warnThresholds.tokenPercentage || 80;
    const durationWarnPercent = warnThresholds.durationPercentage || 80;
    const costWarnPercent = warnThresholds.costPercentage || 80;

    // Check hard limits - STOP
    if (guardrails.maxTokensPerRun && totalTokens >= guardrails.maxTokensPerRun) {
      return {
        canContinue: false,
        reason: `Token limit exceeded: ${totalTokens.toLocaleString()} / ${guardrails.maxTokensPerRun.toLocaleString()} tokens`
      };
    }

    if (guardrails.maxDurationSeconds && elapsedSeconds >= guardrails.maxDurationSeconds) {
      return {
        canContinue: false,
        reason: `Duration limit exceeded: ${Math.round(elapsedSeconds)}s / ${guardrails.maxDurationSeconds}s`
      };
    }

    if (guardrails.maxCostDollars && totalCost >= guardrails.maxCostDollars) {
      return {
        canContinue: false,
        reason: `Cost limit exceeded: $${totalCost.toFixed(2)} / $${guardrails.maxCostDollars.toFixed(2)}`
      };
    }

    // Check warning thresholds
    let warning: string | undefined;

    if (guardrails.maxTokensPerRun) {
      const tokenPercent = (totalTokens / guardrails.maxTokensPerRun) * 100;
      if (tokenPercent >= tokenWarnPercent && !warning) {
        warning = `Token usage at ${tokenPercent.toFixed(0)}% (${totalTokens.toLocaleString()} / ${guardrails.maxTokensPerRun.toLocaleString()})`;
      }
    }

    if (guardrails.maxDurationSeconds) {
      const durationPercent = (elapsedSeconds / guardrails.maxDurationSeconds) * 100;
      if (durationPercent >= durationWarnPercent && !warning) {
        warning = `Duration at ${durationPercent.toFixed(0)}% (${Math.round(elapsedSeconds)}s / ${guardrails.maxDurationSeconds}s)`;
      }
    }

    if (guardrails.maxCostDollars) {
      const costPercent = (totalCost / guardrails.maxCostDollars) * 100;
      if (costPercent >= costWarnPercent && !warning) {
        warning = `Cost at ${costPercent.toFixed(0)}% ($${totalCost.toFixed(2)} / $${guardrails.maxCostDollars.toFixed(2)})`;
      }
    }

    return {
      canContinue: true,
      warning
    };
  }

  /**
   * Extract FK insights from column descriptions and create feedback to discovery phase
   * Example: "prd_id" described as "likely FK to a product master table" should:
   * 1. Create feedback that prd_id is an FK, not a PK
   * 2. Mark any PK candidate for prd_id as rejected
   */
  private extractAndFeedbackFKInsights(
    state: DatabaseDocumentation,
    schemaName: string,
    tableName: string,
    columnDescriptions: import('../types/prompts.js').ColumnDescriptionPromptResult[]
  ): void {
    const discoveryPhase = state.phases.keyDetection;
    if (!discoveryPhase) return;

    // FK-related patterns in descriptions
    const fkPatterns = [
      /(?:likely\s+)?(?:foreign\s+)?key?\s+(?:to|for|of|referencing)\s+(?:a\s+|the\s+)?(\w+)/i,
      /references?\s+(?:a\s+|the\s+)?(\w+)/i,
      /links?\s+to\s+(?:a\s+|the\s+)?(\w+)/i,
      /(?:identifier|ID)\s+(?:of|for)\s+(?:a\s+|the\s+)?(\w+)/i,
      /FK\s+to\s+(\w+)/i
    ];

    for (const colDesc of columnDescriptions) {
      const description = colDesc.description.toLowerCase();

      // Check if description mentions FK relationship
      let targetTableHint: string | null = null;
      for (const pattern of fkPatterns) {
        const match = description.match(pattern);
        if (match) {
          targetTableHint = match[1];
          break;
        }
      }

      if (!targetTableHint) continue;

      // Found FK hint - create feedback
      const feedback: import('../types/discovery.js').AnalysisToDiscoveryFeedback = {
        type: 'fk_invalidated',
        evidence: `Analysis phase description: "${colDesc.description}"`,
        tableName,
        columnName: colDesc.columnName,
        affectedCandidates: [],
        recommendation: 'remove',
        newRelationship: {
          targetTable: targetTableHint,
          targetColumn: 'id' // Common assumption
        }
      };

      // Check if this column was marked as a PK - if so, reject it
      const falsePK = discoveryPhase.discovered.primaryKeys.find(pk =>
        pk.schemaName === schemaName &&
        pk.tableName === tableName &&
        pk.columnNames.includes(colDesc.columnName)
      );

      if (falsePK) {
        falsePK.status = 'rejected';
        feedback.affectedCandidates.push(`PK:${schemaName}.${tableName}.${colDesc.columnName}`);

        // Update schema metadata: mark as NOT a primary key
        const column = this.findColumnInState(state, schemaName, tableName, colDesc.columnName);
        if (column) {
          column.isPrimaryKey = false;
          console.log(`[AnalysisEngine] Updated schema: ${schemaName}.${tableName}.${colDesc.columnName} isPrimaryKey = false`);
        }

        console.log(`[AnalysisEngine] FK insight from LLM: ${schemaName}.${tableName}.${colDesc.columnName} is FK to ${targetTableHint}, rejecting as PK`);
      }

      // Check if we already have this as an FK candidate - if so, boost confidence
      const existingFK = discoveryPhase.discovered.foreignKeys.find(fk =>
        fk.schemaName === schemaName &&
        fk.sourceTable === tableName &&
        fk.sourceColumn === colDesc.columnName
      );

      if (existingFK && existingFK.status === 'candidate') {
        existingFK.validatedByLLM = true;
        existingFK.status = 'confirmed';
        existingFK.confidence = Math.min(existingFK.confidence + 20, 100);
        feedback.type = 'confidence_change';
        feedback.recommendation = 'upgrade_confidence';
        feedback.newConfidence = existingFK.confidence;
        feedback.affectedCandidates.push(`FK:${schemaName}.${tableName}.${colDesc.columnName}`);

        // Update schema metadata: mark as foreign key and set reference
        const column = this.findColumnInState(state, schemaName, tableName, colDesc.columnName);
        if (column) {
          column.isForeignKey = true;
          column.foreignKeyReferences = {
            schema: existingFK.targetSchema,
            table: existingFK.targetTable,
            column: existingFK.targetColumn,
            referencedColumn: existingFK.targetColumn
          };
          console.log(`[AnalysisEngine] Updated schema: ${schemaName}.${tableName}.${colDesc.columnName} isForeignKey = true -> ${existingFK.targetTable}.${existingFK.targetColumn}`);
        }

        console.log(`[AnalysisEngine] FK insight from LLM: Confirmed ${schemaName}.${tableName}.${colDesc.columnName} -> ${existingFK.targetTable}.${existingFK.targetColumn}, boosting confidence to ${existingFK.confidence}`);
      }

      // Add feedback to discovery phase
      discoveryPhase.feedbackFromAnalysis.push(feedback);
    }
  }

  /**
   * Find a column in the state schemas
   */
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
}
