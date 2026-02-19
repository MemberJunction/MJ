import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers } from './ExpressionHelpers.js';

export class TriggerRule implements IConversionRule {
  Name = 'TriggerRule';
  AppliesTo: StatementType[] = ['CREATE_TRIGGER'];
  Priority = 40;
  BypassSqlglot = true;

  PostProcess(sql: string, _originalSQL: string, _context: ConversionContext): string {
    // Extract trigger components with regex
    // Pattern: CREATE TRIGGER [schema].[name] ON [schema].[table] AFTER event(s) AS BEGIN body END
    let m = sql.match(
      /CREATE\s+TRIGGER\s+\[?__mj\]?\.\[?(\w+)\]?\s+ON\s+\[?__mj\]?\.\[?(\w+)\]?\s+AFTER\s+([\w,\s]+?)\s+AS\s+BEGIN\s+(.*)\s*END\s*;?\s*$/is
    );
    if (!m) {
      // Simpler pattern without explicit BEGIN...END
      m = sql.match(
        /CREATE\s+TRIGGER\s+\[?__mj\]?\.\[?(\w+)\]?\s+ON\s+\[?__mj\]?\.\[?(\w+)\]?\s+AFTER\s+([\w,\s]+?)\s+AS\s+(.*)/is
      );
    }
    if (!m) {
      return `-- TODO: Trigger conversion failed\n-- ${sql.slice(0, 200)}\n`;
    }

    const triggerName = m[1];

    // Skip SQL Server-specific trigger functions
    if (sql.includes('TRIGGER_NESTLEVEL') || sql.replace(/\s/g, '').includes('UPDATE(')) {
      return `-- SKIPPED: trigger "${triggerName}" — uses SQL Server-specific functions\n`;
    }

    const tableName = m[2];
    const eventRaw = m[3].trim().toUpperCase();
    let body = m[4].trim();

    // Convert comma-separated events: "INSERT, UPDATE" → "INSERT OR UPDATE"
    const event = eventRaw.split(',').map(e => e.trim()).join(' OR ');

    // Remove SET NOCOUNT ON
    body = body.replace(/\bSET\s+NOCOUNT\s+ON\s*;?/gi, '').trim();

    // Remove outer BEGIN/END
    if (body.toUpperCase().startsWith('BEGIN')) {
      body = body.replace(/^BEGIN\s*/i, '');
    }
    if (/END\s*;?\s*$/i.test(body)) {
      body = body.replace(/\s*END\s*;?\s*$/i, '');
    }

    // UpdatedAt trigger: use standard PG pattern
    if (body.includes('UpdatedAt') || body.includes('__mj_UpdatedAt')) {
      return `CREATE OR REPLACE FUNCTION __mj."${triggerName}_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "${triggerName}" ON __mj."${tableName}";
CREATE TRIGGER "${triggerName}"
    BEFORE UPDATE ON __mj."${tableName}"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."${triggerName}_func"();
`;
    }

    // Generic trigger conversion
    body = convertIdentifiers(body);
    body = body.replace(/(?<![a-zA-Z])N'/g, "'");
    body = body.replace(/\bINSERTED\b/gi, 'NEW');
    body = body.replace(/\bDELETED\b/gi, 'OLD');
    body = body.replace(/\bISNULL\s*\(/gi, 'COALESCE(');
    body = body.replace(/\bGETUTCDATE\s*\(\s*\)/gi, 'NOW()');

    const timing = body.includes('NEW.') ? 'BEFORE' : 'AFTER';

    return `CREATE OR REPLACE FUNCTION __mj."${triggerName}_func"()
RETURNS TRIGGER AS $$
BEGIN
    ${body}
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "${triggerName}" ON __mj."${tableName}";
CREATE TRIGGER "${triggerName}"
    ${timing} ${event} ON __mj."${tableName}"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."${triggerName}_func"();
`;
  }
}
