import { describe, it, expect, vi } from 'vitest';
import { ComputeGeoSourceHash } from '../hash';
import { BaseEntity } from '@memberjunction/core';

describe('ComputeGeoSourceHash', () => {
    function createMockEntity(fields: Record<string, string | null>): BaseEntity {
        return {
            Get: vi.fn((name: string) => fields[name] ?? null)
        } as unknown as BaseEntity;
    }

    it('should produce a consistent hash for the same field values', () => {
        const entity = createMockEntity({
            Address: '123 Main St',
            City: 'Springfield',
            State: 'IL'
        });

        const hash1 = ComputeGeoSourceHash(entity, ['Address', 'City', 'State']);
        const hash2 = ComputeGeoSourceHash(entity, ['Address', 'City', 'State']);
        expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different field values', () => {
        const entity1 = createMockEntity({ City: 'Springfield' });
        const entity2 = createMockEntity({ City: 'Chicago' });

        const hash1 = ComputeGeoSourceHash(entity1, ['City']);
        const hash2 = ComputeGeoSourceHash(entity2, ['City']);
        expect(hash1).not.toBe(hash2);
    });

    it('should treat null values as empty strings', () => {
        const entity1 = createMockEntity({ City: null });
        const entity2 = createMockEntity({});

        const hash1 = ComputeGeoSourceHash(entity1, ['City']);
        const hash2 = ComputeGeoSourceHash(entity2, ['City']);
        expect(hash1).toBe(hash2);
    });

    it('should trim whitespace from field values', () => {
        const entity1 = createMockEntity({ City: '  Springfield  ' });
        const entity2 = createMockEntity({ City: 'Springfield' });

        const hash1 = ComputeGeoSourceHash(entity1, ['City']);
        const hash2 = ComputeGeoSourceHash(entity2, ['City']);
        expect(hash1).toBe(hash2);
    });

    it('should return a 64-character hex string (SHA-256)', () => {
        const entity = createMockEntity({ City: 'Test' });
        const hash = ComputeGeoSourceHash(entity, ['City']);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be sensitive to field order', () => {
        const entity = createMockEntity({ A: 'foo', B: 'bar' });
        const hash1 = ComputeGeoSourceHash(entity, ['A', 'B']);
        const hash2 = ComputeGeoSourceHash(entity, ['B', 'A']);
        expect(hash1).not.toBe(hash2);
    });
});
