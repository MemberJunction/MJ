/**
 * Post-processing pass applied to the entire converted SQL output.
 * Ported from Python postprocess() function.
 *
 * Handles: remaining bracket identifiers, type name unquoting, boolean fixes,
 * INFORMATION_SCHEMA casing, long index name truncation, backslash line fix, etc.
 */

import { createHash } from 'node:crypto';

/**
 * Final cleanup pass on the complete converted SQL output.
 * Applied after all individual statement conversions are done.
 */
export function postProcess(sql: string): string {
  // Remove any remaining [brackets] that slipped through
  // Preserve PostgreSQL array access like p_Parts[1] (numeric indices)
  sql = sql.replace(/\[([^\]\d][^\]]*)\]/g, '"$1"');

  // Remove any remaining COLLATE clauses
  sql = sql.replace(/\s+COLLATE\s+SQL_Latin1_General_CP1_CI_AS/gi, '');

  // Remove IF @@ERROR <> 0 SET NOEXEC ON (must come BEFORE generic SET NOEXEC removal)
  sql = sql.replace(/IF\s+@@ERROR\s*<>\s*0\s+SET\s+NOEXEC\s+ON\s*;?/gi, '');

  // Remove SET NOEXEC ON/OFF
  sql = sql.replace(/SET\s+NOEXEC\s+(ON|OFF)\s*;?/gi, '');

  // Remove SET NUMERIC_ROUNDABORT OFF
  sql = sql.replace(/SET\s+NUMERIC_ROUNDABORT\s+OFF\s*;?/gi, '');

  // Remove SET XACT_ABORT ON/OFF
  sql = sql.replace(/SET\s+XACT_ABORT\s+(ON|OFF)\s*;?/gi, '');

  // Convert RAISERROR → RAISE EXCEPTION (PG syntax)
  sql = sql.replace(
    /\bRAISERROR\s*\(\s*N?'([^']*)'\s*,\s*\d+\s*,\s*\d+\s*\)\s*;?/gi,
    "RAISE EXCEPTION '$1';"
  );

  // Fix remaining SQL Server type names used in procedure parameters
  // NOTE: Type conversions must run BEFORE type unquoting so that
  // e.g. "INT" → "INTEGER" gets cleaned up by the unquoting pass below.
  sql = sql.replace(/\bnvarchar\s*\(\s*MAX\s*\)/gi, 'TEXT');
  sql = sql.replace(/\bnvarchar\s*\(\s*(\d+)\s*\)/gi, 'VARCHAR($1)');
  sql = sql.replace(/\bnvarchar\b/gi, 'TEXT');
  sql = sql.replace(/\buniqueid(?:entifier)?\b/gi, 'UUID');
  // int → INTEGER (standalone word only, avoid matching into "integer")
  sql = sql.replace(/\bint\b(?!eger)/gi, 'INTEGER');
  // varbinary → BYTEA
  sql = sql.replace(/\bvarbinary\b/gi, 'BYTEA');

  // Fix quoted type names — PG types are case-sensitive when quoted.
  // Runs AFTER type conversions above so "INT"→"INTEGER" gets unquoted here.
  sql = sql.replace(/"UUID"/g, 'UUID');
  sql = sql.replace(/"BOOLEAN"/g, 'BOOLEAN');
  sql = sql.replace(/"TIMESTAMPTZ"/g, 'TIMESTAMPTZ');
  sql = sql.replace(/"INTEGER"/g, 'INTEGER');
  sql = sql.replace(/"SMALLINT"/g, 'SMALLINT');
  sql = sql.replace(/"BIGINT"/g, 'BIGINT');
  sql = sql.replace(/"TEXT"/g, 'TEXT');
  sql = sql.replace(/"DOUBLE PRECISION"/g, 'DOUBLE PRECISION');
  sql = sql.replace(/"BYTEA"/g, 'BYTEA');
  sql = sql.replace(/"REAL"/g, 'REAL');

  // Fix boolean comparisons: =(1) → =TRUE, =(0) → =FALSE in WHERE clauses
  sql = sql.replace(/=\s*\(1\)/g, '=TRUE');
  sql = sql.replace(/=\s*\(0\)/g, '=FALSE');

  // Fix session_replication_role value: 'DEFAULT' → 'origin'
  sql = sql.replace(
    /session_replication_role\s*=\s*'DEFAULT'/gi,
    "session_replication_role = 'origin'"
  );

  // Fix plpgsql END without semicolon — END must be followed by ; in plpgsql
  // END\n$$ → END;\n$$
  sql = sql.replace(/\bEND\s*\n(\$\$)/g, 'END;\n$1');

  // Fix empty function bodies: BEGIN\nBEGIN\nEND; → BEGIN\nNULL;\nEND;
  sql = sql.replace(/BEGIN\s*\nBEGIN\s*\nEND;/g, 'BEGIN\nNULL;\nEND;');

  // Fix lines immediately before END; that don't end with semicolons
  sql = sql.replace(
    /^([^\n;]+[^\s;])\s*\n(\s*END;\s*$)/gm,
    (match, line: string, endLine: string) => {
      if (/^\s*(BEGIN|ELSE|THEN|LOOP|DECLARE)\s*$/i.test(line)) return match;
      return `${line};\n${endLine}`;
    }
  );

  // Fix RETURN QUERY SELECT missing semicolon (before inline comments)
  sql = sql.replace(
    /(RETURN\s+QUERY\s+SELECT\s+[^\n;]+?)\s*(--[^\n]*)\n/gi,
    '$1; $2\n'
  );

  // Fix FK constraint clause ordering: DEFERRABLE must come AFTER ON DELETE/UPDATE
  sql = sql.replace(
    /(DEFERRABLE\s+INITIALLY\s+DEFERRED)\s+(ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION))/gi,
    '$2 $1'
  );

  // Fix SQL Server LIKE character classes converted to quotes by identifier conversion:
  // NOT LIKE '%"^chars"%' → ~ '^[chars]+$'  (negated char class = positive match)
  // LIKE '%"chars"%' → ~ '[chars]'
  sql = sql.replace(
    /NOT\s+LIKE\s+'%"(\^[^"]+)"%'/gi,
    (_match, charClass: string) => {
      const chars = charClass.slice(1); // remove ^ prefix
      return `~ '^[${chars}]+$'`;
    }
  );
  sql = sql.replace(
    /LIKE\s+'%"([^"]+)"%'/gi,
    `~ '[$1]'`
  );

  // Fix CHECK constraints: len() → LENGTH()
  sql = sql.replace(/\blen\s*\(/gi, 'LENGTH(');

  // Fix CHECK constraints: isjson() → valid PostgreSQL JSON check
  sql = sql.replace(
    /\bisjson\s*\(\s*"(\w+)"\s*\)\s*=\s*TRUE/gi,
    '("$1" IS NULL OR "$1"::jsonb IS NOT NULL)'
  );
  sql = sql.replace(
    /\bisjson\s*\(\s*"(\w+)"\s*\)/gi,
    '("$1" IS NULL OR "$1"::jsonb IS NOT NULL)'
  );

  // Fix CHECK constraints: numeric >= FALSE / <= TRUE → >= 0 / <= 1
  sql = sql.replace(/>= *FALSE/gi, '>= 0');
  sql = sql.replace(/<= *TRUE/gi, '<= 1');

  // Remove double semicolons
  sql = sql.replace(/;;/g, ';');

  // Fix INFORMATION_SCHEMA casing — PostgreSQL requires lowercase
  sql = sql.replace(/"?INFORMATION_SCHEMA"?\./gi, 'information_schema.');
  sql = sql.replace(/information_schema\."TABLES"/g, 'information_schema.tables');
  sql = sql.replace(/information_schema\."COLUMNS"/g, 'information_schema.columns');
  sql = sql.replace(/"TABLE_SCHEMA"/g, 'table_schema');
  sql = sql.replace(/"TABLE_NAME"/g, 'table_name');
  sql = sql.replace(/"TABLE_CATALOG"/g, 'table_catalog');
  sql = sql.replace(/"COLUMN_NAME"/g, 'column_name');
  sql = sql.replace(/"DATA_TYPE"/g, 'data_type');

  // Quote unquoted table names after any schema prefix (PascalCase identifiers)
  // e.g., __mj.OpenApp → __mj."OpenApp"   but NOT __mj."OpenApp" (already quoted)
  // Also skip all-lowercase names like __mj.information_schema
  sql = sql.replace(/(\b\w+)\.(?!")([A-Z][a-zA-Z_]\w*)/g, '$1."$2"');

  // Also handle quoted schema: "schema".PascalCase → "schema"."PascalCase"
  sql = sql.replace(/"(\w+)"\.(?!")([A-Z][a-zA-Z_]\w*)/g, '"$1"."$2"');

  // ISNULL → COALESCE (SQL Server function)
  sql = sql.replace(/\bISNULL\s*\(/gi, 'COALESCE(');

  // Convert IF OBJECT_ID(...) IS NOT NULL DROP VIEW/PROCEDURE/FUNCTION → DROP ... IF EXISTS
  sql = sql.replace(
    /IF\s+OBJECT_ID\s*\([^)]*\)\s*IS\s+NOT\s+NULL\s*\n?\s*DROP\s+(VIEW|PROCEDURE|FUNCTION)\s+(\S+)\s*;?/gi,
    (_match, objType: string, objName: string) => {
      const pgType = objType.toUpperCase() === 'PROCEDURE' ? 'FUNCTION' : objType.toUpperCase();
      return `DROP ${pgType} IF EXISTS ${objName};`;
    }
  );

  // Remove orphaned EXEC statements that slipped through
  sql = sql.replace(/^\s*EXEC\s+.*$/gm, '-- SKIPPED EXEC (not supported in PG)');

  // Convert GRANT EXEC (SQL Server shorthand) to GRANT EXECUTE
  sql = sql.replace(/GRANT\s+EXEC\s+ON\s+/gi, 'GRANT EXECUTE ON ');

  // Wrap GRANT EXECUTE on functions in DO $$ blocks to handle overloaded
  // functions or functions that may not exist.
  sql = sql.replace(
    /^(GRANT\s+EXECUTE\s+ON\s+(?:FUNCTION\s+)?\S+\s+TO\s+[^;\n]+);?\s*$/gm,
    (_match, grantStmt: string) => `DO $$ BEGIN ${grantStmt}; EXCEPTION WHEN others THEN NULL; END $$;`
  );

  // Convert CREATE INDEX → CREATE INDEX IF NOT EXISTS (idempotency)
  sql = sql.replace(
    /\bCREATE\s+((?:UNIQUE\s+)?(?:NONCLUSTERED\s+)?INDEX)\s+(?!IF\s+NOT\s+EXISTS)/gi,
    'CREATE $1 IF NOT EXISTS '
  );

  // Remove SQL Server IF EXISTS(...) BEGIN ... END blocks (pre-flight checks)
  sql = sql.replace(
    /IF\s+EXISTS\s*\([\s\S]*?\)\s*\n\s*BEGIN[\s\S]*?\bEND\s*;?/gi,
    '-- SKIPPED: SQL Server IF EXISTS check'
  );

  // Fix GRANT statements missing semicolons (only at end of line, no semicolons already)
  sql = sql.replace(/^(GRANT\s+[^\n;]+[^\s;])$/gm, '$1;');

  // Remove flyway_schema_history references
  sql = sql.replace(/.*flyway_schema_history.*\n?/g, '');

  // Truncate long index names to 63 chars (PG limit)
  sql = fixLongIndexNames(sql);

  // Fix lines starting with backslash inside string literals in INSERT data
  sql = fixBackslashLines(sql);

  // Clean up excessive blank lines
  sql = sql.replace(/\n{4,}/g, '\n\n\n');

  return sql;
}

/** Truncate index names longer than 63 chars with hash suffix */
function fixLongIndexNames(sql: string): string {
  return sql.replace(
    /(CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?)"([^"]+)"(\s)/gi,
    (match, keyword: string, name: string, rest: string) => {
      if (name.length <= 63) return match;
      const hash = createHash('md5').update(name).digest('hex').slice(0, 8);
      const shortName = name.slice(0, 54) + '_' + hash;
      return `${keyword}"${shortName}"${rest}`;
    }
  );
}

/** Fix lines starting with backslash inside INSERT string literals */
function fixBackslashLines(sql: string): string {
  const lines = sql.split('\n');
  let inInsert = false;
  let inString = false;
  const fixedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (line.trim().startsWith('INSERT INTO')) {
      inInsert = true;
      const quoteCount = countNetQuotes(line);
      inString = quoteCount % 2 === 1;
    } else if (inInsert) {
      const quoteCount = countNetQuotes(line);
      if (inString) {
        if (quoteCount % 2 === 1) inString = false;
        if (line.startsWith('\\')) line = ' ' + line;
      } else {
        if (quoteCount % 2 === 1) inString = true;
      }
      if (line.trimEnd().endsWith(';') && !inString) {
        inInsert = false;
      }
    }

    fixedLines.push(line);
  }

  return fixedLines.join('\n');
}

/** Count net single quotes (excluding doubled '') */
function countNetQuotes(line: string): number {
  let count = 0;
  let i = 0;
  while (i < line.length) {
    if (line[i] === "'") {
      if (i + 1 < line.length && line[i + 1] === "'") {
        i += 2; // Skip doubled quote
        continue;
      }
      count++;
    }
    i++;
  }
  return count;
}
