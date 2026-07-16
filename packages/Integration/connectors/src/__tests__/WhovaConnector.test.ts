import { describe, it, expect, beforeEach } from 'vitest';
import type {
    RESTResponse,
    PaginationType,
    FetchContext,
    ExternalRecord,
} from '@memberjunction/integration-engine';
import type { MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import { WhovaConnector } from '../WhovaConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

/**
 * READ-ONLY / MOCKED-ONLY test connector. Overrides the auth + HTTP transport seams (and the engine
 * cache accessor) so no test ever touches a live Whova API and no mutation occurs. Whova is
 * read/export-only, so there is NO write path to test. Every HTTP call is routed to a canned response
 * by URL and recorded for assertion.
 */
class TestWhovaConnector extends WhovaConnector {
    /** URL → canned response. */
    public Routes = new Map<string, RESTResponse>();
    /** Every URL the connector requested, in order. */
    public RequestedURLs: string[] = [];
    /** Resolved credential the fake Authenticate returns. */
    public TestToken: string | undefined = 'test-token';
    public TestEvent: string | undefined = 'Test Conference 2026';
    public TestBaseURL: string | undefined = 'https://mock.whova.test/api/v1';
    /** IO row the fake GetCachedObject returns (drives the FetchChanges APIPath branch). */
    public StubAPIPath: string | null = null;

    protected override async Authenticate(): Promise<{ Token: string; Event?: string; BaseURL?: string }> {
        if (!this.TestToken) throw new Error('No Whova credential or Configuration JSON found — a "Token" is required.');
        return { Token: this.TestToken, Event: this.TestEvent, BaseURL: this.TestBaseURL };
    }

    protected override async MakeHTTPRequest(
        _auth: { Token: string },
        url: string,
        _method: string,
        _headers: Record<string, string>
    ): Promise<RESTResponse> {
        this.RequestedURLs.push(url);
        const canned = this.Routes.get(url);
        if (!canned) return { Status: 404, Body: { message: `no canned response for ${url}` }, Headers: {} };
        return canned;
    }

    /** Stub the engine cache so FetchChanges' APIPath branch is testable without a live IntegrationEngine. */
    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        return { Name: objectName, APIPath: this.StubAPIPath } as unknown as MJIntegrationObjectEntity;
    }

    // Expose protected seams for direct unit assertions.
    public callNormalize(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public callPagination(body: unknown, type: PaginationType, page: number, offset: number): { HasMore: boolean; NextCursor?: string; NextPage?: number; NextOffset?: number } {
        return this.ExtractPaginationInfo(body, type, page, offset, 50);
    }
    public callBuildHeaders(): Record<string, string> {
        return this.BuildHeaders({ Token: this.TestToken ?? '' });
    }
    public callGetBaseURL(): string {
        return this.GetBaseURL({} as MJCompanyIntegrationEntity, { Token: 'x', BaseURL: this.TestBaseURL });
    }
}

const companyIntegration = { IntegrationID: 'int-1' } as unknown as MJCompanyIntegrationEntity;
const contextUser = {} as unknown as UserInfo;

function fetchCtx(objectName: string): FetchContext {
    return {
        CompanyIntegration: companyIntegration,
        ObjectName: objectName,
        WatermarkValue: null,
        BatchSize: 100,
        ContextUser: contextUser,
    };
}

describe('WhovaConnector', () => {
    let connector: TestWhovaConnector;
    beforeEach(() => {
        connector = new TestWhovaConnector();
    });

    describe('Identity & capabilities', () => {
        it('IntegrationName getter is the verbatim canonical name "whova"', () => {
            expect(connector.IntegrationName).toBe('whova');
        });

        it('the real connector class is named WhovaConnector', () => {
            expect(new WhovaConnector().constructor.name).toBe('WhovaConnector');
        });

        it('is read/export-only: no create/update/delete capability, read is on', () => {
            expect(connector.SupportsCreate).toBe(false);
            expect(connector.SupportsUpdate).toBe(false);
            expect(connector.SupportsDelete).toBe(false);
            expect(connector.SupportsGet).toBe(true);
        });

        it('discovery is NOT authoritative (no complete-gamut list/describe endpoint)', () => {
            expect(connector.DiscoveryIsAuthoritative).toBe(false);
        });
    });

    describe('BuildHeaders', () => {
        it('injects a bearer Authorization header + JSON Accept', () => {
            connector.TestToken = 'abc123';
            const headers = connector.callBuildHeaders();
            expect(headers['Authorization']).toBe('Bearer abc123');
            expect(headers['Accept']).toBe('application/json');
        });
    });

    describe('GetBaseURL', () => {
        it('returns the runtime-configured base URL (trailing slash trimmed)', () => {
            connector.TestBaseURL = 'https://mock.whova.test/api/v1/';
            expect(connector.callGetBaseURL()).toBe('https://mock.whova.test/api/v1');
        });

        it('throws (never fabricates a host) when no base URL is configured', () => {
            connector.TestBaseURL = undefined;
            expect(() => connector.callGetBaseURL()).toThrow(/base URL is not configured/i);
        });
    });

    describe('NormalizeResponse — envelope unwrapping (no fabricated schema)', () => {
        it('unwraps a root array', () => {
            expect(connector.callNormalize([{ Email: 'a@example.com' }, { Email: 'b@example.com' }], null))
                .toHaveLength(2);
        });

        it('unwraps a wrapper key when ResponseDataKey is set', () => {
            const body = { data: [{ Email: 'a@example.com' }], meta: {} };
            expect(connector.callNormalize(body, 'data')).toEqual([{ Email: 'a@example.com' }]);
        });

        it('unwraps a single array-valued property of a wrapper object', () => {
            const body = { attendees: [{ Email: 'a@example.com' }] };
            expect(connector.callNormalize(body, null)).toEqual([{ Email: 'a@example.com' }]);
        });

        it('wraps a single root object into a one-element array', () => {
            expect(connector.callNormalize({ Email: 'a@example.com' }, null))
                .toEqual([{ Email: 'a@example.com' }]);
        });

        it('returns [] for a non-object/non-array body', () => {
            expect(connector.callNormalize('not json', null)).toEqual([]);
            expect(connector.callNormalize(null, null)).toEqual([]);
        });
    });

    describe('ExtractPaginationInfo', () => {
        it('reports no more pages for PaginationType=None (the documented default)', () => {
            expect(connector.callPagination({ next: 'x' }, 'None', 1, 0).HasMore).toBe(false);
        });

        it('surfaces a NextCursor when a runtime cursor field is present', () => {
            const state = connector.callPagination({ next_cursor: 'CUR2' }, 'Cursor', 1, 0);
            expect(state).toEqual({ HasMore: true, NextCursor: 'CUR2' });
        });

        it('advances a page number on has_more for PageNumber pagination', () => {
            const state = connector.callPagination({ has_more: true }, 'PageNumber', 3, 0);
            expect(state).toEqual({ HasMore: true, NextPage: 4 });
        });

        it('stops when no next signal is present', () => {
            expect(connector.callPagination({}, 'Cursor', 1, 0).HasMore).toBe(false);
        });
    });

    describe('TestConnection — HONEST-NA posture', () => {
        it('fails clearly when a base URL is not yet configured', async () => {
            connector.TestBaseURL = undefined;
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toMatch(/no REST base URL is configured/i);
        });

        it('reports an auth failure from the probed base URL', async () => {
            connector.Routes.set('https://mock.whova.test/api/v1', { Status: 401, Body: {}, Headers: {} });
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toMatch(/authentication failed \(HTTP 401\)/i);
        });

        it('succeeds when the configured base URL responds', async () => {
            connector.Routes.set('https://mock.whova.test/api/v1', { Status: 200, Body: {}, Headers: {} });
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(true);
            expect(result.Message).toMatch(/Test Conference 2026/);
        });

        it('fails with a clear message when no credential Token resolves', async () => {
            connector.TestToken = undefined;
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toMatch(/Token.*required/i);
        });
    });

    describe('FetchChanges', () => {
        it('surfaces a NO_RUNTIME_PATH warning + zero records when APIPath is unconfigured (Declared default)', async () => {
            connector.StubAPIPath = null;
            const result = await connector.FetchChanges(fetchCtx('Orders'));
            expect(result.Records).toHaveLength(0);
            expect(result.HasMore).toBe(false);
            expect(result.Warnings?.[0]?.Code).toBe('NO_RUNTIME_PATH');
        });
    });

    describe('Event-scope echo — full-record pass-through preserved', () => {
        it('adds the Event scope without dropping any source key', () => {
            const record: ExternalRecord = {
                ExternalID: 'abc',
                ObjectType: 'Attendees',
                Fields: { Email: 'a@example.com', FirstName: 'Ada', custom_pronouns: 'she/her' },
            };
            // Exercise the private echo via a minimal reflective call — the mapped record keeps every key.
            const echoed = (connector as unknown as { echoEventScope: (r: ExternalRecord, e: string) => ExternalRecord })
                .echoEventScope(record, 'Test Conference 2026');
            const fields = echoed.Fields as Record<string, unknown>;
            expect(fields['Event']).toBe('Test Conference 2026');
            expect(fields['Email']).toBe('a@example.com');
            expect(fields['custom_pronouns']).toBe('she/her'); // custom field preserved
        });

        it('does not overwrite an Event value the source already carries', () => {
            const record: ExternalRecord = {
                ExternalID: 'abc',
                ObjectType: 'Orders',
                Fields: { Event: 'Existing Event', OrderTotal: 42 },
            };
            const echoed = (connector as unknown as { echoEventScope: (r: ExternalRecord, e: string) => ExternalRecord })
                .echoEventScope(record, 'Override Event');
            expect((echoed.Fields as Record<string, unknown>)['Event']).toBe('Existing Event');
        });
    });
});
