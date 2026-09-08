/**
 * Tests for the REST view-operations layer (rest/ViewOperationsHandler.ts).
 *
 * Covers entity resolution, read-permission enforcement BEFORE any query
 * executes (including the batch fail-fast contract), parameter sanitization
 * (Fields/MaxRows/StartRow coercion, ResultType defaulting, EntityName
 * requirement), and the error branches — plus documentation-style assertions
 * for the case-sensitive entity lookup and the unescaped filter interpolation
 * in getEntityViews, in the style of multiTenancy.security.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockRunViewFn, mockRunViewsFn, mockLogError, mockEntityList } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
    mockRunViewsFn: vi.fn(),
    mockLogError: vi.fn(),
    mockEntityList: [] as Array<{ Name: string; GetUserPermisions: (u: unknown) => { CanRead: boolean } }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockMetadata {
        public get Entities() {
            return mockEntityList;
        }
    }
    class MockRunView {
        public RunView(params: unknown, contextUser?: unknown): Promise<unknown> {
            return mockRunViewFn(params, contextUser);
        }
        public RunViews(params: unknown[], contextUser?: unknown): Promise<unknown> {
            return mockRunViewsFn(params, contextUser);
        }
    }
    return {
        ...actual,
        Metadata: MockMetadata,
        RunView: MockRunView,
        LogError: mockLogError,
    };
});

import type { RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { ViewOperationsHandler } from '../rest/ViewOperationsHandler.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function registerEntity(name: string, canRead: boolean): void {
    mockEntityList.push({ Name: name, GetUserPermisions: () => ({ CanRead: canRead }) });
}

function makeUser(): UserInfo {
    return { ID: 'user-1', Name: 'Reader' } as unknown as UserInfo;
}

const OK_RESULT = { Success: true, Results: [{ ID: '1' }], ErrorMessage: undefined };

beforeEach(() => {
    vi.clearAllMocks();
    mockEntityList.length = 0;
    registerEntity('Customers', true);
    registerEntity('Restricted Ledger', false);
    mockRunViewFn.mockResolvedValue(OK_RESULT);
    mockRunViewsFn.mockResolvedValue([OK_RESULT]);
});

// ─── runView ────────────────────────────────────────────────────────────────

describe('ViewOperationsHandler.runView', () => {
    it('executes the view for a readable entity and returns the RunViewResult', async () => {
        const user = makeUser();
        const params: RunViewParams = { EntityName: 'Customers' };

        const outcome = await ViewOperationsHandler.runView(params, user);

        expect(outcome.success).toBe(true);
        expect(outcome.result).toBe(OK_RESULT as unknown as RunViewResult);
        expect(mockRunViewFn).toHaveBeenCalledWith(params, user);
    });

    it('fails when the entity does not exist — and never executes the view', async () => {
        const outcome = await ViewOperationsHandler.runView({ EntityName: 'Ghost' }, makeUser());

        expect(outcome.success).toBe(false);
        expect(outcome.error).toBe(`Entity 'Ghost' not found`);
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('KNOWN GAP: entity lookup is case-sensitive (Entities.find ===), unlike EntityByName', async () => {
        // The data-access convention is md.EntityByName (case-insensitive, trimmed).
        // This handler scans Entities with strict equality, so a client sending
        // 'customers' gets "not found" even though the entity exists. Pinned so a
        // migration to EntityByName consciously flips this test.
        const outcome = await ViewOperationsHandler.runView({ EntityName: 'customers' }, makeUser());

        expect(outcome.success).toBe(false);
        expect(outcome.error).toBe(`Entity 'customers' not found`);
    });

    it('denies before executing when the user lacks read permission', async () => {
        const outcome = await ViewOperationsHandler.runView({ EntityName: 'Restricted Ledger' }, makeUser());

        expect(outcome.success).toBe(false);
        expect(outcome.error).toBe('User Reader does not have permission to read Restricted Ledger records');
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    describe('parameter sanitization', () => {
        it('defaults ResultType to "simple" when unset and preserves an explicit one', async () => {
            const defaulted: RunViewParams = { EntityName: 'Customers' };
            await ViewOperationsHandler.runView(defaulted, makeUser());
            expect((mockRunViewFn.mock.calls[0][0] as RunViewParams).ResultType).toBe('simple');

            const explicit: RunViewParams = { EntityName: 'Customers', ResultType: 'entity_object' };
            await ViewOperationsHandler.runView(explicit, makeUser());
            expect((mockRunViewFn.mock.calls[1][0] as RunViewParams).ResultType).toBe('entity_object');
        });

        it('splits comma-separated Fields strings and coerces numeric strings for MaxRows/StartRow', async () => {
            // REST clients send query-string-shaped values; the handler normalizes in place
            const params = {
                EntityName: 'Customers',
                Fields: 'ID,Name,Email' as unknown as string[],
                MaxRows: '50' as unknown as number,
                StartRow: '10' as unknown as number,
            } as RunViewParams;

            const outcome = await ViewOperationsHandler.runView(params, makeUser());

            expect(outcome.success).toBe(true);
            const executed = mockRunViewFn.mock.calls[0][0] as RunViewParams;
            expect(executed.Fields).toEqual(['ID', 'Name', 'Email']);
            expect(executed.MaxRows).toBe(50);
            expect(executed.StartRow).toBe(10);
        });

        it('rejects a missing EntityName at the lookup step — before any query executes', async () => {
            // Note: sanitizeRunViewParams' "EntityName is required" branch is unreachable
            // through the public entry points, because every caller does the metadata
            // lookup FIRST and `find(e => e.Name === undefined)` misses. The effective
            // behavior (still a safe failure, different message) is pinned here.
            const outcome = await ViewOperationsHandler.runView({} as RunViewParams, makeUser());

            expect(outcome.success).toBe(false);
            expect(outcome.error).toBe(`Entity 'undefined' not found`);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });
    });
});

// ─── runViews (batch) ───────────────────────────────────────────────────────

describe('ViewOperationsHandler.runViews', () => {
    it('validates EVERY entry before executing ANY view (fail-fast, no partial execution)', async () => {
        const params: RunViewParams[] = [
            { EntityName: 'Customers' },
            { EntityName: 'Restricted Ledger' }, // second entry is unauthorized
        ];

        const outcome = await ViewOperationsHandler.runViews(params, makeUser());

        expect(outcome.success).toBe(false);
        expect(outcome.error).toBe('User Reader does not have permission to read Restricted Ledger records');
        expect(mockRunViewsFn).not.toHaveBeenCalled(); // nothing ran — not even the allowed first view
    });

    it('fails the whole batch when any entity is unknown', async () => {
        const outcome = await ViewOperationsHandler.runViews(
            [{ EntityName: 'Customers' }, { EntityName: 'Ghost' }],
            makeUser(),
        );

        expect(outcome.success).toBe(false);
        expect(outcome.error).toBe(`Entity 'Ghost' not found`);
        expect(mockRunViewsFn).not.toHaveBeenCalled();
    });

    it('sanitizes each entry and executes the batch through RunViews', async () => {
        registerEntity('Orders', true);
        const batchResults = [OK_RESULT, OK_RESULT];
        mockRunViewsFn.mockResolvedValue(batchResults);
        const params: RunViewParams[] = [
            { EntityName: 'Customers' },
            { EntityName: 'Orders', MaxRows: '5' as unknown as number },
        ];

        const outcome = await ViewOperationsHandler.runViews(params, makeUser());

        expect(outcome.success).toBe(true);
        expect(outcome.results).toBe(batchResults as unknown as RunViewResult[]);
        const executed = mockRunViewsFn.mock.calls[0][0] as RunViewParams[];
        expect(executed[0].ResultType).toBe('simple');
        expect(executed[1].MaxRows).toBe(5);
    });
});

// ─── listEntities ───────────────────────────────────────────────────────────

describe('ViewOperationsHandler.listEntities', () => {
    it('returns the RunViewResult for a readable entity', async () => {
        const result = await ViewOperationsHandler.listEntities({ EntityName: 'Customers' }, makeUser());

        expect(result).toBe(OK_RESULT as unknown as RunViewResult);
    });

    it('throws (for the router to map) when the entity is unknown', async () => {
        await expect(ViewOperationsHandler.listEntities({ EntityName: 'Ghost' }, makeUser()))
            .rejects.toThrow(`Entity 'Ghost' not found`);
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('throws on missing read permission without executing', async () => {
        await expect(ViewOperationsHandler.listEntities({ EntityName: 'Restricted Ledger' }, makeUser()))
            .rejects.toThrow('does not have permission to read Restricted Ledger');
        expect(mockRunViewFn).not.toHaveBeenCalled();
        expect(mockLogError).toHaveBeenCalled();
    });
});

// ─── getEntityViews ─────────────────────────────────────────────────────────

describe('ViewOperationsHandler.getEntityViews', () => {
    it('queries MJ: User Views filtered to the entity and formats the results', async () => {
        const createdAt = new Date('2026-01-01T00:00:00Z');
        mockRunViewFn.mockResolvedValue({
            Success: true,
            Results: [{
                ID: 'v1', Name: 'My View', Description: 'desc', IsShared: true, CreatedAt: createdAt,
                InternalColumn: 'must not leak',
            }],
        });

        const outcome = await ViewOperationsHandler.getEntityViews('Customers', makeUser());

        expect(outcome.success).toBe(true);
        expect(outcome.views).toEqual([
            { ID: 'v1', Name: 'My View', Description: 'desc', IsShared: true, CreatedAt: createdAt },
        ]);
        const executed = mockRunViewFn.mock.calls[0][0] as RunViewParams;
        expect(executed.EntityName).toBe('MJ: User Views');
        expect(executed.ExtraFilter).toBe(`Entity = 'Customers'`);
    });

    it('fails for unknown entities and unauthorized readers without querying', async () => {
        const unknown = await ViewOperationsHandler.getEntityViews('Ghost', makeUser());
        const denied = await ViewOperationsHandler.getEntityViews('Restricted Ledger', makeUser());

        expect(unknown.success).toBe(false);
        expect(unknown.error).toBe(`Entity 'Ghost' not found`);
        expect(denied.success).toBe(false);
        expect(denied.error).toContain('does not have permission');
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('propagates the RunView ErrorMessage when the view query fails', async () => {
        mockRunViewFn.mockResolvedValue({ Success: false, Results: [], ErrorMessage: 'timeout talking to DB' });

        const outcome = await ViewOperationsHandler.getEntityViews('Customers', makeUser());

        expect(outcome.success).toBe(false);
        expect(outcome.error).toBe('timeout talking to DB');
    });

    it('KNOWN GAP: the entity name is interpolated into ExtraFilter without escaping', async () => {
        // Reachable only for names registered in metadata, so a hostile value requires a
        // hostile entity name — but an entity legitimately named with an apostrophe
        // (e.g. "O'Brien Records") already produces a broken/injectable filter today.
        registerEntity("O'Brien Records", true);
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

        await ViewOperationsHandler.getEntityViews("O'Brien Records", makeUser());

        const executed = mockRunViewFn.mock.calls[0][0] as RunViewParams;
        expect(executed.ExtraFilter).toBe(`Entity = 'O'Brien Records'`); // quote NOT doubled
    });
});
