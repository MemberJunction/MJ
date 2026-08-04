/**
 * @fileoverview Unit tests for {@link ClientContextChannelServer} — the headless Client Context
 * channel's server half. It contributes no server tools and persists no state of record.
 */
import { describe, it, expect } from 'vitest';
import {
    ClientContextChannelServer,
    CLIENT_CONTEXT_CHANNEL_NAME,
    LoadClientContextChannelServer,
} from '../realtime/client-context-channel-server';

describe('ClientContextChannelServer', () => {
    it('reports the stable channel name matching the seeded registry row', () => {
        const ch = new ClientContextChannelServer();
        expect(ch.ChannelName).toBe('ClientContextChannel');
        expect(CLIENT_CONTEXT_CHANNEL_NAME).toBe('ClientContextChannel');
    });

    it('contributes NO server tools (ContextTool + client tools execute client-side)', () => {
        expect(new ClientContextChannelServer().GetServerToolDefinitions()).toEqual([]);
    });

    it('persists NO state of record (live-only wire — keep nothing)', async () => {
        expect(await new ClientContextChannelServer().OnChannelStateSave()).toBeNull();
    });

    it('exposes a no-op tree-shaking Load function', () => {
        expect(() => LoadClientContextChannelServer()).not.toThrow();
    });
});
