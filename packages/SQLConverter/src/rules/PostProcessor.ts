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
  // IMPORTANT: Skip dollar-quoted blocks ($$...$$) and string literals
  // to avoid corrupting regex patterns like [A-Za-z0-9] inside function bodies
  sql = replaceBracketsOutsideDollarBlocks(sql);

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

  // Fix boolean comparisons: =(1) → =TRUE, =(0) → =FALSE in WHERE clauses.
  // The negative lookbehind keeps this from matching the `=` inside `>=`, `<=`
  // or `!=`, so integer range checks like `CHECK ("EffortLevel" >= (1) AND ... <= (100))`
  // are left intact (a `>=(1)` must NOT become `>=TRUE`).
  sql = sql.replace(/(?<![<>!])=\s*\(1\)/g, '=TRUE');
  sql = sql.replace(/(?<![<>!])=\s*\(0\)/g, '=FALSE');

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
      // A CASE arm (`WHEN ... THEN ...`) is an expression, not a statement — the
      // following `END;` closes the CASE, so it must NOT get a semicolon. (A real
      // statement that merely ends in a CASE expression starts with its target,
      // e.g. `x := CASE ... END`, not with WHEN, so it still gets its semicolon.)
      if (/^\s*WHEN\b/i.test(line)) return match;
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

  // Fix spurious `;` after ALTER TABLE X on its own line (when ADD/ALTER COLUMN
  // continuation follows on the next line). Converter output shows:
  //   ALTER TABLE X;
  //    ADD COLUMN "col" TYPE;
  // which PG parses as two statements with the first being incomplete.
  sql = sql.replace(
    /(ALTER\s+TABLE\s+\S+);(\n[ \t]+(?:ADD|ALTER\s+COLUMN|DROP|RENAME)\b)/g,
    '$1$2'
  );

  // Convert lingering `ADD CONSTRAINT name DEFAULT val FOR col` that wasn't handled
  // by AlterTableRule (e.g. when the batch was classified as CREATE_TABLE or OTHER).
  // Form: ALTER TABLE X ADD CONSTRAINT name DEFAULT val FOR "col";
  // → ALTER TABLE X ALTER COLUMN "col" SET DEFAULT val;
  sql = sql.replace(
    /(ALTER\s+TABLE\s+\S+)\s+ADD\s+CONSTRAINT\s+"?\w+"?\s+DEFAULT\s+(.+?)\s+FOR\s+("?\w+"?)\s*;?\s*$/gim,
    (_match, tableClause: string, defaultVal: string, col: string) => {
      const c = col.startsWith('"') ? col : `"${col}"`;
      return `${tableClause} ALTER COLUMN ${c} SET DEFAULT ${defaultVal.trim()};`;
    }
  );

  // Fix `*/;` — orphaned semicolon after a block comment. Usually from
  // rule-level `;` insertion when the batch ended with a comment.
  sql = sql.replace(/\*\/\s*;/g, '*/');

  // Convert orphaned `SET @var; SELECT @var = ... FROM ...; IF @var IS NOT NULL EXEC(...)`
  // blocks to PG DO $$ blocks. These appear when the T-SQL migration reused a
  // @var from a prior DECLARE (so the second block didn't start with DECLARE and
  // wasn't caught by the classifier).
  sql = convertOrphanedDeclareBlocks(sql);

  // Add missing `;` to multi-line ALTER TABLE ADD COLUMN ending at a blank line
  // (often followed by a comment). Pattern:
  //   ALTER TABLE X\n ADD COLUMN "col" TYPE NULL\n\n...
  // → ALTER TABLE X\n ADD COLUMN "col" TYPE NULL;\n\n...
  sql = sql.replace(
    /^([ \t]+(?:ADD|ALTER)\s+COLUMN\s+"[^"]+"\s+[^\n;]*(?:NULL|\)))\s*$(?=\n\s*\n)/gm,
    '$1;'
  );

  // Fix INFORMATION_SCHEMA casing — PostgreSQL requires lowercase.
  // Both `information_schema."X"` (quoted) and `information_schema.X` (unquoted)
  // variants exist depending on whether PascalCase quoting ran first.
  sql = sql.replace(/"?INFORMATION_SCHEMA"?\./gi, 'information_schema.');
  // Lowercase known tables — match both quoted and unquoted forms (case-insensitive).
  const infoSchemaTables = [
    'TABLES', 'COLUMNS', 'CHECK_CONSTRAINTS', 'CONSTRAINT_COLUMN_USAGE',
    'TABLE_CONSTRAINTS', 'KEY_COLUMN_USAGE', 'REFERENTIAL_CONSTRAINTS',
    'ROUTINES', 'SCHEMATA', 'VIEWS',
  ];
  for (const t of infoSchemaTables) {
    // Match quoted form (no \b after since `"` isn't a word char)
    sql = sql.replace(
      new RegExp(`information_schema\\."${t}"`, 'g'),
      `information_schema.${t.toLowerCase()}`
    );
    // Match unquoted form with word boundary
    sql = sql.replace(
      new RegExp(`information_schema\\.${t}\\b`, 'g'),
      `information_schema.${t.toLowerCase()}`
    );
  }
  // Lowercase known column names (quoted or bare).
  const infoSchemaCols = [
    'TABLE_SCHEMA', 'TABLE_NAME', 'TABLE_CATALOG', 'COLUMN_NAME', 'DATA_TYPE',
    'CONSTRAINT_NAME', 'CONSTRAINT_SCHEMA',
  ];
  for (const c of infoSchemaCols) {
    // Quoted form
    sql = sql.replace(new RegExp(`"${c}"`, 'g'), c.toLowerCase());
    // Unquoted form — must run before PascalCase quoting so it isn't re-quoted.
    // Only match when preceded by `.` (column access on a table) to avoid
    // matching random occurrences as constants.
    sql = sql.replace(new RegExp(`\\.${c}\\b`, 'g'), `.${c.toLowerCase()}`);
  }

  // Quote unquoted table names after any schema prefix (PascalCase identifiers)
  // e.g., __mj.OpenApp → __mj."OpenApp"   but NOT __mj."OpenApp" (already quoted)
  // Also skip all-lowercase names like __mj.information_schema
  sql = sql.replace(/(\b\w+)\.(?!")([A-Z][a-zA-Z_]\w*)/g, '$1."$2"');

  // Also handle quoted schema: "schema".PascalCase → "schema"."PascalCase"
  sql = sql.replace(/"(\w+)"\.(?!")([A-Z][a-zA-Z_]\w*)/g, '"$1"."$2"');

  // ISNULL → COALESCE (SQL Server function)
  sql = sql.replace(/\bISNULL\s*\(/gi, 'COALESCE(');

  // Safety net: convert any remaining GETUTCDATE/GETDATE → NOW()
  // Handles both bare and quoted forms (e.g. "GETUTCDATE"())
  sql = sql.replace(/\bGETUTCDATE\s*\(\s*\)/gi, 'NOW()');
  sql = sql.replace(/"GETUTCDATE"\s*\(\s*\)/gi, 'NOW()');
  sql = sql.replace(/\bGETDATE\s*\(\s*\)/gi, 'NOW()');
  sql = sql.replace(/"GETDATE"\s*\(\s*\)/gi, 'NOW()');

  // Convert UPDATE alias SET alias.col FROM table alias JOIN → PG UPDATE FROM
  sql = convertUpdateFromAlias(sql);

  // Fix ;WITH CTE → WITH CTE (remove leading semicolon from T-SQL CTE idiom)
  // and reconnect separated CTE + DML pairs
  sql = fixCteStatements(sql);

  // Convert IF OBJECT_ID(...) IS NOT NULL DROP VIEW/PROCEDURE/FUNCTION → DROP ... IF EXISTS
  sql = sql.replace(
    /IF\s+OBJECT_ID\s*\([^)]*\)\s*IS\s+NOT\s+NULL\s*\n?\s*DROP\s+(VIEW|PROCEDURE|FUNCTION)\s+(\S+)\s*;?/gi,
    (_match, objType: string, objName: string) => {
      const pgType = objType.toUpperCase() === 'PROCEDURE' ? 'FUNCTION' : objType.toUpperCase();
      return `DROP ${pgType} IF EXISTS ${objName};`;
    }
  );

  // Remove orphaned EXEC statements that slipped through.
  // Multi-line EXEC calls have continuation lines starting with @param = value
  sql = sql.replace(/^\s*EXEC\s+.*(?:\n\s+@\w+\s*=\s*[^;]*)*\s*;?/gm, '-- SKIPPED EXEC (not supported in PG)');

  // Convert GRANT EXEC (SQL Server shorthand) to GRANT EXECUTE
  sql = sql.replace(/GRANT\s+EXEC\s+ON\s+/gi, 'GRANT EXECUTE ON ');

  // Wrap GRANT / REVOKE statements in DO $$ blocks with EXCEPTION handlers so
  // they tolerate missing target objects during fresh installs. Before this,
  // GRANT EXECUTE was wrapped (functions may be overloaded / absent) but plain
  // GRANT SELECT was not — so v5.18 Grant_DB_Object_Permissions crashed the
  // migration when it tried to GRANT SELECT on a view (vwFlywayVersionHistoryParsed)
  // that doesn't exist in the PG baseline. Wrapping all grants uniformly avoids
  // that whole class of fresh-install failures while still surfacing grant
  // errors via NOTICE in CI/dev logs.
  sql = sql.replace(
    /^(GRANT\s+[A-Z ,()"]+?\s+ON\s+[^;\n]+\s+TO\s+[^;\n]+);?\s*$/gim,
    (_match, grantStmt: string) => `DO $$ BEGIN ${grantStmt}; EXCEPTION WHEN others THEN NULL; END $$;`
  );
  sql = sql.replace(
    /^(REVOKE\s+[A-Z ,()"]+?\s+ON\s+[^;\n]+\s+FROM\s+[^;\n]+);?\s*$/gim,
    (_match, revokeStmt: string) => `DO $$ BEGIN ${revokeStmt}; EXCEPTION WHEN others THEN NULL; END $$;`
  );

  // Strip IF NOT EXISTS (SELECT ... FROM sys.indexes ...) wrappers around CREATE INDEX.
  // These T-SQL pre-flight checks reference sys.indexes and OBJECT_ID() which don't exist
  // in PostgreSQL. The CREATE INDEX IF NOT EXISTS below provides the same idempotency.
  sql = sql.replace(
    /IF\s+NOT\s+EXISTS\s*\([\s\S]*?sys\.indexes[\s\S]*?\)\s*\n?\s*(?=CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+)?INDEX\b)/gi,
    ''
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

  // Fix missing semicolons after complete single-line DML/DDL statements.
  // All whitespace matchers use [ \t] (not \s) to prevent matching across newlines.
  // Pattern matches only when ALTER TABLE + operation + terminator are on ONE line.
  sql = sql.replace(
    /^([ \t]*ALTER[ \t]+TABLE[ \t]+\S+[ \t]+(?:ADD|ALTER[ \t]+COLUMN|DROP)[ \t][^\n;]*(?:NULL|NOW\(\)|"[^"]+"|\)))[ \t]*$/gm,
    (match, stmt: string) => {
      if (stmt.trimEnd().endsWith(';')) return match;
      return `${stmt};`;
    }
  );
  sql = sql.replace(
    /^([ \t]*UPDATE[ \t]+\S+[ \t]+SET[ \t]+[^\n;]*IS[ \t]+NULL)[ \t]*$/gmi,
    (match, stmt: string) => {
      if (stmt.trimEnd().endsWith(';')) return match;
      return `${stmt};`;
    }
  );

  // Fix NOW()/* comment */ pattern: inject semicolon + newline before the comment.
  // This handles converter output like:
  //   ALTER TABLE X ADD col TIMESTAMPTZ NOT NULL DEFAULT NOW()/* next comment */
  // which PG parses as a single broken statement.
  sql = sql.replace(
    /(\bNOW\(\))\s*(\/\*)/g,
    '$1;\n$2'
  );

  // Remove leaked *structural* references to flyway_schema_history (e.g. a FROM/JOIN
  // clause from a skipped Flyway view) — PostgreSQL Flyway manages its own history
  // table, so any such object reference would dangle. IMPORTANT: only strip the line
  // when the name appears as a bare SQL identifier, NOT when it occurs inside a
  // string literal (e.g. a saved Query row whose SQL text reads
  // `SELECT * FROM flyway_schema_history`), which is data and must be preserved.
  sql = removeFlywayHistoryReferences(sql);

  // Truncate long index names to 63 chars (PG limit)
  sql = fixLongIndexNames(sql);

  // Fix lines starting with backslash inside string literals in INSERT data
  sql = fixBackslashLines(sql);

  // Safety net: convert multi-column ALTER TABLE ADD to PG ADD COLUMN syntax
  // Catches cases where ALTER TABLE is embedded in a CREATE_TABLE batch
  sql = fixMultiColumnAdd(sql);

  // Fix RAISERROR that was quoted as "RAISERROR" by PascalCase quoting
  sql = sql.replace(/"RAISERROR"\s*\(/gi, 'RAISERROR(');
  // Then convert RAISERROR → RAISE EXCEPTION
  sql = sql.replace(
    /\bRAISERROR\s*\(\s*N?'([^']*)'\s*,\s*\d+\s*,\s*\d+\s*\)\s*;?/gi,
    "RAISE EXCEPTION '$1';"
  );

  // Clean up excessive blank lines
  sql = sql.replace(/\n{4,}/g, '\n\n\n');

  return sql;
}

/**
 * Strip lines that reference the flyway_schema_history table as a SQL object
 * (FROM/JOIN/etc.), while preserving lines where the name only appears inside a
 * single-quoted string literal (data rows such as a saved Query's SQL text).
 * Distinguishes the two by quote parity: an odd number of unescaped single quotes
 * before the match means the name sits inside a string literal -> keep the line.
 */
function removeFlywayHistoryReferences(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => {
      const idx = line.toLowerCase().indexOf('flyway_schema_history');
      if (idx === -1) return true; // no reference — keep
      const quotesBefore = (line.slice(0, idx).match(/'/g) || []).length;
      return quotesBefore % 2 === 1; // odd => inside a string literal (data) => keep
    })
    .join('\n');
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

/**
 * Replace [bracket] identifiers with "quoted" identifiers, but skip content
 * inside dollar-quoted blocks ($$...$$, $tag$...$tag$), single-quoted strings,
 * and `--` line comments. This prevents corrupting regex patterns like
 * [A-Za-z0-9] inside function bodies, and stops an apostrophe inside a comment
 * (e.g. "the sproc's default") from being misread as a string-literal opener,
 * which would desync quote tracking and mangle nearby ARRAY[...] / [bracket] text.
 */
function replaceBracketsOutsideDollarBlocks(sql: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < sql.length) {
    // Check for dollar-quoted block start: $$ or $tag$
    if (sql[i] === '$') {
      const tagMatch = sql.slice(i).match(/^(\$\w*\$)/);
      if (tagMatch) {
        const tag = tagMatch[1];
        const endIdx = sql.indexOf(tag, i + tag.length);
        if (endIdx >= 0) {
          // Push the entire dollar-quoted block unchanged
          result.push(sql.slice(i, endIdx + tag.length));
          i = endIdx + tag.length;
          continue;
        }
      }
    }

    // Check for `--` line comment: consume through end-of-line unchanged. Comments
    // can contain apostrophes and brackets that must not be treated as SQL tokens.
    if (sql[i] === '-' && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < sql.length && sql[j] !== '\n') j++;
      result.push(sql.slice(i, j));
      i = j;
      continue;
    }

    // Check for single-quoted string start
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && j + 1 < sql.length && sql[j + 1] === "'") {
          j += 2; // Skip doubled quote
          continue;
        }
        if (sql[j] === "'") {
          j++;
          break;
        }
        j++;
      }
      // Push entire string literal unchanged
      result.push(sql.slice(i, j));
      i = j;
      continue;
    }

    // Check for bracket identifier: [Name] but not [1] (array access)
    if (sql[i] === '[') {
      const bracketMatch = sql.slice(i).match(/^\[([^\]\d][^\]]*)\]/);
      // A real T-SQL bracket identifier never contains a single quote, and is never
      // a PG array constructor. Skip `['x','y']` (a quoted-literal list, e.g.
      // `ARRAY['AgentID','Status']`) — converting it to `"'x','y'"` is corruption.
      const isArrayConstructor = /ARRAY\s*$/i.test(sql.slice(Math.max(0, i - 8), i));
      if (bracketMatch && !bracketMatch[1].includes("'") && !isArrayConstructor) {
        result.push(`"${bracketMatch[1]}"`);
        i += bracketMatch[0].length;
        continue;
      }
    }

    result.push(sql[i]);
    i++;
  }

  return result.join('');
}

/**
 * Convert T-SQL UPDATE alias SET alias.col = ... FROM table alias JOIN ...
 * to PostgreSQL UPDATE table SET "col" = ... FROM joinedTable WHERE ...
 *
 * T-SQL:  UPDATE ep SET ep.CanCreate = 1 FROM Schema.Table ep INNER JOIN ...
 * PG:     UPDATE Schema."Table" SET "CanCreate" = 1 FROM ... WHERE ...
 */
function convertUpdateFromAlias(sql: string): string {
  // Match the UPDATE alias SET ... FROM pattern (multiline)
  const pattern = /^(\s*)UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+FROM\s+([\s\S]+?)$/gm;
  return sql.replace(pattern, (_match, indent: string, alias: string, setCols: string, fromClause: string) => {
    // Find the table name and alias in the FROM clause
    // Pattern: schema."Table" alias or schema.Table alias
    const tableAliasPattern = new RegExp(
      `((?:\\w+\\.)?(?:"[^"]+"|\\.\\w+))\\s+${alias}\\b`, 'i'
    );
    const tableMatch = fromClause.match(tableAliasPattern);
    if (!tableMatch) return _match; // Can't resolve alias, leave unchanged

    const fullTableName = tableMatch[1];

    // Remove alias prefix from SET columns: ep."Col" → "Col", ep.Col → "Col"
    const cleanedSet = setCols.replace(
      new RegExp(`${alias}\\.("?\\w+"?)`, 'gi'),
      (_m: string, col: string) => col.startsWith('"') ? col : `"${col}"`
    );

    // Remove the target table+alias from FROM clause and convert JOINs to FROM + WHERE
    let remainingFrom = fromClause.replace(tableAliasPattern, '').trim();
    // Clean up leading INNER JOIN or comma
    remainingFrom = remainingFrom.replace(/^\s*,\s*/, '').trim();
    remainingFrom = remainingFrom.replace(/^\s*INNER\s+/i, '');

    // Convert JOIN...ON to FROM...WHERE
    const joinMatch = remainingFrom.match(
      /^JOIN\s+([\s\S]+?)\s+ON\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i
    );
    if (joinMatch) {
      const joinTable = joinMatch[1];
      let joinCond = joinMatch[2];
      const whereCond = joinMatch[3];

      // Replace alias references in conditions with full table name
      const aliasPattern = new RegExp(`\\b${alias}\\.`, 'gi');
      joinCond = joinCond.replace(aliasPattern, `${fullTableName}.`);
      let whereClause = `WHERE ${joinCond}`;
      if (whereCond) {
        const cleanedWhere = whereCond.replace(aliasPattern, `${fullTableName}.`);
        whereClause += `\n${indent}  AND ${cleanedWhere}`;
      }
      return `${indent}UPDATE ${fullTableName} SET ${cleanedSet}\n${indent}FROM ${joinTable}\n${indent}${whereClause}`;
    }

    return _match; // Fallback — don't transform what we can't parse
  });
}

/**
 * Fix CTE statements that were incorrectly split.
 * 1. Remove leading ; from ;WITH (T-SQL idiom)
 * 2. Reconnect orphaned CTE definitions with their following DML statement
 */
function fixCteStatements(sql: string): string {
  // Fix ;WITH → WITH (the leading ; is a T-SQL statement terminator idiom)
  sql = sql.replace(/;\s*WITH\b/gi, 'WITH');

  // Fix CTE definitions that end with )\n; followed by DELETE/INSERT/UPDATE/SELECT.
  // The semicolon after the CTE's closing paren should not be there — the CTE
  // must be directly followed by its DML statement.
  //
  // IMPORTANT: The old regex used [\s\S]*? which could span across function bodies,
  // dollar-quoted blocks, and unrelated statements, incorrectly removing semicolons
  // from statements like:
  //   DELETE FROM t WHERE id IN (SELECT ...);
  //   DELETE FROM t2 ...;
  // The fix: only match CTE patterns that don't cross dollar-quoted blocks ($$)
  // and whose body consists of balanced parentheses.
  sql = reconnectCteDml(sql);

  return sql;
}

/**
 * Reconnect CTE definitions that were separated from their DML by a spurious semicolon.
 * Scans for `WITH <name> AS (...);\nDML` patterns using paren-balanced matching
 * to avoid crossing into unrelated statements or dollar-quoted function bodies.
 */
function reconnectCteDml(sql: string): string {
  // Find each top-level WITH keyword that starts a CTE (not inside $$...$$ blocks)
  const withPattern = /\bWITH\s+(?:RECURSIVE\s+)?\w+\s+AS\s*\(/gi;
  let match: RegExpExecArray | null;
  const edits: Array<{ start: number; end: number; replacement: string }> = [];

  // First, find all dollar-quoted regions to exclude
  const dollarRegions = findDollarQuotedRegions(sql);

  while ((match = withPattern.exec(sql)) !== null) {
    const withStart = match.index;

    // Skip if this WITH is inside a dollar-quoted block (function body)
    if (isInsideDollarBlock(withStart, dollarRegions)) continue;

    // Find the opening paren position (the last char of the match)
    const openParenPos = withStart + match[0].length - 1;

    // Balance parens to find the end of the CTE definition.
    // A CTE can have multiple CTEs separated by commas: WITH a AS (...), b AS (...)
    const cteEnd = findCteEnd(sql, openParenPos);
    if (cteEnd < 0) continue;

    // Check if the CTE end is followed by ;\s*\n\s*DML
    const afterCte = sql.slice(cteEnd + 1);
    const semiDmlMatch = afterCte.match(/^(\s*;\s*\n\s*)(DELETE\s|INSERT\s|UPDATE\s|SELECT\s)/i);
    if (semiDmlMatch) {
      // Remove the semicolon, keep just a newline before the DML
      const editStart = cteEnd + 1;
      const editEnd = editStart + semiDmlMatch[1].length;
      edits.push({ start: editStart, end: editEnd, replacement: '\n' });
    }
  }

  // Apply edits in reverse order to preserve positions
  if (edits.length === 0) return sql;
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit = edits[i];
    const before = sql.slice(0, edit.start);
    const after = sql.slice(edit.end);
    sql = before + edit.replacement + after;
  }
  return sql;
}

/** Find all dollar-quoted regions ($$...$$ or $tag$...$tag$) */
function findDollarQuotedRegions(sql: string): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === '$') {
      const tagMatch = sql.slice(i).match(/^(\$\w*\$)/);
      if (tagMatch) {
        const tag = tagMatch[1];
        const endIdx = sql.indexOf(tag, i + tag.length);
        if (endIdx >= 0) {
          regions.push({ start: i, end: endIdx + tag.length });
          i = endIdx + tag.length;
          continue;
        }
      }
    }
    i++;
  }
  return regions;
}

