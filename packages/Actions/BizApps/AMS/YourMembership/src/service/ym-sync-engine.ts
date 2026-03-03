import { DatabaseProviderBase, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { YM_ENDPOINT_REGISTRY, type YMEndpointConfig, type YMEndpointName } from '../types/ym-endpoint-config';
import type { YMSyncOptions, YMSyncResult, YMEndpointSyncResult } from '../types/ym-sync-types';
import { YMSchemaManager } from './ym-schema-manager';

/** YourMembership REST API base URL */
const YM_API_BASE = 'https://ws.yourmembership.com';

/**
 * Orchestrates the YM data sync across all configured endpoints.
 *
 * For each endpoint it:
 * 1. Authenticates via session (POST /Ams/Authenticate)
 * 2. Fetches all data via the YM API (paginated)
 * 3. Ensures the target SQL table exists (creates/alters as needed)
 * 4. Upserts records into the table
 */
export class YMSyncEngine {
    private clientId: string;
    private apiKey: string;
    private apiPassword: string;
    private schemaManager: YMSchemaManager;
    private sessionId: string | null = null;
    private sessionCreatedAt = 0;

    constructor(
        clientId: string,
        apiKey: string,
        apiPassword: string,
        schemaName: string,
        contextUser: UserInfo,
        dbProvider: DatabaseProviderBase
    ) {
        this.clientId = clientId;
        this.apiKey = apiKey;
        this.apiPassword = apiPassword;
        this.schemaManager = new YMSchemaManager(schemaName, contextUser, dbProvider);
    }

    /**
     * Runs the sync across specified (or all) endpoints.
     */
    public async RunSync(options: YMSyncOptions): Promise<YMSyncResult> {
        const startTime = Date.now();

        // Authenticate before starting
        await this.ensureSession();
        await this.schemaManager.EnsureSchemaExists();

        const endpointNames = options.Endpoints.length > 0
            ? options.Endpoints
            : Object.keys(YM_ENDPOINT_REGISTRY) as YMEndpointName[];

        const endpointResults: YMEndpointSyncResult[] = [];

        for (const endpointName of endpointNames) {
            const config = YM_ENDPOINT_REGISTRY[endpointName];
            if (!config) {
                endpointResults.push({
                    EndpointName: endpointName,
                    TableName: '',
                    RecordsFetched: 0,
                    RecordsInserted: 0,
                    RecordsUpdated: 0,
                    Errors: [`Unknown endpoint: ${endpointName}`],
                    DurationMs: 0,
                });
                continue;
            }

            const result = await this.syncEndpoint(endpointName, config, options);
            endpointResults.push(result);
        }

        return this.buildSyncResult(endpointResults, startTime);
    }

    // ─── Session management ──────────────────────────────────────

    private async ensureSession(): Promise<string> {
        const SESSION_TTL_MS = 14 * 60 * 1000;
        if (this.sessionId && (Date.now() - this.sessionCreatedAt) < SESSION_TTL_MS) {
            return this.sessionId;
        }
        return this.createSession();
    }

    private async createSession(): Promise<string> {
        LogStatus(`YM Sync Auth: Creating session for client ${this.clientId}`);

        const response = await fetch(`${YM_API_BASE}/Ams/Authenticate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                provider: 'credentials',
                UserName: this.apiKey,
                Password: this.apiPassword,
                UserType: 'Admin',
                ClientID: Number(this.clientId),
            }),
        });

        if (!response.ok) {
            throw new Error(`YM Auth failed: ${response.status} ${response.statusText}`);
        }

        const json = await response.json() as {
            SessionId?: string;
            ResponseStatus?: { ErrorCode?: string; Message?: string };
        };

        if (json.ResponseStatus?.ErrorCode) {
            throw new Error(
                `YM Auth error: ${json.ResponseStatus.Message ?? json.ResponseStatus.ErrorCode}`
            );
        }

        if (!json.SessionId) {
            throw new Error('YM Auth: No SessionId returned');
        }

        this.sessionId = json.SessionId;
        this.sessionCreatedAt = Date.now();
        LogStatus(`YM Sync Auth: Session created for client ${this.clientId}`);
        return this.sessionId;
    }

    // ─── Endpoint sync ───────────────────────────────────────────

    private async syncEndpoint(
        endpointName: string,
        config: YMEndpointConfig,
        options: YMSyncOptions
    ): Promise<YMEndpointSyncResult> {
        const endpointStart = Date.now();
        const errors: string[] = [];
        let recordsFetched = 0;
        let recordsInserted = 0;
        let recordsUpdated = 0;

        try {
            LogStatus(`YM Sync: Fetching ${endpointName}...`);

            const records = await this.fetchAllPages(config, options.MaxRecordsPerEndpoint);
            recordsFetched = records.length;

            if (records.length === 0) {
                LogStatus(`YM Sync: No records found for ${endpointName}`);
                return this.buildEndpointResult(endpointName, config, 0, 0, 0, [], endpointStart);
            }

            if (options.FullRefresh) {
                await this.schemaManager.TruncateTable(config.TargetTable);
            }

            await this.schemaManager.EnsureTableExists(
                config.TargetTable,
                records[0]
            );

            const upsertResult = await this.schemaManager.UpsertRecords(
                config.TargetTable,
                records,
                config.PKFields
            );
            recordsInserted = upsertResult.Inserted;
            recordsUpdated = upsertResult.Updated;

            LogStatus(
                `YM Sync: ${endpointName} complete — ${recordsFetched} fetched, ` +
                `${recordsInserted} inserted, ${recordsUpdated} updated`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(message);
            LogError(`YM Sync: Error syncing ${endpointName}: ${message}`);
        }

        return this.buildEndpointResult(
            endpointName, config, recordsFetched, recordsInserted, recordsUpdated, errors, endpointStart
        );
    }

    // ─── Data fetching ───────────────────────────────────────────

    private async fetchAllPages(
        config: YMEndpointConfig,
        maxRecords: number
    ): Promise<Record<string, unknown>[]> {
        const results: Record<string, unknown>[] = [];
        let pageNumber = 1;
        const pageSize = config.DefaultPageSize;
        let hasMore = true;

        const baseUrl = `${YM_API_BASE}/Ams/${this.clientId}`;

        while (hasMore) {
            const extraParams = config.DefaultQueryParams
                ? Object.entries(config.DefaultQueryParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
                : '';

            let url: string;
            if (config.SupportsPagination) {
                const paginationParams = `PageSize=${pageSize}&PageNumber=${pageNumber}`;
                url = extraParams
                    ? `${baseUrl}/${config.Path}?${paginationParams}&${extraParams}`
                    : `${baseUrl}/${config.Path}?${paginationParams}`;
            } else {
                url = extraParams
                    ? `${baseUrl}/${config.Path}?${extraParams}`
                    : `${baseUrl}/${config.Path}`;
            }

            LogStatus(`YM Sync: GET ${url}`);
            const response = await this.fetchWithSession(url);

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '(no body)');
                throw new Error(
                    `YM API error for ${config.Path}: ${response.status} ${response.statusText} — ${errorBody}`
                );
            }

            const json = await response.json() as Record<string, unknown>;

            if (this.hasApiError(json)) {
                const rs = json.ResponseStatus as { Message?: string; ErrorCode?: string };
                throw new Error(
                    `YM API error for ${config.Path}: ${rs.Message ?? rs.ErrorCode}`
                );
            }

            const page = this.extractDataFromResponse(json, config.ResponseDataKey);
            if (page.length === 0) {
                hasMore = false;
                break;
            }

            results.push(...page);

            if (!config.SupportsPagination || page.length < pageSize) {
                hasMore = false;
            } else {
                pageNumber++;
            }

            if (maxRecords > 0 && results.length >= maxRecords) {
                return results.slice(0, maxRecords);
            }
        }

        return results;
    }

    /**
     * Fetches a URL with session auth, retrying once on 401.
     */
    private async fetchWithSession(url: string): Promise<Response> {
        const sessionId = await this.ensureSession();
        let response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-SS-ID': sessionId,
                'Accept': 'application/json',
            },
        });

        if (response.status === 401) {
            this.sessionId = null;
            const newSessionId = await this.ensureSession();
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-SS-ID': newSessionId,
                    'Accept': 'application/json',
                },
            });
        }

        return response;
    }

    private hasApiError(json: Record<string, unknown>): boolean {
        const rs = json.ResponseStatus as { ErrorCode?: string } | undefined;
        return !!rs?.ErrorCode;
    }

    /**
     * Extracts the data array from the YM response using the configured key.
     * YM returns data in named properties (e.g., Members, Events), not a generic 'Result'.
     */
    private extractDataFromResponse(
        json: Record<string, unknown>,
        dataKey: string | null
    ): Record<string, unknown>[] {
        if (!dataKey) {
            // No data key — treat the whole response as a single record
            return [json];
        }

        const data = json[dataKey];
        if (Array.isArray(data)) {
            return data as Record<string, unknown>[];
        }

        // If the key exists but isn't an array, try it as a single object
        if (data && typeof data === 'object') {
            return [data as Record<string, unknown>];
        }

        return [];
    }

    // ─── Result building ─────────────────────────────────────────

    private buildEndpointResult(
        endpointName: string,
        config: YMEndpointConfig,
        fetched: number,
        inserted: number,
        updated: number,
        errors: string[],
        startTime: number
    ): YMEndpointSyncResult {
        return {
            EndpointName: endpointName,
            TableName: config.TargetTable,
            RecordsFetched: fetched,
            RecordsInserted: inserted,
            RecordsUpdated: updated,
            Errors: errors,
            DurationMs: Date.now() - startTime,
        };
    }

    private buildSyncResult(
        endpointResults: YMEndpointSyncResult[],
        startTime: number
    ): YMSyncResult {
        const totalRecordsSynced = endpointResults.reduce((sum, r) => sum + r.RecordsFetched, 0);
        const totalErrors = endpointResults.reduce((sum, r) => sum + r.Errors.length, 0);

        return {
            Success: totalErrors === 0,
            EndpointResults: endpointResults,
            TotalRecordsSynced: totalRecordsSynced,
            TotalErrors: totalErrors,
            DurationMs: Date.now() - startTime,
        };
    }
}
