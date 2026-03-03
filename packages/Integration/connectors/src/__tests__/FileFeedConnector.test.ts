import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { FileFeedConnector, parseCsvLine } from '../FileFeedConnector.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { FetchContext } from '@memberjunction/integration-engine';

const CSV_PATH = path.resolve(
    import.meta.dirname,
    '../../test-fixtures/sample-contacts.csv'
);

const MOCK_CONFIG = JSON.stringify({
    storagePath: CSV_PATH,
    fileType: 'csv',
});

function makeCI(config: string): MJCompanyIntegrationEntity {
    return { Configuration: config } as unknown as MJCompanyIntegrationEntity;
}

const contextUser = {} as UserInfo;

describe('FileFeedConnector', () => {
    const connector = new FileFeedConnector();

    describe('TestConnection', () => {
        it('should succeed when file exists', async () => {
            const result = await connector.TestConnection(makeCI(MOCK_CONFIG), contextUser);
            expect(result.Success).toBe(true);
            expect(result.Message).toContain('File exists');
        });

        it('should fail when file does not exist', async () => {
            const badConfig = JSON.stringify({
                storagePath: '/nonexistent/file.csv',
                fileType: 'csv',
            });
            const result = await connector.TestConnection(makeCI(badConfig), contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('File not found');
        });
    });

    describe('DiscoverObjects', () => {
        it('should return the file name as the single object', async () => {
            const objects = await connector.DiscoverObjects(makeCI(MOCK_CONFIG), contextUser);
            expect(objects.length).toBe(1);
            expect(objects[0].Name).toBe('sample-contacts.csv');
            expect(objects[0].SupportsIncrementalSync).toBe(false);
        });
    });

    describe('DiscoverFields', () => {
        it('should return correct CSV headers', async () => {
            const fields = await connector.DiscoverFields(
                makeCI(MOCK_CONFIG),
                'sample-contacts.csv',
                contextUser
            );
            const names = fields.map((f) => f.Name);
            expect(names).toContain('first_name');
            expect(names).toContain('last_name');
            expect(names).toContain('email');
            expect(names).toContain('phone');
            expect(names).toContain('company');
            expect(fields.length).toBe(5);
        });
    });

    describe('FetchChanges', () => {
        it('should return 100 records from the sample CSV', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'sample-contacts.csv',
                WatermarkValue: null,
                BatchSize: 200,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(100);
            expect(result.HasMore).toBe(false);

            // Verify record structure
            const record = result.Records[0];
            expect(record.ExternalID).toBe('1');
            expect(record.ObjectType).toBe('sample-contacts.csv');
            expect(record.Fields['first_name']).toBeDefined();
            expect(record.Fields['email']).toBeDefined();
            expect(record.IsDeleted).toBe(false);
        });

        it('should ignore watermark value (always full load)', async () => {
            const ctx: FetchContext = {
                CompanyIntegration: makeCI(MOCK_CONFIG),
                ObjectName: 'sample-contacts.csv',
                WatermarkValue: '2099-01-01',
                BatchSize: 200,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records.length).toBe(100);
        });
    });
});

describe('parseCsvLine', () => {
    it('should parse simple comma-separated values', () => {
        expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('should handle quoted fields with commas', () => {
        expect(parseCsvLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c']);
    });

    it('should handle escaped quotes inside quoted fields', () => {
        expect(parseCsvLine('"say ""hello""",b')).toEqual(['say "hello"', 'b']);
    });

    it('should handle empty values', () => {
        expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
    });

    it('should trim whitespace from unquoted fields', () => {
        expect(parseCsvLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });
});
