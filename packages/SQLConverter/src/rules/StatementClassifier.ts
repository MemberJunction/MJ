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
  const rawUpper = batch.trimStart().toUpperCase();
  // Strip leading comments to detect the real SQL keyword
  const upper = stripLeadingComments(batch).trimStart().toUpperCase() || rawUpper;

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

  // IF OBJECT_ID ... DROP PROCEDURE/FUNCTION → skip (CREATE OR REPLACE handles it)
  if (/^IF\s+OBJECT_ID\s*\(/i.test(upper)) {
    return 'SKIP_SQLSERVER';
  }

  // IF NOT EXISTS ... → conditional DDL or SKIP depending on body content
  if (/^IF\s+NOT\s+EXISTS\s*\(/i.test(upper)) {
    // CREATE ROLE conditional: convert to PG-compatible DO block
    if (upper.includes('SYS.DATABASE_PRINCIPAL') && /CREATE\s+ROLE\b/i.test(upper)) {
      return 'CONDITIONAL_DDL';
    }
    // Skip IF NOT EXISTS blocks that use SQL Server system features
    if (upper.includes('SERVERPROPERTY') || upper.includes('CREATE LOGIN') ||
        upper.includes('SYS.SERVER_PRINCIPAL') || upper.includes('SYS.DATABASE_PRINCIPAL')) {
      return 'SKIP_SQLSERVER';
    }
    return 'CONDITIONAL_DDL';
  }

  // User/role creation blocks (SQL Server-specific)
  if (upper.includes('SERVERPROPERTY') || upper.replace(/\s/g, '').includes('SP_EXECUTESQL')) {
    return 'SKIP_SQLSERVER';
  }
  if (/^DECLARE\s+@/i.test(upper)) {
    // DECLARE blocks with EXEC calls to schema procedures → convert as EXEC_BLOCK
    // These are metadata sync patterns: DECLARE vars, SET values, EXEC spProc
    if (/\bEXEC\s+\[?\w+\]?\s*\.\s*\[?\w+\]?\s/i.test(upper)) {
      return 'EXEC_BLOCK';
    }
    // DECLARE blocks without EXEC → SQL Server-specific variable declarations
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

  // CREATE SCHEMA — already handled by the converter header (CREATE SCHEMA IF NOT EXISTS)
  if (/^CREATE\s+SCHEMA\s/i.test(upper)) {
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

  // DML — but skip table variable operations (INSERT INTO @var, SELECT FROM @var)
  if (/^INSERT\s+INTO\s+@/i.test(upper)) return 'SKIP_SQLSERVER';
  if (/^SELECT\b[\s\S]*\bFROM\s+@/i.test(upper)) return 'SKIP_SQLSERVER';
  if (/^INSERT\s+(?:INTO\s+)?/i.test(upper)) return 'INSERT';
  if (/^UPDATE\s/i.test(upper)) return 'UPDATE';
  if (/^DELETE\s/i.test(upper)) return 'DELETE';

  // DCL
  if (/^GRANT\s/i.test(upper)) return 'GRANT';
  if (/^DENY\s/i.test(upper)) return 'DENY';
  if (/^REVOKE\s/i.test(upper)) return 'REVOKE';

  // PRINT
  if (/^PRINT[\s(]/i.test(upper)) return 'SKIP_PRINT';

  // Extended properties (add, update, and drop variants)
  if (upper.includes('SP_ADDEXTENDEDPROPERTY') || upper.includes('SP_UPDATEEXTENDEDPROPERTY') || upper.includes('SP_DROPEXTENDEDPROPERTY')) return 'EXTENDED_PROPERTY';

  // EXEC calls (not sp_addextendedproperty, which is handled above) → skip
  if (/^EXEC\s/i.test(upper)) return 'SKIP_SQLSERVER';

  // Comment-only batches (use rawUpper to detect comment-prefixed text)
  if (isCommentOnly(batch, rawUpper)) return 'COMMENT_ONLY';

  // BEGIN TRY wrapping extended properties
  if (rawUpper.includes('BEGIN TRY') && (rawUpper.includes('SP_ADDEXTENDEDPROPERTY') || rawUpper.includes('SP_UPDATEEXTENDEDPROPERTY') || rawUpper.includes('SP_DROPEXTENDEDPROPERTY'))) {
    return 'EXTENDED_PROPERTY';
  }

  // CREATE USER — SQL Server-specific (skip)
  if (/^CREATE\s+USER\s/i.test(upper)) {
    return 'SKIP_SQLSERVER';
  }
  // CREATE ROLE — valid in both SQL Server and PostgreSQL (convert via CONDITIONAL_DDL)
  if (/^CREATE\s+ROLE\s/i.test(upper)) {
    return 'CONDITIONAL_DDL';
  }

  // Orphaned control flow fragments from sub-splitting
  if (/^(END|ELSE\s+IF|ELSE)\b/i.test(upper)) {
    return 'SKIP_SQLSERVER';
  }

  // USE database — SQL Server-specific, not needed in PG
  if (/^USE\s+/i.test(upper)) {
    return 'SKIP_SQLSERVER';
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
  // Skip procs using complex table variables, but allow @InsertedRow TABLE (simple output capture)
  if (/@\w+\s+TABLE\s*\(/i.test(batch) && !/@InsertedRow\s+TABLE\s*\(/i.test(batch)) {
    return 'SKIP_SQLSERVER';
  }
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

/** Strip leading single-line (--) and block comments from SQL text */
function stripLeadingComments(sql: string): string {
  let s = sql.trimStart();
  while (s.length > 0) {
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      s = nl < 0 ? '' : s.slice(nl + 1).trimStart();
    } else if (s.startsWith('/*')) {
      const end = s.indexOf('*/');
      s = end < 0 ? '' : s.slice(end + 2).trimStart();
    } else {
      break;
    }
  }
  return s;
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
  return !/^(CREATE|ALTER|INSERT|UPDATE|DELETE|GRANT|EXEC|USE)/.test(stripped);
}
