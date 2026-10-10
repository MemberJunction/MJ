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
import {
    GetCurrentHostInstance,
    GetHostInstanceID,
    HostInstanceIdentity,
    SetHostInstancePort,
} from '../agentSessions/HostInstance.js';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJAIAgentSessionEntity } from '@memberjunction/core-entities';

/** The port this test process "serves" on, set the way `Serve` sets it, before anything reads the identity. */
const OUR_PORT = 4000;
/** The port of a second MJAPI on the same host. */
const OTHER_PORT = 4100;
SetHostInstancePort(OUR_PORT);

interface FakeSession {
    ID: string;
    Status: 'Active' | 'Idle' | 'Closed';
    Load: (id: string) => Promise<boolean>;
    Save: () => Promise<boolean>;
    LatestResult?: { CompleteMessage?: string };
    ClosedAt?: Date | null;
    CloseReason?: string | null;
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
    closedReasons: Map<string, string | null>;
} {
    const closedIds: string[] = [];
    const closedReasons = new Map<string, string | null>();
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
                        closedReasons.set(entity.ID, entity.CloseReason ?? null);
                    }
                    return true;
                }),
                LatestResult: { CompleteMessage: '' },
            };
            return entity as unknown as Awaited<ReturnType<IMetadataProvider['GetEntityObject']>>;
        }),
    } as unknown as IMetadataProvider;
    return { provider, closedIds, closedReasons };
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

type SessionStatus = MJAIAgentSessionEntity['Status'];

/** A session row as the recovery sweep reads it. */
interface SessionRow {
    ID: string;
    Status: SessionStatus;
    HostInstanceID: string;
}

/**
 * Answer the session sweep's reads from `rows` the way the database answers the recovery filter: rows still open in
 * `store` whose `HostInstanceID` starts with the filter's `LIKE` prefix and isn't the id it excludes. Channel reads
 * return nothing.
 */
function serveSessionReadsFrom(rows: SessionRow[], store: Map<string, SessionStatus>): void {
    runViewMock.mockImplementation(async (params: { EntityName: string; ExtraFilter: string }) => {
        if (params.EntityName !== 'MJ: AI Agent Sessions') {
            return { Success: true, Results: [] };
        }
        const likePrefix = /HostInstanceID LIKE '(.*?)%'/.exec(params.ExtraFilter)?.[1] ?? '';
        const excluded = /HostInstanceID <> '(.*?)'/.exec(params.ExtraFilter)?.[1];
        const results = rows
            .filter((r) => store.get(r.ID) !== 'Closed')
            .filter((r) => r.HostInstanceID.startsWith(likePrefix) && r.HostInstanceID !== excluded)
            .map((r) => ({ ...r, Status: store.get(r.ID) }));
        return { Success: true, Results: results };
    });
}

/** The status map a provider from {@link makeProvider} loads and saves through, built from `rows`. */
function storeOf(rows: SessionRow[]): Map<string, SessionStatus> {
    return new Map(rows.map((r) => [r.ID, r.Status]));
}

describe('SessionJanitor.RunStartupRecovery', () => {
    const ours = GetCurrentHostInstance();

    it('closes the sessions an earlier boot of this instance left, and nothing else (one MJAPI, as before)', async () => {
        const rows: SessionRow[] = [
            { ID: 'before-restart', Status: 'Active', HostInstanceID: `${ours.GetInstancePrefix()}31337:boot-before` },
            // The OS gave the restarted process the same pid; the boot id still differs.
            { ID: 'before-restart-same-pid', Status: 'Idle', HostInstanceID: `${ours.GetInstancePrefix()}${ours.ProcessID}:boot-before` },
            { ID: 'this-boot', Status: 'Active', HostInstanceID: ours.GetHostInstanceID() },
            { ID: 'other-host', Status: 'Active', HostInstanceID: `other-host:${OUR_PORT}:31337:boot-other` },
        ];
        const store = storeOf(rows);
        serveSessionReadsFrom(rows, store);
        const { provider, closedIds, closedReasons } = makeProvider(store);

        const count = await SessionJanitor.Instance.RunStartupRecovery(provider, makeUser());

        expect(count).toBe(2);
        expect([...closedIds].sort()).toEqual(['before-restart', 'before-restart-same-pid']);
        expect(closedReasons.get('before-restart')).toBe('Janitor');
        expect(store.get('this-boot')).toBe('Active');
        expect(store.get('other-host')).toBe('Active');

        // The read is narrowed to this instance's other boots: its host and port, never this boot.
        const filter = sessionSweepCalls()[0][0].ExtraFilter as string;
        expect(filter).toContain("Status IN ('Active','Idle')");
        expect(filter).toContain(`HostInstanceID LIKE '${ours.GetInstancePrefix()}%'`);
        expect(filter).toContain(`HostInstanceID <> '${GetHostInstanceID()}'`);
        expect(ours.GetInstancePrefix()).toContain(`:${OUR_PORT}:`);
    });

    it('leaves rows stamped before the port was added (hostname:pid:bootId) to the staleness sweep', async () => {
        // Its pid happens to equal our port, so the LIKE prefix reads it; the row check rejects it (it has no port).
        const rows: SessionRow[] = [
            { ID: 'pre-upgrade', Status: 'Active', HostInstanceID: `${ours.HostName}:${OUR_PORT}:boot-before-upgrade` },
        ];
        const store = storeOf(rows);
        serveSessionReadsFrom(rows, store);
        const { provider, closedIds } = makeProvider(store);

        const count = await SessionJanitor.Instance.RunStartupRecovery(provider, makeUser());

        expect(count).toBe(0);
        expect(closedIds).toEqual([]);
    });
});

