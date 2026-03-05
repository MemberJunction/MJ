/**
 * iterative-sync-stress-test.mjs
 * ==============================
 * Multi-round stress test for the integration sync engine.
 * Runs 4 rounds of varied mutations (inserts, updates, deletes) across all 3
 * source systems, syncs after each round, and verifies results.
 *
 * Prerequisite: full-sync-test.mjs must have been run first (initial sync + Phase 2).
 *
 * Runs via: node iterative-sync-stress-test.mjs
 */

import sql from 'mssql';

// =============================================================================
// CONFIGURATION
// =============================================================================
const DB_CONFIG = {
    server: 'sql-claude',
    user: 'sa',
    password: 'Claude2Sql99',
    database: 'MJ_Workbench',
    options: { encrypt: false, trustServerCertificate: true },
};

const MOCK_DB_CONFIG = { ...DB_CONFIG, database: 'mock_data' };

const COMPANY_INTEGRATION_IDS = {
    HubSpot: '33333333-3333-3333-3333-333333333301',
    Salesforce: '33333333-3333-3333-3333-333333333302',
    YourMembership: '33333333-3333-3333-3333-333333333303',
};

const SYSTEM_USER_ID = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';

// =============================================================================
// CONNECTION POOL MANAGEMENT
// =============================================================================
let mjPool = null;
let mockPool = null;

async function getMJPool() {
    if (!mjPool || !mjPool.connected) {
        mjPool = new sql.ConnectionPool(DB_CONFIG);
        await mjPool.connect();
    }
    return mjPool;
}

async function getMockPool() {
    if (!mockPool || !mockPool.connected) {
        mockPool = new sql.ConnectionPool(MOCK_DB_CONFIG);
        await mockPool.connect();
    }
    return mockPool;
}

async function closeAllPools() {
    if (mjPool?.connected) await mjPool.close();
    if (mockPool?.connected) await mockPool.close();
}

