import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { GovernedArtifactService } from '@memberjunction/ai-agents';
import { BaseGovernedArtifactAction } from './base-governed-artifact.action';

/**
 * Action that inspects a governed artifact's outline, workbook summary, or read-only range/search,
 * hydrating uncompacted edits from any active live Yjs collaboration room.
 */
@RegisterClass(BaseAction, '__InspectGovernedArtifact')
export class InspectGovernedArtifactAction extends BaseGovernedArtifactAction {
    public static readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        if (!params.ContextUser) {
            return {
                Success: false,
                ResultCode: 'MISSING_CONTEXT_USER',
                Message: 'ContextUser is required to inspect a governed artifact.',
                Params: params.Params,
            };
        }

        const artifactId = this.getStringParam(params, 'ArtifactID');
        if (!artifactId) {
            return {
                Success: false,
                ResultCode: 'MISSING_PARAMETER',
                Message: 'ArtifactID parameter is required.',
                Params: params.Params,
            };
        }

        const tool = this.getStringParam(params, 'Tool');
        const input = this.getObjectParam(params, 'Input');
        const attribution = this.extractAgentAttribution(params);

        const outcome = await GovernedArtifactService.Instance.InspectGovernedArtifact({
            provider: this.resolveProvider(params),
            contextUser: params.ContextUser,
            artifactId,
            tool,
            input,
            agentRunId: attribution.agentRunId,
            agentName: attribution.agentName,
        });

        if (!outcome.success) {
            return {
                Success: false,
                ResultCode: 'INSPECT_FAILED',
                Message: outcome.errorMessage || 'Failed to inspect governed artifact.',
                Params: params.Params,
            };
        }

        this.setOutputParam(params, 'ArtifactID', outcome.artifactId);
        this.setOutputParam(params, 'VersionID', outcome.versionId ?? null);
        this.setOutputParam(params, 'VersionNumber', outcome.versionNumber ?? 1);
        this.setOutputParam(params, 'ArtifactName', outcome.name);
        this.setOutputParam(params, 'ArtifactTypeName', outcome.typeName);
        this.setOutputParam(params, 'DriverClass', outcome.driverClass ?? null);
        this.setOutputParam(params, 'CanEdit', outcome.canEdit ?? false);
        this.setOutputParam(params, 'LiveRoomHydrated', outcome.liveRoomHydrated ?? false);
        this.setOutputParam(params, 'InspectionResult', outcome.data ?? null);

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: JSON.stringify({
                artifactId: outcome.artifactId,
                name: outcome.name,
                typeName: outcome.typeName,
                versionNumber: outcome.versionNumber,
                canEdit: outcome.canEdit,
                liveRoomHydrated: outcome.liveRoomHydrated,
                data: outcome.data,
            }),
            Params: params.Params,
        };
    }
}
