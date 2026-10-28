/**
 * @fileoverview Type definitions for Generic Database Provider SQL Logging
 *
 * Contains the interfaces used by the SQL logging system. These types are
 * database-agnostic and shared between all platform-specific providers.
 *
 * @module @memberjunction/generic-database-provider/types
 */

/**
 * One schema-name to Flyway-placeholder rule for a migration-formatted SQL log. Same shape as
 * `SQLOutput.schemaPlaceholders` in `mj.config.cjs`, so a repo declares the mapping once and
 * CodeGen and the SQL logger read the same array. They apply it differently: CodeGen goes in
 * declared order and needs no `.` after the schema name; the SQL logger needs the `.` and skips a
 * name preceded by a word character, `$`, `@` or `#`.
 */
export interface SqlSchemaPlaceholder {
  /** The schema name as it appears in captured SQL, e.g. `__mj_BizAppsAccounting` */
  schema: string;
  /** The placeholder written in its place, e.g. `${flyway:defaultSchema}` or `${mjSchema}` */
  placeholder: string;
}

/**
 * Configuration options for SQL logging sessions
 */
export interface SqlLoggingOptions {
  /** Whether to format output as a flyway migration file with schema placeholders */
  formatAsMigration?: boolean;

  /**
   * Optional default schema name to use for Flyway migrations for replacing schema names with
   * the placeholder ${flyway:defaultSchema}
   *
   * Used only when `schemaPlaceholders` is absent or empty.
   */
  defaultSchemaName?: string;

  /**
   * Schema-to-placeholder rules for migration formatting (#3618). When set, they replace the
   * single `defaultSchemaName` -> `${flyway:defaultSchema}` rewrite.
   *
   * `${flyway:defaultSchema}` is the core schema in MJ's own repo, but in an Open App repo Skyway
   * binds it to the app schema and `${mjSchema}` to core. An Open App therefore supplies both:
   *
   * ```ts
   * schemaPlaceholders: [
   *   { schema: '__mj_BizAppsAccounting', placeholder: '${flyway:defaultSchema}' },
   *   { schema: '__mj', placeholder: '${mjSchema}' },
   * ]
   * ```
   *
   * The rules run in one pass, so an emitted placeholder is never rewritten again. A schema name
   * is rewritten only when a `.` follows it (optionally after a closing `]`), which also keeps a
   * short rule off the prefix of a longer schema name, and no word character, `$`, `@` or `#`
   * precedes it. Code and string data are treated alike: `__mj.` inside a quoted literal is
   * rewritten; a bare name with no `.` after it is left alone.
   *
   * Ignored unless `formatAsMigration` is true.
   */
  schemaPlaceholders?: SqlSchemaPlaceholder[];

  /**
   * Escape `${...}` inside SQL string literals so Flyway/Skyway does not read captured data
   * (template text, prompt bodies) as a placeholder. Always on when `formatAsMigration` is true;
   * set it to get the escaping without migration formatting.
   */
  escapeFlywaySyntax?: boolean;

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
   * Optional rewrite of each logged text before the session reads it: the statement, its simple-SQL
   * fallback, the description and the `-- Parameters:` line. It runs before the verbose prints, the
   * filters, the Flyway escape, the schema-placeholder rewrite and the pretty-print, so text it
   * removes never reaches the log file or the console, and SQL it adds that names a real schema
   * (`[__mj].Entity`) is rewritten to that schema's placeholder like the rest of the statement.
   *
   * It covers only this session's file and verbose prints, plus the provider's shared verbose
   * `Query to log:` print. Other sessions and other output paths do not use it.
   *
   * If it throws, the error is caught: the session writes the fixed line
   * `-- Statement not logged: TransformStatement failed` in place of the statement and the SQL
   * call goes on as normal.
   */
  TransformStatement?: (sql: string) => string;
}

/**
 * Interface for SQL logging session with disposable pattern
 */
export interface SqlLoggingSession {
  /** Unique session ID */
  readonly id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** File path where SQL is being logged */
  readonly filePath: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Session start time */
  readonly startTime: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Number of statements logged so far */
  readonly statementCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Configuration options for this session */
  readonly options: SqlLoggingOptions;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Dispose method to stop logging and clean up resources */
  dispose(): Promise<void>;
}
