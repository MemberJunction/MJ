import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock RunView.FromMetadataProvider (used only by the dedupe check) while leaving the rest of
// @memberjunction/core intact.
const runViewMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            FromMetadataProvider: () => ({ RunView: runViewMock }),
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
    MJAIBridgeProviderEntity,
    MJAIBridgeAgentIdentityEntity,
} from '@memberjunction/core-entities';
import type { AIBridgeEngineBase } from '@memberjunction/ai-bridge-base';
import { CalendarWatcher, CalendarWatcherConfig } from '../calendar-watcher';
import { ICalendarSource, NormalizedCalendarInvite } from '../calendar-source';

// ──────────────────────────────────────────────────────────────────────────────
// Test doubles.
// ──────────────────────────────────────────────────────────────────────────────

interface FakeEntity {
    [key: string]: unknown;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
    LatestResult?: { CompleteMessage?: string };
}

let sessionSeq = 0;
let bridgeSeq = 0;

function makeSessionRow(): FakeEntity {
    return {
        ID: `session-${++sessionSeq}`,
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
        LatestResult: { CompleteMessage: '' },
    };
}

function makeBridgeRow(): FakeEntity {
    return {
        ID: `bridge-${++bridgeSeq}`,
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
        LatestResult: { CompleteMessage: '' },
    };
}

/** A provider that hands out a fresh session row then bridge row per save sequence, capturing both. */
function makeProvider(): {
    provider: IMetadataProvider;
    sessions: FakeEntity[];
    bridges: FakeEntity[];
} {
    const sessions: FakeEntity[] = [];
    const bridges: FakeEntity[] = [];
    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName === 'MJ: AI Agent Sessions') {
                const s = makeSessionRow();
                sessions.push(s);
                return s;
            }
            const b = makeBridgeRow();
            bridges.push(b);
            return b;
        }),
    } as unknown as IMetadataProvider;
    return { provider, sessions, bridges };
}

function makeUser(): UserInfo {
    return { ID: 'user-1', Email: 'svc@example.com' } as unknown as UserInfo;
}

function makeIdentity(
    overrides: Partial<MJAIBridgeAgentIdentityEntity> = {},
): MJAIBridgeAgentIdentityEntity {
    return {
        ID: 'identity-1',
        AgentID: 'agent-1',
        ProviderID: 'provider-zoom',
        IdentityType: 'Email',
        IdentityValue: 'sage@org.com',
        IsActive: true,
        ...overrides,
    } as unknown as MJAIBridgeAgentIdentityEntity;
}

function makeZoomProvider(): MJAIBridgeProviderEntity {
    return {
        ID: 'provider-zoom',
        Name: 'Zoom',
        Status: 'Active',
        DriverClass: 'ZoomBridge',
    } as unknown as MJAIBridgeProviderEntity;
}

/** A stub engine exposing only the AgentIdentities + Providers the watcher reads. */
function makeEngine(
    identities: MJAIBridgeAgentIdentityEntity[],
    providers: MJAIBridgeProviderEntity[],
): Pick<AIBridgeEngineBase, 'AgentIdentities' | 'Providers'> {
    return {
        AgentIdentities: identities,
        Providers: providers,
    } as Pick<AIBridgeEngineBase, 'AgentIdentities' | 'Providers'>;
}

const FIXED_NOW = Date.UTC(2026, 5, 13, 12, 0, 0); // 2026-06-13T12:00:00Z

function futureInvite(overrides: Partial<NormalizedCalendarInvite> = {}): NormalizedCalendarInvite {
    return {
        ExternalEventID: 'evt-1',
        Subject: 'Strategy sync',
        JoinUrl: 'https://us02web.zoom.us/j/123',
        StartTime: new Date(FIXED_NOW + 60 * 60 * 1000), // +1h
        Attendees: [{ Email: 'sage@org.com' }, { Email: 'human@org.com' }],
        Organizer: { Email: 'human@org.com' },
        ...overrides,
    };
}

/** A mock calendar source returning a fixed poll result and recording its calls. */
class MockCalendarSource implements ICalendarSource {
    public readonly Calls: Array<{ identityValue: string; cursor?: string }> = [];
    constructor(
        private readonly invites: NormalizedCalendarInvite[],
        private readonly nextCursor?: string,
    ) {}
    public async ListUpcomingInvites(identityValue: string, sinceCursor?: string) {
        this.Calls.push({ identityValue, cursor: sinceCursor });
        return { Invites: this.invites, NextCursor: this.nextCursor };
    }
}

