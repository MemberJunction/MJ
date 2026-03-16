/**
 * Discovery Engine
 * Orchestrates relationship discovery with iterative refinement and backpropagation
 */

import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { PKDetector } from './PKDetector.js';
import { FKDetector } from './FKDetector.js';
import { LLMDiscoveryValidator } from './LLMDiscoveryValidator.js';
import { LLMSanityChecker } from './LLMSanityChecker.js';
import { ColumnStatsCache } from './ColumnStatsCache.js';
import { SchemaDefinition, TableDefinition, DatabaseDocumentation } from '../types/state.js';
import {
  RelationshipDiscoveryPhase,
  RelationshipDiscoveryIteration,
  PKCandidate,
  FKCandidate,
  DiscoveryTriggerAnalysis
} from '../types/discovery.js';
import { RelationshipDiscoveryConfig, AIConfig } from '../types/config.js';

export interface DiscoveryEngineOptions {
  driver: BaseAutoDocDriver;
  config: RelationshipDiscoveryConfig;
  aiConfig: AIConfig;
  schemas: SchemaDefinition[];
  onProgress?: (message: string, data?: any) => void;
  onCheckpoint?: (phase: RelationshipDiscoveryPhase) => Promise<void>;
}

export interface DiscoveryResult {
  phase: RelationshipDiscoveryPhase;
  guardrailsReached: boolean;
  guardrailReason?: string;
  statsCache: ColumnStatsCache; // Return the stats cache for persistence
}

export class DiscoveryEngine {
  private driver: BaseAutoDocDriver;
  private config: RelationshipDiscoveryConfig;
  private aiConfig: AIConfig;
  private schemas: SchemaDefinition[];
  private onProgress: (message: string, data?: any) => void;
  private onCheckpoint: (phase: RelationshipDiscoveryPhase) => Promise<void>;
  private statsCache: ColumnStatsCache;
  private pkDetector: PKDetector;
  private fkDetector: FKDetector;
  private llmValidator?: LLMDiscoveryValidator;
  private sanityChecker?: LLMSanityChecker;

  constructor(options: DiscoveryEngineOptions) {
    this.driver = options.driver;
    this.config = options.config;
    this.aiConfig = options.aiConfig;
    this.schemas = options.schemas;
    this.onProgress = options.onProgress || (() => {});
    this.onCheckpoint = options.onCheckpoint || (async () => {});

    // Create stats cache and detectors
    this.statsCache = new ColumnStatsCache();
    this.pkDetector = new PKDetector(this.driver, this.config, this.statsCache);
    this.fkDetector = new FKDetector(this.driver, this.config, this.statsCache);

    // Create LLM sanity checker (runs once after statistical detection)
    this.sanityChecker = new LLMSanityChecker(this.aiConfig, this.statsCache);

    // Create LLM validator if enabled (runs per-table validation)
    if (this.config.llmValidation?.enabled) {
      this.llmValidator = new LLMDiscoveryValidator(
        this.driver,
        this.config,
        this.aiConfig,
        this.statsCache,
        this.schemas
      );
    }
  }

  /**
   * Get the column statistics cache
   */
  public getStatsCache(): ColumnStatsCache {
    return this.statsCache;
  }

  /**
   * Analyze if discovery should be triggered based on schema state
   */
  public analyzeTrigger(): DiscoveryTriggerAnalysis {
    let totalTables = 0;
    let tablesWithPK = 0;
    let totalFKs = 0;

    for (const schema of this.schemas) {
      totalTables += schema.tables.length;

      for (const table of schema.tables) {
        // Check if table has PK
        const hasPK = table.columns.some(col => col.isPrimaryKey);
        if (hasPK) {
          tablesWithPK++;
        }

        // Count FKs
        totalFKs += table.columns.filter(col => col.isForeignKey).length;
      }
    }

    const tablesWithoutPK = totalTables - tablesWithPK;

    // Heuristic: expect at least 0.3 FKs per table on average
    const expectedMinFKs = Math.floor(totalTables * 0.3);
    const fkDeficit = Math.max(0, expectedMinFKs - totalFKs);
    const fkDeficitPercentage = expectedMinFKs > 0 ? fkDeficit / expectedMinFKs : 0;

    // Determine if discovery should run
    let shouldRun = false;
    let reason = '';

    if (tablesWithoutPK > 0 && this.config.triggers.runOnMissingPKs) {
      shouldRun = true;
      reason = `${tablesWithoutPK} table(s) missing primary keys`;
    }

    if (fkDeficitPercentage >= this.config.triggers.fkDeficitThreshold &&
        this.config.triggers.runOnInsufficientFKs) {
      shouldRun = true;
      if (reason) {
        reason += ` and FK deficit of ${(fkDeficitPercentage * 100).toFixed(1)}%`;
      } else {
        reason = `FK deficit of ${(fkDeficitPercentage * 100).toFixed(1)}% (${totalFKs}/${expectedMinFKs})`;
      }
    }

    return {
      shouldRun,
      reason: shouldRun ? reason : 'Discovery not needed - schema is well-defined',
      details: {
        totalTables,
        tablesWithPK,
        tablesWithoutPK,
        totalFKs,
        expectedMinFKs,
        fkDeficit,
        fkDeficitPercentage
      }
    };
  }

