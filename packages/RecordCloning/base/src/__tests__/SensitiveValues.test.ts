import { describe, it, expect } from 'vitest';
import { ENCRYPTED_SENTINEL } from '@memberjunction/global';
import { MapFieldsForClone } from '../CloneFieldMapper';
import { MaskSensitiveFieldChange, MaskSensitivePlan } from '../SensitiveValues';
import type { ClonePlan } from '../types';

describe('encrypted field masking', () => {
    const mapped = MapFieldsForClone({
        EntityName: 'MJ: Company Integrations',
        Fields: [
            { Name: 'ID', IsPrimaryKey: true },
            { Name: 'Name', IsPrimaryKey: false },
            { Name: 'AccessToken', IsPrimaryKey: false, Encrypted: true },
            { Name: 'RefreshToken', IsPrimaryKey: false, Encrypted: true },
        ],
        SourceRecord: { ID: 'ci-1', Name: 'HubSpot', AccessToken: 'at-secret', RefreshToken: null },
    });

    it('keeps the real value in the server-side mapping, so Execute can write it', () => {
        expect(mapped.MappedValues.AccessToken).toBe('at-secret');
    });

    it('marks encrypted fields sensitive and only those', () => {
        const byField = new Map(mapped.FieldChanges.map((c) => [c.Field, c]));
        expect(byField.get('AccessToken')?.Sensitive).toBe(true);
        expect(byField.get('Name')?.Sensitive).toBeUndefined();
    });

    it('masks sensitive values and leaves empty ones empty', () => {
        const access = MaskSensitiveFieldChange(mapped.FieldChanges.find((c) => c.Field === 'AccessToken')!);
        expect(access.OldValue).toBe(ENCRYPTED_SENTINEL);
        expect(access.NewValue).toBe(ENCRYPTED_SENTINEL);
        const refresh = mapped.FieldChanges.find((c) => c.Field === 'RefreshToken');
        if (refresh) expect(MaskSensitiveFieldChange(refresh).OldValue).toBeNull();
    });

    it('masks a whole plan without changing the original', () => {
        const plan = {
            Nodes: [{ Key: 'n1', FieldChanges: mapped.FieldChanges }],
        } as unknown as ClonePlan;
        const masked = MaskSensitivePlan(plan);
        expect(JSON.stringify(masked)).not.toContain('at-secret');
        expect(JSON.stringify(plan)).toContain('at-secret');
    });
});
