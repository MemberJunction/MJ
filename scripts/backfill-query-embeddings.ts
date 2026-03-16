/**
 * Backfill Query Embeddings
 *
 * Regenerates embeddings for all approved queries using composite text
 * (Name + UserQuestion + Description) instead of Description-only.
 *
 * Generates embeddings directly via AIEngine and writes them with raw SQL,
 * bypassing BaseEntity's dirty-check (which skips Save when no fields changed).
 *
 * Usage (from repo root):
 *   npx tsx scripts/backfill-query-embeddings.ts
 *
 * Options:
 *   --dry-run    Show which queries would be updated without saving
 */
import { RunView } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { AIEngine } from '@memberjunction/aiengine';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';

// Register entity subclasses and AI providers.
// Use server-bootstrap-lite to avoid @memberjunction/server strict config validation.
import '@memberjunction/server-bootstrap-lite';
import '@memberjunction/ai-openai';
import '@memberjunction/ai-anthropic';
import '@memberjunction/ai-groq';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const dryRun = process.argv.includes('--dry-run');

interface QueryRow {
    ID: string;
    Name: string;
    Description: string;
    UserQuestion: string;
    EmbeddingVector: string | null;
}

function buildCompositeText(q: QueryRow): string {
    return [q.Name || '', q.UserQuestion || '', q.Description || '']
        .filter(p => p.trim().length > 0)
        .join(' | ');
}

async function main(): Promise<void> {
    console.log(`Backfill Query Embeddings${dryRun ? ' (DRY RUN)' : ''}`);
    console.log('='.repeat(50));

    // Load config via cosmiconfig
    const { cosmiconfig } = await import('cosmiconfig');
    const explorer = cosmiconfig('mj');
    const configResult = await explorer.search();
    if (!configResult) {
        throw new Error('No mj.config.cjs found. Run from the repo root.');
    }
    const config = configResult.config;

    // Connect to SQL Server
    const pool = new sql.ConnectionPool({
        server: config.dbHost || process.env.DB_HOST || 'localhost',
        port: parseInt(config.dbPort || process.env.DB_PORT || '1433', 10),
        database: config.dbDatabase || process.env.DB_DATABASE,
        user: config.dbUsername || process.env.DB_USERNAME,
        password: config.dbPassword || process.env.DB_PASSWORD,
        options: {
            encrypt: true,
            trustServerCertificate: true,
            enableArithAbort: true,
        },
        pool: { max: 5, min: 1, idleTimeoutMillis: 30000 },
    });

    await pool.connect();
    console.log('Connected to database');

    // Initialize MJ provider
    const coreSchema = config.coreSchema || '__mj';
    const providerConfig = new SQLServerProviderConfigData(pool, coreSchema, 180000);
    await setupSQLServerClient(providerConfig);
    console.log('MJ provider initialized');

    // Get context user
    const contextUser = UserCache.Instance.GetSystemUser();
    if (!contextUser) {
        throw new Error('No system user found in UserCache');
    }
    console.log(`Context user: ${contextUser.Name}`);

    // Initialize AIEngine for embedding generation
    await AIEngine.Instance.Config(false, contextUser);
    console.log('AIEngine initialized');

    // Load all approved queries (simple result — we only need a few fields)
    const rv = new RunView();
    const result = await rv.RunView<QueryRow>({
        EntityName: 'MJ: Queries',
        ExtraFilter: "Status = 'Approved'",
        Fields: ['ID', 'Name', 'Description', 'UserQuestion', 'EmbeddingVector'],
        OrderBy: 'Name ASC',
        ResultType: 'simple',
    }, contextUser);

    if (!result.Success) {
        throw new Error(`RunView failed: ${result.ErrorMessage}`);
    }

    const queries = result.Results;
    console.log(`Found ${queries.length} approved queries to re-embed\n`);

    if (dryRun) {
        for (const q of queries) {
            const hasEmbedding = q.EmbeddingVector ? 'has embedding' : 'no embedding';
            const composite = buildCompositeText(q);
            console.log(`  [dry-run] ${q.Name} (${hasEmbedding})`);
            console.log(`            composite: "${composite.substring(0, 80)}${composite.length > 80 ? '...' : ''}"`);
        }
        console.log(`\nDry run complete. ${queries.length} queries would be re-embedded.`);
        await pool.close();
        process.exit(0);
    }

    // Generate embeddings and write directly via SQL
    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;

    for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        const compositeText = buildCompositeText(q);

        if (compositeText.length === 0) {
            skipCount++;
            console.log(`  [${i + 1}/${queries.length}] - ${q.Name} — skipped (no text to embed)`);
            continue;
        }

        try {
            const embedResult = await AIEngine.Instance.EmbedTextLocal(compositeText);

            if (!embedResult?.result?.vector || !embedResult?.model?.ID) {
                errorCount++;
                console.error(`  [${i + 1}/${queries.length}] x ${q.Name} — embedding returned no vector`);
                continue;
            }

            const vectorJson = JSON.stringify(embedResult.result.vector);
            const modelId = embedResult.model.ID;

            // Write directly to DB, bypassing entity dirty-check
            await pool.request()
                .input('vector', sql.NVarChar(sql.MAX), vectorJson)
                .input('modelId', sql.UniqueIdentifier, modelId)
                .input('id', sql.UniqueIdentifier, q.ID)
                .query(`UPDATE [${coreSchema}].[Query] SET EmbeddingVector = @vector, EmbeddingModelID = @modelId WHERE ID = @id`);

            successCount++;
            console.log(`  [${i + 1}/${queries.length}] ok ${q.Name}`);
        } catch (err) {
            errorCount++;
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`  [${i + 1}/${queries.length}] x ${q.Name} — ${msg}`);
        }
    }

    console.log(`\nDone: ${successCount} succeeded, ${errorCount} failed, ${skipCount} skipped out of ${queries.length}`);
    await pool.close();
    process.exit(0);
}

main().catch((err) => {
    console.error('\nFatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
});
