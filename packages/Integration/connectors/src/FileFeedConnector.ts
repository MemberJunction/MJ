import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
} from '@memberjunction/integration-engine';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Configuration parsed from CompanyIntegration.Configuration for file feeds */
interface FileFeedConfig {
    /** Absolute or relative path to the data file */
    StoragePath: string;
    /** File type, currently only "csv" is supported */
    FileType: string;
}

/**
 * Connector for file-based data feeds (CSV).
 * Reads data from local CSV files. Always performs a full load (no incremental sync).
 * Supports quoted fields with commas inside and empty values mapped to null.
 */
@RegisterClass(BaseIntegrationConnector, 'FileFeedConnector')
export class FileFeedConnector extends BaseIntegrationConnector {
    /**
     * Tests connectivity by checking that the configured file exists on disk.
     * @param companyIntegration - The entity with Configuration JSON containing storagePath
     * @param _contextUser - User context for authorization
     * @returns Success if the file exists, failure otherwise
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = this.parseConfig(companyIntegration);
            if (!fs.existsSync(config.StoragePath)) {
                return { Success: false, Message: `File not found: ${config.StoragePath}` };
            }
            return { Success: true, Message: `File exists: ${config.StoragePath}` };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Configuration error: ${message}` };
        }
    }

    /**
     * Discovers available objects by returning the file name as the single object.
     * @param companyIntegration - The entity with Configuration JSON
     * @param _contextUser - User context for authorization
     * @returns Array with one entry for the configured file
     */
    public async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const config = this.parseConfig(companyIntegration);
        const fileName = path.basename(config.StoragePath);
        return [
            {
                Name: fileName,
                Label: fileName,
                SupportsIncrementalSync: false,
                SupportsWrite: false,
            },
        ];
    }

    /**
     * Discovers fields by parsing the CSV header row.
     * @param companyIntegration - The entity with Configuration JSON
     * @param _objectName - Object name (file name), not used since we only have one file
     * @param _contextUser - User context for authorization
     * @returns Array of field schemas from the CSV header
     */
    public async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        _objectName: string,
        _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const config = this.parseConfig(companyIntegration);
        const content = fs.readFileSync(config.StoragePath, 'utf-8');
        const firstLine = content.split('\n')[0]?.trim();
        if (!firstLine) {
            return [];
        }

        const headers = parseCsvLine(firstLine);
        return headers.map((header) => ({
            Name: header,
            Label: header,
            DataType: 'string',
            IsRequired: false,
            IsUniqueKey: false,
            IsReadOnly: true,
        }));
    }

    /**
     * Fetches all records from the CSV file as a full load.
     * CSV files do not support incremental sync — watermark is ignored.
     * @param ctx - Fetch context (watermark is always ignored for file feeds)
     * @returns All records from the CSV file in a single batch
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const config = this.parseConfig(ctx.CompanyIntegration);
        const content = fs.readFileSync(config.StoragePath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim().length > 0);

        if (lines.length < 2) {
            return { Records: [], HasMore: false };
        }

        const headers = parseCsvLine(lines[0]);
        const records = this.parseDataLines(lines.slice(1), headers, ctx.ObjectName);
        return { Records: records, HasMore: false };
    }

    /**
     * Parses the Configuration JSON to extract file feed settings.
     * @param companyIntegration - The entity containing Configuration JSON
     * @returns Parsed file feed configuration
     */
    private parseConfig(companyIntegration: MJCompanyIntegrationEntity): FileFeedConfig {
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (!configJson) {
            throw new Error('CompanyIntegration.Configuration is null or empty');
        }

        const parsed = JSON.parse(configJson) as Record<string, string>;
        const storagePath = parsed['storagePath'];
        const fileType = parsed['fileType'] ?? 'csv';

        if (!storagePath) {
            throw new Error('Configuration JSON must contain a storagePath field');
        }

        return { StoragePath: storagePath, FileType: fileType };
    }

    /**
     * Parses an array of CSV data lines into ExternalRecord objects.
     * @param lines - CSV data lines (excluding header)
     * @param headers - Column header names
     * @param objectName - Object type name for the records
     * @returns Array of ExternalRecord objects
     */
    private parseDataLines(
        lines: string[],
        headers: string[],
        objectName: string
    ): ExternalRecord[] {
        return lines.map((line, index) => {
            const values = parseCsvLine(line);
            const fields: Record<string, unknown> = {};

            for (let i = 0; i < headers.length; i++) {
                const rawValue = i < values.length ? values[i] : '';
                fields[headers[i]] = rawValue === '' ? null : rawValue;
            }

            return {
                ExternalID: String(index + 1),
                ObjectType: objectName,
                Fields: fields,
                IsDeleted: false,
            };
        });
    }
}

/**
 * Parses a single CSV line handling quoted fields with commas.
 * Supports:
 * - Unquoted fields separated by commas
 * - Quoted fields that may contain commas
 * - Escaped quotes ("") inside quoted fields
 * @param line - A single CSV line to parse
 * @returns Array of field values
 */
export function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
        const char = line[i];

        if (inQuotes) {
            if (char === '"' && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i += 2;
            } else if (char === '"') {
                inQuotes = false;
                i++;
            } else {
                current += char;
                i++;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
                i++;
            } else if (char === ',') {
                fields.push(current.trim());
                current = '';
                i++;
            } else {
                current += char;
                i++;
            }
        }
    }

    fields.push(current.trim());
    return fields;
}
