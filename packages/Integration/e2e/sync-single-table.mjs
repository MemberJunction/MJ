#!/usr/bin/env node
/**
 * Sync a single entity map by ExternalObjectName.
 *
 * Usage:
 *   node packages/Integration/e2e/sync-single-table.mjs <integration> <externalObjectName>
 *
 * Example:
 *   node packages/Integration/e2e/sync-single-table.mjs ym DuesTransactions
 *
 * This works by temporarily disabling all other entity maps for the integration,
 * running the sync, then re-enabling them.
 */

import 'dotenv/config';
import sql from 'mssql';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '1433', 10);
const DB_USER = process.env.DB_USERNAME || 'sa';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_DATABASE || 'MJ_5_7_0';
const MJ_SCHEMA = process.env.MJ_CORE_SCHEMA || '__mj';

const integrationArg = process.argv[2]; // 'ym' or 'hubspot'
const objectName = process.argv[3];     // e.g. 'DuesTransactions'

if (!integrationArg || !objectName) {
    console.error('Usage: node sync-single-table.mjs <ym|hubspot> <ExternalObjectName>');
    console.error('Example: node sync-single-table.mjs ym DuesTransactions');
    process.exit(1);
}

const integrationLookup = {
    ym: 'yourmembership',
    hubspot: 'hubspot',
};
const integrationKey = integrationLookup[integrationArg] || integrationArg;

async function main() {
    console.log(`Sync single table: ${objectName} from ${integrationArg}`);
    console.log(`Date: ${new Date().toISOString()}\n`);

    // 1. Connect to SQL Server
    const pool = new sql.ConnectionPool({
        server: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASS,
        database: DB_NAME,
        options: { encrypt: false, trustServerCertificate: true },
        pool: { max: 20, min: 2, idleTimeoutMillis: 30000 },
    });
    await pool.connect();
    console.log(`Connected to ${DB_HOST}:${DB_PORT}/${DB_NAME}`);

    // 2. Find the CompanyIntegration
    const ciResult = await pool.request().query(`
        SELECT ci.ID, i.Name
        FROM ${MJ_SCHEMA}.CompanyIntegration ci
        JOIN ${MJ_SCHEMA}.Integration i ON ci.IntegrationID = i.ID
        WHERE ci.IsActive = 1 AND LOWER(i.Name) = '${integrationKey}'
    `);
    if (ciResult.recordset.length === 0) {
        console.error(`No active integration found for: ${integrationKey}`);
        process.exit(1);
    }
    const companyIntegrationID = ciResult.recordset[0].ID;
    console.log(`CompanyIntegration: ${ciResult.recordset[0].Name} (${companyIntegrationID})`);

    // 3. Find all entity maps and identify which ones to temporarily disable
    const mapsResult = await pool.request().query(`
        SELECT ID, ExternalObjectName, SyncEnabled
        FROM ${MJ_SCHEMA}.CompanyIntegrationEntityMap
        WHERE CompanyIntegrationID = '${companyIntegrationID}'
        ORDER BY Priority
    `);

    console.log(`\nEntity maps for this integration:`);
    const mapsToDisable = [];
    let targetFound = false;
    for (const m of mapsResult.recordset) {
        const isTarget = m.ExternalObjectName.toLowerCase() === objectName.toLowerCase();
        const marker = isTarget ? ' <-- TARGET' : '';
        console.log(`  ${m.ExternalObjectName} (SyncEnabled=${m.SyncEnabled})${marker}`);
        if (isTarget) targetFound = true;
        if (!isTarget && m.SyncEnabled) {
            mapsToDisable.push(m.ID);
        }
    }

    if (!targetFound) {
        console.error(`\nNo entity map found with ExternalObjectName='${objectName}'`);
        console.error('Available names:', mapsResult.recordset.map(m => m.ExternalObjectName).join(', '));
        await pool.close();
        process.exit(1);
    }

    // 4. Bootstrap MJ runtime
    console.log('\n=== Bootstrapping MJ Runtime ===');
    const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } =
        await import('@memberjunction/sqlserver-dataprovider');
    const config = new SQLServerProviderConfigData(pool, MJ_SCHEMA, 0);
    await setupSQLServerClient(config);

    const { Metadata } = await import('@memberjunction/core');
    const md = new Metadata();
    console.log(`Metadata loaded: ${md.Entities.length} entities`);

    await import('@memberjunction/integration-connectors');
    console.log('Connectors registered');

    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) throw new Error('No system user found');
    console.log(`System user: ${systemUser.Name || systemUser.Email}\n`);

    // 5. Temporarily disable other maps
    if (mapsToDisable.length > 0) {
        const idList = mapsToDisable.map(id => `'${id}'`).join(',');
        await pool.request().query(`
            UPDATE ${MJ_SCHEMA}.CompanyIntegrationEntityMap
            SET SyncEnabled = 0
            WHERE ID IN (${idList})
        `);
        console.log(`Temporarily disabled ${mapsToDisable.length} other entity maps`);
    }

    // 6. Run the sync
    try {
        const { IntegrationEngine } = await import('@memberjunction/integration-engine');
        const orchestrator = IntegrationEngine.Instance;
        orchestrator.MaxBatchSize = 200;

        const startTime = Date.now();
        const result = await orchestrator.RunSync(
            companyIntegrationID,
            systemUser,
            'Manual',
            (progress) => {
                process.stdout.write(
                    `\r  [${objectName}] ${progress.RecordsProcessedInCurrentMap} records (${progress.PercentComplete}%)`
                );
            },
            (notification) => {
                console.log(`\n  ${notification.Event}: ${notification.Subject}`);
                if (notification.Severity !== 'Info') {
                    console.log(`  ${notification.Body}`);
                }
            }
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n\n--- ${objectName} Sync Results ---`);
        console.log(`  Success:   ${result.Success}`);
        console.log(`  Processed: ${result.RecordsProcessed}`);
        console.log(`  Created:   ${result.RecordsCreated}`);
        console.log(`  Updated:   ${result.RecordsUpdated}`);
        console.log(`  Skipped:   ${result.RecordsSkipped}`);
        console.log(`  Errors:    ${result.RecordsErrored}`);
        console.log(`  Duration:  ${elapsed}s`);

        if (result.Errors.length > 0) {
            console.log(`\n  First 10 errors:`);
            for (const err of result.Errors.slice(0, 10)) {
                console.log(`    [${err.ErrorCode}] ${err.ExternalID}: ${err.ErrorMessage}`);
            }
        }
    } finally {
        // 7. Re-enable the maps we disabled
        if (mapsToDisable.length > 0) {
            const idList = mapsToDisable.map(id => `'${id}'`).join(',');
            await pool.request().query(`
                UPDATE ${MJ_SCHEMA}.CompanyIntegrationEntityMap
                SET SyncEnabled = 1
                WHERE ID IN (${idList})
            `);
            console.log(`\nRe-enabled ${mapsToDisable.length} entity maps`);
        }
        await pool.close();
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
