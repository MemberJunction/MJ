/**
 * Classifies SQL batches into statement types for routing to appropriate conversion rules.
 * Ported from Python classify_batch() function.
 */
import type { StatementType } from './types.js';

/** Session SET commands that are SQL Server-specific and should be skipped */
const SESSION_SETTINGS = [
  'NUMERIC_ROUNDABORT', 'ANSI_PADDING', 'ANSI_WARNINGS',
  'CONCAT_NULL_YIELDS_NULL', 'ARITHABORT', 'QUOTED_IDENTIFIER',
  'ANSI_NULLS', 'XACT_ABORT', 'NOCOUNT', 'NOEXEC',
];

/** SQL Server system patterns that indicate a proc should be skipped */
const SQLSERVER_PROC_PATTERNS = [
  'CAREFUL_MOVE', 'SYS.TABLES', 'SYS.FOREIGN_KEY', 'SYS.CHECK_CONSTRAINT',
  'SYS.COLUMNS', 'SYS.OBJECTS', 'SYS.SCHEMAS', 'SYS.VIEWS',
  'SP_REFRESHVIEW', 'QUOTENAME',
];

/**
 * Classify a SQL batch into a statement type.
 * Tests patterns in priority order matching the Python classify_batch() logic.
 */
export function classifyBatch(batch: string): StatementType {
  const upper = batch.trimStart().toUpperCase();

  // Session settings to skip
  const sessionPattern = new RegExp(
    `^SET\\s+(${SESSION_SETTINGS.join('|')})\\b`, 'i'
  );
  if (sessionPattern.test(upper)) {
    return 'SKIP_SESSION';
  }

  // Error handling to skip
  if (upper.startsWith('IF @@ERROR')) {
    return 'SKIP_ERROR';
  }

  // User/role creation blocks (SQL Server-specific)
  if (upper.includes('SERVERPROPERTY') || upper.replace(/\s/g, '').includes('SP_EXECUTESQL')) {
    return 'SKIP_SQLSERVER';
  }
  if (/^DECLARE\s+@(ASSOCIATE|USER_EXISTS|ROLE_EXISTS)/i.test(upper)) {
    return 'SKIP_SQLSERVER';
  }

  // CREATE TABLE
  if (/^CREATE\s+TABLE\s/i.test(upper)) {
    return 'CREATE_TABLE';
  }

  // CREATE VIEW
  if (/^CREATE\s+VIEW\s/i.test(upper)) {
    return 'CREATE_VIEW';
  }

  // CREATE PROCEDURE (both full and short form)
  if (/^CREATE\s+PROC(?:EDURE)?\s/i.test(upper)) {
    return classifyProcedure(batch, upper);
  }

  // CREATE FUNCTION
  if (/^CREATE\s+FUNCTION\s/i.test(upper)) {
    return 'CREATE_FUNCTION';
  }

  // CREATE TRIGGER
  if (/^CREATE\s+TRIGGER\s/i.test(upper)) {
    return 'CREATE_TRIGGER';
  }

  // CREATE TYPE — table types don't exist in PG
  if (/^CREATE\s+TYPE\s/i.test(upper)) {
    return 'SKIP_SQLSERVER';
  }

  // ALTER TABLE sub-classification
  if (/^ALTER\s+TABLE\s/i.test(upper)) {
    return classifyAlterTable(upper);
  }

  // CREATE INDEX
  if (/^CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+)?INDEX\s/i.test(upper)) {
    return 'CREATE_INDEX';
  }

  // DML
  if (/^INSERT\s+(?:INTO\s+)?/i.test(upper)) return 'INSERT';
  if (/^UPDATE\s/i.test(upper)) return 'UPDATE';
  if (/^DELETE\s/i.test(upper)) return 'DELETE';

  // DCL
  if (/^GRANT\s/i.test(upper)) return 'GRANT';
  if (/^DENY\s/i.test(upper)) return 'DENY';
  if (/^REVOKE\s/i.test(upper)) return 'REVOKE';

  // PRINT
  if (/^PRINT[\s(]/i.test(upper)) return 'SKIP_PRINT';

  // Extended properties
  if (upper.includes('SP_ADDEXTENDEDPROPERTY')) return 'EXTENDED_PROPERTY';

  // Comment-only batches
  if (isCommentOnly(batch, upper)) return 'COMMENT_ONLY';

  // BEGIN TRY wrapping extended properties
  if (upper.includes('BEGIN TRY') && upper.includes('SP_ADDEXTENDEDPROPERTY')) {
    return 'EXTENDED_PROPERTY';
  }

  return 'UNKNOWN';
}

/** Classify a CREATE PROCEDURE batch — may be skipped if it uses SQL Server system features */
function classifyProcedure(batch: string, upper: string): StatementType {
  // Skip procs that deeply use SQL Server system tables
  for (const pat of SQLSERVER_PROC_PATTERNS) {
    if (upper.includes(pat)) return 'SKIP_SQLSERVER';
  }
  // Skip procs using temp tables (SELECT INTO #table, INSERT INTO #table)
  if (/INTO\s+#\w+/i.test(batch)) return 'SKIP_SQLSERVER';
  // Skip procs using table variables (@var TABLE(...))
  if (/@\w+\s+TABLE\s*\(/i.test(batch)) return 'SKIP_SQLSERVER';
  // Skip procs using STRING_SPLIT
  if (upper.includes('STRING_SPLIT')) return 'SKIP_SQLSERVER';

  return 'CREATE_PROCEDURE';
}

/** Sub-classify ALTER TABLE statements */
function classifyAlterTable(upper: string): StatementType {
  if (upper.includes('ADD CONSTRAINT') && upper.includes('FOREIGN KEY')) return 'FK_CONSTRAINT';
  if (upper.includes('ADD CONSTRAINT') && upper.includes('PRIMARY KEY')) return 'PK_CONSTRAINT';
  if (upper.includes('ADD CONSTRAINT') && upper.includes('CHECK')) return 'CHECK_CONSTRAINT';
  if (upper.includes('ADD CONSTRAINT') && upper.includes('UNIQUE')) return 'UNIQUE_CONSTRAINT';
  if (upper.includes('WITH CHECK CHECK CONSTRAINT')) return 'ENABLE_CONSTRAINT';
  if (upper.includes('NOCHECK CONSTRAINT')) return 'SKIP_NOCHECK';
  return 'ALTER_TABLE';
}

/** Check if batch is comment-only (no SQL after removing comments) */
function isCommentOnly(batch: string, upper: string): boolean {
  if (!/^(\/\*|--)/.test(upper)) return false;
  // Remove block and line comments, check if anything meaningful remains
  const stripped = batch
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .trim()
    .toUpperCase();
  return !/^(CREATE|ALTER|INSERT|UPDATE|DELETE|GRANT|EXEC)/.test(stripped);
}
