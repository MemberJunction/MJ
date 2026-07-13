import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelServer, RealtimeChannelServerContext } from '@memberjunction/ai';
import {
    RemoteBrowserChannel,
    REMOTE_BROWSER_CHANNEL_NAME,
    LoadRemoteBrowserChannel,
} from '../remote-browser-channel';
import { RemoteBrowserEngine } from '../remote-browser-engine';

// ──────────────────────────────────────────────────────────────────────────────
// The Remote Browser channel is a LIFECYCLE-ONLY plugin in the client-direct topology:
// no constructor deps, no server tools, it only tears down the session's lazily-started browser.
// ──────────────────────────────────────────────────────────────────────────────

function makeChannel(agentSessionID: string | null = 's1'): RemoteBrowserChannel {
    const channel = new RemoteBrowserChannel();
    if (agentSessionID !== null) {
        const ctx: RealtimeChannelServerContext = {
            AgentSessionID: agentSessionID,
            AgentID: 'a1',
            UserID: 'u1',
            ConversationID: null,
        };
        channel.Initialize(ctx);
    }
    return channel;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('RemoteBrowserChannel — identity', () => {
    it('reports the channel name and contributes NO server tools (client-direct topology)', () => {
        const channel = makeChannel();
        expect(channel.ChannelName).toBe(REMOTE_BROWSER_CHANNEL_NAME);
        expect(channel.GetServerToolDefinitions()).toEqual([]);
        expect(channel.ToolNamePrefix).toBe('');
    });

    it('constructs with no arguments and resolves via the ClassFactory by its registration key', () => {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelServer>(
            BaseRealtimeChannelServer,
            'RemoteBrowserChannelServer',
        );
        expect(instance).toBeInstanceOf(RemoteBrowserChannel);
    });

    it('exposes the tree-shaking loader', () => {
        expect(() => LoadRemoteBrowserChannel()).not.toThrow();
    });
});

describe('RemoteBrowserChannel — lifecycle teardown', () => {
    it('ends the session browser on close', async () => {
        const end = vi.spyOn(RemoteBrowserEngine.Instance, 'EndSessionForAgentSession').mockResolvedValue(true);
        const channel = makeChannel('sess-close');
        await channel.OnSessionClosed('Explicit');
        expect(end).toHaveBeenCalledWith('sess-close');
    });

    it('ends the session browser on dispose (safety net)', async () => {
        const end = vi.spyOn(RemoteBrowserEngine.Instance, 'EndSessionForAgentSession').mockResolvedValue(false);
        const channel = makeChannel('sess-dispose');
        channel.Dispose();
        // Dispose is sync + fire-and-forget; allow the microtask to flush.
        await Promise.resolve();
        expect(end).toHaveBeenCalledWith('sess-dispose');
    });

    it('is a no-op when no context is bound (never initialized)', async () => {
        const end = vi.spyOn(RemoteBrowserEngine.Instance, 'EndSessionForAgentSession').mockResolvedValue(false);
        const channel = makeChannel(null);
        await channel.OnSessionClosed(null);
        expect(end).not.toHaveBeenCalled();
    });

    it('swallows engine teardown errors (never throws from a close hook)', async () => {
        vi.spyOn(RemoteBrowserEngine.Instance, 'EndSessionForAgentSession').mockRejectedValue(new Error('boom'));
        const channel = makeChannel('sess-boom');
        await expect(channel.OnSessionClosed('Error')).resolves.toBeUndefined();
    });
});
