/**
 * run-dupe-detection.ts — end-to-end harness for Events duplicate detection.
 *
 * Faithfully reproduces the production path: it WIPES any prior Duplicate Run data
 * for the Events entity, then CREATES a fresh "MJ: Duplicate Runs" record and saves
 * it — which triggers MJDuplicateRunEntityServer.Save() → runDetectionAsync() exactly
 * like the dashboard's "Run Detection" button. It then polls the run to completion and
 * prints verification stats (detail/match counts, ghost matches, self matches).
 *
 * Only Events (EntityID 1AC6745A-...) data is touched — see WIPE step.
 * Reads DB creds from the repo-root .env / mj.config.cjs (no secrets in this file).
 *
 * USAGE (must be run from the repo root so cwd-relative .env / mj.config.cjs resolve):
 *   npx tsx packages/AI/Vectors/Dupe/scripts/run-dupe-detection.ts
 */
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { Metadata, RunView, LogStatus } from '@memberjunction/core';
import type { MJDuplicateRunEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';

// Registers entity subclasses (MJDuplicateRunEntityServer), AI providers
// (OpenAIEmbedding) and VectorDB drivers (PineconeDatabase) on the ClassFactory.
import '@memberjunction/server-bootstrap-lite';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const EVENTS_ENTITY_ID = '1AC6745A-6906-4AE6-B44C-083BE3B05643';
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;

async function bootstrap() {
    const { cosmiconfig } = await import('cosmiconfig');
    const explorer = cosmiconfig('mj');
    const configResult = await explorer.search();
    if (!configResult) throw new Error('No mj.config.cjs found. Run from repo root.');
    const config = configResult.config;
    const dbSettings = config.databaseSettings ?? {};

    const pool = await new sql.ConnectionPool({
        server: dbSettings.host || process.env.DB_HOST || 'localhost',
        port: Number(dbSettings.port ?? process.env.DB_PORT ?? 1433),
        user: dbSettings.user || process.env.DB_USERNAME,
        password: dbSettings.password || process.env.DB_PASSWORD,
        database: dbSettings.database || process.env.DB_DATABASE,
        options: { encrypt: false, trustServerCertificate: true },
    }).connect();

    const schema = config.mjCoreSchema || dbSettings.mjCoreSchema || '__mj';
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, schema));
    await UserCache.Instance.Refresh(pool);
    const user = UserCache.Users.find(u => u.Email?.toLowerCase() === 'amith@bluecypress.io')
        ?? UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner')
        ?? UserCache.Users[0];
    if (!user) throw new Error('No context user found.');
    return { pool, user, schema };
}

/** Delete all prior Duplicate Run data for the Events entity ONLY. */
async function wipeEventsRuns(pool: sql.ConnectionPool, schema: string): Promise<void> {
    const req = pool.request();
    req.input('eid', sql.UniqueIdentifier, EVENTS_ENTITY_ID);
    const result = await req.query(`
        DELETE m FROM ${schema}.DuplicateRunDetailMatch m
          JOIN ${schema}.DuplicateRunDetail d ON d.ID = m.DuplicateRunDetailID
          JOIN ${schema}.DuplicateRun r ON r.ID = d.DuplicateRunID
         WHERE r.EntityID = @eid;
        DELETE d FROM ${schema}.DuplicateRunDetail d
          JOIN ${schema}.DuplicateRun r ON r.ID = d.DuplicateRunID
         WHERE r.EntityID = @eid;
        DELETE FROM ${schema}.DuplicateRun WHERE EntityID = @eid;
    `);
    LogStatus(`Wiped prior Events duplicate-run data (rows affected: ${JSON.stringify(result.rowsAffected)}).`);
}

async function createAndTriggerRun(user): Promise<string> {
    const md = new Metadata(); // global-provider-ok: one-off CLI script, global default provider is correct
    const run = await md.GetEntityObject<MJDuplicateRunEntity>('MJ: Duplicate Runs', user);
    run.NewRecord();
    run.EntityID = EVENTS_ENTITY_ID;
    run.StartedByUserID = user.ID;
    run.StartedAt = new Date();
    run.ProcessingStatus = 'In Progress';
    run.ApprovalStatus = 'Pending';
    // EndedAt left null → Save() triggers runDetectionAsync() (the production path).
    const saved = await run.Save();
    if (!saved) throw new Error(`Failed to create run: ${run.LatestResult?.CompleteMessage}`);
    LogStatus(`Created Duplicate Run ${run.ID} — detection triggered. Class: ${run.constructor.name}`);
    return run.ID;
}

