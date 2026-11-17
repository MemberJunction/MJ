import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { MCPSessionRegistry, SessionCredentialKey } from '../sessionRegistry.js';

/** A transport stand-in whose close() records the call. */
function fakeTransport() {
    return { close: vi.fn(async () => undefined) };
}

const user = { ID: 'ABCD-1234' } as unknown as UserInfo;

describe('SessionCredentialKey', () => {
    it('ties an API-key session to the key, not just the user', () => {
        const a = SessionCredentialKey({ user, authMethod: 'apiKey', apiKeyHash: 'hash-a' });
        const b = SessionCredentialKey({ user, authMethod: 'apiKey', apiKeyHash: 'hash-b' });
        expect(a).not.toBe(b);
    });

    it('ties an OAuth session to issuer and subject, so a refreshed token keeps its session', () => {
        const oauth = { issuer: 'https://idp', subject: 's1', email: 'a@x', tokenExpiresAt: new Date() };
        const first = SessionCredentialKey({ user, authMethod: 'oauth', oauth });
        const refreshed = SessionCredentialKey({ user, authMethod: 'oauth', oauth: { ...oauth, tokenExpiresAt: new Date(0) } });
        expect(first).toBe(refreshed);
    });

    it('never matches an OAuth session with an API key of the same user', () => {
        const oauth = SessionCredentialKey({ user, authMethod: 'oauth', oauth: { issuer: 'i', subject: 's', email: 'e', tokenExpiresAt: new Date() } });
        const key = SessionCredentialKey({ user, authMethod: 'apiKey', apiKeyHash: 'h' });
        expect(oauth).not.toBe(key);
    });

    it('ignores UUID letter case, as SQL Server and PostgreSQL differ on it', () => {
        const upper = SessionCredentialKey({ user, authMethod: 'apiKey', apiKeyHash: 'h' });
        const lower = SessionCredentialKey({ user: { ID: 'abcd-1234' } as unknown as UserInfo, authMethod: 'apiKey', apiKeyHash: 'h' });
        expect(upper).toBe(lower);
    });
});

describe('MCPSessionRegistry', () => {
    it('returns a session only to the credential that opened it', () => {
        const registry = new MCPSessionRegistry(60_000);
        const t = fakeTransport();
        registry.Add('s1', t, 'cred-a');

        expect(registry.GetForOwner('s1', 'cred-a')?.Transport).toBe(t);
        expect(registry.GetForOwner('s1', 'cred-b')).toBeUndefined();
        expect(registry.GetForOwner('nope', 'cred-a')).toBeUndefined();
    });

    it('closes and drops sessions idle longer than the timeout, keeping active ones', async () => {
        let clock = 0;
        const registry = new MCPSessionRegistry(1_000, () => clock);
        const idle = fakeTransport();
        const active = fakeTransport();
        registry.Add('idle', idle, 'A');
        registry.Add('active', active, 'A');

        clock = 900;
        registry.GetForOwner('active', 'A'); // a request touches the session
        clock = 1_500;
        const closed = await registry.SweepIdle();

        expect(closed).toBe(1);
        expect(idle.close).toHaveBeenCalledTimes(1);
        expect(active.close).not.toHaveBeenCalled();
        expect(registry.Size).toBe(1);
    });

    it('keeps sweeping after one close fails, and drops the failed session', async () => {
        let clock = 0;
        const registry = new MCPSessionRegistry(10, () => clock);
        const broken = { close: vi.fn(async () => { throw new Error('socket gone'); }) };
        const fine = fakeTransport();
        registry.Add('broken', broken, 'A');
        registry.Add('fine', fine, 'A');
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        clock = 100;
        await registry.SweepIdle();

        expect(fine.close).toHaveBeenCalled();
        expect(registry.Size).toBe(0);
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    it('CloseAll closes every session and empties the registry', async () => {
        const registry = new MCPSessionRegistry(60_000);
        const a = fakeTransport();
        const b = fakeTransport();
        registry.Add('a', a, 'A');
        registry.Add('b', b, 'B');

        await registry.CloseAll();

        expect(a.close).toHaveBeenCalled();
        expect(b.close).toHaveBeenCalled();
        expect(registry.Size).toBe(0);
    });

    it('after CloseAll, closes a late arrival instead of keeping it (a session that starts during shutdown)', async () => {
        const registry = new MCPSessionRegistry(60_000);
        await registry.CloseAll();
        const late = fakeTransport();

        registry.Add('late', late, 'A');

        expect(registry.Size).toBe(0);
        await vi.waitFor(() => expect(late.close).toHaveBeenCalledTimes(1));
    });

    it('rejects a non-positive idle timeout', () => {
        expect(() => new MCPSessionRegistry(0)).toThrow(/positive/);
    });
});
