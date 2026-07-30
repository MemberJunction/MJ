/**
 * @fileoverview Type definitions for Generic Database Provider SQL Logging
 *
 * Contains the interfaces used by the SQL logging system. These types are
 * database-agnostic and shared between all platform-specific providers.
 *
 * @module @memberjunction/generic-database-provider/types
 */

/**
 * Configuration options for SQL logging sessions
 */
export interface SqlLoggingOptions {
  /** Whether to format output as a flyway migration file with schema placeholders */
  formatAsMigration?: boolean;

  /**
   * Optional default schema name to use for Flyway migrations for replacing schema names with
   * the placeholder ${flyway:defaultSchema}
   */
  defaultSchemaName?: string;

  /** Optional description to include as a comment at the start of the log */
  description?: string;
  /** Which types of statements to log: 'queries' (all), 'mutations' (only data changes), 'both' (default) */
  statementTypes?: 'queries' | 'mutations' | 'both';
  /** Optional batch separator to emit after each statement (e.g., "GO" for SQL Server) */
  batchSeparator?: string;
  /** Whether to pretty print SQL statements with proper formatting */
  prettyPrint?: boolean;
  /** Whether to log record change metadata wrapper SQL (default: false). When false, only core spCreate/spUpdate/spDelete calls are logged */
  logRecordChangeMetadata?: boolean;
  /** Whether to retain log files that contain no SQL statements (default: false). When false, empty log files are automatically deleted on dispose */
  retainEmptyLogFiles?: boolean;
  /** Optional user ID to filter SQL logging - only log SQL executed by this user */
  filterByUserId?: string;
  /** Optional friendly name for this logging session (for UI display) */
  sessionName?: string;
  /** Whether to output verbose debug information to console (default: false) */
  verboseOutput?: boolean;
  /**
   * When set, enables variable-count-based batch separation instead of emitting the batch separator
   * after every statement. The logger tracks how many SQL variable declarations (DECLARE @...) have
   * accumulated in the current batch. When the running count reaches this threshold, a batch separator
   * is emitted before the next statement and the counter resets.
   *
   * This prevents SQL Server's 10,000-variable-per-batch limit from being hit on large migration files
   * while avoiding the verbosity of one GO per statement.
   *
   * Requires `batchSeparator` to also be set. Recommended value: 200.
   * Set to 0 or leave undefined to use the legacy per-statement behavior.
   */
  variableBatchThreshold?: number;
  /**
   * Array of patterns to filter SQL statements.
   * Supports both regex (RegExp objects) and simple wildcard patterns (strings).
   * How these patterns are applied depends on filterType.
   *
   * String patterns support:
   * - Simple wildcards: "*AIPrompt*", "spCreate*", "*Run"
   * - Regex strings: "/spCreate.*Run/i", "/^SELECT.*FROM/i"
   *
   * RegExp examples:
   * - /spCreateAIPromptRun/i - Match stored procedure calls
   * - /^SELECT.*FROM.*vw.*Metadata/i - Match metadata view queries
   * - /INSERT INTO EntityFieldValue/i - Match specific inserts
   */
  filterPatterns?: (string | RegExp)[];
  /**
   * Determines how filterPatterns are applied:
   * - 'exclude': If ANY pattern matches, the SQL is NOT logged (default)
   * - 'include': If ANY pattern matches, the SQL IS logged
   *
   * Note: If filterPatterns is empty/undefined, all SQL is logged regardless of filterType.
   */
  filterType?: 'include' | 'exclude';

  /**
   * Maximum size, in bytes, of a single generated SQL log file. When set to a positive
   * value and the session's output would exceed it, the logger rotates to a new part file
   * at a safe statement boundary, so no single file exceeds the limit. This exists so a
   * very large capture (e.g. a full metadata-sync push) can be committed under host file-size
   * limits such as GitHub's 100 MiB cap.
   *
   * Behavior:
   * - Splitting occurs ONLY when the content actually exceeds the limit. A session whose
   *   output fits under the limit produces exactly one file at the original `filePath`
   *   (fully backward compatible — no part suffix).
   * - Rotation happens strictly BETWEEN complete statements — a statement is never torn
   *   across files — and each part is a self-contained, individually-runnable migration
   *   (its own header/footer, and per-part batch-separator counting reset so a `GO` batch
   *   never spans a file boundary).
   * - When splitting triggers, every part (including the first) is named by inserting
   *   `.partNN` before the extension of `filePath` (e.g. `push.sql` → `push.part01.sql`,
   *   `push.part02.sql`, ...). Enumerate all produced files via {@link SqlLoggingSession.filePaths}.
   * - A single statement larger than `maxFileSize` cannot be split; it is written whole to
   *   its own part (which then exceeds the limit). This is unavoidable and does not loop.
   *
   * Undefined or 0 disables splitting (default).
   */
  maxFileSize?: number;
}

/**
 * Interface for SQL logging session with disposable pattern
 */
export interface SqlLoggingSession {
  /** Unique session ID */
  readonly id: string;
  /**
   * File path where SQL is being logged. When {@link SqlLoggingOptions.maxFileSize} splitting
   * triggers, this is the FIRST part (`*.part01.sql`); use {@link filePaths} to get every part.
   */
  readonly filePath: string;
  /**
   * Every file path produced by this session, in order. When size-based splitting did not
   * trigger this is a single-element array (`[filePath]`); when the session rotated across
   * multiple parts it lists each part file. Read after logging completes (before or after
   * `dispose()` — the list is final once the last statement is written).
   */
  readonly filePaths: string[];
  /** Session start time */
  readonly startTime: Date;
  /** Number of statements logged so far */
  readonly statementCount: number;
  /** Configuration options for this session */
  readonly options: SqlLoggingOptions;
  /** Dispose method to stop logging and clean up resources */
  dispose(): Promise<void>;
}
