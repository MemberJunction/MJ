import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock CanRun authorization (AIAgentPermissionHelper.HasPermission) ---
const hasPermissionMock = vi.fn<[], Promise<boolean>>();
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: (...args: unknown[]) => hasPermissionMock(...(args as [])),
    },
}));

// --- Mock the client-direct service so CloseSession's run finalization is observable (no DB),
//     plus the channel-plugin host so the start/close lifecycle notifications are observable. ---
const finalizeCoAgentRunMock = vi.fn(async () => undefined);
const hostSessionStartedMock = vi.fn(async () => undefined);
const hostSessionClosedMock = vi.fn(async () => undefined);
vi.mock('@memberjunction/ai-agents', () => ({
    RealtimeClientSessionService: class {
        FinalizeCoAgentRun = finalizeCoAgentRunMock;
    },
    RealtimeChannelServerHost: {
        get Instance() {
            return {
                OnSessionStarted: hostSessionStartedMock,
                OnSessionClosed: hostSessionClosedMock,
            };
        },
    },
}));

// --- Mock RunView.FromMetadataProvider so channel sweeps are controllable, while leaving the
//     rest of @memberjunction/core intact. ---
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

import { SessionManager, SessionAuthorizationError } from '../agentSessions/SessionManager.js';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';

/** Minimal fake BaseEntity-shaped record with the fields/methods SessionManager touches. */
interface FakeEntity {
    [key: string]: unknown;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
    Load: (id: string) => Promise<boolean>;
    LatestResult?: { CompleteMessage?: string };
}

function makeUser(): UserInfo {
    return { ID: 'user-1', Email: 'tester@example.com' } as unknown as UserInfo;
}

/** Records the entity instances handed out, keyed by entity name, so tests can assert on them. */
function makeProvider(factory: (entityName: string) => FakeEntity): {
    provider: IMetadataProvider;
    handedOut: FakeEntity[];
} {
    const handedOut: FakeEntity[] = [];
    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            const e = factory(entityName);
            handedOut.push(e);
            return e;
        }),
    } as unknown as IMetadataProvider;
    return { provider, handedOut };
}

function makeSessionEntity(overrides: Partial<FakeEntity> = {}): FakeEntity {
    return {
        ID: 'session-1',
        Status: 'Active',
        ConversationID: null,
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
        Load: vi.fn(async () => true),
        LatestResult: { CompleteMessage: '' },
        ...overrides,
    };
}

beforeEach(() => {
    hasPermissionMock.mockReset();
    finalizeCoAgentRunMock.mockClear();
    hostSessionStartedMock.mockReset();
    hostSessionStartedMock.mockResolvedValue(undefined);
    hostSessionClosedMock.mockReset();
    hostSessionClosedMock.mockResolvedValue(undefined);
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [] });
});

