/**
 * @fileoverview SQL Logging Implementation for Generic Database Provider
 *
 * This module provides SQL statement logging functionality with file I/O,
 * filtering, formatting, and session management capabilities. It is
 * database-agnostic and shared between all platform-specific providers.
 *
 * @module @memberjunction/generic-database-provider/SqlLogger
 */

import * as fs from 'fs';
import * as path from 'path';
import { format as formatSql } from 'sql-formatter';
import { ensureRegExps } from '@memberjunction/global';
import { SQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { SqlLoggingOptions, SqlLoggingSession, SqlSchemaPlaceholder } from './types.js';

/** Line written in place of a statement whose `TransformStatement` threw. */
export const TRANSFORM_FAILED_LINE = '-- Statement not logged: TransformStatement failed';

/** Text `ApplyStatementTransforms` returns when a transform throws. */
export const TRANSFORM_FAILED_PLACEHOLDER = '[statement hidden: TransformStatement failed]';

/** The text parts of one statement that `TransformStatement` runs on. */
interface StatementParts {
  query: string;
  simpleSQLFallback?: string;
  description?: string;
  paramComment?: string;
}

/**
 * What may not come right before a schema name for it to be rewritten to a placeholder: a word
 * character, `$`, `@` (a variable) or `#` (a temp table). Shared with MetadataSync's `SQLLogger` so
 * both rewrites match the same names.
 */
export const SCHEMA_PLACEHOLDER_LOOKBEHIND = '(?<![\\w$@#])';

/** Compiled `schemaPlaceholders` rules: one regex over every schema and a schema -> placeholder map. */
interface SchemaPlaceholderMatcher {
  regex: RegExp;
  placeholderBySchema: Map<string, string>;
}

/**
 * Internal implementation of SqlLoggingSession that handles SQL statement logging to files.
 * This class manages file I/O, SQL formatting, and filtering based on session options.
 *
 * @internal
 */
export class SqlLoggingSessionImpl implements SqlLoggingSession {
  public readonly id: string;
  public readonly filePath: string;
  public readonly startTime: Date;
  public readonly options: SqlLoggingOptions;
  private _statementCount: number = 0;
  private _emittedStatementCount: number = 0; // Track actually emitted statements
  private _currentBatchVariableCount: number = 0; // Running count of DECLARE @var declarations in current batch
  private _currentBatchDeclaredNames = new Set<string>(); // Lower-cased @names declared in the current batch (threshold mode)
  private _fileHandle: fs.promises.FileHandle | null = null;
  private _disposed: boolean = false;
  private _compiledPatterns: RegExp[] | undefined;
  private _dialect: SQLDialect;
  /** Compiled `schemaPlaceholders`; null when the session has no usable rules. */
  private _schemaPlaceholderMatcher: SchemaPlaceholderMatcher | null;

  /**
   * @param dialect - The SQL dialect to use for platform-specific SQL emission
   *   (e.g. Flyway placeholder escaping, batch separators). Defaults to SQL
   *   Server when not provided so existing callers and tests keep working
   *   without immediately threading a dialect through every call site.
   */
  constructor(id: string, filePath: string, options: SqlLoggingOptions = {}, dialect: SQLDialect = new SQLServerDialect()) {
    this.id = id;
    this.filePath = filePath;
    this.startTime = new Date();
    this.options = options;
    this._dialect = dialect;

    // Compile patterns once during construction
    if (options.filterPatterns && options.filterPatterns.length > 0) {
      this._compiledPatterns = ensureRegExps(options.filterPatterns);
    }
    this._schemaPlaceholderMatcher = SqlLoggingSessionImpl._compileSchemaPlaceholders(options.schemaPlaceholders);
  }

  /**
   * Gets the count of SQL statements actually written to the log file
   * @returns The number of emitted statements (after filtering)
   */
  public get statementCount(): number {
    return this._emittedStatementCount; // Return actually emitted statements
  }

  /**
   * Initializes the logging session by creating the log file and writing the header
   * @throws Error if file creation fails
   */
  public async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Open file for writing
    this._fileHandle = await fs.promises.open(this.filePath, 'w');

    // Write header comment
    const header = this._generateHeader();
    await this._fileHandle.writeFile(header);
  }

  /**
   * Logs a SQL statement to the file, applying filtering and formatting based on session options
   *
   * @param query - The SQL query to log
   * @param parameters - Optional parameters for the query
   * @param description - Optional description for this operation
   * @param isMutation - Whether this is a data mutation operation
   * @param simpleSQLFallback - Optional simple SQL to use if logRecordChangeMetadata=false
   */
  public async LogSqlStatement(query: string, parameters?: unknown, description?: string, isMutation: boolean = false, simpleSQLFallback?: string): Promise<void> {
    // The SQL that ran decides the "(core SP call only)" tag
    const fallbackDiffersFromQuery = simpleSQLFallback !== query;
    let paramComment = this._buildParameterComment(parameters);

    // The session reads only the transformed text from here on
    if (this.options.TransformStatement) {
      const transformed = this._transformParts({ query, simpleSQLFallback, description, paramComment });
      if (!transformed) {
        return this._writeTransformFailure(isMutation);
      }
      ({ query, simpleSQLFallback, description, paramComment } = transformed);
    }
    const verbose = this.options.verboseOutput === true;

    if (verbose) {
      console.log(`=== SESSION ${this.id} LOG ATTEMPT ===`);
      console.log(`Session disposed: ${this._disposed}, File handle exists: ${!!this._fileHandle}`);
      console.log(`Query (first 100 chars): ${query.substring(0, 100)}...`);
      console.log(`isMutation: ${isMutation}, description: ${description || 'none'}`);
      console.log(`Options:`, this.options);
    }

    if (this._disposed || !this._fileHandle) {
      if (verbose) {
        console.log(`Session ${this.id}: Skipping - disposed or no file handle`);
      }
      return;
    }

    // Filter statements based on statementTypes option
    const statementTypes = this.options.statementTypes || 'both';
    if (verbose) {
      console.log(`Session ${this.id}: Statement filter check - statementTypes: ${statementTypes}, isMutation: ${isMutation}`);
    }

    if (statementTypes === 'mutations' && !isMutation) {
      if (verbose) {
        console.log(`Session ${this.id}: Skipping - mutations only but this is not a mutation`);
      }
      return; // Skip logging non-mutation statements
    }
    if (statementTypes === 'queries' && isMutation) {
      if (verbose) {
        console.log(`Session ${this.id}: Skipping - queries only but this is a mutation`);
      }
      return; // Skip logging mutation statements
    }

    if (verbose) {
      console.log(`Session ${this.id}: Statement passed type filters, proceeding to process`);
    }

    let logEntry = '';

    // Add description comment if provided
    if (description) {
      logEntry += `-- ${description}\n`;
    }

    // Process the SQL statement
    let processedQuery = query;

    // Use simple SQL fallback if this session has logRecordChangeMetadata=false (default) and fallback is provided
    if (this.options.logRecordChangeMetadata !== true && simpleSQLFallback) {
      processedQuery = simpleSQLFallback;
      // Tag the description only when the logged text actually differs from what ran.
      // A save on an entity without record-change tracking can hand over a fallback that is
      // byte-identical to the executed SQL (a forced update), and tagging that would misreport it.
      if (description && fallbackDiffersFromQuery && !description.includes('(core SP call only)')) {
        logEntry = logEntry.replace(`-- ${description}\n`, `-- ${description} (core SP call only)\n`);
      }
    }

    // Apply pattern filtering on the processed query
    if (this._compiledPatterns && this._compiledPatterns.length > 0) {
      const filterType = this.options.filterType || 'exclude'; // Default to exclude
      const anyPatternMatches = this._compiledPatterns.some(pattern => pattern.test(processedQuery));

      if (verbose) {
        console.log(`Session ${this.id}: Pattern filter check - filterType: ${filterType}, patterns: ${this._compiledPatterns.length}, anyMatch: ${anyPatternMatches}`);
        console.log(`Session ${this.id}: Testing against processedQuery: ${processedQuery.substring(0, 100)}...`);
      }

      if (filterType === 'exclude' && anyPatternMatches) {
        if (verbose) {
          console.log(`Session ${this.id}: Skipping - exclude pattern matched`);
        }
        return; // Skip logging if any exclude pattern matches
      }

      if (filterType === 'include' && !anyPatternMatches) {
        if (verbose) {
          console.log(`Session ${this.id}: Skipping - no include pattern matched`);
        }
        return; // Skip logging if no include pattern matches
      }
    }

    // Escape ${...} inside string literals so Flyway does not read captured data as a placeholder.
    // Runs after TransformStatement, so SQL a transform adds is escaped too.
    if (this.options.formatAsMigration || this.options.escapeFlywaySyntax) {
      processedQuery = this._escapeFlywaySyntaxInStrings(processedQuery);
    }

    // Replace schema names with Flyway placeholders if migration format. Runs after
    // TransformStatement, so a transform emits real schema names and they are rewritten here.
    if (this.options.formatAsMigration) {
      processedQuery = this._applySchemaPlaceholders(processedQuery, verbose);
    }

    // Apply pretty printing if enabled
    if (this.options.prettyPrint) {
      processedQuery = this._prettyPrintSql(processedQuery);
    }

    // Add the SQL statement
    logEntry += `${processedQuery};\n`;

    // Add parameter comment if parameters exist
    if (paramComment !== undefined) {
      logEntry += `${paramComment}\n`;
    }

    // Batch separator logic:
    // - Threshold mode: emit separator when accumulated variable declarations reach the threshold,
    //   OR when this statement would redeclare a name the current batch already declared. Save-call
    //   variable suffixes are deterministic per record (GenericDatabaseProvider.allocateSaveCallSuffix),
    //   so the same record saved twice in one window emits identical DECLARE lists; SQL Server rejects
    //   a redeclared variable inside one batch, so the capture would fail on replay without this guard.
    //   The separator is prepended BEFORE the current statement (ending the previous batch).
    // - Legacy mode (no threshold): emit separator after every statement.
    const threshold = this.options.variableBatchThreshold;
    if (this.options.batchSeparator && threshold && threshold > 0) {
      const declaredNames = this._collectVariableDeclarations(processedQuery);
      if (declaredNames.length > 0) {
        const redeclaresName = declaredNames.some((name) => this._currentBatchDeclaredNames.has(name));
        if (this._currentBatchVariableCount > 0 && (redeclaresName || this._currentBatchVariableCount + declaredNames.length >= threshold)) {
          // End the previous batch before this statement
          logEntry = `${this.options.batchSeparator}\n\n` + logEntry;
          this._currentBatchVariableCount = declaredNames.length;
          this._currentBatchDeclaredNames = new Set(declaredNames);
        } else {
          this._currentBatchVariableCount += declaredNames.length;
          for (const name of declaredNames) {
            this._currentBatchDeclaredNames.add(name);
          }
        }
      }
    } else if (this.options.batchSeparator) {
      logEntry += `\n${this.options.batchSeparator}\n`;
    }

    logEntry += '\n'; // Add blank line between statements

    if (verbose) {
      console.log(`Session ${this.id}: About to write log entry (${logEntry.length} chars)`);
      console.log(`Session ${this.id}: Log entry preview: ${logEntry.substring(0, 200)}...`);
    }

    try {
      await this._fileHandle.writeFile(logEntry);
      this._statementCount++;
      this._emittedStatementCount++; // Track actually emitted statements
      if (verbose) {
        console.log(`Session ${this.id}: Successfully wrote to file. New counts - total: ${this._statementCount}, emitted: ${this._emittedStatementCount}`);
      }
    } catch (error) {
      console.error(`Session ${this.id}: Error writing to file:`, error);
      throw error;
    }
  }

  /** Builds the `-- Parameters: …` line, or undefined when there are no parameters to show. */
  private _buildParameterComment(parameters: unknown): string | undefined {
    let paramStr = '';
    if (Array.isArray(parameters)) {
      paramStr = parameters.map((p: unknown, i: number) => `@p${i}='${p}'`).join(', ');
    } else if (parameters && typeof parameters === 'object') {
      paramStr = Object.entries(parameters as Record<string, unknown>)
        .map(([key, value]) => `@${key}='${value}'`)
        .join(', ');
    }
    return paramStr ? `-- Parameters: ${paramStr}` : undefined;
  }

  /** Runs `TransformStatement` on each text part. Returns null when the transform throws. */
  private _transformParts(parts: StatementParts): StatementParts | null {
    const transform = this.options.TransformStatement;
    if (!transform) {
      return parts;
    }
    try {
      return {
        query: transform(parts.query),
        simpleSQLFallback: parts.simpleSQLFallback !== undefined ? transform(parts.simpleSQLFallback) : undefined,
        description: parts.description !== undefined ? transform(parts.description) : undefined,
        paramComment: parts.paramComment !== undefined ? transform(parts.paramComment) : undefined,
      };
    } catch {
      return null;
    }
  }

  /** Writes the fixed placeholder line in place of a statement whose transform threw. */
  private async _writeTransformFailure(isMutation: boolean): Promise<void> {
    console.error(`Session ${this.id}: TransformStatement failed; the statement was not logged`);
    if (this._disposed || !this._fileHandle) {
      return;
    }
    const statementTypes = this.options.statementTypes || 'both';
    if ((statementTypes === 'mutations' && !isMutation) || (statementTypes === 'queries' && isMutation)) {
      return;
    }
    try {
      await this._fileHandle.writeFile(`${TRANSFORM_FAILED_LINE}\n\n`);
      this._statementCount++;
      this._emittedStatementCount++;
    } catch (error) {
      console.error(`Session ${this.id}: Error writing to file:`, error);
      throw error;
    }
  }

  /** @deprecated Use {@link LogSqlStatement}. */
  public async logSqlStatement(query: string, parameters?: unknown, description?: string, isMutation: boolean = false, simpleSQLFallback?: string): Promise<void> {
    return this.LogSqlStatement(query, parameters, description, isMutation, simpleSQLFallback);
  }

  /**
   * Disposes of the logging session, writes the footer, closes the file, and optionally deletes empty files
   */
  public async dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }

    this._disposed = true;

    if (this._fileHandle) {
      // Write footer comment
      const footer = this._generateFooter();
      await this._fileHandle.writeFile(footer);

      await this._fileHandle.close();
      this._fileHandle = null;

      // Check if we should delete empty log files. We delete silently — callers
      // inspect `statementCount` to decide what (if anything) to report to the user.
      // (Previously this emitted a raw console.log with an absolute path, bypassing
      // the caller's logging callbacks and contradicting any later "log saved" line.)
      if (this._emittedStatementCount === 0 && !this.options.retainEmptyLogFiles) {
        try {
          await fs.promises.unlink(this.filePath);
        } catch (error) {
          // Ignore errors during deletion (file might already be deleted, etc.)
          console.error(`Failed to delete empty SQL log file: ${this.filePath}`, error);
        }
      }
    }
  }

  private _generateHeader(): string {
    let header = `-- SQL Logging Session\n`;
    header += `-- Session ID: ${this.id}\n`;
    header += `-- Started: ${this.startTime.toISOString()}\n`;

    if (this.options.description) {
      header += `-- Description: ${this.options.description}\n`;
    }

    if (this.options.formatAsMigration) {
      header += `-- Format: Migration-ready with Flyway schema placeholders\n`;
    }

    header += `-- Generated by MemberJunction\n`;
    header += `\n`;

    return header;
  }

  private _generateFooter(): string {
    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();

    let footer = `\n-- End of SQL Logging Session\n`;
    footer += `-- Session ID: ${this.id}\n`;
    footer += `-- Completed: ${endTime.toISOString()}\n`;
    footer += `-- Duration: ${duration}ms\n`;
    footer += `-- Total Statements: ${this._emittedStatementCount}\n`;

    return footer;
  }

  /**
   * Format SQL using sql-formatter library
   */
  private _prettyPrintSql(sql: string): string {
    if (!sql) return sql;

    try {
      let formatted = formatSql(sql, {
        language: 'tsql', // SQL Server Transact-SQL dialect (also works reasonably for PostgreSQL)
        tabWidth: 2,
        keywordCase: 'upper',
        functionCase: 'upper',
        dataTypeCase: 'upper',
        linesBetweenQueries: 1,
      });

      // Post-process to fix BEGIN/END formatting
      formatted = this._postProcessBeginEnd(formatted);

      return formatted;
    } catch (error) {
      // If formatting fails, return original SQL
      console.warn('SQL formatting failed, returning original:', error);
      return sql;
    }
  }

  /**
   * Post-process SQL to ensure BEGIN, END, and EXEC keywords are on their own lines.
   * Only applies transformations outside of SQL string literals to avoid corrupting
   * embedded SQL content stored in NVARCHAR fields.
   */
  private _postProcessBeginEnd(sql: string): string {
    if (!sql) return sql;

    // Split SQL into segments of string literals vs non-literal code.
    // SQL string literals are delimited by single quotes, with '' as the escape for a literal quote.
    // We process only the non-literal segments to avoid modifying embedded SQL content.
    const segments = this._splitAroundStringLiterals(sql);

    for (let i = 0; i < segments.length; i++) {
      if (segments[i].isLiteral) continue;

      let text = segments[i].text;

      // Fix BEGIN keyword - ensure it's on its own line
      text = text.replace(/(\S)\s+(BEGIN\b)/g, '$1\n$2');

      // Fix BEGIN followed by other keywords - ensure what follows BEGIN is on a new line
      text = text.replace(/(BEGIN\b)\s+(\S)/g, '$1\n$2');

      // Fix END keyword - ensure it's on its own line
      text = text.replace(/(\S)\s+(END\b)/g, '$1\n$2');

      // Fix EXEC keyword - ensure it's on its own line
      text = text.replace(/(\S)\s+(EXEC\b)/g, '$1\n$2');

      segments[i].text = text;
    }

    return segments.map(s => s.text).join('');
  }

  /**
   * Splits SQL into alternating segments of non-literal text and string literals.
   * Handles SQL escaped quotes ('') within string literals correctly.
   * Also handles N-prefixed strings (N'...').
   */
  private _splitAroundStringLiterals(sql: string): Array<{ text: string; isLiteral: boolean }> {
    const segments: Array<{ text: string; isLiteral: boolean }> = [];
    let currentPos = 0;

    while (currentPos < sql.length) {
      // Find the next string literal start (either ' or N')
      let quotePos = -1;
      for (let i = currentPos; i < sql.length; i++) {
        if (sql[i] === "'") {
          quotePos = i;
          break;
        }
        if (sql[i] === 'N' && i + 1 < sql.length && sql[i + 1] === "'") {
          quotePos = i;
          break;
        }
      }

      if (quotePos === -1) {
        // No more string literals - rest is non-literal
        segments.push({ text: sql.substring(currentPos), isLiteral: false });
        break;
      }

      // Add the non-literal segment before this string literal
      if (quotePos > currentPos) {
        segments.push({ text: sql.substring(currentPos, quotePos), isLiteral: false });
      }

      // Determine where the literal starts (skip the N prefix if present)
      const literalStart = quotePos;
      const quoteCharPos = sql[quotePos] === 'N' ? quotePos + 1 : quotePos;

      // Find the end of the string literal, handling escaped quotes ('')
      let endPos = quoteCharPos + 1;
      while (endPos < sql.length) {
        if (sql[endPos] === "'") {
          // Check if this is an escaped quote ('')
          if (endPos + 1 < sql.length && sql[endPos + 1] === "'") {
            endPos += 2; // Skip the escaped quote
          } else {
            endPos += 1; // This is the closing quote
            break;
          }
        } else {
          endPos++;
        }
      }

      segments.push({ text: sql.substring(literalStart, endPos), isLiteral: true });
      currentPos = endPos;
    }

    return segments;
  }

  /**
   * Counts the number of SQL variable declarations in a statement.
   * Matches `@varName SQLTYPE` patterns that appear in DECLARE blocks (both the leading
   * `DECLARE @var TYPE` and continuation `@var TYPE` lines in multi-variable DECLAREs).
   * SET/EXEC parameter references are excluded because they have `=` or `,` after the var name,
   * not a type keyword.
   *
   * Used by the `variableBatchThreshold` logic to decide when to emit a batch separator.
   */
  private _countVariableDeclarations(sql: string): number {
    return this._collectVariableDeclarations(sql).length;
  }

  /**
   * Returns every variable name declared in `sql`, lower-cased (T-SQL variable names are
   * case-insensitive), one entry per declaration so the length is the declaration count.
   * Used by the threshold-mode separator logic both to count declarations and to detect a
   * statement that would redeclare a name already declared in the current batch.
   */
  private _collectVariableDeclarations(sql: string): string[] {
    // Matches @varName followed by a SQL Server type keyword.
    // This covers both DECLARE @v TYPE and continuation @v TYPE (comma-separated multi-var DECLAREs).
    // It does NOT match SET @v = ... or EXEC sp @p = @v because those don't have a type keyword.
    const varDeclRegex =
      /(@\w+)\s+(?:UNIQUEIDENTIFIER|N?VARCHAR|N?CHAR|INT|BIGINT|SMALLINT|TINYINT|BIT|FLOAT|REAL|DECIMAL|NUMERIC|DATETIME(?:2|OFFSET)?|DATE(?!TIME)\b|TIME\b|MONEY|SMALLMONEY|VARBINARY|XML|TABLE|N?TEXT|IMAGE|ROWVERSION|TIMESTAMP|GEOGRAPHY|GEOMETRY)\b/gi;
    const names: string[] = [];
    for (const match of sql.matchAll(varDeclRegex)) {
      names.push(match[1].toLowerCase());
    }
    return names;
  }

  /**
   * Rewrites schema names to Flyway placeholders. Uses `schemaPlaceholders` when the session has
   * any usable rules; otherwise keeps the single-schema `defaultSchemaName` ->
   * `${flyway:defaultSchema}` rewrite exactly as it was.
   */
  private _applySchemaPlaceholders(sql: string, verbose: boolean): string {
    const matcher = this._schemaPlaceholderMatcher;
    if (matcher) {
      matcher.regex.lastIndex = 0;
      // The brackets are captured so `schema.` stays bare and `[schema].` keeps its brackets.
      return sql.replace(matcher.regex, (_match, openBracket: string, schema: string, closeBracket: string) => {
        return `${openBracket}${matcher.placeholderBySchema.get(schema)}${closeBracket}.`;
      });
    }

    const schemaName = this.options.defaultSchemaName;
    if (schemaName && schemaName.length > 0) {
      // Create a regex that matches the schema name with optional brackets.
      // Capture groups preserve whether the original used brackets or not,
      // so bare `schema.` stays bare and `[schema].` keeps brackets.
      const schemaRegex = new RegExp(`(\\[?)${schemaName}(\\]?)\\.`, 'g');
      return sql.replace(schemaRegex, (_match, openBracket: string, closeBracket: string) => {
        return `${openBracket}\${flyway:defaultSchema}${closeBracket}.`;
      });
    }

    if (verbose) {
      console.warn(`Session ${this.id}: No default schema name provided for Flyway migration format, using [\${flyway:defaultSchema}] placeholder`);
    }
    return sql;
  }

  /**
   * Compiles `schemaPlaceholders` into one regex. A single pass means an emitted placeholder is
   * never matched again. A short rule (`__mj`) cannot match the prefix of a longer schema
   * (`__mj_BizAppsAccounting`) because a match needs a following `.` (after an optional `]`); the
   * longest-first order of the alternation is kept for readability, not relied on. Nothing may
   * precede the name that {@link SCHEMA_PLACEHOLDER_LOOKBEHIND} excludes. The match does not tell
   * code from string data: `__mj.` inside a quoted literal is rewritten too; only a bare name with
   * no `.` after it is left alone. Returns null when no rule has both a schema and a placeholder.
   */
  private static _compileSchemaPlaceholders(rules: SqlSchemaPlaceholder[] | undefined): SchemaPlaceholderMatcher | null {
    const placeholderBySchema = new Map<string, string>();
    for (const rule of rules ?? []) {
      // The first rule for a schema wins.
      if (rule?.schema && rule.placeholder && !placeholderBySchema.has(rule.schema)) {
        placeholderBySchema.set(rule.schema, rule.placeholder);
      }
    }
    if (placeholderBySchema.size === 0) {
      return null;
    }
    const alternation = [...placeholderBySchema.keys()]
      .sort((a, b) => b.length - a.length)
      .map((schema) => SqlLoggingSessionImpl._escapeRegex(schema))
      .join('|');
    return {
      regex: new RegExp(`${SCHEMA_PLACEHOLDER_LOOKBEHIND}(\\[?)(${alternation})(\\]?)\\.`, 'g'),
      placeholderBySchema,
    };
  }

  /** Escapes regex metacharacters so a schema name matches literally. */
  private static _escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Escapes ${...} patterns within SQL string literals to prevent Flyway from interpreting them as placeholders.
   * The actual escape form is platform-specific and delegated to the configured `SQLDialect` — see
   * `SQLDialect.EscapeFlywayStringInterpolation` for the rationale (NVARCHAR(4000) truncation on SQL Server,
   * different concat operator on PostgreSQL, etc.).
   */
  private _escapeFlywaySyntaxInStrings(sql: string): string {
    return this._dialect.EscapeFlywayStringInterpolation(sql);
  }

}

/**
 * Runs the `TransformStatement` of each session in turn; sessions without one leave the text as is.
 * Returns a fixed placeholder when a transform throws.
 */
export function ApplyStatementTransforms(sql: string, sessions: Iterable<{ options: SqlLoggingOptions }>): string {
  let result = sql;
  try {
    for (const session of sessions) {
      const transform = session.options.TransformStatement;
      if (transform) {
        result = transform(result);
      }
    }
  } catch {
    return TRANSFORM_FAILED_PLACEHOLDER;
  }
  return result;
}
