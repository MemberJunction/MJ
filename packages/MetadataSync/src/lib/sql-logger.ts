/**
 * @fileoverview SQL Logger for capturing database operations during metadata sync
 * @module sql-logger
 * 
 * This module provides SQL logging functionality to capture all database operations
 * during push commands. It supports both raw SQL logging and migration-formatted output.
 */

import fs from 'fs-extra';
import path from 'path';
import { SyncConfig } from '../config';

export interface SQLLoggerOptions {
  enabled: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  outputDirectory: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  formatAsMigration: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export class SQLLogger {
  private options: SQLLoggerOptions;
  private statements: string[] = [];
  private isInitialized = false;
  
  constructor(syncConfig: SyncConfig | null) {
    this.options = {
      enabled: syncConfig?.sqlLogging?.enabled ?? false,
      outputDirectory: syncConfig?.sqlLogging?.outputDirectory ?? './sql_logging',
      formatAsMigration: syncConfig?.sqlLogging?.formatAsMigration ?? false
    };
  }
  
  get Enabled(): boolean {
    return this.options.enabled;
  }

  /** @deprecated Use {@link Enabled}. */
  get enabled(): boolean {
    return this.Enabled;
  }
  
  /**
   * Initialize the SQL logger and prepare output directory
   */
  async Initialize(): Promise<void> {
    if (!this.options.enabled || this.isInitialized) {
      return;
    }
    
    // Ensure output directory exists
    await fs.ensureDir(this.options.outputDirectory);
    this.isInitialized = true;
  }

  /** @deprecated Use {@link Initialize}. */
  async initialize(): Promise<void> {
    return this.Initialize();
  }
  
  /**
   * Log a SQL statement
   */
  LogStatement(sql: string, params?: any[]): void {
    if (!this.options.enabled) {
      return;
    }
    
    // Format SQL with parameters inline for readability
    let formattedSql = sql;
    if (params && params.length > 0) {
      // Replace parameter placeholders with actual values
      params.forEach((param, index) => {
        const placeholder = `@param${index + 1}`;
        const value = this.formatParamValue(param);
        // Function replacement: a parameter value containing `$&`/`` $` ``/`$'`/`$$`
        // would otherwise be expanded, logging SQL that never ran. See issue #3171.
        formattedSql = formattedSql.replace(new RegExp(placeholder, 'g'), () => value);
      });
    }
    
    this.statements.push(formattedSql);
  }

  /** @deprecated Use {@link LogStatement}. */
  logStatement(sql: string, params?: any[]): void {
    return this.LogStatement(sql, params);
  }
  
  /**
   * Log a transaction boundary
   */
  LogTransaction(action: 'BEGIN' | 'COMMIT' | 'ROLLBACK'): void {
    if (!this.options.enabled) {
      return;
    }
    
    this.statements.push(`${action} TRANSACTION;`);
  }

  /** @deprecated Use {@link LogTransaction}. */
  logTransaction(action: 'BEGIN' | 'COMMIT' | 'ROLLBACK'): void {
    return this.LogTransaction(action);
  }
  
  /**
   * Write the collected SQL statements to file
   */
  async WriteLog(): Promise<string | undefined> {
    if (!this.options.enabled || this.statements.length === 0) {
      return undefined;
    }
    
    await this.Initialize();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let filename: string;
    let content: string;
    
    if (this.options.formatAsMigration) {
      // Format as Flyway migration
      const migrationTimestamp = timestamp.replace(/[-T]/g, '').substring(0, 14);
      filename = `V${migrationTimestamp}__MetadataSync_Push.sql`;
      
      content = [
        '-- MemberJunction MetadataSync Push Migration',
        `-- Generated at: ${new Date().toISOString()}`,
        '-- Description: Metadata changes pushed via mj sync push command',
        '',
        '-- Note: Schema placeholders can be replaced during deployment',
        '-- Replace ${flyway:defaultSchema} with your target schema name',
        '',
        ...this.statements.map(stmt => {
          // Add schema placeholders for migration format
          return stmt.replace(/(\[?)__mj(\]?)\./g, '${flyway:defaultSchema}.');
        })
      ].join('\n');
    } else {
      // Regular SQL log format
      filename = `metadatasync-push-${timestamp}.sql`;
      
      content = [
        '-- MemberJunction MetadataSync SQL Log',
        `-- Generated at: ${new Date().toISOString()}`,
        `-- Total statements: ${this.statements.length}`,
        '',
        ...this.statements
      ].join('\n');
    }
    
    const filePath = path.join(this.options.outputDirectory, filename);
    await fs.writeFile(filePath, content, 'utf8');
    
    return filePath;
  }

  /** @deprecated Use {@link WriteLog}. */
  async writeLog(): Promise<string | undefined> {
    return this.WriteLog();
  }
  
  /**
   * Clear all logged statements
   */
  Clear(): void {
    this.statements = [];
  }

  /** @deprecated Use {@link Clear}. */
  clear(): void {
    return this.Clear();
  }
  
  /**
   * Format a parameter value for SQL
   */
  private formatParamValue(value: any): string {
    if (value === null) {
      return 'NULL';
    }
    if (typeof value === 'string') {
      // Escape single quotes and wrap in quotes
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    return String(value);
  }
}