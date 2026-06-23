import { describe, it, expect } from 'vitest';
import { IntegrationCheckRegistry } from '../check-registry';
import type { NamedCheck } from '../check';

const makeCheck = (id: string): NamedCheck => ({ Id: id, Name: id, Fn: async () => { /* pass */ } });

describe('IntegrationCheckRegistry', () => {
    it('registers and retrieves a check by Id', () => {
        const reg = IntegrationCheckRegistry.Instance;
        reg.Register(makeCheck('regtest.A'));
        expect(reg.Get('regtest.A')?.Id).toBe('regtest.A');
    });

    it('GetBundle returns only checks whose Id starts with "<prefix>."', () => {
        const reg = IntegrationCheckRegistry.Instance;
        reg.Register(makeCheck('bundleX.one'));
        reg.Register(makeCheck('bundleX.two'));
        reg.Register(makeCheck('bundleY.one'));
        const ids = reg.GetBundle('bundleX').map(c => c.Id).sort();
        expect(ids).toEqual(['bundleX.one', 'bundleX.two']);
    });

    it('returns undefined for an unknown Id (tolerant by design)', () => {
        expect(IntegrationCheckRegistry.Instance.Get('definitely.unknown.xyz')).toBeUndefined();
    });

    it('Instance is a stable singleton', () => {
        expect(IntegrationCheckRegistry.Instance).toBe(IntegrationCheckRegistry.Instance);
    });
});
