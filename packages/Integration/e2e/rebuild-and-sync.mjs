#!/usr/bin/env node
/**
 * rebuild-and-sync.mjs
 * ====================
 * Complete pipeline: schema build → DDL exec → CodeGen → entity maps → sync → verify.
 * Uses MJ runtime for sync. Direct SQL for DDL and map creation.
 *
 * Usage: node packages/Integration/e2e/rebuild-and-sync.mjs [ym|hubspot|all]
 */

import 'dotenv/config';
import sql from 'mssql';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '1433', 10);
const DB_USER = process.env.DB_USERNAME || 'sa';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_DATABASE || 'MJ_5_7_0';
const MJ_SCHEMA = process.env.MJ_CORE_SCHEMA || '__mj';

const targetArg = process.argv[2] || 'all';
// Normalize target aliases
const TARGET_ALIASES = { ym: 'yourmembership', hubspot: 'hubspot' };
const target = TARGET_ALIASES[targetArg] || targetArg;

// ─── Step 1: Generate DDL + additionalSchemaInfo using SchemaBuilder ─────

async function generateSchema(pool) {
    console.log('\n=== Step 1: Generate DDL + additionalSchemaInfo ===\n');

    const { DDLGenerator, SoftFKConfigEmitter } = await import('@memberjunction/integration-schema-builder');
    const { ConnectorFactory } = await import('@memberjunction/integration-engine');
    await import('@memberjunction/integration-connectors');

    const { Metadata, RunView, CompositeKey } = await import('@memberjunction/core');
    const { UserCache } = await import('@memberjunction/sqlserver-dataprovider');
    const md = new Metadata();
    const systemUser = UserCache.Instance.GetSystemUser();

    // Look up active integrations
    const ciResult = await pool.request().query(`
        SELECT ci.ID, i.Name, i.ID AS IntegrationID, ci.CredentialID
        FROM ${MJ_SCHEMA}.CompanyIntegration ci
        JOIN ${MJ_SCHEMA}.Integration i ON ci.IntegrationID = i.ID
        WHERE ci.IsActive = 1
    `);

    const integrations = {};
    for (const row of ciResult.recordset) {
        integrations[row.Name.toLowerCase()] = {
            id: row.ID,
            name: row.Name,
            integrationID: row.IntegrationID,
            credentialID: row.CredentialID,
        };
    }

    const allTargetConfigs = [];
    const allSourceSchemas = { Objects: [] };
    const ddlGen = new DDLGenerator();
    const allDDL = [];
    const schemasCreated = new Set();

    for (const [key, integ] of Object.entries(integrations)) {
        if (target !== 'all' && !key.startsWith(target)) continue;

        console.log(`  Discovering schema for: ${integ.name}`);

        // Get the connector via Integration entity
        const rv = new RunView();
        const integResult = await rv.RunView({
            EntityName: 'MJ: Integrations',
            ExtraFilter: `ID='${integ.integrationID}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        }, systemUser);

        if (!integResult.Success || integResult.Results.length === 0) {
            console.error(`  SKIP: Integration entity not found for ${integ.name}`);
            continue;
        }

        const connector = ConnectorFactory.Resolve(integResult.Results[0]);

        // Build CI entity object for IntrospectSchema
        const ciObj = await md.GetEntityObject('MJ: Company Integrations', systemUser);
        const ciKey = new CompositeKey([{ FieldName: 'ID', Value: integ.id }]);
        await ciObj.InnerLoad(ciKey);

        // Introspect
        const sourceSchema = await connector.IntrospectSchema(ciObj, systemUser);
        console.log(`    Found ${sourceSchema.Objects.length} objects`);

        // Determine schema name
        const schemaName = integ.name === 'YourMembership' ? 'YourMembership' : integ.name;

        // Build target configs from source schema
        const integConfigs = [];
        for (const obj of sourceSchema.Objects) {
            const targetConfig = {
                SourceObjectName: obj.ExternalName,
                SchemaName: schemaName,
                TableName: obj.ExternalLabel.replace(/\s+/g, ''),
                EntityName: `${obj.ExternalLabel}`,
                Description: obj.Description || `${obj.ExternalLabel} from ${integ.name}`,
                PrimaryKeyFields: (obj.PrimaryKeyFields || []).map(f => sanitizeColumnName(f)),
                Columns: obj.Fields
                    .map(f => ({
                        SourceFieldName: f.Name,
                        TargetColumnName: sanitizeColumnName(f.Name),
                        TargetSqlType: mapSourceTypeToSql(f.SourceType, f.MaxLength),
                        IsNullable: !f.IsRequired,
                        MaxLength: f.MaxLength,
                        Precision: f.Precision,
                        Scale: f.Scale,
                        DefaultValue: null,
                        Description: f.Description || f.Label,
                    })),
                SoftForeignKeys: [],
            };
            integConfigs.push(targetConfig);
        }

        allTargetConfigs.push(...integConfigs);
        allSourceSchemas.Objects.push(...sourceSchema.Objects);

        // Generate DDL for this integration's tables
        if (!schemasCreated.has(schemaName)) {
            allDDL.push(`IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '${schemaName}')\n    EXEC('CREATE SCHEMA [${schemaName}]');\nGO`);
            schemasCreated.add(schemaName);
        }

        for (const config of integConfigs) {
            allDDL.push(ddlGen.GenerateCreateTable(config, 'sqlserver'));
        }
    }

    // Generate additionalSchemaInfo using SoftFKConfigEmitter
    const emitter = new SoftFKConfigEmitter();
    let config = emitter.ParseExistingConfig(null);
    config = emitter.MergeSoftPKs(config, allTargetConfigs);
    const softFKs = emitter.GenerateConfigEntries(allSourceSchemas, allTargetConfigs);
    if (softFKs.length > 0) {
        config = emitter.MergeSchemaConfig(config, softFKs);
    }

    const integDir = resolve(REPO_ROOT, 'metadata/integrations');
    mkdirSync(integDir, { recursive: true });
    const additionalSchemaInfoPath = resolve(integDir, 'additionalSchemaInfo.json');
    writeFileSync(additionalSchemaInfoPath, JSON.stringify(config, null, 4) + '\n');
    console.log(`\n  Written additionalSchemaInfo.json (${Object.keys(config).length} schemas, ${softFKs.length} soft FKs)`);

    return { allDDL, allTargetConfigs, integrations };
}

function sanitizeColumnName(name) {
    // Replace any chars that aren't valid SQL identifiers
    return name.replace(/[^A-Za-z0-9_]/g, '_');
}

function mapSourceTypeToSql(sourceType, maxLength) {
    switch (sourceType?.toLowerCase()) {
        case 'string': return `NVARCHAR(${maxLength || 255})`;
        case 'text':
        case 'textarea':
        case 'html':
        case 'json': return 'NVARCHAR(MAX)';
        case 'integer':
        case 'int': return 'INT';
        case 'biginteger':
        case 'bigint': return 'BIGINT';
        case 'number':
        case 'float':
        case 'double':
        case 'decimal': return 'DECIMAL(18,4)';
        case 'boolean':
        case 'bool': return 'BIT';
        case 'date': return 'DATE';
        case 'datetime':
        case 'timestamp': return 'DATETIMEOFFSET';
        case 'enumeration':
        case 'enum': return `NVARCHAR(${maxLength || 100})`;
        default: return `NVARCHAR(${maxLength || 255})`;
    }
}

// ─── Step 2: Execute DDL ────────────────────────────────────────────────

async function executeDDL(pool, allDDL) {
    console.log('\n=== Step 2: Execute DDL ===\n');

    for (const ddl of allDDL) {
        // Split on GO for batch execution
        const batches = ddl.split(/\nGO\n?/i).filter(b => b.trim());
        for (const batch of batches) {
            try {
                await pool.request().query(batch);
            } catch (e) {
                if (!e.message.includes('already exists')) {
                    console.error(`  DDL Error: ${e.message}`);
                    console.error(`  SQL: ${batch.slice(0, 200)}...`);
                }
            }
        }
    }

    // Verify tables created
    const tables = await pool.request().query(`
        SELECT TABLE_SCHEMA, TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA IN ('YourMembership','HubSpot') AND TABLE_TYPE='BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    console.log(`  Created ${tables.recordset.length} tables:`);
    for (const t of tables.recordset) {
        console.log(`    ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);
    }

    return tables.recordset.length;
}

// ─── Step 3: Run CodeGen ────────────────────────────────────────────────

async function runCodeGen() {
    console.log('\n=== Step 3: Run CodeGen ===\n');
    try {
        execSync('npx mj codegen', {
            cwd: REPO_ROOT,
            stdio: 'inherit',
            timeout: 600000, // 10 min
        });
        console.log('  CodeGen complete');
    } catch (e) {
        console.error('  CodeGen failed:', e.message);
        throw e;
    }
}

// ─── Step 4: Create Entity Maps + Field Maps ────────────────────────────

async function createMaps(pool, targetConfigs, integrations) {
    console.log('\n=== Step 4: Create Entity Maps + Field Maps ===\n');

    const { Metadata } = await import('@memberjunction/core');
    const md = new Metadata();
    // Refresh metadata after CodeGen
    await md.Refresh();

    console.log(`  Refreshed metadata: ${md.Entities.length} entities`);

    for (const [key, integ] of Object.entries(integrations)) {
        if (target !== 'all' && !key.startsWith(target)) continue;

        const schemaName = integ.name === 'YourMembership' ? 'YourMembership' : integ.name;
        const configs = targetConfigs.filter(c => c.SchemaName === schemaName);

        console.log(`  Creating maps for ${integ.name} (${configs.length} objects)`);

        for (let i = 0; i < configs.length; i++) {
            const config = configs[i];

            // Find the entity created by CodeGen
            const entity = md.Entities.find(
                e => e.SchemaName === config.SchemaName && e.BaseTable === config.TableName
            );
            if (!entity) {
                console.log(`    SKIP: Entity not found for ${config.SchemaName}.${config.TableName}`);
                continue;
            }

            // Check if entity map already exists
            const existing = await pool.request().query(`
                SELECT ID FROM ${MJ_SCHEMA}.CompanyIntegrationEntityMap
                WHERE CompanyIntegrationID='${integ.id}' AND EntityID='${entity.ID}'
            `);
            if (existing.recordset.length > 0) {
                console.log(`    EXISTS: ${config.TableName} (map ${existing.recordset[0].ID})`);
                continue;
            }

            // Create entity map
            const mapResult = await pool.request().query(`
                INSERT INTO ${MJ_SCHEMA}.CompanyIntegrationEntityMap
                    (CompanyIntegrationID, EntityID, ExternalObjectName, SyncDirection, SyncEnabled, Status, Priority, ConflictResolution, DeleteBehavior)
                OUTPUT INSERTED.ID
                VALUES ('${integ.id}', '${entity.ID}', '${config.SourceObjectName}', 'Pull', 1, 'Active', ${i + 1}, 'SourceWins', 'SoftDelete')
            `);
            const mapID = mapResult.recordset[0].ID;

            // Create field maps for ALL columns (including PK fields, which flow through normal mapping)
            const fieldMaps = config.Columns.map(c => ({
                src: c.SourceFieldName,
                dest: c.TargetColumnName,
            }));

            for (let j = 0; j < fieldMaps.length; j++) {
                const f = fieldMaps[j];
                const escapedSrc = f.src.replace(/'/g, "''");
                const escapedDest = f.dest.replace(/'/g, "''");
                await pool.request().query(`
                    INSERT INTO ${MJ_SCHEMA}.CompanyIntegrationFieldMap
                        (EntityMapID, SourceFieldName, DestinationFieldName, IsKeyField, Status, Priority)
                    VALUES ('${mapID}', '${escapedSrc}', '${escapedDest}', 0, 'Active', ${j + 1})
                `);
            }

            console.log(`    CREATED: ${config.TableName} → ${entity.Name} (${fieldMaps.length} fields)`);
        }
    }
}

// ─── Step 5: Run Sync ───────────────────────────────────────────────────

async function runSync(pool) {
    console.log('\n=== Step 5: Run Integration Sync ===\n');

    const { UserCache } = await import('@memberjunction/sqlserver-dataprovider');
    const { IntegrationOrchestrator } = await import('@memberjunction/integration-engine');

    const systemUser = UserCache.Instance.GetSystemUser();

    // Look up active integrations
    const ciResult = await pool.request().query(`
        SELECT ci.ID, i.Name
        FROM ${MJ_SCHEMA}.CompanyIntegration ci
        JOIN ${MJ_SCHEMA}.Integration i ON ci.IntegrationID = i.ID
        WHERE ci.IsActive = 1
    `);

    const results = {};

    for (const row of ciResult.recordset) {
        const key = row.Name.toLowerCase();
        if (target !== 'all' && !key.startsWith(target)) continue;

        console.log(`\n  Syncing: ${row.Name} (${row.ID})`);
        const orchestrator = new IntegrationOrchestrator();

        const startTime = Date.now();
        try {
            const result = await orchestrator.RunSync(
                row.ID,
                systemUser,
                'Manual',
                (progress) => {
                    process.stdout.write(
                        `\r  [Map ${progress.EntityMapIndex + 1}/${progress.TotalEntityMaps}] ` +
                        `${progress.RecordsProcessedInCurrentMap} records (${progress.PercentComplete}%)`
                    );
                },
                (notification) => {
                    console.log(`\n  ${notification.Event}: ${notification.Subject}`);
                }
            );
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n  Done: ${result.RecordsCreated} created, ${result.RecordsUpdated} updated, ${result.RecordsErrored} errors (${elapsed}s)`);
            results[row.Name] = result;
        } catch (err) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.error(`\n  FATAL after ${elapsed}s: ${err.message}`);
            if (err.stack) console.error(err.stack);
            results[row.Name] = null;
        }
    }

    return results;
}

