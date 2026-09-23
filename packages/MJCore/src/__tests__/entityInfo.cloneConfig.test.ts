import { describe, it, expect } from 'vitest';
import { EntityInfo, EntityRelationshipInfo, EntityFieldInfo } from '../generic/entityInfo';

describe('EntityInfo, EntityRelationshipInfo, and EntityFieldInfo Clone Config Getters', () => {
    it('EntityInfo returns null for CloneConfig and false for CloneEnabled / NotCloneable when Configuration is unset', () => {
        const entity = new EntityInfo();
        expect(entity.CloneConfig).toBeNull();
        expect(entity.CloneEnabled).toBe(false);
        expect(entity.NotCloneable).toBe(false);
    });

    it('EntityInfo parses CloneConfig from Configuration JSON correctly', () => {
        const entity = new EntityInfo();
        entity.Configuration = JSON.stringify({
            Clone: {
                Enabled: true,
                NotCloneable: false,
                MaxDepth: 5,
                MaxRecords: 100,
            },
        });
        expect(entity.CloneConfig).not.toBeNull();
        expect(entity.CloneConfig?.MaxDepth).toBe(5);
        expect(entity.CloneConfig?.MaxRecords).toBe(100);
        expect(entity.CloneEnabled).toBe(true);
        expect(entity.NotCloneable).toBe(false);
    });

    it('EntityInfo detects NotCloneable: true correctly', () => {
        const entity = new EntityInfo();
        entity.Configuration = JSON.stringify({
            Clone: {
                NotCloneable: true,
                NotCloneableReason: 'Audit logs cannot be cloned',
            },
        });
        expect(entity.NotCloneable).toBe(true);
        expect(entity.CloneEnabled).toBe(false);
        expect(entity.CloneConfig?.NotCloneableReason).toBe('Audit logs cannot be cloned');
    });

    it('EntityRelationshipInfo returns null CloneConfig when Configuration is unset', () => {
        const rel = new EntityRelationshipInfo();
        expect(rel.CloneConfig).toBeNull();
    });

    it('EntityRelationshipInfo parses CloneConfig correctly', () => {
        const rel = new EntityRelationshipInfo();
        rel.Configuration = JSON.stringify({
            Clone: {
                Policy: 'Deep',
                Locked: true,
                MaxRecords: 50,
            },
        });
        expect(rel.CloneConfig).not.toBeNull();
        expect(rel.CloneConfig?.Policy).toBe('Deep');
        expect(rel.CloneConfig?.Locked).toBe(true);
        expect(rel.CloneConfig?.MaxRecords).toBe(50);
    });

    it('EntityFieldInfo returns null CloneConfig when Configuration is unset', () => {
        const field = new EntityFieldInfo();
        expect(field.CloneConfig).toBeNull();
    });

    it('EntityFieldInfo parses CloneConfig correctly', () => {
        const field = new EntityFieldInfo();
        field.Configuration = JSON.stringify({
            Clone: {
                Policy: 'Reset',
                Value: 'Active',
            },
        });
        expect(field.CloneConfig).not.toBeNull();
        expect(field.CloneConfig?.Policy).toBe('Reset');
        expect(field.CloneConfig?.Value).toBe('Active');
    });
});
