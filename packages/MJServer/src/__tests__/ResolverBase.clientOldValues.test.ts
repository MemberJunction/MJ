// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { EntityFieldTSType, type EntityFieldInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';

/**
 * Client old values arrive as strings, with dates as epoch milliseconds (the GraphQL Timestamp form).
 * Loading them as-is made an unchanged date field an Invalid Date, so it read as edited: a
 * Comments-only update to an MJ: Record Changes row was refused for "changing" ChangedAt.
 */
class Probe extends ResolverBase {
    public Convert(field: Partial<EntityFieldInfo>, raw: unknown) {
        return this.ClientOldValueToFieldValue(field as EntityFieldInfo, raw);
    }
}
const probe = new Probe();
const dateField = { Name: 'ChangedAt', TSType: EntityFieldTSType.Date, Type: 'datetimeoffset', AllowsNull: false, DefaultValue: 'getutcdate()' };

describe('ResolverBase.ClientOldValueToFieldValue', () => {
    it('reads an epoch-milliseconds string as the same instant', () => {
        const value = probe.Convert(dateField, '1790365634563') as Date;
        expect(value).toBeInstanceOf(Date);
        expect(value.getTime()).toBe(1790365634563);
    });

    it('reads an ISO date string too, and keeps null as null for a nullable date', () => {
        expect((probe.Convert(dateField, '2026-09-25T19:47:14.563Z') as Date).toISOString()).toBe('2026-09-25T19:47:14.563Z');
        expect(probe.Convert({ ...dateField, AllowsNull: true, DefaultValue: null }, null)).toBeNull();
    });

    it('types numbers and booleans like the field', () => {
        expect(probe.Convert({ Name: 'N', TSType: EntityFieldTSType.Number, Type: 'int' }, '42')).toBe(42);
        expect(probe.Convert({ Name: 'B', TSType: EntityFieldTSType.Boolean, Type: 'bit' }, 'false')).toBe(false);
    });
});
