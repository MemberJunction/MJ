/**
 * Seed the operational sample data that regression tests browse but that a fresh
 * database never produces on its own:
 *
 *   1. Communication logs (T124). The Communication app's Logs view is empty until
 *      something is actually sent, so "filter the log table, then clear the filter and
 *      see the fuller list return" has nothing to narrow or restore. Seeds six logs across
 *      every Status, with searchable message content.
 *   2. An integration connection (T120). The Integrations app shows "No integrations
 *      yet" until a CompanyIntegration exists, so there is no connection detail view, no
 *      entity map, and no visual field editor to open. Seeds one File Feed connection
 *      with a Members entity map and five field maps.
 *
 * Idempotent: every block checks for its own marker row first, so re-runs are harmless.
 *
 * Usage: node seed-sample-data.cjs [integration|communication]  (default: both)
 *
 *   integration   — runs in db-setup, BEFORE MJAPI starts. The Integrations app reads
 *                   IntegrationEngineBase, which MJAPI caches; rows inserted in raw SQL
 *                   after MJAPI has loaded that engine stay invisible to it.
 *   communication — runs in the test-runner after setup-test-user.cjs (the
 *                   communication run is owned by the test user). The Logs view queries
 *                   the table directly, so MJAPI already being up does not matter.
 */

const { sql, connect } = require('./lib/db.cjs');

const COMPANY_NAME = 'Regression Test Company';
const CONNECTION_NAME = 'Regression Member Feed';
const LOG_MARKER = '[regression-seed]';

async function seedCommunicationLogs(pool, userId) {
    const existing = (await pool.request()
        .input('marker', sql.NVarChar, `%${LOG_MARKER}%`)
        .query('SELECT COUNT(*) AS c FROM __mj.CommunicationLog WHERE MessageContent LIKE @marker')).recordset[0].c;
    if (existing > 0) {
        console.log(`  Communication logs exist: ${existing}`);
        return;
    }

    const messageType = (await pool.request().query(`
        SELECT TOP 1 m.ID, m.CommunicationProviderID
        FROM __mj.CommunicationProviderMessageType m
        JOIN __mj.CommunicationProvider p ON p.ID = m.CommunicationProviderID
        WHERE m.Name = 'Email'
        ORDER BY p.Name`)).recordset[0];
    if (!messageType) {
        console.log('  WARNING: no Email message type — communication logs not seeded');
        return;
    }

    const runId = (await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`INSERT INTO __mj.CommunicationRun (UserID, Direction, Status, Comments)
                OUTPUT inserted.ID
                VALUES (@userId, 'Sending', 'Complete', 'Regression sample run')`)).recordset[0].ID;

    const logs = [
        { status: 'Complete', content: 'Welcome to the association — your membership is active' },
        { status: 'Complete', content: 'Your renewal reminder: membership expires in 30 days' },
        { status: 'Complete', content: 'Spring conference registration confirmed' },
        { status: 'Failed', content: 'Invoice #1042 delivery attempt', error: 'Mailbox unavailable (550)' },
        { status: 'Pending', content: 'Monthly newsletter — chapter updates' },
        { status: 'In-Progress', content: 'Certification exam results notice' },
    ];
    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        await pool.request()
            .input('providerId', sql.UniqueIdentifier, messageType.CommunicationProviderID)
            .input('messageTypeId', sql.UniqueIdentifier, messageType.ID)
            .input('runId', sql.UniqueIdentifier, runId)
            .input('status', sql.NVarChar, log.status)
            .input('content', sql.NVarChar, `${log.content} ${LOG_MARKER}`)
            .input('error', sql.NVarChar, log.error ?? null)
            .input('hoursAgo', sql.Int, i * 6)
            .query(`INSERT INTO __mj.CommunicationLog
                        (CommunicationProviderID, CommunicationProviderMessageTypeID, CommunicationRunID, Direction, MessageDate, Status, MessageContent, ErrorMessage)
                    VALUES (@providerId, @messageTypeId, @runId, 'Sending', DATEADD(hour, -@hoursAgo, SYSDATETIMEOFFSET()), @status, @content, @error)`);
    }
    console.log(`  Seeded ${logs.length} communication logs`);
}

