import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import { AssertProviderHasMetadata } from '../checks/fls-client.checks';

/**
 * A secondary provider's Config() reports success even when its metadata load failed, so a check
 * got `null` from GetEntityObject and died on `NewRecord` far from the cause (#6361).
 */
describe('AssertProviderHasMetadata', () => {
    it('passes for a provider that loaded entities', () => {
        expect(() => AssertProviderHasMetadata({ Entities: [{ Name: 'MJ: Users' } as EntityInfo] }, 'the system key provider')).not.toThrow();
    });

    it('names the provider when it loaded no entities', () => {
        expect(() => AssertProviderHasMetadata({ Entities: [] }, 'the system key provider'))
            .toThrow(/the system key provider connected to MJAPI but loaded no metadata/);
    });
});
