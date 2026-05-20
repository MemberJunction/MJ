import { describe, it, expect, beforeEach } from 'vitest';
import { QuickBooksConnector } from '../QuickBooksConnector.js';

// --- Unit tests (no DB or API required) ---
describe('QuickBooksConnector (unit)', () => {
    let connector: QuickBooksConnector;

    beforeEach(() => {
        connector = new QuickBooksConnector();
    });

    describe('Capability Getters', () => {
        it('should support all CRUD operations', () => {
            expect(connector.SupportsGet).toBe(true);
            expect(connector.SupportsCreate).toBe(true);
            expect(connector.SupportsUpdate).toBe(true);
            expect(connector.SupportsDelete).toBe(true);
            expect(connector.SupportsSearch).toBe(true);
            expect(connector.SupportsListing).toBe(true);
        });

        it('should return correct integration name', () => {
            expect(connector.IntegrationName).toBe('QuickBooks');
        });
    });

    describe('GetDefaultFieldMappings', () => {
        it('should return mappings for Customer', () => {
            const mappings = connector.GetDefaultFieldMappings('Customer', 'Contacts');
            expect(mappings.length).toBe(5);

            const keyMapping = mappings.find(m => m.SourceFieldName === 'Id');
            expect(keyMapping).toBeDefined();
            expect(keyMapping!.DestinationFieldName).toBe('ExternalID');
            expect(keyMapping!.IsKeyField).toBe(true);

            const nameMapping = mappings.find(m => m.SourceFieldName === 'DisplayName');
            expect(nameMapping).toBeDefined();
            expect(nameMapping!.DestinationFieldName).toBe('Name');
        });

        it('should return mappings for Vendor', () => {
            const mappings = connector.GetDefaultFieldMappings('Vendor', 'Companies');
            expect(mappings.length).toBe(5);

            const keyMapping = mappings.find(m => m.SourceFieldName === 'Id');
            expect(keyMapping).toBeDefined();
            expect(keyMapping!.DestinationFieldName).toBe('ExternalID');
            expect(keyMapping!.IsKeyField).toBe(true);
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('UnknownObject', 'Unknown');
            expect(mappings).toEqual([]);
        });
    });

    describe('GetDefaultConfiguration', () => {
        it('should return QuickBooks schema name', () => {
            const config = connector.GetDefaultConfiguration();
            expect(config).not.toBeNull();
            expect(config!.DefaultSchemaName).toBe('QuickBooks');
        });

        it('should include Customer, Vendor, and Account default objects', () => {
            const config = connector.GetDefaultConfiguration()!;
            expect(config.DefaultObjects.length).toBe(3);

            const customerObj = config.DefaultObjects.find(o => o.SourceObjectName === 'Customer');
            expect(customerObj).toBeDefined();
            expect(customerObj!.SyncEnabled).toBe(true);
            expect(customerObj!.TargetTableName).toBe('QuickBooks_Customer');

            const vendorObj = config.DefaultObjects.find(o => o.SourceObjectName === 'Vendor');
            expect(vendorObj).toBeDefined();

            const accountObj = config.DefaultObjects.find(o => o.SourceObjectName === 'Account');
            expect(accountObj).toBeDefined();
        });
    });

    describe('GetIntegrationObjects', () => {
        it('should return all known QuickBooks objects', () => {
            const objects = connector.GetIntegrationObjects();
            expect(objects.length).toBe(10);

            const names = objects.map(o => o.Name);
            expect(names).toContain('Customer');
            expect(names).toContain('Vendor');
            expect(names).toContain('Account');
            expect(names).toContain('Invoice');
            expect(names).toContain('Bill');
            expect(names).toContain('Item');
            expect(names).toContain('Payment');
            expect(names).toContain('Employee');
            expect(names).toContain('Department');
            expect(names).toContain('Class');
        });

        it('should have correct field definitions for Customer', () => {
            const objects = connector.GetIntegrationObjects();
            const customer = objects.find(o => o.Name === 'Customer')!;
            expect(customer.SupportsWrite).toBe(true);

            const pkField = customer.Fields.find(f => f.IsPrimaryKey);
            expect(pkField).toBeDefined();
            expect(pkField!.Name).toBe('Id');

            const nameField = customer.Fields.find(f => f.Name === 'DisplayName');
            expect(nameField).toBeDefined();
            expect(nameField!.IsRequired).toBe(true);
        });

        it('should have Invoice with CustomerRef as required', () => {
            const objects = connector.GetIntegrationObjects();
            const invoice = objects.find(o => o.Name === 'Invoice')!;
            const custRef = invoice.Fields.find(f => f.Name === 'CustomerRef');
            expect(custRef).toBeDefined();
            expect(custRef!.IsRequired).toBe(true);
        });
    });

    describe('GetActionGeneratorConfig', () => {
        it('should return a valid action generator config', () => {
            const config = connector.GetActionGeneratorConfig();
            expect(config).not.toBeNull();
            expect(config!.IntegrationName).toBe('QuickBooks');
            expect(config!.CategoryName).toBe('QuickBooks');
            expect(config!.IconClass).toBe('fa-solid fa-book');
            expect(config!.IncludeSearch).toBe(true);
            expect(config!.IncludeList).toBe(true);
            expect(config!.Objects.length).toBe(10);
        });
    });

    describe('DiscoverObjects (static, no API)', () => {
        it('should return known objects without needing API', async () => {
            const mockCI = {} as Parameters<typeof connector.DiscoverObjects>[0];
            const mockUser = {} as Parameters<typeof connector.DiscoverObjects>[1];
            const objects = await connector.DiscoverObjects(mockCI, mockUser);
            expect(objects.length).toBe(10);
            expect(objects[0].Name).toBe('Customer');
            expect(objects[0].SupportsWrite).toBe(true);
        });
    });

    describe('DiscoverFields (static, no API)', () => {
        it('should return fields for known objects', async () => {
            const mockCI = {} as Parameters<typeof connector.DiscoverFields>[0];
            const mockUser = {} as Parameters<typeof connector.DiscoverFields>[2];
            const fields = await connector.DiscoverFields(mockCI, 'Customer', mockUser);
            expect(fields.length).toBeGreaterThan(0);

            const idField = fields.find(f => f.Name === 'Id');
            expect(idField).toBeDefined();
            expect(idField!.IsUniqueKey).toBe(true);
            expect(idField!.IsReadOnly).toBe(true);
        });

        it('should throw for unknown objects', async () => {
            const mockCI = {} as Parameters<typeof connector.DiscoverFields>[0];
            const mockUser = {} as Parameters<typeof connector.DiscoverFields>[2];
            await expect(connector.DiscoverFields(mockCI, 'BogusObject', mockUser))
                .rejects.toThrow('Unknown QuickBooks object');
        });
    });

    describe('TestConnection (without live API)', () => {
        it('should fail gracefully when no credentials are provided', async () => {
            const mockCompanyIntegration = {
                Get: (field: string) => {
                    const data: Record<string, unknown> = { CredentialID: null, Configuration: null };
                    return data[field] ?? null;
                },
            } as unknown as Parameters<typeof connector.TestConnection>[0];

            const mockUser = {} as unknown as Parameters<typeof connector.TestConnection>[1];

            const result = await connector.TestConnection(mockCompanyIntegration, mockUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Connection failed');
        });

        it('should fail gracefully with missing required fields', async () => {
            const mockCompanyIntegration = {
                Get: (field: string) => {
                    const data: Record<string, unknown> = {
                        CredentialID: null,
                        Configuration: JSON.stringify({ ClientId: 'test' }),
                    };
                    return data[field] ?? null;
                },
            } as unknown as Parameters<typeof connector.TestConnection>[0];

            const mockUser = {} as unknown as Parameters<typeof connector.TestConnection>[1];

            const result = await connector.TestConnection(mockCompanyIntegration, mockUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('ClientSecret is required');
        });
    });
});
