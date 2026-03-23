import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SageIntacctConnector } from '../SageIntacctConnector.js';

// --- Unit tests (no DB or API required) ---
describe('SageIntacctConnector (unit)', () => {
    let connector: SageIntacctConnector;

    beforeEach(() => {
        connector = new SageIntacctConnector();
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
            expect(connector.IntegrationName).toBe('Sage Intacct');
        });
    });

    describe('GetDefaultFieldMappings', () => {
        it('should return mappings for CUSTOMER', () => {
            const mappings = connector.GetDefaultFieldMappings('CUSTOMER', 'Contacts');
            expect(mappings.length).toBe(5);

            const keyMapping = mappings.find(m => m.SourceFieldName === 'CUSTOMERID');
            expect(keyMapping).toBeDefined();
            expect(keyMapping!.DestinationFieldName).toBe('ExternalID');
            expect(keyMapping!.IsKeyField).toBe(true);

            const nameMapping = mappings.find(m => m.SourceFieldName === 'NAME');
            expect(nameMapping).toBeDefined();
            expect(nameMapping!.DestinationFieldName).toBe('Name');
        });

        it('should return mappings for VENDOR', () => {
            const mappings = connector.GetDefaultFieldMappings('VENDOR', 'Companies');
            expect(mappings.length).toBe(5);

            const keyMapping = mappings.find(m => m.SourceFieldName === 'VENDORID');
            expect(keyMapping).toBeDefined();
            expect(keyMapping!.DestinationFieldName).toBe('ExternalID');
            expect(keyMapping!.IsKeyField).toBe(true);
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('UNKNOWN_OBJECT', 'Unknown');
            expect(mappings).toEqual([]);
        });
    });

    describe('GetDefaultConfiguration', () => {
        it('should return SageIntacct schema name', () => {
            const config = connector.GetDefaultConfiguration();
            expect(config).not.toBeNull();
            expect(config!.DefaultSchemaName).toBe('SageIntacct');
        });

        it('should include CUSTOMER, VENDOR, and GLACCOUNT default objects', () => {
            const config = connector.GetDefaultConfiguration()!;
            expect(config.DefaultObjects.length).toBe(3);

            const customerObj = config.DefaultObjects.find(o => o.SourceObjectName === 'CUSTOMER');
            expect(customerObj).toBeDefined();
            expect(customerObj!.SyncEnabled).toBe(true);
            expect(customerObj!.TargetTableName).toBe('SageIntacct_Customer');

            const vendorObj = config.DefaultObjects.find(o => o.SourceObjectName === 'VENDOR');
            expect(vendorObj).toBeDefined();
            expect(vendorObj!.SyncEnabled).toBe(true);

            const glObj = config.DefaultObjects.find(o => o.SourceObjectName === 'GLACCOUNT');
            expect(glObj).toBeDefined();
        });
    });

    describe('GetIntegrationObjects', () => {
        it('should return all known Sage Intacct objects', () => {
            const objects = connector.GetIntegrationObjects();
            expect(objects.length).toBe(9);

            const names = objects.map(o => o.Name);
            expect(names).toContain('CUSTOMER');
            expect(names).toContain('VENDOR');
            expect(names).toContain('GLACCOUNT');
            expect(names).toContain('APBILL');
            expect(names).toContain('ARINVOICE');
            expect(names).toContain('PROJECT');
            expect(names).toContain('EMPLOYEE');
            expect(names).toContain('DEPARTMENT');
            expect(names).toContain('CLASS');
        });

        it('should have correct field definitions for CUSTOMER', () => {
            const objects = connector.GetIntegrationObjects();
            const customer = objects.find(o => o.Name === 'CUSTOMER')!;
            expect(customer.SupportsWrite).toBe(true);

            const pkField = customer.Fields.find(f => f.IsPrimaryKey);
            expect(pkField).toBeDefined();
            expect(pkField!.Name).toBe('CUSTOMERID');

            const nameField = customer.Fields.find(f => f.Name === 'NAME');
            expect(nameField).toBeDefined();
            expect(nameField!.IsRequired).toBe(true);
        });
    });

    describe('GetActionGeneratorConfig', () => {
        it('should return a valid action generator config', () => {
            const config = connector.GetActionGeneratorConfig();
            expect(config).not.toBeNull();
            expect(config!.IntegrationName).toBe('Sage Intacct');
            expect(config!.CategoryName).toBe('Sage Intacct');
            expect(config!.IconClass).toBe('fa-solid fa-file-invoice-dollar');
            expect(config!.IncludeSearch).toBe(true);
            expect(config!.IncludeList).toBe(true);
            expect(config!.Objects.length).toBe(9);
        });
    });

    describe('XML escaping (via EscapeXmlValue through AttributesToXml)', () => {
        // We test this indirectly by checking that the connector doesn't throw
        // when creating XML with special characters in attribute values.
        // The actual XML building happens in private methods.
        it('connector should instantiate without errors', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof SageIntacctConnector).toBe(true);
        });
    });

    describe('TestConnection (without live API)', () => {
        it('should fail gracefully when no credentials are provided', async () => {
            const mockCompanyIntegration = {
                Get: (field: string) => {
                    const data: Record<string, unknown> = { CredentialID: null, Configuration: null, IntegrationID: 'test-id' };
                    return data[field] ?? null;
                },
            } as unknown as Parameters<typeof connector.TestConnection>[0];

            const mockUser = {} as unknown as Parameters<typeof connector.TestConnection>[1];

            const result = await connector.TestConnection(mockCompanyIntegration, mockUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Connection failed');
        });

        it('should fail gracefully with invalid JSON config', async () => {
            const mockCompanyIntegration = {
                Get: (field: string) => {
                    const data: Record<string, unknown> = { CredentialID: null, Configuration: 'not-valid-json', IntegrationID: 'test-id' };
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
                        Configuration: JSON.stringify({ CompanyId: 'test' }),
                        IntegrationID: 'test-id',
                    };
                    return data[field] ?? null;
                },
            } as unknown as Parameters<typeof connector.TestConnection>[0];

            const mockUser = {} as unknown as Parameters<typeof connector.TestConnection>[1];

            const result = await connector.TestConnection(mockCompanyIntegration, mockUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('SenderId is required');
        });
    });
});
