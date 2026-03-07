#!/usr/bin/env node
/**
 * Full-Stack Integration Sync Test
 *
 * This script bootstraps the MJ server-side runtime (SQL Server data provider,
 * metadata, entity system) and runs the IntegrationOrchestrator against live
 * external APIs (YourMembership, HubSpot) using the real connector code,
 * field mapping engine, match engine, and entity persistence layer.
 *
 * Prerequisites:
 *   - SQL Server running with the MJ database
 *   - .env with DB_*, MRAA_YM_*, and HubSpot credentials in DB
 *   - Entity maps and field maps configured in __mj tables
 *   - Connector packages built (npm run build in connectors/)
 *
 * Usage:
 *   node packages/Integration/e2e/fullstack-sync-test.mjs [ym|hubspot|all]
 */

import 'dotenv/config';
import sql from 'mssql';

// ─── Environment ────────────────────────────────────────────────────────
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '1433', 10);
const DB_USER = process.env.DB_USERNAME || 'sa';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_DATABASE || 'MJ_5_7_0';
const MJ_SCHEMA = process.env.MJ_CORE_SCHEMA || '__mj';

const target = process.argv[2] || 'all'; // 'ym', 'hubspot', or 'all'

// ─── Bootstrap MJ Runtime ───────────────────────────────────────────────

async function bootstrapMJRuntime() {
    console.log('=== Bootstrapping MJ Server Runtime ===\n');

    // 1. Connect to SQL Server
    const pool = new sql.ConnectionPool({
        server: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASS,
        database: DB_NAME,
        options: {
            encrypt: false,
            trustServerCertificate: true,
        },
        pool: { max: 20, min: 2, idleTimeoutMillis: 30000 },
    });
    await pool.connect();
    console.log(`Connected to ${DB_HOST}:${DB_PORT}/${DB_NAME}`);

    // 2. Import and configure SQLServerDataProvider
    const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } =
        await import('@memberjunction/sqlserver-dataprovider');

    const config = new SQLServerProviderConfigData(pool, MJ_SCHEMA, 0);
    await setupSQLServerClient(config);

    const { Metadata } = await import('@memberjunction/core');
    const md = new Metadata();
    console.log(`Metadata loaded: ${md.Entities.length} entities\n`);

    // 3. Register connector classes (triggers @RegisterClass side effects)
    await import('@memberjunction/integration-connectors');
    console.log('Connectors registered');

    // 4. Get a system user for context
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
        throw new Error('No system user found in UserCache. Check DB User table.');
    }
    console.log(`Using system user: ${systemUser.Name || systemUser.Email} (ID: ${systemUser.ID})\n`);

    return { pool, systemUser };
}

// ─── Run Sync ───────────────────────────────────────────────────────────

async function runSync(companyIntegrationID, integrationName, contextUser) {
    const { IntegrationOrchestrator } = await import('@memberjunction/integration-engine');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`SYNCING: ${integrationName}`);
    console.log(`CompanyIntegrationID: ${companyIntegrationID}`);
    console.log(`${'='.repeat(60)}\n`);

    const orchestrator = new IntegrationOrchestrator();
    orchestrator.MaxBatchSize = 200;

    const startTime = Date.now();

    try {
        const result = await orchestrator.RunSync(
            companyIntegrationID,
            contextUser,
            'Manual',
            // Progress callback
            (progress) => {
                process.stdout.write(
                    `\r  [Map ${progress.EntityMapIndex + 1}/${progress.TotalEntityMaps}] ` +
                    `${progress.RecordsProcessedInCurrentMap} records processed (${progress.PercentComplete}%)`
                );
            },
            // Notification callback
            (notification) => {
                console.log(`\n  Notification: ${notification.Event} - ${notification.Subject}`);
                if (notification.Severity !== 'Info') {
                    console.log(`  Body:\n${notification.Body}`);
                }
            }
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n\n--- ${integrationName} Sync Results ---`);
        console.log(`  Success:    ${result.Success}`);
        console.log(`  Processed:  ${result.RecordsProcessed}`);
        console.log(`  Created:    ${result.RecordsCreated}`);
        console.log(`  Updated:    ${result.RecordsUpdated}`);
        console.log(`  Deleted:    ${result.RecordsDeleted}`);
        console.log(`  Skipped:    ${result.RecordsSkipped}`);
        console.log(`  Errors:     ${result.RecordsErrored}`);
        console.log(`  Duration:   ${elapsed}s`);

        if (result.Errors.length > 0) {
            console.log(`\n  First 5 errors:`);
            for (const err of result.Errors.slice(0, 5)) {
                console.log(`    [${err.ErrorCode}] ${err.ExternalID}: ${err.ErrorMessage}`);
            }
        }

        return result;
    } catch (err) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`\n  FATAL ERROR after ${elapsed}s: ${err.message}`);
        if (err.stack) console.error(`  Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
        return null;
    }
}

