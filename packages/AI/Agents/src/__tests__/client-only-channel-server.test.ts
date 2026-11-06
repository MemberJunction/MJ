/**
 * @fileoverview Unit tests for {@link ClientOnlyChannelServer}, the generic server half for channels that run entirely in
 * the browser, and for the two built-in channels that now extend it.
 */
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelServer } from '@memberjunction/ai';
import { ClientOnlyChannelServer, CLIENT_ONLY_CHANNEL_SERVER_KEY, LoadClientOnlyChannelServer } from '../realtime/client-only-channel-server';
import { InteractiveComponentChannelServer, LoadInteractiveComponentChannelServer } from '../realtime/interactive-component-channel-server';
import { IdentityVerificationChannelServer, LoadIdentityVerificationChannelServer } from '../realtime/identity-verification-channel-server';

const create = (key: string): BaseRealtimeChannelServer | null =>
    MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelServer>(BaseRealtimeChannelServer, key);

describe('ClientOnlyChannelServer', () => {
    it('is resolvable from the ClassFactory by its registry key', () => {
        LoadClientOnlyChannelServer();
        expect(CLIENT_ONLY_CHANNEL_SERVER_KEY).toBe('ClientOnlyChannelServer');
        expect(create(CLIENT_ONLY_CHANNEL_SERVER_KEY)).toBeInstanceOf(ClientOnlyChannelServer);
    });

    it('has no name until it is bound to a registry row, then reports that row name', () => {
        const plugin = new ClientOnlyChannelServer();
        expect(plugin.ChannelName).toBe('');
        plugin.BindChannelName('FormsChannel');
        expect(plugin.ChannelName).toBe('FormsChannel');
    });

    it('is a fresh instance per resolution, so two channels never share a name', () => {
        const a = create(CLIENT_ONLY_CHANNEL_SERVER_KEY) as ClientOnlyChannelServer;
        const b = create(CLIENT_ONLY_CHANNEL_SERVER_KEY) as ClientOnlyChannelServer;
        a.BindChannelName('A');
        b.BindChannelName('B');
        expect([a.ChannelName, b.ChannelName]).toEqual(['A', 'B']);
    });

    it('contributes no server tools and no tool prefix', () => {
        const plugin = new ClientOnlyChannelServer();
        expect(plugin.GetServerToolDefinitions()).toEqual([]);
        expect(plugin.ToolNamePrefix).toBe('');
    });

    it('does not rewrite a state save', async () => {
        expect(await new ClientOnlyChannelServer().OnChannelStateSave()).toBeNull();
    });

    it('survives its whole lifecycle with no context-dependent work', async () => {
        const plugin = new ClientOnlyChannelServer();
        await expect(plugin.OnSessionStarted()).resolves.toBeUndefined();
        await expect(plugin.OnSessionClosed(null)).resolves.toBeUndefined();
        expect(() => plugin.Dispose()).not.toThrow();
    });
});

describe('the built-in channels that extend it keep their registry keys and names', () => {
    it.each([
        ['InteractiveComponentChannelServer', InteractiveComponentChannelServer, 'InteractiveComponent', LoadInteractiveComponentChannelServer],
        ['IdentityVerificationChannelServer', IdentityVerificationChannelServer, 'IdentityVerification', LoadIdentityVerificationChannelServer],
    ] as const)('%s resolves by its existing key, pins its name, and behaves as before', async (key, ctor, name, load) => {
        load();
        const plugin = create(key);
        expect(plugin).toBeInstanceOf(ctor);
        expect(plugin).toBeInstanceOf(ClientOnlyChannelServer);
        expect(plugin?.ChannelName).toBe(name);
        // Binding a different row name does not rename a channel that pins its own.
        (plugin as ClientOnlyChannelServer).BindChannelName('SomethingElse');
        expect(plugin?.ChannelName).toBe(name);
        expect(plugin?.GetServerToolDefinitions()).toEqual([]);
        expect(await plugin?.OnChannelStateSave('{}')).toBeNull();
    });
});
