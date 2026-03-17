/**
 * Main orchestrator for database analysis
 * Can be used programmatically or via CLI
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { DatabaseConnection, Introspector, DataSampler } from '../database/Database.js';
import { AutoDocConnectionConfig } from '../types/driver.js';
import { TopologicalSorter } from '../database/TopologicalSorter.js';
import { StateManager } from '../state/StateManager.js';
import { IterationTracker } from '../state/IterationTracker.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { AnalysisEngine } from './AnalysisEngine.js';
import { SQLGenerator } from '../generators/SQLGenerator.js';
import { MarkdownGenerator } from '../generators/MarkdownGenerator.js';
import { AdditionalSchemaInfoGenerator } from '../generators/AdditionalSchemaInfoGenerator.js';
import { SampleQueryGenerator } from '../generators/SampleQueryGenerator.js';
import { DBAutoDocConfig } from '../types/config.js';
import { SoftKeysLoader } from '../utils/soft-keys-loader.js';
import { SoftKeysMerger } from '../utils/soft-keys-merger.js';
import { DatabaseDocumentation, AnalysisRun } from '../types/state.js';
import { DiscoveryTriggerAnalyzer } from '../discovery/DiscoveryTriggerAnalyzer.js';
import { DiscoveryEngine } from '../discovery/DiscoveryEngine.js';

export interface AnalysisOptions {
  config: DBAutoDocConfig;
  resumeFromState?: string; // Path to existing state file to resume from
  onProgress?: (message: string, data?: any) => void;
  /** Only re-analyze tables with confidence below this threshold (used with resume) */
  reanalyzeBelowConfidence?: number;
  /** Override max iterations from config for this run */
  maxIterations?: number;
}

export interface OrchestratorResult {
  success: boolean;
  state: DatabaseDocumentation;
  run: AnalysisRun;
  outputFolder: string;
  message?: string;
}

export class AnalysisOrchestrator {
  private config: DBAutoDocConfig;
  private resumeFromState?: string;
  private onProgress: (message: string, data?: any) => void;
  private reanalyzeBelowConfidence?: number;
  private maxIterationsOverride?: number;

  constructor(options: AnalysisOptions) {
    this.config = options.config;
    this.resumeFromState = options.resumeFromState;
    this.onProgress = options.onProgress || (() => {});
    this.reanalyzeBelowConfidence = options.reanalyzeBelowConfidence;
    this.maxIterationsOverride = options.maxIterations;
  }

