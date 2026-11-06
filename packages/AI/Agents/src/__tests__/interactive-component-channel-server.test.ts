/**
 * @fileoverview Unit tests for {@link InteractiveComponentChannelServer}, the Interactive Component channel's server
 * half. It contributes no server tools and persists no state of record.
 */
import { describe, it, expect } from 'vitest';
import { BaseRealtimeChannelServer } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import {
    InteractiveComponentChannelServer,
    INTERACTIVE_COMPONENT_CHANNEL_NAME,
    LoadInteractiveComponentChannelServer,
} from '../realtime/interactive-component-channel-server';

describe('InteractiveComponentChannelServer', () => {
    it('reports the stable channel name matching the registry row', () => {
        expect(new InteractiveComponentChannelServer().ChannelName).toBe('InteractiveComponent');
        expect(INTERACTIVE_COMPONENT_CHANNEL_NAME).toBe('InteractiveComponent');
    });

    it('contributes NO server tools (the actions come from the open component and run in the browser)', () => {
        expect(new InteractiveComponentChannelServer().GetServerToolDefinitions()).toEqual([]);
    });

    it('persists NO state of record (open components are live-only)', async () => {
        expect(await new InteractiveComponentChannelServer().OnChannelStateSave()).toBeNull();
    });

    it('is registered with the class factory under the key the registry row names', () => {
        LoadInteractiveComponentChannelServer();
        const created = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelServer>(
            BaseRealtimeChannelServer,
            'InteractiveComponentChannelServer'
        );
        expect(created).toBeInstanceOf(InteractiveComponentChannelServer);
    });
});
