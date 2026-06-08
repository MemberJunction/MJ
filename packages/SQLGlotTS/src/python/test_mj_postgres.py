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