function makeWatcher(
    source: ICalendarSource | null,
    identities: MJAIBridgeAgentIdentityEntity[],
    providers: MJAIBridgeProviderEntity[],
    provider: IMetadataProvider,
    extra: Partial<CalendarWatcherConfig> = {},
): CalendarWatcher {
    return new CalendarWatcher({
        SourceResolver: () => source,
        ContextUser: makeUser(),
        MetadataProvider: provider,
        Engine: makeEngine(identities, providers),
        Now: () => FIXED_NOW,
        ...extra,
    });
}

beforeEach(() => {
    runViewMock.mockReset();
    // Default dedupe check: no existing bridge.
    runViewMock.mockResolvedValue({ Success: true, Results: [] });
});

// ──────────────────────────────────────────────────────────────────────────────

describe('CalendarWatcher — new invite → scheduled bridge', () => {
    it('creates a Scheduled Invite bridge (+ linked session) for a new invite where the agent is an attendee', async () => {
        const source = new MockCalendarSource([futureInvite()], 'cursor-2');
        const { provider, sessions, bridges } = makeProvider();
        const watcher = makeWatcher(source, [makeIdentity()], [makeZoomProvider()], provider);

        const result = await watcher.Sweep();

        expect(result.BridgesCreated).toBe(1);
        expect(result.InvitesSeen).toBe(1);
        expect(result.Duplicates).toBe(0);
        expect(result.Unroutable).toBe(0);

        // The session was created first, then the bridge linked to it.
        expect(sessions.length).toBe(1);
        expect(sessions[0].AgentID).toBe('agent-1');
        expect(sessions[0].UserID).toBe('user-1');
        expect(sessions[0].Status).toBe('Idle');

        expect(bridges.length).toBe(1);
        const bridge = bridges[0];
        expect(bridge.AgentSessionID).toBe(sessions[0].ID);
        expect(bridge.ProviderID).toBe('provider-zoom');
        expect(bridge.JoinMethod).toBe('Invite');
        expect(bridge.Status).toBe('Scheduled');
        expect(bridge.Direction).toBe('Inbound');
        expect(bridge.TurnMode).toBe('Passive');
        expect(bridge.Address).toBe('https://us02web.zoom.us/j/123');
        expect(bridge.ExternalConnectionID).toBe('evt-1'); // the dedupe key
        expect((bridge.ScheduledStartTime as Date).getTime()).toBe(FIXED_NOW + 60 * 60 * 1000);
        expect(bridge.Save).toHaveBeenCalled();
    });

    it('passes the stored cursor on the next sweep and persists the returned NextCursor', async () => {
        const source = new MockCalendarSource([], 'cursor-A');
        const { provider } = makeProvider();
        const watcher = makeWatcher(source, [makeIdentity()], [makeZoomProvider()], provider);

        await watcher.Sweep(); // first: no cursor in, stores cursor-A
        await watcher.Sweep(); // second: cursor-A passed in

        expect(source.Calls[0].cursor).toBeUndefined();
        expect(source.Calls[1].cursor).toBe('cursor-A');
    });
});

