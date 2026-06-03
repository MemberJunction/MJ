import { describe, it, expect } from 'vitest';
import type { FetchContext, FetchBatchResult, RESTResponse, RESTAuthContext } from '@memberjunction/integration-engine';
import { HubSpotConnector } from '../HubSpotConnector.js';

// --- Unit tests (no DB or API required) ---
describe('HubSpotConnector (unit)', () => {
    describe('GetDefaultFieldMappings', () => {
        const connector = new HubSpotConnector();

        it('should return mappings for contacts', () => {
            const mappings = connector.GetDefaultFieldMappings('contacts', 'Contacts');
            expect(mappings.length).toBe(6);

            const emailMapping = mappings.find((m) => m.SourceFieldName === 'email');
            expect(emailMapping).toBeDefined();
            expect(emailMapping!.DestinationFieldName).toBe('Email');
            expect(emailMapping!.IsKeyField).toBe(true);

            const firstNameMapping = mappings.find((m) => m.SourceFieldName === 'firstname');
            expect(firstNameMapping!.DestinationFieldName).toBe('FirstName');
        });

        it('should return mappings for companies', () => {
            const mappings = connector.GetDefaultFieldMappings('companies', 'Companies');
            expect(mappings.length).toBe(5);

            const nameMapping = mappings.find((m) => m.SourceFieldName === 'name');
            expect(nameMapping).toBeDefined();
            expect(nameMapping!.DestinationFieldName).toBe('Name');
            expect(nameMapping!.IsKeyField).toBe(true);
        });

        it('should return mappings for deals', () => {
            const mappings = connector.GetDefaultFieldMappings('deals', 'Deals');
            expect(mappings.length).toBe(5);

            const dealMapping = mappings.find((m) => m.SourceFieldName === 'dealname');
            expect(dealMapping).toBeDefined();
            expect(dealMapping!.DestinationFieldName).toBe('Name');
            expect(dealMapping!.IsKeyField).toBe(true);
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('unknown_object', 'Unknown');
            expect(mappings).toEqual([]);
        });
    });

    describe('MapHubSpotType', () => {
        const connector = new HubSpotConnector();

        it('should map string types correctly', () => {
            expect(connector.MapHubSpotType('string', 'text')).toBe('string');
            expect(connector.MapHubSpotType('string', 'textarea')).toBe('text');
            expect(connector.MapHubSpotType('string', 'html')).toBe('html');
        });

        it('should map numeric and date types', () => {
            expect(connector.MapHubSpotType('number', 'number')).toBe('number');
            expect(connector.MapHubSpotType('date', 'date')).toBe('datetime');
            expect(connector.MapHubSpotType('datetime', 'date')).toBe('datetime');
        });

        it('should map boolean and enum types', () => {
            expect(connector.MapHubSpotType('bool', 'booleancheckbox')).toBe('boolean');
            expect(connector.MapHubSpotType('enumeration', 'select')).toBe('enum');
        });

        it('should pass through unknown types', () => {
            expect(connector.MapHubSpotType('custom_widget', 'widget')).toBe('custom_widget');
        });

        it('should map phone_number to string', () => {
            expect(connector.MapHubSpotType('phone_number', 'phonenumber')).toBe('string');
        });
    });

    describe('MapPropertyToField', () => {
        const connector = new HubSpotConnector();

        it('should convert a HubSpot property definition to field schema', () => {
            const result = connector.MapPropertyToField({
                name: 'email',
                label: 'Email',
                type: 'string',
                fieldType: 'text',
                groupName: 'contactinformation',
                description: 'Contact email',
                hasUniqueValue: true,
                calculated: false,
                externalOptions: false,
            });

            expect(result.Name).toBe('email');
            expect(result.Label).toBe('Email');
            expect(result.DataType).toBe('string');
            expect(result.IsUniqueKey).toBe(true);
            expect(result.IsReadOnly).toBe(false);
        });

        it('should mark calculated properties as read-only', () => {
            const result = connector.MapPropertyToField({
                name: 'hs_object_id',
                label: 'Object ID',
                type: 'number',
                fieldType: 'number',
                groupName: 'contactinformation',
                description: '',
                hasUniqueValue: true,
                calculated: true,
                externalOptions: false,
            });

            expect(result.IsReadOnly).toBe(true);
        });
    });

    describe('GetDefaultConfiguration', () => {
        const connector = new HubSpotConnector();

        it('should return HubSpot schema name', () => {
            const config = connector.GetDefaultConfiguration();
            expect(config.DefaultSchemaName).toBe('HubSpot');
        });
    });
});

// --- Search keyset pagination: 10k-window cap + same-timestamp cluster fix (no DB/API) ---

type MockFilter = { propertyName: string; operator: string; value: string };
type MockGroup = { filters: MockFilter[] };

/**
 * Drives FetchChangesViaSearch against an in-memory HubSpot search API that models a single
 * same-`hs_lastmodifieddate` cluster of `clusterSize` records (ids 1..clusterSize), the API's
 * 10,000-results `after`-offset window cap, and the `archived:true` delete-detection call (empty).
 * No network, no DB — overrides the two protected seams (Authenticate, MakeHTTPRequest).
 */
