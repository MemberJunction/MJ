/**
 * Unit tests for {@link BaseRealtimeChannelServer} — the server half of the interactive-channel
 * plugin contract. The base class is deliberately tiny (the DB-aware host lives in
 * `@memberjunction/ai-agents`), so these tests pin the contract defaults concrete plugins and the
 * host both rely on: the Initialize→OnInitialize bracket, the keep-original default of
 * `OnChannelStateSave`, the no-op lifecycle hooks, and the Dispose context teardown.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    BaseRealtimeChannelServer,
    RealtimeChannelServerContext,
    RealtimeChannelCloseReason,
} from '../generic/baseRealtimeChannelServer';

const CTX: RealtimeChannelServerContext = {
    AgentSessionID: 'session-1',
    AgentID: 'agent-1',
    UserID: 'user-1',
    ConversationID: 'conv-1',
};

/** Minimal concrete plugin exposing the protected surface for assertions. */
class ProbeChannelServer extends BaseRealtimeChannelServer {
    public OnInitializeCalls = 0;

    public get ChannelName(): string {
        return 'Probe';
    }

    protected override OnInitialize(): void {
        this.OnInitializeCalls++;
        // Contract: Context is already bound when OnInitialize runs.
        if (!this.Context) {
            throw new Error('Context was not bound before OnInitialize');
        }
    }

    public get BoundContext(): RealtimeChannelServerContext | null {
        return this.Context;
    }
}

describe('BaseRealtimeChannelServer', () => {
    it('Initialize binds the context and invokes OnInitialize exactly once', () => {
        const plugin = new ProbeChannelServer();
        expect(plugin.BoundContext).toBeNull();

        plugin.Initialize(CTX);

        expect(plugin.BoundContext).toBe(CTX);
        expect(plugin.OnInitializeCalls).toBe(1);
    });

    it('OnChannelStateSave defaults to null (persist the original payload untouched)', async () => {
        const plugin = new ProbeChannelServer();
        plugin.Initialize(CTX);
        await expect(plugin.OnChannelStateSave('{"v":1}')).resolves.toBeNull();
    });

    it('OnSessionStarted and OnSessionClosed default to resolved no-ops for every close reason', async () => {
        const plugin = new ProbeChannelServer();
        plugin.Initialize(CTX);

        await expect(plugin.OnSessionStarted()).resolves.toBeUndefined();
        const reasons: Array<RealtimeChannelCloseReason | null> = ['Explicit', 'Janitor', 'Shutdown', 'Error', null];
        for (const reason of reasons) {
            await expect(plugin.OnSessionClosed(reason)).resolves.toBeUndefined();
        }
    });

    it('Dispose drops the context (the post-window guard contract)', () => {
        const plugin = new ProbeChannelServer();
        plugin.Initialize(CTX);
        plugin.Dispose();
        expect(plugin.BoundContext).toBeNull();
    });

    it('a subclass override of Dispose calling super still tears the context down', () => {
        const released = vi.fn();
        class OverridingChannelServer extends ProbeChannelServer {
            public override Dispose(): void {
                released();
                super.Dispose();
            }
        }
        const plugin = new OverridingChannelServer();
        plugin.Initialize(CTX);
        plugin.Dispose();
        expect(released).toHaveBeenCalledTimes(1);
        expect(plugin.BoundContext).toBeNull();
    });
});
