"""
Regression tests for the MJ PostgreSQL sqlglot dialect (mj_postgres.py).

Plain-assert tests (no pytest dependency). Run with the project venv:
    python3 packages/SQLGlotTS/src/python/test_mj_postgres.py
Exits non-zero on first failure.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from mj_postgres import mj_transpile  # noqa: E402

_failures = 0


def check(name, sql, must_contain=(), must_not_contain=(), expect_unhandled=0):
    global _failures
    r = mj_transpile(sql)
    joined = "\n".join(r["sql"])
    # Whitespace-insensitive substring match so assertions survive pretty-printing
    # (sqlglot may wrap a statement across lines, e.g. `DEFAULT (\n  CURRENT_USER\n)`).
    import re as _re2
    nows = _re2.sub(r"\s+", "", joined)
    errs = []
    for s in must_contain:
        if _re2.sub(r"\s+", "", s) not in nows:
            errs.append(f"missing {s!r}")
    for s in must_not_contain:
        if _re2.sub(r"\s+", "", s) in nows:
            errs.append(f"should not contain {s!r}")
    if len(r["unhandled"]) != expect_unhandled:
        errs.append(f"unhandled={len(r['unhandled'])} (expected {expect_unhandled}): {r['unhandled']}")
    if errs:
        _failures += 1
        print(f"FAIL {name}")
        for e in errs:
            print(f"     {e}")
        print(f"     output:\n{joined}\n")
    else:
        print(f"ok   {name}")


# --- AST type / function / boolean encoding ---------------------------------
check("type mappings",
      "CREATE TABLE ${flyway:defaultSchema}.Foo (ID UNIQUEIDENTIFIER NOT NULL, Notes NVARCHAR(MAX) NULL, Name NVARCHAR(50));",
      must_contain=['"ID" UUID', '"Notes" TEXT', '"Name" VARCHAR(50)'],
      must_not_contain=["NVARCHAR", "VARCHAR(MAX)", "UNIQUEIDENTIFIER"])

check("function + boolean default rewrite",
      "CREATE TABLE ${flyway:defaultSchema}.Foo (ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID(), IsActive BIT NOT NULL DEFAULT 1, IsX BIT DEFAULT 0, C DATETIMEOFFSET DEFAULT GETUTCDATE());",
      must_contain=["GEN_RANDOM_UUID()", "BOOLEAN NOT NULL DEFAULT TRUE", "DEFAULT FALSE", "TIMESTAMPTZ", "NOW()"],
      must_not_contain=["NEWSEQUENTIALID", "GETUTCDATE", "DEFAULT 1", "DEFAULT 0"])

check("flyway macro preserved verbatim, identifiers quoted",
      "ALTER TABLE ${flyway:defaultSchema}.APIKey ADD KeyPrefix NVARCHAR(20) NULL;",
      must_contain=['${flyway:defaultSchema}."APIKey"', '"KeyPrefix" VARCHAR(20)'],
      must_not_contain=['"${flyway', "__mj_flyway"])

# --- Column-level FK: FOREIGN KEY REFERENCES → bare REFERENCES ---------------
check("inline column FK drops FOREIGN KEY keyword (PG column constraint)",
      "ALTER TABLE ${flyway:defaultSchema}.AIAgentRequest ADD "
      "RequestTypeID UNIQUEIDENTIFIER NULL CONSTRAINT FK_x FOREIGN KEY "
      "REFERENCES ${flyway:defaultSchema}.AIAgentRequestType(ID), "
      "Priority INT NOT NULL CONSTRAINT DF_p DEFAULT 50;",
      must_contain=['CONSTRAINT "FK_x" REFERENCES ${flyway:defaultSchema}."AIAgentRequestType" ("ID")',
                    'ADD COLUMN "Priority" INT NOT NULL', 'DEFAULT 50'],
      must_not_contain=["FOREIGN KEY"])

# --- Table-level constraint mixed into ADD list (sqlglot mis-parse) ----------
check("table CONSTRAINT in multi-item ADD → ADD CONSTRAINT (not a bogus column)",
      "ALTER TABLE ${flyway:defaultSchema}.AIPrompt ADD "
      "AssistantPrefill NVARCHAR(MAX) NULL, "
      "PrefillFallbackMode NVARCHAR(20) NOT NULL DEFAULT 'Ignore', "
      "CONSTRAINT CK_AIPrompt_PrefillFallbackMode CHECK (PrefillFallbackMode IN ('Ignore','None'));",
      must_contain=['ADD COLUMN "AssistantPrefill" TEXT',
                    'ADD COLUMN "PrefillFallbackMode" VARCHAR(20) NOT NULL DEFAULT \'Ignore\'',
                    'ADD CONSTRAINT "CK_AIPrompt_PrefillFallbackMode" CHECK'],
      must_not_contain=['ADD COLUMN "CONSTRAINT"', "USERDEFINED"])

# --- FLOAT precision: bare/wide FLOAT → DOUBLE PRECISION, narrow → REAL -------
check("FLOAT widths map to DOUBLE PRECISION / REAL",
      "CREATE TABLE ${flyway:defaultSchema}.Foo (A FLOAT NULL, B FLOAT(53) NULL, C FLOAT(24) NULL);",
      must_contain=['"A" DOUBLE PRECISION', '"B" DOUBLE PRECISION', '"C" REAL'],
      must_not_contain=['"A" REAL', "FLOAT(53)", "FLOAT(24)"])

# --- Datetime types are tz-aware (match oracle `timestamp with time zone`) ----
check("DATETIME/DATETIME2/SMALLDATETIME → TIMESTAMPTZ",
      "CREATE TABLE ${flyway:defaultSchema}.Foo (A DATETIME NULL, B DATETIME2 NULL, C SMALLDATETIME NULL, D DATETIMEOFFSET NULL);",
      must_contain=['"A" TIMESTAMPTZ', '"B" TIMESTAMPTZ', '"C" TIMESTAMPTZ', '"D" TIMESTAMPTZ'],
      must_not_contain=["TIMESTAMP NULL", "TIMESTAMP,", "TIMESTAMP)"])

# --- USER_NAME() in a DEFAULT → CURRENT_USER (else CREATE TABLE fails + cascades) --
check("USER_NAME()/SUSER_NAME() in column default → CURRENT_USER",
      "CREATE TABLE ${flyway:defaultSchema}.ConversationDetail (Role NVARCHAR(20) NOT NULL DEFAULT (USER_NAME()), Owner NVARCHAR(20) NULL DEFAULT (SUSER_NAME()));",
      must_contain=["DEFAULT (CURRENT_USER)"],
      must_not_contain=["USER_NAME(", "SUSER_NAME("])

# --- boolean = integer CHECK (type-aware) ------------------------------------
check("BIT column CHECK = 1/0 → = TRUE/FALSE; integer column untouched; paren-wrapped",
      "CREATE TABLE ${flyway:defaultSchema}.Foo (IsActive BIT NOT NULL, Priority INT NOT NULL, "
      "CONSTRAINT CK_a CHECK (IsActive = (1)), CONSTRAINT CK_p CHECK (Priority = 1));",
      must_contain=['CHECK ("IsActive" = TRUE)', 'CHECK ("Priority" = 1)'],
      must_not_contain=['"IsActive" = 1', '"IsActive" = (1)'])

check("boolean CHECK in SEPARATE ALTER resolves via file-level BIT registry",
      "CREATE TABLE ${flyway:defaultSchema}.AIAgent (EnableContextCompression BIT NOT NULL);\nGO\n"
      "ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD CONSTRAINT CK_x CHECK (EnableContextCompression = (0));",
      must_contain=['CHECK ("EnableContextCompression" = FALSE)'],
      must_not_contain=['= (0)', '= 0)'])

check("SET NOCOUNT/XACT_ABORT/QUOTED_IDENTIFIER batch-control dropped",
      "SET NOCOUNT ON;\nSET XACT_ABORT ON;\nSET QUOTED_IDENTIFIER ON;\nCREATE TABLE ${flyway:defaultSchema}.Foo (ID UNIQUEIDENTIFIER NOT NULL);",
      must_contain=['CREATE TABLE'],
      must_not_contain=["NOCOUNT", "XACT_ABORT", "QUOTED_IDENTIFIER"])

# --- string concat 'a' + col → 'a' || col ------------------------------------
check("string concat + → || (numeric + untouched)",
      "UPDATE ${flyway:defaultSchema}.Entity SET Name = 'MJ: ' + Name WHERE Seq = Seq + 1;",
      must_contain=["'MJ: ' || ", '"Seq" + 1'],
      must_not_contain=["'MJ: ' + "])

# --- table-level ISJSON CHECK dropped (column-level already covered) ---------
check("table-level ISJSON CHECK dropped; sibling constraint kept",
      "CREATE TABLE ${flyway:defaultSchema}.Foo (Data NVARCHAR(MAX) NULL, X INT NULL, "
      "CONSTRAINT CK_json CHECK (ISJSON(Data) > 0), CONSTRAINT CK_x CHECK (X > 0));",
      must_contain=['CONSTRAINT "CK_x" CHECK'],
      must_not_contain=["ISJSON", "CK_json"])

check("ALTER ADD with only an ISJSON CHECK → whole ALTER dropped",
      "ALTER TABLE ${flyway:defaultSchema}.Foo ADD CONSTRAINT CK_json CHECK (ISJSON(Data) > 0);",
      must_contain=[],
      must_not_contain=["ISJSON", "ALTER TABLE"])

# --- Procedural T-SQL glue is reported as unhandled, never emitted as $v SQL --
check("DECLARE / SELECT @v= / IF @v EXEC dropped to unhandled (real DDL kept)",
      "ALTER TABLE ${flyway:defaultSchema}.AIAgentRequest ADD CONSTRAINT CK_S CHECK (Status IN ('A','B'));\n"
      "DECLARE @ConstraintName AS VARCHAR(200);\n"
      "SELECT @ConstraintName = cc.CONSTRAINT_NAME FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc WHERE cc.x = 1;\n"
      "IF @ConstraintName IS NOT NULL EXEC('ALTER TABLE y DROP CONSTRAINT ' + @ConstraintName);",
      must_contain=['ADD CONSTRAINT "CK_S" CHECK'],
      must_not_contain=["$ConstraintName", "DECLARE", "@ConstraintName", "EXEC("],
      expect_unhandled=3)

# --- Transform 1: sp_addextendedproperty → COMMENT ON -----------------------
check("sp_addextendedproperty COLUMN → COMMENT ON COLUMN",
      """EXEC sp_addextendedproperty
           @name = N'MS_Description', @value = N'A short preview (it''s safe)',
           @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
           @level1type = N'TABLE',  @level1name = N'APIKey',
           @level2type = N'COLUMN', @level2name = N'KeyPrefix';""",
      must_contain=['COMMENT ON COLUMN ${flyway:defaultSchema}."APIKey"."KeyPrefix" IS', "it''s safe"],
      must_not_contain=["sp_addextendedproperty", "@value"])

check("sp_addextendedproperty TABLE-level → COMMENT ON TABLE",
      """EXEC sp_addextendedproperty
           @name=N'MS_Description', @value=N'A table',
           @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
           @level1type=N'TABLE', @level1name=N'Widget';""",
      must_contain=['COMMENT ON TABLE ${flyway:defaultSchema}."Widget" IS'],
      must_not_contain=["sp_addextendedproperty"])

# --- Envelope boundary: semicolon INSIDE an sp_addextendedproperty value -----
# A `;` in the description must NOT terminate the envelope early (else it cuts the
# statement and corrupts every later gap boundary, dropping real DDL like the table after).
check("sp_addextendedproperty with ';' in the value doesn't break following DDL",
      "EXEC sp_addextendedproperty @name=N'MS_Description', "
      "@value=N'Applies to all apps; when set, scoped to one.', "
      "@level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', "
      "@level1type=N'TABLE', @level1name=N'Foo', @level2type=N'COLUMN', @level2name=N'Bar';\n"
      "CREATE TABLE ${flyway:defaultSchema}.AfterComment (ID UNIQUEIDENTIFIER NOT NULL);",
      must_contain=['COMMENT ON COLUMN', 'Applies to all apps; when set, scoped to one.',
                    'CREATE TABLE ${flyway:defaultSchema}."AfterComment"'],
      must_not_contain=["sp_addextendedproperty"])

# --- Transform 2: IF [NOT] EXISTS(...) BEGIN ... END → DO block --------------
check("idempotent IF NOT EXISTS BEGIN INSERT END → DO block (non-metadata table)",
      """IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Widget WHERE ID = 'abc')
         BEGIN
            INSERT INTO ${flyway:defaultSchema}.Widget (ID, Name) VALUES ('abc', 'KeyPrefix');
         END""",
      must_contain=["DO $$", "IF NOT EXISTS (", "THEN", "END IF;", "END $$;",
                    'INSERT INTO ${flyway:defaultSchema}."Widget"', '"ID"', '"Name"'],
      must_not_contain=["BEGIN\n    INSERT", "sp_addext"])

check("entity-metadata seed (EntityField) is KEPT + transpiled to an idempotent DO block (PG CodeGen does not recreate entity metadata)",
      """IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'abc')
         BEGIN
            INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [Name]) VALUES ('abc', 'X');
         END""",
      must_contain=['DO $$', 'INSERT INTO ${flyway:defaultSchema}."EntityField"', "VALUES ('abc', 'X')"],
      must_not_contain=["[EntityField]"])

# --- Transform: standalone DEFAULT constraint → ALTER COLUMN SET DEFAULT ------
# sqlglot can't parse `ADD CONSTRAINT … DEFAULT (…) FOR [col]`; these carry ~all of
# MJ's column defaults. Must emit PG `ALTER COLUMN … SET DEFAULT`, converting the expr.
check("standalone newsequentialid() default → ALTER COLUMN SET DEFAULT gen_random_uuid()",
      "ALTER TABLE [${flyway:defaultSchema}].[ApplicationEntity] ADD CONSTRAINT [DF_AE_ID] DEFAULT (newsequentialid()) FOR [ID];",
      must_contain=['ALTER TABLE ${flyway:defaultSchema}."ApplicationEntity" ALTER COLUMN "ID" SET DEFAULT GEN_RANDOM_UUID()'],
      must_not_contain=["ADD CONSTRAINT", "newsequentialid", "FOR ["])

check("standalone getutcdate() default → SET DEFAULT NOW()",
      "ALTER TABLE [__mj].[RowLevelSecurityFilter] ADD CONSTRAINT [DF_x] DEFAULT (getutcdate()) FOR [__mj_CreatedAt];",
      must_contain=['ALTER TABLE "__mj"."RowLevelSecurityFilter" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW()'],
      must_not_contain=["ADD CONSTRAINT", "getutcdate", "FOR ["])

check("standalone BIT default ((1))/((0)) → TRUE/FALSE via bit registry; non-bit numeric kept",
      "CREATE TABLE ${flyway:defaultSchema}.ApplicationEntity (DefaultForNewUser BIT NOT NULL, Sequence INT NOT NULL);\nGO\n"
      "ALTER TABLE [${flyway:defaultSchema}].[ApplicationEntity] ADD CONSTRAINT [DF_d] DEFAULT ((1)) FOR [DefaultForNewUser];\n"
      "ALTER TABLE [${flyway:defaultSchema}].[ApplicationEntity] ADD CONSTRAINT [DF_s] DEFAULT ((0)) FOR [Sequence];",
      must_contain=['ALTER COLUMN "DefaultForNewUser" SET DEFAULT TRUE',
                    'ALTER COLUMN "Sequence" SET DEFAULT 0'],
      must_not_contain=["ADD CONSTRAINT", "DEFAULT ((1))", "SET DEFAULT 1"])

check("standalone string default preserved",
      "ALTER TABLE [__mj].[Foo] ADD CONSTRAINT [DF_st] DEFAULT (N'Active') FOR [Status];",
      must_contain=['ALTER COLUMN "Status" SET DEFAULT \'Active\''],
      must_not_contain=["ADD CONSTRAINT", "N'Active'"])

# --- Transform: ALTER COLUMN type/nullability change → PG TYPE + SET/DROP NOT NULL --
check("ALTER COLUMN type + NOT NULL → TYPE change + SET NOT NULL",
      "ALTER TABLE [__mj].[Foo] ALTER COLUMN [Name] NVARCHAR(200) NOT NULL;",
      must_contain=['ALTER TABLE "__mj"."Foo" ALTER COLUMN "Name" TYPE VARCHAR(200)',
                    'ALTER COLUMN "Name" SET NOT NULL'],
      must_not_contain=["ALTER COLUMN [Name]", "NVARCHAR", "DROP NOT NULL"])

check("ALTER COLUMN NVARCHAR(MAX) NULL → TYPE TEXT + DROP NOT NULL; flyway macro kept",
      "ALTER TABLE [${flyway:defaultSchema}].[Bar] ALTER COLUMN [Note] NVARCHAR(MAX) NULL;",
      must_contain=['ALTER TABLE ${flyway:defaultSchema}."Bar" ALTER COLUMN "Note" TYPE TEXT',
                    'ALTER COLUMN "Note" DROP NOT NULL'],
      must_not_contain=["NVARCHAR", "SET NOT NULL", "__mj_flyway"])

check("ALTER COLUMN with a leading comment (own GO batch) still transpiles",
      "-- Phase 4 — Email becomes optional.\n"
      "ALTER TABLE ${flyway:defaultSchema}.MagicLinkInvite ALTER COLUMN Email NVARCHAR(255) NULL;",
      must_contain=['ALTER TABLE ${flyway:defaultSchema}."MagicLinkInvite" ALTER COLUMN "Email" TYPE VARCHAR(255)',
                    'DROP NOT NULL'],
      must_not_contain=["NVARCHAR", "Phase 4"])

# --- Transform: sp_dropextendedproperty → COMMENT ON … IS NULL ---------------
check("sp_dropextendedproperty COLUMN → COMMENT ON COLUMN … IS NULL",
      "EXEC sp_dropextendedproperty @name=N'MS_Description', "
      "@level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', "
      "@level1type=N'TABLE', @level1name=N'Foo', @level2type=N'COLUMN', @level2name=N'Bar';",
      must_contain=['COMMENT ON COLUMN ${flyway:defaultSchema}."Foo"."Bar" IS NULL'],
      must_not_contain=["sp_dropextendedproperty", "EXEC"])

check("sp_dropextendedproperty TABLE-level → COMMENT ON TABLE … IS NULL",
      "EXEC sp_dropextendedproperty @name=N'MS_Description', "
      "@level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', "
      "@level1type=N'TABLE', @level1name=N'Widget';",
      must_contain=['COMMENT ON TABLE ${flyway:defaultSchema}."Widget" IS NULL'],
      must_not_contain=["sp_dropextendedproperty"])

# --- GO batches + mixed envelope ordering -----------------------------------
check("GO batches: DDL + comment + idempotent insert, all clean, order preserved",
      """ALTER TABLE ${flyway:defaultSchema}.APIKey ADD KeyPrefix NVARCHAR(20) NULL;
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'x',
  @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
  @level1type=N'TABLE', @level1name=N'APIKey', @level2type=N'COLUMN', @level2name=N'KeyPrefix';
