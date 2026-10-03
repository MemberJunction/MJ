/**
 * @fileoverview Unit tests for {@link IdentityVerificationChannelServer} — the Identity Verification
 * channel's server half. It contributes no server tools and persists no state: the verification
 * operations are the security boundary, and an email address must not land on the channel row.
 */
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelServer } from '@memberjunction/ai';
import {
    IdentityVerificationChannelServer,
    IDENTITY_VERIFICATION_CHANNEL_NAME,
    LoadIdentityVerificationChannelServer,
} from '../realtime/identity-verification-channel-server';

describe('IdentityVerificationChannelServer', () => {
    it('reports the stable channel name matching the seeded registry row', () => {
        expect(new IdentityVerificationChannelServer().ChannelName).toBe('IdentityVerification');
        expect(IDENTITY_VERIFICATION_CHANNEL_NAME).toBe('IdentityVerification');
    });

    it('is resolvable from the ClassFactory by the registry ServerPluginClass key', () => {
        LoadIdentityVerificationChannelServer();
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelServer>(BaseRealtimeChannelServer, 'IdentityVerificationChannelServer');
        expect(instance).toBeInstanceOf(IdentityVerificationChannelServer);
    });

    it('contributes NO server tools (the verbs run in the browser against the verification operations)', () => {
        expect(new IdentityVerificationChannelServer().GetServerToolDefinitions()).toEqual([]);
    });

    it('persists NO state of record (no email address on the channel row)', async () => {
        expect(await new IdentityVerificationChannelServer().OnChannelStateSave()).toBeNull();
    });

    it('exposes a no-op tree-shaking Load function', () => {
        expect(() => LoadIdentityVerificationChannelServer()).not.toThrow();
    });
});
