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
import { SqlLoggingOptions, SqlLoggingSession } from './types.js';

/**
 * Internal implementation of SqlLoggingSession that handles SQL statement logging to files.
 * This class manages file I/O, SQL formatting, and filtering based on session options.
 *
 * @internal
 */
export class SqlLoggingSessionImpl implements SqlLoggingSession {
  /**
   * Bytes held back from `maxFileSize` when deciding to rotate, so the per-part footer (written
   * after the tracked byte count) cannot push a finalized part over the limit. Comfortably larger
   * than the footer any part emits.
   */
  private static readonly FOOTER_RESERVE_BYTES = 1024;

  public readonly Id: string;
  /** The path the caller asked for; parts are named from it, and it stops existing after the first rotation. */
  private readonly _basePath: string;
  public readonly StartTime: Date;
  public readonly Options: SqlLoggingOptions;
  private _statementCount: number = 0;
  private _emittedStatementCount: number = 0; // Track actually emitted statements
  private _currentBatchVariableCount: number = 0; // Running count of DECLARE @var declarations in current batch
  private _currentBatchDeclaredNames = new Set<string>(); // Lower-cased @names declared in the current batch (threshold mode)
  private _fileHandle: fs.promises.FileHandle | null = null;
  private _disposed: boolean = false;
  private _compiledPatterns: RegExp[] | undefined;
  private _dialect: SQLDialect;

  // --- size-based file splitting (maxFileSize) state ---
  /** Max bytes per part file; 0 disables splitting. */
  private _maxFileSize: number = 0;
  /** Byte count written to the current part so far (header + emitted statement blocks). */
  private _currentFileBytes: number = 0;
  /** Number of statement blocks emitted into the CURRENT part (rotation only allowed once >0). */
  private _currentPartStatements: number = 0;
  /** 1-based index of the part currently being written. */
  private _partIndex: number = 1;
  /** True once at least one rotation has occurred (the base file was renamed to part001). */
  private _rotated: boolean = false;
  /** Ordered list of every part path produced (starts with the base path). */
  private _partPaths: string[] = [];
  /**
   * Tail of the queue that runs {@link LogSqlStatement} and {@link Dispose} one at a time, in call
   * order. Callers can log concurrently (e.g. `mj sync push` with isolated transactions saves record
   * graphs in parallel), and a rotation spans several awaits, so unserialized callers could rotate
   * twice or write past the size limit. Never rejects: each caller gets its own result.
   */
  private _queueTail: Promise<void> = Promise.resolve();

  /**
   * @param dialect - The SQL dialect to use for platform-specific SQL emission
   *   (e.g. Flyway placeholder escaping, batch separators). Defaults to SQL
   *   Server when not provided so existing callers and tests keep working
   *   without immediately threading a dialect through every call site.
   */
  constructor(id: string, filePath: string, options: SqlLoggingOptions = {}, dialect: SQLDialect = new SQLServerDialect()) {
    this.Id = id;
    this._basePath = filePath;
    this.StartTime = new Date();
    this.Options = options;
    this._dialect = dialect;
    this._maxFileSize = options.maxFileSize && options.maxFileSize > 0 ? options.maxFileSize : 0;
    this._partPaths = [filePath];

    // Compile patterns once during construction
    if (options.filterPatterns && options.filterPatterns.length > 0) {
      this._compiledPatterns = ensureRegExps(options.filterPatterns);
    }
  }

  /**
   * Gets the count of SQL statements actually written to the log file
   * @returns The number of emitted statements (after filtering)
   */
  public get StatementCount(): number {
    return this._emittedStatementCount; // Return actually emitted statements
  }

  /**
   * File where SQL is being logged: the path given to the constructor, or the first part
   * (`*.part001.sql`) once size-based splitting has renamed that file.
   */
  public get FilePath(): string {
    return this._partPaths[0];
  }