  /**
   * Execute the discovery process
   */
  public async discover(
    maxTokens: number,
    triggerAnalysis: DiscoveryTriggerAnalysis,
    existingPhase?: RelationshipDiscoveryPhase
  ): Promise<DiscoveryResult> {
    // Resume from existing phase if provided, otherwise start fresh
    const phase: RelationshipDiscoveryPhase = existingPhase || this.initializePhase(maxTokens, triggerAnalysis);

    if (existingPhase) {
      this.onProgress('Resuming relationship discovery', {
        maxTokens,
        existingPKs: phase.discovered.primaryKeys.length,
        existingFKs: phase.discovered.foreignKeys.length,
        priorTokensUsed: phase.tokenBudget.used
      });
    } else {
      this.onProgress('Starting relationship discovery', {
        maxTokens,
        trigger: triggerAnalysis.reason
      });
    }

    let iteration = existingPhase ? (existingPhase.iterations.length + 1) : 1;
    let tokensUsed = existingPhase ? existingPhase.tokenBudget.used : 0;
    let guardrailsReached = false;
    let guardrailReason: string | undefined;

    while (iteration <= this.config.backpropagation.maxIterations) {
      // Check guardrails before starting iteration
      const guardrailCheck = this.checkGuardrails(tokensUsed, maxTokens, iteration);
      if (!guardrailCheck.canContinue) {
        guardrailsReached = true;
        guardrailReason = guardrailCheck.reason;
        this.onProgress('Guardrails reached', { reason: guardrailReason });
        break;
      }

      this.onProgress(`Discovery iteration ${iteration}`, { tokensUsed, maxTokens });

      // Execute iteration
      const iterationResult = await this.executeIteration(
        iteration,
        phase,
        maxTokens - tokensUsed
      );

      phase.iterations.push(iterationResult);
      tokensUsed += iterationResult.tokensUsed;
      phase.tokenBudget.used = tokensUsed;
      phase.tokenBudget.remaining = maxTokens - tokensUsed;

      // Update phase discoveries
      this.mergeDiscoveries(phase, iterationResult);

      this.onProgress(`Iteration ${iteration} complete`, {
        newPKs: iterationResult.discoveries.newPKs.length,
        newFKs: iterationResult.discoveries.newFKs.length,
        tokensUsed: iterationResult.tokensUsed
      });

      // Check if we should continue
      const shouldContinue = this.shouldContinueDiscovery(iterationResult, phase, iteration);
      if (!shouldContinue) {
        this.onProgress('Discovery converged - no significant changes detected');
        break;
      }

      iteration++;
    }

    // Finalize phase
    phase.completedAt = new Date().toISOString();
    this.calculateSummary(phase);

    this.onProgress('Discovery complete', {
      iterations: phase.iterations.length,
      tokensUsed,
      pksDiscovered: phase.discovered.primaryKeys.length,
      fksDiscovered: phase.discovered.foreignKeys.length
    });

    return {
      phase,
      guardrailsReached,
      guardrailReason,
      statsCache: this.statsCache
    };
  }

  /**
   * Initialize discovery phase
   */
  private initializePhase(
    maxTokens: number,
    triggerAnalysis: DiscoveryTriggerAnalysis
  ): RelationshipDiscoveryPhase {
    const triggerReason = this.determineTriggerReason(triggerAnalysis);

    return {
      triggered: true,
      triggerReason,
      triggerDetails: {
        tablesWithoutPK: triggerAnalysis.details.tablesWithoutPK,
        expectedFKs: triggerAnalysis.details.expectedMinFKs,
        actualFKs: triggerAnalysis.details.totalFKs,
        fkDeficitPercentage: triggerAnalysis.details.fkDeficitPercentage
      },
      startedAt: new Date().toISOString(),
      tokenBudget: {
        allocated: maxTokens,
        used: 0,
        remaining: maxTokens
      },
      iterations: [],
      discovered: {
        primaryKeys: [],
        foreignKeys: []
      },
      progress: {
        pkTablesAnalyzed: [],
        fkTablesAnalyzed: [],
        llmValidated: false,
        sanityChecked: false
      },
      schemaEnhancements: {
        pkeysAdded: 0,
        fkeysAdded: 0,
        overallConfidence: 0
      },
      feedbackFromAnalysis: [],
      summary: {
        totalTablesAnalyzed: 0,
        tablesWithDiscoveredPKs: 0,
        relationshipsDiscovered: 0,
        averageConfidence: 0,
        highConfidenceCount: 0,
        mediumConfidenceCount: 0,
        lowConfidenceCount: 0,
        rejectedCount: 0
      }
    };
  }

  /**
   * Determine trigger reason from analysis
   */
  private determineTriggerReason(
    analysis: DiscoveryTriggerAnalysis
  ): 'missing_pks' | 'insufficient_fks' | 'both' | 'manual' {
    const hasMissingPKs = analysis.details.tablesWithoutPK > 0;
    const hasInsufficientFKs = analysis.details.fkDeficitPercentage >= this.config.triggers.fkDeficitThreshold;

    if (hasMissingPKs && hasInsufficientFKs) {
      return 'both';
    } else if (hasMissingPKs) {
      return 'missing_pks';
    } else if (hasInsufficientFKs) {
      return 'insufficient_fks';
    } else {
      return 'manual';
    }
  }

