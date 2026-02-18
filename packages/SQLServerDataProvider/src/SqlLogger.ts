/**
 * @fileoverview SQL Logging Implementation for SQL Server Data Provider
 * 
 * This module provides SQL statement logging functionality with file I/O,
 * filtering, formatting, and session management capabilities.
 * 
 * @module @memberjunction/sqlserver-dataprovider/SqlLogger
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
  public async logSqlStatement(query: string, parameters?: any, description?: string, isMutation: boolean = false, simpleSQLFallback?: string): Promise<void> {
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
      // This regex matches string literals and replaces ${...} with $' + '{...} within them
      processedQuery = this._escapeFlywaySyntaxInStrings(processedQuery);

      // Step 2: Replace schema names with Flyway placeholders
      const schemaName = this.options.defaultSchemaName;
      if (schemaName?.length > 0) {
        // Create a regex that matches the schema name with optional brackets
        const schemaRegex = new RegExp(`\\[?${schemaName}\\]?\\.`, 'g');
        processedQuery = processedQuery.replace(schemaRegex, '[${flyway:defaultSchema}].');
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
          logEntry += `-- Parameters: ${parameters.map((p, i) => `@p${i}='${p}'`).join(', ')}\n`;
        }
      } else if (typeof parameters === 'object') {
        const paramStr = Object.entries(parameters)
          .map(([key, value]) => `@${key}='${value}'`)
          .join(', ');
        if (paramStr) {
          logEntry += `-- Parameters: ${paramStr}\n`;
        }
      }
    }

    // Add batch separator if specified
    if (this.options.batchSeparator) {
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

    header += `-- Generated by MemberJunction SQLServerDataProvider\n`;
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
   * Format SQL using sql-formatter library with SQL Server dialect
   */
  private _prettyPrintSql(sql: string): string {
    if (!sql) return sql;

    try {
      let formatted = formatSql(sql, {
        language: 'tsql', // SQL Server Transact-SQL dialect
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
   * Post-process SQL to ensure BEGIN, END, and EXEC keywords are on their own lines
   */
  private _postProcessBeginEnd(sql: string): string {
    if (!sql) return sql;

    // Fix BEGIN keyword - ensure it's on its own line
    // Match: any non-whitespace followed by space(s) followed by BEGIN (word boundary)
    sql = sql.replace(/(\S)\s+(BEGIN\b)/g, '$1\n$2');

    // Fix BEGIN followed by other keywords - ensure what follows BEGIN is on a new line
    // Match: BEGIN followed by space(s) followed by non-whitespace
    sql = sql.replace(/(BEGIN\b)\s+(\S)/g, '$1\n$2');

    // Fix END keyword - ensure it's on its own line
    // Match: any non-whitespace followed by space(s) followed by END (word boundary)
    sql = sql.replace(/(\S)\s+(END\b)/g, '$1\n$2');

    // Fix EXEC keyword - ensure it's on its own line
    // Match: any non-whitespace followed by space(s) followed by EXEC (word boundary)
    sql = sql.replace(/(\S)\s+(EXEC\b)/g, '$1\n$2');

    return sql;
  }

  /**
   * Escapes ${...} patterns within SQL string literals to prevent Flyway from interpreting them as placeholders.
   * Converts ${templateVariable} to $' + '{templateVariable} within string literals.
   *
   * @param sql - The SQL statement to process
   * @returns The SQL with escaped template syntax within strings
   */
  private _escapeFlywaySyntaxInStrings(sql: string): string {
    // Regex /\$\{/g matches all occurrences of "${" literally:
    // - \$ escapes the dollar sign (which is a special regex character)
    // - \{ escapes the opening brace (also a special regex character)
    // - /g flag ensures all occurrences are replaced, not just the first one
    // The replacement "$'+'{ " breaks up the ${ pattern so Flyway won't interpret it as a placeholder
    return sql.replaceAll(/\$\{/g, "$$'+'{");
  }

}