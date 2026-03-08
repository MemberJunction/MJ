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

    describe('DiscoverObjects', () => {
        it('should return standard CRM objects', async () => {
            const connector = new HubSpotConnector();
            // DiscoverObjects doesn't need real auth — returns hardcoded object list
            const objects = await connector.DiscoverObjects(
                {} as Parameters<typeof connector.DiscoverObjects>[0],
                {} as Parameters<typeof connector.DiscoverObjects>[1]
            );
            const names = objects.map(o => o.Name);
            expect(names).toContain('contacts');
            expect(names).toContain('companies');
            expect(names).toContain('deals');
            expect(names).toContain('tickets');
            expect(names).toContain('products');
            expect(names).toContain('line_items');
            expect(names).toContain('quotes');
            expect(names).toContain('calls');
            expect(names).toContain('emails');
            expect(names).toContain('notes');
            expect(names).toContain('tasks');
            expect(names).toContain('meetings');
            expect(names).toContain('feedback_submissions');
            expect(objects.length).toBe(13);

            const contacts = objects.find(o => o.Name === 'contacts')!;
            expect(contacts.Label).toBe('Contacts');
            expect(contacts.SupportsIncrementalSync).toBe(true);
            expect(contacts.SupportsWrite).toBe(false);

            const products = objects.find(o => o.Name === 'products')!;
            expect(products.SupportsIncrementalSync).toBe(false);
        });
    });
});