  /**
   * Execute a single discovery iteration
   */
  private async executeIteration(
    iteration: number,
    phase: RelationshipDiscoveryPhase,
    remainingTokens: number
  ): Promise<RelationshipDiscoveryIteration> {
    const startedAt = new Date().toISOString();
    const iterationResult: RelationshipDiscoveryIteration = {
      iteration,
      phase: 'sampling',
      startedAt,
      completedAt: '',
      tokensUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      discoveries: {
        newPKs: [],
        newFKs: [],
        validated: [],
        rejected: [],
        confidenceChanges: []
      },
      backpropTriggered: false
    };

    // Phase 1: PK Detection
    iterationResult.phase = 'pk_detection';
    let newPKs = await this.detectPrimaryKeys(iteration, phase);
    iterationResult.discoveries.newPKs = newPKs;

    // Checkpoint after PK detection — save PK results before slow FK phase
    this.mergeDiscoveries(phase, iterationResult);
    await this.onCheckpoint(phase);

    this.onProgress(`Detected ${newPKs.length} PK candidates`, {
      iteration,
      candidates: newPKs.map(pk => `${pk.schemaName}.${pk.tableName}.${pk.columnNames.join('+')}`).slice(0, 5)
    });

    // Phase 2: FK Detection
    iterationResult.phase = 'fk_detection';
    const allPKs = [...phase.discovered.primaryKeys, ...newPKs];
    let newFKs = await this.detectForeignKeys(iteration, phase, allPKs);

    // Checkpoint after FK detection — save before LLM phases
    iterationResult.discoveries.newFKs = newFKs;
    this.mergeDiscoveries(phase, iterationResult);
    await this.onCheckpoint(phase);

    this.onProgress(`Detected ${newFKs.length} FK candidates (pre-sanity)`, {
      iteration,
      candidates: newFKs.map(fk =>
        `${fk.schemaName}.${fk.sourceTable}.${fk.sourceColumn} -> ${fk.targetSchema}.${fk.targetTable}.${fk.targetColumn}`
      ).slice(0, 5)
    });

    // Phase 2.5: LLM Sanity Check (FIRST TIME ONLY - reject obviously wrong candidates)
    if (this.sanityChecker && iteration === 1 && (newPKs.length > 0 || newFKs.length > 0)) {
      iterationResult.phase = 'sanity_check';

      this.onProgress('Running LLM sanity check for obvious errors', {
        pkCandidates: newPKs.length,
        fkCandidates: newFKs.length
      });

      const sanityResult = await this.sanityChecker.reviewCandidates(newPKs, newFKs);
      iterationResult.tokensUsed += sanityResult.tokensUsed;
      iterationResult.inputTokens += sanityResult.inputTokens || 0;
      iterationResult.outputTokens += sanityResult.outputTokens || 0;

      // Remove invalid PKs
      if (sanityResult.invalidPKs.length > 0) {
        console.log(`[DiscoveryEngine] Sanity check rejecting ${sanityResult.invalidPKs.length} PKs:`);
        for (const invalid of sanityResult.invalidPKs) {
          console.log(`  - ${invalid.schema}.${invalid.table}.${invalid.column}: ${invalid.reason}`);
        }

        newPKs = newPKs.filter(pk => {
          return !sanityResult.invalidPKs.some(invalid =>
            invalid.schema === pk.schemaName &&
            invalid.table === pk.tableName &&
            pk.columnNames.includes(invalid.column)
          );
        });
      }

      // Remove invalid FKs
      if (sanityResult.invalidFKs.length > 0) {
        console.log(`[DiscoveryEngine] Sanity check rejecting ${sanityResult.invalidFKs.length} FKs:`);
        for (const invalid of sanityResult.invalidFKs) {
          console.log(`  - ${invalid.schema}.${invalid.table}.${invalid.column}: ${invalid.reason}`);
        }

        newFKs = newFKs.filter(fk => {
          return !sanityResult.invalidFKs.some(invalid =>
            invalid.schema === fk.schemaName &&
            invalid.table === fk.sourceTable &&
            invalid.column === fk.sourceColumn
          );
        });
      }

      // Log suggestions
      if (sanityResult.suggestions.length > 0) {
        console.log(`[DiscoveryEngine] Sanity check suggestions:`);
        for (const suggestion of sanityResult.suggestions) {
          console.log(`  - ${suggestion}`);
        }
      }

      this.onProgress(`Sanity check complete`, {
        invalidPKs: sanityResult.invalidPKs.length,
        invalidFKs: sanityResult.invalidFKs.length,
        finalPKs: newPKs.length,
        finalFKs: newFKs.length,
        tokensUsed: sanityResult.tokensUsed
      });

      // Update discoveries
      iterationResult.discoveries.newPKs = newPKs;
      iterationResult.discoveries.newFKs = newFKs;
    }

    // Phase 3: LLM Validation (if enabled and we have candidates or need validation)
    if (this.llmValidator && (newPKs.length > 0 || newFKs.length > 0)) {
      iterationResult.phase = 'llm_validation';

      this.onProgress('Starting LLM validation', {
        pkCandidates: newPKs.length,
        fkCandidates: newFKs.length,
        tokensRemaining: remainingTokens - iterationResult.tokensUsed
      });

      const validationResults = await this.performLLMValidation(
        newPKs,
        newFKs,
        allPKs,
        iterationResult,
        remainingTokens - iterationResult.tokensUsed
      );

      // Update candidates based on LLM feedback
      newPKs = validationResults.updatedPKs;
      newFKs = validationResults.updatedFKs;
      iterationResult.tokensUsed += validationResults.tokensUsed;

      this.onProgress(`LLM validation complete`, {
        tokensUsed: validationResults.tokensUsed,
        validated: validationResults.validated.length,
        rejected: validationResults.rejected.length,
        finalPKs: newPKs.length,
        finalFKs: newFKs.length
      });

      iterationResult.discoveries.validated = validationResults.validated;
      iterationResult.discoveries.rejected = validationResults.rejected;
      iterationResult.discoveries.newPKs = newPKs;
      iterationResult.discoveries.newFKs = newFKs;
    }

    // Phase 4: Backpropagation check
    iterationResult.phase = 'backprop';
    const backpropCheck = this.shouldTriggerBackprop(iterationResult, phase);
    iterationResult.backpropTriggered = backpropCheck.shouldTrigger;
    iterationResult.backpropReason = backpropCheck.reason;

    if (backpropCheck.shouldTrigger && this.config.backpropagation.enabled) {
      this.onProgress('Backpropagation triggered', { reason: backpropCheck.reason });

      // Re-analyze affected tables with new relationship context
      const confidenceChanges = await this.performBackpropagation(
        phase,
        newPKs,
        newFKs
      );
      iterationResult.discoveries.confidenceChanges = confidenceChanges;
    }

    iterationResult.completedAt = new Date().toISOString();
    return iterationResult;
  }

