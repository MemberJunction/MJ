/**
 * DBAutoDoc Programmatic API
 *
 * A clean, simple API for using DBAutoDoc as a library.
 * Provides programmatic access to analysis, export, and status checking.
 *
 * @example
 * ```typescript
 * import { DBAutoDocAPI } from '@memberjunction/db-auto-doc';
 *
 * const api = new DBAutoDocAPI();
 *
 * const result = await api.analyze({
 *   database: {
 *     provider: 'sqlserver',
 *     server: 'localhost',
 *     database: 'MyDB',
 *     user: 'sa',
 *     password: 'password'
 *   },
 *   ai: {
 *     provider: 'anthropic',
 *     model: 'claude-3-opus-20240229',
 *     apiKey: 'sk-...'
 *   },
 *   onProgress: (message, data) => console.log(`${message}:`, data)
 * });
 *
 * console.log(`Analysis complete: ${result.outputFolder}`);
 * console.log(`Tokens used: ${result.summary.totalTokens}`);
 * ```
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { ConfigLoader } from '../utils/config-loader.js';
import { AnalysisOrchestrator } from '../core/AnalysisOrchestrator.js';
import { StateManager } from '../state/StateManager.js';
import { SQLGenerator } from '../generators/SQLGenerator.js';
import { MarkdownGenerator } from '../generators/MarkdownGenerator.js';
import { DBAutoDocConfig, DatabaseConfig, AIConfig, AnalysisConfig, SoftKeyConfig } from '../types/config.js';
import { DatabaseDocumentation, AnalysisSummary } from '../types/state.js';

/**
 * Progress callback function
 * Called during analysis with status updates
 *
 * @param message - Status message describing what's happening
 * @param data - Optional data object with additional context (e.g., { tableName, progress: 0.45 })
 */
export type ProgressCallback = (message: string, data?: Record<string, any>) => void;

/**
 * API Configuration subset
 * Only includes the essential configuration options for programmatic use
 */
export interface DBAutoDocAPIConfig {
  /** Database connection configuration */
  database: DatabaseConfig;

  /** AI provider configuration */
  ai: AIConfig;

  /** Optional analysis configuration (uses sensible defaults if not provided) */
  analysis?: Partial<AnalysisConfig>;

  /** Optional seed context for better analysis results */
  seedContext?: {
    overallPurpose?: string;
    businessDomains?: string[];
    industryContext?: string;
    customInstructions?: string;
  };

  /** Optional output directory (default: ./output) */
  outputDir?: string;

  /** Schema filtering */
  schemas?: {
    include?: string[];
    exclude?: string[];
  };

  /** Table filtering */
  tables?: {
    exclude?: string[];
  };

  /** Optional soft keys configuration (file path or inline config) */
  softKeys?: string | SoftKeyConfig;
}

/**
 * Analysis execution result
 * Contains the complete analysis state and metadata
 */
export interface AnalysisExecutionResult {
  /** Whether analysis succeeded */
  success: boolean;

  /** Path to the output folder containing state.json and generated files */
  outputFolder: string;

  /** Path to the state file */
  stateFile: string;

  /** Analysis summary with metrics */
  summary: AnalysisSummary;

  /** Error message if analysis failed */
  message?: string;
}

/**
 * Export result
 * Contains paths to generated files
 */
export interface ExportResult {
  /** Whether export succeeded */
  success: boolean;

  /** Path to generated SQL file (if requested) */
  sqlFile?: string;

  /** Path to generated Markdown file (if requested) */
  markdownFile?: string;

  /** Error message if export failed */
  message?: string;
}

/**
 * Status information for an analysis
 */
export interface AnalysisStatus {
  /** Whether a state file exists */
  exists: boolean;

  /** When analysis was created */
  createdAt?: string;

  /** When analysis was last modified */
  lastModified?: string;

  /** Total iterations performed */
  totalIterations?: number;

  /** Total tokens used */
  totalTokens?: number;

  /** Estimated cost in dollars */
  estimatedCost?: number;

  /** Number of schemas analyzed */
  totalSchemas?: number;

  /** Number of tables analyzed */
  totalTables?: number;

  /** Number of columns analyzed */
  totalColumns?: number;
}

/**
 * DBAutoDocAPI - Main API class
 *
 * Simple, type-safe interface for DBAutoDoc functionality:
 * - analyze() - Run full analysis or resume from checkpoint
 * - export() - Generate SQL and/or Markdown from analysis state
 * - getStatus() - Check analysis progress and metrics
 */