async function seedIntegrationConnection(pool) {
    const existing = (await pool.request()
        .input('name', sql.NVarChar, CONNECTION_NAME)
        .query('SELECT ID FROM __mj.CompanyIntegration WHERE Name = @name')).recordset[0];
    if (existing) {
        console.log(`  Integration connection exists: ${CONNECTION_NAME}`);
        return;
    }

    const integration = (await pool.request()
        .query(`SELECT TOP 1 ID FROM __mj.Integration WHERE Name = 'File Feed'`)).recordset[0];
    const membersEntity = (await pool.request()
        .query(`SELECT ID FROM __mj.Entity WHERE SchemaName = 'AssociationDemo' AND Name = 'Members'`)).recordset[0];
    if (!integration || !membersEntity) {
        console.log('  WARNING: File Feed integration or Members entity missing — connection not seeded');
        return;
    }

    let companyId = (await pool.request()
        .input('name', sql.NVarChar, COMPANY_NAME)
        .query('SELECT ID FROM __mj.Company WHERE Name = @name')).recordset[0]?.ID;
    if (!companyId) {
        companyId = (await pool.request()
            .input('name', sql.NVarChar, COMPANY_NAME)
            .query(`INSERT INTO __mj.Company (Name, Description)
                    OUTPUT inserted.ID
                    VALUES (@name, 'Company used by the regression suite')`)).recordset[0].ID;
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const connectionId = (await new sql.Request(transaction)
            .input('companyId', sql.UniqueIdentifier, companyId)
            .input('integrationId', sql.UniqueIdentifier, integration.ID)
            .input('name', sql.NVarChar, CONNECTION_NAME)
            .query(`INSERT INTO __mj.CompanyIntegration (CompanyID, IntegrationID, Name, IsActive)
                    OUTPUT inserted.ID
                    VALUES (@companyId, @integrationId, @name, 1)`)).recordset[0].ID;

        const entityMapId = (await new sql.Request(transaction)
            .input('connectionId', sql.UniqueIdentifier, connectionId)
            .input('entityId', sql.UniqueIdentifier, membersEntity.ID)
            .query(`INSERT INTO __mj.CompanyIntegrationEntityMap (CompanyIntegrationID, ExternalObjectName, EntityID, SyncDirection)
                    OUTPUT inserted.ID
                    VALUES (@connectionId, 'members_export', @entityId, 'Pull')`)).recordset[0].ID;

        const fieldMaps = [
            { source: 'email', dest: 'Email', key: true, required: true },
            { source: 'first_name', dest: 'FirstName', required: true },
            { source: 'last_name', dest: 'LastName', required: true },
            { source: 'job_title', dest: 'Title' },
            { source: 'city', dest: 'City' },
        ];
        for (let i = 0; i < fieldMaps.length; i++) {
            const fm = fieldMaps[i];
            await new sql.Request(transaction)
                .input('entityMapId', sql.UniqueIdentifier, entityMapId)
                .input('source', sql.NVarChar, fm.source)
                .input('dest', sql.NVarChar, fm.dest)
                .input('isKey', sql.Bit, !!fm.key)
                .input('isRequired', sql.Bit, !!fm.required)
                .input('priority', sql.Int, i)
                .query(`INSERT INTO __mj.CompanyIntegrationFieldMap (EntityMapID, SourceFieldName, DestinationFieldName, IsKeyField, IsRequired, Priority)
                        VALUES (@entityMapId, @source, @dest, @isKey, @isRequired, @priority)`);
        }
        await transaction.commit();
        console.log(`  Seeded integration connection: ${CONNECTION_NAME} (1 entity map, ${fieldMaps.length} field maps)`);
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
}

(async () => {
    const part = process.argv[2];
    if (part && part !== 'integration' && part !== 'communication') {
        throw new Error(`Unknown part "${part}" — expected integration or communication`);
    }
    const pool = await connect();

    if (!part || part === 'integration') {
        await seedIntegrationConnection(pool);
    }
    if (!part || part === 'communication') {
        const email = process.env.TEST_UID || 'computeruse@bluecypress.io';
        const user = (await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT ID FROM __mj.[User] WHERE Email = @email')).recordset[0];
        if (!user) {
            throw new Error(`Test user not found: ${email}`);
        }
        await seedCommunicationLogs(pool, user.ID);
    }
    await pool.close();
})().catch(err => {
    console.error(`  Sample data seed failed: ${err.message}`);
    process.exit(1);
});
