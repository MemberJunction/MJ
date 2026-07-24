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


def check(name, sql, must_contain=(), must_not_contain=(), expect_unhandled=0, extra_bit_cols=None):
    global _failures
    import os as _os, json as _json
    _prev = _os.environ.get("MJ_EXTRA_BIT_COLS")
    if extra_bit_cols is not None:
        _os.environ["MJ_EXTRA_BIT_COLS"] = _json.dumps(extra_bit_cols)
    try:
        r = mj_transpile(sql)
    finally:
        if extra_bit_cols is not None:
            if _prev is None:
                _os.environ.pop("MJ_EXTRA_BIT_COLS", None)
            else:
                _os.environ["MJ_EXTRA_BIT_COLS"] = _prev
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


def check_raw(name, sql, must_contain=(), must_not_contain=(), expect_unhandled=0):
    """Whitespace-SENSITIVE variant of check(). Needed where the assertion turns on exact
    spacing — e.g. verifying `/*` was broken to `/ *` inside a comment, which the
    whitespace-insensitive check() would collapse back to the same string."""
    global _failures
    r = mj_transpile(sql)
    joined = "\n".join(r["sql"])
    errs = []
    for s in must_contain:
        if s not in joined:
            errs.append(f"missing (raw) {s!r}")
    for s in must_not_contain:
        if s in joined:
            errs.append(f"should not contain (raw) {s!r}")
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

check("UPDATE SET + WHERE on BIT column → TRUE/FALSE via file-level registry; INT column untouched",
      "CREATE TABLE ${flyway:defaultSchema}.EntityField (IsNameField BIT NOT NULL, "
      "AutoUpdateIsNameField BIT NOT NULL, Sequence INT NOT NULL);\nGO\n"
      "UPDATE ${flyway:defaultSchema}.EntityField SET IsNameField = 1 "
      "WHERE AutoUpdateIsNameField = 1 AND Sequence = 1;\nGO\n"
      "UPDATE ${flyway:defaultSchema}.EntityField SET IsNameField = 0 WHERE AutoUpdateIsNameField = 0;",
      must_contain=['SET "IsNameField" = TRUE', '"AutoUpdateIsNameField" = TRUE',
                    'SET "IsNameField" = FALSE', '"AutoUpdateIsNameField" = FALSE',
                    '"Sequence" = 1'],
      must_not_contain=['"IsNameField" = 1', '"IsNameField" = 0',
                        '"AutoUpdateIsNameField" = 1', '"AutoUpdateIsNameField" = 0'])

check("DELETE WHERE on BIT column → TRUE/FALSE; integer column untouched",
      "CREATE TABLE ${flyway:defaultSchema}.Foo (IsActive BIT NOT NULL, Priority INT NOT NULL);\nGO\n"
      "DELETE FROM ${flyway:defaultSchema}.Foo WHERE IsActive = 0 AND Priority = 1;",
      must_contain=['"IsActive" = FALSE', '"Priority" = 1'],
      must_not_contain=['"IsActive" = 0'])

check("BIT column with <> / != → TRUE/FALSE (not just =); both operand orders",
      "CREATE TABLE ${flyway:defaultSchema}.Foo (IsActive BIT NOT NULL);\nGO\n"
      "UPDATE ${flyway:defaultSchema}.Foo SET IsActive = 1 WHERE IsActive <> 0;\nGO\n"
      "DELETE FROM ${flyway:defaultSchema}.Foo WHERE 1 <> IsActive;",
      must_contain=['"IsActive" <> FALSE', '"IsActive" = TRUE'],
      must_not_contain=['<> 0', '1 <>', '<> 1'])

check("BIT column IN (0, 1) → IN (FALSE, TRUE); integer column's IN untouched",
      "CREATE TABLE ${flyway:defaultSchema}.Foo (IsActive BIT NOT NULL, Priority INT NOT NULL);\nGO\n"
      "DELETE FROM ${flyway:defaultSchema}.Foo WHERE IsActive IN (0, 1) AND Priority IN (0, 1);",
      must_contain=['"IsActive" IN (FALSE, TRUE)', '"Priority" IN (0, 1)'],
      must_not_contain=['"IsActive" IN (0, 1)'])

check("cross-file BIT registry (MJ_EXTRA_BIT_COLS) coerces UPDATE to a table NOT declared in-file",
      "UPDATE ${flyway:defaultSchema}.EntityField SET IsNameField = 1 WHERE AutoUpdateIsNameField = 1;",
      must_contain=['SET "IsNameField" = TRUE', '"AutoUpdateIsNameField" = TRUE'],
      must_not_contain=['= 1'],
      extra_bit_cols=[["entityfield", "isnamefield"], ["entityfield", "autoupdateisnamefield"]])

# Residual self-check: a bool-vs-int shape the coercion pass does NOT model (CASE switch
# form, `CASE col WHEN 1`) must be surfaced as a gap, never emitted as `boolean = integer`.
check("unmodeled bool-vs-int shape is reported as a gap, not silently emitted",
      "CREATE TABLE ${flyway:defaultSchema}.Foo (IsActive BIT NOT NULL, Label NVARCHAR(10));\nGO\n"
      "UPDATE ${flyway:defaultSchema}.Foo SET Label = CASE IsActive WHEN 1 THEN 'y' ELSE 'n' END;",
      must_not_contain=['WHEN 1 THEN'],
      expect_unhandled=1)

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

