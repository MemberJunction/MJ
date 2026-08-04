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

    // ── Phase 2: server-executed tool contribution defaults ────────────────────

    it('ToolNamePrefix defaults to empty (no server tools routed)', () => {
        const plugin = new ProbeChannelServer();
        expect(plugin.ToolNamePrefix).toBe('');
    });

    it('GetServerToolDefinitions defaults to [] (a state-only channel contributes none)', () => {
        const plugin = new ProbeChannelServer();
        expect(plugin.GetServerToolDefinitions()).toEqual([]);
    });

    it('ExecuteServerTool defaults to a structured not-implemented failure (never throws)', async () => {
        const plugin = new ProbeChannelServer();
        const result = await plugin.ExecuteServerTool('Probe_DoThing', '{}');
        expect(result.Success).toBe(false);
        expect(result.Output).toContain('Probe');
    });

    it('a channel may override the server-tool hooks to contribute a dynamic vocabulary', async () => {
        class ToolChannelServer extends BaseRealtimeChannelServer {
            public get ChannelName(): string { return 'Tooly'; }
            public override get ToolNamePrefix(): string { return 'Tooly_'; }
            public override GetServerToolDefinitions() {
                return [{ Name: 'Tooly_Go', Description: 'go', ParametersSchema: { type: 'object' } }];
            }
            public override ExecuteServerTool(toolName: string, argsJson: string) {
                return { Success: true, Output: `${toolName}:${argsJson}` };
            }
        }
        const plugin = new ToolChannelServer();
        expect(plugin.ToolNamePrefix).toBe('Tooly_');
        expect(plugin.GetServerToolDefinitions().map((t) => t.Name)).toEqual(['Tooly_Go']);
        expect(await plugin.ExecuteServerTool('Tooly_Go', '{"x":1}')).toEqual({ Success: true, Output: 'Tooly_Go:{"x":1}' });
    });

    it('the context may carry an optional SendContextNote perception sink', () => {
        const notes: string[] = [];
        const plugin = new ProbeChannelServer();
        plugin.Initialize({ ...CTX, SendContextNote: (t) => notes.push(t) });
        plugin.BoundContext?.SendContextNote?.('hello');
        expect(notes).toEqual(['hello']);
    });
});
