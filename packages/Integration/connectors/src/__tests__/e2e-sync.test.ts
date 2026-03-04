/**
 * End-to-End Integration Sync Tests
 *
 * These tests connect to the real mock_data database on sql-claude and verify
 * the full connector pipeline: connect → discover → full fetch → incremental fetch.
 *
 * Prerequisites:
 *   - mock_data database exists on sql-claude with hs/sf/ym schemas
 *   - Execute create_mock_data.sql to set up the database
 *
 * These tests are automatically skipped when sql-claude is not available
 * (e.g., in GitHub Actions CI).
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext } from '@memberjunction/integration-engine';
import { HubSpotConnector } from '../HubSpotConnector.js';
import { SalesforceConnector } from '../SalesforceConnector.js';
import { YourMembershipConnector } from '../YourMembershipConnector.js';
import { FileFeedConnector } from '../FileFeedConnector.js';
import * as path from 'node:path';
import sql from 'mssql';
import { canConnectToMockDB } from './db-availability.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockCI(config: Record<string, string>): MJCompanyIntegrationEntity {
    const configJson = JSON.stringify(config);
    return {
        Get: (field: string) => (field === 'Configuration' ? configJson : null),
    } as unknown as MJCompanyIntegrationEntity;
}

const mockUser = {} as UserInfo;

const MOCK_DATA_CONFIG = {
    server: 'sql-claude',
    database: 'mock_data',
    user: 'sa',
    password: 'Claude2Sql99',
};

function makeFetchContext(
    ci: MJCompanyIntegrationEntity,
    objectName: string,
    watermark: string | null = null,
    batchSize = 1000
): FetchContext {
    return {
        CompanyIntegration: ci,
        ObjectName: objectName,
        WatermarkValue: watermark,
        BatchSize: batchSize,
        ContextUser: mockUser,
    };
}

// ── Direct SQL helper for incremental data ──────────────────────────────────

let directPool: sql.ConnectionPool | null = null;

async function getDirectPool(): Promise<sql.ConnectionPool> {
    if (directPool?.connected) return directPool;
    directPool = new sql.ConnectionPool({
        server: 'sql-claude',
        database: 'mock_data',
        user: 'sa',
        password: 'Claude2Sql99',
        options: { encrypt: false, trustServerCertificate: true },
    });
    await directPool.connect();
    return directPool;
}

// ── DB availability check ───────────────────────────────────────────────────

let dbAvailable = false;

beforeAll(async () => {
    dbAvailable = await canConnectToMockDB();
});

// =============================================================================
// E2E: HubSpot Connector
// =============================================================================
describe('E2E: HubSpot Connector', () => {
    const connector = new HubSpotConnector();
    const ci = createMockCI({ ...MOCK_DATA_CONFIG, schema: 'hs' });

    afterAll(async () => {
        if (dbAvailable) await connector.CloseAllPools();
    });

    describe('Connection', () => {
        it('should connect to mock_data and return server version', async ({ skip }) => {
            if (!dbAvailable) skip();
            const result = await connector.TestConnection(ci, mockUser);
            expect(result.Success).toBe(true);
            expect(result.Message).toContain('mock_data');
            expect(result.ServerVersion).toBeDefined();
        });
    });

    describe('Discovery', () => {
        it('should discover hs schema objects (contacts, companies, deals)', async ({ skip }) => {
            if (!dbAvailable) skip();
            const objects = await connector.DiscoverObjects(ci, mockUser);
            const names = objects.map((o) => o.Name).sort();
            expect(names).toEqual(['companies', 'contacts', 'deals']);
        });

        it('should discover fields on contacts table', async ({ skip }) => {
            if (!dbAvailable) skip();
            const fields = await connector.DiscoverFields(ci, 'contacts', mockUser);
            const names = fields.map((f) => f.Name);
            expect(names).toContain('vid');
            expect(names).toContain('email');
            expect(names).toContain('firstname');
            expect(names).toContain('lastname');
            expect(names).toContain('lastmodifieddate');
        });
    });

    describe('Full Sync', () => {
        it('should fetch all contacts from hs.contacts', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'contacts');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBeGreaterThanOrEqual(50);
            expect(batch.HasMore).toBe(false);

            const first = batch.Records[0];
            expect(first.ExternalID).toBeDefined();
            expect(first.ObjectType).toBe('contacts');
            expect(first.Fields).toHaveProperty('email');
            expect(first.Fields).toHaveProperty('firstname');
            expect(first.Fields).toHaveProperty('lastname');
        });

        it('should fetch all 20 companies from hs.companies', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'companies');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(20);
            expect(batch.HasMore).toBe(false);
        });

        it('should fetch all 30 deals from hs.deals', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'deals');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(30);
            expect(batch.HasMore).toBe(false);
        });

        it('should return a watermark value after full fetch', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'contacts');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.NewWatermarkValue).toBeDefined();
            expect(batch.NewWatermarkValue!.length).toBeGreaterThan(0);
        });
    });

    describe('Incremental Sync', () => {
        it('should return 0 contacts with far-future watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'contacts', '2099-01-01T00:00:00.000Z');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(0);
            expect(batch.HasMore).toBe(false);
        });

        it('should respect batch size and indicate HasMore', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'contacts', null, 10);
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(10);
            expect(batch.HasMore).toBe(true);
        });
    });

    describe('Default Field Mappings', () => {
        it('should return contact mappings for contacts object', () => {
            const mappings = connector.GetDefaultFieldMappings('contacts', 'Contacts');
            expect(mappings.length).toBe(6);
            const keyField = mappings.find((m) => m.IsKeyField);
            expect(keyField?.SourceFieldName).toBe('email');
        });

        it('should return company mappings for companies object', () => {
            const mappings = connector.GetDefaultFieldMappings('companies', 'Companies');
            expect(mappings.length).toBe(5);
        });
    });
});

// =============================================================================
// E2E: Salesforce Connector
// =============================================================================
describe('E2E: Salesforce Connector', () => {
    const connector = new SalesforceConnector();
    const ci = createMockCI({ ...MOCK_DATA_CONFIG, schema: 'sf' });

    afterAll(async () => {
        if (dbAvailable) await connector.CloseAllPools();
    });

    describe('Connection', () => {
        it('should connect to mock_data and return server version', async ({ skip }) => {
            if (!dbAvailable) skip();
            const result = await connector.TestConnection(ci, mockUser);
            expect(result.Success).toBe(true);
            expect(result.Message).toContain('mock_data');
        });
    });

    describe('Discovery', () => {
        it('should discover sf schema objects (Account, Contact, Opportunity)', async ({ skip }) => {
            if (!dbAvailable) skip();
            const objects = await connector.DiscoverObjects(ci, mockUser);
            const names = objects.map((o) => o.Name).sort();
            expect(names).toEqual(['Account', 'Contact', 'Opportunity']);
        });

        it('should discover fields on Contact table', async ({ skip }) => {
            if (!dbAvailable) skip();
            const fields = await connector.DiscoverFields(ci, 'Contact', mockUser);
            const names = fields.map((f) => f.Name);
            expect(names).toContain('Id');
            expect(names).toContain('Email');
            expect(names).toContain('FirstName');
            expect(names).toContain('LastName');
            expect(names).toContain('LastModifiedDate');
        });
    });

    describe('Full Sync', () => {
        it('should fetch all contacts from sf.Contact', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'Contact');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBeGreaterThanOrEqual(50);
            expect(batch.HasMore).toBe(false);

            const first = batch.Records[0];
            expect(first.ExternalID).toBeDefined();
            expect(first.ObjectType).toBe('Contact');
            expect(first.Fields).toHaveProperty('Email');
            expect(first.Fields).toHaveProperty('FirstName');
        });

        it('should fetch all 20 accounts from sf.Account', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'Account');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(20);
            expect(batch.HasMore).toBe(false);
        });

        it('should fetch all 30 opportunities from sf.Opportunity', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'Opportunity');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(30);
            expect(batch.HasMore).toBe(false);
        });

        it('should return a watermark value after full fetch', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'Contact');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.NewWatermarkValue).toBeDefined();
        });
    });

    describe('Incremental Sync', () => {
        it('should return 0 contacts with far-future watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'Contact', '2099-01-01T00:00:00.000Z');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(0);
        });

        it('should respect batch size and indicate HasMore', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'Contact', null, 10);
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(10);
            expect(batch.HasMore).toBe(true);
        });
    });

    describe('Default Field Mappings', () => {
        it('should return contact mappings for Contact object', () => {
            const mappings = connector.GetDefaultFieldMappings('Contact', 'Contacts');
            expect(mappings.length).toBe(6);
            const keyField = mappings.find((m) => m.IsKeyField);
            expect(keyField?.SourceFieldName).toBe('Email');
        });

        it('should return account mappings for Account object', () => {
            const mappings = connector.GetDefaultFieldMappings('Account', 'Companies');
            expect(mappings.length).toBe(5);
        });
    });
});

// =============================================================================
// E2E: YourMembership Connector
// =============================================================================
describe('E2E: YourMembership Connector', () => {
    const connector = new YourMembershipConnector();
    const ci = createMockCI({ ...MOCK_DATA_CONFIG, schema: 'ym' });

    afterAll(async () => {
        if (dbAvailable) await connector.CloseAllPools();
    });

    describe('Connection', () => {
        it('should connect to mock_data and return server version', async ({ skip }) => {
            if (!dbAvailable) skip();
            const result = await connector.TestConnection(ci, mockUser);
            expect(result.Success).toBe(true);
            expect(result.Message).toContain('mock_data');
        });
    });

    describe('Discovery', () => {
        it('should discover ym schema objects', async ({ skip }) => {
            if (!dbAvailable) skip();
            const objects = await connector.DiscoverObjects(ci, mockUser);
            const names = objects.map((o) => o.Name).sort();
            expect(names).toEqual(['event_registrations', 'events', 'members', 'membership_types']);
        });

        it('should discover fields on members table', async ({ skip }) => {
            if (!dbAvailable) skip();
            const fields = await connector.DiscoverFields(ci, 'members', mockUser);
            const names = fields.map((f) => f.Name);
            expect(names).toContain('member_id');
            expect(names).toContain('email');
            expect(names).toContain('first_name');
            expect(names).toContain('last_name');
            expect(names).toContain('updated_at');
        });
    });

    describe('Full Sync', () => {
        it('should fetch all members from ym.members', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'members');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBeGreaterThanOrEqual(50);
            expect(batch.HasMore).toBe(false);

            const first = batch.Records[0];
            expect(first.ExternalID).toBeDefined();
            expect(first.ObjectType).toBe('members');
            expect(first.Fields).toHaveProperty('email');
            expect(first.Fields).toHaveProperty('first_name');
        });

        it('should fetch all 5 membership_types', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'membership_types');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(5);
            expect(batch.HasMore).toBe(false);
        });

        it('should fetch all 10 events', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'events');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(10);
            expect(batch.HasMore).toBe(false);
        });

        it('should fetch all 40 event_registrations', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'event_registrations');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(40);
            expect(batch.HasMore).toBe(false);
        });

        it('should return a watermark value after full fetch', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'members');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.NewWatermarkValue).toBeDefined();
        });
    });

    describe('Incremental Sync', () => {
        it('should return 0 members with far-future watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'members', '2099-01-01T00:00:00.000Z');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(0);
        });

        it('should respect batch size and indicate HasMore', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ci, 'members', null, 10);
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(10);
            expect(batch.HasMore).toBe(true);
        });
    });

    describe('Default Field Mappings', () => {
        it('should return member mappings for members object', () => {
            const mappings = connector.GetDefaultFieldMappings('members', 'Contacts');
            expect(mappings.length).toBe(5);
            const keyField = mappings.find((m) => m.IsKeyField);
            expect(keyField?.SourceFieldName).toBe('email');
        });
    });
});

// =============================================================================
// E2E: FileFeed Connector
// =============================================================================
describe('E2E: FileFeed Connector', () => {
    const connector = new FileFeedConnector();
    const csvPath = path.resolve(__dirname, '../../test-fixtures/sample-contacts.csv');
    const ci = createMockCI({ storagePath: csvPath, fileType: 'csv' });

    describe('Connection', () => {
        it('should succeed when CSV file exists', async () => {
            const result = await connector.TestConnection(ci, mockUser);
            expect(result.Success).toBe(true);
        });

        it('should fail when file does not exist', async () => {
            const badCI = createMockCI({ storagePath: '/nonexistent/file.csv' });
            const result = await connector.TestConnection(badCI, mockUser);
            expect(result.Success).toBe(false);
        });
    });

    describe('Discovery', () => {
        it('should return the file name as the single object', async () => {
            const objects = await connector.DiscoverObjects(ci, mockUser);
            expect(objects.length).toBe(1);
            expect(objects[0].Name).toBe('sample-contacts.csv');
            expect(objects[0].SupportsIncrementalSync).toBe(false);
        });

        it('should discover CSV headers as fields', async () => {
            const fields = await connector.DiscoverFields(ci, 'sample-contacts.csv', mockUser);
            expect(fields.length).toBeGreaterThan(0);
            const names = fields.map((f) => f.Name);
            expect(names).toContain('first_name');
            expect(names).toContain('last_name');
            expect(names).toContain('email');
        });
    });

    describe('Full Sync', () => {
        it('should fetch all 100 records from CSV file', async () => {
            const ctx = makeFetchContext(ci, 'sample-contacts.csv');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(100);
            expect(batch.HasMore).toBe(false);

            const first = batch.Records[0];
            expect(first.ExternalID).toBe('1');
            expect(first.ObjectType).toBe('sample-contacts.csv');
            expect(first.Fields).toHaveProperty('first_name');
            expect(first.Fields).toHaveProperty('email');
        });

        it('should ignore watermark (always full load)', async () => {
            const ctx = makeFetchContext(ci, 'sample-contacts.csv', '2099-01-01');
            const batch = await connector.FetchChanges(ctx);
            expect(batch.Records.length).toBe(100);
        });
    });
});

// =============================================================================
// E2E: Incremental Sync with Live Data Changes
// =============================================================================
describe('E2E: Incremental Sync with Live Data Changes', () => {
    const hsConnector = new HubSpotConnector();
    const sfConnector = new SalesforceConnector();
    const ymConnector = new YourMembershipConnector();

    const hsCI = createMockCI({ ...MOCK_DATA_CONFIG, schema: 'hs' });
    const sfCI = createMockCI({ ...MOCK_DATA_CONFIG, schema: 'sf' });
    const ymCI = createMockCI({ ...MOCK_DATA_CONFIG, schema: 'ym' });

    let hsWatermark: string | undefined;
    let sfWatermark: string | undefined;
    let ymWatermark: string | undefined;

    beforeAll(async () => {
        if (!dbAvailable) return;

        // Reset to clean baseline: remove any leftover incremental data from prior runs
        // (both e2e-specific and apply_incremental_changes.sql delta records)
        // and normalize all timestamps so the full sync captures a uniform watermark.
        const pool = await getDirectPool();
        await pool.request().query(`
            DELETE FROM hs.contacts WHERE email LIKE 'new.person%@example.com' OR email LIKE 'delta.new%@example.com';
            DELETE FROM sf.Contact WHERE Id IN ('003000000000051AA','003000000000052AA','003000000000053AA');
            DELETE FROM ym.members WHERE member_number LIKE 'MEM-NEW-%' OR member_number LIKE 'MEM-DELTA-%';

            -- Normalize all timestamps to MIN so watermark is uniform across all rows
            UPDATE hs.contacts SET lastmodifieddate = (SELECT MIN(lastmodifieddate) FROM hs.contacts);
            UPDATE sf.Contact SET LastModifiedDate = (SELECT MIN(LastModifiedDate) FROM sf.Contact);
            UPDATE ym.members SET updated_at = (SELECT MIN(updated_at) FROM ym.members);
        `);
    });

    afterAll(async () => {
        if (!dbAvailable) return;

        // Cleanup: remove incremental data (both e2e and delta records) and close pools
        const pool = await getDirectPool();
        await pool.request().query(`
            DELETE FROM hs.contacts WHERE email LIKE 'new.person%@example.com' OR email LIKE 'delta.new%@example.com';
            DELETE FROM sf.Contact WHERE Id IN ('003000000000051AA','003000000000052AA','003000000000053AA');
            DELETE FROM ym.members WHERE member_number LIKE 'MEM-NEW-%' OR member_number LIKE 'MEM-DELTA-%';
        `);
        await pool.close();
        directPool = null;

        await hsConnector.CloseAllPools();
        await sfConnector.CloseAllPools();
        await ymConnector.CloseAllPools();
    });

    // Phase 1: Capture watermarks from full sync
    // Counts are dynamic since apply_incremental_changes.sql may have modified the base data
    let hsBaseCount = 0;
    let sfBaseCount = 0;
    let ymBaseCount = 0;

    describe('Phase 1: Full sync to capture watermarks', () => {
        it('should capture HubSpot watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(hsCI, 'contacts');
            const batch = await hsConnector.FetchChanges(ctx);
            expect(batch.Records.length).toBeGreaterThanOrEqual(50);
            hsBaseCount = batch.Records.length;
            hsWatermark = batch.NewWatermarkValue;
            expect(hsWatermark).toBeDefined();
        });

        it('should capture Salesforce watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(sfCI, 'Contact');
            const batch = await sfConnector.FetchChanges(ctx);
            expect(batch.Records.length).toBeGreaterThanOrEqual(50);
            sfBaseCount = batch.Records.length;
            sfWatermark = batch.NewWatermarkValue;
            expect(sfWatermark).toBeDefined();
        });

        it('should capture YM watermark', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ymCI, 'members');
            const batch = await ymConnector.FetchChanges(ctx);
            expect(batch.Records.length).toBeGreaterThanOrEqual(50);
            ymBaseCount = batch.Records.length;
            ymWatermark = batch.NewWatermarkValue;
            expect(ymWatermark).toBeDefined();
        });
    });

    // Phase 2: Insert new data and update existing data
    describe('Phase 2: Add incremental data', () => {
        it('should insert new HubSpot contacts and update existing ones', async ({ skip }) => {
            if (!dbAvailable) skip();
            const pool = await getDirectPool();

            // Insert 5 new contacts
            await pool.request().query(`
                INSERT INTO hs.contacts (email, firstname, lastname, phone, company, jobtitle, lifecyclestage)
                VALUES
                ('new.person1@example.com', 'New', 'Person1', '555-9901', 'NewCorp', 'Manager', 'lead'),
                ('new.person2@example.com', 'Another', 'Person2', '555-9902', 'NewCorp', 'Director', 'customer'),
                ('new.person3@example.com', 'Third', 'Person3', '555-9903', 'OtherInc', 'VP', 'opportunity'),
                ('new.person4@example.com', 'Fourth', 'Person4', '555-9904', 'OtherInc', 'CEO', 'customer'),
                ('new.person5@example.com', 'Fifth', 'Person5', '555-9905', 'TestLLC', 'CTO', 'lead');
            `);

            // Update 3 existing contacts
            await pool.request().query(`
                UPDATE TOP(3) hs.contacts SET
                    phone = '555-UPDATED',
                    lastmodifieddate = GETUTCDATE()
                WHERE lastmodifieddate < DATEADD(MINUTE, -1, GETUTCDATE())
                  AND email NOT LIKE 'new.person%';
            `);

            // Verify total count: base + 5 new
            const countResult = await pool.request().query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM hs.contacts');
            expect(countResult.recordset[0].cnt).toBe(hsBaseCount + 5);
        });

        it('should insert new Salesforce contacts and update existing ones', async ({ skip }) => {
            if (!dbAvailable) skip();
            const pool = await getDirectPool();

            await pool.request().query(`
                INSERT INTO sf.Contact (Id, FirstName, LastName, Email, Phone)
                VALUES
                ('003000000000051AA', 'NewSF', 'Contact1', 'newsf1@example.com', '555-8801'),
                ('003000000000052AA', 'NewSF', 'Contact2', 'newsf2@example.com', '555-8802'),
                ('003000000000053AA', 'NewSF', 'Contact3', 'newsf3@example.com', '555-8803');
            `);

            await pool.request().query(`
                UPDATE TOP(2) sf.Contact SET Phone = '555-SF-UPD', LastModifiedDate = GETUTCDATE()
                WHERE LastModifiedDate < DATEADD(MINUTE, -1, GETUTCDATE())
                  AND Id NOT IN ('003000000000051AA','003000000000052AA','003000000000053AA');
            `);

            // Verify total count: base + 3 new
            const countResult = await pool.request().query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM sf.Contact');
            expect(countResult.recordset[0].cnt).toBe(sfBaseCount + 3);
        });

        it('should insert new YM members and update existing ones', async ({ skip }) => {
            if (!dbAvailable) skip();
            const pool = await getDirectPool();

            await pool.request().query(`
                INSERT INTO ym.members (member_number, first_name, last_name, email, status)
                VALUES
                ('MEM-NEW-001', 'NewYM', 'Member1', 'newym1@example.com', 'Active'),
                ('MEM-NEW-002', 'NewYM', 'Member2', 'newym2@example.com', 'Active'),
                ('MEM-NEW-003', 'NewYM', 'Member3', 'newym3@example.com', 'Active'),
                ('MEM-NEW-004', 'NewYM', 'Member4', 'newym4@example.com', 'Active');
            `);

            await pool.request().query(`
                UPDATE TOP(2) ym.members SET phone = '555-YM-UPD', updated_at = GETUTCDATE()
                WHERE updated_at < DATEADD(MINUTE, -1, GETUTCDATE())
                  AND member_number NOT LIKE 'MEM-NEW-%';
            `);

            // Verify total count: base + 4 new
            const countResult = await pool.request().query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM ym.members');
            expect(countResult.recordset[0].cnt).toBe(ymBaseCount + 4);
        });
    });

    // Phase 3: Incremental fetch should only return new/updated records
    describe('Phase 3: Incremental fetch returns only changes', () => {
        it('should fetch only new/updated HubSpot contacts (not all 55)', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(hsCI, 'contacts', hsWatermark!);
            const batch = await hsConnector.FetchChanges(ctx);
            // 5 new + 3 updated = 8 records
            expect(batch.Records.length).toBe(8);
            expect(batch.HasMore).toBe(false);

            // Verify new records are included
            const emails = batch.Records.map((r) => r.Fields['email'] as string);
            expect(emails).toContain('new.person1@example.com');
            expect(emails).toContain('new.person5@example.com');

            // Verify updated records are included
            const updatedRecords = batch.Records.filter((r) => r.Fields['phone'] === '555-UPDATED');
            expect(updatedRecords.length).toBe(3);
        });

        it('should fetch only new/updated SF contacts (not all 53)', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(sfCI, 'Contact', sfWatermark!);
            const batch = await sfConnector.FetchChanges(ctx);
            // 3 new + 2 updated = 5 records
            expect(batch.Records.length).toBe(5);
            expect(batch.HasMore).toBe(false);

            const emails = batch.Records.map((r) => r.Fields['Email'] as string);
            expect(emails).toContain('newsf1@example.com');
        });

        it('should fetch only new/updated YM members (not all 54)', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(ymCI, 'members', ymWatermark!);
            const batch = await ymConnector.FetchChanges(ctx);
            // 4 new + 2 updated = 6 records
            expect(batch.Records.length).toBe(6);
            expect(batch.HasMore).toBe(false);

            const memberNumbers = batch.Records.map((r) => r.Fields['member_number'] as string);
            expect(memberNumbers).toContain('MEM-NEW-001');
        });

        it('should provide updated watermarks after incremental fetch', async ({ skip }) => {
            if (!dbAvailable) skip();
            const ctx = makeFetchContext(hsCI, 'contacts', hsWatermark!);
            const batch = await hsConnector.FetchChanges(ctx);
            expect(batch.NewWatermarkValue).toBeDefined();
            // New watermark should be later than the old one.
            // Compare as ISO-8601 strings (lexicographic ordering works for ISO timestamps)
            // because SQL Server datetimeoffset(7) has sub-millisecond precision
            // that JavaScript Date cannot represent.
            expect(batch.NewWatermarkValue!.localeCompare(hsWatermark!)).toBeGreaterThan(0);
        });
    });
});
