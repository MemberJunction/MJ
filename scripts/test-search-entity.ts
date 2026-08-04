/**
 * Test SearchEntity — live end-to-end smoke test for Provider.SearchEntity.
 *
 * Connects to the configured MJ database (via mj.config.cjs), bootstraps the
 * provider, then runs hybrid / lexical-only / semantic-only searches against
 * the seeded `MJ Entities Search` EntityDocument and prints the top-N hits.
 *
 * Usage (from repo root):
 *   npx tsx scripts/test-search-entity.ts                       # default: 'user', topK=10
 *   npx tsx scripts/test-search-entity.ts "invoice"             # custom query
 *   npx tsx scripts/test-search-entity.ts "ai prompt run" 5     # custom query, topK=5
 *   npx tsx scripts/test-search-entity.ts --entity "MJ: Users" "amith"
 *
 * Why this exists: the PR adds Provider.SearchEntity but no UI surfaces it yet.
 * This script exercises the full pipeline end-to-end (resolve EntityDocument →
 * lexical RunView + LIKE → semantic embed via gte-small + SVS QueryIndex →
 * weighted RRF blend → permission filter) so you can sanity-check results.
 */

import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { AIEngine } from '@memberjunction/aiengine';
import type { SearchEntityParams, EntitySearchResult } from '@memberjunction/core';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';

// Bootstrap registers all entity subclasses, AI providers (LocalEmbedding),
// VectorDB drivers (SimpleVectorServiceProvider), action classes, etc. so the
// ClassFactory can resolve them.
import '@memberjunction/server-bootstrap-lite';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

interface Args {
    entityName: string;
    searchText: string;
    topK: number;
}

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    let entityName = 'MJ: Entities';
    const rest: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--entity') {
            entityName = argv[++i] ?? entityName;
        } else {
            rest.push(argv[i]);
        }
    }

    const searchText = rest[0] ?? 'user';
    const topK = rest[1] ? Number(rest[1]) : 10;
    return { entityName, searchText, topK };
}

async function bootstrapProvider() {
    // Resolve mj.config.cjs via cosmiconfig — same pattern as other scripts.
    const { cosmiconfig } = await import('cosmiconfig');
    const explorer = cosmiconfig('mj');
    const configResult = await explorer.search();
    if (!configResult) {
        throw new Error('No mj.config.cjs found. Run from the repo root.');
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

    await UserCache.Instance.Refresh(pool);
    const ownerUser = UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
    if (!ownerUser) throw new Error('No user found in cache to act as ContextUser.');

    return { provider, contextUser: ownerUser, pool };
}

async function runSearch(provider: any, params: SearchEntityParams, label: string): Promise<void> {
    const startMs = Date.now();
    const results: EntitySearchResult[] = await provider.SearchEntity(params);
    const elapsedMs = Date.now() - startMs;

    console.log('');
    console.log('─'.repeat(78));
    console.log(`▶ ${label}  (entity="${params.entityName}", text="${params.searchText}", topK=${params.options?.topK})`);
    console.log(`  ${results.length} result(s) in ${elapsedMs}ms`);
    console.log('─'.repeat(78));

    if (results.length === 0) {
        console.log('  (no matches)');
        return;
    }

    // Header
    const rankCol = 'Rank'.padEnd(5);
    const scoreCol = 'Score'.padEnd(8);
    const typeCol = 'Type'.padEnd(10);
    const lexCol = 'Lexical'.padEnd(9);
    const semCol = 'Semantic'.padEnd(10);
    const idCol = 'RecordID'.padEnd(38);
    console.log(`  ${rankCol}${scoreCol}${typeCol}${lexCol}${semCol}${idCol}`);

    results.forEach((r, idx) => {
        const rank = String(idx + 1).padEnd(5);
        const score = r.score.toFixed(4).padEnd(8);
        const type = r.matchType.padEnd(10);
        const lex = (r.components.lexical != null ? r.components.lexical.toFixed(3) : '   -   ').padEnd(9);
        const sem = (r.components.semantic != null ? r.components.semantic.toFixed(3) : '   -   ').padEnd(10);
        const id = r.recordId.padEnd(38);
        console.log(`  ${rank}${score}${type}${lex}${sem}${id}`);
    });
}

async function lookupRecordNames(entityName: string, recordIds: string[], contextUser: any): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (recordIds.length === 0) return map;
    const escaped = recordIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    const rv = (await import('@memberjunction/core')).RunView;
    const r = await new rv().RunView<{ ID: string; Name: string }>({
        EntityName: entityName,
        ExtraFilter: `ID IN (${escaped})`,
        Fields: ['ID', 'Name'],
        ResultType: 'simple',
        MaxRows: recordIds.length,
    }, contextUser);
    if (r.Success) {
        for (const row of (r.Results ?? [])) {
            map.set(row.ID, row.Name);
        }
    }
    return map;
}

async function main(): Promise<void> {
    const args = parseArgs();
    console.log(`\nTest SearchEntity\n${'='.repeat(78)}`);
    console.log(`Entity     : ${args.entityName}`);
    console.log(`Search     : "${args.searchText}"`);
    console.log(`TopK       : ${args.topK}`);

    const { provider, contextUser, pool } = await bootstrapProvider();
    console.log(`ContextUser: ${contextUser.Name} (${contextUser.Email})`);

    // Pre-warm AIEngine so the semantic pass doesn't pay the model-load cost
    // inside its first SearchEntity call (and so any startup error surfaces
    // clearly before we time the searches).
    console.log('\nWarming AIEngine + LocalEmbedding model (gte-small)...');
    const warmStart = Date.now();
    await AIEngine.Instance.Config(false, contextUser);
    await AIEngine.Instance.EmbedTextLocal('warmup');
    console.log(`  ready in ${Date.now() - warmStart}ms`);

    const baseParams = (mode: 'lexical' | 'semantic' | 'hybrid'): SearchEntityParams => ({
        entityName: args.entityName,
        searchText: args.searchText,
        options: { mode, topK: args.topK, contextUser },
    });

    await runSearch(provider, baseParams('lexical'), 'Lexical only');
    await runSearch(provider, baseParams('semantic'), 'Semantic only');
    await runSearch(provider, baseParams('hybrid'), 'Hybrid (default RRF blend)');

    // Resolve names for the hybrid top-N so the output is readable.
    console.log('\nLooking up record names for hybrid top-N...');
    const hybridResults: EntitySearchResult[] = await provider.SearchEntity(baseParams('hybrid'));
    const nameMap = await lookupRecordNames(args.entityName, hybridResults.map(r => r.recordId), contextUser);
    console.log('─'.repeat(78));
    console.log(`▶ Hybrid with names`);
    console.log('─'.repeat(78));
    hybridResults.forEach((r, idx) => {
        const rank = String(idx + 1).padEnd(5);
        const score = r.score.toFixed(4).padEnd(8);
        const type = r.matchType.padEnd(10);
        const name = nameMap.get(r.recordId) ?? '(name not found)';
        console.log(`  ${rank}${score}${type}${name}`);
    });

    await pool.close();
    console.log('\n✅ Done.');
}

main().catch(err => {
    console.error('❌ Error:', err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
});