  /**
   * Detect primary keys in all tables without PKs
   */
  private async detectPrimaryKeys(
    iteration: number,
    phase: RelationshipDiscoveryPhase
  ): Promise<PKCandidate[]> {
    const allPKs: PKCandidate[] = [];
    // Initialize progress tracking if not present (resume support)
    if (!phase.progress) {
      phase.progress = { pkTablesAnalyzed: [], fkTablesAnalyzed: [], llmValidated: false, sanityChecked: false };
    }
    const alreadyAnalyzed = new Set<string>(phase.progress.pkTablesAnalyzed || []);

    // Build list of tables that need PK detection (skip already-analyzed on resume)
    const tablesToAnalyze: Array<{ schema: string; table: TableDefinition }> = [];
    for (const schema of this.schemas) {
      for (const table of schema.tables) {
        const tableKey = `${schema.name}.${table.name}`;
        const hasExistingPK = table.columns.some(col => col.isPrimaryKey);
        const hasDiscoveredPK = phase.discovered.primaryKeys.some(
          pk => pk.schemaName === schema.name && pk.tableName === table.name
        );
        if (!hasExistingPK && !hasDiscoveredPK && !alreadyAnalyzed.has(tableKey)) {
          tablesToAnalyze.push({ schema: schema.name, table });
        }
      }
    }

    const total = tablesToAnalyze.length;
    if (alreadyAnalyzed.size > 0) {
      this.onProgress(`PK detection: ${total} tables remaining (${alreadyAnalyzed.size} already done from prior run)`);
    } else {
      this.onProgress(`PK detection: ${total} tables to analyze`);
    }

    for (let i = 0; i < tablesToAnalyze.length; i++) {
      const { schema, table } = tablesToAnalyze[i];
      const tableKey = `${schema}.${table.name}`;

      if (i % 10 === 0 || i === total - 1) {
        this.onProgress(`PK detection: ${i + 1}/${total} tables (${tableKey})`);
      }

      const candidates = await this.pkDetector.detectPKCandidates(
        schema,
        table,
        iteration
      );

      // Merge into phase immediately so checkpoints include in-progress discoveries
      for (const pk of candidates) {
        const exists = phase.discovered.primaryKeys.some(existing =>
          existing.schemaName === pk.schemaName &&
          existing.tableName === pk.tableName &&
          existing.columnNames.join(',') === pk.columnNames.join(',')
        );
        if (!exists) {
          phase.discovered.primaryKeys.push(pk);
        }
      }
      allPKs.push(...candidates);

      // Track this table as analyzed for resume
      phase.progress!.pkTablesAnalyzed!.push(tableKey);

      // Save after every 10 tables during PK detection
      if ((i + 1) % 10 === 0 || i === total - 1) {
        await this.onCheckpoint(phase);
      }
    }

    this.onProgress(`PK detection complete: ${allPKs.length} candidates from ${total} tables`);
    return allPKs;
  }