class KeysetTestHubSpot extends HubSpotConnector {
    public clusterDateIso = '2024-06-01T00:00:00.000Z';
    public clusterSize = 0;
    public sortsSeen: unknown[] = [];
    public reanchorFloors = new Set<number>();
    /** Simulate the HubSpot contract violation: a non-empty `total` with an empty results page. */
    public emptyPageWithLargeTotal = false;

    public runParseCursor(raw: string | undefined): { after?: string; anchorDateMs?: string; anchorId?: string } {
        return this.parseSearchCursor(raw);
    }
    public runComputeResume(args: {
        incoming: { after?: string; anchorDateMs?: string; anchorId?: string };
        pagingNextAfter: string | undefined;
        total: number;
        lastAnchorDateMs: string | undefined;
        lastAnchorId: string | undefined;
    }): { nextCursor: { after?: string; anchorDateMs?: string; anchorId?: string } | undefined; hasMore: boolean } {
        return this.computeSearchResume(args);
    }
    public runFetchViaSearch(ctx: FetchContext): Promise<FetchBatchResult> {
        return this.FetchChangesViaSearch(ctx);
    }

    protected async Authenticate(): Promise<RESTAuthContext> {
        return { Token: 'test-token' };
    }

    protected async MakeHTTPRequest(
        _auth: RESTAuthContext,
        _url: string,
        _method: string,
        _headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const b = (body ?? {}) as { filterGroups?: MockGroup[]; sorts?: unknown[]; after?: string; archived?: boolean };
        if (b.archived) {
            return { Status: 200, Body: { results: [], total: 0 }, Headers: {} };
        }
        if (b.sorts) this.sortsSeen.push(b.sorts);

        if (this.emptyPageWithLargeTotal) {
            // total beyond the cap but an empty page → no keyset anchor can be formed.
            return { Status: 200, Body: { results: [], total: 25_000 }, Headers: {} };
        }

        // All records share one date, so the keyset reduces to an exclusive lower bound on id.
        const floorId = this.floorIdFromFilter(b.filterGroups ?? []);
        if (floorId > 0) this.reanchorFloors.add(floorId);

        const total = Math.max(0, this.clusterSize - floorId);
        const offset = b.after ? Number(b.after) : 0;
        const startId = floorId + offset + 1;
        const results: unknown[] = [];
        for (let i = 0; i < 100 && startId + i <= this.clusterSize; i++) {
            const id = startId + i;
            results.push({ id: String(id), properties: { hs_object_id: String(id), hs_lastmodifieddate: this.clusterDateIso } });
        }
        const nextOffset = offset + 100;
        const moreRemain = floorId + nextOffset < this.clusterSize;
        const underCap = nextOffset < 10_000; // HubSpot won't serve after >= 10000
        const nextAfter = moreRemain && underCap && results.length === 100 ? String(nextOffset) : undefined;
        return {
            Status: 200,
            Body: { results, total, paging: nextAfter ? { next: { after: nextAfter } } : undefined },
            Headers: {},
        };
    }

    private floorIdFromFilter(filterGroups: MockGroup[]): number {
        for (const g of filterGroups) {
            for (const f of g.filters ?? []) {
                if (f.propertyName === 'hs_object_id' && f.operator === 'GT') return Number(f.value);
            }
        }
        return 0; // base GTE-watermark filter → all cluster records match
    }
}