describe('CalendarWatcher — idempotent dedupe', () => {
    it('does NOT create a second bridge for an invite that already has one', async () => {
        const source = new MockCalendarSource([futureInvite()]);
        const { provider, bridges } = makeProvider();
        const watcher = makeWatcher(source, [makeIdentity()], [makeZoomProvider()], provider);

        // Dedupe check finds an existing bridge.
        runViewMock.mockResolvedValue({ Success: true, Results: [{ ID: 'existing-bridge' }] });

        const result = await watcher.Sweep();

        expect(result.Duplicates).toBe(1);
        expect(result.BridgesCreated).toBe(0);
        expect(bridges.length).toBe(0);
        // The dedupe filter targets the event id + Invite join method.
        const filter = (runViewMock.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter;
        expect(filter).toContain("ExternalConnectionID='evt-1'");
        expect(filter).toContain("JoinMethod='Invite'");
    });

    it('fails safe (skips creation) when the dedupe RunView errors', async () => {
        const source = new MockCalendarSource([futureInvite()]);
        const { provider, bridges } = makeProvider();
        const watcher = makeWatcher(source, [makeIdentity()], [makeZoomProvider()], provider);

        runViewMock.mockResolvedValue({ Success: false, ErrorMessage: 'db down', Results: [] });

        const result = await watcher.Sweep();
        expect(result.BridgesCreated).toBe(0);
        expect(result.Duplicates).toBe(1); // counted as a dup (skipped to avoid a possible double)
        expect(bridges.length).toBe(0);
    });
});

describe('CalendarWatcher — tolerance + filtering', () => {
    it('tolerates a source that throws and continues to the next identity', async () => {
        const goodSource = new MockCalendarSource([futureInvite()]);
        const throwingSource: ICalendarSource = {
            ListUpcomingInvites: vi.fn(async () => {
                throw new Error('graph 503');
            }),
        };
        const { provider } = makeProvider();
        const idA = makeIdentity({ ID: 'id-A', IdentityValue: 'a@org.com' });
        const idB = makeIdentity({ ID: 'id-B', IdentityValue: 'sage@org.com' });

        // Resolver: first identity throws, second works.
        const watcher = new CalendarWatcher({
            SourceResolver: (identity) =>
                identity.ID === 'id-A' ? throwingSource : goodSource,
            ContextUser: makeUser(),
            MetadataProvider: provider,
            Engine: makeEngine([idA, idB], [makeZoomProvider()]),
            Now: () => FIXED_NOW,
        });

        const result = await watcher.Sweep();

        expect(result.IdentitiesScanned).toBe(2);
        expect(result.IdentitiesFailed).toBe(1);
        expect(result.BridgesCreated).toBe(1); // the good identity still produced a bridge
    });

    it('ignores an invite where the agent is NOT an attendee', async () => {
        const source = new MockCalendarSource([
            futureInvite({ Attendees: [{ Email: 'someone-else@org.com' }] }),
        ]);
        const { provider, bridges } = makeProvider();
        const watcher = makeWatcher(source, [makeIdentity()], [makeZoomProvider()], provider);

        const result = await watcher.Sweep();
        expect(result.BridgesCreated).toBe(0);
        expect(bridges.length).toBe(0);
    });

    it('skips an invite with no join URL (not an online meeting)', async () => {
        const source = new MockCalendarSource([futureInvite({ JoinUrl: undefined })]);
        const { provider } = makeProvider();
        const watcher = makeWatcher(source, [makeIdentity()], [makeZoomProvider()], provider);

        const result = await watcher.Sweep();
        expect(result.BridgesCreated).toBe(0);
    });

    it('skips a past-start invite (stale)', async () => {
        const source = new MockCalendarSource([
            futureInvite({ StartTime: new Date(FIXED_NOW - 60 * 1000) }),
        ]);
        const { provider } = makeProvider();
        const watcher = makeWatcher(source, [makeIdentity()], [makeZoomProvider()], provider);

        const result = await watcher.Sweep();
        expect(result.BridgesCreated).toBe(0);
    });

    it('counts an unroutable invite (no active provider for the platform)', async () => {
        const source = new MockCalendarSource([
            futureInvite({ JoinUrl: 'https://meet.unknown-platform.io/x' }),
        ]);
        const { provider } = makeProvider();
        const watcher = makeWatcher(source, [makeIdentity()], [makeZoomProvider()], provider);

        const result = await watcher.Sweep();
        expect(result.Unroutable).toBe(1);
        expect(result.BridgesCreated).toBe(0);
    });

    it('skips identities with no resolved calendar source', async () => {
        const { provider } = makeProvider();
        const watcher = makeWatcher(null, [makeIdentity()], [makeZoomProvider()], provider);

        const result = await watcher.Sweep();
        expect(result.IdentitiesScanned).toBe(1);
        expect(result.IdentitiesWithoutSource).toBe(1);
        expect(result.BridgesCreated).toBe(0);
    });

    it('only considers active Email-type identities', async () => {
        const source = new MockCalendarSource([futureInvite()]);
        const { provider } = makeProvider();
        const identities = [
            makeIdentity({ ID: 'phone', IdentityType: 'PhoneNumber', IdentityValue: '+15550000' }),
            makeIdentity({ ID: 'inactive', IsActive: false }),
            makeIdentity({ ID: 'active-email' }),
        ];
        const watcher = makeWatcher(source, identities, [makeZoomProvider()], provider);

        const result = await watcher.Sweep();
        expect(result.IdentitiesScanned).toBe(1); // only the active Email identity
        expect(result.BridgesCreated).toBe(1);
    });
});