  /**
   * Detect foreign keys across all schemas
   */
  private async detectForeignKeys(
    iteration: number,
    phase: RelationshipDiscoveryPhase,
    discoveredPKs: PKCandidate[]
  ): Promise<FKCandidate[]> {
    const allFKs: FKCandidate[] = [];

    // Initialize progress tracking if not present (resume support)
    if (!phase.progress) {
      phase.progress = { pkTablesAnalyzed: [], fkTablesAnalyzed: [], llmValidated: false, sanityChecked: false };
    }
    const alreadyAnalyzed = new Set<string>(phase.progress.fkTablesAnalyzed || []);

    // Build flat list, skipping already-analyzed tables on resume
    const allTables: Array<{ schema: string; table: TableDefinition }> = [];
    for (const schema of this.schemas) {
      for (const table of schema.tables) {
        const tableKey = `${schema.name}.${table.name}`;
        if (!alreadyAnalyzed.has(tableKey)) {
          allTables.push({ schema: schema.name, table });
        }
      }
    }

    const total = allTables.length;
    if (alreadyAnalyzed.size > 0) {
      this.onProgress(`FK detection: ${total} tables remaining (${alreadyAnalyzed.size} already done from prior run)`);
    } else {
      this.onProgress(`FK detection: ${total} tables to analyze against ${discoveredPKs.length} PK candidates`);
    }

    for (let i = 0; i < allTables.length; i++) {
      const { schema, table } = allTables[i];
      const tableKey = `${schema}.${table.name}`;

      if (i % 5 === 0 || i === total - 1) {
        this.onProgress(`FK detection: ${i + 1}/${total} tables (${schema}.${table.name}), ${allFKs.length} candidates so far`);
      }

      const candidates = await this.fkDetector.detectFKCandidates(
        this.schemas,
        schema,
        table,
        discoveredPKs,
        iteration
      );

      // Filter out duplicates (already discovered FKs)
      const newCandidates = candidates.filter(newFK =>
        !phase.discovered.foreignKeys.some(existingFK =>
          existingFK.schemaName === newFK.schemaName &&
          existingFK.sourceTable === newFK.sourceTable &&
          existingFK.sourceColumn === newFK.sourceColumn &&
          existingFK.targetSchema === newFK.targetSchema &&
          existingFK.targetTable === newFK.targetTable &&
          existingFK.targetColumn === newFK.targetColumn
        )
      );

      // Merge into phase immediately so checkpoints include in-progress discoveries
      for (const fk of newCandidates) {
        const exists = phase.discovered.foreignKeys.some(existing =>
          existing.schemaName === fk.schemaName &&
          existing.sourceTable === fk.sourceTable &&
          existing.sourceColumn === fk.sourceColumn &&
          existing.targetSchema === fk.targetSchema &&
          existing.targetTable === fk.targetTable &&
          existing.targetColumn === fk.targetColumn
        );
        if (!exists) {
          phase.discovered.foreignKeys.push(fk);
        }
      }
      allFKs.push(...newCandidates);

      // Track this table as analyzed for resume
      phase.progress!.fkTablesAnalyzed!.push(tableKey);

      // Save after every table during FK detection (each table can take 20-30s)
      await this.onCheckpoint(phase);
    }

    this.onProgress(`FK detection complete: ${allFKs.length} candidates from ${total} tables`);
    return allFKs;
  }

