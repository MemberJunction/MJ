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
    errs = []
    for s in must_contain:
        if s not in joined:
            errs.append(f"missing {s!r}")
    for s in must_not_contain:
        if s in joined:
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

check("idempotent seed of schema-derived metadata (EntityField) is dropped (CodeGen regenerates)",
      """IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [ID] = 'abc')
         BEGIN
            INSERT INTO [${flyway:defaultSchema}].[EntityField] ([ID], [Name]) VALUES ('abc', 'X');
         END""",
      must_contain=[],
      must_not_contain=["EntityField", "DO $$", "INSERT"])

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

if _failures:
    print(f"\n{_failures} test(s) FAILED")
    sys.exit(1)
print("\nall dialect tests passed")
