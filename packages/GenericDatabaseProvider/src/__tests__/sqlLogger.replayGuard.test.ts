/**
 * The guarded create-or-update replay form (MemberJunction/MJ#4503) as it actually
 * ships: driven through a REAL SqlLoggingSessionImpl with the options `mj sync push`
 * uses (formatAsMigration + prettyPrint), with the real sql-formatter, written to a
 * temp file and read back. The other suites mock sql-formatter to a passthrough and
 * assert on the raw fallback string; this one covers the artifact the migrations are
 * built from.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SqlLoggingSessionImpl } from '../SqlLogger';

const SFX = '_abc123';
const executedCreate =
  `DECLARE @ID${SFX} UNIQUEIDENTIFIER,\n        @Name${SFX} NVARCHAR(100)\n\n` +
  `SET @ID${SFX} = '82DFF26B-2ABB-4A69-8718-1FE550B60816'\nSET @Name${SFX} = N'Azure Blob Storage'\n\n` +
  `EXEC [__mj].spCreateCredentialType @ID=@ID${SFX},\n                @Name=@Name${SFX}`;
const guardedFallback =
  `DECLARE @ID${SFX} UNIQUEIDENTIFIER,\n        @Name${SFX} NVARCHAR(100)\n\n` +
  `SET @ID${SFX} = '82DFF26B-2ABB-4A69-8718-1FE550B60816'\nSET @Name${SFX} = N'Azure Blob Storage'\n\n` +
  `IF NOT EXISTS (SELECT 1 FROM [__mj].[CredentialType] WHERE [ID] = @ID${SFX})\n` +
  `BEGIN\n    EXEC [__mj].spCreateCredentialType @ID=@ID${SFX},\n                @Name=@Name${SFX}\nEND\n` +
  `ELSE\n` +
  `BEGIN\n    EXEC [__mj].spUpdateCredentialType @ID=@ID${SFX},\n                @Name=@Name${SFX}\nEND`;

const tempFiles: string[] = [];
function tempLogPath(): string {
  const p = path.join(os.tmpdir(), `mj-replay-guard-${process.pid}-${tempFiles.length}.sql`);
  tempFiles.push(p);
  return p;
}
afterEach(() => {
  for (const p of tempFiles.splice(0)) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

async function recordOne(query: string, fallback: string | undefined, description: string): Promise<string> {
  const file = tempLogPath();
  const session = new SqlLoggingSessionImpl('replay-guard', file, {
    formatAsMigration: true,
    prettyPrint: true,
    defaultSchemaName: '__mj',
    retainEmptyLogFiles: true,
  });
  await session.initialize();
  await session.logSqlStatement(query, undefined, description, true, fallback);
  await session.dispose();
  return fs.readFileSync(file, 'utf8');
}

describe('SqlLoggingSessionImpl with the guarded create replay form (#4503)', () => {
  it('writes the guard, both branches and the Flyway schema placeholder through the real formatter', async () => {
    const out = await recordOne(executedCreate, guardedFallback, 'Save MJ: Credential Types');

    // The fallback replaced the executed create and was tagged as such
    expect(out).toContain('-- Save MJ: Credential Types (core SP call only)');
    expect(out).not.toMatch(/EXEC \[\$\{flyway:defaultSchema\}\]\.spCreateCredentialType[^]*EXEC \[__mj\]/);

    // Schema placeholder on the table lookup and on both proc calls
    expect(out).toContain('[${flyway:defaultSchema}].[CredentialType]');
    expect(out).toContain('[${flyway:defaultSchema}].spCreateCredentialType');
    expect(out).toContain('[${flyway:defaultSchema}].spUpdateCredentialType');
    expect(out).not.toContain('[__mj].');

    // Guard structure survives sql-formatter + _postProcessBeginEnd, in order
    const iIf = out.indexOf('IF NOT EXISTS');
    const iCreate = out.indexOf('spCreateCredentialType');
    const iElse = out.indexOf('ELSE');
    const iUpdate = out.indexOf('spUpdateCredentialType');
    expect(iIf).toBeGreaterThan(-1);
    expect(iCreate).toBeGreaterThan(iIf);
    expect(iElse).toBeGreaterThan(iCreate);
    expect(iUpdate).toBeGreaterThan(iElse);
    expect(out.match(/\bBEGIN\b/g)).toHaveLength(2);
    expect(out.match(/\bEND\b/g)).toHaveLength(2);

    // Variables declared once; both branches reference the same ones
    expect(out.match(/DECLARE /g)).toHaveLength(1);
    expect(out.match(new RegExp(`@ID = @ID${SFX}`, 'g'))).toHaveLength(2);

    // The statement closes with the batch separator right after the final END, so the
    // whole IF/ELSE block is one statement in the migration; the session footer follows.
    expect(out).toMatch(/END;\s*\n\s*\n-- End of SQL Logging Session/);
  });

  it('does not tag a statement whose fallback is byte-identical to what ran', async () => {
    const plainUpdate = `EXEC [__mj].spUpdateCredentialType @ID='82DFF26B-2ABB-4A69-8718-1FE550B60816', @Name=N'X'`;
    const out = await recordOne(plainUpdate, plainUpdate, 'Save MJ: Credential Types');

    expect(out).toContain('-- Save MJ: Credential Types\n');
    expect(out).not.toContain('(core SP call only)');
    expect(out).toContain('[${flyway:defaultSchema}].spUpdateCredentialType');
  });
});
