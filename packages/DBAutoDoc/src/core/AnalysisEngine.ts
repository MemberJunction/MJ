/**
 * Main analysis orchestrator
 * Coordinates the entire documentation generation workflow
 */

import { DatabaseDocumentation, AnalysisRun, SchemaDefinition, TableDefinition, ColumnDefinition } from '../types/state.js';
import { TableNode, BackpropagationTrigger, TableAnalysisContext, TableGroundTruthContext } from '../types/analysis.js';
import {
  TableAnalysisPromptResult,
  SchemaSanityCheckPromptResult,
  CrossSchemaSanityCheckPromptResult,
  SemanticComparisonPromptResult,
  DependencyLevelSanityCheckResult,
  SchemaLevelSanityCheckResult,
  CrossSchemaSanityCheckResult
} from '../types/prompts.js';
import { DBAutoDocConfig, TableGroundTruth, ColumnGroundTruth } from '../types/config.js';
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

  private onProgress: (message: string, data?: Record<string, unknown>) => void;

  constructor(
    private config: DBAutoDocConfig,
    private promptEngine: PromptEngine,
    private stateManager: StateManager,
    private iterationTracker: IterationTracker,
    onProgress?: (message: string, data?: Record<string, unknown>) => void
  ) {
    this.onProgress = onProgress || (() => {});
    this.backpropagationEngine = new BackpropagationEngine(
      promptEngine,
      stateManager,
      iterationTracker,
      config.analysis.backpropagation.maxDepth,
      config
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
   * Lock interim ground truth: FKs with confidence ≥ threshold become immutable.
   * Call this AFTER the iterative analysis completes but BEFORE the pruning pass.
   */
  public lockInterimGroundTruth(
    state: DatabaseDocumentation,
    confidenceThreshold: number = 90
  ): { locked: number; unlocked: number } {
    const discoveryPhase = state.phases.keyDetection;
    if (!discoveryPhase) return { locked: 0, unlocked: 0 };

    let locked = 0;
    let unlocked = 0;
    for (const fk of discoveryPhase.discovered.foreignKeys) {
      if (fk.status === 'rejected') continue;
      if (fk.confidence >= confidenceThreshold) {
        fk.status = 'confirmed';
        locked++;
      } else {
        unlocked++;
      }
    }

    console.log(`[AnalysisEngine] Interim ground truth locked: ${locked} FKs at ≥${confidenceThreshold}% confidence, ${unlocked} unlocked for pruning`);
    this.onProgress('Interim ground truth locked', { locked, unlocked, threshold: confidenceThreshold });
    return { locked, unlocked };
  }

  /**
   * Two-pass FK pruning using a potentially stronger model.
   * Pass 1: Per-table — evaluate each table's unlocked FKs, propose removals.
   * Pass 2: Holistic — review all proposed removals at once for final decision.
   * Locked FKs (interim ground truth) are never touched.
   */
  public async pruneForeignKeys(
    state: DatabaseDocumentation,
    run: AnalysisRun
  ): Promise<{ removed: number; kept: number }> {
    const discoveryPhase = state.phases.keyDetection;
    if (!discoveryPhase) return { removed: 0, kept: 0 };

    const override = this.config.ai.modelOverrides?.['fkPruning'];
    const effectiveModel = override?.model ?? this.config.ai.model;

    // Build table info for context
    const allTables = state.schemas.flatMap(s =>
      s.tables.map(t => {
        const pk = discoveryPhase.discovered.primaryKeys.find(
          p => p.schemaName === s.name && p.tableName === t.name
        );
        return {
          schema: s.name,
          name: t.name,
          description: t.description || '',
          pk: pk ? pk.columnNames.join(', ') : ''
        };
      })
    );

    // Group non-rejected FKs by source table
    const allFKs = discoveryPhase.discovered.foreignKeys.filter(fk => fk.status !== 'rejected');
    const fksByTable = new Map<string, typeof allFKs>();
    for (const fk of allFKs) {
      const key = `${fk.schemaName}.${fk.sourceTable}`;
      if (!fksByTable.has(key)) fksByTable.set(key, []);
      fksByTable.get(key)!.push(fk);
    }

    // ==================== PASS 1: Per-table pruning proposals ====================
    this.onProgress('FK pruning pass 1: per-table analysis', { tables: fksByTable.size, model: effectiveModel });

    interface ProposedRemoval {
      fk: typeof allFKs[0];
      reasoning: string;
      sourceSchema: string;
      sourceTable: string;
      sourceColumn: string;
      targetSchema: string;
      targetTable: string;
      targetColumn: string;
      confidence: number;
    }
    const allProposals: ProposedRemoval[] = [];
    let tableIdx = 0;

    for (const [tableKey, tableFKs] of fksByTable.entries()) {
      tableIdx++;
      // Skip tables where ALL FKs are locked
      const hasUnlocked = tableFKs.some(fk => fk.status !== 'confirmed');
      if (!hasUnlocked) continue;

      if (tableIdx % 10 === 1) {
        this.onProgress(`FK pruning: table ${tableIdx}/${fksByTable.size}`);
      }

      const [schemaName, tableName] = tableKey.split('.');
      const table = this.stateManager.findTable(state, schemaName, tableName);

      const candidates = tableFKs.map(fk => ({
        sourceColumn: fk.sourceColumn,
        targetSchema: fk.targetSchema,
        targetTable: fk.targetTable,
        targetColumn: fk.targetColumn,
        confidence: fk.confidence,
        locked: fk.status === 'confirmed'
      }));

      const context = {
        sourceSchema: schemaName,
        sourceTable: tableName,
        tableDescription: table?.description || '',
        allTables,
        candidates,
        seedContext: state.seedContext ?? this.config.seedContext
      };

      const result = await this.promptEngine.executePrompt<import('../types/prompts.js').FKPruningProposal[]>(
        'fk-pruning-table',
        context,
        {
          responseFormat: 'JSON',
          temperature: override?.temperature ?? 0.05,
          maxTokens: override?.maxTokens ?? this.config.ai.maxTokens,
          modelOverride: override?.model,
          effortLevelOverride: override?.effortLevel
        }
      );

      if (!result.success || !result.result) {
        console.log(`[AnalysisEngine] FK pruning failed for ${tableKey}: ${result.errorMessage}`);
        continue;
      }

      for (const proposal of result.result) {
        if (proposal.action === 'remove' && proposal.index >= 1 && proposal.index <= tableFKs.length) {
          const fk = tableFKs[proposal.index - 1];
          if (fk.status === 'confirmed') {
            console.log(`[AnalysisEngine] BLOCKED removal of locked FK: ${tableKey}.${fk.sourceColumn} -> ${fk.targetTable}.${fk.targetColumn}`);
            continue;
          }
          allProposals.push({
            fk,
            reasoning: proposal.reasoning,
            sourceSchema: fk.schemaName,
            sourceTable: fk.sourceTable,
            sourceColumn: fk.sourceColumn,
            targetSchema: fk.targetSchema,
            targetTable: fk.targetTable,
            targetColumn: fk.targetColumn,
            confidence: fk.confidence
          });
        }
      }

      console.log(`[AnalysisEngine] FK pruning ${tableKey}: ${result.result.length} removals proposed`);
    }

    console.log(`[AnalysisEngine] Pass 1 complete: ${allProposals.length} total removals proposed`);
    this.onProgress('FK pruning pass 1 complete', { proposals: allProposals.length });

    if (allProposals.length === 0) {
      return { removed: 0, kept: allFKs.length };
    }

    // ==================== PASS 2: Holistic review of all proposals ====================
    this.onProgress('FK pruning pass 2: holistic review', { proposals: allProposals.length, model: effectiveModel });

    const holisticContext = {
      allTables,
      proposals: allProposals.map(p => ({
        sourceSchema: p.sourceSchema,
        sourceTable: p.sourceTable,
        sourceColumn: p.sourceColumn,
        targetSchema: p.targetSchema,
        targetTable: p.targetTable,
        targetColumn: p.targetColumn,
        confidence: p.confidence,
        reasoning: p.reasoning
      })),
      seedContext: state.seedContext ?? this.config.seedContext
    };

    const holisticResult = await this.promptEngine.executePrompt<import('../types/prompts.js').FKPruningFinalDecision[]>(
      'fk-pruning-holistic',
      holisticContext,
      {
        responseFormat: 'JSON',
        temperature: override?.temperature ?? 0.05,
        maxTokens: override?.maxTokens ?? this.config.ai.maxTokens,
        modelOverride: override?.model,
        effortLevelOverride: override?.effortLevel
      }
    );

    let removed = 0;
    if (holisticResult.success && holisticResult.result) {
      for (const decision of holisticResult.result) {
        if (decision.action === 'remove' && decision.index >= 1 && decision.index <= allProposals.length) {
          const proposal = allProposals[decision.index - 1];
          proposal.fk.status = 'rejected';
          removed++;
          console.log(`[AnalysisEngine] Pruned FK: ${proposal.sourceSchema}.${proposal.sourceTable}.${proposal.sourceColumn} -> ${proposal.targetSchema}.${proposal.targetTable}.${proposal.targetColumn} — ${decision.reasoning}`);
        }
      }
    } else {
      console.log(`[AnalysisEngine] Holistic pruning failed: ${holisticResult.errorMessage}. Falling back to pass 1 proposals.`);
      // Fallback: apply all pass 1 proposals directly
      for (const proposal of allProposals) {
        proposal.fk.status = 'rejected';
        removed++;
      }
    }

    const kept = allFKs.length - removed;
    console.log(`[AnalysisEngine] FK pruning complete: ${removed} removed, ${kept} kept (model: ${effectiveModel})`);
    this.onProgress('FK pruning complete', { removed, kept, model: effectiveModel });

    // Save state
    this.stateManager.updateSummary(state);
    await this.stateManager.save(state);

    return { removed, kept };
  }

  /**
   * Process a single dependency level
   */
  public async processLevel(
    state: DatabaseDocumentation,
    run: AnalysisRun,
    level: number,
    tables: TableNode[]
  ): Promise<{ triggers: BackpropagationTrigger[]; guardrailExceeded: boolean }> {
    const triggers: BackpropagationTrigger[] = [];
    const total = tables.length;

    for (let i = 0; i < tables.length; i++) {
      const tableNode = tables[i];

      if (i % 5 === 0 || i === total - 1) {
        this.onProgress(`Level ${level}: analyzing table ${i + 1}/${total} (${tableNode.schema}.${tableNode.table})`);
      }

      const result = await this.analyzeTable(state, run, tableNode, level);

      // Check if guardrail was exceeded during this table's analysis
      if (result.guardrailExceeded) {
        return { triggers, guardrailExceeded: true };
      }

      if (result.triggers) {
        triggers.push(...result.triggers);
      }

      // Save state after every table — each LLM call takes 15-30s so disk IO is negligible
      this.stateManager.updateSummary(state);
      await this.stateManager.save(state);
    }

    run.levelsProcessed = Math.max(run.levelsProcessed, level + 1);

    return { triggers, guardrailExceeded: false };
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

    // Skip user-approved tables — they should not be re-analyzed
    if (table.userApproved) {
      this.iterationTracker.addLogEntry(run, {
        level,
        schema: tableNode.schema,
        table: tableNode.table,
        action: 'analyze',
        result: 'unchanged',
        message: 'Skipped: user-approved description'
      });
      return {};
    }

    try {
      // Build analysis context (includes ground truth if available)
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
      this.iterationTracker.addTokenUsage(run, result.tokensUsed, result.cost, result.inputTokens, result.outputTokens, this.config.ai.pricing);

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

      // Update column descriptions (skip user-approved columns)
      for (const colDesc of result.result.columnDescriptions || []) {
        const column = table.columns.find(c => c.name === colDesc.columnName);
        if (column && !column.userApproved) {
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

      // Process PK proposal from LLM — verify eligibility deterministically
      if (state.phases.keyDetection && result.result.primaryKey) {
        this.processPKInsightFromLLM(
          state,
          tableNode.schema,
          tableNode.table,
          result.result.primaryKey
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

    // Build ground truth context if available
    const groundTruthContext = this.buildGroundTruthContext(tableNode.schema, tableNode.table);

    // Build FK candidate stats from discovery phase for LLM context
    const fkCandidateStats = this.buildFKCandidateStats(state, tableNode.schema, tableNode.table);

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
      seedContext: state.seedContext ?? this.config.seedContext,
      allTables,
      groundTruth: groundTruthContext,
      fkCandidateStats
    };
  }

  /**
   * Build FK candidate stats from the discovery phase for this table.
   * Provides the LLM with cross-table relationship evidence (value overlap,
   * cardinality ratio) to make better FK decisions.
   */
  private buildFKCandidateStats(
    state: DatabaseDocumentation,
    schemaName: string,
    tableName: string
  ): Array<{ sourceColumn: string; targetSchema: string; targetTable: string; targetColumn: string; valueOverlap: number; cardinalityRatio: number; confidence: number }> {
    const discoveryPhase = state.phases.keyDetection;
    if (!discoveryPhase) return [];

    return discoveryPhase.discovered.foreignKeys
      .filter(fk =>
        fk.schemaName === schemaName &&
        fk.sourceTable === tableName &&
        fk.status !== 'rejected'
      )
      .map(fk => ({
        sourceColumn: fk.sourceColumn,
        targetSchema: fk.targetSchema,
        targetTable: fk.targetTable,
        targetColumn: fk.targetColumn,
        valueOverlap: fk.evidence.valueOverlap,
        cardinalityRatio: fk.evidence.cardinalityRatio,
        confidence: fk.confidence
      }));
  }

  /**
   * Build ground truth context for a table from config
   */
  private buildGroundTruthContext(schemaName: string, tableName: string): TableGroundTruthContext | undefined {
    const gt = this.config.groundTruth;
    if (!gt) return undefined;

    const tableKey = `${schemaName}.${tableName}`;
    const tableGT = gt.tables?.[tableKey];
    const schemaGT = gt.schemas?.[schemaName];

    // If no ground truth for this table or schema, return undefined
    if (!tableGT && !schemaGT) return undefined;

    const context: TableGroundTruthContext = {};

    if (tableGT?.description) context.tableDescription = tableGT.description;
    if (tableGT?.notes) context.tableNotes = tableGT.notes;
    if (tableGT?.businessDomain) context.businessDomain = tableGT.businessDomain;
    if (schemaGT?.businessDomain && !context.businessDomain) context.businessDomain = schemaGT.businessDomain;

    // Build column ground truth maps
    if (tableGT?.columns) {
      context.columnDescriptions = {};
      context.columnNotes = {};
      for (const [colName, colGT] of Object.entries(tableGT.columns)) {
        if (colGT.description) context.columnDescriptions[colName] = colGT.description;
        if (colGT.notes) context.columnNotes[colName] = colGT.notes;
      }
    }

    return context;
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
    this.iterationTracker.addTokenUsage(run, result.tokensUsed, result.cost, result.inputTokens, result.outputTokens, this.config.ai.pricing);

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
        this.iterationTracker.addTokenUsage(run, result.tokensUsed, result.cost, result.inputTokens, result.outputTokens, this.config.ai.pricing);

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
        this.iterationTracker.addTokenUsage(run, result.tokensUsed, result.cost, result.inputTokens, result.outputTokens, this.config.ai.pricing);

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
        this.iterationTracker.addTokenUsage(run, result.tokensUsed, result.cost, result.inputTokens, result.outputTokens, this.config.ai.pricing);

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
   * Process PK proposal from LLM. The LLM can propose a PK, but ALL proposed columns
   * must pass deterministic eligibility: zero nulls, zero blanks, 100% unique values.
   * If any column fails, the entire proposal is rejected.
   */
  private processPKInsightFromLLM(
    state: DatabaseDocumentation,
    schemaName: string,
    tableName: string,
    pkProposal: import('../types/prompts.js').PrimaryKeyPromptResult
  ): void {
    const discoveryPhase = state.phases.keyDetection;
    if (!discoveryPhase || !pkProposal || !pkProposal.columns || pkProposal.columns.length === 0) return;

    const columns = pkProposal.columns;
    const confidence = Math.round(pkProposal.confidence * 100);

    // Check if we already have a confirmed PK for this table
    const existingConfirmedPK = discoveryPhase.discovered.primaryKeys.find(pk =>
      pk.schemaName === schemaName &&
      pk.tableName === tableName &&
      pk.status === 'confirmed'
    );

    if (existingConfirmedPK) {
      // Already have a confirmed PK — check if LLM agrees
      const sameColumns = existingConfirmedPK.columnNames.length === columns.length &&
        existingConfirmedPK.columnNames.every(c => columns.some(pc => pc.toLowerCase() === c.toLowerCase()));

      if (sameColumns) {
        // LLM agrees with existing PK — boost confidence
        existingConfirmedPK.confidence = Math.min(existingConfirmedPK.confidence + 10, 100);
        existingConfirmedPK.validatedByLLM = true;
        console.log(`[AnalysisEngine] LLM confirmed existing PK: ${schemaName}.${tableName} (${columns.join(', ')}), confidence: ${existingConfirmedPK.confidence}`);
      } else {
        // LLM disagrees — log but don't override a confirmed PK
        console.log(`[AnalysisEngine] LLM proposed different PK for ${schemaName}.${tableName}: [${columns.join(', ')}] vs confirmed [${existingConfirmedPK.columnNames.join(', ')}] — keeping confirmed`);
      }
      return;
    }

    // Check if an existing candidate matches
    const existingCandidate = discoveryPhase.discovered.primaryKeys.find(pk =>
      pk.schemaName === schemaName &&
      pk.tableName === tableName &&
      pk.columnNames.length === columns.length &&
      pk.columnNames.every(c => columns.some(pc => pc.toLowerCase() === c.toLowerCase()))
    );

    if (existingCandidate) {
      // LLM confirms a stats candidate — promote and boost
      existingCandidate.validatedByLLM = true;
      existingCandidate.status = 'confirmed';
      existingCandidate.confidence = Math.min(existingCandidate.confidence + 20, 100);
      console.log(`[AnalysisEngine] LLM confirmed PK candidate: ${schemaName}.${tableName} (${columns.join(', ')}), confidence: ${existingCandidate.confidence}`);

      // Update column flags
      for (const colName of columns) {
        const column = this.findColumnInState(state, schemaName, tableName, colName);
        if (column) column.isPrimaryKey = true;
      }
      return;
    }

    // New PK proposal — verify ALL columns are PK-eligible deterministically
    const table = this.stateManager.findTable(state, schemaName, tableName);
    if (!table) return;

    for (const colName of columns) {
      const column = table.columns.find(c => c.name.toLowerCase() === colName.toLowerCase());
      if (!column) {
        console.log(`[AnalysisEngine] LLM PK rejected: ${schemaName}.${tableName} — column "${colName}" not found`);
        return;
      }

      // Check PK eligibility from stats
      const stats = column.statistics;
      if (!stats) {
        console.log(`[AnalysisEngine] LLM PK rejected: ${schemaName}.${tableName}.${colName} — no statistics available`);
        return;
      }

      const uniqueness = stats.totalRows > 0 ? stats.distinctCount / stats.totalRows : 0;
      const hasNulls = (stats.nullCount || 0) > 0;

      if (hasNulls) {
        console.log(`[AnalysisEngine] LLM PK rejected: ${schemaName}.${tableName}.${colName} — has ${stats.nullCount} nulls`);
        return;
      }

      if (uniqueness < 1.0) {
        console.log(`[AnalysisEngine] LLM PK rejected: ${schemaName}.${tableName}.${colName} — uniqueness ${(uniqueness * 100).toFixed(1)}% (must be 100%)`);
        return;
      }
    }

    // All columns pass — create new PK candidate
    const newPK: import('../types/discovery.js').PKCandidate = {
      schemaName,
      tableName,
      columnNames: columns,
      confidence,
      evidence: {
        uniqueness: 1.0,
        nullCount: 0,
        totalRows: table.rowCount || 0,
        dataPattern: columns.length > 1 ? 'composite' : 'unknown',
        namingScore: 0.5,
        dataTypeScore: 0.8,
        warnings: ['Created from LLM proposal — passed deterministic eligibility']
      },
      discoveredInIteration: 1,
      validatedByLLM: true,
      status: 'confirmed'
    };

    discoveryPhase.discovered.primaryKeys.push(newPK);

    // Update column flags
    for (const colName of columns) {
      const column = this.findColumnInState(state, schemaName, tableName, colName);
      if (column) column.isPrimaryKey = true;
    }

    console.log(`[AnalysisEngine] Created PK from LLM: ${schemaName}.${tableName} (${columns.join(', ')}) confidence: ${confidence}`);
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
      const { columnName, referencesColumn, confidence } = fk;
      // LLM often returns referencesTable as "SCHEMA.TABLE" format — strip the schema prefix
      let referencesSchema = fk.referencesSchema;
      let referencesTable = fk.referencesTable;
      if (referencesTable.includes('.')) {
        const parts = referencesTable.split('.');
        // If the schema part matches referencesSchema, just take the table name
        // Otherwise use the schema from the qualified name
        referencesSchema = parts[0];
        referencesTable = parts[parts.length - 1];
      }

      // Create feedback for this FK
      const feedback: import('../types/discovery.js').AnalysisToDiscoveryFeedback = {
        type: 'new_relationship',
        evidence: `LLM-identified FK: ${columnName} -> ${referencesSchema}.${referencesTable}.${referencesColumn} (confidence: ${confidence})`,
        tableName,
        columnName,
        affectedCandidates: [],
        recommendation: 'add_new',
        newRelationship: {
          targetTable: `${referencesSchema}.${referencesTable}`,
          targetColumn: referencesColumn
        }
      };

      // Check if this column is already a detected PK
      const existingPK = discoveryPhase.discovered.primaryKeys.find(pk =>
        pk.schemaName === schemaName &&
        pk.tableName === tableName &&
        pk.columnNames.includes(columnName)
      );

      if (existingPK && existingPK.status === 'confirmed') {
        // A confirmed PK should not also be an FK without strong statistical evidence.
        // PK-as-FK (is-a / 1:1 relationships) is extremely rare in production databases.
        // LLM hallucination of PK→FK relationships is common, especially for "ID" columns.
        // Skip this FK suggestion entirely — the PK designation takes priority.
        console.log(`[AnalysisEngine] Rejecting LLM FK suggestion for confirmed PK: ${schemaName}.${tableName}.${columnName} -> ${referencesSchema}.${referencesTable}.${referencesColumn}`);
        continue;
      }

      if (existingPK && existingPK.status !== 'confirmed') {
        // PK exists but isn't confirmed — LLM suggesting it's an FK is evidence
        // that the PK detection was wrong. Reject the PK.
        existingPK.status = 'rejected';
        feedback.affectedCandidates.push(`PK:${schemaName}.${tableName}.${columnName}`);
        const column = this.findColumnInState(state, schemaName, tableName, columnName);
        if (column) column.isPrimaryKey = false;
        console.log(`[AnalysisEngine] FK from LLM: ${schemaName}.${tableName}.${columnName} -> ${referencesSchema}.${referencesTable}, rejecting unconfirmed PK`);
      }

      // Check if we already have this FK - boost confidence
      const existingFK = discoveryPhase.discovered.foreignKeys.find(fk =>
        fk.schemaName === schemaName &&
        fk.sourceTable === tableName &&
        fk.sourceColumn === columnName
      );

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
            schema: referencesSchema,
            table: referencesTable,
            column: referencesColumn,
            referencedColumn: referencesColumn
          };
        }

        // Update table-level dependsOn and dependents arrays for ERD generation
        this.updateTableDependencies(state, schemaName, tableName, referencesSchema, referencesTable, columnName, referencesColumn);

        console.log(`[AnalysisEngine] Confirmed FK: ${schemaName}.${tableName}.${columnName} -> ${referencesSchema}.${referencesTable}.${referencesColumn}, confidence: ${existingFK.confidence}`);
      } else {
        // Create new FK from LLM insight
        const newFK: import('../types/discovery.js').FKCandidate = {
          schemaName,
          sourceTable: tableName,
          sourceColumn: columnName,
          targetSchema: referencesSchema,
          targetTable: referencesTable,
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
            schema: referencesSchema,
            table: referencesTable,
            column: referencesColumn,
            referencedColumn: referencesColumn
          };
        }

        // Update table-level dependsOn and dependents arrays for ERD generation
        this.updateTableDependencies(state, schemaName, tableName, referencesSchema, referencesTable, columnName, referencesColumn);

        console.log(`[AnalysisEngine] Created FK from LLM: ${schemaName}.${tableName}.${columnName} -> ${referencesSchema}.${referencesTable}.${referencesColumn}`);
      }

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
    // Normalize: strip schema prefix from table names if present (LLM sometimes returns "SCHEMA.TABLE")
    if (targetTableName.includes('.')) {
      const parts = targetTableName.split('.');
      targetSchemaName = parts[0];
      targetTableName = parts[parts.length - 1];
    }

    // Find source table and add to its dependsOn array
    const sourceSchema = state.schemas.find(s => s.name === sourceSchemaName);
    if (sourceSchema) {
      const sourceTable = sourceSchema.tables.find(t => t.name === sourceTableName);
      if (sourceTable) {
        // Check if this dependency already exists (normalize existing entries for comparison)
        const existingDep = sourceTable.dependsOn.find(
          dep => {
            const depTable = dep.table.includes('.') ? dep.table.split('.').pop()! : dep.table;
            return dep.schema === targetSchemaName &&
                   depTable === targetTableName &&
                   dep.column === sourceColumnName;
          }
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
