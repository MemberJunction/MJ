/**
 * Discovery Engine
 * Orchestrates relationship discovery with iterative refinement and backpropagation
 */

import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { PKDetector } from './PKDetector.js';
import { FKDetector } from './FKDetector.js';
import { SchemaDefinition, DatabaseDocumentation } from '../types/state.js';
import {
  RelationshipDiscoveryPhase,
  RelationshipDiscoveryIteration,
  PKCandidate,
  FKCandidate,
  DiscoveryTriggerAnalysis
} from '../types/discovery.js';
import { RelationshipDiscoveryConfig } from '../types/config.js';

export interface DiscoveryEngineOptions {
  driver: BaseAutoDocDriver;
  config: RelationshipDiscoveryConfig;
  schemas: SchemaDefinition[];
  onProgress?: (message: string, data?: any) => void;
}

export interface DiscoveryResult {
  phase: RelationshipDiscoveryPhase;
  guardrailsReached: boolean;
  guardrailReason?: string;
}

export class DiscoveryEngine {
  private driver: BaseAutoDocDriver;
  private config: RelationshipDiscoveryConfig;
  private schemas: SchemaDefinition[];
  private onProgress: (message: string, data?: any) => void;
  private pkDetector: PKDetector;
  private fkDetector: FKDetector;

  constructor(options: DiscoveryEngineOptions) {
    this.driver = options.driver;
    this.config = options.config;
    this.schemas = options.schemas;
    this.onProgress = options.onProgress || (() => {});
    this.pkDetector = new PKDetector(this.driver, this.config);
    this.fkDetector = new FKDetector(this.driver, this.config);
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
    triggerAnalysis: DiscoveryTriggerAnalysis
  ): Promise<DiscoveryResult> {
    const phase: RelationshipDiscoveryPhase = this.initializePhase(maxTokens, triggerAnalysis);

    this.onProgress('Starting relationship discovery', {
      maxTokens,
      trigger: triggerAnalysis.reason
    });

    let iteration = 1;
    let tokensUsed = 0;
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
      guardrailReason
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
    const newPKs = await this.detectPrimaryKeys(iteration, phase);
    iterationResult.discoveries.newPKs = newPKs;

    this.onProgress(`Detected ${newPKs.length} PK candidates`, {
      iteration,
      candidates: newPKs.map(pk => `${pk.schemaName}.${pk.tableName}.${pk.columnNames.join('+')}`).slice(0, 5)
    });

    // Phase 2: FK Detection
    iterationResult.phase = 'fk_detection';
    const allPKs = [...phase.discovered.primaryKeys, ...newPKs];
    const newFKs = await this.detectForeignKeys(iteration, phase, allPKs);
    iterationResult.discoveries.newFKs = newFKs;

    this.onProgress(`Detected ${newFKs.length} FK candidates`, {
      iteration,
      candidates: newFKs.map(fk =>
        `${fk.schemaName}.${fk.sourceTable}.${fk.sourceColumn} -> ${fk.targetSchema}.${fk.targetTable}.${fk.targetColumn}`
      ).slice(0, 5)
    });

    // Phase 3: Backpropagation check
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
    const tablesAnalyzed = new Set<string>();

    for (const schema of this.schemas) {
      for (const table of schema.tables) {
        const tableKey = `${schema.name}.${table.name}`;

        // Skip if already has PK or already analyzed
        const hasExistingPK = table.columns.some(col => col.isPrimaryKey);
        const hasDiscoveredPK = phase.discovered.primaryKeys.some(
          pk => pk.schemaName === schema.name && pk.tableName === table.name
        );

        if (hasExistingPK || hasDiscoveredPK || tablesAnalyzed.has(tableKey)) {
          continue;
        }

        // Detect PK candidates for this table
        const candidates = await this.pkDetector.detectPKCandidates(
          schema.name,
          table,
          iteration
        );

        allPKs.push(...candidates);
        tablesAnalyzed.add(tableKey);
      }
    }

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

    for (const schema of this.schemas) {
      for (const table of schema.tables) {
        // Detect FK candidates for this table
        const candidates = await this.fkDetector.detectFKCandidates(
          this.schemas,
          schema.name,
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

        allFKs.push(...newCandidates);
      }
    }

    return allFKs;
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

    // Apply high-confidence FKs
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
      }
    }

    // Store discovery phase in state
    state.relationshipDiscoveryPhase = phase;
  }
}