// ─── Step 6: Verify ─────────────────────────────────────────────────────

async function verify(pool) {
    console.log('\n\n=== Step 6: Verification ===\n');

    // Row counts
    const tables = await pool.request().query(`
        SELECT TABLE_SCHEMA, TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA IN ('YourMembership','HubSpot') AND TABLE_TYPE='BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);

    let allPassed = true;

    console.log('  Row counts:');
    for (const t of tables.recordset) {
        try {
            const r = await pool.request().query(`SELECT COUNT(*) AS cnt FROM [${t.TABLE_SCHEMA}].[${t.TABLE_NAME}]`);
            console.log(`    ${t.TABLE_SCHEMA}.${t.TABLE_NAME}: ${r.recordset[0].cnt}`);
        } catch (e) {
            console.log(`    ${t.TABLE_SCHEMA}.${t.TABLE_NAME}: ERROR - ${e.message}`);
            allPassed = false;
        }
    }

    // Soft PK verification (natural PK fields should be marked as soft primary keys)
    console.log('\n  Soft PK verification:');
    const softPKs = await pool.request().query(`
        SELECT e.SchemaName, e.BaseTable, ef.Name AS FieldName, ef.IsPrimaryKey, ef.IsSoftPrimaryKey
        FROM ${MJ_SCHEMA}.EntityField ef
        JOIN ${MJ_SCHEMA}.Entity e ON ef.EntityID = e.ID
        WHERE e.SchemaName IN ('YourMembership','HubSpot')
        AND (ef.IsPrimaryKey = 1 OR ef.IsSoftPrimaryKey = 1)
        ORDER BY e.SchemaName, e.BaseTable, ef.Name
    `);
    if (softPKs.recordset.length > 0) {
        for (const row of softPKs.recordset) {
            console.log(`    ${row.SchemaName}.${row.BaseTable}.${row.FieldName}: IsPK=${row.IsPrimaryKey}, IsSoftPK=${row.IsSoftPrimaryKey}`);
        }
    } else {
        console.log('    WARNING: No soft PK fields found — additionalSchemaInfo may not have been applied');
        allPassed = false;
    }

    // Verify NO SourceRecordID column exists (natural PK design)
    console.log('\n  Verify no SourceRecordID column:');
    const srcIdCols = await pool.request().query(`
        SELECT TABLE_SCHEMA, TABLE_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA IN ('YourMembership','HubSpot') AND COLUMN_NAME = 'SourceRecordID'
    `);
    if (srcIdCols.recordset.length === 0) {
        console.log('    PASS: No tables have a SourceRecordID column');
    } else {
        console.log('    FAIL: These tables still have SourceRecordID columns:');
        for (const row of srcIdCols.recordset) {
            console.log(`      ${row.TABLE_SCHEMA}.${row.TABLE_NAME}`);
        }
        allPassed = false;
    }

    // Verify __mj_integration_* standard columns exist
    console.log('\n  Verify __mj_integration_* standard columns:');
    const integCols = await pool.request().query(`
        SELECT t.TABLE_SCHEMA, t.TABLE_NAME,
               MAX(CASE WHEN c.COLUMN_NAME = '__mj_integration_SyncStatus' THEN 1 ELSE 0 END) AS HasSyncStatus,
               MAX(CASE WHEN c.COLUMN_NAME = '__mj_integration_LastSyncedAt' THEN 1 ELSE 0 END) AS HasLastSyncedAt
        FROM INFORMATION_SCHEMA.TABLES t
        LEFT JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
        WHERE t.TABLE_SCHEMA IN ('YourMembership','HubSpot') AND t.TABLE_TYPE = 'BASE TABLE'
        GROUP BY t.TABLE_SCHEMA, t.TABLE_NAME
    `);
    for (const row of integCols.recordset) {
        const status = row.HasSyncStatus && row.HasLastSyncedAt ? 'OK' : 'MISSING';
        if (status !== 'OK') allPassed = false;
        console.log(`    ${row.TABLE_SCHEMA}.${row.TABLE_NAME}: SyncStatus=${row.HasSyncStatus}, LastSyncedAt=${row.HasLastSyncedAt} [${status}]`);
    }

    // Soft FK verification
    console.log('\n  Soft FK verification:');
    const softFKs = await pool.request().query(`
        SELECT e.SchemaName, e.BaseTable, ef.Name AS FieldName, ef.IsSoftForeignKey,
               re.Name AS RelatedEntity, ef.RelatedEntityFieldName
        FROM ${MJ_SCHEMA}.EntityField ef
        JOIN ${MJ_SCHEMA}.Entity e ON ef.EntityID = e.ID
        LEFT JOIN ${MJ_SCHEMA}.Entity re ON ef.RelatedEntityID = re.ID
        WHERE e.SchemaName IN ('YourMembership','HubSpot')
        AND ef.IsSoftForeignKey = 1
        ORDER BY e.SchemaName, e.BaseTable
    `);
    if (softFKs.recordset.length > 0) {
        for (const row of softFKs.recordset) {
            console.log(`    ${row.SchemaName}.${row.BaseTable}.${row.FieldName} -> ${row.RelatedEntity}.${row.RelatedEntityFieldName}`);
        }
    } else {
        console.log('    (none detected — OK if no cross-table FKs were defined)');
    }

    // Verify NO synthetic UUID ID column exists (a UNIQUEIDENTIFIER column named ID with a default)
    console.log('\n  Verify no synthetic UUID ID column:');
    const idCols = await pool.request().query(`
        SELECT c.TABLE_SCHEMA, c.TABLE_NAME
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_SCHEMA IN ('YourMembership','HubSpot')
          AND c.COLUMN_NAME = 'ID'
          AND c.DATA_TYPE = 'uniqueidentifier'
    `);
    if (idCols.recordset.length === 0) {
        console.log('    PASS: No tables have a synthetic UUID ID column');
    } else {
        console.log('    FAIL: These tables still have synthetic UUID ID columns:');
        for (const row of idCols.recordset) {
            console.log(`      ${row.TABLE_SCHEMA}.${row.TABLE_NAME}`);
        }
        allPassed = false;
    }

    // Verify NO SourceJSON column exists
    console.log('\n  Verify no SourceJSON column:');
    const jsonCols = await pool.request().query(`
        SELECT TABLE_SCHEMA, TABLE_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA IN ('YourMembership','HubSpot') AND COLUMN_NAME = 'SourceJSON'
    `);
    if (jsonCols.recordset.length === 0) {
        console.log('    PASS: No tables have a SourceJSON column');
    } else {
        console.log('    FAIL: These tables still have SourceJSON columns:');
        for (const row of jsonCols.recordset) {
            console.log(`      ${row.TABLE_SCHEMA}.${row.TABLE_NAME}`);
        }
        allPassed = false;
    }

    return allPassed;
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
    console.log('Integration Pipeline: Rebuild & Sync');
    console.log(`Target: ${target}`);
    console.log(`Date: ${new Date().toISOString()}\n`);

    // Connect to SQL Server
    const pool = new sql.ConnectionPool({
        server: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: DB_NAME,
        options: { encrypt: false, trustServerCertificate: true },
        pool: { max: 20, min: 2, idleTimeoutMillis: 30000 },
    });
    await pool.connect();
    console.log(`Connected to ${DB_HOST}:${DB_PORT}/${DB_NAME}`);

    // Bootstrap MJ runtime
    const { setupSQLServerClient, SQLServerProviderConfigData } =
        await import('@memberjunction/sqlserver-dataprovider');
    const config = new SQLServerProviderConfigData(pool, MJ_SCHEMA, 0);
    await setupSQLServerClient(config);

    const { Metadata } = await import('@memberjunction/core');
    const md = new Metadata();
    console.log(`Metadata loaded: ${md.Entities.length} entities`);

    // Register connectors
    await import('@memberjunction/integration-connectors');

    // Step 1: Generate DDL + additionalSchemaInfo
    const { allDDL, allTargetConfigs, integrations } = await generateSchema(pool);

    // Step 2: Execute DDL
    const tableCount = await executeDDL(pool, allDDL);
    if (tableCount === 0) {
        console.error('\n  ERROR: No tables were created. Aborting.');
        process.exit(1);
    }

    // Step 3: Run CodeGen
    await runCodeGen();

    // Step 4: Create entity maps + field maps
    await createMaps(pool, allTargetConfigs, integrations);

    // Step 5: Run sync
    const syncResults = await runSync(pool);

    // Step 6: Verify
    const allPassed = await verify(pool);

    // Summary
    console.log('\n=== Final Summary ===\n');
    for (const [name, result] of Object.entries(syncResults)) {
        if (result) {
            console.log(`  ${name}: ${result.Success ? 'SUCCESS' : 'WITH ERRORS'} - ${result.RecordsCreated} created, ${result.RecordsUpdated} updated, ${result.RecordsErrored} errors`);
        } else {
            console.log(`  ${name}: FATAL ERROR`);
        }
    }
    console.log(`\n  Verification: ${allPassed ? 'ALL PASSED' : 'SOME CHECKS FAILED'}`);

    await pool.close();
    process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
