import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock CanRun (unused by the janitor path, but SessionManager imports it).
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: { HasPermission: vi.fn(async () => true) },
}));

// Capture the ExtraFilter passed to each sweep page and return controllable rows.
const runViewMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            ...actual.RunView,
            FromMetadataProvider: () => ({ RunView: runViewMock }),
        },
    };
});

import { SessionJanitor } from '../agentSessions/SessionJanitor.js';
import { GetHostInstanceID, GetHostNamePrefix } from '../agentSessions/HostInstance.js';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';

interface FakeSession {
    ID: string;
    Status: 'Active' | 'Idle' | 'Closed';
    Load: (id: string) => Promise<boolean>;
    Save: () => Promise<boolean>;
    LatestResult?: { CompleteMessage?: string };
    ClosedAt?: Date | null;
}

function makeUser(): UserInfo {
    return { ID: 'system-user', Email: 'system@example.com' } as unknown as UserInfo;
}

/**
 * Build a provider whose GetEntityObject (used by SessionManager.CloseSession to load a session by
 * ID) returns a fresh entity backed by `store`, recording which IDs get closed. The channel sweep
 * inside CloseSession uses runViewMock, which we default to an empty channel list.
 */
function makeProvider(store: Map<string, 'Active' | 'Idle' | 'Closed'>): {
    provider: IMetadataProvider;
    closedIds: string[];
} {
    const closedIds: string[] = [];
    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            // Both the session-load and (within close) channel rows come through here in real code,
            // but channels are returned via runViewMock; this factory only serves session loads.
            const entity: FakeSession = {
                ID: '',
                Status: 'Active',
                Load: vi.fn(async (id: string) => {
                    const status = store.get(id);
                    if (status == null) return false;
                    entity.ID = id;
                    entity.Status = status;
                    return true;
                }),
                Save: vi.fn(async () => {
                    if (entity.Status === 'Closed') {
                        store.set(entity.ID, 'Closed');
                        closedIds.push(entity.ID);
                    }
                    return true;
                }),
                LatestResult: { CompleteMessage: '' },
            };
            return entity as unknown as Awaited<ReturnType<IMetadataProvider['GetEntityObject']>>;
        }),
    } as unknown as IMetadataProvider;
    return { provider, closedIds };
}

/**
 * Queue of result-sets for the *session* sweep pages (entity 'MJ: AI Agent Sessions'). Channel
 * sweeps (entity 'MJ: AI Agent Session Channels', issued by CloseSession) always resolve empty so
 * they never consume a queued session page. This keeps page assertions deterministic.
 */
let sessionPages: Array<{ Success: boolean; Results: unknown[]; ErrorMessage?: string }> = [];

/** Only the RunView calls that paged the session sweep (ignores the channel-sweep calls). */
function sessionSweepCalls(): Array<[{ EntityName: string; ExtraFilter: string; AfterKey?: unknown }]> {
    return runViewMock.mock.calls.filter(
        (c) => (c[0] as { EntityName: string }).EntityName === 'MJ: AI Agent Sessions',
    ) as Array<[{ EntityName: string; ExtraFilter: string; AfterKey?: unknown }]>;
}

beforeEach(() => {
    runViewMock.mockReset();
    sessionPages = [];
    runViewMock.mockImplementation(async (params: { EntityName: string }) => {
        if (params.EntityName === 'MJ: AI Agent Session Channels') {
            return { Success: true, Results: [] };
        }
        return sessionPages.shift() ?? { Success: true, Results: [] };
    });
    // Reset the singleton's timers/state between tests.
    SessionJanitor.Instance.Stop();
});