async function pollUntilDone(user, runID: string): Promise<string> {
    const md = new Metadata(); // global-provider-ok: one-off CLI script, global default provider is correct
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const run = await md.GetEntityObject<MJDuplicateRunEntity>('MJ: Duplicate Runs', user);
        await run.Load(runID);
        const status = run.ProcessingStatus;
        LogStatus(`  ...status=${status} processed=${run.ProcessedItemCount}/${run.TotalItemCount} ended=${run.EndedAt ? 'yes' : 'no'}`);
        if (status === 'Complete' || status === 'Failed' || run.EndedAt) return status;
    }
    return 'Timeout';
}

async function verify(pool: sql.ConnectionPool, schema: string, runID: string): Promise<void> {
    const r = await pool.request().input('rid', sql.UniqueIdentifier, runID).query(`
        WITH dets AS (SELECT * FROM ${schema}.DuplicateRunDetail WHERE DuplicateRunID=@rid),
        matches AS (SELECT m.*, d.RecordID AS SourceRID FROM ${schema}.DuplicateRunDetailMatch m JOIN dets d ON d.ID=m.DuplicateRunDetailID)
        SELECT
          (SELECT COUNT(*) FROM dets) AS DetailCount,
          (SELECT COUNT(DISTINCT RecordID) FROM dets) AS DistinctSources,
          (SELECT COUNT(*) FROM matches) AS MatchCount,
          (SELECT COUNT(*) FROM matches WHERE UPPER(REPLACE(SourceRID,'ID|','')) = UPPER(REPLACE(MatchRecordID,'ID|',''))) AS SelfMatches,
          (SELECT COUNT(*) FROM matches mm WHERE NOT EXISTS (
              SELECT 1 FROM AssociationDemo.vwEvents e WHERE e.ID = TRY_CONVERT(uniqueidentifier, REPLACE(mm.MatchRecordID,'ID|','')))) AS GhostMatches,
          (SELECT MAX(MatchProbability) FROM matches) AS MaxScore,
          (SELECT MIN(MatchProbability) FROM matches) AS MinScore;
    `);
    const s = r.recordset[0];
    console.log('\n================ VERIFICATION ================');
    console.log(`Run ID:           ${runID}`);
    console.log(`Detail records:   ${s.DetailCount}  (distinct sources: ${s.DistinctSources}; expect 1 detail per source)`);
    console.log(`Match records:    ${s.MatchCount}`);
    console.log(`Self matches:     ${s.SelfMatches}   ${s.SelfMatches === 0 ? 'OK' : 'FAIL'}`);
    console.log(`Ghost matches:    ${s.GhostMatches}   ${s.GhostMatches === 0 ? 'OK' : 'FAIL'}  (matches to records that do not exist)`);
    console.log(`Score range:      ${s.MinScore} .. ${s.MaxScore}`);
    const fanout = s.DistinctSources > 0 ? (s.DetailCount / s.DistinctSources) : 0;
    console.log(`Detail/source:    ${fanout.toFixed(2)}  ${Math.abs(fanout - 1) < 0.001 ? 'OK (no recursion fan-out)' : 'FAIL (fan-out!)'}`);

    // Show a few top matches with names for eyeballing
    const top = await pool.request().input('rid', sql.UniqueIdentifier, runID).query(`
        SELECT TOP 8 JSON_VALUE(d.RecordMetadata,'$.Name') AS SourceName,
               JSON_VALUE(m.RecordMetadata,'$.Name') AS MatchName, m.MatchProbability
        FROM ${schema}.DuplicateRunDetailMatch m JOIN ${schema}.DuplicateRunDetail d ON d.ID=m.DuplicateRunDetailID
        WHERE d.DuplicateRunID=@rid ORDER BY m.MatchProbability DESC;`);
    console.log('\nTop matches:');
    for (const row of top.recordset) {
        console.log(`  ${Number(row.MatchProbability).toFixed(3)}  "${row.SourceName}"  ->  "${row.MatchName}"`);
    }
    console.log('==============================================\n');
}

async function main() {
    const { pool, user, schema } = await bootstrap();
    console.log(`ContextUser: ${user.Name} (${user.Email})`);
    await AIEngine.Instance.Config(false, user);

    await wipeEventsRuns(pool, schema);
    const runID = await createAndTriggerRun(user);
    const status = await pollUntilDone(user, runID);
    console.log(`\nFinal run status: ${status}`);
    await verify(pool, schema, runID);

    await pool.close();
    process.exit(0);
}

main().catch(err => {
    console.error('\nERROR:', err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
});
