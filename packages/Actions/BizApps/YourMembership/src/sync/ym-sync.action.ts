import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { DatabaseProviderBase, Metadata } from '@memberjunction/core';
import { BaseYMAction } from '../base/base-ym-action';
import { YMSyncEngine } from '../service/ym-sync-engine';
import type { YMEndpointName } from '../types/ym-endpoint-config';

/**
 * Layer 2: Full YourMembership data sync action.
 *
 * Takes a schema name, YM client ID, and API key, then dumps data from
 * all (or selected) YM endpoints into SQL tables in the specified schema.
 *
 * Parameters:
 *   ClientID   (required) — YM client/site identifier
 *   APIKey     (required) — YM API key (or set BIZAPPS_YM_{ClientID}_API_KEY env var)
 *   SchemaName (required) — SQL schema to create tables in
 *   Endpoints  (optional) — Comma-separated list of endpoints to sync (empty = all)
 *   FullRefresh(optional) — "true" to truncate tables before syncing
 */
@RegisterClass(BaseAction, 'YMSyncAction')
export class YMSyncAction extends BaseYMAction {
    public get Description(): string {
        return 'Syncs YourMembership data into MJ database tables in the specified schema';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const clientId = this.GetClientID(params.Params);
            const apiKey = this.GetAPIKey(params.Params, clientId);
            const schemaName = this.GetParamValue(params.Params, 'SchemaName');
            const endpointsParam = this.GetParamValue(params.Params, 'Endpoints');
            const fullRefresh = this.GetBooleanParam(params.Params, 'FullRefresh', false);

            if (!schemaName) {
                return this.BuildErrorResult('SchemaName parameter is required', 'MISSING_PARAM');
            }

            if (!params.ContextUser) {
                return this.BuildErrorResult('ContextUser is required for database operations', 'MISSING_CONTEXT');
            }

            // Parse endpoints list
            const endpoints: YMEndpointName[] = endpointsParam
                ? endpointsParam.split(',').map(e => e.trim()) as YMEndpointName[]
                : [];

            // Get the database provider via the Metadata provider (cast to DatabaseProviderBase for ExecuteSQL)
            const dbProvider = Metadata.Provider as DatabaseProviderBase;
            if (!dbProvider) {
                return this.BuildErrorResult('No database provider configured', 'NO_DB_PROVIDER');
            }

            // Run the sync
            const engine = new YMSyncEngine(
                clientId,
                apiKey,
                schemaName,
                params.ContextUser,
                dbProvider,
                this
            );

            const result = await engine.RunSync({
                Endpoints: endpoints,
                FullRefresh: fullRefresh,
                MaxRecordsPerEndpoint: 0,
            });

            // Set output params
            this.SetOutputParam(params, 'SyncResult', result);
            this.SetOutputParam(params, 'TotalRecordsSynced', result.TotalRecordsSynced);
            this.SetOutputParam(params, 'EndpointResults', result.EndpointResults);

            if (result.Success) {
                return this.BuildSuccessResult(
                    `Sync completed: ${result.TotalRecordsSynced} records across ${result.EndpointResults.length} endpoints in ${result.DurationMs}ms`
                );
            } else {
                return this.BuildErrorResult(
                    `Sync completed with ${result.TotalErrors} error(s): ${result.TotalRecordsSynced} records synced`,
                    'SYNC_PARTIAL_FAILURE'
                );
            }
        } catch (error) {
            return this.BuildErrorResult(
                error instanceof Error ? error.message : String(error),
                'SYNC_ERROR'
            );
        }
    }
}
