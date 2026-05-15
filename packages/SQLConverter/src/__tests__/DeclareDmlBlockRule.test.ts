import { describe, it, expect } from 'vitest';
import { DeclareDmlBlockRule } from '../rules/DeclareDmlBlockRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new DeclareDmlBlockRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('DeclareDmlBlockRule', () => {
  describe('metadata', () => {
    it('should have correct name, priority, and applies-to', () => {
      expect(rule.Name).toBe('DeclareDmlBlockRule');
      expect(rule.Priority).toBe(53);
      expect(rule.AppliesTo).toEqual(['DECLARE_DML_BLOCK']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('sys.default_constraints simplification', () => {
    it('should replace sys.default_constraints + ADD DEFAULT FOR with ALTER COLUMN SET DEFAULT', () => {
      const sql = `DECLARE @constraintName NVARCHAR(256);
SELECT @constraintName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('\${flyway:defaultSchema}.EntityDocument')
  AND c.name = 'PotentialMatchThreshold';

IF @constraintName IS NOT NULL
    EXEC('ALTER TABLE \${flyway:defaultSchema}.EntityDocument DROP CONSTRAINT ' + @constraintName);

ALTER TABLE \${flyway:defaultSchema}.EntityDocument
    ADD DEFAULT 0.7 FOR PotentialMatchThreshold;`;

      const result = convert(sql);

      // Should produce a direct ALTER COLUMN SET DEFAULT
      expect(result).toContain('SET DEFAULT 0.7');
      expect(result).toContain('"PotentialMatchThreshold"');
      // Should NOT contain sys.default_constraints (SQL Server-only)
      expect(result).not.toContain('sys.default_constraints');
      // Should NOT contain OBJECT_ID (SQL Server function)
      expect(result).not.toContain('OBJECT_ID');
      // Should NOT be wrapped in a DO block (the whole block is simplified away)
      expect(result).not.toContain('DO $$');
      expect(result).not.toContain('DO $mj$');
    });

    it('should handle multiple ADD DEFAULT FOR in a single block', () => {
      const sql = `DECLARE @c1 NVARCHAR(256);
DECLARE @c2 NVARCHAR(256);

SELECT @c1 = dc.name FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('\${flyway:defaultSchema}.Foo') AND c.name = 'ColA';

IF @c1 IS NOT NULL
    EXEC('ALTER TABLE \${flyway:defaultSchema}.Foo DROP CONSTRAINT ' + @c1);

ALTER TABLE \${flyway:defaultSchema}.Foo ADD DEFAULT 42 FOR ColA;

SELECT @c2 = dc.name FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('\${flyway:defaultSchema}.Foo') AND c.name = 'ColB';

IF @c2 IS NOT NULL
    EXEC('ALTER TABLE \${flyway:defaultSchema}.Foo DROP CONSTRAINT ' + @c2);

ALTER TABLE \${flyway:defaultSchema}.Foo ADD DEFAULT 'hello' FOR ColB;`;

      const result = convert(sql);

      expect(result).toContain('SET DEFAULT 42');
      expect(result).toContain("SET DEFAULT 'hello'");
      expect(result).not.toContain('sys.default_constraints');
    });

    it('should preserve UPDATE statements following the default change', () => {
      const sql = `DECLARE @c NVARCHAR(256);

SELECT @c = dc.name FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('\${flyway:defaultSchema}.Foo') AND c.name = 'Threshold';

IF @c IS NOT NULL
    EXEC('ALTER TABLE \${flyway:defaultSchema}.Foo DROP CONSTRAINT ' + @c);

ALTER TABLE \${flyway:defaultSchema}.Foo ADD DEFAULT 0.7 FOR Threshold;

UPDATE \${flyway:defaultSchema}.Foo SET Threshold = 0.7 WHERE Threshold = 1.0;`;

      const result = convert(sql);

      expect(result).toContain('SET DEFAULT 0.7');
      expect(result).toContain('UPDATE');
      expect(result).toContain('0.7');
    });

    it('should NOT trigger simplification when block does not reference sys.default_constraints', () => {
      const sql = `DECLARE @v INT;
SET @v = 42;
UPDATE [__mj].[Foo] SET [Bar] = @v WHERE [Baz] = 1;`;

      const result = convert(sql);

      // Should go through normal DO-block conversion. Tagged `$mj$` delimiter
      // (not bare `$$`) so embedded user data containing literal `$$` doesn't
      // prematurely terminate the dollar-quote.
      expect(result).toContain('DO $mj$');
      expect(result).toContain('v_v');
    });
  });
});
