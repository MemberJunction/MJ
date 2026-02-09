/**
 * Main orchestrator for database analysis
 * Can be used programmatically or via CLI
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { DatabaseConnection, Introspector, DataSampler } from '../database/Database.js';
import { AutoDocConnectionConfig } from '../types/driver.js';
import { TopologicalSorter } from '../database/TopologicalSorter.js';
import { StateManager } from '../state/StateManager.js';
import { IterationTracker } from '../state/IterationTracker.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { AnalysisEngine } from './AnalysisEngine.js';
import { SQLGenerator } from '../generators/SQLGenerator.js';
import { MarkdownGenerator } from '../generators/MarkdownGenerator.js';
import { SampleQueryGenerator } from '../generators/SampleQueryGenerator.js';
import { DBAutoDocConfig } from '../types/config.js';
import { DatabaseDocumentation, AnalysisRun } from '../types/state.js';
import { DiscoveryTriggerAnalyzer } from '../discovery/DiscoveryTriggerAnalyzer.js';
import { DiscoveryEngine } from '../discovery/DiscoveryEngine.js';

export interface AnalysisOptions {
  config: DBAutoDocConfig;
  resumeFromState?: string; // Path to existing state file to resume from
  onProgress?: (message: string, data?: any) => void;
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

  constructor(options: AnalysisOptions) {
    this.config = options.config;
    this.resumeFromState = options.resumeFromState;
    this.onProgress = options.onProgress || (() => {});
  }

  /**
   * Execute the full analysis workflow
   */
  public async execute(): Promise<OrchestratorResult> {
    try {
      // Create run folder
      if (!this.config.output.outputDir) {
        throw new Error('output.outputDir must be specified in config');
      }
      const runFolder = await this.createRunFolder(this.config.output.outputDir);
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

        // Relationship Discovery Phase (if enabled)
        if (this.config.analysis.relationshipDiscovery?.enabled) {
          this.onProgress('Checking if relationship discovery should run');

          const triggerAnalysis = DiscoveryTriggerAnalyzer.analyzeSchemas(state.schemas);

          if (triggerAnalysis.shouldRun) {
            this.onProgress('Relationship discovery triggered', {
              reason: triggerAnalysis.reason,
              tablesWithoutPK: triggerAnalysis.details.tablesWithoutPK,
              actualFKs: triggerAnalysis.details.totalFKs,
              expectedMinFKs: triggerAnalysis.details.expectedMinFKs
            });

            const discoveryEngine = new DiscoveryEngine({
              driver,
              config: this.config.analysis.relationshipDiscovery,
              aiConfig: this.config.ai,
              schemas: state.schemas,
              onProgress: this.onProgress
            });

            // Calculate token budget for discovery
            const totalTokenBudget = this.config.analysis.guardrails?.maxTokensPerRun;
            const discoveryRatio = this.config.analysis.relationshipDiscovery.tokenBudget?.ratioOfTotal || 0.25;
            const discoveryTokenBudget = totalTokenBudget
              ? Math.floor(totalTokenBudget * discoveryRatio)
              : this.config.analysis.relationshipDiscovery.tokenBudget?.maxTokens || 50000;

            const discoveryResult = await discoveryEngine.discover(discoveryTokenBudget, triggerAnalysis);

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
            await stateManager.save(state);
          } else {
            this.onProgress('Relationship discovery skipped', {
              reason: triggerAnalysis.reason
            });
          }
        }
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
      const analysisEngine = new AnalysisEngine(this.config, promptEngine, stateManager, iterationTracker);

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
      let converged = false;
      while (!converged && run.iterationsPerformed < this.config.analysis.convergence.maxIterations) {
        iterationTracker.incrementIteration(state, run);
        this.onProgress('Starting iteration', { iteration: run.iterationsPerformed });

        // Process each level
        for (let levelNum = 0; levelNum < levels.length; levelNum++) {
          this.onProgress('Processing level', { level: levelNum, tables: levels[levelNum].length });

          const triggers = await analysisEngine.processLevel(state, run, levelNum, levels[levelNum]);

          // Dependency-level sanity check
          if (this.config.analysis.sanityChecks.dependencyLevel && levels[levelNum].length > 0) {
            await analysisEngine.performDependencyLevelSanityCheck(state, run, levelNum, levels[levelNum]);
          }

          // Backpropagation
          if (triggers.length > 0 && this.config.analysis.backpropagation.enabled) {
            await analysisEngine.executeBackpropagation(state, run, triggers);
          }

          // Save state after each level
          stateManager.updateSummary(state);
          await stateManager.save(state);
        }

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
        iterationTracker.completeRun(run, false, 'Max iterations reached');
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

    const generator = new SampleQueryGenerator(config, promptEngine, driver, model, stateManager, effortLevel, maxTokens);

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
