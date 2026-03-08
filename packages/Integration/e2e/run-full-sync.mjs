#!/usr/bin/env node
/**
 * Run a full sync for a given integration using the MJ IntegrationEngine.
 *
 * Usage:
 *   node packages/Integration/e2e/run-full-sync.mjs ym
 *   node packages/Integration/e2e/run-full-sync.mjs hubspot
 */

import 'dotenv/config';
import sql from 'mssql';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '1433', 10);
const DB_USER = process.env.DB_USERNAME || 'sa';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_DATABASE || 'MJ_5_7_0';
const MJ_SCHEMA = process.env.MJ_CORE_SCHEMA || '__mj';

const integrationArg = process.argv[2];
if (!integrationArg) {
    console.error('Usage: node run-full-sync.mjs <ym|hubspot>');
    process.exit(1);
}

const integrationLookup = { ym: 'yourmembership', hubspot: 'hubspot' };
const integrationKey = integrationLookup[integrationArg] || integrationArg;

async function main() {
    console.log(`Full sync: ${integrationArg}`);
    console.log(`Date: ${new Date().toISOString()}\n`);

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

    // Find the CompanyIntegration
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

    // Check entity maps
    const mapsResult = await pool.request().query(`
        SELECT em.ExternalObjectName, em.SyncEnabled, e.Name AS EntityName
        FROM ${MJ_SCHEMA}.CompanyIntegrationEntityMap em
        JOIN ${MJ_SCHEMA}.Entity e ON em.EntityID = e.ID
        WHERE em.CompanyIntegrationID = '${companyIntegrationID}'
        ORDER BY em.Priority
    `);
    const enabledMaps = mapsResult.recordset.filter(m => m.SyncEnabled);
    console.log(`\n${enabledMaps.length} enabled entity maps:`);
    for (const m of enabledMaps) {
        console.log(`  ${m.ExternalObjectName} → ${m.EntityName}`);
    }

    // Bootstrap MJ runtime
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

    // Run the sync
    const { IntegrationEngine } = await import('@memberjunction/integration-engine');
    const orchestrator = IntegrationEngine.Instance;

    const startTime = Date.now();
    let currentObject = '';

    const result = await orchestrator.RunSync(
        companyIntegrationID,
        systemUser,
        'Manual',
        (progress) => {
            if (progress.CurrentEntityMapName !== currentObject) {
                if (currentObject) console.log(''); // newline after previous
                currentObject = progress.CurrentEntityMapName;
            }
            process.stdout.write(
                `\r  [${currentObject}] ${progress.RecordsProcessedInCurrentMap} records (${progress.PercentComplete}%)`
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
    console.log(`\n\n=== Sync Results ===`);
    console.log(`  Success:   ${result.Success}`);
    console.log(`  Processed: ${result.RecordsProcessed}`);
    console.log(`  Created:   ${result.RecordsCreated}`);
    console.log(`  Updated:   ${result.RecordsUpdated}`);
    console.log(`  Skipped:   ${result.RecordsSkipped}`);
    console.log(`  Errors:    ${result.RecordsErrored}`);
    console.log(`  Duration:  ${elapsed}s`);

    if (result.Errors.length > 0) {
        console.log(`\n  First 20 errors:`);
        for (const err of result.Errors.slice(0, 20)) {
            console.log(`    [${err.ErrorCode}] ${err.ExternalID}: ${err.ErrorMessage}`);
        }
    }

    // Show per-entity summary
    if (result.EntityResults) {
        console.log('\n=== Per-Entity Summary ===');
        for (const [entity, stats] of Object.entries(result.EntityResults)) {
            console.log(`  ${entity}: ${stats.Created} created, ${stats.Updated} updated, ${stats.Errored} errors`);
        }
    }

    await pool.close();
    process.exit(result.Success ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
