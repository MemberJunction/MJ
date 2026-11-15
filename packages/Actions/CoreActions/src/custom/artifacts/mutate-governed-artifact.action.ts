import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { GovernedArtifactService } from '@memberjunction/ai-agents';
import { BaseGovernedArtifactAction } from './base-governed-artifact.action';

/**
 * Action that mutates a governed artifact through domain tools (`upsert_live_table`, `write_cells`,
 * `upsert_chart`, `insert_block_after`, `add_slide`, etc.) while reconciling with live Yjs rooms,
 * persisting a new version, and broadcasting real-time agent presence awareness.
 */
@RegisterClass(BaseAction, '__MutateGovernedArtifact')
export class MutateGovernedArtifactAction extends BaseGovernedArtifactAction {
    public static readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        if (!params.ContextUser) {
            return {
                Success: false,
                ResultCode: 'MISSING_CONTEXT_USER',
                Message: 'ContextUser is required to mutate a governed artifact.',
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
        const operations = this.getOperationsParam(params, 'Operations');
        if (!tool && !operations?.length) {
            return {
                Success: false,
                ResultCode: 'MISSING_PARAMETER',
                Message: 'Either Tool (with optional Input) or Operations array must be provided.',
                Params: params.Params,
            };
        }

        const attribution = this.extractAgentAttribution(params);
        const outcome = await GovernedArtifactService.Instance.MutateGovernedArtifact({
            provider: this.resolveProvider(params),
            contextUser: params.ContextUser,
            artifactId,
            tool,
            input,
            operations,
            agentRunId: attribution.agentRunId,
            agentName: attribution.agentName,
        });

        if (!outcome.success) {
            return {
                Success: false,
                ResultCode: 'MUTATE_FAILED',
                Message: outcome.errorMessage || 'Failed to mutate governed artifact.',
                Params: params.Params,
            };
        }

        this.setOutputParam(params, 'ArtifactID', outcome.artifactId);
        this.setOutputParam(params, 'VersionID', outcome.versionId ?? null);
        this.setOutputParam(params, 'VersionNumber', outcome.versionNumber ?? 1);
        this.setOutputParam(params, 'ArtifactName', outcome.name);
        this.setOutputParam(params, 'ArtifactTypeName', outcome.typeName);
        this.setOutputParam(params, 'DriverClass', outcome.driverClass ?? null);
        this.setOutputParam(params, 'Results', outcome.results ?? []);

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: JSON.stringify({
                artifactId: outcome.artifactId,
                versionId: outcome.versionId,
                versionNumber: outcome.versionNumber,
                name: outcome.name,
                typeName: outcome.typeName,
                results: outcome.results,
                ...(outcome.warnings?.length ? { warnings: outcome.warnings } : {}),
            }),
            Params: params.Params,
        };
    }
}
