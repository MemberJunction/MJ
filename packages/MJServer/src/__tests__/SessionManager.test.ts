import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock CanRun authorization (AIAgentPermissionHelper.HasPermission) ---
const hasPermissionMock = vi.fn<[], Promise<boolean>>();
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: (...args: unknown[]) => hasPermissionMock(...(args as [])),
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
        expect(channel.Status).toBe('Disconnected');
        expect(channel.DisconnectedAt).toBeInstanceOf(Date);
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
