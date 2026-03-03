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
}

/**
 * Interface for SQL logging session with disposable pattern
 */
export interface SqlLoggingSession {
  /** Unique session ID */
  readonly id: string;
  /** File path where SQL is being logged */
  readonly filePath: string;
  /** Session start time */
  readonly startTime: Date;
  /** Number of statements logged so far */
  readonly statementCount: number;
  /** Configuration options for this session */
  readonly options: SqlLoggingOptions;
  /** Dispose method to stop logging and clean up resources */
  dispose(): Promise<void>;
}
