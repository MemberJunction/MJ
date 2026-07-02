/**
 * Unit tests for {@link MediaChannelServer} — focuses on the per-session media-kit override seam.
 * Pins: (1) the ClassFactory registration the seeded `ServerPluginClass` resolves; (2) that
 * `OnSessionStarted` parses a `mediaCollectionID` out of the host-supplied `AgentSessionConfig`
 * blob and passes it as the override to the media library, then surfaces the returned note via
 * `SendContextNote`; and (3) the defensive paths (no data context, malformed/empty/non-object
 * config, no override key, null note) never throw and degrade to the agent default kit.
 *
 * The DB-touching resolver (`buildAgentMediaContextNote`) is mocked — these tests pin the channel's
 * wiring, not the library (which has its own suite in `agent-media-library.test.ts`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the media library so we can assert exactly what override the channel resolves and passes.
const buildNoteMock = vi.fn();
vi.mock('../realtime/agent-media-library', () => ({
    buildAgentMediaContextNote: (...args: unknown[]) => buildNoteMock(...args),
}));

import { BaseRealtimeChannelServer } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MediaChannelServer, LoadMediaChannelServer } from '../realtime/media-channel-server';

const PROVIDER = {} as unknown as IMetadataProvider;
const USER = { ID: 'user-1' } as unknown as UserInfo;
const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

/** Builds a started-ready plugin with the given session config blob + optional data context / agent id. */
function makePlugin(
    agentSessionConfig: string | null,
    opts: { withDataContext?: boolean; agentID?: string } = {},
): { plugin: MediaChannelServer; sendContextNote: ReturnType<typeof vi.fn> } {
    const sendContextNote = vi.fn();
    const plugin = new MediaChannelServer();
    plugin.Initialize({
        AgentSessionID: 'session-1',
        AgentID: opts.agentID ?? 'agent-1',
        UserID: 'user-1',
        ConversationID: null,
        AgentSessionConfig: agentSessionConfig,
        SendContextNote: sendContextNote,
    });
    if (opts.withDataContext !== false) {
        plugin.SetSessionDataContext(USER, PROVIDER);
    }
    return { plugin, sendContextNote };
}

beforeEach(() => {
    buildNoteMock.mockReset();
});

describe('MediaChannelServer registration', () => {
    it('is registered under the seeded ServerPluginClass key and reports ChannelName "Media"', () => {
        LoadMediaChannelServer();
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeChannelServer, 'MediaChannelServer');
        expect(registration).toBeTruthy();

        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelServer>(
            BaseRealtimeChannelServer,
            'MediaChannelServer',
        );
        expect(instance).toBeInstanceOf(MediaChannelServer);
        expect(instance?.ChannelName).toBe('Media');
    });
});

describe('MediaChannelServer.OnSessionStarted — media-kit override', () => {
    it('parses mediaCollectionID from AgentSessionConfig and passes it as the override, then sends the note', async () => {
        buildNoteMock.mockResolvedValue('the-manifest-note');
        const { plugin, sendContextNote } = makePlugin(JSON.stringify({ targetAgentID: 'tgt', mediaCollectionID: VALID_UUID }));

        await plugin.OnSessionStarted();

        expect(buildNoteMock).toHaveBeenCalledTimes(1);
        expect(buildNoteMock).toHaveBeenCalledWith(PROVIDER, USER, 'agent-1', VALID_UUID);
        expect(sendContextNote).toHaveBeenCalledWith('the-manifest-note');
    });

    it('passes a null override when the config carries no mediaCollectionID', async () => {
        buildNoteMock.mockResolvedValue('note');
        const { plugin } = makePlugin(JSON.stringify({ targetAgentID: 'tgt' }));

        await plugin.OnSessionStarted();

        expect(buildNoteMock).toHaveBeenCalledWith(PROVIDER, USER, 'agent-1', null);
    });

    it('passes a null override when there is no session config', async () => {
        buildNoteMock.mockResolvedValue('note');
        const { plugin } = makePlugin(null);

        await plugin.OnSessionStarted();

        expect(buildNoteMock).toHaveBeenCalledWith(PROVIDER, USER, 'agent-1', null);
    });

    it('does not throw and passes a null override when the config is malformed JSON', async () => {
        buildNoteMock.mockResolvedValue('note');
        const { plugin } = makePlugin('{ not valid json');

        await expect(plugin.OnSessionStarted()).resolves.toBeUndefined();
        expect(buildNoteMock).toHaveBeenCalledWith(PROVIDER, USER, 'agent-1', null);
    });

    it('passes a null override when the config parses to a non-object (array)', async () => {
        buildNoteMock.mockResolvedValue('note');
        const { plugin } = makePlugin('[1,2,3]');

        await plugin.OnSessionStarted();

        expect(buildNoteMock).toHaveBeenCalledWith(PROVIDER, USER, 'agent-1', null);
    });

    it('ignores an empty-string mediaCollectionID (treated as no override)', async () => {
        buildNoteMock.mockResolvedValue('note');
        const { plugin } = makePlugin(JSON.stringify({ mediaCollectionID: '' }));

        await plugin.OnSessionStarted();

        expect(buildNoteMock).toHaveBeenCalledWith(PROVIDER, USER, 'agent-1', null);
    });

    it('does nothing when the data context was never handed over', async () => {
        const { plugin, sendContextNote } = makePlugin(JSON.stringify({ mediaCollectionID: VALID_UUID }), {
            withDataContext: false,
        });

        await plugin.OnSessionStarted();

        expect(buildNoteMock).not.toHaveBeenCalled();
        expect(sendContextNote).not.toHaveBeenCalled();
    });

    it('does not send a context note when the library returns null (no kit / no showable items)', async () => {
        buildNoteMock.mockResolvedValue(null);
        const { plugin, sendContextNote } = makePlugin(JSON.stringify({ mediaCollectionID: VALID_UUID }));

        await plugin.OnSessionStarted();

        expect(buildNoteMock).toHaveBeenCalledTimes(1);
        expect(sendContextNote).not.toHaveBeenCalled();
    });
});
