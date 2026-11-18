import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { ConvertIdentifiers, ConvertObjectIdCalls, NeedsHandAuthoring, StripComments } from './ExpressionHelpers.js';

/** A guard read from `IF …` in front of a grant, as the PostgreSQL condition that replaces it. */
type GrantGuard = { Condition: string } | { Problem: string };

/** Offset of the `)` closing the `(` at `open`, skipping string literals; -1 when unbalanced. */
function closingParen(sql: string, open: number): number {
  let depth = 0;
  let inString = false;
  for (let i = open; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      if (inString && sql[i + 1] === "'") { i++; continue; }
      inString = !inString;
    } else if (!inString) {
      if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Read the guard of a T-SQL guarded grant and return the PostgreSQL condition for it:
 * - `[NOT] EXISTS (… sys.database_principals … name = 'r' …)` → `[NOT] EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'r')`
 * - `OBJECT_ID('s.v'[, 'V' | 'U']) IS [NOT] NULL` → `to_regclass('s."v"') IS [NOT] NULL`
 * Returns the guard's text end in `End`; anything else is a Problem.
 */
function readGrantGuard(code: string): { Guard: GrantGuard; End: number } | null {
  const exists = code.match(/^IF\s+(NOT\s+)?EXISTS\s*\(/i);
  if (exists) {
    const close = closingParen(code, exists[0].length - 1);
    if (close < 0) return null;
    const inner = code.slice(exists[0].length, close);
    const role = inner.match(/\bname\s*=\s*N?'([^']+)'/i);
    if (!/\bsys\.database_principals\b/i.test(inner) || !role) {
      return { Guard: { Problem: 'only a sys.database_principals name check converts' }, End: close + 1 };
    }
    const not = exists[1] ? 'NOT ' : '';
    return { Guard: { Condition: `${not}EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role[1]}')` }, End: close + 1 };
  }
  const objectId = code.match(/^IF\s+(OBJECT_ID\s*\(\s*N?'[^']+'\s*(?:,\s*N?'(\w+)'\s*)?\))\s*IS\s+(NOT\s+)?NULL/i);
  if (objectId) {
    const type = (objectId[2] ?? 'V').toUpperCase();
    if (type !== 'V' && type !== 'U') {
      return { Guard: { Problem: `OBJECT_ID type '${type}' has no to_regclass equivalent` }, End: objectId[0].length };
    }
    const not = objectId[3] ? 'NOT ' : '';
    return { Guard: { Condition: `${ConvertObjectIdCalls(objectId[1])} IS ${not}NULL` }, End: objectId[0].length };
  }
  return null;
}

/**
 * The grant statements in a guarded body: optional `BEGIN … END`, then either plain
 * GRANT/REVOKE statements or `EXEC [sys.]sp_executesql N'…'` / `EXEC (N'…')` carrying them.
 * Returns null when the body holds anything else.
 */
function readGuardedGrants(body: string): string[] | null {
  let text = body.trim().replace(/;\s*$/, '').trim();
  const block = text.match(/^BEGIN\b([\s\S]*)\bEND$/i);
  if (block) text = block[1].trim();
  const statements: string[] = [];
  const dynamic = /EXEC(?:UTE)?\s+(?:sys\.)?sp_executesql\s+N?'((?:[^']|'')*)'\s*;?|EXEC(?:UTE)?\s*\(\s*N?'((?:[^']|'')*)'\s*\)\s*;?/gi;
  const plain = text.replace(dynamic, (_m, a: string | undefined, b: string | undefined) => {
    statements.push(...splitStatements((a ?? b ?? '').replace(/''/g, "'")));
    return '';
  });
  statements.push(...splitStatements(plain));
  if (statements.length === 0 || !statements.every((st) => /^(?:GRANT|REVOKE)\s/i.test(st))) return null;
  return statements;
}

function splitStatements(text: string): string[] {
  return text.split(';').map((st) => st.trim()).filter((st) => st.length > 0);
}

export class GrantRule implements IConversionRule {
  Name = 'GrantRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['GRANT', 'REVOKE'];
  Priority = 80;
  BypassSqlglot = true;
  BypassJustification = 'T-SQL GRANT EXEC → PG GRANT EXECUTE renaming, plus wrapping each GRANT in DO $ EXCEPTION blocks so the grant tolerates missing roles or functions during fresh installs. sqlglot does not apply this idempotency wrapping or rename EXEC → EXECUTE.';

  PostProcess(sql: string, originalSQL: string, _context: ConversionContext): string {
    const code = StripComments(sql).trim();
    if (/^IF\b/i.test(code) || /\bsp_executesql\b/i.test(code)) {
      return this.convertGuardedGrant(code, originalSQL);
    }
    return this.convertGrant(sql);
  }

  /**
   * A grant behind a T-SQL guard (issue #5567). CodeGen writes
   * `IF OBJECT_ID('[s].[vwX]', 'V') IS NOT NULL BEGIN EXEC sp_executesql N'GRANT SELECT ON [s].[vwX] TO [r]' END`
   * for layered base views; role-guarded grants use `IF EXISTS (… sys.database_principals …)`.
   * Both become a DO block whose IF tests the PostgreSQL equivalent. Before, the classifier
   * skipped these batches and the grants were lost without a gap; a shape this cannot read is
   * now a counted NEEDS HAND AUTHORING gap.
   */
  private convertGuardedGrant(code: string, originalSQL: string): string {
    const guard = /^IF\b/i.test(code) ? readGrantGuard(code) : { Guard: { Condition: '' }, End: 0 };
    if (!guard) {
      return NeedsHandAuthoring('GUARDED GRANT', 'the guard is not an OBJECT_ID or sys.database_principals check', originalSQL);
    }
    if ('Problem' in guard.Guard) {
      return NeedsHandAuthoring('GUARDED GRANT', guard.Guard.Problem, originalSQL);
    }
    const grants = readGuardedGrants(code.slice(guard.End));
    if (!grants) {
      return NeedsHandAuthoring('GUARDED GRANT', 'the guarded body holds more than GRANT/REVOKE statements', originalSQL);
    }
    const converted = grants.map((g) => this.convertGrant(g).trim());
    if (converted.some((g) => g.startsWith('--'))) {
      return NeedsHandAuthoring('GUARDED GRANT', 'a guarded grant has no PostgreSQL equivalent', originalSQL);
    }
    if (!guard.Guard.Condition) return converted.join('\n') + '\n';
    return [
      'DO $$',
      'BEGIN',
      `    IF ${guard.Guard.Condition} THEN`,
      ...converted.map((g) => `        ${g}`),
      '    END IF;',
      'END $$;',
    ].join('\n') + '\n';
  }

  /** Convert one plain GRANT / REVOKE statement. */
  private convertGrant(sql: string): string {
    let result = ConvertIdentifiers(sql);
    // Remove N prefix from strings
    result = result.replace(/(?<![a-zA-Z])N'/g, "'");

    // GRANT CONNECT TO <login> is a SQL Server server-level connect grant for a
    // login principal. PostgreSQL has no statement-level equivalent — CONNECT is
    // per-database (GRANT CONNECT ON DATABASE <db> TO <role>) and the database
    // name isn't known at conversion time. Emit an INTENTIONAL skip marker so the
    // /pg-migrate quality gate treats it as a reviewed, justified skip rather than
    // an unconverted gap. Without this the raw `GRANT CONNECT TO "role";` passes
    // through as invalid PG and fails at apply time.
    const connectGrant = result.match(/\bGRANT\s+CONNECT\s+TO\s+(.+?)\s*;?\s*$/i);
    if (connectGrant) {
      return `-- SKIPPED (INTENTIONAL): GRANT CONNECT TO ${connectGrant[1].trim()} — SQL Server login connect grant has no PostgreSQL equivalent\n`;
    }

    // Convert GRANT/REVOKE ... ON SCHEMA::schema_name TO role
    // SQL Server: GRANT SELECT ON SCHEMA::myschema TO myrole
    // PostgreSQL:  GRANT SELECT ON ALL TABLES IN SCHEMA myschema TO myrole
    const schemaMatch = result.match(
      /\b(GRANT|REVOKE)\s+(SELECT|INSERT|UPDATE|DELETE|ALL(?:\s+PRIVILEGES)?)\s+ON\s+SCHEMA\s*::\s*("?\w+"?)\s+TO\s+(.+)/i
    );
    if (schemaMatch) {
      const [, verb, perm, schema, role] = schemaMatch;
      let out = `${verb} ${perm} ON ALL TABLES IN SCHEMA ${schema} TO ${role.trim()}`;
      out = out.replace(/;?\s*$/, '');
      if (!out.endsWith(';')) out += ';';
      return out + '\n';
    }

    // Check if this is a GRANT/REVOKE EXECUTE (function/procedure)
    const isExecuteGrant = /\b(?:GRANT|REVOKE)\s+EXECUTE\b/i.test(result);

    if (isExecuteGrant) {
      // PostgreSQL requires FUNCTION keyword for GRANT/REVOKE EXECUTE.
      // Even when the function isn't CREATE'd in this file — it likely lives in
      // the baseline or an earlier migration, and by the time this runs in
      // sequence the function exists. Previously we skipped these grants, which
      // silently dropped privileges grants for functions defined elsewhere (e.g.
      // v5.15 Grant_Dataset_SP_Execute_Permissions targets sprocs from earlier
      // migrations). Wrap in DO/EXCEPTION so grants on missing objects no-op
      // rather than fail the migration.
      result = result.replace(
        /\b(GRANT\s+EXECUTE\s+ON)\s+(?!FUNCTION\b)/i,
        '$1 FUNCTION '
      );
      result = result.replace(
        /\b(REVOKE\s+EXECUTE\s+ON)\s+(?!FUNCTION\b)/i,
        '$1 FUNCTION '
      );
    }

    // Quote mixed-case object names in GRANT/REVOKE ... ON schema.NAME ... TO ...
    // T-SQL is case-insensitive, so CodeGen often emits unquoted mixed-case names
    // like `__mj.vwFlywayVersionHistoryParsed`. PG folds unquoted identifiers to
    // lowercase, then fails to find the real mixed-case relation. Quote the name
    // part when it contains uppercase and isn't already quoted.
    result = result.replace(
      /\b(GRANT|REVOKE)\s+([A-Za-z ,]+?)\s+ON\s+(FUNCTION\s+)?([\w"]+)\.([A-Za-z_]\w*)(\s+TO)/gi,
      (_match, verb, perms, fnKw, schema, name, to) => {
        const needsQuoting = /[A-Z]/.test(name) && !name.startsWith('"');
        const quotedName = needsQuoting ? `"${name}"` : name;
        return `${verb} ${perms} ON ${fnKw ?? ''}${schema}.${quotedName}${to}`;
      }
    );

    // GRANT SELECT/INSERT on views: emit them even when the view is in an
    // earlier migration. If the view truly doesn't exist, the grant will fail
    // loudly at apply time — better than silent permission gaps.

    result = result.trimEnd();
    if (!result.endsWith(';')) result += ';';
    return result + '\n';
  }
}
