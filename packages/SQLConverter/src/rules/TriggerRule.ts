import type { IConversionRule, ConversionContext, StatementType } from './types.js';
import { convertIdentifiers } from './ExpressionHelpers.js';

/**
 * Hand-written PG equivalents for complex triggers that use SQL Server-specific
 * functions (TRIGGER_NESTLEVEL, UPDATE(), etc.) which cannot be mechanically converted.
 * Keyed by trigger name (without schema prefix).
 */
const HAND_WRITTEN_TRIGGERS: ReadonlyMap<string, (tableName: string) => string> = new Map([
  ['tr_APIScope_UpdateFullPath', (tableName: string) => `CREATE OR REPLACE FUNCTION __mj."tr_APIScope_UpdateFullPath_fn"()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent recursive trigger firing
    IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

    -- Only run if Name or ParentID changed (or new insert)
    IF TG_OP = 'INSERT'
       OR NEW."Name" IS DISTINCT FROM OLD."Name"
       OR NEW."ParentID" IS DISTINCT FROM OLD."ParentID" THEN

        -- Recalculate all FullPath values using recursive CTE
        WITH RECURSIVE "ScopePaths" AS (
            -- Base case: root scopes (no parent)
            SELECT
                "ID",
                "Name",
                "ParentID",
                CAST("Name" AS VARCHAR(500)) AS "ComputedPath"
            FROM __mj."${tableName}"
            WHERE "ParentID" IS NULL

            UNION ALL

            -- Recursive case: child scopes
            SELECT
                s."ID",
                s."Name",
                s."ParentID",
                CAST(sp."ComputedPath" || ':' || s."Name" AS VARCHAR(500)) AS "ComputedPath"
            FROM __mj."${tableName}" s
            INNER JOIN "ScopePaths" sp ON s."ParentID" = sp."ID"
        )
        UPDATE __mj."${tableName}" s
        SET "FullPath" = sp."ComputedPath"
        FROM "ScopePaths" sp
        WHERE s."ID" = sp."ID"
          AND (s."FullPath" != sp."ComputedPath" OR s."FullPath" IS NULL);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "tr_APIScope_UpdateFullPath" ON __mj."${tableName}";
CREATE TRIGGER "tr_APIScope_UpdateFullPath"
    AFTER INSERT OR UPDATE ON __mj."${tableName}"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."tr_APIScope_UpdateFullPath_fn"();
`],
]);

export class TriggerRule implements IConversionRule {
  Name = 'TriggerRule';
  SourceDialect = 'tsql';
  TargetDialect = 'postgres';
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
      return this.buildUpdatedAtTrigger(triggerName, tableName);
    }

    // Check for hand-written conversion of complex triggers
    const handWritten = HAND_WRITTEN_TRIGGERS.get(triggerName);
    if (handWritten) {
      return handWritten(tableName);
    }

    // For any other trigger using SQL Server-specific functions, attempt generic conversion
    if (sql.includes('TRIGGER_NESTLEVEL') || sql.replace(/\s/g, '').includes('UPDATE(')) {
      return this.convertAdvancedTrigger(triggerName, tableName, event, body);
    }

    // Generic trigger conversion
    body = this.convertBasicBody(body);
    const timing = body.includes('NEW.') ? 'BEFORE' : 'AFTER';

    return this.buildTriggerSQL(triggerName, tableName, timing, event, body);
  }

  /** Convert basic T-SQL trigger body expressions to PG */
  private convertBasicBody(body: string): string {
    body = convertIdentifiers(body);
    body = body.replace(/(?<![a-zA-Z])N'/g, "'");
    body = body.replace(/\bINSERTED\b/gi, 'NEW');
    body = body.replace(/\bDELETED\b/gi, 'OLD');
    body = body.replace(/\bISNULL\s*\(/gi, 'COALESCE(');
    body = body.replace(/\bGETUTCDATE\s*\(\s*\)/gi, 'NOW()');
    return body;
  }

  /** Build standard UpdatedAt trigger (BEFORE UPDATE) */
  private buildUpdatedAtTrigger(triggerName: string, tableName: string): string {
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

  /**
   * Generic conversion for triggers with SQL Server-specific functions.
   * Falls back to a TODO comment if the conversion is too complex.
   */
  private convertAdvancedTrigger(
    triggerName: string, tableName: string, event: string, body: string,
  ): string {
    // Convert identifier brackets: [col] → "col"
    body = convertIdentifiers(body);

    // TRIGGER_NESTLEVEL() → pg_trigger_depth()
    body = body.replace(/\bTRIGGER_NESTLEVEL\s*\(\s*\)/gi, 'pg_trigger_depth()');

    // NOT EXISTS (SELECT 1 FROM deleted) → TG_OP = 'INSERT'
    body = body.replace(
      /NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(?:"?deleted"?|OLD)\s*\)/gi,
      "TG_OP = 'INSERT'"
    );

    // UPDATE(ColName) → (TG_OP = 'UPDATE' AND NEW."ColName" IS DISTINCT FROM OLD."ColName")
    body = body.replace(
      /\bUPDATE\s*\(\s*"?(\w+)"?\s*\)/gi,
      (_match, col: string) =>
        `(TG_OP = 'UPDATE' AND NEW."${col}" IS DISTINCT FROM OLD."${col}")`
    );

    // Basic expression conversions
    body = body.replace(/(?<![a-zA-Z])N'/g, "'");
    body = body.replace(/\bINSERTED\b/gi, 'NEW');
    body = body.replace(/\bDELETED\b/gi, 'OLD');
    body = body.replace(/\bISNULL\s*\(/gi, 'COALESCE(');
    body = body.replace(/\bGETUTCDATE\s*\(\s*\)/gi, 'NOW()');
    body = body.replace(/\bNVARCHAR\s*\(/gi, 'VARCHAR(');

    const indentedBody = body
      .split('\n')
      .map(line => `    ${line}`)
      .join('\n');

    return `CREATE OR REPLACE FUNCTION __mj."${triggerName}_fn"()
RETURNS TRIGGER AS $$
BEGIN
${indentedBody}

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "${triggerName}" ON __mj."${tableName}";
CREATE TRIGGER "${triggerName}"
    AFTER ${event} ON __mj."${tableName}"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."${triggerName}_fn"();
`;
  }

  /** Build the standard trigger function + trigger DDL */
  private buildTriggerSQL(
    triggerName: string, tableName: string,
    timing: string, event: string, body: string,
  ): string {
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