describe('SessionJanitor.RunStartupRecovery', () => {
    it('closes prior-boot orphans of this host but not current-host or other-host sessions', async () => {
        // The sweep SQL filters by host prefix + "<> current"; here we emulate the DB by having
        // runViewMock return only the rows that filter WOULD match (prior-boot orphans). We assert
        // (a) the filter is correct and (b) the returned orphans get closed.
        const orphan = { ID: 'orphan-1', Status: 'Active' };
        sessionPages = [{ Success: true, Results: [orphan] }];

        const store = new Map<string, 'Active' | 'Idle' | 'Closed'>([['orphan-1', 'Active']]);
        const { provider, closedIds } = makeProvider(store);

        const count = await SessionJanitor.Instance.RunStartupRecovery(provider, makeUser());

        expect(count).toBe(1);
        expect(closedIds).toContain('orphan-1');

        // Assert the recovery filter targets this host's *other* boots, never the current instance.
        const filter = sessionSweepCalls()[0][0].ExtraFilter as string;
        expect(filter).toContain("Status IN ('Active','Idle')");
        expect(filter).toContain(`HostInstanceID LIKE '${GetHostNamePrefix()}%'`);
        expect(filter).toContain(`HostInstanceID <> '${GetHostInstanceID()}'`);
    });
});

describe('SessionJanitor.RunStalenessSweep', () => {
    it('closes only past-threshold sessions (filter is staleness-scoped)', async () => {
        const stale = { ID: 'stale-1', Status: 'Idle' };
        sessionPages = [{ Success: true, Results: [stale] }];

        const store = new Map<string, 'Active' | 'Idle' | 'Closed'>([['stale-1', 'Idle']]);
        const { provider, closedIds } = makeProvider(store);

        const count = await SessionJanitor.Instance.RunStalenessSweep(provider, makeUser());

        expect(count).toBe(1);
        expect(closedIds).toContain('stale-1');

        const filter = sessionSweepCalls()[0][0].ExtraFilter as string;
        expect(filter).toContain("Status IN ('Active','Idle')");
        expect(filter).toMatch(/LastActiveAt < '.*'/);
    });

    it('is idempotent — re-closing already-Closed rows is a harmless no-op', async () => {
        const alreadyClosed = { ID: 'done-1', Status: 'Closed' };
        sessionPages = [{ Success: true, Results: [alreadyClosed] }];

        const store = new Map<string, 'Active' | 'Idle' | 'Closed'>([['done-1', 'Closed']]);
        const { provider, closedIds } = makeProvider(store);

        const count = await SessionJanitor.Instance.RunStalenessSweep(provider, makeUser());

        // CloseSession returns true (idempotent) but no new close-write happens.
        expect(count).toBe(1);
        expect(closedIds).not.toContain('done-1');
    });

    it('uses keyset pagination — advances AfterKey across full pages and stops on a partial page', async () => {
        // First page is full (200) → expect a second call with AfterKey set; second page partial → stop.
        const fullPage = Array.from({ length: 200 }, (_, i) => ({ ID: `s-${i}`, Status: 'Active' }));
        const tailPage = [{ ID: 's-tail', Status: 'Active' }];
        sessionPages = [
            { Success: true, Results: fullPage },
            { Success: true, Results: tailPage },
        ];

        const store = new Map<string, 'Active' | 'Idle' | 'Closed'>();
        for (const r of [...fullPage, ...tailPage]) store.set(r.ID, 'Active');
        const { provider } = makeProvider(store);

        await SessionJanitor.Instance.RunStalenessSweep(provider, makeUser());

        const calls = sessionSweepCalls();
        expect(calls).toHaveLength(2);
        expect(calls[0][0].AfterKey).toBeUndefined();
        expect(calls[1][0].AfterKey).toBeDefined();
    });

    it('stops cleanly on a load failure without throwing', async () => {
        sessionPages = [{ Success: false, ErrorMessage: 'boom', Results: [] }];
        const { provider, closedIds } = makeProvider(new Map());

        const count = await SessionJanitor.Instance.RunStalenessSweep(provider, makeUser());
        expect(count).toBe(0);
        expect(closedIds.length).toBe(0);
    });
});
