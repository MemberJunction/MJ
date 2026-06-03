/**
 * test-vectorize-entity.ts — live, full-visibility harness for the entity
 * vectorization pipeline (`EntityVectorSyncer`).
 *
 * WHY THIS EXISTS
 * ---------------
 * The "Entity Vector Sync" scheduled job drives the "Vectorize Entity" action,
 * which in turn calls `EntityVectorSyncer.Config()` → `GetActiveEntityDocuments()`
 * → `VectorizeEntity()`. When that path fails *outside* the per-document
 * try/catch (e.g. in `Config` or `GetActiveEntityDocuments`), the error bubbles
 * up to the ActionEngine where it can be hard to see the true cause from the
 * scheduler logs. This script runs the exact same sequence directly, with the
 * raw error + stack printed, so you can diagnose vector-sync issues without
 * standing up MJAPI or waiting for the cron poll.
 *
 * It mirrors the sibling `scripts/test-search-entity.ts` harness (which exercises
 * `Provider.SearchEntity`) — same bootstrap, same config resolution, same
 * ContextUser selection — but targets the *write* side of the pipeline.
 *
 * WHAT IT DOES
 * ------------
 *   1. Boots the SQL Server provider from `mj.config.cjs` + `.env`.
 *   2. Picks an Owner (or first) user as the ContextUser.
 *   3. Runs `EntityVectorSyncer.Config()`.
 *   4. Lists the Active Entity Documents for the requested type (default "Search",
 *      matching the scheduled job) and prints their key config (VectorIndex /
 *      AIModel / Template) so misconfiguration is obvious at a glance.
 *   5. Vectorizes each one, surfacing any error with a full stack trace.
 *
 * USAGE (run from the REPO ROOT so cwd-relative `.env` / `mj.config.cjs`
 * resolution and workspace package linking work):
 *   npx tsx packages/AI/Vectors/scripts/test-vectorize-entity.ts
 *   npx tsx packages/AI/Vectors/scripts/test-vectorize-entity.ts "Record Duplicate"
 *
 * The single positional arg is the EntityDocumentType to filter on; it defaults
 * to "Search" (the type the daily scheduled job uses).
 */

import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { EntityVectorSyncer } from '@memberjunction/ai-vector-sync';
import type { MJEntityDocumentEntity } from '@memberjunction/core-entities';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';

// Bootstrap registers entity subclasses, AI providers (LocalEmbedding),
// VectorDB drivers (SimpleVectorServiceProvider), etc. so the ClassFactory can
// resolve every @RegisterClass-decorated type the pipeline instantiates.
import '@memberjunction/server-bootstrap-lite';

// `.env` lives at the repo root; load it relative to the process cwd (run from root).
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

/**
 * Connect to the configured MJ database and stand up the SQL Server provider.
 * Config precedence: `mj.config.cjs` databaseSettings → `.env` → sensible defaults.
 */
async function bootstrapProvider() {
    // Resolve mj.config.cjs via cosmiconfig — same pattern as the other dev scripts.
    const { cosmiconfig } = await import('cosmiconfig');
    const explorer = cosmiconfig('mj');
    const configResult = await explorer.search();
    if (!configResult) {
        throw new Error('No mj.config.cjs found. Run this script from the repo root.');
    }
    const config = configResult.config;
    const dbSettings = config.databaseSettings ?? {};

    const sqlConfig: sql.config = {
        server: dbSettings.host || process.env.DB_HOST || 'localhost',
        port: Number(dbSettings.port ?? process.env.DB_PORT ?? 1433),
        user: dbSettings.user || process.env.DB_USERNAME,
        password: dbSettings.password || process.env.DB_PASSWORD,
        database: dbSettings.database || process.env.DB_DATABASE,
        options: { encrypt: false, trustServerCertificate: true },
    };

    const pool = await new sql.ConnectionPool(sqlConfig).connect();
    const schema = config.mjCoreSchema || dbSettings.mjCoreSchema || '__mj';

    const pcfg = new SQLServerProviderConfigData(pool, schema);
    const provider = await setupSQLServerClient(pcfg);

    // The vector syncer needs a real ContextUser for its RunView/Save calls.
    await UserCache.Instance.Refresh(pool);
    const ownerUser = UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
    if (!ownerUser) throw new Error('No user found in cache to act as ContextUser.');

    return { provider, contextUser: ownerUser, pool };
}

async function main(): Promise<void> {
    // Default to "Search" — the EntityDocumentType the daily scheduled job uses.
    const entityDocumentType = process.argv[2] ?? 'Search';
    console.log(`\nTest Vectorize Entity\n${'='.repeat(78)}`);
    console.log(`EntityDocumentType: "${entityDocumentType}"`);

    const { contextUser, pool } = await bootstrapProvider();
    console.log(`ContextUser       : ${contextUser.Name} (${contextUser.Email})`);

    const vectorizer = new EntityVectorSyncer();

    // [1/3] Warm the caches/engines the pipeline depends on (EntityDocumentCache,
    // AIEngine, KnowledgeHubMetadataEngine, TemplateEngineServer).
    console.log('\n[1/3] Config()...');
    await vectorizer.Config(false, contextUser);
    console.log('  ok');

    // [2/3] Resolve the Active Entity Documents for the requested type. This is
    // where the scheduled job historically failed ("No EntityDocuments found for
    // type ...") — printing the resolved set + their config makes that obvious.
    console.log(`\n[2/3] GetActiveEntityDocuments(undefined, "${entityDocumentType}")...`);
    const entityDocuments: MJEntityDocumentEntity[] = await vectorizer.GetActiveEntityDocuments(undefined, entityDocumentType);
    console.log(`  found ${entityDocuments.length} entity document(s):`);
    for (const d of entityDocuments) {
        console.log(`    - ${d.Name}  (Entity=${d.Entity}, VectorIndexID=${d.VectorIndexID ?? 'NULL'}, AIModelID=${d.AIModelID ?? 'NULL'}, TemplateID=${d.TemplateID ?? 'NULL'})`);
    }

    // [3/3] Vectorize each document. Any failure throws with a full stack (caught
    // by the top-level handler below) instead of being swallowed by the scheduler.
    console.log('\n[3/3] VectorizeEntity() per document...');
    for (const entityDocument of entityDocuments) {
        console.log(`  → ${entityDocument.Name}`);
        await vectorizer.VectorizeEntity({
            entityID: entityDocument.EntityID,
            entityDocumentID: entityDocument.ID,
            listBatchCount: 20,
            options: {},
        }, contextUser);
        console.log(`    done`);
    }

    await pool.close();
    console.log('\n✅ Done.');
}

main().catch(err => {
    console.error('\n❌ REAL ERROR (full stack):');
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
});