  /**
   * Perform LLM validation on PK/FK candidates
   */
  private async performLLMValidation(
    pkCandidates: PKCandidate[],
    fkCandidates: FKCandidate[],
    allPKs: PKCandidate[],
    iteration: RelationshipDiscoveryIteration,
    remainingTokens: number
  ): Promise<{
    updatedPKs: PKCandidate[];
    updatedFKs: FKCandidate[];
    validated: string[];
    rejected: string[];
    tokensUsed: number;
  }> {
    if (!this.llmValidator) {
      return {
        updatedPKs: pkCandidates,
        updatedFKs: fkCandidates,
        validated: [],
        rejected: [],
        tokensUsed: 0
      };
    }

    const updatedPKs = [...pkCandidates];
    const updatedFKs = [...fkCandidates];
    const validated: string[] = [];
    const rejected: string[] = [];
    let tokensUsed = 0;

    // Group candidates by table for efficient validation
    const tableMap = new Map<string, { pks: PKCandidate[]; fks: FKCandidate[] }>();

    for (const pk of pkCandidates) {
      const key = `${pk.schemaName}.${pk.tableName}`;
      if (!tableMap.has(key)) {
        tableMap.set(key, { pks: [], fks: [] });
      }
      tableMap.get(key)!.pks.push(pk);
    }

    for (const fk of fkCandidates) {
      const key = `${fk.schemaName}.${fk.sourceTable}`;
      if (!tableMap.has(key)) {
        tableMap.set(key, { pks: [], fks: [] });
      }
      tableMap.get(key)!.fks.push(fk);
    }

    // Validate each table's candidates
    for (const [tableKey, candidates] of tableMap.entries()) {
      if (tokensUsed >= remainingTokens) {
        this.onProgress('Token budget exhausted during LLM validation');
        break;
      }

      const [schemaName, tableName] = tableKey.split('.');
      this.onProgress(`Validating ${tableKey}`, {
        pks: candidates.pks.length,
        fks: candidates.fks.length
      });

      try {
        const result = await this.llmValidator.validateTableRelationships(
          schemaName,
          tableName,
          candidates.pks,
          candidates.fks
        );

        tokensUsed += result.tokensUsed;
        iteration.inputTokens += result.inputTokens || 0;
        iteration.outputTokens += result.outputTokens || 0;

        if (!result.validated) {
          this.onProgress(`LLM validation failed for ${tableKey}: ${result.reasoning}`);
          continue;
        }

        // Process LLM recommendations — enforce eligibility constraints
        for (const rec of result.recommendations) {
          const recId = `${rec.target}:${rec.schemaName}.${rec.tableName}.${rec.columnName}`;

          // Gate: LLM cannot add or confirm PKs/FKs for ineligible columns
          if ((rec.type === 'confirm' || rec.type === 'add_new') && rec.columnName) {
            if (rec.target === 'pk') {
              const eligible = this.pkDetector.getPKEligibleColumns(
                rec.schemaName || schemaName, rec.tableName || tableName
              );
              if (!eligible.includes(rec.columnName)) {
                console.log(`[DiscoveryEngine] BLOCKED LLM ${rec.type} PK for ${rec.columnName} — not PK-eligible (must have zero nulls, zero blanks, 100% unique)`);
                continue;
              }
            } else if (rec.target === 'fk') {
              const eligible = this.fkDetector.getFKEligibleColumns(
                rec.schemaName || schemaName, rec.tableName || tableName
              );
              if (!eligible.includes(rec.columnName)) {
                console.log(`[DiscoveryEngine] BLOCKED LLM ${rec.type} FK for ${rec.columnName} — not FK-eligible (non-key data type or values don't look like keys)`);
                continue;
              }
            }
          }

          if (rec.type === 'confirm') {
            validated.push(recId);

            // Mark as validated and potentially boost confidence
            if (rec.target === 'pk') {
              const pk = updatedPKs.find(p =>
                p.schemaName === rec.schemaName &&
                p.tableName === rec.tableName &&
                p.columnNames.includes(rec.columnName!)
              );
              if (pk) {
                pk.validatedByLLM = true;
                pk.confidence = Math.min(pk.confidence + 15, 100); // Boost confidence
              }
            } else if (rec.target === 'fk') {
              const fk = updatedFKs.find(f =>
                f.schemaName === rec.schemaName &&
                f.sourceTable === rec.tableName &&
                f.sourceColumn === rec.columnName!
              );
              if (fk) {
                fk.validatedByLLM = true;
                fk.confidence = Math.min(fk.confidence + 20, 100); // Bigger boost for FKs
              }
            }
          } else if (rec.type === 'reject') {
            rejected.push(recId);

            // Remove or downgrade confidence
            if (rec.target === 'pk') {
              const pkIndex = updatedPKs.findIndex(p =>
                p.schemaName === rec.schemaName &&
                p.tableName === rec.tableName &&
                p.columnNames.includes(rec.columnName!)
              );
              if (pkIndex >= 0) {
                updatedPKs[pkIndex].status = 'rejected';
                updatedPKs.splice(pkIndex, 1); // Remove rejected
              }
            } else if (rec.target === 'fk') {
              const fkIndex = updatedFKs.findIndex(f =>
                f.schemaName === rec.schemaName &&
                f.sourceTable === rec.tableName &&
                f.sourceColumn === rec.columnName!
              );
              if (fkIndex >= 0) {
                updatedFKs[fkIndex].status = 'rejected';
                updatedFKs.splice(fkIndex, 1); // Remove rejected
              }
            }
          }
        }

        this.onProgress(`Validated ${tableKey}`, {
          reasoning: result.reasoning.substring(0, 100) + '...'
        });

      } catch (error) {
        this.onProgress(`Error validating ${tableKey}: ${(error as Error).message}`);
      }
    }

    return {
      updatedPKs,
      updatedFKs,
      validated,
      rejected,
      tokensUsed
    };
  }

  /**
   * Check if backpropagation should be triggered
   */
  private shouldTriggerBackprop(
    iteration: RelationshipDiscoveryIteration,
    phase: RelationshipDiscoveryPhase
  ): { shouldTrigger: boolean; reason?: string } {
    // Don't trigger on first iteration
    if (iteration.iteration === 1) {
      return { shouldTrigger: false };
    }

    // Check if significant new discoveries were made
    const significantPKs = iteration.discoveries.newPKs.filter(pk => pk.confidence >= 80).length;
    const significantFKs = iteration.discoveries.newFKs.filter(fk => fk.confidence >= 80).length;

    if (significantPKs > 0 || significantFKs > 0) {
      return {
        shouldTrigger: true,
        reason: `Discovered ${significantPKs} high-confidence PKs and ${significantFKs} high-confidence FKs`
      };
    }

    return { shouldTrigger: false };
  }

