import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";

import { EntityInfo, Metadata } from "@memberjunction/core";
import { ExternalChangeDetectorEngine } from "@memberjunction/external-change-detection";
import { RegisterClass } from "@memberjunction/global";

/**
 * Thin action wrapper for External Change Detection. Delegates to
 * ExternalChangeDetectorEngine.DetectAndReplayChanges() which interleaves
 * detection and replay per entity to keep memory bounded.
 *
 * Params:
 *  EntityList - Comma-separated entity names. If omitted, all eligible entities are processed.
 *  ReplayBatchSize - Concurrent record replays per entity. Default 20.
 *  DetectionBatchSize - Max parallel entity detection. Default 5.
 *  StaleTimeoutHours - Hours before a stuck run is considered stale. Default 24.
 */
@RegisterClass(BaseAction, "__RunExternalChangeDetection")
export class ExternalChangeDetectionAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const replayBatchSize = this.getIntParam(params, 'replaybatchsize', 20);
        const detectionBatchSize = this.getIntParam(params, 'detectionbatchsize', 5);
        const staleTimeoutHours = this.getIntParam(params, 'staletimeouthours', 24);

        await ExternalChangeDetectorEngine.Instance.Config(false, params.ContextUser);

        const entities = this.resolveEntityList(params);
        const result = await ExternalChangeDetectorEngine.Instance.DetectAndReplayChanges(
            entities,
            replayBatchSize,
            detectionBatchSize,
            staleTimeoutHours
        );

        const summary = `${result.EntitiesProcessed} entities processed, ${result.EntitiesFailed} failed, ` +
            `${result.TotalDetected} changes detected, ${result.TotalReplayed} replayed`;

        return {
            Success: result.Success,
            Message: result.Success ? `${summary}.` : `${summary}. ${result.ErrorMessage || ''}`,
            ResultCode: result.Success ? "SUCCESS" : "FAILED"
        };
    }

    private resolveEntityList(params: RunActionParams): EntityInfo[] {
        const entityListParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'entitylist');
        if (entityListParam?.Value && entityListParam.Value.length > 0) {
            const md = new Metadata();
            return entityListParam.Value.split(',')
                .map((name: string) => md.EntityByName(name.trim()))
                .filter((e: EntityInfo | undefined): e is EntityInfo => !!e);
        }
        return ExternalChangeDetectorEngine.Instance.EligibleEntities;
    }

    private getIntParam(params: RunActionParams, name: string, defaultValue: number): number {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param?.Value) return defaultValue;
        const parsed = parseInt(param.Value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }
}