/** Check if a position falls inside any dollar-quoted region */
function isInsideDollarBlock(pos: number, regions: Array<{ start: number; end: number }>): boolean {
  for (const r of regions) {
    if (pos >= r.start && pos < r.end) return true;
  }
  return false;
}

/**
 * Starting from an opening paren of a CTE definition, find the end of the
 * entire CTE clause (which may include multiple CTEs: WITH a AS (...), b AS (...)).
 * Returns the index of the final closing paren, or -1 if not found.
 */
function findCteEnd(sql: string, openParenPos: number): number {
  let depth = 1;
  let i = openParenPos + 1;

  while (i < sql.length && depth > 0) {
    const ch = sql[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        // Check if there's another CTE after this: ), <name> AS (
        const afterClose = sql.slice(i + 1);
        const nextCte = afterClose.match(/^\s*,\s*\w+\s+AS\s*\(/i);
        if (nextCte) {
          // Continue into the next CTE
          i = i + 1 + nextCte[0].length - 1; // position at the opening paren
          depth = 1;
        } else {
          return i;
        }
      }
    } else if (ch === "'") {
      // Skip string literals
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") break;
        i++;
      }
    } else if (ch === '$') {
      // Skip dollar-quoted blocks inside CTEs (unlikely but safe)
      const tagMatch = sql.slice(i).match(/^(\$\w*\$)/);
      if (tagMatch) {
        const tag = tagMatch[1];
        const endIdx = sql.indexOf(tag, i + tag.length);
        if (endIdx >= 0) {
          i = endIdx + tag.length - 1;
        }
      }
    }
    i++;
  }

  return -1; // unbalanced
}