describe('HubSpotConnector — search keyset pagination (10k window cap fix)', () => {
    describe('parseSearchCursor', () => {
        const c = new KeysetTestHubSpot();
        it('returns empty for undefined/empty input', () => {
            expect(c.runParseCursor(undefined)).toEqual({});
            expect(c.runParseCursor('')).toEqual({});
        });
        it('round-trips a JSON keyset cursor', () => {
            expect(c.runParseCursor(JSON.stringify({ anchorDateMs: '123', anchorId: '50' }))).toEqual({ anchorDateMs: '123', anchorId: '50' });
        });
        it('round-trips a JSON window cursor', () => {
            expect(c.runParseCursor(JSON.stringify({ after: '200' }))).toEqual({ after: '200' });
        });
        it('treats a legacy bare numeric after as a window offset', () => {
            expect(c.runParseCursor('9900')).toEqual({ after: '9900' });
        });
    });

    describe('computeSearchResume decision table', () => {
        const c = new KeysetTestHubSpot();
        it('continues within a window when the next offset is under the cap (anchor preserved)', () => {
            const r = c.runComputeResume({ incoming: { anchorDateMs: 'T', anchorId: '5' }, pagingNextAfter: '200', total: 50_000, lastAnchorDateMs: 'T', lastAnchorId: '300' });
            expect(r.hasMore).toBe(true);
            expect(r.nextCursor).toEqual({ after: '200', anchorDateMs: 'T', anchorId: '5' });
        });
        it('re-anchors by keyset when the window is exhausted but records remain', () => {
            const r = c.runComputeResume({ incoming: {}, pagingNextAfter: undefined, total: 25_000, lastAnchorDateMs: '1717', lastAnchorId: '10000' });
            expect(r.hasMore).toBe(true);
            expect(r.nextCursor).toEqual({ anchorDateMs: '1717', anchorId: '10000' });
            expect(r.nextCursor?.after).toBeUndefined(); // re-anchor drops the window offset
        });
        it('re-anchors (does NOT keep paging) once the API offset reaches the 10k cap', () => {
            const r = c.runComputeResume({ incoming: {}, pagingNextAfter: '10000', total: 25_000, lastAnchorDateMs: '1717', lastAnchorId: '10000' });
            expect(r.nextCursor).toEqual({ anchorDateMs: '1717', anchorId: '10000' });
        });
        it('completes when the window is exhausted and total is within the cap', () => {
            const r = c.runComputeResume({ incoming: {}, pagingNextAfter: undefined, total: 5_000, lastAnchorDateMs: '1717', lastAnchorId: '25000' });
            expect(r.hasMore).toBe(false);
            expect(r.nextCursor).toBeUndefined();
        });
        it('flags STALLED (not silent completion) when total exceeds the cap but no anchor can be formed', () => {
            const r = c.runComputeResume({ incoming: {}, pagingNextAfter: undefined, total: 25_000, lastAnchorDateMs: undefined, lastAnchorId: undefined });
            expect(r.hasMore).toBe(false);
            expect(r.nextCursor).toBeUndefined();
            expect(r.stalled).toBe(true); // caller must fail loud, not drop the remaining records
        });

        it('does NOT flag stalled on a normal within-cap completion', () => {
            const r = c.runComputeResume({ incoming: {}, pagingNextAfter: undefined, total: 5_000, lastAnchorDateMs: '1717', lastAnchorId: '5000' });
            expect(r.hasMore).toBe(false);
            expect(r.stalled).toBeFalsy();
        });
    });

    describe('FetchChangesViaSearch end-to-end', () => {
        function baseCtx(): FetchContext {
            return {
                CompanyIntegration: {},
                ContextUser: {},
                ObjectName: 'companies',
                WatermarkValue: '2023-01-01T00:00:00.000Z',
                BatchSize: 100,
                RequestedSourceFields: ['hs_object_id', 'hs_lastmodifieddate'],
            } as unknown as FetchContext;
        }

        async function drain(connector: KeysetTestHubSpot): Promise<string[]> {
            const ids: string[] = [];
            let cursor: string | undefined;
            let hasMore = true;
            let guard = 0;
            while (hasMore) {
                if (++guard > 5_000) throw new Error('runaway pagination loop');
                const ctx = { ...baseCtx(), CurrentCursor: cursor } as unknown as FetchContext;
                const batch = await connector.runFetchViaSearch(ctx);
                for (const r of batch.Records) if (!r.IsDeleted) ids.push(r.ExternalID);
                hasMore = batch.HasMore;
                cursor = batch.NextCursor;
            }
            return ids;
        }

        it('pages through a >10k same-timestamp cluster with no skips or duplicates', async () => {
            const connector = new KeysetTestHubSpot();
            connector.clusterSize = 25_000;
            const ids = await drain(connector);

            expect(ids.length).toBe(25_000);
            expect(new Set(ids).size).toBe(25_000); // no duplicates
            const nums = ids.map(Number).sort((a, b) => a - b);
            expect(nums[0]).toBe(1); // no leading skip
            expect(nums[nums.length - 1]).toBe(25_000); // the straggler past the cap is fetched
            // exactly two re-anchors, at the two 10k window boundaries
            expect([...connector.reanchorFloors].sort((a, b) => a - b)).toEqual([10_000, 20_000]);
        });

        it('always requests the hs_object_id secondary sort (keyset tie-breaker)', async () => {
            const connector = new KeysetTestHubSpot();
            connector.clusterSize = 250;
            await drain(connector);
            expect(connector.sortsSeen.length).toBeGreaterThan(0);
            for (const sorts of connector.sortsSeen) {
                const arr = sorts as Array<{ propertyName: string }>;
                expect(arr.map(s => s.propertyName)).toContain('hs_object_id');
            }
        });

        it('terminates in one window with no re-anchor when total <= 10k (backward compatible)', async () => {
            const connector = new KeysetTestHubSpot();
            connector.clusterSize = 250;
            const ids = await drain(connector);
            expect(ids.length).toBe(250);
            expect(connector.reanchorFloors.size).toBe(0);
        });

        it('throws loudly (no silent drop) when total > cap but a page returns no keyset anchor', async () => {
            const connector = new KeysetTestHubSpot();
            connector.emptyPageWithLargeTotal = true;
            const ctx = { ...baseCtx(), CurrentCursor: undefined } as unknown as FetchContext;
            await expect(connector.runFetchViaSearch(ctx)).rejects.toThrow(/cannot advance without risking silent record loss/);
        });
    });
});