  /**
   * Execute the full analysis workflow
   */
  public async execute(): Promise<OrchestratorResult> {
    try {
      // Create run folder (or reuse existing one when resuming)
      if (!this.config.output.outputDir) {
        throw new Error('output.outputDir must be specified in config');
      }
      const runFolder = await this.resolveRunFolder(this.config.output.outputDir, this.resumeFromState);
      const stateFilePath = path.join(runFolder, 'state.json');

      this.onProgress('Created run folder', { path: runFolder });

      // Initialize state manager
      const stateManager = new StateManager(stateFilePath);
      let state: DatabaseDocumentation;

      // Load state (either resume or create new)
      if (this.resumeFromState) {
        this.onProgress('Resuming from existing state', { path: this.resumeFromState });
        state = await this.loadAndMergeState(this.resumeFromState, stateManager);
      } else {
        state = await stateManager.load() || stateManager.createInitialState(
          this.config.database.database,
          this.config.database.server
        );
      }

      // Apply seedContext from config to state
      if (this.config.seedContext) {
        state.seedContext = this.config.seedContext;
      }

      // Apply ground truth descriptions to state (these are authoritative)
      this.applyGroundTruth(state, stateManager);

      // If resuming with reanalyzeBelowConfidence, mark low-confidence tables for re-analysis
      if (this.resumeFromState && this.reanalyzeBelowConfidence != null) {
        this.markLowConfidenceForReanalysis(state, this.reanalyzeBelowConfidence);
      }

      // Save initial state immediately so there's always a file on disk
      stateManager.updateSummary(state);
      await stateManager.save(state);

      // Connect to database
      this.onProgress('Connecting to database');
      const driverConfig: AutoDocConnectionConfig = {
        provider: (this.config.database.provider as 'sqlserver' | 'mysql' | 'postgresql' | 'oracle') || 'sqlserver',
        host: this.config.database.server,
        port: this.config.database.port,
        database: this.config.database.database,
        user: this.config.database.user,
        password: this.config.database.password,
        encrypt: this.config.database.encrypt,
        trustServerCertificate: this.config.database.trustServerCertificate,
        connectionTimeout: this.config.database.connectionTimeout,
        requestTimeout: this.config.database.requestTimeout,
        maxConnections: this.config.database.maxConnections,
        minConnections: this.config.database.minConnections,
        idleTimeoutMillis: this.config.database.idleTimeoutMillis
      };

      const db = new DatabaseConnection(driverConfig);
      await db.connect();
      const testResult = await db.test();

      if (!testResult.success) {
        throw new Error(`Database connection failed: ${testResult.message}`);
      }
      this.onProgress('Connected to database', { database: this.config.database.database });

      // Introspect database (unless resuming with existing schema data)
      if (!this.resumeFromState || state.schemas.length === 0) {
        this.onProgress('Introspecting database schema');
        const driver = db.getDriver();
        const introspector = new Introspector(driver);
        const schemas = await introspector.getSchemas(this.config.schemas, this.config.tables);
        state.schemas = schemas;
        this.onProgress('Schema introspection complete', {
          schemas: schemas.length,
          tables: schemas.reduce((sum, s) => sum + s.tables.length, 0)
        });

        // Load existing descriptions from database metadata (MS_Description, etc.)
        this.onProgress('Loading existing database descriptions');
        await this.loadExistingDescriptions(state, db.getDriver(), stateManager);

        // Save state after introspection + existing descriptions
        stateManager.updateSummary(state);
        await stateManager.save(state);

        // Analyze data
        this.onProgress('Analyzing table data');
        const sampler = new DataSampler(driver, this.config.analysis);
        let samplingErrors = 0;
        for (const schema of schemas) {
          for (const table of schema.tables) {
            try {
              await sampler.analyzeTable(schema.name, table.name, table.columns);
            } catch (error) {
              samplingErrors++;
              const errorMsg = `Warning: Failed to analyze data for ${schema.name}.${table.name}: ${(error as Error).message}`;
              console.error(errorMsg);
              this.onProgress(errorMsg, { schema: schema.name, table: table.name, error: (error as Error).message });
              // Continue with next table - partial data better than no data
            }
          }
        }
        this.onProgress('Data analysis complete', {
          tablesAnalyzed: schemas.reduce((sum, s) => sum + s.tables.length, 0) - samplingErrors,
          errors: samplingErrors
        });

        // Save state after sampling
        stateManager.updateSummary(state);
        await stateManager.save(state);

      }

      // Merge soft PK/FK ground truth into state (if configured).
      // Must happen AFTER introspection (so tables exist) but BEFORE discovery trigger
      // (so manual keys are counted as existing PKs/FKs).
      await this.applySoftKeys(state, stateManager);

      // Relationship Discovery Phase (if enabled)
      // Runs on both fresh and resumed runs; resumes from partial progress if interrupted
      const discoveryComplete = state.phases?.keyDetection?.completedAt != null;

      if (this.config.analysis.relationshipDiscovery?.enabled && !discoveryComplete) {
        this.onProgress('Checking if relationship discovery should run');
        const driver = db.getDriver();

        const triggerAnalysis = DiscoveryTriggerAnalyzer.analyzeSchemas(state.schemas);

        if (triggerAnalysis.shouldRun) {
          const isResume = state.phases?.keyDetection?.progress != null;
          if (isResume) {
            this.onProgress('Resuming incomplete relationship discovery', {
              pkTablesAlreadyDone: state.phases.keyDetection!.progress!.pkTablesAnalyzed?.length || 0,
              fkTablesAlreadyDone: state.phases.keyDetection!.progress!.fkTablesAnalyzed?.length || 0,
              existingPKs: state.phases.keyDetection!.discovered.primaryKeys.length,
              existingFKs: state.phases.keyDetection!.discovered.foreignKeys.length
            });
          } else {
            this.onProgress('Relationship discovery triggered', {
              reason: triggerAnalysis.reason,
              tablesWithoutPK: triggerAnalysis.details.tablesWithoutPK,
              actualFKs: triggerAnalysis.details.totalFKs,
              expectedMinFKs: triggerAnalysis.details.expectedMinFKs
            });
          }

          const discoveryEngine = new DiscoveryEngine({
            driver,
            config: this.config.analysis.relationshipDiscovery,
            aiConfig: this.config.ai,
            schemas: state.schemas,
            onProgress: this.onProgress,
            onCheckpoint: async (phase) => {
              state.phases.keyDetection = phase;
              discoveryEngine.applyDiscoveriesToState(state, phase);
              stateManager.updateSummary(state);
              await stateManager.save(state);
            }
          });

          // Calculate token budget for discovery
          const totalTokenBudget = this.config.analysis.guardrails?.maxTokensPerRun;
          const discoveryRatio = this.config.analysis.relationshipDiscovery.tokenBudget?.ratioOfTotal || 0.25;
          const discoveryTokenBudget = totalTokenBudget
            ? Math.floor(totalTokenBudget * discoveryRatio)
            : this.config.analysis.relationshipDiscovery.tokenBudget?.maxTokens || 50000;

          // Pass existing phase for resume, or let discover() create a new one
          const discoveryResult = await discoveryEngine.discover(
            discoveryTokenBudget,
            triggerAnalysis,
            isResume ? state.phases.keyDetection : undefined
          );

          // Save to new phases structure
          state.phases.keyDetection = discoveryResult.phase;

          // Apply discovered relationships to schema
          discoveryEngine.applyDiscoveriesToState(state, discoveryResult.phase);

          // Merge column statistics into schema columns
          discoveryResult.statsCache.mergeIntoSchemas(state.schemas);

          this.onProgress('Relationship discovery complete', {
            primaryKeysDiscovered: discoveryResult.phase.discovered.primaryKeys.length,
            foreignKeysDiscovered: discoveryResult.phase.discovered.foreignKeys.length,
            tokensUsed: discoveryResult.phase.tokenBudget.used,
            guardrailsReached: discoveryResult.guardrailsReached,
            totalSchemas: state.schemas.length
          });

          // Save state with discovery results and stats cache
          stateManager.updateSummary(state);
          await stateManager.save(state);
        } else {
          this.onProgress('Relationship discovery skipped', {
            reason: triggerAnalysis.reason
          });
        }
      } else if (discoveryComplete) {
        this.onProgress('Relationship discovery: using completed results from prior run');
      }

      // Topological sort
      this.onProgress('Computing dependency graph');
      const sorter = new TopologicalSorter();
      const { levels } = sorter.buildAndSort(state.schemas);
      this.onProgress('Dependency graph computed', { levels: levels.length });

      // Initialize analysis components
      const promptsDir = path.join(__dirname, '../../prompts');
      const promptEngine = new PromptEngine(this.config.ai, promptsDir);
      await promptEngine.initialize();

      const iterationTracker = new IterationTracker();
      const analysisEngine = new AnalysisEngine(this.config, promptEngine, stateManager, iterationTracker, this.onProgress);

      // Create analysis run
      const run = stateManager.createAnalysisRun(
        state,
        this.config.ai.model,
        this.config.ai.provider,
        this.config.ai.temperature || 0.1,
        undefined,
        undefined
      );

      // Mark as resumed if applicable
      if (this.resumeFromState) {
        run.resumedFromFile = this.resumeFromState;
        run.resumedAt = new Date().toISOString();
      }

      // Start analysis
      analysisEngine.startAnalysis(run);

      // Main iteration loop
      const maxIterations = this.maxIterationsOverride ?? this.config.analysis.convergence.maxIterations;
      let converged = false;
      let guardrailExceeded = false;
      while (!converged && !guardrailExceeded && run.iterationsPerformed < maxIterations) {
        iterationTracker.incrementIteration(state, run);
        this.onProgress('Starting iteration', { iteration: run.iterationsPerformed });

        // Process each level
        for (let levelNum = 0; levelNum < levels.length; levelNum++) {
          this.onProgress('Processing level', { level: levelNum, tables: levels[levelNum].length });

          const levelResult = await analysisEngine.processLevel(state, run, levelNum, levels[levelNum]);

          if (levelResult.guardrailExceeded) {
            guardrailExceeded = true;
            this.onProgress('Guardrail exceeded — stopping iteration loop');
            break;
          }

          // Dependency-level sanity check
          if (this.config.analysis.sanityChecks.dependencyLevel && levels[levelNum].length > 0) {
            await analysisEngine.performDependencyLevelSanityCheck(state, run, levelNum, levels[levelNum]);
          }

          // Backpropagation
          if (levelResult.triggers.length > 0 && this.config.analysis.backpropagation.enabled) {
            await analysisEngine.executeBackpropagation(state, run, levelResult.triggers);
          }

          // Save state after each level
          stateManager.updateSummary(state);
          await stateManager.save(state);
        }

        if (guardrailExceeded) break;

        // Check convergence
        converged = analysisEngine.checkConvergence(state, run);
        if (converged) {
          this.onProgress('Analysis converged');
        }
      }

      // Sanity checks
      if (this.config.analysis.sanityChecks.schemaLevel) {
        this.onProgress('Performing schema-level sanity checks');
        for (const schema of state.schemas) {
          await analysisEngine.performSchemaLevelSanityCheck(state, run, schema);
        }
      }

      if (this.config.analysis.sanityChecks.crossSchema && state.schemas.length > 1) {
        this.onProgress('Performing cross-schema sanity check');
        await analysisEngine.performCrossSchemaSanityCheck(state, run);
      }

      // Complete run
      if (!converged) {
        const reason = guardrailExceeded
          ? 'Guardrail limit exceeded (duration/tokens/cost)'
          : 'Max iterations reached';
        iterationTracker.completeRun(run, false, reason);
      }

      // Sample Query Generation (if enabled)
      if (this.config.analysis.sampleQueryGeneration?.enabled) {
        this.onProgress('Generating sample queries');
        await this.generateSampleQueries(state, promptEngine, db.getDriver(), stateManager);
        stateManager.updateSummary(state);
        await stateManager.save(state);
      }

      // Final state update
      stateManager.updateSummary(state);
      await stateManager.save(state);

      // Export SQL and Markdown
      this.onProgress('Exporting documentation files');
      const sqlGen = new SQLGenerator();
      const sql = sqlGen.generate(state, {});
      const sqlPath = path.join(runFolder, 'extended-props.sql');
      await fs.writeFile(sqlPath, sql, 'utf-8');

      const mdGen = new MarkdownGenerator();
      const markdown = mdGen.generate(state);
      const mdPath = path.join(runFolder, 'summary.md');
      await fs.writeFile(mdPath, markdown, 'utf-8');

      // Generate additionalSchemaInfo.json for CodeGen soft FK/PK support
      const schemaInfoGen = new AdditionalSchemaInfoGenerator();
      const schemaInfo = schemaInfoGen.generate(state, {});
      const schemaInfoPath = path.join(runFolder, 'additionalSchemaInfo.json');
      await fs.writeFile(schemaInfoPath, schemaInfo, 'utf-8');

      // Close database
      await db.close();

      this.onProgress('Analysis complete', {
        iterations: run.iterationsPerformed,
        tokens: run.totalTokensUsed,
        cost: run.estimatedCost
      });

      return {
        success: true,
        state,
        run,
        outputFolder: runFolder
      };

    } catch (error) {
      return {
        success: false,
        state: {} as DatabaseDocumentation,
        run: {} as AnalysisRun,
        outputFolder: '',
        message: (error as Error).message
      };
    }
  }