  /**
   * Every part file produced by this session, in order. Single-element (`[FilePath]`)
   * unless size-based splitting rotated across multiple parts.
   */
  public get FilePaths(): string[] {
    return [...this._partPaths];
  }

  /**
   * Derives a part file path by inserting `.partNNN` before the extension of the base path.
   * e.g. `/x/push.sql` + index 2 → `/x/push.part002.sql`. Three digits keep lexicographic
   * filename order equal to part order up to 999 parts (two digits break at `part100` < `part11`).
   */
  private _partFilePath(index: number): string {
    const parsed = path.parse(this._basePath);
    const suffix = `.part${String(index).padStart(3, '0')}`;
    return path.join(parsed.dir, `${parsed.name}${suffix}${parsed.ext}`);
  }

  /**
   * Initializes the logging session by creating the log file and writing the header
   * @throws Error if file creation fails
   */
  public async Initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this._basePath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Open file for writing
    this._fileHandle = await fs.promises.open(this._basePath, 'w');

    // Write header comment. Part 1's header is intentionally NOT labeled with a part number:
    // at open time we don't yet know whether splitting will trigger, and a lone (unsplit) file
    // must stay neutral. Parts 2+ are labeled at rotation; part 1's footer is labeled then too
    // if a split does occur.
    const header = this._generateHeader();
    await this._fileHandle.writeFile(header);
    this._currentFileBytes = Buffer.byteLength(header);
  }

  /**
   * Rotate to a new part file (size-based splitting). Finalizes the current part with a
   * footer, closes it, and opens the next part with a fresh header. On the FIRST rotation
   * the base file is renamed to `.part001` so all parts share the `.partNNN` naming.
   *
   * Called only from `LogSqlStatement` (inside its queued write), only when splitting is enabled and the current part
   * already holds at least one statement — so rotation always happens on a statement boundary
   * and never produces an empty leading part.
   */
  private async _rotateToNextPart(): Promise<void> {
    if (!this._fileHandle) {
      return;
    }

    // Finalize the part being closed: footer, then close the handle. The footer's part label
    // comes from `_partIndex`, so it doesn't depend on the rename below.
    await this._fileHandle.writeFile(this._generateFooter(this._partIndex));
    await this._fileHandle.close();

    // On the FIRST rotation, rename the (now closed) base file to part001 so all parts share
    // `.partNNN` naming. Renaming only after close keeps this portable: Windows can reject
    // renaming a file with an open handle (EPERM/EBUSY), while POSIX doesn't care either way.
    if (!this._rotated) {
      const part1 = this._partFilePath(1);
      await fs.promises.rename(this._basePath, part1);
      this._partPaths[0] = part1;
      this._rotated = true;
    }

    // Open the next part.
    this._partIndex += 1;
    const nextPath = this._partFilePath(this._partIndex);
    this._fileHandle = await fs.promises.open(nextPath, 'w');
    this._partPaths.push(nextPath);

    // Reset per-part state: fresh header, fresh batch (a GO batch never spans a file), fresh counters.
    const header = this._generateHeader(this._partIndex);
    await this._fileHandle.writeFile(header);
    this._currentFileBytes = Buffer.byteLength(header);
    this._currentPartStatements = 0;
    this._currentBatchVariableCount = 0;
    this._currentBatchDeclaredNames.clear();
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
  public LogSqlStatement(query: string, parameters?: unknown, description?: string, isMutation: boolean = false, simpleSQLFallback?: string): Promise<void> {
    return this._enqueue(() => this._writeStatement(query, parameters, description, isMutation, simpleSQLFallback));
  }

  /**
   * Runs `work` after every earlier queued call has settled. A failed call rejects only its own
   * caller; the queue moves on to the next one.
   */
  private _enqueue(work: () => Promise<void>): Promise<void> {
    const run = this._queueTail.then(work);
    this._queueTail = run.catch(() => undefined);
    return run;
  }

  /** The body of {@link LogSqlStatement}; runs one call at a time through {@link _enqueue}. */
  private async _writeStatement(query: string, parameters: unknown, description: string | undefined, isMutation: boolean, simpleSQLFallback: string | undefined): Promise<void> {
    const verbose = this.Options.verboseOutput === true;

    if (verbose) {
      console.log(`=== SESSION ${this.Id} LOG ATTEMPT ===`);
      console.log(`Session disposed: ${this._disposed}, File handle exists: ${!!this._fileHandle}`);
      console.log(`Query (first 100 chars): ${query.substring(0, 100)}...`);
      console.log(`isMutation: ${isMutation}, description: ${description || 'none'}`);
      console.log(`Options:`, this.Options);
    }

    if (this._disposed || !this._fileHandle) {
      if (verbose) {
        console.log(`Session ${this.Id}: Skipping - disposed or no file handle`);
      }
      return;
    }

    // Filter statements based on statementTypes option
    const statementTypes = this.Options.statementTypes || 'both';
    if (verbose) {
      console.log(`Session ${this.Id}: Statement filter check - statementTypes: ${statementTypes}, isMutation: ${isMutation}`);
    }

    if (statementTypes === 'mutations' && !isMutation) {
      if (verbose) {
        console.log(`Session ${this.Id}: Skipping - mutations only but this is not a mutation`);
      }
      return; // Skip logging non-mutation statements
    }
    if (statementTypes === 'queries' && isMutation) {
      if (verbose) {
        console.log(`Session ${this.Id}: Skipping - queries only but this is a mutation`);
      }
      return; // Skip logging mutation statements
    }

    if (verbose) {
      console.log(`Session ${this.Id}: Statement passed type filters, proceeding to process`);
    }

    let logEntry = '';

    // Add description comment if provided
    if (description) {
      logEntry += `-- ${description}\n`;
    }

    // Process the SQL statement
    let processedQuery = query;

    // Use simple SQL fallback if this session has logRecordChangeMetadata=false (default) and fallback is provided
    if (this.Options.logRecordChangeMetadata !== true && simpleSQLFallback) {
      processedQuery = simpleSQLFallback;
      // Tag the description only when the logged text actually differs from what ran.
      // A save on an entity without record-change tracking can hand over a fallback that is
      // byte-identical to the executed SQL (a forced update), and tagging that would misreport it.
      if (description && simpleSQLFallback !== query && !description.includes('(core SP call only)')) {
        logEntry = logEntry.replace(`-- ${description}\n`, `-- ${description} (core SP call only)\n`);
      }
    }

    // Apply pattern filtering on the processed query
    if (this._compiledPatterns && this._compiledPatterns.length > 0) {
      const filterType = this.Options.filterType || 'exclude'; // Default to exclude
      const anyPatternMatches = this._compiledPatterns.some(pattern => pattern.test(processedQuery));

      if (verbose) {
        console.log(`Session ${this.Id}: Pattern filter check - filterType: ${filterType}, patterns: ${this._compiledPatterns.length}, anyMatch: ${anyPatternMatches}`);
        console.log(`Session ${this.Id}: Testing against processedQuery: ${processedQuery.substring(0, 100)}...`);
      }

      if (filterType === 'exclude' && anyPatternMatches) {
        if (verbose) {
          console.log(`Session ${this.Id}: Skipping - exclude pattern matched`);
        }
        return; // Skip logging if any exclude pattern matches
      }

      if (filterType === 'include' && !anyPatternMatches) {
        if (verbose) {
          console.log(`Session ${this.Id}: Skipping - no include pattern matched`);
        }
        return; // Skip logging if no include pattern matches
      }
    }

    // Replace schema names with Flyway placeholders if migration format
    if (this.Options.formatAsMigration) {
      // Step 1: Escape ${...} patterns within SQL string literals to prevent Flyway from treating them as placeholders
      processedQuery = this._escapeFlywaySyntaxInStrings(processedQuery);

      // Step 2: Replace schema names with Flyway placeholders
      const schemaName = this.Options.defaultSchemaName;
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
          console.warn(`Session ${this.Id}: No default schema name provided for Flyway migration format, using [\${flyway:defaultSchema}] placeholder`);
        }
      }
    }

    // Apply pretty printing if enabled
    if (this.Options.prettyPrint) {
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

    // At this point `logEntry` is the complete statement block (description + SQL + params),
    // WITHOUT any batch separator yet. When size-based splitting is enabled, decide rotation on
    // the block size BEFORE applying the (intra-file) batch separator — so a freshly rotated part
    // never starts with a stray leading GO. FOOTER_RESERVE_BYTES absorbs the footer/separator/
    // blank-line slack so a finalized part stays strictly under the limit.
    if (this._maxFileSize > 0 &&
        this._currentPartStatements > 0 &&
        this._currentFileBytes + Buffer.byteLength(logEntry) + SqlLoggingSessionImpl.FOOTER_RESERVE_BYTES > this._maxFileSize) {
      // The current part already holds ≥1 statement and this block would push it over the limit —
      // finalize the part and continue in a fresh one. (A single block larger than the whole limit
      // still lands in its own part; it cannot be split further.)
      await this._rotateToNextPart();
    }

    // Batch separator logic (relative to the CURRENT part):
    // - Threshold mode: emit separator when accumulated variable declarations reach the threshold,
    //   OR when this statement would redeclare a name the current batch already declared. Save-call
    //   variable suffixes are deterministic per record (GenericDatabaseProvider.allocateSaveCallSuffix),
    //   so the same record saved twice in one window emits identical DECLARE lists; SQL Server rejects
    //   a redeclared variable inside one batch, so the capture would fail on replay without this guard.
    //   The separator is prepended BEFORE the current statement (ending the previous batch).
    // - Legacy mode (no threshold): emit separator after every statement.
    // A freshly rotated part has _currentBatchVariableCount === 0, so no leading separator is added.
    const threshold = this.Options.variableBatchThreshold;
    if (this.Options.batchSeparator && threshold && threshold > 0) {
      const declaredNames = this._collectVariableDeclarations(processedQuery);
      if (declaredNames.length > 0) {
        const redeclaresName = declaredNames.some((name) => this._currentBatchDeclaredNames.has(name));
        if (this._currentBatchVariableCount > 0 && (redeclaresName || this._currentBatchVariableCount + declaredNames.length >= threshold)) {
          // End the previous batch before this statement
          logEntry = `${this.Options.batchSeparator}\n\n` + logEntry;
          this._currentBatchVariableCount = declaredNames.length;
          this._currentBatchDeclaredNames = new Set(declaredNames);
        } else {
          this._currentBatchVariableCount += declaredNames.length;
          for (const name of declaredNames) {
            this._currentBatchDeclaredNames.add(name);
          }
        }
      }
    } else if (this.Options.batchSeparator) {
      logEntry += `\n${this.Options.batchSeparator}\n`;
    }

    logEntry += '\n'; // Add blank line between statements

    if (verbose) {
      console.log(`Session ${this.Id}: About to write log entry (${logEntry.length} chars)`);
      console.log(`Session ${this.Id}: Log entry preview: ${logEntry.substring(0, 200)}...`);
    }

    try {
      await this._fileHandle.writeFile(logEntry);
      this._statementCount++;
      this._emittedStatementCount++; // Track actually emitted statements
      this._currentPartStatements++;
      this._currentFileBytes += Buffer.byteLength(logEntry);
      if (verbose) {
        console.log(`Session ${this.Id}: Successfully wrote to file. New counts - total: ${this._statementCount}, emitted: ${this._emittedStatementCount}`);
      }
    } catch (error) {
      console.error(`Session ${this.Id}: Error writing to file:`, error);
      throw error;
    }
  }

  /** @deprecated Use {@link LogSqlStatement}. */
  public async logSqlStatement(query: string, parameters?: unknown, description?: string, isMutation: boolean = false, simpleSQLFallback?: string): Promise<void> {
    return this.LogSqlStatement(query, parameters, description, isMutation, simpleSQLFallback);
  }

  /**
   * Disposes of the logging session, writes the footer, closes the file, and optionally deletes empty files.
   * Statements logged before this call are written first; statements logged after it are skipped.
   */
  public Dispose(): Promise<void> {
    return this._enqueue(() => this._dispose());
  }

  private async _dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }

    this._disposed = true;

    if (this._fileHandle) {
      // Write footer comment (label the part number only when splitting produced multiple parts).
      // Close in `finally`: a failed footer write still reports its error, but must not leak the
      // handle, since `_disposed` is already set and a retried Dispose() returns early.
      try {
        const footer = this._generateFooter(this._rotated ? this._partIndex : undefined);
        await this._fileHandle.writeFile(footer);
      } finally {
        await this._fileHandle.close();
        this._fileHandle = null;
      }

      // Check if we should delete empty log files. We delete silently — callers
      // inspect `StatementCount` to decide what (if anything) to report to the user.
      // (Previously this emitted a raw console.log with an absolute path, bypassing
      // the caller's logging callbacks and contradicting any later "log saved" line.)
      if (this._emittedStatementCount === 0 && !this.Options.retainEmptyLogFiles) {
        try {
          await fs.promises.unlink(this.FilePath);
        } catch (error) {
          // Ignore errors during deletion (file might already be deleted, etc.)
          console.error(`Failed to delete empty SQL log file: ${this.FilePath}`, error);
        }
      }
    }
  }

  /**
   * @param partIndex - when size-based splitting is active, the 1-based part number this
   *   header belongs to. Omitted for a single (unsplit) file so its header stays neutral.
   */
  private _generateHeader(partIndex?: number): string {
    let header = `-- SQL Logging Session\n`;
    header += `-- Session ID: ${this.Id}\n`;
    header += `-- Started: ${this.StartTime.toISOString()}\n`;

    if (partIndex !== undefined) {
      header += `-- Part: ${partIndex} (size-split; each part is an independent, runnable migration)\n`;
    }

    if (this.Options.description) {
      header += `-- Description: ${this.Options.description}\n`;
    }

    if (this.Options.formatAsMigration) {
      header += `-- Format: Migration-ready with Flyway schema placeholders\n`;
    }

    header += `-- Generated by MemberJunction\n`;
    header += `\n`;

    return header;
  }

  /**
   * @param partIndex - when size-based splitting is active, the 1-based part number this footer
   *   closes. `-- Total Statements` reflects the current part's own emitted count in that case;
   *   omitted for a single (unsplit) file, where it reflects the whole session.
   */
  private _generateFooter(partIndex?: number): string {
    const endTime = new Date();
    const duration = endTime.getTime() - this.StartTime.getTime();

    let footer = `\n-- End of SQL Logging Session\n`;
    footer += `-- Session ID: ${this.Id}\n`;
    if (partIndex !== undefined) {
      footer += `-- Part: ${partIndex}\n`;
    }
    footer += `-- Completed: ${endTime.toISOString()}\n`;
    footer += `-- Duration: ${duration}ms\n`;
    footer += `-- ${partIndex !== undefined ? 'Statements (this part)' : 'Total Statements'}: ${partIndex !== undefined ? this._currentPartStatements : this._emittedStatementCount}\n`;

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
   * Escapes ${...} patterns within SQL string literals to prevent Flyway from interpreting them as placeholders.
   * The actual escape form is platform-specific and delegated to the configured `SQLDialect` — see
   * `SQLDialect.EscapeFlywayStringInterpolation` for the rationale (NVARCHAR(4000) truncation on SQL Server,
   * different concat operator on PostgreSQL, etc.).
   */
  private _escapeFlywaySyntaxInStrings(sql: string): string {
    return this._dialect.EscapeFlywayStringInterpolation(sql);
  }

}
