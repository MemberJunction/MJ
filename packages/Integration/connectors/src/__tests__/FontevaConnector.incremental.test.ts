/**
 * Fonteva no-creds INCREMENTAL SYNC tests (fontevacontext.md §10 / §13 matrix).
 *
 * Drives the connector through TWO sequential sync passes over the rich fixture dataset,
 * asserting first-full vs incremental behavior, same-timestamp watermark advance, lookback
 * re-pull dedup by Salesforce Id + timestamp, deleted-record (IsDeleted) sync, and late
 * updates. All vitest unit tests against the mocked connector — no MJAPI/DB/live calls.
 *
 * Record MATCHING appears here ONLY as sync-dedup (dedup by Salesforce Id + SystemModstamp),
 * per scope. FDService action services (RecordMatchService, etc.) are NOT tested.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FontevaConnector } from '../FontevaConnector.js';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext, ExternalRecord } from '@memberjunction/integration-engine';
import {
    REGISTRATIONS,
    DELETED_REGISTRATION,
    soqlResponse,
    describeResponse,
    fieldNamesOf,
    sfId,
    type SFRecord,
} from './fixtures/fonteva-rich/fonteva-rich-fixtures.js';

const contextUser = {} as UserInfo;

function createMockCompanyIntegration(configOverrides?: Record<string, unknown>): MJCompanyIntegrationEntity {
    const config = JSON.stringify({
        loginUrl: 'https://login.salesforce.com',
        clientId: 'test-consumer-key',
        username: 'test@example.com',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nfake-key\n-----END RSA PRIVATE KEY-----',
        apiVersion: '61.0',
        ...configOverrides,
    });
    return {
        IntegrationID: 'fonteva-integration-id',
        Configuration: config,
        CredentialID: null,
    } as unknown as MJCompanyIntegrationEntity;
}

function mockTokenResponse(): Response {
    return {
        ok: true, status: 200, headers: new Headers(),
        json: async () => ({ access_token: 'mock-token', instance_url: 'https://na1.my.salesforce.com', token_type: 'Bearer' }),
        text: async () => '',
    } as unknown as Response;
}

function mockApiResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300, status, headers: new Headers(),
        json: async () => body, text: async () => JSON.stringify(body),
    } as unknown as Response;
}

const REG_IO = {
    BackingSObject: 'EventApi__Event_Registration__c',
    Namespace: 'EventApi',
    FDServiceWrapper: 'Registration',
    AccessPath: {
        primary: 'Salesforce',
        fdServicePath: '/services/apexrest/FDService/RegistrationService',
        salesforceSObjectPath: '/services/data/v{version}/sobjects/EventApi__Event_Registration__c',
        soqlObject: 'EventApi__Event_Registration__c',
    },
};

function mockEngineObjects() {
    vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
        GetIntegrationObject: (_id: string, name: string): MJIntegrationObjectEntity | undefined =>
            name === 'Registration'
                ? { Configuration: JSON.stringify(REG_IO) } as unknown as MJIntegrationObjectEntity
                : undefined,
        IntegrationObjects: [],
    } as unknown as IntegrationEngineBase);
}

/**
 * A scripted SOQL fetch driver: queues (describe, soql) response pairs per pass and
 * captures the SOQL URLs so a test can assert the WHERE clause for each pass.
 */
function makeDriver() {
    const capturedSoqlUrls: string[] = [];
    const queue: Array<{ body: unknown }> = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/services/oauth2/token')) return mockTokenResponse();
        if (url.includes('/query')) capturedSoqlUrls.push(decodeURIComponent(url));
        const next = queue.shift();
        return mockApiResponse(next?.body ?? { fields: [] });
    });
    return {
        capturedSoqlUrls,
        /** Queue a describe + soql pair for one FetchChanges pass. */
        queuePass(records: SFRecord[]) {
            queue.push({ body: describeResponse(fieldNamesOf(records.length ? records : REGISTRATIONS)) });
            queue.push({ body: soqlResponse(records) });
        },
    };
}

