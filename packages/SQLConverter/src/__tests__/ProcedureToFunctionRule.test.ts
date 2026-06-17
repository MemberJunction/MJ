import { describe, it, expect } from 'vitest';
import { ProcedureToFunctionRule } from '../rules/ProcedureToFunctionRule.js';
import { createConversionContext } from '../rules/types.js';

const rule = new ProcedureToFunctionRule();
const context = createConversionContext('tsql', 'postgres');
// Populate CreatedViews with views referenced by tests
context.CreatedViews.add('vwUsers');

function convert(sql: string): string {
  return rule.PostProcess!(sql, sql, context);
}

describe('ProcedureToFunctionRule', () => {
  describe('basic procedure conversion', () => {
    it('should convert a simple CRUD procedure', () => {
      const input = `CREATE PROCEDURE [__mj].[spCreateUser]
    @FirstName nvarchar(100),
    @LastName nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [__mj].[User] ([FirstName], [LastName])
    VALUES (@FirstName, @LastName)

    SELECT * FROM [__mj].[vwUsers] WHERE [ID] = SCOPE_IDENTITY()
END`;

      const result = convert(input);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."spCreateUser"');
      expect(result).toContain('p_FirstName');
      expect(result).toContain('p_LastName');
      expect(result).toContain('VARCHAR(100)');
      expect(result).toContain('RETURNS SETOF __mj."vwUsers"');
      expect(result).toContain('$$ LANGUAGE plpgsql;');
      expect(result).not.toContain('SET NOCOUNT ON');
    });

    it('should declare RETURNS TABLE (not VOID) for a scalar SELECT @var AS Alias result', () => {
      // A proc that returns a row-count status: `SELECT @RowsAffected AS Extended`.
      // The body becomes RETURN QUERY, which PG rejects in a VOID function — the
      // return type MUST be TABLE(...) with the column type inferred from the DECLARE.
      const input = `CREATE PROCEDURE [__mj].[spExtendLease]
    @JobID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @RowsAffected INT;
    UPDATE [__mj].[ScheduledJob] SET [Foo] = 1 WHERE [ID] = @JobID;
    SET @RowsAffected = @@ROWCOUNT;
    SELECT @RowsAffected AS Extended;
END`;
      const result = convert(input);
      expect(result).toContain('RETURNS TABLE("Extended" INTEGER)');
      expect(result).not.toContain('RETURNS VOID');
      // The body's RETURN QUERY must now be legal against the SETOF/TABLE return.
      expect(result).toMatch(/RETURN QUERY\s+SELECT/i);
    });

    it('JSON-arg CRUD: INSERT omits keys that are absent OR explicitly JSON null (so column DEFAULT applies)', () => {
      // A wide CRUD sproc (>90 params) is converted to the p_data JSONB shape. A
      // present-but-null key (e.g. metadata-sync passing OwnerUserID = NULL) must be
      // treated like an absent key so the column DEFAULT applies — otherwise an
      // explicit NULL is inserted and a defaulted NOT NULL column blows up.
      const params = Array.from({ length: 95 }, (_, i) => `    @Field${i} nvarchar(50)`).join(',\n');
      const cols = Array.from({ length: 95 }, (_, i) => `[Field${i}]`).join(', ');
      const vals = Array.from({ length: 95 }, (_, i) => `@Field${i}`).join(', ');
      const input = `CREATE PROCEDURE [__mj].[spCreateWideThing]
    @ID uniqueidentifier,
${params}
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [__mj].[WideThing] ([ID], ${cols}) VALUES (@ID, ${vals});
    SELECT * FROM [__mj].[vwWideThings] WHERE [ID] = @ID;
END`;
      const result = convert(input);
      expect(result).toContain('p_data JSONB'); // confirms JSON-arg path was taken
      // The presence test must also exclude JSON null.
      expect(result).toContain("jsonb_typeof(p_data->v_field_name) <> 'null'");
      expect(result).toMatch(/IF p_data \? v_field_name AND jsonb_typeof/);
    });

    it('should handle CREATE PROC (short form)', () => {
      const input = `CREATE PROC [__mj].[spGetUser]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [__mj].[vwUsers] WHERE [ID] = @ID
END`;

      const result = convert(input);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."spGetUser"');
      expect(result).toContain('p_ID UUID');
    });

    it('should handle procedure with no parameters', () => {
      const input = `CREATE PROCEDURE [__mj].[spGetAllUsers]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [__mj].[vwUsers]
END`;

      const result = convert(input);
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."spGetAllUsers"()');
    });
  });

  describe('orphaned deprecated-entity sprocs', () => {
    it('should emit an INTENTIONAL skip for a sproc returning a deprecated/orphaned view', () => {
      const input = `CREATE PROCEDURE [__mj].[spCreateEntityBehavior]
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [__mj].[EntityBehavior] ([Name]) VALUES (@Name)
    SELECT * FROM [__mj].[vwEntityBehaviors] WHERE [ID] = SCOPE_IDENTITY()
END`;

      const result = convert(input);
      expect(result).toContain('-- SKIPPED (INTENTIONAL)');
      expect(result).toContain('vwEntityBehaviors');
      // Must NOT emit a function whose RETURNS SETOF targets the missing view.
      expect(result).not.toContain('CREATE OR REPLACE FUNCTION');
      expect(result).not.toMatch(/RETURNS SETOF __mj\."vw/);
    });

    it('should still emit a normal sproc whose return view is not orphaned', () => {
      const input = `CREATE PROCEDURE [__mj].[spCreateUser]
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [__mj].[User] ([Name]) VALUES (@Name)
    SELECT * FROM [__mj].[vwUsers] WHERE [ID] = SCOPE_IDENTITY()
END`;

      const result = convert(input);
      expect(result).not.toContain('-- SKIPPED');
      expect(result).toContain('CREATE OR REPLACE FUNCTION __mj."spCreateUser"');
      expect(result).toContain('RETURNS SETOF __mj."vwUsers"');
    });
  });

  describe('parameter conversion', () => {
    it('should convert parameter types', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Active bit,
    @Count int,
    @Amount money,
    @Created datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 1
END`;

      const result = convert(input);
      expect(result).toContain('p_ID UUID');
      expect(result).toContain('p_Name VARCHAR(100)');
      expect(result).toContain('p_Active BOOLEAN');
      expect(result).toContain('p_Count INTEGER');
      expect(result).toContain('p_Amount NUMERIC(19,4)');
      expect(result).toContain('p_Created TIMESTAMPTZ');
    });

    it('should handle default parameter values', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier,
    @Active bit = 1,
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 1
END`;

      const result = convert(input);
      expect(result).toContain('p_Active BOOLEAN DEFAULT TRUE');
      // Name should get DEFAULT NULL since it comes after a defaulted param
      expect(result).toContain('p_Name VARCHAR(100) DEFAULT NULL');
    });

    it('should convert OUTPUT params to IN', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 1
END`;

      const result = convert(input);
      expect(result).toContain('IN p_ID UUID');
      expect(result).not.toContain('INOUT');
    });

    it('should convert BIT default 0 to FALSE', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @Active bit = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 1
END`;

      const result = convert(input);
      expect(result).toContain('DEFAULT FALSE');
    });
  });

  describe('body conversion', () => {
    it('should convert @variables to p_ prefix', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @TempVar nvarchar(100)
    SET @TempVar = @ID
END`;

      const result = convert(input);
      expect(result).toContain('p_TempVar');
      expect(result).toContain('p_ID');
      expect(result).not.toContain('@TempVar');
      expect(result).not.toContain('@ID');
    });

    it('should convert DECLARE to plpgsql DECLARE block', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Count int;
    DECLARE @Name nvarchar(100);
    SET @Count = 0
END`;

      const result = convert(input);
      expect(result).toContain('DECLARE');
      expect(result).toContain('p_Count INTEGER;');
      expect(result).toContain('p_Name VARCHAR(100);');
    });

    it('should convert SET assignments to :=', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Count int;
    SET @Count = 42
END`;

      const result = convert(input);
      expect(result).toContain(':=');
      expect(result).not.toMatch(/\bSET\s+p_Count\s*=/);
    });

    it('should convert ISNULL to COALESCE', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ISNULL(@Name, 'default')
END`;

      const result = convert(input);
      expect(result).toContain('COALESCE(');
      expect(result).not.toContain('ISNULL');
    });

    // After bit→boolean param translation, body comparisons against integer
    // literals (`= 1` / `= 0` / `<> 1` / `!= 0`) become `boolean = integer`
    // and PG rejects them at call time. Coerce literals to TRUE/FALSE for any
    // param that was translated to boolean.
    describe('boolean-param body comparison coercion', () => {
      it('should rewrite `<bool_param> = 1` to `= TRUE`', () => {
        const input = `CREATE PROCEDURE [__mj].[spTest]
    @Active bit = 0
AS
BEGIN
    UPDATE __mj.Test SET "Status" = 'On' WHERE @Active = 1;
END`;
        const result = convert(input);
        expect(result).toContain('p_Active = TRUE');
        expect(result).not.toMatch(/p_Active\s*=\s*1\b/);
      });

      it('should rewrite `<bool_param> = 0` to `= FALSE`', () => {
        const input = `CREATE PROCEDURE [__mj].[spTest]
    @Active bit = 0
AS
BEGIN
    UPDATE __mj.Test SET "Status" = 'Off' WHERE @Active = 0;
END`;
        const result = convert(input);
        expect(result).toContain('p_Active = FALSE');
        expect(result).not.toMatch(/p_Active\s*=\s*0\b/);
      });

      it('should rewrite `<> 1` and `<> 0` for boolean params', () => {
        const input = `CREATE PROCEDURE [__mj].[spTest]
    @A bit = 0,
    @B bit = 0
AS
BEGIN
    SELECT 1 WHERE @A <> 1 AND @B <> 0;
END`;
        const result = convert(input);
        expect(result).toContain('p_A <> TRUE');
        expect(result).toContain('p_B <> FALSE');
      });

      it('should rewrite `!= 1` and `!= 0` for boolean params', () => {
        const input = `CREATE PROCEDURE [__mj].[spTest]
    @A bit = 0,
    @B bit = 0
AS
BEGIN
    SELECT 1 WHERE @A != 1 AND @B != 0;
END`;
        const result = convert(input);
        expect(result).toContain('p_A != TRUE');
        expect(result).toContain('p_B != FALSE');
      });

      it('should rewrite the tolerant-SP CASE WHEN _Clear pattern', () => {
        // Real-world shape: nullable column with _Clear companion bit param
        // gets a CASE WHEN <param>_Clear = 1 THEN NULL ELSE COALESCE(...) END
        // emitted into the SET clause. This is exactly what trips
        // V202605032236 Metadata_Sync at call time on PG.
        const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier,
    @Name_Clear bit = 0,
    @Name nvarchar(100)
AS
BEGIN
    UPDATE __mj.Test
    SET "Name" = CASE WHEN @Name_Clear = 1 THEN NULL ELSE COALESCE(@Name, "Name") END
    WHERE "ID" = @ID;
END`;
        const result = convert(input);
        expect(result).toContain('CASE WHEN p_Name_Clear = TRUE THEN NULL ELSE');
        expect(result).not.toMatch(/p_Name_Clear\s*=\s*1\b/);
      });

      it('should NOT rewrite integer literals for non-boolean params', () => {
        const input = `CREATE PROCEDURE [__mj].[spTest]
    @Code int
AS
BEGIN
    SELECT 1 WHERE @Code = 1;
END`;
        const result = convert(input);
        // p_Code is int, not boolean — `= 1` is a legitimate integer compare,
        // must not be touched.
        expect(result).toMatch(/p_Code\s*=\s*1\b/);
        expect(result).not.toContain('p_Code = TRUE');
      });

      it('should NOT confuse `!= 1` with `= 1` (operator-overlap guard)', () => {
        const input = `CREATE PROCEDURE [__mj].[spTest]
    @A bit = 0
AS
BEGIN
    SELECT 1 WHERE @A != 1;
END`;
        const result = convert(input);
        // Must produce `!= TRUE`, not `! = TRUE` or `= TRUE`
        expect(result).toContain('p_A != TRUE');
        expect(result).not.toContain('!= 1');
      });
    });

    it('should convert GETUTCDATE to NOW()', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Now datetime;
    SET @Now = GETUTCDATE()
END`;

      const result = convert(input);
      expect(result).toContain('NOW()');
      expect(result).not.toContain('GETUTCDATE');
    });

    it('should convert RAISERROR to RAISE EXCEPTION', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    RAISERROR('Something went wrong', 16, 1);
END`;

      const result = convert(input);
      expect(result).toContain("RAISE EXCEPTION 'Something went wrong'");
    });

    it('should convert ERROR_MESSAGE to SQLERRM', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ERROR_MESSAGE()
END`;

      const result = convert(input);
      expect(result).toContain('SQLERRM');
    });

    it('should remove OUTPUT INSERTED clauses', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [__mj].[TestTable] ([Name])
    OUTPUT INSERTED.*
    VALUES ('test')
END`;

      const result = convert(input);
      expect(result).not.toContain('OUTPUT INSERTED');
    });

    it('should handle @@ROWCOUNT', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [__mj].[TestTable] SET [Name] = 'test' WHERE [ID] = @ID
    IF @@ROWCOUNT > 0
        SELECT 'success'
END`;

      const result = convert(input);
      expect(result).toContain('_v_row_count');
      expect(result).toContain('_v_row_count INTEGER;');
      expect(result).not.toContain('@@ROWCOUNT');
    });

    it('should convert PRINT to RAISE NOTICE', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    PRINT 'Hello World'
END`;

      const result = convert(input);
      expect(result).toContain("RAISE NOTICE 'Hello World'");
    });

    it('should convert SCOPE_IDENTITY to lastval()', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @NewID int;
    SET @NewID = SCOPE_IDENTITY()
END`;

      const result = convert(input);
      expect(result).toContain('lastval()');
    });

    it('should convert NEWID to gen_random_uuid()', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @NewID uniqueidentifier;
    SET @NewID = NEWID()
END`;

      const result = convert(input);
      expect(result).toContain('gen_random_uuid()');
    });

    it('should convert N-prefix strings', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT N'Hello World'
END`;

      const result = convert(input);
      expect(result).toContain("'Hello World'");
      expect(result).not.toMatch(/N'/);
    });

    it('should convert CAST types in body', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CAST(@ID AS UNIQUEIDENTIFIER)
END`;

      const result = convert(input);
      expect(result).toContain('AS UUID');
    });

    it('should convert LEN to LENGTH', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT LEN(@Name)
END`;

      const result = convert(input);
      expect(result).toContain('LENGTH(');
      expect(result).not.toContain('LEN(');
    });
  });

  describe('return type detection', () => {
    it('should detect RETURNS SETOF view', () => {
      const input = `CREATE PROCEDURE [__mj].[spGetUser]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [__mj].[vwUsers] WHERE [ID] = @ID
END`;

      const result = convert(input);
      expect(result).toContain('RETURNS SETOF __mj."vwUsers"');
    });

    it('should detect RETURNS TABLE for delete proc', () => {
      const input = `CREATE PROCEDURE [__mj].[spDeleteUser]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM [__mj].[User] WHERE [ID] = @ID
    SELECT @ID AS [ID]
END`;

      const result = convert(input);
      expect(result).toContain('RETURNS TABLE("_result_id" UUID)');
    });

    it('should detect RETURNS VOID when no SELECT', () => {
      const input = `CREATE PROCEDURE [__mj].[spDoSomething]
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [__mj].[Config] SET [Value] = 'test'
END`;

      const result = convert(input);
      expect(result).toContain('RETURNS VOID');
    });
  });

  describe('function structure', () => {
    it('should wrap body in $$ dollar quoting', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 1
END`;

      const result = convert(input);
      expect(result).toContain('$$');
      expect(result).toContain('$$ LANGUAGE plpgsql;');
    });

    it('should have proper DECLARE/BEGIN/END structure', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @X int;
    SET @X = 1
END`;

      const result = convert(input);
      expect(result).toContain('DECLARE');
      expect(result).toContain('BEGIN');
      expect(result).toMatch(/END\s*$/m);
    });
  });

  describe('edge cases', () => {
    it('should return SKIPPED comment for unparseable proc', () => {
      const input = `CREATE PROCEDURE someWeirdFormat
        that does not match any pattern`;

      const result = convert(input);
      expect(result).toContain('SKIPPED: procedure (auto-conversion not supported)');
    });

    it('should handle COLLATE removal in body', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT @Name COLLATE SQL_Latin1_General_CP1_CI_AS
END`;

      const result = convert(input);
      expect(result).not.toContain('COLLATE');
    });

    it('should emit function even when referenced view is defined in earlier migration', () => {
      // Previously we skipped these sprocs, but that silently left the database with
      // outdated signatures (e.g. v5.15 Prefill never regenerated spCreateAIModel,
      // so v5.23 Metadata_Sync crashed calling the 13-arg version). Now we emit
      // the sproc — the referenced view lives in the baseline or an earlier
      // migration and will exist by the time this one runs.
      const ctx = createConversionContext('tsql', 'postgres');
      // Do NOT add vwMissingView to ctx.CreatedViews
      const input = `CREATE PROCEDURE [__mj].[spCreateMissing]
    @Name nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [__mj].[MissingTable] ([Name]) VALUES (@Name)
    SELECT * FROM [__mj].[vwMissingView] WHERE [ID] = SCOPE_IDENTITY()
END`;

      const result = rule.PostProcess!(input, input, ctx);
      expect(result).toContain('CREATE OR REPLACE FUNCTION');
      expect(result).toContain('vwMissingView');
      expect(result).not.toContain('-- SKIPPED');
    });

    it('should convert suser_sname() to current_user', () => {
      const input = `CREATE PROCEDURE [__mj].[spTest]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT SUSER_SNAME()
END`;

      const result = convert(input);
      expect(result).toContain('current_user');
    });
  });

  // ─── Fix 18: DROP-overload guard before CREATE OR REPLACE FUNCTION ────
  //
  // PG dispatches functions by (name, ordered-arg-type-list). Without
  // dropping prior overloads, every regenerated sproc with a new param
  // accumulates as a duplicate overload (Bug 1 from Ian's v5.32 finding).
  // Every converted procedure must emit a DO-block iterating pg_proc to
  // drop all overloads of the function name BEFORE the CREATE OR REPLACE.
  describe('Fix 18: DROP-overload guard before CREATE OR REPLACE FUNCTION', () => {
    it('should emit a DO-block dropping all overloads of the function before the CREATE', () => {
      const input = `CREATE PROCEDURE [__mj].[spCreateUser]
    @FirstName nvarchar(100),
    @LastName nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [__mj].[User] ([FirstName], [LastName]) VALUES (@FirstName, @LastName)
    SELECT * FROM [__mj].[vwUsers] WHERE [ID] = SCOPE_IDENTITY()
END`;
      const result = convert(input);
      // The drop block must reference the function by name and run BEFORE
      // the CREATE OR REPLACE.
      expect(result).toContain(`proname = 'spCreateUser'`);
      expect(result).toContain(`pronamespace = '__mj'::regnamespace`);
      expect(result).toContain(`DROP FUNCTION IF EXISTS`);
      expect(result).toContain(`CASCADE`);
      // Order: DROP block must precede CREATE OR REPLACE
      const dropIdx = result.indexOf('DROP FUNCTION IF EXISTS');
      const createIdx = result.indexOf('CREATE OR REPLACE FUNCTION');
      expect(dropIdx).toBeGreaterThan(-1);
      expect(createIdx).toBeGreaterThan(dropIdx);
    });

    it('should drop overloads even for parameterless procedures (idempotent for first-time creates)', () => {
      const input = `CREATE PROCEDURE [__mj].[spCleanup]
AS
BEGIN
    DELETE FROM [__mj].[StaleRecords]
END`;
      const result = convert(input);
      // First-time creates also get the drop block — DROP IF EXISTS is harmless
      // when no prior overload exists, so emitting unconditionally keeps the
      // converter's output fully idempotent.
      expect(result).toContain(`proname = 'spCleanup'`);
    });

    it('should generate a unique drop block per procedure name', () => {
      const input1 = `CREATE PROCEDURE [__mj].[spOne] AS BEGIN SELECT 1 END`;
      const input2 = `CREATE PROCEDURE [__mj].[spTwo] AS BEGIN SELECT 2 END`;
      const result1 = convert(input1);
      const result2 = convert(input2);
      expect(result1).toContain(`proname = 'spOne'`);
      expect(result1).not.toContain(`proname = 'spTwo'`);
      expect(result2).toContain(`proname = 'spTwo'`);
      expect(result2).not.toContain(`proname = 'spOne'`);
    });
  });

  // ─── Fix 19: Named-arg PERFORM in spDelete bodies calling spUpdate ────
  //
  // T-SQL spDelete bodies use EXEC ... @Param = value (named args) when
  // calling other sprocs (e.g. cascade-delete chains calling spUpdate).
  // Previously the converter translated these to POSITIONAL PERFORM —
  // fragile across signature changes (Bug 2: when spUpdate gets a new
  // param inserted, the positional args bind to the wrong slots and PG
  // throws runtime type errors). Fix 19: emit named-arg PERFORM
  // (`p_x => value`) which survives parameter insertion.
  describe('Fix 19: named-arg PERFORM for cross-sproc EXEC calls', () => {
    it('should translate EXEC with named args to PERFORM with named args (=> syntax)', () => {
      const input = `CREATE PROCEDURE [__mj].[spDeleteUser]
    @ID UNIQUEIDENTIFIER
AS
BEGIN
    EXEC [__mj].[spUpdateUser] @ID = @ID, @IsActive = 0
    DELETE FROM [__mj].[User] WHERE [ID] = @ID
END`;
      const result = convert(input);
      // Named-arg PERFORM (`p_X => value`) — NOT positional
      expect(result).toContain('p_ID => p_ID');
      expect(result).toContain('p_IsActive => 0');
      // The bug pattern would have been positional `(p_ID, 0)` — verify
      // we don't emit that.
      expect(result).not.toMatch(/PERFORM\s+__mj\."spUpdateUser"\(p_ID,\s*0\)/);
    });

    it('should preserve named args even when value is a complex expression', () => {
      const input = `CREATE PROCEDURE [__mj].[spDeleteOrder]
    @OrderID UNIQUEIDENTIFIER
AS
BEGIN
    EXEC [__mj].[spUpdateOrder] @OrderID = @OrderID, @Status = 'Cancelled', @CancelledAt = GETUTCDATE()
END`;
      const result = convert(input);
      expect(result).toContain('p_OrderID => p_OrderID');
      expect(result).toContain(`p_Status => 'Cancelled'`);
      expect(result).toMatch(/p_CancelledAt\s*=>\s*(GETUTCDATE\(\)|NOW\(\)|CURRENT_TIMESTAMP)/);
    });

    it('should still handle EXEC with no params (parameterless call)', () => {
      const input = `CREATE PROCEDURE [__mj].[spRunCleanup]
AS
BEGIN
    EXEC [__mj].[spCleanupOrphans]
END`;
      const result = convert(input);
      expect(result).toContain(`PERFORM __mj."spCleanupOrphans"()`);
    });
  });
});
