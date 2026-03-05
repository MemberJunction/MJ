import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext } from '@memberjunction/integration-engine';
import { RelationalDBConnector, type ConnectionConfig } from '../RelationalDBConnector.js';

/**
 * Concrete test subclass that exposes protected methods for testing.
 * Since RelationalDBConnector is abstract, we need a concrete implementation.
 */
class TestRelationalConnector extends RelationalDBConnector {
    public async FetchChanges(ctx: FetchContext) {
        return this.FetchChangesFromTable(ctx, 'id', 'modified_at');
    }

    /** Expose protected ParseConnectionConfig for testing */
    public TestParseConfig(ci: MJCompanyIntegrationEntity): ConnectionConfig {
        return this.ParseConnectionConfig(ci);
    }
}

function createMockCI(config: Record<string, string> | null): MJCompanyIntegrationEntity {
    const configJson = config ? JSON.stringify(config) : null;
    return {
        Get: vi.fn((field: string) => field === 'Configuration' ? configJson : null),
    } as unknown as MJCompanyIntegrationEntity;
}

const contextUser = {} as UserInfo;

describe('RelationalDBConnector', () => {
    let connector: TestRelationalConnector;

    beforeEach(() => {
        connector = new TestRelationalConnector();
    });

    describe('ParseConnectionConfig', () => {
        it('should parse valid configuration JSON', () => {
            const ci = createMockCI({
                server: 'localhost',
                database: 'mydb',
                user: 'admin',
                password: 'secret',
                schema: 'dbo',
            });
            const config = connector.TestParseConfig(ci);
            expect(config.Server).toBe('localhost');
            expect(config.Database).toBe('mydb');
            expect(config.User).toBe('admin');
            expect(config.Password).toBe('secret');
            expect(config.Schema).toBe('dbo');
        });

        it('should default schema to "dbo" when not provided', () => {
            const ci = createMockCI({
                server: 'localhost',
                database: 'mydb',
                user: 'admin',
                password: 'secret',
            });
            const config = connector.TestParseConfig(ci);
            expect(config.Schema).toBe('dbo');
        });

        it('should throw when Configuration is null', () => {
            const ci = createMockCI(null);
            expect(() => connector.TestParseConfig(ci))
                .toThrow('CompanyIntegration.Configuration is null or empty');
        });

        it('should throw when server is missing', () => {
            const ci = createMockCI({
                database: 'mydb',
                user: 'admin',
                password: 'secret',
            });
            expect(() => connector.TestParseConfig(ci))
                .toThrow('Configuration JSON must contain server, database, user, and password');
        });

        it('should throw when database is missing', () => {
            const ci = createMockCI({
                server: 'localhost',
                user: 'admin',
                password: 'secret',
            });
            expect(() => connector.TestParseConfig(ci))
                .toThrow('Configuration JSON must contain server, database, user, and password');
        });

        it('should throw when user is missing', () => {
            const ci = createMockCI({
                server: 'localhost',
                database: 'mydb',
                password: 'secret',
            });
            expect(() => connector.TestParseConfig(ci))
                .toThrow('Configuration JSON must contain server, database, user, and password');
        });

        it('should throw when password is missing', () => {
            const ci = createMockCI({
                server: 'localhost',
                database: 'mydb',
                user: 'admin',
            });
            expect(() => connector.TestParseConfig(ci))
                .toThrow('Configuration JSON must contain server, database, user, and password');
        });

        it('should throw on invalid JSON', () => {
            const ci = {
                Get: vi.fn((field: string) => field === 'Configuration' ? 'not-json' : null),
            } as unknown as MJCompanyIntegrationEntity;
            expect(() => connector.TestParseConfig(ci)).toThrow();
        });

        it('should handle custom schema names', () => {
            const ci = createMockCI({
                server: 'sql-server',
                database: 'integration_db',
                user: 'sa',
                password: 'pass',
                schema: 'hs',
            });
            const config = connector.TestParseConfig(ci);
            expect(config.Schema).toBe('hs');
        });
    });

    describe('BuildExternalRecord', () => {
        it('should build an ExternalRecord from a row', () => {
            // Access protected method via type assertion
            const row: Record<string, unknown> = {
                id: '123',
                name: 'Test',
                email: 'test@test.com',
                modified_at: new Date('2024-01-15T10:00:00Z'),
            };

            const record = (connector as unknown as {
                BuildExternalRecord: (
                    row: Record<string, unknown>,
                    idField: string,
                    objectType: string,
                    modifiedAtField: string,
                    deletedField?: string
                ) => { ExternalID: string; ObjectType: string; Fields: Record<string, unknown>; ModifiedAt?: Date; IsDeleted?: boolean };
            }).BuildExternalRecord(row, 'id', 'contacts', 'modified_at');

            expect(record.ExternalID).toBe('123');
            expect(record.ObjectType).toBe('contacts');
            expect(record.Fields['name']).toBe('Test');
            expect(record.ModifiedAt).toBeInstanceOf(Date);
        });

        it('should handle deleted field', () => {
            const row: Record<string, unknown> = {
                id: '456',
                name: 'Deleted',
                modified_at: new Date(),
                is_deleted: true,
            };

            const record = (connector as unknown as {
                BuildExternalRecord: (
                    row: Record<string, unknown>,
                    idField: string,
                    objectType: string,
                    modifiedAtField: string,
                    deletedField?: string
                ) => { ExternalID: string; ObjectType: string; Fields: Record<string, unknown>; ModifiedAt?: Date; IsDeleted?: boolean };
            }).BuildExternalRecord(row, 'id', 'contacts', 'modified_at', 'is_deleted');

            expect(record.IsDeleted).toBe(true);
        });

        it('should handle non-Date modified_at (string value)', () => {
            const row: Record<string, unknown> = {
                id: '789',
                modified_at: '2024-01-15',
            };

            const record = (connector as unknown as {
                BuildExternalRecord: (
                    row: Record<string, unknown>,
                    idField: string,
                    objectType: string,
                    modifiedAtField: string,
                    deletedField?: string
                ) => { ExternalID: string; ObjectType: string; Fields: Record<string, unknown>; ModifiedAt?: Date; IsDeleted?: boolean };
            }).BuildExternalRecord(row, 'id', 'contacts', 'modified_at');

            // String is not a Date instance, so ModifiedAt should be undefined
            expect(record.ModifiedAt).toBeUndefined();
        });
    });

    describe('TestConnection', () => {
        it('should return failure for unreachable server', async () => {
            const ci = createMockCI({
                server: 'nonexistent-server-12345',
                database: 'mydb',
                user: 'sa',
                password: 'wrong',
            });
            const result = await connector.TestConnection(ci, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Connection failed');
        });

        it('should return failure for missing config', async () => {
            const ci = createMockCI(null);
            const result = await connector.TestConnection(ci, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Configuration');
        });
    });

    describe('CloseAllPools', () => {
        it('should not throw when no pools exist', async () => {
            await expect(connector.CloseAllPools()).resolves.not.toThrow();
        });
    });
});
