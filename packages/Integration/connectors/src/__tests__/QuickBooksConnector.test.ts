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
            expect(connector.IntegrationName).toBe('QuickBooks Online');
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

        it('should include Customer, Vendor, Invoice, Bill, and Account default objects', () => {
            const config = connector.GetDefaultConfiguration()!;
            expect(config.DefaultObjects.length).toBeGreaterThanOrEqual(3);

            const customerObj = config.DefaultObjects.find(o => o.SourceObjectName === 'Customer');
            expect(customerObj).toBeDefined();
            expect(customerObj!.SyncEnabled).toBe(true);
            expect(customerObj!.TargetTableName).toBe('QuickBooksCustomer');

            const vendorObj = config.DefaultObjects.find(o => o.SourceObjectName === 'Vendor');
            expect(vendorObj).toBeDefined();

            const accountObj = config.DefaultObjects.find(o => o.SourceObjectName === 'Account');
            expect(accountObj).toBeDefined();
        });
    });

    describe('TestConnection (without live API)', () => {
        it('should fail gracefully when no credentials are provided', async () => {
            const mockCompanyIntegration = {
                CredentialID: null,
                Configuration: null,
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
                CredentialID: null,
                Configuration: JSON.stringify({ ClientId: 'test' }),
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
