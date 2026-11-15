import { describe, it, expect, vi } from 'vitest';
import { MCPSessionRegistry } from '../sessionRegistry.js';

/** A transport stand-in whose close() records the call. */
function fakeTransport() {
    return { close: vi.fn(async () => undefined) };
}

describe('MCPSessionRegistry', () => {
    it('returns a session only to the user who opened it', () => {
        const registry = new MCPSessionRegistry(60_000);
        const t = fakeTransport();
        registry.Add('s1', t, 'USER-A');

        expect(registry.GetForUser('s1', 'user-a')?.Transport).toBe(t); // UUIDs compare case-insensitively
        expect(registry.GetForUser('s1', 'USER-B')).toBeUndefined();
        expect(registry.GetForUser('nope', 'USER-A')).toBeUndefined();
    });

    it('closes and drops sessions idle longer than the timeout, keeping active ones', async () => {
        let clock = 0;
        const registry = new MCPSessionRegistry(1_000, () => clock);
        const idle = fakeTransport();
        const active = fakeTransport();
        registry.Add('idle', idle, 'A');
        registry.Add('active', active, 'A');

        clock = 900;
        registry.GetForUser('active', 'A'); // a request touches the session
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

    it('rejects a non-positive idle timeout', () => {
        expect(() => new MCPSessionRegistry(0)).toThrow(/positive/);
    });
});
