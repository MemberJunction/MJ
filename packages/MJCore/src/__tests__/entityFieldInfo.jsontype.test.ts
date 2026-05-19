/**
 * EntityFieldInfo JSONType Property Tests
 *
 * Tests that EntityFieldInfo correctly handles JSONType metadata properties:
 * - Default values (null/false)
 * - Population from init data
 */

import { describe, it, expect } from 'vitest';
import { EntityFieldInfo } from '../generic/entityInfo';

describe('EntityFieldInfo JSONType properties', () => {
    it('should have null default for JSONType', () => {
        const field = new EntityFieldInfo();
        expect(field.JSONType).toBeNull();
    });

    it('should have false default for JSONTypeIsArray', () => {
        const field = new EntityFieldInfo();
        expect(field.JSONTypeIsArray).toBe(false);
    });

    it('should have null default for JSONTypeDefinition', () => {
        const field = new EntityFieldInfo();
        expect(field.JSONTypeDefinition).toBeNull();
    });

    it('should populate JSONType properties from init data', () => {
        const field = new EntityFieldInfo({
            ID: 'f-test',
            EntityID: 'ent-test-001',
            Name: 'Config',
            Type: 'nvarchar',
            JSONType: 'IMyConfig',
            JSONTypeIsArray: true,
            JSONTypeDefinition: 'export interface IMyConfig { key: string; }',
            Sequence: 1,
            Status: 'Active',
        });
        expect(field.JSONType).toBe('IMyConfig');
        expect(field.JSONTypeIsArray).toBe(true);
        expect(field.JSONTypeDefinition).toBe('export interface IMyConfig { key: string; }');
    });
});
