/**
 * Rig: exercises the Feature Value key migration's automated remediation — the DELETE of `FeatureValueCache` rows
 * that can never match the new cache key (`ParametersHash IS NULL`) unless a Feature Value references them — against
 * seeded rows, using the statement text read from the migration file itself (so the migration, not a copy, is tested).
 *
 * Seeds, inside ONE transaction that is always rolled back:
 *   A  ParametersHash NULL, no Feature Value references it        → must be deleted
 *   B  ParametersHash NULL, a Feature Value references it         → must stay (provenance of that value)
 *   C  ParametersHash set, no reference                            → must stay (a valid post-migration row)
 * and asserts exactly that, plus that the DELETE touched exactly one row.
 *
 * Usage (from the MJ repo root, with DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD set; the database is an argument and the
 * rig refuses the dev and clean databases):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/orphan-cache-cleanup.ts <scratch database> [--flip]
 *   --flip: MUTATION — runs the DELETE without its NOT EXISTS guard; the rig is then expected to FAIL (B is deleted).
 * Exit: 0 = every expectation held, 1 = an expectation failed, 2 = bootstrap or usage error.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sql from 'mssql';
import { UUIDSet } from '@memberjunction/global';
import { RigCLI, RigExpectedFailure, RigUsageError } from '../lib/rig-cli';

const MIGRATION = 'migrations/v6/V202610122200__v6.2.x__Feature_Value_Key_And_Versions.sql';
const PROTECTED_DATABASES = new Set(['mj_ps_pr1_claude', 'mj_ps_pr1_claude_clean']);


/** The migration's orphan-cache DELETE, with the Flyway schema placeholder resolved. */
function orphanDeleteFromMigration(schema: string, flip: boolean): string {
    const text = readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
    const match = /DELETE c\s+FROM \[\$\{flyway:defaultSchema\}\]\.\[FeatureValueCache\] c[\s\S]*?;\s*\nGO/.exec(text);
    if (!match) {
        throw new RigUsageError(`the orphan-cache DELETE was not found in ${MIGRATION}`);
    }
    let statement = match[0].replace(/\nGO$/, '').split('${flyway:defaultSchema}').join(schema);
    if (flip) {
        statement = statement.replace(/\s+AND NOT EXISTS \([^)]*\)/, '');
    }
    return statement;
}

function env(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new RigUsageError(`${name} is not set`);
    }
    return value;
}

/** Runs the DELETE. In a mutation run the database rejecting it is the expected outcome, not a crash. */
async function runDelete(q: (text: string) => Promise<sql.IResult<unknown>>, statement: string, flip: boolean): Promise<sql.IResult<unknown>> {
    try {
        return await q(statement);
    } catch (e) {
        if (flip && e instanceof Error) {
            throw new RigExpectedFailure(`mutation caught: ${e.message}`);
        }
        throw e;
    }
}

async function main(): Promise<number> {
    const database = process.argv[2];
    const flip = process.argv.includes('--flip');
    if (!database || database.startsWith('--')) {
        throw new RigUsageError('usage: orphan-cache-cleanup.ts <scratch database> [--flip]');
    }
    if (PROTECTED_DATABASES.has(database.toLowerCase())) {
        throw new RigUsageError(`refusing to seed rows in ${database}: use a scratch database`);
    }
    const schema = process.env.MJ_CORE_SCHEMA || '__mj';
    const statement = orphanDeleteFromMigration(schema, flip);
    const pool = await new sql.ConnectionPool({
        server: env('DB_HOST'), port: Number(env('DB_PORT')), user: env('DB_USERNAME'), password: env('DB_PASSWORD'),
        database, options: { trustServerCertificate: true, encrypt: true },
    }).connect();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    let failures = 0;
    const check = (label: string, ok: boolean, detail: string): void => {
        console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${detail}`);
        if (!ok) failures++;
    };
    try {
        const q = (text: string) => new sql.Request(tx).query(text);
        const seed = await q(`
            DECLARE @prompt UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [${schema}].[AIPrompt] ORDER BY ID);
            DECLARE @rp UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [${schema}].[RecordProcess] ORDER BY ID);
            DECLARE @entity UNIQUEIDENTIFIER = (SELECT EntityID FROM [${schema}].[RecordProcess] WHERE ID = @rp);
            DECLARE @a UNIQUEIDENTIFIER = NEWID(), @b UNIQUEIDENTIFIER = NEWID(), @c UNIQUEIDENTIFIER = NEWID();
            INSERT INTO [${schema}].[FeatureValueCache] (ID, PromptID, PromptVersionHash, ConstraintHash, KeyHash, KeyJSON, OutputsJSON, ParametersHash)
            VALUES (@a, @prompt, 'rig-pv', 'rig-ch', 'rig-key-a', '{}', '{}', NULL),
                   (@b, @prompt, 'rig-pv', 'rig-ch', 'rig-key-b', '{}', '{}', NULL),
                   (@c, @prompt, 'rig-pv', 'rig-ch', 'rig-key-c', '{}', '{}', 'rig-params');
            INSERT INTO [${schema}].[FeatureValue] (RecordProcessID, EntityID, RecordID, FeatureName, ValueText, FeatureValueCacheID)
            VALUES (@rp, @entity, 'rig-record', 'RigFeature', 'from B', @b);
            SELECT @a AS A, @b AS B, @c AS C;`);
        const ids = seed.recordset[0] as { A: string; B: string; C: string };
        const deleted = await runDelete(q, statement, flip);
        const remaining = await q(`SELECT ID FROM [${schema}].[FeatureValueCache] WHERE KeyHash LIKE 'rig-key-%'`);
        const left = new UUIDSet(remaining.recordset.map((r: { ID: string }) => r.ID));
        check('the DELETE removes exactly one seeded row', deleted.rowsAffected.reduce((n, x) => n + x, 0) === 1, `rowsAffected=${deleted.rowsAffected.join(',')}`);
        check('A (NULL hash, unreferenced) is deleted', !left.Has(ids.A), `A ${left.Has(ids.A) ? 'still there' : 'gone'}`);
        check('B (NULL hash, referenced by a Feature Value) stays', left.Has(ids.B), `B ${left.Has(ids.B) ? 'kept' : 'gone'}`);
        check('C (hash set) stays', left.Has(ids.C), `C ${left.Has(ids.C) ? 'kept' : 'gone'}`);
    } finally {
        await tx.rollback(); // nothing seeded survives the rig
        await pool.close();
    }
    console.log(`RESULT: ${failures === 0 ? 'PASS' : 'FAIL'}${flip ? ' (mutation: NOT EXISTS guard removed)' : ''}`);
    return failures === 0 ? 0 : 1;
}

void RigCLI.Main(main);
