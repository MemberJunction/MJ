import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShutdownRegistry, IShutdownable } from '../ShutdownRegistry';

describe('ShutdownRegistry', () => {
    beforeEach(() => {
        ShutdownRegistry.Instance.ResetForTests();
    });

    it('is a singleton via BaseSingleton', () => {
        const a = ShutdownRegistry.Instance;
        const b = ShutdownRegistry.Instance;
        expect(a).toBe(b);
    });

    it('registers items and reports count', () => {
        const reg = ShutdownRegistry.Instance;
        const item: IShutdownable = { Shutdown: () => {} };
        reg.Register(item);
        expect(reg.Count).toBe(1);
        reg.Register(item); // duplicate ignored
        expect(reg.Count).toBe(1);
    });

    it('Unregister returns true on success and false on missing', () => {
        const reg = ShutdownRegistry.Instance;
        const item: IShutdownable = { Shutdown: () => {} };
        expect(reg.Unregister(item)).toBe(false);
        reg.Register(item);
        expect(reg.Unregister(item)).toBe(true);
        expect(reg.Count).toBe(0);
    });

    it('ShutdownAll calls each registered Shutdown exactly once', async () => {
        const reg = ShutdownRegistry.Instance;
        const sa = vi.fn();
        const sb = vi.fn().mockResolvedValue(undefined);
        reg.Register({ Shutdown: sa });
        reg.Register({ Shutdown: sb });
        await reg.ShutdownAll();
        expect(sa).toHaveBeenCalledTimes(1);
        expect(sb).toHaveBeenCalledTimes(1);
        expect(reg.Count).toBe(0);
    });

    it('continues shutdowns even when one throws', async () => {
        const reg = ShutdownRegistry.Instance;
        // Suppress the expected console.error from ShutdownAll
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const sa = vi.fn(() => { throw new Error('boom'); });
        const sb = vi.fn();
        reg.Register({ ShutdownName: 'thrower', Shutdown: sa });
        reg.Register({ Shutdown: sb });
        await reg.ShutdownAll();
        expect(sa).toHaveBeenCalled();
        expect(sb).toHaveBeenCalled();
        expect(errSpy).toHaveBeenCalledWith(
            expect.stringContaining('thrower'),
            expect.any(Error)
        );
        errSpy.mockRestore();
    });

    it('awaits async Shutdown returns', async () => {
        const reg = ShutdownRegistry.Instance;
        let settled = false;
        reg.Register({
            Shutdown: () => new Promise<void>((resolve) => {
                setTimeout(() => { settled = true; resolve(); }, 0);
            }),
        });
        await reg.ShutdownAll();
        expect(settled).toBe(true);
    });

    it('IsShuttingDown flips during ShutdownAll', async () => {
        const reg = ShutdownRegistry.Instance;
        let observedDuringShutdown = false;
        reg.Register({
            Shutdown: () => { observedDuringShutdown = reg.IsShuttingDown; },
        });
        expect(reg.IsShuttingDown).toBe(false);
        await reg.ShutdownAll();
        expect(observedDuringShutdown).toBe(true);
    });

    it('List returns a copy of registered items', () => {
        const reg = ShutdownRegistry.Instance;
        const item: IShutdownable = { Shutdown: () => {} };
        reg.Register(item);
        const list = reg.List();
        expect(list).toEqual([item]);
        list.length = 0; // mutate copy
        expect(reg.Count).toBe(1);
    });
});