GO""",
      must_contain=["ADD COLUMN", "COMMENT ON COLUMN"],
      must_not_contain=["GO", "sp_addextendedproperty"])

# --- extended-property drop guard (SQL-Server-only) -------------------------
# IF EXISTS(sys.extended_properties …) BEGIN sp_dropextendedproperty END → dropped;
# the re-add that follows still emits its COMMENT ON. (Magic_Link TokenHash case.)
check("IF EXISTS(sys.extended_properties) BEGIN sp_dropextendedproperty END guard → dropped; re-add kept",
      """IF EXISTS (SELECT 1 FROM sys.extended_properties
           WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.MagicLinkInvite')
           AND name = 'MS_Description')
BEGIN
    EXEC sp_dropextendedproperty @name=N'MS_Description',
        @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
        @level1type=N'TABLE', @level1name=N'MagicLinkInvite',
        @level2type=N'COLUMN', @level2name=N'TokenHash';
END;
GO
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'base64url hash',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'MagicLinkInvite', @level2type=N'COLUMN', @level2name=N'TokenHash';
GO""",
      must_contain=['COMMENT ON COLUMN ${flyway:defaultSchema}."MagicLinkInvite"."TokenHash" IS \'base64url hash\''],
      must_not_contain=["sys.extended_properties", "sp_dropextendedproperty", "DO $$"])

# --- data-DML: UPDATE…FROM self-alias + ISJSON + JSON_VALUE (Backfill_UserView) ----
check("UPDATE alias…FROM target alias JOIN → PG UPDATE target AS alias…FROM other; ISJSON→IS JSON; JSON_VALUE→jsonb ->>",
      """UPDATE uv SET uv.ViewTypeID = vt.ID
  FROM ${flyway:defaultSchema}.UserView AS uv
  INNER JOIN ${flyway:defaultSchema}.ViewType AS vt ON vt.Name = JSON_VALUE(uv.DisplayState, '$.defaultMode')
 WHERE uv.ViewTypeID IS NULL AND ISJSON(uv.DisplayState) = 1;""",
      must_contain=[
          'UPDATE ${flyway:defaultSchema}."UserView" AS "uv"',
          'SET "ViewTypeID" = "vt"."ID"',
          'FROM ${flyway:defaultSchema}."ViewType" AS "vt"',
          '("uv"."DisplayState")::jsonb ->> \'defaultMode\'',
          '"uv"."DisplayState" IS JSON',
      ],
      # NB: don't assert absence of 'ISJSON' here — whitespace-insensitive matching
      # collapses the legitimate 'IS JSON' predicate to 'ISJSON'. The IS-JSON must_contain
      # above already proves the rewrite.
      must_not_contain=['JSON_EXTRACT_PATH_TEXT', 'UPDATE "uv" SET', 'SET "uv"."ViewTypeID"'])

check("flyway macro inside a string literal (Entity.SchemaName seed) is restored, not left as the sentinel",
      "INSERT INTO ${flyway:defaultSchema}.[Entity] ([Name], [SchemaName]) "
      "VALUES ('MJ: Magic Link Invites', '${flyway:defaultSchema}');",
      must_contain=[
          'INSERT INTO ${flyway:defaultSchema}."Entity"',
          "VALUES ('MJ: Magic Link Invites', '${flyway:defaultSchema}')",
      ],
      must_not_contain=['__mj_flyway_default_schema__'])

check("flyway macro as a schema qualifier embedded in a stored predicate string is restored",
      "INSERT INTO ${flyway:defaultSchema}.[RowLevelSecurityFilter] ([FilterText]) "
      "VALUES ('RoleID IN (SELECT RoleID FROM ${flyway:defaultSchema}.vwUserRoles "
      "WHERE UserID = ''{{UserID}}'')');",
      must_contain=['FROM ${flyway:defaultSchema}.vwUserRoles'],
      must_not_contain=['__mj_flyway_default_schema__'])

check("flyway sentinel never leaks into a trailing comment either (final safety net)",
      "ALTER TABLE ${flyway:defaultSchema}.[MagicLinkInviteApplication] "
      "ADD [__mj_CreatedAt] DATETIMEOFFSET NULL "
      "/* SQL text to add special date field __mj_CreatedAt to entity "
      "${flyway:defaultSchema}.MagicLinkInviteApplication */;",
      must_not_contain=['__mj_flyway_default_schema__'])

# --- extprop batches must not drop sibling statements (no pure-comment shortcut) ---
check("CREATE INDEX sharing a batch with an extprop is kept, both emitted",
      "CREATE INDEX IDX_Foo_Bar ON [${flyway:defaultSchema}].[Foo] ([Bar]);\n"
      "EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'x', "
      "@level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', "
      "@level1type=N'TABLE', @level1name=N'Foo', @level2type=N'COLUMN', @level2name=N'Bar';",
      must_contain=['CREATE INDEX "IDX_Foo_Bar"',
                    'COMMENT ON COLUMN ${flyway:defaultSchema}."Foo"."Bar"'],
      must_not_contain=["sp_addextendedproperty"])

check("baseline TRY/CATCH extprop wrapper → only the COMMENT ON; plumbing dropped, not unhandled",
      "BEGIN TRY\n"
      "\tEXEC sp_addextendedproperty N'MS_Description', N'Active flag.', 'SCHEMA', N'__mj', "
      "'TABLE', N'AIAction', 'COLUMN', N'IsActive'\n"
      "END TRY\n"
      "BEGIN CATCH\n"
      "\tDECLARE @msg nvarchar(max);\n"
      "\tDECLARE @severity int;\n"
      "\tDECLARE @state int;\n"
      "\tSELECT @msg = ERROR_MESSAGE(), @severity = ERROR_SEVERITY(), @state = ERROR_STATE();\n"
      "\tRAISERROR(@msg, @severity, @state);\n"
      "\n"
      "\tSET NOEXEC ON\n"
      "END CATCH",
      must_contain=['COMMENT ON COLUMN __mj."AIAction"."IsActive" IS \'Active flag.\''],
      must_not_contain=["DECLARE", "RAISERROR", "ERROR_MESSAGE", "BEGIN CATCH"])

# --- IF body mixing a real statement with an extprop keeps BOTH ---------------
check("guarded INSERT + extprop in one IF body → DO block with INSERT and COMMENT ON",
      "IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Widget WHERE ID = 'abc')\n"
      "BEGIN\n"
      "    INSERT INTO ${flyway:defaultSchema}.Widget (ID, Name) VALUES ('abc', 'X');\n"
      "    EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'w', "
      "@level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', "
      "@level1type=N'TABLE', @level1name=N'Widget';\n"
      "END",
      must_contain=["DO $$", 'INSERT INTO ${flyway:defaultSchema}."Widget"',
                    'COMMENT ON TABLE ${flyway:defaultSchema}."Widget" IS \'w\''],
      must_not_contain=["sp_addextendedproperty"])

# --- UPDATE…FROM join semantics ------------------------------------------------
check("UPDATE…FROM LEFT JOIN anti-join → unhandled (inner-join rewrite would update 0 rows)",
      "UPDATE t SET t.Flag = 1 FROM ${flyway:defaultSchema}.Target AS t "
      "LEFT JOIN ${flyway:defaultSchema}.Other o ON o.TargetID = t.ID WHERE o.ID IS NULL;",
      must_not_contain=["UPDATE"],
      expect_unhandled=1)

check("UPDATE…FROM with two INNER joins: extra join's ON moves to WHERE once (not duplicated)",
      "UPDATE uv SET uv.X = b.Y FROM ${flyway:defaultSchema}.UserView AS uv "
      "INNER JOIN ${flyway:defaultSchema}.A a ON a.ID = uv.AID "
      "INNER JOIN ${flyway:defaultSchema}.B b ON b.ID = a.BID "
      "WHERE uv.X IS NULL;",
      must_contain=['UPDATE ${flyway:defaultSchema}."UserView" AS "uv"',
                    'CROSS JOIN ${flyway:defaultSchema}."B" AS "b"',
                    '"b"."ID" = "a"."BID"'],
      must_not_contain=['AS "b" ON'])

# --- ALTER COLUMN atomic-type changes ------------------------------------------
check("ALTER COLUMN INT→BIGINT widening emits the TYPE change, not just nullability",
      "ALTER TABLE [__mj].[Foo] ALTER COLUMN [Counter] BIGINT NOT NULL;",
      must_contain=['ALTER TABLE "__mj"."Foo" ALTER COLUMN "Counter" TYPE BIGINT',
                    'ALTER COLUMN "Counter" SET NOT NULL', "DO $$"],
      must_not_contain=["DROP NOT NULL"])

check("ALTER COLUMN with no nullability spec → DROP NOT NULL (T-SQL default is NULLable)",
      "ALTER TABLE [__mj].[Foo] ALTER COLUMN [Counter] BIGINT;",
      must_contain=['ALTER COLUMN "Counter" TYPE BIGINT',
                    'ALTER COLUMN "Counter" DROP NOT NULL'],
      must_not_contain=["SET NOT NULL"])

# --- procedural leak filter covers INSERT/DELETE with @variables ----------------
check("INSERT with a T-SQL @variable → unhandled, no $var SQL emitted",
      "INSERT INTO ${flyway:defaultSchema}.Widget (ID, Name) VALUES (@ID, 'X');",
      must_not_contain=["$ID", "INSERT"],
      expect_unhandled=1)

check("DELETE with a T-SQL @variable → unhandled, no $var SQL emitted",
      "DELETE FROM ${flyway:defaultSchema}.Widget WHERE ID = @ID;",
      must_not_contain=["$ID", "DELETE"],
      expect_unhandled=1)

# --- extprop terminator optional at chunk boundaries ----------------------------
check("extprop as the last statement with no trailing semicolon still emits its COMMENT ON",
      "ALTER TABLE ${flyway:defaultSchema}.Foo ADD Bar INT NULL;\n"
      "EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'tail', "
      "@level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', "
      "@level1type=N'TABLE', @level1name=N'Foo', @level2type=N'COLUMN', @level2name=N'Bar'",
      must_contain=['ADD COLUMN "Bar" INT',
                    'COMMENT ON COLUMN ${flyway:defaultSchema}."Foo"."Bar" IS \'tail\''],
      must_not_contain=["sp_addextendedproperty"])

# --- intentional codegen-object extprop skips are NOT unhandled -----------------
check("codegen-object extprop (vw*) in a mixed batch: skipped silently, not unhandled",
      "ALTER TABLE ${flyway:defaultSchema}.Foo ADD Bar INT NULL;\n"
      "EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'v', "
      "@level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', "
      "@level1type=N'TABLE', @level1name=N'vwFooViews';",
      must_contain=['ADD COLUMN "Bar" INT'],
      must_not_contain=["COMMENT ON", "vwFooViews"])

# --- MONEY/SMALLMONEY mapping ----------------------------------------------------
check("MONEY/SMALLMONEY → DECIMAL(19,4)/DECIMAL(10,4)",
      "CREATE TABLE ${flyway:defaultSchema}.Invoice (Amount MONEY NOT NULL, Tip SMALLMONEY NULL);",
      must_contain=['"Amount" DECIMAL(19, 4)', '"Tip" DECIMAL(10, 4)'],
      must_not_contain=["MONEY"])

# --- BIT registry survives a poison statement in the same batch -------------------
check("poison statement doesn't wipe BIT registration for other tables in its batch",
      "SELECT FROM FROM;\n"
      "CREATE TABLE ${flyway:defaultSchema}.PoisonMate (IsCool BIT NOT NULL);\n"
      "GO\n"
      "ALTER TABLE ${flyway:defaultSchema}.PoisonMate ADD CONSTRAINT CK_pc CHECK (IsCool = (1));",
      must_contain=['CHECK ("IsCool" = TRUE)'],
      must_not_contain=['= (1)'],
      expect_unhandled=1)

# --- sys.* / OBJECT_ID() guard conditions ------------------------------------------
check("sys.columns existence guard → information_schema.columns (no sys.* emitted)",
      "IF NOT EXISTS (SELECT 1 FROM sys.columns "
      "WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.Foo') AND name = 'Bar')\n"
      "BEGIN\n"
      "    ALTER TABLE ${flyway:defaultSchema}.Foo ADD Bar INT NULL;\n"
      "END",
      must_contain=["DO $$", "NOT EXISTS (SELECT 1 FROM information_schema.columns",
                    "table_schema = '${flyway:defaultSchema}'", "table_name = 'Foo'",
                    "column_name = 'Bar'", 'ADD COLUMN "Bar" INT'],
      must_not_contain=["sys.", "OBJECT_ID"])

check("sys.objects user-table existence guard → to_regclass",
      "IF NOT EXISTS (SELECT * FROM sys.objects "
      "WHERE object_id = OBJECT_ID(N'${flyway:defaultSchema}.Widget') AND type = N'U')\n"
      "BEGIN\n"
      "    CREATE TABLE ${flyway:defaultSchema}.Widget (ID INT NOT NULL);\n"
      "END",
      must_contain=["to_regclass('${flyway:defaultSchema}.\"Widget\"') IS NULL",
                    'CREATE TABLE ${flyway:defaultSchema}."Widget"'],
      must_not_contain=["sys.", "OBJECT_ID"])

check("sys.indexes guard → pg_indexes",
      "IF NOT EXISTS (SELECT 1 FROM sys.indexes "
      "WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID' "
      "AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]'))\n"
      "BEGIN\n"
      "    CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);\n"
      "END",
      must_contain=["pg_indexes", "schemaname = '${flyway:defaultSchema}'",
                    "tablename = 'Entity'", "indexname = 'IDX_AUTO_MJ_FKEY_Entity_ParentID'",
                    "CREATE INDEX"],
      must_not_contain=["sys.", "OBJECT_ID"])

check("unrecognized sys.* guard → whole IF routed to unhandled, sys.* never emitted",
      "IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_x')\n"
      "BEGIN\n"
      "    ALTER TABLE ${flyway:defaultSchema}.Foo DROP CONSTRAINT FK_x;\n"
      "END",
      must_not_contain=["sys.", "DO $$", "DROP CONSTRAINT"],
      expect_unhandled=1)

# --- IF…BEGIN body scanner: CASE…END and in-string END don't truncate the block -----
check("CASE…END (and 'END' in a literal) inside a guarded UPDATE; same-batch DDL after survives",
      "IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Widget WHERE ID = 'a')\n"
      "BEGIN\n"
      "    UPDATE ${flyway:defaultSchema}.Widget "
      "SET Status = CASE WHEN Score > 5 THEN 'High' ELSE 'Low' END, Name = 'THE END';\n"
      "END\n"
      "CREATE TABLE ${flyway:defaultSchema}.AfterBlock (ID UNIQUEIDENTIFIER NOT NULL);",
      must_contain=["DO $$", "CASE WHEN", "'High'", "'THE END'", "END IF;",
                    'CREATE TABLE ${flyway:defaultSchema}."AfterBlock"'],
      must_not_contain=[])

# --- hand-written routines: report, never emit half-translated bodies ----------------
check("bare CREATE PROCEDURE → unhandled, no invalid '$x' PG emitted; same-batch DDL survives",
      "CREATE TABLE ${flyway:defaultSchema}.Job (ID UNIQUEIDENTIFIER NOT NULL);\n"
      "GO\n"
      "CREATE PROCEDURE ${flyway:defaultSchema}.spClaimJob @x INT AS BEGIN "
      "UPDATE ${flyway:defaultSchema}.Job SET LockToken = @x; END;",
      must_contain=['CREATE TABLE ${flyway:defaultSchema}."Job"'],
      must_not_contain=["CREATE PROCEDURE", "$x"],
      expect_unhandled=1)

check("bare CREATE FUNCTION → unhandled (T-SQL body is not transpilable)",
      "CREATE FUNCTION ${flyway:defaultSchema}.GetThing (@id UNIQUEIDENTIFIER) "
      "RETURNS NVARCHAR(100) AS BEGIN RETURN 'x'; END;",
      must_not_contain=["CREATE FUNCTION"],
      expect_unhandled=1)

if _failures:
    print(f"\n{_failures} test(s) FAILED")
    sys.exit(1)
print("\nall dialect tests passed")