describe('SessionManager.CreateSession', () => {
    it('denies and creates no session when CanRun is false', async () => {
        hasPermissionMock.mockResolvedValue(false);
        const { provider, handedOut } = makeProvider(() => makeSessionEntity());
        const mgr = new SessionManager();

        await expect(
            mgr.CreateSession({ agentID: 'agent-1', userID: 'user-1' }, makeUser(), provider),
        ).rejects.toBeInstanceOf(SessionAuthorizationError);

        // No entity should have been requested/created on denial.
        expect(handedOut.length).toBe(0);
    });

    it('creates a Conversation when none is passed, then the session', async () => {
        hasPermissionMock.mockResolvedValue(true);
        const conversation = makeSessionEntity({ ID: 'conv-new' });
        const session = makeSessionEntity({ ID: 'session-new' });
        const { provider } = makeProvider((name) =>
            name === 'MJ: Conversations' ? conversation : session,
        );
        const mgr = new SessionManager();

        const result = await mgr.CreateSession(
            { agentID: 'agent-1', userID: 'user-1' },
            makeUser(),
            provider,
        );

        expect(conversation.NewRecord).toHaveBeenCalled();
        expect(conversation.Save).toHaveBeenCalled();
        expect(result.ConversationID).toBe('conv-new');
        expect(result.Status).toBe('Active');
        expect(result.HostInstanceID).toBeTypeOf('string');
    });

    it('reuses a supplied conversation without creating a new one', async () => {
        hasPermissionMock.mockResolvedValue(true);
        const session = makeSessionEntity({ ID: 'session-x' });
        const { provider, handedOut } = makeProvider(() => session);
        const mgr = new SessionManager();

        await mgr.CreateSession(
            { agentID: 'agent-1', userID: 'user-1', conversationID: 'conv-existing' },
            makeUser(),
            provider,
        );

        // Only one entity (the session) should have been requested — no Conversation.
        expect(handedOut.length).toBe(1);
        expect(session.ConversationID).toBe('conv-existing');
    });

    it('throws (with the entity error detail) when the Conversation save fails — no session row attempted', async () => {
        hasPermissionMock.mockResolvedValue(true);
        const conversation = makeSessionEntity({
            ID: 'conv-fail',
            Save: vi.fn(async () => false),
            LatestResult: { CompleteMessage: 'conversation insert denied' },
        });
        const { provider, handedOut } = makeProvider(() => conversation);
        const mgr = new SessionManager();

        await expect(
            mgr.CreateSession({ agentID: 'agent-1', userID: 'user-1' }, makeUser(), provider),
        ).rejects.toThrow(/conversation insert denied/);

        expect(handedOut.length).toBe(1); // only the conversation was requested
    });

    it('throws (with the entity error detail) when the session save fails', async () => {
        hasPermissionMock.mockResolvedValue(true);
        const session = makeSessionEntity({
            ID: 'session-fail',
            Save: vi.fn(async () => false),
            LatestResult: { CompleteMessage: 'session insert denied' },
        });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        await expect(
            mgr.CreateSession(
                { agentID: 'agent-1', userID: 'user-1', conversationID: 'conv-existing' },
                makeUser(),
                provider,
            ),
        ).rejects.toThrow(/session insert denied/);
    });
});