# --- issue #3252 code review P2: align trg naming + account for empty extprop skips -------------
# The Python CodeGen-object convention (_CODEGEN_OBJECT_NAME) MUST match the TS classifier's
# CODEGEN_NAME, which dropped bare `trg` in RC2 (only trgUpdate/trgCreate/trgDelete are CodeGen).
# A HAND-written trigger (trgConversationDetail_AssignSequence) is NOT regenerated by CodeGen, so
# its extended property must NOT be skipped as a CodeGen object — it must emit a COMMENT ON, never
# vanish into no bucket the way a real CodeGen object's comment intentionally does.
check("hand-written trg* extended property emits COMMENT ON (bare trg is not a CodeGen convention)",
      "EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'assigns sequence per conversation', "
      "@level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', "
      "@level1type=N'TRIGGER', @level1name=N'trgConversationDetail_AssignSequence';",
      must_contain=["COMMENT ON", "trgConversationDetail_AssignSequence"],
      expect_unhandled=0)

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

# --- BLOCK-LESS IF guards (issue #3252 RC1): the v5.49 FK-index migration shape.
# `IF NOT EXISTS (...sys.indexes...) CREATE INDEX ...;` (no BEGIN/END) previously
# fell through to sqlglot, parsed as exp.IfBlock, and emitted a bare `;` with
# unhandled:[]. It must translate exactly like the BEGIN…END form. ------------------
check("block-less IF NOT EXISTS(sys.indexes) CREATE INDEX → pg_indexes DO block, no bare ;",
      "IF NOT EXISTS (\n"
      "    SELECT 1 FROM sys.indexes\n"
      "    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_ScheduledJobRunID'\n"
      "      AND object_id = OBJECT_ID('${flyway:defaultSchema}.CompanyIntegrationRun'))\n"
      "    CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_ScheduledJobRunID\n"
      "        ON ${flyway:defaultSchema}.CompanyIntegrationRun ([ScheduledJobRunID]);",
      must_contain=["DO $$", "pg_indexes", "schemaname = '${flyway:defaultSchema}'",
                    "tablename = 'CompanyIntegrationRun'",
                    "indexname = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_ScheduledJobRunID'",
                    "CREATE INDEX", "END IF;"],
      must_not_contain=["sys.", "OBJECT_ID"],
      expect_unhandled=0)

# Inline named DEFAULT constraint (issue #3252 RC3): T-SQL allows a name on a column
# default (`CONSTRAINT [DF_x] DEFAULT (75)`); PG does NOT — it is a `syntax error at or
# near "CONSTRAINT"`. The name must be stripped, leaving a bare (unnamed) DEFAULT.
check("inline named column DEFAULT → name stripped (PG has no named defaults)",
      "ALTER TABLE ${flyway:defaultSchema}.AIAgentType ADD "
      "CompactionTriggerPercent INT NOT NULL CONSTRAINT DF_AIAgentType_CompactionTriggerPercent DEFAULT (75);",
      must_contain=['ADD COLUMN "CompactionTriggerPercent" INT NOT NULL', "DEFAULT (75)"],
      must_not_contain=['CONSTRAINT "DF_AIAgentType_CompactionTriggerPercent" DEFAULT',
                        "DF_AIAgentType_CompactionTriggerPercent"],
      expect_unhandled=0)

# A named column CHECK constraint is valid PG and must NOT be stripped (only DEFAULT names go).
check("inline named CHECK constraint is preserved (only DEFAULT names are stripped)",
      "ALTER TABLE ${flyway:defaultSchema}.AIAgentType ADD "
      "Pct INT NOT NULL CONSTRAINT CK_AIAgentType_Pct CHECK (Pct BETWEEN 0 AND 100);",
      must_contain=['CONSTRAINT "CK_AIAgentType_Pct" CHECK'],
      must_not_contain=[],
      expect_unhandled=0)