  /**
   * Perform backpropagation to update confidence scores
   */
  private async performBackpropagation(
    phase: RelationshipDiscoveryPhase,
    newPKs: PKCandidate[],
    newFKs: FKCandidate[]
  ): Promise<Array<{ id: string; oldConfidence: number; newConfidence: number; reason: string }>> {
    const changes: Array<{
      id: string;
      oldConfidence: number;
      newConfidence: number;
      reason: string;
    }> = [];

    // Update FK confidence if their target is now a confirmed PK
    for (const fk of phase.discovered.foreignKeys) {
      const targetIsNowPK = newPKs.some(pk =>
        pk.schemaName === fk.targetSchema &&
        pk.tableName === fk.targetTable &&
        pk.columnNames.includes(fk.targetColumn) &&
        pk.confidence >= 80
      );

      if (targetIsNowPK && fk.confidence < 90) {
        const oldConfidence = fk.confidence;
        // Boost FK confidence if pointing to a confirmed PK
        fk.confidence = Math.min(fk.confidence + 15, 95);

        changes.push({
          id: `${fk.schemaName}.${fk.sourceTable}.${fk.sourceColumn}`,
          oldConfidence,
          newConfidence: fk.confidence,
          reason: 'Target column confirmed as PK'
        });
      }
    }

    // Update PK confidence if columns have FKs pointing to them
    for (const pk of phase.discovered.primaryKeys) {
      const incomingFKs = newFKs.filter(fk =>
        fk.targetSchema === pk.schemaName &&
        fk.targetTable === pk.tableName &&
        pk.columnNames.includes(fk.targetColumn)
      ).length;

      if (incomingFKs > 0 && pk.confidence < 95) {
        const oldConfidence = pk.confidence;
        // Boost PK confidence if other tables reference it
        pk.confidence = Math.min(pk.confidence + (incomingFKs * 5), 95);

        changes.push({
          id: `${pk.schemaName}.${pk.tableName}.${pk.columnNames.join('+')}`,
          oldConfidence,
          newConfidence: pk.confidence,
          reason: `${incomingFKs} FK(s) now reference this column`
        });
      }
    }

    return changes;
  }

  /**
   * Merge iteration discoveries into phase
   */
  private mergeDiscoveries(
    phase: RelationshipDiscoveryPhase,
    iteration: RelationshipDiscoveryIteration
  ): void {
    // Add new PKs (no duplicates)
    for (const newPK of iteration.discoveries.newPKs) {
      const exists = phase.discovered.primaryKeys.some(pk =>
        pk.schemaName === newPK.schemaName &&
        pk.tableName === newPK.tableName &&
        pk.columnNames.join(',') === newPK.columnNames.join(',')
      );

      if (!exists) {
        phase.discovered.primaryKeys.push(newPK);
      }
    }

    // Add new FKs (no duplicates)
    for (const newFK of iteration.discoveries.newFKs) {
      const exists = phase.discovered.foreignKeys.some(fk =>
        fk.schemaName === newFK.schemaName &&
        fk.sourceTable === newFK.sourceTable &&
        fk.sourceColumn === newFK.sourceColumn &&
        fk.targetSchema === newFK.targetSchema &&
        fk.targetTable === newFK.targetTable &&
        fk.targetColumn === newFK.targetColumn
      );

      if (!exists) {
        phase.discovered.foreignKeys.push(newFK);
      }
    }
  }

  /**
   * Check if discovery should continue
   */
  private shouldContinueDiscovery(
    iteration: RelationshipDiscoveryIteration,
    phase: RelationshipDiscoveryPhase,
    iterationNumber: number
  ): boolean {
    // Always run at least 2 iterations
    if (iterationNumber < 2) {
      return true;
    }

    // Stop if no new discoveries
    if (iteration.discoveries.newPKs.length === 0 &&
        iteration.discoveries.newFKs.length === 0 &&
        iteration.discoveries.confidenceChanges.length === 0) {
      return false;
    }

    // Stop if only low-confidence discoveries
    const hasHighConfidenceDiscoveries =
      iteration.discoveries.newPKs.some(pk => pk.confidence >= 70) ||
      iteration.discoveries.newFKs.some(fk => fk.confidence >= 60);

    if (!hasHighConfidenceDiscoveries) {
      return false;
    }

    return true;
  }

  /**
   * Check guardrails
   */
  private checkGuardrails(
    tokensUsed: number,
    maxTokens: number,
    iteration: number
  ): { canContinue: boolean; reason?: string } {
    // Check token budget
    if (tokensUsed >= maxTokens) {
      return {
        canContinue: false,
        reason: `Token budget exhausted (${tokensUsed}/${maxTokens})`
      };
    }

    // Check max iterations
    if (iteration > this.config.backpropagation.maxIterations) {
      return {
        canContinue: false,
        reason: `Max iterations reached (${this.config.backpropagation.maxIterations})`
      };
    }

    // Check if we're within warning threshold (80%)
    const tokenPercentage = tokensUsed / maxTokens;
    if (tokenPercentage > 0.8) {
      this.onProgress('Warning: Token budget 80% consumed', {
        used: tokensUsed,
        total: maxTokens
      });
    }

    return { canContinue: true };
  }