  /**
   * Load existing state and prepare for resumption
   */
  private async loadAndMergeState(
    resumePath: string,
    stateManager: StateManager
  ): Promise<DatabaseDocumentation> {
    const existingStateJson = await fs.readFile(resumePath, 'utf-8');
    const existingState = JSON.parse(existingStateJson) as DatabaseDocumentation;

    // Mark that this is a resumed analysis
    existingState.resumedFromFile = resumePath;

    return existingState;
  }

  /**
   * Resolve the run folder: reuse the source folder when resuming from a state file
   * inside an existing run-N directory, otherwise create a new numbered folder.
   */
  private async resolveRunFolder(outputDir: string, resumeFromState?: string): Promise<string> {
    if (resumeFromState) {
      const resumeDir = path.resolve(path.dirname(resumeFromState));
      const folderName = path.basename(resumeDir);
      if (/^run-\d+$/.test(folderName)) {
        // Reuse the existing run folder so resume continues in-place
        await fs.mkdir(resumeDir, { recursive: true });
        return resumeDir;
      }
    }
    return this.createRunFolder(outputDir);
  }

  /**
   * Create run-numbered folder for this analysis run
   */
  private async createRunFolder(outputDir: string): Promise<string> {
    await fs.mkdir(outputDir, { recursive: true });

    // Determine next run number
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    const runNumbers = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const match = e.name.match(/^run-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);

    const nextRunNumber = runNumbers.length > 0 ? Math.max(...runNumbers) + 1 : 1;
    const runFolder = path.join(outputDir, `run-${nextRunNumber}`);

    await fs.mkdir(runFolder, { recursive: true });

    return runFolder;
  }