describe('SessionManager.CloseSession', () => {
    it('sets Closed + ClosedAt, disconnects channels', async () => {
        const channel = makeSessionEntity({ ID: 'chan-1', Status: 'Connected' });
        runViewMock.mockResolvedValue({ Success: true, Results: [channel] });
        const session = makeSessionEntity({ ID: 'session-1', Status: 'Active' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        const ok = await mgr.CloseSession('session-1', makeUser(), provider);

        expect(ok).toBe(true);
        expect(session.Status).toBe('Closed');
        expect(session.ClosedAt).toBeInstanceOf(Date);
        // No reason supplied → the default stamps the common user-initiated case.
        expect(session.CloseReason).toBe('Explicit');
        expect(channel.Status).toBe('Disconnected');
        expect(channel.DisconnectedAt).toBeInstanceOf(Date);
        // No observability run ids in this session's config — finalize is not invoked.
        expect(finalizeCoAgentRunMock).not.toHaveBeenCalled();
    });

    it('finalizes the co-agent observability runs when the session config carries their ids', async () => {
        const session = makeSessionEntity({
            ID: 'session-voice',
            Status: 'Active',
            Config_: JSON.stringify({ targetAgentID: 't1', coAgentRunID: 'co-run-5', promptRunID: 'prompt-run-5' }),
        });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();
        const user = makeUser();

        const ok = await mgr.CloseSession('session-voice', user, provider);

        expect(ok).toBe(true);
        expect(finalizeCoAgentRunMock).toHaveBeenCalledTimes(1);
        expect(finalizeCoAgentRunMock).toHaveBeenCalledWith('co-run-5', 'prompt-run-5', user, provider, true, null);
    });

    it('threads the co-agent run-step id into finalize when the session config carries it', async () => {
        const session = makeSessionEntity({
            ID: 'session-voice-step',
            Status: 'Active',
            Config_: JSON.stringify({
                targetAgentID: 't1',
                coAgentRunID: 'co-run-6',
                promptRunID: 'prompt-run-6',
                coAgentRunStepID: 'run-step-6',
            }),
        });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();
        const user = makeUser();

        const ok = await mgr.CloseSession('session-voice-step', user, provider);

        expect(ok).toBe(true);
        expect(finalizeCoAgentRunMock).toHaveBeenCalledWith('co-run-6', 'prompt-run-6', user, provider, true, 'run-step-6');
    });

    it('does not finalize when the session config has no run ids (target only)', async () => {
        const session = makeSessionEntity({
            ID: 'session-no-runs',
            Status: 'Active',
            Config_: JSON.stringify({ targetAgentID: 't1' }),
        });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        await mgr.CloseSession('session-no-runs', makeUser(), provider);

        expect(finalizeCoAgentRunMock).not.toHaveBeenCalled();
    });

    it('stamps CloseReason = Explicit by default (untouched call sites get the right reason)', async () => {
        const session = makeSessionEntity({ ID: 'session-default', Status: 'Active' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        const ok = await mgr.CloseSession('session-default', makeUser(), provider);

        expect(ok).toBe(true);
        expect(session.CloseReason).toBe('Explicit');
    });

    it.each(['Janitor', 'Shutdown', 'Error', 'Explicit'] as const)(
        'stamps the supplied closeReason: %s',
        async (reason) => {
            const session = makeSessionEntity({ ID: `session-${reason}`, Status: 'Active' });
            const { provider } = makeProvider(() => session);
            const mgr = new SessionManager();

            const ok = await mgr.CloseSession(`session-${reason}`, makeUser(), provider, reason);

            expect(ok).toBe(true);
            expect(session.Status).toBe('Closed');
            expect(session.CloseReason).toBe(reason);
        },
    );

    it('does not overwrite the original CloseReason on an idempotent re-close', async () => {
        const session = makeSessionEntity({ ID: 'session-1', Status: 'Closed', CloseReason: 'Janitor' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        const ok = await mgr.CloseSession('session-1', makeUser(), provider, 'Explicit');

        expect(ok).toBe(true);
        expect(session.CloseReason).toBe('Janitor'); // untouched — no save happened
        expect(session.Save).not.toHaveBeenCalled();
    });

    it('is idempotent — closing an already-Closed session is a no-op returning true', async () => {
        const session = makeSessionEntity({ ID: 'session-1', Status: 'Closed' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        const ok = await mgr.CloseSession('session-1', makeUser(), provider);

        expect(ok).toBe(true);
        expect(session.Save).not.toHaveBeenCalled();
        expect(runViewMock).not.toHaveBeenCalled();
    });

    it('returns false when the session cannot be loaded', async () => {
        const session = makeSessionEntity({ ID: 'missing', Load: vi.fn(async () => false) });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        const ok = await mgr.CloseSession('missing', makeUser(), provider);
        expect(ok).toBe(false);
    });
});

describe('SessionManager.Heartbeat', () => {
    it('coalesces writes within the min interval (one write, not two)', async () => {
        const session = makeSessionEntity({ ID: 'session-1', Status: 'Active' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();
        const user = makeUser();

        const first = await mgr.Heartbeat('session-1', user, provider);
        const second = await mgr.Heartbeat('session-1', user, provider);

        expect(first).toBe(true);
        expect(second).toBe(true);
        // First call forces a write (no cached timestamp); second is coalesced.
        expect(session.Save).toHaveBeenCalledTimes(1);
    });

    it('reactivates an Idle session to Active on the first heartbeat', async () => {
        const session = makeSessionEntity({ ID: 'session-1', Status: 'Idle' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        await mgr.Heartbeat('session-1', makeUser(), provider);
        expect(session.Status).toBe('Active');
    });

    it('does not reactivate a Closed session (returns false)', async () => {
        const session = makeSessionEntity({ ID: 'session-1', Status: 'Closed' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        const ok = await mgr.Heartbeat('session-1', makeUser(), provider);
        expect(ok).toBe(false);
        expect(session.Save).not.toHaveBeenCalled();
    });
});

describe('SessionManager.MarkIdle', () => {
    it('transitions Active → Idle', async () => {
        const session = makeSessionEntity({ ID: 'session-1', Status: 'Active' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        const ok = await mgr.MarkIdle('session-1', makeUser(), provider);
        expect(ok).toBe(true);
        expect(session.Status).toBe('Idle');
    });

    it('is a no-op for an already-Idle session', async () => {
        const session = makeSessionEntity({ ID: 'session-1', Status: 'Idle' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        const ok = await mgr.MarkIdle('session-1', makeUser(), provider);
        expect(ok).toBe(true);
        expect(session.Save).not.toHaveBeenCalled();
    });
});

describe('SessionManager — server-side channel plugin lifecycle notifications', () => {
    it('CreateSession notifies the channel-plugin host with the session context after the row persists', async () => {
        hasPermissionMock.mockResolvedValue(true);
        const session = makeSessionEntity({ ID: 'session-new', AgentID: 'agent-1', UserID: 'user-1' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        await mgr.CreateSession(
            { agentID: 'agent-1', userID: 'user-1', conversationID: 'conv-existing' },
            makeUser(),
            provider,
        );

        expect(hostSessionStartedMock).toHaveBeenCalledTimes(1);
        const [ctx, user, prov] = hostSessionStartedMock.mock.calls[0] as unknown[];
        expect(ctx).toEqual({
            AgentSessionID: 'session-new',
            AgentID: 'agent-1',
            UserID: 'user-1',
            ConversationID: 'conv-existing',
        });
        expect((user as { ID: string }).ID).toBe('user-1');
        expect(prov).toBe(provider);
    });

    it('CreateSession does NOT notify the host when the session save fails (no half-open plugins)', async () => {
        hasPermissionMock.mockResolvedValue(true);
        const session = makeSessionEntity({ Save: vi.fn(async () => false) });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        await expect(
            mgr.CreateSession({ agentID: 'agent-1', userID: 'user-1', conversationID: 'conv-1' }, makeUser(), provider),
        ).rejects.toThrow();
        expect(hostSessionStartedMock).not.toHaveBeenCalled();
    });

    it('a throwing host start notification never breaks session creation (best-effort)', async () => {
        hasPermissionMock.mockResolvedValue(true);
        hostSessionStartedMock.mockRejectedValue(new Error('plugin layer boom'));
        const session = makeSessionEntity({ ID: 'session-new' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        const result = await mgr.CreateSession(
            { agentID: 'agent-1', userID: 'user-1', conversationID: 'conv-1' },
            makeUser(),
            provider,
        );
        expect(result.ID).toBe('session-new');
    });

    it('CloseSession notifies the host with the stamped close reason (janitor provenance included)', async () => {
        const session = makeSessionEntity({ ID: 'session-1', Status: 'Active' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        await mgr.CloseSession('session-1', makeUser(), provider, 'Janitor');

        expect(hostSessionClosedMock).toHaveBeenCalledTimes(1);
        expect(hostSessionClosedMock).toHaveBeenCalledWith('session-1', 'Janitor');
    });

    it('an idempotent re-close still notifies the host with the ORIGINAL close reason (race cleanup)', async () => {
        const session = makeSessionEntity({ ID: 'session-1', Status: 'Closed', CloseReason: 'Explicit' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        const ok = await mgr.CloseSession('session-1', makeUser(), provider, 'Janitor');

        expect(ok).toBe(true);
        expect(session.Save).not.toHaveBeenCalled(); // still a DB no-op
        expect(hostSessionClosedMock).toHaveBeenCalledWith('session-1', 'Explicit');
    });

    it('a throwing host close notification never breaks session close (best-effort)', async () => {
        hostSessionClosedMock.mockRejectedValue(new Error('plugin layer boom'));
        const session = makeSessionEntity({ ID: 'session-1', Status: 'Active' });
        const { provider } = makeProvider(() => session);
        const mgr = new SessionManager();

        const ok = await mgr.CloseSession('session-1', makeUser(), provider);
        expect(ok).toBe(true);
        expect(session.Status).toBe('Closed');
    });
});