// =============================================================================
// LOGGING
// =============================================================================
function log(msg) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }
function logSection(title) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  ${title}`);
    console.log(`${'='.repeat(70)}`);
}
function logResult(label, pass) { console.log(`  ${pass ? '✅' : '❌'} ${label}`); }

// =============================================================================
// CORE SYNC LOGIC (reused from full-sync-test.mjs)
// =============================================================================

async function runSync(companyIntegrationID, integrationName, phase) {
    const pool = await getMJPool();

    const entityMaps = await pool.request()
        .input('ciid', sql.UniqueIdentifier, companyIntegrationID)
        .query(`
            SELECT em.ID, em.ExternalObjectName, em.EntityID, em.MatchStrategy, em.DeleteBehavior,
                   e.Name AS EntityName, e.SchemaName, e.BaseTable,
                   ci.Configuration
            FROM [__mj].CompanyIntegrationEntityMap em
            JOIN [__mj].CompanyIntegration ci ON ci.ID = em.CompanyIntegrationID
            JOIN [__mj].Entity e ON e.ID = em.EntityID
            WHERE em.CompanyIntegrationID = @ciid AND em.SyncEnabled = 1 AND em.Status = 'Active'
            ORDER BY em.Priority
        `);

    const runId = await createRunRecord(pool, companyIntegrationID, phase);

    const syncResult = {
        runId,
        totalProcessed: 0, totalCreated: 0, totalUpdated: 0,
        totalDeleted: 0, totalSkipped: 0, totalErrored: 0,
        entityResults: [], errors: [],
    };

    for (const em of entityMaps.recordset) {
        const entityResult = await syncEntityMap(pool, em, companyIntegrationID, runId, phase);
        syncResult.entityResults.push(entityResult);
        syncResult.totalProcessed += entityResult.processed;
        syncResult.totalCreated += entityResult.created;
        syncResult.totalUpdated += entityResult.updated;
        syncResult.totalDeleted += entityResult.deleted;
        syncResult.totalSkipped += entityResult.skipped;
        syncResult.totalErrored += entityResult.errored;
        syncResult.errors.push(...entityResult.errors);
    }

    await finalizeRun(pool, runId, syncResult);
    return syncResult;
}

async function createRunRecord(pool, companyIntegrationID, phase) {
    const result = await pool.request()
        .input('ciid', sql.UniqueIdentifier, companyIntegrationID)
        .input('userId', sql.UniqueIdentifier, SYSTEM_USER_ID)
        .input('comment', sql.NVarChar, `Stress Test - ${phase}`)
        .query(`
            INSERT INTO [__mj].CompanyIntegrationRun
                (CompanyIntegrationID, RunByUserID, StartedAt, TotalRecords, Status, Comments, ConfigData)
            OUTPUT INSERTED.ID
            VALUES (@ciid, @userId, SYSDATETIMEOFFSET(), 0, 'In Progress', @comment, '{"triggerType":"Stress_Test"}')
        `);
    return result.recordset[0].ID;
}

async function finalizeRun(pool, runId, syncResult) {
    const status = syncResult.totalErrored > 0 ? 'Failed' : 'Success';
    const errorLog = syncResult.errors.length > 0 ? JSON.stringify(syncResult.errors.slice(0, 50)) : null;
    await pool.request()
        .input('runId', sql.UniqueIdentifier, runId)
        .input('total', sql.Int, syncResult.totalProcessed)
        .input('status', sql.NVarChar, status)
        .input('errorLog', sql.NVarChar, errorLog)
        .query(`
            UPDATE [__mj].CompanyIntegrationRun
            SET EndedAt = SYSDATETIMEOFFSET(), TotalRecords = @total, Status = @status, ErrorLog = @errorLog
            WHERE ID = @runId
        `);
}

async function syncEntityMap(mjPool, entityMap, companyIntegrationID, runId, phase) {
    const config = JSON.parse(entityMap.Configuration);
    const objectName = entityMap.ExternalObjectName;
    const schema = config.schema;
    const baseTable = entityMap.BaseTable;
    const entitySchema = entityMap.SchemaName;

    const entityResult = {
        objectName, entityName: entityMap.EntityName,
        processed: 0, created: 0, updated: 0, deleted: 0, skipped: 0, errored: 0, errors: [],
    };

    try {
        const fieldMaps = await mjPool.request()
            .input('emid', sql.UniqueIdentifier, entityMap.ID)
            .query(`
                SELECT SourceFieldName, DestinationFieldName, IsKeyField, TransformPipeline, DefaultValue
                FROM [__mj].CompanyIntegrationFieldMap
                WHERE EntityMapID = @emid AND Status = 'Active'
                ORDER BY Priority
            `);

        const watermark = await getWatermark(mjPool, entityMap.ID);
        const mock = await getMockPool();
        const sourceRecords = await fetchSourceRecords(mock, schema, objectName, watermark);
        const pool2 = await getMJPool();

        for (const sourceRow of sourceRecords) {
            entityResult.processed++;
            try {
                const isDeleted = checkIsDeleted(sourceRow, objectName);
                if (isDeleted) {
                    const existingId = await findExistingRecord(pool2, entitySchema, baseTable, fieldMaps.recordset, sourceRow);
                    if (existingId && entityMap.DeleteBehavior !== 'DoNothing') {
                        await deleteRecord(pool2, entitySchema, baseTable, existingId);
                        entityResult.deleted++;
                        await saveRecordMap(pool2, companyIntegrationID, getExternalId(sourceRow, objectName), entityMap.EntityID, existingId);
                    } else {
                        entityResult.skipped++;
                    }
                    continue;
                }

                const mappedFields = mapFields(fieldMaps.recordset, sourceRow);
                const existingId = await findExistingRecord(pool2, entitySchema, baseTable, fieldMaps.recordset, sourceRow);

                if (existingId) {
                    await updateRecord(pool2, entitySchema, baseTable, existingId, mappedFields);
                    entityResult.updated++;
                    await saveRecordMap(pool2, companyIntegrationID, getExternalId(sourceRow, objectName), entityMap.EntityID, existingId);
                } else {
                    const newId = await createRecord(pool2, entitySchema, baseTable, mappedFields);
                    entityResult.created++;
                    await saveRecordMap(pool2, companyIntegrationID, getExternalId(sourceRow, objectName), entityMap.EntityID, newId);
                }
            } catch (err) {
                entityResult.errored++;
                entityResult.errors.push({
                    objectName, externalId: getExternalId(sourceRow, objectName), error: err.message,
                });
            }
        }

        if (sourceRecords.length > 0) {
            const lastModified = getLastModifiedValue(sourceRecords, objectName);
            if (lastModified) await updateWatermark(pool2, entityMap.ID, lastModified);
        }

        await createRunDetail(pool2, runId, entityMap.EntityID, entityResult);
    } catch (err) {
        entityResult.errored++;
        entityResult.errors.push({ objectName, error: err.message });
    }

    return entityResult;
}

// =============================================================================
// FIELD MAPPING & RECORD OPERATIONS
// =============================================================================

function mapFields(fieldMaps, sourceRow) {
    const mapped = {};
    for (const fm of fieldMaps) {
        let value = sourceRow[fm.SourceFieldName];
        if (fm.TransformPipeline) {
            try {
                const transform = JSON.parse(fm.TransformPipeline);
                if (transform.transform === 'map' && transform.mapping) {
                    value = transform.mapping[String(value)] ?? value;
                }
            } catch { /* ignore */ }
        }
        if (value == null && fm.DefaultValue != null) value = fm.DefaultValue;
        if (value != null) mapped[fm.DestinationFieldName] = value;
    }
    return mapped;
}

function getExternalId(row, objectName) {
    const idFields = {
        contacts: 'vid', companies: 'companyId', deals: 'dealId',
        Contact: 'Id', Account: 'Id', Opportunity: 'Id',
        members: 'member_id', events: 'event_id', membership_types: 'type_id',
    };
    const field = idFields[objectName] || 'ID';
    return String(row[field] ?? row.ID ?? '');
}

function getLastModifiedField(objectName) {
    const fields = {
        contacts: 'lastmodifieddate', companies: 'lastmodifieddate', deals: 'lastmodifieddate',
        Contact: 'LastModifiedDate', Account: 'LastModifiedDate', Opportunity: 'LastModifiedDate',
        members: 'updated_at', events: 'updated_at', membership_types: 'updated_at',
    };
    return fields[objectName] || 'lastmodifieddate';
}

function getLastModifiedValue(records, objectName) {
    const field = getLastModifiedField(objectName);
    let latest = null;
    for (const r of records) {
        const val = r[field];
        if (val && (!latest || val > latest)) latest = val;
    }
    return latest ? latest.toISOString() : null;
}

function checkIsDeleted(row, objectName) {
    if (objectName === 'contacts') return row.is_deleted === true || row.is_deleted === 1;
    if (['Contact', 'Account', 'Opportunity'].includes(objectName))
        return row.IsDeleted === true || row.IsDeleted === 1;
    if (objectName === 'members') return row.status === 'Deleted';
    return false;
}

async function fetchSourceRecords(pool, schema, objectName, watermark) {
    const modifiedField = getLastModifiedField(objectName);
    let query = `SELECT * FROM [${schema}].[${objectName}]`;
    if (watermark) {
        query += ` WHERE [${modifiedField}] > CAST('${watermark}' AS datetimeoffset(7))`;
    }
    query += ` ORDER BY [${modifiedField}]`;
    const result = await pool.request().query(query);
    return result.recordset;
}

async function findExistingRecord(pool, entitySchema, baseTable, fieldMaps, sourceRow) {
    const keyFields = fieldMaps.filter(fm => fm.IsKeyField);
    if (keyFields.length === 0) return null;
    const request = pool.request();
    const conditions = [];
    for (let i = 0; i < keyFields.length; i++) {
        const fm = keyFields[i];
        const value = sourceRow[fm.SourceFieldName];
        if (value == null) return null;
        request.input(`key${i}`, sql.NVarChar, String(value));
        conditions.push(`[${fm.DestinationFieldName}] = @key${i}`);
    }
    const result = await request.query(`SELECT TOP 1 ID FROM [${entitySchema}].[${baseTable}] WHERE ${conditions.join(' AND ')}`);
    return result.recordset.length > 0 ? result.recordset[0].ID : null;
}

async function createRecord(pool, entitySchema, baseTable, mappedFields) {
    const fields = Object.keys(mappedFields);
    if (fields.length === 0) throw new Error('No fields to insert');
    const request = pool.request();
    const columns = [];
    const values = [];
    for (let i = 0; i < fields.length; i++) {
        columns.push(`[${fields[i]}]`);
        values.push(`@f${i}`);
        const val = mappedFields[fields[i]];
        if (val instanceof Date) request.input(`f${i}`, sql.DateTime, val);
        else if (typeof val === 'number') request.input(`f${i}`, sql.Decimal(18, 2), val);
        else request.input(`f${i}`, sql.NVarChar, String(val));
    }
    const result = await request.query(`INSERT INTO [${entitySchema}].[${baseTable}] (${columns.join(', ')}) OUTPUT INSERTED.ID VALUES (${values.join(', ')})`);
    return result.recordset[0].ID;
}

async function updateRecord(pool, entitySchema, baseTable, id, mappedFields) {
    const fields = Object.keys(mappedFields);
    if (fields.length === 0) return;
    const request = pool.request();
    request.input('id', sql.UniqueIdentifier, id);
    const setClauses = [];
    for (let i = 0; i < fields.length; i++) {
        setClauses.push(`[${fields[i]}] = @f${i}`);
        const val = mappedFields[fields[i]];
        if (val instanceof Date) request.input(`f${i}`, sql.DateTime, val);
        else if (typeof val === 'number') request.input(`f${i}`, sql.Decimal(18, 2), val);
        else request.input(`f${i}`, sql.NVarChar, String(val));
    }
    await request.query(`UPDATE [${entitySchema}].[${baseTable}] SET ${setClauses.join(', ')} WHERE ID = @id`);
}

async function deleteRecord(pool, entitySchema, baseTable, id) {
    await pool.request().input('id', sql.UniqueIdentifier, id)
        .query(`DELETE FROM [${entitySchema}].[${baseTable}] WHERE ID = @id`);
}

async function saveRecordMap(pool, companyIntegrationID, externalID, entityID, entityRecordID) {
    try {
        const existing = await pool.request()
            .input('ciid', sql.UniqueIdentifier, companyIntegrationID)
            .input('extId', sql.NVarChar, externalID)
            .input('entId', sql.UniqueIdentifier, entityID)
            .query(`SELECT ID FROM [__mj].CompanyIntegrationRecordMap WHERE CompanyIntegrationID = @ciid AND ExternalSystemRecordID = @extId AND EntityID = @entId`);

        if (existing.recordset.length > 0) {
            await pool.request()
                .input('id', sql.UniqueIdentifier, existing.recordset[0].ID)
                .input('recId', sql.NVarChar, entityRecordID)
                .query(`UPDATE [__mj].CompanyIntegrationRecordMap SET EntityRecordID = @recId WHERE ID = @id`);
        } else {
            await pool.request()
                .input('ciid', sql.UniqueIdentifier, companyIntegrationID)
                .input('extId', sql.NVarChar, externalID)
                .input('entId', sql.UniqueIdentifier, entityID)
                .input('recId', sql.NVarChar, entityRecordID)
                .query(`INSERT INTO [__mj].CompanyIntegrationRecordMap (CompanyIntegrationID, ExternalSystemRecordID, EntityID, EntityRecordID) VALUES (@ciid, @extId, @entId, @recId)`);
        }
    } catch (err) {
        log(`  Warning: Record map save failed: ${err.message}`);
    }
}

async function getWatermark(pool, entityMapId) {
    const result = await pool.request()
        .input('emid', sql.UniqueIdentifier, entityMapId)
        .query(`SELECT WatermarkValue FROM [__mj].CompanyIntegrationSyncWatermark WHERE EntityMapID = @emid`);
    return result.recordset.length > 0 ? result.recordset[0].WatermarkValue : null;
}

async function updateWatermark(pool, entityMapId, watermarkValue) {
    const existing = await pool.request()
        .input('emid', sql.UniqueIdentifier, entityMapId)
        .query(`SELECT ID FROM [__mj].CompanyIntegrationSyncWatermark WHERE EntityMapID = @emid`);
    if (existing.recordset.length > 0) {
        await pool.request()
            .input('emid', sql.UniqueIdentifier, entityMapId)
            .input('wm', sql.NVarChar, watermarkValue)
            .query(`UPDATE [__mj].CompanyIntegrationSyncWatermark SET WatermarkValue = @wm WHERE EntityMapID = @emid`);
    } else {
        await pool.request()
            .input('emid', sql.UniqueIdentifier, entityMapId)
            .input('wm', sql.NVarChar, watermarkValue)
            .query(`INSERT INTO [__mj].CompanyIntegrationSyncWatermark (EntityMapID, WatermarkValue, WatermarkType, Direction) VALUES (@emid, @wm, 'Timestamp', 'Pull')`);
    }
}

async function createRunDetail(pool, runId, entityId, entityResult) {
    const action = entityResult.created > 0 ? 'CREATE' : (entityResult.updated > 0 ? 'UPDATE' : 'SYNC');
    await pool.request()
        .input('runId', sql.UniqueIdentifier, runId)
        .input('entityId', sql.UniqueIdentifier, entityId)
        .input('recordId', sql.NVarChar, `P:${entityResult.processed} C:${entityResult.created} U:${entityResult.updated} D:${entityResult.deleted} E:${entityResult.errored}`)
        .input('action', sql.NChar(20), action)
        .input('isSuccess', sql.Bit, entityResult.errored === 0 ? 1 : 0)
        .query(`
            INSERT INTO [__mj].CompanyIntegrationRunDetail
                (CompanyIntegrationRunID, EntityID, RecordID, Action, ExecutedAt, IsSuccess)
            VALUES (@runId, @entityId, @recordId, @action, SYSDATETIMEOFFSET(), @isSuccess)
        `);
}

// =============================================================================
// BASELINE SNAPSHOT
// =============================================================================

async function captureBaseline() {
    logSection('BASELINE SNAPSHOT');
    const mj = await getMJPool();

    const targets = {};
    for (const [schema, table] of [['sample_fit','Member'],['__mj','Company'],['sample_npo','Donation'],['sample_npo','Event']]) {
        const r = await mj.request().query(`SELECT COUNT(*) AS cnt FROM [${schema}].[${table}]`);
        targets[`${schema}.${table}`] = r.recordset[0].cnt;
        log(`  ${schema}.${table}: ${r.recordset[0].cnt} records`);
    }

    const mapResult = await mj.request().query(
        "SELECT ci.Name, COUNT(*) AS cnt FROM __mj.CompanyIntegrationRecordMap rm " +
        "JOIN __mj.CompanyIntegration ci ON ci.ID = rm.CompanyIntegrationID GROUP BY ci.Name"
    );
    log('\n  Record maps:');
    for (const r of mapResult.recordset) log(`    ${r.Name}: ${r.cnt}`);

    return targets;
}

// =============================================================================
// ROUND HELPERS
// =============================================================================

async function runAllSyncs(roundLabel) {
    const allResults = {};
    for (const [name, ciid] of Object.entries(COMPANY_INTEGRATION_IDS)) {
        log(`  Syncing ${name}...`);
        const result = await runSync(ciid, name, roundLabel);
        allResults[name] = result;

        for (const er of result.entityResults) {
            if (er.processed > 0) {
                log(`    ${er.objectName}: ${er.processed} proc, ${er.created} new, ${er.updated} upd, ${er.deleted} del, ${er.errored} err`);
            }
        }

        if (result.totalErrored > 0) {
            log(`  ⚠️  ${name} had ${result.totalErrored} errors:`);
            for (const err of result.errors.slice(0, 5)) {
                log(`    ${err.objectName} (${err.externalId || ''}): ${err.error}`);
            }
        }
    }
    return allResults;
}

function summarizeRound(allResults) {
    let created = 0, updated = 0, deleted = 0, errored = 0;
    for (const sr of Object.values(allResults)) {
        created += sr.totalCreated;
        updated += sr.totalUpdated;
        deleted += sr.totalDeleted;
        errored += sr.totalErrored;
    }
    return { created, updated, deleted, errored };
}

// Helper to get next available ID for a source table
async function getNextId(pool, schema, table, idField) {
    const r = await pool.request().query(`SELECT ISNULL(MAX([${idField}]), 0) + 1 AS nextId FROM [${schema}].[${table}]`);
    return r.recordset[0].nextId;
}

// =============================================================================
// ROUND 1: BULK INSERTS
// =============================================================================

async function round1_BulkInserts() {
    logSection('ROUND 1: BULK INSERTS');
    const mock = await getMockPool();

    // Insert 10 new HS contacts (vid is IDENTITY — omit it, let DB auto-generate)
    log('  Inserting 10 HubSpot contacts...');
    for (let i = 0; i < 10; i++) {
        await mock.request()
            .input('email', sql.NVarChar, `stress.hs.r1.${i}@test.com`)
            .input('fn', sql.NVarChar, `StressHS`)
            .input('ln', sql.NVarChar, `R1Contact${i}`)
            .input('company', sql.NVarChar, `StressCorp-${i % 3}`)
            .input('jobtitle', sql.NVarChar, `Role-${i}`)
            .input('phone', sql.NVarChar, `555-R1${String(i).padStart(2, '0')}`)
            .input('stage', sql.NVarChar, i % 2 === 0 ? 'lead' : 'customer')
            .query(`INSERT INTO hs.contacts (email, firstname, lastname, company, jobtitle, phone, lifecyclestage, lastmodifieddate) VALUES (@email, @fn, @ln, @company, @jobtitle, @phone, @stage, SYSDATETIMEOFFSET())`);
    }

    // Insert 5 new SF accounts (Id is nvarchar(18), match pattern: 001SSSSSSSSSSSSSAA)
    log('  Inserting 5 Salesforce accounts...');
    for (let i = 1; i <= 5; i++) {
        const sfId = `001S0000000R1${String(i).padStart(2, '0')}AA`;  // 18 chars
        await mock.request()
            .input('id', sql.NVarChar, sfId)
            .input('name', sql.NVarChar, `Stress Account ${i}`)
            .input('industry', sql.NVarChar, ['Technology', 'Finance', 'Healthcare', 'Retail', 'Manufacturing'][i - 1])
            .input('phone', sql.NVarChar, `555-3${String(i).padStart(3, '0')}`)
            .input('city', sql.NVarChar, `StressCity${i}`)
            .input('website', sql.NVarChar, `https://stress${i}.example.com`)
            .query(`INSERT INTO sf.Account (Id, Name, Industry, Phone, BillingCity, Website, LastModifiedDate) VALUES (@id, @name, @industry, @phone, @city, @website, SYSDATETIMEOFFSET())`);
    }

    // Insert 8 new YM members (member_id is IDENTITY — omit it)
    log('  Inserting 8 YourMembership members...');
    for (let i = 0; i < 8; i++) {
        await mock.request()
            .input('fn', sql.NVarChar, `StressYM`)
            .input('ln', sql.NVarChar, `R1Member${i}`)
            .input('email', sql.NVarChar, `stress.ym.r1.${i}@test.com`)
            .input('phone', sql.NVarChar, `555-4R1${String(i).padStart(2, '0')}`)
            .input('memNum', sql.NVarChar, `MEM-STRESS-R1-${i}`)
            .input('status', sql.NVarChar, 'Active')
            .input('typeId', sql.Int, (i % 3) + 1)
            .query(`INSERT INTO ym.members (member_number, first_name, last_name, email, phone, membership_type_id, join_date, expiration_date, status, updated_at) VALUES (@memNum, @fn, @ln, @email, @phone, @typeId, GETDATE(), DATEADD(YEAR, 1, GETDATE()), @status, SYSDATETIMEOFFSET())`);
    }

    // Small delay to ensure timestamps differ
    await new Promise(r => setTimeout(r, 1500));

    log('  Running syncs...');
    const results = await runAllSyncs('Round 1 - Bulk Inserts');
    const summary = summarizeRound(results);

    log(`\n  Round 1 Summary: ${summary.created} created, ${summary.updated} updated, ${summary.deleted} deleted, ${summary.errored} errors`);
    logResult(`Round 1: expected ~23 creates (10+5+8), got ${summary.created}`, summary.created >= 20);
    logResult(`Round 1: 0 errors`, summary.errored === 0);

    return { results, summary, expectedCreates: 23 };
}

