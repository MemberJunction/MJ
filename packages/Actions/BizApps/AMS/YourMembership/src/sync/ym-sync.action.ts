import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseYMAction } from '../base/base-ym-action';
import { YMSyncEngine } from '../service/ym-sync-engine';
import type { YMEndpointName } from '../types/ym-endpoint-config';

/**
 * Full YourMembership data sync action.
 *
 * Takes a YM client ID and API credentials, then syncs data from
 * all (or selected) YM endpoints into the YourMembership entity tables.
 *
 * Tables and entities must already exist (created by migration + CodeGen).
 * This action only does DML via MJ entity objects — fully provider-agnostic.
 *
 * Parameters:
 *   ClientID    (required) — YM client/site identifier
 *   APIKey      (required) — YM API key (or set BIZAPPS_YM_{ClientID}_API_KEY env var)
 *   APIPassword (required) — YM API password (or set BIZAPPS_YM_{ClientID}_API_PASSWORD env var)
 *   Endpoints   (optional) — Comma-separated list of endpoints to sync (empty = all)
 *   FullRefresh (optional) — "true" to truncate tables before syncing
 */
@RegisterClass(BaseAction, 'YMSyncAction')
export class YMSyncAction extends BaseYMAction {
    public get Description(): string {
        return 'Syncs YourMembership data into the YourMembership entity tables';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const clientId = this.GetClientID(params.Params);
            const apiKey = this.GetAPIKey(params.Params, clientId);
            const apiPassword = this.GetAPIPassword(params.Params, clientId);
            const endpointsParam = this.GetParamValue(params.Params, 'Endpoints');
            const fullRefresh = this.GetBooleanParam(params.Params, 'FullRefresh', false);

            if (!params.ContextUser) {
                return this.BuildErrorResult('ContextUser is required for database operations', 'MISSING_CONTEXT');
            }

            const endpoints: YMEndpointName[] = endpointsParam
                ? endpointsParam.split(',').map(e => e.trim()) as YMEndpointName[]
                : [];

            const engine = new YMSyncEngine(
                clientId,
                apiKey,
                apiPassword,
                params.ContextUser
            );

            const result = await engine.RunSync({
                Endpoints: endpoints,
                FullRefresh: fullRefresh,
                MaxRecordsPerEndpoint: 0,
            });

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