/**
 * Fix multi-column ALTER TABLE ADD that wasn't caught by AlterTableRule
 * (e.g. when embedded in a CREATE_TABLE batch).
 * Converts: ALTER TABLE t ADD col1 TYPE, col2 TYPE
 * To:       ALTER TABLE t ADD COLUMN "col1" TYPE, ADD COLUMN "col2" TYPE
 */
function fixMultiColumnAdd(sql: string): string {
  // Match ALTER TABLE ... ADD that is NOT followed by CONSTRAINT or COLUMN
  const pattern = /^(ALTER\s+TABLE\s+\S+)\s+ADD\s+(?!CONSTRAINT\b|COLUMN\b)/gim;
  let match: RegExpExecArray | null;
  const edits: Array<{ start: number; end: number; replacement: string }> = [];

  while ((match = pattern.exec(sql)) !== null) {
    const matchStart = match.index;
    const tableClause = match[1];
    const afterAddStart = matchStart + match[0].length;

    // Find the end of this statement (semicolon at depth 0, or end of line with no continuation)
    let depth = 0;
    let inStr = false;
    let endPos = afterAddStart;
    for (let i = afterAddStart; i < sql.length; i++) {
      const ch = sql[i];
      if (inStr) {
        if (ch === "'" && i + 1 < sql.length && sql[i + 1] === "'") { i++; continue; }
        if (ch === "'") inStr = false;
        continue;
      }
      if (ch === "'") { inStr = true; continue; }
      if (ch === '(') { depth++; continue; }
      if (ch === ')') { depth--; continue; }
      if (ch === ';' && depth === 0) { endPos = i; break; }
      if (i === sql.length - 1) { endPos = i + 1; break; }
    }

    const addBody = sql.slice(afterAddStart, endPos);

    // Split by comma at top level
    const parts = splitTopLevelCommasStatic(addBody);
    if (parts.length < 2) continue; // Single column ADD doesn't need fixing

    // Check each part looks like a column definition
    const colDefs: string[] = [];
    let allValid = true;
    for (const part of parts) {
      const trimmed = part.trim().replace(/;?\s*$/, '');
      if (!trimmed) { allValid = false; break; }
      const colMatch = trimmed.match(/^("?\w+"?)(\s+.*)$/s);
      if (!colMatch) { allValid = false; break; }
      let colName = colMatch[1];
      const rest = colMatch[2];
      if (!colName.startsWith('"') && /[A-Z]/.test(colName)) {
        colName = `"${colName}"`;
      }
      colDefs.push(`ADD COLUMN ${colName}${rest}`);
    }

    if (!allValid) continue;

    const replacement = `${tableClause}\n ${colDefs.join(',\n ')}`;
    edits.push({ start: matchStart, end: endPos, replacement });
  }

  // Apply edits in reverse
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit = edits[i];
    sql = sql.slice(0, edit.start) + edit.replacement + sql.slice(edit.end);
  }
  return sql;
}

