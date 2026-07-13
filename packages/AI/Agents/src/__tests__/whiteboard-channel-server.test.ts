/**
 * Unit tests for {@link WhiteboardChannelServer} — the reference server-side channel plugin.
 * Pins its state-of-record guard contract: valid board JSON is canonicalized (compact
 * re-serialization), already-canonical payloads pass through untouched (`null` = keep original),
 * and malformed/non-object payloads are flagged loudly but NEVER block persistence. Also pins the
 * ClassFactory registration the channel registry's seeded `ServerPluginClass` resolves.
 */
import { describe, it, expect } from 'vitest';
import { BaseRealtimeChannelServer } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import {
    WhiteboardChannelServer,
    LoadWhiteboardChannelServer,
} from '../realtime/whiteboard-channel-server';

function makePlugin(): WhiteboardChannelServer {
    const plugin = new WhiteboardChannelServer();
    plugin.Initialize({ AgentSessionID: 'session-1', AgentID: 'agent-1', UserID: 'user-1', ConversationID: null });
    return plugin;
}

describe('WhiteboardChannelServer', () => {
    it('is registered under the seeded ServerPluginClass key and matches the registry row name', () => {
        LoadWhiteboardChannelServer();
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeChannelServer, 'WhiteboardChannelServer');
        expect(registration).toBeTruthy();

        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelServer>(
            BaseRealtimeChannelServer,
            'WhiteboardChannelServer',
        );
        expect(instance).toBeInstanceOf(WhiteboardChannelServer);
        expect(instance?.ChannelName).toBe('Whiteboard');
    });

    it('canonicalizes a valid but non-canonical board payload (whitespace stripped)', async () => {
        const plugin = makePlugin();
        const pretty = '{\n  "items": [ { "id": "n1" } ],\n  "version": 3\n}';
        await expect(plugin.OnChannelStateSave(pretty)).resolves.toBe('{"items":[{"id":"n1"}],"version":3}');
    });

    it('returns null (keep original) when the payload is already canonical', async () => {
        const plugin = makePlugin();
        const canonical = JSON.stringify({ items: [], version: 3 });
        await expect(plugin.OnChannelStateSave(canonical)).resolves.toBeNull();
    });

    it('flags malformed JSON without throwing and keeps the original (null)', async () => {
        const plugin = makePlugin();
        await expect(plugin.OnChannelStateSave('{"items": [unterminated')).resolves.toBeNull();
    });

    it('flags non-object JSON (array / primitive / null) and keeps the original', async () => {
        const plugin = makePlugin();
        await expect(plugin.OnChannelStateSave('[1,2,3]')).resolves.toBeNull();
        await expect(plugin.OnChannelStateSave('"just a string"')).resolves.toBeNull();
        await expect(plugin.OnChannelStateSave('42')).resolves.toBeNull();
        await expect(plugin.OnChannelStateSave('null')).resolves.toBeNull();
    });

    it('tolerates running without a bound context (defensive logging path)', async () => {
        const plugin = new WhiteboardChannelServer(); // never initialized
        await expect(plugin.OnChannelStateSave('not json')).resolves.toBeNull();
    });
});
