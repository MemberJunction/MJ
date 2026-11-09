import { describe, it, expect } from 'vitest';
import { OwnedExecutor } from '../transports/OwnedExecutor';
import { RecordingExecutor } from './fakes';

describe('OwnedExecutor', () => {
    it('mints one independent executor on first use and reuses it', async () => {
        const source = new RecordingExecutor();
        const owned = new OwnedExecutor(source);
        const first = await owned.Get();
        const [second, third] = await Promise.all([owned.Get(), owned.Get()]);
        expect(second).toBe(first);
        expect(third).toBe(first);
        expect(source.Events).toEqual(['independent']);
    });

    it('releases the executor once, and mints a fresh one afterwards', async () => {
        const source = new RecordingExecutor();
        const owned = new OwnedExecutor(source);
        await owned.Get();
        await owned.Release();
        await owned.Release();
        await owned.Get();
        expect(source.Events).toEqual(['independent', 'release', 'independent']);
    });

    it('does not cache a failed mint', async () => {
        const source = new RecordingExecutor();
        const mint = source.CreateIndependentInstance.bind(source);
        let calls = 0;
        source.CreateIndependentInstance = async () => {
            if (++calls === 1) {
                throw new Error('pool exhausted');
            }
            return mint();
        };
        const owned = new OwnedExecutor(source);
        await expect(owned.Get()).rejects.toThrow('pool exhausted');
        await expect(owned.Get()).resolves.toBeDefined();
    });
});