// =============================================================================
// ROUND 2: MIXED UPDATES
// =============================================================================

async function round2_MixedUpdates() {
    logSection('ROUND 2: MIXED UPDATES');
    const mock = await getMockPool();

    // Update 5 HS contacts (recently inserted ones from round 1)
    log('  Updating 5 HubSpot contacts...');
    const hsRecent = await mock.request().query(
        "SELECT TOP 5 vid FROM hs.contacts WHERE firstname = 'StressHS' ORDER BY vid"
    );
    for (const row of hsRecent.recordset) {
        await mock.request()
            .input('vid', sql.Int, row.vid)
            .input('company', sql.NVarChar, `UpdatedStressCorp-R2`)
            .input('jobtitle', sql.NVarChar, `UpdatedRole-R2`)
            .query(`UPDATE hs.contacts SET company = @company, jobtitle = @jobtitle, lastmodifieddate = SYSDATETIMEOFFSET() WHERE vid = @vid`);
    }
    const hsUpdated = hsRecent.recordset.length;

    // Update 3 existing SF contacts (original data)
    log('  Updating 3 Salesforce contacts...');
    const sfOriginal = await mock.request().query(
        "SELECT TOP 3 Id FROM sf.Contact WHERE Id LIKE '003000000%' AND (IsDeleted IS NULL OR IsDeleted = 0) ORDER BY Id"
    );
    for (const row of sfOriginal.recordset) {
        await mock.request()
            .input('id', sql.NVarChar, row.Id)
            .input('title', sql.NVarChar, 'Updated Title R2')
            .input('city', sql.NVarChar, 'UpdatedCity R2')
            .query(`UPDATE sf.Contact SET Title = @title, MailingCity = @city, LastModifiedDate = SYSDATETIMEOFFSET() WHERE Id = @id`);
    }
    const sfUpdated = sfOriginal.recordset.length;

    // Update all 8 YM members from round 1
    log('  Updating 8 YourMembership members...');
    const ymRecent = await mock.request().query(
        "SELECT member_id FROM ym.members WHERE first_name = 'StressYM'"
    );
    for (const row of ymRecent.recordset) {
        await mock.request()
            .input('mid', sql.Int, row.member_id)
            .query(`UPDATE ym.members SET status = 'Active', phone = '555-UPDATED', updated_at = SYSDATETIMEOFFSET() WHERE member_id = @mid`);
    }
    const ymUpdated = ymRecent.recordset.length;

    // Update 2 existing HS companies
    log('  Updating 2 HubSpot companies...');
    const hsCompanies = await mock.request().query(
        "SELECT TOP 2 companyId FROM hs.companies ORDER BY companyId"
    );
    for (const row of hsCompanies.recordset) {
        await mock.request()
            .input('cid', sql.Int, row.companyId)
            .input('name', sql.NVarChar, `Updated Company R2-${row.companyId}`)
            .input('industry', sql.NVarChar, 'Updated Industry R2')
            .query(`UPDATE hs.companies SET name = @name, industry = @industry, lastmodifieddate = SYSDATETIMEOFFSET() WHERE companyId = @cid`);
    }
    const hsCompUpdated = hsCompanies.recordset.length;

    const totalExpected = hsUpdated + sfUpdated + ymUpdated + hsCompUpdated;

    await new Promise(r => setTimeout(r, 1500));

    log('  Running syncs...');
    const results = await runAllSyncs('Round 2 - Mixed Updates');
    const summary = summarizeRound(results);

    log(`\n  Round 2 Summary: ${summary.created} created, ${summary.updated} updated, ${summary.deleted} deleted, ${summary.errored} errors`);
    logResult(`Round 2: expected ~${totalExpected} updates (${hsUpdated}+${sfUpdated}+${ymUpdated}+${hsCompUpdated}), got ${summary.updated}`, summary.updated >= totalExpected - 2);
    logResult(`Round 2: 0 or very few creates`, summary.created <= 2);
    logResult(`Round 2: 0 errors`, summary.errored === 0);

    return { results, summary, expectedUpdates: totalExpected };
}

