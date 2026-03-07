#!/usr/bin/env node
/**
 * Sync only the 48 NEW YM tables (skips the 10 original tables that already have data).
 * Also allows skipping slow per-member endpoints via --skip-slow flag.
 *
 * Usage:
 *   node packages/Integration/e2e/sync-new-tables.mjs
 *   node packages/Integration/e2e/sync-new-tables.mjs --skip-slow
 */

import 'dotenv/config';
import sql from 'mssql';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '1433', 10);
const DB_USER = process.env.DB_USERNAME || 'sa';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_DATABASE || 'MJ_5_7_0';
const MJ_SCHEMA = process.env.MJ_CORE_SCHEMA || '__mj';

const skipSlow = process.argv.includes('--skip-slow');

// The 10 original tables that already have data
const ORIGINAL_TABLES = new Set([
    'Members', 'Events', 'MemberTypes', 'Memberships', 'Groups',
    'Products', 'DonationFunds', 'Certifications', 'InvoiceItems', 'DuesTransactions'
]);

// Per-member endpoints that iterate all 15,000+ members (extremely slow with rate limiting)
const SLOW_PER_MEMBER = new Set([
    'MemberGroups', 'Connections', 'DonationHistory', 'EngagementScores',
    'MembersProfiles', 'MemberNetworks', 'MemberFavorites', 'MemberReferrals',
    'MemberSubAccounts', 'PeopleIDs',
]);

async function main() {
    const mode = skipSlow ? 'FAST (skip per-member endpoints)' : 'FULL';
    console.log(`Sync NEW YM tables [${mode}]`);
    console.log(`Date: ${new Date().toISOString()}\n`);

    const pool = new sql.ConnectionPool({
        server: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASS,
        database: DB_NAME,
        options: { encrypt: false, trustServerCertificate: true },
        pool: { max: 20, min: 2, idleTimeoutMillis: 30000 },
        requestTimeout: 60000,
    });
    await pool.connect();
    console.log(`Connected to ${DB_HOST}:${DB_PORT}/${DB_NAME}`);

    // Find the CompanyIntegration
    const ciResult = await pool.request().query(`
        SELECT ci.ID, i.Name
        FROM ${MJ_SCHEMA}.CompanyIntegration ci
        JOIN ${MJ_SCHEMA}.Integration i ON ci.IntegrationID = i.ID
        WHERE ci.IsActive = 1 AND LOWER(i.Name) = 'yourmembership'
    `);
    if (ciResult.recordset.length === 0) {
        console.error('No active YM integration found');
        process.exit(1);
    }
    const companyIntegrationID = ciResult.recordset[0].ID;
    console.log(`CompanyIntegration: ${ciResult.recordset[0].Name} (${companyIntegrationID})`);

    // Find entity maps to disable
    const mapsResult = await pool.request().query(`
        SELECT em.ID, em.ExternalObjectName, em.SyncEnabled
        FROM ${MJ_SCHEMA}.CompanyIntegrationEntityMap em
        WHERE em.CompanyIntegrationID = '${companyIntegrationID}'
        ORDER BY em.Priority
    `);

    const mapsToDisable = [];
    let enabledCount = 0;
    for (const m of mapsResult.recordset) {
        const shouldSkip = ORIGINAL_TABLES.has(m.ExternalObjectName)
            || (skipSlow && SLOW_PER_MEMBER.has(m.ExternalObjectName));
        if (shouldSkip) {
            if (m.SyncEnabled) mapsToDisable.push(m.ID);
            const reason = ORIGINAL_TABLES.has(m.ExternalObjectName) ? 'original' : 'slow-per-member';
            console.log(`  SKIP (${reason}): ${m.ExternalObjectName}`);
        } else {
            enabledCount++;
        }
    }
    console.log(`\n${enabledCount} tables to sync, ${mapsToDisable.length} tables to skip`);

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

    // Temporarily disable skipped maps
    if (mapsToDisable.length > 0) {
        const idList = mapsToDisable.map(id => `'${id}'`).join(',');
        await pool.request().query(`
            UPDATE ${MJ_SCHEMA}.CompanyIntegrationEntityMap
            SET SyncEnabled = 0
            WHERE ID IN (${idList})
        `);
        console.log(`Temporarily disabled ${mapsToDisable.length} entity maps`);
    }

    // Run the sync
    try {
        const { IntegrationOrchestrator } = await import('@memberjunction/integration-engine');
        const orchestrator = new IntegrationOrchestrator();

        const startTime = Date.now();
        let currentObject = '';

        const result = await orchestrator.RunSync(
            companyIntegrationID,
            systemUser,
            'Manual',
            (progress) => {
                if (progress.CurrentEntityMapName !== currentObject) {
                    if (currentObject) console.log('');
                    currentObject = progress.CurrentEntityMapName || 'unknown';
                    console.log(`\n--- Syncing: ${currentObject} ---`);
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

        if (result.EntityResults) {
            console.log('\n=== Per-Entity Summary ===');
            for (const [entity, stats] of Object.entries(result.EntityResults)) {
                console.log(`  ${entity}: ${stats.Created} created, ${stats.Updated} updated, ${stats.Errored} errors`);
            }
        }
    } finally {
        // Re-enable the maps we disabled
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
