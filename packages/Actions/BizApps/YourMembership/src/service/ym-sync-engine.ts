import { DatabaseProviderBase, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { BaseYMAction } from '../base/base-ym-action';
import { YM_ENDPOINT_REGISTRY, type YMEndpointConfig, type YMEndpointName } from '../types/ym-endpoint-config';
import type { YMSyncOptions, YMSyncResult, YMEndpointSyncResult } from '../types/ym-sync-types';
import { YMSchemaManager } from './ym-schema-manager';

/**
 * Orchestrates the YM data sync across all configured endpoints.
 * This is a service class (not an Action) — called by YMSyncAction.
 *
 * For each endpoint it:
 * 1. Fetches all data via the YM API (paginated)
 * 2. Ensures the target SQL table exists (creates/alters as needed)
 * 3. Upserts records into the table
 */
export class YMSyncEngine {
    private clientId: string;
    private apiKey: string;
    private schemaManager: YMSchemaManager;

    /**
     * We need a BaseYMAction instance to use its HTTP methods.
     * The caller (YMSyncAction) passes itself in.
     */
    private actionInstance: BaseYMAction;

    constructor(
        clientId: string,
        apiKey: string,
        schemaName: string,
        contextUser: UserInfo,
        dbProvider: DatabaseProviderBase,
        actionInstance: BaseYMAction
    ) {
        this.clientId = clientId;
        this.apiKey = apiKey;
        this.schemaManager = new YMSchemaManager(schemaName, contextUser, dbProvider);
        this.actionInstance = actionInstance;
    }

    /**
     * Runs the sync across specified (or all) endpoints.
     */
    public async RunSync(options: YMSyncOptions): Promise<YMSyncResult> {
        const startTime = Date.now();

        // Ensure the schema exists first
        await this.schemaManager.EnsureSchemaExists();

        // Determine which endpoints to sync
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

    /**
     * Syncs a single endpoint.
     */
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

            // Fetch data from YM API
            const records = await this.fetchEndpointData(config, options.MaxRecordsPerEndpoint);
            recordsFetched = records.length;

            if (records.length === 0) {
                LogStatus(`YM Sync: No records found for ${endpointName}`);
                return {
                    EndpointName: endpointName,
                    TableName: config.TargetTable,
                    RecordsFetched: 0,
                    RecordsInserted: 0,
                    RecordsUpdated: 0,
                    Errors: [],
                    DurationMs: Date.now() - endpointStart,
                };
            }

            // Truncate if full refresh
            if (options.FullRefresh) {
                await this.schemaManager.TruncateTable(config.TargetTable);
            }

            // Ensure table exists with correct columns
            await this.schemaManager.EnsureTableExists(
                config.TargetTable,
                records[0],
                config.PKFields[0]
            );

            // Upsert records
            const upsertResult = await this.schemaManager.UpsertRecords(
                config.TargetTable,
                records,
                config.PKFields[0]
            );
            recordsInserted = upsertResult.Inserted;
            recordsUpdated = upsertResult.Updated;

            LogStatus(`YM Sync: ${endpointName} complete — ${recordsFetched} fetched, ${recordsInserted} inserted, ${recordsUpdated} updated`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(message);
            LogError(`YM Sync: Error syncing ${endpointName}: ${message}`);
        }

        return {
            EndpointName: endpointName,
            TableName: config.TargetTable,
            RecordsFetched: recordsFetched,
            RecordsInserted: recordsInserted,
            RecordsUpdated: recordsUpdated,
            Errors: errors,
            DurationMs: Date.now() - endpointStart,
        };
    }

    /**
     * Fetches all data from a YM endpoint using pagination.
     * Uses the action instance's MakeYMPaginatedRequest method.
     */
    private async fetchEndpointData(
        config: YMEndpointConfig,
        maxRecords: number
    ): Promise<Record<string, unknown>[]> {
        // We use the protected MakeYMPaginatedRequest via a public bridge
        // Since YMSyncEngine isn't a BaseYMAction subclass, the caller
        // (YMSyncAction) fetches data and passes it to the engine.
        // However, for simplicity, we use fetch directly here.
        return this.fetchAllPages(config, maxRecords);
    }

    /**
     * Direct HTTP pagination for the sync engine (avoids needing BaseYMAction inheritance).
     */
    private async fetchAllPages(
        config: YMEndpointConfig,
        maxRecords: number
    ): Promise<Record<string, unknown>[]> {
        const results: Record<string, unknown>[] = [];
        let offset = 0;
        const pageSize = config.DefaultPageSize;
        let hasMore = true;

        const authToken = Buffer.from(`${this.apiKey}:${this.apiKey}`).toString('base64');
        const baseUrl = `https://ws.yourmembership.com/Ams/${this.clientId}`;

        while (hasMore) {
            const url = config.SupportsPagination
                ? `${baseUrl}/${config.Path}.json?MaxRows=${pageSize}&Offset=${offset}`
                : `${baseUrl}/${config.Path}.json`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${authToken}`,
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`YM API error for ${config.Path}: ${response.status} ${response.statusText}`);
            }

            const json = await response.json() as { ResponseStatus?: { ErrorCode?: string; Message?: string }; Result?: Record<string, unknown>[] };

            if (json.ResponseStatus?.ErrorCode) {
                throw new Error(`YM API error for ${config.Path}: ${json.ResponseStatus.Message ?? json.ResponseStatus.ErrorCode}`);
            }

            const page = json.Result;
            if (!page || !Array.isArray(page) || page.length === 0) {
                hasMore = false;
                break;
            }

            results.push(...page);

            // Stop conditions
            if (!config.SupportsPagination || page.length < pageSize) {
                hasMore = false;
            } else {
                offset += pageSize;
            }

            if (maxRecords > 0 && results.length >= maxRecords) {
                return results.slice(0, maxRecords);
            }
        }

        return results;
    }

    /**
     * Builds the final sync result summary.
     */
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
