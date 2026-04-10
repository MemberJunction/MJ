import { describe, it, expect } from 'vitest';
import { MetadataEmitter } from '../MetadataEmitter.js';

describe('MetadataEmitter', () => {
    const emitter = new MetadataEmitter();

    describe('GenerateEntitySettingsRecord', () => {
        it('should produce mj-sync compatible record structure', () => {
            const record = emitter.GenerateEntitySettingsRecord('Contacts', { IntegrationWriteAllowed: 'true' });
            expect(record['fields']).toEqual({ Name: 'Contacts' });
            expect(record['primaryKey']).toEqual({ ID: '@lookup:MJ: Entities.Name=Contacts' });

            const related = record['relatedEntities'] as Record<string, unknown[]>;
            expect(related['MJ: Entity Settings']).toHaveLength(1);
            const setting = related['MJ: Entity Settings'][0] as Record<string, Record<string, string>>;
            expect(setting['fields']['Name']).toBe('IntegrationWriteAllowed');
            expect(setting['fields']['Value']).toBe('true');
        });
    });

    describe('EmitEntitySettingsFile', () => {
        it('should emit JSON array of entity settings', () => {
            const file = emitter.EmitEntitySettingsFile(['Contacts', 'Companies'], 'metadata');
            expect(file.FilePath).toBe('metadata/entity-settings/.integration-write-allowed.json');
            const parsed = JSON.parse(file.Content);
            expect(parsed).toHaveLength(2);
            expect(parsed[0].fields.Name).toBe('Contacts');
            expect(parsed[1].fields.Name).toBe('Companies');
        });
    });

    describe('EmitMjSyncConfig', () => {
        it('should emit mj-sync config for entity-settings directory', () => {
            const file = emitter.EmitMjSyncConfig('metadata');
            expect(file.FilePath).toBe('metadata/entity-settings/.mj-sync.json');
            const parsed = JSON.parse(file.Content);
            expect(parsed.entity).toBe('MJ: Entities');
            expect(parsed.filePattern).toBe('**/.*.json');
        });
    });
});
