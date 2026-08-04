/**
 * Unit tests for `extractApplicationIds` — parsing the fixed-GUID Application(s) an app's own
 * migrations declare (the migration-declared owner set for teardown, Solution 2).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractApplicationIds } from '../install/migration-application-ids.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-appids-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('extractApplicationIds', () => {
  // The real bizapps/accounting shape: a "Save MJ: Applications" section that assigns the ID to a
  // per-record variable, then EXECs spCreateApplication @ID = @that_variable.
  const accountingStyle = `-- Save MJ: Applications (core SP call only)
DECLARE @ID_df225e56 UNIQUEIDENTIFIER,
@Name_df225e56 NVARCHAR(100);
SELECT @ID_df225e56 = '08B5D905-6FB3-438B-94E5-2C5FF021B794',
@Name_df225e56 = N'Accounting';
EXEC [\${flyway:defaultSchema}].spCreateApplication @ID = @ID_df225e56,
  @Name = @Name_df225e56;
GO`;

  it('extracts the Application GUID from a variable-based spCreateApplication (the real pattern)', async () => {
    await fs.writeFile(path.join(dir, 'V202607012105__Metadata_Sync.sql'), accountingStyle);
    expect(await extractApplicationIds(dir)).toEqual(['08b5d905-6fb3-438b-94e5-2c5ff021b794']);
  });

  it('extracts a literal @ID and dedupes across files, ignores non-migration files', async () => {
    await fs.writeFile(
      path.join(dir, 'V1__a.sql'),
      "EXEC [__mj].spCreateApplication @ID = 'AAAAAAAA-1111-2222-3333-444444444444', @Name = N'X';\nGO",
    );
    await fs.writeFile(
      path.join(dir, 'V2__b.sql'),
      "EXEC [__mj].spUpdateApplication @ID = 'AAAAAAAA-1111-2222-3333-444444444444', @Name = N'X';\nGO",
    );
    await fs.writeFile(path.join(dir, 'notes.md'), 'spCreateApplication AAAAAAAA-... (not sql)');
    expect(await extractApplicationIds(dir)).toEqual(['aaaaaaaa-1111-2222-3333-444444444444']);
  });

  it('catches a direct INSERT INTO [..].[Application]', async () => {
    await fs.writeFile(
      path.join(dir, 'B1__base.sql'),
      "INSERT INTO [__mj].[Application] (ID, Name) VALUES ('BBBBBBBB-1111-2222-3333-444444444444', 'Y');",
    );
    expect(await extractApplicationIds(dir)).toEqual(['bbbbbbbb-1111-2222-3333-444444444444']);
  });

  it('returns [] for a dir with no Application-creating migrations, or a missing dir', async () => {
    await fs.writeFile(path.join(dir, 'V1__x.sql'), 'CREATE TABLE Foo (Id INT);\nGO');
    expect(await extractApplicationIds(dir)).toEqual([]);
    expect(await extractApplicationIds(path.join(dir, 'nope'))).toEqual([]);
  });

  it('does NOT mistake the DECLARE line for the ID assignment', async () => {
    await fs.writeFile(path.join(dir, 'V9__d.sql'), accountingStyle);
    const ids = await extractApplicationIds(dir);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe('08b5d905-6fb3-438b-94e5-2c5ff021b794');
  });
});
