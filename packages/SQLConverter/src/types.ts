import type { SQLDialect } from '@memberjunction/sqlglot-ts';

export type { SQLDialect } from '@memberjunction/sqlglot-ts';

export interface ConversionPipelineConfig {
  /** Source SQL content (string) or path to source SQL file */
  source: string;
  /** Whether source is a file path (true) or raw SQL string (false) */
  sourceIsFile: boolean;
  /** Source SQL dialect */
  sourceDialect: SQLDialect;
  /** Target SQL dialect */
  targetDialect: SQLDialect;
  /** Path to write converted SQL output */
  outputFile?: string;
  /** Execute each statement against target DB to verify (default: false) */
  verify: boolean;
  /** Target database connection string for verification */
  targetConnection?: string;
  /** Enable LLM fallback for failed conversions (default: false) */
  llmFallback: boolean;
  /** LLM fallback implementation */
  llmFallbackHandler?: ILLMFallback;
  /** Generate audit report (default: true) */
  audit: boolean;
  /** Stop on first error vs continue (default: false = continue) */
  stopOnError: boolean;
  /** Max retries per statement with LLM fallback (default: 3) */
  maxLLMRetries: number;
  /** Pretty-print output (default: true) */
  pretty: boolean;
  /** Verbose logging callback */
  onProgress?: (message: string) => void;
  /** Database verifier implementation */
  verifier?: IDatabaseVerifier;
}

export interface StatementResult {
  /** 0-based index of statement in source file */
  index: number;
  /** Original SQL statement */
  originalSQL: string;
  /** Converted SQL statement (may be from sqlglot or LLM) */
  convertedSQL: string;
  /** Whether conversion succeeded */
  success: boolean;
  /** Whether verification (DB execution) passed */
  verified: boolean;
  /** How the statement was converted */
  method: 'sqlglot' | 'llm' | 'passthrough' | 'failed';
  /** Error message if failed */
  error?: string;
  /** LLM model used if LLM fallback was needed */
  llmModel?: string;
}

export interface ConversionResult {
  /** Overall success */
  success: boolean;
  /** Total statements processed */
  totalStatements: number;
  /** Statements successfully converted */
  successCount: number;
  /** Statements that failed */
  failureCount: number;
  /** Statements converted by sqlglot */
  sqlglotCount: number;
  /** Statements converted by LLM fallback */
  llmCount: number;
  /** Statements passed through unchanged */
  passthroughCount: number;
  /** Per-statement results */
  statements: StatementResult[];
  /** Audit report (if enabled) */
  auditReport?: AuditReport;
  /** Output file path (if written) */
  outputFile?: string;
  /** Combined converted SQL */
  outputSQL: string;
  /** Duration in milliseconds */
  durationMs: number;
}

export interface AuditReport {
  /** Source database object counts */
  source: DatabaseInventory;
  /** Target database object counts */
  target: DatabaseInventory;
  /** Objects missing from target */
  missing: string[];
  /** Objects with different row counts */
  rowCountMismatches: RowCountMismatch[];
}

export interface DatabaseInventory {
  tables: string[];
  views: string[];
  functions: string[];
  triggers: string[];
  indexes: string[];
}

export interface RowCountMismatch {
  tableName: string;
  sourceCount: number;
  targetCount: number;
}

/**
 * Interface for LLM-based fallback SQL conversion.
 * Consumers implement this to plug in their LLM provider.
 */
export interface ILLMFallback {
  /**
   * Attempt to fix a failed SQL conversion using an LLM.
   * @param originalSQL - The original source dialect SQL
   * @param failedConversion - The sqlglot conversion that failed verification
   * @param error - The error message from verification
   * @param sourceDialect - Source SQL dialect
   * @param targetDialect - Target SQL dialect
   * @returns The LLM-corrected SQL, or null if unable to fix
   */
  FixConversion(
    originalSQL: string,
    failedConversion: string,
    error: string,
    sourceDialect: string,
    targetDialect: string
  ): Promise<{ sql: string | null; model?: string }>;
}

/**
 * Interface for verifying SQL against a target database.
 * Consumers implement this to plug in their database driver.
 */
export interface IDatabaseVerifier {
  /**
   * Execute a SQL statement against the target database to verify it works.
   * Should NOT commit changes — use a transaction that rolls back.
   * @returns null if successful, error message if failed
   */
  Verify(sql: string): Promise<string | null>;

  /** Close the database connection */
  Close(): Promise<void>;
}

/**
 * Interface for auditing database contents.
 * Consumers implement this to plug in their database driver.
 */
export interface IDatabaseAuditor {
  /** Get inventory of objects in the database */
  GetInventory(schema?: string): Promise<DatabaseInventory>;
  /** Get row counts for all tables */
  GetRowCounts(schema?: string): Promise<Map<string, number>>;
  /** Close the connection */
  Close(): Promise<void>;
}