describe('FontevaConnector — incremental sync (§10)', () => {
    let connector: FontevaConnector;

    beforeEach(() => {
        connector = new FontevaConnector();
        vi.mock('jsonwebtoken', () => ({ default: { sign: () => 'mock-jwt-assertion' } }));
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('first full sync returns every record + sets a watermark past the max modstamp', async () => {
        mockEngineObjects();
        const driver = makeDriver();
        driver.queuePass(REGISTRATIONS);

        const result = await connector.FetchChanges({
            CompanyIntegration: createMockCompanyIntegration(),
            ObjectName: 'Registration',
            WatermarkValue: null,
            BatchSize: 2000,
            ContextUser: contextUser,
        });

        expect(result.Records.length).toBe(REGISTRATIONS.length);
        expect(result.Records.every(r => r.ObjectType === 'Registration')).toBe(true);
        // Max modstamp across REGISTRATIONS is REG-0006 @ 11:25:00, advanced +1ms.
        expect(result.NewWatermarkValue).toBe('2026-02-18T11:25:00.001Z');
        // First pass: no WHERE clause.
        expect(driver.capturedSoqlUrls[0]).not.toContain('WHERE');
    });

    it('second pass applies the saved watermark in the WHERE clause and returns only newer records', async () => {
        mockEngineObjects();
        const driver = makeDriver();
        // Pass 1: full.
        driver.queuePass(REGISTRATIONS);
        // Pass 2: only the records modified after the pass-1 watermark (one late update).
        const lateUpdate: SFRecord = {
            ...REGISTRATIONS[0],
            EventApi__Status__c: 'Attended',
            SystemModstamp: '2026-02-19T08:00:00.000Z',
            LastModifiedDate: '2026-02-19T08:00:00.000Z',
        };
        driver.queuePass([lateUpdate]);

        const ci = createMockCompanyIntegration();
        const pass1 = await connector.FetchChanges({
            CompanyIntegration: ci, ObjectName: 'Registration',
            WatermarkValue: null, BatchSize: 2000, ContextUser: contextUser,
        });
        const pass2 = await connector.FetchChanges({
            CompanyIntegration: ci, ObjectName: 'Registration',
            WatermarkValue: pass1.NewWatermarkValue ?? null, BatchSize: 2000, ContextUser: contextUser,
        });

        // Pass 2 SOQL carries the pass-1 watermark in a >= filter.
        const pass2Soql = driver.capturedSoqlUrls[1];
        expect(pass2Soql).toContain(`WHERE SystemModstamp >= ${pass1.NewWatermarkValue}`);
        // Only the late-updated record comes back, and its new status is reflected.
        expect(pass2.Records.length).toBe(1);
        expect(pass2.Records[0].ExternalID).toBe(sfId('Registration', 1));
        expect(pass2.Records[0].Fields['EventApi__Status__c']).toBe('Attended');
        expect(pass2.NewWatermarkValue).toBe('2026-02-19T08:00:00.001Z');
    });

    it('same-timestamp collision: watermark advances +1ms past a cluster sharing one modstamp', async () => {
        mockEngineObjects();
        const driver = makeDriver();
        // Three records bulk-imported with the IDENTICAL modstamp.
        const sameStamp = '2026-02-25T00:00:00.000Z';
        const cluster: SFRecord[] = REGISTRATIONS.slice(0, 3).map(r => ({
            ...r, SystemModstamp: sameStamp, LastModifiedDate: sameStamp,
        }));
        driver.queuePass(cluster);

        const result = await connector.FetchChanges({
            CompanyIntegration: createMockCompanyIntegration(),
            ObjectName: 'Registration', WatermarkValue: null,
            BatchSize: 2000, ContextUser: contextUser,
        });

        // The saved watermark is the cluster's modstamp + 1ms so the next `>=` filter
        // excludes the whole boundary cluster (no plateau / infinite re-pull).
        expect(result.NewWatermarkValue).toBe('2026-02-25T00:00:00.001Z');
        expect(new Date(result.NewWatermarkValue!).getTime())
            .toBe(new Date(sameStamp).getTime() + 1);
    });

    it('lookback re-pull dedups by Salesforce Id + timestamp across two passes', async () => {
        mockEngineObjects();
        const driver = makeDriver();
        // Pass 1: full set.
        driver.queuePass(REGISTRATIONS);
        // Pass 2: a small lookback window re-pulls REG-0005 + REG-0006 (already seen) plus
        // one genuinely new record. Dedup is the engine's job, but the connector must emit
        // each record keyed by its stable Salesforce Id + ModifiedAt so dedup can work.
        const newRecord: SFRecord = {
            ...REGISTRATIONS[0],
            Id: sfId('Registration', 7),
            Name: 'REG-0007',
            SystemModstamp: '2026-02-18T11:30:00.000Z',
            LastModifiedDate: '2026-02-18T11:30:00.000Z',
        };
        const lookbackBatch = [REGISTRATIONS[4], REGISTRATIONS[5], newRecord];
        driver.queuePass(lookbackBatch);

        const ci = createMockCompanyIntegration();
        const pass1 = await connector.FetchChanges({
            CompanyIntegration: ci, ObjectName: 'Registration',
            WatermarkValue: null, BatchSize: 2000, ContextUser: contextUser,
        });
        const pass2 = await connector.FetchChanges({
            CompanyIntegration: ci, ObjectName: 'Registration',
            WatermarkValue: pass1.NewWatermarkValue ?? null, BatchSize: 2000, ContextUser: contextUser,
        });

        // Build a dedup map keyed by Salesforce Id + ModifiedAt (the documented best practice).
        const seen = new Map<string, ExternalRecord>();
        const dedupKey = (r: ExternalRecord) => `${r.ExternalID}|${r.ModifiedAt?.toISOString() ?? ''}`;
        for (const r of [...pass1.Records, ...pass2.Records]) seen.set(dedupKey(r), r);

        // pass1 has 6 distinct, pass2 re-pulls 2 of them (same Id+timestamp → collapse) + 1 new.
        // Net distinct = 7, NOT 9.
        expect(pass1.Records.length).toBe(6);
        expect(pass2.Records.length).toBe(3);
        expect(seen.size).toBe(7);
        // The re-pulled REG-0005/0006 collapsed; REG-0007 is the only net-new.
        const ids = new Set([...seen.values()].map(r => r.ExternalID));
        expect(ids.has(sfId('Registration', 7))).toBe(true);
        expect(ids.size).toBe(7);
    });

    it('a record re-modified after lookback (same Id, newer timestamp) is NOT collapsed', async () => {
        mockEngineObjects();
        const driver = makeDriver();
        driver.queuePass([REGISTRATIONS[0]]);
        // Same record, later modstamp — a genuine update, must be a distinct dedup key.
        const reModified: SFRecord = {
            ...REGISTRATIONS[0],
            EventApi__Status__c: 'Cancelled',
            SystemModstamp: '2026-02-26T00:00:00.000Z',
            LastModifiedDate: '2026-02-26T00:00:00.000Z',
        };
        driver.queuePass([reModified]);

        const ci = createMockCompanyIntegration();
        const p1 = await connector.FetchChanges({
            CompanyIntegration: ci, ObjectName: 'Registration',
            WatermarkValue: null, BatchSize: 2000, ContextUser: contextUser,
        });
        const p2 = await connector.FetchChanges({
            CompanyIntegration: ci, ObjectName: 'Registration',
            WatermarkValue: p1.NewWatermarkValue ?? null, BatchSize: 2000, ContextUser: contextUser,
        });

        const dedupKey = (r: ExternalRecord) => `${r.ExternalID}|${r.ModifiedAt?.toISOString() ?? ''}`;
        // Same Id but different timestamps → two distinct keys (the update wins downstream).
        expect(dedupKey(p1.Records[0])).not.toBe(dedupKey(p2.Records[0]));
        expect(p1.Records[0].ExternalID).toBe(p2.Records[0].ExternalID);
        expect(p2.Records[0].Fields['EventApi__Status__c']).toBe('Cancelled');
    });

    it('flags soft-deleted (IsDeleted=true) records so the sync can tombstone them', async () => {
        mockEngineObjects();
        const driver = makeDriver();
        driver.queuePass([REGISTRATIONS[0], DELETED_REGISTRATION]);

        const result = await connector.FetchChanges({
            CompanyIntegration: createMockCompanyIntegration(),
            ObjectName: 'Registration', WatermarkValue: '2026-02-18T00:00:00.000Z',
            BatchSize: 2000, ContextUser: contextUser,
        });

        expect(result.Records.length).toBe(2);
        const live = result.Records.find(r => r.ExternalID === sfId('Registration', 1));
        const deleted = result.Records.find(r => r.ExternalID === sfId('Registration', 99));
        expect(live?.IsDeleted).toBe(false);
        // The deleted record is surfaced (queryAll) and flagged so the engine can tombstone it.
        expect(deleted).toBeDefined();
        expect(deleted!.IsDeleted).toBe(true);
        expect(deleted!.Fields['EventApi__Status__c']).toBe('Cancelled');
    });

    it('empty incremental batch returns no records and no watermark (resume from prior point)', async () => {
        mockEngineObjects();
        const driver = makeDriver();
        driver.queuePass([]); // describe + empty soql

        const result = await connector.FetchChanges({
            CompanyIntegration: createMockCompanyIntegration(),
            ObjectName: 'Registration', WatermarkValue: '2026-03-01T00:00:00.000Z',
            BatchSize: 2000, ContextUser: contextUser,
        });

        expect(result.Records.length).toBe(0);
        // No new max → connector returns undefined; engine keeps the prior watermark
        // (so a failed/empty pass resumes from the same point, not from zero).
        expect(result.NewWatermarkValue).toBeUndefined();
    });
});