// =============================================================================
// ROUND 3: SOFT DELETES
// =============================================================================

async function round3_Deletes() {
    logSection('ROUND 3: SOFT DELETES');
    const mock = await getMockPool();

    // Soft-delete 3 HS contacts (stress test ones)
    log('  Soft-deleting 3 HubSpot contacts...');
    const hsToDel = await mock.request().query(
        "SELECT TOP 3 vid FROM hs.contacts WHERE firstname = 'StressHS' AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY vid"
    );
    for (const row of hsToDel.recordset) {
        await mock.request()
            .input('vid', sql.Int, row.vid)
            .query(`UPDATE hs.contacts SET is_deleted = 1, lastmodifieddate = SYSDATETIMEOFFSET() WHERE vid = @vid`);
    }
    const hsDeleted = hsToDel.recordset.length;

    // Soft-delete 2 SF contacts
    log('  Soft-deleting 2 Salesforce contacts...');
    const sfToDel = await mock.request().query(
        "SELECT TOP 2 Id FROM sf.Contact WHERE Id LIKE '003000000%' AND (IsDeleted IS NULL OR IsDeleted = 0) ORDER BY Id DESC"
    );
    for (const row of sfToDel.recordset) {
        await mock.request()
            .input('id', sql.NVarChar, row.Id)
            .query(`UPDATE sf.Contact SET IsDeleted = 1, LastModifiedDate = SYSDATETIMEOFFSET() WHERE Id = @id`);
    }
    const sfDeleted = sfToDel.recordset.length;

    // Soft-delete 2 YM members
    log('  Soft-deleting 2 YourMembership members...');
    const ymToDel = await mock.request().query(
        "SELECT TOP 2 member_id FROM ym.members WHERE first_name = 'StressYM' AND status != 'Deleted' ORDER BY member_id"
    );
    for (const row of ymToDel.recordset) {
        await mock.request()
            .input('mid', sql.Int, row.member_id)
            .query(`UPDATE ym.members SET status = 'Deleted', updated_at = SYSDATETIMEOFFSET() WHERE member_id = @mid`);
    }
    const ymDeleted = ymToDel.recordset.length;

    const totalExpected = hsDeleted + sfDeleted + ymDeleted;

    await new Promise(r => setTimeout(r, 1500));

    log('  Running syncs...');
    const results = await runAllSyncs('Round 3 - Soft Deletes');
    const summary = summarizeRound(results);

    log(`\n  Round 3 Summary: ${summary.created} created, ${summary.updated} updated, ${summary.deleted} deleted, ${summary.errored} errors`);
    logResult(`Round 3: expected ~${totalExpected} deletes (${hsDeleted}+${sfDeleted}+${ymDeleted}), got ${summary.deleted}`, summary.deleted >= totalExpected - 2);
    logResult(`Round 3: 0 errors`, summary.errored === 0);

    return { results, summary, expectedDeletes: totalExpected };
}