  /**
   * Load existing descriptions from database metadata (e.g., MS_Description in SQL Server)
   * and use them as initial descriptions for tables and columns.
   */
  private async loadExistingDescriptions(
    state: DatabaseDocumentation,
    driver: import('../drivers/BaseAutoDocDriver.js').BaseAutoDocDriver,
    stateManager: StateManager
  ): Promise<void> {
    let loaded = 0;

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        try {
          const descriptions = await driver.getExistingDescriptions(schema.name, table.name);

          for (const desc of descriptions) {
            if (!desc.description || desc.description.trim().length === 0) continue;

            if (desc.target === 'table') {
              // Only apply if no description exists yet
              if (!table.description) {
                stateManager.updateTableDescription(
                  table,
                  desc.description,
                  'Loaded from existing database metadata',
                  0.5, // Medium confidence since we don't know the quality
                  'existing_db',
                  'existing_db_description'
                );
                loaded++;
              }
            } else if (desc.target === 'column' && desc.targetName) {
              const column = table.columns.find(c => c.name === desc.targetName);
              if (column && !column.description) {
                stateManager.updateColumnDescription(
                  column,
                  desc.description,
                  'Loaded from existing database metadata',
                  'existing_db'
                );
                loaded++;
              }
            }
          }
        } catch (error) {
          // Non-fatal — continue with other tables
          console.warn(`Warning: Could not load existing descriptions for ${schema.name}.${table.name}: ${(error as Error).message}`);
        }
      }
    }

    if (loaded > 0) {
      this.onProgress('Loaded existing descriptions', { descriptionsLoaded: loaded });
    }
  }

  /**
   * Apply ground truth descriptions from config to state.
   * Ground truth entries are stored as description iterations with isGroundTruth=true
   * and the table/column is marked as userApproved so the analysis engine skips it.
   */
  private applyGroundTruth(state: DatabaseDocumentation, stateManager: StateManager): void {
    const gt = this.config.groundTruth;
    if (!gt) return;

    let applied = 0;

    // Apply schema-level ground truth
    if (gt.schemas) {
      for (const [schemaName, schemaGT] of Object.entries(gt.schemas)) {
        const schema = state.schemas.find(s => s.name === schemaName);
        if (schema && schemaGT.description) {
          schema.description = schemaGT.description;
          schema.descriptionIterations.push({
            description: schemaGT.description,
            reasoning: 'User-provided ground truth',
            generatedAt: new Date().toISOString(),
            modelUsed: 'ground_truth',
            confidence: 1.0,
            triggeredBy: 'ground_truth',
            isGroundTruth: true
          });
          applied++;
        }
      }
    }

    // Apply table-level and column-level ground truth
    if (gt.tables) {
      for (const [tableKey, tableGT] of Object.entries(gt.tables)) {
        const [schemaName, tableName] = tableKey.split('.');
        const table = stateManager.findTable(state, schemaName, tableName);
        if (!table) continue;

        if (tableGT.description) {
          table.description = tableGT.description;
          table.userDescription = tableGT.description;
          table.userApproved = true;
          table.descriptionIterations.push({
            description: tableGT.description,
            reasoning: tableGT.notes || 'User-provided ground truth',
            generatedAt: new Date().toISOString(),
            modelUsed: 'ground_truth',
            confidence: 1.0,
            triggeredBy: 'ground_truth',
            isGroundTruth: true
          });
          applied++;
        }

        // Apply column-level ground truth
        if (tableGT.columns) {
          for (const [colName, colGT] of Object.entries(tableGT.columns)) {
            const column = table.columns.find(c => c.name === colName);
            if (column && colGT.description) {
              column.description = colGT.description;
              column.userDescription = colGT.description;
              column.userApproved = true;
              column.descriptionIterations.push({
                description: colGT.description,
                reasoning: colGT.notes || 'User-provided ground truth',
                generatedAt: new Date().toISOString(),
                modelUsed: 'ground_truth',
                confidence: 1.0,
                triggeredBy: 'ground_truth',
                isGroundTruth: true
              });
              applied++;
            }
          }
        }
      }
    }

    if (applied > 0) {
      this.onProgress('Ground truth applied', { descriptionsApplied: applied });
    }
  }

  /**
   * Load and merge soft PK/FK definitions from an additionalSchemaInfo file.
   * Must be called AFTER introspection (so tables exist in state)
   * but BEFORE the discovery trigger analyzer (so manual keys are counted).
   */
  private async applySoftKeys(
    state: DatabaseDocumentation,
    stateManager: StateManager
  ): Promise<void> {
    const filePath = this.config.groundTruth?.additionalSchemaInfoFile;
    if (!filePath) return;

    this.onProgress('Loading soft PK/FK definitions', { file: filePath });

    const loadResult = await SoftKeysLoader.loadFromFile(filePath);

    // Validate references against actual schema state
    const validationWarnings = SoftKeysLoader.validate(loadResult.tables, state.schemas);
    for (const warning of [...loadResult.warnings, ...validationWarnings]) {
      this.onProgress('Soft keys warning', { message: warning });
    }

    // Merge into state
    const mergeResult = SoftKeysMerger.merge(state, loadResult.tables);

    for (const warning of mergeResult.warnings) {
      this.onProgress('Soft keys merge warning', { message: warning });
    }

    this.onProgress('Soft PK/FK definitions applied', {
      pkAdded: mergeResult.pkAdded,
      fkAdded: mergeResult.fkAdded,
      tablesAffected: mergeResult.tablesAffected,
      tableDescriptionsAdded: mergeResult.tableDescriptionsAdded,
    });

    // Save state with merged keys
    stateManager.updateSummary(state);
    await stateManager.save(state);
  }

  /**
   * Mark low-confidence tables for re-analysis by clearing their userApproved flag.
   * Used when resuming with --reanalyze-below-confidence.
   */
  private markLowConfidenceForReanalysis(state: DatabaseDocumentation, threshold: number): void {
    let marked = 0;
    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        // Don't touch ground truth tables
        const hasGroundTruth = table.descriptionIterations.some(i => i.isGroundTruth);
        if (hasGroundTruth) continue;

        if (table.descriptionIterations.length > 0) {
          const latest = table.descriptionIterations[table.descriptionIterations.length - 1];
          const confidence = latest.confidence ?? 0;
          if (confidence < threshold) {
            table.userApproved = false;
            marked++;
          }
        }
      }
    }

    if (marked > 0) {
      this.onProgress('Marked tables for re-analysis', { tablesMarked: marked, belowConfidence: threshold });
    }
  }

  /**
   * Generate sample queries for AI agents (like Skip)
   */
  private async generateSampleQueries(
    state: DatabaseDocumentation,
    promptEngine: PromptEngine,
    driver: any,
    stateManager: StateManager
  ): Promise<void> {
    const config = this.config.analysis.sampleQueryGeneration;
    if (!config) return;

    // Use main AI config model, effortLevel, and maxTokens
    const model = this.config.ai.model;
    const effortLevel = this.config.ai.effortLevel || 75;
    const maxTokens = this.config.ai.maxTokens || 16000;

    const generator = new SampleQueryGenerator(config, promptEngine, driver, model, stateManager, effortLevel, maxTokens, this.config.ai.pricing);

    try {
      const result = await generator.generateQueries(state.schemas);

      if (result.success) {
        // Phase already updated in state by generator - just report progress
        this.onProgress('Sample queries generated', {
          total: result.summary.totalQueriesGenerated,
          validated: result.summary.queriesValidated,
          tokens: result.summary.tokensUsed,
          cost: result.summary.estimatedCost
        });
      } else {
        // Phase already marked as failed in state by generator
        this.onProgress('Sample query generation failed', {
          error: result.errorMessage
        });
      }
    } catch (error) {
      // Unexpected error - generator should have caught this but handle anyway
      const errorState = await stateManager.load();
      if (errorState && !errorState.phases.queryGeneration) {
        errorState.phases.queryGeneration = {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: 'failed',
          queriesGenerated: 0,
          tokensUsed: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
          errorMessage: (error as Error).message
        };
        await stateManager.save(errorState);
      }

      this.onProgress('Sample query generation error', {
        error: (error as Error).message
      });
    }
  }
}