// ─── Verify Results ─────────────────────────────────────────────────────

async function verifyResults(pool) {
    console.log('\n\n=== Verification: Row Counts ===\n');

    const queries = [
        { label: 'YM Members', query: 'SELECT COUNT(*) AS cnt FROM [YourMembership].[Members]' },
        { label: 'YM Events', query: 'SELECT COUNT(*) AS cnt FROM [YourMembership].[Events]' },
        { label: 'YM MemberTypes', query: 'SELECT COUNT(*) AS cnt FROM [YourMembership].[MemberTypes]' },
        { label: 'YM Memberships', query: 'SELECT COUNT(*) AS cnt FROM [YourMembership].[Memberships]' },
        { label: 'YM Groups', query: 'SELECT COUNT(*) AS cnt FROM [YourMembership].[Groups]' },
        { label: 'YM Products', query: 'SELECT COUNT(*) AS cnt FROM [YourMembership].[Products]' },
        { label: 'YM DonationFunds', query: 'SELECT COUNT(*) AS cnt FROM [YourMembership].[DonationFunds]' },
        { label: 'YM Certs', query: 'SELECT COUNT(*) AS cnt FROM [YourMembership].[Certifications]' },
        { label: 'HS Contacts', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[Contacts]' },
        { label: 'HS Companies', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[Companies]' },
        { label: 'HS Deals', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[Deals]' },
        { label: 'HS Tickets', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[Tickets]' },
        { label: 'HS Products', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[Products]' },
        { label: 'HS LineItems', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[LineItems]' },
        { label: 'HS Quotes', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[Quotes]' },
        { label: 'HS Calls', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[Calls]' },
        { label: 'HS Emails', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[Emails]' },
        { label: 'HS Notes', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[Notes]' },
        { label: 'HS Tasks', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[Tasks]' },
        { label: 'HS Meetings', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[Meetings]' },
        { label: 'HS Feedback', query: 'SELECT COUNT(*) AS cnt FROM [HubSpot].[FeedbackSubmissions]' },
        { label: 'Record Maps', query: 'SELECT COUNT(*) AS cnt FROM [__mj].[CompanyIntegrationRecordMap]' },
        { label: 'Sync Runs', query: 'SELECT COUNT(*) AS cnt FROM [__mj].[CompanyIntegrationRun]' },
    ];

    for (const { label, query } of queries) {
        try {
            const result = await pool.request().query(query);
            console.log(`  ${label.padEnd(15)}: ${result.recordset[0].cnt}`);
        } catch (e) {
            console.log(`  ${label.padEnd(15)}: ERROR - ${e.message}`);
        }
    }

    // Sample records
    console.log('\n=== Sample Records ===\n');

    const samples = [
        { label: 'YM Members (first 3)', query: 'SELECT TOP 3 SourceRecordID, FirstName, LastName, EmailAddr FROM [YourMembership].[Members]' },
        { label: 'HS Contacts (first 3)', query: 'SELECT TOP 3 SourceRecordID, email, firstname, lastname FROM [HubSpot].[Contacts]' },
    ];

    for (const { label, query } of samples) {
        try {
            const result = await pool.request().query(query);
            console.log(`  ${label}:`);
            for (const row of result.recordset) {
                console.log(`    ${JSON.stringify(row)}`);
            }
        } catch (e) {
            console.log(`  ${label}: ERROR - ${e.message}`);
        }
    }
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
    console.log('Full-Stack Integration Sync Test');
    console.log(`Target: ${target}`);
    console.log(`Date: ${new Date().toISOString()}\n`);

    const { pool, systemUser } = await bootstrapMJRuntime();

    // Look up CompanyIntegration IDs from the DB
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

    const results = {};

    // Run YM sync
    if ((target === 'ym' || target === 'all') && integrations['yourmembership']) {
        results.ym = await runSync(
            integrations['yourmembership'].id,
            'YourMembership',
            systemUser
        );
    }

    // Run HubSpot sync
    if ((target === 'hubspot' || target === 'all') && integrations['hubspot']) {
        results.hubspot = await runSync(
            integrations['hubspot'].id,
            'HubSpot',
            systemUser
        );
    }

    // Verify
    await verifyResults(pool);

    // Summary
    console.log('\n=== Final Summary ===\n');
    for (const [name, result] of Object.entries(results)) {
        if (result) {
            const status = result.Success ? 'SUCCESS' : 'FAILED';
            console.log(`  ${name}: ${status} - ${result.RecordsCreated} created, ${result.RecordsUpdated} updated, ${result.RecordsErrored} errors`);
        } else {
            console.log(`  ${name}: FATAL ERROR`);
        }
    }

    await pool.close();
    console.log('\nDone.');
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