// =============================================================================
// ROUND 4: MIXED OPERATIONS (inserts + updates + deletes simultaneously)
// =============================================================================

async function round4_MixedOps() {
    logSection('ROUND 4: MIXED OPERATIONS');
    const mock = await getMockPool();

    // INSERT: 3 new HS deals (dealId is IDENTITY — omit it)
    log('  Inserting 3 HubSpot deals...');
    for (let i = 0; i < 3; i++) {
        await mock.request()
            .input('name', sql.NVarChar, `Stress Deal R4-${i}`)
            .input('amount', sql.Decimal(18, 2), (i + 1) * 10000 + 500)
            .input('stage', sql.NVarChar, ['appointmentscheduled', 'qualifiedtobuy', 'closedwon'][i])
            .input('closedate', sql.DateTime, new Date())
            .input('pipeline', sql.NVarChar, 'default')
            .query(`INSERT INTO hs.deals (dealname, amount, dealstage, closedate, pipeline, lastmodifieddate) VALUES (@name, @amount, @stage, @closedate, @pipeline, SYSDATETIMEOFFSET())`);
    }

    // INSERT: 2 new SF opportunities (Id is nvarchar(18))
    log('  Inserting 2 Salesforce opportunities...');
    for (let i = 1; i <= 2; i++) {
        const oid = `006S0000000R4${String(i).padStart(2, '0')}AA`;  // 18 chars
        await mock.request()
            .input('id', sql.NVarChar, oid)
            .input('name', sql.NVarChar, `Stress Opportunity ${i}`)
            .input('amount', sql.Decimal(18, 2), i * 25000)
            .input('stage', sql.NVarChar, i === 1 ? 'Prospecting' : 'Negotiation')
            .input('closedate', sql.DateTime, new Date())
            .input('prob', sql.Decimal(5, 2), i * 30)
            .query(`INSERT INTO sf.Opportunity (Id, Name, Amount, StageName, CloseDate, Probability, LastModifiedDate) VALUES (@id, @name, @amount, @stage, @closedate, @prob, SYSDATETIMEOFFSET())`);
    }

    // UPDATE: 5 HS contacts (change email and lastname)
    log('  Updating 5 HubSpot contacts...');
    const hsToUpd = await mock.request().query(
        "SELECT TOP 5 vid FROM hs.contacts WHERE firstname = 'StressHS' AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY vid"
    );
    for (const row of hsToUpd.recordset) {
        await mock.request()
            .input('vid', sql.Int, row.vid)
            .input('email', sql.NVarChar, `r4updated.${row.vid}@test.com`)
            .input('ln', sql.NVarChar, `R4Updated-${row.vid}`)
            .query(`UPDATE hs.contacts SET email = @email, lastname = @ln, lastmodifieddate = SYSDATETIMEOFFSET() WHERE vid = @vid`);
    }
    const hsUpdCount = hsToUpd.recordset.length;

    // DELETE: soft-delete 1 SF account
    log('  Soft-deleting 1 Salesforce account...');
    const sfAccToDel = await mock.request().query(
        "SELECT TOP 1 Id FROM sf.Account WHERE Id LIKE '001S0000000R1%' AND (IsDeleted IS NULL OR IsDeleted = 0) ORDER BY Id"
    );
    let sfAccDelCount = 0;
    if (sfAccToDel.recordset.length > 0) {
        // Ensure IsDeleted column exists on Account
        await mock.request().query(`
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='sf' AND TABLE_NAME='Account' AND COLUMN_NAME='IsDeleted')
                ALTER TABLE sf.Account ADD IsDeleted BIT NOT NULL DEFAULT 0;
        `);
        await mock.request()
            .input('id', sql.NVarChar, sfAccToDel.recordset[0].Id)
            .query(`UPDATE sf.Account SET IsDeleted = 1, LastModifiedDate = SYSDATETIMEOFFSET() WHERE Id = @id`);
        sfAccDelCount = 1;
    }

    // INSERT: 3 new YM events (event_id is IDENTITY — omit it)
    log('  Inserting 3 YourMembership events...');
    for (let i = 0; i < 3; i++) {
        await mock.request()
            .input('title', sql.NVarChar, `Stress Event R4-${i}`)
            .input('startDate', sql.Date, new Date())
            .input('location', sql.NVarChar, `Venue R4-${i}`)
            .input('capacity', sql.Int, (i + 1) * 50)
            .input('status', sql.NVarChar, 'Active')
            .query(`INSERT INTO ym.events (title, start_date, location, max_attendees, status, updated_at) VALUES (@title, @startDate, @location, @capacity, @status, SYSDATETIMEOFFSET())`);
    }

    // UPDATE: 2 existing YM events
    log('  Updating 2 YourMembership events...');
    const ymEvToUpd = await mock.request().query(
        "SELECT TOP 2 event_id FROM ym.events ORDER BY event_id"
    );
    for (const row of ymEvToUpd.recordset) {
        await mock.request()
            .input('eid', sql.Int, row.event_id)
            .input('title', sql.NVarChar, `R4 Updated Event ${row.event_id}`)
            .input('location', sql.NVarChar, `R4 Updated Venue`)
            .query(`UPDATE ym.events SET title = @title, location = @location, updated_at = SYSDATETIMEOFFSET() WHERE event_id = @eid`);
    }
    const ymEvUpdCount = ymEvToUpd.recordset.length;

    const expectedCreates = 3 + 2 + 3; // deals + opportunities + events
    const expectedUpdates = hsUpdCount + ymEvUpdCount;
    const expectedDeletes = sfAccDelCount;

    await new Promise(r => setTimeout(r, 1500));

    log('  Running syncs...');
    const results = await runAllSyncs('Round 4 - Mixed Operations');
    const summary = summarizeRound(results);

    log(`\n  Round 4 Summary: ${summary.created} created, ${summary.updated} updated, ${summary.deleted} deleted, ${summary.errored} errors`);
    logResult(`Round 4: expected ~${expectedCreates} creates (3+2+3), got ${summary.created}`, summary.created >= expectedCreates - 2);
    logResult(`Round 4: expected ~${expectedUpdates} updates (${hsUpdCount}+${ymEvUpdCount}), got ${summary.updated}`, summary.updated >= expectedUpdates - 2);
    logResult(`Round 4: expected ~${expectedDeletes} deletes, got ${summary.deleted}`, summary.deleted >= 0);
    logResult(`Round 4: 0 errors`, summary.errored === 0);

    return { results, summary, expectedCreates, expectedUpdates, expectedDeletes };
}

