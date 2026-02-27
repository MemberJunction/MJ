import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";

import { EntityInfo, Metadata } from "@memberjunction/core";
import { ChangeDetectionResult, ExternalChangeDetectorEngine } from "@memberjunction/external-change-detection";
import { RegisterClass } from "@memberjunction/global";

/**
 * This class provides a simple wrapper to execute the External Change Detection process.
 * Possible params:
 *  EntityList - a comma separated list of entity names to detect changes for. If not provided, all eligible entities will be processed.
 */
@RegisterClass(BaseAction, "__RunExternalChangeDetection")
export class ExternalChangeDetectionAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const entityListParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'entitylist');

        await ExternalChangeDetectorEngine.Instance.Config(false, params.ContextUser);

        let changes: ChangeDetectionResult;
        if (entityListParam && entityListParam.Value && entityListParam.Value.length > 0) {
            const md = new Metadata();
            const entityNames = entityListParam.Value.split(',');
            const entities: EntityInfo[] = entityNames.map(entityName => md.EntityByName(entityName));
            changes = await ExternalChangeDetectorEngine.Instance.DetectChangesForEntities(entities);
        } 
        else {
            changes = await ExternalChangeDetectorEngine.Instance.DetectChangesForAllEligibleEntities();
        }

        if (changes && changes.Success) {
            // attempt to replay the changes
            if (await ExternalChangeDetectorEngine.Instance.ReplayChanges(changes.Changes)) {
                return {
                    Success: true,
                    Message: "Changes detected and replayed successfully.",
                    ResultCode: "SUCCESS"
                }
            }
            else {
                return {
                    Success: false,
                    Message: "Failed to replay changes.",
                    ResultCode: "FAILED"
                }
            }
        }
        else {
            return {
                Success: false,
                Message: changes.ErrorMessage,
                ResultCode: "FAILED"
            }
        }
    }
}