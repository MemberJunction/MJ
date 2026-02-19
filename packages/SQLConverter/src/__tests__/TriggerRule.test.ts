import { describe, it, expect } from 'vitest';
import { TriggerRule } from '../rules/TriggerRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new TriggerRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('TriggerRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('TriggerRule');
      expect(rule.Priority).toBe(40);
      expect(rule.AppliesTo).toEqual(['CREATE_TRIGGER']);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('UpdatedAt trigger pattern', () => {
    it('should convert an UpdatedAt trigger to the standard PG pattern', () => {
      const sql = `CREATE TRIGGER [__mj].[trgUpdate_Users] ON [__mj].[Users] AFTER UPDATE AS BEGIN
  SET NOCOUNT ON;
  UPDATE [__mj].[Users] SET __mj_UpdatedAt = GETUTCDATE() FROM INSERTED WHERE [__mj].[Users].[ID] = INSERTED.[ID]
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."trgUpdate_Users_func"()');
      expect(result).toContain('RETURNS TRIGGER AS $$');
      expect(result).toContain('NEW."__mj_UpdatedAt" = NOW()');
      expect(result).toContain('RETURN NEW');
      expect(result).toContain('LANGUAGE plpgsql');
      expect(result).toContain('BEFORE UPDATE ON __mj."Users"');
      expect(result).toContain('FOR EACH ROW');
      expect(result).toContain('EXECUTE FUNCTION __mj."trgUpdate_Users_func"()');
    });
  });

  describe('generic trigger conversion', () => {
    it('should convert a generic AFTER INSERT trigger', () => {
      const sql = `CREATE TRIGGER [__mj].[trgInsert_Logs] ON [__mj].[Logs] AFTER INSERT AS BEGIN
  SET NOCOUNT ON;
  INSERT INTO [__mj].[AuditLog] ([TableName]) SELECT N'Logs' FROM INSERTED
END`;
      const result = convert(sql);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."trgInsert_Logs_func"()');
      expect(result).toContain('RETURNS TRIGGER AS $$');
      expect(result).toContain('LANGUAGE plpgsql');
      expect(result).toContain('INSERT ON __mj."Logs"');
      expect(result).toContain('FOR EACH ROW');
    });

    it('should convert multi-event trigger: AFTER INSERT, UPDATE to INSERT OR UPDATE', () => {
      const sql = `CREATE TRIGGER [__mj].[trgChange_Items] ON [__mj].[Items] AFTER INSERT, UPDATE AS BEGIN
  SET NOCOUNT ON;
  INSERT INTO [__mj].[ChangeLog] ([Item]) SELECT [Name] FROM INSERTED
END`;
      const result = convert(sql);
      expect(result).toContain('INSERT OR UPDATE ON __mj."Items"');
    });
  });

  describe('keyword replacements in body', () => {
    it('should replace INSERTED with NEW', () => {
      const sql = `CREATE TRIGGER [__mj].[trg1] ON [__mj].[Foo] AFTER INSERT AS BEGIN
  SET NOCOUNT ON;
  UPDATE [__mj].[Foo] SET [Val] = INSERTED.[Val] + 1 FROM INSERTED WHERE [__mj].[Foo].[ID] = INSERTED.[ID]
END`;
      const result = convert(sql);
      expect(result).toContain('NEW');
      expect(result).not.toMatch(/\bINSERTED\b/);
    });

    it('should replace DELETED with OLD', () => {
      const sql = `CREATE TRIGGER [__mj].[trg2] ON [__mj].[Foo] AFTER DELETE AS BEGIN
  SET NOCOUNT ON;
  INSERT INTO [__mj].[Archive] ([OldVal]) SELECT [Val] FROM DELETED
END`;
      const result = convert(sql);
      expect(result).toContain('OLD');
      expect(result).not.toMatch(/\bDELETED\b/);
    });

    it('should replace ISNULL with COALESCE in trigger body', () => {
      const sql = `CREATE TRIGGER [__mj].[trg3] ON [__mj].[Bar] AFTER INSERT AS BEGIN
  SET NOCOUNT ON;
  UPDATE [__mj].[Bar] SET [Val] = ISNULL(INSERTED.[Val], 0) FROM INSERTED WHERE [__mj].[Bar].[ID] = INSERTED.[ID]
END`;
      const result = convert(sql);
      expect(result).toContain('COALESCE(');
      expect(result).not.toMatch(/\bISNULL\s*\(/i);
    });

    it('should replace GETUTCDATE with NOW() in trigger body', () => {
      const sql = `CREATE TRIGGER [__mj].[trg4] ON [__mj].[Baz] AFTER INSERT AS BEGIN
  SET NOCOUNT ON;
  UPDATE [__mj].[Baz] SET [LoggedAt] = GETUTCDATE() FROM INSERTED WHERE [__mj].[Baz].[ID] = INSERTED.[ID]
END`;
      const result = convert(sql);
      expect(result).toContain('NOW()');
      expect(result).not.toMatch(/GETUTCDATE/i);
    });
  });

  describe('skip conditions', () => {
    it('should skip triggers using TRIGGER_NESTLEVEL', () => {
      const sql = `CREATE TRIGGER [__mj].[trgNested] ON [__mj].[Foo] AFTER INSERT AS BEGIN
  IF TRIGGER_NESTLEVEL() > 1 RETURN;
  UPDATE [__mj].[Foo] SET [Val] = 1 FROM INSERTED WHERE [__mj].[Foo].[ID] = INSERTED.[ID]
END`;
      const result = convert(sql);
      expect(result).toContain('SKIPPED');
      expect(result).toContain('trgNested');
    });

    it('should skip triggers using UPDATE() function', () => {
      const sql = `CREATE TRIGGER [__mj].[trgColCheck] ON [__mj].[Foo] AFTER UPDATE AS BEGIN
  IF UPDATE(Name)
    INSERT INTO [__mj].[Log] ([Msg]) VALUES ('Name changed')
END`;
      const result = convert(sql);
      expect(result).toContain('SKIPPED');
      expect(result).toContain('trgColCheck');
    });
  });

  describe('trigger function naming', () => {
    it('should name the trigger function with _func suffix', () => {
      const sql = `CREATE TRIGGER [__mj].[myTrigger] ON [__mj].[MyTable] AFTER INSERT AS BEGIN
  SET NOCOUNT ON;
  INSERT INTO [__mj].[Log] ([Msg]) SELECT N'inserted' FROM INSERTED
END`;
      const result = convert(sql);
      expect(result).toContain('"myTrigger_func"');
    });
  });

  describe('failed parse fallback', () => {
    it('should produce a TODO comment if the trigger cannot be parsed', () => {
      const sql = 'CREATE TRIGGER something_completely_different';
      const result = convert(sql);
      expect(result).toContain('TODO: Trigger conversion failed');
    });
  });
});
