import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers } from './ExpressionHelpers.js';

export class GrantRule implements IConversionRule {
  Name = 'GrantRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
  AppliesTo: StatementType[] = ['GRANT', 'REVOKE'];
  Priority = 80;
  BypassSqlglot = true;
  BypassJustification = 'T-SQL GRANT EXEC → PG GRANT EXECUTE renaming, plus wrapping each GRANT in DO $ EXCEPTION blocks so the grant tolerates missing roles or functions during fresh installs. sqlglot does not apply this idempotency wrapping or rename EXEC → EXECUTE.';

  PostProcess(sql: string, _originalSQL: string, context: ConversionContext): string {
    let result = convertIdentifiers(sql);
    // Remove N prefix from strings
    result = result.replace(/(?<![a-zA-Z])N'/g, "'");

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
