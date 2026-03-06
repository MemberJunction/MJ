import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";

import { EntityInfo, Metadata } from "@memberjunction/core";
import { ChangeDetectionResult, ExternalChangeDetectorEngine } from "@memberjunction/external-change-detection";
import { RegisterClass } from "@memberjunction/global";

/**
 * This class provides a simple wrapper to execute the External Change Detection process.
 * Possible params:
 *  EntityList - a comma separated list of entity names to detect changes for. If not provided, all eligible entities will be processed.
 *  ReplayBatchSize - Number of concurrent record replays to process at once. Default is 20.
 *  DetectionBatchSize - Number of entities to process in parallel during detection. Default is 10.
 *  AutoReplay - If true, detected changes will be automatically replayed through the entity system. Default is true.
 *  StaleTimeoutHours - Number of hours a run can be in progress before it is considered stale. Default is 24.
 */
@RegisterClass(BaseAction, "__RunExternalChangeDetection")
export class ExternalChangeDetectionAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const entityListParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'entitylist');
        const replayBatchSizeParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'replaybatchsize' || p.Name.trim().toLowerCase() === 'batchsize');
        const detectionBatchSizeParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'detectionbatchsize');
        const autoReplayParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'autoreplay');
        const staleTimeoutParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'staletimeouthours');

        const replayBatchSize = replayBatchSizeParam && replayBatchSizeParam.Value ? parseInt(replayBatchSizeParam.Value) : 20;
        const detectionBatchSize = detectionBatchSizeParam && detectionBatchSizeParam.Value ? parseInt(detectionBatchSizeParam.Value) : 10;
        const staleTimeoutHours = staleTimeoutParam && staleTimeoutParam.Value ? parseInt(staleTimeoutParam.Value) : 24;
        const autoReplay = autoReplayParam && autoReplayParam.Value !== undefined ? 
                           (typeof autoReplayParam.Value === 'string' ? autoReplayParam.Value.toLowerCase() === 'true' : !!autoReplayParam.Value) : 
                           true;

        await ExternalChangeDetectorEngine.Instance.Config(false, params.ContextUser);

        let changes: ChangeDetectionResult;
        if (entityListParam && entityListParam.Value && entityListParam.Value.length > 0) {
            const md = new Metadata();
            const entityNames = entityListParam.Value.split(',');
            const entities: EntityInfo[] = entityNames.map(entityName => md.EntityByName(entityName)).filter(e => !!e);
            changes = await ExternalChangeDetectorEngine.Instance.DetectChangesForEntities(entities, detectionBatchSize);
        } 
        else {
            changes = await ExternalChangeDetectorEngine.Instance.DetectChangesForAllEligibleEntities(detectionBatchSize);
        }

        if (changes && changes.Success) {
            const changeCount = changes.Changes ? changes.Changes.length : 0;
            const creations = changes.Changes.filter(c => c.Type === 'Create').length;
            const updates = changes.Changes.filter(c => c.Type === 'Update').length;
            const deletions = changes.Changes.filter(c => c.Type === 'Delete').length;
            const summary = `Detected ${changeCount} changes (Creations: ${creations}, Updates: ${updates}, Deletions: ${deletions}).`;
            
            if (!autoReplay) {
                return {
                    Success: true,
                    Message: `${summary} AutoReplay is disabled, so no changes were replayed.`,
                    ResultCode: "SUCCESS"
                }
            }

            if (changeCount === 0) {
                return {
                    Success: true,
                    Message: "No changes detected.",
                    ResultCode: "SUCCESS"
                }
            }

            // attempt to replay the changes
            if (await ExternalChangeDetectorEngine.Instance.ReplayChanges(changes.Changes, replayBatchSize, staleTimeoutHours)) {
                return {
                    Success: true,
                    Message: `${summary} All changes replayed successfully.`,
                    ResultCode: "SUCCESS"
                }
            }
            else {
                return {
                    Success: false,
                    Message: `${summary} Some or all changes failed to replay. Check the Record Change Replay Runs for details.`,
                    ResultCode: "FAILED"
                }
            }
        }
        else {
            return {
                Success: false,
                Message: changes ? changes.ErrorMessage : "Unknown error during change detection",
                ResultCode: "FAILED"
            }
        }
    }
}
