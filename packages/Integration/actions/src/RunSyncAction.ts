import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams, ActionParam } from '@memberjunction/actions-base';
import { IntegrationEngine, SyncResult, SyncTriggerType, IntegrationSyncOptions } from '@memberjunction/integration-engine';

/**
 * MJ Action that triggers a sync for a CompanyIntegration.
 *
 * Parameters (Input):
 *   - CompanyIntegrationID (required): ID of the CompanyIntegration to sync
 *   - TriggerType (optional): 'Scheduled' | 'Manual' | 'Webhook'  (default: 'Manual')
 *   - FullSync (optional): 'true' to force a full sync ignoring watermarks
 *   - EntityMapIDs (optional): comma-separated list of EntityMapIDs to restrict the sync
 *
 * Parameters (Output):
 *   - RecordsProcessed: total records processed
 *   - RecordsCreated: records created
 *   - RecordsUpdated: records updated
 *   - RecordsDeleted: records deleted
 *   - RecordsErrored: records that encountered errors
 *   - RecordsSkipped: records that were skipped
 *   - ErrorSummary: JSON string of error details (first 10 errors)
 */
@RegisterClass(BaseAction, 'Run Integration Sync')
export class RunSyncAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const companyIntegrationID = this.getStringParam(params, 'CompanyIntegrationID');
            if (!companyIntegrationID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: "Parameter 'CompanyIntegrationID' is required"
                };
            }

            const triggerType = this.parseTriggerType(this.getStringParam(params, 'TriggerType'));
            const options = this.buildSyncOptions(params);
            const result = await IntegrationEngine.Instance.RunSync(
                companyIntegrationID,
                params.ContextUser,
                triggerType,
                undefined, // onProgress
                undefined, // onNotification
                options
            );

            this.addOutputParams(params, result);

            return {
                Success: result.Success,
                ResultCode: result.Success ? 'SUCCESS' : 'SYNC_COMPLETED_WITH_ERRORS',
                Message: this.buildResultMessage(result),
                Params: params.Params
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`[RunSyncAction] Unexpected error: ${message}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: message
            };
        }
    }

    private buildSyncOptions(params: RunActionParams): IntegrationSyncOptions {
        const options: IntegrationSyncOptions = {};

        const fullSyncRaw = this.getStringParam(params, 'FullSync');
        if (fullSyncRaw?.toLowerCase() === 'true') {
            options.FullSync = true;
        }

        const entityMapIDsRaw = this.getStringParam(params, 'EntityMapIDs');
        if (entityMapIDsRaw) {
            options.EntityMapIDs = entityMapIDsRaw.split(',').map(id => id.trim()).filter(id => id.length > 0);
        }

        return options;
    }

    private parseTriggerType(value: string | undefined): SyncTriggerType {
        if (value === 'Scheduled' || value === 'Webhook') return value;
        return 'Manual';
    }

    private buildResultMessage(result: SyncResult): string {
        const parts: string[] = [
            `Processed: ${result.RecordsProcessed}`,
            `Created: ${result.RecordsCreated}`,
            `Updated: ${result.RecordsUpdated}`,
        ];
        if (result.RecordsDeleted > 0) parts.push(`Deleted: ${result.RecordsDeleted}`);
        if (result.RecordsErrored > 0) parts.push(`Errors: ${result.RecordsErrored}`);
        if (result.RecordsSkipped > 0) parts.push(`Skipped: ${result.RecordsSkipped}`);
        return parts.join(', ');
    }

    private addOutputParams(params: RunActionParams, result: SyncResult): void {
        const outputs: Array<{ name: string; value: number | string }> = [
            { name: 'RecordsProcessed', value: result.RecordsProcessed },
            { name: 'RecordsCreated', value: result.RecordsCreated },
            { name: 'RecordsUpdated', value: result.RecordsUpdated },
            { name: 'RecordsDeleted', value: result.RecordsDeleted },
            { name: 'RecordsErrored', value: result.RecordsErrored },
            { name: 'RecordsSkipped', value: result.RecordsSkipped },
        ];
        for (const { name, value } of outputs) {
            this.addOutputParam(params, name, value);
        }
        if (result.Errors.length > 0) {
            this.addOutputParam(
                params,
                'ErrorSummary',
                JSON.stringify(result.Errors.slice(0, 10))
            );
        }
    }

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const nameLower = name.toLowerCase();
        const param = params.Params?.find(p => p.Name.trim().toLowerCase() === nameLower);
        if (!param || param.Value == null) return undefined;
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    private addOutputParam(params: RunActionParams, name: string, value: number | string): void {
        const outputParam = new ActionParam();
        outputParam.Name = name;
        outputParam.Type = 'Output';
        outputParam.Value = value;
        params.Params.push(outputParam);
    }
}
