#!/usr/bin/env node
/**
 * Sync multiple specific tables sequentially.
 * Usage: node packages/Integration/e2e/sync-remaining.mjs
 */

import 'dotenv/config';
import sql from 'mssql';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '1433', 10);
const DB_USER = process.env.DB_USERNAME || 'sa';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_DATABASE || 'MJ_5_7_0';
const MJ_SCHEMA = process.env.MJ_CORE_SCHEMA || '__mj';

// Tables to sync: YM remaining 8, then all HubSpot
const YM_TABLES = ['Events', 'MemberTypes', 'Memberships', 'Groups', 'Products', 'DonationFunds', 'Certifications', 'InvoiceItems'];

async function main() {
    console.log('=== Sequential Multi-Table Sync ===');
    console.log(`Date: ${new Date().toISOString()}\n`);

    // 1. Connect
    const pool = new sql.ConnectionPool({
        server: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: DB_NAME,
        options: { encrypt: false, trustServerCertificate: true },
        pool: { max: 20, min: 2, idleTimeoutMillis: 30000 },
    });
    await pool.connect();
    console.log(`Connected to ${DB_HOST}:${DB_PORT}/${DB_NAME}`);

    // 2. Bootstrap MJ Runtime (once)
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

    // 3. Find integrations
    const ciResult = await pool.request().query(`
        SELECT ci.ID, i.Name
        FROM ${MJ_SCHEMA}.CompanyIntegration ci
        JOIN ${MJ_SCHEMA}.Integration i ON ci.IntegrationID = i.ID
        WHERE ci.IsActive = 1
        ORDER BY i.Name
    `);
    const integrations = {};
    for (const row of ciResult.recordset) {
        integrations[row.Name.toLowerCase()] = { id: row.ID, name: row.Name };
    }
    console.log('Active integrations:', Object.keys(integrations).join(', '));

    const { IntegrationEngine } = await import('@memberjunction/integration-engine');

    // 4. Sync YM remaining tables
    if (integrations['yourmembership']) {
        const ymCI = integrations['yourmembership'].id;
        console.log(`\n${'='.repeat(60)}`);
        console.log('PHASE 1: YourMembership remaining tables');
        console.log(`${'='.repeat(60)}`);

        for (const table of YM_TABLES) {
            await syncSingleTable(pool, ymCI, table, systemUser, IntegrationEngine);
        }
    }

    // 5. Sync all HubSpot tables
    if (integrations['hubspot']) {
        const hsCI = integrations['hubspot'].id;
        console.log(`\n${'='.repeat(60)}`);
        console.log('PHASE 2: HubSpot all tables');
        console.log(`${'='.repeat(60)}`);

        // Just run the full sync for HubSpot since no tables have been synced yet
        const orchestrator = IntegrationEngine.Instance;
        orchestrator.MaxBatchSize = 200;
        const startTime = Date.now();

        try {
            const result = await orchestrator.RunSync(hsCI, systemUser, 'Manual',
                (progress) => {
                    process.stdout.write(
                        `\r  [Map ${progress.EntityMapIndex + 1}/${progress.TotalEntityMaps}] ` +
                        `${progress.RecordsProcessedInCurrentMap} records (${progress.PercentComplete}%)`
                    );
                },
                (notification) => {
                    console.log(`\n  ${notification.Event}: ${notification.Subject}`);
                    if (notification.Severity !== 'Info') console.log(`  ${notification.Body}`);
                }
            );
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n\n--- HubSpot Sync Results ---`);
            console.log(`  Success: ${result.Success} | Created: ${result.RecordsCreated} | Updated: ${result.RecordsUpdated} | Errors: ${result.RecordsErrored} | Duration: ${elapsed}s`);
            if (result.Errors.length > 0) {
                console.log(`  First 5 errors:`);
                for (const err of result.Errors.slice(0, 5)) {
                    console.log(`    [${err.ErrorCode}] ${err.ExternalID}: ${err.ErrorMessage}`);
                }
            }
        } catch (err) {
            console.error(`\n  HubSpot FATAL: ${err.message}`);
        }
    }

    // 6. Verify
    console.log('\n\n=== Final Row Counts ===\n');
    const tables = [
        'YourMembership.Members', 'YourMembership.Events', 'YourMembership.MemberTypes',
        'YourMembership.Memberships', 'YourMembership.Groups', 'YourMembership.Products',
        'YourMembership.DonationFunds', 'YourMembership.Certifications',
        'YourMembership.InvoiceItems', 'YourMembership.DuesTransactions',
        'HubSpot.Contacts', 'HubSpot.Companies', 'HubSpot.Deals',
    ];
    for (const t of tables) {
        try {
            const r = await pool.request().query(`SELECT COUNT(*) AS cnt FROM [${t.replace('.', '].[')}]`);
            console.log(`  ${t.padEnd(35)}: ${r.recordset[0].cnt}`);
        } catch (e) {
            console.log(`  ${t.padEnd(35)}: ERROR - ${e.message}`);
        }
    }

    await pool.close();
    console.log('\nDone.');
    process.exit(0);
}

async function syncSingleTable(pool, companyIntegrationID, objectName, systemUser, IntegrationEngine) {
    console.log(`\n--- Syncing: ${objectName} ---`);

    // Find all entity maps, disable others temporarily
    const mapsResult = await pool.request().query(`
        SELECT ID, ExternalObjectName, SyncEnabled
        FROM ${MJ_SCHEMA}.CompanyIntegrationEntityMap
        WHERE CompanyIntegrationID = '${companyIntegrationID}'
    `);

    const mapsToDisable = [];
    for (const m of mapsResult.recordset) {
        if (m.ExternalObjectName.toLowerCase() !== objectName.toLowerCase() && m.SyncEnabled) {
            mapsToDisable.push(m.ID);
        }
    }

    // Disable others
    if (mapsToDisable.length > 0) {
        const idList = mapsToDisable.map(id => `'${id}'`).join(',');
        await pool.request().query(`
            UPDATE ${MJ_SCHEMA}.CompanyIntegrationEntityMap SET SyncEnabled = 0 WHERE ID IN (${idList})
        `);
    }

    try {
        const orchestrator = IntegrationEngine.Instance;
        orchestrator.MaxBatchSize = 200;
        const startTime = Date.now();

        const result = await orchestrator.RunSync(companyIntegrationID, systemUser, 'Manual',
            (progress) => {
                process.stdout.write(`\r  [${objectName}] ${progress.RecordsProcessedInCurrentMap} records (${progress.PercentComplete}%)`);
            },
            (notification) => {
                console.log(`\n  ${notification.Event}: ${notification.Subject}`);
                if (notification.Severity !== 'Info') console.log(`  ${notification.Body}`);
            }
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n  ${objectName}: Success=${result.Success} Created=${result.RecordsCreated} Updated=${result.RecordsUpdated} Errors=${result.RecordsErrored} (${elapsed}s)`);

        if (result.Errors.length > 0) {
            for (const err of result.Errors.slice(0, 3)) {
                console.log(`    [${err.ErrorCode}] ${err.ExternalID}: ${err.ErrorMessage}`);
            }
        }
    } finally {
        // Re-enable
        if (mapsToDisable.length > 0) {
            const idList = mapsToDisable.map(id => `'${id}'`).join(',');
            await pool.request().query(`
                UPDATE ${MJ_SCHEMA}.CompanyIntegrationEntityMap SET SyncEnabled = 1 WHERE ID IN (${idList})
            `);
        }
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