describe('SessionJanitor.RunStartupRecovery with two MJAPIs on one host (#5309)', () => {
    const ours = GetCurrentHostInstance();
    const theirs = new HostInstanceIdentity(ours.HostName, String(OTHER_PORT), 40404, 'boot-theirs');

    /** Both instances' live sessions, and one each left by an earlier boot. */
    function sharedTable(): SessionRow[] {
        return [
            { ID: 'ours-live', Status: 'Active', HostInstanceID: ours.GetHostInstanceID() },
            { ID: 'ours-stale', Status: 'Idle', HostInstanceID: `${ours.GetInstancePrefix()}31337:boot-ours-before` },
            { ID: 'theirs-live', Status: 'Active', HostInstanceID: theirs.GetHostInstanceID() },
            { ID: 'theirs-stale', Status: 'Active', HostInstanceID: `${theirs.GetInstancePrefix()}27182:boot-theirs-before` },
        ];
    }

    it("closes its own stale sessions and leaves the other MJAPI's live sessions open", async () => {
        const rows = sharedTable();
        const store = storeOf(rows);
        serveSessionReadsFrom(rows, store);
        const { provider, closedIds } = makeProvider(store);

        const count = await SessionJanitor.Instance.RunStartupRecovery(provider, makeUser());

        expect(count).toBe(1);
        expect(closedIds).toEqual(['ours-stale']);
        expect(store.get('theirs-live')).toBe('Active');
        expect(store.get('theirs-stale')).toBe('Active');
        expect(store.get('ours-live')).toBe('Active');
    });

    it("the other MJAPI's recovery closes its stale sessions and leaves this one's live sessions open", async () => {
        const rows = sharedTable();
        const store = storeOf(rows);
        serveSessionReadsFrom(rows, store);
        const { provider, closedIds } = makeProvider(store);

        const count = await SessionJanitor.Instance.RunStartupRecovery(provider, makeUser(), theirs);

        expect(count).toBe(1);
        expect(closedIds).toEqual(['theirs-stale']);
        expect(store.get('ours-live')).toBe('Active');
        expect(store.get('ours-stale')).toBe('Idle');
        expect(store.get('theirs-live')).toBe('Active');
    });
});

describe('SessionJanitor.RunStalenessSweep', () => {
    it('closes only past-threshold sessions (filter is staleness-scoped)', async () => {
        const stale = { ID: 'stale-1', Status: 'Idle' };
        sessionPages = [{ Success: true, Results: [stale] }];

        const store = new Map<string, 'Active' | 'Idle' | 'Closed'>([['stale-1', 'Idle']]);
        const { provider, closedIds, closedReasons } = makeProvider(store);

        const count = await SessionJanitor.Instance.RunStalenessSweep(provider, makeUser());

        expect(count).toBe(1);
        expect(closedIds).toContain('stale-1');
        // Staleness sweep stamps the janitor close cause.
        expect(closedReasons.get('stale-1')).toBe('Janitor');

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

describe('SessionJanitor shutdown drain', () => {
    it('RunShutdownDrain closes only this exact host instance, stamping CloseReason = Shutdown', async () => {
        const live = { ID: 'mine-1', Status: 'Active' };
        sessionPages = [{ Success: true, Results: [live] }];

        const store = new Map<string, 'Active' | 'Idle' | 'Closed'>([['mine-1', 'Active']]);
        const { provider, closedIds, closedReasons } = makeProvider(store);

        const count = await SessionJanitor.Instance.RunShutdownDrain(provider, makeUser());

        expect(count).toBe(1);
        expect(closedIds).toContain('mine-1');
        expect(closedReasons.get('mine-1')).toBe('Shutdown');

        // The drain targets the CURRENT boot's exact instance id — not the host-prefix orphan filter.
        const filter = sessionSweepCalls()[0][0].ExtraFilter as string;
        expect(filter).toContain("Status IN ('Active','Idle')");
        expect(filter).toContain(`HostInstanceID = '${GetHostInstanceID()}'`);
    });

    it('Shutdown() drains this host\'s live sessions with the Shutdown reason after Start()', async () => {
        // Start consumes one (empty) page for startup recovery; queue the drain page after it.
        sessionPages = [
            { Success: true, Results: [] },                                   // startup recovery
            { Success: true, Results: [{ ID: 'mine-2', Status: 'Idle' }] },   // shutdown drain
        ];
        const store = new Map<string, 'Active' | 'Idle' | 'Closed'>([['mine-2', 'Idle']]);
        const { provider, closedIds, closedReasons } = makeProvider(store);

        await SessionJanitor.Instance.Start(provider, makeUser(), 60_000);
        await SessionJanitor.Instance.Shutdown();

        expect(closedIds).toContain('mine-2');
        expect(closedReasons.get('mine-2')).toBe('Shutdown');
    });
});
