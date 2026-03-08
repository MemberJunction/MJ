import { describe, it, expect } from 'vitest';
import { HubSpotConnector } from '../HubSpotConnector.js';

// --- Unit tests (no DB or API required) ---
describe('HubSpotConnector (unit)', () => {
    describe('GetDefaultFieldMappings', () => {
        const connector = new HubSpotConnector();

        it('should return mappings for contacts', () => {
            const mappings = connector.GetDefaultFieldMappings('contacts', 'Contacts');
            expect(mappings.length).toBe(6);

            const emailMapping = mappings.find((m) => m.SourceFieldName === 'email');
            expect(emailMapping).toBeDefined();
            expect(emailMapping!.DestinationFieldName).toBe('Email');
            expect(emailMapping!.IsKeyField).toBe(true);

            const firstNameMapping = mappings.find((m) => m.SourceFieldName === 'firstname');
            expect(firstNameMapping!.DestinationFieldName).toBe('FirstName');
        });

        it('should return mappings for companies', () => {
            const mappings = connector.GetDefaultFieldMappings('companies', 'Companies');
            expect(mappings.length).toBe(5);

            const nameMapping = mappings.find((m) => m.SourceFieldName === 'name');
            expect(nameMapping).toBeDefined();
            expect(nameMapping!.DestinationFieldName).toBe('Name');
            expect(nameMapping!.IsKeyField).toBe(true);
        });

        it('should return mappings for deals', () => {
            const mappings = connector.GetDefaultFieldMappings('deals', 'Deals');
            expect(mappings.length).toBe(5);

            const dealMapping = mappings.find((m) => m.SourceFieldName === 'dealname');
            expect(dealMapping).toBeDefined();
            expect(dealMapping!.DestinationFieldName).toBe('Name');
            expect(dealMapping!.IsKeyField).toBe(true);
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('unknown_object', 'Unknown');
            expect(mappings).toEqual([]);
        });
    });

    describe('MapHubSpotType', () => {
        const connector = new HubSpotConnector();

        it('should map string types correctly', () => {
            expect(connector.MapHubSpotType('string', 'text')).toBe('string');
            expect(connector.MapHubSpotType('string', 'textarea')).toBe('text');
            expect(connector.MapHubSpotType('string', 'html')).toBe('html');
        });

        it('should map numeric and date types', () => {
            expect(connector.MapHubSpotType('number', 'number')).toBe('number');
            expect(connector.MapHubSpotType('date', 'date')).toBe('datetime');
            expect(connector.MapHubSpotType('datetime', 'date')).toBe('datetime');
        });

        it('should map boolean and enum types', () => {
            expect(connector.MapHubSpotType('bool', 'booleancheckbox')).toBe('boolean');
            expect(connector.MapHubSpotType('enumeration', 'select')).toBe('enum');
        });

        it('should pass through unknown types', () => {
            expect(connector.MapHubSpotType('phone_number', 'phonenumber')).toBe('phone_number');
        });
    });

    describe('MapPropertyToField', () => {
        const connector = new HubSpotConnector();

        it('should convert a HubSpot property definition to field schema', () => {
            const result = connector.MapPropertyToField({
                name: 'email',
                label: 'Email',
                type: 'string',
                fieldType: 'text',
                groupName: 'contactinformation',
                description: 'Contact email',
                hasUniqueValue: true,
                calculated: false,
                externalOptions: false,
            });

            expect(result.Name).toBe('email');
            expect(result.Label).toBe('Email');
            expect(result.DataType).toBe('string');
            expect(result.IsUniqueKey).toBe(true);
            expect(result.IsReadOnly).toBe(false);
        });

        it('should mark calculated properties as read-only', () => {
            const result = connector.MapPropertyToField({
                name: 'hs_object_id',
                label: 'Object ID',
                type: 'number',
                fieldType: 'number',
                groupName: 'contactinformation',
                description: '',
                hasUniqueValue: true,
                calculated: true,
                externalOptions: false,
            });

            expect(result.IsReadOnly).toBe(true);
        });
    });

    describe('GetDefaultConfiguration', () => {
        const connector = new HubSpotConnector();

        it('should return HubSpot schema name', () => {
            const config = connector.GetDefaultConfiguration();
            expect(config.DefaultSchemaName).toBe('HubSpot');
        });
    });
});