export class DBAutoDocAPI {
  /**
   * Run database analysis
   *
   * Performs full or resumed database analysis, saving results to the output folder.
   *
   * @param config - API configuration with database and AI settings
   * @param progressCallback - Optional callback for progress updates
   * @returns Analysis result with output folder path and metrics
   *
   * @example
   * ```typescript
   * const result = await api.analyze({
   *   database: { provider: 'sqlserver', server: 'localhost', ... },
   *   ai: { provider: 'anthropic', model: 'claude-3-opus-20240229', ... },
   *   onProgress: (msg, data) => console.log(msg, data)
   * });
   *
   * if (result.success) {
   *   console.log(`Analysis saved to: ${result.outputFolder}`);
   *   console.log(`Tokens used: ${result.summary.totalTokens}`);
   * }
   * ```
   */
  public async analyze(
    config: DBAutoDocAPIConfig & { onProgress?: ProgressCallback }
  ): Promise<AnalysisExecutionResult> {
    try {
      const onProgress = config.onProgress || (() => {});

      // Build full config
      const fullConfig = this.buildFullConfig(config);

      // Create orchestrator
      const orchestrator = new AnalysisOrchestrator({
        config: fullConfig,
        onProgress
      });

      // Execute analysis
      onProgress('Starting analysis');
      const result = await orchestrator.execute();

      if (result.success) {
        return {
          success: true,
          outputFolder: result.outputFolder,
          stateFile: path.join(result.outputFolder, 'state.json'),
          summary: result.state.summary
        } as AnalysisExecutionResult;
      } else {
        return {
          success: false,
          outputFolder: result.outputFolder,
          stateFile: path.join(result.outputFolder, 'state.json'),
          summary: result.state.summary,
          message: result.message
        } as AnalysisExecutionResult;
      }
    } catch (error) {
      return {
        success: false,
        outputFolder: '',
        stateFile: '',
        summary: {
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          totalIterations: 0,
          totalPromptsRun: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
          totalSchemas: 0,
          totalTables: 0,
          totalColumns: 0
        },
        message: (error as Error).message
      } as AnalysisExecutionResult;
    }
  }

  /**
   * Resume analysis from a checkpoint
   *
   * Continues a previous analysis from where it left off.
   *
   * @param stateFile - Path to the state.json file to resume from
   * @param config - Updated configuration (optional, uses config from state if not provided)
   * @param progressCallback - Optional callback for progress updates
   * @returns Analysis execution result
   *
   * @example
   * ```typescript
   * const result = await api.resume('./output/run-5/state.json', {
   *   database: { ... },  // Optional: provide updated config
   *   ai: { ... },
   *   onProgress: (msg) => console.log(msg)
   * });
   * ```
   */
  public async resume(
    stateFile: string,
    config?: DBAutoDocAPIConfig & { onProgress?: ProgressCallback }
  ): Promise<AnalysisExecutionResult> {
    try {
      const onProgress = config?.onProgress || (() => {});

      // Load the state to get context
      const stateManager = new StateManager(stateFile);
      const state = await stateManager.load();

      if (!state) {
        return {
          success: false,
          outputFolder: path.dirname(stateFile),
          stateFile,
          summary: {
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            totalIterations: 0,
            totalPromptsRun: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalTokens: 0,
            estimatedCost: 0,
            totalSchemas: 0,
            totalTables: 0,
            totalColumns: 0
          },
          message: `State file not found: ${stateFile}`
        } as AnalysisExecutionResult;
      }

      // Build config - prefer provided config, but use defaults if not provided
      const fullConfig = config
        ? this.buildFullConfig(config)
        : this.buildDefaultConfig(state.database.name, state.database.server);

      // Create orchestrator with resume path
      const outputDir = path.dirname(stateFile);
      fullConfig.output.outputDir = outputDir;

      const orchestrator = new AnalysisOrchestrator({
        config: fullConfig,
        resumeFromState: stateFile,
        onProgress
      });

      // Execute analysis
      onProgress('Resuming analysis from checkpoint');
      const result = await orchestrator.execute();

      if (result.success) {
        return {
          success: true,
          outputFolder: result.outputFolder,
          stateFile: path.join(result.outputFolder, 'state.json'),
          summary: result.state.summary
        } as AnalysisExecutionResult;
      } else {
        return {
          success: false,
          outputFolder: result.outputFolder,
          stateFile: path.join(result.outputFolder, 'state.json'),
          summary: result.state.summary,
          message: result.message
        } as AnalysisExecutionResult;
      }
    } catch (error) {
      return {
        success: false,
        outputFolder: path.dirname(stateFile),
        stateFile,
        summary: {
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          totalIterations: 0,
          totalPromptsRun: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
          totalSchemas: 0,
          totalTables: 0,
          totalColumns: 0
        },
        message: (error as Error).message
      } as AnalysisExecutionResult;
    }
  }

