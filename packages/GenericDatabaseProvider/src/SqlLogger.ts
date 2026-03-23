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
import { SqlLoggingOptions, SqlLoggingSession } from './types.js';

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
  private _fileHandle: fs.promises.FileHandle | null = null;
  private _disposed: boolean = false;
  private _compiledPatterns: RegExp[] | undefined;

  constructor(id: string, filePath: string, options: SqlLoggingOptions = {}) {
    this.id = id;
    this.filePath = filePath;
    this.startTime = new Date();
    this.options = options;

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
      // Update description to indicate we're using the simplified version
      if (description && !description.includes('(core SP call only)')) {
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

    // Replace schema names with Flyway placeholders if migration format
    if (this.options.formatAsMigration) {
      // Step 1: Escape ${...} patterns within SQL string literals to prevent Flyway from treating them as placeholders
      processedQuery = this._escapeFlywaySyntaxInStrings(processedQuery);

      // Step 2: Replace schema names with Flyway placeholders
      const schemaName = this.options.defaultSchemaName;
      if (schemaName && schemaName.length > 0) {
        // Create a regex that matches the schema name with optional brackets.
        // Capture groups preserve whether the original used brackets or not,
        // so bare `schema.` stays bare and `[schema].` keeps brackets.
        const schemaRegex = new RegExp(`(\\[?)${schemaName}(\\]?)\\.`, 'g');
        processedQuery = processedQuery.replace(schemaRegex, (_match, openBracket: string, closeBracket: string) => {
          return `${openBracket}\${flyway:defaultSchema}${closeBracket}.`;
        });
      }
      else {
        // no default schema name provided
        if (verbose) {
          console.warn(`Session ${this.id}: No default schema name provided for Flyway migration format, using [\${flyway:defaultSchema}] placeholder`);
        }
      }
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
    // - Threshold mode: emit separator when accumulated variable declarations reach the threshold.
    //   The separator is prepended BEFORE the current statement (ending the previous batch).
    // - Legacy mode (no threshold): emit separator after every statement.
    const threshold = this.options.variableBatchThreshold;
    if (this.options.batchSeparator && threshold && threshold > 0) {
      const newVarCount = this._countVariableDeclarations(processedQuery);
      if (newVarCount > 0) {
        if (this._currentBatchVariableCount > 0 &&
            this._currentBatchVariableCount + newVarCount >= threshold) {
          // End the previous batch before this statement
          logEntry = `${this.options.batchSeparator}\n\n` + logEntry;
          this._currentBatchVariableCount = newVarCount;
        } else {
          this._currentBatchVariableCount += newVarCount;
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

      // Check if we should delete empty log files
      if (this._emittedStatementCount === 0 && !this.options.retainEmptyLogFiles) {
        try {
          await fs.promises.unlink(this.filePath);
          // Log that we deleted the empty file (optional)
          console.log(`Deleted empty SQL log file: ${this.filePath}`);
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
    // Matches @varName followed by a SQL Server type keyword.
    // This covers both DECLARE @v TYPE and continuation @v TYPE (comma-separated multi-var DECLAREs).
    // It does NOT match SET @v = ... or EXEC sp @p = @v because those don't have a type keyword.
    const varDeclRegex = /@\w+\s+(?:UNIQUEIDENTIFIER|N?VARCHAR|N?CHAR|INT|BIGINT|SMALLINT|TINYINT|BIT|FLOAT|REAL|DECIMAL|NUMERIC|DATETIME(?:2|OFFSET)?|DATE(?!TIME)\b|TIME\b|MONEY|SMALLMONEY|VARBINARY|XML|TABLE|N?TEXT|IMAGE|ROWVERSION|TIMESTAMP|GEOGRAPHY|GEOMETRY)\b/gi;
    const matches = sql.match(varDeclRegex);
    return matches ? matches.length : 0;
  }

  /**
   * Escapes ${...} patterns within SQL string literals to prevent Flyway from interpreting them as placeholders.
   * Converts ${templateVariable} to $' + '{templateVariable} within string literals.
   */
  private _escapeFlywaySyntaxInStrings(sql: string): string {
    return sql.replaceAll(/\$\{/g, "$$'+'{");
  }

}
