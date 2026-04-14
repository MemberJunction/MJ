/**
 * End-to-end repro for GH issue #2367
 *
 * Double-encryption of Credential fields by External Change Detection.
 *
 * Steps (Ian Zygmunt's repro from the issue):
 *   1. Ensure Credential entity has DetectExternalChanges=1 + TrackRecordChanges=1
 *   2. Create a Credential record with known plaintext Values → Save()
 *      → DB row should show $ENC$... (confirmed via raw SQL)
 *   3. Simulate an external change by updating __mj_UpdatedAt directly
 *   4. Run External Change Detection on just the Credentials entity
 *   5. Reload the record and check if Values decrypts cleanly to the original plaintext
 *
 * Pass criteria: original plaintext matches post-replay decrypted Values
 * Fail criteria: post-replay Values corrupted / undecryptable
 *
 * Usage (from repo root):
 *   npx tsx scripts/repro-ecd-encryption.ts
 *
 * Options:
 *   --cleanup-only   Delete orphan test records from prior runs and exit
 */
import { Metadata } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { ExternalChangeDetectorEngine } from '@memberjunction/external-change-detection';
import { MJCredentialEntity } from '@memberjunction/core-entities';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';

// Register entity subclasses + encryption engine.
// server-bootstrap-lite avoids @memberjunction/server strict config validation.
import '@memberjunction/server-bootstrap-lite';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const cleanupOnly = process.argv.includes('--cleanup-only');

const TEST_PLAINTEXT = 'SUPER_SECRET_VALUE_' + Math.random().toString(36).slice(2, 10);
const TEST_NAME_PREFIX = 'ECD_Repro_Test_';

interface Ctx {
    pool: sql.ConnectionPool;
    coreSchema: string;
}

function hr(char = '─'): void {
    console.log(char.repeat(72));
}

async function readRawValuesColumn(ctx: Ctx, id: string): Promise<string | null> {
    const result = await ctx.pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query(`SELECT [Values] FROM ${ctx.coreSchema}.Credential WHERE ID = @id`);
    return result.recordset[0]?.Values ?? null;
}

async function cleanupTestRecords(ctx: Ctx): Promise<number> {
    const result = await ctx.pool.request()
        .input('prefix', sql.NVarChar, TEST_NAME_PREFIX + '%')
        .query(`DELETE FROM ${ctx.coreSchema}.Credential WHERE Name LIKE @prefix`);
    return result.rowsAffected[0] ?? 0;
}

async function ensureCredentialEligibility(ctx: Ctx): Promise<{ changed: boolean; originalDetect: number }> {
    const current = await ctx.pool.request().query(`
        SELECT ID, Name, TrackRecordChanges, DetectExternalChanges
        FROM ${ctx.coreSchema}.Entity
        WHERE Name = 'MJ: Credentials'
    `);
    if (current.recordset.length === 0) {
        throw new Error('Entity "MJ: Credentials" not found — check your DB has core MJ metadata.');
    }
    const row = current.recordset[0];
    const originalDetect = row.DetectExternalChanges;
    if (!row.TrackRecordChanges) {
        throw new Error('MJ: Credentials has TrackRecordChanges=0 — ECD cannot operate. Refuse to flip this silently.');
    }
    if (row.DetectExternalChanges === 1) {
        return { changed: false, originalDetect };
    }
    console.log('  enabling DetectExternalChanges=1 on MJ: Credentials (will restore after)');
    await ctx.pool.request()
        .input('id', sql.UniqueIdentifier, row.ID)
        .query(`UPDATE ${ctx.coreSchema}.Entity SET DetectExternalChanges = 1 WHERE ID = @id`);
    return { changed: true, originalDetect };
}

async function restoreCredentialEligibility(ctx: Ctx, originalDetect: number): Promise<void> {
    await ctx.pool.request()
        .input('val', sql.Bit, originalDetect)
        .query(`UPDATE ${ctx.coreSchema}.Entity SET DetectExternalChanges = @val WHERE Name = 'MJ: Credentials'`);
}

async function getFirstCredentialTypeID(ctx: Ctx): Promise<string> {
    const result = await ctx.pool.request().query(`
        SELECT TOP 1 ID FROM ${ctx.coreSchema}.CredentialType ORDER BY Name
    `);
    if (result.recordset.length === 0) {
        throw new Error('No MJ: Credential Types exist — cannot create a Credential. Seed at least one.');
    }
    return result.recordset[0].ID;
}