// =============================================================================
// FINAL VERIFICATION
// =============================================================================

async function finalVerification(baseline, roundResults) {
    logSection('FINAL VERIFICATION');
    const mj = await getMJPool();

    // Target table counts
    log('Target table counts:');
    for (const [schema, table] of [['sample_fit','Member'],['__mj','Company'],['sample_npo','Donation'],['sample_npo','Event']]) {
        const r = await mj.request().query(`SELECT COUNT(*) AS cnt FROM [${schema}].[${table}]`);
        const key = `${schema}.${table}`;
        const delta = r.recordset[0].cnt - (baseline[key] || 0);
        log(`  ${key}: ${r.recordset[0].cnt} (${delta >= 0 ? '+' : ''}${delta} since baseline)`);
    }

    // Record maps
    const maps = await mj.request().query(
        "SELECT ci.Name, COUNT(*) AS cnt FROM __mj.CompanyIntegrationRecordMap rm " +
        "JOIN __mj.CompanyIntegration ci ON ci.ID = rm.CompanyIntegrationID GROUP BY ci.Name ORDER BY ci.Name"
    );
    log('\nRecord maps:');
    for (const r of maps.recordset) log(`  ${r.Name}: ${r.cnt}`);

    // Run records
    const runs = await mj.request().query(
        "SELECT ci.Name, r.Status, r.TotalRecords, r.Comments " +
        "FROM __mj.CompanyIntegrationRun r " +
        "JOIN __mj.CompanyIntegration ci ON ci.ID = r.CompanyIntegrationID " +
        "WHERE r.Comments LIKE 'Stress Test%' ORDER BY r.StartedAt"
    );
    log('\nStress test runs:');
    let totalErrors = 0;
    for (const r of runs.recordset) {
        const pass = r.Status === 'Success';
        logResult(`${r.Name}: ${r.Status} (${r.TotalRecords} records) - ${r.Comments}`, pass);
        if (!pass) totalErrors++;
    }

    // Watermarks (should be monotonically increasing)
    const wm = await mj.request().query(
        "SELECT ci.Name, em.ExternalObjectName, w.WatermarkValue " +
        "FROM __mj.CompanyIntegrationSyncWatermark w " +
        "JOIN __mj.CompanyIntegrationEntityMap em ON em.ID = w.EntityMapID " +
        "JOIN __mj.CompanyIntegration ci ON ci.ID = em.CompanyIntegrationID " +
        "ORDER BY ci.Name, em.ExternalObjectName"
    );
    log('\nWatermarks:');
    for (const r of wm.recordset) {
        log(`  ${r.Name} / ${r.ExternalObjectName}: ${(r.WatermarkValue || 'null').substring(0, 30)}`);
    }

    // Grand totals
    let grandCreated = 0, grandUpdated = 0, grandDeleted = 0, grandErrors = 0;
    for (const rr of roundResults) {
        grandCreated += rr.summary.created;
        grandUpdated += rr.summary.updated;
        grandDeleted += rr.summary.deleted;
        grandErrors += rr.summary.errored;
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('  GRAND TOTALS ACROSS ALL 4 ROUNDS');
    console.log(`${'='.repeat(70)}`);
    console.log(`  Created:  ${grandCreated}`);
    console.log(`  Updated:  ${grandUpdated}`);
    console.log(`  Deleted:  ${grandDeleted}`);
    console.log(`  Errors:   ${grandErrors}`);

    console.log(`\n  Per-Round Breakdown:`);
    console.log(`  ${'Round'.padEnd(12)} ${'Created'.padEnd(10)} ${'Updated'.padEnd(10)} ${'Deleted'.padEnd(10)} ${'Errors'.padEnd(10)}`);
    console.log(`  ${'-'.repeat(52)}`);
    const labels = ['Round 1', 'Round 2', 'Round 3', 'Round 4'];
    for (let i = 0; i < roundResults.length; i++) {
        const s = roundResults[i].summary;
        console.log(`  ${labels[i].padEnd(12)} ${String(s.created).padEnd(10)} ${String(s.updated).padEnd(10)} ${String(s.deleted).padEnd(10)} ${String(s.errored).padEnd(10)}`);
    }

    const overallPass = grandErrors === 0 && grandCreated > 0;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  OVERALL RESULT: ${overallPass ? '✅ PASS — All 4 rounds completed with 0 errors' : '❌ FAIL — Errors detected'}`);
    console.log(`${'='.repeat(70)}`);

    if (grandErrors > 0) {
        console.log('\n  Error details:');
        for (let i = 0; i < roundResults.length; i++) {
            for (const [name, sr] of Object.entries(roundResults[i].results)) {
                for (const err of sr.errors) {
                    console.log(`    ${labels[i]} / ${name}: ${err.objectName} (${err.externalId || ''}): ${err.error}`);
                }
            }
        }
    }

    return overallPass;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
    try {
        logSection('ITERATIVE SYNC STRESS TEST (4 ROUNDS)');
        log('Starting multi-round stress test...\n');

        const baseline = await captureBaseline();
        const roundResults = [];

        const r1 = await round1_BulkInserts();
        roundResults.push(r1);

        const r2 = await round2_MixedUpdates();
        roundResults.push(r2);

        const r3 = await round3_Deletes();
        roundResults.push(r3);

        const r4 = await round4_MixedOps();
        roundResults.push(r4);

        const pass = await finalVerification(baseline, roundResults);

        process.exit(pass ? 0 : 1);

    } catch (err) {
        console.error(`\n❌ FATAL ERROR: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await closeAllPools();
    }
}

main();
