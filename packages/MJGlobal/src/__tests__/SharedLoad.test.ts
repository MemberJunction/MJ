import { describe, it, expect } from 'vitest';
import { SharedLoad } from '../SharedLoad';

/** A load the test settles by hand. */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } {
    let resolve: () => void = () => undefined;
    let reject: (e: Error) => void = () => undefined;
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe('SharedLoad', () => {
    it('a non-forced caller joins the running load', async () => {
        const gate = new SharedLoad();
        const first = deferred();
        const started: string[] = [];
        const a = gate.Run(false, () => { started.push('a'); return first.promise; });
        const b = gate.Run(false, () => { started.push('b'); return Promise.resolve(); });
        expect(gate.IsRunning).toBe(true);
        first.resolve();
        await Promise.all([a, b]);
        expect(started).toEqual(['a']);
        expect(gate.IsRunning).toBe(false);
    });

    it('a forced caller waits for the running load, then runs its own (#5644)', async () => {
        const gate = new SharedLoad();
        const first = deferred();
        const started: string[] = [];
        const a = gate.Run(false, () => { started.push('restricted user'); return first.promise; });
        const forced = gate.Run(true, async () => { started.push('system user'); });
        await Promise.resolve();
        expect(started).toEqual(['restricted user']);
        first.resolve();
        await Promise.all([a, forced]);
        expect(started).toEqual(['restricted user', 'system user']);
    });

    it('a forced caller still runs when the load it waited for fails', async () => {
        const gate = new SharedLoad();
        const first = deferred();
        const started: string[] = [];
        const a = gate.Run(false, () => first.promise);
        const forced = gate.Run(true, async () => { started.push('forced'); });
        first.reject(new Error('load failed'));
        await expect(a).rejects.toThrow('load failed');
        await forced;
        expect(started).toEqual(['forced']);
    });

    it('two forced callers each run their own load, one after the other', async () => {
        const gate = new SharedLoad();
        const first = deferred();
        const order: string[] = [];
        const a = gate.Run(false, () => { order.push('a:start'); return first.promise.then(() => { order.push('a:end'); }); });
        const b = gate.Run(true, async () => { order.push('b'); });
        const c = gate.Run(true, async () => { order.push('c'); });
        first.resolve();
        await Promise.all([a, b, c]);
        expect(order[0]).toBe('a:start');
        expect(order[1]).toBe('a:end');
        expect(order.slice(2).sort()).toEqual(['b', 'c']);
    });

    it('a non-forced caller arriving during a forced load joins it', async () => {
        const gate = new SharedLoad();
        const forcedLoad = deferred();
        const started: string[] = [];
        const forced = gate.Run(true, () => { started.push('forced'); return forcedLoad.promise; });
        const joined = gate.Run(false, async () => { started.push('joined'); });
        forcedLoad.resolve();
        await Promise.all([forced, joined]);
        expect(started).toEqual(['forced']);
    });

    it('propagates the failure of a load to the callers that ran or joined it', async () => {
        const gate = new SharedLoad();
        const run = gate.Run(false, () => Promise.reject(new Error('boom')));
        const joined = gate.Run(false, () => Promise.resolve());
        await expect(run).rejects.toThrow('boom');
        await expect(joined).rejects.toThrow('boom');
        expect(gate.IsRunning).toBe(false);
    });
});