async function nudgeUpdatedAt(ctx: Ctx, id: string): Promise<void> {
    await ctx.pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query(`UPDATE ${ctx.coreSchema}.Credential SET __mj_UpdatedAt = SYSDATETIMEOFFSET() WHERE ID = @id`);
}

async function main(): Promise<void> {
    console.log('External Change Detection encryption repro (GH #2367)');
    hr('═');

    // ── Bootstrap
    const { cosmiconfig } = await import('cosmiconfig');
    const explorer = cosmiconfig('mj');
    const configResult = await explorer.search();
    if (!configResult) throw new Error('No mj.config.cjs found. Run from repo root.');
    const config = configResult.config;

    const pool = new sql.ConnectionPool({
        server: config.dbHost || process.env.DB_HOST || 'localhost',
        port: parseInt(config.dbPort || process.env.DB_PORT || '1433', 10),
        database: config.dbDatabase || process.env.DB_DATABASE,
        user: config.dbUsername || process.env.DB_USERNAME,
        password: config.dbPassword || process.env.DB_PASSWORD,
        options: {
            encrypt: Boolean(config.dbEncrypt) || Boolean(process.env.DB_HOST?.includes('.database.windows.net')),
            trustServerCertificate: true,
            enableArithAbort: true,
        },
        pool: { max: 5, min: 1, idleTimeoutMillis: 30000 },
    });
    await pool.connect();
    console.log('✓ connected to DB');

    const coreSchema = config.coreSchema || process.env.MJ_CORE_SCHEMA || '__mj';
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, coreSchema, 180000));
    console.log('✓ MJ provider initialized');

    const contextUser = UserCache.Instance.GetSystemUser();
    if (!contextUser) throw new Error('No System user in UserCache');
    console.log(`✓ context user = ${contextUser.Name}`);

    const ctx: Ctx = { pool, coreSchema };

    if (cleanupOnly) {
        const deleted = await cleanupTestRecords(ctx);
        console.log(`\n✓ cleanup: deleted ${deleted} test records`);
        await pool.close();
        return;
    }

    let eligibilityChange: { changed: boolean; originalDetect: number } | null = null;
    let testCredentialID: string | null = null;

    try {
        // ── Pre-flight: cleanup any leftovers from prior runs
        const leftover = await cleanupTestRecords(ctx);
        if (leftover > 0) console.log(`✓ cleaned up ${leftover} leftover test records from prior runs`);

        // ── Step 1: Ensure entity eligibility
        hr();
        console.log('Step 1: ensure MJ: Credentials is ECD-eligible');
        eligibilityChange = await ensureCredentialEligibility(ctx);
        console.log(`  TrackRecordChanges=1, DetectExternalChanges=1 ✓`);

        // ── Step 2: Create test credential
        hr();
        console.log('Step 2: create a test Credential and Save() → encryption should produce $ENC$');
        const md = new Metadata();
        const credTypeID = await getFirstCredentialTypeID(ctx);
        const testName = TEST_NAME_PREFIX + Date.now();

        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        cred.NewRecord();
        cred.CredentialTypeID = credTypeID;
        cred.Name = testName;
        cred.Values = TEST_PLAINTEXT;
        cred.IsActive = true;
        cred.IsDefault = false;
        const saved = await cred.Save();
        if (!saved) {
            throw new Error(`Initial Save() failed: ${cred.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        testCredentialID = cred.ID;
        console.log(`  created Credential ID = ${testCredentialID}`);
        console.log(`  plaintext sent to Save() = "${TEST_PLAINTEXT}"`);

        // Verify raw DB value is encrypted
        const rawAfterCreate = await readRawValuesColumn(ctx, testCredentialID);
        console.log(`  raw DB Values column    = "${rawAfterCreate?.slice(0, 30)}..."`);
        if (!rawAfterCreate?.startsWith('$ENC$')) {
            throw new Error(`Expected $ENC$ prefix in DB but got: ${rawAfterCreate}`);
        }
        console.log('  ✓ DB stores encrypted form');

        const originalCiphertext = rawAfterCreate;

        // ── Step 3: Simulate external change
        hr();
        console.log('Step 3: simulate external change — UPDATE __mj_UpdatedAt directly');
        await nudgeUpdatedAt(ctx, testCredentialID);
        console.log('  ✓ __mj_UpdatedAt advanced');

        // ── Step 4: Run ECD against just the Credentials entity
        hr();
        console.log('Step 4: run ExternalChangeDetectorEngine.DetectAndReplayChanges([Credentials])');
        const engine = ExternalChangeDetectorEngine.Instance;
        await engine.Config(true, contextUser);
        const credEntity = engine.EligibleEntities.find(e => e.Name === 'MJ: Credentials');
        if (!credEntity) {
            throw new Error('MJ: Credentials not in EligibleEntities after config refresh — metadata may be stale');
        }
        const result = await engine.DetectAndReplayChanges([credEntity], /*replayBatchSize*/ 5, /*maxConcurrency*/ 1);
        console.log(`  run result: success=${result.Success} detected=${result.TotalDetected} replayed=${result.TotalReplayed}`);
        if (!result.Success) {
            console.log(`  ⚠ ECD reported failure: ${result.ErrorMessage}`);
        }

        // ── Step 5: verify no double-encryption
        hr();
        console.log('Step 5: verify DB + decryption');
        const rawAfterReplay = await readRawValuesColumn(ctx, testCredentialID);
        console.log(`  raw DB Values column    = "${rawAfterReplay?.slice(0, 30)}..."`);

        // Shape check: still single $ENC$ layer (not nested)
        if (!rawAfterReplay?.startsWith('$ENC$')) {
            throw new Error(`DB value no longer starts with $ENC$ — possible corruption: ${rawAfterReplay}`);
        }
        const enclosedEnc = rawAfterReplay.indexOf('$ENC$', 5);
        if (enclosedEnc !== -1) {
            console.log('  ✗ DOUBLE-ENCRYPTION DETECTED — $ENC$ appears twice in the value');
            throw new Error('Bug reproduced: value is double-encrypted');
        }
        console.log('  ✓ only one $ENC$ layer in DB');

        // Decrypt via standard Load path
        const reloaded = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await reloaded.Load(testCredentialID);
        if (!loaded) {
            throw new Error(`Failed to reload Credential ${testCredentialID}`);
        }
        const decryptedValue = reloaded.Values;
        console.log(`  decrypted Values        = "${decryptedValue}"`);
        console.log(`  original plaintext      = "${TEST_PLAINTEXT}"`);

        hr('═');
        if (decryptedValue === TEST_PLAINTEXT) {
            console.log('✅ PASS — fix works. Plaintext round-trips through ECD replay correctly.');
        }
        else {
            console.log('❌ FAIL — value corrupted by ECD replay.');
            console.log(`   expected: "${TEST_PLAINTEXT}"`);
            console.log(`   got:      "${decryptedValue}"`);
            throw new Error('Bug reproduced: plaintext does not match after ECD replay');
        }

        // Discrimination check: is the fix actually exercised?
        //
        // With fix: buildEntityFromRow decrypts → Save() re-encrypts with fresh IV
        //           → ciphertext changes (same plaintext, different IV)
        // Without fix (pure MJ, no app override): raw $ENC$ passes to Save() →
        //           MJ guard skips re-encryption → ciphertext stays byte-identical
        //
        // Without fix (MJ + app-level Save override): ciphertext gets wrapped again
        //           (double-encrypted) — that's the corruption Ian saw in prod
        console.log('');
        console.log(`  full pre-replay   = "${originalCiphertext}"`);
        console.log(`  full post-replay  = "${rawAfterReplay}"`);
        if (originalCiphertext === rawAfterReplay) {
            console.log('  ℹ ciphertext IDENTICAL — MJ guard short-circuited, fix was not exercised');
            console.log('    (this DB has no app-level Save override; corruption path does not apply here)');
        }
        else {
            console.log('  ✓ ciphertext CHANGED — confirms fix ran: decrypt → re-encrypt with fresh IV');
        }
    }
    finally {
        // ── Always: cleanup
        hr();
        console.log('Cleanup');
        if (testCredentialID) {
            try {
                await ctx.pool.request()
                    .input('id', sql.UniqueIdentifier, testCredentialID)
                    .query(`DELETE FROM ${ctx.coreSchema}.Credential WHERE ID = @id`);
                console.log(`  ✓ deleted test Credential ${testCredentialID}`);
            }
            catch (e) {
                console.log(`  ⚠ failed to delete test Credential: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        if (eligibilityChange?.changed) {
            await restoreCredentialEligibility(ctx, eligibilityChange.originalDetect);
            console.log(`  ✓ restored DetectExternalChanges=${eligibilityChange.originalDetect} on MJ: Credentials`);
        }
        await pool.close();
    }
}

main().then(
    () => process.exit(0),
    (err: unknown) => {
        console.error('\n✗ repro failed:', err instanceof Error ? err.stack : err);
        process.exit(1);
    }
);
