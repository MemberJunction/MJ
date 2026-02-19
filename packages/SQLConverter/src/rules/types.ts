/**
 * Core types for the SQL conversion rule system.
 *
 * Each rule can pre-process (before sqlglot), post-process (after sqlglot),
 * or bypass sqlglot entirely for statement types it handles natively.
 */

/** Classification labels for SQL batches/statements */
export type StatementType =
  | 'CREATE_TABLE'
  | 'CREATE_VIEW'
  | 'CREATE_INDEX'
  | 'CREATE_PROCEDURE'
  | 'CREATE_FUNCTION'
  | 'CREATE_TRIGGER'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'ALTER_TABLE'
  | 'FK_CONSTRAINT'
  | 'PK_CONSTRAINT'
  | 'CHECK_CONSTRAINT'
  | 'UNIQUE_CONSTRAINT'
  | 'ENABLE_CONSTRAINT'
  | 'GRANT'
  | 'DENY'
  | 'REVOKE'
  | 'EXTENDED_PROPERTY'
  | 'COMMENT_ONLY'
  | 'SKIP_SESSION'
  | 'SKIP_ERROR'
  | 'SKIP_SQLSERVER'
  | 'SKIP_NOCHECK'
  | 'SKIP_PRINT'
  | 'UNKNOWN';

/**
 * Shared context passed through the conversion pipeline.
 * Accumulates state (e.g., column types from CREATE TABLE for boolean casting).
 */
export interface ConversionContext {
  /** Source SQL dialect (e.g., 'tsql') */
  SourceDialect: string;
  /** Target SQL dialect (e.g., 'postgres') */
  TargetDialect: string;
  /** Target schema name (e.g., '__mj') */
  Schema: string;
  /**
   * Accumulated column type info from CREATE TABLE statements.
   * Used by INSERT rules for boolean casting (0→false, 1→true for BOOLEAN columns).
   * Map: tableName (lowercase) → Map(columnName lowercase → pgType uppercase)
   */
  TableColumns: Map<string, Map<string, string>>;
  /** Hand-written function replacements keyed by lowercase function name */
  HandWrittenFunctions: Map<string, string>;
  /**
   * Set of function/procedure names that were successfully converted (not skipped).
   * Used by GrantRule to skip grants on functions that don't exist.
   * Names are stored as-is (case-sensitive, without schema prefix).
   */
  CreatedFunctions: Set<string>;
  /**
   * Set of view names that were successfully converted (not skipped).
   * Used by GrantRule to skip grants on views that don't exist.
   */
  CreatedViews: Set<string>;
}

/**
 * Interface for a single conversion rule.
 *
 * Rules are applied to statements that match their AppliesTo list.
 * They can pre-process (before sqlglot), post-process (after sqlglot),
 * or fully bypass sqlglot by setting BypassSqlglot = true.
 */
export interface IConversionRule {
  /** Human-readable name for logging/debugging */
  Name: string;
  /** Statement types this rule applies to */
  AppliesTo: StatementType[];
  /** Priority — lower numbers run first (default: 100) */
  Priority: number;
  /**
   * Transform SQL BEFORE sqlglot transpilation.
   * Return the modified SQL string.
   */
  PreProcess?(sql: string, context: ConversionContext): string;
  /**
   * Transform SQL AFTER sqlglot transpilation.
   * @param sql - The sqlglot-transpiled SQL (or original if BypassSqlglot)
   * @param originalSQL - The original T-SQL statement
   * @param context - Shared conversion context
   * @returns The final converted SQL
   */
  PostProcess?(sql: string, originalSQL: string, context: ConversionContext): string;
  /**
   * If true, this rule handles conversion entirely — skip sqlglot.
   * The PostProcess method receives the original SQL as both parameters.
   */
  BypassSqlglot?: boolean;
}

/** Conversion statistics tracking */
export interface ConversionStats {
  TotalBatches: number;
  Converted: number;
  Skipped: number;
  Errors: number;
  TablesCreated: number;
  ViewsCreated: number;
  ProceduresConverted: number;
  FunctionsConverted: number;
  TriggersConverted: number;
  InsertsConverted: number;
  GrantsConverted: number;
  FKConstraints: number;
  CheckConstraints: number;
  IndexesCreated: number;
  CommentsConverted: number;
  SkippedBatches: string[];
  ErrorBatches: string[];
}

/** Groups for ordering the output */
export interface OutputGroups {
  Tables: string[];
  HelperFunctions: string[];
  Views: string[];
  StoredProcedures: string[];
  Triggers: string[];
  Data: string[];
  FKConstraints: string[];
  Grants: string[];
  Comments: string[];
  Other: string[];
}

/** Create a fresh ConversionContext */
export function createConversionContext(
  sourceDialect: string,
  targetDialect: string,
  schema: string = '__mj'
): ConversionContext {
  return {
    SourceDialect: sourceDialect,
    TargetDialect: targetDialect,
    Schema: schema,
    TableColumns: new Map(),
    HandWrittenFunctions: new Map(),
    CreatedFunctions: new Set(),
    CreatedViews: new Set(),
  };
}

/** Create empty conversion stats */
export function createConversionStats(): ConversionStats {
  return {
    TotalBatches: 0,
    Converted: 0,
    Skipped: 0,
    Errors: 0,
    TablesCreated: 0,
    ViewsCreated: 0,
    ProceduresConverted: 0,
    FunctionsConverted: 0,
    TriggersConverted: 0,
    InsertsConverted: 0,
    GrantsConverted: 0,
    FKConstraints: 0,
    CheckConstraints: 0,
    IndexesCreated: 0,
    CommentsConverted: 0,
    SkippedBatches: [],
    ErrorBatches: [],
  };
}

/** Create empty output groups */
export function createOutputGroups(): OutputGroups {
  return {
    Tables: [],
    HelperFunctions: [],
    Views: [],
    StoredProcedures: [],
    Triggers: [],
    Data: [],
    FKConstraints: [],
    Grants: [],
    Comments: [],
    Other: [],
  };
}