  /**
   * Calculate final summary statistics
   */
  private calculateSummary(phase: RelationshipDiscoveryPhase): void {
    const allPKs = phase.discovered.primaryKeys;
    const allFKs = phase.discovered.foreignKeys;
    const allDiscoveries = [...allPKs, ...allFKs];

    // Count by confidence level
    const highConfidence = allDiscoveries.filter(d => d.confidence >= 80).length;
    const mediumConfidence = allDiscoveries.filter(d => d.confidence >= 50 && d.confidence < 80).length;
    const lowConfidence = allDiscoveries.filter(d => d.confidence < 50).length;
    const rejected = allDiscoveries.filter(d => d.status === 'rejected').length;

    // Calculate average confidence
    const totalConfidence = allDiscoveries.reduce((sum, d) => sum + d.confidence, 0);
    const averageConfidence = allDiscoveries.length > 0
      ? totalConfidence / allDiscoveries.length
      : 0;

    // Count unique tables with discovered PKs
    const tablesWithPKs = new Set(
      allPKs.map(pk => `${pk.schemaName}.${pk.tableName}`)
    ).size;

    // Count total tables analyzed
    const tablesAnalyzed = new Set<string>();
    for (const schema of this.schemas) {
      for (const table of schema.tables) {
        tablesAnalyzed.add(`${schema.name}.${table.name}`);
      }
    }

    phase.summary = {
      totalTablesAnalyzed: tablesAnalyzed.size,
      tablesWithDiscoveredPKs: tablesWithPKs,
      relationshipsDiscovered: allFKs.length,
      averageConfidence: Math.round(averageConfidence),
      highConfidenceCount: highConfidence,
      mediumConfidenceCount: mediumConfidence,
      lowConfidenceCount: lowConfidence,
      rejectedCount: rejected
    };

    phase.schemaEnhancements = {
      pkeysAdded: allPKs.filter(pk => pk.status === 'confirmed').length,
      fkeysAdded: allFKs.filter(fk => fk.status === 'confirmed').length,
      overallConfidence: Math.round(averageConfidence)
    };
  }

  /**
   * Apply discovered relationships to state
   */
  public applyDiscoveriesToState(
    state: DatabaseDocumentation,
    phase: RelationshipDiscoveryPhase
  ): void {
    // Apply high-confidence PKs
    for (const pk of phase.discovered.primaryKeys) {
      if (pk.confidence >= this.config.confidence.primaryKeyMinimum * 100) {
        const schema = state.schemas.find(s => s.name === pk.schemaName);
        if (!schema) continue;

        const table = schema.tables.find(t => t.name === pk.tableName);
        if (!table) continue;

        for (const columnName of pk.columnNames) {
          const column = table.columns.find(c => c.name === columnName);
          if (column) {
            column.isPrimaryKey = true;
          }
        }
      }
    }

    // Apply high-confidence FKs and build table-level dependency graph
    for (const fk of phase.discovered.foreignKeys) {
      if (fk.confidence >= this.config.confidence.foreignKeyMinimum * 100) {
        const schema = state.schemas.find(s => s.name === fk.schemaName);
        if (!schema) continue;

        const table = schema.tables.find(t => t.name === fk.sourceTable);
        if (!table) continue;

        const column = table.columns.find(c => c.name === fk.sourceColumn);
        if (column) {
          column.isForeignKey = true;
          column.foreignKeyReferences = {
            schema: fk.targetSchema,
            table: fk.targetTable,
            column: fk.targetColumn,
            referencedColumn: fk.targetColumn
          };
        }

        // Wire up table-level dependsOn/dependents for topological sorting
        this.addTableDependency(
          state, fk.schemaName, fk.sourceTable,
          fk.targetSchema, fk.targetTable,
          fk.sourceColumn, fk.targetColumn
        );
      }
    }

    // Store discovery phase in state (new phases structure)
    state.phases.keyDetection = phase;
  }

  /**
   * Add a table-level dependency edge (dependsOn/dependents) for FK relationships.
   * Required before topological sorting so the topo sort can build correct levels.
   */
  private addTableDependency(
    state: DatabaseDocumentation,
    sourceSchemaName: string,
    sourceTableName: string,
    targetSchemaName: string,
    targetTableName: string,
    sourceColumnName: string,
    targetColumnName: string
  ): void {
    // Don't create self-dependencies
    if (sourceSchemaName === targetSchemaName && sourceTableName === targetTableName) return;

    // Add to source table's dependsOn
    const sourceSchema = state.schemas.find(s => s.name === sourceSchemaName);
    if (sourceSchema) {
      const sourceTable = sourceSchema.tables.find(t => t.name === sourceTableName);
      if (sourceTable) {
        const alreadyExists = sourceTable.dependsOn.some(
          dep => dep.schema === targetSchemaName &&
                 dep.table === targetTableName &&
                 dep.column === sourceColumnName
        );
        if (!alreadyExists) {
          sourceTable.dependsOn.push({
            schema: targetSchemaName,
            table: targetTableName,
            column: sourceColumnName,
            referencedColumn: targetColumnName
          });
        }
      }
    }

    // Add to target table's dependents
    const targetSchema = state.schemas.find(s => s.name === targetSchemaName);
    if (targetSchema) {
      const targetTable = targetSchema.tables.find(t => t.name === targetTableName);
      if (targetTable) {
        const alreadyExists = targetTable.dependents.some(
          dep => dep.schema === sourceSchemaName &&
                 dep.table === sourceTableName &&
                 dep.column === sourceColumnName
        );
        if (!alreadyExists) {
          targetTable.dependents.push({
            schema: sourceSchemaName,
            table: sourceTableName,
            column: sourceColumnName,
            referencedColumn: targetColumnName
          });
        }
      }
    }
  }
}