/** Split string on commas at depth 0 (respecting parens and strings) */
function splitTopLevelCommasStatic(str: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      current += ch;
      if (ch === "'" && i + 1 < str.length && str[i + 1] === "'") { current += str[++i]; }
      else if (ch === "'") inStr = false;
      continue;
    }
    if (ch === "'") { inStr = true; current += ch; continue; }
    if (ch === '(') { depth++; current += ch; continue; }
    if (ch === ')') { depth--; current += ch; continue; }
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Converts an orphaned T-SQL DECLARE-less block:
 *   SET @var = NULL;
 *   SELECT @var = expr FROM ...;
 *   IF @var IS NOT NULL
 *       EXEC('... ' + @var + '...');
 * into a PG DO $$ DECLARE ... BEGIN ... END $$; block.
 */
function convertOrphanedDeclareBlocks(sql: string): string {
  // Match: SET @name = NULL; ... SELECT @name = ... FROM ... WHERE ...; ... IF @name IS NOT NULL ... EXEC('...' + @name + '...');
  // The whole sequence up to the IF...EXEC needs to be wrapped.
  const pattern = /SET\s+@(\w+)\s*=\s*NULL\s*;\s*\n+\s*(SELECT\s+@\1\s*=\s*[^;]+;)\s*\n+\s*IF\s+@\1\s+IS\s+NOT\s+NULL\s*\n\s*EXEC\s*\(\s*([^)]+)\)\s*(?:NOT\s+VALID\s*)?;/gi;
  return sql.replace(pattern, (_match, varName: string, selectStmt: string, execExpr: string) => {
    // Convert SELECT @var = expr FROM ... to SELECT expr INTO v_var FROM ...
    const convertedSelect = selectStmt.replace(
      /SELECT\s+@\w+\s*=\s*(.+?)\s+FROM\b/is,
      (_m, expr: string) => `SELECT ${expr.trim()} INTO v_${varName} FROM`
    );
    // Convert EXEC('str' + @var + 'str') expression to format()
    const parts = execExpr.split(/\s*\+\s*/).map(p => p.trim()).filter(Boolean);
    const fmtParts: string[] = [];
    const args: string[] = [];
    for (const part of parts) {
      if (/^'.*'$/.test(part)) {
        fmtParts.push(part.slice(1, -1).replace(/%/g, '%%'));
      } else if (/^@\w+$/.test(part)) {
        fmtParts.push('%I');
        args.push(`v_${part.slice(1)}`);
      } else {
        fmtParts.push('%s');
        args.push(part);
      }
    }
    let fmt = fmtParts.join('');
    fmt = fmt.replace(/"%I"/g, '%I');
    fmt = fmt.replace(/\[%I\]/g, '%I');
    const argList = args.length ? ', ' + args.join(', ') : '';
    return `DO $$ DECLARE v_${varName} TEXT;\nBEGIN\n  ${convertedSelect}\n  IF v_${varName} IS NOT NULL THEN\n    EXECUTE format('${fmt}'${argList});\n  END IF;\nEND $$;`;
  });
}