# A block-less IF/ELSE is not modeled by the envelope (RC1 1a bails on ELSE); it must be
# REPORTED by the plain path's If/IfBlock guard, never emitted as an empty `;`.
check("block-less IF … ELSE → reported (If/IfBlock guard), not silently dropped",
      "IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Widget WHERE ID = 'a')\n"
      "    CREATE TABLE ${flyway:defaultSchema}.Widget (ID UNIQUEIDENTIFIER NOT NULL)\n"
      "ELSE\n"
      "    CREATE TABLE ${flyway:defaultSchema}.Other (ID UNIQUEIDENTIFIER NOT NULL);",
      must_not_contain=["sys."],
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


# --- Issue #3252 1d: drop accounting + SOFT reconciliation (never raises) --------------
# mj_transpile records every INTENTIONAL drop in result["dropped"] and self-checks
# parsed == emitted + unhandled + dropped, appending a soft ACCOUNTING-LEAK gap (never a
# raise) if a drop site was missed. These assert the result shape + the no-leak invariant.
def check_accounting(name, sql, expect_dropped_kinds=(), forbid_leak=True):
    global _failures
    r = mj_transpile(sql)
    errs = []
    if "dropped" not in r:
        errs.append("result has no 'dropped' key")
    else:
        kinds = [d["kind"] for d in r["dropped"]]
        for k in expect_dropped_kinds:
            if k not in kinds:
                errs.append(f"expected dropped kind {k!r}; got {kinds}")
    if forbid_leak:
        leaks = [u for u in r["unhandled"] if u["kind"] == "ACCOUNTING-LEAK"]
        if leaks:
            errs.append(f"unexpected ACCOUNTING-LEAK (a drop site is uninstrumented): {leaks}")
    if errs:
        _failures += 1
        print(f"FAIL {name}")
        for e in errs:
            print(f"     {e}")
    else:
        print(f"ok   {name}")


check_accounting("SET NOCOUNT batch noise is recorded as a drop (not silent, no leak)",
                 "SET NOCOUNT ON;\nCREATE TABLE ${flyway:defaultSchema}.T (ID UNIQUEIDENTIFIER NOT NULL);",
                 expect_dropped_kinds=["SET-NOISE"])

# A GENUINE CodeGen-object (vw*/spCreate*/…) extended-property skip is intentional, but must be
# ACCOUNTED — recorded as a drop, not vanished into no bucket. Otherwise a real drop could hide
# behind the "intentional skip" path with zero trace (issue #3252 code review P2).
check_accounting("CodeGen-object (vw*) extprop skip is recorded as a drop, not silently vanished",
                 "EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'a view', "
                 "@level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', "
                 "@level1type=N'VIEW', @level1name=N'vwCustomers';",
                 expect_dropped_kinds=["sp_addextendedproperty-codegen-skip"])

# The routine envelope (issue #3252 heavy smoke) absorbs a hand-routine WHOLE from raw text
# BEFORE parsing, so its body — including the closing `END` — is never split into dangling
# statements at all. A trailing poison statement in the same batch (forcing per-statement
# fallback for the GAP after the routine) must not disturb that containment: the routine is
# reported once, its body UPDATE never emits, the `END` never leaks as an `END;` COMMIT, and
# accounting still reconciles with zero drops and no leak. (Previously this input relied on a
# ROUTINE-END drop to stay balanced; the envelope makes that swallow path unnecessary here and
# — crucially — makes the outcome identical on pinned 27.18 and local 30.13.)
check("hand routine absorbed whole; trailing poison does not leak its body",
      "CREATE PROCEDURE ${flyway:defaultSchema}.p AS BEGIN "
      "UPDATE ${flyway:defaultSchema}.t SET a = 1; END;\nSELECT CAST(",
      must_not_contain=["UPDATE", "SET a = 1", "END;"],
      expect_unhandled=2)  # the whole routine + the poison SELECT CAST(
check_accounting("hand routine + trailing poison reconciles with zero drops and no leak",
                 "CREATE PROCEDURE ${flyway:defaultSchema}.p AS BEGIN "
                 "UPDATE ${flyway:defaultSchema}.t SET a = 1; END;\nSELECT CAST(")

# The real hand-written trigger from the v5.49 ledger (issue #3252 RC2) must NOT produce a
# false ACCOUNTING-LEAK — the exact regression BLOCKER-2 guards against (a leak would raise
# under the original hard-assert design and lose all artifacts).
with open(str(Path(__file__).parents[4] / "migrations" / "v5"
               / "V202607202110__v5.49.x__Fix_ConversationDetail_Sequence_Deadlock.sql")) as _f:
    _trg_sql = _f.read()
check_accounting("real hand trigger (Fix_ConversationDetail) reconciles with NO leak, NO raise",
                 _trg_sql)

check_accounting("plain DDL reconciles with zero drops and no leak",
                 "ALTER TABLE ${flyway:defaultSchema}.APIKey ADD KeyPrefix NVARCHAR(20) NULL;")


# --- Swallowed-rider guard (issue #3252 heavy smoke): sqlglot 30.x's whole-batch parse can
# absorb the statement FOLLOWING a block-less non-EXISTS IF into the IfBlock node — the
# unconditional ALTER then neither emits nor appears (visibly) in the gap report. The raw
# text has no BEGIN, so per-piece splitting restores true statement boundaries: the IF is
# reported alone and the rider ALTER emits. (27.18 already parses them separately.)
check("statement after a block-less IF @var guard still EMITS (not swallowed into the gap)",
      "DECLARE @C NVARCHAR(200);\n"
      "SELECT @C = cc.name FROM sys.check_constraints cc "
      "WHERE cc.parent_object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentNote');\n"
      "IF @C IS NOT NULL\n"
      "    EXEC('ALTER TABLE ${flyway:defaultSchema}.AIAgentNote DROP CONSTRAINT [' + @C + ']');\n"
      "ALTER TABLE ${flyway:defaultSchema}.AIAgentNote\n"
      "    ADD CONSTRAINT CK_AIAgentNote_Status CHECK (Status IN ('Active', 'Pending'));",
      must_contain=['ADD CONSTRAINT "CK_AIAgentNote_Status" CHECK'],
      expect_unhandled=3)  # DECLARE + SELECT @C + the IF guard — each reported separately

# --- Routine-interior envelope guard (issue #3252 heavy smoke): a block-less
# `IF NOT EXISTS (...) RETURN;` INSIDE a trigger/proc body must not be captured by the
# IF-EXISTS envelope — cutting a DO $$ fragment out of a routine that is simultaneously
# reported needs-hand misleads the human porter into thinking that part is handled.
check("IF EXISTS guard inside a routine body is NOT enveloped into a stray DO block",
      "CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trgConvDetail_Assign]\n"
      "ON [${flyway:defaultSchema}].[ConversationDetail]\n"
      "AFTER INSERT AS\n"
      "BEGIN\n"
      "    SET NOCOUNT ON;\n"
      "    IF NOT EXISTS (SELECT 1 FROM inserted)\n"
      "        RETURN;\n"
      "    UPDATE [${flyway:defaultSchema}].[ConversationDetail] SET [Sequence] = 1;\n"
      "END",
      must_not_contain=["DO $$"],
      expect_unhandled=1)  # the whole routine, reported once


# --- Never-emit-invalid-PG guards (issue #3252 heavy smoke): T-SQL constructs with no
# mechanical PG translation must be REPORTED (unhandled) rather than emitted as syntactically
# invalid PostgreSQL. Every case below was confirmed to emit invalid PG (pglast) on BOTH the
# committed pin (27.18) and local (30.13) before these guards landed.

# DROP PROC — the ONE real invalid-PG emission in the 201-file v5 ledger (V202605091143).
# sqlglot keeps the T-SQL `PROC` abbreviation, which PG rejects; must spell it PROCEDURE.
check("DROP PROC IF EXISTS is spelled out to DROP PROCEDURE (valid PG)",
      'DROP PROC IF EXISTS ${flyway:defaultSchema}."spUpdateExistingEntityFieldsFromSchema";',
      must_contain=['DROP PROCEDURE IF EXISTS'],
      must_not_contain=['DROP PROC IF'],  # ws-strips to DROPPROCIF, absent from DROPPROCEDURE…
      expect_unhandled=0)
check("bare DROP PROC is spelled out to DROP PROCEDURE",
      'DROP PROC ${flyway:defaultSchema}."spFoo";',
      must_contain=['DROP PROCEDURE'],
      must_not_contain=['DROP PROC "', 'DROP PROC $'],
      expect_unhandled=0)

# DROP TRIGGER — PG requires `DROP TRIGGER name ON table`; sqlglot (30.x) emits it without the
# ON clause (invalid), while 27.x parses it as an opaque Command (already unhandled). The guard
# converges both on a reported gap and never emits the ON-less form.
check("bare DROP TRIGGER is reported (never emitted ON-less)",
      'DROP TRIGGER ${flyway:defaultSchema}.trg_x;',
      must_not_contain=['DROP TRIGGER'],
      expect_unhandled=1)
check("DROP TRIGGER IF EXISTS is reported (never emitted ON-less)",
      'DROP TRIGGER IF EXISTS ${flyway:defaultSchema}.trg_x;',
      must_not_contain=['DROP TRIGGER'],
      expect_unhandled=1)
check_accounting("DROP TRIGGER reconciles with no leak", 'DROP TRIGGER ${flyway:defaultSchema}.trg_x;')

# DELETE TOP (n) — misparses on both versions into a spurious multi-table DELETE
# (`DELETE "TOP" AS _t0(n) FROM t`); no mechanical PG rewrite. Report it.
check("DELETE TOP is reported (never emitted as the misparsed garbage)",
      "DELETE TOP (10) FROM ${flyway:defaultSchema}.ErrorLog WHERE Severity = 'Info';",
      must_not_contain=['AS _t0', '"TOP"'],
      expect_unhandled=1)
check_accounting("DELETE TOP reconciles with no leak",
                 "DELETE TOP (10) FROM ${flyway:defaultSchema}.ErrorLog WHERE Severity = 'Info';")

# SET IDENTITY_INSERT — no PG equivalent (PG uses OVERRIDING SYSTEM VALUE per-INSERT). The
# `…OFF` form parses to exp.Set and would emit invalid `SET "IDENTITY_INSERT" = t AS "OFF"`;
# `…ON` already lands as an unhandled Command. Both must be reported.
check("SET IDENTITY_INSERT OFF is reported (never emitted as invalid SET assignment)",
      "SET IDENTITY_INSERT ${flyway:defaultSchema}.Seq OFF;",
      must_not_contain=['IDENTITY_INSERT'],
      expect_unhandled=1)
check("SET IDENTITY_INSERT ON is reported",
      "SET IDENTITY_INSERT ${flyway:defaultSchema}.Seq ON;",
      must_not_contain=['IDENTITY_INSERT'],
      expect_unhandled=1)

# Computed columns — T-SQL `col AS (expr) [PERSISTED]` emits `GENERATED ALWAYS AS (...) STORED`
# WITHOUT the required PG type (invalid), and a non-persisted computed column has no STORED
# equivalent anyway. Report the whole statement rather than emit the type-less generated column.
check("computed column in ALTER ADD is reported (never emits type-less GENERATED)",
      "ALTER TABLE ${flyway:defaultSchema}.Invoice ADD Total AS (Qty * Price) PERSISTED;",
      must_not_contain=['GENERATED ALWAYS'],
      expect_unhandled=1)
check("computed column in CREATE TABLE is reported (never emits type-less GENERATED)",
      "CREATE TABLE ${flyway:defaultSchema}.T (ID INT, Total AS (Qty * Price) PERSISTED);",
      must_not_contain=['GENERATED ALWAYS'],
      expect_unhandled=1)

# CREATE CLUSTERED INDEX — PG has no CLUSTERED/NONCLUSTERED qualifier on CREATE INDEX; sqlglot
# emits the keyword verbatim (invalid). Strip it to a plain CREATE INDEX. (The in-CREATE-TABLE
# and standalone ADD CONSTRAINT … CLUSTERED forms are already handled by sqlglot — see probe.)
check("CREATE CLUSTERED INDEX drops the CLUSTERED qualifier (valid PG)",
      'CREATE CLUSTERED INDEX IX_x ON ${flyway:defaultSchema}.T (c);',
      must_contain=['CREATE INDEX'],
      must_not_contain=['CLUSTERED'],
      expect_unhandled=0)
check("CREATE NONCLUSTERED INDEX drops the NONCLUSTERED qualifier (valid PG)",
      'CREATE NONCLUSTERED INDEX IX_y ON ${flyway:defaultSchema}.T (c);',
      must_contain=['CREATE INDEX'],
      must_not_contain=['NONCLUSTERED'],
      expect_unhandled=0)

# PK/UNIQUE with a CLUSTERED/NONCLUSTERED qualifier — PG has no such qualifier. sqlglot folds
# PK+CLUSTERED and UNIQUE+NONCLUSTERED cleanly, but the CROSS pairs (PK+NONCLUSTERED,
# UNIQUE+CLUSTERED) leak: PK+NONCLUSTERED emits the invalid `PRIMARY KEY, NONCLUSTERED (...)`
# (spurious comma) and UNIQUE+CLUSTERED keeps the CLUSTERED keyword. Both must fold to the plain
# constraint. (Synthetic-only — 0 real occurrences even in baselines — but must not emit bad PG.)
check("PK NONCLUSTERED in CREATE TABLE folds to plain PRIMARY KEY (valid PG)",
      "CREATE TABLE ${flyway:defaultSchema}.T (ID UNIQUEIDENTIFIER NOT NULL, CONSTRAINT PK_T PRIMARY KEY NONCLUSTERED (ID));",
      must_contain=['PRIMARY KEY ("ID")'],
      must_not_contain=['NONCLUSTERED', 'PRIMARY KEY,'],
      expect_unhandled=0)
check("PK NONCLUSTERED in ALTER ADD folds to plain PRIMARY KEY (valid PG)",
      "ALTER TABLE ${flyway:defaultSchema}.T ADD CONSTRAINT PK_T PRIMARY KEY NONCLUSTERED (ID);",
      must_contain=['PRIMARY KEY ("ID")'],
      must_not_contain=['NONCLUSTERED', 'PRIMARY KEY,'],
      expect_unhandled=0)
check("UNIQUE CLUSTERED in CREATE TABLE folds to plain UNIQUE (valid PG)",
      "CREATE TABLE ${flyway:defaultSchema}.T (ID UNIQUEIDENTIFIER NOT NULL, CONSTRAINT UQ_T UNIQUE CLUSTERED (ID));",
      must_contain=['UNIQUE ("ID")'],
      must_not_contain=['CLUSTERED'],
      expect_unhandled=0)
check("UNIQUE CLUSTERED in ALTER ADD folds to plain UNIQUE (valid PG)",
      "ALTER TABLE ${flyway:defaultSchema}.T ADD CONSTRAINT UQ_T UNIQUE CLUSTERED (ID);",
      must_contain=['UNIQUE ("ID")'],
      must_not_contain=['CLUSTERED'],
      expect_unhandled=0)

# WITH CHECK / WITH NOCHECK ADD CONSTRAINT — the SQL Server enforcement toggle has no PG form.
# `WITH CHECK` parses to an Alter that emits the invalid `… WITH CHECK ADD …`; `WITH NOCHECK`
# parses to an opaque Command (unhandled). The pre-parse strip unifies both to a plain,
# validating `ADD CONSTRAINT …` (safe: MJ CodeGen emits these only for fresh/consistent tables,
# e.g. the v5.39 Integration_Framework CHECK constraints on brand-new columns).
check("WITH CHECK ADD CONSTRAINT strips the toggle to a plain validating ADD (valid PG)",
      "ALTER TABLE ${flyway:defaultSchema}.T WITH CHECK ADD CONSTRAINT CK_x CHECK (c IN ('a','b'));",
      must_contain=['ADD CONSTRAINT "CK_x" CHECK'],
      must_not_contain=['WITH CHECK', 'WITH NOCHECK'],
      expect_unhandled=0)
check("WITH NOCHECK ADD CONSTRAINT strips the toggle to a plain validating ADD (valid PG)",
      "ALTER TABLE ${flyway:defaultSchema}.T WITH NOCHECK ADD CONSTRAINT CK_y CHECK (c IS NULL OR c IN ('a'));",
      must_contain=['ADD CONSTRAINT "CK_y" CHECK'],
      must_not_contain=['WITH NOCHECK', 'WITH CHECK'],
      expect_unhandled=0)
check_accounting("WITH NOCHECK ADD reconciles with no leak",
                 "ALTER TABLE ${flyway:defaultSchema}.T WITH NOCHECK ADD CONSTRAINT CK_y CHECK (c IN ('a'));")

# The pre-parse `WITH [NO]CHECK ADD` strip must be ATOM-AWARE: the phrase occurring INSIDE a string
# literal or a comment is data/prose, NOT the enforcement toggle — stripping it there silently
# rewrites emitted content (issue #3252: never silently alter output). Only a real ALTER statement's
# toggle is at a code position and gets rewritten.
check("WITH CHECK ADD inside a string DEFAULT literal is preserved verbatim (not stripped)",
      "CREATE TABLE ${flyway:defaultSchema}.T (Note NVARCHAR(200) NOT NULL "
      "DEFAULT N'run ALTER TABLE x WITH CHECK ADD CONSTRAINT c');",
      must_contain=["WITH CHECK ADD CONSTRAINT c"],
      expect_unhandled=0)
check("WITH CHECK ADD inside a comment is preserved (comment prose is not the toggle)",
      "-- remember to run WITH CHECK ADD on the FK later\n"
      "CREATE TABLE ${flyway:defaultSchema}.T2 (Id INT NOT NULL);",
      must_contain=["WITH CHECK ADD on the FK"],
      expect_unhandled=0)

# Multi-constraint `ALTER TABLE ... ADD` — T-SQL lets a single `ADD` govern a comma-separated
# constraint list; PG requires `ADD` before EACH action. sqlglot parses the list into ONE
# AddConstraint holding N constraints and emits one `ADD` + comma list (`ADD CONSTRAINT a ...,
# CONSTRAINT b ...`), which PG rejects with `syntax error at or near "CONSTRAINT"` — a SILENT
# invalid-emission (unhandled=0). Split into one ADD per constraint. (Real: v5.49 Compaction two
# CHECKs on AIAgentType; v5.24 KnowledgeHub CHECK + FK on Tag — both only exposed by whole-file
# validation. sqlglot already repeats ADD for multiple ADD COLUMN; only constraints leak.)
check("multi-CHECK ADD repeats ADD before each constraint (valid PG)",
      "ALTER TABLE ${flyway:defaultSchema}.AIAgentType "
      "ADD CONSTRAINT CK_A CHECK (TriggerPercent >= 1 AND TriggerPercent <= 100), "
      "CONSTRAINT CK_B CHECK (TargetPercent >= 1 AND TargetPercent <= 100);",
      must_contain=['ADD CONSTRAINT "CK_A" CHECK', 'ADD CONSTRAINT "CK_B" CHECK'],
      must_not_contain=[', CONSTRAINT "CK_B"'],
      expect_unhandled=0)
check("multi-constraint ADD mixing CHECK + FK repeats ADD (valid PG)",
      "ALTER TABLE ${flyway:defaultSchema}.Tag "
      "ADD CONSTRAINT CK_Tag_Status CHECK (Status IN ('Active','Merged')), "
      "CONSTRAINT FK_Tag_MergedIntoTag FOREIGN KEY (MergedIntoTagID) "
      "REFERENCES ${flyway:defaultSchema}.Tag(ID);",
      must_contain=['ADD CONSTRAINT "CK_Tag_Status" CHECK',
                    'ADD CONSTRAINT "FK_Tag_MergedIntoTag" FOREIGN KEY'],
      must_not_contain=[', CONSTRAINT "FK_Tag_MergedIntoTag"'],
      expect_unhandled=0)
check("single-constraint ADD is unaffected (still one ADD, valid PG)",
      "ALTER TABLE ${flyway:defaultSchema}.T ADD CONSTRAINT CK_only CHECK (x >= 1);",
      must_contain=['ADD CONSTRAINT "CK_only" CHECK'],
      expect_unhandled=0)
check_accounting("multi-constraint ADD reconciles with no leak",
                 "ALTER TABLE ${flyway:defaultSchema}.AIAgentType "
                 "ADD CONSTRAINT CK_A CHECK (a >= 1), CONSTRAINT CK_B CHECK (b >= 1);")

# Nested-comment sequences inside emitted block comments. sqlglot relocates `--` line comments
# into inline `/* ... */` block comments on AST nodes. PG block comments NEST, so a comment body
# containing `/*` (e.g. `image/*`) or `*/` opens/closes a nested comment → `unterminated /*
# comment`. sqlglot 30.x sanitizes this at emit (`image/ *`); the committed pin (27.18) emits it
# VERBATIM → invalid PG (version-skew!). Sanitize comment text so BOTH versions emit valid PG.
# (Real: v5.38 Backfill_Attachment_Artifacts, `image/*` in a wildcard-matching comment — pin-only,
# only surfaced by whole-file validation.) Raw (whitespace-sensitive) assertions: check() strips
# whitespace and would collapse `image/ *` back to `image/*`.
check_raw("nested /* in emitted block comment is broken to /space* (valid PG on pinned sqlglot)",
          "SELECT 1 AS x -- Wildcard (e.g. image/* matches image/jpeg)\n;",
          must_contain=["image/ *"],
          must_not_contain=["image/*"],
          expect_unhandled=0)
check_raw("nested */ in emitted block comment is broken to *space/ (valid PG on pinned sqlglot)",
          "SELECT 1 AS x -- ends with a close seq */ here\n;",
          must_not_contain=["*/ here"],
          expect_unhandled=0)


# --- IF-EXISTS envelope must not match inside a string literal (issue #3252 review, RC1/RC2
# regression). The block-less IF-EXISTS finder scans raw text for `IF [NOT] EXISTS (SELECT ...)`
# heads; before this fix it also matched heads that fall INSIDE a T-SQL string literal — e.g. a
# migration seeding an AI-prompt/template body or an example SQL snippet that mentions the phrase.
# That shattered the surrounding INSERT into parse-error gaps AND, when the literal held a full
# `IF EXISTS (...) <DML>;`, FABRICATED a live DO-block running that DML (a phantom `DELETE FROM y`
# emitted to a discoverable .pg.sql). On origin/next the INSERT converted cleanly. The head-scan
# is now atom-aware (skips string/comment spans), so a literal that merely contains the phrase is
# inert. must_not_contain uses the DO-block markers (not "DELETE FROM", which legitimately appears
# INSIDE the preserved string literal).
check("IF-EXISTS inside a string literal does not fabricate a DO-block (INSERT stays intact)",
      "INSERT INTO ${flyway:defaultSchema}.tmpl (Body) VALUES "
      "('IF EXISTS (SELECT 1 FROM x) DELETE FROM y;');",
      must_contain=['INSERT INTO ${flyway:defaultSchema}."tmpl"',
                    "IF EXISTS (SELECT 1 FROM x) DELETE FROM y;"],
      must_not_contain=["DO $$", "END IF", "THEN"],
      expect_unhandled=0)
check("IF-EXISTS phrase in prose template body leaves the INSERT intact (no gap shatter)",
      "INSERT INTO ${flyway:defaultSchema}.AIPrompt (ID, Name, Body) VALUES "
      "('a', 'P', 'Check IF EXISTS (SELECT 1 FROM Users WHERE X = 1) before running');",
      must_contain=['INSERT INTO ${flyway:defaultSchema}."AIPrompt"'],
      must_not_contain=["DO $$", "END IF"],
      expect_unhandled=0)
check_accounting("IF-EXISTS-in-literal INSERT reconciles with no leak, no drop",
                 "INSERT INTO ${flyway:defaultSchema}.tmpl (Body) VALUES "
                 "('IF EXISTS (SELECT 1 FROM x) DELETE FROM y;');")


# --- ISJSON CHECK drop is by FUNCTION CALL and PER-CONSTRAINT (issue #3252 review). PG has no
# ISJSON(), so a CHECK using it is dropped — but (a) the OLD substring match `"ISJSON" in sql`
# also nuked a CHECK on a column merely NAMED `IsJsonEnabled` or comparing to the literal
# 'ISJSON', and (b) a multi-constraint `ADD CONSTRAINT pk PRIMARY KEY (...), CONSTRAINT ck CHECK
# (ISJSON(...))` dropped the WHOLE AddConstraint — silently losing the sibling PK/FK. Both are
# silent structural losses (#3252 invariant #1). The fix detects the ISJSON *call* (exp.Anonymous)
# and filters individual constraints, keeping the PK/FK.
check("multi-constraint ADD with an ISJSON CHECK keeps the sibling PRIMARY KEY",
      "ALTER TABLE ${flyway:defaultSchema}.T "
      "ADD CONSTRAINT PK_T PRIMARY KEY NONCLUSTERED (ID), CONSTRAINT CK_j CHECK (ISJSON(D) = 1);",
      must_contain=['ADD CONSTRAINT "PK_T" PRIMARY KEY ("ID")'],
      must_not_contain=["ISJSON"],
      expect_unhandled=0)
check("multi-constraint ADD with an ISJSON CHECK keeps the sibling FOREIGN KEY",
      "ALTER TABLE ${flyway:defaultSchema}.T "
      "ADD CONSTRAINT FK_x FOREIGN KEY (PID) REFERENCES ${flyway:defaultSchema}.P(ID), "
      "CONSTRAINT CK_j CHECK (ISJSON(D) = 1);",
      must_contain=['ADD CONSTRAINT "FK_x" FOREIGN KEY ("PID") REFERENCES ${flyway:defaultSchema}."P" ("ID")'],
      must_not_contain=["ISJSON"],
      expect_unhandled=0)
check("CHECK on a column NAMED IsJsonEnabled is not an ISJSON call — preserved",
      "ALTER TABLE ${flyway:defaultSchema}.T ADD CONSTRAINT CK_Flag CHECK (IsJsonEnabled = 'yes');",
      must_contain=['ADD CONSTRAINT "CK_Flag" CHECK'],
      expect_unhandled=0)
check("CHECK comparing to the literal 'ISJSON' is not an ISJSON call — preserved",
      "ALTER TABLE ${flyway:defaultSchema}.T ADD CONSTRAINT CK_s CHECK (Kind IN ('ISJSON', 'OTHER'));",
      must_contain=['ADD CONSTRAINT "CK_s" CHECK'],
      expect_unhandled=0)
check_accounting("pure ISJSON CHECK is still dropped (ALTER left actionless), no leak",
                 "ALTER TABLE ${flyway:defaultSchema}.T ADD CONSTRAINT CK_j CHECK (ISJSON(D) = 1);",
                 expect_dropped_kinds=["ALTER-ACTIONLESS"])


# --- RAISERROR guard fast path must not swallow sibling statements (issue #3252 review). An
# IF-EXISTS guard whose body is ONLY RAISERROR (the common `BEGIN RAISERROR('conflict') END`
# migration guard) still becomes a single RAISE EXCEPTION. But a body that pairs RAISERROR with
# real statements (e.g. RAISERROR(...) then INSERT ...) cannot be modeled as one RAISE (which
# aborts) without SILENTLY dropping the siblings — the old fast path emitted only the RAISE and
# the INSERT vanished from every bucket. Report the whole guard as unhandled instead, so it is
# hand-authored and never silently lost.
check("RAISERROR-only guard still becomes a single RAISE EXCEPTION (fast path preserved)",
      "IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Conflict) "
      "BEGIN RAISERROR('conflict detected', 16, 1); END;",
      must_contain=["DO $$", "RAISE EXCEPTION 'conflict detected'"],
      expect_unhandled=0)
check("RAISERROR + sibling INSERT is reported unhandled, not silently dropped",
      "IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.cfg) "
      "BEGIN RAISERROR('missing cfg', 16, 1); INSERT INTO ${flyway:defaultSchema}.cfg (a) VALUES (1); END;",
      must_not_contain=["DO $$", "RAISE EXCEPTION"],
      expect_unhandled=1)
check_accounting("RAISERROR + sibling INSERT reconciles as an unhandled guard, no leak",
                 "IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.cfg) "
                 "BEGIN RAISERROR('missing cfg', 16, 1); INSERT INTO ${flyway:defaultSchema}.cfg (a) VALUES (1); END;")
# T-SQL makes the statement-terminating `;` optional, so a guard body routinely pairs RAISERROR
# with a semicolon-LESS sibling on the next line (`RAISERROR(...) \n UPDATE ...`). The sibling gate
# must catch that shape too — splitting on `;` alone treats the whole `RAISERROR(...) UPDATE ...`
# run as one RAISERROR-only piece and the UPDATE vanishes into no bucket (silent drop, #3252).
check("RAISERROR + semicolon-LESS sibling UPDATE is reported unhandled, not silently dropped",
      "IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.foo WHERE id = 1) "
      "BEGIN RAISERROR('conflict', 16, 1) UPDATE ${flyway:defaultSchema}.foo SET bar = 1 WHERE id = 2 END;",
      must_not_contain=["DO $$", "RAISE EXCEPTION"],
      expect_unhandled=1)
check_accounting("RAISERROR + semicolon-LESS sibling UPDATE reconciles, no leak",
                 "IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.foo WHERE id = 1) "
                 "BEGIN RAISERROR('conflict', 16, 1) UPDATE ${flyway:defaultSchema}.foo SET bar = 1 WHERE id = 2 END;")
# A semicolon-less trailing RETURN is NOT a real sibling: RAISE EXCEPTION already aborts, so the
# RETURN is moot. The RAISERROR-only fast path must survive a trailing RETURN (do not over-report).
check("RAISERROR + trailing RETURN (no semicolon) still fast-paths to a single RAISE EXCEPTION",
      "IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Conflict) "
      "BEGIN RAISERROR('conflict detected', 16, 1) RETURN END;",
      must_contain=["DO $$", "RAISE EXCEPTION 'conflict detected'"],
      expect_unhandled=0)
# The PRINT exemption must not become a HOLE (issue #3252 code review P1): T-SQL's optional `;`
# lets a REAL statement ride glued after a benign PRINT with no separator. A `;`-split hands the
# whole `RAISERROR(...) PRINT 'x' UPDATE ...` run in as ONE piece, and the old exemption skipped
# it whole the moment it saw PRINT — the trailing UPDATE vanished into no bucket (silent drop).
# The sibling gate must consume the PRINT and still SEE the UPDATE, reporting the guard unhandled.
check("RAISERROR + PRINT + semicolon-LESS UPDATE: the UPDATE is not swallowed by the PRINT exemption",
      "IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.foo WHERE id = 1) "
      "BEGIN RAISERROR('conflict', 16, 1) PRINT 'continuing' "
      "UPDATE ${flyway:defaultSchema}.foo SET bar = 1 WHERE id = 2 END;",
      must_not_contain=["DO $$", "RAISE EXCEPTION"],
      expect_unhandled=1)
check_accounting("RAISERROR + PRINT + semicolon-LESS UPDATE reconciles, no leak",
                 "IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.foo WHERE id = 1) "
                 "BEGIN RAISERROR('conflict', 16, 1) PRINT 'continuing' "
                 "UPDATE ${flyway:defaultSchema}.foo SET bar = 1 WHERE id = 2 END;")
# Guard against OVER-reporting the fix: a benign trailing PRINT with NO real sibling must still
# fast-path to a single RAISE EXCEPTION (the exemption is narrowed, not removed).
check("RAISERROR + trailing PRINT (no real sibling) still fast-paths to a single RAISE EXCEPTION",
      "IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Conflict) "
      "BEGIN RAISERROR('conflict detected', 16, 1) PRINT 'note' END;",
      must_contain=["DO $$", "RAISE EXCEPTION 'conflict detected'"],
      expect_unhandled=0)
# Strict "never silently drop" contract (issue #3252 code review 2): a guard body with TWO
# (semicolon-separated) RAISERRORs cannot collapse into a SINGLE RAISE EXCEPTION without dropping
# the second unaccounted — the `;`-split makes each RAISERROR its own lone-raiserror piece, so the
# old fast path emitted only the first and the second vanished into no bucket. A 2nd RAISERROR is a
# sibling: report the whole guard unhandled instead. (Real migration guards never pair two, but the
# fast path must still not silently lose one.)
check("double-RAISERROR guard is reported unhandled, not collapsed to a single RAISE (2nd not dropped)",
      "IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Foo) "
      "BEGIN RAISERROR('a fail', 16, 1); RAISERROR('b fail', 16, 1) END;",
      must_not_contain=["DO $$", "RAISE EXCEPTION"],
      expect_unhandled=1)
check_accounting("double-RAISERROR guard reconciles as one unhandled guard, no leak",
                 "IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Foo) "
                 "BEGIN RAISERROR('a fail', 16, 1); RAISERROR('b fail', 16, 1) END;")
# Semicolon-LESS double RAISERROR is caught by the same contract (already, via _has_real_stmt_starter
# seeing the 2nd RAISERROR after the first call) — pin it so it can't regress.
check("double-RAISERROR guard (semicolon-LESS) is also reported unhandled, not collapsed",
      "IF EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Foo) "
      "BEGIN RAISERROR('a fail', 16, 1) RAISERROR('b fail', 16, 1) END;",
      must_not_contain=["DO $$", "RAISE EXCEPTION"],
      expect_unhandled=1)


# --- Version-skew guard (issue #3252 review): every `exp.<Name>` the dialect references
# must exist in the RUNNING sqlglot. A bare attribute access on a node type the installed
# version lacks (e.g. exp.IfBlock, added in sqlglot 29.0.0, absent from the committed pin
# sqlglot~=27.18.0) raises AttributeError at runtime and crashes every conversion. Run this
# suite against `pip install -r requirements.txt` (CI does) and any such drift fails here
# by name instead of exploding mid-conversion.
def check_exp_attribute_references():
    global _failures
    import re as _re
    import sqlglot.expressions as _exp
    src = (Path(__file__).parent / "mj_postgres.py").read_text()
    # Strip `#` comments first: prose like "reaches here as exp.If/exp.IfBlock" must not be
    # treated as a runtime reference (exp.IfBlock is deliberately accessed ONLY via getattr
    # for version tolerance). Line-based strip is sufficient — real attribute accesses in
    # this module never share a line with a preceding '#'.
    code_only = "\n".join(line.split("#", 1)[0] for line in src.splitlines())
    referenced = sorted(set(_re.findall(r"\bexp\.([A-Z]\w*)", code_only)))
    missing = [name for name in referenced if not hasattr(_exp, name)]
    if missing:
        _failures += 1
        print(f"FAIL exp.* attribute references exist in the running sqlglot")
        print(f"     missing from sqlglot {__import__('sqlglot').__version__}: {missing}")
    else:
        print(f"ok   exp.* attribute references exist in the running sqlglot ({len(referenced)} names checked)")


check_exp_attribute_references()


if _failures:
    print(f"\n{_failures} test(s) FAILED")
    sys.exit(1)
print("\nall dialect tests passed")
