import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock CanRun (unused by the janitor path, but SessionManager imports it).
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: { HasPermission: vi.fn(async () => true) },
}));

// Capture the ExtraFilter passed to each sweep page and return controllable rows.
const { runViewMock, logErrorMock, logStatusMock, recoverMock, resolveAccountMock } = vi.hoisted(() => ({
    runViewMock: vi.fn(),
    logErrorMock: vi.fn(),
    logStatusMock: vi.fn(),
    recoverMock: vi.fn(),
    resolveAccountMock: vi.fn(),
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: logErrorMock,
        LogStatus: logStatusMock,
        RunView: {
            ...actual.RunView,
            FromMetadataProvider: () => ({ RunView: runViewMock }),
        },
    };
});

// Recording recovery lives in ai-agents; the janitor only decides WHEN to call it.
// Partial mock: SessionManager (imported by the janitor) needs the rest of ai-agents' real exports.
vi.mock('@memberjunction/ai-agents', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-agents')>();
    return {
        ...actual,
        RecoverRealtimeRecordingFromSegments: recoverMock,
        ResolveRecordingStorageAccountID: resolveAccountMock,
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
    logErrorMock.mockReset();
    logStatusMock.mockReset();
    recoverMock.mockReset();
    resolveAccountMock.mockReset();
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
        const { provider, closedIds, closedReasons } = makeProvider(store);

        const count = await SessionJanitor.Instance.RunStartupRecovery(provider, makeUser());

        expect(count).toBe(1);
        expect(closedIds).toContain('orphan-1');
        // Orphan recovery stamps the janitor close cause.
        expect(closedReasons.get('orphan-1')).toBe('Janitor');

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

describe('SessionJanitor.RunRecordingRecoverySweep', () => {
    const NOW = new Date('2026-10-07T12:00:00.000Z');
    const MINUTE = 60_000;
    const HOUR = 60 * MINUTE;
    const STARTED_AT = new Date('2026-10-07T09:00:00.000Z');
    const NO_SEGMENTS = { Outcome: 'NoSegments', FileID: null, SegmentCount: 0, MissingIndexes: [], ErrorMessage: null };
    const MAX_ATTEMPTS_FOR_TEST = 8; // mirrors MAX_RECOVERY_ATTEMPTS
    let nextSessionNumber = 0;

    interface RecoveryHarness {
        provider: IMetadataProvider;
        /** Session id -> RecordingFileID the reload will report (default null). */
        fileIds: Map<string, string | null>;
        agentLoads: string[];
        /** Agent ids whose Load() reports failure. */
        failingAgents: Set<string>;
    }

    /** Session ids are unique per test: the janitor is a singleton whose backoff map outlives a test. */
    function candidate(agentID = 'agent-1'): { ID: string; AgentID: string; RecordingStartedAt: Date } {
        return { ID: `rec-session-${nextSessionNumber++}`, AgentID: agentID, RecordingStartedAt: STARTED_AT };
    }

    function makeRecoveryProvider(): RecoveryHarness {
        const fileIds = new Map<string, string | null>();
        const agentLoads: string[] = [];
        const failingAgents = new Set<string>();
        const provider = {
            GetEntityObject: vi.fn(async (entityName: string) => {
                const entity: { ID: string; RecordingFileID: string | null; Load: (id: string) => Promise<boolean> } = {
                    ID: '',
                    RecordingFileID: null,
                    Load: async (id: string) => {
                        entity.ID = id;
                        if (entityName === 'MJ: AI Agents') {
                            agentLoads.push(id);
                            return !failingAgents.has(id);
                        } else {
                            entity.RecordingFileID = fileIds.get(id) ?? null;
                        }
                        return true;
                    },
                };
                return entity;
            }),
        } as unknown as IMetadataProvider;
        return { provider, fileIds, agentLoads, failingAgents };
    }

    function recoveryFilter(): string {
        const call = sessionSweepCalls().find((c) => c[0].ExtraFilter.includes('RecordingStartedAt'));
        if (!call) throw new Error('recording recovery sweep never queried sessions');
        return call[0].ExtraFilter;
    }

    /** Runs one sweep whose candidate page holds exactly `rows`. */
    async function sweepWith(provider: IMetadataProvider, rows: unknown[]): Promise<number> {
        sessionPages = [{ Success: true, Results: rows }];
        return SessionJanitor.Instance.RunRecordingRecoverySweep(provider, makeUser());
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        SessionJanitor.Instance.Configure({ recordingRecoveryGraceMinutes: 10, recordingRecoveryLookbackHours: 168 });
        resolveAccountMock.mockResolvedValue('account-1');
        recoverMock.mockResolvedValue({ Outcome: 'Recovered', FileID: 'file-1', SegmentCount: 3, MissingIndexes: [], ErrorMessage: null });
    });

    afterEach(() => {
        SessionJanitor.Instance.Stop();
        vi.useRealTimers();
    });

    it('queries closed, recorded, unstored sessions between the lookback and grace cutoffs', async () => {
        const { provider } = makeRecoveryProvider();
        await sweepWith(provider, []);

        const filter = recoveryFilter();
        expect(filter).toContain("Status = 'Closed'");
        expect(filter).toContain('RecordingStartedAt IS NOT NULL');
        expect(filter).toContain('RecordingFileID IS NULL');
        expect(filter).toContain(`ClosedAt < '${new Date(NOW.getTime() - 10 * MINUTE).toISOString()}'`);
        expect(filter).toContain(`ClosedAt >= '${new Date(NOW.getTime() - 168 * HOUR).toISOString()}'`);
    });

    it('honours Configure() overrides for grace and lookback', async () => {
        SessionJanitor.Instance.Configure({ recordingRecoveryGraceMinutes: 30, recordingRecoveryLookbackHours: 24 });
        const { provider } = makeRecoveryProvider();
        await sweepWith(provider, []);

        const filter = recoveryFilter();
        expect(filter).toContain(`ClosedAt < '${new Date(NOW.getTime() - 30 * MINUTE).toISOString()}'`);
        expect(filter).toContain(`ClosedAt >= '${new Date(NOW.getTime() - 24 * HOUR).toISOString()}'`);
    });

    it('loads each agent once per sweep, resolves the account, recovers with StartedAt, and returns the count', async () => {
        const [a, b, c] = [candidate('agent-1'), candidate('agent-1'), candidate('agent-2')];
        const { provider, agentLoads } = makeRecoveryProvider();
        const user = makeUser();
        sessionPages = [{ Success: true, Results: [a, b, c] }];

        const recovered = await SessionJanitor.Instance.RunRecordingRecoverySweep(provider, user);

        expect(recovered).toBe(3);
        expect(agentLoads).toEqual(['agent-1', 'agent-2']);
        // The account is resolved once per agent, not once per session.
        expect(resolveAccountMock).toHaveBeenCalledTimes(2);
        expect(recoverMock).toHaveBeenNthCalledWith(1, {
            SessionID: a.ID,
            StorageAccountID: 'account-1',
            StartedAt: STARTED_AT,
            ContextUser: user,
            Provider: provider,
        });
    });

    it('skips a session whose reload shows a recording was stored meanwhile', async () => {
        const stored = candidate();
        const { provider, fileIds } = makeRecoveryProvider();
        fileIds.set(stored.ID, 'file-from-late-upload');

        expect(await sweepWith(provider, [stored])).toBe(0);
        expect(recoverMock).not.toHaveBeenCalled();
    });

    it('treats a missing storage account as a failure: no recover call, backed off', async () => {
        const noAccount = candidate();
        resolveAccountMock.mockResolvedValue(null);
        const { provider } = makeRecoveryProvider();

        await sweepWith(provider, [noAccount]);
        expect(recoverMock).not.toHaveBeenCalled();
        expect(logStatusMock).toHaveBeenCalledWith(expect.stringContaining(noAccount.ID));

        // Backed off: the next sweep must not even resolve the account again.
        resolveAccountMock.mockClear();
        await sweepWith(provider, [noAccount]);
        expect(resolveAccountMock).not.toHaveBeenCalled();
    });

    it('logs a Superseded outcome without treating it as a failure', async () => {
        const raced = candidate();
        recoverMock.mockResolvedValue({ Outcome: 'Superseded', FileID: null, SegmentCount: 2, MissingIndexes: [], ErrorMessage: null });
        const { provider } = makeRecoveryProvider();

        expect(await sweepWith(provider, [raced])).toBe(0);

        // Not backed off: a second sweep that still sees the row tries again.
        await sweepWith(provider, [raced]);
        expect(recoverMock).toHaveBeenCalledTimes(2);
    });

    it('logs NoSegments with session, agent and account ids and backs off', async () => {
        const empty = candidate('agent-9');
        recoverMock.mockResolvedValue(NO_SEGMENTS);
        const { provider } = makeRecoveryProvider();

        await sweepWith(provider, [empty]);

        const message = logStatusMock.mock.calls.map((c) => String(c[0])).find((m) => m.includes(empty.ID));
        expect(message).toContain('agent-9');
        expect(message).toContain('account-1');
        expect(logErrorMock).not.toHaveBeenCalled();
    });

    it('LogErrors a Failed outcome and does not retry before the backoff elapses, then retries after', async () => {
        const flaky = candidate();
        recoverMock.mockResolvedValue({ Outcome: 'Failed', FileID: null, SegmentCount: 0, MissingIndexes: [], ErrorMessage: 'upload exploded' });
        const { provider } = makeRecoveryProvider();

        await sweepWith(provider, [flaky]);
        expect(recoverMock).toHaveBeenCalledTimes(1);
        expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('upload exploded'));

        // After the 1st failure the wait is 2^1 x 5 = 10 minutes.
        vi.setSystemTime(NOW.getTime() + 9 * MINUTE);
        await sweepWith(provider, [flaky]);
        expect(recoverMock).toHaveBeenCalledTimes(1);

        vi.setSystemTime(NOW.getTime() + 10 * MINUTE + 1);
        await sweepWith(provider, [flaky]);
        expect(recoverMock).toHaveBeenCalledTimes(2);
    });

    it('caps the backoff at 6 hours', async () => {
        const stubborn = candidate();
        recoverMock.mockResolvedValue(NO_SEGMENTS);
        const { provider } = makeRecoveryProvider();
        const sweepAt = async (atMs: number): Promise<void> => {
            vi.setSystemTime(atMs);
            await sweepWith(provider, [stubborn]);
        };

        // Failures 1-7, each far enough apart to be eligible. The 7th (2^7 x 5 min = 640 min) is capped to 6 h.
        const seventhFailureAt = NOW.getTime() + 6 * 7 * HOUR;
        for (let i = 0; i < 7; i++) {
            await sweepAt(NOW.getTime() + i * 7 * HOUR);
        }
        expect(recoverMock).toHaveBeenCalledTimes(7);

        await sweepAt(seventhFailureAt + 6 * HOUR - MINUTE);
        expect(recoverMock).toHaveBeenCalledTimes(7);
        await sweepAt(seventhFailureAt + 6 * HOUR + 1);
        expect(recoverMock).toHaveBeenCalledTimes(8);
    });

    it('gives up after 8 failures: never retried again, one LogError for the session', async () => {
        const doomed = candidate();
        recoverMock.mockResolvedValue(NO_SEGMENTS);
        const { provider } = makeRecoveryProvider();

        for (let i = 0; i < 12; i++) {
            vi.setSystemTime(NOW.getTime() + i * 7 * HOUR);
            await sweepWith(provider, [doomed]);
        }

        expect(recoverMock).toHaveBeenCalledTimes(8);
        expect(logErrorMock.mock.calls.filter((c) => String(c[0]).includes(doomed.ID))).toHaveLength(1);
    });

    it('prunes backoff for sessions that left the candidate set', async () => {
        const gone = candidate();
        recoverMock.mockResolvedValue(NO_SEGMENTS);
        const { provider } = makeRecoveryProvider();

        await sweepWith(provider, [gone]);
        expect(recoverMock).toHaveBeenCalledTimes(1);

        await sweepWith(provider, []); // full pass without it: its backoff entry is dropped

        await sweepWith(provider, [gone]); // reappears: tried immediately, not held back
        expect(recoverMock).toHaveBeenCalledTimes(2);
    });

    it('attempts at most 5 recoveries per sweep', async () => {
        const rows = Array.from({ length: 7 }, () => candidate());
        const { provider } = makeRecoveryProvider();

        expect(await sweepWith(provider, rows)).toBe(5);
        expect(recoverMock).toHaveBeenCalledTimes(5);
    });

    it('stops paging once the per-sweep cap is reached', async () => {
        const firstPage = Array.from({ length: 200 }, () => candidate());
        const { provider } = makeRecoveryProvider();
        sessionPages = [{ Success: true, Results: firstPage }, { Success: true, Results: [candidate()] }];

        await SessionJanitor.Instance.RunRecordingRecoverySweep(provider, makeUser());

        expect(recoverMock).toHaveBeenCalledTimes(5);
        expect(sessionSweepCalls()).toHaveLength(1);
    });

    it('keeps backoff for candidates a capped sweep never reached', async () => {
        const unreached = candidate();
        const { provider } = makeRecoveryProvider();
        recoverMock.mockResolvedValueOnce(NO_SEGMENTS);
        await sweepWith(provider, [unreached]); // backs `unreached` off

        // Next sweep hits the cap before reaching `unreached`, so it is never "seen".
        const crowd = Array.from({ length: 6 }, () => candidate());
        await sweepWith(provider, [...crowd, unreached]);
        expect(recoverMock).toHaveBeenCalledTimes(6);

        // Still backed off afterwards: the capped pass did not prune it.
        await sweepWith(provider, [unreached]);
        expect(recoverMock).toHaveBeenCalledTimes(6);
    });

    it('does not prune backoff when a page load fails, and a given-up session stays given up', async () => {
        const doomed = candidate();
        recoverMock.mockResolvedValue(NO_SEGMENTS);
        const { provider } = makeRecoveryProvider();
        for (let i = 0; i < MAX_ATTEMPTS_FOR_TEST; i++) {
            vi.setSystemTime(NOW.getTime() + i * 7 * HOUR);
            await sweepWith(provider, [doomed]);
        }
        expect(recoverMock).toHaveBeenCalledTimes(MAX_ATTEMPTS_FOR_TEST);

        // A DB hiccup: the page fails to load. This must not reset anyone's backoff.
        vi.setSystemTime(NOW.getTime() + 100 * HOUR);
        sessionPages = [{ Success: false, ErrorMessage: 'db down', Results: [] }];
        await SessionJanitor.Instance.RunRecordingRecoverySweep(provider, makeUser());

        await sweepWith(provider, [doomed]);
        expect(recoverMock).toHaveBeenCalledTimes(MAX_ATTEMPTS_FOR_TEST);
        expect(logErrorMock.mock.calls.filter((c) => String(c[0]).includes(doomed.ID) && String(c[0]).includes('Giving up'))).toHaveLength(1);
    });

    it('logs an unloadable agent distinctly from a missing storage account', async () => {
        const orphaned = candidate('agent-gone');
        const { provider, failingAgents } = makeRecoveryProvider();
        failingAgents.add('agent-gone');

        await sweepWith(provider, [orphaned]);

        expect(recoverMock).not.toHaveBeenCalled();
        const message = logStatusMock.mock.calls.map((c) => String(c[0])).find((m) => m.includes(orphaned.ID));
        expect(message).toContain('could not be loaded');
        expect(message).not.toContain('no recording storage account');
    });

    it('survives a candidate that throws, logging its session id and moving on', async () => {
        const bad = candidate();
        const good = candidate();
        recoverMock.mockRejectedValueOnce(new Error('kaboom'));
        const { provider } = makeRecoveryProvider();

        expect(await sweepWith(provider, [bad, good])).toBe(1);
        expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining(bad.ID));
    });

    describe('periodic tick', () => {
        it('runs recovery after the close sweeps', async () => {
            const { provider } = makeRecoveryProvider();
            await SessionJanitor.Instance.Start(provider, makeUser(), 60_000);
            runViewMock.mockClear();

            await vi.advanceTimersByTimeAsync(60_000);

            const filters = sessionSweepCalls().map((c) => c[0].ExtraFilter);
            expect(filters).toHaveLength(3);
            expect(filters[0]).toContain('LastActiveAt <');
            expect(filters[1]).toContain('maxSessionDeadlineIso');
            expect(filters[2]).toContain('RecordingStartedAt');
        });

        it('a slow recovery does not block the close sweeps on later ticks and is not started twice', async () => {
            const { provider } = makeRecoveryProvider();
            await SessionJanitor.Instance.Start(provider, makeUser(), 60_000);
            runViewMock.mockClear();
            let releaseRecovery: () => void = () => undefined;
            const recoveryGate = new Promise<void>((resolve) => { releaseRecovery = resolve; });
            runViewMock.mockImplementation(async (params: { ExtraFilter?: string }) => {
                if (params.ExtraFilter?.includes('RecordingStartedAt')) await recoveryGate; // recovery hangs
                return { Success: true, Results: [] };
            });

            await vi.advanceTimersByTimeAsync(60_000); // tick 1: close sweeps + recovery starts, hangs
            await vi.advanceTimersByTimeAsync(60_000); // tick 2: close sweeps still run; no second recovery

            const filters = sessionSweepCalls().map((c) => c[0].ExtraFilter);
            expect(filters.filter((f) => f.includes('LastActiveAt <'))).toHaveLength(2);
            expect(filters.filter((f) => f.includes('maxSessionDeadlineIso'))).toHaveLength(2);
            expect(filters.filter((f) => f.includes('RecordingStartedAt'))).toHaveLength(1);

            releaseRecovery();
            await vi.advanceTimersByTimeAsync(60_000); // tick 3: recovery finished, so it starts again
            expect(sessionSweepCalls().map((c) => c[0].ExtraFilter).filter((f) => f.includes('RecordingStartedAt'))).toHaveLength(2);
        });

        it('a recovery failure is logged with context and does not disturb the close sweeps', async () => {
            const { provider } = makeRecoveryProvider();
            await SessionJanitor.Instance.Start(provider, makeUser(), 60_000);
            runViewMock.mockClear();
            runViewMock.mockImplementation(async (params: { ExtraFilter?: string }) => {
                if (params.ExtraFilter?.includes('RecordingStartedAt')) throw new Error('recovery query blew up');
                return { Success: true, Results: [] };
            });

            await vi.advanceTimersByTimeAsync(60_000);

            const filters = sessionSweepCalls().map((c) => c[0].ExtraFilter);
            expect(filters[0]).toContain('LastActiveAt <');
            expect(filters[1]).toContain('maxSessionDeadlineIso');
            expect(logErrorMock).toHaveBeenCalledWith(expect.stringMatching(/recording recovery.*recovery query blew up/i));
        });
    });
});