  /**
   * Export analysis results as SQL and/or Markdown
   *
   * Generates SQL extended properties script and/or Markdown documentation
   * from an existing analysis state file.
   *
   * @param stateFile - Path to the state.json file to export from
   * @param options - Export options
   * @returns Export result with paths to generated files
   *
   * @example
   * ```typescript
   * // Generate both SQL and Markdown
   * const result = await api.export('./output/run-5/state.json', {
   *   sql: true,
   *   markdown: true,
   *   outputDir: './docs'
   * });
   *
   * if (result.success) {
   *   console.log(`SQL: ${result.sqlFile}`);
   *   console.log(`Markdown: ${result.markdownFile}`);
   * }
   * ```
   */
  public async export(
    stateFile: string,
    options?: {
      /** Generate SQL extended properties script (default: true) */
      sql?: boolean;

      /** Generate Markdown documentation (default: true) */
      markdown?: boolean;

      /** Output directory for generated files (default: same as state file directory) */
      outputDir?: string;

      /** Only include approved items (default: false) */
      approvedOnly?: boolean;

      /** Minimum confidence threshold for inclusion (0-1, default: 0) */
      confidenceThreshold?: number;
    }
  ): Promise<ExportResult> {
    try {
      // Load state
      const stateManager = new StateManager(stateFile);
      const state = await stateManager.load();

      if (!state) {
        return {
          success: false,
          message: `State file not found: ${stateFile}`
        };
      }

      // Determine output directory
      const outputDir = options?.outputDir || path.dirname(stateFile);
      await fs.mkdir(outputDir, { recursive: true });

      // Default to both SQL and Markdown if no options specified
      const generateSQL = options?.sql !== false;
      const generateMarkdown = options?.markdown !== false;

      const result: ExportResult = { success: true };

      // Generate SQL
      if (generateSQL) {
        const sqlGen = new SQLGenerator();
        const sql = sqlGen.generate(state, {
          approvedOnly: options?.approvedOnly || false,
          confidenceThreshold: options?.confidenceThreshold || 0
        });

        const sqlPath = path.join(outputDir, 'extended-props.sql');
        await fs.writeFile(sqlPath, sql, 'utf-8');
        result.sqlFile = sqlPath;
      }

      // Generate Markdown
      if (generateMarkdown) {
        const mdGen = new MarkdownGenerator();
        const markdown = mdGen.generate(state);

        const mdPath = path.join(outputDir, 'summary.md');
        await fs.writeFile(mdPath, markdown, 'utf-8');
        result.markdownFile = mdPath;
      }

      return result;
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message
      };
    }
  }

  /**
   * Get analysis status and metrics
   *
   * Returns current analysis status and metrics from a state file.
   * Useful for tracking progress or checking if analysis is complete.
   *
   * @param stateFile - Path to the state.json file
   * @returns Status information
   *
   * @example
   * ```typescript
   * const status = await api.getStatus('./output/run-5/state.json');
   *
   * if (status.exists) {
   *   console.log(`Schemas: ${status.totalSchemas}`);
   *   console.log(`Tables: ${status.totalTables}`);
   *   console.log(`Tokens: ${status.totalTokens}`);
   *   console.log(`Cost: $${status.estimatedCost?.toFixed(2)}`);
   * }
   * ```
   */
  public async getStatus(stateFile: string): Promise<AnalysisStatus> {
    try {
      const stateManager = new StateManager(stateFile);
      const state = await stateManager.load();

      if (!state) {
        return { exists: false };
      }

      return {
        exists: true,
        createdAt: state.summary.createdAt,
        lastModified: state.summary.lastModified,
        totalIterations: state.summary.totalIterations,
        totalTokens: state.summary.totalTokens,
        estimatedCost: state.summary.estimatedCost,
        totalSchemas: state.summary.totalSchemas,
        totalTables: state.summary.totalTables,
        totalColumns: state.summary.totalColumns
      };
    } catch (error) {
      return { exists: false };
    }
  }

  /**
   * Build full configuration from API config
   * Applies sensible defaults for analysis settings
   */
  private buildFullConfig(config: DBAutoDocAPIConfig): DBAutoDocConfig {
    const outputDir = config.outputDir || './output';

    return {
      version: '2.0.0',
      database: config.database,
      ai: config.ai,
      analysis: {
        cardinalityThreshold: 100,
        sampleSize: 1000,
        includeStatistics: true,
        includePatternAnalysis: true,
        convergence: {
          maxIterations: 3,
          stabilityWindow: 2,
          confidenceThreshold: 0.85
        },
        backpropagation: {
          enabled: true,
          maxDepth: 2
        },
        sanityChecks: {
          dependencyLevel: true,
          schemaLevel: true,
          crossSchema: true
        },
        relationshipDiscovery: {
          enabled: true,
          triggers: {
            runOnMissingPKs: true,
            runOnInsufficientFKs: true,
            fkDeficitThreshold: 0.4
          },
          tokenBudget: {
            ratioOfTotal: 0.25
          },
          confidence: {
            primaryKeyMinimum: 0.7,
            foreignKeyMinimum: 0.6,
            llmValidationThreshold: 0.8
          },
          sampling: {
            maxRowsPerTable: 1000,
            statisticalSignificance: 100,
            valueOverlapSampleSize: 500
          },
          patterns: {
            primaryKeyNames: ['.*[Ii][Dd]$', '^[Pp][Kk]_.*', '^id$'],
            foreignKeyNames: ['.*[Ii][Dd]$', '^[Ff][Kk]_.*'],
            compositeKeyIndicators: []
          },
          llmValidation: {
            enabled: true,
            batchSize: 5
          },
          backpropagation: {
            enabled: true,
            maxIterations: 10
          }
        },
        ...config.analysis
      },
      output: {
        stateFile: path.join(outputDir, 'state.json'),
        outputDir,
        sqlFile: path.join(outputDir, 'extended-props.sql'),
        markdownFile: path.join(outputDir, 'summary.md')
      },
      schemas: config.schemas || {},
      tables: config.tables || {},
      softKeys: config.softKeys
    };
  }

  /**
   * Build default configuration (used when resuming without new config)
   */
  private buildDefaultConfig(dbName: string, server: string): DBAutoDocConfig {
    const outputDir = './output';

    return {
      version: '2.0.0',
      database: {
        provider: 'sqlserver',
        server,
        port: 1433,
        database: dbName,
        user: 'sa',
        password: '',
        connectionTimeout: 30000
      },
      ai: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        apiKey: '',
        temperature: 0.1,
        maxTokens: 4000
      },
      analysis: {
        cardinalityThreshold: 100,
        sampleSize: 1000,
        includeStatistics: true,
        includePatternAnalysis: true,
        convergence: {
          maxIterations: 3,
          stabilityWindow: 2,
          confidenceThreshold: 0.85
        },
        backpropagation: {
          enabled: true,
          maxDepth: 2
        },
        sanityChecks: {
          dependencyLevel: true,
          schemaLevel: true,
          crossSchema: true
        },
        relationshipDiscovery: {
          enabled: true,
          triggers: {
            runOnMissingPKs: true,
            runOnInsufficientFKs: true,
            fkDeficitThreshold: 0.4
          },
          tokenBudget: {
            ratioOfTotal: 0.25
          },
          confidence: {
            primaryKeyMinimum: 0.7,
            foreignKeyMinimum: 0.6,
            llmValidationThreshold: 0.8
          },
          sampling: {
            maxRowsPerTable: 1000,
            statisticalSignificance: 100,
            valueOverlapSampleSize: 500
          },
          patterns: {
            primaryKeyNames: ['.*[Ii][Dd]$', '^[Pp][Kk]_.*', '^id$'],
            foreignKeyNames: ['.*[Ii][Dd]$', '^[Ff][Kk]_.*'],
            compositeKeyIndicators: []
          },
          llmValidation: {
            enabled: true,
            batchSize: 5
          },
          backpropagation: {
            enabled: true,
            maxIterations: 10
          }
        }
      },
      output: {
        stateFile: path.join(outputDir, 'state.json'),
        outputDir,
        sqlFile: path.join(outputDir, 'extended-props.sql'),
        markdownFile: path.join(outputDir, 'summary.md')
      },
      schemas: {},
      tables: {}
    };
  }
}
