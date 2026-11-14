import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { GovernedArtifactService } from '@memberjunction/ai-agents';
import { BaseGovernedArtifactAction } from './base-governed-artifact.action';

/**
 * Action that creates and persists a new governed artifact (`Excel Spreadsheet`, `Markdown Document`,
 * or `Presentation`) along with version 1, permission checks, and live presence attribution.
 */
@RegisterClass(BaseAction, '__CreateGovernedArtifact')
export class CreateGovernedArtifactAction extends BaseGovernedArtifactAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        if (!params.ContextUser) {
            return {
                Success: false,
                ResultCode: 'MISSING_CONTEXT_USER',
                Message: 'ContextUser is required to create a governed artifact.',
                Params: params.Params,
            };
        }

        const title = this.getStringParam(params, 'Title') ?? 'Untitled Artifact';
        const artifactType =
            this.getStringParam(params, 'ArtifactType') ??
            this.getStringParam(params, 'Type') ??
            'Markdown Document';
        const description = this.getStringParam(params, 'Description');
        const collectionId = this.getStringParam(params, 'CollectionID');
        const environmentId = this.getStringParam(params, 'EnvironmentID');
        const sheetNames = this.getStringArrayParam(params, 'SheetNames');
        const rawContent = this.getObjectParam(params, 'Content') ?? this.getStringParam(params, 'Content');
        const attribution = this.extractAgentAttribution(params);

        const outcome = await GovernedArtifactService.Instance.CreateGovernedArtifact({
            provider: this.resolveProvider(params),
            contextUser: params.ContextUser,
            title,
            artifactType,
            description,
            content: rawContent,
            sheetNames,
            collectionId,
            environmentId,
            agentRunId: attribution.agentRunId,
            agentName: attribution.agentName,
        });

        if (!outcome.success) {
            return {
                Success: false,
                ResultCode: 'CREATE_FAILED',
                Message: outcome.errorMessage || 'Failed to create governed artifact.',
                Params: params.Params,
            };
        }

        this.setOutputParam(params, 'ArtifactID', outcome.artifactId);
        this.setOutputParam(params, 'VersionID', outcome.versionId);
        this.setOutputParam(params, 'VersionNumber', outcome.versionNumber ?? 1);
        this.setOutputParam(params, 'ArtifactName', outcome.name);
        this.setOutputParam(params, 'ArtifactTypeName', outcome.typeName);
        this.setOutputParam(params, 'DriverClass', outcome.driverClass ?? null);

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Created ${outcome.typeName} "${outcome.name}" (ArtifactID: ${outcome.artifactId}, VersionID: ${outcome.versionId}).`,
            Params: params.Params,
        };
    }
}
