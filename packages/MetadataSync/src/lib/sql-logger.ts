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
  enabled: boolean;
  outputDirectory: string;
  formatAsMigration: boolean;
}

export class SQLLogger {
  private options: SQLLoggerOptions;
  private statements: string[] = [];
  private isInitialized = false;
  
  constructor(syncConfig: SyncConfig | null) {
    this.options = {
      enabled: syncConfig?.sqlLogging?.enabled || false,
      outputDirectory: syncConfig?.sqlLogging?.outputDirectory || './sql_logging',
      formatAsMigration: syncConfig?.sqlLogging?.formatAsMigration || false
    };
  }
  
  get enabled(): boolean {
    return this.options.enabled;
  }
  
  /**
   * Initialize the SQL logger and prepare output directory
   */
  async initialize(): Promise<void> {
    if (!this.options.enabled || this.isInitialized) {
      return;
    }
    
    // Ensure output directory exists
    await fs.ensureDir(this.options.outputDirectory);
    this.isInitialized = true;
  }
  
  /**
   * Log a SQL statement
   */
  logStatement(sql: string, params?: any[]): void {
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
        formattedSql = formattedSql.replace(new RegExp(placeholder, 'g'), value);
      });
    }
    
    this.statements.push(formattedSql);
  }
  
  /**
   * Log a transaction boundary
   */
  logTransaction(action: 'BEGIN' | 'COMMIT' | 'ROLLBACK'): void {
    if (!this.options.enabled) {
      return;
    }
    
    this.statements.push(`${action} TRANSACTION;`);
  }
  
  /**
   * Write the collected SQL statements to file
   */
  async writeLog(): Promise<string | undefined> {
    if (!this.options.enabled || this.statements.length === 0) {
      return undefined;
    }
    
    await this.initialize();
    
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
  
  /**
   * Clear all logged statements
   */
  clear(): void {
    this.statements = [];
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