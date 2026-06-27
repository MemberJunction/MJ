import { describe, it, expect } from 'vitest';
import { AlterTableRule } from '../rules/AlterTableRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new AlterTableRule();
const context = createConversionContext('tsql', 'postgres');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('AlterTableRule', () => {
  describe('metadata', () => {
    it('should have the correct name, priority, and applies-to types', () => {
      expect(rule.Name).toBe('AlterTableRule');
      expect(rule.Priority).toBe(60);
      expect(rule.AppliesTo).toEqual([
        'FK_CONSTRAINT', 'PK_CONSTRAINT', 'CHECK_CONSTRAINT',
        'UNIQUE_CONSTRAINT', 'ENABLE_CONSTRAINT', 'ALTER_TABLE',
      ]);
      expect(rule.BypassSqlglot).toBe(true);
    });
  });

  describe('foreign key constraints', () => {
    it('should add DEFERRABLE INITIALLY DEFERRED to FK constraints', () => {
      const sql = `ALTER TABLE [__mj].[Orders] ADD CONSTRAINT [FK_Orders_Users]
        FOREIGN KEY ([UserID]) REFERENCES [__mj].[Users] ([ID])`;
      const result = convert(sql);
      expect(result).toContain('FOREIGN KEY');
      expect(result).toContain('DEFERRABLE INITIALLY DEFERRED');
    });

    it('should remove WITH NOCHECK from FK constraints', () => {
      const sql = `ALTER TABLE [__mj].[Orders] WITH NOCHECK ADD CONSTRAINT [FK_Orders_Users]
        FOREIGN KEY ([UserID]) REFERENCES [__mj].[Users] ([ID])`;
      const result = convert(sql);
      expect(result).not.toMatch(/WITH\s+NOCHECK/i);
      expect(result).toContain('DEFERRABLE INITIALLY DEFERRED');
    });
  });

  describe('primary key constraints', () => {
    it('should convert PK constraint identifiers', () => {
      const sql = `ALTER TABLE [__mj].[Users] ADD CONSTRAINT [PK_Users]
        PRIMARY KEY CLUSTERED ([ID])`;
      const result = convert(sql);
      expect(result).toContain('__mj."Users"');
      expect(result).toContain('"PK_Users"');
      expect(result).toContain('PRIMARY KEY');
      expect(result).not.toMatch(/\bCLUSTERED\b/i);
    });
  });

  describe('check constraints', () => {
    it('should convert CHECK constraint identifiers', () => {
      const sql = `ALTER TABLE [__mj].[Items] ADD CONSTRAINT [CK_Items_Status]
        CHECK ([Status] IN (N'Active', N'Inactive'))`;
      const result = convert(sql);
      expect(result).toContain('__mj."Items"');
      expect(result).toContain('CHECK');
      expect(result).toContain("'Active'");
      expect(result).toContain("'Inactive'");
      expect(result).not.toContain("N'");
    });
  });

  describe('unique constraints', () => {
    it('should convert UNIQUE constraint identifiers', () => {
      const sql = `ALTER TABLE [__mj].[Users] ADD CONSTRAINT [UQ_Users_Email]
        UNIQUE NONCLUSTERED ([Email])`;
      const result = convert(sql);
      expect(result).toContain('__mj."Users"');
      expect(result).toContain('UNIQUE');
      expect(result).not.toMatch(/\bNONCLUSTERED\b/i);
    });
  });

  describe('ENABLE_CONSTRAINT (no-op)', () => {
    it('should convert enable constraint to a comment', () => {
      const sql = `ALTER TABLE [__mj].[Orders] WITH CHECK CHECK CONSTRAINT [FK_Orders_Users]`;
      const result = convert(sql);
      expect(result).toContain('Constraint enable (no-op in PostgreSQL)');
    });
  });

  describe('CLUSTERED / NONCLUSTERED removal', () => {
    it('should remove CLUSTERED keyword', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ADD CONSTRAINT [PK_Foo] PRIMARY KEY CLUSTERED ([ID])`;
      const result = convert(sql);
      expect(result).not.toMatch(/\bCLUSTERED\b/i);
      expect(result).toContain('PRIMARY KEY');
    });

    it('should remove NONCLUSTERED keyword', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ADD CONSTRAINT [UQ_Foo] UNIQUE NONCLUSTERED ([Name])`;
      const result = convert(sql);
      expect(result).not.toMatch(/\bNONCLUSTERED\b/i);
      expect(result).toContain('UNIQUE');
    });
  });

  describe('identifier conversion', () => {
    it('should convert all bracket identifiers to double-quoted identifiers', () => {
      const sql = `ALTER TABLE [__mj].[OrderItems] ADD CONSTRAINT [FK_OrderItems_Orders]
        FOREIGN KEY ([OrderID]) REFERENCES [__mj].[Orders] ([ID])`;
      const result = convert(sql);
      expect(result).toContain('__mj."OrderItems"');
      expect(result).toContain('"FK_OrderItems_Orders"');
      expect(result).toContain('"OrderID"');
      expect(result).toContain('__mj."Orders"');
      expect(result).toContain('"ID"');
      expect(result).not.toContain('[');
      expect(result).not.toContain(']');
    });
  });

  describe('COLLATE removal', () => {
    it('should remove COLLATE clauses from ALTER TABLE statements', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ALTER COLUMN [Name] [nvarchar](100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL`;
      const result = convert(sql);
      expect(result).not.toMatch(/COLLATE/i);
    });
  });

  describe('CHECK constraint string literal preservation', () => {
    it('should not quote PascalCase words inside string literals in CHECK constraints', () => {
      const sql = `ALTER TABLE [__mj].[EntityRelationship] ADD CONSTRAINT [CK_EntityRelationship_DisplayIconType]
        CHECK (([DisplayIconType]='None' OR [DisplayIconType]='Custom' OR [DisplayIconType]='Related Entity Icon'))`;
      const result = convert(sql);
      expect(result).toContain("'Related Entity Icon'");
      expect(result).not.toContain('"Entity"');
    });
  });

  describe('ALTER COLUMN nullability', () => {
    it('should convert ALTER COLUMN TYPE NOT NULL → SET NOT NULL', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ALTER COLUMN [Status] [nvarchar](20) NOT NULL`;
      const result = convert(sql);
      expect(result).toContain('SET NOT NULL');
      expect(result).not.toMatch(/nvarchar.*NOT NULL/i);
    });

    it('should convert ALTER COLUMN TYPE NULL → DROP NOT NULL', () => {
      const sql = `ALTER TABLE [__mj].[DuplicateRun] ALTER COLUMN [SourceListID] [uniqueidentifier] NULL`;
      const result = convert(sql);
      expect(result).toContain('DROP NOT NULL');
      expect(result).toContain('"SourceListID"');
      expect(result).not.toMatch(/uniqueidentifier.*NULL/i);
    });

    it('should convert ALTER COLUMN with sized type and NULL', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ALTER COLUMN [Name] [nvarchar](100) NULL`;
      const result = convert(sql);
      expect(result).toContain('DROP NOT NULL');
      expect(result).toContain('"Name"');
    });
  });

  describe('ADD COLUMN idempotency (IF NOT EXISTS)', () => {
    // PG migrations need idempotent DDL: CI's Step 5b re-applies each V-migration
    // on top of the already-migrated DB, and Skyway can re-run a migration after a
    // partial-commit failure. ADD COLUMN without IF NOT EXISTS errors on duplicate.
    // T-SQL ADD COLUMN also errors on duplicate, so emitting IF NOT EXISTS is strictly
    // more permissive — never weaker than the source semantics.
    it('should emit ADD COLUMN IF NOT EXISTS for a single ADD', () => {
      const sql = `ALTER TABLE [__mj].[ComponentLibrary] ADD [UsageInstructions] [NVARCHAR](MAX) NULL`;
      const result = convert(sql);
      expect(result).toContain('ADD COLUMN IF NOT EXISTS');
      expect(result).toContain('"UsageInstructions"');
      expect(result).not.toMatch(/ADD COLUMN\s+"UsageInstructions"/);
    });

    it('should emit IF NOT EXISTS on every column in a multi-column ADD', () => {
      const sql = `ALTER TABLE [__mj].[Entity]
        ADD [Col1] [NVARCHAR](100) NULL,
            [Col2] [BIT] NOT NULL DEFAULT 1`;
      const result = convert(sql);
      const matches = result.match(/ADD COLUMN IF NOT EXISTS/g) || [];
      expect(matches.length).toBe(2);
      expect(result).toContain('"Col1"');
      expect(result).toContain('"Col2"');
    });

    it('should NOT emit IF NOT EXISTS for ADD CONSTRAINT', () => {
      const sql = `ALTER TABLE [__mj].[Orders] ADD CONSTRAINT [PK_Orders] PRIMARY KEY ([ID])`;
      const result = convert(sql);
      expect(result).toContain('ADD CONSTRAINT');
      expect(result).not.toContain('IF NOT EXISTS');
    });
  });

  describe('Boolean DEFAULT conversion in ADD COLUMN', () => {
    it('should convert BIT DEFAULT 1 to BOOLEAN DEFAULT TRUE', () => {
      const sql = `ALTER TABLE [__mj].[AIAgent] ADD [AllowEphemeralClientTools] [BIT] NOT NULL DEFAULT 1`;
      const result = convert(sql);
      expect(result).toContain('BOOLEAN');
      expect(result).toContain('DEFAULT TRUE');
      expect(result).not.toContain('DEFAULT 1');
    });

    it('should convert BIT DEFAULT 0 to BOOLEAN DEFAULT FALSE', () => {
      const sql = `ALTER TABLE [__mj].[Entity] ADD [SupportsGeoCoding] [BIT] NOT NULL DEFAULT 0`;
      const result = convert(sql);
      expect(result).toContain('BOOLEAN');
      expect(result).toContain('DEFAULT FALSE');
      expect(result).not.toContain('DEFAULT 0');
    });

    it('should handle multiple BOOLEAN columns in one ALTER TABLE', () => {
      const sql = `ALTER TABLE [__mj].[Entity]
        ADD [AutoUpdateFullTextSearch] [BIT] NOT NULL DEFAULT 1,
            [SupportsGeoCoding] [BIT] NOT NULL DEFAULT 0`;
      const result = convert(sql);
      expect(result).toContain('DEFAULT TRUE');
      expect(result).toContain('DEFAULT FALSE');
    });

    it('should convert inline named CONSTRAINT DEFAULT spanning newlines', () => {
      // CodeGen / hand-written form: the named default constraint sits on its own
      // line after `BIT NOT NULL`, so BOOLEAN and DEFAULT 1 end up on separate lines.
      const sql = `ALTER TABLE [__mj].[AIAgent] ADD
    AllowMemoryWrite BIT NOT NULL
    CONSTRAINT DF_AIAgent_AllowMemoryWrite DEFAULT 1;`;
      const result = convert(sql);
      expect(result).toContain('BOOLEAN');
      expect(result).toContain('DEFAULT TRUE');
      expect(result).toContain('DF_AIAgent_AllowMemoryWrite'); // constraint name preserved
      expect(result).not.toMatch(/DEFAULT\s+1\b/);
    });

    it('should NOT convert an integer column DEFAULT 1 that follows a defaultless BOOLEAN column', () => {
      // Safety: the boolean-default rewrite must not span the comma into the
      // integer column's DEFAULT.
      const sql = `ALTER TABLE [__mj].[Foo]
        ADD [IsActive] [BIT] NOT NULL,
            [RetryCount] [INT] NOT NULL DEFAULT 1`;
      const result = convert(sql);
      expect(result).toMatch(/DEFAULT\s+1\b/); // integer default left intact
      expect(result).not.toContain('DEFAULT TRUE');
    });
  });

  describe('DEFAULT FOR column', () => {
    it('should convert ADD DEFAULT val FOR col to ALTER COLUMN SET DEFAULT', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ADD DEFAULT 0.7 FOR [Threshold]`;
      const result = convert(sql);
      expect(result).toContain('ALTER COLUMN');
      expect(result).toContain('SET DEFAULT');
      expect(result).toContain('0.7');
    });

    it('should convert ADD CONSTRAINT name DEFAULT val FOR col', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ADD CONSTRAINT [DF_Foo_Status] DEFAULT 'Active' FOR [Status]`;
      const result = convert(sql);
      expect(result).toContain('ALTER COLUMN');
      expect(result).toContain('SET DEFAULT');
      expect(result).not.toContain('DF_Foo_Status');
    });
  });

  describe('output formatting', () => {
    it('should ensure output ends with semicolon and newline', () => {
      const sql = `ALTER TABLE [__mj].[Foo] ADD CONSTRAINT [PK_Foo] PRIMARY KEY ([ID])`;
      const result = convert(sql);
      expect(result).toMatch(/;\n$/);
    });
  });
});
