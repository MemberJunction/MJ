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
  /** Lazily compiled schema rewrite rules; `null` means "nothing to rewrite", `undefined` means "not built yet". */
  private _schemaPlaceholderMatcher: { regex: RegExp; bySchema: Map<string, string> } | null | undefined;

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
  public async logSqlStatement(query: string, parameters?: unknown, description?: string, isMutation: boolean = false, simpleSQLFallback?: string): Promise<void> {
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
      // A save on an entity without record-change tracking hands over a fallback that is
      // byte-identical to the executed SQL (updates), and tagging that would misreport it.
      if (description && simpleSQLFallback !== query && !description.includes('(core SP call only)')) {
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

    // Escape ${...} inside string literals so Skyway/Flyway does not read captured content
    // (template text, prompt bodies) as an undeclared placeholder. Implied by migration
    // formatting; also available on its own via `escapeFlywaySyntax`.
    if (this.options.formatAsMigration || this.options.escapeFlywaySyntax) {
      processedQuery = this._escapeFlywaySyntaxInStrings(processedQuery);
    }

    // Replace schema names with Flyway placeholders if migration format
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
    if (parameters) {
      if (Array.isArray(parameters)) {
        if (parameters.length > 0) {
          logEntry += `-- Parameters: ${parameters.map((p: unknown, i: number) => `@p${i}='${p}'`).join(', ')}\n`;
        }
      } else if (typeof parameters === 'object') {
        const paramStr = Object.entries(parameters as Record<string, unknown>)
          .map(([key, value]) => `@${key}='${value}'`)
          .join(', ');
        if (paramStr) {
          logEntry += `-- Parameters: ${paramStr}\n`;
        }
      }
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
   * Rewrites literal schema names in a captured statement to their Flyway placeholders.
   *
   * Uses `options.schemaPlaceholders` when supplied, and otherwise falls back to the historical
   * single-schema behaviour (`defaultSchemaName` -> `${flyway:defaultSchema}`) so MJ's own capture
   * is unchanged. See `SqlLoggingOptions.schemaPlaceholders` for why an Open App needs more than
   * one rule.
   */
  private _applySchemaPlaceholders(sql: string, verbose: boolean): string {
    const compiled = this._getSchemaPlaceholderMatcher();
    if (!compiled) {
      if (verbose) {
        console.warn(`Session ${this.id}: No schema placeholders or default schema name provided for Flyway migration format; schema names left as-is`);
      }
      return sql;
    }

    const { regex, bySchema } = compiled;
    regex.lastIndex = 0;
    // Capture groups preserve whether the original used brackets or not, so bare `schema.` stays
    // bare and `[schema].` keeps brackets.
    return sql.replace(regex, (_match, openBracket: string, schema: string, closeBracket: string) => {
      return `${openBracket}${bySchema.get(schema)}${closeBracket}.`;
    });
  }

  /**
   * Builds (once per session) the schema-matching regex and its schema -> placeholder lookup.
   * Options are fixed for a session's lifetime, and a large capture runs this over tens of
   * thousands of statements, so the compile is cached.
   *
   * Returns null when the session has nothing to rewrite with.
   */
  private _getSchemaPlaceholderMatcher(): { regex: RegExp; bySchema: Map<string, string> } | null {
    if (this._schemaPlaceholderMatcher !== undefined) {
      return this._schemaPlaceholderMatcher;
    }

    const configured = this.options.schemaPlaceholders?.filter((m) => !!m?.schema && !!m?.placeholder) ?? [];
    const defaultSchema = this.options.defaultSchemaName;
    const rules: SqlSchemaPlaceholder[] =
      configured.length > 0
        ? configured
        : defaultSchema
          ? [{ schema: defaultSchema, placeholder: '${flyway:defaultSchema}' }]
          : [];

    if (rules.length === 0) {
      this._schemaPlaceholderMatcher = null;
      return null;
    }

    // First declaration of a schema wins, so a caller's ordering still expresses intent on a
    // duplicate key even though matching itself is order-independent.
    const bySchema = new Map<string, string>();
    for (const { schema, placeholder } of rules) {
      if (!bySchema.has(schema)) {
        bySchema.set(schema, placeholder);
      }
    }

    // One pass per statement, alternation ordered longest-schema-first. Two properties matter:
    // a generic rule (`__mj`) can never eat the prefix of a specific one (`__mj_BizAppsAccounting`)
    // whatever order they were declared in, and an emitted placeholder is never re-matched by a
    // later rule.
    const alternation = [...bySchema.keys()]
      .sort((a, b) => b.length - a.length)
      .map((schema) => SqlLoggingSessionImpl._escapeRegex(schema))
      .join('|');

    this._schemaPlaceholderMatcher = {
      regex: new RegExp(`(\\[?)(${alternation})(\\]?)\\.`, 'g'),
      bySchema,
    };
    return this._schemaPlaceholderMatcher;
  }

  /** Escapes regex metacharacters so a schema name is matched literally. */
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
